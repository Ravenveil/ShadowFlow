import { useCallback, useEffect, useRef, useState } from 'react';
import {
  addEdge,
  Handle,
  Position,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeTypes,
} from 'reactflow';
import 'reactflow/dist/style.css';
import type { AgentRecord } from '../../../api/agents';
import type { TeamRecord, TeamWorkflowEdge, TeamWorkflowNode } from '../../../api/teams';
import { getTeamWorkflow, putTeamWorkflow } from '../../../api/teams';
import SfReactFlowBase from '../Canvas/SfReactFlowBase';

interface AgentTaskNodeData {
  agentId: string;
  name: string;
  soul: string;
}

function AgentTaskNode({ data }: { data: AgentTaskNodeData }) {
  return (
    <div className="rounded border border-white/20 bg-shadowflow-surface px-3 py-2 min-w-[120px] text-[12px]">
      <Handle type="target" position={Position.Left} />
      <p className="font-medium text-white/90">{data.name}</p>
      <p className="mt-0.5 text-white/40 text-[10px] truncate max-w-[160px]">
        {data.soul.length > 35 ? data.soul.slice(0, 35) + '…' : data.soul}
      </p>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const NODE_TYPES: NodeTypes = { agentTask: AgentTaskNode };

interface TeamWorkflowEditorProps {
  team: TeamRecord;
  agents: AgentRecord[];
}

function TeamWorkflowEditorInner({ team, agents }: TeamWorkflowEditorProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<AgentTaskNodeData>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const { screenToFlowPosition } = useReactFlow();
  const dragOverRef = useRef(false);

  useEffect(() => {
    getTeamWorkflow(team.team_id).then((wf) => {
      setNodes(wf.nodes as Node<AgentTaskNodeData>[]);
      setEdges(wf.edges as Edge[]);
    });
  }, [team.team_id, setNodes, setEdges]);

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            data: { mode: 'direct' },
            label: '直接传递',
            style: { stroke: 'rgba(255,255,255,0.4)' },
          },
          eds,
        ),
      );
    },
    [setEdges],
  );

  const onEdgeClick = useCallback(
    (_: React.MouseEvent, edge: Edge) => {
      const currentMode = (edge.data as { mode: 'direct' | 'approve' } | undefined)?.mode ?? 'direct';
      const nextMode = currentMode === 'direct' ? 'approve' : 'direct';
      setEdges((eds) =>
        eds.map((e) =>
          e.id === edge.id
            ? {
                ...e,
                data: { mode: nextMode },
                label: nextMode === 'direct' ? '直接传递' : '需审批',
                style: {
                  stroke: nextMode === 'approve' ? '#F59E0B' : 'rgba(255,255,255,0.4)',
                },
              }
            : e,
        ),
      );
    },
    [setEdges],
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    dragOverRef.current = true;
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const agentId = e.dataTransfer.getData('agentId');
      const agent = agents.find((a) => a.agent_id === agentId);
      if (!agent) return;
      const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      setNodes((ns) => [
        ...ns,
        {
          id: `node-${Date.now()}`,
          type: 'agentTask',
          position: pos,
          data: { agentId: agent.agent_id, name: agent.name, soul: agent.soul },
        },
      ]);
    },
    [agents, screenToFlowPosition, setNodes],
  );

  const handleSave = async () => {
    setSaving(true);
    try {
      const workflow = {
        nodes: nodes.map((n) => ({
          id: n.id,
          type: n.type ?? 'agentTask',
          position: n.position,
          data: n.data,
        })) as TeamWorkflowNode[],
        edges: edges.map((e) => ({
          id: e.id,
          source: e.source,
          target: e.target,
          data: e.data as { mode: 'direct' | 'approve' } | undefined,
          label: typeof e.label === 'string' ? e.label : undefined,
        })) as TeamWorkflowEdge[],
      };
      await putTeamWorkflow(team.team_id, workflow);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-[480px] gap-3">
      {/* Agent 面板 */}
      <div className="flex w-[160px] shrink-0 flex-col gap-2 overflow-y-auto rounded border border-shadowflow-border bg-white/[0.02] p-2">
        <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-white/40">
          拖入画布
        </p>
        {agents.length === 0 ? (
          <p className="text-[11px] text-white/30">无成员</p>
        ) : (
          agents.map((agent) => (
            <div
              key={agent.agent_id}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('agentId', agent.agent_id);
                e.dataTransfer.effectAllowed = 'move';
              }}
              className="cursor-grab rounded border border-shadowflow-border bg-shadowflow-surface px-2 py-1.5 text-[11px] active:cursor-grabbing"
              data-testid={`agent-panel-${agent.agent_id}`}
            >
              <p className="font-medium text-white/80">{agent.name}</p>
              <p className="truncate text-[10px] text-white/40">
                {agent.soul.length > 30 ? agent.soul.slice(0, 30) + '…' : agent.soul}
              </p>
            </div>
          ))
        )}
      </div>

      {/* ReactFlow 画布 — uses shared SfReactFlowBase shell */}
      <div className="relative flex-1 overflow-hidden rounded border border-shadowflow-border">
        <SfReactFlowBase
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onEdgeClick={onEdgeClick}
          onDrop={onDrop}
          onDragOver={onDragOver}
          nodeTypes={NODE_TYPES}
          withProvider={false}
          showMiniMap
        />

        {/* 保存按钮 */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="absolute bottom-3 right-3 z-10 rounded border border-white/20 bg-white/5 px-3 py-1.5 text-[12px] text-white/70 hover:bg-white/10 disabled:opacity-40"
          data-testid="btn-save-workflow"
        >
          {saving ? '保存中…' : saved ? '已保存 ✓' : '保存工作流'}
        </button>
      </div>
    </div>
  );
}

export function TeamWorkflowEditor(props: TeamWorkflowEditorProps) {
  // Wrap in ReactFlowProvider so useReactFlow() inside Inner works. The
  // SfReactFlowBase has its own provider too but we need this outer one
  // for the screenToFlowPosition call in onDrop.
  return (
    <ReactFlowProvider>
      <TeamWorkflowEditorInner {...props} />
    </ReactFlowProvider>
  );
}
