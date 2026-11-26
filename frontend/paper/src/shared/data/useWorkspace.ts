/**
 * useWorkspace — 把 `WorkspaceSource` 包成 React 状态。
 *
 * 组件拿到的是「数据 + 状态 + 几个动作用」，不关心背后是 mock 还是 http：
 *   load 阶段   → status='loading'
 *   send        → 先把用户那条追加进去（乐观更新），应答随后到达
 *   subscribe   → 真后端的 agent 回复是推过来的，这里接进同一份 threads
 *
 * 「发送中」的收尾分两种数据源：
 *   mock  —— send 的 Promise resolve 就收尾（应答在同一次返回里）
 *   http  —— POST 只回「你的消息已存」，所以等第一帧推送 / 超时才收尾
 *
 * 这一层也是将来换 WebSocket / SWR 的唯一改动点。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  EMPTY_LISTING,
  source,
  type PanelSlice,
  type SshProbe,
  type WorkspaceData,
  type WorkspaceSource,
} from '@/shared/data/source';
import type {
  AppSettings,
  ArcPipelineView,
  ArcRunCard,
  ArtifactContent,
  ArtifactListing,
  CliProbe,
  Message,
  Outbound,
  PolicyMatrix,
  ProjectNode,
  Session,
} from '@/shared/data/types';

export type WorkspaceStatus = 'loading' | 'ready' | 'error';

/** 推送迟迟不来时「发送中」的兜底时长：到点就当这轮结束，别让按钮一直转。 */
const REPLY_WATCHDOG_MS = 180_000;

/** 按 id 合并消息，避免「乐观追加 + 推送补帧」把同一条渲染两遍。 */
function mergeMessages(prev: Message[], incoming: Message[]): Message[] {
  if (!incoming.length) return prev;
  const seen = new Set(prev.map((m) => m.id));
  const fresh = incoming.filter((m) => !seen.has(m.id));
  return fresh.length ? [...prev, ...fresh] : prev;
}

export interface WorkspaceApi {
  data: WorkspaceData | null;
  status: WorkspaceStatus;
  /** 失败原因，status='error' 时有值。 */
  error: string | null;
  /** 发消息：追加数据源返回的那几条。 */
  send: (sessionId: string, out: Outbound) => Promise<void>;
  /** 正在等应答（输入框据此把发送钮换成停止钮）。 */
  sending: boolean;
  /** 停止生成：通知服务端停这轮，并中止本地等待。 */
  stop: (sessionId?: string) => void;
  /** 订阅某条会话的后续消息；返回退订函数（交给 useEffect 直接 return）。 */
  watch: (sessionId: string) => () => void;
  /** 切会话：只换右栏那一块（编队 / 策略 / 工作流 / 执行摘要）。 */
  focus: (sessionId: string) => void;
  /** 语音转写，失败由调用方展示错误条。 */
  transcribe: (audio: Blob) => Promise<string>;
  /** 存策略：本地立即生效，再交给数据源落库。 */
  savePolicy: (policy: PolicyMatrix) => Promise<void>;
  /**
   * 改设置：`patch` 是**顶层分区的浅合并**（比如 `{ profile: {...} }`）。
   * 同样先本地生效再下发，改坏了不会让界面回跳。
   */
  patchSettings: (patch: Partial<AppSettings>) => Promise<void>;
  /** 设置正在下发（页脚据此显示保存态）。 */
  savingSettings: boolean;
  /** 重扫本机 CLI，结果写回 settings.clis（返回最新一份给调用方提示用）。 */
  rescanCli: () => Promise<CliProbe[]>;
  /** 测 SSH 连通性，只合并状态字段（主机名/端口仍用界面里的值）。 */
  testSsh: (id: string) => Promise<SshProbe>;
  /** 列某条会话工作目录里的产物（右栏「产物」页）；`dir` 省略 = 根目录。 */
  listArtifacts: (sessionId: string, dir?: string) => Promise<ArtifactListing>;
  /** 读一件产物的文本内容（点开预览时调）。 */
  readArtifact: (sessionId: string, filePath: string) => Promise<ArtifactContent>;
  /** 二进制产物直链；空串表示看不了图，界面回落成读文本。 */
  artifactRawUrl: (sessionId: string, filePath: string) => string;
  /** 重置（演示态回初始值；真后端=重新载入，不动后端数据）。 */
  reset: () => Promise<void>;
  /** 重新拉一次（错误重试 / 手动刷新）。 */
  reload: () => void;
  /** 找或建某个 agent 的单聊，返回会话 id（空串=失败）。 */
  resolveDm: (agentId: string) => Promise<string>;
  /** 对挂起审批门作决定（批准/拒绝）；演示态无门时是空操作。 */
  resolveApproval: (
    sessionId: string,
    nodeId: string,
    decision: 'approve' | 'reject',
    comment?: string,
  ) => Promise<void>;
  /** 拉「项目与 Agent」树里的项目列表。 */
  listProjects: () => Promise<ProjectNode[]>;
  createProject: (name: string, workspacePath?: string) => Promise<ProjectNode>;
  renameProject: (id: string, name: string) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  setProjectWorkspace: (id: string, workspacePath: string) => Promise<void>;
  createProjectConversation: (projectId: string, title: string) => Promise<string>;
  /** 顶层新建对话；演示态没有这个能力时返回 reject，界面据此不摆入口。 */
  createConversation: (title: string) => Promise<string>;
  /** 发起群聊（选人建群，勾选等于某团队 roster 时挂 team）。 */
  createGroupChat: (input: { name?: string; agentIds: string[]; teamId?: string }) => Promise<string>;
  /** 团队模板「一键使用」：fork 落 agent + team → 建群。 */
  useTeamTemplate: (appId: string) => Promise<string>;
  /** 这条会话相关的 ARC run 摘要卡（「管线」页）。 */
  loadArcRuns: (sessionId: string) => Promise<ArcRunCard[]>;
  /** 一次 ARC run 的完整观测视图（阶段 / 终稿 / 引用核验 / 质量门）。 */
  loadArcPipeline: (runId: string) => Promise<ArcPipelineView>;
  /** 读 run 内文本产物。 */
  readArcArtifact: (runId: string, relPath: string) => Promise<ArtifactContent>;
  /** run 内二进制产物直链（终稿 pdf / 图表）；空串 = 看不了。 */
  arcArtifactRawUrl: (runId: string, relPath: string) => string;
}

export function useWorkspace(src: WorkspaceSource = source): WorkspaceApi {
  const [data, setData] = useState<WorkspaceData | null>(null);
  const [status, setStatus] = useState<WorkspaceStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [sending, setSending] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const watchdogRef = useRef<number | null>(null);
  /** 最新数据的镜像：patchSettings 要在 updater 之外算出合并结果再下发。 */
  const dataRef = useRef<WorkspaceData | null>(null);
  dataRef.current = data;

  const clearWatchdog = useCallback(() => {
    if (watchdogRef.current) {
      window.clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
  }, []);

  useEffect(() => {
    let alive = true;
    setStatus('loading');
    src
      .load()
      .then((next) => {
        if (!alive) return;
        setData(next);
        setError(null);
        setStatus('ready');
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setError(err instanceof Error ? err.message : String(err));
        setStatus('error');
      });
    return () => {
      alive = false;
    };
  }, [src, nonce]);

  useEffect(() => clearWatchdog, [clearWatchdog]);

  const appendMessages = useCallback((sessionId: string, incoming: Message[]) => {
    setData(
      (prev) =>
        prev && {
          ...prev,
          threads: {
            ...prev.threads,
            [sessionId]: mergeMessages(prev.threads[sessionId] ?? [], incoming),
          },
        },
    );
  }, []);

  const send = useCallback(
    async (sessionId: string, out: Outbound) => {
      abortRef.current?.abort();
      const ctl = new AbortController();
      abortRef.current = ctl;
      setSending(true);

      // 真后端：POST 只回「你的消息已存」，应答靠推送 —— 先挂个兜底定时器
      if (src.streamsReplies) {
        clearWatchdog();
        watchdogRef.current = window.setTimeout(() => {
          watchdogRef.current = null;
          setSending(false);
        }, REPLY_WATCHDOG_MS);
      }

      try {
        const fresh = await src.send(sessionId, out, { signal: ctl.signal });
        if (fresh.length) appendMessages(sessionId, fresh);
        if (!src.streamsReplies) setSending(false);
      } catch (err) {
        // 用户主动点停止不算错误；真失败继续往上抛，让输入框显示错误条
        const aborted = err instanceof DOMException && err.name === 'AbortError';
        if (!aborted) {
          console.error('[workspace] send failed', err);
          throw err;
        }
        setSending(false);
      } finally {
        if (abortRef.current === ctl) abortRef.current = null;
      }
    },
    [appendMessages, clearWatchdog, src],
  );

  const stop = useCallback(
    (sessionId?: string) => {
      abortRef.current?.abort();
      clearWatchdog();
      setSending(false);
      if (sessionId && src.stop) void src.stop(sessionId);
    },
    [clearWatchdog, src],
  );

  const watch = useCallback(
    (sessionId: string) => {
      if (!src.subscribe || !sessionId) return () => {};
      return src.subscribe(sessionId, (messages) => {
        // 第一帧到了就说明「思考」结束，按钮该收回成发送态
        setSending(false);
        clearWatchdog();
        appendMessages(sessionId, messages);
      });
    },
    [appendMessages, clearWatchdog, src],
  );

  const focus = useCallback(
    (sessionId: string) => {
      if (!src.loadPanel || !sessionId) return;
      const slice: Promise<PanelSlice> = src.loadPanel(sessionId);
      void slice
        .then((next) => {
          // 期间又切走了就别把旧切片盖上来
          setData((prev) => {
            if (!prev) return prev;
            if (!prev.sessions.some((s: Session) => s.id === sessionId)) return prev;
            return { ...prev, ...next, focused: sessionId };
          });
        })
        .catch((err: unknown) => {
          console.error('[workspace] loadPanel failed', err);
        });
    },
    [src],
  );

  const transcribe = useCallback((audio: Blob) => src.transcribe(audio), [src]);

  const savePolicy = useCallback(
    async (policy: PolicyMatrix) => {
      setData((prev) => prev && { ...prev, policy });
      try {
        await src.savePolicy(policy);
      } catch (err) {
        console.error('[workspace] savePolicy failed', err);
      }
    },
    [src],
  );

  const patchSettings = useCallback(
    async (patch: Partial<AppSettings>) => {
      const current = dataRef.current;
      if (!current) return;
      const next: AppSettings = { ...current.settings, ...patch };
      setData({ ...current, settings: next });
      setSavingSettings(true);
      try {
        await src.saveSettings(next);
      } catch (err) {
        console.error('[workspace] saveSettings failed', err);
        throw err;
      } finally {
        setSavingSettings(false);
      }
    },
    [src],
  );

  const rescanCli = useCallback(async () => {
    const clis = await src.rescanCli();
    const current = dataRef.current;
    if (current) {
      setData({ ...current, settings: { ...current.settings, clis } });
    }
    return clis;
  }, [src]);

  const testSsh = useCallback(
    async (id: string) => {
      const probe = await src.testSsh(id);
      const current = dataRef.current;
      if (current) {
        setData({
          ...current,
          settings: {
            ...current.settings,
            ssh: current.settings.ssh.map((h) => (h.id === id ? { ...h, ...probe } : h)),
          },
        });
      }
      return probe;
    },
    [src],
  );

  const reset = useCallback(async () => {
    const fresh = await src.reset();
    setData(fresh);
  }, [src]);

  const listArtifacts = useCallback(
    async (sessionId: string, dir?: string) =>
      src.listArtifacts ? src.listArtifacts(sessionId, dir) : { ...EMPTY_LISTING },
    [src],
  );

  const readArtifact = useCallback(
    (sessionId: string, filePath: string) => src.readArtifact(sessionId, filePath),
    [src],
  );

  const artifactRawUrl = useCallback(
    (sessionId: string, filePath: string) => src.artifactRawUrl(sessionId, filePath),
    [src],
  );

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  const resolveDm = useCallback(
    (agentId: string) => (src.resolveDm ? src.resolveDm(agentId) : Promise.resolve('')),
    [src],
  );

  /**
   * 对挂起审批门作决定：先本地收掉审批卡（乐观），再交给数据源落库；
   * 失败时重新拉一次面板（409 = 已被会话内决定/超时，属于正常竞态）。
   */
  const resolveApproval = useCallback(
    async (sessionId: string, nodeId: string, decision: 'approve' | 'reject', comment?: string) => {
      if (!src.resolveApproval) return;
      try {
        await src.resolveApproval(sessionId, nodeId, decision, comment);
      } catch (err) {
        console.error('[workspace] resolveApproval failed', err);
      }
      reload();
    },
    [src, reload],
  );

  const listProjects = useCallback(
    () => (src.listProjects ? src.listProjects() : Promise.resolve([] as ProjectNode[])),
    [src],
  );
  /** 项目变更（建/改/删）后必须刷新工作区，否则侧栏列表不更新 —— 用户会以为没建成。 */
  const createProject = useCallback(
    async (name: string, workspacePath?: string) => {
      const created = src.createProject
        ? await src.createProject(name, workspacePath)
        : await Promise.reject(new Error('unsupported'));
      reload();
      return created;
    },
    [src, reload],
  );
  const renameProject = useCallback(
    async (id: string, name: string) => {
      if (!src.renameProject) throw new Error('unsupported');
      await src.renameProject(id, name);
      reload();
    },
    [src, reload],
  );
  const deleteProject = useCallback(
    async (id: string) => {
      if (!src.deleteProject) throw new Error('unsupported');
      await src.deleteProject(id);
      reload();
    },
    [src, reload],
  );
  /** 重绑分组工作目录：落库后刷新会话/项目数据（列表里 workspacePath 随之更新）。 */
  const setProjectWorkspace = useCallback(
    async (id: string, workspacePath: string) => {
      if (!src.setProjectWorkspace) throw new Error('unsupported');
      await src.setProjectWorkspace(id, workspacePath);
      reload();
    },
    [src, reload],
  );
  const createProjectConversation = useCallback(
    async (projectId: string, title: string) => {
      const gid = src.createProjectConversation
        ? await src.createProjectConversation(projectId, title)
        : await Promise.reject(new Error('unsupported'));
      reload();
      return gid;
    },
    [src, reload],
  );
  const createConversation = useCallback(
    async (title: string) => {
      const gid = src.createConversation
        ? await src.createConversation(title)
        : await Promise.reject(new Error('unsupported'));
      reload();
      return gid;
    },
    [src, reload],
  );
  const createGroupChat = useCallback(
    (input: { name?: string; agentIds: string[]; teamId?: string }) =>
      src.createGroupChat ? src.createGroupChat(input) : Promise.reject(new Error('unsupported')),
    [src],
  );
  const useTeamTemplate = useCallback(
    (appId: string) =>
      src.useTeamTemplate ? src.useTeamTemplate(appId) : Promise.reject(new Error('unsupported')),
    [src],
  );

  const loadArcRuns = useCallback(
    async (sessionId: string) =>
      src.loadArcRuns ? src.loadArcRuns(sessionId) : ([] as ArcRunCard[]),
    [src],
  );

  const loadArcPipeline = useCallback(
    async (runId: string): Promise<ArcPipelineView> => {
      if (!src.loadArcPipeline) throw new Error('数据源不支持 ARC 管线观测');
      const view = await src.loadArcPipeline(runId);
      if (!view) throw new Error('这条 run 不存在或已删除');
      return view;
    },
    [src],
  );

  const readArcArtifact = useCallback(
    async (runId: string, relPath: string) =>
      src.readArcArtifact
        ? src.readArcArtifact(runId, relPath)
        : { content: '', size: 0, truncated: false },
    [src],
  );

  const arcArtifactRawUrl = useCallback(
    (runId: string, relPath: string) => src.arcArtifactRawUrl?.(runId, relPath) ?? '',
    [src],
  );

  return {
    data,
    status,
    error,
    send,
    sending,
    stop,
    watch,
    focus,
    transcribe,
    savePolicy,
    patchSettings,
    savingSettings,
    rescanCli,
    testSsh,
    listArtifacts,
    readArtifact,
    artifactRawUrl,
    reset,
    reload,
    resolveDm,
    resolveApproval,
    listProjects,
    createProject,
    renameProject,
    deleteProject,
    setProjectWorkspace,
    createProjectConversation,
    createConversation,
    createGroupChat,
    useTeamTemplate,
    loadArcRuns,
    loadArcPipeline,
    readArcArtifact,
    arcArtifactRawUrl,
  };
}
