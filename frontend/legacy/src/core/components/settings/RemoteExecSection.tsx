/**
 * RemoteExecSection — 远程执行（SSH）设置分组。
 *
 * 场景：论文团的实验步骤要在真正的 GPU 机器上跑，而不是只在本机空转。
 * 这里配好主机与项目目录后：
 *   - 「测试连接」跑 echo/uname/pwd，确认密钥与目录都对
 *   - 「试跑命令」直接在远端项目目录执行一条命令（如 nvidia-smi）
 * 配置存 settings（key=remote.ssh），只存私钥路径、不存私钥内容。
 */

import { useCallback, useEffect, useState } from 'react';
import { Plug, Play, RefreshCw, Trash2 } from 'lucide-react';
import {
  clearRemoteExecConfig,
  getRemoteExecConfig,
  saveRemoteExecConfig,
  testRemoteExec,
  runRemoteCommand,
  type RemoteExecResult,
} from '../../../api/remoteExec';

const box: React.CSSProperties = {
  border: '1px solid var(--t-border, rgba(128,128,128,0.22))',
  borderRadius: 12,
  padding: 16,
  background: 'var(--t-bg-elev, rgba(128,128,128,0.04))',
};

const label: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  marginBottom: 4,
  color: 'var(--t-fg-muted, #888)',
};

const input: React.CSSProperties = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: 8,
  border: '1px solid var(--t-border, rgba(128,128,128,0.28))',
  background: 'var(--t-bg, transparent)',
  color: 'var(--t-fg, inherit)',
  fontSize: 13,
  boxSizing: 'border-box',
};

const btn: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '7px 12px',
  borderRadius: 8,
  border: '1px solid var(--t-border, rgba(128,128,128,0.28))',
  background: 'var(--t-bg, transparent)',
  color: 'var(--t-fg, inherit)',
  fontSize: 12,
  cursor: 'pointer',
};

const primaryBtn: React.CSSProperties = {
  ...btn,
  borderColor: 'transparent',
  background: 'var(--t-accent, #4c8dff)',
  color: '#fff',
  fontWeight: 600,
};

const pre: React.CSSProperties = {
  margin: 0,
  padding: 10,
  borderRadius: 8,
  background: 'var(--t-bg-code, rgba(0,0,0,0.06))',
  fontSize: 12,
  lineHeight: 1.5,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-all',
  maxHeight: 220,
  overflow: 'auto',
};

export function RemoteExecSection() {
  const [host, setHost] = useState('');
  const [port, setPort] = useState('22');
  const [user, setUser] = useState('');
  const [keyPath, setKeyPath] = useState('');
  const [remoteDir, setRemoteDir] = useState('');

  const [keyMasked, setKeyMasked] = useState<string | null>(null);
  const [configured, setConfigured] = useState(false);
  const [busy, setBusy] = useState<'load' | 'save' | 'test' | 'run' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [result, setResult] = useState<RemoteExecResult | null>(null);
  const [probeCmd, setProbeCmd] = useState('nvidia-smi -L || echo "no gpu"');

  const load = useCallback(async () => {
    setBusy('load');
    setError(null);
    try {
      const v = await getRemoteExecConfig();
      setConfigured(v.configured);
      if (v.config) {
        setHost(v.config.host);
        setPort(String(v.config.port));
        setUser(v.config.user);
        setRemoteDir(v.config.remoteDir);
        setKeyMasked(v.config.keyPathMasked);
      } else {
        setKeyMasked(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '读取配置失败');
    } finally {
      setBusy(null);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const formInput = () => ({
    host: host.trim(),
    port: Number(port) || 22,
    user: user.trim(),
    ...(keyPath.trim() ? { keyPath: keyPath.trim() } : {}),
    ...(remoteDir.trim() ? { remoteDir: remoteDir.trim() } : {}),
  });

  const onSave = async () => {
    setBusy('save');
    setError(null);
    setNotice(null);
    try {
      await saveRemoteExecConfig(formInput());
      setKeyPath('');
      setNotice('已保存。建议点「测试连接」确认能真正连上。');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setBusy(null);
    }
  };

  const onTest = async () => {
    setBusy('test');
    setError(null);
    setNotice(null);
    setResult(null);
    try {
      const r = await testRemoteExec(formInput());
      setResult(r);
      setNotice(r.ok ? '连接成功，远端就绪。' : '已连上但自检未通过，看下方输出。');
    } catch (e) {
      setError(e instanceof Error ? e.message : '测试失败');
    } finally {
      setBusy(null);
    }
  };

  const onRun = async () => {
    setBusy('run');
    setError(null);
    setNotice(null);
    setResult(null);
    try {
      const r = await runRemoteCommand(probeCmd, 60_000);
      setResult(r);
      setNotice(r.ok ? '命令执行成功。' : `命令退出码 ${r.code}，看下方 stderr。`);
    } catch (e) {
      setError(e instanceof Error ? e.message : '执行失败');
    } finally {
      setBusy(null);
    }
  };

  const onClear = async () => {
    setBusy('save');
    setError(null);
    try {
      await clearRemoteExecConfig();
      setHost('');
      setPort('22');
      setUser('');
      setKeyPath('');
      setRemoteDir('');
      setKeyMasked(null);
      setConfigured(false);
      setResult(null);
      setNotice('已清除远程主机配置。');
    } catch (e) {
      setError(e instanceof Error ? e.message : '清除失败');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="sf-settings-bg" style={{ padding: 4 }}>
      <div style={{ maxWidth: 760 }}>
        <h2 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 700 }}>远程执行（SSH）</h2>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--t-fg-muted, #888)', lineHeight: 1.6 }}>
          配置一台跑实验的机器。配好后论文团的实验步骤会在这台机器上真正执行，
          产出文件写回远端项目目录。只支持公钥登录（首次连接会自动记录主机指纹）。
        </p>

        <div style={box}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 90px 1.4fr', gap: 12 }}>
            <div>
              <label style={label} htmlFor="sf-remote-host">主机</label>
              <input
                id="sf-remote-host"
                style={input}
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="10.0.0.12 或 gpu.example.com"
                data-testid="remote-exec-host"
              />
            </div>
            <div>
              <label style={label} htmlFor="sf-remote-port">端口</label>
              <input
                id="sf-remote-port"
                style={input}
                value={port}
                onChange={(e) => setPort(e.target.value)}
                placeholder="22"
                inputMode="numeric"
                data-testid="remote-exec-port"
              />
            </div>
            <div>
              <label style={label} htmlFor="sf-remote-user">用户名</label>
              <input
                id="sf-remote-user"
                style={input}
                value={user}
                onChange={(e) => setUser(e.target.value)}
                placeholder="ubuntu"
                data-testid="remote-exec-user"
              />
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <label style={label} htmlFor="sf-remote-key">
              私钥路径{keyMasked ? `（当前：${keyMasked}，留空则保持不变）` : '（留空用 ssh-agent）'}
            </label>
            <input
              id="sf-remote-key"
              style={input}
              value={keyPath}
              onChange={(e) => setKeyPath(e.target.value)}
              placeholder="~/.ssh/id_ed25519"
              data-testid="remote-exec-keypath"
            />
          </div>

          <div style={{ marginTop: 12 }}>
            <label style={label} htmlFor="sf-remote-dir">远端项目目录</label>
            <input
              id="sf-remote-dir"
              style={input}
              value={remoteDir}
              onChange={(e) => setRemoteDir(e.target.value)}
              placeholder="/home/ubuntu/my-paper"
              data-testid="remote-exec-remotedir"
            />
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
            <button
              type="button"
              style={primaryBtn}
              onClick={() => { void onSave(); }}
              disabled={busy !== null}
              data-testid="remote-exec-save"
            >
              {busy === 'save' ? '保存中…' : '保存配置'}
            </button>
            <button
              type="button"
              style={btn}
              onClick={() => { void onTest(); }}
              disabled={busy !== null}
              data-testid="remote-exec-test"
            >
              <Plug size={13} /> {busy === 'test' ? '测试中…' : '测试连接'}
            </button>
            <button
              type="button"
              style={btn}
              onClick={() => { void load(); }}
              disabled={busy !== null}
              data-testid="remote-exec-reload"
            >
              <RefreshCw size={13} /> 重新读取
            </button>
            {configured && (
              <button
                type="button"
                style={btn}
                onClick={() => { void onClear(); }}
                disabled={busy !== null}
                data-testid="remote-exec-clear"
              >
                <Trash2 size={13} /> 清除
              </button>
            )}
          </div>

          {error && (
            <div
              role="alert"
              data-testid="remote-exec-error"
              style={{
                marginTop: 12,
                padding: '8px 10px',
                borderRadius: 8,
                fontSize: 12,
                background: 'color-mix(in srgb, var(--t-err, #e5484d) 10%, transparent)',
                color: 'var(--t-err, #e5484d)',
              }}
            >
              {error}
            </div>
          )}
          {notice && !error && (
            <div
              data-testid="remote-exec-notice"
              style={{ marginTop: 12, fontSize: 12, color: 'var(--t-fg-muted, #888)' }}
            >
              {notice}
            </div>
          )}
        </div>

        <div style={{ ...box, marginTop: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>试跑一条命令</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              style={{ ...input, fontFamily: 'ui-monospace, monospace' }}
              value={probeCmd}
              onChange={(e) => setProbeCmd(e.target.value)}
              placeholder="nvidia-smi -L"
              data-testid="remote-exec-probe-cmd"
            />
            <button
              type="button"
              style={{ ...btn, whiteSpace: 'nowrap' }}
              onClick={() => { void onRun(); }}
              disabled={busy !== null || !configured}
              title={configured ? '' : '先保存配置'}
              data-testid="remote-exec-run"
            >
              <Play size={13} /> {busy === 'run' ? '执行中…' : '执行'}
            </button>
          </div>

          {result && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, color: 'var(--t-fg-muted, #888)', marginBottom: 6 }}>
                退出码 {result.code} · {result.durationMs}ms
              </div>
              {result.stdout && <pre style={pre} data-testid="remote-exec-stdout">{result.stdout}</pre>}
              {result.stderr && (
                <pre style={{ ...pre, marginTop: 8, color: 'var(--t-err, #e5484d)' }} data-testid="remote-exec-stderr">
                  {result.stderr}
                </pre>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default RemoteExecSection;
