import { Network, Wifi } from 'lucide-react';

export default function PortTable({ ports }) {
  if (!ports || ports.length === 0) {
    return (
      <div className="glass-panel p-6 sm:p-8 animate-fade-in">
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-severity-medium/10">
            <Network className="h-5 w-5 text-severity-medium" />
          </div>
          <h3 className="font-semibold text-text-primary">Open Ports</h3>
        </div>
        <p className="text-sm text-text-muted">No open ports detected.</p>
      </div>
    );
  }

  return (
    <div className="glass-panel p-6 sm:p-8 animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-severity-medium/10">
            <Network className="h-5 w-5 text-severity-medium" />
          </div>
          <div>
            <h3 className="font-semibold text-text-primary">Open Ports</h3>
            <p className="text-xs text-text-muted">{ports.length} port{ports.length !== 1 ? 's' : ''} detected</p>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-default text-left">
              <th className="pb-3 pr-4 font-medium text-text-muted text-xs uppercase tracking-wider">Port</th>
              <th className="pb-3 pr-4 font-medium text-text-muted text-xs uppercase tracking-wider">Service</th>
              <th className="pb-3 pr-4 font-medium text-text-muted text-xs uppercase tracking-wider">State</th>
              <th className="pb-3 pr-4 font-medium text-text-muted text-xs uppercase tracking-wider">Banner</th>
              <th className="pb-3 font-medium text-text-muted text-xs uppercase tracking-wider">Response</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-default/50">
            {ports.map((port, i) => (
              <tr key={`${port.port}-${i}`} className="group hover:bg-bg-card/50 transition-colors">
                <td className="py-3 pr-4">
                  <span className="font-mono font-semibold text-accent-primary">{port.port}</span>
                </td>
                <td className="py-3 pr-4">
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-bg-card px-2 py-0.5 text-xs font-medium text-text-primary">
                    <Wifi className="h-3 w-3 text-accent-cyan" />
                    {port.service || 'unknown'}
                  </span>
                </td>
                <td className="py-3 pr-4">
                  <span className="inline-flex items-center gap-1 rounded-full bg-accent-emerald/10 px-2.5 py-0.5 text-xs font-medium text-accent-emerald">
                    <span className="h-1.5 w-1.5 rounded-full bg-accent-emerald animate-pulse" />
                    {port.state}
                  </span>
                </td>
                <td className="py-3 pr-4">
                  <span className="font-mono text-xs text-text-secondary truncate max-w-[200px] block" title={port.banner}>
                    {port.banner || '—'}
                  </span>
                </td>
                <td className="py-3">
                  <span className="text-xs text-text-muted">
                    {port.response_time_ms ? `${port.response_time_ms}ms` : '—'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
