import React from 'react';
import { Chart as ChartJS, RadialLinearScale, PointElement, LineElement, Filler, Tooltip, Legend } from 'chart.js';
import { Radar } from 'react-chartjs-2';
import { countBySeverity } from '../utils/helpers';
import { Activity } from 'lucide-react';
import GlassCard from './ui/GlassCard';
import SectionHeader from './ui/SectionHeader';

ChartJS.register(RadialLinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

export default function RiskChart({ vulnerabilities }) {
  const counts = countBySeverity(vulnerabilities);
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  if (total === 0) return null;

  // Radar chart data using Red/Black theme
  const data = {
    labels: ['Critical', 'High', 'Medium', 'Low', 'Info'],
    datasets: [
      {
        label: 'Vulnerability Density',
        data: [counts.critical, counts.high, counts.medium, counts.low, counts.info],
        backgroundColor: 'rgba(220, 38, 38, 0.2)', // Red transparent
        borderColor: 'rgba(220, 38, 38, 1)',
        pointBackgroundColor: [
          '#ff0000', // Critical
          '#ff7e00', // High
          '#facc15', // Medium
          '#39ff14', // Low
          '#6b7280', // Info
        ],
        pointBorderColor: 'rgba(128, 128, 128, 0.8)',
        pointHoverBackgroundColor: '#fff',
        pointHoverBorderColor: 'rgba(220, 38, 38, 1)',
        borderWidth: 2,
        pointRadius: 5,
        pointHoverRadius: 8,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      r: {
        angleLines: {
          color: 'rgba(128, 128, 128, 0.3)'
        },
        grid: {
          color: 'rgba(128, 128, 128, 0.3)',
          circular: true,
        },
        pointLabels: {
          color: '#dc2626',
          font: { family: 'monospace', size: 11, weight: 'bold' }
        },
        ticks: {
          display: false,
          min: 0,
        }
      }
    },
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleColor: '#dc2626',
        bodyColor: '#f8fafc',
        borderColor: 'rgba(220, 38, 38, 0.3)',
        borderWidth: 1,
        padding: 12,
        cornerRadius: 4,
        displayColors: false,
        titleFont: { family: 'monospace' },
        bodyFont: { family: 'monospace' },
      },
    },
  };

  return (
    <GlassCard className="flex flex-col h-full p-6 w-full">
      <SectionHeader 
        title="Vulnerability Spectrum" 
        subtitle="Radar threat analysis" 
        icon={Activity} 
        color="red" 
      />

      <div className="relative flex-1 w-full min-h-[250px] z-10 mt-4 flex items-center justify-center">
        <Radar data={data} options={options} />
      </div>
    </GlassCard>
  );
}
