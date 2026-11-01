/**
 * src/core/auth/AuthContext.tsx — React context for SIWE + guest authentication.
 *
 * Flow:
 *   1. On mount: restore session from localStorage ('sf_auth_token').
 *      Call GET /api/auth/me to validate — clear if 401.
 *   2. guestLogin() → POST /api/auth/guest → store token.
 *   3. walletLogin(signer) → fetchNonce → buildSiweMessage → signer.signMessage
 *      → verifySignature → store token.
 *   4. logout() → remove token from localStorage, reset state.
 *
 * The signer parameter for walletLogin accepts any object with a
 * `signMessage(message: string): Promise<string>` method.
 * This is compatible with ethers v6 JsonRpcSigner, wagmi's WalletClient, etc.
 *
 * WalletConnect / injected wallet integration lives in the UI layer
 * (WalletLoginModal) — this context only cares about receiving a signer.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import {
  type AuthUser,
  type AuthSession,
  type UserProfile,
  guestLogin as apiGuestLogin,
  fetchNonce,
  buildSiweMessage,
  verifySignature,
  getMe,
} from '../../api/auth';

export type { UserProfile };

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Signer {
  getAddress(): Promise<string>;
  signMessage(message: string): Promise<string>;
}

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

function toUserProfile(u: AuthUser): UserProfile {
  return {
    address: u.address,
    did: u.did,
    display_name: u.display_name,
    bio: undefined,
    type: u.auth_type,
  };
}

export interface AuthContextValue {
  status: AuthStatus;
  user: UserProfile | null;
  token: string | null;
  /** Sign in as anonymous guest — no wallet needed. */
  guestLogin: () => Promise<void>;
  /** Sign in with an Ethereum wallet via SIWE. */
  walletLogin: (signer: Signer) => Promise<void>;
  /** Clear session and return to unauthenticated state. */
  logout: () => void;
  /** Error from last login attempt, if any. */
  error: string | null;
}

// ── Context ───────────────────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = 'sf_auth_token';

// ── Provider ──────────────────────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<UserProfile | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ── Restore session on mount ────────────────────────────────────────────────

  useEffect(() => {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (!stored) {
      setStatus('unauthenticated');
      return;
    }

    getMe(stored)
      .then((u) => {
        setUser(toUserProfile(u));
        setToken(stored);
        setStatus('authenticated');
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
        setStatus('unauthenticated');
      });
  }, []);

  // ── Session helpers ─────────────────────────────────────────────────────────

  function applySession(session: AuthSession) {
    localStorage.setItem(TOKEN_KEY, session.token);
    setToken(session.token);
    setUser(toUserProfile(session.user));
    setStatus('authenticated');
    setError(null);
  }

  // ── Guest login ─────────────────────────────────────────────────────────────

  const guestLogin = useCallback(async () => {
    setError(null);
    try {
      const session = await apiGuestLogin();
      applySession(session);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Guest login failed';
      setError(msg);
      throw e;
    }
  }, []);

  // ── Wallet login (SIWE) ─────────────────────────────────────────────────────

  const walletLogin = useCallback(async (signer: Signer) => {
    setError(null);
    try {
      const address = await signer.getAddress();
      const nonce = await fetchNonce(address);
      const message = buildSiweMessage({ address, nonce });
      const signature = await signer.signMessage(message);
      const session = await verifySignature({ address, message, signature });
      applySession(session);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Wallet login failed';
      setError(msg);
      throw e;
    }
  }, []);

  // ── Logout ──────────────────────────────────────────────────────────────────

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
    setToken(null);
    setStatus('unauthenticated');
    setError(null);
  }, []);

  return (
    <AuthContext.Provider value={{ status, user, token, guestLogin, walletLogin, logout, error }}>
      {children}
    </AuthContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}

export type { AuthUser, AuthSession };
