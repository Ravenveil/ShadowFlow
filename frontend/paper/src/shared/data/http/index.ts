/**
 * http/index.ts — 真后端实现（组装层）。
 *
 * 一份 WorkspaceData 是**十几条既有接口的拼装结果**：会话列表带消息、
 * agent 列表、团队工作流、策略矩阵、BYOK、CLI 探测、SSH 配置、知识包。
 * 拼装放这里而不是放后端：后端保持「一个领域一个路由」，前端要什么自己组合，
 * 两边互不牵着走（新增一个视图不用动后端一行）。
 *
 * 读 → mappers.ts 转形状；写 → 分发到后端各域的真实端点（见 saveSettings）。
 */
import { COMMANDS } from '@/shared/data/commands';
import { EMPTY_LISTING, type PanelSlice, type WorkspaceData, type WorkspaceSource } from '@/shared/data/source';
import type {
  AppSettings,
  ArtifactContent,
  ArtifactListing,
  Message,
  Outbound,
  PolicyMatrix,
  ProjectNode,
  ProviderSetting,
  SshHost,
} from '@/shared/data/types';
import { API_BASE, ROUTES, mayGet, pickData, postBinary, request } from '@/shared/data/http/client';
import { forkCatalogApp } from '@/shared/data/http/generic';
import {
  arcArtifactRawUrl as fetchArcRawUrl,
  loadArcPipeline as fetchArcPipeline,
  loadArcRuns as fetchArcRuns,
  readArcArtifact as fetchArcArtifact,
} from '@/shared/data/http/arc';
import type {
  AgentDto,
  ByokDto,
  CliDetectDto,
  DmResolveDto,
  FsListDto,
  FsReadDto,
  GroupDto,
  GroupMessageDto,
  KnowledgePackDto,
  ProjectDto,
  SshConfigEnvelopeDto,
  SshTestDto,
  TeamDto,
  WorkflowDto,
} from '@/shared/data/http/contract';
import { watchGroup } from '@/shared/data/http/events';
import { fetchTimeline, watchRun } from '@/shared/data/http/timeline';
import {
  frameToMessage,
  toArtifactListing,
  toCliProbes,
  toComposer,
  toDag,
  applyRunState,
  toMessage,
  toPanel,
  toPolicy,
  toRoster,
  toSession,
  toSettings,
  toThread,
  type AgentName,
} from '@/shared/data/http/mappers';

interface Envelope<T> {
  data: T;
}

interface PacksEnvelope {
  data: { packs?: KnowledgePackDto[] };
}

/* ── 模块级缓存（一次 load 的结果，供 send / save 用） ─────────────── */

let nameIndex: AgentName = (id) => id;
let activeTeamId: string | null = null;
/** 依赖 SSE 推送回复：send 之后 sending 由订阅帧收尾，不由 Promise 收尾。 */
const STREAMS_REPLIES = true;

/** 本机偏好（后端没有的分区）落 localStorage —— 与设置页「偏好保存在本机」一致。 */
const LOCAL_KEY = 'sf.paper.settings.v1';

function readLocal(): Partial<AppSettings> {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
    return parsed && typeof parsed === 'object' ? (parsed as Partial<AppSettings>) : {};
  } catch {
    return {};
  }
}

function writeLocal(settings: AppSettings): void {
  // 只存本机负责的分区；providers / clis / ssh 的真源在服务端。
  const { providers: _p, clis: _c, ssh: _s, ...rest } = settings;
  void _p;
  void _c;
  void _s;
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(rest));
  } catch {
    /* 隐私模式写不进去就算了，下次打开回到服务端值 */
  }
}

/** 打码的 Key（`••••uyWH`）不能回写后端，否则真 Key 被掩码覆盖。 */
const isMasked = (key: string): boolean => key.includes('•') || key.includes('*');

/* ── 会话工作目录（产物 tab 的数据来源） ───────────────────────────── */

/**
 * 会话 id → 工作目录绝对路径（`group.workspace_dir`）。
 * agent 写的文件都落在那里，所以「产物」= 这个目录里的文件；
 * 后端 `/api/fs/*` 的 `root` 也用它做越权校验。
 */
const workspaceDirs = new Map<string, string>();

function rememberWorkspaceDirs(groups: GroupDto[]): void {
  for (const g of groups) {
    const dir = g.workspace_dir?.trim();
    if (dir) workspaceDirs.set(g.group_id, dir);
  }
}

/** 缓存没有时单独查一次（深链接直达某条会话、或列表里没带目录）。 */
async function workspaceDirOf(sessionId: string): Promise<string> {
  const cached = workspaceDirs.get(sessionId);
  if (cached) return cached;
  const res = await mayGet<Envelope<GroupDto>>(ROUTES.group(sessionId));
  const dir = pickData<GroupDto>(res)?.workspace_dir?.trim() ?? '';
  if (dir) workspaceDirs.set(sessionId, dir);
  return dir;
}

/* ── 拉取 ─────────────────────────────────────────────────────────── */

interface CoreSlices {
  groups: GroupDto[];
  agents: AgentDto[];
  byok: ByokDto | null;
  cli: CliDetectDto | null;
  ssh: SshConfigEnvelopeDto | null;
  packs: KnowledgePackDto[];
}

async function fetchCore(): Promise<CoreSlices> {
  const [groups, agents, byok, cli, ssh, packs] = await Promise.all([
    request<Envelope<GroupDto[]>>(ROUTES.groups),
    request<Envelope<AgentDto[]>>(ROUTES.agents),
    mayGet<ByokDto>(ROUTES.byok),
    mayGet<CliDetectDto>(ROUTES.cli),
    mayGet<Envelope<SshConfigEnvelopeDto>>(ROUTES.sshConfig),
    mayGet<PacksEnvelope>(ROUTES.packs),
  ]);

  return {
    groups: groups?.data ?? [],
    agents: agents?.data ?? [],
    byok,
    cli,
    ssh: pickData<SshConfigEnvelopeDto>(ssh),
    packs: packs?.data?.packs ?? [],
  };
}

/** 团队工作流 + 策略；没建团队时回落到群上的 policy_matrix。 */
async function fetchTeamSlice(
  group: GroupDto | undefined,
  roster: ReturnType<typeof toRoster>,
): Promise<{ policy: PolicyMatrix; dag: ReturnType<typeof toDag> }> {  const teamId = group?.team_id ?? null;
  const fallback = {
    policy: toPolicy(group?.policy_matrix),
    dag: toDag(null, roster),
  };
  if (!group || !teamId) return fallback;

  // 先确认团队还在：群记录上的 team_id 可能是历史残留（团队已删），
  // 直接三条一起打会白白多两个 404。
  const team = await mayGet<Envelope<TeamDto>>(ROUTES.team(teamId));
  const teamRecord = pickData<TeamDto>(team);
  if (!teamRecord) return fallback;

  const [workflow, policy] = await Promise.all([
    mayGet<Envelope<WorkflowDto>>(ROUTES.teamWorkflow(teamId)),
    mayGet<Envelope<Record<string, Record<string, string>>>>(ROUTES.teamPolicy(teamId)),
  ]);

  return {
    policy: toPolicy(pickData(policy) ?? teamRecord.policy_matrix ?? group.policy_matrix),
    dag: toDag(pickData<WorkflowDto>(workflow) ?? teamRecord.workflow ?? null, roster),
  };
}

/** 该会话第一个挂起审批门的 nodeId；没有 / 接口不在时 undefined（界面只提示不出按钮）。 */
async function firstPendingApproval(groupId: string): Promise<{ nodeId: string } | undefined> {
  const res = await mayGet<{ pending?: string[] }>(ROUTES.groupApprovals(groupId));
  const nodeId = res?.pending?.[0];
  return nodeId ? { nodeId } : undefined;
}

async function buildWorkspace(sessionId?: string): Promise<WorkspaceData> {
  const core = await fetchCore();
  if (!core.groups.length) {
    throw new Error('后端还没有任何会话：先在旧界面或 CLI 里建一个群/单聊');
  }

  const nameOf: AgentName = (id) => core.agents.find((a) => a.agent_id === id)?.name ?? id;
  nameIndex = nameOf;
  rememberWorkspaceDirs(core.groups);

  // 最近有动静的排前面（后端按创建顺序返回，聊天界面要的是「谁刚说过话」）
  const recent = (g: GroupDto): number => Date.parse(g.updated_at ?? g.created_at) || 0;
  const ordered = [...core.groups].sort((a, b) => recent(b) - recent(a));

  const sessions = ordered.map((g) => toSession(g, nameOf));
  const threads: Record<string, Message[]> = {};
  for (const g of ordered) threads[g.group_id] = toThread(g, nameOf);

  const active = ordered.find((g) => g.group_id === sessionId) ?? ordered[0];
  activeTeamId = active.team_id ?? null;

  const roster = toRoster(core.agents, active);
  const { policy, dag } = await fetchTeamSlice(active, roster);
  const pendingApproval = await firstPendingApproval(active.group_id);

  const serverSettings = toSettings({ byok: core.byok, cli: core.cli, ssh: core.ssh?.config ?? null, packs: core.packs });
  const local = readLocal();
  const settings: AppSettings = {
    ...serverSettings,
    ...local,
    // 服务端掌管的三个分区永远以服务端为准
    providers: serverSettings.providers,
    clis: serverSettings.clis,
    ssh: serverSettings.ssh,
  };

  return {
    sessions,
    threads,
    panel: toPanel(active ?? null, roster, threads[active.group_id] ?? [], pendingApproval),
    roster,
    policy,
    dag: applyRunState(dag, roster, threads[active.group_id] ?? []),
    composer: toComposer(core.byok, core.cli, core.packs, COMMANDS),
    settings,
    focused: active.group_id,
  };
}

/* ── 写入 ─────────────────────────────────────────────────────────── */

/** 上一拍已同步到后端的值，用来跳过重复 PUT（设置页每点一下都会整份下发）。 */
const syncedProviders = new Map<string, string>();
let syncedSsh = '';

function providerFingerprint(p: ProviderSetting): string {
  return `${p.on ? 1 : 0}|${isMasked(p.key) ? 'masked' : p.key}`;
}

async function syncProviders(providers: ProviderSetting[]): Promise<void> {
  await Promise.all(
    providers.map(async (p) => {
      const fp = providerFingerprint(p);
      if (syncedProviders.get(p.id) === fp) return;

      const body: Record<string, unknown> = { enabled: p.on };
      if (p.key && !isMasked(p.key)) body.apiKey = p.key;
      if (p.defaultModel) body.manualModels = [p.defaultModel];

      await request(ROUTES.byokSave(p.id), { method: 'PUT', body: JSON.stringify(body) });
      syncedProviders.set(p.id, fp);
    }),
  );
}

async function syncSsh(hosts: SshHost[]): Promise<void> {
  const host = hosts[0];
  if (!host) return;
  const fp = `${host.host}|${host.port}|${host.user}|${host.keyPath}|${host.remoteDir}`;
  if (fp === syncedSsh) return;

  const body: Record<string, unknown> = {
    host: host.host,
    port: host.port,
    user: host.user,
    remoteDir: host.remoteDir,
  };
  // 打码路径不能回写（会把真私钥路径覆盖成「••••」）
  if (host.keyPath && !isMasked(host.keyPath)) body.keyPath = host.keyPath;

  await request(ROUTES.sshConfig, { method: 'PUT', body: JSON.stringify(body) });
  syncedSsh = fp;
}

/** 语音转写的上游凭证：设置页存的是打码值，需要明文得走 reveal。 */
let asrKeyCache: { provider: string; key: string } | null = null;

async function resolveAsrKey(byok: ByokDto | null): Promise<{ provider: string; key: string } | null> {
  if (asrKeyCache) return asrKeyCache;
  const providers = Object.entries(byok?.providers ?? {}).filter(([, p]) => p.enabled && p.apiKey);
  // 小米 MiMo 有专门的语音模型；没配就用第一个启用的 OpenAI 兼容供应商
  const target = providers.find(([id]) => id === 'mimo') ?? providers[0];
  if (!target) return null;
  try {
    const res = await request<{ apiKey?: string }>(ROUTES.byokReveal(target[0]));
    if (res?.apiKey) asrKeyCache = { provider: target[0], key: res.apiKey };
    return asrKeyCache;
  } catch {
    return null;
  }
}

/* ── WorkspaceSource ─────────────────────────────────────────────── */

/** 建一个群（新对话 / 发起群聊共用）：agentIds 空 = 空群，非空 = 拉人进群。 */
async function createConversation(title: string, agentIds: string[] = [], teamId?: string): Promise<string> {
  const group = await request<{ group_id?: string }>(ROUTES.groupCreate, {
    method: 'POST',
    body: JSON.stringify({
      name: title,
      kind: 'group',
      agent_ids: agentIds,
      ...(teamId ? { team_id: teamId } : {}),
    }),
  });
  const gid = group?.group_id ?? '';
  if (!gid) throw new Error('建群失败');
  return gid;
}

export const httpSource: WorkspaceSource = {  id: 'http',
  streamsReplies: STREAMS_REPLIES,

  load: (sessionId?: string) => buildWorkspace(sessionId),

  async loadPanel(sessionId: string): Promise<PanelSlice> {
    // 只取这一条会话 + agent 名册：切会话时不必把整个列表再拉一遍
    const [groupRes, agents] = await Promise.all([
      mayGet<Envelope<GroupDto>>(ROUTES.group(sessionId)),
      request<Envelope<AgentDto[]>>(ROUTES.agents),
    ]);
    const group = pickData<GroupDto>(groupRes) ?? undefined;
    if (group?.workspace_dir?.trim()) workspaceDirs.set(group.group_id, group.workspace_dir.trim());
    const nameOf: AgentName = (id) => (agents?.data ?? []).find((a) => a.agent_id === id)?.name ?? id;
    nameIndex = nameOf;

    activeTeamId = group?.team_id ?? null;
    const roster = toRoster(agents?.data ?? [], group);
    const thread = group ? toThread(group, nameOf) : [];
    const { policy, dag } = await fetchTeamSlice(group, roster);
    const pendingApproval = group ? await firstPendingApproval(group.group_id) : undefined;

    return {
      panel: toPanel(group ?? null, roster, thread, pendingApproval),
      roster,
      policy,
      dag: applyRunState(dag, roster, thread),
    };
  },

  async send(sessionId, out: Outbound, opts) {
    const body = {
      content: out.text,
      sender_name: 'user',
      sender_kind: 'user',
      ...(out.model ? { executor: out.model } : {}),
      ...(out.knowledge?.length ? { knowledge_pack_ids: out.knowledge } : {}),
    };
    const created = await request<GroupMessageDto>(ROUTES.groupMessage(sessionId), {
      method: 'POST',
      body: JSON.stringify(body),
      signal: opts?.signal,
    });
    const msg = toMessage(created, nameIndex);
    return [{ ...msg, attachments: out.attachments, knowledge: out.knowledge }];
  },

  async stop(sessionId: string) {
    try {
      await request(ROUTES.groupStop(sessionId), { method: 'POST' });
    } catch {
      /* 已经跑完 / 没在跑：后端返回 stopped:false，不算错 */
    }
  },

  subscribe(sessionId, onMessages) {
    return watchGroup(sessionId, (type, data) => {
      const msg = frameToMessage(type, data, nameIndex);
      if (msg) onMessages([msg]);
    });
  },

  /**
   * 时间线读路径：历史由后端归并（聊天消息 + 每个 run 的事件重放），
   * 前端只负责把它和实时过程流接在一起。
   */
  loadTimeline(sessionId: string) {
    return fetchTimeline(sessionId);
  },

  watchRunStream(sessionId, handlers) {
    return watchRun(sessionId, handlers);
  },

  async savePolicy(policy: PolicyMatrix) {
    if (!activeTeamId) {
      // 群还没绑团队时后端无处可存；保留本地记忆，不让界面回跳
      console.warn('[workspace] 该群未绑定团队，策略只在本次会话内生效');
      return;
    }
    await request(ROUTES.teamPolicy(activeTeamId), {
      method: 'PUT',
      body: JSON.stringify({ matrix: policy }),
    });
  },

  /**
   * 列会话工作目录。文件是真的磁盘文件（agent 写的稿子、图、bib 都在这），
   * 目录项也能点进去 —— `/api/fs/list` 一次就返回目录 + 文件两项。
   */
  async listArtifacts(sessionId: string, dir?: string): Promise<ArtifactListing> {
    const root = await workspaceDirOf(sessionId);
    if (!root) return { ...EMPTY_LISTING };
    const target = dir || root;
    const res = await mayGet<Envelope<FsListDto>>(ROUTES.fsList(target));
    return toArtifactListing(pickData<FsListDto>(res), root, target);
  },

  async readArtifact(sessionId: string, filePath: string): Promise<ArtifactContent> {
    const root = await workspaceDirOf(sessionId);
    if (!root) throw new Error('该会话没有工作目录，读不到产物');
    const res = await request<Envelope<FsReadDto>>(ROUTES.fsRead(filePath, root));
    const data = pickData<FsReadDto>(res);
    return {
      content: data?.content ?? '',
      size: data?.size ?? 0,
      truncated: !!data?.truncated,
    };
  },

  /** 图片 / PDF 的直链（界面直接放进 img / iframe）。root 必须已经是缓存里的那条。 */
  artifactRawUrl(sessionId: string, filePath: string): string {
    const root = workspaceDirs.get(sessionId) ?? '';
    return root ? `${API_BASE}${ROUTES.fsRaw(filePath, root)}` : '';
  },

  async saveSettings(next: AppSettings) {
    writeLocal(next);
    await Promise.all([syncProviders(next.providers), syncSsh(next.ssh)]);
  },

  async rescanCli() {
    const snap = await request<CliDetectDto>(ROUTES.cliRefresh, { method: 'POST' });
    return toCliProbes(snap);
  },

  async testSsh() {
    const res = await request<Envelope<SshTestDto>>(ROUTES.sshTest, { method: 'POST' });
    const result = pickData<SshTestDto>(res);
    return {
      state: result?.ok ? ('ok' as const) : ('error' as const),
      latencyMs: result?.durationMs,
      gpu: result?.stdout?.split('\n')[0]?.slice(0, 40) || undefined,
    };
  },

  async transcribe(audio: Blob) {
    const byok = await mayGet<ByokDto>(ROUTES.byok);
    const target = await resolveAsrKey(byok);
    const isMimo = target?.provider === 'mimo';

    const json = await postBinary<Envelope<{ text?: string }>>(ROUTES.asr, audio, {
      ...(target ? { 'x-llm-key': target.key, 'x-llm-provider': target.provider } : {}),
      ...(isMimo ? { 'x-asr-model': 'mimo-v2.5-asr', 'x-asr-style': 'chat-audio' } : {}),
      'x-asr-language': 'zh',
    });
    return json?.data?.text ?? '';
  },

  async reset() {
    try {
      localStorage.removeItem(LOCAL_KEY);
    } catch {
      /* ignore */
    }
    syncedProviders.clear();
    syncedSsh = '';
    asrKeyCache = null;
    return buildWorkspace();
  },

  async resolveDm(agentId: string): Promise<string> {
    const res = await request<DmResolveDto>(ROUTES.dmResolve(agentId), { method: 'POST' });
    return res?.group_id ?? '';
  },

  async resolveApproval(sessionId, nodeId, decision, comment) {
    await request(ROUTES.groupApprovalDecision(sessionId, nodeId), {
      method: 'POST',
      body: JSON.stringify({ decision, ...(comment ? { comment } : {}) }),
    });
  },

  async listProjects(): Promise<ProjectNode[]> {
    const res = await mayGet<ProjectDto[] | Envelope<ProjectDto[]>>(ROUTES.projects);
    const list = Array.isArray(res) ? res : pickData<ProjectDto[]>(res) ?? [];
    return list.map((p) => ({
      id: p.project_id ?? p.id ?? '',
      name: p.name ?? p.project_id ?? p.id ?? '',
      workspacePath: p.workspace_path,
      sessions: (p.sessions ?? []).map((s) => ({
        id: s.session_id ?? '',
        title: s.title ?? s.session_id ?? '',
        status: s.status,
      })),
    }));
  },

  async createProject(name: string, workspacePath?: string): Promise<ProjectNode> {
    const created = await request<ProjectDto>(ROUTES.projectCreate, {
      method: 'POST',
      body: JSON.stringify({ name, ...(workspacePath ? { workspace_path: workspacePath } : {}) }),
    });
    return {
      id: created.project_id ?? created.id ?? '',
      name: created.name ?? name,
      workspacePath: created.workspace_path,
      sessions: [],
    };
  },

  async renameProject(id: string, name: string): Promise<void> {
    await request(ROUTES.projectUpdate(id), {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    });
  },

  async deleteProject(id: string): Promise<void> {
    await request(ROUTES.projectDelete(id), { method: 'DELETE' });
  },

  /** 顶层「新建对话」：建一个空群（没有项目归属），返回会话 id。 */
  createConversation,

  /** 发起群聊：选人（可整队）→ 建群挂 team。与 legacy NeoCreateGroupModal 同语义。 */
  async createGroupChat(input: {
    name?: string;
    agentIds: string[];
    teamId?: string;
  }): Promise<string> {
    return createConversation(input.name || '新群聊', input.agentIds, input.teamId);
  },

  /** 团队模板「一键使用」：fork 落 agent + team → 建群挂 team_id，直接进群。 */
  async useTeamTemplate(appId: string): Promise<string> {
    const forked = await forkCatalogApp(appId);
    const team = forked.team;
    const agentIds = team?.agent_ids?.length
      ? team.agent_ids
      : (forked.agents ?? []).map((a) => a.agent_id);
    if (!team || agentIds.length === 0) throw new Error('模板已 fork，但没返回团队记录');
    return createConversation(team.name || '新群聊', agentIds, team.team_id);
  },

  async createProjectConversation(projectId: string, title: string): Promise<string> {
    // 先建群，再把群绑定到项目（后端只有 by-group 的绑定端点）。
    const gid = await createConversation(title);
    await request(ROUTES.projectBindGroup(gid), {
      method: 'PATCH',
      body: JSON.stringify({ project_id: projectId }),
    });
    return gid;
  },

  /** 这条会话工作目录里的 ARC run；该会话还没跑过时回全部已知 run（独立跑的也能看）。 */
  async loadArcRuns(sessionId: string) {
    const root = await workspaceDirOf(sessionId);
    const scoped = await fetchArcRuns(root || undefined);
    return scoped.length ? scoped : fetchArcRuns();
  },

  async loadArcPipeline(runId: string) {
    const view = await fetchArcPipeline(runId);
    if (!view) throw new Error('这条 run 不存在或已删除');
    return view;
  },

  readArcArtifact(runId: string, relPath: string) {
    return fetchArcArtifact(runId, relPath);
  },

  arcArtifactRawUrl(runId: string, relPath: string): string {
    return fetchArcRawUrl(runId, relPath);
  },
};
