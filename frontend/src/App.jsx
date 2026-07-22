import React from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import NewScan from './pages/NewScan';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import TargetAssets from './pages/TargetAssets';
import ThreatPredictions from './pages/ThreatPredictions';
import Vulnerabilities from './pages/Vulnerabilities';

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(0,240,255,0.12),_transparent_30%),_#0B0F17] px-4 py-6 text-white lg:px-6">
        <div className="mx-auto flex max-w-[1600px] gap-6">
          <Sidebar />
          <main className="min-h-[calc(100vh-3rem)] flex-1 rounded-[32px] border border-white/10 bg-slate-950/60 p-6 backdrop-blur-xl lg:p-8">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/new-scan" element={<NewScan />} />
              <Route path="/target-assets" element={<TargetAssets />} />
              <Route path="/vulnerabilities" element={<Vulnerabilities />} />
              <Route path="/threat-predictions" element={<ThreatPredictions />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </main>
        </div>
      </div>
    </BrowserRouter>
  );
}
