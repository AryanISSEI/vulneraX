import React from 'react';
import { Lock, ShieldCheck, ShieldAlert, CheckCircle2, XCircle } from 'lucide-react';
import GlassCard from './ui/GlassCard';
import SectionHeader from './ui/SectionHeader';

export default function SSLPanel({ ssl }) {
  if (!ssl || (!ssl.tls_version && !ssl.days_remaining && (!ssl.issues || ssl.issues.length === 0))) {
    return (
      <GlassCard className="p-6">
        <SectionHeader title="SSL / TLS Protection" icon={Lock} />
        <div className="mt-4 p-4 rounded-xl bg-destructive/10 border border-destructive/20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <XCircle className="h-5 w-5 text-destructive shrink-0" />
            <div>
              <span className="font-bold text-sm text-foreground block">Unencrypted Connection</span>
              <span className="text-xs text-muted-foreground">HTTP (Plaintext data transmission)</span>
            </div>
          </div>
          <span className="px-3 py-1 rounded-full text-xs font-mono font-bold bg-destructive/20 text-destructive border border-destructive/30 uppercase">
            Unprotected
          </span>
        </div>
      </GlassCard>
    );
  }

  const isEncrypted = Boolean(ssl.tls_version || ssl.days_remaining > 0 || (ssl.issues && ssl.issues.length === 0));
  const hasIssues = Boolean(ssl.issues && ssl.issues.length > 0) || Boolean(ssl.weak_cipher);
  const isProtected = isEncrypted && !hasIssues && (ssl.days_remaining > 0 || ssl.days_remaining === undefined || ssl.days_remaining === null);

  return (
    <GlassCard className="p-6">
      <SectionHeader title="SSL / TLS Protection" icon={Lock} />

      <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Encryption Status Tile */}
        <div className="p-4 rounded-xl bg-card border border-border flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            {isEncrypted ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
            ) : (
              <XCircle className="h-5 w-5 text-destructive shrink-0" />
            )}
            <div>
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-muted-foreground block">
                Data Encryption
              </span>
              <span className="text-sm font-bold text-foreground block">
                {isEncrypted ? 'Encrypted (HTTPS)' : 'Unencrypted (HTTP)'}
              </span>
            </div>
          </div>
          <span className={`px-2.5 py-1 rounded-lg text-xs font-mono font-semibold ${
            isEncrypted ? 'bg-emerald-500/10 text-emerald-500' : 'bg-destructive/10 text-destructive'
          }`}>
            {ssl.tls_version || (isEncrypted ? 'TLS' : 'HTTP')}
          </span>
        </div>

        {/* Protection Status Tile */}
        <div className="p-4 rounded-xl bg-card border border-border flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            {isProtected ? (
              <ShieldCheck className="h-5 w-5 text-emerald-500 shrink-0" />
            ) : (
              <ShieldAlert className="h-5 w-5 text-amber-500 shrink-0" />
            )}
            <div>
              <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-muted-foreground block">
                Protection Status
              </span>
              <span className="text-sm font-bold text-foreground block">
                {isProtected ? 'Protected & Secure' : hasIssues ? 'Security Warning' : 'At Risk'}
              </span>
            </div>
          </div>
          <span className={`px-2.5 py-1 rounded-lg text-xs font-mono font-semibold ${
            isProtected ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'
          }`}>
            {isProtected ? 'Protected' : 'Warning'}
          </span>
        </div>
      </div>
    </GlassCard>
  );
}
