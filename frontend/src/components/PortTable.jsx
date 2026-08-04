import React, { useRef, useEffect, useState } from 'react';
import { Network, Wifi, ShieldAlert, ShieldCheck, RotateCcw, Play, Pause, Eye, Search, Sparkles, RefreshCw, Layers, Cpu } from 'lucide-react';
import GlassCard from './ui/GlassCard';
import SectionHeader from './ui/SectionHeader';
import { motion, AnimatePresence } from 'framer-motion';

const HIGH_RISK_PORTS = [21, 23, 445, 1433, 3306, 3389, 5432, 6379, 27017];

export default function PortTable({ ports = [] }) {
  const [filter, setFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSimulating, setIsSimulating] = useState(true);
  const [selectedNode, setSelectedNode] = useState(null);
  const [hoveredNode, setHoveredNode] = useState(null);

  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const animFrameRef = useRef(null);

  // Dragging state for force-directed nodes
  const draggedNodeRef = useRef(null);
  const mousePosRef = useRef({ x: 0, y: 0 });
  const nodesRef = useRef([]);

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
      );
    }

    return true;
  });

  // Metrics calculation
  const riskyCount = ports.filter(p => HIGH_RISK_PORTS.includes(p.port)).length;
  const webCount = ports.filter(p => [80, 443, 8080, 8443, 3000].includes(p.port)).length;
  const secureCount = ports.length - riskyCount;

  // Initialize node physics positions whenever `ports` change
  const initializeNodes = (w, h) => {
    const cx = w / 2;
    const cy = h / 2;

    const newNodes = [];

    // Central Server Node (Index 0)
    newNodes.push({
      id: 'central-hub',
      isHub: true,
      portNumber: 'HUB',
      service: 'Central Host',
      x: cx,
      y: cy,
      vx: 0,
      vy: 0,
      radius: 26,
      mass: 5,
      color: '#38bdf8',
    });

    // Port Nodes
    ports.forEach((p, i) => {
      const angle = (i / Math.max(1, ports.length)) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
      const dist = 110 + Math.random() * 80;
      const isRisky = HIGH_RISK_PORTS.includes(p.port);
      const isWeb = [80, 443, 8080, 8443, 3000].includes(p.port);

      newNodes.push({
        id: `port-${p.port}-${i}`,
        isHub: false,
        portData: p,
        portNumber: p.port.toString(),
        service: p.service || 'unknown',
        state: p.state || 'open',
        banner: p.banner || '',
        isRisky,
        isWeb,
        x: cx + Math.cos(angle) * dist,
        y: cy + Math.sin(angle) * dist,
        vx: (Math.random() - 0.5) * 2,
        vy: (Math.random() - 0.5) * 2,
        radius: isRisky ? 18 : 15,
        mass: 1,
        color: isRisky ? '#ef4444' : isWeb ? '#06b6d4' : '#10b981',
      });
    });

    nodesRef.current = newNodes;
  };

  // Re-arrange / Reset physics graph layout
  const resetLayout = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    initializeNodes(canvas.clientWidth || 700, 400);
  };

  // Canvas setup and Force-Directed Physics Simulation Engine
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let width = canvas.parentElement?.clientWidth || 700;
    let height = 400;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    if (nodesRef.current.length === 0) {
      initializeNodes(width, height);
    }

    // Energy packet particles traveling on spring edges
    const energyPackets = Array.from({ length: 24 }, (_, i) => ({
      targetNodeIdx: (i % (ports.length || 1)) + 1,
      progress: Math.random(),
      speed: 0.006 + Math.random() * 0.008,
    }));

    let animationTime = 0;

    function simulateAndRender() {
      if (!ctx || !canvas) return;
      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      animationTime += 0.03;
      const cx = width / 2;
      const cy = height / 2;
      const nodes = nodesRef.current;

      // 1. Force-Directed Physics Physics Step
      if (isSimulating) {
        const kRepulsion = 4200; // Coulomb repulsion strength
        const kSpring = 0.04;    // Hooke spring stiffness
        const restingLen = 135;  // Rest spring length
        const kCenterGravity = 0.015;

        // Apply Forces between node pairs
        for (let i = 0; i < nodes.length; i++) {
          const n1 = nodes[i];

          // Center gravity force
          if (!n1.isHub && draggedNodeRef.current !== n1) {
            n1.vx += (cx - n1.x) * kCenterGravity * 0.1;
            n1.vy += (cy - n1.y) * kCenterGravity * 0.1;
          }

          for (let j = i + 1; j < nodes.length; j++) {
            const n2 = nodes[j];
            const dx = n2.x - n1.x;
            const dy = n2.y - n1.y;
            const dist = Math.hypot(dx, dy) || 1;

            // Repulsion force (all nodes repel each other)
            const forceRepel = kRepulsion / (dist * dist);
            const fxR = (dx / dist) * forceRepel;
            const fyR = (dy / dist) * forceRepel;

            if (draggedNodeRef.current !== n1 && !n1.isHub) {
              n1.vx -= fxR / n1.mass;
              n1.vy -= fyR / n1.mass;
            }
            if (draggedNodeRef.current !== n2 && !n2.isHub) {
              n2.vx += fxR / n2.mass;
              n2.vy += fyR / n2.mass;
            }

            // Connection Attraction force (Hub <-> Port & Port <-> Port if related)
            const isConnected = n1.isHub || n2.isHub || (n1.isWeb && n2.isWeb) || (n1.isRisky && n2.isRisky);
            if (isConnected) {
              const delta = dist - restingLen;
              const forceSpring = delta * kSpring;
              const fxS = (dx / dist) * forceSpring;
              const fyS = (dy / dist) * forceSpring;

              if (draggedNodeRef.current !== n1 && !n1.isHub) {
                n1.vx += fxS / n1.mass;
                n1.vy += fyS / n1.mass;
              }
              if (draggedNodeRef.current !== n2 && !n2.isHub) {
                n2.vx -= fxS / n2.mass;
                n2.vy -= fyS / n2.mass;
              }
            }
          }
        }

        // Update positions with damping friction and wall bounds
        nodes.forEach((n) => {
          if (n === draggedNodeRef.current) return;
          if (n.isHub) {
            // Keep Hub gently centered
            n.x += (cx - n.x) * 0.1;
            n.y += (cy - n.y) * 0.1;
            return;
          }

          n.vx *= 0.88; // Damping
          n.vy *= 0.88;

          n.x += n.vx;
          n.y += n.vy;

          // Soft boundary reflection
          const padding = n.radius + 15;
          if (n.x < padding) { n.x = padding; n.vx *= -0.5; }
          if (n.x > width - padding) { n.x = width - padding; n.vx *= -0.5; }
          if (n.y < padding) { n.y = padding; n.vy *= -0.5; }
          if (n.y > height - padding) { n.y = height - padding; n.vy *= -0.5; }
        });
      }

      // If dragging a node with mouse, snap its position to cursor
      if (draggedNodeRef.current) {
        draggedNodeRef.current.x = mousePosRef.current.x;
        draggedNodeRef.current.y = mousePosRef.current.y;
        draggedNodeRef.current.vx = 0;
        draggedNodeRef.current.vy = 0;
      }

      // 2. Render Canvas Ambient Background & Grid Dot Matrix
      const bgGrad = ctx.createRadialGradient(cx, cy, 20, cx, cy, width * 0.7);
      bgGrad.addColorStop(0, 'rgba(15, 23, 42, 0.95)');
      bgGrad.addColorStop(0.6, 'rgba(10, 15, 30, 0.98)');
      bgGrad.addColorStop(1, 'rgba(3, 7, 18, 1)');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // Subtle Cyber Grid Dots
      ctx.fillStyle = 'rgba(56, 189, 248, 0.08)';
      const dotGridSize = 30;
      for (let x = dotGridSize / 2; x < width; x += dotGridSize) {
        for (let y = dotGridSize / 2; y < height; y += dotGridSize) {
          ctx.fillRect(x, y, 1.5, 1.5);
        }
      }

      // 3. Render Elastic Spring Connection Lines
      const hubNode = nodes.find(n => n.isHub) || { x: cx, y: cy };
      nodes.forEach((n) => {
        if (n.isHub) return;

        const isHovered = hoveredNode?.port === n.portData?.port || selectedNode?.port === n.portData?.port;
        const isDragged = draggedNodeRef.current === n;

        ctx.beginPath();
        ctx.moveTo(hubNode.x, hubNode.y);
        ctx.lineTo(n.x, n.y);

        ctx.lineWidth = isHovered || isDragged ? 2.5 : 1.2;
        ctx.strokeStyle = n.isRisky
          ? isHovered ? 'rgba(239, 68, 68, 0.8)' : 'rgba(239, 68, 68, 0.35)'
          : n.isWeb
          ? isHovered ? 'rgba(6, 182, 212, 0.8)' : 'rgba(6, 182, 212, 0.25)'
          : isHovered ? 'rgba(16, 185, 129, 0.8)' : 'rgba(16, 185, 129, 0.25)';

        ctx.stroke();
      });

      // 4. Render Animated Energy Particles on Spring Connections
      energyPackets.forEach((pt) => {
        pt.progress += pt.speed;
        if (pt.progress > 1) pt.progress = 0;

        const targetNode = nodes[pt.targetNodeIdx];
        if (targetNode) {
          const px = hubNode.x + (targetNode.x - hubNode.x) * pt.progress;
          const py = hubNode.y + (targetNode.y - hubNode.y) * pt.progress;

          ctx.beginPath();
          ctx.arc(px, py, 2.5, 0, Math.PI * 2);
          ctx.fillStyle = targetNode.color;
          ctx.shadowColor = targetNode.color;
          ctx.shadowBlur = 6;
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      });

      // 5. Render Central Host Server Node
      ctx.save();
      const hubPulse = Math.sin(animationTime * 2.5) * 4;
      // Outer aura ring
      ctx.beginPath();
      ctx.arc(hubNode.x, hubNode.y, hubNode.radius + 12 + hubPulse, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(56, 189, 248, 0.12)';
      ctx.fill();

      // Outer border circle
      ctx.beginPath();
      ctx.arc(hubNode.x, hubNode.y, hubNode.radius, 0, Math.PI * 2);
      ctx.fillStyle = '#0f172a';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#38bdf8';
      ctx.stroke();

      // Inner core glow
      ctx.beginPath();
      ctx.arc(hubNode.x, hubNode.y, 10, 0, Math.PI * 2);
      ctx.fillStyle = '#38bdf8';
      ctx.shadowColor = '#06b6d4';
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.shadowBlur = 0;

      // Label below central hub
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 10px Inter, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('HOST HUB', hubNode.x, hubNode.y + hubNode.radius + 6);
      ctx.restore();

      // 6. Render Floating Glass Nodes
      nodes.forEach((n) => {
        if (n.isHub) return;

        const isHovered = hoveredNode?.port === n.portData?.port || selectedNode?.port === n.portData?.port;
        const isDragged = draggedNodeRef.current === n;

        // Dynamic Glow Ring
        const glowRadius = n.radius + (isHovered || isDragged ? 8 : 4);
        ctx.beginPath();
        ctx.arc(n.x, n.y, glowRadius, 0, Math.PI * 2);
        ctx.fillStyle = n.color + (isHovered || isDragged ? '50' : '18');
        ctx.fill();

        // Node Circle Body
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
        ctx.fillStyle = '#090d16';
        ctx.fill();

        ctx.lineWidth = isHovered || isDragged ? 2.5 : 1.8;
        ctx.strokeStyle = n.color;
        ctx.stroke();

        // High Risk Warning Pulse
        if (n.isRisky) {
          const alertPulse = (Math.sin(animationTime * 4) + 1) * 2.5;
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.radius + alertPulse + 1, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(239, 68, 68, 0.6)';
          ctx.lineWidth = 1.2;
          ctx.stroke();
        }

        // Port Number inside Node
        ctx.fillStyle = '#f8fafc';
        ctx.font = `bold ${n.radius > 16 ? 11 : 10}px Inter, monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(n.portNumber, n.x, n.y);

        // Service Label below Node
        ctx.fillStyle = n.color;
        ctx.font = '600 9px Inter, sans-serif';
        ctx.fillText(n.service.toUpperCase(), n.x, n.y + n.radius + 10);
      });

      ctx.restore();
      animFrameRef.current = requestAnimationFrame(simulateAndRender);
    }

    simulateAndRender();

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [ports, isSimulating, hoveredNode, selectedNode]);

  // Mouse Handlers for Node Dragging & Selection
  const handleMouseDown = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    // Check hit test for node dragging
    const clickedNode = nodesRef.current.find((n) => {
      const dist = Math.hypot(mx - n.x, my - n.y);
      return dist <= n.radius + 6;
    });

    if (clickedNode) {
      draggedNodeRef.current = clickedNode;
      mousePosRef.current = { x: mx, y: my };
      if (!clickedNode.isHub && clickedNode.portData) {
        setSelectedNode(clickedNode.portData);
      }
    }
  };

  const handleMouseMove = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    mousePosRef.current = { x: mx, y: my };

    if (!draggedNodeRef.current) {
      // Hover detection
      const hovered = nodesRef.current.find((n) => {
        const dist = Math.hypot(mx - n.x, my - n.y);
        return dist <= n.radius + 6;
      });

      if (hovered && !hovered.isHub) {
        setHoveredNode(hovered.portData);
      } else {
        setHoveredNode(null);
      }
    }
  };

  const handleMouseUp = () => {
    draggedNodeRef.current = null;
  };

  return (
    <div className="space-y-6">
      {/* Interactive Force-Directed Node Graph Header & Visualizer Card */}
      <GlassCard delay={0.2} className="relative overflow-hidden p-6 border border-primary/20 shadow-2xl">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border/50 pb-4">
          <SectionHeader
            title="Interactive Connected Ports Force Graph"
            subtitle={`${ports.length} connected ports rendered in a physics spring network layout`}
            icon={Network}
            color="cyan"
          />

          {/* Quick Controls */}
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
              onClick={() => setIsSimulating(!isSimulating)}
              className={`p-2 rounded-lg border text-xs font-medium transition-colors flex items-center gap-1.5 ${
                isSimulating
                  ? 'bg-primary/20 text-primary border-primary/30'
                  : 'bg-secondary/40 text-muted-foreground border-border'
              }`}
              title="Toggle Physics Force Simulation"
            >
              {isSimulating ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              {isSimulating ? 'Pause Physics' : 'Resume Physics'}
            </button>

            <button
              onClick={resetLayout}
              className="p-2 rounded-lg border border-border bg-secondary/40 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors flex items-center gap-1.5 text-xs font-medium"
              title="Reset Graph Layout"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Reset Graph
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

          <div className="relative w-52">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search port or service..."
              className="w-full h-8 pl-8 pr-3 bg-secondary/40 border border-border/60 rounded-lg text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary transition-colors"
            />
          </div>
        </div>

        {/* Interactive Physics Canvas Container */}
        <div
          ref={containerRef}
          className="relative w-full h-[400px] mt-4 rounded-2xl bg-black/80 border border-primary/20 overflow-hidden cursor-grab active:cursor-grabbing shadow-inner"
        >
          <canvas
            ref={canvasRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            className="w-full h-full block"
          />

          {/* Interactive Inspection Card for Hovered / Selected Port Node */}
          <AnimatePresence>
            {(selectedNode || hoveredNode) && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 10 }}
                className="absolute top-4 right-4 z-30 p-4 rounded-xl bg-slate-950/90 border border-primary/40 backdrop-blur-xl shadow-2xl max-w-xs space-y-2.5 pointer-events-none"
              >
                <div className="flex items-center justify-between border-b border-border/60 pb-2">
                  <span className="font-mono text-sm font-bold text-primary flex items-center gap-1.5">
                    <Wifi className="h-4 w-4 text-cyan-400" />
                    Port {(selectedNode || hoveredNode).port}
                  </span>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase ${
                      HIGH_RISK_PORTS.includes((selectedNode || hoveredNode).port)
                        ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                        : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                    }`}
                  >
                    {HIGH_RISK_PORTS.includes((selectedNode || hoveredNode).port) ? 'High Risk' : 'Standard'}
                  </span>
                </div>

                <div className="text-xs font-mono space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Service Protocol:</span>
                    <span className="text-foreground font-bold">{(selectedNode || hoveredNode).service || 'unknown'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">State:</span>
                    <span className="text-emerald-400 font-bold flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      {(selectedNode || hoveredNode).state || 'open'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Banner / Version:</span>
                    <span className="text-muted-foreground truncate max-w-[140px]" title={(selectedNode || hoveredNode).banner}>
                      {(selectedNode || hoveredNode).banner || '—'}
                    </span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Interactive Hint */}
          <div className="absolute bottom-3 left-3 pointer-events-none text-[11px] text-muted-foreground font-mono bg-slate-950/80 px-3 py-1.5 rounded-lg border border-primary/20 flex items-center gap-2 backdrop-blur-md">
            <Sparkles className="h-3.5 w-3.5 text-cyan-400 animate-pulse" />
            Click & drag any node to test spring physics | Hover or click to inspect
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
