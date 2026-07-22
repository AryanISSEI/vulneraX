import React from 'react';
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
