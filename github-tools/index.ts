// ============================================================
// index.ts — GitHub Tools public API
// ============================================================

// Client
export {
  initGitHubClient,
  getOctokit,
  getGraphQL,
  isGitHubClientReady,
  getAuthenticatedUser,
} from './lib/githubClient';

// Tool sets
export { READ_TOOLS }     from './tools/github/read';
export { WRITE_TOOLS }    from './tools/github/write';
export { ISSUE_TOOLS }    from './tools/github/issues';
export { WORKFLOW_TOOLS } from './tools/github/workflows';

// Registry + hook
export {
  ALL_GITHUB_TOOLS,
  READONLY_GITHUB_TOOLS,
  TOOL_META,
  useGitHubTools,
} from './tools/ToolRegistry';

export type {
  GitHubClientStatus,
  GitHubUser,
} from './tools/ToolRegistry';
