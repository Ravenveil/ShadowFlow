/**
 * CreateProjectModal — 「创建本地项目」：名称 + 本地文件夹。
 *
 * 文件夹由后端弹系统原生选择框（daemon 跑在用户本机，浏览器拿不到真实路径）；
 * 不选文件夹也能创建，只给名称即可。文案见 content/views.ts 的 PROJECTS。
 */
import { useEffect, useState } from 'react';
import { PROJECTS } from '@/shared/content/views';
import { pickNativeDir } from '@/shared/data/http/generic';
import { IconClose, IconFolder } from '@/shared/ui/icons';

export function CreateProjectModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (name: string, dir?: string) => Promise<unknown>;
}) {
  const [name, setName] = useState('');
  const [dir, setDir] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const addFolder = async () => {
    const picked = await pickNativeDir();
    if (!picked) return;
    setDir(picked);
    if (!name.trim()) {
      setName(picked.split(/[\\/]/).filter(Boolean).pop() ?? '');
    }
  };

  const submit = async () => {
    const value = name.trim();
    if (!value || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onCreate(value, dir || undefined);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : PROJECTS.createFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="sf-modal-mask"
      role="presentation"
      onMouseDown={() => !busy && onClose()}
    >
      <div
        className="sf-modal"
        role="dialog"
        aria-modal="true"
        aria-label={PROJECTS.createTitle}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="sf-modal-head">
          <h2>{PROJECTS.createTitle}</h2>
          <button className="sf-icon-btn" onClick={onClose} aria-label={PROJECTS.close} disabled={busy}>
            <IconClose size={15} />
          </button>
        </div>

        <label className="sf-modal-field">
          <span>{PROJECTS.nameLabel}</span>
          <span className="sf-modal-input">
            <IconFolder size={14} />
            <input
              value={name}
              autoFocus
              placeholder={PROJECTS.namePlaceholder}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submit();
              }}
            />
          </span>
        </label>

        <div className="sf-modal-field">
          <div className="sf-modal-field-head">
            <span>{PROJECTS.folderLabel}</span>
            {dir ? (
              <button className="sf-modal-link" onClick={() => setDir('')} disabled={busy}>
                {PROJECTS.folderClear}
              </button>
            ) : null}
          </div>

          {dir ? (
            <div className="sf-modal-folder">
              <span className="sf-modal-folder-path">
                <IconFolder size={14} />
                <span>{dir}</span>
              </span>
              <button className="sf-icon-btn" onClick={() => setDir('')} aria-label={PROJECTS.folderClear} disabled={busy}>
                <IconClose size={14} />
              </button>
            </div>
          ) : (
            <div className="sf-modal-empty">
              <span className="sf-modal-empty-ico">
                <IconFolder size={22} />
              </span>
              <strong>{PROJECTS.folderEmptyTitle}</strong>
              <p>{PROJECTS.folderEmptyBody}</p>
              <button className="subview-btn" onClick={() => void addFolder()} disabled={busy}>
                {PROJECTS.folderAdd}
              </button>
            </div>
          )}

          {dir ? (
            <button className="sf-modal-link" onClick={() => void addFolder()} disabled={busy}>
              {PROJECTS.folderChange}
            </button>
          ) : null}
        </div>

        {error ? <div className="sf-modal-error">{error}</div> : null}

        <div className="sf-modal-actions">
          <button className="subview-btn" onClick={onClose} disabled={busy}>
            {PROJECTS.cancel}
          </button>
          <button
            className="subview-btn"
            data-primary="true"
            onClick={() => void submit()}
            disabled={busy || !name.trim()}
          >
            {busy ? PROJECTS.creating : PROJECTS.create}
          </button>
        </div>
      </div>
    </div>
  );
}
