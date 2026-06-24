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
import { Code2, Eye, FolderOpen } from 'lucide-react';
import { pickNativeFolder } from '../../api/fsFiles';
import { getApiBase } from '../../api/_base';
import { ProjectFileTree } from './ProjectFileTree';
import { FileViewer } from './FileViewer';

const LS_ROOT = 'sf.studio.workspace.root';

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* folder picker bar */}
      <div style={{ padding: 8, borderBottom: '1px solid var(--t-border)', flexShrink: 0 }}>
        <button
          type="button"
          className="sf-press"
          onClick={() => void pick()}
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
          <FolderOpen size={14} strokeWidth={2} style={{ color: 'var(--t-accent)' }} />
          {root ? '切换项目文件夹' : '打开项目文件夹'}
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
            {/* clawsgo 风格 code/preview tab —— 仅可预览文件显示切换 */}
            {canPreview && (
              <div
                style={{
                  display: 'flex',
                  gap: 4,
                  padding: '5px 8px',
                  borderBottom: '1px solid var(--t-border)',
                  flexShrink: 0,
                }}
              >
                <TabBtn active={effectiveMode === 'code'} onClick={() => setMode('code')} icon={<Code2 size={12} strokeWidth={2} />} label="代码" />
                <TabBtn active={effectiveMode === 'preview'} onClick={() => setMode('preview')} icon={<Eye size={12} strokeWidth={2} />} label="预览" />
              </div>
            )}

            <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
              {effectiveMode === 'preview' && canPreview ? (
                <iframe
                  key={openFile}
                  title="预览"
                  src={`${getApiBase()}/api/fs/raw?path=${encodeURIComponent(openFile)}&root=${encodeURIComponent(root)}`}
                  sandbox="allow-scripts allow-same-origin"
                  className="sf-anim-fade"
                  style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }}
                />
              ) : (
                <FileViewer filePath={openFile} root={root} onClose={() => setOpenFile(null)} />
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
      className="sf-press"
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '4px 10px',
        borderRadius: 6,
        fontSize: 11.5,
        fontWeight: 600,
        cursor: 'pointer',
        border: '1px solid',
        borderColor: active ? 'color-mix(in oklab, var(--t-accent) 40%, var(--t-border))' : 'transparent',
        background: active ? 'color-mix(in oklab, var(--t-accent) 12%, transparent)' : 'transparent',
        color: active ? 'var(--t-accent)' : 'var(--t-fg-4)',
      }}
    >
      {icon}
      {label}
    </button>
  );
}

export default WorkspacePane;
