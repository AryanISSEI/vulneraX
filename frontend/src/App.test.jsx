import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

test('renders the VulnGuard brand and primary dashboard navigation', () => {
  render(<App />);

  expect(screen.getByText('VulnGuard')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /dashboard/i })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /reports/i })).toBeInTheDocument();
});
