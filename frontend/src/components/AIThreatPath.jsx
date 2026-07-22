import React from 'react';
import { BrainCircuit, ChevronRight } from 'lucide-react';
import GlassCard from './ui/GlassCard';
import SectionHeader from './ui/SectionHeader';
import StatusBadge from './ui/StatusBadge';

export default function AIThreatPath({ insights = [], attackPath = [] }) {
  return (
    <GlassCard className="p-6" tone="ai">
      <SectionHeader eyebrow="AI Prediction" title="Threat Posture And Attack Path" description="Predicted escalation paths synthesized from scan signals." />
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-3">
          {insights.map((item) => (
            <div key={item} className="rounded-2xl border border-violet-400/20 bg-violet-500/5 p-4 text-sm text-slate-200">
              {item}
            </div>
          ))}
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-medium text-white">
              <BrainCircuit className="h-4 w-4 text-violet-300" />
              Predicted Attack Path
            </h3>
            <StatusBadge label="AI Synthesized" state="ai" />
          </div>
          <div className="mt-4 space-y-3">
            {attackPath.map((node) => (
              <div key={node} className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2 text-sm text-slate-300">
                <ChevronRight className="h-4 w-4 text-violet-300" />
                {node}
              </div>
            ))}
          </div>
        </div>
      </div>
    </GlassCard>
  );
}
