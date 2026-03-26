import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/index.js';
import { requireApiKey } from '../middleware/apiKeyAuth.js';

const router = Router();
router.use(requireApiKey);

const DOMAIN = () => process.env.DOMAIN!;

// ── POST /api/v1/users ────────────────────────────────────────────────────────

router.post('/users', (req, res) => {
  const { username, display_name } = req.body as {
    username?: string;
    display_name?: string;
  };
  if (!username || !display_name) {
    res.status(400).json({ error: 'username and display_name required' });
    return;
  }
  if (!/^[a-z0-9_.-]+$/.test(username)) {
    res.status(400).json({ error: 'username may only contain a-z, 0-9, _, -, .' });
    return;
  }

  const magicToken = uuidv4().replace(/-/g, '');
  const proto = DOMAIN().startsWith('localhost') ? 'http' : 'https';
  try {
    const result = db
      .prepare('INSERT INTO users (username, display_name, magic_token) VALUES (?, ?, ?)')
      .run(username, display_name, magicToken);
    res.status(201).json({
      id: result.lastInsertRowid,
      username,
      display_name,
      magic_link_url: `${proto}://${DOMAIN()}/u/${magicToken}`,
    });
  } catch (err: any) {
    if (err?.message?.includes('UNIQUE')) {
      res.status(409).json({ error: 'Username already taken' });
    } else {
      throw err;
    }
  }
});

// ── GET /api/v1/users/:id ─────────────────────────────────────────────────────

router.get('/users/:id', (req, res) => {
  const userId = Number(req.params.id);
  const user = db
    .prepare('SELECT id, username, display_name, balance_sats, ln_address_enabled, created_at FROM users WHERE id = ?')
    .get(userId) as any;
  if (!user) { res.status(404).json({ error: 'User not found' }); return; }

  const card = db
    .prepare('SELECT id, programmed_at, enabled, uid, tx_max_sats, day_max_sats FROM cards WHERE user_id = ?')
    .get(userId) as any;

  const proto = DOMAIN().startsWith('localhost') ? 'http' : 'https';
  res.json({
    ...user,
    ln_address: user.ln_address_enabled ? `${user.username}@${DOMAIN()}` : null,
    magic_link_url: undefined, // not exposed in external API
    card: card
      ? {
          id: card.id,
          programmed: !!card.programmed_at,
          enabled: !!card.enabled,
          uid: card.uid,
          tx_max_sats: card.tx_max_sats,
          day_max_sats: card.day_max_sats,
        }
      : null,
  });
});

// ── POST /api/v1/users/:id/credit ─────────────────────────────────────────────

router.post('/users/:id/credit', (req, res) => {
  const userId = Number(req.params.id);
  const { amount_sats, description } = req.body as {
    amount_sats?: number;
    description?: string;
  };
  if (!amount_sats || amount_sats <= 0) {
    res.status(400).json({ error: 'amount_sats must be a positive integer' });
    return;
  }

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId) as any;
  if (!user) { res.status(404).json({ error: 'User not found' }); return; }

  db.transaction(() => {
    db.prepare('UPDATE users SET balance_sats = balance_sats + ? WHERE id = ?').run(amount_sats, userId);
    db.prepare('INSERT INTO transactions (user_id, type, amount_sats, description) VALUES (?, ?, ?, ?)').run(
      userId, 'refill', amount_sats, description ?? 'API credit'
    );
  })();

  const updated = db.prepare('SELECT balance_sats FROM users WHERE id = ?').get(userId) as any;
  res.json({ balance_sats: updated.balance_sats });
});

export default router;
