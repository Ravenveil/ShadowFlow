/**
 * 模型与密钥（BYOK）：
 * 每家供应商一行 —— 状态、默认模型、参与路由开关，Key 打码显示、点开才可改。
 * Key 的处理（打码 / 清除）在这里，因为它是「展示规则」不是数据形状。
 */
import { useState } from 'react';
import { SETTINGS_COPY } from '@/shared/content/settings';
import type { ProviderSetting } from '@/shared/data/types';
import { useFlash } from '@/app/settings/primitives';
import { Field, Row, Switch, Tag, Tile } from '@/app/settings/primitives';
import type { SectionProps } from '@/app/settings/types';

const C = SETTINGS_COPY.models;

const STATE_TONE = { ok: 'ok', idle: 'mute', error: 'danger' } as const;

/** 首字色块里放供应商首字母。 */
function initial(name: string) {
  return name.trim().slice(0, 1).toUpperCase();
}

/** 打码：保留头尾，中间固定 8 个点（避免从长度反推 Key）。 */
function mask(raw: string) {
  const clean = raw.trim();
  if (clean.length <= 6) return '••••••••';
  return `${clean.slice(0, 5)}••••••••${clean.slice(-3)}`;
}

export function ModelsSection({ settings, onPatch }: SectionProps) {
  const { providers } = settings;
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [flash, setFlash] = useFlash();

  const patchProvider = (id: string, patch: Partial<ProviderSetting>) =>
    onPatch({ providers: providers.map((p) => (p.id === id ? { ...p, ...patch } : p)) });

  const saveKey = (p: ProviderSetting) => {
    const key = draft.trim();
    if (!key) return;
    patchProvider(p.id, { key: mask(key), state: 'ok', on: true });
    setEditing(null);
    setDraft('');
    setFlash(C.keySaved);
  };

  return (
    <div className="st-stack">
      <div className="st-list">
        {providers.map((p) => {
          const open = editing === p.id;
          return (
            <div className="st-card" key={p.id} data-off={p.on ? undefined : 'true'}>
              <div className="st-card-head">
                <Tile tone={p.tone}>{initial(p.name)}</Tile>
                <div className="st-card-text">
                  <b>{p.name}</b>
                  <span>{p.vendor}</span>
                </div>
                <Tag tone={STATE_TONE[p.state]}>{C.state[p.state]}</Tag>
                <Switch
                  label={p.name}
                  on={p.on}
                  onChange={(on) => patchProvider(p.id, { on })}
                />
              </div>

              <div className="st-card-body">
                <Row label={C.defaultModel}>
                  <select
                    className="st-input st-input--sm"
                    aria-label={`${p.name} ${C.defaultModel}`}
                    value={p.defaultModel}
                    onChange={(e) => patchProvider(p.id, { defaultModel: e.target.value })}
                  >
                    {p.models.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </Row>

                <Row label="Key" note={p.key || C.noKey}>
                  {open ? (
                    <span className="st-inline">
                      <Field
                        label={`${p.name} Key`}
                        mono
                        placeholder={C.keyPlaceholder}
                        value={draft}
                        onChange={setDraft}
                      />
                      <button className="st-btn st-btn--solid" onClick={() => saveKey(p)}>
                        {C.replaceKey}
                      </button>
                    </span>
                  ) : (
                    <span className="st-inline">
                      <button
                        className="st-btn"
                        onClick={() => {
                          setEditing(p.id);
                          setDraft('');
                        }}
                      >
                        {p.key ? C.replaceKey : C.addKey}
                      </button>
                      {p.key ? (
                        <button
                          className="st-btn st-btn--ghost"
                          onClick={() => patchProvider(p.id, { key: '', state: 'idle', on: false })}
                        >
                          {C.clearKey}
                        </button>
                      ) : null}
                    </span>
                  )}
                </Row>
              </div>
            </div>
          );
        })}
      </div>

      <p className="st-hint">{C.routeNote}</p>
      {flash ? <p className="st-flash">{flash}</p> : null}
    </div>
  );
}
