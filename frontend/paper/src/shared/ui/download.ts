/** 把一个对象存成本地文件（导出工作区用；不依赖任何库）。 */
export function downloadJson(filename: string, payload: unknown): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // 立刻 revoke 会让部分浏览器拿不到内容，延后一拍
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
