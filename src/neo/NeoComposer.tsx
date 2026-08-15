/**
 * NeoComposer — Neo 中栏 composer（clawsgo 形态）。
 *
 * 零逻辑封装：内部直接渲染 UnifiedComposer（@ 技能 / `/` 命令 / 附件 /
 * 模型 / 知识库全能力原样保留），本组件只提供 Neo 视觉容器与类型中转。
 * 提交链路（首条创建 run / 多轮接力 POST messages）由 NeoChat 在 onSubmit
 * 里实现——与 chat-home 的 NewTaskComposer 同一数据通路，不另造数据流。
 */
import {
  UnifiedComposer,
  type UnifiedComposerSubmitPayload,
} from '../components/composer/UnifiedComposer';

export type { UnifiedComposerSubmitPayload };

export interface NeoComposerProps {
  /** 提交逻辑不内聚：调用方在 onSubmit 里做 POST / 状态切换；抛错时
   *  UnifiedComposer 在卡片内显示可关闭的错误条。 */
  onSubmit: (p: UnifiedComposerSubmitPayload) => Promise<void> | void;
  placeholder?: string;
  /** hero = 空态居中大框（clawsgo 首页态）；chat = 底部紧凑（默认）。 */
  variant?: 'hero' | 'chat';
  /** 流式进行中：发送按钮原地切换为「停止」。 */
  streaming?: boolean;
  onStop?: () => void;
  /** 预填文本（如模板画廊点选后注入 `@<skill_id> `）。透传给
   *  UnifiedComposer 的 initialText —— 值变化时 composer 内部同步并选中
   *  skill token，用户接着打字即带 skill 发起 run。 */
  initialText?: string;
}

export function NeoComposer({ variant = 'chat', ...rest }: NeoComposerProps) {
  return (
    <div className={`neo-composer neo-composer-${variant}`}>
      <UnifiedComposer variant={variant} {...rest} />
    </div>
  );
}
