import React, { useMemo, useRef, useState } from 'react';
import AIThreatPath from '../components/AIThreatPath';
import HeaderScanBar from '../components/HeaderScanBar';
import LiveScanActivity from '../components/LiveScanActivity';
import MetricsGrid from '../components/MetricsGrid';
import ReportExports from '../components/ReportExports';
import RiskChart from '../components/RiskChart';
import RiskGauge from '../components/RiskGauge';
import VulnPanel from '../components/VulnPanel';
import { getAiInsights, getLiveSteps, getRiskSummary, getSeverityCounts } from '../utils/dashboard';
import { startScan, getScanStatus, getScanResults } from '../api/client';

export default function Dashboard() {
  const [isScanning, setIsScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState(null);
  const [currentPhase, setCurrentPhase] = useState('');
  const [scanResult, setScanResult] = useState(null);
  const [error, setError] = useState('');
  
  const pollRef = useRef(null);

  const handleScan = async ({ target }) => {
    setIsScanning(true);
    setError('');
    setScanResult(null);
    setScanStatus('running');
    setCurrentPhase('Network Recon (Nmap)');

    try {
      const { data } = await startScan(target);
      pollRef.current = setInterval(async () => {
        try {
          const { data: status } = await getScanStatus(data.scan_id);
          setCurrentPhase(status.current_phase || 'Web Crawl & Audit');
          setScanStatus(status.status);

          if (status.status === 'completed') {
            clearInterval(pollRef.current);
            pollRef.current = null;
            const { data: results } = await getScanResults(data.scan_id);
            results.target = target;
            setScanResult(results);
            setIsScanning(false);
          } else if (status.status === 'error') {
            clearInterval(pollRef.current);
            pollRef.current = null;
            setError('Scan encountered an error. Please try again.');
            setIsScanning(false);
          }
        } catch (err) {
          console.error('Status poll error:', err);
        }
      }, 1500);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to start scan. Is the backend running?');
      setIsScanning(false);
    }
  };

  const severityCounts = useMemo(() => getSeverityCounts(scanResult?.vulnerabilities), [scanResult]);
  const riskScore = scanResult?.risk_score?.overall ?? 18;
  const riskMeta = getRiskSummary(riskScore);
  const liveSteps = getLiveSteps(currentPhase, scanStatus);
  const insights = getAiInsights(scanResult);
  const attackPath = scanResult?.vulnerabilities?.length > 0 
    ? ['Internet-facing service', 'Web application weakness', 'Privilege escalation opportunity', 'Sensitive data exposure']
    : [];

  return (
    <div className="space-y-8">
      <HeaderScanBar onScan={handleScan} isScanning={isScanning} />

      {error && (
        <div className="bg-red-500/10 border border-red-500/50 text-red-500 p-4 rounded-xl text-center font-mono max-w-4xl mx-auto w-full">
          {error}
        </div>
      )}

      <MetricsGrid
        riskScore={riskScore}
        riskLabel={riskMeta.label}
        severityCounts={severityCounts}
        activeScans={isScanning ? 1 : 0}
        healthScore={Math.max(100 - riskScore, 12)}
      />

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <LiveScanActivity steps={liveSteps} status={scanStatus} />
        <AIThreatPath insights={insights} attackPath={attackPath} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <RiskGauge score={riskScore} />
            <RiskChart vulnerabilities={scanResult?.vulnerabilities || []} />
          </div>
          <VulnPanel vulnerabilities={scanResult?.vulnerabilities || []} />
        </div>
        <ReportExports />
      </div>
    </div>
  );
}
