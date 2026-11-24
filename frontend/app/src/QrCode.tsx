/**
 * QrCode — 二维码渲染组件（2026-11-08 商品售卖列表）。
 *
 * 库：vendored qrcode-generator（MIT, Kazuhiko Arase，单文件零依赖，
 * 见 vendor/qrcode.js）。这里只用它的矩阵生成（isDark 网格），渲染走
 * React SVG —— 不用 createSvgTag 的字符串拼接，尺寸/配色可控。
 *
 * 字节编码固定 UTF-8（vendor 包装层统一开）：商品名/链接里的中文
 * 扫出来才不是乱码。
 */
import { useMemo } from "react";
import qrcode from "./vendor/qrcode.js";

// 一次性把字节编码切到 UTF-8（上游默认 ISO-8859-1 口径）。
qrcode.stringToBytes = qrcode.stringToBytesFuncs["UTF-8"];

/** 文本 → QR 模块矩阵（true = 黑格）。生成失败（超长等）返回空数组。 */
export function qrModules(value: string): boolean[][] {
  if (!value) return [];
  try {
    const qr = qrcode(0, "M");
    qr.addData(value, "Byte");
    qr.make();
    const n = qr.getModuleCount();
    const grid: boolean[][] = [];
    for (let r = 0; r < n; r++) {
      const row: boolean[] = [];
      for (let c = 0; c < n; c++) row.push(qr.isDark(r, c));
      grid.push(row);
    }
    return grid;
  } catch {
    return [];
  }
}

export function QrCode({
  value,
  size = 96,
  quiet = 2,
  label = "二维码",
}: {
  value: string;
  /** 边长（px）。 */
  size?: number;
  /** 静区（模块数），扫码器识别需要留白，缺省 2。 */
  quiet?: number;
  /** 无障碍标签。 */
  label?: string;
}) {
  const grid = useMemo(() => qrModules(value), [value]);
  const n = grid.length;
  if (n === 0) {
    return (
      <div
        className="sf-qr-empty"
        style={{ width: size, height: size }}
        role="img"
        aria-label={`${label}（内容为空）`}
      >
        —
      </div>
    );
  }
  const total = n + quiet * 2;
  const path: string[] = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (grid[r][c]) path.push(`M${c + quiet} ${r + quiet}h1v1h-1z`);
    }
  }
  return (
    <svg
      viewBox={`0 0 ${total} ${total}`}
      width={size}
      height={size}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
    >
      <rect width={total} height={total} fill="#ffffff" />
      <path d={path.join("")} fill="#17162d" />
    </svg>
  );
}
