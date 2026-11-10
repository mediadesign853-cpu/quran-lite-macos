import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export interface ContextMenuItem {
  label: string;
  hint?: string;
  onSelect: () => void;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

/** Small right-click menu placed at the pointer (kept inside the window). */
export default function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    setPos({
      left: Math.max(4, Math.min(x, window.innerWidth - width - 4)),
      top: Math.max(4, Math.min(y, window.innerHeight - height - 4)),
    });
  }, [x, y]);

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('blur', onClose);
    window.addEventListener('resize', onClose);
    window.addEventListener('wheel', onClose, { passive: true });
    return () => {
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('blur', onClose);
      window.removeEventListener('resize', onClose);
      window.removeEventListener('wheel', onClose);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="menu"
      style={pos}
      // keeps the text selection while the menu is used
      onMouseDown={(e) => e.preventDefault()}
      onContextMenu={(e) => e.preventDefault()}
      className="fixed z-[70] min-w-[200px] py-1 rounded-lg border border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-primary)] shadow-2xl text-sm animate-scale-in"
    >
      {items.map((item) => (
        <button
          key={item.label}
          role="menuitem"
          onClick={() => {
            item.onSelect();
            onClose();
          }}
          className="w-full flex items-center justify-between gap-6 px-3 py-2 text-start hover:bg-[var(--bg-secondary)] transition-smooth"
        >
          <span>{item.label}</span>
          {item.hint && <span className="text-xs text-[var(--text-secondary)]">{item.hint}</span>}
        </button>
      ))}
    </div>
  );
}
