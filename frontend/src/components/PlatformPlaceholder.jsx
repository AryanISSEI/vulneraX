import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import GlassCard from './ui/GlassCard';
import SectionHeader from './ui/SectionHeader';

export default function PlatformPlaceholder({ eyebrow, title, description }) {
  return (
    <GlassCard className="p-8">
      <SectionHeader eyebrow={eyebrow} title={title} description={description} />
      <div className="mt-8 rounded-2xl border border-white/10 bg-slate-950/50 p-6">
        <p className="text-sm text-slate-300">
          This section is scaffolded so the platform shell feels complete while the dashboard remains the primary
          production-ready view.
        </p>
        <div className="mt-6 inline-flex items-center gap-2 text-sm text-cyan-300">
          Planned next
          <ArrowUpRight className="h-4 w-4" />
        </div>
      </div>
    </GlassCard>
  );
}
