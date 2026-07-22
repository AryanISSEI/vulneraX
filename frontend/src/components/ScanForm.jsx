import { useState } from 'react';
import { Search, Shield, AlertTriangle, Loader2 } from 'lucide-react';

export default function ScanForm({ onScan, isScanning }) {
  const [target, setTarget] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    setError('');

    const cleaned = target.trim();
    if (!cleaned) {
      setError('Please enter a target domain or IP address.');
      return;
    }
    if (!agreed) {
      setError('You must confirm you have authorization to scan this target.');
      return;
    }

    onScan(cleaned);
  };

  return (
    <div className="glass-panel p-8 sm:p-12 animate-fade-in">
      {/* Header */}
      <div className="mb-10 text-center">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-accent-primary/10 px-4 py-1.5 text-sm font-medium text-accent-primary">
          <Shield className="h-4 w-4" />
          Security Assessment
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold text-text-primary mb-2">
          Scan a Target
        </h1>
        <p className="text-text-secondary text-sm max-w-lg mx-auto">
          Enter a domain name or IP address to perform a comprehensive security assessment.
          The scan will check DNS, ports, headers, SSL, cookies, and test for common vulnerabilities.
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="max-w-2xl mx-auto space-y-6">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-text-muted" />
          <input
            id="scan-target-input"
            type="text"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="e.g. example.com or 192.168.1.1"
            disabled={isScanning}
            className="w-full rounded-xl bg-bg-input border border-border-default py-3.5 pl-12 pr-4 text-text-primary placeholder:text-text-muted focus:border-accent-primary focus:ring-2 focus:ring-accent-primary/20 focus:outline-none transition-all disabled:opacity-50 font-mono text-sm"
          />
        </div>

        {/* Authorization Disclaimer */}
        <label className="flex items-start gap-3 cursor-pointer group p-3 rounded-xl hover:bg-bg-card/50 transition-colors">
          <input
            id="auth-disclaimer-checkbox"
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            disabled={isScanning}
            className="mt-0.5 h-4 w-4 rounded border-border-default bg-bg-input text-accent-primary focus:ring-accent-primary/30 accent-accent-primary"
          />
          <span className="text-xs text-text-secondary leading-relaxed group-hover:text-text-primary transition-colors">
            <AlertTriangle className="inline h-3.5 w-3.5 text-severity-medium mr-1 -mt-0.5" />
            I confirm that I have <strong className="text-text-primary">explicit authorization</strong> to scan this target.
            Unauthorized scanning may be illegal. VulneraX is for authorized security testing only.
          </span>
        </label>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 rounded-lg bg-severity-critical/10 border border-severity-critical/20 px-4 py-2.5 text-sm text-severity-critical animate-fade-in">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Submit */}
        <button
          id="start-scan-button"
          type="submit"
          disabled={isScanning}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-accent-primary to-accent-secondary py-3.5 px-6 text-sm font-semibold text-white shadow-lg shadow-accent-primary/25 hover:shadow-accent-primary/40 hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
        >
          {isScanning ? (
            <>
              <Loader2 className="h-5 w-5 animate-spin" />
              Scanning...
            </>
          ) : (
            <>
              <Shield className="h-5 w-5" />
              Start Security Scan
            </>
          )}
        </button>
      </form>
    </div>
  );
}
