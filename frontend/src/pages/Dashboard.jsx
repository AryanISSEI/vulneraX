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

export default function Dashboard() {
  const [isScanning, setIsScanning] = useState(false);
  const [scanId, setScanId] = useState(null);
  const [scanStatus, setScanStatus] = useState(null);
  const [currentPhase, setCurrentPhase] = useState('');
  const [scanResult, setScanResult] = useState(null);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const pollRef = useRef(null);

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
    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-10">
      
      {/* Search Header area */}
      <div className={`transition-all duration-500 ease-in-out ${scanResult || isScanning ? 'mb-8' : 'mt-20 mb-10'}`}>
        <ScanForm onScan={handleScan} isScanning={isScanning} />
      </div>

      {/* Error */}
      {error && (
        <div className="glass-panel p-6 text-sm text-severity-critical bg-severity-critical/10 border-severity-critical/30 mb-8 animate-fade-in flex items-center gap-2 font-mono">
          <span className="animate-pulse">▶</span> {error}
        </div>
      )}

      {/* Scan Progress */}
      {isScanning && (
        <div className="mb-8">
          <ScanProgress status={scanStatus} currentPhase={currentPhase} />
        </div>
      )}

      {/* Results Tabbed Interface */}
      {scanResult && (
        <div className="animate-slide-up">
          {/* Tab Navigation */}
          <div className="flex border-b border-border-default mb-8 space-x-1 overflow-x-auto">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-6 py-3 text-sm font-medium border-b-2 transition-all whitespace-nowrap ${
                  activeTab === tab.id 
                    ? 'border-accent-primary text-accent-primary bg-accent-primary/5' 
                    : 'border-transparent text-text-secondary hover:text-text-primary hover:bg-bg-card/50'
                }`}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            ))}
            
            <div className="ml-auto flex items-center py-2 pr-2">
              <ReportDownload scanId={scanResult.scan_id} />
            </div>
          </div>

          {/* Tab Content */}
          <div className="min-h-[500px]">
            {activeTab === 'overview' && (
              <div className="space-y-8 animate-fade-in">
                <QuickInfo scanResult={scanResult} />
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <RiskGauge score={scanResult.risk_score?.overall} />
                  <RiskChart vulnerabilities={scanResult.vulnerabilities} />
                </div>
                <VulnPanel vulnerabilities={scanResult.vulnerabilities} />
              </div>
            )}

            {activeTab === 'network' && (
              <div className="space-y-8 animate-fade-in">
                <PortTable ports={scanResult.ports} />
              </div>
            )}

            {activeTab === 'web' && (
              <div className="space-y-8 animate-fade-in">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <HeadersPanel headers={scanResult.headers} />
                  <CookiePanel cookies={scanResult.cookies} />
                </div>
              </div>
            )}

            {activeTab === 'crypto' && (
              <div className="space-y-8 animate-fade-in">
                <SSLPanel ssl={scanResult.ssl} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
