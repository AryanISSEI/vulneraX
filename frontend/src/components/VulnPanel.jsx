import { useState } from 'react';
import { Bug, ChevronDown, ChevronUp, AlertTriangle, AlertOctagon, Info, ShieldAlert } from 'lucide-react';
import { severityColor, severityOrder } from '../utils/helpers';

export default function VulnPanel({ vulnerabilities }) {
  const [expandedIndex, setExpandedIndex] = useState(null);

  if (!vulnerabilities || vulnerabilities.length === 0) {
    return (
      <div className="glass-panel p-6 sm:p-8 animate-fade-in">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-emerald/10">
            <Bug className="h-5 w-5 text-accent-emerald" />
          </div>
          <div>
            <h3 className="font-semibold text-text-primary">Vulnerabilities</h3>
            <p className="text-xs text-text-muted">No vulnerabilities detected</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm text-accent-emerald bg-accent-emerald/10 rounded-lg px-4 py-3">
          <ShieldAlert className="h-4 w-4" />
          No security vulnerabilities were found during this scan.
        </div>
      </div>
    );
  }

  // Sort by severity
  const sorted = [...vulnerabilities].sort(
    (a, b) => (severityOrder[a.severity] ?? 4) - (severityOrder[b.severity] ?? 4)
  );

  const severityIcon = (sev) => {
    switch (sev?.toLowerCase()) {
      case 'critical': return AlertOctagon;
      case 'high': return AlertTriangle;
      case 'medium': return AlertTriangle;
      case 'low': return Info;
      default: return Info;
    }
  };

  return (
    <div className="glass-panel p-6 sm:p-8 animate-fade-in">
      <div className="flex items-center gap-3 mb-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-severity-critical/10">
          <Bug className="h-5 w-5 text-severity-critical" />
        </div>
        <div>
          <h3 className="font-semibold text-text-primary">Vulnerabilities</h3>
          <p className="text-xs text-text-muted">{vulnerabilities.length} finding{vulnerabilities.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      <div className="space-y-2">
        {sorted.map((vuln, i) => {
          const colors = severityColor(vuln.severity);
          const SevIcon = severityIcon(vuln.severity);
          const isExpanded = expandedIndex === i;

          return (
            <div
              key={i}
              className={`rounded-xl border ${colors.border} ${colors.bg} transition-all`}
            >
              <button
                className="w-full flex items-center justify-between px-4 py-3 text-left"
                onClick={() => setExpandedIndex(isExpanded ? null : i)}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <SevIcon className={`h-4 w-4 shrink-0 ${colors.text}`} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-text-primary">{vuln.name}</p>
                    <p className="text-xs text-text-muted">{vuln.category}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-3">
                  <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${colors.bg} ${colors.text}`}>
                    {vuln.severity}
                  </span>
                  {isExpanded ? (
                    <ChevronUp className="h-4 w-4 text-text-muted" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-text-muted" />
                  )}
                </div>
              </button>

              {isExpanded && (
                <div className="px-4 pb-4 space-y-2 animate-fade-in">
                  {vuln.url && (
                    <div>
                      <span className="text-[10px] font-medium text-text-muted uppercase">URL</span>
                      <p className="text-xs font-mono text-accent-cyan break-all">{vuln.url}</p>
                    </div>
                  )}
                  {vuln.payload && (
                    <div>
                      <span className="text-[10px] font-medium text-text-muted uppercase">Payload</span>
                      <p className="text-xs font-mono text-severity-medium bg-bg-input rounded px-2 py-1 break-all">{vuln.payload}</p>
                    </div>
                  )}
                  {vuln.evidence && (
                    <div>
                      <span className="text-[10px] font-medium text-text-muted uppercase">Evidence</span>
                      <p className="text-xs text-text-secondary">{vuln.evidence}</p>
                    </div>
                  )}
                  {vuln.description && (
                    <div>
                      <span className="text-[10px] font-medium text-text-muted uppercase">Description</span>
                      <p className="text-xs text-text-secondary">{vuln.description}</p>
                    </div>
                  )}
                  {vuln.recommendation && (
                    <div className="bg-accent-emerald/5 border border-accent-emerald/10 rounded-lg px-3 py-2">
                      <span className="text-[10px] font-medium text-accent-emerald uppercase">Recommendation</span>
                      <p className="text-xs text-text-primary">{vuln.recommendation}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
