/**
 * AboutSection → AccountSection
 * Shows current user profile, auth status, and basic app info.
 */
import { useAuth } from '../../auth/AuthContext';
import { useI18n } from '../../../common/i18n';
import { WalletLoginModal } from '../../../components/hifi/WalletLoginModal';
import { useState } from 'react';

function Avatar({ name, address, size = 64 }: { name?: string | null; address?: string | null; size?: number }) {
  const initials = name
    ? name.slice(0, 2).toUpperCase()
    : address
      ? address.slice(2, 4).toUpperCase()
      : 'SF';
  const hue = address
    ? parseInt(address.slice(2, 6), 16) % 360
    : 260;
  return (
    <div
      style={{
        width: size, height: size, borderRadius: size * 0.28,
        background: `hsl(${hue} 65% 22%)`,
        color: `hsl(${hue} 80% 75%)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size * 0.36, fontWeight: 700, flexShrink: 0,
        letterSpacing: '-0.03em', userSelect: 'none',
        border: `2px solid hsl(${hue} 50% 30%)`,
      }}
    >
      {initials}
    </div>
  );
}

function maskAddress(addr: string): string {
  if (addr.length < 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function AboutSection() {
  const { language } = useI18n();
  const T = (zh: string, en: string) => (language === 'zh' ? zh : en);
  const { status, user, logout } = useAuth();
  const [loginOpen, setLoginOpen] = useState(false);

  const isGuest = user?.type === 'guest' || (!user?.address && status === 'authenticated');
  const displayName = user?.display_name || (isGuest ? T('访客', 'Guest') : T('未登录', 'Not signed in'));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-[18px] font-bold text-sf-fg1">{T('账户', 'Account')}</h2>
        <p className="mt-1 text-[12px] text-sf-fg4">
          {T('当前会话与身份信息', 'Current session and identity')}
        </p>
      </div>

      {/* Profile card */}
      <div className="rounded-[12px] border border-sf-border bg-sf-elev2 p-5 flex items-center gap-4">
        <Avatar name={user?.display_name} address={user?.address} size={60} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[16px] font-bold text-sf-fg1 truncate">{displayName}</span>
            {status === 'authenticated' && (
              <span className={[
                'rounded-[5px] px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-[0.08em]',
                isGuest
                  ? 'bg-sf-elev3 text-sf-fg4'
                  : 'bg-sf-ok/15 text-sf-ok',
              ].join(' ')}>
                {isGuest ? T('访客', 'Guest') : T('钱包', 'Wallet')}
              </span>
            )}
            {status === 'loading' && (
              <span className="rounded-[5px] bg-sf-elev3 px-2 py-0.5 font-mono text-[10px] text-sf-fg5">
                {T('加载中…', 'Loading…')}
              </span>
            )}
            {status === 'unauthenticated' && (
              <span className="rounded-[5px] bg-sf-reject/15 px-2 py-0.5 font-mono text-[10px] font-bold text-sf-reject">
                {T('未登录', 'Signed out')}
              </span>
            )}
          </div>
          {user?.address && (
            <p className="mt-1 font-mono text-[11px] text-sf-fg4 truncate">
              {maskAddress(user.address)}
            </p>
          )}
          {user?.did && (
            <p className="mt-0.5 font-mono text-[10px] text-sf-fg5 truncate">{user.did}</p>
          )}
          {status === 'unauthenticated' && (
            <p className="mt-1 text-[12px] text-sf-fg5">
              {T('登录后可保存配置、发布 Team', 'Sign in to save settings and publish Teams')}
            </p>
          )}
        </div>

        {/* Action button */}
        <div className="flex-shrink-0">
          {status === 'authenticated' ? (
            <button
              type="button"
              onClick={logout}
              className="rounded-[8px] border border-sf-border px-4 py-2 text-[12px] font-semibold text-sf-fg3 hover:border-sf-reject/50 hover:text-sf-reject transition-colors"
            >
              {T('退出', 'Sign out')}
            </button>
          ) : status === 'unauthenticated' ? (
            <button
              type="button"
              onClick={() => setLoginOpen(true)}
              className="rounded-[8px] bg-sf-accent px-4 py-2 text-[12px] font-semibold text-white hover:bg-sf-accent-dim transition-colors"
            >
              {T('登录', 'Sign in')}
            </button>
          ) : null}
        </div>
      </div>

      {/* App info rows */}
      <div className="rounded-[10px] border border-sf-border bg-sf-elev2 overflow-hidden">
        {[
          [T('版本', 'Version'),  'v1.0.0'],
          [T('运行时', 'Runtime'), 'React 18 + Node 20'],
          [T('协议', 'Protocol'),  'ACP / MCP'],
        ].map(([label, value], i, arr) => (
          <div
            key={label}
            className={['flex items-center justify-between px-4 py-3', i < arr.length - 1 ? 'border-b border-sf-border' : ''].join(' ')}
          >
            <span className="text-[12px] text-sf-fg4">{label}</span>
            <span className="font-mono text-[12px] text-sf-fg2">{value}</span>
          </div>
        ))}
      </div>

      <p className="text-center font-mono text-[10px] text-sf-fg6">
        {T('由 Claude Code 构建 · Anthropic 提供支持', 'Built with Claude Code · Powered by Anthropic')}
      </p>

      <WalletLoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
    </div>
  );
}
