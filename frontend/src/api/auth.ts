/**
 * src/api/auth.ts — Frontend auth API client for ShadowFlow SIWE + guest auth.
 *
 * Endpoints consumed:
 *   POST /api/auth/guest    — issue guest session
 *   GET  /api/auth/nonce    — get SIWE nonce for address
 *   POST /api/auth/verify   — verify SIWE signature
 *   GET  /api/auth/me       — validate token, return profile
 *
 * 0G Chain: Chain ID 16600, RPC https://evmrpc-testnet.0g.ai
 *
 * SIWE message format (EIP-4361 subset used by ShadowFlow):
 *   {domain} wants you to sign in with your Ethereum account:
 *   {address}
 *
 *   Sign in to ShadowFlow
 *
 *   URI: {origin}
 *   Version: 1
 *   Chain ID: 16600
 *   Nonce: {nonce}
 *   Issued At: {issuedAt}
 */

import { getApiBase } from './_base';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AuthUser {
  address: string;
  did?: string;
  display_name?: string | null;
  auth_type: 'wallet' | 'guest';
}

export interface AuthSession {
  token: string;
  user: AuthUser;
}

export interface UserProfile {
  address: string;
  did?: string;
  display_name?: string | null;
  bio?: string | null;
  type: 'wallet' | 'guest';
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function base(): string {
  return getApiBase();
}

async function post<T>(path: string, body: unknown, token?: string): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${base()}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

async function get<T>(path: string, token?: string): Promise<T> {
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${base()}${path}`, { headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ── Auth API functions ────────────────────────────────────────────────────────

/**
 * guestLogin — create a guest session (no wallet needed).
 */
export async function guestLogin(): Promise<AuthSession> {
  return post<AuthSession>('/api/auth/guest', {});
}

/**
 * fetchNonce — get a fresh SIWE nonce for the given wallet address.
 */
export async function fetchNonce(address: string): Promise<string> {
  const data = await get<{ nonce: string }>(`/api/auth/nonce?address=${encodeURIComponent(address)}`);
  return data.nonce;
}

/**
 * buildSiweMessage — construct the EIP-4361 compliant SIWE message string.
 * The backend extracts the Nonce field to validate the signature.
 *
 * Chain ID is always 16600 (0G Chain testnet).
 */
export function buildSiweMessage(params: {
  address: string;
  nonce: string;
  domain?: string;
  origin?: string;
}): string {
  const domain = params.domain ?? window.location.host;
  const origin = params.origin ?? window.location.origin;
  const issuedAt = new Date().toISOString();

  return [
    `${domain} wants you to sign in with your Ethereum account:`,
    params.address,
    '',
    'Sign in to ShadowFlow',
    '',
    `URI: ${origin}`,
    'Version: 1',
    'Chain ID: 16600',
    `Nonce: ${params.nonce}`,
    `Issued At: ${issuedAt}`,
  ].join('\n');
}

/**
 * verifySignature — send signed SIWE message to backend and obtain a session.
 */
export async function verifySignature(params: {
  address: string;
  message: string;
  signature: string;
}): Promise<AuthSession> {
  return post<AuthSession>('/api/auth/verify', params);
}

/**
 * getMe — validate a stored Bearer token and return the current user profile.
 * Throws if the token is invalid/expired.
 */
export async function getMe(token: string): Promise<AuthUser> {
  return get<AuthUser>('/api/auth/me', token);
}

export async function updateProfile(
  token: string,
  patch: { display_name?: string; bio?: string },
): Promise<UserProfile> {
  return post<UserProfile>('/api/auth/profile', patch, token);
}
