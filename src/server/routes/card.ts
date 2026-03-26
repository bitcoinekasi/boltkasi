import { Router } from 'express';
import { db } from '../db/index.js';

const router = Router();

interface CardRow {
  id: number;
  user_id: number;
  k0: string;
  k1: string;
  k2: string;
  k3: string;
  k4: string;
  setup_token: string | null;
  programmed_at: number | null;
  enabled: number;
}

// ── GET /api/card/setup/:token ────────────────────────────────────────────────
//
// Programming endpoint consumed by the Boltcard Programmer app.
// Returns card keys. Token stays valid so retries work if NFC write fails.
// Token is only invalidated when Reprogram is called (generating new keys).

router.get('/setup/:token', (req, res) => {
  const { token } = req.params;
  const DOMAIN = process.env.DOMAIN!;

  const card = db
    .prepare('SELECT * FROM cards WHERE setup_token = ?')
    .get(token) as CardRow | undefined;

  if (!card) {
    res.status(404).json({ error: 'Setup token not found or already used' });
    return;
  }

  // Mark as programmed on first fetch (idempotent)
  if (!card.programmed_at) {
    db.prepare('UPDATE cards SET programmed_at = unixepoch() WHERE id = ?').run(card.id);
  }

  res.json({
    protocol_name: 'create_bolt_card_response',
    protocol_version: 2,
    card_name: 'BoltCard',
    lnurlw_base: `lnurlw://${DOMAIN}/lnurlw`,
    uid_privacy: 'Y',
    k0: card.k0,
    k1: card.k1,
    k2: card.k2,
    k3: card.k3,
    k4: card.k4,
  });
});

export default router;
