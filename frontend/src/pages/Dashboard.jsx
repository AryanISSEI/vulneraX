import React, { useState, useRef, useCallback } from 'react';
import { Activity, Globe, ShieldAlert, BrainCircuit } from 'lucide-react';
import HeaderScanBar from '../components/HeaderScanBar';
import LiveScanActivity from '../components/LiveScanActivity';
import MetricsGrid from '../components/MetricsGrid';
import RiskChart from '../components/RiskChart';
import RiskGauge from '../components/RiskGauge';
import ReportExports from '../components/ReportExports';
import TargetAssets from './TargetAssets';
import Vulnerabilities from './Vulnerabilities';
import ThreatPredictions from './ThreatPredictions';
import { startScan, getScanStatus, getScanResults } from '../api/client';
import { formatMetrics, parseAttackPaths, extractLiveSteps, generateAIInsights } from '../utils/dashboard';

export default function Dashboard() {
  const [isScanning, setIsScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState(null);
  const [currentPhase, setCurrentPhase] = useState('');
  const [scanResult, setScanResult] = useState(null);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedMode, setSelectedMode] = useState('');
  
  const pollRef = useRef(null);

  const handleScan = async ({ target, mode }) => {
    setIsScanning(true);
    setError('');
    setScanResult(null);
    setScanStatus('running');
    setCurrentPhase('Network Recon (Nmap)');
    setSelectedMode(mode);
    setActiveTab('overview');

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

  // Use pure utility functions for derived state
  const metrics = formatMetrics(scanResult);
  const liveSteps = extractLiveSteps(currentPhase || scanStatus);

  const tabs = [
    { id: 'overview', label: 'Overview', icon: Activity },
    { id: 'assets', label: 'Target Assets', icon: Globe },
    { id: 'vulnerabilities', label: 'Vulnerabilities', icon: ShieldAlert },
    { id: 'predictions', label: 'AI Predictions', icon: BrainCircuit, color: 'text-accent-secondary' },
  ];

  return (
    <div className="max-w-7xl mx-auto flex flex-col gap-8 pb-20 mt-8 relative z-20">
      
      <div className="text-center mb-4">
        <h1 className="text-4xl md:text-5xl font-mono text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-500 font-bold mb-4 tracking-tight">
          Initiate <span className="text-accent-primary drop-shadow-[0_0_10px_rgba(34,211,238,0.5)]">Link</span>
        </h1>
        <p className="text-text-muted font-mono max-w-xl mx-auto text-sm">
          Enter a target IP or domain to begin reconnaissance and vulnerability analysis.
        </p>
      </div>

      <HeaderScanBar onScan={handleScan} isScanning={isScanning} />

      {error && (
        <div className="bg-red-500/10 border border-red-500/50 text-red-500 p-4 rounded-xl text-center font-mono max-w-4xl mx-auto w-full">
          {error}
        </div>
      )}

      {(isScanning || scanResult || scanStatus) && (
        <LiveScanActivity steps={liveSteps} currentPhase={currentPhase} />
      )}

      {scanResult && !isScanning && (
        <div className="animate-slide-up flex flex-col gap-8 mt-4">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-mono text-white tracking-widest uppercase">Scan Results</h2>
              <p className="text-text-muted font-mono text-sm">Target: {scanResult.target}</p>
            </div>
            <ReportExports scanId={scanResult.scan_id} />
          </div>

          {/* Internal Tab Navigation */}
          <div className="flex overflow-x-auto no-scrollbar gap-2 border-b border-white/10 pb-4">
            {tabs.map((tab) => {
              const isActive = activeTab === tab.id;
              const itemColor = tab.color || 'text-accent-primary';
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-6 py-3 rounded-full font-mono text-sm transition-all whitespace-nowrap
                    ${isActive ? `bg-white/10 text-white shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)]` : 'text-text-muted hover:bg-white/5 hover:text-white'}
                  `}
                >
                  <tab.icon className={`w-4 h-4 ${isActive ? itemColor : ''}`} />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Tab Content Views */}
          {activeTab === 'overview' && (
            <div className="animate-fade-in flex flex-col gap-8">
              <MetricsGrid scanResult={scanResult} metrics={metrics} />
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <RiskGauge score={metrics.riskScore} />
                <RiskChart vulnerabilities={scanResult.vulnerabilities} />
              </div>
            </div>
          )}

          {activeTab === 'assets' && (
            <div className="animate-fade-in">
              {/* Pass scanResult down, TargetAssets can render its own internal panels */}
              <TargetAssets scanResult={scanResult} />
            </div>
          )}

          {activeTab === 'vulnerabilities' && (
            <div className="animate-fade-in">
              <Vulnerabilities scanResult={scanResult} />
            </div>
          )}

          {activeTab === 'predictions' && (
            <div className="animate-fade-in">
              {/* Pass AI insights and attack paths */}
              <ThreatPredictions scanResult={scanResult} attackPaths={parseAttackPaths(scanResult)} aiInsights={generateAIInsights(scanResult)} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
