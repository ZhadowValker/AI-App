// ============================================================
// lib/githubClient.ts
// Singleton Octokit client, re-initialized whenever PAT changes.
// Uses @octokit/rest for REST + @octokit/graphql for GraphQL.
// ============================================================

import { Octokit } from '@octokit/rest';
import { graphql } from '@octokit/graphql';

let _octokit: Octokit | null = null;
let _graphql: typeof graphql | null = null;
let _currentPAT: string | null = null;

// ── Initialize with PAT ───────────────────────────────────────
export function initGitHubClient(pat: string): void {
  if (pat === _currentPAT && _octokit) return; // already initialized
  _currentPAT = pat;
  _octokit = new Octokit({ auth: pat });
  _graphql = graphql.defaults({
    headers: { authorization: `token ${pat}` },
  });
}

// ── Get REST client (throws if not initialized) ───────────────
export function getOctokit(): Octokit {
  if (!_octokit) throw new Error('GitHub client not initialized. Call initGitHubClient(pat) first.');
  return _octokit;
}

// ── Get GraphQL client ────────────────────────────────────────
export function getGraphQL(): typeof graphql {
  if (!_graphql) throw new Error('GitHub client not initialized. Call initGitHubClient(pat) first.');
  return _graphql;
}

// ── Check if initialized ──────────────────────────────────────
export function isGitHubClientReady(): boolean {
  return _octokit !== null && _currentPAT !== null;
}

// ── Get authenticated user ────────────────────────────────────
export async function getAuthenticatedUser(): Promise<{
  login: string;
  name: string | null;
  avatar_url: string;
}> {
  const { data } = await getOctokit().users.getAuthenticated();
  return {
    login: data.login,
    name: data.name ?? null,
    avatar_url: data.avatar_url,
  };
}
