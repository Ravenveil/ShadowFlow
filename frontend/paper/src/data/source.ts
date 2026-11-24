/**
 * source.ts — 工作台**唯一的数据出入口**。
 *
 * 组件只认这里的 `WorkspaceData` / `WorkspaceSource` 契约，不直接 import
 * 任何具体数据文件，也不出现后端路径；换后端只改这里的 `source` 一行，
 * Shell / ChatArea / AgentPanel / PolicyMatrix / DagFlow 全都不用动。
 *
 * 两个实现：
 *   mockSource —— 演示态，读 ./mock.ts（设计评审、离线截图用）
 *   httpSource —— 真后端，见 ./http/（组装既有 /api 端点，不含一条新后端路由）
 *
 * 选择顺序：
 *   1. URL 带 `?mock=1`（或 `#mock`）→ mock
 *   2. `VITE_WS_SOURCE=mock`       → mock
 *   3. 其余                        → http
 *
 * mock 也返回 Promise，是为了让组件的 loading / 竞态处理现在就写好，
 * 接后端时不用回头补一遍。
 */
import { DEMO } from '../content/app';
import {
  ARC_PIPELINE_DEMO,
  ARC_RUNS_DEMO,
  ARTIFACT_FILES,
  COMPOSER_DATA,
  DAG_CANVAS,
  DAG_EDGES,
  DAG_NODES,
  MESSAGES,
  PANEL,
  POLICY_SEED,
  ROSTER,
  SESSIONS,
  SETTINGS_SEED,
} from './mock';
import { httpSource } from './http';
import type {
  AppSettings,
  ArcPipelineView,
  ArcRunCard,
  ArtifactContent,
  ArtifactListing,
  CliProbe,
  ComposerData,
  DagDataset,
  Message,
  Outbound,
  PanelSummary,
  PolicyMatrix,
  ProjectNode,
  RosterMember,
  Session,
  SshHost,
} from './types';

/** 演示态默认打开哪条会话；真接口由后端第一条会话决定。 */
export const DEFAULT_SESSION_ID = 'grp-paper';

/** 一次加载所需的全部数据：左两栏 + 聊天 + 右栏，避免各组件各自取数的时序差。 */
export interface WorkspaceData {
  sessions: Session[];
  /** 会话 id → 消息列表。 */
  threads: Record<string, Message[]>;
  panel: PanelSummary;
  roster: RosterMember[];
  policy: PolicyMatrix;
  dag: DagDataset;
  /** 输入框的可选资源：模型 / 命令 / 知识包。 */
  composer: ComposerData;
  /** 设置页的全部配置。 */
  settings: AppSettings;
  /**
   * panel / roster / policy / dag 这四块描述的是**哪条会话**。
   * 切会话后界面拿它跟自己选中的 id 比，不一致才去 `loadPanel` 重取 ——
   * 避免首屏刚 load 完又重复拉一遍。
   */
  focused: string;
}

/** 切会话时要换新的那一块（右栏 + 编队 + 策略 + 工作流）。 */
export type PanelSlice = Pick<WorkspaceData, 'panel' | 'roster' | 'policy' | 'dag'>;

/** 测 SSH 连通性只回这三个字段；主机名 / 端口等是界面已有的，不该被覆写。 */
export type SshProbe = Pick<SshHost, 'state' | 'latencyMs' | 'gpu'>;

/** 空产物列表：数据源没有工作目录（或该会话还没产出）时用它，界面不必判 null。 */
export const EMPTY_LISTING: ArtifactListing = { root: '', dir: '', parent: null, entries: [] };

/** 数据源契约。所有方法异步，失败用 reject 表达，由 useWorkspace 统一兜。 */
export interface WorkspaceSource {
  readonly id: 'mock' | 'http';
  /**
   * 一次取回全部数据。`sessionId` 指定「右栏看哪条会话」，缺省用第一条。
   * 切会话后用 `loadPanel` 只换右栏，不必整页重取。
   */
  load(sessionId?: string): Promise<WorkspaceData>;
  /** 只拉某条会话的右栏切片；没实现（演示态）时界面保持原样。 */
  loadPanel?(sessionId: string): Promise<PanelSlice>;
  /**
   * 发一条消息，resolve 出**要追加到会话尾部**的消息（自己那条，可能还有应答）。
   * `signal` 用于「停止生成」：中止后不再追加任何消息。
   */
  send(sessionId: string, out: Outbound, opts?: { signal?: AbortSignal }): Promise<Message[]>;
  /** 应答是否经推送（SSE）异步到达；为真时「发送中」要等推送帧收尾。 */
  readonly streamsReplies?: boolean;
  /** 订阅某条会话的后续消息（真后端走 SSE）；返回退订函数。 */
  subscribe?(sessionId: string, onMessages: (messages: Message[]) => void): () => void;
  /** 停掉正在跑的这一轮（真后端要通知服务端，光 abort 请求停不住 agent）。 */
  stop?(sessionId: string): void | Promise<void>;
  /** 落库策略矩阵；演示态不下发，只保留签名。 */
  savePolicy(policy: PolicyMatrix): Promise<void>;
  /**
   * 列某条会话**工作目录**里的产物（默认根目录，给了 `dir` 就列那一层）。
   * 只读；不出子目录也照样能列，界面自己维护「进 / 退」。
   */
  listArtifacts(sessionId: string, dir?: string): Promise<ArtifactListing>;
  /**
   * 读一件产物的文本内容。`root` 由 listArtifacts 给出并存在数据源内部，
   * 后端按它做越权校验（只许读会话工作目录子树）。
   */
  readArtifact(sessionId: string, filePath: string): Promise<ArtifactContent>;
  /**
   * 图片 / PDF 这类二进制产物的直链（`<img src>` 用）。
   * 返回空串表示该数据源不提供直链，界面回落成读文本。
   */
  artifactRawUrl(sessionId: string, filePath: string): string;
  /** 语音转写：录音 blob → 文本。 */
  transcribe(audio: Blob): Promise<string>;
  /** 落库整份设置（分区分块改完再下发，避免每次点开关都打一次接口）。 */
  saveSettings(next: AppSettings): Promise<void>;
  /** 重新扫描本机 PATH 上的 Agent CLI，返回最新探测结果。 */
  rescanCli(): Promise<CliProbe[]>;
  /** 测一次 SSH 连通性（握手 + 查目录），只回状态字段，由调用方合并。 */
  testSsh(id: string): Promise<SshProbe>;
  /** 把工作区与设置恢复成初始状态，返回重置后的完整数据。 */
  reset(): Promise<WorkspaceData>;
  /** 找或建某个 agent 的单聊，返回其会话 id（空串=失败）。 */
  resolveDm?(agentId: string): Promise<string>;
  /** 拉「项目与 Agent」树里的项目列表（含项目下会话）。 */
  listProjects?(): Promise<ProjectNode[]>;
  /**
   * 对某条会话的挂起审批门作决定（approve / reject，可附意见）。
   * 没实现（演示态）时界面不出审批按钮。
   */
  resolveApproval?(
    sessionId: string,
    nodeId: string,
    decision: 'approve' | 'reject',
    comment?: string,
  ): Promise<void>;
  /**
   * ARC 管线观测（右栏「管线」页）：这条会话相关的 run 摘要卡。
   * 没实现（演示态另有兜底数据）时界面显示空态。
   */
  loadArcRuns?(sessionId: string): Promise<ArcRunCard[]>;
  /** 一次 ARC run 的完整观测视图（阶段时间线 / 终稿 / 引用核验 / 质量门）。 */
  loadArcPipeline?(runId: string): Promise<ArcPipelineView>;
  /** 读 run 内文本产物（阶段产物 / 终稿 md / 核验 json）。 */
  readArcArtifact?(runId: string, relPath: string): Promise<ArtifactContent>;
  /** run 内二进制产物（终稿 pdf / 图表）直链；空串 = 该源不提供直链。 */
  arcArtifactRawUrl?(runId: string, relPath: string): string;
}

/* ── mock 实现 ─────────────────────────────────────────────────────── */

/** 深拷贝，避免组件改到模块级常量（策略矩阵是会被点的）。 */
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** 可被 AbortSignal 打断的等待（模拟后端思考耗时，「停止生成」靠它生效）。 */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new DOMException('aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}

function stamp(): { id: string; time: string } {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return { id: String(d.getTime()), time: `${hh}:${mm}` };
}

/** 演示态的「服务端」：设置改动落在这里，重新 load 也能读回。 */
let settingsState: AppSettings = clone(SETTINGS_SEED);

/** 演示态工作目录的假前缀（真后端是 group.workspace_dir 的绝对路径）。 */
const MOCK_ROOT = 'mock://workspace';

/** 取小写扩展名（含点）；没有扩展名给空串。 */
function extOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot).toLowerCase() : '';
}

export const mockSource: WorkspaceSource = {
  id: 'mock',

  async load() {
    const messages = clone(MESSAGES);
    return {
      sessions: clone(SESSIONS),
      threads: {
        [DEFAULT_SESSION_ID]: messages,
        lead: messages.slice(0, 2),
      },
      panel: clone(PANEL),
      roster: ROSTER.map((m) => ({ ...m })),
      policy: Object.fromEntries(
        Object.entries(POLICY_SEED).map(([from, row]) => [from, { ...row }]),
      ),
      dag: {
        canvas: { ...DAG_CANVAS },
        nodes: DAG_NODES.map((n) => ({ ...n, layout: n.layout ? { ...n.layout } : undefined })),
        edges: DAG_EDGES.map((e) => ({ ...e })),
      },
      composer: clone(COMPOSER_DATA),
      settings: clone(settingsState),
      focused: DEFAULT_SESSION_ID,
    };
  },

  async send(_sessionId, out, opts) {
    // 故意留一段「思考时间」，让发送钮的停止态和竞态现在就是真的
    await sleep(900, opts?.signal);
    const { id, time } = stamp();
    return [
      {
        id: `u-${id}`,
        role: 'user',
        time,
        kind: 'text',
        text: out.text,
        attachments: out.attachments,
        knowledge: out.knowledge,
      },
      {
        id: `m-${id}`,
        role: 'agent',
        author: DEMO.leadAuthor,
        time,
        kind: 'text',
        text: DEMO.leadReply(out.text),
      },
    ];
  },

  async savePolicy() {
    /* 演示态不落库。真接口见 httpSource.savePolicy。 */
  },

  async listArtifacts() {
    // 演示态没有真磁盘：把 mock 里的几件产物当成会话工作目录的内容
    return {
      root: MOCK_ROOT,
      dir: MOCK_ROOT,
      parent: null,
      entries: ARTIFACT_FILES.map((f) => ({
        name: f.name,
        path: `${MOCK_ROOT}/${f.name}`,
        isDir: false,
        size: f.size,
        mtime: f.mtime,
        ext: extOf(f.name),
      })),
    };
  },

  async readArtifact(_sessionId, filePath) {
    const name = filePath.slice(filePath.lastIndexOf('/') + 1);
    const hit = ARTIFACT_FILES.find((f) => f.name === name);
    if (!hit) throw new Error(`演示数据里没有这件产物：${name}`);
    return { content: hit.body, size: hit.size, truncated: false };
  },

  artifactRawUrl() {
    // 演示态没有可直连的二进制：界面会回落成读文本（svg 的源码也照样看得见）
    return '';
  },

  async transcribe() {
    await sleep(800);
    return DEMO.transcript;
  },

  async saveSettings(next) {
    settingsState = clone(next);
  },

  async rescanCli() {
    // 真接口这边是后端扫 PATH；演示态只是把已知清单重新吐一遍
    await sleep(700);
    return clone(settingsState.clis);
  },

  async testSsh(id) {
    await sleep(900);
    const host = settingsState.ssh.find((h) => h.id === id);
    if (!host) throw new Error(`unknown ssh host: ${id}`);
    // 演示态：一律成功，给个像样的握手耗时
    const next: SshHost = {
      ...host,
      state: 'ok',
      latencyMs: 28 + Math.round(Math.random() * 90),
    };
    settingsState = {
      ...settingsState,
      ssh: settingsState.ssh.map((h) => (h.id === id ? next : h)),
    };
    return { state: next.state, latencyMs: next.latencyMs };
  },

  async reset() {
    settingsState = clone(SETTINGS_SEED);
    return mockSource.load();
  },

  async loadArcRuns() {
    await sleep(400);
    return clone(ARC_RUNS_DEMO);
  },

  async loadArcPipeline(runId: string) {
    await sleep(400);
    const hit = ARC_PIPELINE_DEMO.find((run) => run.runId === runId);
    if (!hit) throw new Error(`演示数据里没有这条 run：${runId}`);
    return clone(hit);
  },

  async readArcArtifact(_runId: string, relPath: string) {
    const demo = ARC_PIPELINE_DEMO[0];
    const stage = demo.stages.find((s) => relPath.startsWith(`stage-${String(s.index).padStart(2, '0')}`));
    const name = relPath.slice(relPath.lastIndexOf('/') + 1);
    const body = name === 'goal.md' ? `# ${demo.topic ?? '研究课题'}\n\n演示数据：课题目标与硬件画像。` : `{\n  "demo": true,\n  "stage": ${stage?.index ?? 0},\n  "file": "${name}"\n}`;
    return { content: body, size: body.length, truncated: false };
  },

  arcArtifactRawUrl() {
    // 演示态没有真二进制；终稿 pdf 在演示里以空直链表示，界面回落成提示
    return '';
  },
};

/* ── 唯一开关 ─────────────────────────────────────────────────────── */

/** URL 上带 `?mock=1` 或 `#mock` 就切演示数据（设计评审 / 离线截图用）。 */
function wantsMock(): boolean {
  if (typeof window === 'undefined') return false;
  if (import.meta.env.VITE_WS_SOURCE === 'mock') return true;
  const search = window.location.search;
  return /[?&]mock=1\b/.test(search) || window.location.hash.includes('mock');
}

/** 换后端：改这里一行；演示态用 `?mock=1` 临时切，不必改代码。 */
export const source: WorkspaceSource = wantsMock() ? mockSource : httpSource;
