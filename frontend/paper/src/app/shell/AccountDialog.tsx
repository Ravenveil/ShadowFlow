/**
 * AccountDialog — 工作台内账号入口（Rail 头像点开）。
 *
 * 用户定版（2026-11-25）：登录入口要在工作台里，头像在左、设置在右一行。
 * 未登录时提供邮箱登录/注册/游客；已登录时显示当前账号与退出。
 * 所有可见文案走 content/landing.ts 的 AUTH_MODAL / content/app.ts 的 ACCOUNT。
 */
import { useState, type FormEvent } from 'react';
import { AgentAvatar } from '@/shared/ui/avatar';
import {
  authGuest,
  authLogin,
  authLogout,
  authRegister,
  displayNameOf,
  useAuthState,
  type AuthUser,
} from '@/shared/data/auth';
import { AUTH_MODAL } from '@/shared/content/landing';
import { ACCOUNT } from '@/shared/content/settings';

export function AccountDialog({ onClose }: { onClose: () => void }) {
  const { user } = useAuthState();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const email = String(data.get('email') ?? '').trim();
    const password = String(data.get('password') ?? '');
    const name = String(data.get('name') ?? '').trim();
    if (!email || !password) return;
    setBusy(true);
    setError(null);
    try {
      const next: AuthUser = mode === 'register'
        ? await authRegister(email, password, name || undefined)
        : await authLogin(email, password);
      if (next) onClose();
    } catch {
      setError(AUTH_MODAL.errorFallback);
    } finally {
      setBusy(false);
    }
  };

  const guest = async () => {
    setBusy(true);
    setError(null);
    try {
      await authGuest();
      onClose();
    } catch {
      setError(AUTH_MODAL.guestErrorFallback);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="lp-modal-mask" role="presentation" onMouseDown={onClose}>
      <div className="lp-modal lp-modal--auth" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
        <button className="lp-modal-close" onClick={onClose} aria-label={AUTH_MODAL.close}>
          ×
        </button>

        {/* 游客不算真正登录：只有邮箱/钱包账号才显示「已登录」视图，游客态直接给登录表单。 */}
        {user && user.auth_type !== 'guest' ? (
          <>
            <div className="ac-identity">
              <AgentAvatar label={user.email || user.address || displayNameOf(user)} size="lg" status={false} />
              <div>
                <p className="lp-kicker">{ACCOUNT.signedInAs}</p>
                <h2>{displayNameOf(user)}</h2>
                <p>{user.email || user.address}</p>
              </div>
            </div>
            <div className="ac-actions">
              <button className="lp-cta" onClick={onClose}>{AUTH_MODAL.doneCta}</button>
              <button
                className="lp-cta-outline"
                onClick={() => { void authLogout().finally(onClose); }}
              >
                {ACCOUNT.signOut}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="lp-kicker">{mode === 'register' ? AUTH_MODAL.registerKicker : AUTH_MODAL.loginKicker}</p>
            <h2>{mode === 'register' ? AUTH_MODAL.registerTitle : AUTH_MODAL.loginTitle}</h2>
            <p>{mode === 'register' ? AUTH_MODAL.registerBody : AUTH_MODAL.loginBody}</p>

            <div className="lp-auth-tabs" role="tablist">
              <button role="tab" aria-selected={mode === 'login'} data-on={mode === 'login' ? 'true' : undefined} onClick={() => setMode('login')}>
                {AUTH_MODAL.tabLogin}
              </button>
              <button role="tab" aria-selected={mode === 'register'} data-on={mode === 'register' ? 'true' : undefined} onClick={() => setMode('register')}>
                {AUTH_MODAL.tabRegister}
              </button>
            </div>

            {error ? <p className="lp-auth-error" role="alert">{error}</p> : null}
            <form onSubmit={(e) => void submit(e)}>
              {mode === 'register' ? (
                <label>
                  {AUTH_MODAL.nameLabel}
                  <input name="name" placeholder={AUTH_MODAL.namePlaceholder} />
                </label>
              ) : null}
              <label>
                {AUTH_MODAL.emailLabel}
                <input name="email" required type="email" placeholder={AUTH_MODAL.emailPlaceholder} autoComplete="email" />
              </label>
              <label>
                {AUTH_MODAL.passwordLabel}
                <input
                  name="password"
                  required
                  type="password"
                  minLength={8}
                  placeholder={mode === 'register' ? AUTH_MODAL.passwordRegisterPlaceholder : AUTH_MODAL.passwordLoginPlaceholder}
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                />
              </label>
              <button className="lp-cta" type="submit" disabled={busy}>
                {busy ? AUTH_MODAL.busy : mode === 'register' ? AUTH_MODAL.submitRegister : AUTH_MODAL.submitLogin}
              </button>
            </form>

            <div className="lp-auth-foot">
              <button onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
                {mode === 'login' ? AUTH_MODAL.switchToRegister : AUTH_MODAL.switchToLogin}
              </button>
              <button onClick={() => void guest()} disabled={busy}>{AUTH_MODAL.guest}</button>
              <button onClick={onClose}>{AUTH_MODAL.skip}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
