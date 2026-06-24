/**
 * WorkbenchView — /chat?view=workbench 的三栏工作台（hermes-desktop / clawsgo 形态）。
 *
 * IN-PLACE 改造：不是新路由。它是 ChatHomePage 在 ?view=workbench 时渲染的第三种视图，
 * 与既有 team（ChatPage）/ personal（PersonalChatView）并列——只加不减（UI 保护规则）。
 *
 * 三栏（ThreeColumnShell 提供折叠/拖宽/localStorage 记忆）：
 *   LEFT   AgentTeamRail —— 选 Agent 或切换 Team（hermes ProfileSwitcher 两态语义 + clawsgo 切换动画）
 *   CENTER StudioChat   —— 统一对话气泡（turn-group，治「对话框乱」），内置 run-session SSE 流式
 *   RIGHT  WorkspacePane —— 打开项目文件 + 在选中工作目录里 WORK（递归树 + 高亮查看器 + 预览）
 *
 * 数据接线：
 *   - 左栏选中 agent/team → setTarget（喂给中栏 StudioChat 当对话对象）。
 *   - 右栏选中工作目录 → setContextFolder（喂给中栏 StudioChat 当 contextFolder = 后端 cwd）。
 *   两条线把「左挑人 / 中对话 / 右干活在同一工作区」闭环到一起。
 *
 * OWNER: left-rail（host page wires the panes）。右栏交互细节归 right-files，
 * 对话气泡归 chat-unify，动效打磨归 polish —— 各自在自己的组件文件里推进。
 */
import { useCallback, useState } from 'react';
import { ThreeColumnShell } from '../../components/workbench/ThreeColumnShell';
import { AgentTeamRail } from '../../components/workbench/AgentTeamRail';
import { StudioChat, type StudioChatTarget } from '../../components/workbench/StudioChat';
import { WorkspacePane } from '../../components/workbench/WorkspacePane';
import { useWorkspaceStore } from '../../store/workspaceStore';
import type { AgentRecord } from '../../api/agents';
import type { TeamRecord } from '../../api/teams';

export function WorkbenchView() {
  const workspaceId = useWorkspaceStore((s) => s.currentId);
  // 进入工作台时，若用户正处在某个 team 会话（store.currentTeam），把它作为中栏
  // 对话的初始对象 —— 从团队会话「跳进」工作台时上下文不丢，不再是空态等用户重选。
  // 仅取一次初值（lazy initializer）；之后用户在左栏自由切换，不被 store 反复覆盖。
  const currentTeam = useWorkspaceStore((s) => s.currentTeam);

  // 左栏选中的对话对象（agent / team）。null = 未选 → 中栏空态引导。
  const [target, setTarget] = useState<StudioChatTarget | null>(() =>
    currentTeam
      ? { kind: 'team', id: currentTeam.team_id, name: currentTeam.name }
      : null,
  );
  // 右栏选中的工作目录（绑定为中栏对话 contextFolder = 后端 cwd）。
  const [contextFolder, setContextFolder] = useState<string>('');

  const onSelectAgent = useCallback(
    (a: AgentRecord) => setTarget({ kind: 'agent', id: a.agent_id, name: a.name }),
    [],
  );
  const onSelectTeam = useCallback(
    (t: TeamRecord) => setTarget({ kind: 'team', id: t.team_id, name: t.name }),
    [],
  );

  return (
    <ThreeColumnShell
      leftRailLabel="Agents"
      rightRailLabel="Files"
      left={
        <AgentTeamRail
          workspaceId={workspaceId}
          // 从 team 会话带入初值时，左栏直接落在 Teams 态，选中的团队即刻可见。
          initialMode={currentTeam ? 'teams' : 'agents'}
          selectedAgentId={target?.kind === 'agent' ? target.id : null}
          selectedTeamId={target?.kind === 'team' ? target.id : null}
          onSelectAgent={onSelectAgent}
          onSelectTeam={onSelectTeam}
        />
      }
      center={<StudioChat target={target} contextFolder={contextFolder || undefined} />}
      right={<WorkspacePane onRootChange={setContextFolder} />}
    />
  );
}

export default WorkbenchView;
