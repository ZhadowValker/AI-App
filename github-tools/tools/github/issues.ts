// ============================================================
// tools/github/issues.ts
// ISSUES tools — requires issues write permission on PAT
//
// Tools:
//   github_list_issues     — list issues on a repo
//   github_get_issue       — get a single issue by number
//   github_create_issue    — create a new issue
//   github_comment_issue   — post a comment on an issue or PR
//   github_update_issue    — update title, body, state, labels
// ============================================================

import { getOctokit } from '../../lib/githubClient';
import type { Tool } from '../../../provider-engine/lib/toolLoop';
import type { ToolResult } from '../../../provider-engine/types';

// ── 1. List issues ────────────────────────────────────────────

export const listIssuesTool: Tool = {
  definition: {
    name: 'github_list_issues',
    description:
      'List issues in a repository. Can filter by state, labels, and assignee. ' +
      'Returns issue number, title, state, labels, assignees, and created date.',
    input_schema: {
      type: 'object',
      properties: {
        owner:    { type: 'string', description: 'Repository owner' },
        repo:     { type: 'string', description: 'Repository name' },
        state: {
          type: 'string',
          enum: ['open', 'closed', 'all'],
          description: 'Filter by state. Default: open',
        },
        labels:   { type: 'string', description: 'Comma-separated label names to filter by' },
        assignee: { type: 'string', description: 'Filter by assignee username' },
        per_page: { type: 'number', description: 'Results per page. Default: 20' },
        sort: {
          type: 'string',
          enum: ['created', 'updated', 'comments'],
          description: 'Sort order. Default: updated',
        },
      },
      required: ['owner', 'repo'],
    },
  },
  execute: async (input): Promise<ToolResult> => {
    const {
      owner, repo,
      state = 'open',
      labels,
      assignee,
      per_page = 20,
      sort = 'updated',
    } = input as {
      owner: string; repo: string;
      state?: 'open' | 'closed' | 'all';
      labels?: string;
      assignee?: string;
      per_page?: number;
      sort?: 'created' | 'updated' | 'comments';
    };

    const { data } = await getOctokit().issues.listForRepo({
      owner, repo, state, labels, assignee, per_page, sort,
    });

    // Filter out pull requests (GitHub API returns PRs in issues endpoint)
    const issues = data
      .filter(i => !i.pull_request)
      .map(i => ({
        number:     i.number,
        title:      i.title,
        state:      i.state,
        labels:     i.labels.map(l => typeof l === 'string' ? l : l.name),
        assignees:  i.assignees?.map(a => a.login) ?? [],
        comments:   i.comments,
        created_at: i.created_at,
        updated_at: i.updated_at,
        html_url:   i.html_url,
        body_preview: i.body?.slice(0, 200) ?? null,
      }));

    return { type: 'json', data: { total: issues.length, issues } };
  },
};

// ── 2. Get single issue ───────────────────────────────────────

export const getIssueTool: Tool = {
  definition: {
    name: 'github_get_issue',
    description: 'Get full details of a single GitHub issue including body and all comments.',
    input_schema: {
      type: 'object',
      properties: {
        owner:        { type: 'string', description: 'Repository owner' },
        repo:         { type: 'string', description: 'Repository name' },
        issue_number: { type: 'number', description: 'Issue number' },
        include_comments: {
          type: 'boolean',
          description: 'Include all comments. Default: true',
        },
      },
      required: ['owner', 'repo', 'issue_number'],
    },
  },
  execute: async (input): Promise<ToolResult> => {
    const { owner, repo, issue_number, include_comments = true } = input as {
      owner: string; repo: string; issue_number: number; include_comments?: boolean;
    };

    const octokit = getOctokit();

    const [issueRes, commentsRes] = await Promise.all([
      octokit.issues.get({ owner, repo, issue_number }),
      include_comments
        ? octokit.issues.listComments({ owner, repo, issue_number, per_page: 100 })
        : Promise.resolve(null),
    ]);

    const issue = issueRes.data;

    return {
      type: 'json',
      data: {
        number:    issue.number,
        title:     issue.title,
        state:     issue.state,
        body:      issue.body,
        labels:    issue.labels.map(l => typeof l === 'string' ? l : l.name),
        assignees: issue.assignees?.map(a => a.login) ?? [],
        author:    issue.user?.login,
        created_at: issue.created_at,
        updated_at: issue.updated_at,
        html_url:  issue.html_url,
        comments: commentsRes?.data.map(c => ({
          id:         c.id,
          author:     c.user?.login,
          body:       c.body,
          created_at: c.created_at,
          html_url:   c.html_url,
        })) ?? [],
      },
    };
  },
};

// ── 3. Create issue ───────────────────────────────────────────

export const createIssueTool: Tool = {
  definition: {
    name: 'github_create_issue',
    description: 'Create a new issue in a GitHub repository with title, body, labels, and assignees.',
    input_schema: {
      type: 'object',
      properties: {
        owner:     { type: 'string', description: 'Repository owner' },
        repo:      { type: 'string', description: 'Repository name' },
        title:     { type: 'string', description: 'Issue title' },
        body:      { type: 'string', description: 'Issue body (supports markdown)' },
        labels: {
          type: 'array',
          items: { type: 'string' },
          description: 'Labels to apply (must already exist in repo)',
        },
        assignees: {
          type: 'array',
          items: { type: 'string' },
          description: 'GitHub usernames to assign',
        },
        milestone: { type: 'number', description: 'Milestone number to associate' },
      },
      required: ['owner', 'repo', 'title'],
    },
  },
  execute: async (input): Promise<ToolResult> => {
    const { owner, repo, title, body, labels, assignees, milestone } = input as {
      owner: string; repo: string; title: string;
      body?: string; labels?: string[]; assignees?: string[]; milestone?: number;
    };

    const { data } = await getOctokit().issues.create({
      owner, repo, title, body, labels, assignees, milestone,
    });

    return {
      type: 'json',
      data: {
        number:   data.number,
        title:    data.title,
        state:    data.state,
        html_url: data.html_url,
        labels:   data.labels.map(l => typeof l === 'string' ? l : l.name),
      },
    };
  },
};

// ── 4. Comment on issue or PR ─────────────────────────────────

export const commentIssueTool: Tool = {
  definition: {
    name: 'github_comment_issue',
    description:
      'Post a comment on a GitHub issue or pull request. ' +
      'Works for both issues and PRs since they share the same comments API.',
    input_schema: {
      type: 'object',
      properties: {
        owner:        { type: 'string', description: 'Repository owner' },
        repo:         { type: 'string', description: 'Repository name' },
        issue_number: { type: 'number', description: 'Issue or PR number' },
        body:         { type: 'string', description: 'Comment body (supports markdown)' },
      },
      required: ['owner', 'repo', 'issue_number', 'body'],
    },
  },
  execute: async (input): Promise<ToolResult> => {
    const { owner, repo, issue_number, body } = input as {
      owner: string; repo: string; issue_number: number; body: string;
    };

    const { data } = await getOctokit().issues.createComment({
      owner, repo, issue_number, body,
    });

    return {
      type: 'json',
      data: {
        id:       data.id,
        body:     data.body,
        html_url: data.html_url,
        created_at: data.created_at,
      },
    };
  },
};

// ── 5. Update issue ───────────────────────────────────────────

export const updateIssueTool: Tool = {
  definition: {
    name: 'github_update_issue',
    description:
      'Update an existing issue — change title, body, state (open/close), labels, or assignees.',
    input_schema: {
      type: 'object',
      properties: {
        owner:        { type: 'string', description: 'Repository owner' },
        repo:         { type: 'string', description: 'Repository name' },
        issue_number: { type: 'number', description: 'Issue number to update' },
        title:     { type: 'string', description: 'New title' },
        body:      { type: 'string', description: 'New body' },
        state: {
          type: 'string',
          enum: ['open', 'closed'],
          description: 'New state',
        },
        labels: {
          type: 'array',
          items: { type: 'string' },
          description: 'Replace all labels with this list',
        },
        assignees: {
          type: 'array',
          items: { type: 'string' },
          description: 'Replace all assignees with this list',
        },
      },
      required: ['owner', 'repo', 'issue_number'],
    },
  },
  execute: async (input): Promise<ToolResult> => {
    const { owner, repo, issue_number, title, body, state, labels, assignees } = input as {
      owner: string; repo: string; issue_number: number;
      title?: string; body?: string;
      state?: 'open' | 'closed';
      labels?: string[]; assignees?: string[];
    };

    const { data } = await getOctokit().issues.update({
      owner, repo, issue_number,
      ...(title     && { title }),
      ...(body      && { body }),
      ...(state     && { state }),
      ...(labels    && { labels }),
      ...(assignees && { assignees }),
    });

    return {
      type: 'json',
      data: {
        number:   data.number,
        title:    data.title,
        state:    data.state,
        html_url: data.html_url,
        updated_at: data.updated_at,
      },
    };
  },
};

// ── Export all issue tools ────────────────────────────────────

export const ISSUE_TOOLS: Tool[] = [
  listIssuesTool,
  getIssueTool,
  createIssueTool,
  commentIssueTool,
  updateIssueTool,
];
