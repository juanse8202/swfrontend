import React, { useState, useCallback } from 'react';
import ReactFlow, { Background, Controls, addEdge, applyNodeChanges, applyEdgeChanges, MarkerType } from 'reactflow';
import 'reactflow/dist/style.css'; 
import ClassNode from './ClassNode'; // Importamos tu componente

const nodeTypes = { umlClass: ClassNode };

// Tus nodos iniciales (puedes mover esto a tu diagramStore.js luego)
const initialNodes = [
  {
    id: 'node-usuario',
    type: 'umlClass',
    position: { x: 50, y: 100 },
    data: {
      title: 'Usuario.java',
      icon: 'account_box',
      borderColor: 'border-primary-container',
      headerBg: 'bg-primary-container',
      headerText: 'text-on-primary',
      methodColor: 'text-tertiary',
      properties: [
        { visibility: '#', name: 'id', type: 'UUID (@Id)' },
        { visibility: '+', name: 'username', type: 'String (@Column)' },
      ],
      methods: ['+ getAuthorities()', '+ generateJwtToken()']
    }
  }
];

export default function DiagramCanvas() {
  const [nodes, setNodes] = useState(initialNodes);
  const [edges, setEdges] = useState([]);

  const onNodesChange = useCallback((changes) => setNodes((nds) => applyNodeChanges(changes, nds)), []);
  const onEdgesChange = useCallback((changes) => setEdges((eds) => applyEdgeChanges(changes, eds)), []);
  const onConnect = useCallback((params) => setEdges((eds) => addEdge(params, eds)), []);

  return (
    <div className="flex-1 w-full h-full min-h-[600px] bg-surface-container-lowest rounded-lg relative shadow-2xl overflow-hidden">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
      >
        <Background color="#908fa0" gap={24} size={1} />
        <Controls className="fill-on-surface bg-surface-container-high border-none" />
      </ReactFlow>
    </div>
  );
}