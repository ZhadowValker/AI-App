// ============================================================
// src/routes/proxy.ts
// Proxies AI provider requests from the mobile app.
// Adds CORS, rate limiting, API keys server-side.
// Fully streams SSE responses back to the client.
// ============================================================

import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middleware/auth';

export const proxyRouter = Router();

// ── Helper: pipe a fetch Response stream to Express res ───────

async function pipeStream(fetchRes: globalThis.Response, res: Response): Promise<void> {
  if (!fetchRes.body) {
    res.status(502).json({ error: 'Empty response from provider' });
    return;
  }

  res.setHeader('Content-Type', fetchRes.headers.get('content-type') ?? 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');   // disable nginx buffering

  const reader = fetchRes.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
  } finally {
    reader.releaseLock();
    res.end();
  }
}

// ── POST /proxy/claude ────────────────────────────────────────
// App sends the full Anthropic request body (without api key).
// Gateway injects the server-side key.

proxyRouter.post('/claude', authMiddleware, async (req: Request, res: Response) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured on server' });
    return;
  }

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-beta':    'tools-2024-04-04',
      },
      body: JSON.stringify(req.body),
    });

    if (!upstream.ok) {
      const err = await upstream.text();
      res.status(upstream.status).json({ error: err });
      return;
    }

    await pipeStream(upstream, res);
  } catch (err) {
    res.status(502).json({ error: `Claude proxy error: ${String(err)}` });
  }
});

// ── POST /proxy/openai ────────────────────────────────────────

proxyRouter.post('/openai', authMiddleware, async (req: Request, res: Response) => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'OPENAI_API_KEY not configured on server' });
    return;
  }

  const baseUrl = 'https://api.openai.com/v1';

  try {
    const upstream = await fetch(`${baseUrl}/chat/completions`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(req.body),
    });

    if (!upstream.ok) {
      const err = await upstream.text();
      res.status(upstream.status).json({ error: err });
      return;
    }

    await pipeStream(upstream, res);
  } catch (err) {
    res.status(502).json({ error: `OpenAI proxy error: ${String(err)}` });
  }
});

// ── GET /proxy/models/:provider ───────────────────────────────
// Returns available models for a provider

proxyRouter.get('/models/:provider', authMiddleware, async (req: Request, res: Response) => {
  const { provider } = req.params;

  try {
    if (provider === 'openai') {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) { res.status(500).json({ error: 'OPENAI_API_KEY not set' }); return; }
      const r = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const data = await r.json() as { data: Array<{ id: string }> };
      const models = data.data
        .map(m => m.id)
        .filter(id => id.startsWith('gpt-') || id.startsWith('o'))
        .sort();
      res.json({ models });
    } else if (provider === 'claude') {
      res.json({
        models: [
          'claude-opus-4-5',
          'claude-sonnet-4-5',
          'claude-haiku-4-5-20251001',
        ],
      });
    } else {
      res.status(400).json({ error: `Unknown provider: ${provider}` });
    }
  } catch (err) {
    res.status(502).json({ error: String(err) });
  }
});
