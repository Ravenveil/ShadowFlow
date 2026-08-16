/**
 * NeoArtifactPreview — Neo 壳自有的产物预览（阶段 2.5 视觉返工，替代旧
 * components/ArtifactPreview 在 Neo 壳内的直接引用；旧组件文件不动）。
 *
 * 视觉基准：.tmp/clawsgo-clone/done.html（b_004 右栏文档预览）——
 * - filecard ~56px：22px 薰衣草文档角块 + 名称 13/600 + 副标题 11px 灰 +
 *   右侧图标操作（新标签打开 / 刷新 / 下载 / 关闭）
 * - 双栏：大纲 210px（label 11/600 灰；节点 12px radius 8；当前节灰胶囊）｜
 *   markdown flex-1（h2 19/700、列表 13px lh 1.9、链接 var(--t-link) 下划线）
 * - 大纲节点由真实 markdown 标题提取（extractOutline），点击滚动定位 +
 *   scroll-spy 高亮当前节；无标题 / 仅 1 个标题时不渲染大纲栏（不撑假数据）。
 *
 * 功能保持与旧组件等价（全部为真实端点 / 真实行为，无 mock）：
 * - html：iframe sandbox="allow-scripts"（安全边界同旧组件审查结论，不加
 *   allow-same-origin）+ 预览/源码切换 + 加载 skeleton + 失败态
 * - markdown：NeoMarkdown 渲染 + 预览/源码切换；yaml：等宽源码
 * - 完成态（isComplete && sessionId && filename）出下载：单文件 / ZIP
 *   （/api/export/<sessionId>/zip）；html 另有 PDF（HEAD 探 503
 *   PDF_ENGINE_UNAVAILABLE）/ Markdown 导出（/api/export/<sessionId>/{pdf,markdown}）
 *
 * done.html filecard 的 置顶/收藏 图标无后端数据支撑，不渲染（记入 GAP）。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  Braces,
  Download,
  ExternalLink,
  FileCode,
  FileDown,
  FileText,
  RefreshCw,
  X,
} from 'lucide-react';
import type { ArtifactType } from '../../api/runs';
import { useI18n } from '../../common/i18n';
import { NeoMarkdown, extractOutline } from './NeoMarkdown';

export interface NeoArtifactPreviewProps {
  /** 静态服务器地址，如 /projects/<session_id>/prototype.html */
  url: string;
  /** 渲染分支（html / yaml / markdown）。 */
  type: ArtifactType;
  /** 文本内容（markdown 渲染 / 源码视图用）。 */
  content: string;
  sessionId?: string;
  filename?: string;
  /** 会话结束后才出下载动作（沿用旧组件语义）。 */
  isComplete?: boolean;
  /** 重新拉取内容（父层 refetch）。 */
  onRefresh?: () => void;
  /** 关闭产物 tab。 */
  onClose?: () => void;
}

const TYPE_LABELS: Record<ArtifactType, string> = {
  html: 'HTML',
  yaml: 'YAML',
  markdown: 'Markdown',
};

function TypeIcon({ type }: { type: ArtifactType }) {
  if (type === 'html') return <FileCode size={12} strokeWidth={2} />;
  if (type === 'yaml') return <Braces size={12} strokeWidth={2} />;
  return <FileText size={12} strokeWidth={2} />;
}

export function NeoArtifactPreview({
  url,
  type,
  content,
  sessionId,
  filename,
  isComplete,
  onRefresh,
  onClose,
}: NeoArtifactPreviewProps) {
  const { t } = useI18n();
  const [mode, setMode] = useState<'preview' | 'source'>('preview');
  const [frameLoaded, setFrameLoaded] = useState(false);
  const [frameError, setFrameError] = useState(false);
  const [curHeading, setCurHeading] = useState<string | null>(null);
  const mdRef = useRef<HTMLDivElement>(null);

  // 产物切换 → 复位（iframe 加载态 / 视图模式 / 大纲高亮）
  useEffect(() => {
    setMode('preview');
    setFrameLoaded(false);
    setFrameError(false);
    setCurHeading(null);
  }, [url]);

  // 大纲：从真实 markdown 标题提取；少于 2 个标题不渲染大纲栏（不凑数）。
  const outline = useMemo(
    () => (type === 'markdown' ? extractOutline(content) : []),
    [type, content],
  );
  const showOutline = outline.length >= 2;

  const scrollToHeading = (id: string) => {
    setCurHeading(id);
    mdRef.current
      ?.querySelector(`#${CSS.escape(id)}`)
      ?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  };

  // scroll-spy：最后一个越过视口顶部的标题 = 当前节
  const onMdScroll = () => {
    const root = mdRef.current;
    if (!root) return;
    const heads = root.querySelectorAll<HTMLElement>('.neo-md-h');
    let cur: string | null = null;
    for (const el of heads) {
      if (el.offsetTop <= root.scrollTop + 24) cur = el.id;
      else break;
    }
    setCurHeading(cur);
  };

  // PDF 导出 503 探测：chromium 没起来时 alert，而不是让浏览器吃掉下载失败。
  const pdfHref =
    sessionId && filename
      ? `/api/export/${encodeURIComponent(sessionId)}/pdf?filename=${encodeURIComponent(filename)}&viewport=1280x800`
      : '';
  const handlePdfClick = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    try {
      const probe = await fetch(pdfHref, { method: 'HEAD' });
      if (probe.status === 503) {
        // eslint-disable-next-line no-alert
        alert(t('neo.host.pdfUnavailable', { defaultValue: 'PDF 引擎不可用，请联系管理员重装 Chromium 后重试。' }));
        return;
      }
    } catch {
      /* 网络抖动 — 落到原生下载，让它自己报错 */
    }
    window.location.href = pdfHref;
  };

  const canDownload = Boolean(isComplete && sessionId && filename);
  const hasSeg = type === 'markdown' || type === 'html';

  return (
    <div className="neo-ap">
      {/* filecard：文档角块 + 名称/副标题 + 图标操作（done.html b_004） */}
      <div className="neo-ap-filecard">
        <span className="neo-ap-doc-ic">
          <TypeIcon type={type} />
        </span>
        <div className="neo-ap-meta">
          <div className="neo-ap-name" title={filename ?? url}>
            {filename ?? url.split('/').pop() ?? url}
          </div>
          <div className="neo-ap-sub">
            {TYPE_LABELS[type]}
            {' · '}
            {isComplete
              ? t('neo.host.artifactDone', { defaultValue: '已完成' })
              : t('neo.host.artifactRunning', { defaultValue: '生成中' })}
          </div>
        </div>
        <span className="neo-ap-sp" />
        {hasSeg && (
          <div className="neo-host-seg">
            <button
              type="button"
              className={`neo-host-seg-btn${mode === 'preview' ? ' neo-host-seg-btn--on' : ''}`}
              onClick={() => setMode('preview')}
            >
              {t('neo.host.preview', { defaultValue: '预览' })}
            </button>
            <button
              type="button"
              className={`neo-host-seg-btn${mode === 'source' ? ' neo-host-seg-btn--on' : ''}`}
              onClick={() => setMode('source')}
            >
              {t('neo.host.code', { defaultValue: '代码' })}
            </button>
          </div>
        )}
        <div className="neo-ap-act">
          <a
            className="neo-host-icon-btn"
            title={t('neo.host.openNewTab', { defaultValue: '在新标签打开' })}
            href={url}
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink size={12} strokeWidth={1.8} />
          </a>
          {onRefresh && (
            <button
              type="button"
              className="neo-host-icon-btn"
              title={t('neo.host.refresh', { defaultValue: '刷新' })}
              onClick={onRefresh}
            >
              <RefreshCw size={12} strokeWidth={1.8} />
            </button>
          )}
          {canDownload && (
            <a
              className="neo-host-icon-btn"
              title={t('neo.host.downloadFile', { defaultValue: '下载 {{type}}', type: TYPE_LABELS[type] })}
              href={url}
              download={filename}
            >
              <Download size={12} strokeWidth={1.8} />
            </a>
          )}
          {canDownload && type === 'html' && (
            <>
              <a
                className="neo-host-icon-btn"
                title={t('neo.host.downloadPdf', { defaultValue: '下载 PDF' })}
                href={pdfHref}
                onClick={handlePdfClick}
              >
                <FileDown size={12} strokeWidth={1.8} />
              </a>
              <a
                className="neo-host-icon-btn"
                title={t('neo.host.downloadMd', { defaultValue: '下载 Markdown' })}
                href={`/api/export/${encodeURIComponent(sessionId as string)}/markdown?filename=${encodeURIComponent(filename as string)}`}
                download
              >
                <FileText size={12} strokeWidth={1.8} />
              </a>
            </>
          )}
          {canDownload && (
            <a
              className="neo-host-icon-btn"
              title={t('neo.host.downloadZip', { defaultValue: '下载 ZIP' })}
              href={`/api/export/${encodeURIComponent(sessionId as string)}/zip`}
              download
            >
              <Archive size={12} strokeWidth={1.8} />
            </a>
          )}
          {onClose && (
            <button
              type="button"
              className="neo-host-icon-btn"
              title={t('neo.host.close', { defaultValue: '关闭' })}
              onClick={onClose}
            >
              <X size={12} strokeWidth={1.8} />
            </button>
          )}
        </div>
      </div>

      {/* 内容体 */}
      {type === 'markdown' && mode === 'preview' ? (
        <div className="neo-ap-body">
          {showOutline && (
            <aside className="neo-ap-outline">
              <div className="neo-ap-outline-label">
                {t('neo.host.outline', { defaultValue: '大纲' })}
              </div>
              {outline.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  title={o.text}
                  className={`neo-ap-outline-node${
                    o.depth === 1 ? ' neo-ap-outline-node--root' : ''
                  }${o.depth === 2 ? ' neo-ap-outline-node--l2' : ''}${
                    o.depth >= 3 ? ' neo-ap-outline-node--l3' : ''
                  }${curHeading === o.id ? ' neo-ap-outline-node--cur' : ''}`}
                  onClick={() => scrollToHeading(o.id)}
                >
                  {o.text}
                </button>
              ))}
            </aside>
          )}
          <div className="neo-ap-md" ref={mdRef} onScroll={onMdScroll}>
            <NeoMarkdown source={content} />
          </div>
        </div>
      ) : type === 'html' && mode === 'preview' ? (
        <div className="neo-ap-frame-wrap">
          {!frameLoaded && <div className="neo-ap-skel" />}
          {frameError && (
            <div className="neo-ap-frame-err">
              <span>{t('neo.host.previewFailed', { defaultValue: '预览加载失败' })}</span>
              <a href={url} target="_blank" rel="noreferrer">
                {t('neo.host.openNewTab', { defaultValue: '在新标签打开' })}
              </a>
            </div>
          )}
          <iframe
            src={url}
            // SECURITY（沿用旧组件 2026-05-10 review B1 结论）：仅 allow-scripts，
            // 不加 allow-same-origin —— LLM 生成 HTML 进入 opaque origin，
            // 读不到父域 localStorage 里的 BYOK key。
            sandbox="allow-scripts"
            title="Artifact Preview"
            className="neo-ap-frame"
            onLoad={() => setFrameLoaded(true)}
            onError={() => {
              setFrameError(true);
              setFrameLoaded(true);
            }}
          />
        </div>
      ) : (
        // markdown 源码 / html 源码 / yaml：深色等宽源码视图（同 .neo-host-code 规范）
        <pre className="neo-ap-source">{content}</pre>
      )}
    </div>
  );
}

export default NeoArtifactPreview;
