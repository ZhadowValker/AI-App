// ============================================================
// tools/github/write.ts
// WRITE tools — requires repo write permission on PAT
//
// Tools:
//   github_create_branch   — create a new branch from a ref
//   github_commit_files    — commit one or more file changes
//   github_create_pr       — open a pull request
//   github_merge_pr        — merge a pull request
//   github_review_pr       — post a review with inline comments
// ============================================================

import { getOctokit } from '../../lib/githubClient';
import type { Tool } from '../../../provider-engine/lib/toolLoop';
import type { ToolResult } from '../../../provider-engine/types';

// ── Helper: get the SHA of a branch tip ──────────────────────

async function getBranchSHA(owner: string, repo: string, branch: string): Promise<string> {
  const { data } = await getOctokit().git.getRef({
    owner,
    repo,
    ref: `heads/${branch}`,
  });
  return data.object.sha;
}

// ── Helper: create or update a file blob + tree + commit ─────
// This is the correct way to commit multiple files atomically
// without needing a working directory.

async function createCommitWithFiles(
  owner: string,
  repo: string,
  branch: string,
  files: Array<{ path: string; content: string }>,
  message: string,
): Promise<string> {
  const octokit = getOctokit();

  // 1. Get current branch tip SHA
  const parentSHA = await getBranchSHA(owner, repo, branch);

  // 2. Get the current tree SHA
  const { data: commitData } = await octokit.git.getCommit({
    owner, repo, commit_sha: parentSHA,
  });
  const baseTreeSHA = commitData.tree.sha;

  // 3. Create blobs for each file
  const blobs = await Promise.all(
    files.map(f =>
      octokit.git.createBlob({
        owner, repo,
        content: Buffer.from(f.content).toString('base64'),
        encoding: 'base64',
      }).then(r => ({ path: f.path, sha: r.data.sha }))
    )
  );

  // 4. Create a new tree with all file changes
  const { data: newTree } = await octokit.git.createTree({
    owner,
    repo,
    base_tree: baseTreeSHA,
    tree: blobs.map(b => ({
      path: b.path,
      mode: '100644' as const,   // regular file
      type: 'blob' as const,
      sha: b.sha,
    })),
  });

  // 5. Create the commit
  const { data: newCommit } = await octokit.git.createCommit({
    owner,
    repo,
    message,
    tree: newTree.sha,
    parents: [parentSHA],
  });

  // 6. Update the branch ref to point to new commit
  await octokit.git.updateRef({
    owner,
    repo,
    ref: `heads/${branch}`,
    sha: newCommit.sha,
    force: false,
  });

  return newCommit.sha;
}

// ── 1. Create branch ──────────────────────────────────────────

export const createBranchTool: Tool = {
  definition: {
    name: 'github_create_branch',
    description:
      'Create a new git branch in a repository from an existing branch or commit.',
    input_schema: {
      type: 'object',
      properties: {
        owner:     { type: 'string', description: 'Repository owner' },
        repo:      { type: 'string', description: 'Repository name' },
        branch:    { type: 'string', description: 'New branch name to create (e.g. feat/my-feature)' },
        from_ref:  { type: 'string', description: 'Branch, tag, or SHA to create from. Default: main' },
      },
      required: ['owner', 'repo', 'branch'],
    },
  },
  execute: async (input): Promise<ToolResult> => {
    const { owner, repo, branch, from_ref = 'main' } = input as {
      owner: string; repo: string; branch: string; from_ref?: string;
    };

    const octokit = getOctokit();

    // Resolve from_ref to a SHA
    let sha: string;
    try {
      const { data } = await octokit.git.getRef({ owner, repo, ref: `heads/${from_ref}` });
      sha = data.object.sha;
    } catch {
      // Maybe it's a tag or commit SHA directly
      sha = from_ref;
    }

    await octokit.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${branch}`,
      sha,
    });

    return {
      type: 'json',
      data: { branch, from_ref, sha, message: `Branch "${branch}" created from "${from_ref}"` },
    };
  },
};

// ── 2. Commit files ───────────────────────────────────────────

export const commitFilesTool: Tool = {
  definition: {
    name: 'github_commit_files',
    description:
      'Commit one or more file changes to a branch. ' +
      'Creates or updates files atomically in a single commit. ' +
      'Use github_create_branch first if committing to a new branch.',
    input_schema: {
      type: 'object',
      properties: {
        owner:   { type: 'string', description: 'Repository owner' },
        repo:    { type: 'string', description: 'Repository name' },
        branch:  { type: 'string', description: 'Target branch to commit to' },
        message: { type: 'string', description: 'Commit message' },
        files: {
          type: 'array',
          description: 'Files to create or update',
          items: {
            type: 'object',
            properties: {
              path:    { type: 'string', description: 'File path in repo (e.g. src/utils.ts)' },
              content: { type: 'string', description: 'Full file content as a string' },
            },
            required: ['path', 'content'],
          },
        },
      },
      required: ['owner', 'repo', 'branch', 'message', 'files'],
    },
  },
  execute: async (input): Promise<ToolResult> => {
    const { owner, repo, branch, message, files } = input as {
      owner: string;
      repo: string;
      branch: string;
      message: string;
      files: Array<{ path: string; content: string }>;
    };

    const commitSHA = await createCommitWithFiles(owner, repo, branch, files, message);

    return {
      type: 'json',
      data: {
        commit_sha: commitSHA,
        short_sha:  commitSHA.slice(0, 7),
        branch,
        files_changed: files.map(f => f.path),
        message,
      },
    };
  },
};

// ── 3. Create pull request ────────────────────────────────────

export const createPRTool: Tool = {
  definition: {
    name: 'github_create_pr',
    description:
      'Create a pull request from a head branch into a base branch. ' +
      'Optionally commit files to the head branch before opening the PR.',
    input_schema: {
      type: 'object',
      properties: {
        owner:  { type: 'string', description: 'Repository owner' },
        repo:   { type: 'string', description: 'Repository name' },
        title:  { type: 'string', description: 'PR title' },
        body:   { type: 'string', description: 'PR description (supports markdown)' },
        head:   { type: 'string', description: 'Source branch (the branch with your changes)' },
        base:   { type: 'string', description: 'Target branch to merge into (e.g. main)' },
        draft:  { type: 'boolean', description: 'Open as a draft PR. Default: false' },
        files: {
          type: 'array',
          description: 'Optional: files to commit to head branch before creating the PR',
          items: {
            type: 'object',
            properties: {
              path:    { type: 'string' },
              content: { type: 'string' },
            },
            required: ['path', 'content'],
          },
        },
        commit_message: {
          type: 'string',
          description: 'Commit message if files are provided',
        },
      },
      required: ['owner', 'repo', 'title', 'head', 'base'],
    },
  },
  execute: async (input): Promise<ToolResult> => {
    const { owner, repo, title, body = '', head, base, draft = false, files, commit_message } = input as {
      owner: string; repo: string; title: string; body?: string;
      head: string; base: string; draft?: boolean;
      files?: Array<{ path: string; content: string }>;
      commit_message?: string;
    };

    // Optionally commit files first
    if (files && files.length > 0) {
      await createCommitWithFiles(
        owner, repo, head, files,
        commit_message ?? `chore: update files for PR "${title}"`,
      );
    }

    const { data: pr } = await getOctokit().pulls.create({
      owner, repo, title, body, head, base, draft,
    });

    return {
      type: 'json',
      data: {
        number:   pr.number,
        title:    pr.title,
        html_url: pr.html_url,
        state:    pr.state,
        draft:    pr.draft,
        head:     pr.head.ref,
        base:     pr.base.ref,
      },
    };
  },
};

// ── 4. Merge pull request ─────────────────────────────────────

export const mergePRTool: Tool = {
  definition: {
    name: 'github_merge_pr',
    description: 'Merge an open pull request using squash, merge, or rebase.',
    input_schema: {
      type: 'object',
      properties: {
        owner:          { type: 'string', description: 'Repository owner' },
        repo:           { type: 'string', description: 'Repository name' },
        pull_number:    { type: 'number', description: 'PR number to merge' },
        merge_method:   {
          type: 'string',
          enum: ['merge', 'squash', 'rebase'],
          description: 'Merge strategy. Default: squash',
        },
        commit_title:   { type: 'string', description: 'Custom commit title (squash/merge only)' },
        commit_message: { type: 'string', description: 'Custom commit message' },
      },
      required: ['owner', 'repo', 'pull_number'],
    },
  },
  execute: async (input): Promise<ToolResult> => {
    const { owner, repo, pull_number, merge_method = 'squash', commit_title, commit_message } = input as {
      owner: string; repo: string; pull_number: number;
      merge_method?: 'merge' | 'squash' | 'rebase';
      commit_title?: string; commit_message?: string;
    };

    const { data } = await getOctokit().pulls.merge({
      owner, repo, pull_number,
      merge_method,
      commit_title,
      commit_message,
    });

    return {
      type: 'json',
      data: {
        merged:  data.merged,
        sha:     data.sha,
        message: data.message,
      },
    };
  },
};

// ── 5. Review PR ──────────────────────────────────────────────

export const reviewPRTool: Tool = {
  definition: {
    name: 'github_review_pr',
    description:
      'Submit a review on a pull request. Can approve, request changes, or comment. ' +
      'Supports inline comments on specific file lines.',
    input_schema: {
      type: 'object',
      properties: {
        owner:       { type: 'string', description: 'Repository owner' },
        repo:        { type: 'string', description: 'Repository name' },
        pull_number: { type: 'number', description: 'PR number to review' },
        event: {
          type: 'string',
          enum: ['APPROVE', 'REQUEST_CHANGES', 'COMMENT'],
          description: 'Review action',
        },
        body: { type: 'string', description: 'Overall review comment' },
        comments: {
          type: 'array',
          description: 'Inline comments on specific lines',
          items: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'File path' },
              line: { type: 'number', description: 'Line number in the diff' },
              body: { type: 'string', description: 'Comment text' },
            },
            required: ['path', 'line', 'body'],
          },
        },
      },
      required: ['owner', 'repo', 'pull_number', 'event'],
    },
  },
  execute: async (input): Promise<ToolResult> => {
    const { owner, repo, pull_number, event, body = '', comments = [] } = input as {
      owner: string; repo: string; pull_number: number;
      event: 'APPROVE' | 'REQUEST_CHANGES' | 'COMMENT';
      body?: string;
      comments?: Array<{ path: string; line: number; body: string }>;
    };

    const { data } = await getOctokit().pulls.createReview({
      owner, repo, pull_number,
      event,
      body,
      comments: comments.map(c => ({
        path: c.path,
        line: c.line,
        body: c.body,
      })),
    });

    return {
      type: 'json',
      data: {
        id:       data.id,
        state:    data.state,
        body:     data.body,
        html_url: data.html_url,
        comments_count: comments.length,
      },
    };
  },
};

// ── Export all write tools ────────────────────────────────────

export const WRITE_TOOLS: Tool[] = [
  createBranchTool,
  commitFilesTool,
  createPRTool,
  mergePRTool,
  reviewPRTool,
];
