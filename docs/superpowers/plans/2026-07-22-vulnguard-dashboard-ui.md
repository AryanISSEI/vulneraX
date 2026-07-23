# VulnGuard Dashboard UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the frontend into a polished VulnGuard cybersecurity dashboard with a routed platform shell, premium dark theme, responsive dashboard modules, and focused UI tests.

**Architecture:** Keep the existing React + Vite + Tailwind app, but split the dashboard into smaller presentational sections and normalize scan data at the page boundary. Build a routed platform shell with a reusable sidebar, command bar, metrics/insights panels, and lightweight placeholder routes for non-dashboard sections.

**Tech Stack:** React 19, React Router, Tailwind CSS v4, Lucide React, Vite, Vitest, React Testing Library

---

## File Map

### Existing Files To Modify

- `frontend/package.json`
- `frontend/vite.config.js`
- `frontend/src/App.jsx`
- `frontend/src/index.css`
- `frontend/src/pages/Dashboard.jsx`
- `frontend/src/components/Sidebar.jsx`
- `frontend/src/components/HeaderScanBar.jsx`
- `frontend/src/components/LiveScanActivity.jsx`
- `frontend/src/components/AIThreatPath.jsx`
- `frontend/src/components/RiskGauge.jsx`
- `frontend/src/components/RiskChart.jsx`
- `frontend/src/components/VulnPanel.jsx`

### New Files To Create

- `frontend/src/utils/dashboard.js`
- `frontend/src/components/ui/GlassCard.jsx`
- `frontend/src/components/ui/SectionHeader.jsx`
- `frontend/src/components/ui/StatusBadge.jsx`
- `frontend/src/components/ui/MetricTile.jsx`
- `frontend/src/components/MetricsGrid.jsx`
- `frontend/src/components/ReportExports.jsx`
- `frontend/src/components/PlatformPlaceholder.jsx`
- `frontend/src/pages/NewScan.jsx`
- `frontend/src/pages/TargetAssets.jsx`
- `frontend/src/pages/Vulnerabilities.jsx`
- `frontend/src/pages/ThreatPredictions.jsx`
- `frontend/src/pages/Reports.jsx`
- `frontend/src/pages/Settings.jsx`
- `frontend/src/test/setup.js`
- `frontend/src/components/HeaderScanBar.test.jsx`
- `frontend/src/components/LiveScanActivity.test.jsx`
- `frontend/src/components/VulnPanel.test.jsx`
- `frontend/src/App.test.jsx`

### Responsibilities

- `Dashboard.jsx` owns scan state, polling, tab state, and result normalization.
- `dashboard.js` converts raw API payloads into metric counts, attack-path items, AI insight bullets, and live-step state.
- `Sidebar.jsx` renders the product shell navigation and operational badge.
- `HeaderScanBar.jsx` owns the target input, scan mode select, consent checkbox, and submit validation UI.
- `MetricsGrid.jsx`, `RiskGauge.jsx`, `RiskChart.jsx`, `LiveScanActivity.jsx`, `AIThreatPath.jsx`, `VulnPanel.jsx`, and `ReportExports.jsx` remain presentational and take structured props.
- Placeholder pages give the requested sections a polished routed home without adding backend scope.

## Task 1: Set Up Tests And Shared UI Primitives

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/vite.config.js`
- Create: `frontend/src/test/setup.js`
- Create: `frontend/src/components/ui/GlassCard.jsx`
- Create: `frontend/src/components/ui/SectionHeader.jsx`
- Create: `frontend/src/components/ui/StatusBadge.jsx`
- Create: `frontend/src/components/ui/MetricTile.jsx`
- Test: `frontend/src/App.test.jsx`

- [ ] **Step 1: Add the test runner and test script**

Update `frontend/package.json` so the app can run component tests:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "lint": "oxlint",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.8.0",
    "@testing-library/react": "^16.1.0",
    "@testing-library/user-event": "^14.5.2",
    "@vitejs/plugin-react": "^6.0.3",
    "jsdom": "^26.1.0",
    "oxlint": "^1.71.0",
    "vite": "^8.1.1",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: Configure Vite for Vitest and create test setup**

Update `frontend/vite.config.js`:

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.js',
  },
});
```

Create `frontend/src/test/setup.js`:

```js
import '@testing-library/jest-dom';
```

- [ ] **Step 3: Add shared primitives for the redesign**

Create `frontend/src/components/ui/GlassCard.jsx`:

```jsx
export default function GlassCard({ className = '', tone = 'default', children }) {
  const toneClass =
    tone === 'ai'
      ? 'border-violet-400/30 bg-violet-500/5 shadow-[0_0_40px_rgba(139,92,246,0.08)]'
      : tone === 'critical'
      ? 'border-rose-400/30 bg-rose-500/5'
      : 'border-white/10 bg-white/5';

  return (
    <section className={`rounded-3xl border backdrop-blur-xl ${toneClass} ${className}`}>
      {children}
    </section>
  );
}
```

Create `frontend/src/components/ui/SectionHeader.jsx`:

```jsx
export default function SectionHeader({ eyebrow, title, description, action = null }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        {eyebrow ? (
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-300">
            {eyebrow}
          </p>
        ) : null}
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        {description ? <p className="mt-1 text-sm text-slate-400">{description}</p> : null}
      </div>
      {action}
    </div>
  );
}
```

Create `frontend/src/components/ui/StatusBadge.jsx`:

```jsx
export default function StatusBadge({ label, state = 'healthy' }) {
  const styles =
    state === 'critical'
      ? 'bg-rose-500/10 text-rose-300 ring-1 ring-rose-400/25'
      : state === 'ai'
      ? 'bg-violet-500/10 text-violet-300 ring-1 ring-violet-400/25'
      : 'bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-400/25';

  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium ${styles}`}>
      <span className="h-2 w-2 rounded-full bg-current" />
      {label}
    </span>
  );
}
```

Create `frontend/src/components/ui/MetricTile.jsx`:

```jsx
import GlassCard from './GlassCard';

export default function MetricTile({ icon: Icon, label, value, hint, tone = 'default', children }) {
  return (
    <GlassCard className="p-5" tone={tone}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-slate-400">{label}</p>
          <p className="mt-3 text-3xl font-semibold text-white">{value}</p>
          {hint ? <p className="mt-2 text-sm text-slate-400">{hint}</p> : null}
        </div>
        {Icon ? (
          <div className="rounded-2xl bg-white/5 p-3 text-cyan-300">
            <Icon className="h-5 w-5" />
          </div>
        ) : null}
      </div>
      {children}
    </GlassCard>
  );
}
```

- [ ] **Step 4: Add a failing shell smoke test**

Create `frontend/src/App.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react';
import App from './App';

test('renders the VulnGuard brand and primary dashboard navigation', () => {
  render(<App />);

  expect(screen.getByText('VulnGuard')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /dashboard/i })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /reports/i })).toBeInTheDocument();
});
```

- [ ] **Step 5: Install dependencies and run the test**

Run:

```bash
npm install
npm test -- App.test.jsx
```

Expected:

```text
FAIL  src/App.test.jsx
Unable to find role="link" with name /reports/i
```

- [ ] **Step 6: Commit the tooling baseline**

Run:

```bash
git add package.json package-lock.json vite.config.js src/test/setup.js src/components/ui src/App.test.jsx
git commit -m "test: add dashboard ui test harness"
```

## Task 2: Build The Routed Platform Shell

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/Sidebar.jsx`
- Create: `frontend/src/components/PlatformPlaceholder.jsx`
- Create: `frontend/src/pages/NewScan.jsx`
- Create: `frontend/src/pages/TargetAssets.jsx`
- Create: `frontend/src/pages/Vulnerabilities.jsx`
- Create: `frontend/src/pages/ThreatPredictions.jsx`
- Create: `frontend/src/pages/Reports.jsx`
- Create: `frontend/src/pages/Settings.jsx`
- Test: `frontend/src/App.test.jsx`

- [ ] **Step 1: Expand the shell test to include the new routes**

Update `frontend/src/App.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react';
import App from './App';

test('renders the routed platform shell', () => {
  render(<App />);

  expect(screen.getByRole('link', { name: /dashboard/i })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /new scan/i })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /target assets/i })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /threat predictions/i })).toBeInTheDocument();
  expect(screen.getByText(/system operational/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to confirm the current shell is incomplete**

Run:

```bash
npm test -- App.test.jsx
```

Expected:

```text
FAIL  src/App.test.jsx
Unable to find role="link" with name /new scan/i
```

- [ ] **Step 3: Implement the new sidebar and shell routes**

Create `frontend/src/components/PlatformPlaceholder.jsx`:

```jsx
import { ArrowUpRight } from 'lucide-react';
import GlassCard from './ui/GlassCard';
import SectionHeader from './ui/SectionHeader';

export default function PlatformPlaceholder({ eyebrow, title, description }) {
  return (
    <GlassCard className="p-8">
      <SectionHeader eyebrow={eyebrow} title={title} description={description} />
      <div className="mt-8 rounded-2xl border border-white/10 bg-slate-950/50 p-6">
        <p className="text-sm text-slate-300">
          This section is scaffolded so the platform shell feels complete while the dashboard remains the primary
          production-ready view.
        </p>
        <div className="mt-6 inline-flex items-center gap-2 text-sm text-cyan-300">
          Planned next
          <ArrowUpRight className="h-4 w-4" />
        </div>
      </div>
    </GlassCard>
  );
}
```

Create `frontend/src/pages/Reports.jsx`:

```jsx
import PlatformPlaceholder from '../components/PlatformPlaceholder';

export default function Reports() {
  return (
    <PlatformPlaceholder
      eyebrow="Exports"
      title="Reports"
      description="Preview, organize, and deliver generated PDF and HTML assessments."
    />
  );
}
```

Use the same pattern for the other pages:

```jsx
import PlatformPlaceholder from '../components/PlatformPlaceholder';

export default function NewScan() {
  return (
    <PlatformPlaceholder
      eyebrow="Assessment Intake"
      title="New Scan"
      description="Queue new assessments and choose scanning depth from a dedicated route."
    />
  );
}
```

Update `frontend/src/components/Sidebar.jsx`:

```jsx
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
            <p className="text-lg font-semibold text-white">VulnGuard</p>
            <p className="text-xs uppercase tracking-[0.24em] text-slate-400">AI Security Platform</p>
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
```

Update `frontend/src/App.jsx`:

```jsx
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
```

- [ ] **Step 4: Run the shell test again**

Run:

```bash
npm test -- App.test.jsx
```

Expected:

```text
PASS  src/App.test.jsx
```

- [ ] **Step 5: Commit the routed shell**

Run:

```bash
git add src/App.jsx src/components/Sidebar.jsx src/components/PlatformPlaceholder.jsx src/pages/NewScan.jsx src/pages/TargetAssets.jsx src/pages/Vulnerabilities.jsx src/pages/ThreatPredictions.jsx src/pages/Reports.jsx src/pages/Settings.jsx src/App.test.jsx
git commit -m "feat: add routed vulnguard platform shell"
```

## Task 3: Normalize Dashboard State And Command Bar Behavior

**Files:**
- Create: `frontend/src/utils/dashboard.js`
- Modify: `frontend/src/pages/Dashboard.jsx`
- Modify: `frontend/src/components/HeaderScanBar.jsx`
- Test: `frontend/src/components/HeaderScanBar.test.jsx`

- [ ] **Step 1: Write the command bar validation test**

Create `frontend/src/components/HeaderScanBar.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import HeaderScanBar from './HeaderScanBar';

test('requires an authorized target before starting an assessment', async () => {
  const onScan = vi.fn();
  const user = userEvent.setup();

  render(<HeaderScanBar onScan={onScan} isScanning={false} />);

  await user.type(screen.getByPlaceholderText(/enter ip or domain/i), 'target.example.com');
  await user.click(screen.getByRole('button', { name: /start assessment/i }));

  expect(screen.getByText(/explicit authorization/i)).toBeInTheDocument();
  expect(onScan).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the test to confirm the new behavior is missing**

Run:

```bash
npm test -- HeaderScanBar.test.jsx
```

Expected:

```text
FAIL  src/components/HeaderScanBar.test.jsx
Unable to find text /explicit authorization/i
```

- [ ] **Step 3: Add dashboard normalization helpers**

Create `frontend/src/utils/dashboard.js`:

```js
const severityOrder = ['critical', 'high', 'medium', 'low'];

export function getSeverityCounts(vulnerabilities = []) {
  return severityOrder.reduce((counts, severity) => {
    counts[severity] = vulnerabilities.filter((item) => item.severity?.toLowerCase() === severity).length;
    return counts;
  }, {});
}

export function getRiskSummary(score = 0) {
  if (score >= 80) return { label: 'High Exposure', tone: 'critical' };
  if (score >= 50) return { label: 'Moderate Exposure', tone: 'warning' };
  return { label: 'Low Exposure', tone: 'healthy' };
}

export function getLiveSteps(currentPhase = '', status = 'idle') {
  const steps = ['Network Recon (Nmap)', 'Web Crawl & Audit', 'AI Threat Synthesis', 'Report Generation'];
  const activeIndex = Math.max(
    0,
    steps.findIndex((step) => currentPhase.toLowerCase().includes(step.toLowerCase().split(' ')[0].toLowerCase()))
  );

  return steps.map((label, index) => ({
    label,
    state: status === 'completed' ? 'complete' : index < activeIndex ? 'complete' : index === activeIndex ? 'running' : 'queued',
  }));
}

export function getAiInsights(scanResult = null) {
  if (!scanResult) {
    return [
      'Awaiting assessment data to generate threat predictions.',
      'Predicted attack paths will appear after the first completed scan.',
    ];
  }

  return [
    `Target ${scanResult.target || 'asset'} shows concentrated exposure around web-facing services.`,
    'Prioritize internet-exposed services and weak transport security first.',
    'Use the generated report to confirm remediation order for critical issues.',
  ];
}
```

- [ ] **Step 4: Rebuild the command bar and page-level scan flow**

Update `frontend/src/components/HeaderScanBar.jsx`:

```jsx
import { Shield, Sparkles } from 'lucide-react';
import { useState } from 'react';

const modes = ['Quick Port Scan', 'Full Vulnerability Audit', 'AI Threat Prediction'];

export default function HeaderScanBar({ onScan, isScanning }) {
  const [target, setTarget] = useState('');
  const [mode, setMode] = useState(modes[1]);
  const [authorized, setAuthorized] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = (event) => {
    event.preventDefault();

    if (!target.trim()) {
      setError('Enter a target IP or domain before starting an assessment.');
      return;
    }

    if (!authorized) {
      setError('Explicit authorization is required before starting an assessment.');
      return;
    }

    setError('');
    onScan({ target: target.trim(), mode });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-cyan-300">Command Center</p>
          <h1 className="mt-2 text-3xl font-semibold text-white">AI-Powered Security Assessment Platform</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-400">
            Launch scans, monitor assessment progress, review vulnerabilities, and export actionable reports from one
            high-signal workspace.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="rounded-[28px] border border-white/10 bg-white/5 p-4 backdrop-blur-xl">
        <div className="grid gap-3 xl:grid-cols-[1fr_240px_auto]">
          <input
            type="text"
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            placeholder="Enter IP or Domain, e.g., target.example.com"
            className="h-14 rounded-2xl border border-white/10 bg-slate-950/70 px-4 text-sm text-white outline-none ring-0 placeholder:text-slate-500"
            disabled={isScanning}
          />

          <select
            value={mode}
            onChange={(event) => setMode(event.target.value)}
            className="h-14 rounded-2xl border border-white/10 bg-slate-950/70 px-4 text-sm text-slate-200 outline-none"
            disabled={isScanning}
          >
            {modes.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>

          <button
            type="submit"
            disabled={isScanning}
            className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-cyan-400 px-6 text-sm font-semibold text-slate-950 shadow-[0_0_30px_rgba(0,240,255,0.25)] transition hover:bg-cyan-300 disabled:opacity-60"
          >
            {isScanning ? <Sparkles className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
            {isScanning ? 'Assessing...' : 'Start Assessment'}
          </button>
        </div>

        <label className="mt-4 flex items-start gap-3 text-sm text-slate-400">
          <input type="checkbox" checked={authorized} onChange={(event) => setAuthorized(event.target.checked)} />
          I confirm I have explicit authorization to assess this target.
        </label>

        {error ? <p className="mt-3 text-sm text-rose-300">{error}</p> : null}
      </form>
    </div>
  );
}
```

Update the scan-start branch in `frontend/src/pages/Dashboard.jsx`:

```jsx
const handleScan = async ({ target, mode }) => {
  setIsScanning(true);
  setError('');
  setScanResult(null);
  setScanStatus('running');
  setCurrentPhase('Network Recon (Nmap)');
  setSelectedMode(mode);

  try {
    const { data } = await startScan(target);
    setScanId(data.scan_id);
    pollRef.current = setInterval(async () => {
      const { data: status } = await getScanStatus(data.scan_id);
      setCurrentPhase(status.current_phase || 'Web Crawl & Audit');
      setScanStatus(status.status);

      if (status.status === 'completed') {
        clearInterval(pollRef.current);
        const { data: results } = await getScanResults(data.scan_id);
        setScanResult(results);
        setIsScanning(false);
      }
    }, 1500);
  } catch (err) {
    setError(err.response?.data?.detail || 'Failed to start scan. Is the backend running?');
    setIsScanning(false);
  }
};
```

- [ ] **Step 5: Run the new test**

Run:

```bash
npm test -- HeaderScanBar.test.jsx
```

Expected:

```text
PASS  src/components/HeaderScanBar.test.jsx
```

- [ ] **Step 6: Commit the normalized scan flow**

Run:

```bash
git add src/utils/dashboard.js src/pages/Dashboard.jsx src/components/HeaderScanBar.jsx src/components/HeaderScanBar.test.jsx
git commit -m "feat: add dashboard command bar and state normalization"
```

## Task 4: Build Metrics, Live Tracker, AI Insights, And Export Cards

**Files:**
- Create: `frontend/src/components/MetricsGrid.jsx`
- Create: `frontend/src/components/ReportExports.jsx`
- Modify: `frontend/src/components/RiskGauge.jsx`
- Modify: `frontend/src/components/RiskChart.jsx`
- Modify: `frontend/src/components/LiveScanActivity.jsx`
- Modify: `frontend/src/components/AIThreatPath.jsx`
- Modify: `frontend/src/pages/Dashboard.jsx`
- Test: `frontend/src/components/LiveScanActivity.test.jsx`

- [ ] **Step 1: Write the stepper state test**

Create `frontend/src/components/LiveScanActivity.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react';
import LiveScanActivity from './LiveScanActivity';

test('marks the active assessment step as running', () => {
  const steps = [
    { label: 'Network Recon (Nmap)', state: 'complete' },
    { label: 'Web Crawl & Audit', state: 'running' },
    { label: 'AI Threat Synthesis', state: 'queued' },
    { label: 'Report Generation', state: 'queued' },
  ];

  render(<LiveScanActivity steps={steps} status="running" />);

  expect(screen.getByText('Web Crawl & Audit')).toHaveClass('text-cyan-300');
  expect(screen.getByText('Report Generation')).toHaveTextContent('Report Generation');
});
```

- [ ] **Step 2: Run the test to verify the current component API does not match**

Run:

```bash
npm test -- LiveScanActivity.test.jsx
```

Expected:

```text
FAIL  src/components/LiveScanActivity.test.jsx
Received props do not include "steps"
```

- [ ] **Step 3: Implement the metrics and insights components**

Create `frontend/src/components/MetricsGrid.jsx`:

```jsx
import { Activity, ShieldCheck, ShieldX, Siren } from 'lucide-react';
import MetricTile from './ui/MetricTile';
import StatusBadge from './ui/StatusBadge';

export default function MetricsGrid({ riskScore, riskLabel, severityCounts, activeScans, healthScore }) {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <MetricTile icon={ShieldX} label="Overall Risk Score" value={`${riskScore}/100`} hint={riskLabel} tone={riskScore >= 80 ? 'critical' : 'default'} />
      <MetricTile icon={Siren} label="Vulnerabilities" value={Object.values(severityCounts).reduce((sum, value) => sum + value, 0)} hint="Critical to low severity">
        <div className="mt-4 flex flex-wrap gap-2">
          <StatusBadge label={`Critical ${severityCounts.critical || 0}`} state="critical" />
          <StatusBadge label={`High ${severityCounts.high || 0}`} state="critical" />
          <StatusBadge label={`Medium ${severityCounts.medium || 0}`} state="healthy" />
          <StatusBadge label={`Low ${severityCounts.low || 0}`} state="healthy" />
        </div>
      </MetricTile>
      <MetricTile icon={Activity} label="Active Scans" value={activeScans} hint="Running assessments across the platform" />
      <MetricTile icon={ShieldCheck} label="Security Health" value={`${healthScore}%`} hint="Composite resilience score" tone="ai" />
    </div>
  );
}
```

Create `frontend/src/components/ReportExports.jsx`:

```jsx
import { Download, FileCode2, FileText } from 'lucide-react';
import GlassCard from './ui/GlassCard';
import SectionHeader from './ui/SectionHeader';

const cards = [
  { label: 'PDF Report', description: 'Executive-ready assessment summary.', icon: FileText },
  { label: 'HTML Report', description: 'Interactive technical findings output.', icon: FileCode2 },
];

export default function ReportExports() {
  return (
    <GlassCard className="p-6">
      <SectionHeader eyebrow="Reporting" title="Export Assessments" description="Generate polished deliverables in one click." />
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {cards.map(({ label, description, icon: Icon }) => (
          <div key={label} className="rounded-2xl border border-white/10 bg-slate-950/60 p-5">
            <div className="flex items-center gap-3 text-white">
              <Icon className="h-5 w-5 text-cyan-300" />
              <h3 className="font-medium">{label}</h3>
            </div>
            <p className="mt-2 text-sm text-slate-400">{description}</p>
            <button className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white/5 px-4 py-2 text-sm text-cyan-300 ring-1 ring-white/10">
              <Download className="h-4 w-4" />
              Download
            </button>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}
```

Update `frontend/src/components/LiveScanActivity.jsx`:

```jsx
import { CheckCircle2, CircleDot, LoaderCircle } from 'lucide-react';
import GlassCard from './ui/GlassCard';
import SectionHeader from './ui/SectionHeader';

export default function LiveScanActivity({ steps = [], status = 'idle' }) {
  return (
    <GlassCard className="p-6">
      <SectionHeader eyebrow="Active Scan" title="Live Assessment Tracker" description="Monitor the current assessment pipeline in real time." />
      <div className="mt-6 space-y-4">
        {steps.map((step) => (
          <div key={step.label} className="flex items-center gap-3 rounded-2xl border border-white/5 bg-slate-950/50 px-4 py-3">
            {step.state === 'complete' ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            ) : step.state === 'running' ? (
              <LoaderCircle className="h-5 w-5 animate-spin text-cyan-300" />
            ) : (
              <CircleDot className="h-5 w-5 text-slate-500" />
            )}
            <span className={step.state === 'running' ? 'text-sm font-medium text-cyan-300' : 'text-sm text-slate-300'}>
              {step.label}
            </span>
          </div>
        ))}
        {status === 'idle' ? <p className="text-sm text-slate-500">No live assessments. Start a scan to populate this tracker.</p> : null}
      </div>
    </GlassCard>
  );
}
```

Update `frontend/src/components/AIThreatPath.jsx` so it renders insight bullets and a readable attack path list instead of the hard-coded graph:

```jsx
import { BrainCircuit, ChevronRight } from 'lucide-react';
import GlassCard from './ui/GlassCard';
import SectionHeader from './ui/SectionHeader';
import StatusBadge from './ui/StatusBadge';

export default function AIThreatPath({ insights = [], attackPath = [] }) {
  return (
    <GlassCard className="p-6" tone="ai">
      <SectionHeader eyebrow="AI Prediction" title="Threat Posture And Attack Path" description="Predicted escalation paths synthesized from scan signals." />
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-3">
          {insights.map((item) => (
            <div key={item} className="rounded-2xl border border-violet-400/20 bg-violet-500/5 p-4 text-sm text-slate-200">
              {item}
            </div>
          ))}
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-medium text-white">
              <BrainCircuit className="h-4 w-4 text-violet-300" />
              Predicted Attack Path
            </h3>
            <StatusBadge label="AI Synthesized" state="ai" />
          </div>
          <div className="mt-4 space-y-3">
            {attackPath.map((node) => (
              <div key={node} className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2 text-sm text-slate-300">
                <ChevronRight className="h-4 w-4 text-violet-300" />
                {node}
              </div>
            ))}
          </div>
        </div>
      </div>
    </GlassCard>
  );
}
```

- [ ] **Step 4: Wire the new components into the dashboard**

Update the dashboard body in `frontend/src/pages/Dashboard.jsx`:

```jsx
import { useMemo, useRef, useState } from 'react';
import AIThreatPath from '../components/AIThreatPath';
import HeaderScanBar from '../components/HeaderScanBar';
import LiveScanActivity from '../components/LiveScanActivity';
import MetricsGrid from '../components/MetricsGrid';
import ReportExports from '../components/ReportExports';
import RiskChart from '../components/RiskChart';
import RiskGauge from '../components/RiskGauge';
import VulnPanel from '../components/VulnPanel';
import { getAiInsights, getLiveSteps, getRiskSummary, getSeverityCounts } from '../utils/dashboard';

const severityCounts = useMemo(() => getSeverityCounts(scanResult?.vulnerabilities), [scanResult]);
const riskScore = scanResult?.risk_score?.overall ?? 18;
const riskMeta = getRiskSummary(riskScore);
const liveSteps = getLiveSteps(currentPhase, scanStatus);
const insights = getAiInsights(scanResult);
const attackPath = ['Internet-facing service', 'Web application weakness', 'Privilege escalation opportunity', 'Sensitive data exposure'];

return (
  <div className="space-y-8">
    <HeaderScanBar onScan={handleScan} isScanning={isScanning} />

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
```

- [ ] **Step 5: Run the tracker test**

Run:

```bash
npm test -- LiveScanActivity.test.jsx
```

Expected:

```text
PASS  src/components/LiveScanActivity.test.jsx
```

- [ ] **Step 6: Commit the dashboard analytical sections**

Run:

```bash
git add src/components/MetricsGrid.jsx src/components/ReportExports.jsx src/components/RiskGauge.jsx src/components/RiskChart.jsx src/components/LiveScanActivity.jsx src/components/AIThreatPath.jsx src/pages/Dashboard.jsx src/components/LiveScanActivity.test.jsx
git commit -m "feat: add dashboard metrics and ai insight panels"
```

## Task 5: Rebuild The Vulnerability Table, Theme, And Responsive Polish

**Files:**
- Modify: `frontend/src/components/VulnPanel.jsx`
- Modify: `frontend/src/components/RiskGauge.jsx`
- Modify: `frontend/src/components/RiskChart.jsx`
- Modify: `frontend/src/index.css`
- Test: `frontend/src/components/VulnPanel.test.jsx`

- [ ] **Step 1: Write the findings filter test**

Create `frontend/src/components/VulnPanel.test.jsx`:

```jsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VulnPanel from './VulnPanel';

const vulnerabilities = [
  { name: 'SQL Injection', endpoint: '/login', type: 'CVE-2024-0001', severity: 'Critical', cvss: 9.8, category: 'OWASP Top 10' },
  { name: 'Missing CSP', endpoint: '/', type: 'Header', severity: 'High', cvss: 7.2, category: 'OWASP Top 10' },
  { name: 'Cookie Flag Missing', endpoint: '/auth', type: 'Cookie', severity: 'Low', cvss: 3.1, category: 'General' },
];

test('filters vulnerabilities by severity tab', async () => {
  const user = userEvent.setup();

  render(<VulnPanel vulnerabilities={vulnerabilities} />);

  await user.click(screen.getByRole('button', { name: /critical/i }));

  expect(screen.getByText('SQL Injection')).toBeInTheDocument();
  expect(screen.queryByText('Missing CSP')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to verify the current table does not implement the new tabs**

Run:

```bash
npm test -- VulnPanel.test.jsx
```

Expected:

```text
FAIL  src/components/VulnPanel.test.jsx
Unable to find role="button" with name /critical/i
```

- [ ] **Step 3: Replace the vulnerability panel with the new filterable table**

Update `frontend/src/components/VulnPanel.jsx`:

```jsx
import { useMemo, useState } from 'react';
import GlassCard from './ui/GlassCard';
import SectionHeader from './ui/SectionHeader';
import StatusBadge from './ui/StatusBadge';

const tabs = ['All', 'Critical', 'High', 'OWASP Top 10'];

export default function VulnPanel({ vulnerabilities = [] }) {
  const [activeTab, setActiveTab] = useState('All');

  const filtered = useMemo(() => {
    if (activeTab === 'All') return vulnerabilities;
    if (activeTab === 'OWASP Top 10') return vulnerabilities.filter((item) => item.category === 'OWASP Top 10');
    return vulnerabilities.filter((item) => item.severity?.toLowerCase() === activeTab.toLowerCase());
  }, [activeTab, vulnerabilities]);

  return (
    <GlassCard className="p-6">
      <SectionHeader
        eyebrow="Findings"
        title="Discovered Vulnerabilities"
        description="Investigate exposed endpoints, severity, and remediation actions."
      />

      <div className="mt-5 flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={
              activeTab === tab
                ? 'rounded-full bg-cyan-400/10 px-4 py-2 text-sm text-cyan-300 ring-1 ring-cyan-400/20'
                : 'rounded-full bg-white/5 px-4 py-2 text-sm text-slate-300'
            }
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="mt-6 overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="text-slate-400">
            <tr className="border-b border-white/10">
              <th className="pb-3">Vulnerability Name</th>
              <th className="pb-3">Target Endpoint</th>
              <th className="pb-3">CVE/Type</th>
              <th className="pb-3">Severity</th>
              <th className="pb-3">CVSS</th>
              <th className="pb-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => (
              <tr key={`${item.name}-${item.endpoint}`} className="border-b border-white/5 text-slate-200">
                <td className="py-4">{item.name}</td>
                <td className="py-4 font-mono text-xs text-cyan-300">{item.endpoint}</td>
                <td className="py-4">{item.type}</td>
                <td className="py-4">
                  <StatusBadge label={item.severity} state={item.severity?.toLowerCase() === 'critical' ? 'critical' : 'healthy'} />
                </td>
                <td className="py-4">{item.cvss}</td>
                <td className="py-4">
                  <div className="flex gap-2">
                    <button className="rounded-xl bg-white/5 px-3 py-2 text-xs text-slate-200">View Details</button>
                    <button className="rounded-xl bg-cyan-400/10 px-3 py-2 text-xs text-cyan-300">Remediate</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 ? <p className="py-10 text-center text-sm text-slate-500">No vulnerabilities in this filter yet.</p> : null}
      </div>
    </GlassCard>
  );
}
```

- [ ] **Step 4: Apply the approved theme tokens and background polish**

Update `frontend/src/index.css`:

```css
@import "tailwindcss";

@theme {
  --color-bg-primary: #0B0F17;
  --color-bg-secondary: #111827;
  --color-bg-card: rgba(15, 23, 42, 0.72);
  --color-bg-input: rgba(15, 23, 42, 0.9);
  --color-border-default: rgba(148, 163, 184, 0.12);
  --color-text-primary: #F8FAFC;
  --color-text-secondary: #CBD5E1;
  --color-text-muted: #64748B;
  --color-accent-primary: #00F0FF;
  --color-accent-secondary: #8B5CF6;
  --color-severity-critical: #FF3366;
  --color-severity-high: #FB7185;
  --color-severity-medium: #F59E0B;
  --color-severity-low: #10B981;
}

html,
body,
#root {
  min-height: 100%;
}

body {
  margin: 0;
  font-family: Inter, "Segoe UI", system-ui, sans-serif;
  background:
    radial-gradient(circle at top, rgba(0, 240, 255, 0.08), transparent 22%),
    radial-gradient(circle at right, rgba(139, 92, 246, 0.1), transparent 24%),
    #0B0F17;
  color: #F8FAFC;
}

.glass-panel {
  border: 1px solid rgba(148, 163, 184, 0.12);
  background: rgba(15, 23, 42, 0.65);
  backdrop-filter: blur(18px);
  box-shadow: 0 24px 80px rgba(2, 6, 23, 0.45);
}
```

- [ ] **Step 5: Run the findings test, lint, and production build**

Run:

```bash
npm test -- VulnPanel.test.jsx
npm run lint
npm run build
```

Expected:

```text
PASS  src/components/VulnPanel.test.jsx
Found 0 warnings and 0 errors.
vite v8...
✓ built in ...
```

- [ ] **Step 6: Commit the UI polish pass**

Run:

```bash
git add src/components/VulnPanel.jsx src/components/VulnPanel.test.jsx src/components/RiskGauge.jsx src/components/RiskChart.jsx src/index.css
git commit -m "feat: finish dashboard findings and visual polish"
```

## Task 6: Final Verification

**Files:**
- Modify: `frontend/src/pages/Dashboard.jsx`
- Test: `frontend/src/App.test.jsx`
- Test: `frontend/src/components/HeaderScanBar.test.jsx`
- Test: `frontend/src/components/LiveScanActivity.test.jsx`
- Test: `frontend/src/components/VulnPanel.test.jsx`

- [ ] **Step 1: Remove dead imports and stabilize the final dashboard composition**

Clean up `frontend/src/pages/Dashboard.jsx` so it no longer imports orphaned legacy sections such as `QuickInfo`, `PortTable`, `HeadersPanel`, `CookiePanel`, `SSLPanel`, and `ReportDownload` unless they are still rendered in the new composition.

Use a final import block like:

```jsx
import { useEffect, useMemo, useRef, useState } from 'react';
import AIThreatPath from '../components/AIThreatPath';
import HeaderScanBar from '../components/HeaderScanBar';
import LiveScanActivity from '../components/LiveScanActivity';
import MetricsGrid from '../components/MetricsGrid';
import ReportExports from '../components/ReportExports';
import RiskChart from '../components/RiskChart';
import RiskGauge from '../components/RiskGauge';
import VulnPanel from '../components/VulnPanel';
import { getAiInsights, getLiveSteps, getRiskSummary, getSeverityCounts } from '../utils/dashboard';
import { getScanResults, getScanStatus, startScan } from '../api/client';
```

- [ ] **Step 2: Run the full frontend test suite**

Run:

```bash
npm test
```

Expected:

```text
PASS  src/App.test.jsx
PASS  src/components/HeaderScanBar.test.jsx
PASS  src/components/LiveScanActivity.test.jsx
PASS  src/components/VulnPanel.test.jsx
```

- [ ] **Step 3: Run lint and build one more time**

Run:

```bash
npm run lint
npm run build
```

Expected:

```text
Found 0 warnings and 0 errors.
✓ built in ...
```

- [ ] **Step 4: Manual UI smoke test**

Run:

```bash
npm run dev
```

Verify manually in the browser:

```text
1. Sidebar shows all seven requested sections.
2. Header shows input, scan mode, and Start Assessment action.
3. Empty dashboard looks complete before any scan runs.
4. Starting a scan shows live tracker activity.
5. Metrics, AI panel, findings table, and export cards align cleanly on desktop and tablet widths.
```

- [ ] **Step 5: Commit the verified UI redesign**

Run:

```bash
git add src/pages/Dashboard.jsx src/components src/utils/dashboard.js src/index.css src/App.jsx
git commit -m "feat: deliver vulnguard dashboard redesign"
```

## Self-Review

### Spec Coverage

- Platform shell and seven requested nav items: Task 2
- Command bar with target input, scan mode, and primary action: Task 3
- Metrics cards, live tracker, AI panel, and exports: Task 4
- Vulnerability table with requested columns and filters: Task 5
- Dark theme, responsive layout, and visual polish: Tasks 2 and 5
- Testing for route shell, command bar, tracker, and findings filters: Tasks 1 through 6

### Placeholder Scan

- No `TODO`, `TBD`, or deferred implementation markers remain.
- Every code-changing step contains concrete code or a concrete code target.
- Every verification step includes an exact command and expected output.

### Type Consistency

- `HeaderScanBar` submits `{ target, mode }`
- `Dashboard` owns polling and passes normalized props downward
- `LiveScanActivity` consumes `steps`
- `AIThreatPath` consumes `insights` and `attackPath`
- `VulnPanel` consumes normalized `vulnerabilities`

