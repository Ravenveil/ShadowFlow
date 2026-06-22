/**
 * useModalAnimation — 给手写弹层补退场动画（2026-06-22 motion polish）。
 *
 * 现状：弹层都是 `{open && <Modal onClose={() => setOpen(false)}/>}` 直接条件卸载，
 * 关闭瞬间消失、没有退场。这个 hook 在「触发关闭」与「真正卸载」之间插入一段
 * 退场窗口：beginClose() 先把 closing 置 true（卡片/背景切到 *-out 关键帧），
 * 延迟 duration 后再调用真正的 onClose（父级卸载）。
 *
 * 用法（弹层内部）：
 *   const { closing, beginClose } = useModalAnimation(onClose);
 *   <div className="sf-modal-backdrop" data-closing={closing ? '1' : undefined} onClick={beginClose}>
 *     <div className="sf-modal-card" data-closing={closing ? '1' : undefined} onClick={e=>e.stopPropagation()}>
 *   并把所有「取消/完成/Esc」的关闭路径从 onClose 换成 beginClose。
 *
 * 进场动画只需给 backdrop/card 加 `sf-modal-backdrop` / `sf-modal-card` 类即可
 * （见 src/index.css），无需本 hook。
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export function useModalAnimation(onClose: () => void, duration = 160) {
  const [closing, setClosing] = useState(false);
  const timer = useRef<number | null>(null);

  const beginClose = useCallback(() => {
    if (closing) return;
    setClosing(true);
    timer.current = window.setTimeout(() => onClose(), duration);
  }, [closing, onClose, duration]);

  useEffect(() => () => { if (timer.current != null) window.clearTimeout(timer.current); }, []);

  return { closing, beginClose };
}

export default useModalAnimation;
