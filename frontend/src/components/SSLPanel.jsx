import { Lock, CheckCircle2, AlertTriangle, XCircle, Clock } from 'lucide-react';

export default function SSLPanel({ ssl }) {
  if (!ssl) {
    return (
      <div className="glass-panel p-6 sm:p-8 animate-fade-in">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-emerald/10">
            <Lock className="h-5 w-5 text-accent-emerald" />
          </div>
          <h3 className="font-semibold text-text-primary">SSL / TLS</h3>
        </div>
        <p className="text-sm text-text-muted">No SSL data available.</p>
      </div>
    );
  }

  const hasIssues = ssl.issues && ssl.issues.length > 0;
  const daysColor = ssl.days_remaining > 60 ? 'text-accent-emerald' : ssl.days_remaining > 30 ? 'text-severity-medium' : 'text-severity-critical';

  const fields = [
    { label: 'TLS Version', value: ssl.tls_version || '—' },
    { label: 'Cipher', value: ssl.cipher_name || '—' },
    { label: 'Issuer', value: ssl.issuer || '—' },
    { label: 'Subject', value: ssl.subject || '—' },
    { label: 'Expires', value: ssl.expires || '—' },
    { label: 'Serial', value: ssl.serial_number || '—' },
  ];

  return (
    <div className="glass-panel p-6 sm:p-8 animate-fade-in">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-emerald/10">
            <Lock className="h-5 w-5 text-accent-emerald" />
          </div>
          <div>
            <h3 className="font-semibold text-text-primary">SSL / TLS</h3>
            <p className="text-xs text-text-muted">{ssl.tls_version || 'Unknown version'}</p>
          </div>
        </div>
        {ssl.days_remaining > 0 && (
          <div className={`flex items-center gap-1.5 text-sm font-semibold ${daysColor}`}>
            <Clock className="h-4 w-4" />
            {ssl.days_remaining}d remaining
          </div>
        )}
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        {fields.map((f) => (
          <div key={f.label} className="rounded-lg bg-bg-card/60 px-3 py-2">
            <p className="text-[10px] font-medium text-text-muted uppercase tracking-wider mb-0.5">{f.label}</p>
            <p className="text-xs font-medium text-text-primary font-mono truncate" title={f.value}>{f.value}</p>
          </div>
        ))}
      </div>

      {/* Weak cipher warning */}
      {ssl.weak_cipher && (
        <div className="flex items-center gap-2 rounded-lg bg-severity-critical/10 border border-severity-critical/20 px-3 py-2 text-xs text-severity-critical mb-3">
          <XCircle className="h-4 w-4 shrink-0" />
          Weak cipher detected: {ssl.cipher_name}
        </div>
      )}

      {/* Issues */}
      {hasIssues && (
        <div className="space-y-1.5">
          {ssl.issues.map((issue, i) => (
            <div key={i} className="flex items-center gap-2 text-xs text-severity-medium">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              {issue}
            </div>
          ))}
        </div>
      )}

      {!hasIssues && !ssl.weak_cipher && ssl.tls_version && (
        <div className="flex items-center gap-2 text-xs text-accent-emerald">
          <CheckCircle2 className="h-3.5 w-3.5" />
          No SSL issues detected
        </div>
      )}
    </div>
  );
}
