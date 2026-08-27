/**
 * EvidencePanel — memory-graph / training-dataset 投影露出（GAP B40）。
 *
 * api/runs.ts 早已封装两个投影端点但前端无入口，本组件挂在 NeoHost「过程」
 * tab 迭代环下方：
 *   - GET /api/runs/{id}/memory-graph     → MemoryRelationProjection
 *       渲染：节点/边计数 + entity_type 分布 chips + 记忆/激活类节点行
 *   - GET /api/runs/{id}/training-dataset → ActivationTrainingDataset
 *       渲染：样本计数 + 每样本行（node_id · 激活决策 · 候选选中比）
 *
 * 分段切换懒加载（各自缓存一次），`active`（SSE 仍在流）时 5s 轮询当前段。
 * 端点 404/失败 → 干净空态，不 mock。
 */
import { useEffect, useState } from 'react';
import { Brain, Database } from 'lucide-react';
import {
  getActivationTrainingDataset,
  getMemoryGraph,
  type ActivationTrainingDataset,
  type MemoryRelationProjection,
  type ProjectionNode,
} from '../../api/runs';
import { useI18n } from '../../common/i18n';

export interface EvidencePanelProps {
  runId: string;
  /** SSE 仍在流 → 5s 轮询当前段。 */
  active: boolean;
}

type Seg = 'memory' | 'dataset';

/** 证据语义相关的节点类型（其余 run/task/step 骨架节点不逐行铺）。 */
const EVIDENCE_ENTITY_TYPES = new Set([
  'memory_event',
  'activation',
  'activation_candidate',
  'feedback_signal',
]);

function entityCounts(nodes: ProjectionNode[]): Array<[string, number]> {
  const m = new Map<string, number>();
  for (const n of nodes) m.set(n.entity_type, (m.get(n.entity_type) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}

export function EvidencePanel({ runId, active }: EvidencePanelProps) {
  const { t } = useI18n();
  const [seg, setSeg] = useState<Seg>('memory');
  const [memory, setMemory] = useState<MemoryRelationProjection | null>(null);
  const [memoryFailed, setMemoryFailed] = useState(false);
  const [memoryLoaded, setMemoryLoaded] = useState(false);
  const [dataset, setDataset] = useState<ActivationTrainingDataset | null>(null);
  const [datasetFailed, setDatasetFailed] = useState(false);
  const [datasetLoaded, setDatasetLoaded] = useState(false);

  // 记忆图谱段：进入才拉取；流式期间 5s 轮询。
  useEffect(() => {
    if (seg !== 'memory') return;
    let cancelled = false;
    const load = () => {
      getMemoryGraph(runId).then(
        (p) => {
          if (cancelled) return;
          setMemory(p);
          setMemoryFailed(false);
          setMemoryLoaded(true);
        },
        () => {
          if (cancelled) return;
          setMemory(null);
          setMemoryFailed(true);
          setMemoryLoaded(true);
        },
      );
    };
    load();
    if (!active) return () => { cancelled = true; };
    const timer = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [seg, runId, active]);

  // 训练数据集段：同上。
  useEffect(() => {
    if (seg !== 'dataset') return;
    let cancelled = false;
    const load = () => {
      getActivationTrainingDataset(runId).then(
        (d) => {
          if (cancelled) return;
          setDataset(d);
          setDatasetFailed(false);
          setDatasetLoaded(true);
        },
        () => {
          if (cancelled) return;
          setDataset(null);
          setDatasetFailed(true);
          setDatasetLoaded(true);
        },
      );
    };
    load();
    if (!active) return () => { cancelled = true; };
    const timer = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [seg, runId, active]);

  const loadingNote = (
    <div className="neo-host-tree-note neo-host-tree-note--pad">
      {t('neo.host.loading', { defaultValue: '读取中…' })}
    </div>
  );

  const memoryNodes = memory?.nodes ?? [];
  const evidenceNodes = memoryNodes.filter((n) => EVIDENCE_ENTITY_TYPES.has(n.entity_type));

  const memoryBody = !memoryLoaded ? (
    loadingNote
  ) : memoryFailed ? (
    <div className="neo-host-tree-note neo-host-tree-note--pad">
      {t('neo.host.evidenceError', { defaultValue: '该运行暂无记忆图谱投影' })}
    </div>
  ) : memoryNodes.length === 0 ? (
    <div className="neo-host-tree-note neo-host-tree-note--pad">
      {t('neo.host.evidenceEmpty', { defaultValue: '（投影为空）' })}
    </div>
  ) : (
    <>
      <div className="neo-host-evidence-meta">
        {t('neo.host.evidenceGraphMeta', {
          defaultValue: '{{nodes}} 节点 · {{edges}} 边',
          nodes: memoryNodes.length,
          edges: memory?.edges.length ?? 0,
        })}
      </div>
      <div className="neo-host-evidence-chips">
        {entityCounts(memoryNodes).map(([kind, count]) => (
          <span key={kind} className="neo-host-pill neo-host-pill--muted">
            {kind} ×{count}
          </span>
        ))}
      </div>
      {evidenceNodes.map((n) => (
        <div key={n.id} className="neo-host-ptree-row">
          <span className="neo-host-ptree-tag">{n.entity_type}</span>
          <span className="neo-host-ptree-label" title={n.id}>
            {n.label || n.id}
          </span>
          {n.status && (
            <span className="neo-host-pill neo-host-pill--muted">{n.status}</span>
          )}
        </div>
      ))}
    </>
  );

  const samples = dataset?.samples ?? [];

  const datasetBody = !datasetLoaded ? (
    loadingNote
  ) : datasetFailed ? (
    <div className="neo-host-tree-note neo-host-tree-note--pad">
      {t('neo.host.datasetError', { defaultValue: '该运行暂无训练数据集投影' })}
    </div>
  ) : samples.length === 0 ? (
    <div className="neo-host-tree-note neo-host-tree-note--pad">
      {t('neo.host.evidenceEmpty', { defaultValue: '（投影为空）' })}
    </div>
  ) : (
    <>
      <div className="neo-host-evidence-meta">
        {t('neo.host.datasetMeta', { defaultValue: '{{count}} 条样本', count: samples.length })}
      </div>
      {samples.map((s) => (
        <div key={s.sample_id} className="neo-host-ptree-row" title={s.sample_id}>
          <span className="neo-host-ptree-tag">{s.activation_mode}</span>
          <span className="neo-host-ptree-label">{s.node_id}</span>
          <span className="neo-host-pill neo-host-pill--muted">{s.activation_decision}</span>
          <span className="neo-host-evidence-cand">
            {t('neo.host.datasetCands', {
              defaultValue: '候选 {{picked}}/{{total}}',
              picked: s.selected_candidate_count,
              total: s.candidate_count,
            })}
          </span>
        </div>
      ))}
    </>
  );

  return (
    <div className="neo-host-evidence">
      <div className="neo-host-seg neo-host-evidence-seg">
        <button
          type="button"
          className={`neo-host-seg-btn${seg === 'memory' ? ' neo-host-seg-btn--on' : ''}`}
          onClick={() => setSeg('memory')}
        >
          <Brain size={11} strokeWidth={2} aria-hidden />
          {t('neo.host.evidenceMemory', { defaultValue: '记忆图谱' })}
        </button>
        <button
          type="button"
          className={`neo-host-seg-btn${seg === 'dataset' ? ' neo-host-seg-btn--on' : ''}`}
          onClick={() => setSeg('dataset')}
        >
          <Database size={11} strokeWidth={2} aria-hidden />
          {t('neo.host.evidenceDataset', { defaultValue: '训练数据集' })}
        </button>
      </div>
      {seg === 'memory' ? memoryBody : datasetBody}
    </div>
  );
}

export default EvidencePanel;
