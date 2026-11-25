/**
 * RunSuggestions — 完成态「后续建议」卡（搬 legacy NeoRunSuggestions）。
 *
 * 拉取 GET /api/runs/:id/suggestions（Node 网关 LLM 实时生成），渲染 2-4 条
 * 建议按钮，点击经 onPick 把文本填入 composer（不直接发送）。
 * 空态纪律：加载中 / 接口失败（LLM 不可用 / run 未知）/ 空数组一律不渲染
 * ——后端严禁静态假建议，拿到空就收起该区块。
 * 文案在 content/app.ts 的 RUN_SUGGEST；组件内零中文零色值。
 */
import { useEffect, useState } from 'react';
import { fetchRunSuggestions } from '@/shared/data/http/generic';
import { RUN_SUGGEST } from '@/shared/content/app';
import { IconSparkle } from '@/shared/ui/icons';

const parseSuggestions = (raw: unknown): string[] => {
  const data = (raw as { data?: { suggestions?: unknown } })?.data ?? (raw as { suggestions?: unknown });
  const list = data?.suggestions;
  if (!Array.isArray(list)) return [];
  return list.filter((s): s is string => typeof s === 'string' && s.trim().length > 0);
};

export function RunSuggestions({ runId, onPick }: { runId: string; onPick: (text: string) => void }) {
  const [suggestions, setSuggestions] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    fetchRunSuggestions(runId)
      .then((raw) => {
        if (alive) setSuggestions(parseSuggestions(raw));
      })
      .catch(() => {
        if (alive) setSuggestions([]);
      });
    return () => {
      alive = false;
    };
  }, [runId]);

  if (suggestions.length === 0) return null;

  return (
    <div className="run-suggestions">
      <div className="run-suggestions-head">
        <IconSparkle size={12} />
        <span>{RUN_SUGGEST.title}</span>
      </div>
      <div className="run-suggestions-list">
        {suggestions.map((s) => (
          <button key={s} type="button" className="run-suggestion" onClick={() => onPick(s)}>
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
