import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { History as HistoryIcon, Search, Shield, ExternalLink, Loader2, RefreshCw } from 'lucide-react';
import { getScanHistory } from '../api/client';
import { formatTimestamp, riskScoreColor } from '../utils/helpers';

export default function History() {
  const [scans, setScans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const navigate = useNavigate();

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const { data } = await getScanHistory();
      setScans(data.scans || []);
    } catch (err) {
      console.error('Failed to fetch history:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const filtered = scans.filter((s) =>
    s.target.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
      <div className="glass-panel p-6 sm:p-8 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-secondary/10">
              <HistoryIcon className="h-5 w-5 text-accent-secondary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-text-primary">Scan History</h1>
              <p className="text-xs text-text-muted">{scans.length} scan{scans.length !== 1 ? 's' : ''} recorded</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter by target..."
                className="rounded-lg bg-bg-input border border-border-default py-2 pl-9 pr-4 text-sm text-text-primary placeholder:text-text-muted focus:border-accent-primary focus:ring-1 focus:ring-accent-primary/20 focus:outline-none transition-all w-60"
              />
            </div>
            <button
              onClick={fetchHistory}
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-bg-card hover:bg-bg-card-hover border border-border-default text-text-muted hover:text-text-primary transition-all"
              title="Refresh"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-8 w-8 text-accent-primary animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Shield className="h-12 w-12 text-text-muted mx-auto mb-3 opacity-30" />
            <p className="text-text-muted text-sm">
              {searchQuery ? 'No scans match your search.' : 'No scans yet. Run your first scan from the Dashboard.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-default text-left">
                  <th className="pb-3 pr-4 font-medium text-text-muted text-xs uppercase tracking-wider">Target</th>
                  <th className="pb-3 pr-4 font-medium text-text-muted text-xs uppercase tracking-wider">Date</th>
                  <th className="pb-3 pr-4 font-medium text-text-muted text-xs uppercase tracking-wider">Status</th>
                  <th className="pb-3 pr-4 font-medium text-text-muted text-xs uppercase tracking-wider">Risk Score</th>
                  <th className="pb-3 font-medium text-text-muted text-xs uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-default/50">
                {filtered.map((scan) => {
                  const scoreInfo = riskScoreColor(scan.risk_score);
                  return (
                    <tr key={scan.scan_id} className="group hover:bg-bg-card/50 transition-colors">
                      <td className="py-3.5 pr-4">
                        <span className="font-mono text-sm font-medium text-accent-cyan">{scan.target}</span>
                      </td>
                      <td className="py-3.5 pr-4 text-xs text-text-secondary">
                        {formatTimestamp(scan.timestamp)}
                      </td>
                      <td className="py-3.5 pr-4">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          scan.status === 'completed'
                            ? 'bg-accent-emerald/10 text-accent-emerald'
                            : scan.status === 'error'
                            ? 'bg-severity-critical/10 text-severity-critical'
                            : 'bg-severity-medium/10 text-severity-medium'
                        }`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${
                            scan.status === 'completed' ? 'bg-accent-emerald' : scan.status === 'error' ? 'bg-severity-critical' : 'bg-severity-medium animate-pulse'
                          }`} />
                          {scan.status}
                        </span>
                      </td>
                      <td className="py-3.5 pr-4">
                        <span className="text-sm font-semibold" style={{ color: scoreInfo.color }}>
                          {scan.risk_score}/100
                        </span>
                        <span className="ml-1.5 text-[10px] text-text-muted">({scoreInfo.label})</span>
                      </td>
                      <td className="py-3.5">
                        <button
                          onClick={() => navigate(`/?scan=${scan.scan_id}`)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-accent-primary hover:text-accent-cyan transition-colors"
                        >
                          View
                          <ExternalLink className="h-3 w-3" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
