import { Shield, History, PlusSquare } from 'lucide-react';
import { NavLink, Link } from 'react-router-dom';

export default function Sidebar() {
  return (
    <div className="w-64 border-r border-border-default bg-bg-primary h-full flex flex-col pt-6 shrink-0 relative z-10">
      {/* Brand */}
      <div className="px-6 mb-10 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-sm bg-accent-primary/10 border border-accent-primary/20">
          <Shield className="h-6 w-6 text-accent-primary" />
        </div>
        <span className="text-2xl font-bold tracking-tighter text-text-primary uppercase" style={{ textShadow: '1px 1px 0px var(--color-accent-primary)' }}>
          VulneraX
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 space-y-2">
        <NavLink
          to="/"
          className={({ isActive }) =>
            `flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors border-l-2 ${
              isActive
                ? 'border-accent-primary bg-bg-card text-accent-primary'
                : 'border-transparent text-text-secondary hover:bg-bg-card/50 hover:text-text-primary'
            }`
          }
        >
          <PlusSquare className="h-4 w-4" />
          New Scan
        </NavLink>

        <NavLink
          to="/history"
          className={({ isActive }) =>
            `flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors border-l-2 ${
              isActive
                ? 'border-accent-primary bg-bg-card text-accent-primary'
                : 'border-transparent text-text-secondary hover:bg-bg-card/50 hover:text-text-primary'
            }`
          }
        >
          <History className="h-4 w-4" />
          History
        </NavLink>
      </nav>

      {/* Footer / Status */}
      <div className="p-6 border-t border-border-default mt-auto">
        <div className="flex items-center gap-3">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent-primary opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-accent-primary"></span>
          </span>
          <span className="text-xs font-mono text-text-muted">SYSTEM ONLINE</span>
        </div>
        <p className="text-[10px] text-text-muted mt-2 font-mono">v2.0.0-cyber</p>
      </div>
    </div>
  );
}
