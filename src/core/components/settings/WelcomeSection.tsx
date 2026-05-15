/**
 * WelcomeSection — Settings › 账户 › 个人资料
 *
 * Shows real auth state: avatar, DID, display_name/bio/avatar_seed (editable).
 * When not authenticated → prompt to login.
 * Quick-start guide stays at the bottom for new users.
 */
import { useState } from 'react';
import { Bot, Users, Link2, Wrench, Waves, Edit3, Check, X, LockKeyhole } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import { WalletLoginModal } from '../../../components/hifi/WalletLoginModal';
import { updateProfile } from '../../../api/auth';
import type { UserProfile } from '../../../api/auth';

// ── Quick-start data (unchanged) ─────────────────────────────────────────────

interface Feature { Icon: LucideIcon; title: string; desc: string }
const FEATURES: Feature[] = [
  { Icon: Bot,    title: 'Agent 工厂',  desc: '以「招人」思路创建 Agent，name + soul 即可上岗' },
  { Icon: Users,  title: 'Team 协作',   desc: 'Policy Matrix 管理多 Agent 协作权限' },
  { Icon: Link2,  title: 'ACP 原生',    desc: '基于 ACP 协议，兼容所有主流 CLI Agent' },
  { Icon: Wrench, title: '工具集成',    desc: 'Composio + MCP 双轨，250+ 工具开箱即用' },
];

// ── Profile editor ────────────────────────────────────────────────────────────

interface ProfileFormProps {
  user: UserProfile;
  token: string;
  onSaved: (updated: UserProfile) => void;
}

function ProfileForm({ user, token, onSaved }: ProfileFormProps) {
  const [editing, setEditing] = useState(false);
  const [displayName, setDisplayName] = useState(user.display_name ?? '');
  const [bio, setBio] = useState(user.bio ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const updated = await updateProfile(token, {
        display_name: displayName.trim() || undefined,
        bio: bio.trim() || undefined,
      });
      onSaved(updated);
      setEditing(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setDisplayName(user.display_name ?? '');
    setBio(user.bio ?? '');
    setEditing(false);
    setError(null);
  }

  const glyph = user.display_name?.charAt(0).toUpperCase()
    ?? (user.type === 'wallet' ? user.address.slice(2, 4).toUpperCase() : 'G');
  const avatarBg = user.type === 'wallet' ? 'var(--t-accent)' : 'var(--t-fg-4)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Avatar row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          background: avatarBg, color: 'var(--t-bg)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: 800, fontSize: 22, flexShrink: 0,
        }}>
          {glyph}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {editing ? (
            <input
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="显示名称"
              maxLength={50}
              style={{
                width: '100%', padding: '6px 10px', borderRadius: 7,
                border: '1px solid var(--t-accent)', background: 'var(--t-bg)',
                color: 'var(--t-fg)', fontSize: 14, fontWeight: 600, outline: 'none',
              }}
            />
          ) : (
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--t-fg)' }}>
              {user.display_name || (user.type === 'guest' ? '访客' : user.address.slice(0, 6) + '…' + user.address.slice(-4))}
            </div>
          )}
          <div style={{ fontSize: 10, color: 'var(--t-fg-4)', fontFamily: 'var(--font-mono)', marginTop: 3 }}>
            {user.type === 'wallet' ? '● 钱包账户' : '● 访客模式'}
          </div>
        </div>
        {user.type === 'wallet' && !editing && (
          <button onClick={() => setEditing(true)} style={{ background: 'none', border: '1px solid var(--t-border)', borderRadius: 7, padding: '5px 9px', cursor: 'pointer', color: 'var(--t-fg-3)', display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
            <Edit3 size={12} strokeWidth={2} /> 编辑
          </button>
        )}
        {editing && (
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={handleSave} disabled={saving} style={{ background: 'var(--t-accent)', border: 'none', borderRadius: 7, padding: '5px 9px', cursor: 'pointer', color: 'var(--t-accent-ink)', display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
              <Check size={12} strokeWidth={2.5} /> {saving ? '保存中…' : '保存'}
            </button>
            <button onClick={handleCancel} style={{ background: 'none', border: '1px solid var(--t-border)', borderRadius: 7, padding: '5px 9px', cursor: 'pointer', color: 'var(--t-fg-3)', display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}>
              <X size={12} strokeWidth={2.5} /> 取消
            </button>
          </div>
        )}
      </div>

      {/* Bio */}
      {editing ? (
        <textarea
          value={bio}
          onChange={e => setBio(e.target.value)}
          placeholder="个人简介（选填）"
          maxLength={200}
          rows={2}
          style={{ width: '100%', padding: '8px 10px', borderRadius: 7, border: '1px solid var(--t-accent)', background: 'var(--t-bg)', color: 'var(--t-fg)', fontSize: 12, resize: 'none', outline: 'none', fontFamily: 'inherit' }}
        />
      ) : (
        user.bio && <p style={{ fontSize: 12, color: 'var(--t-fg-3)', margin: 0, lineHeight: 1.6 }}>{user.bio}</p>
      )}

      {error && <div style={{ fontSize: 11, color: 'var(--t-err)' }}>{error}</div>}
    </div>
  );
}

// ── DID + address info card ───────────────────────────────────────────────────

function IdentityCard({ user }: { user: UserProfile }) {
  const [copied, setCopied] = useState(false);

  function copyAddress() {
    if (user.type !== 'wallet') return;
    navigator.clipboard?.writeText(user.address).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (user.type === 'guest') {
    return (
      <div style={{ padding: '12px 14px', background: 'var(--t-panel)', border: '1px solid var(--t-border)', borderRadius: 10, fontSize: 12, color: 'var(--t-fg-4)', lineHeight: 1.6 }}>
        访客模式下暂无链上身份。连接钱包后将自动生成 <code style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>did:ethr:16600:0x…</code> DID。
      </div>
    );
  }

  const rows: Array<{ label: string; value: string; mono?: boolean; copyable?: boolean }> = [
    { label: 'DID',     value: user.did ?? '—',    mono: true },
    { label: '地址',    value: user.address,        mono: true, copyable: true },
    { label: '网络',    value: '0G Galileo Testnet · Chain 16600' },
    { label: '账户类型', value: 'Ethereum · EIP-4361 SIWE' },
  ];

  return (
    <div style={{ border: '1px solid var(--t-border)', borderRadius: 10, overflow: 'hidden' }}>
      {rows.map((r, i) => (
        <div key={r.label} style={{
          display: 'grid', gridTemplateColumns: '90px 1fr auto',
          padding: '9px 14px', alignItems: 'center', gap: 10,
          borderTop: i > 0 ? '1px solid var(--t-border)' : 'none',
          background: 'var(--t-panel)',
        }}>
          <span style={{ fontSize: 11, color: 'var(--t-fg-4)' }}>{r.label}</span>
          <span style={{ fontSize: r.mono ? 10 : 12, fontFamily: r.mono ? 'var(--font-mono)' : 'inherit', color: 'var(--t-fg-2)', wordBreak: 'break-all' }}>
            {r.value}
          </span>
          {r.copyable && (
            <button onClick={copyAddress} style={{ background: 'none', border: '1px solid var(--t-border)', borderRadius: 5, padding: '2px 7px', cursor: 'pointer', fontSize: 10, color: copied ? 'var(--t-ok)' : 'var(--t-fg-4)', whiteSpace: 'nowrap' }}>
              {copied ? '已复制' : '复制'}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Main section ──────────────────────────────────────────────────────────────

export function WelcomeSection() {
  const { user, token, status, guestLogin } = useAuth();
  const [showLogin, setShowLogin] = useState(false);

  // Local copy of user for optimistic profile updates
  const [localUser, setLocalUser] = useState<UserProfile | null>(null);
  const displayUser = localUser ?? user;

  const isLoading = status === 'loading';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 640 }}>
      {/* ── Profile block ── */}
      <div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700, letterSpacing: '.08em', color: 'var(--t-accent)', marginBottom: 6 }}>
          ACCOUNT · 个人资料
        </div>
        <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--t-fg)', marginBottom: 4, letterSpacing: '-.02em' }}>
          个人资料
        </div>
        <p style={{ fontSize: 12, color: 'var(--t-fg-4)', margin: 0 }}>
          管理你的身份、链上 DID 和公开信息。
        </p>
      </div>

      {isLoading ? (
        <div style={{ padding: '32px', textAlign: 'center', fontSize: 12, color: 'var(--t-fg-4)' }}>加载中…</div>
      ) : !displayUser ? (
        /* ── Not logged in ── */
        <div style={{ padding: '24px', background: 'var(--t-panel)', border: '1px solid var(--t-border)', borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center', textAlign: 'center' }}>
          <div style={{ display: 'inline-flex', padding: 12, borderRadius: 14, background: 'var(--t-panel)', border: '1px solid var(--t-border)' }}>
            <LockKeyhole size={28} strokeWidth={1.5} color="var(--t-fg-4)" />
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--t-fg)' }}>尚未登录</div>
          <p style={{ fontSize: 12, color: 'var(--t-fg-4)', margin: 0, maxWidth: 320 }}>
            连接钱包获得链上 DID 身份，或以访客身份体验平台。
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setShowLogin(true)} style={{ padding: '8px 18px', borderRadius: 8, background: 'var(--t-accent)', color: 'var(--t-accent-ink)', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
              连接钱包
            </button>
            <button onClick={() => void guestLogin()} style={{ padding: '8px 18px', borderRadius: 8, background: 'var(--t-panel-2)', color: 'var(--t-fg-2)', border: '1px solid var(--t-border)', cursor: 'pointer', fontSize: 13 }}>
              访客模式
            </button>
          </div>
        </div>
      ) : (
        /* ── Authenticated ── */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Profile editor */}
          <div style={{ padding: '16px', background: 'var(--t-panel)', border: '1px solid var(--t-border)', borderRadius: 12 }}>
            <ProfileForm
              user={displayUser}
              token={token ?? ''}
              onSaved={setLocalUser}
            />
          </div>

          {/* Identity card */}
          <div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--t-fg-4)', fontWeight: 700, letterSpacing: '.06em', marginBottom: 8 }}>
              链上身份 · ON-CHAIN IDENTITY
            </div>
            <IdentityCard user={displayUser} />
          </div>
        </div>
      )}

      {/* ── Quick-start guide (always shown) ── */}
      <div style={{ borderTop: '1px solid var(--t-border)', paddingTop: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 8, border: '1px solid var(--t-border)', background: 'var(--t-panel)' }}>
            <Waves size={14} strokeWidth={2} color="var(--t-fg-3)" />
          </span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--t-fg)' }}>快速上手</div>
            <div style={{ fontSize: 10, color: 'var(--t-fg-5)' }}>Agent Team 的 VS Code · ACP 时代的工作流平台</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {FEATURES.map(f => (
            <div key={f.title} style={{ padding: '12px 14px', background: 'var(--t-panel)', border: '1px solid var(--t-border)', borderRadius: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <f.Icon size={14} strokeWidth={2} color="var(--t-fg-3)" />
                <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--t-fg)' }}>{f.title}</span>
              </div>
              <p style={{ fontSize: 11, color: 'var(--t-fg-4)', margin: 0, lineHeight: 1.5 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {showLogin && <WalletLoginModal onClose={() => setShowLogin(false)} />}
    </div>
  );
}
