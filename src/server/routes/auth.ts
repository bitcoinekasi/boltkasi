import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../db/index.js';
import { requireAdmin, type AdminRequest } from '../middleware/adminAuth.js';

const router = Router();

router.post('/login', (req, res) => {
  const { username, password } = req.body as { username?: string; password?: string };
  if (!username || !password) {
    res.status(400).json({ error: 'username and password required' });
    return;
  }

  const admin = db
    .prepare('SELECT * FROM admins WHERE username = ?')
    .get(username) as { id: number; username: string; password_hash: string } | undefined;

  if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const token = jwt.sign(
    { role: 'admin', sub: admin.id },
    process.env.JWT_SECRET!,
    { expiresIn: '8h' }
  );
  res.json({ token });
});

router.get('/me', requireAdmin, (req: AdminRequest, res) => {
  const admin = db
    .prepare('SELECT id, username FROM admins WHERE id = ?')
    .get(req.adminId) as { id: number; username: string } | undefined;
  if (!admin) {
    res.status(404).json({ error: 'Admin not found' });
    return;
  }
  res.json(admin);
});

router.post('/change-password', requireAdmin, (req: AdminRequest, res) => {
  const { current_password, new_password } = req.body as {
    current_password?: string;
    new_password?: string;
  };
  if (!current_password || !new_password) {
    res.status(400).json({ error: 'current_password and new_password required' });
    return;
  }
  if (new_password.length < 8) {
    res.status(400).json({ error: 'new_password must be at least 8 characters' });
    return;
  }

  const admin = db
    .prepare('SELECT * FROM admins WHERE id = ?')
    .get(req.adminId) as { id: number; password_hash: string } | undefined;

  if (!admin || !bcrypt.compareSync(current_password, admin.password_hash)) {
    res.status(401).json({ error: 'Current password is incorrect' });
    return;
  }

  const newHash = bcrypt.hashSync(new_password, 10);
  db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(newHash, admin.id);
  res.json({ success: true });
});

export default router;
