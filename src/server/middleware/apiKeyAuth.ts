import { createHash } from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { db } from '../db/index.js';

export function requireApiKey(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const key = req.headers['x-api-key'] as string | undefined;
  if (!key) {
    res.status(401).json({ error: 'Missing X-API-Key header' });
    return;
  }
  const hash = createHash('sha256').update(key).digest('hex');
  const row = db.prepare('SELECT id FROM api_keys WHERE key_hash = ?').get(hash);
  if (!row) {
    res.status(401).json({ error: 'Invalid API key' });
    return;
  }
  next();
}
