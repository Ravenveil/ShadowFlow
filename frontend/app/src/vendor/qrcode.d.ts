// qrcode-generator（MIT, Kazuhiko Arase）vendored 版类型声明。
// 与 qrcode.js（已改造成 ESM default 导出）配套：声明默认导出的工厂函数形状。
// 完整上游声明见 npm qrcode-generator 的 qrcode.d.ts；这里只留实际用到的面。

type QrTypeNumber =
  | 0 // 自动选最小可用版本
  | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10
  | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20
  | 21 | 22 | 23 | 24 | 25 | 26 | 27 | 28 | 29 | 30
  | 31 | 32 | 33 | 34 | 35 | 36 | 37 | 38 | 39 | 40;

type QrErrorCorrectionLevel = "L" | "M" | "Q" | "H";
type QrMode = "Numeric" | "Alphanumeric" | "Byte" | "Kanji";

interface QrCodeInstance {
  addData(data: string, mode?: QrMode): void;
  make(): void;
  getModuleCount(): number;
  isDark(row: number, col: number): boolean;
  createSvgTag(opts?: { cellSize?: number; margin?: number; scalable?: boolean }): string;
  createDataURL(cellSize?: number, margin?: number): string;
}

interface QrCodeFactory {
  (typeNumber: QrTypeNumber, errorCorrectionLevel: QrErrorCorrectionLevel): QrCodeInstance;
  stringToBytes(s: string): number[];
  stringToBytesFuncs: { [encoding: string]: (s: string) => number[] };
}

declare const qrcode: QrCodeFactory;
export default qrcode;
