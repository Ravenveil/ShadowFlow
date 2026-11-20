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
import { COMMANDS } from '../commands';
import type { PanelSlice, WorkspaceData, WorkspaceSource } from '../source';
import type { AppSettings, Message, Outbound, PolicyMatrix, ProviderSetting, SshHost } from '../types';
import { ROUTES, mayGet, pickData, postBinary, request } from './client';
import type {
  AgentDto,
  ByokDto,
  CliDetectDto,
  GroupDto,
  GroupMessageDto,
  KnowledgePackDto,
  SshConfigEnvelopeDto,
  SshTestDto,
  TeamDto,
  WorkflowDto,
} from './contract';
import { watchGroup } from './events';
import {
  frameToMessage,
  toCliProbes,
  toComposer,
  toDag,
  toMessage,
  toPanel,
  toPolicy,
  toRoster,
  toSession,
  toSettings,
  toThread,
  type AgentName,
} from './mappers';

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
): Promise<{ policy: PolicyMatrix; dag: ReturnType<typeof toDag> }> {
  const teamId = group?.team_id ?? null;
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

async function buildWorkspace(sessionId?: string): Promise<WorkspaceData> {
  const core = await fetchCore();
  if (!core.groups.length) {
    throw new Error('后端还没有任何会话：先在旧界面或 CLI 里建一个群/单聊');
  }

  const nameOf: AgentName = (id) => core.agents.find((a) => a.agent_id === id)?.name ?? id;
  nameIndex = nameOf;

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
    panel: toPanel(active ?? null, roster, threads[active.group_id] ?? []),
    roster,
    policy,
    dag,
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

export const httpSource: WorkspaceSource = {
  id: 'http',
  streamsReplies: STREAMS_REPLIES,

  load: (sessionId?: string) => buildWorkspace(sessionId),

  async loadPanel(sessionId: string): Promise<PanelSlice> {
    // 只取这一条会话 + agent 名册：切会话时不必把整个列表再拉一遍
    const [groupRes, agents] = await Promise.all([
      mayGet<Envelope<GroupDto>>(ROUTES.group(sessionId)),
      request<Envelope<AgentDto[]>>(ROUTES.agents),
    ]);
    const group = pickData<GroupDto>(groupRes) ?? undefined;
    const nameOf: AgentName = (id) => (agents?.data ?? []).find((a) => a.agent_id === id)?.name ?? id;
    nameIndex = nameOf;

    activeTeamId = group?.team_id ?? null;
    const roster = toRoster(agents?.data ?? [], group);
    const thread = group ? toThread(group, nameOf) : [];
    const { policy, dag } = await fetchTeamSlice(group, roster);

    return { panel: toPanel(group ?? null, roster, thread), roster, policy, dag };
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
};
