/** 个人资料：署名、邮箱、单位、时区。输入框失焦即保存。 */
import { useEffect, useState } from 'react';
import { SETTINGS_COPY } from '../../content/settings';
import { AgentAvatar, AVATAR_SIZE } from '../../avatar';
import { Field, Row, Select } from '../primitives';
import type { SectionProps } from '../types';

const C = SETTINGS_COPY.profile;

export function ProfileSection({ settings, onPatch }: SectionProps) {
  const { profile } = settings;
  const [draft, setDraft] = useState(profile);

  useEffect(() => setDraft(profile), [profile]);

  const commit = (patch: Partial<typeof profile>) =>
    onPatch({ profile: { ...profile, ...patch } });

  return (
    <div className="st-stack">
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
