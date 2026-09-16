import { create } from 'zustand';
import { addEdge, applyEdgeChanges, applyNodeChanges } from 'reactflow';

let diagramMutationListener = null;
export const setDiagramMutationListener = (listener) => { diagramMutationListener = listener; };

const colors = { entity: ['bg-indigo-600', 'text-white', 'text-cyan-300'], dto: ['bg-violet-600', 'text-white', 'text-violet-200'], enum: ['bg-amber-600', 'text-white', 'text-amber-200'], embeddable: ['bg-cyan-700', 'text-white', 'text-cyan-200'] };
const makeNode = (kind = 'entity', title = 'NuevaEntidad', position = { x: 180, y: 160 }) => {
  const [headerBg, headerText, methodColor] = colors[kind] || colors.entity;
  const stereotypes = { entity: '@Entity', dto: 'DTO / Record', enum: 'enum', embeddable: '@Embeddable' };
  return { id: `${kind}-${crypto.randomUUID?.() || Date.now()}`, type: 'umlClass', position, data: { kind, title: title.endsWith('.java') ? title : `${title}.java`, stereotype: stereotypes[kind] || '@Entity', icon: kind === 'enum' ? 'format_list_bulleted' : kind === 'dto' ? 'description' : 'account_tree', headerBg, headerText, methodColor, properties: kind === 'entity' ? [{ visibility: '#', name: 'id', type: 'UUID (@Id)' }] : [], methods: [] } };
};
export const createStarterDiagram = () => {
  const usuario = makeNode('entity', 'Usuario', { x: 90, y: 300 });
  usuario.data.properties.push({ visibility: '+', name: 'nombre', type: 'String' }, { visibility: '+', name: 'email', type: 'String' });
  const proyecto = makeNode('entity', 'Proyecto', { x: 480, y: 120 });
  proyecto.data.properties.push({ visibility: '+', name: 'nombre', type: 'String' }, { visibility: '+', name: 'direccion', type: 'String' });
  return {
    nodes: [usuario, proyecto],
    edges: [{ id: 'usuario-proyecto', source: usuario.id, target: proyecto.id, type: 'relationEdge', data: { label: '@OneToMany', cardinality: '1 : N', multiplicidadOrigen: '1', multiplicidadDestino: 'N' } }],
  };
};
const relationMeta = { oneToMany: ['@OneToMany', '1 : N'], manyToOne: ['@ManyToOne', 'N : 1'], manyToMany: ['@ManyToMany', 'N : M'], oneToOne: ['@OneToOne', '1 : 1'] };

const useDiagramStore = create((set, get) => ({
  nodes: [], edges: [], selectedNodeId: null,
  onNodesChange: (changes) => set({ nodes: applyNodeChanges(changes, get().nodes) }),
  onEdgesChange: (changes) => set({ edges: applyEdgeChanges(changes, get().edges) }),
  onConnect: (connection) => set({ edges: addEdge({ ...connection, id: `rel-${Date.now()}`, type: 'relationEdge', data: { label: '@OneToMany', cardinality: '1 : N', multiplicidadOrigen: '1', multiplicidadDestino: 'N' } }, get().edges) }),
  selectNode: (id) => set({ selectedNodeId: id }),
  createNode: (kind, title, position) => { const node = makeNode(kind, title || 'NuevaEntidad', position || { x: 160 + Math.random() * 400, y: 120 + Math.random() * 280 }); set({ nodes: [...get().nodes, node], selectedNodeId: node.id }); return node; },
  updateNode: (id, patch) => set({ nodes: get().nodes.map((node) => node.id === id ? { ...node, data: { ...node.data, ...patch } } : node) }),
  addAttribute: (id) => set({ nodes: get().nodes.map((node) => node.id === id ? { ...node, data: { ...node.data, properties: [...node.data.properties, { visibility: '+', name: 'nuevoAtributo', type: 'String' }] } } : node) }),
  updateAttribute: (id, index, patch) => set({ nodes: get().nodes.map((node) => node.id === id ? { ...node, data: { ...node.data, properties: node.data.properties.map((p, i) => i === index ? { ...p, ...patch } : p) } } : node) }),
  removeAttribute: (id, index) => set({ nodes: get().nodes.map((node) => node.id === id ? { ...node, data: { ...node.data, properties: node.data.properties.filter((_, i) => i !== index) } } : node) }),
  deleteNode: (id) => set({ nodes: get().nodes.filter((node) => node.id !== id), edges: get().edges.filter((edge) => edge.source !== id && edge.target !== id), selectedNodeId: null }),
  updateRelationMultiplicity: (id, multiplicidadOrigen, multiplicidadDestino) => {
    set({ edges: get().edges.map((edge) => edge.id === id ? { ...edge, data: { ...edge.data, multiplicidadOrigen, multiplicidadDestino, cardinality: `${multiplicidadOrigen} : ${multiplicidadDestino}` } } : edge) });
    diagramMutationListener?.();
  },
  createRelation: (type, source, target) => { if (!source || !target || source === target) return false; const [label, cardinality] = relationMeta[type] || relationMeta.oneToMany; const [multiplicidadOrigen, multiplicidadDestino] = cardinality.split(':').map((value) => value.trim()); set({ edges: [...get().edges, { id: `rel-${Date.now()}`, source, target, type: 'relationEdge', data: { label, cardinality, multiplicidadOrigen, multiplicidadDestino } }] }); return true; },
  restore: (diagram = {}) => set({ nodes: diagram.nodes || [], edges: diagram.edges || [], selectedNodeId: null }),
}));
export default useDiagramStore;
