/**
 * NeoRunSuggestions — 完成态「后续建议」卡（2026-08-23）。
 *
 * run 完成后由 NeoChat 挂载在消息流尾部（NeoRunInline 之下）：拉取
 * GET /api/runs/:id/suggestions（Node 网关 LLM 实时生成，mock 见
 * server/src/routes/run-suggestions.ts），渲染 2-4 条建议按钮，
 * 点击经 onPick 把文本填入 composer（不直接发送，用户确认后再发）。
 *
 * 空态纪律：加载中 / 接口失败（502 LLM 不可用 / 404 run 未知）/ 空数组
 * 一律不渲染——后端严禁静态假建议，前端拿到空就收起该区块。
 */
import { useEffect, useState } from 'react';
import { Lightbulb } from 'lucide-react';
import { getRunSuggestions } from '../api/runs';
import { useI18n } from '../common/i18n';

export interface NeoRunSuggestionsProps {
  /** 当前 run 的 session id（即 /api/runs/{id}/suggestions 的 run id）。 */
  runId: string;
  /** 点击建议 → 文本填入 composer。 */
  onPick: (text: string) => void;
}

export function NeoRunSuggestions({ runId, onPick }: NeoRunSuggestionsProps) {
  const { t } = useI18n();
  const [suggestions, setSuggestions] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    getRunSuggestions(runId)
      .then((list) => {
        if (alive) setSuggestions(list);
      })
      .catch(() => {
        // LLM 不可用 / run 未知 — 干净空态，不渲染
        if (alive) setSuggestions([]);
      });
    return () => {
      alive = false;
    };
  }, [runId]);

  if (suggestions.length === 0) return null;

  return (
    <div className="neo-run-suggestions" data-testid="neo-run-suggestions">
      <div className="neo-run-suggestions-head">
        <Lightbulb size={13} strokeWidth={1.9} aria-hidden />
        <span>{t('neo.run.suggestionsTitle', { defaultValue: '后续建议' })}</span>
      </div>
      <div className="neo-run-suggestions-list">
        {suggestions.map((s) => (
          <button
            key={s}
            type="button"
            className="neo-run-suggestion"
            data-testid="neo-run-suggestion"
            onClick={() => onPick(s)}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

export default NeoRunSuggestions;
