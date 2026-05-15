// ============================================================
// src/routes/github.ts
// GitHub API bridge.
// The mobile app sends its PAT in the JWT payload (req.auth.pat)
// or in X-GitHub-PAT header. Gateway forwards it to GitHub.
// The PAT is never stored server-side.
// ============================================================

import { Router, Request, Response } from 'express';
import { Octokit } from '@octokit/rest';
import { authMiddleware } from '../middleware/auth';

export const githubRouter = Router();

// Apply auth to all github routes
githubRouter.use(authMiddleware);

// ── Get Octokit for the request ───────────────────────────────
// PAT comes from either JWT payload or X-GitHub-PAT header.
// Never stored on server — used per-request only.

function getOctokitForRequest(req: Request): Octokit | null {
  const pat = req.auth?.pat ?? req.headers['x-github-pat'] as string | undefined;
  if (!pat) return null;
  return new Octokit({ auth: pat });
}

function requirePAT(req: Request, res: Response): Octokit | null {
  const octokit = getOctokitForRequest(req);
  if (!octokit) {
    res.status(401).json({ error: 'GitHub PAT required. Include pat in JWT or X-GitHub-PAT header.' });
    return null;
  }
  return octokit;
}

// ── GET /github/user ──────────────────────────────────────────

githubRouter.get('/user', async (req, res) => {
  const octokit = requirePAT(req, res);
  if (!octokit) return;
  try {
    const { data } = await octokit.users.getAuthenticated();
    res.json({ login: data.login, name: data.name, avatar_url: data.avatar_url });
  } catch (err) {
    res.status(502).json({ error: String(err) });
  }
});

// ── GET /github/repos ─────────────────────────────────────────

githubRouter.get('/repos', async (req, res) => {
  const octokit = requirePAT(req, res);
  if (!octokit) return;
  try {
    const { data } = await octokit.repos.listForAuthenticatedUser({
      per_page: 100, sort: 'pushed',
    });
    res.json(data.map(r => ({
      full_name:        r.full_name,
      name:             r.name,
      description:      r.description,
      language:         r.language,
      default_branch:   r.default_branch,
      stargazers_count: r.stargazers_count,
      private:          r.private,
    })));
  } catch (err) {
    res.status(502).json({ error: String(err) });
  }
});

// ── GET /github/repos/:owner/:repo/contents/*path ────────────

githubRouter.get('/repos/:owner/:repo/contents/*', async (req, res) => {
  const octokit = requirePAT(req, res);
  if (!octokit) return;
  const { owner, repo } = req.params;
  const path = req.params[0] ?? '';
  const ref  = (req.query.ref as string) ?? 'main';
  try {
    const { data } = await octokit.repos.getContent({ owner, repo, path, ref });
    res.json(data);
  } catch (err) {
    res.status(502).json({ error: String(err) });
  }
});

// ── POST /github/repos/:owner/:repo/actions/workflows/:id/dispatches

githubRouter.post(
  '/repos/:owner/:repo/actions/workflows/:workflow_id/dispatches',
  async (req, res) => {
    const octokit = requirePAT(req, res);
    if (!octokit) return;
    const { owner, repo, workflow_id } = req.params;
    const { ref = 'main', inputs = {} } = req.body as { ref?: string; inputs?: Record<string, string> };
    try {
      await octokit.actions.createWorkflowDispatch({ owner, repo, workflow_id, ref, inputs });
      res.json({ triggered: true });
    } catch (err) {
      res.status(502).json({ error: String(err) });
    }
  }
);

// ── GET /github/repos/:owner/:repo/actions/runs ──────────────

githubRouter.get('/repos/:owner/:repo/actions/runs', async (req, res) => {
  const octokit = requirePAT(req, res);
  if (!octokit) return;
  const { owner, repo } = req.params;
  const per_page = parseInt(req.query.per_page as string) || 10;
  try {
    const { data } = await octokit.actions.listWorkflowRunsForRepo({ owner, repo, per_page });
    res.json(data.workflow_runs.map(r => ({
      id: r.id, name: r.name, status: r.status,
      conclusion: r.conclusion, html_url: r.html_url,
      created_at: r.created_at,
    })));
  } catch (err) {
    res.status(502).json({ error: String(err) });
  }
});
