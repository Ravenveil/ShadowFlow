/**
 * MemoryProfileEditor — Story 9.3 AC5
 *
 * Embedded in Builder Scene Mode / Inspector for configuring agent memory.
 * Calls PATCH /memory/profiles/{profile_id} on save.
 */
import { useState, useCallback } from 'react';
import type {
  CompressionPolicy,
  MemoryProfile,
  UpdateMemoryProfilePayload,
  WritebackPolicy,
} from '../../../common/types/memory';
import { updateMemoryProfile, MemoryApiError } from '../../../api/memory';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MemoryProfileEditorProps {
  profile: MemoryProfile;
  /** Called after successful save with updated profile */
  onSaved?: (updated: MemoryProfile) => void;
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WRITEBACK_OPTIONS: { value: WritebackPolicy; label: string }[] = [
  { value: 'always', label: '每次运行后' },
  { value: 'on_task_complete', label: '任务完成后' },
  { value: 'on_session_end', label: '会话结束后' },
  { value: 'manual', label: '手动触发' },
];

const COMPRESSION_OPTIONS: { value: CompressionPolicy; label: string; hint: string }[] = [
  { value: 'none', label: '不压缩', hint: '超过预算时记录警告但不裁剪' },
  { value: 'select_top_k', label: '保留最近 K 条', hint: '丢弃旧条目，无需 LLM 调用' },
  { value: 'summarize', label: 'LLM 滚动摘要', hint: '调用 LLM 生成滚动摘要，消耗额外 token' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MemoryProfileEditor({ profile, onSaved }: MemoryProfileEditorProps) {
  const [workingLimit, setWorkingLimit] = useState(profile.working_memory_limit);
  const [retentionDays, setRetentionDays] = useState(profile.episodic_retention_days);
  const [writebackPolicy, setWritebackPolicy] = useState<WritebackPolicy>(profile.writeback_policy);
  const [compressionPolicy, setCompressionPolicy] = useState<CompressionPolicy>(profile.compression_policy);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleSave = useCallback(async () => {
    setSaveStatus('saving');
    setErrorMsg('');
    const payload: UpdateMemoryProfilePayload = {
      working_memory_limit: workingLimit,
      episodic_retention_days: retentionDays,
      writeback_policy: writebackPolicy,
      compression_policy: compressionPolicy,
    };
    try {
      const res = await updateMemoryProfile(profile.profile_id, payload);
      setSaveStatus('saved');
      onSaved?.(res.data);
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err) {
      setSaveStatus('error');
      setErrorMsg(err instanceof MemoryApiError ? `错误 ${err.status}: ${err.code}` : '保存失败');
    }
  }, [profile.profile_id, workingLimit, retentionDays, writebackPolicy, compressionPolicy, onSaved]);

  const compressionHint = COMPRESSION_OPTIONS.find(o => o.value === compressionPolicy)?.hint ?? '';

  return (
    <div className="flex flex-col gap-4 p-4 bg-[var(--t-panel)] rounded-lg border border-white/10 text-sm text-white">
      <h3 className="font-semibold text-white/80 uppercase tracking-wide text-xs">Memory 配置</h3>

      {/* Working memory limit */}
      <div className="flex flex-col gap-1">
        <label className="text-white/60 text-xs">工作记忆上限 (tokens)</label>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={1024}
            max={16384}
            step={512}
            value={workingLimit}
            onChange={e => setWorkingLimit(Number(e.target.value))}
            className="flex-1 accent-indigo-500"
          />
          <span className="w-16 text-right text-white/80 tabular-nums">{workingLimit.toLocaleString()}</span>
        </div>
      </div>

      {/* Episodic retention */}
      <div className="flex flex-col gap-1">
        <label className="text-white/60 text-xs">情景记忆保留天数 (0 = 永久)</label>
        <input
          type="number"
          min={0}
          value={retentionDays}
          onChange={e => setRetentionDays(Math.max(0, Number(e.target.value)))}
          className="w-28 rounded bg-white/5 border border-white/10 px-2 py-1 text-white/90 focus:outline-none focus:border-indigo-500"
        />
      </div>

      {/* Writeback policy */}
      <div className="flex flex-col gap-1">
        <label className="text-white/60 text-xs">写回策略</label>
        <select
          value={writebackPolicy}
          onChange={e => setWritebackPolicy(e.target.value as WritebackPolicy)}
          className="rounded bg-white/5 border border-white/10 px-2 py-1 text-white/90 focus:outline-none focus:border-indigo-500"
        >
          {WRITEBACK_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Compression policy */}
      <div className="flex flex-col gap-1">
        <label className="text-white/60 text-xs">压缩策略</label>
        <select
          value={compressionPolicy}
          onChange={e => setCompressionPolicy(e.target.value as CompressionPolicy)}
          className="rounded bg-white/5 border border-white/10 px-2 py-1 text-white/90 focus:outline-none focus:border-indigo-500"
        >
          {COMPRESSION_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        {compressionHint && (
          <p className="text-white/40 text-xs mt-0.5">{compressionHint}</p>
        )}
      </div>

      {/* Save button + status */}
      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={handleSave}
          disabled={saveStatus === 'saving'}
          className="px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-medium transition-colors"
        >
          {saveStatus === 'saving' ? '保存中...' : '保存配置'}
        </button>
        {saveStatus === 'saved' && <span className="text-green-400 text-xs">已保存</span>}
        {saveStatus === 'error' && <span className="text-red-400 text-xs">{errorMsg}</span>}
      </div>
    </div>
  );
}
