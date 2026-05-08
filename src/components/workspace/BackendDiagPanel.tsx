/**
 * BackendDiagPanel — 临时连通诊断面板
 *
 * 30 分钟连通测试：验证前端 → ShadowFlow Python 后端（localhost:8000）真的通了。
 * 之后这个面板会被 SecretsModal + 真 Composer 接线替换。
 */

import { useState } from 'react';
import { Stethoscope } from '../../common/icons/iconRegistry';

type Result =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok'; data: unknown; ms: number; endpoint: string }
  | { kind: 'err'; msg: string; endpoint: string };

const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? 'http://127.0.0.1:8000';

async function ping(endpoint: string): Promise<Result> {
  const start = performance.now();
  try {
    const r = await fetch(`${API_BASE}${endpoint}`);
    const ms = Math.round(performance.now() - start);
    if (!r.ok) return { kind: 'err', msg: `HTTP ${r.status}`, endpoint };
    const data = await r.json();
    return { kind: 'ok', data, ms, endpoint };
  } catch (e) {
    return { kind: 'err', msg: e instanceof Error ? e.message : String(e), endpoint };
  }
}

export function BackendDiagPanel({ onClose }: { onClose: () => void }) {
  const [status, setStatus]   = useState<Result>({ kind: 'idle' });
  const [registry, setRegistry] = useState<Result>({ kind: 'idle' });
  const [catalog, setCatalog] = useState<Result>({ kind: 'idle' });

  const runAll = async () => {
    setStatus({ kind: 'loading' });
    setRegistry({ kind: 'loading' });
    setCatalog({ kind: 'loading' });
    const [s, r, c] = await Promise.all([
      ping('/'),
      ping('/api/agents/registry'),
      ping('/api/catalog/agents'),
    ]);
    setStatus(s);
    setRegistry(r);
    setCatalog(c);
  };

  return (
    <div style={{
      position: 'fixed', top: 80, right: 20, width: 480, zIndex: 100,
      background: 'var(--skin-panel)', border: '1px solid var(--border)',
      borderRadius: 10, boxShadow: 'var(--shadow-pop)', padding: 14,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700 }}>
          <Stethoscope size={14} strokeWidth={2} /> 后端连通诊断
        </span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-4)' }}>
          → {API_BASE}
        </span>
        <span style={{ flex: 1 }} />
        <button className="fb-btn fb-btn-primary fb-btn-sm" onClick={runAll}>
          运行
        </button>
        <button className="fb-btn fb-btn-icon" onClick={onClose} aria-label="关闭">×</button>
      </div>

      <Row label="GET /"                     result={status} />
      <Row label="GET /api/agents/registry"  result={registry} />
      <Row label="GET /api/catalog/agents"   result={catalog} />

      <div style={{
        marginTop: 10, padding: '6px 8px', borderRadius: 5,
        background: 'var(--bg-elev-2)', border: '1px solid var(--border)',
        fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-4)',
        lineHeight: 1.5,
      }}>
        三项都 ✓ 即代表前端 → Python 后端 → 数据返回 全栈通。<br />
        LLM 调用（智谱 / Claude / GPT）在另一条链路：浏览器存 key → 后端 executor。
      </div>
    </div>
  );
}

function Row({ label, result }: { label: string; result: Result }) {
  const [color, badge] =
    result.kind === 'ok'      ? ['var(--status-ok)',     '✓ ok']
    : result.kind === 'err'   ? ['var(--status-reject)', '✗ err']
    : result.kind === 'loading' ? ['var(--status-run)',  '… run']
    : ['var(--fg-5)', '— idle'];

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 8,
      padding: '6px 8px', borderRadius: 5, marginTop: 4,
      background: 'var(--bg-elev-2)', border: '1px solid var(--border)',
    }}>
      <span style={{
        fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
        color, minWidth: 50,
      }}>{badge}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--fg-2)' }}>{label}</div>
        {result.kind === 'ok' && (
          <pre style={{
            margin: '3px 0 0', fontFamily: 'var(--font-mono)', fontSize: 9.5,
            color: 'var(--fg-3)', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 90, overflow: 'auto',
          }}>{JSON.stringify(result.data, null, 1).slice(0, 400)}{JSON.stringify(result.data).length > 400 ? '…' : ''}</pre>
        )}
        {result.kind === 'err' && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--status-reject)', marginTop: 2 }}>
            {result.msg}
          </div>
        )}
        {result.kind === 'ok' && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--fg-5)', marginTop: 2 }}>
            {result.ms}ms
          </div>
        )}
      </div>
    </div>
  );
}
