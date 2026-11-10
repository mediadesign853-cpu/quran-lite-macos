import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: LucideIcon;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 text-[var(--text-secondary)]" />
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-secondary)]">
          {title}
        </h3>
      </div>
      {children}
    </section>
  );
}

export function Toggle({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-medium transition-smooth ${active
        ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
        : 'border-[var(--border)] hover:bg-[var(--border-light)]'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
