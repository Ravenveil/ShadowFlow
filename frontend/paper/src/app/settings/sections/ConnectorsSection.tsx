/** 连接器：外部数据源（Zotero / Overleaf / GitHub / MCP…）。开关即授权开关。 */
import { MCP_COPY } from '@/shared/content/mcp';
import { SETTINGS_COPY } from '@/shared/content/settings';
import type { ConnectorSetting } from '@/shared/data/types';
import { Switch, Tag, Tile, useFlash } from '@/app/settings/primitives';
import type { SectionProps } from '@/app/settings/types';

const C = SETTINGS_COPY.connectors;

const STATE_TONE = { ok: 'ok', expired: 'warn', off: 'mute' } as const;

export function ConnectorsSection({
  settings,
  onPatch,
  onOpenMcp,
}: SectionProps & { onOpenMcp: () => void }) {
  const { connectors } = settings;
  const [flash, setFlash] = useFlash();

  const patchConnector = (id: string, patch: Partial<ConnectorSetting>) =>
    onPatch({ connectors: connectors.map((c) => (c.id === id ? { ...c, ...patch } : c)) });

  const reauth = (c: ConnectorSetting) => {
    // 演示态直接置为已连接；真接口这里是打开授权页并等回调
    patchConnector(c.id, { on: true, state: 'ok' });
    setFlash(`${c.name} · ${C.state.ok}`);
  };

  return (
    <div className="st-stack">
      <div className="st-list">
        {connectors.map((c) => (
          <div className="st-card" key={c.id} data-off={c.on ? undefined : 'true'}>
            <div className="st-card-head">
              <Tile tone={c.tone}>{c.name.slice(0, 1).toUpperCase()}</Tile>
              <div className="st-card-text">
                <b>{c.name}</b>
                <span>{c.desc}</span>
              </div>
              <Tag tone={STATE_TONE[c.state]}>{C.state[c.state]}</Tag>
              {c.state === 'expired' ? (
                <button className="st-btn" onClick={() => reauth(c)}>
                  {C.reauth}
                </button>
              ) : (
                <Switch
                  label={c.name}
                  on={c.on}
                  onChange={(on) => patchConnector(c.id, { on, state: on ? 'ok' : 'off' })}
                />
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="st-actions">
        <button className="st-btn st-btn--solid" onClick={onOpenMcp}>
          {MCP_COPY.manageFromConnectors}
        </button>
        {flash ? <span className="st-flash">{flash}</span> : null}
      </div>
    </div>
  );
}
