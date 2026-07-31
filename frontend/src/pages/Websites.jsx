import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Globe, ExternalLink, RefreshCw, Loader2, Play, Activity, ArrowRight, ShieldCheck } from 'lucide-react';
import { motion } from 'framer-motion';
import { getScanHistory, getScanStatus } from '../api/client';
import { formatTimestamp } from '../utils/helpers';

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

function getPhasePercentage(currentPhase) {
  if (!currentPhase) return 10;
  const lower = currentPhase.toLowerCase();
  if (lower.includes('completed')) return 100;
  if (lower.includes('initializing')) return 10;
  
  const idx = PHASES.findIndex((p) => lower.includes(p.toLowerCase()));
  if (idx === -1) return 25;
  return Math.min(95, Math.max(12, Math.round(((idx + 1) / PHASES.length) * 100)));
}

export default function Websites() {
  const [activeScans, setActiveScans] = useState([]);
  const [loading, setLoading] = useState(true);
  const pollRef = useRef(null);
  const navigate = useNavigate();

  const fetchActiveScans = async () => {
    try {
      const { data } = await getScanHistory();
      const allScans = data.scans || [];
      let runningScans = allScans.filter(s => s.status === 'running' || s.status === 'pending');

      const saved = localStorage.getItem('vulnerax_active_scan');
      if (saved) {
        try {
          const localActive = JSON.parse(saved);
          if (localActive.scanId && (localActive.scanStatus === 'running' || localActive.scanStatus === 'pending')) {
            const exists = runningScans.some(s => s.scan_id === localActive.scanId);
            if (!exists && localActive.target) {
              runningScans.unshift({
                scan_id: localActive.scanId,
                target: localActive.target,
                timestamp: new Date().toISOString(),
                status: localActive.scanStatus,
                current_phase: localActive.currentPhase || 'Initializing...'
              });
            }
          }
        } catch (e) {}
      }

      const updatedScans = await Promise.all(
        runningScans.map(async (scan) => {
          try {
            const { data: statusData } = await getScanStatus(scan.scan_id);
            return {
              ...scan,
              status: statusData.status || scan.status,
              current_phase: statusData.current_phase || scan.current_phase || 'In Progress'
            };
          } catch (err) {
            return scan;
          }
        })
      );

      const stillRunning = updatedScans.filter(s => s.status === 'running' || s.status === 'pending');
      setActiveScans(stillRunning);
    } catch (err) {
      console.error('Error fetching active scans:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActiveScans();

    pollRef.current = setInterval(() => {
      fetchActiveScans();
    }, 1500);

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleOpenLiveDashboard = (scan) => {
    localStorage.setItem('vulnerax_active_scan', JSON.stringify({
      target: scan.target,
      scanId: scan.scan_id,
      scanStatus: scan.status,
      currentPhase: scan.current_phase
    }));
    navigate('/');
  };

  return (
    <div className="w-full h-full p-6 md:p-8 flex flex-col space-y-6 glass-panel rounded-xl border border-border relative overflow-hidden">
      {/* Sleek Top Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shrink-0 border-b border-border/60 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2.5">
            <Activity className="h-6 w-6 text-primary animate-pulse" />
            Active Scans
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Live monitoring of ongoing security assessment targets
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={fetchActiveScans} 
            className="p-2 border border-border rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            title="Refresh Active Scans"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button 
            onClick={() => navigate('/')}
            className="bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-lg flex items-center gap-2 text-xs font-semibold transition-all shadow-sm"
          >
            <Play className="h-3.5 w-3.5 fill-current" />
            Launch New Scan
          </button>
        </div>
      </div>

      {/* Main Body */}
      <div className="flex-1 flex flex-col overflow-y-auto">
        {loading && activeScans.length === 0 ? (
          <div className="flex-1 flex items-center justify-center p-12">
            <Loader2 className="h-7 w-7 text-primary animate-spin" />
          </div>
        ) : activeScans.length === 0 ? (
          /* Clean Empty State */
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center rounded-xl bg-card/30 border border-border/40 min-h-[280px]">
            <div className="p-3 rounded-full bg-primary/10 text-primary mb-3">
              <ShieldCheck className="h-8 w-8" />
            </div>
            <h3 className="text-lg font-semibold text-foreground">No Scans in Progress</h3>
            <p className="text-muted-foreground text-xs max-w-sm mt-1">
              All scans are complete. View past vulnerability reports in <span className="text-primary font-medium">AI Reports</span> or start a new scan.
            </p>
            <button 
              onClick={() => navigate('/')}
              className="mt-5 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 shadow-sm"
            >
              Start New Scan
            </button>
          </div>
        ) : (
          /* Clean Minimal Active Scans List */
          <div className="space-y-4">
            {activeScans.map((scan) => {
              const progressPct = getPhasePercentage(scan.current_phase);
              
              return (
                <motion.div
                  key={scan.scan_id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-5 rounded-xl bg-card/70 border border-border hover:border-primary/40 transition-all flex flex-col space-y-4 shadow-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
                        <Globe className="h-5 w-5 animate-pulse" />
                      </div>
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Target
                        </div>
                        <a
                          href={scan.target.startsWith('http') ? scan.target : `https://${scan.target}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-base font-bold text-foreground hover:text-primary transition-colors flex items-center gap-1.5"
                        >
                          {scan.target}
                          <ExternalLink className="h-3.5 w-3.5 opacity-50 hover:opacity-100" />
                        </a>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        {scan.current_phase || 'Scanning...'} ({progressPct}%)
                      </span>

                      <button
                        onClick={() => handleOpenLiveDashboard(scan)}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 font-semibold text-xs rounded-lg transition-colors"
                      >
                        Live Dashboard
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Sleek Progress Bar */}
                  <div className="space-y-1.5 pt-1">
                    <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                    <div className="flex justify-between items-center text-[11px] text-muted-foreground">
                      <span>Phase: <strong className="text-foreground font-medium">{scan.current_phase || 'Initializing'}</strong></span>
                      <span>Started: {formatTimestamp(scan.timestamp)}</span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}


