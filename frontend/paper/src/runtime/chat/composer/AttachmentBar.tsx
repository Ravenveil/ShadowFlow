/**
 * AttachmentBar — 已选附件的小 chip 行（图片出缩略图，其余出类型图标）。
 *
 * 纯展示 + 移除：加/清由 Composer 的 useAttachments 管。
 */
import type { AttachmentRef } from '@/shared/data/types';
import { IconClose, IconFile, IconImage } from '@/shared/ui/icons';

export function AttachmentBar({
  items,
  onRemove,
  removeLabel,
}: {
  items: AttachmentRef[];
  onRemove: (id: string) => void;
  removeLabel: string;
}) {
  if (!items.length) return null;
  return (
    <div className="cp-attach-bar">
      {items.map((a) => (
        <span className="cp-attach" key={a.id} title={`${a.name} · ${a.size}`}>
          <span className="cp-attach-ico">
            {a.preview ? (
              <img src={a.preview} alt="" />
            ) : a.kind === 'image' ? (
              <IconImage size={12} />
            ) : (
              <IconFile size={12} />
            )}
          </span>
          <span className="cp-attach-name">{a.name}</span>
          <span className="cp-attach-size">{a.size}</span>
          <button type="button" onClick={() => onRemove(a.id)} title={removeLabel}>
            <IconClose size={11} />
          </button>
        </span>
      ))}
    </div>
  );
}
