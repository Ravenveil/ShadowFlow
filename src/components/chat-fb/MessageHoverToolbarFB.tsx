/**
 * MessageHoverToolbarFB · 消息卡 hover 浮出的右上角工具栏（FB-HiFi 风）
 * 对照 _evidence/design-pkg-2026-05-28/chat-fb.html
 *   - CSS : 行 411-440（.hover-tb / .hover-tb .it / .hover-tb .sep）
 *   - HTML: 行 1576-1589（HOVER_TB_HTML 模板）
 *
 * 9 个动作（按设计稿顺序）：
 *   1) 反应（SmilePlus）
 *   2) 回复（CornerUpLeft）
 *   3) 开 thread（MessagesSquare）
 *   4) 引用（Quote）
 *   5) AI 改写（Wand2）
 *   6) 翻译（Languages）
 *   7) Pin（置顶）
 *   8) 转发（Forward）
 *   --- sep ---
 *   9) 更多（MoreHorizontal）
 *
 * 默认 opacity 0；父级 .msg/.usermsg/.dr-reply hover 时显示。
 * alwaysShow=true 时手动常显（用于设计稿对齐 / 演示模式）。
 *
 * TODO(Stream H): 把 onReact/onReply/onThread/... 接到真实 handler
 * （reaction 写库 / 引用插入 composer / 开 ThreadDrawer / Pin briefboard 等）。
 */

import type { LucideIcon } from 'lucide-react';
import {
  CornerUpLeft,
  Forward,
  Languages,
  MessagesSquare,
  MoreHorizontal,
  Pin,
  Quote,
  SmilePlus,
  Wand2,
} from 'lucide-react';
import styles from './chatFB.module.css';

export interface MessageHoverToolbarFBProps {
  messageId: string;
  /** 强制常显（不依赖父级 hover）；默认 false */
  alwaysShow?: boolean;
  onReact?: (messageId: string) => void;
  onReply?: (messageId: string) => void;
  onThread?: (messageId: string) => void;
  onQuote?: (messageId: string) => void;
  onRewrite?: (messageId: string) => void;
  onTranslate?: (messageId: string) => void;
  onPin?: (messageId: string) => void;
  onForward?: (messageId: string) => void;
  onMore?: (messageId: string) => void;
}

type ToolDef = {
  key: string;
  title: string;
  icon: LucideIcon;
  handlerKey: keyof Omit<MessageHoverToolbarFBProps, 'messageId' | 'alwaysShow'>;
};

const TOOLS: ToolDef[] = [
  { key: 'react', title: '反应', icon: SmilePlus, handlerKey: 'onReact' },
  { key: 'reply', title: '回复', icon: CornerUpLeft, handlerKey: 'onReply' },
  { key: 'thread', title: '开 thread', icon: MessagesSquare, handlerKey: 'onThread' },
  { key: 'quote', title: '引用', icon: Quote, handlerKey: 'onQuote' },
  { key: 'rewrite', title: 'AI 改写', icon: Wand2, handlerKey: 'onRewrite' },
  { key: 'translate', title: '翻译', icon: Languages, handlerKey: 'onTranslate' },
  { key: 'pin', title: 'Pin', icon: Pin, handlerKey: 'onPin' },
  { key: 'forward', title: '转发', icon: Forward, handlerKey: 'onForward' },
];

export function MessageHoverToolbarFB(props: MessageHoverToolbarFBProps) {
  const { messageId, alwaysShow } = props;

  const dispatch = (handlerKey: ToolDef['handlerKey'] | 'onMore'): void => {
    const fn = props[handlerKey];
    if (typeof fn === 'function') {
      fn(messageId);
    } else {
      // TODO(Stream H): 父组件还没接 handler — 暂占位
      // eslint-disable-next-line no-console
      console.log(`[MessageHoverToolbarFB] ${handlerKey} on ${messageId} (no handler)`);
    }
  };

  return (
    <div
      className={`${styles.hoverTb} ${alwaysShow ? styles.hoverTbShow : ''}`}
      data-message-id={messageId}
      role="toolbar"
      aria-label="消息操作"
    >
      {TOOLS.map(t => {
        const Icon = t.icon;
        return (
          <button
            key={t.key}
            type="button"
            className={styles.hoverTbIt}
            title={t.title}
            aria-label={t.title}
            onClick={() => dispatch(t.handlerKey)}
          >
            <Icon size={14} strokeWidth={1.7} />
          </button>
        );
      })}
      <span className={styles.hoverTbSep} aria-hidden />
      <button
        type="button"
        className={styles.hoverTbIt}
        title="更多"
        aria-label="更多"
        onClick={() => dispatch('onMore')}
      >
        <MoreHorizontal size={14} strokeWidth={1.7} />
      </button>
    </div>
  );
}

export default MessageHoverToolbarFB;
