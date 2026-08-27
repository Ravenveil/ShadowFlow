/**
 * NeoHost — Neo 右栏「Agent 的主机」（对标 clawsgo c1_05/c1_07/c2_02/c2_03）。
 *
 * 顶部 tab：固定集 工作空间 / 产物 / 过程（+ 条件性的灵魂/编队/成员）保持原样；
 * 动态产物 tab（2026-08-23，对标 clawsgo c1_05/c1_07/c2_02/c2_03）：点「产物」
 * 行 / 「历史」行进入的 run 产物、或产物出现时自动开——在 tab 条追加一个以
 * 产物文件名命名的临时 tab（图标盒右上角 × 关闭，关闭激活 tab 回落「产物」）；
 * 同一产物重复点击聚焦已有 tab 不重复开；tab 条溢出横滚（safe center）。
 *
 * - 工作空间：左文件树（listDirs 懒加载展开、类型图标、选中高亮）+ 右预览
 *   （markdown → NeoMarkdown；代码 → 等宽+行号；图片 → rawUrl <img>；
 *   工具条：预览/代码切换、下载、关闭）。
 * - 产物：runId 非空时经 listRuns() 取该 run 的 RunRecord（artifact_url /
 *   artifact_type / artifact_filename 为后端真实落库字段），点击开产物 tab，
 *   预览走 Neo 自有 projections/NeoArtifactPreview（阶段 2.5：done.html
 *   filecard + 大纲 + markdown 双栏视觉；下载/导出端点不变）。
 * - Loop：SSE `loop` 帧（useRunSession）优先 → loops/stream SSE → 一次性
 *   getRunLoops 回落（src/api/runs.ts，返回 RunLoopsResponse，LoopStep[]
 *   按 loop_id 去重）→ PDCA 迭代卡（kind/setpoint/状态 pill +
 *   迭代列表：轮次 · verifier_score · metrics 迷你条形 · sensor.classification +
 *   每环 verifier 面板 LoopVerdicts：每轮 rationale + claims），分形深度用缩进。
 * - 过程（阶段 2.3）：src/neo/projections/ProcessView — getRunGraph +
 *   getTaskTree，节点轨 + 边 chips + 缩进任务树；SSE 流式期间 5s 轮询。
 *   run 开始执行时自动露出一次（同一 run 不重复抢 tab）。下方并挂迭代环区
 *   （PDCA 卡 + 每环 LoopVerdicts 验证意见）与证据投影区（B40：
 *   src/neo/projections/EvidencePanel — memory-graph / training-dataset）。
 * - 产物（阶段 2.3 升级）：src/neo/projections/ArtifactsView —
 *   artifact-lineage + checkpoint-lineage 产物/检查点列表；无 lineage 数据时
 *   回落到 RunRecord.artifact_* 单条旧行为；点击开 NeoArtifactPreview tab。
 * - 编队（阶段 2.4 切面，target.kind==='team' 时出现）：
 *   src/neo/projections/TeamPanel — roster + workflow DAG 摘要 + policy 要点 +
 *   per-node 输出归属（useRunSession.perNodeChunks；本组件对同一 session 另挂
 *   一条只读 SSE 视图，server runBus 支持多 sink attach + 全量 replay）。
 * - 灵魂（2026-08-22，soulAgent 非空时出现：agent-target 或 agent 的 DM 会话）：
 *   内嵌 NeoAgentSoul — persona/系统提示词编辑（GET + PATCH /api/agents）。
 * - 成员（2026-08-22 W2 钉钉式融合，conversation 非 DM 时出现）：标题变
 *   「团队的主机」，内嵌 projections/GroupMembersPanel — 成员列表（头像 +
 *   状态点 + 角色 badge）+ 团队 DAG 摘要 + 审批门（approve 边；无则空态）。
 *
 * 不 mock、不加 placeholder；runId 为空 = 整体空态；数据缺失 = 干净空态。
 * 颜色一律 var(--t-*) / color-mix，day/night 双主题安全；样式全在 neo-host.css。
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ChangeEvent, ReactNode } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Code,
  Database,
  Download,
  Eye,
  FileCode,
  FileImage,
  FilePlus2,
  FileText,
  Folder,
  FolderOpen,
  GitBranch,
  Package,
  Plus,
  RefreshCw,
  Repeat,
  Search,
  Sparkles,
  Upload,
  UsersRound,
  X,
} from 'lucide-react';
import { useI18n } from '../common/i18n';
import {
  listDirs,
  pickNativeFolder,
  rawUrl,
  readFile,
  uploadFile,
  writeFile,
  type FsDirEntry,
} from '../api/fsFiles';
import {
  getRunLoops,
  listRuns,
  streamRunLoops,
  type ArtifactType,
  type LoopRecord,
  type LoopStatus,
  type RunRecord,
} from '../api/runs';
import { useRunSession } from '../core/hooks/useRunSession';
import { NeoMarkdown } from './projections/NeoMarkdown';
import { NeoArtifactPreview } from './projections/NeoArtifactPreview';
import { ProcessView } from './projections/ProcessView';
import { ArtifactsView, type LineageArtifact } from './projections/ArtifactsView';
import { LoopVerdicts } from './projections/LoopVerdicts';
import { EvidencePanel } from './projections/EvidencePanel';
import { TeamPanel } from './projections/TeamPanel';
import { GroupMembersPanel } from './projections/GroupMembersPanel';
import { NeoAgentSoul } from './NeoAgentSoul';
import type { NeoHostProps } from './types';
import './neo-host.css';

// ---------------------------------------------------------------------------
// 常量 / 小工具
// ---------------------------------------------------------------------------

/** 与 chat-home WorkspaceFilesView 共用同一 localStorage key（用户选过的项目目录两处通用）。 */
const LS_PROJECT_FOLDER = 'sf.project-folder';

const MD_EXTS = new Set(['md', 'markdown']);
const IMG_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp', 'ico']);

type FileKind = 'markdown' | 'image' | 'code';

function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i < 0 ? '' : name.slice(i + 1).toLowerCase();
}

function kindOf(name: string): FileKind {
  const ext = extOf(name);
  if (MD_EXTS.has(ext)) return 'markdown';
  if (IMG_EXTS.has(ext)) return 'image';
  return 'code';
}

function FileTypeIcon({ name }: { name: string }) {
  const kind = kindOf(name);
  if (kind === 'image') return <FileImage size={13} strokeWidth={1.8} />;
  if (kind === 'code') return <FileCode size={13} strokeWidth={1.8} />;
  return <FileText size={13} strokeWidth={1.8} />;
}

function sortEntries(entries: FsDirEntry[]): FsDirEntry[] {
  return [...entries].sort((a, b) =>
    a.isDir === b.isDir ? a.name.localeCompare(b.name) : a.isDir ? -1 : 1,
  );
}

function artifactFilename(rec: RunRecord): string {
  if (rec.artifact_filename) return rec.artifact_filename;
  const url = rec.artifact_url ?? '';
  const base = url.split('/').pop() ?? '';
  return base || rec.goal;
}

// ---------------------------------------------------------------------------
// Loop tab — 状态 pill / 文案映射
// ---------------------------------------------------------------------------

const LOOP_STATUS_CLASS: Record<LoopStatus, string> = {
  converged: 'neo-host-pill--converged',
  running: 'neo-host-pill--running',
  oscillating: 'neo-host-pill--oscillating',
  diverged: 'neo-host-pill--diverged',
  halted: 'neo-host-pill--halted',
};

/** 每个 loop 内各 metric 的绝对值最大值（迷你条形归一化用）。 */
function metricMaxes(loop: LoopRecord): Record<string, number> {
  const max: Record<string, number> = {};
  for (const it of loop.iterations) {
    for (const [k, v] of Object.entries(it.metrics ?? {})) {
      const a = Math.abs(v);
      if (!(max[k] >= a)) max[k] = a > 0 ? a : 1;
    }
  }
  return max;
}

// ---------------------------------------------------------------------------
// 主组件
// ---------------------------------------------------------------------------

type FixedTab = 'workspace' | 'artifacts' | 'process' | 'team' | 'members';

interface ArtifactTab {
  /** tab 唯一 id：RunRecord 单产物 = runId；lineage 产物 = artifact_id。 */
  id: string;
  url: string;
  /** 预览渲染分支类型（html / yaml / markdown）。 */
  type: ArtifactType;
  filename: string;
  sessionId?: string;
  isComplete: boolean;
}

/** lineage 产物文件名 → 预览类型（按扩展名真实推导，不捏造）。 */
function previewTypeOf(filename: string): ArtifactType {
  const ext = extOf(filename);
  if (ext === 'html' || ext === 'htm') return 'html';
  if (ext === 'yaml' || ext === 'yml') return 'yaml';
  return 'markdown';
}

export function NeoHost({ target, runId, soulAgent, conversation }: NeoHostProps) {
  const { t } = useI18n();

  // W2 钉钉式融合（2026-08-22）：中栏开着非 DM 会话（团队群）→ 本面板变
  // 「团队的主机」并露出「成员」tab（成员列表 + 团队 DAG 摘要 + 审批门，
  // projections/GroupMembersPanel）；DM/无会话保持「Agent 的主机」。
  const isTeamConv = conversation != null && conversation.kind !== 'dm';

  // ── tab 状态 ──────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<string>('workspace');
  const [artifactTabs, setArtifactTabs] = useState<ArtifactTab[]>([]);
  /** 已自动开过产物 tab 的 runId（同一 run 不重复自动激活）。 */
  const autoOpenedRef = useRef<Set<string>>(new Set());
  /** 已自动露出「过程」tab 的 runId（run 开始执行时抢一次 tab，之后不打扰）。 */
  const autoProcessRef = useRef<Set<string>>(new Set());

  // SSE 只读视图：per-node 输出归属（TeamPanel）+ isStreaming（投影轮询开关 +
  // 过程 tab 自动露出）。server runBus 支持同一 session 多 sink attach + replay，
  // 与 NeoChat 的订阅互不干扰。
  const session = useRunSession(runId ?? '');

  // ── 工作空间：文件树 ──────────────────────────────────────────────────────
  const [rootPath, setRootPath] = useState<string | null>(null);
  const [children, setChildren] = useState<Record<string, FsDirEntry[]>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [loadingDirs, setLoadingDirs] = useState<Record<string, boolean>>({});

  // ── 工作空间：文件预览 ────────────────────────────────────────────────────
  const [selected, setSelected] = useState<FsDirEntry | null>(null);
  const [fileState, setFileState] = useState<{ text: string; truncated: boolean } | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState(false);
  const [viewMode, setViewMode] = useState<'preview' | 'code'>('preview');
  const fileReqRef = useRef(0);
  /** Coze「搜索文件」对标 — 在已加载的树缓存里按名称过滤（客户端真实过滤，不 mock）。 */
  const [treeQuery, setTreeQuery] = useState('');

  // ── 产物 ──────────────────────────────────────────────────────────────────
  const [runRecord, setRunRecord] = useState<RunRecord | null>(null);
  /** W1-B：产物文本按 tab id 缓存 —— tab 保活后切走再切回不丢内容、不串内容。 */
  const [artifactContents, setArtifactContents] = useState<Record<string, string>>({});
  const [artifactLoading, setArtifactLoading] = useState(false);
  /** 产物预览「刷新」按钮：清掉当前 tab 缓存并重新拉取。 */
  const [artifactTick, setArtifactTick] = useState(0);

  // ── Loop ──────────────────────────────────────────────────────────────────
  const [loops, setLoops] = useState<LoopRecord[] | null>(null);
  const [loopsError, setLoopsError] = useState<string | null>(null);

  const activeArtifactTab =
    artifactTabs.find((tab) => `artifact:${tab.id}` === activeTab) ?? null;

  // ── tab 下划线测量 ────────────────────────────────────────────────────────
  const tabbarRef = useRef<HTMLDivElement>(null);
  const [bar, setBar] = useState<{ left: number; width: number; visible: boolean }>({
    left: 0,
    width: 0,
    visible: false,
  });
  useLayoutEffect(() => {
    const el = tabbarRef.current?.querySelector<HTMLElement>(`[data-tab="${activeTab}"]`);
    if (el) setBar({ left: el.offsetLeft, width: el.offsetWidth, visible: true });
    else setBar((b) => ({ ...b, visible: false }));
  }, [activeTab, artifactTabs.length, runId]);
  useEffect(() => {
    const onResize = () => {
      const el = tabbarRef.current?.querySelector<HTMLElement>(`[data-tab="${activeTab}"]`);
      if (el) setBar({ left: el.offsetLeft, width: el.offsetWidth, visible: true });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [activeTab]);

  // ── 工作空间 root 解析（用户选过的目录优先，否则后端 home）────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let saved: string | null = null;
      try { saved = localStorage.getItem(LS_PROJECT_FOLDER); } catch { /* ssr */ }
      if (saved) {
        if (!cancelled) setRootPath(saved);
        return;
      }
      const r = await listDirs();
      if (!cancelled && r && r.path !== 'ROOT') setRootPath(r.path);
    })();
    return () => { cancelled = true; };
  }, []);

  const loadChildren = useCallback(async (dir: string) => {
    setLoadingDirs((m) => ({ ...m, [dir]: true }));
    const r = await listDirs(dir);
    setLoadingDirs((m) => ({ ...m, [dir]: false }));
    if (r) setChildren((m) => ({ ...m, [dir]: r.entries }));
  }, []);

  useEffect(() => {
    if (rootPath) loadChildren(rootPath);
  }, [rootPath, loadChildren]);

  const toggleDir = (entry: FsDirEntry) => {
    const next = !expanded[entry.path];
    setExpanded((m) => ({ ...m, [entry.path]: next }));
    if (next && !children[entry.path]) loadChildren(entry.path);
  };

  const refreshTree = () => {
    if (!rootPath) return;
    setChildren({});
    setExpanded({});
    loadChildren(rootPath);
  };

  const pickFolder = async () => {
    const p = await pickNativeFolder();
    if (!p) return; // 取消 / 503 → 保持现状（与 WorkspaceFilesView 同语义）
    try { localStorage.setItem(LS_PROJECT_FOLDER, p); } catch { /* ignore */ }
    setSelected(null);
    setChildren({});
    setExpanded({});
    setRootPath(p);
  };

  // ── 工作空间：新建 / 上传文件（2026-08-22，T04 企业资料喂入）───────────────
  const uploadInputRef = useRef<HTMLInputElement>(null);

  // 新建：相对文件名交给后端相对 root 解析（前端不拼路径分隔符）；成功后刷新树。
  const createFile = async () => {
    if (!rootPath) return;
    const name = window.prompt(t('neo.host.newFilePrompt', { defaultValue: '新建文件名（可带子目录，如 docs/notes.md）' }));
    if (!name?.trim()) return;
    try {
      await writeFile(name.trim(), '', rootPath);
      refreshTree();
    } catch (e) {
      window.alert(e instanceof Error ? e.message : String(e));
    }
  };

  const onUploadPicked = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // 允许连续选同一文件
    if (!file || !rootPath) return;
    try {
      await uploadFile(rootPath, rootPath, file);
      refreshTree();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err));
    }
  };

  // ── 文件选中 → 预览（race-safe）──────────────────────────────────────────
  const openFile = (entry: FsDirEntry) => {
    setSelected(entry);
    setViewMode(kindOf(entry.name) === 'markdown' ? 'preview' : 'code');
  };

  useEffect(() => {
    if (!selected || !rootPath) {
      setFileState(null);
      setFileError(false);
      return;
    }
    if (kindOf(selected.name) === 'image') {
      setFileState(null);
      setFileError(false);
      return;
    }
    const reqId = ++fileReqRef.current;
    setFileLoading(true);
    setFileError(false);
    readFile(selected.path, rootPath)
      .then((r) => {
        if (fileReqRef.current === reqId) setFileState({ text: r.content, truncated: r.truncated });
      })
      .catch(() => {
        if (fileReqRef.current === reqId) setFileError(true);
      })
      .finally(() => {
        if (fileReqRef.current === reqId) setFileLoading(false);
      });
  }, [selected, rootPath]);

  // ── 产物：runId → RunRecord（真实 REST；artifact_* 为后端落库字段）────────
  useEffect(() => {
    if (!runId) {
      setRunRecord(null);
      return;
    }
    let cancelled = false;
    listRuns()
      .then((runs) => {
        if (!cancelled) setRunRecord(runs.find((r) => r.run_id === runId) ?? null);
      })
      .catch(() => {
        if (!cancelled) setRunRecord(null);
      });
    return () => { cancelled = true; };
  }, [runId]);

  // 产物出现 → 自动开产物 tab 并激活（clawsgo「产出即开 tab」；同一 run 只自动一次）。
  useEffect(() => {
    if (!runId || !runRecord?.artifact_url) return;
    if (autoOpenedRef.current.has(runId)) return;
    autoOpenedRef.current.add(runId);
    openRecordArtifactTab(runRecord);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, runRecord]);

  // run 开始执行 → 自动露出「过程」tab 一次（执行中面板；同一 run 只抢一次）。
  useEffect(() => {
    if (!runId || !session.isStreaming) return;
    if (autoProcessRef.current.has(runId)) return;
    autoProcessRef.current.add(runId);
    setActiveTab('process');
  }, [runId, session.isStreaming]);

  // target 从 team 切走 → 「编队」tab 消失，激活 tab 回落到过程视图。
  useEffect(() => {
    if (activeTab === 'team' && target?.kind !== 'team') setActiveTab('process');
  }, [activeTab, target?.kind]);

  // 会话切走/切到 DM → 「成员」tab 消失，激活 tab 回落到工作空间。
  useEffect(() => {
    if (activeTab === 'members' && !isTeamConv) setActiveTab('workspace');
  }, [activeTab, isTeamConv]);

  // agent 上下文消失（切到群聊/团队/首页）→ 「灵魂」tab 消失，回落到工作空间。
  useEffect(() => {
    if (activeTab === 'soul' && !soulAgent) setActiveTab('workspace');
  }, [activeTab, soulAgent]);

  const openRecordArtifactTab = (rec: RunRecord) => {
    const url = rec.artifact_url;
    if (!url) return;
    const tab: ArtifactTab = {
      id: rec.run_id,
      url,
      type: rec.artifact_type ?? 'markdown',
      filename: artifactFilename(rec),
      sessionId: rec.session_id,
      isComplete: rec.status === 'completed',
    };
    setArtifactTabs((tabs) =>
      tabs.some((tb) => tb.id === tab.id) ? tabs : [...tabs, tab],
    );
    setActiveTab(`artifact:${tab.id}`);
  };

  // lineage 产物点击 → 开产物 tab（走 NeoArtifactPreview；url 已由 ArtifactsView 解析）。
  const openLineageArtifactTab = (item: LineageArtifact) => {
    if (!item.url) return;
    const tab: ArtifactTab = {
      id: item.id,
      url: item.url,
      type: previewTypeOf(item.name),
      filename: item.name,
      sessionId: runRecord?.session_id,
      isComplete: runRecord?.status === 'completed',
    };
    setArtifactTabs((tabs) =>
      tabs.some((tb) => tb.id === tab.id) ? tabs : [...tabs, tab],
    );
    setActiveTab(`artifact:${tab.id}`);
  };

  const closeArtifactTab = (id: string) => {
    setArtifactTabs((tabs) => tabs.filter((tab) => tab.id !== id));
    if (activeTab === `artifact:${id}`) setActiveTab('artifacts');
  };

  // 产物 tab 内容（yaml/markdown 渲染 + html 源码 tab 需要文本；按 tab id 缓存，
  // 已缓存的 tab 不重复拉取；artifactTick = 手动刷新，先清缓存再拉）。
  useEffect(() => {
    const tab = activeArtifactTab;
    if (!tab) {
      setArtifactLoading(false);
      return;
    }
    if (artifactContents[tab.id] !== undefined) {
      setArtifactLoading(false);
      return;
    }
    let cancelled = false;
    setArtifactLoading(true);
    fetch(tab.url)
      .then((r) => (r.ok ? r.text() : ''))
      .then((txt) => {
        if (!cancelled) {
          setArtifactContents((m) => ({ ...m, [tab.id]: txt }));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setArtifactContents((m) => ({ ...m, [tab.id]: '' }));
        }
      })
      .finally(() => {
        if (!cancelled) setArtifactLoading(false);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeArtifactTab?.id, activeArtifactTab?.url, artifactTick]);

  // ── Loop：优先 SSE `loop` 帧（网关 loop-watcher 推流，全量快照直接替换）；
  // 无帧时挂 loops/stream 专属 SSE（流式期间），最后回落一次性 getRunLoops
  // 拉取（历史 run / watcher 静默场景）──
  // 三条通路都按 loop_id 去重（响应按 step 分组，loop 对象会重复）──
  useEffect(() => {
    if (!runId) {
      setLoops(null);
      setLoopsError(null);
      return;
    }
    if (session.loops && session.loops.length > 0) {
      const byId = new Map<string, LoopRecord>();
      for (const raw of session.loops) {
        const loop = raw as unknown as LoopRecord;
        if (loop?.loop_id) byId.set(loop.loop_id, loop);
      }
      setLoops(
        [...byId.values()].sort(
          (a, b) => a.depth - b.depth || a.loop_id.localeCompare(b.loop_id),
        ),
      );
      setLoopsError(null);
      return;
    }
    let cancelled = false;
    setLoops(null);
    setLoopsError(null);
    const applySteps = (steps: { loop: LoopRecord }[]) => {
      const byId = new Map<string, LoopRecord>();
      for (const step of steps) byId.set(step.loop.loop_id, step.loop);
      setLoops(
        [...byId.values()].sort(
          (a, b) => a.depth - b.depth || a.loop_id.localeCompare(b.loop_id),
        ),
      );
    };
    getRunLoops(runId)
      .then((r) => {
        if (cancelled) return;
        applySteps(r.loops);
      })
      .catch((e: unknown) => {
        if (!cancelled) setLoopsError(e instanceof Error ? e.message : String(e));
      });
    // loops 专属 SSE（流式期间实时刷新；端点不可用时上面的一次性拉取即回落，
    // 不另加轮询——过程 tab 的 ProcessView 已有自己的 5s 轮询节奏）。
    const stream = session.isStreaming
      ? streamRunLoops(
          runId,
          (steps) => {
            if (cancelled) return;
            applySteps(steps);
            setLoopsError(null);
          },
          () => {
            /* 端点未就绪 → 保持一次性 REST 结果，不升级为轮询 */
          },
        )
      : null;
    return () => {
      cancelled = true;
      stream?.close();
    };
  }, [runId, session.loops, session.isStreaming]);

  // =========================================================================
  // 渲染
  // =========================================================================

  const fixedTabs: Array<{ id: FixedTab; label: string; icon: ReactNode }> = [
    { id: 'workspace', label: t('neo.host.workspace', { defaultValue: '工作空间' }), icon: <FolderOpen size={20} strokeWidth={1.75} /> },
    { id: 'artifacts', label: t('neo.host.artifacts', { defaultValue: '产物' }), icon: <Package size={20} strokeWidth={1.75} /> },
    { id: 'process', label: t('neo.host.process', { defaultValue: '过程' }), icon: <GitBranch size={20} strokeWidth={1.75} /> },
  ];

  // ── 文件树（递归，懒加载）──
  const renderTreeEntries = (entries: FsDirEntry[], depth: number): ReactNode =>
    sortEntries(entries).map((entry) => {
      const pad = 8 + depth * 14;
      if (entry.isDir) {
        const isOpen = Boolean(expanded[entry.path]);
        const kids = children[entry.path];
        return (
          <div key={entry.path}>
            <button
              type="button"
              className="neo-host-tree-row"
              style={{ paddingLeft: pad }}
              onClick={() => toggleDir(entry)}
            >
              {isOpen ? (
                <ChevronDown size={12} strokeWidth={1.8} className="neo-host-tree-caret" />
              ) : (
                <ChevronRight size={12} strokeWidth={1.8} className="neo-host-tree-caret" />
              )}
              <Folder size={13} strokeWidth={1.8} className="neo-host-tree-dir-icon" />
              <span className="neo-host-tree-name">{entry.name}</span>
            </button>
            {isOpen && (
              loadingDirs[entry.path] && !kids ? (
                <div className="neo-host-tree-note" style={{ paddingLeft: pad + 26 }}>
                  {t('neo.host.loading', { defaultValue: '读取中…' })}
                </div>
              ) : kids && kids.length > 0 ? (
                renderTreeEntries(kids, depth + 1)
              ) : kids ? (
                <div className="neo-host-tree-note" style={{ paddingLeft: pad + 26 }}>
                  {t('neo.host.emptyDir', { defaultValue: '（空目录）' })}
                </div>
              ) : null
            )}
          </div>
        );
      }
      const isSel = selected?.path === entry.path;
      return (
        <button
          key={entry.path}
          type="button"
          className={`neo-host-tree-row${isSel ? ' neo-host-tree-row--sel' : ''}`}
          style={{ paddingLeft: pad + 14 }}
          onClick={() => openFile(entry)}
        >
          <FileTypeIcon name={entry.name} />
          <span className="neo-host-tree-name">{entry.name}</span>
        </button>
      );
    });

  // ── 工作空间 tab 内容 ──
  const workspaceContent = (
    <div className="neo-host-ws">
      {/* 工具条：路径 + 刷新 + 换目录 */}
      <div className="neo-host-ws-toolbar">
        <span className="neo-host-ws-path" title={rootPath ?? ''}>
          {rootPath ?? t('neo.host.locating', { defaultValue: '定位目录…' })}
        </span>
        <button
          type="button"
          className="neo-host-icon-btn"
          title={t('neo.host.refresh', { defaultValue: '刷新' })}
          onClick={refreshTree}
        >
          <RefreshCw size={12} strokeWidth={1.8} />
        </button>
        <button
          type="button"
          className="neo-host-icon-btn"
          title={t('neo.host.newFile', { defaultValue: '新建文件' })}
          onClick={createFile}
        >
          <FilePlus2 size={12} strokeWidth={1.8} />
        </button>
        <button
          type="button"
          className="neo-host-icon-btn"
          title={t('neo.host.uploadFile', { defaultValue: '上传文件' })}
          onClick={() => uploadInputRef.current?.click()}
        >
          <Upload size={12} strokeWidth={1.8} />
        </button>
        <input
          ref={uploadInputRef}
          type="file"
          hidden
          data-testid="neo-host-upload-input"
          onChange={onUploadPicked}
        />
        <button
          type="button"
          className="neo-host-icon-btn"
          title={t('neo.host.pickFolder', { defaultValue: '打开项目文件夹' })}
          onClick={pickFolder}
        >
          <FolderOpen size={12} strokeWidth={1.8} />
        </button>
      </div>
      {/* 搜索（Coze「搜索文件」对标；过滤已加载的树缓存） */}
      <div className="neo-host-ws-search">
        <Search size={12} strokeWidth={1.8} className="neo-host-ws-search-icon" />
        <input
          className="neo-host-ws-search-input"
          value={treeQuery}
          onChange={(e) => setTreeQuery(e.target.value)}
          placeholder={t('neo.host.searchFiles', { defaultValue: '搜索文件' })}
        />
        {treeQuery && (
          <button
            type="button"
            className="neo-host-icon-btn"
            title={t('neo.host.clear', { defaultValue: '清除' })}
            onClick={() => setTreeQuery('')}
          >
            <X size={11} strokeWidth={2} />
          </button>
        )}
      </div>
      <div className="neo-host-ws-body">
        {/* 左：文件树（搜索时 = 已加载缓存的扁平匹配列表） */}
        <div className="neo-host-tree">
          {treeQuery.trim() ? (
            (() => {
              const q = treeQuery.trim().toLowerCase();
              const matches: FsDirEntry[] = [];
              for (const list of Object.values(children)) {
                for (const e of list) {
                  if (e.name.toLowerCase().includes(q)) matches.push(e);
                }
              }
              if (matches.length === 0) {
                return (
                  <div className="neo-host-tree-note neo-host-tree-note--pad">
                    {t('neo.host.noMatch', { defaultValue: '（无匹配文件）' })}
                  </div>
                );
              }
              return sortEntries(matches).map((entry) => {
                const isSel = selected?.path === entry.path;
                return (
                  <button
                    key={entry.path}
                    type="button"
                    className={`neo-host-tree-row${isSel ? ' neo-host-tree-row--sel' : ''}`}
                    onClick={() => (entry.isDir ? toggleDir(entry) : openFile(entry))}
                  >
                    {entry.isDir ? (
                      <Folder size={13} strokeWidth={1.8} className="neo-host-tree-dir-icon" />
                    ) : (
                      <FileTypeIcon name={entry.name} />
                    )}
                    <span className="neo-host-tree-name">{entry.name}</span>
                    <span className="neo-host-tree-sub" title={entry.path}>
                      {entry.path}
                    </span>
                  </button>
                );
              });
            })()
          ) : rootPath && children[rootPath] ? (
            children[rootPath].length > 0 ? (
              renderTreeEntries(children[rootPath], 0)
            ) : (
              <div className="neo-host-tree-note neo-host-tree-note--pad">
                {t('neo.host.emptyDir', { defaultValue: '（空目录）' })}
              </div>
            )
          ) : (
            <div className="neo-host-tree-note neo-host-tree-note--pad">
              {t('neo.host.loading', { defaultValue: '读取中…' })}
            </div>
          )}
        </div>
        {/* 右：预览 */}
        <div className="neo-host-preview">
          {selected ? (
            <>
              <div className="neo-host-preview-toolbar">
                <span className="neo-host-preview-name" title={selected.path}>
                  {selected.name}
                </span>
                {kindOf(selected.name) === 'markdown' && (
                  <div className="neo-host-seg">
                    <button
                      type="button"
                      className={`neo-host-seg-btn neo-tt${viewMode === 'preview' ? ' neo-host-seg-btn--on' : ''}`}
                      data-tip={t('neo.host.preview', { defaultValue: '预览' })}
                      onClick={() => setViewMode('preview')}
                    >
                      <Eye size={11} strokeWidth={2} />
                      {t('neo.host.preview', { defaultValue: '预览' })}
                    </button>
                    <button
                      type="button"
                      className={`neo-host-seg-btn neo-tt${viewMode === 'code' ? ' neo-host-seg-btn--on' : ''}`}
                      data-tip={t('neo.host.code', { defaultValue: '代码' })}
                      onClick={() => setViewMode('code')}
                    >
                      <Code size={11} strokeWidth={2} />
                      {t('neo.host.code', { defaultValue: '代码' })}
                    </button>
                  </div>
                )}
                {rootPath && (
                  <a
                    className="neo-host-icon-btn"
                    title={t('neo.host.download', { defaultValue: '下载' })}
                    href={rawUrl(selected.path, rootPath)}
                    download={selected.name}
                  >
                    <Download size={12} strokeWidth={1.8} />
                  </a>
                )}
                <button
                  type="button"
                  className="neo-host-icon-btn"
                  title={t('neo.host.close', { defaultValue: '关闭' })}
                  onClick={() => setSelected(null)}
                >
                  <X size={12} strokeWidth={1.8} />
                </button>
              </div>
              <div className="neo-host-preview-body">
                {kindOf(selected.name) === 'image' && rootPath ? (
                  <div className="neo-host-preview-img-wrap">
                    <img
                      className="neo-host-preview-img"
                      src={rawUrl(selected.path, rootPath)}
                      alt={selected.name}
                    />
                  </div>
                ) : fileLoading ? (
                  // b_007：header 先渲染，内容区居中细圆环 spinner
                  <div className="neo-host-preview-loading">
                    <span className="neo-spin" />
                  </div>
                ) : fileError ? (
                  <div className="neo-host-tree-note neo-host-tree-note--pad">
                    {t('neo.host.readFailed', { defaultValue: '（无法预览此文件）' })}
                  </div>
                ) : fileState ? (
                  viewMode === 'preview' && kindOf(selected.name) === 'markdown' ? (
                    <div className="neo-host-preview-md">
                      <NeoMarkdown source={fileState.text} />
                      {fileState.truncated && (
                        <div className="neo-host-truncated">
                          {t('neo.host.truncated', { defaultValue: '（内容过长，已截断）' })}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="neo-host-code">
                      {fileState.text.split('\n').map((line, i) => (
                        <div className="neo-host-code-line" key={i}>
                          <span className="neo-host-code-ln">{i + 1}</span>
                          <span className="neo-host-code-text">{line || ' '}</span>
                        </div>
                      ))}
                      {fileState.truncated && (
                        <div className="neo-host-truncated">
                          {t('neo.host.truncated', { defaultValue: '（内容过长，已截断）' })}
                        </div>
                      )}
                    </div>
                  )
                ) : null}
              </div>
            </>
          ) : (
            <div className="neo-host-empty neo-host-empty--fill">
              {t('neo.host.pickFile', { defaultValue: '在左侧选择文件以查看内容' })}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // ── runId 为空时的 run 依赖 tab 空态（2026-08-19：会话/目标态右栏也常驻，
  //    工作空间 tab 不依赖 run 照常可用；产物/过程/Loop 给干净空态）──
  const runlessNote = (
    <div className="neo-host-empty neo-host-empty--fill">
      <Package size={20} strokeWidth={1.5} className="neo-host-empty-icon" />
      <span>{t('neo.host.noRun', { defaultValue: '暂无运行中的任务' })}</span>
      <span className="neo-host-empty-sub">
        {t('neo.host.noRunHint', { defaultValue: '发起任务后，这里展示 Agent 的工作空间、产物、过程投影与 Loop 迭代' })}
      </span>
    </div>
  );

  // ── 产物 tab 内容（lineage 驱动，无数据时回落单 artifact 旧行为）──
  // W1-B 保活：hidden 期间暂停轮询（active 叠加 tab 可见性），切回时 effect 重跑拉新数据。
  const artifactsContent = runId ? (
    <ArtifactsView
      runId={runId}
      active={session.isStreaming && activeTab === 'artifacts'}
      runRecord={runRecord}
      onOpen={openLineageArtifactTab}
      onOpenRecord={openRecordArtifactTab}
    />
  ) : (
    runlessNote
  );

  // ── Loop tab 内容 ──
  const loopContent = (
    <div className="neo-host-list">
      {loopsError ? (
        <div className="neo-host-empty neo-host-empty--fill neo-host-empty--err">
          {t('neo.host.loopsError', { defaultValue: 'Loop 数据加载失败' })}：{loopsError}
        </div>
      ) : !runId ? (
        runlessNote
      ) : loops === null ? (
        <div className="neo-host-tree-note neo-host-tree-note--pad">
          {t('neo.host.loading', { defaultValue: '读取中…' })}
        </div>
      ) : loops.length === 0 ? (
        <div className="neo-host-empty neo-host-empty--fill">
          {t('neo.host.noLoops', { defaultValue: '该运行没有 Loop 迭代记录' })}
        </div>
      ) : (
        loops.map((loop) => {
          const maxes = metricMaxes(loop);
          return (
            <div
              key={loop.loop_id}
              className="neo-host-loop-card"
              style={{ marginLeft: loop.depth * 14 }}
            >
              <div className="neo-host-loop-head">
                <span className={`neo-host-pill ${LOOP_STATUS_CLASS[loop.status]}`}>
                  {t(`neo.host.loopStatus.${loop.status}`, { defaultValue: loop.status })}
                </span>
                <span className="neo-host-loop-kind">
                  {t(`neo.host.loopKind.${loop.kind}`, { defaultValue: loop.kind })}
                </span>
                <span className="neo-host-loop-setpoint">
                  {loop.setpoint.metric} {loop.setpoint.op} {loop.setpoint.value}
                </span>
                <span className="neo-host-loop-count">
                  {t('neo.host.iterations', { defaultValue: '{{count}} 轮', count: loop.iteration_count })}
                </span>
              </div>
              <div className="neo-host-loop-iters">
                {loop.iterations.map((it) => {
                  const metricKeys = Object.keys(it.metrics ?? {}).slice(0, 4);
                  return (
                    <div key={`${it.loop_id}-${it.index}`} className="neo-host-iter">
                      <div className="neo-host-iter-head">
                        <span className="neo-host-iter-k">
                          {t('neo.host.iterK', { defaultValue: '第 {{k}} 轮', k: it.index + 1 })}
                        </span>
                        <span className="neo-host-iter-score">
                          score {typeof it.verifier_score === 'number' ? it.verifier_score.toFixed(2) : '—'}
                        </span>
                        {it.evidence.sensor && (
                          <span className="neo-host-iter-sensor">
                            {it.evidence.sensor.classification}
                          </span>
                        )}
                      </div>
                      {metricKeys.length > 0 && (
                        <div className="neo-host-iter-metrics">
                          {metricKeys.map((mk) => {
                            const v = it.metrics[mk];
                            const max = maxes[mk] || 1;
                            const pct = Math.min(100, (Math.abs(v) / max) * 100);
                            return (
                              <div key={mk} className="neo-host-metric">
                                <span className="neo-host-metric-label" title={mk}>{mk}</span>
                                <span className="neo-host-metric-track">
                                  <span className="neo-host-metric-fill" style={{ width: `${pct}%` }} />
                                </span>
                                <span className="neo-host-metric-val">{v}</span>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {/* verifier 面板：每轮 rationale + claims（端点未就绪 → 干净空态） */}
              <LoopVerdicts runId={runId} loopId={loop.loop_id} active={session.isStreaming} />
            </div>
          );
        })
      )}
    </div>
  );

  // ── 产物预览 tab 内容（Neo 自有 NeoArtifactPreview：done.html filecard 视觉）──
  const artifactTabContent = (tab: ArtifactTab) => {
    const cached = artifactContents[tab.id];
    return (
      <div className="neo-host-artifact-preview">
        <NeoArtifactPreview
          url={tab.url}
          type={tab.type}
          content={cached ?? ''}
          sessionId={tab.sessionId}
          filename={tab.filename}
          isComplete={tab.isComplete}
          loading={cached === undefined && artifactLoading}
          onRefresh={() => {
            setArtifactContents((m) => {
              const next = { ...m };
              delete next[tab.id];
              return next;
            });
            setArtifactTick((n) => n + 1);
          }}
          onClose={() => closeArtifactTab(tab.id)}
        />
      </div>
    );
  };

  // ── 过程 / 编队 tab 内容（2026-08-19 导航架构统一：原 Loop tab 并入——
  //    迭代环是 DAG 执行图的一部分，PDCA 卡直接挂在过程视图下方）──
  const processContent = runId ? (
    <div className="neo-host-process">
      <ProcessView runId={runId} active={session.isStreaming && activeTab === 'process'} />
      <div className="neo-host-loop-fold">
        <div className="neo-host-loop-fold-head">
          <Repeat size={13} strokeWidth={1.9} aria-hidden />
          {t('neo.host.loopFold', { defaultValue: '迭代环' })}
        </div>
        {loopContent}
      </div>
      {/* B40：memory-graph / training-dataset 投影露出（L6 证据层） */}
      <div className="neo-host-loop-fold">
        <div className="neo-host-loop-fold-head">
          <Database size={13} strokeWidth={1.9} aria-hidden />
          {t('neo.host.evidenceFold', { defaultValue: '证据投影' })}
        </div>
        <EvidencePanel runId={runId} active={session.isStreaming && activeTab === 'process'} />
      </div>
    </div>
  ) : (
    runlessNote
  );

  const teamContent =
    target?.kind === 'team' ? (
      <TeamPanel
        teamId={target.id}
        teamName={target.name}
        perNodeChunks={session.perNodeChunks}
        streaming={session.isStreaming}
      />
    ) : null;

  // 「成员」tab（W2）：非 DM 会话时挂 GroupMembersPanel（成员 + DAG 摘要 + 审批门）。
  const membersContent =
    isTeamConv && conversation ? <GroupMembersPanel groupId={conversation.groupId} /> : null;

  // ── runId 为空不再整栏空态（2026-08-19）：会话/目标态右栏常驻，直接进
  //    tab 壳 —— 工作空间文件树可用，产物/过程/Loop 走 runlessNote 空态。 ──

  return (
    <div className="neo-host">
      {/* tab 栏：Agent 的主机 + 固定 tab（工作空间/产物/过程 + 条件性灵魂/编队/成员）
          + 动态产物 tab（可关闭）+ 「+」
          （2026-08-15 任务 V：ClawsGo 大图标盒形态 — 44px hairline 盒 + 下方小标签） */}
      <div className="neo-host-header">
        <span className="neo-host-title" data-testid="neo-host-title">
          {isTeamConv
            ? t('neo.host.teamTitle', { defaultValue: '团队的主机' })
            : t('neo.host.title', { defaultValue: 'Agent 的主机' })}
        </span>
        <div className="neo-host-tabs" ref={tabbarRef}>
          {fixedTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              data-tab={tab.id}
              className={`neo-host-tab${activeTab === tab.id ? ' neo-host-tab--on' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className="neo-host-tab-box">{tab.icon}</span>
              <span className="neo-host-tab-label">{tab.label}</span>
            </button>
          ))}
          {/* 灵魂 tab：agent 上下文（agent-target / agent 的 DM 会话）时出现，
              内嵌 NeoAgentSoul（persona/系统提示词编辑，PATCH /api/agents） */}
          {soulAgent && (
            <button
              type="button"
              data-tab="soul"
              className={`neo-host-tab${activeTab === 'soul' ? ' neo-host-tab--on' : ''}`}
              onClick={() => setActiveTab('soul')}
              data-testid="neo-host-soul-tab"
            >
              <span className="neo-host-tab-box">
                <Sparkles size={20} strokeWidth={1.75} />
              </span>
              <span className="neo-host-tab-label">{t('neo.host.soul', { defaultValue: '灵魂' })}</span>
            </button>
          )}
          {/* 编队 tab：仅在 NeoRail 团队态选中 team 时出现（roster/工作流/策略/分节点输出） */}
          {target?.kind === 'team' && (
            <button
              type="button"
              data-tab="team"
              className={`neo-host-tab${activeTab === 'team' ? ' neo-host-tab--on' : ''}`}
              onClick={() => setActiveTab('team')}
            >
              <span className="neo-host-tab-box">
                <UsersRound size={20} strokeWidth={1.75} />
              </span>
              <span className="neo-host-tab-label">{t('neo.host.team', { defaultValue: '编队' })}</span>
            </button>
          )}
          {/* 成员 tab（W2 钉钉式融合）：中栏开着非 DM 会话时出现——成员列表 +
              团队 DAG 摘要 + 审批门（GroupMembersPanel） */}
          {isTeamConv && (
            <button
              type="button"
              data-tab="members"
              className={`neo-host-tab${activeTab === 'members' ? ' neo-host-tab--on' : ''}`}
              onClick={() => setActiveTab('members')}
              data-testid="neo-host-members-tab"
            >
              <span className="neo-host-tab-box">
                <UsersRound size={20} strokeWidth={1.75} />
              </span>
              <span className="neo-host-tab-label">
                {t('neo.host.members', { defaultValue: '成员' })}
              </span>
            </button>
          )}
          {artifactTabs.map((tab) => (
            <span
              key={tab.id}
              data-tab={`artifact:${tab.id}`}
              className={`neo-host-tab neo-host-tab--artifact${activeTab === `artifact:${tab.id}` ? ' neo-host-tab--on' : ''}`}
              onClick={() => setActiveTab(`artifact:${tab.id}`)}
            >
              <span className="neo-host-tab-box">
                <Package size={20} strokeWidth={1.75} />
                <button
                  type="button"
                  className="neo-host-tab-close"
                  title={t('neo.host.close', { defaultValue: '关闭' })}
                  onClick={(e) => {
                    e.stopPropagation();
                    closeArtifactTab(tab.id);
                  }}
                >
                  <X size={10} strokeWidth={2} />
                </button>
              </span>
              <span className="neo-host-tab-label neo-host-tab-ellipsis">{tab.filename}</span>
            </span>
          ))}
          {/* 「+」先不实现功能（产物出现时自动开 tab），保留视觉位 */}
          <button
            type="button"
            className="neo-host-tab neo-host-tab--plus"
            title={t('neo.host.plusSoon', { defaultValue: '新标签页（即将支持）' })}
            aria-disabled="true"
          >
            <span className="neo-host-tab-box">
              <Plus size={18} strokeWidth={1.8} />
            </span>
          </button>
          <span
            className="neo-host-tabs-bar"
            style={{
              left: bar.left,
              width: bar.width,
              opacity: bar.visible ? 1 : 0,
            }}
          />
        </div>
      </div>

      {/* tab 内容：全部 pane 常驻挂载，hidden 保活（display:none），切 tab 不丢
          滚动位置 / 选中文件 / 预览模式（done.html a_010）；fade 在 pane 首次挂载时播放 */}
      <div className="neo-host-content">
        <div className="neo-host-pane neo-host-fade" hidden={activeTab !== 'workspace'}>
          {workspaceContent}
        </div>
        <div className="neo-host-pane neo-host-fade" hidden={activeTab !== 'artifacts'}>
          {artifactsContent}
        </div>
        <div className="neo-host-pane neo-host-fade" hidden={activeTab !== 'process'}>
          {processContent}
        </div>
        {soulAgent && (
          <div
            className="neo-host-pane neo-host-fade neo-host-soul-pane"
            hidden={activeTab !== 'soul'}
          >
            <NeoAgentSoul agentId={soulAgent.id} />
          </div>
        )}
        {teamContent && (
          <div className="neo-host-pane neo-host-fade" hidden={activeTab !== 'team'}>
            {teamContent}
          </div>
        )}
        {membersContent && (
          <div className="neo-host-pane neo-host-fade" hidden={activeTab !== 'members'}>
            {membersContent}
          </div>
        )}
        {artifactTabs.map((tab) => (
          <div
            key={tab.id}
            className="neo-host-pane neo-host-fade"
            hidden={activeTab !== `artifact:${tab.id}`}
          >
            {artifactTabContent(tab)}
          </div>
        ))}
      </div>
    </div>
  );
}

export default NeoHost;
