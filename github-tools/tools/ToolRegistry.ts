// ============================================================
// tools/ToolRegistry.ts
// Central registry — combines all GitHub tools into one array.
// Also exports useGitHubTools() hook which:
//   1. Loads PAT from PatVault
//   2. Initializes the GitHub client
//   3. Returns the tool array ready for useProviderEngine()
// ============================================================

import { useEffect, useState } from 'react';
import { PatVault } from '../../provider-engine/lib/patVault';
import { initGitHubClient, isGitHubClientReady, getAuthenticatedUser } from '../lib/githubClient';
import { READ_TOOLS }     from './github/read';
import { WRITE_TOOLS }    from './github/write';
import { ISSUE_TOOLS }    from './github/issues';
import { WORKFLOW_TOOLS } from './github/workflows';
import type { Tool } from '../../provider-engine/lib/toolLoop';

// ── All tools combined ────────────────────────────────────────

export const ALL_GITHUB_TOOLS: Tool[] = [
  ...READ_TOOLS,
  ...WRITE_TOOLS,
  ...ISSUE_TOOLS,
  ...WORKFLOW_TOOLS,
];

// ── Tool subsets (pass only what you need) ────────────────────

export const READONLY_GITHUB_TOOLS: Tool[] = [
  ...READ_TOOLS,
  ...ISSUE_TOOLS.filter(t =>
    t.definition.name === 'github_list_issues' ||
    t.definition.name === 'github_get_issue'
  ),
];

export { READ_TOOLS, WRITE_TOOLS, ISSUE_TOOLS, WORKFLOW_TOOLS };

// ── Tool name registry (for UI display) ──────────────────────

export const TOOL_META: Record<string, { label: string; icon: string; category: string }> = {
  github_list_repos:          { label: 'List Repos',          icon: '📁', category: 'Read' },
  github_read_file:           { label: 'Read File',           icon: '📄', category: 'Read' },
  github_list_tree:           { label: 'File Tree',           icon: '🌲', category: 'Read' },
  github_search_code:         { label: 'Search Code',         icon: '🔍', category: 'Read' },
  github_get_commits:         { label: 'Get Commits',         icon: '📝', category: 'Read' },
  github_get_file_diff:       { label: 'Get Diff',            icon: '↔️',  category: 'Read' },
  github_create_branch:       { label: 'Create Branch',       icon: '🌿', category: 'Write' },
  github_commit_files:        { label: 'Commit Files',        icon: '💾', category: 'Write' },
  github_create_pr:           { label: 'Create PR',           icon: '🔀', category: 'Write' },
  github_merge_pr:            { label: 'Merge PR',            icon: '✅', category: 'Write' },
  github_review_pr:           { label: 'Review PR',           icon: '👀', category: 'Write' },
  github_list_issues:         { label: 'List Issues',         icon: '🐛', category: 'Issues' },
  github_get_issue:           { label: 'Get Issue',           icon: '🐛', category: 'Issues' },
  github_create_issue:        { label: 'Create Issue',        icon: '➕', category: 'Issues' },
  github_comment_issue:       { label: 'Comment Issue',       icon: '💬', category: 'Issues' },
  github_update_issue:        { label: 'Update Issue',        icon: '✏️',  category: 'Issues' },
  github_list_workflows:      { label: 'List Workflows',      icon: '⚙️',  category: 'Workflows' },
  github_trigger_workflow:    { label: 'Trigger Workflow',    icon: '▶️',  category: 'Workflows' },
  github_list_workflow_runs:  { label: 'List Runs',           icon: '📋', category: 'Workflows' },
  github_get_workflow_run:    { label: 'Get Run Status',      icon: '🔄', category: 'Workflows' },
  github_get_workflow_logs:   { label: 'Get Logs',            icon: '📜', category: 'Workflows' },
  github_cancel_workflow_run: { label: 'Cancel Run',          icon: '🛑', category: 'Workflows' },
};

// ── React hook — initializes client + returns tools ───────────

export type GitHubClientStatus =
  | 'idle'
  | 'loading'
  | 'ready'
  | 'error'
  | 'no-pat';

export interface GitHubUser {
  login: string;
  name: string | null;
  avatar_url: string;
}

export function useGitHubTools(toolSubset: Tool[] = ALL_GITHUB_TOOLS) {
  const [status, setStatus]   = useState<GitHubClientStatus>('idle');
  const [error, setError]     = useState<string | null>(null);
  const [user, setUser]       = useState<GitHubUser | null>(null);
  const [tools, setTools]     = useState<Tool[]>([]);

  useEffect(() => {
    let mounted = true;

    async function init() {
      setStatus('loading');

      const pat = await PatVault.getGitHubPAT();

      if (!pat) {
        if (mounted) setStatus('no-pat');
        return;
      }

      try {
        initGitHubClient(pat);

        // Verify PAT works by fetching authenticated user
        const authUser = await getAuthenticatedUser();

        if (mounted) {
          setUser(authUser);
          setTools(toolSubset);
          setStatus('ready');
        }
      } catch (err) {
        if (mounted) {
          setError(String(err));
          setStatus('error');
        }
      }
    }

    init();
    return () => { mounted = false; };
  }, []);

  // Re-initialize when PAT changes (e.g. user updates it in settings)
  const reinitialize = async () => {
    setStatus('loading');
    setError(null);
    const pat = await PatVault.getGitHubPAT();
    if (!pat) { setStatus('no-pat'); return; }
    try {
      initGitHubClient(pat);
      const authUser = await getAuthenticatedUser();
      setUser(authUser);
      setTools(toolSubset);
      setStatus('ready');
    } catch (err) {
      setError(String(err));
      setStatus('error');
    }
  };

  return { tools, status, error, user, reinitialize, isReady: status === 'ready' };
}
