import { Cookie, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';

export default function CookiePanel({ cookies }) {
  if (!cookies || cookies.length === 0) {
    return (
      <div className="glass-panel p-6 sm:p-8 animate-fade-in">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-secondary/10">
            <Cookie className="h-5 w-5 text-accent-secondary" />
          </div>
          <h3 className="font-semibold text-text-primary">Cookies</h3>
        </div>
        <p className="text-sm text-text-muted">No cookies detected.</p>
      </div>
    );
  }

  return (
    <div className="glass-panel p-6 sm:p-8 animate-fade-in">
      <div className="flex items-center gap-3 mb-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-secondary/10">
          <Cookie className="h-5 w-5 text-accent-secondary" />
        </div>
        <div>
          <h3 className="font-semibold text-text-primary">Cookies</h3>
          <p className="text-xs text-text-muted">{cookies.length} cookie{cookies.length !== 1 ? 's' : ''} found</p>
        </div>
      </div>

      <div className="space-y-3">
        {cookies.map((cookie, i) => (
          <div key={`${cookie.name}-${i}`} className="rounded-xl bg-bg-card/60 border border-border-default/50 p-4 hover:border-border-glow transition-all">
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-sm font-semibold text-accent-primary">{cookie.name}</span>
              {cookie.issues?.length > 0 && (
                <span className="text-[10px] font-medium text-severity-medium bg-severity-medium/10 px-2 py-0.5 rounded-full">
                  {cookie.issues.length} issue{cookie.issues.length !== 1 ? 's' : ''}
                </span>
              )}
            </div>

            {/* Flags */}
            <div className="flex flex-wrap gap-2 mb-2">
              {[
                { label: 'HttpOnly', value: cookie.http_only },
                { label: 'Secure', value: cookie.secure },
                { label: 'SameSite', value: !!cookie.same_site, detail: cookie.same_site },
              ].map((flag) => (
                <span
                  key={flag.label}
                  className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md ${
                    flag.value
                      ? 'bg-accent-emerald/10 text-accent-emerald'
                      : 'bg-severity-critical/10 text-severity-critical'
                  }`}
                >
                  {flag.value ? (
                    <CheckCircle2 className="h-3 w-3" />
                  ) : (
                    <XCircle className="h-3 w-3" />
                  )}
                  {flag.label}
                  {flag.detail && `: ${flag.detail}`}
                </span>
              ))}
            </div>

            {/* Issues */}
            {cookie.issues?.length > 0 && (
              <div className="mt-2 space-y-1">
                {cookie.issues.map((issue, j) => (
                  <p key={j} className="text-xs text-severity-medium flex items-center gap-1.5">
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                    {issue}
                  </p>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
