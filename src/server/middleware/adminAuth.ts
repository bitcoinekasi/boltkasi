import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';

export interface AdminRequest extends Request {
  adminId?: number;
}

export function requireAdmin(
  req: AdminRequest,
  res: Response,
  next: NextFunction
): void {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    const payload = jwt.verify(auth.slice(7), process.env.JWT_SECRET!) as {
      role: string;
      sub: number;
    };
    if (payload.role !== 'admin') {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    req.adminId = payload.sub;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}
