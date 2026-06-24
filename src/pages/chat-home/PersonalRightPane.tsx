import { useState } from 'react';
import { PanelRightClose, PanelRightOpen } from 'lucide-react';
import { useResizableWidth } from '../../core/hooks/useResizableWidth';
import type { AgentRecord } from '../../api/agents';
import { AgentWorkspacePane } from './AgentWorkspacePane';

// 2026-06-24 — 拍平为单排工作台（对齐 ClawsGO「Agent 的主机」）：
//   右栏 = 外壳（可拖拽宽度 + 收起）+ AgentWorkspacePane（产物/文件/画布/任务/Brief 单排）。
//   「设定/人设」不再占右栏 tab，移到中栏 DM 头部点开（见 PersonalChatView · AgentSettingsCard）。
interface PersonalRightPaneProps {
  /** 选中的助手 — 传给工作台，供「角色」tab 弹出时渲染设定卡。 */
  agent?: AgentRecord | null;
  /** dm conversation 的 groupId — 工作台 / 任务 / Brief 复用群聊后端。 */
  groupId?: string | null;
  /** 中栏头部点击的递增信号 — 触发右栏弹出「角色」tab。 */
  roleSignal?: number;
}

/**
 * PersonalRightPane — 个人态右栏（第三栏，常驻）。单排工作台外壳。可拖拽宽度、可收起。
 */
export function PersonalRightPane({ groupId, agent, roleSignal }: PersonalRightPaneProps) {
  const [collapsed, setCollapsed] = useState(false);
  // 可拖拽宽度（只在展开态生效）
  const { width, dragging, onDragStart } = useResizableWidth('sf-rightpane-w', 312, { min: 280, max: 720 });

  if (collapsed) {
    return (
      <div style={{ width: 40, flexShrink: 0, borderLeft: '1px solid var(--t-border)', background: 'var(--t-panel)', display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 10 }}>
        <button type="button" aria-label="展开右栏" title="展开右栏" onClick={() => setCollapsed(false)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t-fg-4)', padding: 6, borderRadius: 6 }}>
          <PanelRightOpen size={15} strokeWidth={1.75} />
        </button>
      </div>
    );
  }

  return (
    <div style={{ width, flexShrink: 0, borderLeft: '1px solid var(--t-border)', background: 'var(--t-panel)', display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative', userSelect: dragging ? 'none' : undefined }}>
      {/* 左边缘拖拽手柄 */}
      <div
        onMouseDown={onDragStart}
        title="拖拽调整宽度"
        style={{
          position: 'absolute', left: 0, top: 0, bottom: 0, width: 4,
          cursor: 'col-resize', zIndex: 10,
          background: dragging ? 'var(--t-accent-tint)' : 'transparent',
          transition: 'background 120ms',
        }}
      />
      <AgentWorkspacePane
        groupId={groupId}
        agent={agent}
        roleSignal={roleSignal}
        trailing={
          <button type="button" aria-label="收起右栏" title="收起右栏" onClick={() => setCollapsed(true)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t-fg-4)', padding: 6, borderRadius: 6, display: 'inline-flex', alignItems: 'center' }}>
            <PanelRightClose size={15} strokeWidth={1.75} />
          </button>
        }
      />
    </div>
  );
}
