import React, { useMemo, useState } from 'react';
import GlassCard from './ui/GlassCard';
import SectionHeader from './ui/SectionHeader';
import StatusBadge from './ui/StatusBadge';

const tabs = ['All', 'Critical', 'High', 'OWASP Top 10'];

export default function VulnPanel({ vulnerabilities = [] }) {
  const [activeTab, setActiveTab] = useState('All');

  const filtered = useMemo(() => {
    if (activeTab === 'All') return vulnerabilities;
    if (activeTab === 'OWASP Top 10') return vulnerabilities.filter((item) => item.category === 'OWASP Top 10');
    return vulnerabilities.filter((item) => item.severity?.toLowerCase() === activeTab.toLowerCase());
  }, [activeTab, vulnerabilities]);

  return (
    <GlassCard className="p-6">
      <SectionHeader
        eyebrow="Findings"
        title="Discovered Vulnerabilities"
        description="Investigate exposed endpoints, severity, and remediation actions."
      />

      <div className="mt-5 flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={
              activeTab === tab
                ? 'rounded-full bg-cyan-400/10 px-4 py-2 text-sm text-cyan-300 ring-1 ring-cyan-400/20'
                : 'rounded-full bg-white/5 px-4 py-2 text-sm text-slate-300'
            }
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-slate-400">
            <tr className="border-b border-white/10">
              <th className="pb-3">Vulnerability Name</th>
              <th className="pb-3">Target Endpoint</th>
              <th className="pb-3">CVE/Type</th>
              <th className="pb-3">Severity</th>
              <th className="pb-3">CVSS</th>
              <th className="pb-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => (
              <tr key={`${item.name}-${item.endpoint}`} className="border-b border-white/5 text-slate-200">
                <td className="py-4">{item.name}</td>
                <td className="py-4 font-mono text-xs text-cyan-300">{item.endpoint}</td>
                <td className="py-4">{item.type}</td>
                <td className="py-4">
                  <StatusBadge label={item.severity} state={item.severity?.toLowerCase() === 'critical' ? 'critical' : 'healthy'} />
                </td>
                <td className="py-4">{item.cvss}</td>
                <td className="py-4">
                  <div className="flex gap-2">
                    <button className="rounded-xl bg-white/5 px-3 py-2 text-xs text-slate-200">View Details</button>
                    <button className="rounded-xl bg-cyan-400/10 px-3 py-2 text-xs text-cyan-300">Remediate</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 ? <p className="py-10 text-center text-sm text-slate-500">No vulnerabilities in this filter yet.</p> : null}
      </div>
    </GlassCard>
  );
}
