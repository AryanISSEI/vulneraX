import React from 'react';

export default function StatusBadge({ label, state = 'healthy' }) {
  const styles =
    state === 'critical'
      ? 'bg-rose-500/10 text-rose-300 ring-1 ring-rose-400/25'
      : state === 'ai'
      ? 'bg-violet-500/10 text-violet-300 ring-1 ring-violet-400/25'
      : 'bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-400/25';

  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium whitespace-nowrap ${styles}`}>
      <span className="h-2 w-2 rounded-full bg-current" />
      {label}
    </span>
  );
}
