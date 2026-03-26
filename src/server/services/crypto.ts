import { createDecipheriv, createCipheriv, randomBytes } from 'crypto';

// ── Helpers ──────────────────────────────────────────────────────────────────

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error('Odd-length hex string');
  const buf = new Uint8Array(hex.length / 2);
  for (let i = 0; i < buf.length; i++) {
    buf[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return buf;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ── decryptP ─────────────────────────────────────────────────────────────────
//
// Decrypts the `p` parameter from a boltcard tap URL.
// Uses AES-128-CBC with the card's K1 key and a zero IV.
//
// Decrypted layout (16 bytes):
//   [0]      = 0xC7  (magic byte)
//   [1..7]   = UID   (7 bytes, little-endian)
//   [8..10]  = counter (3 bytes, little-endian)
//   [11..15] = padding

export function decryptP(
  k1Hex: string,
  pHex: string
): { uid: string; counter: number } {
  const key = Buffer.from(hexToBytes(k1Hex));
  const ct = Buffer.from(hexToBytes(pHex));
  const iv = Buffer.alloc(16, 0);

  const decipher = createDecipheriv('aes-128-cbc', key, iv);
  decipher.setAutoPadding(false);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);

  if (pt[0] !== 0xc7) {
    throw new Error(`Invalid magic byte: 0x${pt[0].toString(16)}`);
  }

  const uid = bytesToHex(pt.slice(1, 8)).toUpperCase();
  const counter = pt[8] | (pt[9] << 8) | (pt[10] << 16);
  return { uid, counter };
}

// ── aesCmac ──────────────────────────────────────────────────────────────────
//
// AES-128-CMAC (RFC 4493) using Node's built-in crypto (AES-128-ECB).

function aesCmac(key: Uint8Array, message: Uint8Array): Uint8Array {
  const BLOCK = 16;
  const Rb = 0x87; // constant for 128-bit block size

  function aesEcb(k: Uint8Array, block: Uint8Array): Buffer {
    const cipher = createCipheriv('aes-128-ecb', Buffer.from(k), null);
    cipher.setAutoPadding(false);
    return Buffer.concat([cipher.update(Buffer.from(block)), cipher.final()]);
  }

  function shiftLeft(b: Uint8Array): Uint8Array {
    const out = new Uint8Array(BLOCK);
    for (let i = 0; i < BLOCK - 1; i++) out[i] = ((b[i] << 1) | (b[i + 1] >> 7)) & 0xff;
    out[BLOCK - 1] = (b[BLOCK - 1] << 1) & 0xff;
    return out;
  }

  // Generate subkeys K1, K2
  const L = aesEcb(key, new Uint8Array(BLOCK));
  const K1 = shiftLeft(L);
  if (L[0] & 0x80) K1[BLOCK - 1] ^= Rb;
  const K2 = shiftLeft(K1);
  if (K1[0] & 0x80) K2[BLOCK - 1] ^= Rb;

  // Split message into blocks
  const n = Math.max(1, Math.ceil(message.length / BLOCK));
  const lastComplete = message.length > 0 && message.length % BLOCK === 0;

  const blocks: Uint8Array[] = [];
  for (let i = 0; i < n - 1; i++) blocks.push(message.slice(i * BLOCK, (i + 1) * BLOCK));

  // Last block: XOR with subkey and pad if incomplete
  const lastRaw = message.slice((n - 1) * BLOCK);
  const last = new Uint8Array(BLOCK);
  if (lastComplete) {
    last.set(lastRaw);
    for (let i = 0; i < BLOCK; i++) last[i] ^= K1[i];
  } else {
    last.set(lastRaw);
    last[lastRaw.length] = 0x80; // padding
    for (let i = 0; i < BLOCK; i++) last[i] ^= K2[i];
  }
  blocks.push(last);

  // CBC-MAC
  let X = new Uint8Array(BLOCK);
  for (const block of blocks) {
    const xored = new Uint8Array(BLOCK);
    for (let i = 0; i < BLOCK; i++) xored[i] = X[i] ^ block[i];
    X = new Uint8Array(aesEcb(key, xored));
  }
  return X;
}

// ── verifyCmac ───────────────────────────────────────────────────────────────
//
// Verifies the `c` parameter (truncated CMAC) from a boltcard tap URL.
//
// The NTAG424 uses a double-CMAC scheme:
//   1. Build sv2 (16 bytes):
//        [0x3C, 0xC3, 0x00, 0x01, 0x00, 0x80] + uid(7) + counter_le(3)
//   2. sessionKey = CMAC(K2, sv2)
//   3. mac16 = CMAC(sessionKey, empty)
//   4. Truncate: extract odd-indexed bytes → 8 bytes
//   5. Compare with the 8-byte `c` parameter

export function verifyCmac(
  k2Hex: string,
  uid: string,
  counter: number,
  cHex: string
): boolean {
  const k2 = hexToBytes(k2Hex);
  const uidBytes = hexToBytes(uid);
  if (uidBytes.length !== 7) throw new Error('UID must be 7 bytes');

  // Build sv2
  const sv2 = new Uint8Array(16);
  sv2[0] = 0x3c;
  sv2[1] = 0xc3;
  sv2[2] = 0x00;
  sv2[3] = 0x01;
  sv2[4] = 0x00;
  sv2[5] = 0x80;
  sv2.set(uidBytes, 6);
  sv2[13] = counter & 0xff;
  sv2[14] = (counter >> 8) & 0xff;
  sv2[15] = (counter >> 16) & 0xff;

  // sessionKey = CMAC(K2, sv2)
  const sessionKey = aesCmac(k2, sv2);

  // mac16 = CMAC(sessionKey, empty)
  const mac16 = aesCmac(sessionKey, new Uint8Array(0));

  // Truncate: extract bytes at odd indices [1,3,5,7,9,11,13,15]
  const truncated = new Uint8Array(8);
  for (let i = 0; i < 8; i++) {
    truncated[i] = mac16[i * 2 + 1];
  }

  const expected = hexToBytes(cHex);
  if (expected.length !== 8) return false;

  // Constant-time compare
  let diff = 0;
  for (let i = 0; i < 8; i++) {
    diff |= truncated[i] ^ expected[i];
  }
  return diff === 0;
}

// ── generateKeys ─────────────────────────────────────────────────────────────
//
// Generates 5 random 16-byte AES-128 keys for a new boltcard.

export function generateKeys(): {
  k0: string;
  k1: string;
  k2: string;
  k3: string;
  k4: string;
} {
  return {
    k0: randomBytes(16).toString('hex'),
    k1: randomBytes(16).toString('hex'),
    k2: randomBytes(16).toString('hex'),
    k3: randomBytes(16).toString('hex'),
    k4: randomBytes(16).toString('hex'),
  };
}
