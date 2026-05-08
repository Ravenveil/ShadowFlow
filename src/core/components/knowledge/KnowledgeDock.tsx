/**
 * KnowledgeDock — Story 9.1 AC5
 *
 * Builder Scene Mode 侧边面板。功能：
 *   - 显示当前已绑定的 KnowledgePack（按 pack_id 列表）
 *   - 绑定已有 Pack（下拉选择 + Bind）
 *   - 快速跳转到 KnowledgePage 创建新 Pack
 *   - 实时轮询 indexing/pending Pack 状态（3s，ready/failed 后停）
 *
 * 此组件不持有真源——`bindings` + `onChange` 由父级 Builder Scene Mode 维护，
 * 待 Story 9.2 接入 AgentBlueprint.knowledge_bindings。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getPack, listPacks } from '../../../api/knowledge';
import type { KnowledgePack, PackStatus } from '../../../common/types/knowledge';

interface KnowledgeDockProps {
  /** Currently bound pack ids (parent owns the source of truth). */
  bindings: string[];
  /** Called when the user binds or unbinds a pack. */
  onChange?: (next: string[]) => void;
}

const POLL_INTERVAL_MS = 3000;
// M4: cap polling at ~3 minutes per pack (matches KnowledgePage).
const POLL_MAX_TICKS = 60;

const STATUS_COLOR: Record<PackStatus, string> = {
  pending: '#A4A4AA',
  indexing: '#6FA8FF',
  ready: '#4FCC85',
  failed: '#F58484',
};

export default function KnowledgeDock({ bindings, onChange }: KnowledgeDockProps) {
  const [allPacks, setAllPacks] = useState<KnowledgePack[]>([]);
  const [loading, setLoading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  // M1: timer + per-pack tick counter live in refs so the polling effect
  // doesn't tear them down on every re-render.
  const pollTimers = useRef<Map<string, { handle: number; ticks: number }>>(new Map());
  // M4: track packs that have hit POLL_MAX_TICKS so we don't restart them.
  const stalledPolls = useRef<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listPacks({ limit: 100 });
      setAllPacks(res.data.packs);
    } catch {
      // fail silently in the dock; the full page surfaces errors
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const stopPoll = useCallback((packId: string) => {
    const entry = pollTimers.current.get(packId);
    if (entry !== undefined) {
      window.clearInterval(entry.handle);
      pollTimers.current.delete(packId);
    }
  }, []);

  const startPoll = useCallback(
    (packId: string) => {
      if (pollTimers.current.has(packId)) return;
      if (stalledPolls.current.has(packId)) return;
      const handle = window.setInterval(async () => {
        const entry = pollTimers.current.get(packId);
        if (!entry) return;
        entry.ticks += 1;
        if (entry.ticks > POLL_MAX_TICKS) {
          // M4: stalled — stop polling and require explicit refresh / reindex.
          stalledPolls.current.add(packId);
          window.clearInterval(entry.handle);
          pollTimers.current.delete(packId);
          return;
        }
        try {
          const res = await getPack(packId);
          setAllPacks((prev) => prev.map((p) => (p.pack_id === packId ? res.data : p)));
          if (res.data.status === 'ready' || res.data.status === 'failed') {
            window.clearInterval(entry.handle);
            pollTimers.current.delete(packId);
          }
        } catch {
          // swallow polling errors
        }
      }, POLL_INTERVAL_MS);
      pollTimers.current.set(packId, { handle, ticks: 0 });
    },
    [],
  );

  // M1: only adds/stops polls on actual binding/status changes — no longer
  // tears down all timers on every poll tick (which is what the old
  // `[bindings, allPacks, startPoll, stopPoll]` deps + cleanup did).
  useEffect(() => {
    bindings.forEach((id) => {
      const pack = allPacks.find((p) => p.pack_id === id);
      if (!pack) return;
      if (pack.status === 'pending' || pack.status === 'indexing') {
        startPoll(id);
      } else {
        stopPoll(id);
      }
    });
  }, [bindings, allPacks, startPoll, stopPoll]);

  // Cleanup only on unmount.
  useEffect(() => {
    return () => {
      pollTimers.current.forEach((entry) => window.clearInterval(entry.handle));
      pollTimers.current.clear();
      stalledPolls.current.clear();
    };
  }, []);

  const boundPacks = useMemo(
    () =>
      bindings
        .map((id) => allPacks.find((p) => p.pack_id === id))
        .filter((p): p is KnowledgePack => Boolean(p)),
    [bindings, allPacks],
  );

  const unboundPacks = useMemo(
    () => allPacks.filter((p) => !bindings.includes(p.pack_id)),
    [allPacks, bindings],
  );

  const handleBind = (packId: string) => {
    if (bindings.includes(packId)) return;
    onChange?.([...bindings, packId]);
    setPickerOpen(false);
  };

  const handleUnbind = (packId: string) => {
    onChange?.(bindings.filter((id) => id !== packId));
  };

  return (
    <aside
      data-testid="knowledge-dock"
      style={{
        width: 280,
        background: 'var(--t-panel)',
        border: '1px solid var(--border, #2D333B)',
        borderRadius: 12,
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>Knowledge</span>
        <Link
          to="/knowledge"
          data-testid="dock-open-page"
          style={{ fontSize: 11, opacity: 0.75, textDecoration: 'none', color: 'var(--accent, #6FA8FF)' }}
        >
          管理 →
        </Link>
      </div>

      {boundPacks.length === 0 && (
        <div style={{ fontSize: 12, opacity: 0.65 }}>
          {loading ? '加载中…' : '尚未绑定 KnowledgePack。点击下方「绑定」选择。'}
        </div>
      )}

      {boundPacks.length > 0 && (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {boundPacks.map((pack) => (
            <li
              key={pack.pack_id}
              data-testid={`dock-bound-${pack.pack_id}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 12,
                background: 'var(--t-bg)',
                border: '1px solid var(--border, #2D333B)',
                borderRadius: 8,
                padding: '6px 10px',
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: STATUS_COLOR[pack.status],
                  flexShrink: 0,
                }}
                aria-hidden
              />
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {pack.name}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, opacity: 0.7 }}>{pack.status}</span>
              <button
                onClick={() => handleUnbind(pack.pack_id)}
                aria-label={`Unbind ${pack.name}`}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'rgba(245,132,132,0.85)',
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div style={{ position: 'relative' }}>
        <button
          data-testid="dock-bind-btn"
          onClick={() => setPickerOpen((s) => !s)}
          style={{
            width: '100%',
            height: 30,
            background: 'transparent',
            border: '1px dashed var(--border, #2D333B)',
            borderRadius: 8,
            color: 'var(--fg, #E6EDF3)',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          {pickerOpen ? '关闭' : '+ 绑定已有 Pack'}
        </button>
        {pickerOpen && (
          <div
            style={{
              position: 'absolute',
              top: 34,
              left: 0,
              right: 0,
              background: 'var(--t-bg)',
              border: '1px solid var(--border, #2D333B)',
              borderRadius: 8,
              maxHeight: 220,
              overflowY: 'auto',
              zIndex: 10,
            }}
          >
            {unboundPacks.length === 0 && (
              <div style={{ padding: 10, fontSize: 12, opacity: 0.6 }}>
                没有可绑定的 Pack —— 先到管理页创建。
              </div>
            )}
            {unboundPacks.map((pack) => (
              <button
                key={pack.pack_id}
                data-testid={`dock-pick-${pack.pack_id}`}
                onClick={() => handleBind(pack.pack_id)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '8px 10px',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--fg, #E6EDF3)',
                  fontSize: 12,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: STATUS_COLOR[pack.status],
                  }}
                />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {pack.name}
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, opacity: 0.7 }}>
                  {pack.status}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  );
}
