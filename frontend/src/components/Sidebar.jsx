import React from 'react';
import {
  Activity,
  BrainCircuit,
  FileText,
  Radar,
  ScanSearch,
  Settings,
  Shield,
  Siren,
} from 'lucide-react';
import { NavLink } from 'react-router-dom';
import StatusBadge from './ui/StatusBadge';

const navItems = [
  { to: '/', label: 'Dashboard', icon: Activity, end: true },
  { to: '/new-scan', label: 'New Scan', icon: ScanSearch },
  { to: '/target-assets', label: 'Target Assets', icon: Radar },
  { to: '/vulnerabilities', label: 'Vulnerabilities', icon: Siren },
  { to: '/threat-predictions', label: 'Threat Predictions', icon: BrainCircuit },
  { to: '/reports', label: 'Reports', icon: FileText },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export default function Sidebar() {
  return (
    <aside className="w-full max-w-[280px] shrink-0">
      <div className="sticky top-6 h-[calc(100vh-3rem)] rounded-[28px] border border-white/10 bg-slate-950/80 p-5 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl bg-cyan-400/10 p-3 text-cyan-300 ring-1 ring-cyan-400/20">
            <Shield className="h-6 w-6" />
          </div>
          <div>
            <p className="text-lg font-semibold text-white">VulneraX</p>
            <p className="text-[10px] uppercase tracking-widest text-slate-400">AI Security Platform</p>
          </div>
        </div>

        <nav className="mt-10 space-y-2">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-2xl px-4 py-3 text-sm transition ${
                  isActive
                    ? 'bg-cyan-400/10 text-cyan-300 ring-1 ring-cyan-400/25'
                    : 'text-slate-300 hover:bg-white/5 hover:text-white'
                }`
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-10">
          <StatusBadge label="System Operational" state="healthy" />
        </div>
      </div>
    </aside>
  );
}
