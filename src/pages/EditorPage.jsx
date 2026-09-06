import React from 'react';
import DiagramCanvas from '../components/editor/DiagramCanvas';
import EditorToolbar from '../components/editor/EditorToolbar';
import PropertiesPanel from '../components/editor/PropertiesPanel';

export default function EditorPage() {
  return (
    <div className="flex h-screen w-full bg-surface">
      {/* Panel izquierdo: Herramientas */}
      <div className="w-64 border-r border-surface-variant">
         <EditorToolbar />
      </div>
      
      {/* Centro: Lienzo Principal */}
      <div className="flex-1 p-4">
        <DiagramCanvas />
      </div>

      {/* Panel derecho: Propiedades */}
      <div className="w-72 border-l border-surface-variant">
         <PropertiesPanel />
      </div>
    </div>
  );
}