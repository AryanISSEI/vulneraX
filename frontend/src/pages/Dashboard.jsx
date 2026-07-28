import { useState, useEffect, useRef } from 'react';
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
import ReportDownload from '../components/ReportDownload';
import { startScan, getScanStatus, getScanResults } from '../api/client';
import { Activity, Network, Globe, Lock } from 'lucide-react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(useGSAP);

export default function Dashboard() {
  const [isScanning, setIsScanning] = useState(false);
  const [scanId, setScanId] = useState(null);
  const [scanStatus, setScanStatus] = useState(null);
  const [currentPhase, setCurrentPhase] = useState('');
  const [scanResult, setScanResult] = useState(null);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const pollRef = useRef(null);
  const containerRef = useRef(null);

  // GSAP Animations
  useGSAP(() => {
    if (scanResult) {
      gsap.fromTo('.gsap-stagger-item', 
        { opacity: 0, y: 30, rotationX: 10 }, 
        { opacity: 1, y: 0, rotationX: 0, duration: 0.8, stagger: 0.15, ease: 'power3.out', clearProps: 'all' }
      );
    }
  }, { dependencies: [scanResult, activeTab], scope: containerRef });

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleScan = async (target) => {
    setIsScanning(true);
    setError('');
    setScanResult(null);
    setScanStatus('pending');
    setCurrentPhase('Initializing...');
    setActiveTab('overview');

    try {
      const { data } = await startScan(target);
      setScanId(data.scan_id);
      setScanStatus('running');

      // Start polling for status
      pollRef.current = setInterval(async () => {
        try {
          const { data: status } = await getScanStatus(data.scan_id);
          setCurrentPhase(status.current_phase || '');
          setScanStatus(status.status);

          if (status.status === 'completed') {
            clearInterval(pollRef.current);
            pollRef.current = null;

            // Fetch full results
            const { data: results } = await getScanResults(data.scan_id);
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

  const tabs = [
    { id: 'overview', label: 'Overview', icon: Activity },
    { id: 'network', label: 'Network', icon: Network },
    { id: 'web', label: 'Web Security', icon: Globe },
    { id: 'crypto', label: 'Cryptography', icon: Lock },
  ];

  return (
    <div className="w-full h-full p-8 flex flex-col space-y-6 glass-panel rounded-2xl border border-white/10 relative overflow-hidden">
          {/* Header */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Vulnerability Scanner</h1>
              <p className="mt-1 text-muted-foreground">AI-powered web application security assessment</p>
            </div>
            {scanResult && <ReportDownload scanId={scanResult.scan_id} />}
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm font-medium">
              {error}
            </div>
          )}

          {/* Scanner Input */}
          <div className="shrink-0">
            <ScanForm onScan={handleScan} isScanning={isScanning} />
          </div>

          {/* Scan Progress */}
          {isScanning && (
            <div className="shrink-0">
              <ScanProgress status={scanStatus} currentPhase={currentPhase} />
            </div>
          )}

          {/* Navigation Tabs */}
          {scanResult && (
            <div className="border-b border-border shrink-0">
              <nav className="-mb-px flex space-x-8">
                {[
                  { id: 'overview', label: 'Overview', icon: Activity },
                  { id: 'network', label: 'Network & Ports', icon: Network },
                  { id: 'web', label: 'Web Headers', icon: Globe },
                  { id: 'crypto', label: 'SSL/TLS', icon: Lock },
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
            <div className="flex-1 flex flex-col" ref={containerRef}>
              {activeTab === 'overview' && (
                <div className="space-y-8">
                  <div className="gsap-stagger-item perspective-[1000px]">
                    <QuickInfo scanResult={scanResult} />
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 gsap-stagger-item perspective-[1000px]">
                    <RiskGauge score={scanResult?.risk_score?.overall} />
                    <RiskChart vulnerabilities={scanResult?.vulnerabilities || []} />
                  </div>
                  <div className="gsap-stagger-item perspective-[1000px]">
                    <VulnPanel vulnerabilities={scanResult?.vulnerabilities || []} />
                  </div>
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
            </div>
          )}
        </div>
  );
}
