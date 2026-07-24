import React from 'react';
import { Loader2, CheckCircle2, Zap } from 'lucide-react';

const PHASES = [
  'DNS Lookup',
  'Port Scanning',
  'Fingerprinting',
  'Checking Headers',
  'Analyzing Cookies',
  'SSL Scan',
  'Crawling Website',
  'Testing Vulnerabilities',
  'Calculating Risk Score',
];

export default function ScanProgress({ status, currentPhase }) {
  if (!status || status === 'completed' || status === 'error') return null;

  const currentIndex = PHASES.findIndex(
    (p) => currentPhase?.toLowerCase().includes(p.toLowerCase())
  );

  return (
    <div className="glass-panel p-6 sm:p-8 animate-fade-in">
      <div className="flex items-center gap-3 mb-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-cyan/15">
          <Zap className="h-5 w-5 text-accent-cyan animate-pulse" />
        </div>
        <div>
          <h3 className="font-semibold text-text-primary">Scan in Progress</h3>
          <p className="text-xs text-text-secondary">
            {currentPhase || 'Initializing...'}
          </p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mb-5 h-1.5 rounded-full bg-bg-input overflow-hidden">
        <div
          className="h-full rounded-full bg-gradient-to-r from-accent-primary via-accent-cyan to-accent-emerald transition-all duration-700 ease-out"
          style={{ width: `${Math.max(((currentIndex + 1) / PHASES.length) * 100, 5)}%` }}
        />
      </div>

      {/* Phase list */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {PHASES.map((phase, i) => {
          let Icon, color, bgColor;
          if (i < currentIndex) {
            Icon = CheckCircle2;
            color = 'text-accent-emerald';
            bgColor = 'bg-accent-emerald/10';
          } else if (i === currentIndex) {
            Icon = Loader2;
            color = 'text-accent-cyan';
            bgColor = 'bg-accent-cyan/10';
          } else {
            Icon = null;
            color = 'text-text-muted';
            bgColor = 'bg-bg-input/50';
          }

          return (
            <div
              key={phase}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium ${color} ${bgColor} transition-all duration-300`}
            >
              {Icon ? (
                <Icon className={`h-3.5 w-3.5 shrink-0 ${i === currentIndex ? 'animate-spin' : ''}`} />
              ) : (
                <div className="h-3.5 w-3.5 shrink-0 rounded-full border border-text-muted/30" />
              )}
              {phase}
            </div>
          );
        })}
      </div>
    </div>
  );
}
