/**
 * Neo (clawsgo-style chat-first 重构) 共享类型契约。
 * 所有 src/neo/ 组件跨文件引用此文件，禁止各自重复定义。
 */

/** 左栏当前选中对象：单个 Agent（个人）或一个 Team（团队）。 */
export interface NeoTarget {
  kind: 'agent' | 'team';
  id: string;
  name: string;
}

/** NeoRail props — 左栏导航。 */
export interface NeoRailProps {
  target: NeoTarget | null;
  onSelect: (t: NeoTarget) => void;
  onNewTask: () => void;
}

/** NeoChat props — 中栏聊天 + inline 任务执行。 */
export interface NeoChatProps {
  target: NeoTarget | null;
  /** 当前关联的 workflow run（右栏 NeoHost 同步展示）；无运行为 null。 */
  runId: string | null;
  /** run 启动/结束时回调，NeoApp 持有 runId 状态。 */
  onRunChange: (runId: string | null) => void;
}

/** NeoHost props — 右栏「Agent 的主机」。 */
export interface NeoHostProps {
  target: NeoTarget | null;
  runId: string | null;
}
