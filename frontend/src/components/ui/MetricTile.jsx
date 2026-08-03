import React from 'react';
import GlassCard from './GlassCard';

export default function MetricTile({ icon: Icon, label, value, hint, tone = 'default', children }) {
  return (
    <GlassCard className="p-5" tone={tone}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground truncate">{label}</p>
          <p className="mt-3 text-3xl font-semibold text-foreground">{value}</p>
          {hint ? <p className="mt-2 text-sm text-muted-foreground">{hint}</p> : null}
        </div>
        {Icon ? (
          <div className="rounded-2xl bg-foreground/5 p-3 text-cyan-300">
            <Icon className="h-5 w-5" />
          </div>
        ) : null}
      </div>
      {children}
    </GlassCard>
  );
}
