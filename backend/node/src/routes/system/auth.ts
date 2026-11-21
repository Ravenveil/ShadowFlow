/**
 * routes/auth.ts — SIWE (Sign-In with Ethereum) + guest auth for ShadowFlow.
 *
 * 0G Chain parameters:
 *   RPC  : https://evmrpc-testnet.0g.ai
 *   Chain ID : 16600
 *
 * ethers version: v6  (ethers.verifyMessage, ethers.JsonRpcProvider)
 *
 * Endpoints:
 *   POST /api/auth/guest          — issue a guest session token
 *   GET  /api/auth/nonce          — generate a fresh SIWE nonce
 *   POST /api/auth/verify         — verify SIWE signature → session token
 *   POST /api/auth/register       — email + password registration → session
 *   POST /api/auth/login          — email + password login → session
 *   POST /api/auth/logout         — revoke the current session
 *   POST /api/auth/profile        — update display_name (wallet/email)
 *   POST /api/auth/subscribe      — landing-page lead capture (no account)
 *   GET  /api/auth/me             — validate Bearer token, return profile
 */

import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { ethers } from 'ethers';
import {
  createNonce,
  getNonce,
  useNonce,
  createSession,
  getSessionByTokenHash,
  deleteSession,
  upsertProfile,
  getProfile,
  createEmailUser,
  getEmailUser,
  updateEmailUserDisplayName,
  addLead,
} from '../../storage/auth';
// 登录信息隔离批 — 会话签发时同步 users 表（真实用户库）。user_id = session.address
// 的自然主键；role 引导（首个邮箱用户 / SF_ADMIN_EMAIL → admin）见 storage/users.ts。
import { ensureUser } from '../../storage/users';

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

/** sha256(input) → hex string */
function sha256(input: string): string {
  return crypto.createHash('sha256').update(input).digest('hex');
}

/** Generate a random hex string of `bytes` bytes. */
function randomHex(bytes: number): string {
  return crypto.randomBytes(bytes).toString('hex');
}

/** Extract Bearer token from Authorization header, or null. */
function extractBearer(req: Request): string | null {
  const auth = req.headers.authorization ?? '';
  if (!auth.startsWith('Bearer ')) return null;
  return auth.slice(7).trim() || null;
}

/** Session TTL for wallet logins: 7 days */
const WALLET_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Session TTL for guest logins: 24 hours */
const GUEST_SESSION_TTL_MS = 24 * 60 * 60 * 1000;
/** Session TTL for email logins: 7 days */
const EMAIL_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** Nonce TTL: 5 minutes */
const NONCE_TTL_MS = 5 * 60 * 1000;

// ── Password hashing (scrypt — built-in, no native deps) ─────────────────────

const SCRYPT_KEYLEN = 32;
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 } as const;

/** hashPassword → 'scrypt$<salt_hex>$<hash_hex>' */
function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN, SCRYPT_PARAMS);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

/** verifyPassword — timing-safe comparison against the stored digest. */
function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1], 'hex');
  const expected = Buffer.from(parts[2], 'hex');
  if (salt.length === 0 || expected.length === 0) return false;
  const actual = crypto.scryptSync(password, salt, expected.length, SCRYPT_PARAMS);
  return crypto.timingSafeEqual(actual, expected);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LEN = 8;

interface EmailAuthBody {
  email?: unknown;
  password?: unknown;
  name?: unknown;
}

/** Validate {email, password} shape; returns an error string or null. */
function validateCredentials(body: EmailAuthBody, { requirePassword = true } = {}): string | null {
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  if (!email || !EMAIL_RE.test(email) || email.length > 254) {
    return 'Valid email required';
  }
  if (requirePassword) {
    const password = typeof body.password === 'string' ? body.password : '';
    if (password.length < MIN_PASSWORD_LEN) {
      return `Password must be at least ${MIN_PASSWORD_LEN} characters`;
    }
    if (password.length > 256) {
      return 'Password too long';
    }
  }
  return null;
}

// ── POST /api/auth/guest ──────────────────────────────────────────────────────

router.post('/guest', (_req: Request, res: Response) => {
  try {
    const rawToken = randomHex(32);
    const tokenHash = sha256(rawToken);
    const expiresAt = new Date(Date.now() + GUEST_SESSION_TTL_MS).toISOString();
    // 登录信息隔离批 — 每个 guest 会话一个独立 user_id（guest_<hex>），游客之间
    // 数据互不可见。旧数据里 address='guest' 的共享会话仍可用（映射同一用户行）。
    const guestId = `guest_${randomHex(12)}`;
    createSession(tokenHash, guestId, 'guest', expiresAt);
    const user = ensureUser({ user_id: guestId, auth_type: 'guest', display_name: 'Guest' });

    res.json({
      token: rawToken,
      user: {
        address: 'guest',
        user_id: user.user_id,
        display_name: 'Guest',
        auth_type: 'guest',
        role: user.role,
      },
    });
  } catch (err) {
    console.error('[auth] guest error:', err);
    res.status(500).json({ error: 'Failed to create guest session' });
  }
});

// ── GET /api/auth/nonce?address=0x... ────────────────────────────────────────

router.get('/nonce', (req: Request, res: Response) => {
  const { address } = req.query as { address?: string };
  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return res.status(400).json({ error: 'Valid address query param required (0x + 40 hex chars)' });
  }

  try {
    const nonce = randomHex(16);
    const expiresAt = new Date(Date.now() + NONCE_TTL_MS).toISOString();
    createNonce(address, nonce, expiresAt);
    res.json({ nonce });
  } catch (err) {
    console.error('[auth] nonce error:', err);
    res.status(500).json({ error: 'Failed to generate nonce' });
  }
});

// ── POST /api/auth/verify ─────────────────────────────────────────────────────

interface VerifyBody {
  address: string;
  message: string;
  signature: string;
}

router.post('/verify', async (req: Request, res: Response) => {
  const { address, message, signature } = req.body as VerifyBody;

  if (!address || !message || !signature) {
    return res.status(400).json({ error: 'address, message, signature required' });
  }

  // 1. Recover signer address using ethers v6
  let recovered: string;
  try {
    recovered = ethers.verifyMessage(message, signature);
  } catch (err) {
    return res.status(400).json({ error: 'Invalid signature format' });
  }

  // 2. Compare recovered address with claimed address (case-insensitive)
  if (recovered.toLowerCase() !== address.toLowerCase()) {
    return res.status(401).json({ error: 'Signature address mismatch' });
  }

  // 3. Extract nonce from the SIWE message and validate it
  //    SIWE messages embed: "Nonce: <hex>"
  const nonceMatch = message.match(/^Nonce:\s*(\S+)$/m);
  if (!nonceMatch) {
    return res.status(400).json({ error: 'Nonce not found in message' });
  }
  const nonce = nonceMatch[1];

  const nonceRow = getNonce(nonce);
  if (!nonceRow) {
    return res.status(401).json({ error: 'Nonce is invalid, expired, or already used' });
  }

  // 3b. Verify the nonce was issued for the same address being authenticated
  //     (prevents one address from reusing a nonce generated for a different address)
  if (nonceRow.address !== address.toLowerCase()) {
    return res.status(401).json({ error: 'Nonce address mismatch' });
  }

  // 4. Mark nonce as used
  useNonce(nonce);

  // 5. Upsert profile
  const did = `did:0g:${address.toLowerCase()}`;
  upsertProfile(address, did);

  // 6. Create session
  const rawToken = randomHex(32);
  const tokenHash = sha256(rawToken);
  const expiresAt = new Date(Date.now() + WALLET_SESSION_TTL_MS).toISOString();
  createSession(tokenHash, address, 'wallet', expiresAt);

  // 7. Return token + profile（users 表同步 upsert，带出 user_id/role 给前端）。
  const profile = getProfile(address);
  const user = ensureUser({
    user_id: address,
    auth_type: 'wallet',
    display_name: profile?.display_name ?? null,
  });
  res.json({
    token: rawToken,
    user: {
      address: address.toLowerCase(),
      user_id: user.user_id,
      did,
      display_name: profile?.display_name ?? null,
      auth_type: 'wallet',
      role: user.role,
    },
  });
});

// ── POST /api/auth/register (email + password) ───────────────────────────────

router.post('/register', (req: Request, res: Response) => {
  const body = (req.body ?? {}) as EmailAuthBody;
  const invalid = validateCredentials(body);
  if (invalid) {
    return res.status(400).json({ error: invalid });
  }
  const email = (body.email as string).trim().toLowerCase();
  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim().slice(0, 80) : null;

  if (getEmailUser(email)) {
    return res.status(409).json({ error: 'Email already registered' });
  }

  try {
    createEmailUser(email, hashPassword(body.password as string), name);
    const rawToken = randomHex(32);
    const expiresAt = new Date(Date.now() + EMAIL_SESSION_TTL_MS).toISOString();
    createSession(sha256(rawToken), email, 'email', expiresAt);
    // users 表同步 upsert（admin 引导：首个邮箱用户 / SF_ADMIN_EMAIL → admin）。
    const user = ensureUser({ user_id: email, auth_type: 'email', display_name: name });
    res.status(201).json({
      token: rawToken,
      user: {
        address: email,
        email,
        user_id: user.user_id,
        display_name: name,
        auth_type: 'email',
        role: user.role,
      },
    });
  } catch (err) {
    console.error('[auth] register error:', err);
    res.status(500).json({ error: 'Failed to register account' });
  }
});

// ── POST /api/auth/login (email + password) ──────────────────────────────────

router.post('/login', (req: Request, res: Response) => {
  const body = (req.body ?? {}) as EmailAuthBody;
  const invalid = validateCredentials(body);
  if (invalid) {
    return res.status(400).json({ error: invalid });
  }
  const email = (body.email as string).trim().toLowerCase();

  const user = getEmailUser(email);
  // Same error for unknown email and wrong password — no account enumeration.
  if (!user || !verifyPassword(body.password as string, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  try {
    const rawToken = randomHex(32);
    const expiresAt = new Date(Date.now() + EMAIL_SESSION_TTL_MS).toISOString();
    createSession(sha256(rawToken), email, 'email', expiresAt);
    const appUser = ensureUser({
      user_id: email,
      auth_type: 'email',
      display_name: user.display_name,
    });
    res.json({
      token: rawToken,
      user: {
        address: email,
        email,
        user_id: appUser.user_id,
        display_name: appUser.display_name,
        auth_type: 'email',
        role: appUser.role,
      },
    });
  } catch (err) {
    console.error('[auth] login error:', err);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// ── POST /api/auth/logout ────────────────────────────────────────────────────

router.post('/logout', (req: Request, res: Response) => {
  const rawToken = extractBearer(req);
  if (rawToken) {
    try {
      deleteSession(sha256(rawToken));
    } catch (err) {
      console.error('[auth] logout error:', err);
    }
  }
  res.status(204).send();
});

// ── POST /api/auth/profile { display_name } ──────────────────────────────────
// Self-service display-name edit for both wallet and email accounts.

router.post('/profile', (req: Request, res: Response) => {
  const rawToken = extractBearer(req);
  if (!rawToken) {
    return res.status(401).json({ error: 'Authorization: Bearer <token> required' });
  }
  const session = getSessionByTokenHash(sha256(rawToken));
  if (!session) {
    return res.status(401).json({ error: 'Invalid or expired session token' });
  }
  const body = (req.body ?? {}) as { display_name?: unknown };
  const displayName = typeof body.display_name === 'string' ? body.display_name.trim().slice(0, 80) : '';
  if (!displayName) {
    return res.status(400).json({ error: 'display_name required' });
  }

  try {
    if (session.auth_type === 'email') {
      updateEmailUserDisplayName(session.address, displayName);
    } else if (session.auth_type === 'wallet') {
      upsertProfile(session.address, `did:0g:${session.address}`, displayName);
    } else {
      return res.status(400).json({ error: 'Guest sessions have no profile' });
    }
    res.json({ ok: true, display_name: displayName });
  } catch (err) {
    console.error('[auth] profile error:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// ── POST /api/auth/subscribe { email, name?, source?, note? } ────────────────
// Landing-page lead capture (订阅产品进展 / 申请内测 / 预约演示 / 申请套餐).
// Idempotent per submit; no account is created here — the success UI links to
// registration so the same email can become a real account.

router.post('/subscribe', (req: Request, res: Response) => {
  const body = (req.body ?? {}) as {
    email?: unknown;
    name?: unknown;
    source?: unknown;
    note?: unknown;
  };
  const email = typeof body.email === 'string' ? body.email.trim() : '';
  if (!email || !EMAIL_RE.test(email) || email.length > 254) {
    return res.status(400).json({ error: 'Valid email required' });
  }
  const source = typeof body.source === 'string' ? body.source.trim().slice(0, 40) : null;
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 80) : null;
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 2000) : null;

  try {
    const lead = addLead(email, { name, source, note });
    res.json({ ok: true, lead_id: lead.id });
  } catch (err) {
    console.error('[auth] subscribe error:', err);
    res.status(500).json({ error: 'Failed to save subscription' });
  }
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────────

router.get('/me', (req: Request, res: Response) => {
  const rawToken = extractBearer(req);
  if (!rawToken) {
    return res.status(401).json({ error: 'Authorization: Bearer <token> required' });
  }

  const tokenHash = sha256(rawToken);
  const session = getSessionByTokenHash(tokenHash);
  if (!session) {
    return res.status(401).json({ error: 'Invalid or expired session token' });
  }

  // Guest sessions have no profile row
  if (session.auth_type === 'guest') {
    const appUser = ensureUser({ user_id: session.address, auth_type: 'guest', display_name: 'Guest' });
    return res.json({
      address: 'guest',
      user_id: appUser.user_id,
      display_name: 'Guest',
      auth_type: 'guest',
      role: appUser.role,
    });
  }

  // Email + password accounts live in auth_email_users
  if (session.auth_type === 'email') {
    const user = getEmailUser(session.address);
    if (!user) {
      return res.status(401).json({ error: 'Profile not found' });
    }
    const appUser = ensureUser({
      user_id: session.address,
      auth_type: 'email',
      display_name: user.display_name,
    });
    return res.json({
      address: user.email,
      email: user.email,
      user_id: appUser.user_id,
      display_name: user.display_name,
      auth_type: 'email',
      role: appUser.role,
    });
  }

  const profile = getProfile(session.address);
  if (!profile) {
    // Session exists but profile was deleted — treat as expired
    return res.status(401).json({ error: 'Profile not found' });
  }
  const appUser = ensureUser({
    user_id: session.address,
    auth_type: 'wallet',
    display_name: profile.display_name,
  });

  res.json({
    address: profile.address,
    did: profile.did,
    user_id: appUser.user_id,
    display_name: profile.display_name,
    auth_type: 'wallet',
    role: appUser.role,
  });
});

export default router;
