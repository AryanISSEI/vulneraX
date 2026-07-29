import React from 'react';
import { Shield, Sparkles } from 'lucide-react';
import { useState } from 'react';

const modes = ['Quick Port Scan', 'Full Vulnerability Audit', 'AI Threat Prediction'];

export default function HeaderScanBar({ onScan, isScanning }) {
  const [target, setTarget] = useState('');
  const [mode, setMode] = useState(modes[1]);
  const [authorized, setAuthorized] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = (event) => {
    event.preventDefault();

    if (!target.trim()) {
      setError('Enter a target IP or domain before starting an assessment.');
      return;
    }

    if (!authorized) {
      setError('Explicit authorization is required before starting an assessment.');
      return;
    }

    setError('');
    onScan({ target: target.trim(), mode });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-300">Command Center</p>
          <h1 className="mt-2 text-3xl font-semibold text-white">AI-Powered Security Assessment Platform</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">
            Launch scans, monitor assessment progress, review vulnerabilities, and export actionable reports from one
            high-signal workspace.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="rounded-[28px] border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
        <div className="grid gap-3 xl:grid-cols-[1fr_240px_auto]">
          <input
            type="text"
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            placeholder="Enter IP or Domain, e.g., target.example.com"
            className="h-14 rounded-2xl border border-white/10 bg-slate-950/70 px-4 text-sm text-white outline-none ring-0 placeholder:text-slate-500"
            disabled={isScanning}
          />

          <select
            value={mode}
            onChange={(event) => setMode(event.target.value)}
            className="h-14 rounded-2xl border border-white/10 bg-slate-950/70 px-4 text-sm text-slate-200 outline-none"
            disabled={isScanning}
          >
            {modes.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>

          <button
            type="submit"
            disabled={isScanning}
            className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-red-600 px-6 text-sm font-semibold text-slate-950 shadow-[0_0_30px_rgba(220,38,38,0.25)] transition hover:bg-red-500 disabled:opacity-60"
          >
            {isScanning ? <Sparkles className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
            {isScanning ? 'Assessing...' : 'Start Assessment'}
          </button>
        </div>

        <label className="mt-4 flex items-start gap-3 text-sm text-slate-400">
          <input type="checkbox" checked={authorized} onChange={(event) => setAuthorized(event.target.checked)} />
          I confirm I have explicit authorization to assess this target.
        </label>

        {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}
      </form>
    </div>
  );
}
