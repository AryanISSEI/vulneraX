import React, { useState, useEffect, useRef } from 'react';
import ScanForm from '../components/ScanForm';
import ScanProgress from '../components/ScanProgress';
import QuickInfo from '../components/QuickInfo';
import PortTable from '../components/PortTable';
import HeadersPanel from '../components/HeadersPanel';
import CookiePanel from '../components/CookiePanel';
import SSLPanel from '../components/SSLPanel';
import VulnPanel from '../components/VulnPanel';
import RiskChart from '../components/RiskChart';
import RiskGauge from '../components/RiskGauge';
import RemediationPanel from '../components/RemediationPanel';
import AttackGraph from '../components/AttackGraph';
import { startScan, getScanStatus, getScanResults, abortScan } from '../api/client';
import { Activity, Network, Globe, Lock, ShieldAlert, ExternalLink, PlusCircle, XCircle, Share2 } from 'lucide-react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(useGSAP);

export default function Dashboard() {
  const [isScanning, setIsScanning] = useState(false);
  const [scanId, setScanId] = useState(null);
  const [targetDomain, setTargetDomain] = useState('');
  const [showNewScanInput, setShowNewScanInput] = useState(false);
  const [scanStatus, setScanStatus] = useState(null);
  const [currentPhase, setCurrentPhase] = useState('');
  const [scanResult, setScanResult] = useState(null);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const [selectedVuln, setSelectedVuln] = useState(null);
  const pollRef = useRef(null);
  const containerRef = useRef(null);

  const handleAbort = async () => {
    if (!scanId && !isScanning) return;
    if (!window.confirm('Are you sure you want to abort the ongoing scan?')) return;

    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }

    try {
      if (scanId) {
        await abortScan(scanId);
      }
    } catch (err) {
      console.error('Failed to abort scan:', err);
    }

    setIsScanning(false);
    setScanStatus('aborted');
    setError('Scan aborted by user.');

    if (scanId) {
      try {
        const { data: results } = await getScanResults(scanId);
        if (results) setScanResult(results);
      } catch (err) {}
    }

    localStorage.setItem('vulnerax_active_scan', JSON.stringify({
      target: targetDomain,
      scanId: scanId,
      scanStatus: 'aborted',
      currentPhase: 'Aborted',
      error: 'Scan aborted by user'
    }));
  };

  // GSAP Animations
  useGSAP(() => {
    if (scanResult) {
      gsap.fromTo('.gsap-stagger-item', 
        { opacity: 0, y: 30, rotationX: 10 }, 
        { opacity: 1, y: 0, rotationX: 0, duration: 0.8, stagger: 0.15, ease: 'power3.out', clearProps: 'all' }
      );
    }
  }, { dependencies: [scanResult, activeTab], scope: containerRef });

  // Restore active scan from URL query or localStorage and cleanup polling on unmount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const queryScanId = params.get('scan');

    if (queryScanId) {
      getScanResults(queryScanId)
        .then(({ data }) => {
          if (data && data.target) {
            setScanResult(data);
            setScanId(queryScanId);
            setScanStatus(data.status || 'completed');
            setTargetDomain(data.target);
            if (data.status === 'aborted') {
              setError('Scan aborted by user.');
            }
            localStorage.setItem('vulnerax_active_scan', JSON.stringify({
              target: data.target,
              scanId: queryScanId,
              scanStatus: data.status || 'completed',
              scanResult: data
            }));
          }
        })
        .catch(err => console.error('Error loading scan from query param:', err));
    } else {
      const saved = localStorage.getItem('vulnerax_active_scan');
      if (saved) {
        try {
          const data = JSON.parse(saved);
          if (data.scanId && (data.scanStatus === 'running' || data.scanStatus === 'pending')) {
            if (data.target) setTargetDomain(data.target);
            setScanId(data.scanId);
            setIsScanning(true);
            setScanStatus(data.scanStatus);
            setCurrentPhase(data.currentPhase || 'Resuming scan...');
            startPolling(data.scanId, data.target);
          }
        } catch (err) {
          console.error('Error loading saved scan state:', err);
        }
      }
    }

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const startPolling = (id, targetStr) => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      try {
        const { data: status } = await getScanStatus(id);
        setCurrentPhase(status.current_phase || '');
        setScanStatus(status.status);

        localStorage.setItem('vulnerax_active_scan', JSON.stringify({
          target: targetStr,
          scanId: id,
          scanStatus: status.status,
          currentPhase: status.current_phase,
        }));

        if (status.status === 'completed') {
          clearInterval(pollRef.current);
          pollRef.current = null;

          const { data: results } = await getScanResults(id);
          setScanResult(results);
          setIsScanning(false);

          localStorage.setItem('vulnerax_active_scan', JSON.stringify({
            target: targetStr,
            scanId: id,
            scanStatus: 'completed',
            scanResult: results,
          }));
        } else if (status.status === 'aborted') {
          clearInterval(pollRef.current);
          pollRef.current = null;
          setError('Scan aborted by user.');
          setIsScanning(false);
          setScanStatus('aborted');

          try {
            const { data: results } = await getScanResults(id);
            if (results) setScanResult(results);
          } catch (e) {}
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
  };

  const handleScan = async (target, headers = null, cookies = null) => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setIsScanning(true);
    setError('');
    setScanResult(null);
    setTargetDomain(target);
    setShowNewScanInput(false);
    setScanStatus('pending');
    setCurrentPhase('Initializing...');
    setActiveTab('overview');

    try {
      const { data } = await startScan(target, headers, cookies);
      setScanId(data.scan_id);
      setScanStatus('running');

      localStorage.setItem('vulnerax_active_scan', JSON.stringify({
        target,
        scanId: data.scan_id,
        scanStatus: 'running',
        currentPhase: 'Initializing...',
      }));

      startPolling(data.scan_id, target);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to start scan. Is the backend running?');
      setIsScanning(false);
    }
  };

  return (
    <>
      <div 
        className={`w-full h-full p-8 flex flex-col space-y-6 glass-panel rounded-2xl border border-border relative overflow-hidden transition-transform duration-500 ${selectedVuln ? 'md:-translate-x-[150px]' : ''}`}
      >
          {/* Header */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Vulnerability Scanner</h1>
              <p className="mt-1 text-muted-foreground">AI-powered web application security assessment</p>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm font-medium">
              {error}
            </div>
          )}

          {/* Active Target Banner */}
          {targetDomain && (
            <div className="p-4 rounded-xl bg-card border border-border backdrop-blur-md flex flex-wrap items-center justify-between gap-4 shrink-0 transition-all shadow-sm">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-lg bg-primary/10 border border-primary/20 text-primary">
                  <Globe className="h-5 w-5 animate-pulse" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Active Scanned Target
                  </div>
                  <a
                    href={targetDomain.startsWith('http') ? targetDomain : `https://${targetDomain}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-lg font-bold text-foreground hover:text-primary transition-colors flex items-center gap-1.5"
                  >
                    {targetDomain}
                    <ExternalLink className="h-4 w-4 opacity-60 hover:opacity-100" />
                  </a>
                </div>
                <span className={`ml-2 px-3 py-1 text-xs font-semibold rounded-full border ${
                  isScanning
                    ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 animate-pulse'
                    : scanStatus === 'aborted'
                    ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30'
                    : scanStatus === 'error'
                    ? 'bg-destructive/10 text-destructive border-destructive/30'
                    : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                }`}>
                  {isScanning ? 'Scan in Progress' : scanStatus === 'aborted' ? 'Scan Aborted' : scanStatus === 'error' ? 'Scan Error' : 'Scan Completed'}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {isScanning && (
                  <button
                    onClick={handleAbort}
                    className="flex items-center gap-1.5 px-4 py-2.5 bg-destructive/10 hover:bg-destructive/20 text-destructive border border-destructive/30 font-medium text-sm rounded-xl transition-all shadow-sm hover:scale-[1.02] active:scale-[0.98]"
                    title="Abort ongoing scan"
                  >
                    <XCircle className="h-4 w-4" />
                    Abort Scan
                  </button>
                )}
                <button
                  onClick={() => setShowNewScanInput(prev => !prev)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground font-medium text-sm rounded-xl transition-all shadow-md hover:scale-[1.02] active:scale-[0.98]"
                >
                  <PlusCircle className="h-4 w-4" />
                  {showNewScanInput ? 'Hide Scan Form' : 'Engage New Scan'}
                </button>
              </div>
            </div>
          )}

          {/* Scanner Input (Shows if no scan active or user clicks Engage New Scan) */}
          {(!targetDomain || showNewScanInput) && (
            <div className="shrink-0 transition-all">
              <ScanForm onScan={handleScan} isScanning={isScanning} />
            </div>
          )}

          {/* Scan Progress */}
          {isScanning && (
            <div className="shrink-0">
              <ScanProgress status={scanStatus} currentPhase={currentPhase} onAbort={handleAbort} />
            </div>
          )}

          {/* Navigation Tabs */}
          {scanResult && (
            <div className="border-b border-border shrink-0">
              <nav className="-mb-px flex space-x-8">
                {[
                  { id: 'overview', label: 'Overview', icon: Activity },
                  { id: 'vulnerabilities', label: 'Vulnerabilities', icon: ShieldAlert },
                  { id: 'network', label: 'Network & Ports', icon: Network },
                  { id: 'web', label: 'Web Headers', icon: Globe },
                  { id: 'crypto', label: 'SSL/TLS', icon: Lock },
                  { id: 'graph', label: 'Attack Graph', icon: Share2 },
                ].map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => setActiveTab(id)}
                    className={`
                      group inline-flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm
                      transition-colors duration-200
                      ${activeTab === id
                        ? 'border-primary text-primary'
                        : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                      }
                    `}
                  >
                    <Icon className={`h-4 w-4 ${activeTab === id ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'}`} />
                    {label}
                  </button>
                ))}
              </nav>
            </div>
          )}

          {/* Tab Content */}
          {scanResult && (
            <div className="flex-1 flex flex-col min-h-0 overflow-y-auto pr-2" ref={containerRef}>
              {activeTab === 'overview' && (
                <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 gap-6 flex-1 min-h-0 grid-rows-[auto_1fr]">
                  <div className="md:col-span-3 xl:col-span-4 gsap-stagger-item perspective-[1000px]">
                    <QuickInfo scanResult={scanResult} />
                  </div>
                  <div className="md:col-span-1 xl:col-span-1 flex flex-col min-h-0 gsap-stagger-item perspective-[1000px]">
                    <RiskGauge score={scanResult?.risk_score?.overall} status={scanResult?.status || scanStatus} />
                  </div>
                  <div className="md:col-span-2 xl:col-span-3 flex flex-col min-h-0 gsap-stagger-item perspective-[1000px]">
                    <RiskChart vulnerabilities={scanResult?.vulnerabilities || []} />
                  </div>
                </div>
              )}

              {activeTab === 'vulnerabilities' && (
                <div className="flex-1 flex flex-col min-h-0 gsap-stagger-item perspective-[1000px]">
                  <VulnPanel vulnerabilities={scanResult?.vulnerabilities || []} onSelectVuln={setSelectedVuln} />
                </div>
              )}

              {activeTab === 'network' && (
                <div className="space-y-8">
                  <div className="gsap-stagger-item">
                    <PortTable ports={scanResult?.ports || []} />
                  </div>
                </div>
              )}

              {activeTab === 'web' && (
                <div className="space-y-8">
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 gsap-stagger-item">
                    <HeadersPanel headers={scanResult?.headers || {}} />
                    <CookiePanel cookies={scanResult?.cookies || []} />
                  </div>
                </div>
              )}

              {activeTab === 'crypto' && (
                <div className="space-y-8">
                  <div className="gsap-stagger-item">
                    <SSLPanel ssl={scanResult?.ssl || {}} />
                  </div>
                </div>
              )}

              {activeTab === 'graph' && (
                <div className="flex-1 min-h-[500px] w-full border border-border rounded-xl overflow-hidden bg-card gsap-stagger-item shadow-sm">
                  <AttackGraph scanResult={scanResult} />
                </div>
              )}
            </div>
          )}
        </div>
        
      <RemediationPanel vulnerability={selectedVuln} onClose={() => setSelectedVuln(null)} scanId={scanId} />
    </>
  );
}
