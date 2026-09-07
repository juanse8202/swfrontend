import { create } from 'zustand';
import { addEdge, applyNodeChanges, applyEdgeChanges } from 'reactflow';

const useDiagramStore = create((set, get) => ({
  nodes: [],
  edges: [],
  
  // 1. Maneja el movimiento de las cajas en la pantalla
  onNodesChange: (changes) => {
    set({ nodes: applyNodeChanges(changes, get().nodes) });
    // TODO: Emitir movimiento por WebSocket a los demás colaboradores
  },
  
  // 2. Maneja los cambios en las relaciones (flechas)
  onEdgesChange: (changes) => {
    set({ edges: applyEdgeChanges(changes, get().edges) });
  },
  
  // 3. Crear conexiones nuevas entre clases
  onConnect: (connection) => {
    set({ edges: addEdge(connection, get().edges) });
    // TODO: Notificar nueva relación al backend
  },

  // 4. Agregar una nueva clase UML al lienzo
  crearClase: (nuevaClase) => {
    set({ nodes: [...get().nodes, nuevaClase] });
    // TODO: Guardar en base de datos y notificar al resto
  },

  // 5. Eliminar una clase
  eliminarClase: (id) => {
    set({ nodes: get().nodes.filter((n) => n.id !== id) });
    // TODO: Borrar en base de datos y notificar al resto
  }
}));

export default useDiagramStore;