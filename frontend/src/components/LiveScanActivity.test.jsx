import React from 'react';
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
