import Link from 'next/link';
import { cn } from '@/lib/utils';

export function StatCard({
  label,
  value,
  hint,
  href,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  hint?: string;
  href?: string;
  tone?: 'default' | 'accent' | 'warning' | 'danger' | 'success';
}) {
  const toneBar: Record<string, string> = {
    default: 'bg-slate-300',
    accent: 'bg-primary',
    warning: 'bg-amber-400',
    danger: 'bg-rose-400',
    success: 'bg-emerald-500',
  };

  const inner = (
    <div
      className={cn(
        'relative overflow-hidden rounded-xl border bg-card p-5 shadow-soft transition',
        href && 'hover:border-primary/40',
      )}
    >
      <span
        className={cn('absolute inset-y-0 left-0 w-1', toneBar[tone])}
        aria-hidden
      />
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-3xl font-bold tracking-tight text-foreground">
        {value}
      </p>
      {hint ? (
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block focus-visible:outline-none">
        {inner}
      </Link>
    );
  }
  return inner;
}
