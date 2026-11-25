/**
 * 个人资料：真实登录账号（登录态）+ 署名/邮箱/单位/时区。
 * 输入框失焦即保存；账号区显示当前登录用户并可退出登录。
 */
import { useEffect, useState } from 'react';
import { ACCOUNT, SETTINGS_COPY } from '@/shared/content/settings';
import { AgentAvatar, AVATAR_SIZE } from '@/shared/ui/avatar';
import { authLogout, displayNameOf, useAuthState } from '@/shared/data/http/auth';
import { Field, Row, Select } from '@/app/settings/primitives';
import type { SectionProps } from '@/app/settings/types';

const C = SETTINGS_COPY.profile;

export function ProfileSection({ settings, onPatch, onLoggedOut }: SectionProps) {
  const { profile } = settings;
  const [draft, setDraft] = useState(profile);
  const auth = useAuthState();
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => setDraft(profile), [profile]);

  const commit = (patch: Partial<typeof profile>) =>
    onPatch({ profile: { ...profile, ...patch } });

  const user = auth.user;
  const accountName = user ? displayNameOf(user) : ACCOUNT.notSignedIn;
  const accountMeta = user
    ? user.auth_type === 'guest'
      ? ACCOUNT.guest
      : user.email || user.address
    : '';

  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await authLogout();
      onLoggedOut?.();
    } finally {
      setSigningOut(false);
    }
  }

  return (
    <div className="st-stack">
      {/* 真实登录账号 */}
      <div className="st-account">
        <AgentAvatar label={accountName} size={AVATAR_SIZE.xl} status={false} />
        <div className="st-account-text">
          <span className="st-account-kicker">{ACCOUNT.title}</span>
          <b>{accountName}</b>
          {accountMeta ? <span className="st-account-meta">{accountMeta}</span> : null}
        </div>
        {user ? (
          <button
            type="button"
            className="st-account-btn"
            disabled={signingOut}
            onClick={() => void handleSignOut()}
          >
            {signingOut ? ACCOUNT.signingOut : ACCOUNT.signOut}
          </button>
        ) : null}
      </div>

      {user?.auth_type === 'guest' ? (
        <p className="st-account-note">{ACCOUNT.guestNote}</p>
      ) : null}

      <div className="st-profile">
        <AgentAvatar label={draft.name} size={AVATAR_SIZE.xl} status={false} />
        <div className="st-profile-text">
          <b>{draft.name || C.name}</b>
          <span>{draft.org || C.org}</span>
        </div>
        <span className="st-hint">{C.avatarNote}</span>
      </div>

      <Row label={C.name} note={C.nameHint}>
        <Field
          label={C.name}
          value={draft.name}
          onChange={(name) => setDraft({ ...draft, name })}
          onBlur={() => commit({ name: draft.name })}
        />
      </Row>

      <Row label={C.email} note={C.emailHint}>
        <Field
          label={C.email}
          type="email"
          value={draft.email}
          onChange={(email) => setDraft({ ...draft, email })}
          onBlur={() => commit({ email: draft.email })}
        />
      </Row>

      <Row label={C.org} note={C.orgHint}>
        <Field
          label={C.org}
          value={draft.org}
          onChange={(org) => setDraft({ ...draft, org })}
          onBlur={() => commit({ org: draft.org })}
        />
      </Row>

      <Row label={C.tz} note={C.tzHint}>
        <Select
          label={C.tz}
          value={profile.timezone}
          options={C.tzOptions}
          onChange={(timezone) => commit({ timezone })}
        />
      </Row>
    </div>
  );
}
