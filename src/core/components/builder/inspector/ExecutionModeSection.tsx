/**
 * ExecutionModeSection — Story 13.2 (AC1, AC2, AC5)
 *
 * Blueprint 级别的执行方式选择区域：
 *   - ReAct 循环（默认）
 *   - 绑定工作流 → 工作流选择器（WorkflowRefSelect）
 *
 * 挂载在 RoleProfilePanel 手风琴"执行方式"分组内。
 * execution_mode 属于 AgentBlueprint 而非 RoleProfile，
 * 因此 props 直接接收 blueprintExecutionMode + onUpdate。
 */
import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { listTemplates } from '../../../../api/templates';
import type { ExecutionMode } from '../../../../common/types/agent-builder';
import type { TemplateListItem } from '../../../../api/templates';

// ---------------------------------------------------------------------------
// WorkflowRefSelect — 子组件：工作流下拉选择器
// ---------------------------------------------------------------------------

interface WorkflowRefSelectProps {
  currentRef?: string;
  onBind: (workflowRef: string, workflowName: string) => void;
}

function WorkflowRefSelect({ currentRef, onBind }: WorkflowRefSelectProps) {
  const [workflows, setWorkflows] = useState<TemplateListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    setLoading(true);
    setError(null);
    listTemplates()
      .then((list) => {
        setWorkflows(list);
      })
      .catch(() => {
        setError('无法加载工作流列表');
      })
      .finally(() => setLoading(false));
  }, [retryCount]);

  const filtered = workflows.filter((w) =>
    w.name.toLowerCase().includes(search.toLowerCase()) ||
    w.description?.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="mt-2 space-y-2" data-testid="workflow-ref-select">
      {/* 搜索框 */}
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="搜索工作流…"
        className="w-full rounded-[7px] border border-sf-border bg-sf-elev1 px-2.5 py-1.5 text-[11px] text-sf-fg1 placeholder:text-sf-fg5 focus:border-sf-accent focus:outline-none"
      />

      {/* 列表 */}
      {loading && (
        <p className="font-mono text-[10px] text-sf-fg5">加载中…</p>
      )}
      {error && (
        <div className="flex items-center gap-2">
          <p className="font-mono text-[10px] text-sf-reject">{error}</p>
          <button
            type="button"
            data-testid="workflow-retry-btn"
            onClick={() => setRetryCount(n => n + 1)}
            className="font-mono text-[10px] text-sf-accent-bright hover:underline"
          >
            重试
          </button>
        </div>
      )}
      {!loading && !error && filtered.length === 0 && (
        <p className="font-mono text-[10px] text-sf-fg5">暂无工作流</p>
      )}
      {!loading && !error && filtered.length > 0 && (
        <div className="max-h-40 overflow-auto rounded-[7px] border border-sf-border bg-sf-elev1">
          {filtered.map((wf) => (
            <button
              key={wf.template_id}
              type="button"
              onClick={() => onBind(wf.template_id, wf.name)}
              className={[
                'flex w-full flex-col px-3 py-2 text-left transition-colors hover:bg-sf-elev2',
                currentRef === wf.template_id ? 'bg-sf-accent-tint' : '',
              ].join(' ')}
            >
              <span
                className={[
                  'text-[12px] font-medium',
                  currentRef === wf.template_id ? 'text-sf-accent-bright' : 'text-sf-fg1',
                ].join(' ')}
              >
                {wf.name}
              </span>
              {wf.description && (
                <span className="mt-0.5 font-mono text-[10px] text-sf-fg4 line-clamp-1">
                  {wf.description}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* 前往 Workflow Editor 创建新工作流（AC5）
          L1 follow-up: 用 React Router <Link>，避免原生 <a> 全页刷新丢失 builder 状态。 */}
      <Link
        to="/editor?return_to=builder"
        data-testid="goto-workflow-editor-link"
        className="block font-mono text-[10px] text-sf-accent-bright underline-offset-2 hover:underline"
      >
        ＋ 前往 Workflow Editor 创建新工作流
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ExecutionModeSection — 主体
// ---------------------------------------------------------------------------

export interface ExecutionModeSectionProps {
  executionMode?: ExecutionMode;
  onUpdate: (em: ExecutionMode) => void;
}

export function ExecutionModeSection({ executionMode, onUpdate }: ExecutionModeSectionProps) {
  const currentMode = executionMode?.mode ?? 'react';

  function selectReact() {
    onUpdate({ mode: 'react' });
  }

  function selectWorkflow() {
    onUpdate({
      mode: 'workflow',
      workflow_ref: executionMode?.workflow_ref,
      workflow_name: executionMode?.workflow_name,
    });
  }

  function handleBind(workflowRef: string, workflowName: string) {
    onUpdate({ mode: 'workflow', workflow_ref: workflowRef, workflow_name: workflowName });
  }

  function handleUnbind() {
    onUpdate({ mode: 'react' });
  }

  return (
    <div className="space-y-3" data-testid="execution-mode-section">
      {/* ToggleGroup
          M2 follow-up: 暴露 aria-pressed + data-active，让测试 / 无障碍工具不再依赖
          Tailwind className 判断激活态。 */}
      <div className="flex gap-2" role="group" aria-label="执行方式">
        <button
          type="button"
          data-testid="mode-react-btn"
          data-active={currentMode === 'react' ? 'true' : 'false'}
          aria-pressed={currentMode === 'react'}
          onClick={selectReact}
          className={[
            'rounded-[6px] border px-3 py-1.5 text-[11px] font-semibold transition-colors',
            currentMode === 'react'
              ? 'border-sf-accent bg-sf-accent-tint text-sf-accent-bright'
              : 'border-sf-border bg-sf-elev2 text-sf-fg3 hover:text-sf-fg1',
          ].join(' ')}
        >
          ReAct 循环
        </button>
        <button
          type="button"
          data-testid="mode-workflow-btn"
          data-active={currentMode === 'workflow' ? 'true' : 'false'}
          aria-pressed={currentMode === 'workflow'}
          onClick={selectWorkflow}
          className={[
            'rounded-[6px] border px-3 py-1.5 text-[11px] font-semibold transition-colors',
            currentMode === 'workflow'
              ? 'border-sf-accent bg-sf-accent-tint text-sf-accent-bright'
              : 'border-sf-border bg-sf-elev2 text-sf-fg3 hover:text-sf-fg1',
          ].join(' ')}
        >
          绑定工作流
        </button>
      </div>

      {/* 已绑定状态 */}
      {currentMode === 'workflow' && executionMode?.workflow_ref && (
        <div className="flex items-center justify-between rounded-[7px] border border-sf-accent/40 bg-sf-accent-tint px-3 py-2">
          <div>
            <p className="text-[12px] font-medium text-sf-accent-bright">
              {executionMode.workflow_name ?? executionMode.workflow_ref}
            </p>
            <p className="font-mono text-[9px] text-sf-fg4">{executionMode.workflow_ref}</p>
          </div>
          <button
            type="button"
            data-testid="unbind-workflow-btn"
            onClick={handleUnbind}
            className="rounded-[5px] border border-sf-border bg-sf-elev2 px-2 py-1 text-[10px] text-sf-fg3 hover:text-sf-reject"
          >
            解除绑定
          </button>
        </div>
      )}

      {/* 工作流选择器（已切换工作流模式但未绑定时展开） */}
      {currentMode === 'workflow' && !executionMode?.workflow_ref && (
        <WorkflowRefSelect
          currentRef={executionMode?.workflow_ref}
          onBind={handleBind}
        />
      )}
    </div>
  );
}
