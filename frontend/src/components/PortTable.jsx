import { Network, Wifi } from 'lucide-react';
import GlassCard from './ui/GlassCard';
import SectionHeader from './ui/SectionHeader';
import { motion } from 'framer-motion';

export default function PortTable({ ports }) {
  if (!ports || ports.length === 0) {
    return (
      <GlassCard glowColor="cyan" delay={0.2}>
        <SectionHeader title="Network Topology" subtitle="0 open ports detected" icon={Network} color="cyan" />
        <div className="h-64 flex items-center justify-center">
          <p className="text-sm text-muted-foreground font-mono">No active connections found.</p>
        </div>
      </GlassCard>
    );
  }

  return (
    <div className="space-y-6">
      {/* 3D Node Graph Visualization */}
      <GlassCard glowColor="cyan" delay={0.2} className="relative overflow-hidden">
        <SectionHeader title="Network Topology" subtitle={`${ports.length} nodes active`} icon={Network} color="cyan" />
        
        <div className="relative h-[300px] w-full flex items-center justify-center mt-4">
          <div className="absolute inset-0 bg-primary/5 blur-3xl rounded-full scale-150 pointer-events-none" />
          
          {/* Connection Lines */}
          {ports.map((port, i) => {
            const isRisky = [21, 23, 445, 3389].includes(port.port);
            const angle = (i / ports.length) * 360;
            return (
              <div 
                key={`line-${i}`}
                className={`absolute top-1/2 left-1/2 h-[1px] origin-left opacity-40 ${isRisky ? 'bg-destructive' : 'bg-green-500'}`}
                style={{ width: '130px', transform: `rotate(${angle}deg)` }}
              />
            );
          })}

          {/* Central Server Node */}
          <div className="relative z-10 w-24 h-24 bg-black border-2 border-primary rounded-full shadow-[0_0_30px_rgba(0,240,255,0.4)] flex items-center justify-center animate-pulse">
             <Network className="h-10 w-10 text-primary" />
          </div>

          {/* Orbiting Port Nodes */}
          {ports.map((port, i) => {
            const isRisky = [21, 23, 445, 3389].includes(port.port);
            const colorClass = isRisky ? "bg-destructive/20 border-destructive shadow-[0_0_15px_#ff003c]" : "bg-green-500/20 border-green-500 shadow-[0_0_15px_#39ff14]";
            const textColor = isRisky ? "text-destructive" : "text-green-500";
            
            const angle = (i / ports.length) * Math.PI * 2;
            const radius = 130;
            const x = Math.cos(angle) * radius;
            const y = Math.sin(angle) * radius;
            
            return (
              <motion.div
                key={i}
                className="absolute left-1/2 top-1/2 z-20"
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.5 + i * 0.1, type: "spring" }}
                style={{ marginLeft: x - 20, marginTop: y - 20 }}
              >
                <div className="relative group cursor-pointer">
                  <div className={`w-10 h-10 rounded-full border-2 backdrop-blur flex items-center justify-center transition-transform hover:scale-125 ${colorClass}`}>
                    <span className="text-[10px] font-bold text-white font-mono">{port.port}</span>
                  </div>
                  <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-black border border-white/10 px-2 py-1 rounded text-[10px] font-mono whitespace-nowrap z-30 shadow-xl pointer-events-none">
                    <span className={textColor}>{port.service || 'unknown'}</span>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </GlassCard>

      {/* Standard Details Table */}
      <GlassCard glowColor="cyan" delay={0.4}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-black/40">
              <tr className="border-b border-border text-left">
                <th className="px-4 py-3 font-medium text-muted-foreground text-[10px] uppercase tracking-widest font-mono">Port</th>
                <th className="px-4 py-3 font-medium text-muted-foreground text-[10px] uppercase tracking-widest font-mono">Service</th>
                <th className="px-4 py-3 font-medium text-muted-foreground text-[10px] uppercase tracking-widest font-mono">State</th>
                <th className="px-4 py-3 font-medium text-muted-foreground text-[10px] uppercase tracking-widest font-mono">Banner</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {ports.map((port, i) => {
                 const isRisky = [21, 23, 445, 3389].includes(port.port);
                 return (
                <tr key={`${port.port}-${i}`} className="group hover:bg-white/5 transition-colors">
                  <td className="px-4 py-3 font-mono font-bold text-primary">{port.port}</td>
                  <td className="px-4 py-3 font-mono text-xs text-white flex items-center gap-2">
                    <Wifi className="h-3 w-3 text-muted-foreground" />
                    {port.service || 'unknown'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium border ${isRisky ? 'bg-destructive/10 text-destructive border-destructive/20' : 'bg-green-500/10 text-green-500 border-green-500/20'}`}>
                      <span className={`h-1.5 w-1.5 rounded-full animate-pulse ${isRisky ? 'bg-destructive' : 'bg-green-500'}`} />
                      {port.state}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground truncate max-w-[200px]">{port.banner || '—'}</td>
                </tr>
              )})}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  );
}
