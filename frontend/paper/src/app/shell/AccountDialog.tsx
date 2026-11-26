/**
 * AccountDialog — 工作台内账号入口（Rail 头像点开）。
 *
 * 用户定版（2026-11-25）：登录入口要在工作台里，头像在左、设置在右一行。
 * 未登录时提供邮箱登录/注册/游客；已登录时显示当前账号与退出。
 * 文案走 i18n 词典（account.*，中文兜底见 content/landing.ts 的 AUTH_MODAL 与 content/settings.ts 的 ACCOUNT）。
 */
import { useState, type FormEvent } from 'react';
import { useI18n } from '@/shared/i18n';
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

export function AccountDialog({ onClose }: { onClose: () => void }) {
  const { user } = useAuthState();
  const { t } = useI18n();
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
      setError(t('account.errorFallback'));
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
      setError(t('account.guestErrorFallback'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="lp-modal-mask" role="presentation" onMouseDown={onClose}>
      <div className="lp-modal lp-modal--auth" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
        <button className="lp-modal-close" onClick={onClose} aria-label={t('account.close')}>
          ×
        </button>

        {/* 游客不算真正登录：只有邮箱/钱包账号才显示「已登录」视图，游客态直接给登录表单。 */}
        {user && user.auth_type !== 'guest' ? (
          <>
            <div className="ac-identity">
              <AgentAvatar label={user.email || user.address || displayNameOf(user)} size="lg" status={false} />
              <div>
                <p className="lp-kicker">{t('account.signedInAs')}</p>
                <h2>{displayNameOf(user)}</h2>
                <p>{user.email || user.address}</p>
              </div>
            </div>
            <div className="ac-actions">
              <button className="lp-cta" onClick={onClose}>{t('account.welcome')}</button>
              <button
                className="lp-cta-outline"
                onClick={() => { void authLogout().finally(onClose); }}
              >
                {t('account.logout')}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="lp-kicker">{mode === 'register' ? t('account.registerKicker') : t('account.loginKicker')}</p>
            <h2>{mode === 'register' ? t('account.registerTitle') : t('account.loginTitle')}</h2>
            <p>{mode === 'register' ? t('account.registerBody') : t('account.loginBody')}</p>

            <div className="lp-auth-tabs" role="tablist">
              <button role="tab" aria-selected={mode === 'login'} data-on={mode === 'login' ? 'true' : undefined} onClick={() => setMode('login')}>
                {t('account.tabLogin')}
              </button>
              <button role="tab" aria-selected={mode === 'register'} data-on={mode === 'register' ? 'true' : undefined} onClick={() => setMode('register')}>
                {t('account.tabRegister')}
              </button>
            </div>

            {error ? <p className="lp-auth-error" role="alert">{error}</p> : null}
            <form onSubmit={(e) => void submit(e)}>
              {mode === 'register' ? (
                <label>
                  {t('account.nameLabel')}
                  <input name="name" placeholder={t('account.namePlaceholder')} />
                </label>
              ) : null}
              <label>
                {t('account.emailLabel')}
                <input name="email" required type="email" placeholder={t('account.emailPlaceholder')} autoComplete="email" />
              </label>
              <label>
                {t('account.passwordLabel')}
                <input
                  name="password"
                  required
                  type="password"
                  minLength={8}
                  placeholder={mode === 'register' ? t('account.passwordRegisterPlaceholder') : t('account.passwordLoginPlaceholder')}
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                />
              </label>
              <button className="lp-cta" type="submit" disabled={busy}>
                {busy ? t('account.busy') : mode === 'register' ? t('account.submitRegister') : t('account.submitLogin')}
              </button>
            </form>

            <div className="lp-auth-foot">
              <button onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
                {mode === 'login' ? t('account.switchToRegister') : t('account.switchToLogin')}
              </button>
              <button onClick={() => void guest()} disabled={busy}>{t('account.guest')}</button>
              <button onClick={onClose}>{t('account.skip')}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
