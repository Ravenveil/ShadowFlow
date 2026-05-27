/**
 * MessageRegistry — kind dispatcher for the Timeline stream.
 *
 * Given a single `TimelineMessage`, picks the right per-kind renderer. The
 * `status_line` kind is intentionally excluded here — it's not part of the
 * scrolling stream; the parent Timeline picks it out and renders the
 * StatusLine slot separately below the scrolling area.
 *
 * Adding a new kind = add it to the discriminated union in types.ts +
 * append a case here. The exhaustiveness check (`never` fallback) makes the
 * compiler enforce coverage.
 */
import { memo } from 'react';
import type { TimelineMessage } from './types';
import { UserTurnMessage } from './messages/UserTurnMessage';
import { ThinkingMessage } from './messages/ThinkingMessage';
import { AssistantMeta } from './messages/AssistantMeta';
import { AssistantText } from './messages/AssistantText';
import { RawMessage } from './messages/RawMessage';
import { RationaleMessage } from './messages/RationaleMessage';
import { ToolCallChip } from './messages/ToolCallChip';
import { ToolEchoLine } from './messages/ToolEchoLine';
import { StepPanel } from './messages/StepPanel';
import { DiffPanel } from './messages/DiffPanel';
import { MsgFoot } from './messages/MsgFoot';
import { SectionHeader } from './messages/SectionHeader';

interface Props {
  msg: TimelineMessage;
  /** Round 2 — wired to UserTurnMessage's hover retry button. */
  onUserRetry?: (text: string) => void;
  resending?: boolean;
}

export const MessageRegistry = memo(function MessageRegistry({
  msg,
  onUserRetry,
  resending,
}: Props) {
  switch (msg.kind) {
    case 'user_turn':
      return (
        <UserTurnMessage
          msg={msg}
          onRetry={onUserRetry}
          resending={resending}
        />
      );
    case 'thinking':
      return <ThinkingMessage msg={msg} />;
    case 'assistant_meta':
      return <AssistantMeta msg={msg} />;
    case 'assistant_text':
      return <AssistantText msg={msg} />;
    case 'raw':
      return <RawMessage msg={msg} />;
    case 'rationale':
      return <RationaleMessage msg={msg} />;
    case 'tool_call':
      return <ToolCallChip msg={msg} />;
    case 'tool_echo':
      return <ToolEchoLine msg={msg} />;
    case 'step_panel':
      return <StepPanel msg={msg} />;
    case 'diff_panel':
      return <DiffPanel msg={msg} />;
    case 'msg_foot':
      return <MsgFoot msg={msg} />;
    case 'status_line':
      // Not rendered in the scrolling stream — caller picks this out.
      return null;
    case 'section_header':
      // Round 2.5 — standalone section divider ("Builder" / "思考过程" /
      // "工作 · ..."). Children are subsequent rows in the stream, not
      // nested under this header (that's an extractRows concept). The
      // header is a self-contained foldable row.
      return (
        <SectionHeader
          label={msg.title}
          meta={msg.meta}
          defaultOpen={msg.default_open ?? true}
        />
      );
    default: {
      // Exhaustiveness — compile error if a new kind is added without a case.
      const _exhaustive: never = msg;
      void _exhaustive;
      return null;
    }
  }
});
