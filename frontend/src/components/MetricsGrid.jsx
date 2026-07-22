import React from 'react';
import { Activity, ShieldCheck, ShieldX, Siren } from 'lucide-react';
import MetricTile from './ui/MetricTile';
import StatusBadge from './ui/StatusBadge';

export default function MetricsGrid({ riskScore, riskLabel, severityCounts, activeScans, healthScore }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <MetricTile icon={ShieldX} label="Overall Risk Score" value={`${riskScore}/100`} hint={riskLabel} tone={riskScore >= 80 ? 'critical' : 'default'} />
      <MetricTile icon={Siren} label="Vulnerabilities" value={Object.values(severityCounts).reduce((sum, value) => sum + value, 0)} hint="Critical to low severity">
        <div className="mt-4 flex flex-wrap gap-2">
          <StatusBadge label={`Critical ${severityCounts.critical || 0}`} state="critical" />
          <StatusBadge label={`High ${severityCounts.high || 0}`} state="critical" />
          <StatusBadge label={`Medium ${severityCounts.medium || 0}`} state="healthy" />
          <StatusBadge label={`Low ${severityCounts.low || 0}`} state="healthy" />
        </div>
      </MetricTile>
      <MetricTile icon={Activity} label="Active Scans" value={activeScans} hint="Running assessments across the platform" />
      <MetricTile icon={ShieldCheck} label="Security Health" value={`${healthScore}%`} hint="Composite resilience score" tone="ai" />
    </div>
  );
}
