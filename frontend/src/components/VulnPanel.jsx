import React, { useMemo, useState } from 'react';
import GlassCard from './ui/GlassCard';
import SectionHeader from './ui/SectionHeader';
import { ShieldAlert } from 'lucide-react';

const tabs = ['All', 'Critical', 'High', 'Medium', 'Low', 'Info'];

export default function VulnPanel({ vulnerabilities = [], onSelectVuln }) {
  const [activeTab, setActiveTab] = useState('All');

  const filtered = useMemo(() => {
    if (activeTab === 'All') return vulnerabilities;
    return vulnerabilities.filter((item) => item.severity?.toLowerCase() === activeTab.toLowerCase());
  }, [activeTab, vulnerabilities]);

  return (
    <GlassCard className="p-6">
      <SectionHeader
        title="Discovered Vulnerabilities"
        subtitle="Investigate exposed endpoints, severity, and remediation actions."
        icon={ShieldAlert}
      />

      <div className="mt-5 flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`rounded-full px-4 py-2 text-sm transition-all duration-300 font-mono uppercase tracking-widest text-[10px] ${
              activeTab === tab
                ? 'bg-primary text-black shadow-[0_0_15px_rgba(0,240,255,0.4)]'
                : 'bg-white/5 text-slate-300 hover:bg-white/10'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-slate-400">
            <tr className="border-b border-white/10">
              <th className="pb-3 px-2 font-mono text-[10px] uppercase tracking-widest">Name</th>
              <th className="pb-3 px-2 font-mono text-[10px] uppercase tracking-widest">Target Endpoint</th>
              <th className="pb-3 px-2 font-mono text-[10px] uppercase tracking-widest">Type</th>
              <th className="pb-3 px-2 font-mono text-[10px] uppercase tracking-widest">Severity</th>
              <th className="pb-3 px-2 font-mono text-[10px] uppercase tracking-widest">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item, i) => {
               // Determine styles based on severity
               let sevClass = "bg-green-500/10 text-green-500 border border-green-500/20";
               let sevGlow = "bg-green-500";
               if (item.severity === 'Critical') { sevClass = "bg-destructive/10 text-destructive border border-destructive/20"; sevGlow = "bg-destructive shadow-[0_0_10px_#ff003c]"; }
               else if (item.severity === 'High') { sevClass = "bg-[#ff7e00]/10 text-[#ff7e00] border border-[#ff7e00]/20"; sevGlow = "bg-[#ff7e00] shadow-[0_0_10px_#ff7e00]"; }
               else if (item.severity === 'Medium') { sevClass = "bg-[#facc15]/10 text-[#facc15] border border-[#facc15]/20"; sevGlow = "bg-[#facc15] shadow-[0_0_10px_#facc15]"; }

               return (
                <tr key={`${item.name}-${i}`} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                  <td className="py-4 px-2 font-bold text-white max-w-[200px] truncate">{item.name || item.type}</td>
                  <td className="py-4 px-2 font-mono text-[10px] text-primary truncate max-w-[200px]" title={item.url || item.endpoint}>{item.url || item.endpoint}</td>
                  <td className="py-4 px-2 text-muted-foreground text-[10px] uppercase tracking-widest">{item.type}</td>
                  <td className="py-4 px-2">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-widest ${sevClass}`}>
                      <span className={`h-1.5 w-1.5 rounded-full animate-pulse ${sevGlow}`} />
                      {item.severity}
                    </span>
                  </td>
                  <td className="py-4 px-2">
                    <button 
                      onClick={() => onSelectVuln?.(item)}
                      className="rounded-lg bg-primary/10 hover:bg-primary border border-primary/20 hover:border-primary px-3 py-1.5 text-[10px] font-bold tracking-widest text-primary hover:text-black transition-all shadow-[0_0_10px_rgba(0,240,255,0)] hover:shadow-[0_0_15px_rgba(0,240,255,0.5)] font-mono uppercase"
                    >
                      Oracle
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {filtered.length === 0 ? <p className="py-10 text-center font-mono text-xs text-slate-500 uppercase tracking-widest">No vulnerabilities found.</p> : null}
      </div>
    </GlassCard>
  );
}
