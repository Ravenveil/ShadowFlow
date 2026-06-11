/**
 * NewTaskComposer — M3c start 吸收（三栏融合）。
 *
 * 聊天中栏的「新任务」台：StartPage 大输入框的薄版——goal → POST
 * /api/run-sessions → 跳 /run-session/:id，提交链路与 StartPage handleSubmit
 * 完全同构（executor/model/provider 取同一 localStorage 键 + X-Anthropic-Key）。
 * 完整能力（@技能 / 附件 / 知识库 / 向导）保留在 /start 金丝雀页，底部给入口。
 *
 * 入口：rail「+ 新任务」按钮 → /chat?new=1（ChatPage auto-pick 对 new=1 放行）。
 */
import { useState, type KeyboardEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Sparkles, ArrowRight } from 'lucide-react';
import { getApiBase } from '../../api/_base';
import { useSecretsStore } from '../../core/hooks/useSecretsStore';

// 与 StartPage SUGGESTIONS 同源的模板 chips（薄版：点击预填 goal 文本）。
const SUGGESTIONS: Array<[string, string]> = [
  ['◇', '论文深读 — 找漏洞 + 写 review'],
  ['◈', '新闻编辑部 — 抓 → 编 → 审'],
  ['⬢', '创业速配 — BD/Dev/Marketing'],
  ['☷', '咨询小队 — 调研 + 报告'],
];

export function NewTaskComposer() {
  const navigate = useNavigate();
  const { secrets } = useSecretsStore();
  const [goal, setGoal] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    const text = goal.trim();
    if (!text || submitting) return;
    setError(null);
    setSubmitting(true);
    // 与 StartPage handleSubmit 同构：转发模型选择，byok:<provider> 派生 provider
    const executor = localStorage.getItem('sf.defaultExecutor') || undefined;
    const model = localStorage.getItem('sf.model') || undefined;
    const provider = executor && executor.startsWith('byok:') ? executor.slice(5) : undefined;
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (secrets.anthropic) headers['X-Anthropic-Key'] = secrets.anthropic;
      const resp = await fetch(`${getApiBase()}/api/run-sessions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ goal: text, executor, model, provider }),
      });
      if (resp.ok) {
        const data = (await resp.json()) as { session_id: string };
        navigate(`/run-session/${data.session_id}?goal=${encodeURIComponent(text)}`);
        return;
      }
      const body = await resp.text().catch(() => '');
      setError(`创建 run-session 失败（HTTP ${resp.status}）。请检查后端 server 是否在运行（默认 :8002），或在「设置 → BYOK」配置 API Key。${body ? ` 详情：${body.slice(0, 200)}` : ''}`);
    } catch (err) {
      setError(`无法连接后端 server。请确认 server 已启动（默认 :8002）并刷新页面。${err instanceof Error ? ` 错误：${err.message}` : ''}`);
    } finally {
      setSubmitting(false);
    }
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      void handleSubmit();
    }
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 24px', overflowY: 'auto' }}>
      <div style={{ width: '100%', maxWidth: 680, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <h1 style={{ margin: 0, textAlign: 'center', fontSize: 30, fontWeight: 800, color: 'var(--t-fg)', letterSpacing: '-.01em' }}>
          今天要做什么？
        </h1>

        <div style={{ border: '1px solid var(--t-border)', borderRadius: 14, background: 'var(--t-panel)', padding: 14, display: 'flex', flexDirection: 'column', gap: 10, boxShadow: 'var(--shadow-pop, 0 8px 28px rgba(0,0,0,.08))' }}>
          <textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            onKeyDown={onKey}
            rows={4}
            autoFocus
            aria-label="新任务目标"
            placeholder="描述一个目标，或粘贴一份 brief… 提交后组建团队开跑"
            style={{ width: '100%', resize: 'none', border: 'none', outline: 'none', background: 'transparent', color: 'var(--t-fg)', fontSize: 14, lineHeight: 1.6, fontFamily: 'inherit' }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 10.5, color: 'var(--t-fg-5)', fontFamily: 'var(--font-mono, monospace)' }}>Ctrl+⏎</span>
            <div style={{ flex: 1 }} />
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={!goal.trim() || submitting}
              data-testid="newtask-go"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 9,
                border: 'none', cursor: goal.trim() && !submitting ? 'pointer' : 'not-allowed',
                background: goal.trim() && !submitting ? 'var(--t-accent)' : 'var(--t-panel-2)',
                color: goal.trim() && !submitting ? 'var(--t-accent-ink)' : 'var(--t-fg-4)',
                fontWeight: 700, fontSize: 13,
              }}
            >
              <Sparkles size={14} aria-hidden />
              {submitting ? '创建中…' : 'go'}
            </button>
          </div>
        </div>

        {error && (
          <div role="alert" style={{ fontSize: 12, color: 'var(--t-err)', lineHeight: 1.6, textAlign: 'center' }}>{error}</div>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
          {SUGGESTIONS.map(([glyph, label]) => (
            <button
              key={label}
              type="button"
              onClick={() => setGoal(label)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 999,
                border: '1px solid var(--t-border)', background: 'var(--t-panel)', color: 'var(--t-fg-2)',
                fontSize: 12, cursor: 'pointer',
              }}
            >
              <span aria-hidden style={{ color: 'var(--t-accent)' }}>{glyph}</span>
              {label}
            </button>
          ))}
        </div>

        <div style={{ textAlign: 'center', fontSize: 11.5, color: 'var(--t-fg-4)' }}>
          需要 @技能 / 附件 / 知识库？
          <Link to="/start" style={{ color: 'var(--t-accent)', textDecoration: 'none', marginLeft: 4, display: 'inline-flex', alignItems: 'center', gap: 2 }}>
            打开完整的开始页 <ArrowRight size={11} aria-hidden />
          </Link>
        </div>
      </div>
    </div>
  );
}
