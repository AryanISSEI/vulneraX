import React, { useMemo, useCallback } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  MarkerType,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

export default function AttackGraph({ scanResult }) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  useMemo(() => {
    if (!scanResult) return;

    const newNodes = [];
    const newEdges = [];

    // Target Node (Root)
    const targetNodeId = 'target';
    newNodes.push({
      id: targetNodeId,
      position: { x: 400, y: 50 },
      data: { 
        label: (
          <div className="text-center font-bold">
            <div>Target</div>
            <div className="text-xs text-muted-foreground">{scanResult.target}</div>
          </div>
        ) 
      },
      style: {
        background: 'rgba(255, 255, 255, 0.05)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
        borderRadius: '8px',
        padding: '10px',
        color: '#fff',
      },
    });

    // Vulnerabilities
    if (scanResult.vulnerabilities && scanResult.vulnerabilities.length > 0) {
       scanResult.vulnerabilities.forEach((vuln, index) => {
         const vulnNodeId = `vuln-${index}`;
         let color = '#3b82f6'; // low
         if (vuln.severity === 'high') color = '#ef4444';
         if (vuln.severity === 'medium') color = '#eab308';
         if (vuln.severity === 'critical') color = '#991b1b';

         newNodes.push({
            id: vulnNodeId,
            position: { x: 100 + (index * 200), y: 250 },
            data: {
               label: (
                  <div className="text-center">
                    <div className="font-semibold text-xs" style={{ color }}>{vuln.severity.toUpperCase()}</div>
                    <div className="text-xs truncate max-w-[150px]">{vuln.name}</div>
                  </div>
               )
            },
            style: {
              background: 'rgba(0, 0, 0, 0.5)',
              border: `1px solid ${color}`,
              borderRadius: '8px',
              padding: '10px',
              color: '#fff',
            }
         });

         newEdges.push({
           id: `e-target-${vulnNodeId}`,
           source: targetNodeId,
           target: vulnNodeId,
           animated: true,
           style: { stroke: color },
           markerEnd: {
             type: MarkerType.ArrowClosed,
             color: color,
           },
         });
       });
    }

    // Ports
    if (scanResult.ports && scanResult.ports.length > 0) {
      scanResult.ports.forEach((port, index) => {
        const portNodeId = `port-${index}`;
        newNodes.push({
           id: portNodeId,
           position: { x: 700 + (index * 150), y: 150 },
           data: {
             label: (
                <div className="text-center text-xs">
                  <div className="font-semibold">Port {port.port}</div>
                  <div className="text-[10px] text-emerald-400">{port.service || 'unknown'}</div>
                </div>
             )
           },
           style: {
             background: 'rgba(16, 185, 129, 0.1)',
             border: '1px solid rgba(16, 185, 129, 0.4)',
             borderRadius: '50%',
             padding: '15px',
             color: '#fff',
             width: 80,
             height: 80,
             display: 'flex',
             alignItems: 'center',
             justifyContent: 'center',
           }
        });
        
        newEdges.push({
          id: `e-target-${portNodeId}`,
          source: targetNodeId,
          target: portNodeId,
          style: { stroke: 'rgba(16, 185, 129, 0.4)' },
        });
      });
    }

    setNodes(newNodes);
    setEdges(newEdges);
  }, [scanResult, setNodes, setEdges]);

  if (!scanResult) {
    return <div className="flex h-full items-center justify-center text-muted-foreground">No data available for graph</div>;
  }

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        fitView
        colorMode="dark"
      >
        <Controls />
        <MiniMap nodeStrokeWidth={3} zoomable pannable />
        <Background variant="dots" gap={12} size={1} />
      </ReactFlow>
    </div>
  );
}
