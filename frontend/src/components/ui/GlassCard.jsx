import React from 'react';

export default function GlassCard({ className = '', tone = 'default', children }) {
  const toneClass =
    tone === 'ai'
      ? 'border-violet-400/30 bg-violet-500/5 shadow-[0_0_40px_rgba(139,92,246,0.08)]'
      : tone === 'critical'
      ? 'border-rose-400/30 bg-rose-500/5'
      : 'border-white/10 bg-white/5';

  return (
    <section className={`rounded-3xl border backdrop-blur-xl ${toneClass} ${className}`}>
      {children}
    </section>
  );
}
