// ============================================================
// src/middleware/auth.ts
// JWT auth middleware.
// The mobile app sends: Authorization: Bearer <jwt>
// The jwt contains: { sub: userId, pat?: githubPAT }
// ============================================================

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthPayload {
  sub:  string;       // user identifier
  pat?: string;       // GitHub PAT forwarded from device (optional)
  iat?: number;
  exp?: number;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthPayload;
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;

  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing Authorization header' });
    return;
  }

  const token = header.slice(7);
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    res.status(500).json({ error: 'Server misconfiguration: JWT_SECRET not set' });
    return;
  }

  try {
    const payload = jwt.verify(token, secret) as AuthPayload;
    req.auth = payload;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ── Generate a JWT (for development / testing) ────────────────
export function generateToken(userId: string, pat?: string): string {
  const secret = process.env.JWT_SECRET ?? 'dev-secret';
  return jwt.sign(
    { sub: userId, ...(pat && { pat }) },
    secret,
    { expiresIn: '30d' },
  );
}
