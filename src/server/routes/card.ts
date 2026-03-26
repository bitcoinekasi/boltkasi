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
// One-time programming endpoint consumed by the Boltcard Programmer app.
// Returns card keys and clears the setup token atomically.

router.get('/setup/:token', (req, res) => {
  const { token } = req.params;
  const DOMAIN = process.env.DOMAIN!;
  const proto = DOMAIN.startsWith('localhost') ? 'http' : 'https';

  let card: CardRow | undefined;

  db.transaction(() => {
    card = db
      .prepare('SELECT * FROM cards WHERE setup_token = ?')
      .get(token) as CardRow | undefined;

    if (!card) return;

    // Clear the setup token and mark as programmed
    db.prepare(
      'UPDATE cards SET setup_token = NULL, programmed_at = unixepoch() WHERE id = ?'
    ).run(card.id);
  })();

  if (!card) {
    res.status(404).json({ error: 'Setup token not found or already used' });
    return;
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
