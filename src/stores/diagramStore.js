import { create } from 'zustand';
import { addEdge, applyEdgeChanges, applyNodeChanges } from 'reactflow';

const colors = { entity: ['bg-indigo-600', 'text-white', 'text-cyan-300'], dto: ['bg-violet-600', 'text-white', 'text-violet-200'], enum: ['bg-amber-600', 'text-white', 'text-amber-200'], embeddable: ['bg-cyan-700', 'text-white', 'text-cyan-200'] };
const makeNode = (kind = 'entity', title = 'NuevaEntidad', position = { x: 180, y: 160 }) => {
  const [headerBg, headerText, methodColor] = colors[kind] || colors.entity;
  const stereotypes = { entity: '@Entity', dto: 'DTO / Record', enum: 'enum', embeddable: '@Embeddable' };
  return { id: `${kind}-${crypto.randomUUID?.() || Date.now()}`, type: 'umlClass', position, data: { kind, title: title.endsWith('.java') ? title : `${title}.java`, stereotype: stereotypes[kind] || '@Entity', icon: kind === 'enum' ? 'format_list_bulleted' : kind === 'dto' ? 'description' : 'account_tree', headerBg, headerText, methodColor, properties: kind === 'entity' ? [{ visibility: '#', name: 'id', type: 'UUID (@Id)' }] : [], methods: [] } };
};
const initialNodes = [makeNode('entity', 'Usuario', { x: 90, y: 180 }), makeNode('entity', 'Proyecto', { x: 480, y: 210 })];
initialNodes[0].data.properties.push({ visibility: '+', name: 'nombre', type: 'String' }, { visibility: '+', name: 'email', type: 'String' });
initialNodes[1].data.properties.push({ visibility: '+', name: 'nombre', type: 'String' });
const initialEdges = [{ id: 'usuario-proyecto', source: initialNodes[0].id, target: initialNodes[1].id, type: 'relationEdge', data: { label: '@OneToMany', cardinality: '1 : N' } }];
const relationMeta = { oneToMany: ['@OneToMany', '1 : N'], manyToOne: ['@ManyToOne', 'N : 1'], manyToMany: ['@ManyToMany', 'N : M'], oneToOne: ['@OneToOne', '1 : 1'] };
let savedDiagram;
try { savedDiagram = JSON.parse(localStorage.getItem('diagramcraft-draft')); } catch { savedDiagram = null; }

const useDiagramStore = create((set, get) => ({
  nodes: savedDiagram?.nodes?.length ? savedDiagram.nodes : initialNodes, edges: savedDiagram?.edges || initialEdges, selectedNodeId: null,
  onNodesChange: (changes) => set({ nodes: applyNodeChanges(changes, get().nodes) }),
  onEdgesChange: (changes) => set({ edges: applyEdgeChanges(changes, get().edges) }),
  onConnect: (connection) => set({ edges: addEdge({ ...connection, id: `rel-${Date.now()}`, type: 'relationEdge', data: { label: '@OneToMany', cardinality: '1 : N' } }, get().edges) }),
  selectNode: (id) => set({ selectedNodeId: id }),
  createNode: (kind, title, position) => { const node = makeNode(kind, title || 'NuevaEntidad', position || { x: 160 + Math.random() * 400, y: 120 + Math.random() * 280 }); set({ nodes: [...get().nodes, node], selectedNodeId: node.id }); return node; },
  updateNode: (id, patch) => set({ nodes: get().nodes.map((node) => node.id === id ? { ...node, data: { ...node.data, ...patch } } : node) }),
  addAttribute: (id) => set({ nodes: get().nodes.map((node) => node.id === id ? { ...node, data: { ...node.data, properties: [...node.data.properties, { visibility: '+', name: 'nuevoAtributo', type: 'String' }] } } : node) }),
  updateAttribute: (id, index, patch) => set({ nodes: get().nodes.map((node) => node.id === id ? { ...node, data: { ...node.data, properties: node.data.properties.map((p, i) => i === index ? { ...p, ...patch } : p) } } : node) }),
  removeAttribute: (id, index) => set({ nodes: get().nodes.map((node) => node.id === id ? { ...node, data: { ...node.data, properties: node.data.properties.filter((_, i) => i !== index) } } : node) }),
  deleteNode: (id) => set({ nodes: get().nodes.filter((node) => node.id !== id), edges: get().edges.filter((edge) => edge.source !== id && edge.target !== id), selectedNodeId: null }),
  createRelation: (type, source, target) => { if (!source || !target || source === target) return false; const [label, cardinality] = relationMeta[type] || relationMeta.oneToMany; set({ edges: [...get().edges, { id: `rel-${Date.now()}`, source, target, type: 'relationEdge', data: { label, cardinality } }] }); return true; },
  restore: (diagram) => set({ nodes: diagram.nodes || initialNodes, edges: diagram.edges || initialEdges }),
}));
export default useDiagramStore;
