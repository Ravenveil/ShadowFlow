/**
 * PublishSuccessPanel — Story 8.6 (AC4, AC7)
 *
 * 发布成功后持久展示的结果面板（非 toast）。
 * 提供三个 CTA：查看模板 / 在编辑器中打开 / 发起群聊使用。
 * 用户需主动点击某个 CTA 或"再次编辑"按钮才会离开成功态。
 */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Clipboard, Pencil, CheckCircle2, Check, MessageCircle } from '../../../common/icons/iconRegistry';

export interface PublishSuccessPanelProps {
  templateId: string;
  workflowId: string;
  kitTags: string[];
  onBackToEdit: () => void;
}

export function PublishSuccessPanel({ templateId, workflowId, kitTags, onBackToEdit }: PublishSuccessPanelProps) {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);

  // Patch 13 + R2-Patch-3: guard against empty templateId; avoid "—…" display
  const shortId = templateId ? templateId.slice(0, 8) : '';

  function handleCopy() {
    if (!templateId) return;
    // Patch 8: add .catch() for clipboard permission denied or unsupported
    navigator.clipboard.writeText(templateId)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      })
      .catch(() => {
        console.warn('Clipboard write failed');
      });
  }

  return (
    <div
      className="flex flex-col gap-6 rounded-[14px] border border-sf-ok/40 bg-sf-ok/6 p-6"
      data-testid="publish-success-panel"
    >
      {/* Title */}
      <div className="flex items-center gap-3">
        <span className="inline-flex h-7 w-7 items-center justify-center text-sf-ok" aria-label="success">
          <CheckCircle2 size={28} strokeWidth={2} aria-hidden />
        </span>
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-sf-ok">发布成功</p>
          <h2 className="text-[20px] font-bold tracking-[-0.02em]">Agent 已发布到生态</h2>
        </div>
      </div>

      {/* Template ID */}
      <div className="flex items-center gap-2 rounded-[8px] border border-sf-border bg-sf-bg px-3 py-2">
        <span className="font-mono text-[11px] text-sf-fg4">Template ID</span>
        <span className="font-mono text-[13px] font-semibold text-sf-fg1" data-testid="template-id-short">
          {shortId ? `${shortId}…` : '—'}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="ml-auto rounded-[6px] border border-sf-border bg-sf-elev-1 px-2 py-0.5 font-mono text-[10px] text-sf-fg3 transition-colors hover:text-sf-fg1"
          data-testid="copy-template-id-btn"
          aria-label="复制 Template ID"
        >
          {copied ? (
            <span className="inline-flex items-center gap-1">
              <Check size={10} strokeWidth={2} aria-hidden />
              已复制
            </span>
          ) : '复制'}
        </button>
      </div>

      {/* Kit tags */}
      {kitTags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {kitTags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-sf-accent/30 bg-sf-accent/8 px-2 py-0.5 font-mono text-[10px] text-sf-accent-bright"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* CTAs */}
      <div className="flex flex-col gap-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-sf-fg4">跳转入口</p>

        <button
          type="button"
          onClick={() => navigate('/templates')}
          className="flex items-center gap-2 rounded-[10px] border border-sf-border bg-sf-elev-1 px-4 py-3 text-left transition-colors hover:border-sf-accent/40 hover:bg-sf-accent/6"
          data-testid="cta-view-templates"
        >
          <span className="inline-flex items-center text-sf-fg2"><Clipboard size={18} strokeWidth={2} /></span>
          <div>
            <p className="text-[13px] font-semibold">查看模板</p>
            <p className="text-[11px] text-sf-fg4">/templates — 在模板库中查看已发布的 Agent</p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => navigate(`/editor?workflowId=${workflowId}`)}
          className="flex items-center gap-2 rounded-[10px] border border-sf-border bg-sf-elev-1 px-4 py-3 text-left transition-colors hover:border-sf-accent/40 hover:bg-sf-accent/6"
          data-testid="cta-open-editor"
        >
          <span className="inline-flex items-center text-sf-fg2"><Pencil size={18} strokeWidth={2} /></span>
          <div>
            <p className="text-[13px] font-semibold">在编辑器中打开</p>
            <p className="text-[11px] text-sf-fg4">/editor — 在 Workflow 编辑器中继续调整</p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => navigate('/inbox')}
          className="flex items-center gap-2 rounded-[10px] border border-sf-border bg-sf-elev-1 px-4 py-3 text-left transition-colors hover:border-sf-accent/40 hover:bg-sf-accent/6"
          data-testid="cta-open-inbox"
        >
          <span className="inline-flex items-center text-sf-fg2"><MessageCircle size={18} strokeWidth={2} aria-hidden /></span>
          <div>
            <p className="text-[13px] font-semibold">发起群聊使用</p>
            <p className="text-[11px] text-sf-fg4">/inbox — 创建群聊，立即使用此 Agent</p>
          </div>
        </button>
      </div>

      {/* Back to edit */}
      <button
        type="button"
        onClick={onBackToEdit}
        className="self-start text-[12px] text-sf-fg4 underline hover:text-sf-fg2 hover:no-underline"
        data-testid="back-to-edit-btn"
      >
        ← 再次编辑（返回 Scene Mode）
      </button>
    </div>
  );
}
