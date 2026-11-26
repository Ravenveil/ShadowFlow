/**
 * McpSection — 设置里的「MCP 集成」：管理本机 MCP 服务器。
 *
 * 列表行卡：名称 / 命令摘要 / 工具数（测过才有）/ 描述 + 测试、编辑、删除。
 * 添加与编辑都是行内表单（不弹第二层对话框）；表单里的「试连」走 probe，
 * 保存前的探测与保存后的测试共用同一套结果展示。
 * 删除复用 shell.css 的 sf-modal 二次确认。
 * 文案全部在 `content/mcp.ts`。
 */
import { useCallback, useEffect, useState } from 'react';
import { MCP_COPY } from '@/shared/content/mcp';
import { ApiError } from '@/shared/data/http/client';
import {
  createMcpServer,
  deleteMcpServer,
  listMcpServers,
  probeMcpServer,
  testMcpServer,
  updateMcpServer,
  type McpProbeInput,
  type McpServer,
  type McpServerInput,
  type McpTestResult,
  type McpTransport,
} from '@/shared/data/http/mcp';
import {
  IconAlert,
  IconCheckCircle,
  IconClose,
  IconLoader,
  IconPen,
  IconPlug,
  IconPlus,
  IconTrash,
} from '@/shared/ui/icons';
import { Seg, Tag, Tile, useFlash } from '@/app/settings/primitives';

const C = MCP_COPY;

/** 表单草稿：args / env / headers 用多行文本编辑，提交时再解析成结构。 */
interface Draft {
  transport: McpTransport;
  name: string;
  command: string;
  args: string;
  env: string;
  url: string;
  headers: string;
  description: string;
}

const EMPTY_DRAFT: Draft = {
  transport: 'stdio',
  name: '',
  command: '',
  args: '',
  env: '',
  url: '',
  headers: '',
  description: '',
};

function transportOf(server: McpServer): McpTransport {
  return server.transport === 'http' ? 'http' : 'stdio';
}

function draftOf(server: McpServer): Draft {
  return {
    transport: transportOf(server),
    name: server.name,
    command: server.command,
    args: server.args.join('\n'),
    env: Object.entries(server.env)
      .map(([k, v]) => `${k}=${v}`)
      .join('\n'),
    url: server.url ?? '',
    headers: Object.entries(server.headers ?? {})
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n'),
    description: server.description ?? '',
  };
}

/** 参数：多行时一行一个；只有一行时按空格拆。 */
function parseArgs(text: string): string[] {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length > 1) return lines;
  return (lines[0] ?? '').split(/\s+/).filter(Boolean);
}

/** 环境变量：每行 KEY=VALUE，缺等号或空键的行忽略。 */
function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const raw = line.trim();
    if (!raw) continue;
    const at = raw.indexOf('=');
    if (at <= 0) continue;
    const key = raw.slice(0, at).trim();
    if (key) out[key] = raw.slice(at + 1).trim();
  }
  return out;
}

/** 请求头一行的分隔符位置：`KEY: VALUE` 与 `KEY=VALUE` 都认，取最靠前的那个。 */
function headerSeparator(line: string): number {
  const colon = line.indexOf(':');
  const eq = line.indexOf('=');
  if (colon < 0) return eq;
  if (eq < 0) return colon;
  return Math.min(colon, eq);
}

/** 请求头：每行 KEY: VALUE 或 KEY=VALUE；格式不对的行标成 invalid，不静默丢掉。 */
function parseHeaders(text: string): { headers: Record<string, string>; invalid: boolean } {
  const headers: Record<string, string> = {};
  let invalid = false;
  for (const line of text.split('\n')) {
    const raw = line.trim();
    if (!raw) continue;
    const at = headerSeparator(raw);
    const key = at > 0 ? raw.slice(0, at).trim() : '';
    if (!key) {
      invalid = true;
      continue;
    }
    headers[key] = raw.slice(at + 1).trim();
  }
  return { headers, invalid };
}

/** http 传输只接受 http/https；`new URL` 不认的字符串一律算非法。 */
function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** 请求本身失败（网络 / 非 2xx）也要画成失败，不能停在「像成功」的状态。 */
function failedResult(err: unknown): McpTestResult {
  const code = err instanceof ApiError ? `HTTP_${err.status}` : 'REQUEST_FAILED';
  return { ok: false, tools: [], duration_ms: 0, error: { code, message: errorText(err) } };
}

function ToolList({ result }: { result: McpTestResult }) {
  if (!result.ok) {
    return (
      <p className="st-mcp-error">
        {result.error ? `${C.errorCode(result.error.code)} · ${result.error.message}` : C.testFailed}
      </p>
    );
  }
  if (!result.tools.length) return <p className="st-mcp-empty-tools">{C.toolsEmpty}</p>;
  return (
    <>
      <span className="st-mcp-tools-title">{C.toolsTitle}</span>
      <ul className="st-mcp-tools">
        {result.tools.map((tool) => (
          <li key={tool.name}>
            <b>{tool.name}</b>
            {tool.description ? <span>{tool.description}</span> : null}
          </li>
        ))}
      </ul>
    </>
  );
}

function ResultPanel({ result }: { result: McpTestResult }) {
  const Icon = result.ok ? IconCheckCircle : IconAlert;
  return (
    <div className="st-mcp-result" data-ok={result.ok ? 'true' : 'false'}>
      <div className="st-mcp-result-head">
        <Icon size={13} />
        <b>{result.ok ? C.testOk(result.tools.length) : C.testFailed}</b>
        <span className="st-mcp-ms">{C.duration(result.duration_ms)}</span>
      </div>
      <ToolList result={result} />
    </div>
  );
}

export function McpSection() {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  /** 每个服务器最近一次测试结果：卡片上的工具数与展开的工具列表都看它。 */
  const [tests, setTests] = useState<Record<string, McpTestResult>>({});
  const [busy, setBusy] = useState<string | null>(null);
  /** null = 表单关闭；name=null = 新增；name=字符串 = 编辑该服务器。 */
  const [editing, setEditing] = useState<{ name: string | null } | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [probing, setProbing] = useState(false);
  const [probeResult, setProbeResult] = useState<McpTestResult | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [flash, setFlash] = useFlash(2600);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setServers(await listMcpServers());
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setField = (patch: Partial<Draft>) => setDraft((prev) => ({ ...prev, ...patch }));

  /** 切换传输方式：清空另一侧的字段，别把 stdio 的命令带进 http 请求。 */
  const switchTransport = (next: McpTransport) => {
    if (next === draft.transport) return;
    setProbeResult(null);
    setFormError(null);
    setField(
      next === 'http'
        ? { transport: 'http', command: '', args: '', env: '' }
        : { transport: 'stdio', url: '', headers: '' },
    );
  };

  /** 按当前传输方式拼提交体：http 只带 URL 与请求头，stdio 只带启动规格。 */
  const serverInput = (name: string): McpServerInput => {
    const description = draft.description.trim();
    if (draft.transport === 'http') {
      return {
        name,
        transport: 'http',
        command: '',
        args: [],
        env: {},
        url: draft.url.trim(),
        headers: parseHeaders(draft.headers).headers,
        ...(description ? { description } : {}),
      };
    }
    return {
      name,
      transport: 'stdio',
      command: draft.command.trim(),
      args: parseArgs(draft.args),
      env: parseEnv(draft.env),
      ...(description ? { description } : {}),
    };
  };

  const openAdd = () => {
    setDraft(EMPTY_DRAFT);
    setEditing({ name: null });
    setProbeResult(null);
    setFormError(null);
  };

  const openEdit = (server: McpServer) => {
    setDraft(draftOf(server));
    setEditing({ name: server.name });
    setProbeResult(null);
    setFormError(null);
  };

  const closeForm = () => {
    setEditing(null);
    setProbeResult(null);
    setFormError(null);
  };

  const probe = async () => {
    setFormError(null);
    setProbeResult(null);

    let input: McpProbeInput;
    if (draft.transport === 'http') {
      const url = draft.url.trim();
      if (!url) {
        setFormError(C.missingUrl);
        return;
      }
      if (!isHttpUrl(url)) {
        setFormError(C.invalidUrl);
        return;
      }
      const parsed = parseHeaders(draft.headers);
      if (parsed.invalid) {
        setFormError(C.invalidHeaders);
        return;
      }
      input = { transport: 'http', url, headers: parsed.headers };
    } else {
      const command = draft.command.trim();
      if (!command) {
        setFormError(C.validation);
        return;
      }
      input = { transport: 'stdio', command, args: parseArgs(draft.args), env: parseEnv(draft.env) };
    }

    setProbing(true);
    try {
      setProbeResult(await probeMcpServer(input));
    } catch (err) {
      setProbeResult(failedResult(err));
    } finally {
      setProbing(false);
    }
  };

  const save = async () => {
    if (!editing) return;
    const name = draft.name.trim();
    if (!name) {
      setFormError(C.validation);
      return;
    }
    if (draft.transport === 'stdio' && !draft.command.trim()) {
      setFormError(C.validation);
      return;
    }
    if (draft.transport === 'http') {
      const url = draft.url.trim();
      if (!url) {
        setFormError(C.missingUrl);
        return;
      }
      if (!isHttpUrl(url)) {
        setFormError(C.invalidUrl);
        return;
      }
      if (parseHeaders(draft.headers).invalid) {
        setFormError(C.invalidHeaders);
        return;
      }
    }
    if (editing.name === null && servers.some((s) => s.name === name)) {
      setFormError(C.duplicate);
      return;
    }

    const input = serverInput(name);

    setBusy('__save__');
    setFormError(null);
    try {
      if (editing.name === null) {
        const created = await createMcpServer(input);
        setServers((list) => [...list, created]);
        setFlash(C.edited(created.name));
      } else {
        const original = editing.name;
        const updated = await updateMcpServer(original, input);
        setServers((list) => list.map((s) => (s.name === original ? updated : s)));
        setFlash(C.edited(updated.name));
      }
      closeForm();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setFormError(C.duplicate);
      else setFormError(errorText(err));
    } finally {
      setBusy(null);
    }
  };

  const test = async (server: McpServer) => {
    setBusy(server.name);
    try {
      const result = await testMcpServer(server.name);
      setTests((map) => ({ ...map, [server.name]: result }));
      setFlash(result.ok ? C.testOk(result.tools.length) : C.testFailed);
    } catch (err) {
      setTests((map) => ({ ...map, [server.name]: failedResult(err) }));
      setFlash(C.testFailed);
    } finally {
      setBusy(null);
    }
  };

  const remove = async (name: string) => {
    setBusy('__delete__');
    try {
      await deleteMcpServer(name);
      setServers((list) => list.filter((s) => s.name !== name));
      setTests((map) => {
        const next = { ...map };
        delete next[name];
        return next;
      });
      if (editing?.name === name) closeForm();
      setConfirm(null);
      setFlash(C.removed(name));
    } catch (err) {
      setFlash(errorText(err));
    } finally {
      setBusy(null);
    }
  };

  const deleting = busy === '__delete__';
  /** http 缺 URL 时不能保存；就地禁用按钮并给出原因，不做静默兜底。 */
  const urlMissing = draft.transport === 'http' && !draft.url.trim();

  return (
    <div className="st-stack">
      {loading ? (
        <p className="st-empty">{C.loading}</p>
      ) : loadFailed ? (
        <p className="st-flash" data-tone="danger">
          {C.loadFailed}
        </p>
      ) : (
        <>
          {servers.length === 0 && !editing ? (
            <div className="st-empty">
              <b>{C.empty}</b>
              <span>{C.emptyHint}</span>
            </div>
          ) : null}

          {servers.length > 0 ? (
            <div className="st-list">
              {servers.map((server) => {
                const result = tests[server.name];
                const working = busy === server.name;
                const transport = transportOf(server);
                const summary =
                  transport === 'http'
                    ? (server.url ?? '')
                    : [server.command, ...server.args].join(' ');
                return (
                  <div className="st-card" key={server.name}>
                    <div className="st-card-head">
                      <Tile tone="teal">
                        <IconPlug size={14} />
                      </Tile>
                      <div className="st-card-text">
                        <b>{server.name}</b>
                        <span className="st-mcp-cmd" title={summary}>
                          {summary}
                        </span>
                      </div>
                      {transport === 'http' ? <Tag tone="accent">{C.transports.http}</Tag> : null}
                      {result ? (
                        <Tag tone={result.ok ? 'ok' : 'danger'}>
                          {result.ok ? C.toolCount(result.tools.length) : C.testFailed}
                        </Tag>
                      ) : null}
                      <button
                        className="st-btn"
                        disabled={working}
                        onClick={() => void test(server)}
                      >
                        {working ? <IconLoader size={12} className="st-spin" /> : null}
                        {working ? C.testing : C.test}
                      </button>
                      <button className="st-btn st-btn--ghost" onClick={() => openEdit(server)}>
                        <IconPen size={12} />
                        {C.edit}
                      </button>
                      <button
                        className="st-btn st-btn--ghost"
                        data-tone="danger"
                        title={C.remove}
                        aria-label={`${C.remove} ${server.name}`}
                        onClick={() => setConfirm(server.name)}
                      >
                        <IconTrash size={13} />
                      </button>
                    </div>

                    {server.description ? (
                      <p className="st-mcp-desc">{server.description}</p>
                    ) : null}

                    {result ? <ResultPanel result={result} /> : null}
                  </div>
                );
              })}
            </div>
          ) : null}

          {editing ? (
            <div className="st-form">
              <div className="st-form-title">{editing.name === null ? C.formAdd : C.formEdit}</div>
              <div className="st-form-grid st-mcp-form">
                <label className="st-form-wide st-mcp-transport">
                  <span>{C.fields.transport}</span>
                  <Seg<McpTransport>
                    label={C.fields.transport}
                    value={draft.transport}
                    options={C.transportOptions}
                    onChange={switchTransport}
                  />
                </label>
                <label className="st-form-wide">
                  <span>{C.fields.name}</span>
                  <input
                    className="st-input"
                    value={draft.name}
                    placeholder={C.placeholders.name}
                    disabled={editing.name !== null}
                    onChange={(e) => setField({ name: e.target.value })}
                  />
                </label>
                {draft.transport === 'stdio' ? (
                  <>
                    <label className="st-form-wide">
                      <span>{C.fields.command}</span>
                      <input
                        className="st-input"
                        data-mono="true"
                        value={draft.command}
                        placeholder={C.placeholders.command}
                        onChange={(e) => setField({ command: e.target.value })}
                      />
                    </label>
                    <label className="st-mcp-wide">
                      <span>{C.fields.args}</span>
                      <textarea
                        className="st-input"
                        rows={3}
                        value={draft.args}
                        placeholder={C.placeholders.args}
                        onChange={(e) => setField({ args: e.target.value })}
                      />
                    </label>
                    <label className="st-mcp-wide">
                      <span>{C.fields.env}</span>
                      <textarea
                        className="st-input"
                        rows={3}
                        value={draft.env}
                        placeholder={C.placeholders.env}
                        onChange={(e) => setField({ env: e.target.value })}
                      />
                    </label>
                  </>
                ) : (
                  <>
                    <label className="st-form-wide">
                      <span>{C.fields.url}</span>
                      <input
                        className="st-input"
                        data-mono="true"
                        value={draft.url}
                        placeholder={C.placeholders.url}
                        onChange={(e) => setField({ url: e.target.value })}
                      />
                      {urlMissing ? <span className="st-mcp-warn">{C.missingUrl}</span> : null}
                    </label>
                    <label className="st-mcp-wide">
                      <span>{C.fields.headers}</span>
                      <textarea
                        className="st-input"
                        rows={3}
                        value={draft.headers}
                        placeholder={C.placeholders.headers}
                        onChange={(e) => setField({ headers: e.target.value })}
                      />
                    </label>
                  </>
                )}
                <label className="st-form-wide">
                  <span>{C.fields.description}</span>
                  <input
                    className="st-input"
                    value={draft.description}
                    placeholder={C.placeholders.description}
                    onChange={(e) => setField({ description: e.target.value })}
                  />
                </label>
              </div>

              <p className="st-hint">{C.hints.name}</p>
              <p className="st-hint">{C.hints.transport}</p>
              {draft.transport === 'stdio' ? (
                <>
                  <p className="st-hint">{C.hints.command}</p>
                  <p className="st-hint">{C.hints.args}</p>
                  <p className="st-hint">{C.hints.env}</p>
                </>
              ) : (
                <>
                  <p className="st-hint">{C.hints.url}</p>
                  <p className="st-hint">{C.hints.headers}</p>
                </>
              )}

              <div className="st-actions">
                <button
                  className="st-btn st-btn--solid"
                  disabled={busy === '__save__' || urlMissing}
                  onClick={() => void save()}
                >
                  {busy === '__save__' ? C.saving : C.save}
                </button>
                <button className="st-btn" disabled={probing} onClick={() => void probe()}>
                  {probing ? <IconLoader size={12} className="st-spin" /> : null}
                  {probing ? C.probing : C.probe}
                </button>
                <button className="st-btn st-btn--ghost" onClick={closeForm}>
                  {C.cancel}
                </button>
              </div>

              {formError ? (
                <p className="st-flash" data-tone="danger">
                  {formError}
                </p>
              ) : null}
              {probeResult ? <ResultPanel result={probeResult} /> : null}
            </div>
          ) : (
            <div className="st-actions">
              <button className="st-btn" onClick={openAdd}>
                <IconPlus size={13} />
                {C.add}
              </button>
              {flash ? <span className="st-flash">{flash}</span> : null}
            </div>
          )}

          {editing && flash ? <span className="st-flash">{flash}</span> : null}
        </>
      )}

      {confirm ? (
        <div
          className="sf-modal-mask"
          role="presentation"
          onMouseDown={() => (!deleting ? setConfirm(null) : undefined)}
        >
          <div
            className="sf-modal"
            role="dialog"
            aria-modal="true"
            aria-label={C.removeTitle(confirm)}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="sf-modal-head">
              <h2>{C.removeTitle(confirm)}</h2>
              <button
                className="sf-icon-btn"
                aria-label={C.cancel}
                disabled={deleting}
                onClick={() => setConfirm(null)}
              >
                <IconClose size={15} />
              </button>
            </div>
            <p className="st-hint">{C.removeBody}</p>
            <div className="sf-modal-actions">
              <button className="st-btn" disabled={deleting} onClick={() => setConfirm(null)}>
                {C.cancel}
              </button>
              <button
                className="st-btn st-btn--danger"
                disabled={deleting}
                onClick={() => void remove(confirm)}
              >
                {deleting ? C.removing : C.removeConfirm}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
