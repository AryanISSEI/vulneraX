import React from 'react';
import { Download, FileCode2, FileText } from 'lucide-react';
import GlassCard from './ui/GlassCard';
import SectionHeader from './ui/SectionHeader';

const cards = [
  { label: 'PDF Report', description: 'Executive-ready assessment summary.', icon: FileText },
  { label: 'HTML Report', description: 'Interactive technical findings output.', icon: FileCode2 },
];

export default function ReportExports() {
  return (
    <GlassCard className="p-6">
      <SectionHeader eyebrow="Reporting" title="Export Assessments" description="Generate polished deliverables in one click." />
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {cards.map(({ label, description, icon: Icon }) => (
          <div key={label} className="rounded-2xl border border-white/10 bg-slate-950/60 p-5">
            <div className="flex items-center gap-3 text-white">
              <Icon className="h-5 w-5 text-cyan-300" />
              <h3 className="font-medium">{label}</h3>
            </div>
            <p className="mt-2 text-sm text-slate-400">{description}</p>
            <button className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white/5 px-4 py-2 text-sm text-cyan-300 ring-1 ring-white/10">
              <Download className="h-4 w-4" />
              Download
            </button>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}
