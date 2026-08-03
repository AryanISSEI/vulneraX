import React, { useRef, useEffect, useState } from 'react';
import { Network, Wifi, ShieldAlert, ShieldCheck, RotateCcw, Play, Pause, Eye, Search } from 'lucide-react';
import GlassCard from './ui/GlassCard';
import SectionHeader from './ui/SectionHeader';
import { motion, AnimatePresence } from 'framer-motion';

const HIGH_RISK_PORTS = [21, 23, 445, 1433, 3306, 3389, 5432, 6379, 27017];

export default function PortTable({ ports = [] }) {
  const [filter, setFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [autoRotate, setAutoRotate] = useState(true);
  const [showRadar, setShowRadar] = useState(true);
  const [selectedNode, setSelectedNode] = useState(null);
  const [hoveredNode, setHoveredNode] = useState(null);

  const canvasRef = useRef(null);
  const rotationRef = useRef({ rotX: 0.3, rotY: 0.5 });
  const isDraggingRef = useRef(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });
  const animFrameRef = useRef(null);

  // Filter ports based on category and search
  const filteredPorts = ports.filter((p) => {
    const isRisky = HIGH_RISK_PORTS.includes(p.port);
    const isWeb = [80, 443, 8080, 8443, 3000].includes(p.port);
    
    if (filter === 'risky' && !isRisky) return false;
    if (filter === 'web' && !isWeb) return false;
    if (filter === 'infra' && (isWeb || isRisky)) return false;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        p.port.toString().includes(q) ||
        (p.service || '').toLowerCase().includes(q) ||
        (p.banner || '').toLowerCase().includes(q)
      )
    }

    return true;
  });

  // Calculate quick metrics
  const riskyCount = ports.filter(p => HIGH_RISK_PORTS.includes(p.port)).length;
  const webCount = ports.filter(p => [80, 443, 8080, 8443, 3000].includes(p.port)).length;
  const secureCount = ports.length - riskyCount;

  // 3D Canvas rendering effect
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = canvas.parentElement?.clientWidth || 600;
    let height = 360;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    let particles = [];
    const particleCount = 20;
    for (let i = 0; i < particleCount; i++) {
      particles.push({
        portIndex: i % (ports.length || 1),
        progress: Math.random(),
        speed: 0.005 + Math.random() * 0.008
      });
    }

    let radarAngle = 0;

    function render() {
      if (!ctx || !canvas) return;
      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      const cx = width / 2;
      const cy = height / 2;
      const radius3D = Math.min(width, height) * 0.32;

      // Auto-rotation
      if (autoRotate && !isDraggingRef.current) {
        rotationRef.current.rotY += 0.004;
      }
      radarAngle += 0.02;

      const { rotX, rotY } = rotationRef.current;

      // Draw background ambient glow
      const bgGlow = ctx.createRadialGradient(cx, cy, 10, cx, cy, radius3D * 1.5);
      bgGlow.addColorStop(0, 'rgba(56, 189, 248, 0.08)');
      bgGlow.addColorStop(0.5, 'rgba(15, 23, 42, 0.04)');
      bgGlow.addColorStop(1, 'transparent');
      ctx.fillStyle = bgGlow;
      ctx.fillRect(0, 0, width, height);

      // Draw Orbital 3D Reference Rings
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.12)';
      ctx.lineWidth = 1;

      [radius3D * 0.6, radius3D, radius3D * 1.25].forEach((rRing) => {
        ctx.beginPath();
        for (let a = 0; a <= Math.PI * 2; a += 0.1) {
          const rx = rRing * Math.cos(a);
          const ry = 0;
          const rz = rRing * Math.sin(a);

          // 3D rotation transform
          const y1 = ry * Math.cos(rotX) - rz * Math.sin(rotX);
          const z1 = ry * Math.sin(rotX) + rz * Math.cos(rotX);
          const x2 = rx * Math.cos(rotY) + z1 * Math.sin(rotY);
          const z2 = -rx * Math.sin(rotY) + z1 * Math.cos(rotY);

          const scale = 400 / (400 + z2);
          const sx = cx + x2 * scale;
          const sy = cy + y1 * scale;

          if (a === 0) ctx.moveTo(sx, sy);
          else ctx.lineTo(sx, sy);
        }
        ctx.closePath();
        ctx.stroke();
      });

      // Draw Radar Scan Beam
      if (showRadar) {
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        const rx = radius3D * 1.3 * Math.cos(radarAngle);
        const rz = radius3D * 1.3 * Math.sin(radarAngle);
        const y1 = -rz * Math.sin(rotX);
        const z1 = rz * Math.cos(rotX);
        const x2 = rx * Math.cos(rotY) + z1 * Math.sin(rotY);
        const z2 = -rx * Math.sin(rotY) + z1 * Math.cos(rotY);
        const scale = 400 / (400 + z2);
        const sx = cx + x2 * scale;
        const sy = cy + y1 * scale;

        ctx.lineTo(sx, sy);
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
      }

      // Map 3D Nodes
      const projectedNodes = ports.map((port, i) => {
        const theta = (i / Math.max(1, ports.length)) * Math.PI * 2;
        const phi = Math.sin(i * 1.5) * 0.6; // Vertical distribution

        const x0 = radius3D * Math.cos(theta) * Math.cos(phi);
        const y0 = radius3D * Math.sin(phi);
        const z0 = radius3D * Math.sin(theta) * Math.cos(phi);

        // Rotate X
        const y1 = y0 * Math.cos(rotX) - z0 * Math.sin(rotX);
        const z1 = y0 * Math.sin(rotX) + z0 * Math.cos(rotX);
        // Rotate Y
        const x2 = x0 * Math.cos(rotY) + z1 * Math.sin(rotY);
        const z2 = -x0 * Math.sin(rotY) + z1 * Math.cos(rotY);

        const scale = 400 / (400 + z2);
        const sx = cx + x2 * scale;
        const sy = cy + y1 * scale;

        const isRisky = HIGH_RISK_PORTS.includes(port.port);
        const color = isRisky ? '#ef4444' : '#22c55e';

        return {
          port,
          index: i,
          sx,
          sy,
          z: z2,
          scale,
          color,
          isRisky
        };
      });

      // Sort by depth Z (back to front)
      projectedNodes.sort((a, b) => a.z - b.z);

      // Draw Connection Beams from Central Server Hub to Nodes
      projectedNodes.forEach((node) => {
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(node.sx, node.sy);
        const alpha = Math.max(0.1, Math.min(0.6, (node.z + radius3D) / (radius3D * 2)));
        ctx.strokeStyle = node.isRisky ? `rgba(239, 68, 68, ${alpha})` : `rgba(34, 197, 94, ${alpha})`;
        ctx.lineWidth = 1 * node.scale;
        ctx.stroke();
      });

      // Animated Energy Data Pulses
      particles.forEach((pt) => {
        pt.progress += pt.speed;
        if (pt.progress > 1) pt.progress = 0;

        const targetNode = projectedNodes[pt.portIndex % projectedNodes.length];
        if (targetNode) {
          const px = cx + (targetNode.sx - cx) * pt.progress;
          const py = cy + (targetNode.sy - cy) * pt.progress;

          ctx.beginPath();
          ctx.arc(px, py, 3 * targetNode.scale, 0, Math.PI * 2);
          ctx.fillStyle = targetNode.color;
          ctx.fill();
        }
      });

      // Draw Central Server Hub Node
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, 18, 0, Math.PI * 2);
      ctx.fillStyle = '#090d16';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#38bdf8';
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx, cy, 8, 0, Math.PI * 2);
      ctx.fillStyle = '#38bdf8';
      ctx.fill();
      ctx.restore();

      // Render 3D Port Nodes
      projectedNodes.forEach((node) => {
        const isHovered = hoveredNode?.port === node.port.port || selectedNode?.port === node.port.port;
        const radius = (isHovered ? 14 : 10) * node.scale;

        // Node Glow
        ctx.beginPath();
        ctx.arc(node.sx, node.sy, radius + 6, 0, Math.PI * 2);
        ctx.fillStyle = node.color + (isHovered ? '50' : '20');
        ctx.fill();

        // Node Circle
        ctx.beginPath();
        ctx.arc(node.sx, node.sy, radius, 0, Math.PI * 2);
        ctx.fillStyle = '#0f172a';
        ctx.fill();
        ctx.lineWidth = 2 * node.scale;
        ctx.strokeStyle = node.color;
        ctx.stroke();

        // Node Port Text
        ctx.fillStyle = '#e2e8f0';
        ctx.font = `bold ${Math.max(8, Math.round(9 * node.scale))}px Inter, monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(node.port.port.toString(), node.sx, node.sy);

        // Service Label
        ctx.fillStyle = node.color;
        ctx.font = `${Math.max(7, Math.round(8 * node.scale))}px Inter, sans-serif`;
        ctx.fillText((node.port.service || 'port').toUpperCase(), node.sx, node.sy + radius + 10);
      });

      ctx.restore();
      animFrameRef.current = requestAnimationFrame(render);
    }

    render();

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [ports, autoRotate, showRadar, hoveredNode, selectedNode]);

  // Mouse Interaction handlers for 3D Orbit Dragging & Selection
  const handleMouseDown = (e) => {
    isDraggingRef.current = true;
    lastMouseRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e) => {
    if (!isDraggingRef.current) {
      // Check node hover
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;

      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const radius3D = Math.min(rect.width, rect.height) * 0.32;
      const { rotX, rotY } = rotationRef.current;

      let hovered = null;
      ports.forEach((p, i) => {
        const theta = (i / Math.max(1, ports.length)) * Math.PI * 2;
        const phi = Math.sin(i * 1.5) * 0.6;
        const x0 = radius3D * Math.cos(theta) * Math.cos(phi);
        const y0 = radius3D * Math.sin(phi);
        const z0 = radius3D * Math.sin(theta) * Math.cos(phi);

        const y1 = y0 * Math.cos(rotX) - z0 * Math.sin(rotX);
        const z1 = y0 * Math.sin(rotX) + z0 * Math.cos(rotX);
        const x2 = x0 * Math.cos(rotY) + z1 * Math.sin(rotY);
        const z2 = -x0 * Math.sin(rotY) + z1 * Math.cos(rotY);

        const scale = 400 / (400 + z2);
        const sx = cx + x2 * scale;
        const sy = cy + y1 * scale;

        const dist = Math.hypot(mx - sx, my - sy);
        if (dist < 18 * scale) {
          hovered = p;
        }
      });
      setHoveredNode(hovered);
      return;
    }

    const dx = e.clientX - lastMouseRef.current.x;
    const dy = e.clientY - lastMouseRef.current.y;

    rotationRef.current.rotY += dx * 0.01;
    rotationRef.current.rotX += dy * 0.01;

    lastMouseRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  const handleCanvasClick = () => {
    if (hoveredNode) {
      setSelectedNode(hoveredNode);
    } else {
      setSelectedNode(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* 3D Network Topology & Scanner Visualizer Card */}
      <GlassCard delay={0.2} className="relative overflow-hidden p-6 border border-primary/20 shadow-2xl">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border/50 pb-4">
          <SectionHeader
            title="3D Network Topology & Scan Visualizer"
            subtitle={`${ports.length} connected ports scanned in 3D node space`}
            icon={Network}
            color="cyan"
          />

          {/* Quick Metrics & Controls */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              {secureCount} Standard
            </span>
            {riskyCount > 0 && (
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20 animate-pulse">
                {riskyCount} High Risk
              </span>
            )}
            <button
              onClick={() => setAutoRotate(!autoRotate)}
              className={`p-2 rounded-lg border text-xs font-medium transition-colors flex items-center gap-1.5 ${
                autoRotate
                  ? 'bg-primary/20 text-primary border-primary/30'
                  : 'bg-secondary/40 text-muted-foreground border-border'
              }`}
              title="Toggle 3D Auto-Rotation"
            >
              {autoRotate ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              3D Rotate
            </button>
            <button
              onClick={() => setShowRadar(!showRadar)}
              className={`p-2 rounded-lg border text-xs font-medium transition-colors flex items-center gap-1.5 ${
                showRadar
                  ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30'
                  : 'bg-secondary/40 text-muted-foreground border-border'
              }`}
              title="Toggle Radar Sweep Beam"
            >
              Radar Sweep
            </button>
            <button
              onClick={() => {
                rotationRef.current = { rotX: 0.3, rotY: 0.5 };
              }}
              className="p-2 rounded-lg border border-border bg-secondary/40 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              title="Reset 3D View Camera"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="flex flex-wrap items-center justify-between gap-3 mt-4">
          <div className="flex items-center gap-2">
            {[
              { id: 'all', label: `All (${ports.length})` },
              { id: 'risky', label: `High Risk (${riskyCount})` },
              { id: 'web', label: `Web (${webCount})` },
              { id: 'infra', label: 'Infrastructure' },
            ].map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setFilter(id)}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                  filter === id
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-secondary/40 text-muted-foreground hover:bg-secondary hover:text-foreground'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="relative w-48">
            <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search port or service..."
              className="w-full h-8 pl-8 pr-3 bg-secondary/40 border border-border/60 rounded-lg text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary"
            />
          </div>
        </div>

        {/* 3D Interactive Canvas Scene */}
        <div className="relative w-full h-[360px] mt-4 rounded-xl bg-black/60 border border-border/40 overflow-hidden cursor-grab active:cursor-grabbing">
          <canvas
            ref={canvasRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onClick={handleCanvasClick}
            className="w-full h-full block"
          />

          {/* Interactive Tooltip Card for Selected / Hovered Port */}
          <AnimatePresence>
            {(selectedNode || hoveredNode) && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 10 }}
                className="absolute top-4 right-4 z-30 p-4 rounded-xl bg-black/90 border border-primary/40 backdrop-blur-md shadow-2xl max-w-xs space-y-2 pointer-events-none"
              >
                <div className="flex items-center justify-between border-b border-border/50 pb-2">
                  <span className="font-mono text-sm font-bold text-primary flex items-center gap-1.5">
                    <Wifi className="h-4 w-4" />
                    Port {(selectedNode || hoveredNode).port}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase ${
                    HIGH_RISK_PORTS.includes((selectedNode || hoveredNode).port)
                      ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                      : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  }`}>
                    {HIGH_RISK_PORTS.includes((selectedNode || hoveredNode).port) ? 'High Risk' : 'Standard'}
                  </span>
                </div>

                <div className="text-xs font-mono space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Service:</span>
                    <span className="text-foreground font-bold">{(selectedNode || hoveredNode).service || 'unknown'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">State:</span>
                    <span className="text-emerald-400 font-bold">{(selectedNode || hoveredNode).state || 'open'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Banner:</span>
                    <span className="text-muted-foreground truncate max-w-[140px]" title={(selectedNode || hoveredNode).banner}>
                      {(selectedNode || hoveredNode).banner || '—'}
                    </span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Hint Overlay */}
          <div className="absolute bottom-3 left-3 pointer-events-none text-[10px] text-muted-foreground font-mono bg-black/60 px-2.5 py-1 rounded-md border border-border/40 flex items-center gap-1.5">
            <Eye className="h-3 w-3 text-primary" />
            Drag mouse to rotate 3D view | Hover or click nodes to inspect
          </div>
        </div>
      </GlassCard>

      {/* Details Table */}
      <GlassCard delay={0.4} className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold font-mono uppercase tracking-wider text-foreground">
            Scanned Connected Ports ({filteredPorts.length})
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-black/40">
              <tr className="border-b border-border text-left">
                <th className="px-4 py-3 font-medium text-muted-foreground text-[10px] uppercase tracking-widest font-mono">Port</th>
                <th className="px-4 py-3 font-medium text-muted-foreground text-[10px] uppercase tracking-widest font-mono">Service</th>
                <th className="px-4 py-3 font-medium text-muted-foreground text-[10px] uppercase tracking-widest font-mono">Risk Level</th>
                <th className="px-4 py-3 font-medium text-muted-foreground text-[10px] uppercase tracking-widest font-mono">State</th>
                <th className="px-4 py-3 font-medium text-muted-foreground text-[10px] uppercase tracking-widest font-mono">Banner / Version</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredPorts.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-xs font-mono text-muted-foreground uppercase tracking-wider">
                    No ports match your filter or search query.
                  </td>
                </tr>
              ) : (
                filteredPorts.map((port, i) => {
                  const isRisky = HIGH_RISK_PORTS.includes(port.port);
                  return (
                    <tr
                      key={`${port.port}-${i}`}
                      onMouseEnter={() => setHoveredNode(port)}
                      onMouseLeave={() => setHoveredNode(null)}
                      onClick={() => setSelectedNode(port)}
                      className={`group cursor-pointer transition-colors ${
                        selectedNode?.port === port.port ? 'bg-primary/15' : 'hover:bg-foreground/5'
                      }`}
                    >
                      <td className="px-4 py-3 font-mono font-bold text-primary flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${isRisky ? 'bg-rose-500 animate-pulse' : 'bg-emerald-500'}`} />
                        {port.port}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-mono text-xs text-foreground flex items-center gap-2">
                          <Wifi className="h-3.5 w-3.5 text-muted-foreground" />
                          {port.service || 'unknown'}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {isRisky ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono uppercase bg-rose-500/10 text-rose-400 border border-rose-500/20">
                            <ShieldAlert className="h-3 w-3" /> High Risk
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <ShieldCheck className="h-3 w-3" /> Standard
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium border bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          {port.state || 'open'}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground truncate max-w-[240px]" title={port.banner}>
                        {port.banner || '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  );
}
