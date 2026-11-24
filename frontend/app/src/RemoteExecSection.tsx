/**
 * RemoteExecSection — 远程执行（SSH）设置，搬自 frontend-paper SshSection。
 *
 * 后端只存一台主机（单配置），所以这里按单机表单呈现：
 *   GET    /api/remote-exec/config        → { configured, config }
 *   PUT    /api/remote-exec/config        → 保存（私钥留空沿用原值）
 *   POST   /api/remote-exec/test          → 连通测试（可带表单值先测再存）
 *
 * 数据全部走后端，不在前端写死主机或状态。
 */
import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, CircleDashed, Loader2, PlugZap, Save, Server } from "lucide-react";
import { apiFetch } from "./chat-api";
import { REMOTE_EXEC as COPY } from "./content/settings";

type SshConfigView = {
  configured: boolean;
  config: {
    host: string;
    port: number;
    user: string;
    keyPathMasked: string | null;
    remoteDir: string;
  } | null;
};

type TestResult = { ok: boolean; code?: number; stderr?: string; durationMs?: number };

export default function RemoteExecSection() {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [configured, setConfigured] = useState(false);
  const [host, setHost] = useState("");
  const [port, setPort] = useState(22);
  const [user, setUser] = useState("");
  const [keyPath, setKeyPath] = useState("");
  const [keyPathMasked, setKeyPathMasked] = useState("");
  const [remoteDir, setRemoteDir] = useState("");
  const [busy, setBusy] = useState<"save" | "test" | null>(null);
  const [notice, setNotice] = useState<{ tone: "ok" | "err" | "info"; text: string } | null>(null);
  const [result, setResult] = useState<TestResult | null>(null);

  useEffect(() => {
    apiFetch<{ data?: SshConfigView } | SshConfigView>("/api/remote-exec/config")
      .then((j) => {
        const view = ("data" in j && j.data ? j.data : j) as SshConfigView;
        setConfigured(!!view?.configured);
        if (view?.config) {
          setHost(view.config.host ?? "");
          setPort(view.config.port || 22);
          setUser(view.config.user ?? "");
          setKeyPathMasked(view.config.keyPathMasked ?? "");
          setRemoteDir(view.config.remoteDir ?? "");
        }
        setState("ready");
      })
      .catch(() => setState("error"));
  }, []);

  const formBody = () => ({
    host: host.trim(),
    port: Number(port) || 22,
    user: user.trim(),
    ...(keyPath.trim() ? { keyPath: keyPath.trim() } : {}),
    remoteDir: remoteDir.trim(),
  });

  async function save() {
    if (busy) return;
    setBusy("save");
    setNotice(null);
    try {
      const j = await apiFetch<{ data?: SshConfigView } | SshConfigView>("/api/remote-exec/config", {
        method: "PUT",
        body: JSON.stringify(formBody()),
      });
      const view = ("data" in j && j.data ? j.data : j) as SshConfigView;
      setConfigured(!!view?.configured);
      if (view?.config) {
        setKeyPathMasked(view.config.keyPathMasked ?? "");
        setKeyPath("");
      }
      setNotice({ tone: "ok", text: COPY.saved });
    } catch (err) {
      setNotice({ tone: "err", text: err instanceof Error ? err.message : COPY.saveFailed });
    } finally {
      setBusy(null);
    }
  }

  async function test() {
    if (busy) return;
    setBusy("test");
    setNotice(null);
    setResult(null);
    try {
      const j = await apiFetch<{ data?: TestResult } | TestResult>("/api/remote-exec/test", {
        method: "POST",
        body: JSON.stringify(formBody()),
      });
      const r = ("data" in j && j.data ? j.data : j) as TestResult;
      setResult(r);
      setNotice({ tone: r.ok ? "ok" : "err", text: r.ok ? COPY.testOk : COPY.testFailed });
    } catch (err) {
      setNotice({ tone: "err", text: err instanceof Error ? err.message : COPY.testError });
    } finally {
      setBusy(null);
    }
  }

  if (state === "loading") return <p className="sf-live-tag">{COPY.loading}</p>;
  if (state === "error") {
    return (
      <p className="sf-embed-offline" role="status">
        {COPY.loadFailed}
      </p>
    );
  }

  return (
    <div className="sf-embed">
      <p className={`sf-remote-state ${configured ? "on" : ""}`}>
        {configured ? <CheckCircle2 size={13} /> : <CircleDashed size={13} />}
        <Server size={13} />
        {configured ? COPY.configured : COPY.unconfigured}
      </p>

      <div className="sf-embed-grid">
        <label className="sf-embed-field">
          {COPY.host}
          <input value={host} onChange={(e) => setHost(e.currentTarget.value)} placeholder={COPY.hostPlaceholder} />
        </label>
        <label className="sf-embed-field">
          {COPY.port}
          <input
            type="number"
            value={port}
            onChange={(e) => setPort(Number(e.currentTarget.value) || 22)}
          />
        </label>
        <label className="sf-embed-field">
          {COPY.user}
          <input value={user} onChange={(e) => setUser(e.currentTarget.value)} placeholder={COPY.userPlaceholder} />
        </label>
        <label className="sf-embed-field sf-embed-field--wide">
          {COPY.keyPath}
          <input
            value={keyPath}
            onChange={(e) => setKeyPath(e.currentTarget.value)}
            placeholder={keyPathMasked || COPY.keyPathPlaceholder}
          />
        </label>
        <label className="sf-embed-field sf-embed-field--wide">
          {COPY.remoteDir}
          <input
            value={remoteDir}
            onChange={(e) => setRemoteDir(e.currentTarget.value)}
            placeholder={COPY.remoteDirPlaceholder}
          />
        </label>
      </div>

      <div className="sf-embed-actions">
        <button className="sf-embed-primary" onClick={() => void save()} disabled={busy !== null}>
          {busy === "save" ? <Loader2 size={14} className="sf-spin" /> : <Save size={14} />}
          {COPY.save}
        </button>
        <button className="sf-embed-ghost" onClick={() => void test()} disabled={busy !== null}>
          {busy === "test" ? <Loader2 size={14} className="sf-spin" /> : <PlugZap size={14} />}
          {COPY.test}
        </button>
      </div>

      {notice && (
        <p className={`sf-embed-result ${notice.tone === "ok" ? "ok" : "failed"}`}>
          {notice.tone === "ok" ? <CheckCircle2 size={13} /> : <AlertTriangle size={13} />}
          {notice.text}
        </p>
      )}
      {result && (
        <p className="sf-remote-detail">
          {COPY.exit}={String(result.code ?? "?")} · {result.durationMs ?? "?"}
          {COPY.duration}
          {result.stderr ? ` · ${result.stderr.slice(0, 200)}` : ""}
        </p>
      )}
    </div>
  );
}
