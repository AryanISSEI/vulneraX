import React, { useRef, useEffect, useState } from 'react';
import { Network, Wifi, ShieldAlert, ShieldCheck, Play, Pause, Search, Sparkles, RefreshCw, ArrowLeftRight } from 'lucide-react';
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

  // Initialize nodes into clean Left Wing & Right Wing columns
  const initializeNodes = (w, h) => {
    const cx = w / 2;
    const cy = h / 2;

    const newNodes = [];

    // Central Host Hub (Center)
    newNodes.push({
      id: 'central-hub',
      isHub: true,
      portNumber: 'HUB',
      service: 'Central Host',
      x: cx,
      y: cy,
      targetX: cx,
      targetY: cy,
      vx: 0,
      vy: 0,
      radius: 26,
      mass: 5,
      side: 'center',
      color: '#38bdf8',
    });

    const activeList = filteredPorts.length > 0 ? filteredPorts : ports;
    const total = activeList.length;

    // Split nodes evenly into Left and Right wings
    const leftCount = Math.ceil(total / 2);
    const rightCount = Math.floor(total / 2);

    const xOffset = Math.min(w * 0.32, 220); // Horizontal column offset from center
    const minY = 60;
    const maxY = h - 60;
    const availableHeight = maxY - minY;

    activeList.forEach((p, i) => {
      const isLeft = i < leftCount;
      const sideIndex = isLeft ? i : i - leftCount;
      const countOnSide = isLeft ? leftCount : rightCount;

      const stepY = countOnSide > 1 ? availableHeight / (countOnSide - 1) : 0;
      const targetY = countOnSide > 1 ? minY + sideIndex * stepY : cy;
      const targetX = isLeft ? cx - xOffset : cx + xOffset;

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
        side: isLeft ? 'left' : 'right',
        x: targetX + (Math.random() - 0.5) * 20,
        y: targetY + (Math.random() - 0.5) * 20,
        targetX,
        targetY,
        vx: 0,
        vy: 0,
        radius: isRisky ? 18 : 15,
        mass: 1,
        color: isRisky ? '#ef4444' : isWeb ? '#06b6d4' : '#10b981',
      });
    });

    nodesRef.current = newNodes;
  };

  // Reset / Re-align graph layout
  const resetLayout = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    initializeNodes(canvas.clientWidth || 700, 400);
  };

  // Re-initialize layout when ports or filters update
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    initializeNodes(canvas.clientWidth || 700, 400);
  }, [ports, filter, searchQuery]);

  // Main Canvas & Physics Simulation Render Loop
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

    // Energy packet stream particles traveling left & right
    const energyPackets = Array.from({ length: 28 }, (_, i) => ({
      targetNodeIdx: (i % Math.max(1, nodesRef.current.length - 1)) + 1,
      progress: Math.random(),
      speed: 0.007 + Math.random() * 0.009,
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

      // 1. Bilateral Column Physics Step
      if (isSimulating) {
        const kAnchor = 0.06; // Anchor pull towards target column position
        const kRepel = 2200;   // Vertical repulsion between adjacent nodes

        nodes.forEach((n, i) => {
          if (n.isHub || n === draggedNodeRef.current) return;

          // Anchor force towards designated Left/Right slot
          const dxAnchor = n.targetX - n.x;
          const dyAnchor = n.targetY - n.y;
          n.vx += dxAnchor * kAnchor;
          n.vy += dyAnchor * kAnchor;

          // Node-to-node repulsion on same side to prevent overlap
          nodes.forEach((other, j) => {
            if (i === j || other.isHub || other.side !== n.side) return;
            const dx = n.x - other.x;
            const dy = n.y - other.y;
            const dist = Math.hypot(dx, dy) || 1;
            if (dist < 50) {
              const repelForce = kRepel / (dist * dist);
              n.vx += (dx / dist) * repelForce;
              n.vy += (dy / dist) * repelForce;
            }
          });

          // Velocity Damping
          n.vx *= 0.82;
          n.vy *= 0.82;

          n.x += n.vx;
          n.y += n.vy;
        });
      }

      // Dragged Node Snap
      if (draggedNodeRef.current) {
        draggedNodeRef.current.x = mousePosRef.current.x;
        draggedNodeRef.current.y = mousePosRef.current.y;
        draggedNodeRef.current.vx = 0;
        draggedNodeRef.current.vy = 0;
      }

      // 2. Render Deep Cyber Space Background & Grid Pattern
      const bgGrad = ctx.createRadialGradient(cx, cy, 20, cx, cy, width * 0.75);
      bgGrad.addColorStop(0, 'rgba(15, 23, 42, 0.96)');
      bgGrad.addColorStop(0.6, 'rgba(10, 15, 30, 0.98)');
      bgGrad.addColorStop(1, 'rgba(3, 7, 18, 1)');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // Grid Dots Pattern
      ctx.fillStyle = 'rgba(56, 189, 248, 0.07)';
      const dotGridSize = 28;
      for (let x = dotGridSize / 2; x < width; x += dotGridSize) {
        for (let y = dotGridSize / 2; y < height; y += dotGridSize) {
          ctx.fillRect(x, y, 1.5, 1.5);
        }
      }

      // Left & Right Wing Column Guides
      const xOffset = Math.min(width * 0.32, 220);
      const leftColX = cx - xOffset;
      const rightColX = cx + xOffset;

      ctx.save();
      ctx.setLineDash([4, 6]);
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.15)';
      ctx.lineWidth = 1;

      // Vertical Left Column Guide
      ctx.beginPath();
      ctx.moveTo(leftColX, 35);
      ctx.lineTo(leftColX, height - 35);
      ctx.stroke();

      // Vertical Right Column Guide
      ctx.beginPath();
      ctx.moveTo(rightColX, 35);
      ctx.lineTo(rightColX, height - 35);
      ctx.stroke();
      ctx.restore();

      // Column Titles
      ctx.font = 'bold 10px Inter, monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(56, 189, 248, 0.5)';
      ctx.fillText('◄ LEFT PORTS', leftColX, 24);
      ctx.fillText('RIGHT PORTS ►', rightColX, 24);

      // 3. Render Curved Laser Beams from Hub to Left & Right Nodes
      const hubNode = nodes.find(n => n.isHub) || { x: cx, y: cy };
      nodes.forEach((n) => {
        if (n.isHub) return;

        const isHovered = hoveredNode?.port === n.portData?.port || selectedNode?.port === n.portData?.port;
        const isDragged = draggedNodeRef.current === n;

        // Smooth curved laser path
        const controlX = (hubNode.x + n.x) / 2;
        const controlY = (hubNode.y + n.y) / 2 + (n.side === 'left' ? -15 : 15);

        ctx.beginPath();
        ctx.moveTo(hubNode.x, hubNode.y);
        ctx.quadraticCurveTo(controlX, controlY, n.x, n.y);

        ctx.lineWidth = isHovered || isDragged ? 2.5 : 1.2;
        ctx.strokeStyle = n.isRisky
          ? isHovered ? 'rgba(239, 68, 68, 0.85)' : 'rgba(239, 68, 68, 0.32)'
          : n.isWeb
          ? isHovered ? 'rgba(6, 182, 212, 0.85)' : 'rgba(6, 182, 212, 0.25)'
          : isHovered ? 'rgba(16, 185, 129, 0.85)' : 'rgba(16, 185, 129, 0.25)';

        ctx.stroke();
      });

      // 4. Render Energy Stream Packets
      energyPackets.forEach((pt) => {
        pt.progress += pt.speed;
        if (pt.progress > 1) pt.progress = 0;

        const targetNode = nodes[pt.targetNodeIdx];
        if (targetNode && !targetNode.isHub) {
          const t = pt.progress;
          const controlX = (hubNode.x + targetNode.x) / 2;
          const controlY = (hubNode.y + targetNode.y) / 2 + (targetNode.side === 'left' ? -15 : 15);

          const px = (1 - t) * (1 - t) * hubNode.x + 2 * (1 - t) * t * controlX + t * t * targetNode.x;
          const py = (1 - t) * (1 - t) * hubNode.y + 2 * (1 - t) * t * controlY + t * t * targetNode.y;

          ctx.beginPath();
          ctx.arc(px, py, 2.5, 0, Math.PI * 2);
          ctx.fillStyle = targetNode.color;
          ctx.shadowColor = targetNode.color;
          ctx.shadowBlur = 6;
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      });

      // 5. Render Central Host Server Hub
      ctx.save();
      const hubPulse = Math.sin(animationTime * 2.5) * 4;
      // Outer aura ring
      ctx.beginPath();
      ctx.arc(hubNode.x, hubNode.y, hubNode.radius + 12 + hubPulse, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(56, 189, 248, 0.12)';
      ctx.fill();

      // Outer circle
      ctx.beginPath();
      ctx.arc(hubNode.x, hubNode.y, hubNode.radius, 0, Math.PI * 2);
      ctx.fillStyle = '#0f172a';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#38bdf8';
      ctx.stroke();

      // Core glow
      ctx.beginPath();
      ctx.arc(hubNode.x, hubNode.y, 10, 0, Math.PI * 2);
      ctx.fillStyle = '#38bdf8';
      ctx.shadowColor = '#06b6d4';
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.shadowBlur = 0;

      // Central Host Label
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 10px Inter, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('HOST HUB', hubNode.x, hubNode.y + hubNode.radius + 6);
      ctx.restore();

      // 6. Render Bilateral Port Nodes
      nodes.forEach((n) => {
        if (n.isHub) return;

        const isHovered = hoveredNode?.port === n.portData?.port || selectedNode?.port === n.portData?.port;
        const isDragged = draggedNodeRef.current === n;

        // Glow aura ring
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

        // High Risk Alert Pulse
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

        // Service Protocol Label next to node (Left side or Right side)
        ctx.fillStyle = n.color;
        ctx.font = '600 9px Inter, sans-serif';
        ctx.textAlign = n.side === 'left' ? 'right' : 'left';
        const labelX = n.side === 'left' ? n.x - n.radius - 8 : n.x + n.radius + 8;
        ctx.fillText(n.service.toUpperCase(), labelX, n.y);
      });

      ctx.restore();
      animFrameRef.current = requestAnimationFrame(simulateAndRender);
    }

    simulateAndRender();

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [ports, isSimulating, hoveredNode, selectedNode]);

  // Mouse Dragging & Hover Handlers
  const handleMouseDown = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

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
      {/* Bilateral Dual-Wing Connected Ports Graph Card */}
      <GlassCard delay={0.2} className="relative overflow-hidden p-6 border border-primary/20 shadow-2xl">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-border/50 pb-4">
          <SectionHeader
            title="Bilateral 2-Direction Connected Ports Topology"
            subtitle={`${ports.length} connected ports aligned in Left & Right wings`}
            icon={ArrowLeftRight}
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
              title="Toggle Physics Alignment"
            >
              {isSimulating ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
              {isSimulating ? 'Pause Alignment' : 'Resume Alignment'}
            </button>

            <button
              onClick={resetLayout}
              className="p-2 rounded-lg border border-border bg-secondary/40 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors flex items-center gap-1.5 text-xs font-medium"
              title="Align Ports Left & Right"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Re-align Layout
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
          className="relative w-full h-[420px] mt-4 rounded-2xl bg-black/80 border border-primary/20 overflow-hidden cursor-grab active:cursor-grabbing shadow-inner"
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
            Ports organized in 2 directions (Left & Right columns) | Drag nodes to test spring return
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
