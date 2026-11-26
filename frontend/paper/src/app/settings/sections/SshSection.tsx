/**
 * 远程执行（SSH）：把实验派到远端 GPU 机器。
 *
 * 一行一台主机：名称 + user@host:port + 连通状态；展开可看私钥与远端目录，
 * 还能就地「测试连接」。新增主机走行内表单，不弹第二层对话框。
 */
import { useState } from 'react';
import {
  IconAlert,
  IconCheckCircle,
  IconCircleDashed,
  IconLoader,
  IconPlus,
  IconServer,
  IconTrash,
} from '@/shared/ui/icons';
import { SETTINGS_COPY } from '@/shared/content/settings';
import type { SshHost } from '@/shared/data/types';
import type { SshProbe } from '@/shared/data/source';
import { useFlash } from '@/app/settings/primitives';
import type { SectionProps } from '@/app/settings/types';

const C = SETTINGS_COPY.ssh;

const STATE = {
  ok: { icon: IconCheckCircle, tone: 'ok' },
  untested: { icon: IconCircleDashed, tone: 'mute' },
  error: { icon: IconAlert, tone: 'danger' },
} as const;

const blank = (): SshHost => ({
  id: `ssh-${Date.now()}`,
  name: '',
  host: '',
  user: '',
  port: 22,
  keyPath: '~/.ssh/id_ed25519',
  remoteDir: '~/runs',
  state: 'untested',
});

export function SshSection({
  settings,
  onPatch,
  onTest,
}: SectionProps & { onTest: (id: string) => Promise<SshProbe> }) {
  const { ssh } = settings;
  const [flash, setFlash] = useFlash(2600);
  const [busy, setBusy] = useState<string | null>(null);
  const [draft, setDraft] = useState<SshHost | null>(null);

  const test = async (h: SshHost) => {
    setBusy(h.id);
    try {
      const next = await onTest(h.id);
      // 连不上时后端回 ok:false 而不是报错：提示语要看探测结果，不能一律说「已连通」
      setFlash(next.state === 'ok' ? C.tested(h.name, next.latencyMs ?? 0) : C.failed(h.name));
    } catch {
      setFlash(C.failed(h.name));
    } finally {
      setBusy(null);
    }
  };

  const add = () => {
    if (!draft) return;
    if (!draft.host.trim() || !draft.user.trim()) {
      setFlash(C.needHost);
      return;
    }
    onPatch({ ssh: [...ssh, { ...draft, name: draft.name.trim() || draft.host }] });
    setFlash(C.added(draft.name || draft.host));
    setDraft(null);
  };

  const setField = (patch: Partial<SshHost>) => draft && setDraft({ ...draft, ...patch });

  return (
    <div className="st-stack">
      {ssh.length === 0 && !draft ? <p className="st-empty">{C.empty}</p> : null}

      <div className="st-list">
        {ssh.map((h) => {
          const meta = STATE[h.state];
          const Icon = meta.icon;
          const working = busy === h.id;
          return (
            <div className="st-card" key={h.id}>
              <div className="st-card-head">
                <span className="st-tile" data-tone={h.state === 'ok' ? 'teal' : 'slate'}>
                  <IconServer size={14} />
                </span>
                <div className="st-card-text">
                  <b>{h.name}</b>
                  <span className="st-mono">
                    {h.user}@{h.host}:{h.port}
                  </span>
                </div>
                <span className="st-state" data-tone={meta.tone}>
                  <Icon size={12} />
                  {C.state[h.state]}
                  {h.state === 'ok' && h.latencyMs ? ` · ${C.latency(h.latencyMs)}` : ''}
                </span>
                <button
                  className="st-btn"
                  onClick={() => void test(h)}
                  disabled={working}
                >
                  {working ? <IconLoader size={12} className="st-spin" /> : null}
                  {working ? C.testing : C.test}
                </button>
                <button
                  className="st-btn st-btn--ghost"
                  title={C.remove}
                  aria-label={`${C.remove} ${h.name}`}
                  onClick={() => onPatch({ ssh: ssh.filter((x) => x.id !== h.id) })}
                >
                  <IconTrash size={13} />
                </button>
              </div>

              <div className="st-card-body">
                <div className="st-pairs">
                  <span>
                    <i>{C.fields.key}</i>
                    <b className="st-mono">{h.keyPath}</b>
                  </span>
                  <span>
                    <i>{C.fields.dir}</i>
                    <b className="st-mono">{h.remoteDir}</b>
                  </span>
                  {h.gpu ? (
                    <span>
                      <i>GPU</i>
                      <b>{h.gpu}</b>
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {draft ? (
        <div className="st-form">
          <div className="st-form-title">{C.formTitle}</div>
          <div className="st-form-grid">
            <label>
              <span>{C.fields.name}</span>
              <input
                className="st-input"
                value={draft.name}
                placeholder={draft.host || C.fields.host}
                onChange={(e) => setField({ name: e.target.value })}
              />
            </label>
            <label>
              <span>{C.fields.host}</span>
              <input
                className="st-input"
                value={draft.host}
                onChange={(e) => setField({ host: e.target.value })}
              />
            </label>
            <label>
              <span>{C.fields.user}</span>
              <input
                className="st-input"
                value={draft.user}
                onChange={(e) => setField({ user: e.target.value })}
              />
            </label>
            <label>
              <span>{C.fields.port}</span>
              <input
                className="st-input"
                type="number"
                value={draft.port}
                onChange={(e) => setField({ port: Number(e.target.value) || 22 })}
              />
            </label>
            <label className="st-form-wide">
              <span>{C.fields.key}</span>
              <input
                className="st-input"
                value={draft.keyPath}
                onChange={(e) => setField({ keyPath: e.target.value })}
              />
            </label>
            <label className="st-form-wide">
              <span>{C.fields.dir}</span>
              <input
                className="st-input"
                value={draft.remoteDir}
                onChange={(e) => setField({ remoteDir: e.target.value })}
              />
            </label>
          </div>
          <p className="st-hint">{C.keyHint}</p>
          <div className="st-actions">
            <button className="st-btn st-btn--solid" onClick={add}>
              {C.save}
            </button>
            <button className="st-btn st-btn--ghost" onClick={() => setDraft(null)}>
              {C.cancel}
            </button>
            {flash ? <span className="st-flash">{flash}</span> : null}
          </div>
        </div>
      ) : (
        <div className="st-actions">
          <button className="st-btn" onClick={() => setDraft(blank())}>
            <IconPlus size={13} />
            {C.add}
          </button>
          {flash ? <span className="st-flash">{flash}</span> : null}
        </div>
      )}
    </div>
  );
}
