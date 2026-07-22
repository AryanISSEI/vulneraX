import React from 'react';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Doughnut } from 'react-chartjs-2';
import { countBySeverity } from '../utils/helpers';
import { PieChart } from 'lucide-react';
import GlassCard from './ui/GlassCard';
import SectionHeader from './ui/SectionHeader';

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
    <GlassCard animateFloat glowColor="violet" delay={0.5}>
      <SectionHeader 
        title="Finding Distribution" 
        subtitle={`${total} total finding${total !== 1 ? 's' : ''}`} 
        icon={PieChart} 
        color="violet" 
      />

      <div className="relative h-[220px] z-10">
        <div className="absolute inset-0 bg-black/20 rounded-full blur-xl -z-10 transform scale-75"></div>
        <Doughnut data={data} options={options} />
        {/* Center label */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ marginBottom: '40px' }}>
          <div className="text-center">
            <span className="text-3xl font-mono text-white glow-text-cyan">{total}</span>
            <br />
            <span className="text-[10px] font-mono text-text-muted uppercase tracking-wider">Findings</span>
          </div>
        </div>
      </div>
    </GlassCard>
  );
}
