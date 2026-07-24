import React from 'react';
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
