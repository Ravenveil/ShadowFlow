/**
 * XlsxPreview — xlsx/csv 产出文件的只读预览（搬 legacy XlsxPreview）。
 *
 * SheetJS 解析（纯前端）→ sheet_to_html 渲染；多 sheet 顶部 tab 切换。
 * 数据源走 raw 直链（二进制 fetch + arrayBuffer，绝不能走 utf8 文本通道
 * ——xlsx 是 zip 容器，utf8 解码即损坏）。csv/tsv 走字符串解析并显式给
 * 分隔符（SheetJS 对 CSV 的 codepage 探测在 arrayBuffer 路径上偶发误判）。
 * 文案在 content/app.ts 的 XLSX_VIEW。
 */
import { useEffect, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { XLSX_VIEW } from '@/shared/content/app';
import { fetchRawBinary } from '@/shared/data/http/generic';

interface SheetEntry {
  name: string;
  html: string;
}

const MAX_SHEET_TABS = 20;
const MAX_SHEET_ROWS = 65_535;

export function XlsxPreview({ src, name }: { src: string; name: string }) {
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
        const buf = await fetchRawBinary(src);
        if (reqRef.current !== reqId) return;

        const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
        let wb: XLSX.WorkBook;
        if (ext === 'csv' || ext === 'tsv') {
          const text = new TextDecoder('utf-8').decode(buf);
          wb = XLSX.read(text, { type: 'string', FS: ext === 'tsv' ? '\t' : ',' });
        } else {
          wb = XLSX.read(buf, { type: 'array' });
        }

        const entries: SheetEntry[] = [];
        for (const sheetName of wb.SheetNames.slice(0, MAX_SHEET_TABS)) {
          const ws = wb.Sheets[sheetName];
          const ref = ws['!ref'] ?? 'A1';
          const range = XLSX.utils.decode_range(ref);
          if (range.e.r - range.s.r > MAX_SHEET_ROWS) {
            entries.push({ name: sheetName, html: `<p class="xlsx-note">${XLSX_VIEW.tooLarge}</p>` });
            continue;
          }
          entries.push({ name: sheetName, html: XLSX.utils.sheet_to_html(ws) });
        }
        if (reqRef.current !== reqId) return;
        setSheets(entries);
      } catch (err) {
        if (reqRef.current !== reqId) return;
        setError((err as Error).message || XLSX_VIEW.parseFailed);
      } finally {
        if (reqRef.current === reqId) setLoading(false);
      }
    })();

    return () => {
      reqRef.current++;
    };
  }, [src, name]);

  if (loading) return <div className="xlsx-loading" />;
  if (error) return <div className="xlsx-note">{XLSX_VIEW.failed(error)}</div>;
  if (sheets.length === 0) return <div className="xlsx-note">{XLSX_VIEW.empty}</div>;

  return (
    <div className="xlsx">
      {sheets.length > 1 ? (
        <div className="xlsx-tabs" role="tablist">
          {sheets.map((s, i) => (
            <button
              key={s.name}
              type="button"
              role="tab"
              aria-selected={i === active}
              className="xlsx-tab"
              data-active={i === active || undefined}
              onClick={() => setActive(i)}
            >
              {s.name}
            </button>
          ))}
        </div>
      ) : null}
      <div
        className="xlsx-sheet"
        // sheet_to_html 输出由 SheetJS 生成（单元格值经过 escape），workspace 里的
        // 产出文件本就不可信——不执行脚本，只注入静态表格。
        dangerouslySetInnerHTML={{ __html: sheets[active]?.html ?? '' }}
      />
    </div>
  );
}
