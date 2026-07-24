import React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import HeaderScanBar from './HeaderScanBar';

test('requires an authorized target before starting an assessment', async () => {
  const onScan = vi.fn();
  const user = userEvent.setup();

  render(<HeaderScanBar onScan={onScan} isScanning={false} />);

  await user.type(screen.getByPlaceholderText(/enter ip or domain/i), 'target.example.com');
  await user.click(screen.getByRole('button', { name: /start assessment/i }));

  expect(screen.getAllByText(/explicit authorization/i).length).toBeGreaterThan(0);
  expect(onScan).not.toHaveBeenCalled();
});
