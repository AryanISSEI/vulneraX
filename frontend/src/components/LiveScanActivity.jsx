import React from 'react';
import { CheckCircle2, CircleDot, LoaderCircle } from 'lucide-react';
import GlassCard from './ui/GlassCard';
import SectionHeader from './ui/SectionHeader';

export default function LiveScanActivity({ steps = [], status = 'idle' }) {
  return (
    <GlassCard className="p-6">
      <SectionHeader eyebrow="Active Scan" title="Live Assessment Tracker" description="Monitor the current assessment pipeline in real time." />
      <div className="mt-6 space-y-4">
        {steps.map((step) => (
          <div key={step.label} className="flex items-center gap-3 rounded-2xl border border-white/5 bg-card/50 px-4 py-3">
            {step.state === 'complete' ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            ) : step.state === 'running' ? (
              <LoaderCircle className="h-5 w-5 animate-spin text-cyan-300" />
            ) : (
              <CircleDot className="h-5 w-5 text-muted-foreground" />
            )}
            <span className={step.state === 'running' ? 'text-sm font-medium text-cyan-300' : 'text-sm text-muted-foreground'}>
              {step.label}
            </span>
          </div>
        ))}
        {status === 'idle' ? <p className="text-sm text-muted-foreground">No live assessments. Start a scan to populate this tracker.</p> : null}
      </div>
    </GlassCard>
  );
}
