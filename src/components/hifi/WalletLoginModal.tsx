/**
 * WalletLoginModal — SIWE wallet authentication modal.
 *
 * Supports:
 *   1. Guest login  — no wallet needed
 *   2. MetaMask / injected window.ethereum via ethers v6 BrowserProvider
 *
 * WalletConnect would need the @walletconnect packages which are browser-heavy;
 * that integration is flagged as a follow-up. The modal shows a clear note.
 *
 * Usage:
 *   <WalletLoginModal open={open} onClose={() => setOpen(false)} />
 */

import { useState } from 'react';
import { X, Wallet, User } from 'lucide-react';
import { useAuth } from '../../core/auth/AuthContext';

interface WalletLoginModalProps {
  open?: boolean;
  onClose: () => void;
}

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ethereum?: any;
  }
}

export function WalletLoginModal({ open, onClose }: WalletLoginModalProps) {
  const { guestLogin, walletLogin, error } = useAuth();
  const [loading, setLoading] = useState<'guest' | 'wallet' | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  if (open === false) return null;

  async function handleGuest() {
    setLocalError(null);
    setLoading('guest');
    try {
      await guestLogin();
      onClose();
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : 'Guest login failed');
    } finally {
      setLoading(null);
    }
  }

  async function handleWallet() {
    setLocalError(null);
    if (!window.ethereum) {
      setLocalError('No wallet detected. Please install MetaMask or another injected wallet.');
      return;
    }
    setLoading('wallet');
    try {
      // ethers v6 BrowserProvider — dynamically imported to avoid SSR issues
      const { ethers } = await import('ethers');
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      await walletLogin(signer);
      onClose();
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : 'Wallet login failed');
    } finally {
      setLoading(null);
    }
  }

  const displayError = localError ?? error;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: 'var(--t-panel)',
          border: '1px solid var(--t-border)',
          borderRadius: 12,
          padding: '28px 32px',
          width: 380,
          maxWidth: '90vw',
          position: 'relative',
        }}
      >
        {/* Close */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 14,
            right: 14,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--t-fg-4)',
            padding: 4,
          }}
          aria-label="Close"
        >
          <X size={18} />
        </button>

        {/* Title */}
        <h2 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 600, color: 'var(--t-fg)' }}>
          Sign in to ShadowFlow
        </h2>
        <p style={{ margin: '0 0 24px', fontSize: 13, color: 'var(--t-fg-4)' }}>
          0G Chain (testnet · Chain ID 16600)
        </p>

        {/* Wallet button */}
        <button
          onClick={handleWallet}
          disabled={loading !== null}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            width: '100%',
            padding: '12px 16px',
            background: 'var(--t-accent, #7c3aed)',
            border: 'none',
            borderRadius: 8,
            color: '#fff',
            fontSize: 14,
            fontWeight: 500,
            cursor: loading !== null ? 'not-allowed' : 'pointer',
            opacity: loading !== null ? 0.7 : 1,
            marginBottom: 10,
          }}
        >
          <Wallet size={16} />
          {loading === 'wallet' ? 'Connecting…' : 'Connect Wallet (MetaMask)'}
        </button>

        {/* Guest button */}
        <button
          onClick={handleGuest}
          disabled={loading !== null}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            width: '100%',
            padding: '12px 16px',
            background: 'transparent',
            border: '1px solid var(--t-border)',
            borderRadius: 8,
            color: 'var(--t-fg-2)',
            fontSize: 14,
            fontWeight: 500,
            cursor: loading !== null ? 'not-allowed' : 'pointer',
            opacity: loading !== null ? 0.7 : 1,
          }}
        >
          <User size={16} />
          {loading === 'guest' ? 'Signing in…' : 'Continue as Guest'}
        </button>

        {/* WalletConnect note */}
        <p style={{ margin: '16px 0 0', fontSize: 12, color: 'var(--t-muted, #666)', textAlign: 'center' }}>
          WalletConnect support is a planned follow-up.
        </p>

        {/* Error */}
        {displayError && (
          <p
            style={{
              margin: '12px 0 0',
              padding: '8px 12px',
              background: 'rgba(220,38,38,0.1)',
              border: '1px solid rgba(220,38,38,0.3)',
              borderRadius: 6,
              fontSize: 13,
              color: '#f87171',
            }}
          >
            {displayError}
          </p>
        )}
      </div>
    </div>
  );
}
