/**
 * FB-HiFi · Templates tab — gallery grid + detail / lineage panel
 * Derived from design handoff: fb-tab-templates.jsx
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle as TabTemplatesAlert } from '../../common/icons/iconRegistry';
import { FBAv, FBIcons } from './FBAtoms';
import { importCustomTemplate, TemplateApiError } from '../../api/templates';
import { createTeam, TeamApiError } from '../../api/teams';
import { listAgents } from '../../api/agents';

interface TabTemplatesProps {
  onNavigateToTeams?: () => void;
}

const TPL_DATA = [
  { g: '◆', name: 'Solo Company',   tag: '独立公司', alias: 'solo-company',   desc: 'CEO·CMO·CFO·Eng — 5 人小公司', x: 5, current: false, color: '#A855F7', cid: '0x9a…41' },
  { g: '◇', name: 'Academic Paper', tag: '论文',     alias: 'academic-paper', desc: 'Reader·Critic·Cite·Writer·Reviewer', x: 5, current: true, color: '#22D3EE', cid: '0x3f…91' },
  { g: '◈', name: 'Newsroom',       tag: '编辑部',   alias: 'newsroom',       desc: 'Pitch·Reporter·Editor·FactCheck', x: 4, current: false, color: '#F59E0B', cid: '0x77…a2' },
  { g: '⬢', name: 'Modern Startup', tag: '初创团队', alias: 'modern-startup', desc: 'PM·Eng·Designer·Growth', x: 4, current: false, color: '#10B981', cid: '0x12…fc' },
  { g: '☷', name: 'Ming Cabinet',   tag: '内阁',     alias: 'ming-cabinet',   desc: '六部并行·首辅决策·言官弹劾', x: 6, current: false, color: '#EF4444', cid: '0x4e…3b' },
  { g: '□', name: 'Blank',          tag: '空白',     alias: 'blank',          desc: '从零搭一个 team', x: 0, current: false, color: '#71717A' },
];

export function TabTemplates({ onNavigateToTeams }: TabTemplatesProps = {}) {
  const navigate = useNavigate();
  const [importOpen, setImportOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [dagPreviewOpen, setDagPreviewOpen] = useState(false);
  const [forkBusy, setForkBusy] = useState(false);
  const [forkErr, setForkErr] = useState<string | null>(null);

  const forkTemplateToTeam = async (alias: string, name: string) => {
    setForkBusy(true);
    setForkErr(null);
    try {
      // Pick first N agents from current workspace as roster placeholder
      const agents = await listAgents();
      const agentIds = agents.slice(0, 5).map(a => a.agent_id);
      await createTeam({
        name: `${name} · fork`,
        description: `从模板 ${alias} fork — ${new Date().toISOString().slice(0, 10)}`,
        agent_ids: agentIds,
      });
      onNavigateToTeams?.();
    } catch (e) {
      const msg = e instanceof TeamApiError ? `${e.code}: ${e.message}` : (e instanceof Error ? e.message : String(e));
      setForkErr(msg);
    } finally {
      setForkBusy(false);
    }
  };

  const handleUseTemplate = (alias: string, name: string) => {
    void forkTemplateToTeam(alias, name);
  };

  const handleFork = () => {
    void forkTemplateToTeam('academic-paper', 'Academic Paper');
  };

  return (
    <>
      {/* ── Gallery ────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: 'var(--t-bg)' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--t-border)', display: 'flex', alignItems: 'center', gap: 10, background: 'var(--skin-panel)' }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em' }}>Templates · 模板</span>
              <span style={{
                fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '0.05em',
                padding: '1px 6px', borderRadius: 4, border: '1px solid var(--t-border)',
                background: 'var(--t-panel)', color: 'var(--t-fg-4)',
              }}>6 seed · 24 community</span>
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--t-fg-4)', marginTop: 3 }}>
              模板 = 整套 (agents + team + DAG + Policy) · 一键 fork 出新实例
            </div>
          </div>
          <div className="fb-input" style={{ width: 240 }}>
            <span className="x-icon" style={{ width: 14, height: 14, display: 'flex' }}>{FBIcons.search}</span>
            <span style={{ color: 'var(--t-fg-4)' }}>搜模板 / 粘贴 0G CID</span>
          </div>
          <button className="fb-btn fb-btn-ghost" style={{ fontSize: 12 }} onClick={() => setImportOpen(true)}>从 CID 导入</button>
          <button className="fb-btn fb-btn-primary" style={{ display: 'flex', gap: 5, alignItems: 'center', fontSize: 12 }} onClick={() => setPublishOpen(true)}>
            <span style={{ width: 13, height: 13, display: 'flex' }}>{FBIcons.plus}</span> 发布我的
          </button>
        </div>

        {/* sub-tabs */}
        <div style={{ padding: '10px 20px 0', display: 'flex', gap: 8 }}>
          {[{ l: '内置 6', on: true }, { l: '社区 24' }, { l: '我的 fork 3' }, { l: '最近用过' }].map((t, i) => (
            <span key={i} className="fb-pill" style={{
              color: t.on ? 'var(--t-accent-bright)' : 'var(--t-fg-3)',
              background: t.on ? 'var(--t-accent-tint)' : 'var(--t-panel)',
              borderColor: t.on ? 'color-mix(in oklab, var(--t-accent) 35%, transparent)' : 'var(--t-border)',
              padding: '4px 10px', cursor: 'pointer',
            }}>{t.l}</span>
          ))}
        </div>

        {/* grid */}
        <div style={{ padding: '16px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, overflow: 'hidden' }}>
          {TPL_DATA.map((t, i) => (
            <div key={i} className="fb-card" style={{
              padding: 14, position: 'relative',
              background: t.current ? 'color-mix(in oklab, var(--t-accent) 8%, var(--skin-panel))' : 'var(--skin-panel)',
              borderColor: t.current ? 'color-mix(in oklab, var(--t-accent) 50%, transparent)' : 'var(--t-border)',
              boxShadow: t.current ? 'var(--glow-accent)' : 'none',
            }}>
              {t.current && (
                <span style={{ position: 'absolute', top: -9, left: 14, padding: '2px 8px', background: 'var(--t-accent)', color: 'var(--t-accent-ink)', borderRadius: 4, fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 800, letterSpacing: '0.08em' }}>当前 · IN USE</span>
              )}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{
                  width: 42, height: 42, borderRadius: 10,
                  background: `color-mix(in oklab, ${t.color} 15%, var(--t-panel))`,
                  border: `1px solid color-mix(in oklab, ${t.color} 35%, transparent)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 20, color: t.color,
                }}>{t.g}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em' }}>{t.name}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--t-fg-4)', marginTop: 2 }}>{t.tag} · ×{t.x} agents</div>
                </div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--t-fg-2)', marginTop: 10, minHeight: 36, lineHeight: 1.5 }}>{t.desc}</div>

              {/* mini-DAG preview */}
              <div style={{ marginTop: 8, padding: '10px', background: 'var(--t-panel)', border: '1px solid var(--t-border)', borderRadius: 8, height: 62, position: 'relative', overflow: 'hidden' }}>
                <svg width="100%" height="100%" viewBox="0 0 240 42" preserveAspectRatio="xMidYMid meet">
                  <line x1="20" y1="21" x2="60" y2="21" stroke="var(--t-fg-5)" strokeWidth="1" />
                  <line x1="80" y1="21" x2="120" y2="10" stroke="var(--t-fg-5)" strokeWidth="1" />
                  <line x1="80" y1="21" x2="120" y2="32" stroke="var(--t-fg-5)" strokeWidth="1" />
                  <line x1="140" y1="10" x2="180" y2="21" stroke="var(--t-fg-5)" strokeWidth="1" />
                  <line x1="140" y1="32" x2="180" y2="21" stroke="var(--t-fg-5)" strokeWidth="1" />
                  <line x1="200" y1="21" x2="230" y2="21" stroke="var(--t-fg-5)" strokeWidth="1" />
                  {([20, 80, 130, 130, 190] as const).map((cx, j) => (
                    <circle key={j} cx={cx} cy={[21, 21, 10, 32, 21][j]} r="6"
                      fill="var(--t-panel)"
                      stroke={t.current ? 'var(--t-accent)' : t.color}
                      strokeWidth="1.4"
                    />
                  ))}
                </svg>
                <span style={{ position: 'absolute', right: 8, bottom: 6, fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--t-fg-4)' }}>policy · L2</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--t-fg-4)' }}>
                  {t.cid
                    ? <>cid <span style={{ color: 'var(--t-fg-2)' }}>{t.cid}</span></>
                    : 'local · unsaved'}
                </span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    className="fb-btn fb-btn-ghost"
                    style={{ fontSize: 11, padding: '3px 9px' }}
                    onClick={() => navigate(`/editor/${t.alias}`)}
                  >在编辑器中打开</button>
                  <button
                    className="fb-btn fb-btn-primary"
                    style={{ fontSize: 11, padding: '3px 9px', display: 'flex', gap: 4, alignItems: 'center' }}
                    disabled={t.current || forkBusy}
                    onClick={() => !t.current && handleUseTemplate(t.alias, t.name)}
                  >
                    {t.current ? '已使用' : (forkBusy ? '创建中…' : '用此模板')}
                    {!t.current && !forkBusy && <span style={{ width: 11, height: 11, display: 'flex' }}>{FBIcons.arrow}</span>}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Detail / lineage ───────────────────────────────────────── */}
      <div style={{ width: 340, borderLeft: '1px solid var(--t-border)', background: 'var(--t-panel)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ padding: '14px 16px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="fb-label">详情</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--t-fg-4)' }}>· academic-paper</span>
        </div>
        <div style={{ padding: '0 16px 8px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12,
            background: 'color-mix(in oklab, #22D3EE 15%, var(--t-panel))',
            border: '1px solid color-mix(in oklab, #22D3EE 35%, transparent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 24, color: '#22D3EE',
          }}>◇</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Academic Paper</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--t-fg-4)' }}>v3.1 · Ravenveil · MIT · 2026-04-12</div>
          </div>
        </div>

        <div style={{ padding: '8px 16px 12px' }}>
          <div style={{ fontSize: 12, color: 'var(--t-fg-2)', lineHeight: 1.55 }}>
            论文深读小队的官方蓝图。Reader 抓取，Critic 找漏，Cite-checker 核引用，Writer 重写，Reviewer 拒绝权把关。
          </div>
        </div>

        <div style={{ padding: '0 16px 8px' }}><span className="fb-label">包含</span></div>
        <div style={{ padding: '0 16px 12px', display: 'flex', flexDirection: 'column', gap: 5 }}>
          {[
            { g: '读', n: '读读 · Reader' },
            { g: '批', n: '阿批 · Critic' },
            { g: '查', n: '查查 · Cite-checker' },
            { g: '写', n: '小写 · Writer' },
            { g: '审', n: '审审 · Reviewer' },
          ].map((a, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'var(--t-panel)', border: '1px solid var(--t-border)', borderRadius: 6 }}>
              <FBAv glyph={a.g} color="#22D3EE" size={22} />
              <span style={{ fontSize: 11.5, color: 'var(--t-fg-2)' }}>{a.n}</span>
            </div>
          ))}
        </div>

        <div style={{ padding: '0 16px 8px' }}><span className="fb-label">0G 血统 · lineage</span></div>
        <div style={{ padding: '0 16px 12px', display: 'flex', flexDirection: 'column', gap: 0 }}>
          {[
            { v: 'v3.1', who: '你 · fork', t: '09:14', d: 'L2-strict + retry_gate 3', cur: true },
            { v: 'v3.0', who: '@kimchen',  t: '4d',    d: 'add cite-checker' },
            { v: 'v2.4', who: '@ravenveil',t: '2w',    d: '初版 5 角色' },
          ].map((l, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: i < 2 ? '1px solid var(--t-border)' : 'none' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 14 }}>
                <span style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: l.cur ? 'var(--t-accent)' : 'var(--t-fg-5)',
                  border: l.cur ? '2px solid color-mix(in oklab, var(--t-accent) 35%, transparent)' : 'none',
                  marginTop: 4,
                }} />
                {i < 2 && <span style={{ flex: 1, width: 1, background: 'var(--t-border)', marginTop: 4 }} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: l.cur ? 'var(--t-accent-bright)' : 'var(--t-fg-2)' }}>{l.v}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--t-fg-4)' }}>· {l.who}</span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--t-fg-5)', marginLeft: 'auto' }}>{l.t}</span>
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--t-fg-4)', marginTop: 2 }}>{l.d}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{ flex: 1 }} />
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--t-border)', display: 'flex', gap: 8 }}>
          <button className="fb-btn fb-btn-ghost" style={{ flex: 1, display: 'flex', gap: 5, alignItems: 'center', justifyContent: 'center', fontSize: 12 }} onClick={() => setDagPreviewOpen(true)}>
            <span style={{ width: 13, height: 13, display: 'flex' }}>{FBIcons.dag}</span> 看 DAG
          </button>
          <button
            className="fb-btn fb-btn-ghost"
            style={{ flex: 1, display: 'flex', gap: 5, alignItems: 'center', justifyContent: 'center', fontSize: 12 }}
            onClick={() => navigate('/editor/academic-paper')}
          >
            在编辑器中打开
          </button>
          <button className="fb-btn fb-btn-primary" style={{ flex: 1, display: 'flex', gap: 5, alignItems: 'center', justifyContent: 'center', fontSize: 12 }} onClick={handleFork}>
            fork 到 Teams <span style={{ width: 13, height: 13, display: 'flex' }}>{FBIcons.arrow}</span>
          </button>
        </div>
      </div>

      {importOpen && <ImportTemplateModal onClose={() => setImportOpen(false)} />}
      {publishOpen && <SimpleModal title="发布我的模板" hint="（开发中）选择当前 team，提交到 0G 后会获得 CID" placeholder="academic-paper-fork-v1" onClose={() => setPublishOpen(false)} />}
      {dagPreviewOpen && <DagPreviewModal onClose={() => setDagPreviewOpen(false)} />}

      {forkErr && (
        <div onClick={() => setForkErr(null)} style={{
          position: 'fixed', top: 70, left: '50%', transform: 'translateX(-50%)', zIndex: 200,
          padding: '8px 14px', borderRadius: 8, background: 'var(--status-reject)', color: 'white',
          fontSize: 11.5, fontWeight: 600, boxShadow: 'var(--shadow-pop)', cursor: 'pointer',
        }}>fork 失败: {forkErr} (点击关闭)</div>
      )}
    </>
  );
}

function ImportTemplateModal({ onClose }: { onClose: () => void }) {
  const [yamlText, setYamlText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleImport = async () => {
    const text = yamlText.trim();
    if (!text) { setError('请粘贴 YAML 内容或 CID'); return; }
    setBusy(true);
    setError(null);
    try {
      // For now accept raw YAML; CID resolution would need extra endpoint
      await importCustomTemplate({ yaml_text: text });
      onClose();
    } catch (e) {
      const msg = e instanceof TemplateApiError
        ? `导入失败 (${e.status}): ${typeof e.detail === 'string' ? e.detail : JSON.stringify(e.detail).slice(0, 200)}`
        : (e instanceof Error ? e.message : '导入失败');
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div onClick={() => !busy && onClose()} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 540, background: 'var(--skin-panel)', border: '1px solid var(--t-border)',
        borderRadius: 10, padding: 20, boxShadow: 'var(--shadow-pop)',
      }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>从 0G CID 导入模板</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--t-fg-4)', marginBottom: 12 }}>
          POST /templates/custom · 粘贴模板 YAML 内容
        </div>
        <textarea
          autoFocus
          value={yamlText}
          onChange={e => { setYamlText(e.target.value); setError(null); }}
          placeholder={'template_id: my-template\nname: 我的模板\nuser_role: explorer\n...'}
          rows={10}
          disabled={busy}
          style={{
            width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 6,
            border: `1px solid ${error ? 'var(--status-reject)' : 'var(--t-border)'}`,
            background: 'var(--t-panel)',
            color: 'var(--t-fg)', fontSize: 11.5, fontFamily: 'var(--font-mono)', outline: 'none', resize: 'vertical',
          }}
        />
        {error && (
          <div style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--status-reject)' }}>
            <TabTemplatesAlert size={11} strokeWidth={2} /> {error}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
          <button className="fb-btn fb-btn-ghost" onClick={onClose} disabled={busy} style={{ fontSize: 11 }}>取消</button>
          <button className="fb-btn fb-btn-primary" onClick={handleImport} disabled={busy || !yamlText.trim()} style={{ fontSize: 11 }}>
            {busy ? '导入中…' : '导入'}
          </button>
        </div>
      </div>
    </div>
  );
}

function SimpleModal({ title, hint, placeholder, onClose }: { title: string; hint: string; placeholder: string; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 420, background: 'var(--skin-panel)', border: '1px solid var(--t-border)',
        borderRadius: 10, padding: 20, boxShadow: 'var(--shadow-pop)',
      }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>{title}</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--t-fg-4)', marginBottom: 12 }}>{hint}</div>
        <input autoFocus placeholder={placeholder} style={{
          width: '100%', padding: '8px 10px', borderRadius: 6,
          border: '1px solid var(--t-border)', background: 'var(--t-panel)',
          color: 'var(--t-fg)', fontSize: 12, fontFamily: 'var(--font-mono)', outline: 'none', boxSizing: 'border-box',
        }} />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14 }}>
          <button className="fb-btn fb-btn-ghost" onClick={onClose} style={{ fontSize: 11 }}>取消</button>
          <button className="fb-btn fb-btn-primary" onClick={onClose} style={{ fontSize: 11 }}>确认</button>
        </div>
      </div>
    </div>
  );
}

function DagPreviewModal({ onClose }: { onClose: () => void }) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: 640, height: 420, background: 'var(--skin-panel)', border: '1px solid var(--t-border)',
        borderRadius: 10, padding: 18, boxShadow: 'var(--shadow-pop)', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>DAG 预览 · academic-paper</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--t-fg-4)' }}>v3.1 · 5 nodes</span>
          <span style={{ flex: 1 }} />
          <span onClick={onClose} style={{ cursor: 'pointer', color: 'var(--t-fg-4)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>ESC</span>
        </div>
        <div style={{ flex: 1, background: 'var(--t-panel)', border: '1px solid var(--t-border)', borderRadius: 8, padding: 18, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--t-fg-3)', lineHeight: 1.7 }}>
          <div>▶ Start → 读读 (reader · L1)</div>
          <div style={{ marginLeft: 16 }}>↓ ok · 320ms</div>
          <div>读读 → 阿批 (critic · L2)  ‖  查查 (cite · L1)</div>
          <div style={{ marginLeft: 16 }}>↓ 3 issues · 47/47 ✓</div>
          <div>阿批 ‖ 查查 → 小写 (writer · L3 · gate · retry 3)</div>
          <div style={{ marginLeft: 16, color: 'var(--t-accent)' }}>↻ retry 2/3 · running</div>
          <div>小写 → 审审 (reviewer · L3 · approval)</div>
          <div>审审 → ◆ Publish (on-chain)</div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
          <button className="fb-btn fb-btn-ghost" onClick={onClose} style={{ fontSize: 11 }}>关闭</button>
        </div>
      </div>
    </div>
  );
}
