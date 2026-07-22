import { useEffect, useRef } from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';
import { countBySeverity } from '../utils/helpers';
import { PieChart } from 'lucide-react';

ChartJS.register(ArcElement, Tooltip, Legend);

export default function RiskChart({ vulnerabilities }) {
  const counts = countBySeverity(vulnerabilities);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  if (total === 0) return null;

  const data = {
    labels: ['Critical', 'High', 'Medium', 'Low', 'Info'],
    datasets: [
      {
        data: [counts.critical, counts.high, counts.medium, counts.low, counts.info],
        backgroundColor: [
          'rgba(239, 68, 68, 0.8)',
          'rgba(249, 115, 22, 0.8)',
          'rgba(234, 179, 8, 0.8)',
          'rgba(59, 130, 246, 0.8)',
          'rgba(107, 114, 128, 0.8)',
        ],
        borderColor: [
          'rgba(239, 68, 68, 1)',
          'rgba(249, 115, 22, 1)',
          'rgba(234, 179, 8, 1)',
          'rgba(59, 130, 246, 1)',
          'rgba(107, 114, 128, 1)',
        ],
        borderWidth: 2,
        hoverBorderWidth: 3,
        hoverOffset: 8,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '65%',
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          color: '#94a3b8',
          padding: 16,
          usePointStyle: true,
          pointStyle: 'circle',
          font: { size: 11, family: 'Inter' },
        },
      },
      tooltip: {
        backgroundColor: '#1a2035',
        titleColor: '#e2e8f0',
        bodyColor: '#94a3b8',
        borderColor: 'rgba(99, 102, 241, 0.3)',
        borderWidth: 1,
        padding: 12,
        cornerRadius: 8,
        titleFont: { weight: '600' },
      },
    },
  };

  return (
    <div className="glass-panel p-6 sm:p-8 animate-fade-in">
      <div className="flex items-center gap-3 mb-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-primary/10">
          <PieChart className="h-5 w-5 text-accent-primary" />
        </div>
        <div>
          <h3 className="font-semibold text-text-primary">Finding Distribution</h3>
          <p className="text-xs text-text-muted">{total} total finding{total !== 1 ? 's' : ''}</p>
        </div>
      </div>

      <div className="relative h-[220px]">
        <Doughnut data={data} options={options} />
        {/* Center label */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ marginBottom: '40px' }}>
          <div className="text-center">
            <span className="text-3xl font-bold text-text-primary">{total}</span>
            <br />
            <span className="text-[10px] text-text-muted uppercase tracking-wider">Findings</span>
          </div>
        </div>
      </div>
    </div>
  );
}
