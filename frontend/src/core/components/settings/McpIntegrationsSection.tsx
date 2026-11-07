import { useState } from 'react';

type ClientId = 'claude-code' | 'codex' | 'cursor' | 'vscode' | 'zed' | 'windsurf' | 'antigravity';

interface ClientConfig {
  id: ClientId;
  label: string;
  configPath: string;
  snippet: string;
  note?: string;
}

const SF_URL = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000';

const CLIENTS: ClientConfig[] = [
  {
    id: 'claude-code',
    label: 'Claude Code',
    configPath: '~/.claude/mcp.json',
    snippet: JSON.stringify(
      {
        mcpServers: {
          shadowflow: {
            command: 'node',
            args: ['/path/to/shadowflow/mcp-proxy.js'],
            env: { SF_URL },
          },
        },
      },
      null,
      2
    ),
    note: `或使用 CLI：\`claude mcp add shadowflow --url ${SF_URL}/mcp\``,
  },
  {
    id: 'codex',
    label: 'Codex',
    configPath: '~/.codex/config.json',
    snippet: JSON.stringify(
      {
        mcpServers: {
          shadowflow: {
            command: 'node',
            args: ['/path/to/shadowflow/mcp-proxy.js'],
          },
        },
      },
      null,
      2
    ),
  },
  {
    id: 'cursor',
    label: 'Cursor',
    configPath: '.cursor/mcp.json',
    snippet: JSON.stringify(
      {
        mcpServers: {
          shadowflow: {
            url: `${SF_URL}/mcp`,
            transport: 'sse',
          },
        },
      },
      null,
      2
    ),
  },
  {
    id: 'vscode',
    label: 'VS Code',
    configPath: '.vscode/mcp.json',
    snippet: JSON.stringify(
      {
        mcpServers: {
          shadowflow: {
            url: `${SF_URL}/mcp`,
            type: 'sse',
          },
        },
      },
      null,
      2
    ),
  },
  {
    id: 'zed',
    label: 'Zed',
    configPath: '~/.config/zed/settings.json',
    snippet: JSON.stringify(
      {
        context_servers: {
          shadowflow: {
            source: 'custom',
            command: 'node',
            args: ['/path/to/shadowflow/mcp-proxy.js'],
          },
        },
      },
      null,
      2
    ),
    note: 'Zed 使用 "context_servers" 而非 "mcpServers"。打开 Zed Settings (Cmd/Ctrl+,) 并合并到顶层对象。',
  },
  {
    id: 'windsurf',
    label: 'Windsurf',
    configPath: '~/.codeium/windsurf/mcp_config.json',
    snippet: JSON.stringify(
      {
        mcpServers: {
          shadowflow: {
            command: 'node',
            args: ['/path/to/shadowflow/mcp-proxy.js'],
          },
        },
      },
      null,
      2
    ),
    note: '或在 Cascade 侧边栏点击 MCPs 图标 → Configure 打开配置文件。',
  },
  {
    id: 'antigravity',
    label: 'Antigravity',
    configPath: 'Agent panel → MCP Servers → Manage',
    snippet: JSON.stringify(
      {
        mcpServers: {
          shadowflow: {
            command: 'node',
            args: ['/path/to/shadowflow/mcp-proxy.js'],
          },
        },
      },
      null,
      2
    ),
    note: 'Antigravity: Agent 面板 "..." 菜单 → MCP Servers → Manage MCP Servers → View raw config，合并此 JSON。',
  },
];

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="rounded-[6px] border border-sf-border bg-sf-elev3 px-2.5 py-1 font-mono text-[10px] text-sf-fg4 hover:border-sf-fg5 hover:text-sf-fg2 transition-colors"
    >
      {copied ? '已复制!' : 'Copy'}
    </button>
  );
}

export function McpIntegrationsSection() {
  const [activeTab, setActiveTab] = useState<ClientId>('claude-code');

  const active = CLIENTS.find((c) => c.id === activeTab)!;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-[18px] font-bold text-sf-fg1">MCP 集成</h2>
        <p className="mt-1 text-[12px] text-sf-fg4">
          将 ShadowFlow 作为 MCP 服务连接到外部编码 Agent。
        </p>
      </div>

      <div className="rounded-[10px] border border-sf-border bg-sf-elev2 p-4 flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-sf-fg4">
            MCP 服务地址
          </span>
          <span className="font-mono text-[11px] text-sf-fg2 bg-sf-elev3 rounded-[5px] px-2 py-0.5">
            {SF_URL}/mcp
          </span>
        </div>

        <div className="flex overflow-x-auto border-b border-sf-border scrollbar-none">
          {CLIENTS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setActiveTab(c.id)}
              className={[
                'shrink-0 px-3 py-2 text-[11px] font-medium transition-colors border-b-2 -mb-px whitespace-nowrap',
                activeTab === c.id
                  ? 'border-sf-accent text-sf-fg1'
                  : 'border-transparent text-sf-fg4 hover:text-sf-fg2',
              ].join(' ')}
            >
              {c.label}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] text-sf-fg5">{active.configPath}</span>
            <CopyButton text={active.snippet} />
          </div>
          <pre className="rounded-[8px] bg-sf-elev1 border border-sf-border p-4 overflow-x-auto font-mono text-[11px] text-sf-fg2 leading-relaxed">
            {active.snippet}
          </pre>
          {active.note && (
            <p className="text-[11px] text-sf-fg4 mt-1">{active.note}</p>
          )}
        </div>
      </div>

      <p className="text-[11px] text-sf-fg5 rounded-[8px] border border-sf-border bg-sf-elev2 px-4 py-3">
        ShadowFlow MCP 服务在本地运行时自动启动。默认端口 8000 可通过{' '}
        <span className="font-mono text-sf-fg3">VITE_API_BASE</span> 环境变量修改。
      </p>
    </div>
  );
}
