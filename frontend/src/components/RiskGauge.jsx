import React, { useEffect, useRef } from 'react';
import { riskScoreColor } from '../utils/helpers';
import { Gauge } from 'lucide-react';
import GlassCard from './ui/GlassCard';
import SectionHeader from './ui/SectionHeader';

export default function RiskGauge({ score }) {
  const canvasRef = useRef(null);
  const animatedScore = useRef(0);
  const animFrameRef = useRef(null);

  const info = riskScoreColor(score ?? 100);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const size = 200;
    canvas.width = size * dpr;
    canvas.height = (size * 0.65) * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size * 0.65}px`;
    ctx.scale(dpr, dpr);

    const cx = size / 2;
    const cy = size * 0.55;
    const radius = size * 0.4;
    const lineWidth = 12;
    const startAngle = Math.PI;
    const endAngle = 2 * Math.PI;

    const targetScore = score ?? 100;

    function draw(currentScore) {
      ctx.clearRect(0, 0, size, size);

      // Background arc
      ctx.beginPath();
      ctx.arc(cx, cy, radius, startAngle, endAngle);
      ctx.strokeStyle = 'rgba(99, 102, 241, 0.1)';
      ctx.lineWidth = lineWidth;
      ctx.lineCap = 'round';
      ctx.stroke();

      // Score arc
      const scoreAngle = startAngle + (currentScore / 100) * Math.PI;
      const gradient = ctx.createLinearGradient(0, cy, size, cy);
      gradient.addColorStop(0, '#ef4444');
      gradient.addColorStop(0.3, '#f97316');
      gradient.addColorStop(0.5, '#eab308');
      gradient.addColorStop(0.7, '#3b82f6');
      gradient.addColorStop(1, '#34d399');

      ctx.beginPath();
      ctx.arc(cx, cy, radius, startAngle, scoreAngle);
      ctx.strokeStyle = gradient;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = 'round';
      ctx.stroke();

      // Glow effect
      ctx.beginPath();
      ctx.arc(cx, cy, radius, startAngle, scoreAngle);
      ctx.strokeStyle = info.color + '30';
      ctx.lineWidth = lineWidth + 8;
      ctx.lineCap = 'round';
      ctx.stroke();

      // Score text
      ctx.fillStyle = info.color;
      ctx.font = 'bold 36px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(Math.round(currentScore), cx, cy - 8);

      // Label
      ctx.fillStyle = '#94a3b8';
      ctx.font = '10px Inter, sans-serif';
      ctx.fillText('RISK SCORE', cx, cy + 16);
    }

    // Animate
    const duration = 1200;
    const startTime = performance.now();
    const startVal = animatedScore.current;

    function animate(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = startVal + (targetScore - startVal) * eased;

      animatedScore.current = current;
      draw(current);

      if (progress < 1) {
        animFrameRef.current = requestAnimationFrame(animate);
      }
    }

    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [score, info.color]);

  return (
    <GlassCard className="flex flex-col items-center flex-1 w-full h-full p-6">
      <div className="self-start w-full">
        <SectionHeader 
          title="Risk Score" 
          subtitle={info.label} 
          icon={Gauge} 
          color="cyan" 
        />
      </div>
      <div className="relative z-10 scale-110 mt-4 flex-1 flex items-center justify-center">
        <canvas ref={canvasRef} />
      </div>
    </GlassCard>
  );
}
