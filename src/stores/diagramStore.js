import { create } from 'zustand';
import { addEdge, applyEdgeChanges, applyNodeChanges } from 'reactflow';

let diagramMutationListener = null;
export const setDiagramMutationListener = (listener) => { diagramMutationListener = listener; };
const snapshot = (state) => ({ nodes: state.nodes, edges: state.edges });
const historyPatch = (state) => ({ history: [...state.history, snapshot(state)].slice(-50), future: [] });

const relationId = () => `rel-${crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
const legacyRelationTypes = { oneToMany: 'asociacion', manyToOne: 'asociacion', manyToMany: 'asociacion', oneToOne: 'asociacion' };
const legacyJpaAnnotations = { oneToMany: '@OneToMany', manyToOne: '@ManyToOne', manyToMany: '@ManyToMany', oneToOne: '@OneToOne' };
const targetWholeConvention = 'target-whole-v1';
const relationMeta = {
  asociacion: { cardinality: '1 : *', jpaAnnotation: '@OneToMany' },
  agregacion: { cardinality: '1 : *', jpaAnnotation: '' },
  composicion: { cardinality: '1 : *', jpaAnnotation: '' },
  herencia: { cardinality: '1 : 1', jpaAnnotation: '' },
  realizacion: { cardinality: '1 : 1', jpaAnnotation: '' },
  dependencia: { cardinality: '1 : 1', jpaAnnotation: '' },
};
const handleForClosestSide = (from, to) => {
  const fromPosition = from.positionAbsolute || from.position;
  const toPosition = to.positionAbsolute || to.position;
  const fromCenter = { x: fromPosition.x + (from.width || 250) / 2, y: fromPosition.y + (from.height || 110) / 2 };
  const toCenter = { x: toPosition.x + (to.width || 250) / 2, y: toPosition.y + (to.height || 110) / 2 };
  const deltaX = toCenter.x - fromCenter.x;
  const deltaY = toCenter.y - fromCenter.y;
  if (Math.abs(deltaX) >= Math.abs(deltaY)) return deltaX >= 0 ? 'right' : 'left';
  return deltaY >= 0 ? 'bottom' : 'top';
};
const closestHandlesFor = (nodes, sourceId, targetId) => {
  const source = nodes.find((node) => node.id === sourceId);
  const target = nodes.find((node) => node.id === targetId);
  if (!source || !target) return { sourceHandle: 'right', targetHandle: 'left' };
  return { sourceHandle: handleForClosestSide(source, target), targetHandle: handleForClosestSide(target, source) };
};
// Evita que varias relaciones terminen en exactamente el mismo píxel del borde
// de una clase. La clave estable conserva el orden aunque el lienzo se recargue.
const distributeRelationAnchors = (nodes, edges) => {
  const layout = {};
  const groups = new Map();
  const centers = new Map(nodes.map((node) => {
    const position = node.positionAbsolute || node.position;
    return [node.id, { x: position.x + (node.width || 250) / 2, y: position.y + (node.height || 110) / 2 }];
  }));
  edges.forEach((edge) => {
    const handles = closestHandlesFor(nodes, edge.source, edge.target);
    layout[edge.id] = { ...handles };
    const add = (nodeId, otherNodeId, end, side) => {
      const key = `${nodeId}:${side}`;
      groups.set(key, [...(groups.get(key) || []), { edgeId: edge.id, end, side, otherCenter: centers.get(otherNodeId) || { x: 0, y: 0 } }]);
    };
    add(edge.source, edge.target, 'source', handles.sourceHandle);
    add(edge.target, edge.source, 'target', handles.targetHandle);
  });
  groups.forEach((endpoints) => {
    const useHorizontalOrder = endpoints[0].side === 'top' || endpoints[0].side === 'bottom';
    endpoints.sort((left, right) => {
      const difference = (useHorizontalOrder ? left.otherCenter.x - right.otherCenter.x : left.otherCenter.y - right.otherCenter.y);
      return difference || `${left.edgeId}:${left.end}`.localeCompare(`${right.edgeId}:${right.end}`);
    });
    endpoints.forEach((endpoint, index) => {
      layout[endpoint.edgeId][`${endpoint.end}Anchor`] = {
        side: endpoint.side,
        offset: (index + 1) / (endpoints.length + 1),
      };
    });
  });
  return layout;
};
const normalizeRelationEdge = (edge) => {
  const data = edge?.data || {};
  const relationType = legacyRelationTypes[data.relationType] || data.relationType || 'asociacion';
  const meta = relationMeta[relationType] || relationMeta.asociacion;
  const [defaultSourceMultiplicity, defaultTargetMultiplicity] = meta.cardinality.split(':').map((value) => value.trim());
  const normalizeMultiplicity = (value, fallback) => {
    if (value === 'N') return '*';
    if (value !== undefined && value !== null) return value;
    return data.xmiImported ? '' : fallback;
  };
  const needsTargetWholeMigration = (relationType === 'agregacion' || relationType === 'composicion') && data.relationConvention !== targetWholeConvention;
  return {
    ...edge,
    source: needsTargetWholeMigration ? edge.target : edge.source,
    target: needsTargetWholeMigration ? edge.source : edge.target,
    sourceHandle: edge.sourceHandle || 'right',
    targetHandle: edge.targetHandle || 'left',
    data: {
      ...data,
      relationType,
      ...(needsTargetWholeMigration ? {
        multiplicidadOrigen: normalizeMultiplicity(data.multiplicidadDestino, defaultSourceMultiplicity),
        multiplicidadDestino: normalizeMultiplicity(data.multiplicidadOrigen, defaultTargetMultiplicity),
        relationConvention: targetWholeConvention,
      } : { multiplicidadOrigen: normalizeMultiplicity(data.multiplicidadOrigen, defaultSourceMultiplicity), multiplicidadDestino: normalizeMultiplicity(data.multiplicidadDestino, defaultTargetMultiplicity) }),
      jpaAnnotation: data.jpaAnnotation ?? data.label ?? legacyJpaAnnotations[data.relationType] ?? meta.jpaAnnotation,
      ...( ['asociacion', 'agregacion', 'composicion'].includes(relationType) ? {
        ownerNodeId: data.ownerNodeId || ((data.wholeNodeId || (data.relationConvention === targetWholeConvention ? edge.target : null)) || edge.source),
        bidirectional: Boolean(data.bidirectional),
        sourceRole: data.sourceRole || '',
        targetRole: data.targetRole || '',
        ...(relationType === 'agregacion' || relationType === 'composicion' ? { wholeNodeId: data.wholeNodeId || (data.relationConvention === targetWholeConvention ? edge.target : undefined) } : {}),
      } : {}),
    },
  };
};

const colors = { entity: ['bg-indigo-600', 'text-white', 'text-cyan-300'], dto: ['bg-violet-600', 'text-white', 'text-violet-200'], enum: ['bg-amber-600', 'text-white', 'text-amber-200'], embeddable: ['bg-cyan-700', 'text-white', 'text-cyan-200'], interface: ['bg-fuchsia-700', 'text-white', 'text-fuchsia-200'], class: ['bg-slate-600', 'text-white', 'text-slate-200'] };
const stereotypes = { entity: '@Entity', dto: 'DTO / Record', enum: 'enum', embeddable: '@Embeddable', interface: '<<interface>>', class: 'Class' };
const classKinds = new Set(['class', 'entity']);
const isClassNode = (node) => classKinds.has(node?.data?.kind || 'entity');
const canConnectRelation = (relationType, sourceNode, targetNode) => {
  if (!sourceNode || !targetNode || sourceNode.id === targetNode.id) return false;
  if (relationType === 'realizacion') return isClassNode(sourceNode) && targetNode.data?.kind === 'interface';
  if (relationType === 'herencia') return isClassNode(sourceNode) && isClassNode(targetNode);
  if (['asociacion', 'agregacion', 'composicion'].includes(relationType)) return sourceNode.data?.kind === 'entity' && targetNode.data?.kind === 'entity';
  return true;
};
const appearanceFor = (kind) => {
  const [headerBg, headerText, methodColor] = colors[kind] || colors.entity;
  return { kind, stereotype: stereotypes[kind] || '@Entity', icon: kind === 'enum' ? 'format_list_bulleted' : kind === 'dto' ? 'description' : kind === 'interface' ? 'settings_ethernet' : 'account_tree', headerBg, headerText, methodColor };
};
const defaultEnumLiteral = 'NUEVO_VALOR';
const normalizeEnumLiterals = (literals) => {
  const normalized = (Array.isArray(literals) ? literals : []).map((literal) => String(literal || '').trim()).filter(Boolean);
  return normalized.length ? normalized : [defaultEnumLiteral];
};
const normalizeAttribute = (attribute, kind) => {
  const normalized = { ...attribute, name: String(attribute?.name || '').trim(), type: String(attribute?.type || '').replace(/\.java$/i, '').trim() };
  if (kind !== 'entity' || !normalized.embedded) return { ...normalized, embedded: false };
  return { ...normalized, embedded: true };
};
const dataForKind = (kind, data) => {
  if (!kind) return {};
  if (kind === 'interface') return { ...appearanceFor(kind), abstract: true, properties: [] };
  if (kind === 'enum') return { ...appearanceFor(kind), abstract: false, properties: [], methods: [], literals: normalizeEnumLiterals(data.literals) };
  if (kind === 'dto' || kind === 'embeddable') return { ...appearanceFor(kind), abstract: false, methods: [] };
  if (kind === 'entity') return { ...appearanceFor(kind), abstract: Boolean(data.abstract), persistent: data.persistent ?? true };
  return { ...appearanceFor(kind), abstract: Boolean(data.abstract) };
};
const makeNode = (kind = 'entity', title = 'NuevaEntidad', position = { x: 180, y: 160 }) => {
  return { id: `${kind}-${crypto.randomUUID?.() || Date.now()}`, type: 'umlClass', position, data: { ...appearanceFor(kind), title: title.endsWith('.java') ? title : `${title}.java`, abstract: kind === 'interface', persistent: kind === 'entity', literals: kind === 'enum' ? [defaultEnumLiteral] : undefined, properties: kind === 'entity' ? [{ visibility: '#', name: 'id', type: 'UUID (@Id)', id: true, embedded: false }] : [], methods: [] } };
};
const associationClassNodeFor = (state, edge) => {
  const source = state.nodes.find((node) => node.id === edge.source);
  const target = state.nodes.find((node) => node.id === edge.target);
  if (!source || !target) return null;
  const extension = /\.java$/i;
  const sourceName = String(source.data.title || 'Origen').replace(extension, '').replace(/[^a-zA-Z0-9]/g, '');
  const targetName = String(target.data.title || 'Destino').replace(extension, '').replace(/[^a-zA-Z0-9]/g, '');
  const usedTitles = new Set(state.nodes.map((node) => node.data.title));
  const base = sourceName || targetName ? `Detalle${sourceName}${targetName}` : 'ClaseAsociacion';
  let title = `${base}.java`;
  for (let index = 2; usedTitles.has(title); index += 1) title = `${base}${index}.java`;
  const sourcePosition = source.positionAbsolute || source.position;
  const targetPosition = target.positionAbsolute || target.position;
  return makeNode('entity', title, {
    x: (sourcePosition.x + targetPosition.x) / 2 - 125,
    y: (sourcePosition.y + targetPosition.y) / 2 + 150,
  });
};
export const createStarterDiagram = () => {
  const usuario = makeNode('entity', 'Usuario', { x: 90, y: 300 });
  usuario.data.properties.push({ visibility: '+', name: 'nombre', type: 'String' }, { visibility: '+', name: 'email', type: 'String' });
  const proyecto = makeNode('entity', 'Proyecto', { x: 480, y: 120 });
  proyecto.data.properties.push({ visibility: '+', name: 'nombre', type: 'String' }, { visibility: '+', name: 'direccion', type: 'String' });
  return {
    nodes: [usuario, proyecto],
    edges: [{ id: 'usuario-proyecto', source: usuario.id, target: proyecto.id, type: 'relationEdge', data: { relationType: 'asociacion', label: '@OneToMany', jpaAnnotation: '@OneToMany', umlLabel: '', cardinality: '1 : N', multiplicidadOrigen: '1', multiplicidadDestino: 'N' } }],
  };
};

const useDiagramStore = create((set, get) => ({
  nodes: [], edges: [], selectedNodeId: null, history: [], future: [],
  onNodesChange: (changes) => set((state) => {
    // React Flow emite cambios internos de dimensiones/selección al montar un
    // nodo. No deben ocupar una entrada de undo antes de la acción real.
    const isUserHistoryChange = changes.some((change) => change.type === 'remove'
      || (change.type === 'position' && change.dragging === false));
    return { ...(isUserHistoryChange ? historyPatch(state) : {}), nodes: applyNodeChanges(changes, state.nodes) };
  }),
  onEdgesChange: (changes) => set((state) => ({ ...historyPatch(state), edges: applyEdgeChanges(changes, state.edges) })),
  onConnect: (connection) => set((state) => {
    const newEdge = { ...connection, ...closestHandlesFor(state.nodes, connection.source, connection.target), id: relationId(), type: 'relationEdge', data: { relationType: 'asociacion', label: '@OneToMany', jpaAnnotation: '@OneToMany', umlLabel: '', cardinality: '1 : N', multiplicidadOrigen: '1', multiplicidadDestino: 'N' } };
    const pendingEdges = addEdge(newEdge, state.edges);
    const layout = distributeRelationAnchors(state.nodes, pendingEdges);
    return { ...historyPatch(state), edges: pendingEdges.map((edge) => {
      const placement = layout[edge.id];
      return { ...edge, sourceHandle: placement.sourceHandle, targetHandle: placement.targetHandle, data: { ...edge.data, sourceAnchor: placement.sourceAnchor, targetAnchor: placement.targetAnchor } };
    }) };
  }),
  syncRelationHandles: () => set((state) => {
    let changed = false;
    const layout = distributeRelationAnchors(state.nodes, state.edges);
    const edges = state.edges.map((edge) => {
      const { sourceHandle, targetHandle, sourceAnchor, targetAnchor } = layout[edge.id];
      const anchorsMatch = edge.data?.sourceAnchor?.side === sourceAnchor.side
        && edge.data?.sourceAnchor?.offset === sourceAnchor.offset
        && edge.data?.targetAnchor?.side === targetAnchor.side
        && edge.data?.targetAnchor?.offset === targetAnchor.offset;
      if (edge.sourceHandle === sourceHandle && edge.targetHandle === targetHandle && anchorsMatch) return edge;
      changed = true;
      return { ...edge, sourceHandle, targetHandle, data: { ...edge.data, sourceAnchor, targetAnchor } };
    });
    return changed ? { edges } : {};
  }),
  reconnectRelation: (id, connection) => {
    let updated = false;
    set((state) => {
      const edge = state.edges.find((item) => item.id === id);
      const sourceNode = state.nodes.find((node) => node.id === connection.source);
      const targetNode = state.nodes.find((node) => node.id === connection.target);
      if (!edge || !canConnectRelation(edge.data?.relationType || 'asociacion', sourceNode, targetNode)) return {};
      updated = true;
      const associationClassIsEndpoint = edge.data?.associationClassNodeId === connection.source || edge.data?.associationClassNodeId === connection.target;
      return {
        ...historyPatch(state),
        edges: state.edges.map((item) => item.id === id ? {
          ...item,
          source: connection.source,
          target: connection.target,
          sourceHandle: connection.sourceHandle || item.sourceHandle,
          targetHandle: connection.targetHandle || item.targetHandle,
          data: associationClassIsEndpoint ? (() => { const data = { ...item.data }; delete data.associationClassNodeId; return data; })() : item.data,
        } : item),
      };
    });
    if (updated) diagramMutationListener?.();
    return updated;
  },
  updateRelationAnchors: (id, sourceAnchor, targetAnchor) => {
    set((state) => ({
      ...historyPatch(state),
      edges: state.edges.map((edge) => edge.id === id ? { ...edge, data: { ...edge.data, sourceAnchor, targetAnchor } } : edge),
    }));
    diagramMutationListener?.();
  },
  selectNode: (id) => set({ selectedNodeId: id }),
  createNode: (kind, title, position) => { const node = makeNode(kind, title || 'NuevaEntidad', position || { x: 160 + Math.random() * 400, y: 120 + Math.random() * 280 }); set((state) => ({ ...historyPatch(state), nodes: [...state.nodes, node], selectedNodeId: null })); return node; },
  updateNode: (id, patch) => set((state) => ({ ...historyPatch(state), nodes: state.nodes.map((node) => { if (node.id !== id) return node; const nextData = { ...node.data, ...patch }; const kind = nextData.kind || 'entity'; return { ...node, data: { ...nextData, ...dataForKind(kind, nextData), kind } }; }) })),
  addAttribute: (id) => set((state) => ({ ...historyPatch(state), nodes: state.nodes.map((node) => node.id === id ? { ...node, data: { ...node.data, properties: [...node.data.properties, { visibility: '+', name: 'nuevoAtributo', type: 'String', embedded: false }] } } : node) })),
  updateAttribute: (id, index, patch) => set((state) => ({ ...historyPatch(state), nodes: state.nodes.map((node) => node.id === id ? { ...node, data: { ...node.data, properties: node.data.properties.map((property, itemIndex) => itemIndex === index ? normalizeAttribute({ ...property, ...patch }, node.data.kind || 'entity') : property) } } : node) })),
  removeAttribute: (id, index) => set((state) => ({ ...historyPatch(state), nodes: state.nodes.map((node) => node.id === id ? { ...node, data: { ...node.data, properties: node.data.properties.filter((_, i) => i !== index) } } : node) })),
  addMethod: (id) => set((state) => ({ ...historyPatch(state), nodes: state.nodes.map((node) => node.id === id ? { ...node, data: { ...node.data, methods: [...(node.data.methods || []), 'nuevoMetodo(): void'] } } : node) })),
  updateMethod: (id, index, value) => set((state) => ({ ...historyPatch(state), nodes: state.nodes.map((node) => node.id === id ? { ...node, data: { ...node.data, methods: (node.data.methods || []).map((method, i) => i === index ? value : method) } } : node) })),
  removeMethod: (id, index) => set((state) => ({ ...historyPatch(state), nodes: state.nodes.map((node) => node.id === id ? { ...node, data: { ...node.data, methods: (node.data.methods || []).filter((_, i) => i !== index) } } : node) })),
  duplicateNode: (id) => {
    const source = get().nodes.find((node) => node.id === id);
    if (!source) return null;
    const extension = source.data.title.endsWith('.java') ? '.java' : '';
    const base = source.data.title.slice(0, extension ? -extension.length : undefined);
    const names = new Set(get().nodes.map((node) => node.data.title));
    let copyTitle = `${base} copia${extension}`;
    for (let index = 2; names.has(copyTitle); index += 1) copyTitle = `${base} copia ${index}${extension}`;
    const node = { ...source, id: `${source.data.kind || 'entity'}-${crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`, position: { x: source.position.x + 40, y: source.position.y + 40 }, data: { ...source.data, title: copyTitle, properties: (source.data.properties || []).map((property) => ({ ...property })), methods: [...(source.data.methods || [])] } };
    set((state) => ({ ...historyPatch(state), nodes: [...state.nodes, node], selectedNodeId: null }));
    return node;
  },
  setNodePositionLocked: (id, positionLocked) => set((state) => ({ ...historyPatch(state), nodes: state.nodes.map((node) => node.id === id ? { ...node, data: { ...node.data, positionLocked } } : node) })),
  deleteNode: (id) => set((state) => ({
    ...historyPatch(state),
    nodes: state.nodes.filter((node) => node.id !== id),
    edges: state.edges
      .filter((edge) => edge.source !== id && edge.target !== id)
      .map((edge) => {
        if (edge.data?.associationClassNodeId !== id) return edge;
        const data = { ...edge.data };
        delete data.associationClassNodeId;
        return { ...edge, data };
      }),
    selectedNodeId: null,
  })),
  deleteRelation: (id) => set((state) => ({ ...historyPatch(state), edges: state.edges.filter((edge) => edge.id !== id) })),
  setAssociationClassNode: (edgeId, nodeId) => {
    let updated = false;
    set((state) => {
      const edge = state.edges.find((item) => item.id === edgeId);
      const associationNode = state.nodes.find((node) => node.id === nodeId);
      if (!edge || edge.data?.relationType !== 'asociacion' || !associationNode || nodeId === edge.source || nodeId === edge.target) return {};
      updated = true;
      return {
        ...historyPatch(state),
        edges: state.edges.map((item) => item.id === edgeId ? { ...item, data: { ...item.data, associationClassNodeId: nodeId } } : item),
      };
    });
    if (updated) diagramMutationListener?.();
    return updated;
  },
  createAssociationClassNode: (edgeId) => {
    let associationClassNode = null;
    set((state) => {
      const edge = state.edges.find((item) => item.id === edgeId);
      if (!edge || edge.data?.relationType !== 'asociacion' || edge.data.associationClassNodeId) return {};
      associationClassNode = associationClassNodeFor(state, edge);
      if (!associationClassNode) return {};
      return {
        ...historyPatch(state),
        nodes: [...state.nodes, associationClassNode],
        edges: state.edges.map((item) => item.id === edgeId ? { ...item, data: { ...item.data, associationClassNodeId: associationClassNode.id } } : item),
      };
    });
    if (associationClassNode) diagramMutationListener?.();
    return associationClassNode;
  },
  clearAssociationClassNode: (edgeId) => {
    let updated = false;
    set((state) => {
      if (!state.edges.some((edge) => edge.id === edgeId && edge.data?.associationClassNodeId)) return {};
      updated = true;
      return {
        ...historyPatch(state),
        edges: state.edges.map((edge) => {
          if (edge.id !== edgeId || !edge.data?.associationClassNodeId) return edge;
          const data = { ...edge.data };
          delete data.associationClassNodeId;
          return { ...edge, data };
        }),
      };
    });
    if (updated) diagramMutationListener?.();
    return updated;
  },
  undo: () => set((state) => { const previous = state.history.at(-1); return previous ? { nodes: previous.nodes, edges: previous.edges, selectedNodeId: null, history: state.history.slice(0, -1), future: [snapshot(state), ...state.future].slice(0, 50) } : {}; }),
  redo: () => set((state) => { const next = state.future[0]; return next ? { nodes: next.nodes, edges: next.edges, selectedNodeId: null, history: [...state.history, snapshot(state)].slice(-50), future: state.future.slice(1) } : {}; }),
  updateRelationMultiplicity: (id, multiplicidadOrigen, multiplicidadDestino) => {
    set((state) => ({ ...historyPatch(state), edges: state.edges.map((edge) => edge.id === id ? { ...edge, data: { ...edge.data, multiplicidadOrigen, multiplicidadDestino, cardinality: `${multiplicidadOrigen} : ${multiplicidadDestino}` } } : edge) }));
    diagramMutationListener?.();
  },
  updateRelation: (id, patch) => {
    const { multiplicidadOrigen, multiplicidadDestino, umlLabel, ...semanticPatch } = patch;
    set((state) => ({ ...historyPatch(state), edges: state.edges.map((edge) => edge.id === id ? {
      ...edge,
      data: {
        ...edge.data,
        multiplicidadOrigen,
        multiplicidadDestino,
        umlLabel: umlLabel?.trim() || '',
        cardinality: `${multiplicidadOrigen} : ${multiplicidadDestino}`,
        ...semanticPatch,
      },
    } : edge) }));
    diagramMutationListener?.();
  },
  createRelation: (type, source, target) => {
    const sourceNode = get().nodes.find((node) => node.id === source);
    const targetNode = get().nodes.find((node) => node.id === target);
    if (!source || !target || !canConnectRelation(legacyRelationTypes[type] || type, sourceNode, targetNode)) return false;
    const relationType = legacyRelationTypes[type] || type;
    const meta = relationMeta[relationType] || relationMeta.asociacion;
    const [multiplicidadOrigen, multiplicidadDestino] = meta.cardinality.split(':').map((value) => value.trim());
    const relationConvention = relationType === 'agregacion' || relationType === 'composicion' ? targetWholeConvention : undefined;
    set((state) => {
      const edge = { id: relationId(), source, target, ...closestHandlesFor(state.nodes, source, target), type: 'relationEdge', data: { relationType, relationConvention, label: meta.jpaAnnotation, jpaAnnotation: meta.jpaAnnotation, umlLabel: '', cardinality: meta.cardinality, multiplicidadOrigen, multiplicidadDestino, ownerNodeId: relationType === 'agregacion' || relationType === 'composicion' ? target : source, wholeNodeId: relationType === 'agregacion' || relationType === 'composicion' ? target : undefined, bidirectional: false, sourceRole: '', targetRole: '' } };
      const pendingEdges = [...state.edges, edge];
      const layout = distributeRelationAnchors(state.nodes, pendingEdges);
      return { ...historyPatch(state), edges: pendingEdges.map((item) => {
        const placement = layout[item.id];
        return { ...item, sourceHandle: placement.sourceHandle, targetHandle: placement.targetHandle, data: { ...item.data, sourceAnchor: placement.sourceAnchor, targetAnchor: placement.targetAnchor } };
      }) };
    });
    return true;
  },
  restore: (diagram = {}, { preserveSelection = false, recordHistory = false } = {}) => {
    let migrated = false;
    set((current) => {
      const nodes = (diagram.nodes || []).map((node) => {
        const kind = node.data?.kind || 'entity';
        const baseData = { ...node.data, kind, properties: (node.data?.properties || []).map((attribute) => normalizeAttribute(attribute, kind)), methods: node.data?.methods || [] };
        const data = { ...baseData, ...dataForKind(kind, baseData), kind };
        migrated ||= node.data?.kind !== kind || node.data?.abstract !== data.abstract || (kind === 'enum' && JSON.stringify(node.data?.literals) !== JSON.stringify(data.literals));
        return { ...node, data };
      });
      const normalizedEdges = (diagram.edges || []).map((edge) => {
        const normalized = normalizeRelationEdge(edge);
        migrated ||= normalized.source !== edge.source || normalized.target !== edge.target || normalized.sourceHandle !== edge.sourceHandle || normalized.targetHandle !== edge.targetHandle || normalized.data.relationConvention !== edge.data?.relationConvention;
        return normalized;
      });
      const nodeIds = new Set(nodes.map((node) => node.id));
      const edges = normalizedEdges.map((edge) => {
        const associationClassNodeId = edge.data?.associationClassNodeId;
        const isValidAssociationClass = edge.data?.relationType === 'asociacion'
          && nodeIds.has(associationClassNodeId)
          && associationClassNodeId !== edge.source
          && associationClassNodeId !== edge.target;
        if (!associationClassNodeId || isValidAssociationClass) return edge;
        migrated = true;
        const data = { ...edge.data };
        delete data.associationClassNodeId;
        return { ...edge, data };
      });
      const selectedNodeId = preserveSelection && nodes.some((node) => node.id === current.selectedNodeId)
        ? current.selectedNodeId
        : null;
      return {
        nodes,
        edges,
        selectedNodeId,
        // Una aplicación IA es una única operación autoritativa: conserva un
        // único punto de deshacer sin convertir restauraciones remotas en
        // cambios locales del historial.
        history: recordHistory ? [...current.history, snapshot(current)].slice(-50) : [],
        future: [],
      };
    });
    return migrated;
  },
}));
export default useDiagramStore;
