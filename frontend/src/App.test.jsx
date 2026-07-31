import React from 'react';
import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import App from './App';

vi.mock('./api/client', async () => {
  const actual = await vi.importActual('./api/client');
  return {
    ...actual,
    getMe: vi.fn().mockResolvedValue({ data: { id: 1, username: 'spandana' } }),
  };
});

test('renders the routed platform shell', async () => {
  localStorage.setItem('vulnerax_token', 'mock-test-token');
  render(<App />);

  expect(await screen.findByRole('link', { name: /dashboard/i })).toBeInTheDocument();
  expect(await screen.findByRole('link', { name: /active scans/i })).toBeInTheDocument();
  expect(await screen.findByRole('link', { name: /ai reports/i })).toBeInTheDocument();
});
