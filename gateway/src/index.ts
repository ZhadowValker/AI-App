// ============================================================
// src/index.ts — Cloud Gateway entry point
// Runs on Railway / Render / VPS
// Port: process.env.PORT (default 3000)
// ============================================================

import 'dotenv/config';
import express from 'express';
import cors    from 'cors';
import helmet  from 'helmet';
import rateLimit from 'express-rate-limit';

import { proxyRouter }  from './routes/proxy';
import { githubRouter } from './routes/github';

const app  = express();
const PORT = parseInt(process.env.PORT ?? '3000');

// ── Security middleware ───────────────────────────────────────

app.use(helmet());

app.use(cors({
  origin:  process.env.ALLOWED_ORIGINS?.split(',') ?? '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-GitHub-PAT'],
}));

// ── Rate limiting ─────────────────────────────────────────────

const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? '60000'),
  max:      parseInt(process.env.RATE_LIMIT_MAX ?? '60'),
  standardHeaders: true,
  legacyHeaders:   false,
  message: { error: 'Too many requests, please slow down.' },
});

app.use(limiter);

// ── Body parsing ──────────────────────────────────────────────

app.use(express.json({ limit: '10mb' }));

// ── Health check ──────────────────────────────────────────────
// Mobile app pings this to decide local vs cloud mode

app.get('/health', (_req, res) => {
  res.json({
    ok:          true,
    ts:          Date.now(),
    env:         process.env.NODE_ENV ?? 'development',
    providers:   {
      claude: !!process.env.ANTHROPIC_API_KEY,
      openai: !!process.env.OPENAI_API_KEY,
    },
  });
});

// ── Routes ───────────────────────────────────────────────────

app.use('/proxy',  proxyRouter);
app.use('/github', githubRouter);

// ── 404 handler ──────────────────────────────────────────────

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ── Error handler ─────────────────────────────────────────────

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Gateway Error]', err);
  res.status(500).json({ error: err.message ?? 'Internal server error' });
});

// ── Start ─────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════╗
║       GitHub AI Gateway               ║
║  PORT: ${PORT}                           ║
║  ENV:  ${process.env.NODE_ENV ?? 'development'}                ║
║  Claude: ${process.env.ANTHROPIC_API_KEY ? '✅' : '❌ not set'}                ║
║  OpenAI: ${process.env.OPENAI_API_KEY   ? '✅' : '❌ not set'}                ║
╚═══════════════════════════════════════╝
  `);
});

export default app;
