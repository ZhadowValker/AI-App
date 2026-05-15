// ============================================================
// tools/github/workflows.ts
// WORKFLOW tools — requires actions:write permission on PAT
//
// Tools:
//   github_list_workflows       — list all workflows in a repo
//   github_trigger_workflow     — trigger a workflow_dispatch event
//   github_list_workflow_runs   — list recent runs of a workflow
//   github_get_workflow_run     — get status + jobs of a specific run
//   github_get_workflow_logs    — download logs for a run
//   github_cancel_workflow_run  — cancel an in-progress run
// ============================================================

import { getOctokit } from '../../lib/githubClient';
import type { Tool } from '../../../provider-engine/lib/toolLoop';
import type { ToolResult } from '../../../provider-engine/types';

// ── 1. List workflows ─────────────────────────────────────────

export const listWorkflowsTool: Tool = {
  definition: {
    name: 'github_list_workflows',
    description:
      'List all GitHub Actions workflows defined in a repository. ' +
      'Returns workflow id, name, filename, and state.',
    input_schema: {
      type: 'object',
      properties: {
        owner: { type: 'string', description: 'Repository owner' },
        repo:  { type: 'string', description: 'Repository name' },
      },
      required: ['owner', 'repo'],
    },
  },
  execute: async (input): Promise<ToolResult> => {
    const { owner, repo } = input as { owner: string; repo: string };

    const { data } = await getOctokit().actions.listRepoWorkflows({ owner, repo });

    return {
      type: 'json',
      data: data.workflows.map(w => ({
        id:       w.id,
        name:     w.name,
        filename: w.path.split('/').pop(),   // e.g. "deploy.yml"
        path:     w.path,
        state:    w.state,
        html_url: w.html_url,
      })),
    };
  },
};

// ── 2. Trigger workflow ───────────────────────────────────────

export const triggerWorkflowTool: Tool = {
  definition: {
    name: 'github_trigger_workflow',
    description:
      'Trigger a GitHub Actions workflow using workflow_dispatch event. ' +
      'The workflow must have a workflow_dispatch trigger defined.',
    input_schema: {
      type: 'object',
      properties: {
        owner:       { type: 'string', description: 'Repository owner' },
        repo:        { type: 'string', description: 'Repository name' },
        workflow_id: {
          type: 'string',
          description: 'Workflow filename (e.g. deploy.yml) or numeric workflow ID',
        },
        ref: {
          type: 'string',
          description: 'Branch or tag to run the workflow on. Default: main',
        },
        inputs: {
          type: 'object',
          description: 'Key-value pairs matching the workflow inputs defined in workflow_dispatch',
        },
      },
      required: ['owner', 'repo', 'workflow_id'],
    },
  },
  execute: async (input): Promise<ToolResult> => {
    const { owner, repo, workflow_id, ref = 'main', inputs = {} } = input as {
      owner: string; repo: string;
      workflow_id: string; ref?: string;
      inputs?: Record<string, string>;
    };

    await getOctokit().actions.createWorkflowDispatch({
      owner, repo,
      workflow_id,
      ref,
      inputs,
    });

    // GitHub doesn't return the run ID immediately — poll for it
    await new Promise(r => setTimeout(r, 2000));   // wait 2s for run to appear

    const { data: runs } = await getOctokit().actions.listWorkflowRuns({
      owner, repo, workflow_id,
      per_page: 1,
    });

    const latestRun = runs.workflow_runs[0];

    return {
      type: 'json',
      data: {
        triggered: true,
        workflow_id,
        ref,
        inputs,
        run_id:    latestRun?.id ?? null,
        run_url:   latestRun?.html_url ?? null,
        status:    latestRun?.status ?? 'queued',
        message: `Workflow "${workflow_id}" triggered on "${ref}". Run ID: ${latestRun?.id}`,
      },
    };
  },
};

// ── 3. List workflow runs ─────────────────────────────────────

export const listWorkflowRunsTool: Tool = {
  definition: {
    name: 'github_list_workflow_runs',
    description:
      'List recent runs of a specific workflow or all workflows in a repo. ' +
      'Can filter by branch, status, and actor.',
    input_schema: {
      type: 'object',
      properties: {
        owner:       { type: 'string', description: 'Repository owner' },
        repo:        { type: 'string', description: 'Repository name' },
        workflow_id: {
          type: 'string',
          description: 'Workflow filename or ID. Omit to list all workflow runs.',
        },
        branch:   { type: 'string', description: 'Filter by branch name' },
        status: {
          type: 'string',
          enum: ['queued', 'in_progress', 'completed', 'success', 'failure', 'cancelled'],
          description: 'Filter by run status',
        },
        per_page: { type: 'number', description: 'Results per page. Default: 10' },
      },
      required: ['owner', 'repo'],
    },
  },
  execute: async (input): Promise<ToolResult> => {
    const { owner, repo, workflow_id, branch, status, per_page = 10 } = input as {
      owner: string; repo: string;
      workflow_id?: string; branch?: string;
      status?: string; per_page?: number;
    };

    let runs: Array<Record<string, unknown>>;

    if (workflow_id) {
      const { data } = await getOctokit().actions.listWorkflowRuns({
        owner, repo, workflow_id,
        branch, status: status as 'queued' | 'in_progress' | 'completed' | undefined,
        per_page,
      });
      runs = data.workflow_runs as unknown as Array<Record<string, unknown>>;
    } else {
      const { data } = await getOctokit().actions.listWorkflowRunsForRepo({
        owner, repo,
        branch, status: status as 'queued' | 'in_progress' | 'completed' | undefined,
        per_page,
      });
      runs = data.workflow_runs as unknown as Array<Record<string, unknown>>;
    }

    return {
      type: 'json',
      data: runs.map(r => ({
        id:           r.id,
        name:         r.name,
        workflow_id:  r.workflow_id,
        status:       r.status,
        conclusion:   r.conclusion,
        branch:       r.head_branch,
        commit_sha:   String(r.head_sha).slice(0, 7),
        commit_msg:   (r.head_commit as Record<string, unknown>)?.message,
        triggered_by: (r.triggering_actor as Record<string, unknown>)?.login,
        created_at:   r.created_at,
        updated_at:   r.updated_at,
        duration_sec: r.created_at && r.updated_at
          ? Math.round(
              (new Date(r.updated_at as string).getTime() -
               new Date(r.created_at as string).getTime()) / 1000
            )
          : null,
        html_url:     r.html_url,
      })),
    };
  },
};

// ── 4. Get workflow run status + jobs ─────────────────────────

export const getWorkflowRunTool: Tool = {
  definition: {
    name: 'github_get_workflow_run',
    description:
      'Get detailed status of a specific workflow run including all jobs and their steps. ' +
      'Use this to check if a triggered workflow succeeded or failed.',
    input_schema: {
      type: 'object',
      properties: {
        owner:  { type: 'string', description: 'Repository owner' },
        repo:   { type: 'string', description: 'Repository name' },
        run_id: { type: 'number', description: 'Workflow run ID' },
      },
      required: ['owner', 'repo', 'run_id'],
    },
  },
  execute: async (input): Promise<ToolResult> => {
    const { owner, repo, run_id } = input as {
      owner: string; repo: string; run_id: number;
    };

    const octokit = getOctokit();

    const [runRes, jobsRes] = await Promise.all([
      octokit.actions.getWorkflowRun({ owner, repo, run_id }),
      octokit.actions.listJobsForWorkflowRun({ owner, repo, run_id }),
    ]);

    const run = runRes.data;

    const jobs = jobsRes.data.jobs.map(job => ({
      id:         job.id,
      name:       job.name,
      status:     job.status,
      conclusion: job.conclusion,
      started_at: job.started_at,
      completed_at: job.completed_at,
      duration_sec: job.started_at && job.completed_at
        ? Math.round(
            (new Date(job.completed_at).getTime() -
             new Date(job.started_at).getTime()) / 1000
          )
        : null,
      steps: job.steps?.map(s => ({
        name:       s.name,
        status:     s.status,
        conclusion: s.conclusion,
        number:     s.number,
      })) ?? [],
    }));

    return {
      type: 'json',
      data: {
        id:          run.id,
        name:        run.name,
        status:      run.status,
        conclusion:  run.conclusion,
        branch:      run.head_branch,
        commit_sha:  run.head_sha.slice(0, 7),
        created_at:  run.created_at,
        updated_at:  run.updated_at,
        html_url:    run.html_url,
        jobs,
      },
    };
  },
};

// ── 5. Get workflow logs ──────────────────────────────────────

export const getWorkflowLogsTool: Tool = {
  definition: {
    name: 'github_get_workflow_logs',
    description:
      'Download and return the logs for a failed workflow run job. ' +
      'Returns log text truncated to last 10000 characters (most relevant part).',
    input_schema: {
      type: 'object',
      properties: {
        owner:  { type: 'string', description: 'Repository owner' },
        repo:   { type: 'string', description: 'Repository name' },
        job_id: { type: 'number', description: 'Job ID (get from github_get_workflow_run)' },
      },
      required: ['owner', 'repo', 'job_id'],
    },
  },
  execute: async (input): Promise<ToolResult> => {
    const { owner, repo, job_id } = input as {
      owner: string; repo: string; job_id: number;
    };

    // GitHub returns a redirect URL for logs
    const response = await getOctokit().actions.downloadJobLogsForWorkflowRun({
      owner, repo, job_id,
    });

    // response.url is the redirect URL — fetch it directly
    const logRes = await fetch(response.url);
    const logText = await logRes.text();

    // Return last 10000 chars (most recent / relevant)
    const truncated = logText.length > 10000
      ? `...[truncated]...\n${logText.slice(-10000)}`
      : logText;

    return { type: 'text', text: truncated };
  },
};

// ── 6. Cancel workflow run ────────────────────────────────────

export const cancelWorkflowRunTool: Tool = {
  definition: {
    name: 'github_cancel_workflow_run',
    description: 'Cancel an in-progress GitHub Actions workflow run.',
    input_schema: {
      type: 'object',
      properties: {
        owner:  { type: 'string', description: 'Repository owner' },
        repo:   { type: 'string', description: 'Repository name' },
        run_id: { type: 'number', description: 'Workflow run ID to cancel' },
      },
      required: ['owner', 'repo', 'run_id'],
    },
  },
  execute: async (input): Promise<ToolResult> => {
    const { owner, repo, run_id } = input as {
      owner: string; repo: string; run_id: number;
    };

    await getOctokit().actions.cancelWorkflowRun({ owner, repo, run_id });

    return {
      type: 'json',
      data: { cancelled: true, run_id, message: `Workflow run ${run_id} cancelled.` },
    };
  },
};

// ── Export all workflow tools ─────────────────────────────────

export const WORKFLOW_TOOLS: Tool[] = [
  listWorkflowsTool,
  triggerWorkflowTool,
  listWorkflowRunsTool,
  getWorkflowRunTool,
  getWorkflowLogsTool,
  cancelWorkflowRunTool,
];
