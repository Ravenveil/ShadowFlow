/**
 * TriggerMenu — `@` / `/` 的内联菜单（键盘高亮 + 选中回调）。
 */
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { COMPOSER } from "../content/composer";

export interface MenuItem {
  id: string;
  label: string;
  desc?: string;
  hint?: string;
  badge?: string;
  group: string;
  checked?: boolean;
}

export interface TriggerMenuHandle {
  /** 返回 true 表示这个键被菜单吃掉了。 */
  key(e: React.KeyboardEvent): boolean;
}

export const TriggerMenu = forwardRef<
  TriggerMenuHandle,
  {
    open: boolean;
    title: string;
    items: MenuItem[];
    query: string;
    onPick: (item: MenuItem) => void;
  }
>(function TriggerMenu({ open, title, items, query, onPick }, ref) {
  const [index, setIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => setIndex(0), [query, items.length]);
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('[data-on="true"]');
    el?.scrollIntoView({ block: "nearest" });
  }, [index]);

  useImperativeHandle(
    ref,
    () => ({
      key(e) {
        if (!open || !items.length) return false;
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setIndex((i) => (i + 1) % items.length);
          return true;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setIndex((i) => (i - 1 + items.length) % items.length);
          return true;
        }
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          onPick(items[Math.min(index, items.length - 1)]);
          return true;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          return true;
        }
        return false;
      },
    }),
    [open, items, index, onPick],
  );

  const rows = useMemo(() => {
    let last = "";
    return items.map((it, i) => {
      const head = it.group !== last ? it.group : null;
      last = it.group;
      return { it, i, head };
    });
  }, [items]);

  if (!open) return null;

  return (
    <div className="cp-menu" role="listbox" aria-label={title}>
      <div className="cp-menu-head">{title}</div>
      {items.length ? (
        <div className="cp-menu-list" ref={listRef}>
          {rows.map(({ it, i, head }) => (
            <div key={it.id}>
              {head ? <div className="cp-menu-group">{head}</div> : null}
              <button
                type="button"
                role="option"
                aria-selected={i === index}
                data-on={i === index ? "true" : undefined}
                data-checked={it.checked ? "true" : undefined}
                className="cp-menu-row"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onPick(it);
                }}
                onMouseEnter={() => setIndex(i)}
              >
                <span className="cp-menu-label">{it.label}</span>
                {it.desc ? <span className="cp-menu-desc">{it.desc}</span> : null}
                {it.badge ? <span className="cp-menu-badge">{it.badge}</span> : null}
                {!it.badge && it.hint ? <span className="cp-menu-hint">{it.hint}</span> : null}
                {it.checked ? <span className="cp-menu-tick">✓</span> : null}
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="cp-menu-empty">{COMPOSER.menuEmpty(query)}</div>
      )}
    </div>
  );
});
