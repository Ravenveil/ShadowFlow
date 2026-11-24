/**
 * XlsxPreview.tsx — xlsx/csv 产出文件的只读预览（2026-11-20）。
 *
 * 技术路线（Univer 调研结论，见 memory/2026-11-20.md）：Univer 的 xlsx 导入
 * （exchange-client）是 Pro 收费组件且需要转换后端；开源组合 = SheetJS 解析
 * （Apache-2.0，纯前端）→ sheet_to_html 渲染。多 sheet 时顶部 tab 切换。
 *
 * 数据源走 rawUrl 直链（二进制 fetch + arrayBuffer，绝不能走 readFile 的
 * utf8 文本通道——xlsx 是 zip 容器，utf8 解码即损坏）。
 */
import { useEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx';

interface XlsxPreviewProps {
  /** /api/fs/raw 直链（含 root 与相对路径）。 */
  src: string;
  /** 文件名（决定 csv/tsv 的分隔符解析方式）。 */
  name: string;
}

interface SheetEntry {
  name: string;
  html: string;
}

const MAX_SHEET_TABS = 20; // 防 100 个 sheet 撑爆 tab 条；超出部分「其余 N 个」

export default function XlsxPreview({ src, name }: XlsxPreviewProps) {
  const [sheets, setSheets] = useState<SheetEntry[]>([]);
  const [active, setActive] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reqRef = useRef(0);

  useEffect(() => {
    const reqId = ++reqRef.current;
    setLoading(true);
    setError(null);
    setSheets([]);
    setActive(0);

    (async () => {
      try {
        const buf = await (await fetch(src)).arrayBuffer();
        if (reqRef.current !== reqId) return; // race guard：旧请求迟到直接丢

        const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
        // csv/tsv 走字符串解析（SheetJS 对 CSV 的 codepage 探测在 arrayBuffer
        // 路径上偶发误判 GBK），显式给 FS 参数更稳。
        let wb: XLSX.WorkBook;
        if (ext === 'csv' || ext === 'tsv') {
          const text = new TextDecoder('utf-8').decode(buf);
          wb = XLSX.read(text, { type: 'string', FS: ext === 'tsv' ? '\t' : ',' });
        } else {
          wb = XLSX.read(buf, { type: 'array' });
        }

        const entries: SheetEntry[] = [];
        const names = wb.SheetNames.slice(0, MAX_SHEET_TABS);
        for (const sheetName of names) {
          const ws = wb.Sheets[sheetName];
          // 65536 行硬闸：sheet_to_html 对超大 sheet 会卡死主线程。
          const ref = ws['!ref'] ?? 'A1';
          const range = XLSX.utils.decode_range(ref);
          if (range.e.r - range.s.r > 65535) {
            entries.push({
              name: sheetName,
              html: '<p class="neo-xlsx-note">（工作表超过 65,536 行，预览已跳过；请下载查看）</p>',
            });
            continue;
          }
          entries.push({ name: sheetName, html: XLSX.utils.sheet_to_html(ws) });
        }
        if (reqRef.current !== reqId) return;
        setSheets(entries);
      } catch (err) {
        if (reqRef.current !== reqId) return;
        setError((err as Error).message || 'parse failed');
      } finally {
        if (reqRef.current === reqId) setLoading(false);
      }
    })();

    return () => {
      reqRef.current++;
    };
  }, [src, name]);

  if (loading) {
    return (
      <div className="neo-host-preview-loading">
        <span className="neo-spin" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="neo-host-tree-note neo-host-tree-note--pad">
        {`（表格预览失败：${error}）`}
      </div>
    );
  }
  if (sheets.length === 0) {
    return (
      <div className="neo-host-tree-note neo-host-tree-note--pad">
        （工作簿中没有可显示的工作表）
      </div>
    );
  }

  return (
    <div className="neo-xlsx">
      {sheets.length > 1 && (
        <div className="neo-xlsx-tabs" role="tablist">
          {sheets.map((s, i) => (
            <button
              key={s.name}
              type="button"
              role="tab"
              aria-selected={i === active}
              className={`neo-xlsx-tab${i === active ? ' neo-xlsx-tab--active' : ''}`}
              onClick={() => setActive(i)}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
      <div
        className="neo-xlsx-sheet"
        // sheet_to_html 输出由 SheetJS 生成（单元格值经过 escape），且 workspace
        // 里的产出文件本就不可信——与 pdf/html 预览同级的 sandbox 思路：
        // 不执行任何脚本，只注入静态表格。 dangerouslySetInnerHTML 在这里
        // 是「渲染第三方生成 HTML」的标准通道。
        dangerouslySetInnerHTML={{ __html: sheets[active]?.html ?? '' }}
      />
    </div>
  );
}
