/**
 * WorkspacePane — Studio 右栏：项目文件 + WORK in the selected workspace（OWNER: right-files）。
 *
 * COMPOSES ProjectFileTree（递归树）+ FileViewer（高亮/图片/Open-in-editor）+ 文件夹选择器。
 * 闭环：选文件夹 → 浏览递归目录树 → 点开文件查看（代码高亮 / 图片预览）。
 *
 * clawsgo 风格的工作空间 tab：代码（code）/ 预览（preview）。打开 .html 文件时，预览 tab
 * 用 iframe（/api/fs/raw 直链）渲染 web 制品；其余文件预览 tab 退回查看器。
 *
 * 选中的工作目录持久化到 localStorage（sf.studio.workspace.root），并在挂载时立即向上
 * 回调 onRootChange —— 这样中栏对话的 contextFolder 一上来就有值（持久化目录直接生效），
 * 后端 run-session/groups-chat 能拿这个目录当真实 cwd 干活。
 *
 * 复用：src/api/fsFiles.ts.pickNativeFolder（后端弹原生文件夹对话框）。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Code2, Eye, FolderOpen, FolderTree } from 'lucide-react';
import { pickNativeFolder } from '../../api/fsFiles';
import { getApiBase } from '../../api/_base';
import { ProjectFileTree } from './ProjectFileTree';
import { FileViewer } from './FileViewer';

const LS_ROOT = 'sf.studio.workspace.root';

/** Returns the last N segments of any path (Windows or Unix). */
function lastSegments(p: string, n = 2): string {
  const parts = p.replace(/\\/g, '/').split('/').filter(Boolean);
  const tail = parts.slice(-n).join('/');
  return parts.length > n ? `…/${tail}` : tail;
}

type ViewMode = 'code' | 'preview';
const PREVIEWABLE = /\.(html?|svg)$/i;

export interface WorkspacePaneProps {
  /** 受控工作目录根。不传则内部自管（从 localStorage 读 / 原生选择框设）。 */
  root?: string;
  /** 工作目录变更回调（中栏对话据此绑定 contextFolder = 后端 cwd）。挂载即回调一次。 */
  onRootChange?: (root: string) => void;
}

export function WorkspacePane({ root: controlledRoot, onRootChange }: WorkspacePaneProps) {
  const [root, setRoot] = useState<string>(() => {
    if (controlledRoot) return controlledRoot;
    try {
      return localStorage.getItem(LS_ROOT) ?? '';
    } catch {
      return '';
    }
  });
  const [openFile, setOpenFile] = useState<string | null>(null);
  const [mode, setMode] = useState<ViewMode>('code');

  // 挂载时把当前 root（含持久化值）回调一次，让中栏 contextFolder 立刻有值。
  const announced = useRef<string | null>(null);
  useEffect(() => {
    if (root && announced.current !== root) {
      announced.current = root;
      onRootChange?.(root);
    }
  }, [root, onRootChange]);

  useEffect(() => {
    if (controlledRoot != null) {
      setRoot(controlledRoot);
      setOpenFile(null);
    }
  }, [controlledRoot]);

  const applyRoot = useCallback((next: string) => {
    setRoot(next);
    setOpenFile(null);
    try {
      localStorage.setItem(LS_ROOT, next);
    } catch {
      /* ignore */
    }
    announced.current = next;
    onRootChange?.(next);
  }, [onRootChange]);

  const pick = useCallback(async () => {
    const picked = await pickNativeFolder();
    if (picked) applyRoot(picked);
  }, [applyRoot]);

  const canPreview = !!openFile && PREVIEWABLE.test(openFile);
  const effectiveMode: ViewMode = canPreview ? mode : 'code';

  const openF = useCallback((p: string) => {
    setOpenFile(p);
    setMode(PREVIEWABLE.test(p) ? 'preview' : 'code');
  }, []);

  // 未选目录 → clawsgo 风格的 hero 空态：插画 + 突出 CTA（不是一条灰按钮）。
  if (!root) {
    return <NoFolderHero onPick={() => void pick()} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* folder picker bar */}
      <div style={{ padding: 8, borderBottom: '1px solid var(--t-border)', flexShrink: 0 }}>
        <button
          type="button"
          className="sf-press"
          onClick={() => void pick()}
          title={`切换项目文件夹\n${root}`}
          aria-label="切换项目文件夹"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            width: '100%',
            padding: '7px 10px',
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
            border: '1px solid var(--t-border)',
            background: 'var(--t-panel-2)',
            color: 'var(--t-fg-2)',
          }}
        >
          <FolderOpen size={14} strokeWidth={2} style={{ color: 'var(--t-accent)', flexShrink: 0 }} />
          <span
            style={{
              flex: 1,
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              textAlign: 'left',
            }}
          >
            {lastSegments(root)}
          </span>
          {openFile && (
            <span
              style={{
                flexShrink: 0,
                maxWidth: '45%',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                color: 'var(--t-accent)',
                fontWeight: 500,
              }}
            >
              {openFile.replace(/\\/g, '/').split('/').pop()}
            </span>
          )}
        </button>
      </div>

      {/* tree (上) / viewer (下) split */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: openFile ? '0 0 42%' : 1, minHeight: 0, overflow: 'hidden' }}>
          <ProjectFileTree root={root} onOpenFile={openF} activeFile={openFile} />
        </div>

        {openFile && (
          <div
            style={{
              flex: 1,
              minHeight: 0,
              borderTop: '1px solid var(--t-border)',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* clawsgo 风格 code/preview tab —— 仅可预览文件显示切换，底部滑动下划线 */}
            {canPreview && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  padding: '5px 8px',
                  borderBottom: '1px solid var(--t-border)',
                  flexShrink: 0,
                }}
              >
                <div className="sf-tabs" style={{ gap: 2 }}>
                  <TabBtn active={effectiveMode === 'code'} onClick={() => setMode('code')} icon={<Code2 size={12} strokeWidth={2} />} label="代码" />
                  <TabBtn active={effectiveMode === 'preview'} onClick={() => setMode('preview')} icon={<Eye size={12} strokeWidth={2} />} label="预览" />
                  <span
                    className="sf-tab-underline"
                    style={{
                      // 两个 tab 等宽 ~58px；下划线随选中态平滑滑动。
                      ['--sf-tab-x' as string]: effectiveMode === 'code' ? '0px' : '60px',
                      ['--sf-tab-w' as string]: '58px',
                    }}
                  />
                </div>
              </div>
            )}

            <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
              {effectiveMode === 'preview' && canPreview ? (
                <iframe
                  key={`prev-${openFile}`}
                  title="预览"
                  src={`${getApiBase()}/api/fs/raw?path=${encodeURIComponent(openFile)}&root=${encodeURIComponent(root)}`}
                  sandbox="allow-scripts allow-same-origin"
                  className="sf-switch-fade"
                  style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }}
                />
              ) : (
                <div key={`code-${openFile}-${effectiveMode}`} className="sf-switch-fade" style={{ height: '100%' }}>
                  <FileViewer filePath={openFile} root={root} onClose={() => setOpenFile(null)} />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      type="button"
      className="sf-tab sf-press"
      onClick={onClick}
      aria-selected={active}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
        width: 58,
        padding: '5px 0 7px',
        fontSize: 11.5,
        fontWeight: 600,
        cursor: 'pointer',
        border: 'none',
        background: 'transparent',
        color: active ? 'var(--t-accent)' : 'var(--t-fg-4)',
        transition: 'color var(--sf-dur-fast, .14s) var(--sf-ease, ease)',
      }}
    >
      {icon}
      {label}
    </button>
  );
}

/**
 * NoFolderHero — 未选工作目录时的 clawsgo 风格欢迎态：
 * 柔和蓝渐变插画 + 大标题 + 突出 CTA + 三条能力提示。不是一条灰按钮。
 */
function NoFolderHero({ onPick }: { onPick: () => void }) {
  return (
    <div
      className="sf-anim-fade"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        padding: '28px 22px',
        textAlign: 'center',
        gap: 4,
      }}
    >
      {/* 渐变插画图标 */}
      <div
        className="sf-anim-scale-in"
        style={{
          width: 76,
          height: 76,
          borderRadius: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 14,
          background:
            'linear-gradient(145deg, color-mix(in oklab, var(--t-accent) 22%, transparent), color-mix(in oklab, var(--t-accent) 6%, transparent))',
          border: '1px solid color-mix(in oklab, var(--t-accent) 28%, var(--t-border))',
          boxShadow: '0 8px 24px -10px color-mix(in oklab, var(--t-accent) 45%, transparent)',
        }}
      >
        <FolderTree size={34} strokeWidth={1.6} style={{ color: 'var(--t-accent)' }} />
      </div>

      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--t-fg)', letterSpacing: 0.2 }}>
        打开你的项目工作区
      </div>
      <p style={{ fontSize: 12.5, lineHeight: 1.6, color: 'var(--t-fg-4)', maxWidth: 240, margin: '4px 0 16px' }}>
        选择一个本地文件夹，浏览目录树、查看代码与图片，并让对话以它为工作目录。
      </p>

      {/* 突出 CTA */}
      <button
        type="button"
        className="sf-press sf-focus-ring"
        onClick={onPick}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 20px',
          borderRadius: 10,
          fontSize: 13,
          fontWeight: 700,
          cursor: 'pointer',
          border: 'none',
          color: '#fff',
          background: 'var(--t-accent)',
          boxShadow: '0 6px 18px -6px color-mix(in oklab, var(--t-accent) 65%, transparent)',
        }}
      >
        <FolderOpen size={16} strokeWidth={2.2} />
        打开项目文件夹
      </button>

      {/* 能力提示行 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 22, width: '100%', maxWidth: 232 }}>
        {[
          { icon: <FolderTree size={13} strokeWidth={2} />, label: '递归目录树 · 懒加载展开' },
          { icon: <Code2 size={13} strokeWidth={2} />, label: '语法高亮代码查看' },
          { icon: <Eye size={13} strokeWidth={2} />, label: '.html / 图片 即时预览' },
        ].map((it) => (
          <div
            key={it.label}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 9,
              padding: '7px 11px',
              borderRadius: 9,
              fontSize: 11.5,
              fontWeight: 500,
              textAlign: 'left',
              color: 'var(--t-fg-3)',
              border: '1px solid var(--t-border)',
              background: 'var(--t-panel-2)',
            }}
          >
            <span
              style={{
                display: 'inline-flex',
                width: 22,
                height: 22,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 6,
                flexShrink: 0,
                color: 'var(--t-accent)',
                background: 'color-mix(in oklab, var(--t-accent) 12%, transparent)',
              }}
            >
              {it.icon}
            </span>
            {it.label}
          </div>
        ))}
      </div>
    </div>
  );
}

export default WorkspacePane;
