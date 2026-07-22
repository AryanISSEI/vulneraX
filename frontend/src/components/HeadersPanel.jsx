import { ShieldCheck, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { headerStatusColor } from '../utils/helpers';

export default function HeadersPanel({ headers }) {
  if (!headers || headers.length === 0) {
    return (
      <div className="glass-panel p-6 sm:p-8 animate-fade-in">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-primary/10">
            <ShieldCheck className="h-5 w-5 text-accent-primary" />
          </div>
          <h3 className="font-semibold text-text-primary">Security Headers</h3>
        </div>
        <p className="text-sm text-text-muted">No header data available.</p>
      </div>
    );
  }

  const presentCount = headers.filter((h) => h.present).length;
  const weakCount = headers.filter((h) => h.present && h.severity === 'medium').length;
  const missingCount = headers.filter((h) => !h.present).length;

  return (
    <div className="glass-panel p-6 sm:p-8 animate-fade-in">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-primary/10">
            <ShieldCheck className="h-5 w-5 text-accent-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-text-primary">Security Headers</h3>
            <p className="text-xs text-text-muted">{presentCount} present · {weakCount} weak · {missingCount} missing</p>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {headers.map((header, i) => {
          const isWeak = header.present && header.severity === 'medium';
          const status = headerStatusColor(header.present, isWeak);
          const StatusIcon = header.present
            ? (isWeak ? AlertTriangle : CheckCircle2)
            : XCircle;

          return (
            <div
              key={`${header.name}-${i}`}
              className={`flex items-center justify-between rounded-xl px-4 py-3 ${status.bg} border border-transparent hover:border-border-default transition-all group`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <StatusIcon className={`h-4 w-4 shrink-0 ${status.color}`} />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text-primary">{header.name}</p>
                  {header.value && (
                    <p className="text-xs text-text-muted font-mono truncate max-w-[300px]" title={header.value}>
                      {header.value}
                    </p>
                  )}
                </div>
              </div>
              <span className={`shrink-0 ml-3 text-xs font-semibold px-2.5 py-1 rounded-full ${status.bg} ${status.color}`}>
                {status.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
