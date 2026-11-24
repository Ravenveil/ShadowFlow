/**
 * useAttachments — 选中/拖入的文件列表（本地态，不涉及上传）。
 *
 * 图片给一个 object URL 做缩略图；卸载或移除时 revoke，避免长期占内存。
 * 真接口接上后，这里加一步「上传拿 id」，其余不动。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { COMPOSER } from '../../content/app';
import type { AttachmentRef } from '../../data/types';

let seq = 0;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return COMPOSER.sizeKB(Math.round(bytes / 1024));
  return COMPOSER.sizeMB((bytes / 1024 / 1024).toFixed(1));
}

const isImage = (f: File) => f.type.startsWith('image/');

export interface AttachmentsApi {
  items: AttachmentRef[];
  /** 加一批文件（同一文件重复选也允许，各占一个 chip）。 */
  add: (files: FileList | File[]) => void;
  remove: (id: string) => void;
  clear: () => void;
}

export function useAttachments(): AttachmentsApi {
  const [items, setItems] = useState<AttachmentRef[]>([]);
  const urls = useRef<string[]>([]);

  useEffect(
    () => () => {
      urls.current.forEach((u) => URL.revokeObjectURL(u));
      urls.current = [];
    },
    [],
  );

  const add = useCallback((files: FileList | File[]) => {
    const next: AttachmentRef[] = [];
    for (const f of Array.from(files)) {
      const preview =
        isImage(f) && typeof URL.createObjectURL === 'function'
          ? URL.createObjectURL(f)
          : undefined;
      if (preview) urls.current.push(preview);
      seq += 1;
      next.push({
        id: `a${seq}`,
        name: f.name,
        kind: preview ? 'image' : 'file',
        preview,
        size: formatSize(f.size),
      });
    }
    if (next.length) setItems((prev) => [...prev, ...next]);
  }, []);

  const remove = useCallback((id: string) => {
    setItems((prev) => {
      const hit = prev.find((a) => a.id === id);
      if (hit?.preview) {
        URL.revokeObjectURL(hit.preview);
        urls.current = urls.current.filter((u) => u !== hit.preview);
      }
      return prev.filter((a) => a.id !== id);
    });
  }, []);

  const clear = useCallback(() => {
    setItems((prev) => {
      prev.forEach((a) => a.preview && URL.revokeObjectURL(a.preview));
      return [];
    });
    urls.current = [];
  }, []);

  return { items, add, remove, clear };
}
