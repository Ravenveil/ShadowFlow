/**
 * ArtifactsView — NeoHost「产物」tab 升级版（阶段 2.3）。
 *
 * 数据源（真实端点，不 mock）：
 *   - GET /api/runs/{id}/artifact-lineage   → ArtifactLineageProjection
 *       artifact 节点：label=产物名，metadata.kind / metadata.uri；
 *       produces_artifact 边：step → artifact（step.label = 产生它的节点 id）
 *   - GET /api/runs/{id}/checkpoint-lineage → CheckpointLineageProjection
 *       checkpoint 节点：label=current_node_id，timestamps.created_at；
 *       creates_checkpoint 边：step → checkpoint
 *
 * 点击预览：artifact 节点新增 `preview_url` 字段时优先用作直链预览；
 * 否则 uri 为 http(s)/站内绝对路径时直接用作预览地址；再否则当产物名与
 * RunRecord.artifact_filename 匹配（或该 run 只有这一条产物）时回落到
 * RunRecord.artifact_url。三条都解析不出 → 行不可点（不伪造地址）。
 *
 * 回落：artifact-lineage 拉取失败或没有任何 artifact 节点时，退回旧行为——
 * 仅按 RunRecord.artifact_* 渲染单条产物行。
 *
 * 收尾轮（GAP :14/:15）：filecard 右侧置顶图标（POST /api/artifacts/{id}/pin
 * toggle，置顶项排前）；副标题优先显示 metadata.summary（内容首 ~120 字符
 * 纯文本摘要，后端写入时落），无 summary 回落 producer。
 */
import { useEffect, useState } from 'react';
import { Bookmark, Braces, FileCode, FileText, Pin } from 'lucide-react';
import {
  getArtifactLineage,
  getCheckpointLineage,
  toggleArtifactPin,
  type ArtifactLineageProjection,
  type CheckpointLineageProjection,
  type RunRecord,
} from '../../api/runs';
import { useI18n } from '../../common/i18n';

/** 一条可渲染的 lineage 产物（已从投影图解包）。 */
export interface LineageArtifact {
  id: string;
  name: string;
  kind: string;
  /** 可预览地址；解析不出为 null（行渲染为不可点）。 */
  url: string | null;
  /** 产生它的节点 label（step.node_id）；未知为 null。 */
  producer: string | null;
  /** filecard 副标题：内容首 ~120 字符纯文本摘要（后端写入时落）；无则回落 producer。 */
  summary: string | null;
  /** 置顶标记（投影 metadata.pinned；toggle 后由本地 override 覆盖）。 */
  pinned: boolean;
}

interface CheckpointItem {
  id: string;
  label: string;
  createdAt: string | null;
  /** 创建它的 step（node_id）；未知为 null。 */
  step: string | null;
}

export interface ArtifactsViewProps {
  runId: string;
  /** SSE 仍在流 → 5s 轮询 lineage。 */
  active: boolean;
  /** 旧单产物行为的数据源 + 预览 URL 回落依据。 */
  runRecord: RunRecord | null;
  /** 点击产物行 → 父层开产物 tab（NeoArtifactPreview）。 */
  onOpen: (item: LineageArtifact) => void;
  /** 回落模式下点击 RunRecord 单条产物 → 父层旧 openArtifactTab。 */
  onOpenRecord: (rec: RunRecord) => void;
}

/** 预览地址解析优先级：preview_url（后端直链字段）> metadata.uri > RunRecord 文件名回落。 */
function resolveUrl(previewUrl: unknown, uri: unknown, name: string, runRecord: RunRecord | null, single: boolean): string | null {
  for (const cand of [previewUrl, uri]) {
    if (typeof cand === 'string' && /^(https?:\/\/|\/)/.test(cand)) return cand;
  }
  if (runRecord?.artifact_url && (single || runRecord.artifact_filename === name)) {
    return runRecord.artifact_url;
  }
  return null;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v ? v : null;
}

/** 产物类型图标（done.html filecard 文档角块内的白色小图标；按 kind 真实区分）。 */
function artifactKindIcon(kind: string) {
  const k = kind.toLowerCase();
  if (k.includes('html')) return <FileCode size={12} strokeWidth={2} />;
  if (k.includes('yaml') || k.includes('yml')) return <Braces size={12} strokeWidth={2} />;
  return <FileText size={12} strokeWidth={2} />;
}

export function ArtifactsView({ runId, active, runRecord, onOpen, onOpenRecord }: ArtifactsViewProps) {
  const { t } = useI18n();
  const [lineage, setLineage] = useState<ArtifactLineageProjection | null>(null);
  const [checkpoints, setCheckpoints] = useState<CheckpointLineageProjection | null>(null);
  const [lineageFailed, setLineageFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // pin toggle 的本地 override：点击立即生效，后端确认后校准（投影 5s 轮询有滞后）
  const [pinOverrides, setPinOverrides] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      Promise.all([
        getArtifactLineage(runId).then(
          (p) => ({ p }),
          () => ({ p: null }),
        ),
        getCheckpointLineage(runId).then(
          (c) => ({ c }),
          () => ({ c: null }),
        ),
      ]).then(([a, b]) => {
        if (cancelled) return;
        setLineage(a.p);
        setLineageFailed(a.p === null);
        setCheckpoints(b.c);
        setLoaded(true);
      });
    };
    setLoaded(false);
    load();
    if (!active) return () => { cancelled = true; };
    const timer = setInterval(load, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [runId, active]);

  // ── 解包 artifact 节点 + producer（produces_artifact 边 → step 节点）──
  const artifacts: LineageArtifact[] = [];
  if (lineage) {
    const stepLabelById = new Map(
      lineage.nodes.filter((n) => n.entity_type === 'step').map((n) => [n.id, n.label || n.id]),
    );
    const producerByArtifact = new Map<string, string>();
    for (const e of lineage.edges) {
      if (e.edge_type !== 'produces_artifact') continue;
      const label = stepLabelById.get(e.from_id);
      if (label) producerByArtifact.set(e.to_id, label);
    }
    const artifactNodes = lineage.nodes.filter((n) => n.entity_type === 'artifact');
    for (const n of artifactNodes) {
      const name = n.label || n.id;
      artifacts.push({
        id: n.id,
        name,
        kind: str(n.metadata.kind) ?? '',
        url: resolveUrl(n.metadata.preview_url, n.metadata.uri, name, runRecord, artifactNodes.length === 1),
        producer: producerByArtifact.get(n.id) ?? null,
        summary: str(n.metadata.summary),
        pinned: n.metadata.pinned === true,
      });
    }
  }

  /** 有效置顶态（本地 override 优先于投影快照）。 */
  const effPinned = (a: LineageArtifact) => pinOverrides[a.id] ?? a.pinned;
  // 置顶项排前（稳定排序，同组内保持 lineage 原始顺序）
  const sortedArtifacts = [...artifacts].sort((x, y) => Number(effPinned(y)) - Number(effPinned(x)));

  const handleTogglePin = (e: React.MouseEvent, a: LineageArtifact) => {
    e.stopPropagation();
    const current = effPinned(a);
    setPinOverrides((prev) => ({ ...prev, [a.id]: !current }));
    toggleArtifactPin(a.id).then(
      (s) => setPinOverrides((prev) => ({ ...prev, [a.id]: s.pinned })),
      () => setPinOverrides((prev) => ({ ...prev, [a.id]: current })),
    );
  };

  /** filecard 右侧置顶图标（span 而非 button——外层行本身可能是 <button>）。 */
  const renderPin = (a: LineageArtifact) => {
    const on = effPinned(a);
    return (
      <span
        role="button"
        tabIndex={0}
        className={`neo-host-artifact-pin${on ? ' neo-host-artifact-pin--on' : ''}`}
        title={on
          ? t('neo.host.unpinArtifact', { defaultValue: '取消置顶' })
          : t('neo.host.pinArtifact', { defaultValue: '置顶' })}
        onClick={(e) => handleTogglePin(e, a)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') handleTogglePin(e as unknown as React.MouseEvent, a);
        }}
      >
        <Pin size={12} strokeWidth={2} fill={on ? 'currentColor' : 'none'} />
      </span>
    );
  };

  // ── 解包 checkpoint 节点 ──
  const checkpointItems: CheckpointItem[] = [];
  if (checkpoints) {
    const stepLabelById = new Map(
      checkpoints.nodes.filter((n) => n.entity_type === 'step').map((n) => [n.id, n.label || n.id]),
    );
    const stepByCheckpoint = new Map<string, string>();
    for (const e of checkpoints.edges) {
      if (e.edge_type !== 'creates_checkpoint') continue;
      const label = stepLabelById.get(e.from_id);
      if (label) stepByCheckpoint.set(e.to_id, label);
    }
    for (const n of checkpoints.nodes) {
      if (n.entity_type !== 'checkpoint') continue;
      checkpointItems.push({
        id: n.id,
        label: n.label || n.id,
        createdAt: n.timestamps.created_at ?? null,
        step: stepByCheckpoint.get(n.id) ?? null,
      });
    }
  }

  // ── 回落：lineage 失败或无 artifact 节点 → 旧单条 RunRecord 行为 ──
  const useLegacy = loaded && (lineageFailed || artifacts.length === 0);

  if (!loaded) {
    return (
      <div className="neo-host-list">
        <div className="neo-host-tree-note neo-host-tree-note--pad">
          {t('neo.host.loading', { defaultValue: '读取中…' })}
        </div>
      </div>
    );
  }

  const legacyRow = runRecord?.artifact_url ? (
    <button
      type="button"
      className="neo-host-artifact-row"
      onClick={() => onOpenRecord(runRecord)}
    >
      <span className="neo-host-artifact-chip">
        {artifactKindIcon(runRecord.artifact_type ?? 'markdown')}
      </span>
      <span className="neo-host-artifact-main">
        <span className="neo-host-artifact-name">
          {runRecord.artifact_filename ?? runRecord.artifact_url.split('/').pop() ?? runRecord.goal}
        </span>
      </span>
      <span className="neo-host-artifact-type">
        {(runRecord.artifact_type ?? '').toUpperCase()}
      </span>
    </button>
  ) : null;

  const emptyHint = useLegacy && !legacyRow && checkpointItems.length === 0;

  return (
    <div className="neo-host-list">
      {/* 产物列表 */}
      {useLegacy ? (
        legacyRow
      ) : (
        sortedArtifacts.map((a) => {
          // 副标题：summary（内容摘要）优先，无则回落 producer（现状）
          const subtitle = a.summary ?? a.producer;
          return a.url ? (
            <button
              key={a.id}
              type="button"
              className="neo-host-artifact-row"
              onClick={() => onOpen(a)}
            >
              <span className="neo-host-artifact-chip">{artifactKindIcon(a.kind)}</span>
              <span className="neo-host-artifact-main">
                <span className="neo-host-artifact-name">{a.name}</span>
                {subtitle && (
                  <span className="neo-host-artifact-producer" title={subtitle}>
                    {subtitle}
                  </span>
                )}
              </span>
              {renderPin(a)}
              <span className="neo-host-artifact-type">{a.kind.toUpperCase()}</span>
            </button>
          ) : (
            <div key={a.id} className="neo-host-artifact-row neo-host-artifact-row--static">
              <span className="neo-host-artifact-chip">{artifactKindIcon(a.kind)}</span>
              <span className="neo-host-artifact-main">
                <span className="neo-host-artifact-name">{a.name}</span>
                {subtitle && (
                  <span className="neo-host-artifact-producer" title={subtitle}>
                    {subtitle}
                  </span>
                )}
              </span>
              {renderPin(a)}
              <span className="neo-host-artifact-type">{a.kind.toUpperCase()}</span>
            </div>
          );
        })
      )}

      {/* checkpoint 列表（有数据才出 section） */}
      {checkpointItems.length > 0 && (
        <div className="neo-host-sec">
          <div className="neo-host-sec-head">
            <Bookmark size={12} strokeWidth={1.8} />
            <span className="neo-host-sec-title">
              {t('neo.host.checkpoints', { defaultValue: '检查点' })}
            </span>
            <span className="neo-host-sec-meta">{checkpointItems.length}</span>
          </div>
          {checkpointItems.map((c) => (
            <div key={c.id} className="neo-host-checkpoint-row">
              <span className="neo-host-checkpoint-label" title={c.id}>
                {c.label}
              </span>
              {c.step && <span className="neo-host-artifact-producer">{c.step}</span>}
              {c.createdAt && (
                <span className="neo-host-checkpoint-time">
                  {c.createdAt.replace('T', ' ').slice(0, 19)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {emptyHint && (
        <div className="neo-host-empty neo-host-empty--fill">
          {t('neo.host.noArtifacts', { defaultValue: '该运行尚未产出工件' })}
        </div>
      )}
    </div>
  );
}

export default ArtifactsView;
