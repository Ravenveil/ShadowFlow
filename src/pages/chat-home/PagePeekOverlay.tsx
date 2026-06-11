/**
 * PagePeekOverlay — 三栏融合：把原侧边栏页面（/teams 团队、/agents 员工）
 * 以「站内大弹层」形式弹进聊天，页面设计原样复用、零删改。
 *
 * 实现：弹层内嵌同源 iframe 加载真实路由——页面组件、详情跳转、新建流程
 * 全部照常工作（数据同源共享）；HfLayout 检测到 iframe 环境自动隐藏全局
 * 侧边栏/宠物栏，只留页面本体。React Router v6 禁止嵌套 Router，iframe
 * 是复用整页（含其内部导航）的最稳路径。
 *
 * 视觉对标 clawsgo：遮罩模糊渐入 + 面板上浮动画（sf-peek-* 见 index.css），
 * ESC / 点遮罩 / 右上角按钮三种方式关闭。
 */
import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

export type PeekTarget = 'teams' | 'agents';

const TITLES: Record<PeekTarget, string> = {
  teams: '团队',
  agents: '员工',
};

export function PagePeekOverlay({ target, onClose }: { target: PeekTarget; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div className="sf-peek-backdrop" onClick={onClose} role="presentation">
      <div
        className="sf-peek-panel"
        role="dialog"
        aria-modal="true"
        aria-label={`${TITLES[target]}页面`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sf-peek-head">
          <span className="sf-peek-title">{TITLES[target]}</span>
          <span className="sf-peek-hint">原 /{target} 页面 · 改动实时生效 · ESC 关闭</span>
          <button type="button" className="sf-peek-close" aria-label="关闭" title="关闭" onClick={onClose}>
            <X size={15} strokeWidth={2} aria-hidden />
          </button>
        </div>
        <iframe
          className="sf-peek-frame"
          src={`/${target}`}
          title={`${TITLES[target]}页面`}
          data-testid="peek-frame"
        />
      </div>
    </div>,
    document.body,
  );
}
