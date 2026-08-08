import React from 'react';
import { Lock, ShieldCheck, ShieldAlert, CheckCircle2, XCircle, AlertTriangle, KeyRound, Clock, Globe, Shield } from 'lucide-react';
import GlassCard from './ui/GlassCard';
import SectionHeader from './ui/SectionHeader';

export default function SSLPanel({ ssl }) {
  if (!ssl || (!ssl.tls_version && !ssl.days_remaining && (!ssl.issues || ssl.issues.length === 0))) {
    return (
      <GlassCard className="p-6 sm:p-8 flex flex-col space-y-5 relative overflow-hidden">
        <SectionHeader
          title="SSL / TLS Data Protection"
          subtitle="Verification of network encryption and data transit security."
          icon={Lock}
        />
        <div className="p-6 rounded-2xl bg-destructive/10 border border-destructive/30 flex items-center gap-4 text-destructive shadow-sm">
          <div className="p-3 rounded-xl bg-destructive/20 text-destructive border border-destructive/40 shrink-0">
            <XCircle className="h-7 w-7" />
          </div>
          <div>
            <div className="text-xs font-mono font-bold uppercase tracking-widest text-destructive/80">Protection Alert</div>
            <h3 className="font-bold text-base text-foreground mt-0.5">Unencrypted Connection (HTTP)</h3>
            <p className="text-xs text-muted-foreground mt-1">
              No active SSL/TLS certificate detected. Data in transit is transmitted in plaintext and exposed to network eavesdropping.
            </p>
          </div>
        </div>
      </GlassCard>
    );
  }

  const isEncrypted = Boolean(ssl.tls_version || ssl.days_remaining > 0 || (ssl.issues && ssl.issues.length === 0));
  const hasIssues = Boolean(ssl.issues && ssl.issues.length > 0) || Boolean(ssl.weak_cipher);
  const isProtected = isEncrypted && !hasIssues && (ssl.days_remaining > 0 || ssl.days_remaining === undefined || ssl.days_remaining === null);

  const daysRemaining = ssl.days_remaining || 0;
  const daysPercentage = Math.min(100, Math.max(0, Math.round((daysRemaining / 90) * 100)));

  return (
    <GlassCard className="p-6 sm:p-8 flex flex-col space-y-6 relative overflow-hidden">
      <SectionHeader
        title="SSL / TLS Data Protection"
        subtitle="Verification of network encryption, protocol strength, and data transit security."
        icon={Lock}
      />

      {/* Main Status Hero Banner */}
      <div className={`p-6 sm:p-7 rounded-2xl border relative overflow-hidden transition-all shadow-md ${
        isProtected
          ? 'bg-emerald-500/10 border-emerald-500/30'
          : isEncrypted
          ? 'bg-amber-500/10 border-amber-500/30'
          : 'bg-destructive/10 border-destructive/30'
      }`}>
        <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            <div className={`p-3.5 rounded-2xl border shadow-inner ${
              isProtected
                ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.3)]'
                : isEncrypted
                ? 'bg-amber-500/20 border-amber-500/40 text-amber-500 shadow-[0_0_20px_rgba(245,158,11,0.3)]'
                : 'bg-destructive/20 border-destructive/40 text-destructive shadow-[0_0_20px_rgba(239,68,68,0.3)]'
            }`}>
              {isProtected ? (
                <ShieldCheck className="h-9 w-9 animate-pulse" />
              ) : (
                <ShieldAlert className="h-9 w-9 animate-pulse" />
              )}
            </div>
            <div>
              <div className="text-[11px] font-mono font-bold uppercase tracking-widest opacity-80">
                Overall Data Security Status
              </div>
              <h2 className="text-2xl font-extrabold tracking-tight text-foreground mt-0.5 flex items-center gap-2">
                {isProtected ? 'DATA ENCRYPTED & PROTECTED' : isEncrypted ? 'ENCRYPTED WITH WARNINGS' : 'UNENCRYPTED / AT RISK'}
              </h2>
              <p className="text-xs text-muted-foreground mt-1 max-w-lg leading-relaxed">
                {isProtected
                  ? 'All network traffic between user browsers and backend servers is encrypted over secure HTTPS / TLS channels.'
                  : isEncrypted
                  ? 'Connection is encrypted over TLS, but security configuration warnings or weak ciphers were detected.'
                  : 'Connection lacks SSL/TLS encryption. Sensitive information is transmitted in unencrypted plaintext.'}
              </p>
            </div>
          </div>

          <div className="flex flex-col items-end gap-1.5 shrink-0 self-start sm:self-center">
            <span className={`px-4 py-2 rounded-xl text-xs font-mono font-bold tracking-wider uppercase border shadow-sm ${
              isProtected
                ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                : isEncrypted
                ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 border-amber-500/30'
                : 'bg-destructive/20 text-destructive border-destructive/30'
            }`}>
              {isProtected ? 'Protected' : isEncrypted ? 'Warning' : 'Exposed'}
            </span>
            <span className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
              {ssl.tls_version || 'TLS Protocol'}
            </span>
          </div>
        </div>
      </div>

      {/* Visual Encryption Pipeline Diagram */}
      <div className="p-4 rounded-xl bg-card border border-border/80 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
          <Globe className="h-4 w-4 text-primary" />
          <span>User Client</span>
        </div>
        <div className="flex-1 flex items-center gap-2 w-full sm:w-auto">
          <div className="h-0.5 flex-1 bg-border" />
          <div className={`px-3 py-1 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider border flex items-center gap-1.5 ${
            isProtected
              ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
              : 'bg-amber-500/10 text-amber-500 border-amber-500/20'
          }`}>
            <Lock className="h-3 w-3" />
            <span>{isEncrypted ? `${ssl.tls_version || 'TLS'} Encrypted Tunnel` : 'Plaintext Tunnel'}</span>
          </div>
          <div className="h-0.5 flex-1 bg-border" />
        </div>
        <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
          <Shield className="h-4 w-4 text-primary" />
          <span>Web Server</span>
        </div>
      </div>

      {/* 3 Premium Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Encryption Status */}
        <div className="p-5 rounded-2xl bg-card border border-border flex flex-col justify-between space-y-3 shadow-sm hover:border-primary/40 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-muted-foreground">
              Encryption Status
            </span>
            <div className={`p-2 rounded-xl ${isEncrypted ? 'bg-emerald-500/10 text-emerald-500' : 'bg-destructive/10 text-destructive'}`}>
              <KeyRound className="h-4 w-4" />
            </div>
          </div>
          <div>
            <div className="text-lg font-extrabold text-foreground flex items-center gap-2">
              {isEncrypted ? 'HTTPS Encrypted' : 'Plaintext HTTP'}
              {isEncrypted ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-destructive" />}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {isEncrypted ? `Protected using ${ssl.tls_version || 'modern TLS'}` : 'Unencrypted network connection'}
            </p>
          </div>
        </div>

        {/* Card 2: Security & Integrity */}
        <div className="p-5 rounded-2xl bg-card border border-border flex flex-col justify-between space-y-3 shadow-sm hover:border-primary/40 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-muted-foreground">
              Security Strength
            </span>
            <div className={`p-2 rounded-xl ${isProtected ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'}`}>
              <ShieldCheck className="h-4 w-4" />
            </div>
          </div>
          <div>
            <div className="text-lg font-extrabold text-foreground">
              {isProtected ? 'High Security' : hasIssues ? 'Warnings Found' : 'No Protection'}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {hasIssues ? 'Weak ciphers or certificate warnings detected' : 'Full compliance with security baselines'}
            </p>
          </div>
        </div>

        {/* Card 3: Certificate Lifetime */}
        <div className="p-5 rounded-2xl bg-card border border-border flex flex-col justify-between space-y-3 shadow-sm hover:border-primary/40 transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-muted-foreground">
              Certificate Health
            </span>
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div>
            <div className="text-lg font-extrabold text-foreground flex items-center justify-between">
              <span>{daysRemaining > 0 ? `${daysRemaining} Days` : 'Active'}</span>
              <span className="text-xs font-mono text-muted-foreground">{daysRemaining > 0 ? 'Valid' : 'Checked'}</span>
            </div>
            {daysRemaining > 0 && (
              <div className="mt-2 w-full h-1.5 rounded-full bg-muted overflow-hidden">
                <div 
                  className={`h-full rounded-full transition-all duration-500 ${
                    daysRemaining > 45 ? 'bg-emerald-500' : daysRemaining > 15 ? 'bg-amber-500' : 'bg-destructive'
                  }`} 
                  style={{ width: `${daysPercentage}%` }}
                />
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-1.5 truncate" title={ssl.issuer ? `Issuer: ${ssl.issuer}` : 'SSL Certificate Active'}>
              {ssl.issuer ? `Issuer: ${ssl.issuer}` : 'SSL Certificate Verified'}
            </p>
          </div>
        </div>
      </div>

      {/* Warnings & Security Issues Banner */}
      {(ssl.weak_cipher || (ssl.issues && ssl.issues.length > 0)) && (
        <div className="p-4 sm:p-5 rounded-2xl bg-amber-500/10 border border-amber-500/20 space-y-2.5 shadow-sm">
          <span className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Security Warnings & Recommendations:
          </span>
          <ul className="text-xs text-muted-foreground space-y-1.5 list-disc list-inside pl-1">
            {ssl.weak_cipher && <li>Weak cipher algorithm detected ({ssl.cipher_name || 'Legacy Cipher'}). Upgrade web server to AES-256 GCM or ChaCha20.</li>}
            {ssl.issues?.map((issue, idx) => (
              <li key={idx}>{issue}</li>
            ))}
          </ul>
        </div>
      )}
    </GlassCard>
  );
}
