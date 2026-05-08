/**
 * Composer — 消息输入框
 *
 * toolbar（参考 open-design ChatComposer）：
 *   [settings] [attach/spinner] | [Import▾]  @  /  smile  scissor  task
 *   ────────────────────────────── textarea ──────────────────────────────
 *   hint text                                  [char count]  [Stop | Send]
 *
 * 新增功能：
 *  - 文件附件：clip 按钮打开 <input file>，显示 staged chips，模拟上传
 *  - Import 下拉：导入 Skill / Workflow / GitHub / Web（notImpl）
 *  - @mention 真实弹窗：输入 @ 触发 agent 列表过滤
 *  - Stop 按钮：streaming=true 时替换 Send
 *  - Settings 按钮：折叠进 provider 小弹窗
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import {
  Sliders, Loader2, ChevronDown, Send, Square,
  X, Download, Workflow, Globe, GitBranch,
} from 'lucide-react';
import { CI } from './icons';
import { SLASH_COMMANDS } from './mockData';
import type { ContentPart } from '../../../api/chat';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StagedFile {
  id: string;
  name: string;
  size: number;
  file: File;       // original File object for reading on send
  dataUrl?: string; // preview for images (pre-read for thumbnails)
}

interface AgentMention {
  glyph: string;
  name: string;
  color: string;
}

// Default agents for @-mention (derived from mock conv data)
const DEFAULT_AGENTS: AgentMention[] = [
  { glyph: '读', name: '读读',  color: '#A855F7' },
  { glyph: '批', name: '阿批',  color: '#F59E0B' },
  { glyph: '查', name: '查查',  color: '#22D3EE' },
  { glyph: '写', name: '小写',  color: '#EF4444' },
  { glyph: '审', name: '审审',  color: '#22c55e' },
  { glyph: 'D',  name: 'Devon', color: '#22D3EE' },
];

const LLM_PROVIDERS = ['zhipu', 'openai', 'claude', 'deepseek', 'ollama'] as const;
type LLMProvider = typeof LLM_PROVIDERS[number];
const PROVIDER_LABELS: Record<LLMProvider, string> = {
  zhipu: '智谱', openai: 'OpenAI', claude: 'Claude', deepseek: 'DeepSeek', ollama: 'Ollama',
};

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function prettySize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function looksLikeImage(name: string) {
  return /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(name);
}

const FILE_TEXT_RE = /\.(txt|md|markdown|py|ts|tsx|js|jsx|json|yaml|yml|toml|csv|sh|bash|html|css|xml|sql|rs|go|java|c|cpp|h|hpp|rb|php|r|swift|kt|lua|pl|scala|dart|cfg|ini|log)$/i;

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target?.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target?.result as string);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ToolBtn({
  icon, title, active = false, disabled = false, onClick,
}: {
  icon: React.ReactNode;
  title: string;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      style={{
        width: 26, height: 24, borderRadius: 5,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: active ? 'var(--t-accent-tint)' : 'transparent',
        color: active ? 'var(--t-accent)' : 'var(--t-fg-4)',
        border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        transition: 'background 120ms ease, color 120ms ease',
        flexShrink: 0,
      }}
    >
      <span style={{ width: 14, height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {icon}
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

interface ComposerProps {
  onSend: (content: string | ContentPart[]) => void;
  streaming?: boolean;
  onStop?: () => void;
  agents?: AgentMention[];
  provider?: LLMProvider;
  onProviderChange?: (p: LLMProvider) => void;
}

export function Composer({ onSend, streaming = false, onStop, agents = DEFAULT_AGENTS, provider: providerProp, onProviderChange }: ComposerProps) {
  const [text, setText] = useState('');
  const [slashIdx, setSlashIdx] = useState(0);
  const [skillLink, setSkillLink] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // File attachment
  const [staged, setStaged] = useState<StagedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Import dropdown
  const [importOpen, setImportOpen] = useState(false);
  const importRef = useRef<HTMLDivElement>(null);

  // Settings / provider popover
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);
  const [providerLocal, setProviderLocal] = useState<LLMProvider>('zhipu');
  const provider = providerProp ?? providerLocal;
  const setProvider = (p: LLMProvider) => { setProviderLocal(p); onProviderChange?.(p); };

  // @mention
  const [mention, setMention] = useState<{ q: string; cursor: number } | null>(null);
  const [mentionIdx, setMentionIdx] = useState(0);

  // Close popovers on outside click
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (importOpen && importRef.current && !importRef.current.contains(t)) setImportOpen(false);
      if (settingsOpen && settingsRef.current && !settingsRef.current.contains(t)) setSettingsOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [importOpen, settingsOpen]);

  // @mention: filter agents
  const filteredAgents = mention !== null
    ? agents.filter(a => a.name.toLowerCase().includes(mention.q.toLowerCase())).slice(0, 8)
    : [];

  const showSlash = text.startsWith('/') && text.length > 0;
  const filteredCmds = showSlash
    ? SLASH_COMMANDS.filter(c => c.cmd.startsWith(text.split(' ')[0]))
    : SLASH_COMMANDS;

  // ── paste handler ──────────────────────────────────────────────────────
  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    // Check for files (image paste)
    if (e.clipboardData.files.length > 0) {
      e.preventDefault();
      handleFiles(Array.from(e.clipboardData.files));
      return;
    }
    const pasted = e.clipboardData.getData('text');
    try {
      const url = new URL(pasted.trim());
      if (url.searchParams.has('import')) {
        e.preventDefault();
        setSkillLink(pasted.trim());
        return;
      }
    } catch {
      // not a URL
    }
  }, []);

  // ── file attach ────────────────────────────────────────────────────────
  function handleFiles(files: File[]) {
    setUploading(true);
    const newStaged: StagedFile[] = [];
    let pending = files.length;

    files.forEach((file) => {
      const id = `f-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      if (looksLikeImage(file.name)) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          newStaged.push({ id, name: file.name, size: file.size, file, dataUrl: ev.target?.result as string });
          if (--pending === 0) { setStaged(s => [...s, ...newStaged]); setUploading(false); }
        };
        reader.readAsDataURL(file);
      } else {
        newStaged.push({ id, name: file.name, size: file.size, file });
        if (--pending === 0) { setStaged(s => [...s, ...newStaged]); setUploading(false); }
      }
    });
  }

  function removeStaged(id: string) {
    setStaged(s => s.filter(f => f.id !== id));
  }

  // ── @mention ───────────────────────────────────────────────────────────
  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setText(val);
    setSlashIdx(0);

    const cursor = e.target.selectionStart ?? val.length;
    const before = val.slice(0, cursor);
    const m = /(^|\s)@([^\s@]*)$/.exec(before);
    if (m) {
      setMention({ q: m[2] ?? '', cursor });
      setMentionIdx(0);
    } else {
      setMention(null);
    }
  }

  function insertMention(agentName: string) {
    if (!mention) return;
    const before = text.slice(0, mention.cursor);
    const after = text.slice(mention.cursor);
    const replaced = before.replace(/@([^\s@]*)$/, `@${agentName} `);
    setText(replaced + after);
    setMention(null);
    setTimeout(() => textareaRef.current?.focus(), 0);
  }

  // ── keyboard ───────────────────────────────────────────────────────────
  const handleKeyDown = (e: React.KeyboardEvent) => {
    // @mention navigation
    if (mention !== null && filteredAgents.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIdx(i => (i + 1) % filteredAgents.length); return; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setMentionIdx(i => (i - 1 + filteredAgents.length) % filteredAgents.length); return; }
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); insertMention(filteredAgents[mentionIdx].name); return; }
      if (e.key === 'Escape') { setMention(null); return; }
    }
    // slash popover navigation
    if (showSlash) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setSlashIdx(i => (i + 1) % filteredCmds.length); return; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setSlashIdx(i => (i - 1 + filteredCmds.length) % filteredCmds.length); return; }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (filteredCmds[slashIdx]) setText(filteredCmds[slashIdx].cmd + ' ');
        return;
      }
      if (e.key === 'Escape') { setText(''); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void doSend();
    }
  };

  async function doSend() {
    if (!text.trim() && staged.length === 0) return;

    if (staged.length === 0) {
      onSend(text.trim());
    } else {
      const parts: ContentPart[] = [];
      if (text.trim()) parts.push({ type: 'text', text: text.trim() });

      for (const sf of staged) {
        if (looksLikeImage(sf.name)) {
          if (sf.size > MAX_IMAGE_BYTES) {
            parts.push({ type: 'text', text: `[图片过大，已跳过: ${sf.name} (${prettySize(sf.size)}，限 5 MB)]` });
            continue;
          }
          try {
            const url = sf.dataUrl ?? await readFileAsDataUrl(sf.file);
            parts.push({ type: 'image_url', image_url: { url } });
          } catch {
            parts.push({ type: 'text', text: `[图片读取失败: ${sf.name}]` });
          }
        } else if (FILE_TEXT_RE.test(sf.name)) {
          try {
            const content = await readFileAsText(sf.file);
            parts.push({ type: 'text', text: `\`\`\`${sf.name}\n${content}\n\`\`\`` });
          } catch {
            parts.push({ type: 'text', text: `[文件读取失败: ${sf.name}]` });
          }
        } else {
          parts.push({ type: 'text', text: `[附件: ${sf.name} (${prettySize(sf.size)})]` });
        }
      }

      const result: string | ContentPart[] =
        parts.length === 1 && parts[0].type === 'text'
          ? parts[0].text
          : parts;
      onSend(result);
    }

    setText('');
    setStaged([]);
    setMention(null);
  }

  function applySlash(cmd: string) {
    setText(cmd + ' ');
    textareaRef.current?.focus();
  }

  function notImpl(label: string) {
    // Simple toast via DOM (avoid state lifting)
    const el = document.createElement('div');
    el.textContent = `${label} · 功能开发中`;
    Object.assign(el.style, {
      position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
      padding: '8px 14px', borderRadius: '8px', background: 'var(--t-panel)',
      border: '1px solid var(--t-border)', color: 'var(--t-fg-2)', fontSize: '12px',
      boxShadow: '0 8px 24px -8px rgba(0,0,0,.45)', zIndex: '9999',
    });
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1800);
  }

  const importItems = [
    { icon: <Download size={13} strokeWidth={2} />, label: '导入 Skill', accent: true,  onClick: () => { setImportOpen(false); notImpl('导入 Skill'); } },
    { icon: <Workflow size={13} strokeWidth={2} />, label: '导入 Workflow', accent: true, onClick: () => { setImportOpen(false); notImpl('导入 Workflow'); } },
    { icon: <GitBranch size={13} strokeWidth={2} />, label: 'GitHub',      accent: false, onClick: () => { setImportOpen(false); notImpl('GitHub'); } },
    { icon: <Globe size={13} strokeWidth={2} />,    label: 'Web URL',     accent: false, onClick: () => { setImportOpen(false); notImpl('Web URL'); } },
  ];

  return (
    <div style={{ padding: '10px 18px 12px', borderTop: '1px solid var(--t-border)', background: 'var(--t-panel)', position: 'relative', flexShrink: 0 }}>

      {/* Skill link banner */}
      {skillLink && (
        <div style={{
          marginBottom: 8, padding: '7px 10px', borderRadius: 7,
          background: 'var(--t-accent-tint)', border: '1px solid color-mix(in oklab, var(--t-accent) 40%, transparent)',
          display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-mono)', fontSize: 11,
        }}>
          <span style={{ color: 'var(--t-accent-bright)', fontWeight: 700 }}>↓ 检测到 skill 链接</span>
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--t-fg-3)' }}>{skillLink}</span>
          <button className="fb-btn fb-btn-primary fb-btn-sm" style={{ fontSize: 11, padding: '2px 8px' }}
            onClick={() => { onSend(`/import ${skillLink}`); setSkillLink(null); }}>导入</button>
          <button className="fb-btn fb-btn-ghost fb-btn-sm" style={{ fontSize: 11, padding: '2px 6px' }}
            onClick={() => setSkillLink(null)}>×</button>
        </div>
      )}

      {/* @mention popover */}
      {mention !== null && filteredAgents.length > 0 && (
        <div style={{
          position: 'absolute', bottom: 130, left: 18, width: 200, zIndex: 20,
          background: 'var(--t-panel)', border: '1px solid var(--t-border)',
          borderRadius: 8, boxShadow: '0 8px 24px -8px rgba(0,0,0,.35)', padding: 4,
        }}>
          <div style={{ padding: '3px 8px 5px', fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--t-fg-4)', letterSpacing: '0.06em' }}>@ 提及 AGENT</div>
          {filteredAgents.map((a, i) => (
            <button key={a.name} type="button"
              onClick={() => insertMention(a.name)}
              style={{
                display: 'flex', width: '100%', alignItems: 'center', gap: 8,
                padding: '6px 8px', borderRadius: 5, border: 'none',
                background: i === mentionIdx ? 'var(--t-accent-tint)' : 'transparent',
                color: i === mentionIdx ? 'var(--t-accent)' : 'var(--t-fg-2)',
                fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', textAlign: 'left',
              }}
            >
              <span style={{
                width: 20, height: 20, borderRadius: '50%', background: a.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fff', fontSize: 10, fontWeight: 800, flexShrink: 0,
              }}>{a.glyph}</span>
              <span style={{ flex: 1 }}>{a.name}</span>
            </button>
          ))}
        </div>
      )}

      {/* Slash command popover */}
      {showSlash && filteredCmds.length > 0 && (
        <div data-testid="slash-popup" style={{
          position: 'absolute', bottom: 130, left: 18, width: 340, zIndex: 10,
          background: 'var(--t-panel)', border: '1px solid var(--t-border)', borderRadius: 9,
          boxShadow: '0 8px 24px -8px rgba(0,0,0,.35)', padding: 5,
        }}>
          <div style={{ padding: '6px 8px', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--t-fg-4)', letterSpacing: '0.06em' }}>SLASH COMMANDS</span>
            <span style={{ flex: 1 }} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--t-fg-5)' }}>↑↓ 选 · ↵ 用</span>
          </div>
          {filteredCmds.map((it, i) => (
            <div key={it.cmd} onClick={() => applySlash(it.cmd)} data-testid={`slash-${it.cmd.slice(1)}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 9, padding: '6px 8px', borderRadius: 5,
                background: i === slashIdx ? 'var(--t-accent-tint)' : 'transparent', cursor: 'pointer',
              }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: i === slashIdx ? 'var(--t-accent-bright)' : 'var(--t-fg-2)', minWidth: 72 }}>{it.cmd}</span>
              <span style={{ fontSize: 11.5, color: 'var(--t-fg-3)', flex: 1 }}>{it.d}</span>
            </div>
          ))}
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => { if (e.target.files?.length) { handleFiles(Array.from(e.target.files)); e.target.value = ''; } }}
      />

      <div style={{ background: 'var(--t-panel-2)', border: '1px solid var(--t-border)', borderRadius: 10, overflow: 'hidden' }}>

        {/* ── Top toolbar ────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '5px 8px', borderBottom: '1px solid var(--t-border)' }}>

          {/* Settings / provider button */}
          <div ref={settingsRef} style={{ position: 'relative', flexShrink: 0 }}>
            <ToolBtn
              icon={<Sliders size={13} strokeWidth={2} />}
              title="模型设置"
              active={settingsOpen}
              onClick={() => setSettingsOpen(o => !o)}
            />
            {settingsOpen && (
              <div style={{
                position: 'absolute', bottom: 'calc(100% + 6px)', left: 0, zIndex: 30,
                background: 'var(--t-panel)', border: '1px solid var(--t-border)',
                borderRadius: 8, padding: 8, boxShadow: '0 8px 24px -8px rgba(0,0,0,.35)',
                minWidth: 160,
              }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--t-fg-4)', letterSpacing: '0.06em', marginBottom: 6 }}>LLM PROVIDER</div>
                {LLM_PROVIDERS.map(p => (
                  <button key={p} type="button"
                    onClick={() => { setProvider(p); setSettingsOpen(false); }}
                    style={{
                      display: 'flex', width: '100%', alignItems: 'center', gap: 8,
                      padding: '5px 8px', borderRadius: 4, border: 'none',
                      background: p === provider ? 'var(--t-accent-tint)' : 'transparent',
                      color: p === provider ? 'var(--t-accent)' : 'var(--t-fg-2)',
                      fontWeight: p === provider ? 700 : 500,
                      fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    <span style={{ flex: 1 }}>{PROVIDER_LABELS[p]}</span>
                    {p === provider && <span aria-hidden style={{ fontSize: 10 }}>✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Attach */}
          <ToolBtn
            icon={uploading
              ? <Loader2 size={13} strokeWidth={2} style={{ animation: 'spin 1s linear infinite' }} />
              : CI.clip}
            title="上传文件"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          />

          {/* Divider */}
          <span style={{ width: 1, height: 14, background: 'var(--t-border)', margin: '0 2px', flexShrink: 0 }} aria-hidden />

          {/* Import dropdown */}
          <div ref={importRef} style={{ position: 'relative', flexShrink: 0 }}>
            <button
              type="button"
              title="导入"
              onClick={() => setImportOpen(o => !o)}
              aria-haspopup="menu"
              aria-expanded={importOpen}
              style={{
                height: 24, padding: '0 6px', borderRadius: 5,
                display: 'inline-flex', alignItems: 'center', gap: 3,
                background: importOpen ? 'var(--t-accent-tint)' : 'transparent',
                color: importOpen ? 'var(--t-accent)' : 'var(--t-fg-4)',
                border: 'none', cursor: 'pointer', fontSize: 11,
                transition: 'background 120ms ease, color 120ms ease',
              }}
            >
              <Download size={13} strokeWidth={2} />
              <span style={{ fontSize: 10.5 }}>导入</span>
              <ChevronDown size={10} strokeWidth={2.5} />
            </button>
            {importOpen && (
              <div style={{
                position: 'absolute', bottom: 'calc(100% + 6px)', left: 0, zIndex: 30,
                background: 'var(--t-panel)', border: '1px solid var(--t-border)',
                borderRadius: 8, padding: 4, boxShadow: '0 8px 24px -8px rgba(0,0,0,.35)',
                minWidth: 180,
              }}>
                {importItems.map((item, idx) => (
                  <div key={item.label}>
                    {idx === 2 && <div style={{ height: 1, background: 'var(--t-border)', margin: '4px 6px' }} />}
                    <button
                      type="button"
                      onClick={item.onClick}
                      style={{
                        display: 'flex', width: '100%', alignItems: 'center', gap: 8,
                        padding: '7px 10px', background: 'transparent', border: 'none',
                        borderRadius: 5, fontSize: 12, fontFamily: 'inherit', cursor: 'pointer',
                        color: item.accent ? 'var(--t-accent)' : 'var(--t-fg-2)',
                        textAlign: 'left',
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = item.accent ? 'var(--t-accent-tint)' : 'var(--t-panel-2)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = 'transparent'; }}
                    >
                      <span style={{ display: 'inline-flex', width: 16, height: 16, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{item.icon}</span>
                      <span style={{ flex: 1 }}>{item.label}</span>
                      {!item.accent && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--t-fg-5)' }}>即将</span>}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Divider */}
          <span style={{ width: 1, height: 14, background: 'var(--t-border)', margin: '0 2px', flexShrink: 0 }} aria-hidden />

          {/* @ / / smile scissor task */}
          {([
            { icon: CI.at,   title: '@', onClick: () => { setText(t => t + '@'); textareaRef.current?.focus(); } },
            { icon: CI.slash,   title: '/',    onClick: () => { setText('/'); textareaRef.current?.focus(); } },
            { icon: CI.smile,   title: '表情', onClick: undefined },
            { icon: CI.scissor, title: '截图', onClick: undefined },
            { icon: CI.task,    title: '任务', onClick: undefined },
          ] as Array<{ icon: React.ReactNode; title: string; onClick?: () => void }>).map((btn, i) => (
            <ToolBtn key={i} icon={btn.icon} title={btn.title} onClick={btn.onClick} />
          ))}

          <span style={{ flex: 1 }} />
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--t-fg-5)', padding: '0 6px' }}>
            {PROVIDER_LABELS[provider]}
          </span>
        </div>

        {/* ── Staged attachments ──────────────────────────────────────── */}
        {staged.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '8px 10px 0', borderBottom: '1px solid var(--t-border)' }}>
            {staged.map(f => (
              <span key={f.id} style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '3px 6px 3px 4px', borderRadius: 6,
                background: 'var(--t-panel)', border: '1px solid var(--t-border)',
                fontSize: 11, color: 'var(--t-fg-2)', maxWidth: 220,
              }}>
                {f.dataUrl ? (
                  <img src={f.dataUrl} alt="" style={{ width: 20, height: 20, borderRadius: 3, objectFit: 'cover', flexShrink: 0 }} />
                ) : (
                  <span style={{ display: 'inline-flex', color: 'var(--t-fg-4)', width: 11, height: 11 }}>{CI.clip}</span>
                )}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{f.name}</span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--t-fg-5)', flexShrink: 0 }}>{prettySize(f.size)}</span>
                <button
                  type="button"
                  onClick={() => removeStaged(f.id)}
                  aria-label="移除"
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--t-fg-4)', display: 'flex', flexShrink: 0 }}
                >
                  <X size={11} strokeWidth={2.5} />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* ── Textarea ────────────────────────────────────────────────── */}
        <div style={{ padding: '8px 12px' }}>
          <textarea
            ref={textareaRef}
            data-testid="composer-textarea"
            className="fb-composer-area"
            value={text}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder="发消息 · / 命令 · @ 提及 agent"
            rows={2}
          />
        </div>

        {/* ── Bottom bar ──────────────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px 7px', borderTop: '1px solid var(--t-border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--t-fg-5)' }}>⏎ 发送 · ⇧⏎ 换行 · / 命令</span>
            {text.trim() && (
              <>
                <span className="fb-dot fb-dot-ok" />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9.5, color: 'var(--t-fg-4)' }}>{text.length} 字</span>
              </>
            )}
          </div>

          {streaming ? (
            <button
              data-testid="composer-stop"
              type="button"
              onClick={onStop}
              className="fb-btn fb-btn-sm"
              style={{ display: 'flex', gap: 5, alignItems: 'center', background: 'rgba(239,68,68,.15)', color: 'var(--status-reject, #ef4444)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', fontSize: 12 }}
            >
              <Square size={11} strokeWidth={2.5} fill="currentColor" />
              停止
            </button>
          ) : (
            <button
              data-testid="composer-send"
              type="button"
              disabled={!text.trim() && staged.length === 0}
              onClick={() => void doSend()}
              className="fb-btn fb-btn-primary fb-btn-sm"
              style={{ display: 'flex', gap: 5, alignItems: 'center', opacity: (text.trim() || staged.length > 0) ? 1 : 0.4 }}
            >
              <Send size={11} strokeWidth={2.5} />
              发送
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
