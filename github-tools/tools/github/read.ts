// ============================================================
// tools/github/read.ts
// READ tools — no write permissions required
//
// Tools:
//   github_list_repos     — list authenticated user's repos
//   github_read_file      — read a file at a path + ref
//   github_list_tree      — recursive file tree of a repo
//   github_search_code    — search code across GitHub
//   github_get_commits    — list recent commits on a branch
//   github_get_file_diff  — show diff between two refs
// ============================================================

import { getOctokit } from '../../lib/githubClient';
import type { Tool } from '../../../provider-engine/lib/toolLoop';
import type { ToolResult } from '../../../provider-engine/types';

// ── 1. List repos ─────────────────────────────────────────────

export const listReposTool: Tool = {
  definition: {
    name: 'github_list_repos',
    description:
      'List GitHub repositories for the authenticated user or a specific org/user. ' +
      'Returns name, description, language, stars, and default branch.',
    input_schema: {
      type: 'object',
      properties: {
        owner: {
          type: 'string',
          description: 'Username or org to list repos for. Omit for authenticated user.',
        },
        type: {
          type: 'string',
          enum: ['all', 'owner', 'member', 'public', 'private', 'forks', 'sources'],
          description: 'Filter by repo type. Default: all',
        },
        sort: {
          type: 'string',
          enum: ['created', 'updated', 'pushed', 'full_name'],
          description: 'Sort order. Default: pushed',
        },
        per_page: {
          type: 'number',
          description: 'Results per page (max 100). Default: 30',
        },
      },
      required: [],
    },
  },
  execute: async (input): Promise<ToolResult> => {
    const { owner, type = 'all', sort = 'pushed', per_page = 30 } = input as {
      owner?: string;
      type?: string;
      sort?: string;
      per_page?: number;
    };

    const octokit = getOctokit();
    let repos: Array<Record<string, unknown>>;

    if (owner) {
      const { data } = await octokit.repos.listForUser({
        username: owner,
        type: type as 'all' | 'owner' | 'member',
        sort: sort as 'created' | 'updated' | 'pushed' | 'full_name',
        per_page,
      });
      repos = data as unknown as Array<Record<string, unknown>>;
    } else {
      const { data } = await octokit.repos.listForAuthenticatedUser({
        type: type as 'all' | 'owner' | 'public' | 'private' | 'member',
        sort: sort as 'created' | 'updated' | 'pushed' | 'full_name',
        per_page,
      });
      repos = data as unknown as Array<Record<string, unknown>>;
    }

    const summary = repos.map(r => ({
      name:           r.name,
      full_name:      r.full_name,
      description:    r.description,
      language:       r.language,
      stars:          r.stargazers_count,
      forks:          r.forks_count,
      default_branch: r.default_branch,
      private:        r.private,
      updated_at:     r.updated_at,
      html_url:       r.html_url,
    }));

    return { type: 'json', data: summary };
  },
};

// ── 2. Read file ──────────────────────────────────────────────

export const readFileTool: Tool = {
  definition: {
    name: 'github_read_file',
    description:
      'Read the contents of a file from a GitHub repository. ' +
      'Returns the decoded text content and file metadata.',
    input_schema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner (user or org)' },
        repo:  { type: 'string', description: 'Repository name' },
        path:  { type: 'string', description: 'File path within the repo (e.g. src/index.ts)' },
        ref:   { type: 'string', description: 'Branch, tag, or commit SHA. Default: main' },
      },
      required: ['owner', 'repo', 'path'],
    },
  },
  execute: async (input): Promise<ToolResult> => {
    const { owner, repo, path, ref = 'main' } = input as {
      owner: string; repo: string; path: string; ref?: string;
    };

    const { data } = await getOctokit().repos.getContent({ owner, repo, path, ref });

    if (Array.isArray(data)) {
      // It's a directory — return listing instead
      return {
        type: 'json',
        data: data.map(f => ({ name: f.name, type: f.type, path: f.path, size: f.size })),
      };
    }

    if (data.type !== 'file') {
      return { type: 'error', error: `Path "${path}" is not a file (type: ${data.type})` };
    }

    const content = Buffer.from(data.content, 'base64').toString('utf-8');

    return {
      type: 'json',
      data: {
        path:     data.path,
        sha:      data.sha,
        size:     data.size,
        encoding: 'utf-8',
        content,
      },
    };
  },
};

// ── 3. List tree (recursive file tree) ───────────────────────

export const listTreeTool: Tool = {
  definition: {
    name: 'github_list_tree',
    description:
      'List the full recursive file tree of a GitHub repository. ' +
      'Returns all file paths, types, and sizes.',
    input_schema: {
      type: 'object',
      properties: {
        owner:    { type: 'string', description: 'Repository owner' },
        repo:     { type: 'string', description: 'Repository name' },
        ref:      { type: 'string', description: 'Branch, tag, or commit SHA. Default: main' },
        max_files:{ type: 'number', description: 'Max files to return. Default: 500' },
      },
      required: ['owner', 'repo'],
    },
  },
  execute: async (input): Promise<ToolResult> => {
    const { owner, repo, ref = 'main', max_files = 500 } = input as {
      owner: string; repo: string; ref?: string; max_files?: number;
    };

    const { data } = await getOctokit().git.getTree({
      owner,
      repo,
      tree_sha: ref,
      recursive: '1',
    });

    const files = (data.tree ?? [])
      .filter(item => item.type === 'blob')     // files only, no tree nodes
      .slice(0, max_files)
      .map(item => ({
        path: item.path,
        size: item.size,
        sha:  item.sha,
      }));

    return {
      type: 'json',
      data: {
        truncated: data.truncated,
        total: data.tree?.length ?? 0,
        files,
      },
    };
  },
};

// ── 4. Search code ────────────────────────────────────────────

export const searchCodeTool: Tool = {
  definition: {
    name: 'github_search_code',
    description:
      'Search for code across GitHub repositories using GitHub code search. ' +
      'Supports qualifiers like repo:owner/name, language:typescript, path:src/',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'Search query. Examples: "useState repo:facebook/react", ' +
            '"import axios language:typescript", "TODO path:src/"',
        },
        per_page: { type: 'number', description: 'Results per page. Default: 10' },
      },
      required: ['query'],
    },
  },
  execute: async (input): Promise<ToolResult> => {
    const { query, per_page = 10 } = input as { query: string; per_page?: number };

    const { data } = await getOctokit().search.code({ q: query, per_page });

    const results = data.items.map(item => ({
      path:       item.path,
      repo:       item.repository.full_name,
      html_url:   item.html_url,
      sha:        item.sha,
    }));

    return {
      type: 'json',
      data: {
        total_count: data.total_count,
        results,
      },
    };
  },
};

// ── 5. Get commits ────────────────────────────────────────────

export const getCommitsTool: Tool = {
  definition: {
    name: 'github_get_commits',
    description:
      'List recent commits on a branch of a repository. ' +
      'Returns SHA, message, author, and date.',
    input_schema: {
      type: 'object',
      properties: {
        owner:    { type: 'string', description: 'Repository owner' },
        repo:     { type: 'string', description: 'Repository name' },
        branch:   { type: 'string', description: 'Branch name. Default: main' },
        per_page: { type: 'number', description: 'Number of commits. Default: 20' },
        path:     { type: 'string', description: 'Filter commits that touched a specific file path' },
      },
      required: ['owner', 'repo'],
    },
  },
  execute: async (input): Promise<ToolResult> => {
    const { owner, repo, branch = 'main', per_page = 20, path } = input as {
      owner: string; repo: string; branch?: string; per_page?: number; path?: string;
    };

    const { data } = await getOctokit().repos.listCommits({
      owner,
      repo,
      sha: branch,
      per_page,
      path,
    });

    const commits = data.map(c => ({
      sha:       c.sha,
      short_sha: c.sha.slice(0, 7),
      message:   c.commit.message.split('\n')[0],   // first line only
      author:    c.commit.author?.name ?? c.author?.login ?? 'unknown',
      date:      c.commit.author?.date,
      html_url:  c.html_url,
    }));

    return { type: 'json', data: commits };
  },
};

// ── 6. Get diff between refs ──────────────────────────────────

export const getFileDiffTool: Tool = {
  definition: {
    name: 'github_get_file_diff',
    description:
      'Get the diff (changes) between two commits, branches, or tags in a repository.',
    input_schema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo:  { type: 'string', description: 'Repository name' },
        base:  { type: 'string', description: 'Base ref (older commit/branch)' },
        head:  { type: 'string', description: 'Head ref (newer commit/branch)' },
      },
      required: ['owner', 'repo', 'base', 'head'],
    },
  },
  execute: async (input): Promise<ToolResult> => {
    const { owner, repo, base, head } = input as {
      owner: string; repo: string; base: string; head: string;
    };

    const { data } = await getOctokit().repos.compareCommits({ owner, repo, base, head });

    const files = (data.files ?? []).map(f => ({
      filename:   f.filename,
      status:     f.status,
      additions:  f.additions,
      deletions:  f.deletions,
      changes:    f.changes,
      patch:      f.patch ?? null,   // actual diff content
    }));

    return {
      type: 'json',
      data: {
        status:        data.status,
        ahead_by:      data.ahead_by,
        behind_by:     data.behind_by,
        total_commits: data.total_commits,
        files,
      },
    };
  },
};

// ── Export all read tools ─────────────────────────────────────

export const READ_TOOLS: Tool[] = [
  listReposTool,
  readFileTool,
  listTreeTool,
  searchCodeTool,
  getCommitsTool,
  getFileDiffTool,
];
