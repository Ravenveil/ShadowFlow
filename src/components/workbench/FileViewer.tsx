/**
 * FileViewer — Studio 右栏：打开并查看单个项目文件。
 *
 * OWNER: right-files。参考 hermes-desktop screens/Chat/FileViewer.tsx：
 *   - readFile(path, root) 后端读取（1MB 截断守卫）。
 *   - image/binary 检测：图片走 <img>（/api/fs/raw 直链），二进制只显示提示不渲染乱码。
 *   - highlight.js 按扩展名语法高亮（extToLang() in studioTokens.ts），代码块 sf-scroll。
 *   - Open-in-editor：调后端 /api/fs/open-native 用系统默认程序/编辑器打开。
 *   - Esc / 点 X 关闭。
 *
 * 复用：src/api/fsFiles.ts → readFile（后端 /api/fs/read 带 root 白名单守卫）。
 *       src/components/studio/studioTokens.ts → extToLang（ext → hljs lang）。
 *       highlight.js（语法高亮，按需 highlight(code, { language })）。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, FileWarning, ImageOff, X } from 'lucide-react';
import hljs from 'highlight.js/lib/common';
import { readFile, openInEditor } from '../../api/fsFiles';
import { getApiBase } from '../../api/_base';
import { extToLang } from './studioTokens';
import './fileViewerHljs.css';

export interface FileViewerProps {
  /** 要打开的文件绝对路径。null = 不显示。 */
  filePath: string | null;
  /** 工作目录根（后端 read 白名单守卫必填）。 */
  root: string;
  /** 关闭（Esc 或点 X）。 */
  onClose: () => void;
}

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'svg', 'avif']);
const BINARY_EXT = new Set([
  'pdf', 'zip', 'gz', 'tar', 'rar', '7z', 'exe', 'dll', 'so', 'dylib', 'bin', 'wasm',
  'mp3', 'wav', 'flac', 'ogg', 'mp4', 'mov', 'avi', 'mkv', 'webm',
  'woff', 'woff2', 'ttf', 'otf', 'eot', 'class', 'pyc', 'o', 'a', 'lib',
  'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
]);

function extOf(p: string): string {
  const m = p.split(/[\\/]/).pop() ?? '';
  const i = m.lastIndexOf('.');
  return i >= 0 ? m.slice(i + 1).toLowerCase() : '';
}

/** 启发式：内容里出现 NUL 字节或大量不可打印字符 → 当作二进制。 */
function looksBinary(s: string): boolean {
  const sample = s.slice(0, 2000);
  if (!sample) return false;
  let ctrl = 0;
  for (let i = 0; i < sample.length; i++) {
    const c = sample.charCodeAt(i);
    if (c === 0) return true; // NUL byte → certainly binary
    // 允许 \t(9) \n(10) \r(13)，统计其余 C0 控制字符
    if (c < 9 || (c > 13 && c < 32)) ctrl++;
  }
  return ctrl / sample.length > 0.06;
}

function fmtSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileViewer({ filePath, root, onClose }: FileViewerProps) {
  const [content, setContent] = useState('');
  const [truncated, setTruncated] = useState(false);
  const [size, setSize] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [opening, setOpening] = useState(false);
  const [openMsg, setOpenMsg] = useState<string | null>(null);

  const ext = filePath ? extOf(filePath) : '';
  const isImage = IMAGE_EXT.has(ext);
  const isKnownBinary = BINARY_EXT.has(ext);

  useEffect(() => {
    if (!filePath || isImage || isKnownBinary) {
      setContent('');
      setTruncated(false);
      setSize(null);
      setErr(null);
      return;
    }
    let alive = true;
    setLoading(true);
    setErr(null);
    readFile(filePath, root)
      .then((r) => {
        if (!alive) return;
        setContent(r.content);
        setTruncated(r.truncated);
        setSize(typeof r.size === 'number' ? r.size : null);
      })
      .catch((e) => {
        if (alive) setErr(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [filePath, root, isImage, isKnownBinary]);

  useEffect(() => {
    if (!filePath) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [filePath, onClose]);

  // 检测内容是否其实是二进制（扩展名不在白名单但内容像二进制）。
  const binaryByContent = !isImage && !isKnownBinary && !!content && looksBinary(content);

  // highlight.js 高亮（仅当确实是文本时）。useMemo 避免每次 render 重算。
  const highlighted = useMemo(() => {
    if (!content || binaryByContent) return null;
    const lang = extToLang(ext);
    try {
      if (lang && lang !== 'plaintext' && hljs.getLanguage(lang)) {
        return hljs.highlight(content, { language: lang, ignoreIllegals: true }).value;
      }
      // 未知扩展名 → 自动探测，命中常见语言才高亮，否则纯文本。
      const auto = hljs.highlightAuto(content);
      if (auto.relevance >= 5 && auto.value) return auto.value;
    } catch {
      /* 高亮失败 → 退回纯文本 */
    }
    return null;
  }, [content, ext, binaryByContent]);

  const handleOpenEditor = async () => {
    if (!filePath || opening) return;
    setOpening(true);
    setOpenMsg(null);
    try {
      const ok = await openInEditor(filePath);
      setOpenMsg(ok ? '已用系统默认程序打开' : '本机无法打开（不支持）');
    } catch {
      setOpenMsg('打开失败');
    } finally {
      setOpening(false);
      window.setTimeout(() => setOpenMsg(null), 2400);
    }
  };

  if (!filePath) return null;

  const name = filePath.split(/[\\/]/).pop() ?? filePath;
  const rawUrl = `${getApiBase()}/api/fs/raw?path=${encodeURIComponent(filePath)}&root=${encodeURIComponent(root)}`;

  // 相对 root 的路径（去掉 root 前缀），头部副标题展示更干净。
  let relPath = filePath;
  if (root && filePath.startsWith(root)) {
    relPath = filePath.slice(root.length).replace(/^[\\/]/, '') || name;
  }
  const sizeLabel = size != null ? fmtSize(size) : '';

  return (
    <div
      className="sf-anim-fade"
      style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'var(--t-panel)' }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '7px 10px',
          borderBottom: '1px solid var(--t-border)',
          flexShrink: 0,
        }}
      >
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
            <span
              style={{
                minWidth: 0,
                fontSize: 12.5,
                fontWeight: 600,
                color: 'var(--t-fg)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
              title={filePath}
            >
              {name}
            </span>
            {ext && (
              <span
                style={{
                  flexShrink: 0,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 9,
                  color: 'var(--t-accent)',
                  padding: '1px 5px',
                  borderRadius: 4,
                  background: 'color-mix(in oklab, var(--t-accent) 12%, transparent)',
                  border: '1px solid color-mix(in oklab, var(--t-accent) 25%, var(--t-border))',
                  textTransform: 'uppercase',
                  letterSpacing: 0.3,
                }}
              >
                {ext}
              </span>
            )}
          </div>
          {/* 副标题：相对路径 · 大小 */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 10.5,
              fontFamily: 'var(--font-mono)',
              color: 'var(--t-fg-5)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={relPath}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', direction: 'rtl', textAlign: 'left' }}>
              {relPath}
            </span>
            {sizeLabel && <span style={{ flexShrink: 0, opacity: 0.85 }}>· {sizeLabel}</span>}
          </div>
        </div>
        <button
          type="button"
          className="sf-press"
          aria-label="用系统程序打开"
          title="在编辑器/系统默认程序中打开"
          onClick={() => void handleOpenEditor()}
          disabled={opening}
          style={iconBtn}
        >
          <ExternalLink size={13} strokeWidth={2} />
        </button>
        <button type="button" className="sf-press" aria-label="关闭文件" onClick={onClose} style={iconBtn}>
          <X size={13} strokeWidth={2} />
        </button>
      </div>

      {openMsg && (
        <div style={notice('var(--t-accent)')}>{openMsg}</div>
      )}
      {truncated && (
        <div style={notice('var(--status-warn, #F59E0B)')}>文件超过 1MB，仅显示前 1MB</div>
      )}

      <div className="sf-scroll" style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {isImage ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100%', padding: 16 }}>
            <img
              src={rawUrl}
              alt={name}
              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 6 }}
              onError={(e) => {
                (e.currentTarget.style.display = 'none');
                const sib = e.currentTarget.nextElementSibling as HTMLElement | null;
                if (sib) sib.style.display = 'flex';
              }}
            />
            <div className="sf-empty" style={{ display: 'none' }}>
              <span className="sf-empty-icon"><ImageOff size={22} /></span>
              <div className="sf-empty-title">无法加载图片</div>
            </div>
          </div>
        ) : isKnownBinary || binaryByContent ? (
          <div className="sf-empty" style={{ marginTop: 40 }}>
            <span className="sf-empty-icon"><FileWarning size={22} /></span>
            <div className="sf-empty-title">二进制文件</div>
            <p className="sf-empty-sub">无法以文本预览（{ext || '未知类型'}）</p>
            <button
              type="button"
              className="sf-press"
              onClick={() => void handleOpenEditor()}
              style={{
                marginTop: 10,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderRadius: 8,
                fontSize: 12,
                cursor: 'pointer',
                border: '1px solid var(--t-border)',
                background: 'var(--t-panel-2)',
                color: 'var(--t-fg-2)',
              }}
            >
              <ExternalLink size={13} strokeWidth={2} style={{ color: 'var(--t-accent)' }} />
              用系统程序打开
            </button>
          </div>
        ) : loading ? (
          <div style={{ padding: 12, fontSize: 12, color: 'var(--t-fg-4)' }}>读取中…</div>
        ) : err ? (
          <div style={{ padding: 12, fontSize: 12, color: 'var(--status-reject, #EF4444)' }}>{err}</div>
        ) : (
          <CodeBlock content={content} highlighted={highlighted} lang={extToLang(ext)} />
        )}
      </div>
    </div>
  );
}

/** 带行号的代码块；highlighted 为 hljs 产出的 HTML（已转义），否则纯文本。 */
function CodeBlock({
  content,
  highlighted,
  lang,
}: {
  content: string;
  highlighted: string | null;
  lang: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const lineCount = useMemo(() => content.split('\n').length, [content]);

  return (
    <div style={{ display: 'flex', minHeight: '100%', fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.6 }}>
      {/* 行号槽 */}
      <div
        aria-hidden
        style={{
          flexShrink: 0,
          padding: '12px 8px 12px 12px',
          textAlign: 'right',
          userSelect: 'none',
          color: 'var(--t-fg-5)',
          background: 'color-mix(in oklab, var(--t-panel-2) 60%, transparent)',
          borderRight: '1px solid var(--t-border)',
        }}
      >
        {Array.from({ length: lineCount }, (_, i) => (
          <div key={i}>{i + 1}</div>
        ))}
      </div>
      <pre
        style={{
          margin: 0,
          padding: '12px 14px',
          flex: 1,
          minWidth: 0,
          color: 'var(--t-fg-2)',
          whiteSpace: 'pre',
          overflow: 'visible',
        }}
      >
        {highlighted ? (
          <code
            ref={ref}
            className={`hljs language-${lang}`}
            style={{ background: 'transparent', padding: 0 }}
            dangerouslySetInnerHTML={{ __html: highlighted }}
          />
        ) : (
          <code style={{ background: 'transparent', padding: 0 }}>{content}</code>
        )}
      </pre>
    </div>
  );
}

const iconBtn: React.CSSProperties = {
  display: 'inline-flex',
  width: 24,
  height: 24,
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 6,
  border: '1px solid var(--t-border)',
  background: 'var(--t-panel-2)',
  color: 'var(--t-fg-3)',
  cursor: 'pointer',
  flexShrink: 0,
};

function notice(color: string): React.CSSProperties {
  return {
    padding: '4px 10px',
    fontSize: 10.5,
    fontFamily: 'var(--font-mono)',
    color,
    borderBottom: '1px solid var(--t-border)',
  };
}

export default FileViewer;
