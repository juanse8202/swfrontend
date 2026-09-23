import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ReactFlow, { Background, ConnectionMode, Controls, MiniMap } from 'reactflow';
import 'reactflow/dist/style.css';
import { FiChevronDown, FiChevronLeft, FiChevronRight, FiCopy, FiDownload, FiEdit3, FiLock, FiLogOut, FiPlus, FiShare2, FiTrash2, FiUnlock, FiUpload, FiX, FiZap } from 'react-icons/fi';
import ClassNode from './ClassNode';
import RelationEdge from './RelationEdge';
import EditorToolbar from './EditorToolbar';
import PropertiesPanel from './PropertiesPanel';
import ProjectsDialog from './ProjectsDialog';
import NewProjectDialog from './NewProjectDialog';
import PeopleDialog from './PeopleDialog';
import CollaboratorsDialog from '../collaboration/CollaboratorsDialog';
import { useEscapeClose } from '../../hooks/useEscapeClose';
import useDiagramStore, { createStarterDiagram, setDiagramMutationListener } from '../../stores/diagramStore';
import { actualizarRolMiembro, cancelarInvitacion, contenidoDiagrama, crearDiagramaPrincipal, crearProyecto, eliminarColaborador, generarSpringBoot, guardarDiagrama, invitarProyecto, listarProyectos, obtenerDiagramaPrincipal, reenviarInvitacion } from '../../api/diagramApi';
import { obtenerSesion } from '../../api/authApi';
import { useDiagramSocket } from '../../hooks/useDiagramSocket';

const nodeTypes = { umlClass: ClassNode };
const edgeTypes = { relationEdge: RelationEdge };
const principalDraftKey = 'diagramcraft-principal-draft';
const relationLabels = { asociacion: 'Asociación', agregacion: 'Agregación', composicion: 'Composición', herencia: 'Herencia', realizacion: 'Realización', dependencia: 'Dependencia' };
const classNodeKinds = new Set(['class', 'entity']);
const isClassNode = (node) => classNodeKinds.has(node?.data?.kind || 'entity');
const isAllowedRelation = (type, source, target) => {
  if (!source || !target || source.id === target.id) return false;
  if (type === 'realizacion') return isClassNode(source) && target.data?.kind === 'interface';
  if (type === 'herencia') return isClassNode(source) && isClassNode(target);
  if (['asociacion', 'agregacion', 'composicion'].includes(type)) return source.data?.kind === 'entity' && target.data?.kind === 'entity';
  return true;
};

const anchorPoint = (bounds, anchor, fallbackSide) => {
  if (!bounds) return null;
  const offset = Math.max(0, Math.min(1, anchor?.offset ?? 0.5));
  const side = anchor?.side || fallbackSide;
  if (side === 'top') return { x: bounds.x + bounds.width * offset, y: bounds.y };
  if (side === 'bottom') return { x: bounds.x + bounds.width * offset, y: bounds.y + bounds.height };
  if (side === 'left') return { x: bounds.x, y: bounds.y + bounds.height * offset };
  return { x: bounds.x + bounds.width, y: bounds.y + bounds.height * offset };
};
const segmentIntersection = (a, b, c, d) => {
  const denominator = (b.x - a.x) * (d.y - c.y) - (b.y - a.y) * (d.x - c.x);
  if (Math.abs(denominator) < 0.001) return null;
  const u = ((c.x - a.x) * (b.y - a.y) - (c.y - a.y) * (b.x - a.x)) / denominator;
  const t = ((c.x - a.x) * (d.y - c.y) - (c.y - a.y) * (d.x - c.x)) / denominator;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y), t, u };
};
const controlOffset = (distance) => distance >= 0 ? distance / 2 : 0.25 * 25 * Math.sqrt(-distance);
const bezierControl = (point, other, side) => {
  if (side === 'left') return { x: point.x - controlOffset(point.x - other.x), y: point.y };
  if (side === 'right') return { x: point.x + controlOffset(other.x - point.x), y: point.y };
  if (side === 'top') return { x: point.x, y: point.y - controlOffset(point.y - other.y) };
  return { x: point.x, y: point.y + controlOffset(other.y - point.y) };
};
const bezierSamples = (source, target, sourceSide, targetSide, count = 36) => {
  const sourceControl = bezierControl(source, target, sourceSide);
  const targetControl = bezierControl(target, source, targetSide);
  return Array.from({ length: count + 1 }, (_, index) => {
    const t = index / count;
    const inverse = 1 - t;
    return {
      x: inverse ** 3 * source.x + 3 * inverse ** 2 * t * sourceControl.x + 3 * inverse * t ** 2 * targetControl.x + t ** 3 * target.x,
      y: inverse ** 3 * source.y + 3 * inverse ** 2 * t * sourceControl.y + 3 * inverse * t ** 2 * targetControl.y + t ** 3 * target.y,
    };
  });
};
const curveIntersection = (base, bridge) => {
  for (let index = 0; index < base.length - 1; index += 1) {
    for (let otherIndex = 0; otherIndex < bridge.length - 1; otherIndex += 1) {
      const crossing = segmentIntersection(base[index], base[index + 1], bridge[otherIndex], bridge[otherIndex + 1]);
      if (!crossing) continue;
      const baseProgress = (index + crossing.t) / (base.length - 1);
      const bridgeProgress = (otherIndex + crossing.u) / (bridge.length - 1);
      if (baseProgress <= 0.08 || baseProgress >= 0.92 || bridgeProgress <= 0.08 || bridgeProgress >= 0.92) continue;
      return { ...crossing, angle: Math.atan2(bridge[otherIndex + 1].y - bridge[otherIndex].y, bridge[otherIndex + 1].x - bridge[otherIndex].x) * 180 / Math.PI };
    }
  }
  return null;
};

function loadPrincipalDraft() {
  try { return JSON.parse(window.sessionStorage.getItem(principalDraftKey)) || createStarterDiagram(); } catch { return createStarterDiagram(); }
}

const readGenerationError = (payload) => {
  if (payload instanceof ArrayBuffer) {
    try { return JSON.parse(new TextDecoder().decode(payload)); } catch { return {}; }
  }
  return payload || {};
};
const generationIssues = (payload, fallback) => {
  const body = readGenerationError(payload);
  const raw = body.errors || body.errores || body.detail || body.message || body;
  const item = (value, extra = {}) => {
    if (typeof value === 'string') return { message: value, ...extra };
    return { message: value?.message || value?.mensaje || value?.detail || 'El modelo UML tiene un error de validación.', node_id: value?.node_id || value?.nodeId || extra.node_id, edge_id: value?.edge_id || value?.edgeId || extra.edge_id };
  };
  if (Array.isArray(raw)) return raw.map((value) => item(value));
  if (typeof raw === 'object' && raw) return Object.entries(raw).flatMap(([key, value]) => (Array.isArray(value) ? value.map((entry) => item(entry, { field: key })) : [item(value, { field: key })]));
  return [item(fallback || 'No se pudo generar el proyecto.')];
};
const zipFilename = (header) => {
  const match = /filename\*?=(?:UTF-8''|")?([^;"]+)/i.exec(header || '');
  try { return match?.[1] ? decodeURIComponent(match[1].replace(/["]/g, '')) : 'spring-boot-project.zip'; } catch { return 'spring-boot-project.zip'; }
};

export default function DiagramCanvas({ onLogout }) {
  const store = useDiagramStore();
  const { nodes, edges, selectedNodeId, onNodesChange: applyNodesChange, onEdgesChange: applyEdgesChange, syncRelationHandles, reconnectRelation: reconnectStoreRelation, updateRelationAnchors: persistRelationAnchors, selectNode, createNode: addNode, createRelation: addRelation, updateNode: patchNode, addAttribute: appendAttribute, updateAttribute: patchAttribute, removeAttribute: deleteAttribute, addMethod: appendMethod, updateMethod: patchMethod, removeMethod: deleteMethod, duplicateNode: copyNode, setNodePositionLocked, deleteNode: removeNode, deleteRelation: removeRelation, createAssociationClassNode, clearAssociationClassNode, undo, redo, restore } = store;
  const [projects, setProjects] = useState([]);
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [activeDiagramId, setActiveDiagramId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [projectNameError, setProjectNameError] = useState('');
  const [shareOpen, setShareOpen] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [invite, setInvite] = useState('');
  const [acceptedInvitationMember, setAcceptedInvitationMember] = useState(null);
  const [relationType, setRelationType] = useState(null);
  const [relationTarget, setRelationTarget] = useState('');
  const [pendingConnection, setPendingConnection] = useState(null);
  const [toast, setToast] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [saveStatus, setSaveStatus] = useState('local');
  const [currentUser, setCurrentUser] = useState(null);
  const [onlineMembers, setOnlineMembers] = useState([]);
  const [deleteCandidate, setDeleteCandidate] = useState(null);
  const [nodeMenu, setNodeMenu] = useState(null);
  const [editorPosition, setEditorPosition] = useState(null);
  const [relationMenu, setRelationMenu] = useState(null);
  const [relationAnchorPreview, setRelationAnchorPreview] = useState({});
  const [generating, setGenerating] = useState(false);
  const [generationErrors, setGenerationErrors] = useState([]);
  const [highlightedEdgeId, setHighlightedEdgeId] = useState(null);
  const savingRef = useRef(false);
  const saveTimerRef = useRef(null);
  const saveQueuedRef = useRef(false);
  const diagramLoadedRef = useRef(false);
  const activeProjectRef = useRef(activeProjectId);
  const activeDiagramRef = useRef(activeDiagramId);
  const diagramStateRef = useRef({ nodes, edges });
  const hasPendingChangesRef = useRef(false);
  const socketSyncTimerRef = useRef(null);
  const canEditRef = useRef(false);
  const currentUserRef = useRef(null);
  const leavingProjectRef = useRef(false);
  const socketSendRef = useRef(null);
  const scheduleCurrentSaveRef = useRef(null);
  const reactFlowRef = useRef(null);

  const returnToPrincipalCanvas = useCallback((message = 'Ya no tienes acceso a este proyecto.') => {
    clearTimeout(saveTimerRef.current);
    clearTimeout(socketSyncTimerRef.current);
    if (activeDiagramRef.current) {
      socketSendRef.current?.({ type: 'presence.leave', diagram_id: activeDiagramRef.current });
    }
    window.sessionStorage.removeItem('diagramcraft-active-project');
    diagramLoadedRef.current = false;
    activeProjectRef.current = null;
    activeDiagramRef.current = null;
    hasPendingChangesRef.current = false;
    setActiveProjectId(null);
    setActiveDiagramId(null);
    setProjectsOpen(false);
    setShareOpen(false);
    setPeopleOpen(false);
    setNodeMenu(null);
    setOnlineMembers([]);
    setSaveStatus('local');
    if (restore(loadPrincipalDraft())) scheduleCurrentSaveRef.current?.();
    setToast(message);
  }, [restore]);

  const onSocketMessage = useCallback((event) => {
    const removalEvents = ['member.removed', 'collaborator.removed', 'project.member.removed'];
    if (removalEvents.includes(event?.type) && String(event.proyecto_id || event.project_id) === String(activeProjectRef.current)) {
      const removedUserId = event.usuario_id || event.user_id || event.miembro?.usuario?.id || event.member?.usuario?.id;
      if (removedUserId && String(removedUserId) === String(currentUserRef.current?.id)) {
        returnToPrincipalCanvas(event.detail || 'El propietario te eliminó del proyecto. Volviste al lienzo principal.');
      }
      return;
    }
    if (event?.type === 'presence.update') {
      setOnlineMembers(Array.isArray(event.miembros) ? event.miembros : Array.isArray(event.members) ? event.members : Array.isArray(event.users) ? event.users : []);
      // Un colaborador que acepta la invitación entra a la sala. Recargamos el
      // proyecto para moverlo de invitaciones_pendientes a miembros.
      listarProyectos().then(setProjects).catch(() => {});
      return;
    }
    if (event?.type === 'invitation.accepted' && String(event.proyecto_id) === String(activeProjectRef.current)) {
      setProjects((items) => items.map((project) => {
        if (String(project.id) !== String(event.proyecto_id)) return project;
        const pending = (project.invitaciones_pendientes || []).filter((invitation) => String(invitation.id) !== String(event.invitacion_id));
        const members = project.miembros || [];
        const alreadyMember = members.some((member) => String(member.usuario?.id) === String(event.miembro?.usuario?.id));
        return { ...project, invitaciones_pendientes: pending, miembros: alreadyMember || !event.miembro ? members : [...members, event.miembro] };
      }));
      setAcceptedInvitationMember(event.miembro || null);
      setToast('Un colaborador aceptó la invitación y se unió al proyecto.');
      return;
    }
    if (event?.type === 'diagram.error') {
      setToast(`Error de sincronización: ${event.detail || 'el servidor rechazó el cambio.'}`);
      return;
    }
    if (event?.type !== 'diagram.update' || String(event.diagram_id) !== String(activeDiagramRef.current)) return;
    if (Array.isArray(event.nodes) && Array.isArray(event.edges)) {
      // restore escribe directamente nodes/edges en el store, equivalente a
      // setNodes(event.nodes) y setEdges(event.edges) de React Flow.
      const migrated = restore({ nodes: event.nodes, edges: event.edges }, { preserveSelection: true });
      const restored = useDiagramStore.getState();
      diagramStateRef.current = { nodes: restored.nodes, edges: restored.edges };
      hasPendingChangesRef.current = false;
      setSaveStatus('saved');
      if (migrated) scheduleCurrentSaveRef.current?.();
    }
  }, [restore, returnToPrincipalCanvas]);
  const { status: socketStatus, send: sendSocketEvent } = useDiagramSocket(activeDiagramId, onSocketMessage);

  useEffect(() => {
    socketSendRef.current = sendSocketEvent;
    return () => { socketSendRef.current = null; };
  }, [sendSocketEvent]);

  useEffect(() => {
    if (socketStatus === 'connected' && activeDiagramId) sendSocketEvent({ type: 'presence.join', diagram_id: activeDiagramId });
  }, [activeDiagramId, sendSocketEvent, socketStatus]);

  async function persistPendingChanges({ silent = false } = {}) {
    if (!diagramLoadedRef.current || !activeProjectRef.current || !hasPendingChangesRef.current) return true;
    if (savingRef.current) { saveQueuedRef.current = true; return false; }
    savingRef.current = true;
    setSaveStatus('saving');
    const contenido = diagramStateRef.current;
    try {
      if (activeDiagramRef.current) {
        await guardarDiagrama(activeDiagramRef.current, contenido);
      } else {
        const diagram = await crearDiagramaPrincipal(activeProjectRef.current, contenido);
        activeDiagramRef.current = diagram.id;
        setActiveDiagramId(diagram.id);
      }
      hasPendingChangesRef.current = false;
      setSaveStatus('saved');
      return true;
    } catch (requestError) {
      setSaveStatus('error');
      if (!silent) setToast(requestError.response?.data?.detail || 'No se pudo guardar el diagrama.');
      return false;
    } finally {
      savingRef.current = false;
      if (saveQueuedRef.current) {
        saveQueuedRef.current = false;
        setSaveStatus('pending');
        saveTimerRef.current = setTimeout(() => { persistPendingChanges(); }, 700);
      }
    }
  }

  function scheduleSave() {
    if (!diagramLoadedRef.current || !activeProjectRef.current) return;
    clearTimeout(saveTimerRef.current);
    setSaveStatus('pending');
    saveTimerRef.current = setTimeout(() => { persistPendingChanges(); }, 700);
  }

  function scheduleCurrentSave() {
    const current = useDiagramStore.getState();
    diagramStateRef.current = { nodes: current.nodes, edges: current.edges };
    hasPendingChangesRef.current = true;
    if (!activeProjectRef.current) {
      window.sessionStorage.setItem(principalDraftKey, JSON.stringify(diagramStateRef.current));
      setSaveStatus('local');
      return;
    }
    if (canEditRef.current && activeDiagramRef.current) {
      clearTimeout(socketSyncTimerRef.current);
      socketSyncTimerRef.current = setTimeout(() => {
        sendSocketEvent({
          type: 'diagram.update',
          diagram_id: activeDiagramRef.current,
          nodes: diagramStateRef.current.nodes,
          edges: diagramStateRef.current.edges,
        });
      }, 80);
    }
    scheduleSave();
  }
  useEffect(() => {
    scheduleCurrentSaveRef.current = scheduleCurrentSave;
  });
  const onNodesChange = (changes) => {
    applyNodesChange(changes);
    if (changes.some((change) => change.type === 'position' && change.dragging === false)) syncRelationHandles();
    scheduleCurrentSave();
  };
  const onEdgesChange = (changes) => { applyEdgesChange(changes); scheduleCurrentSave(); };
  const onConnect = (connection) => {
    if (!connection.source || !connection.target || connection.source === connection.target) {
      setToast('Selecciona dos clases diferentes para crear una relación.');
      return;
    }
    // No se crea una asociación implícita: primero el usuario decide la
    // semántica UML al soltar la conexión sobre la clase destino.
    setPendingConnection({ source: connection.source, target: connection.target });
  };
  const createNode = (...args) => { const node = addNode(...args); scheduleCurrentSave(); return node; };
  const createRelation = (...args) => { const [type, sourceId, targetId] = args; const source = nodes.find((node) => node.id === sourceId); const target = nodes.find((node) => node.id === targetId); if (!isAllowedRelation(type, source, target)) { setToast(['asociacion', 'agregacion', 'composicion'].includes(type) ? 'Las relaciones JPA solo se permiten entre entidades.' : type === 'realizacion' ? 'La realización debe ir de una clase o entidad hacia una interface.' : 'La herencia debe ir de una clase o entidad hija hacia una clase o entidad padre.'); return false; } const created = addRelation(...args); if (created) scheduleCurrentSave(); return created; };
  const updateNode = (...args) => { patchNode(...args); scheduleCurrentSave(); };
  const addAttribute = (...args) => { appendAttribute(...args); scheduleCurrentSave(); };
  const updateAttribute = (...args) => { patchAttribute(...args); scheduleCurrentSave(); };
  const removeAttribute = (...args) => { deleteAttribute(...args); scheduleCurrentSave(); };
  const addMethod = (...args) => { appendMethod(...args); scheduleCurrentSave(); };
  const updateMethod = (...args) => { patchMethod(...args); scheduleCurrentSave(); };
  const removeMethod = (...args) => { deleteMethod(...args); scheduleCurrentSave(); };
  const duplicateNode = (...args) => { const node = copyNode(...args); if (node) scheduleCurrentSave(); return node; };
  const deleteRelation = (id) => { removeRelation(id); scheduleCurrentSave(); };
  const reconnectRelation = (edge, connection) => { if (reconnectStoreRelation(edge.id, connection)) scheduleCurrentSave(); };
  const previewRelationAnchor = (edgeId, end, anchor) => setRelationAnchorPreview((current) => ({ ...current, [edgeId]: { ...current[edgeId], [end]: anchor } }));
  const commitRelationAnchor = (edgeId, end, anchor) => {
    const edge = edges.find((item) => item.id === edgeId);
    if (!edge) return;
    const preview = relationAnchorPreview[edgeId] || {};
    const fallback = (handle, side) => ({ side: handle || side, offset: 0.5 });
    const sourceAnchor = end === 'source' ? anchor : preview.source || edge.data?.sourceAnchor || fallback(edge.sourceHandle, 'right');
    const targetAnchor = end === 'target' ? anchor : preview.target || edge.data?.targetAnchor || fallback(edge.targetHandle, 'left');
    persistRelationAnchors(edgeId, sourceAnchor, targetAnchor);
    setRelationAnchorPreview((current) => { const next = { ...current }; delete next[edgeId]; return next; });
    scheduleCurrentSave();
  };
  const createAssociationClass = (edgeId) => { const node = createAssociationClassNode(edgeId); if (node) scheduleCurrentSave(); return node; };
  const unlinkAssociationClass = (edgeId) => { const unlinked = clearAssociationClassNode(edgeId); if (unlinked) scheduleCurrentSave(); return unlinked; };
  const toggleNodeLock = (id, locked) => { setNodePositionLocked(id, locked); scheduleCurrentSave(); };
  const undoDiagram = () => { undo(); scheduleCurrentSave(); };
  const redoDiagram = () => { redo(); scheduleCurrentSave(); };
  const deleteNode = (...args) => { removeNode(...args); scheduleCurrentSave(); };

  useEffect(() => {
    setDiagramMutationListener(scheduleCurrentSave);
  });

  // Este cleanup debe ejecutarse únicamente al desmontar el editor. Si se
  // ejecuta tras cada render, cancela el envío WebSocket programado al arrastrar.
  useEffect(() => {
    return () => {
      clearTimeout(socketSyncTimerRef.current);
      setDiagramMutationListener(null);
    };
  }, []);

  const openProject = useCallback(async (project, closeDialog = true, forceEmpty = false) => {
    try {
      clearTimeout(saveTimerRef.current);
      await persistPendingChanges();
      diagramLoadedRef.current = false;
      setNodeMenu(null);
      const diagram = forceEmpty ? null : await obtenerDiagramaPrincipal(project);
      const migrated = restore(diagram ? contenidoDiagrama(diagram) : { nodes: [], edges: [] });
      const restored = useDiagramStore.getState();
      diagramStateRef.current = { nodes: restored.nodes, edges: restored.edges };
      hasPendingChangesRef.current = false;
      activeProjectRef.current = project.id;
      activeDiagramRef.current = diagram?.id || null;
      diagramLoadedRef.current = true;
      setActiveProjectId(project.id);
      setActiveDiagramId(diagram?.id || null);
      setSaveStatus(diagram ? 'saved' : 'empty');
      window.sessionStorage.setItem('diagramcraft-active-project', String(project.id));
      if (migrated) scheduleCurrentSave();
      if (closeDialog) setProjectsOpen(false);
      if (!diagram) setToast(`El proyecto “${project.nombre || project.name}” aún no tiene un diagrama principal.`);
    } catch (requestError) {
      setToast(requestError.response?.data?.detail || 'No se pudo cargar el diagrama principal.');
    }
  // persistPendingChanges solo opera sobre refs; restore es la única dependencia reactiva.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restore]);

  const refreshProjects = useCallback(async () => {
    const items = await listarProyectos();
    setProjects(items);
    return items;
  }, []);

  useEffect(() => {
    let mounted = true;
    async function loadEditor() {
      try {
        // Confirma la cookie de sesión actual antes de pedir recursos privados.
        const session = await obtenerSesion();
        const user = session?.user || session;
        if (!user?.id) throw new Error('No hay una sesión de usuario válida.');
        const items = await refreshProjects();
        if (!mounted) return;
        setCurrentUser(user);
        currentUserRef.current = user;
        setProjects(items);
        setLoading(false);
        const savedProjectId = window.sessionStorage.getItem('diagramcraft-active-project');
        const savedProject = items.find((project) => String(project.id) === savedProjectId);
        if (savedProject) openProject(savedProject, false);
        else if (restore(loadPrincipalDraft())) scheduleCurrentSaveRef.current?.();
      } catch (requestError) {
        if (!mounted) return;
        setError(requestError.response?.data?.detail || requestError.message || 'No se pudieron cargar tus proyectos.');
        setLoading(false);
      }
    }
    loadEditor();
    return () => { mounted = false; };
  }, [openProject, refreshProjects, restore]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(''), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  const activeProject = projects.find((project) => project.id === activeProjectId);
  const pendingInvitationCount = activeProject?.invitaciones_pendientes?.length || 0;
  useEffect(() => {
    if (!shareOpen || !activeProjectId) return undefined;

    let mounted = true;
    const refreshCollaborators = async () => {
      try {
        await refreshProjects();
      } catch {
        // El WebSocket sigue siendo el mecanismo inmediato. Esta recarga es
        // una alternativa silenciosa cuando el backend no emite el evento.
      }
    };

    refreshCollaborators();
    if (!pendingInvitationCount) return () => { mounted = false; };

    const interval = window.setInterval(() => {
      if (mounted) refreshCollaborators();
    }, 2500);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, [activeProjectId, pendingInvitationCount, refreshProjects, shareOpen]);
  const currentMember = activeProject?.miembros?.find((member) => String(member.usuario?.id) === String(currentUser?.id));
  const currentRole = currentMember?.rol;
  const isOwner = currentRole === 'propietario' || String(activeProject?.propietario?.id || activeProject?.owner?.id) === String(currentUser?.id);
  useEffect(() => { currentUserRef.current = currentUser; }, [currentUser]);
  useEffect(() => {
    if (!activeProjectId || isOwner) return undefined;

    let mounted = true;
    const verifyProjectAccess = async () => {
      try {
        const items = await listarProyectos();
        if (!mounted) return;
        if (!items.some((project) => String(project.id) === String(activeProjectId))) {
          returnToPrincipalCanvas('El propietario te eliminó del proyecto. Volviste al lienzo principal.');
          return;
        }
        setProjects(items);
      } catch {
        // No expulsamos al usuario por un error temporal de red.
      }
    };

    const interval = window.setInterval(verifyProjectAccess, 3000);
    return () => {
      mounted = false;
      window.clearInterval(interval);
    };
  }, [activeProjectId, isOwner, returnToPrincipalCanvas]);
  // Fuera de un proyecto se permite el borrador local. Dentro de un proyecto,
  // solo los roles explícitos del backend habilitan edición.
  const canEdit = !activeProject || isOwner || ['propietario', 'arquitecto', 'editor'].includes(currentRole);
  const isReadOnly = Boolean(activeProject && !canEdit);
  const canUseRelations = !activeProject || isOwner || ['propietario', 'arquitecto'].includes(currentRole);
  useEffect(() => { canEditRef.current = canEdit; }, [canEdit]);
  const selectedNode = nodes.find((node) => node.id === selectedNodeId);
  const focusGenerationIssue = (issue) => {
    const nodeReference = issue?.node_id || issue?.element_id;
    if (nodeReference && nodes.some((node) => String(node.id) === String(nodeReference))) {
      const nodeId = nodes.find((node) => String(node.id) === String(nodeReference)).id;
      selectNode(nodeId);
      setEditorPosition(null);
      setHighlightedEdgeId(null);
      reactFlowRef.current?.fitView({ nodes: [{ id: nodeId }], padding: 0.7, duration: 350 });
      return;
    }
    const edgeReference = issue?.edge_id || issue?.element_id;
    if (edgeReference && edges.some((edge) => String(edge.id) === String(edgeReference))) {
      selectNode(null);
      setEditorPosition(null);
      const edge = edges.find((item) => String(item.id) === String(edgeReference));
      setHighlightedEdgeId(edge.id);
      reactFlowRef.current?.fitView({ nodes: [{ id: edge.source }, { id: edge.target }], padding: 0.7, duration: 350 });
    }
  };
  const validateForGeneration = () => {
    const byId = new Map(nodes.map((node) => [node.id, node]));
    return edges.flatMap((edge) => {
      const source = byId.get(edge.source);
      const target = byId.get(edge.target);
      const type = edge.data?.relationType || 'asociacion';
      if (type === 'realizacion' && (!source || !target || source.data?.kind === 'interface' || target.data?.kind !== 'interface')) return [{ edge_id: edge.id, message: 'La realización debe ir desde una clase hacia una interface.' }];
      if (type === 'herencia' && (!source || !target || source.id === target.id || source.data?.kind === 'interface' || target.data?.kind === 'interface')) return [{ edge_id: edge.id, message: 'La herencia debe ir de una clase hija a una clase padre diferente.' }];
      if (['asociacion', 'agregacion', 'composicion'].includes(type) && (!source || !target || source.data?.kind !== 'entity' || target.data?.kind !== 'entity')) return [{ edge_id: edge.id, message: 'Las relaciones JPA solo pueden conectar dos entidades.' }];
      return [];
    });
  };
  const generateSpringBoot = async () => {
    if (generating) return;
    if (!activeDiagramId) { setGenerationErrors([{ message: 'No hay un diagrama guardado activo para generar el proyecto.' }]); return; }
    if (isReadOnly) { setGenerationErrors([{ message: 'No tienes permisos de edición para generar este proyecto.' }]); return; }
    const localIssues = validateForGeneration();
    if (localIssues.length) { setGenerationErrors(localIssues); focusGenerationIssue(localIssues[0]); return; }
    scheduleCurrentSave();
    const saved = await persistPendingChanges({ silent: true });
    if (!saved) { setGenerationErrors([{ message: 'No se pudieron guardar los cambios pendientes. Corrige el guardado antes de generar.' }]); return; }
    setGenerating(true);
    setGenerationErrors([]);
    setHighlightedEdgeId(null);
    try {
      const response = await generarSpringBoot(activeDiagramId);
      const blob = new Blob([response.data], { type: response.headers['content-type'] || 'application/zip' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = zipFilename(response.headers['content-disposition']);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => window.URL.revokeObjectURL(url), 0);
      setToast('Proyecto Spring Boot descargado correctamente.');
    } catch (requestError) {
      const status = requestError.response?.status;
      const fallback = status === 403 ? 'No tienes permisos para generar este proyecto.' : status === 404 ? 'El diagrama ya no existe.' : status >= 500 ? 'El servidor no pudo generar el proyecto. Inténtalo nuevamente.' : !requestError.response ? 'No se pudo conectar con el servidor.' : 'No se pudo generar el proyecto.';
      const issues = generationIssues(requestError.response?.data, fallback);
      setGenerationErrors(issues);
      focusGenerationIssue(issues[0]);
    } finally {
      setGenerating(false);
    }
  };
  const requestDeleteNode = useCallback((id) => { setNodeMenu(null); setDeleteCandidate(nodes.find((node) => node.id === id) || null); }, [nodes]);
  const openNodeMenu = useCallback((id, x, y) => {
    if (!canUseRelations) return;
    selectNode(null);
    setEditorPosition(null);
    setRelationMenu(null);
    setNodeMenu({ id, x, y });
  }, [canUseRelations, selectNode]);
  const openRelationMenu = useCallback((id, x, y) => {
    if (!canUseRelations) return;
    selectNode(null);
    setEditorPosition(null);
    setNodeMenu(null);
    setRelationMenu({ id, x, y });
  }, [canUseRelations, selectNode]);
  useEffect(() => {
    const onKeyDown = (event) => {
      const element = document.activeElement;
      const historyShortcut = (event.ctrlKey || event.metaKey) && ['z', 'y'].includes(event.key.toLowerCase());
      if (element?.matches('input, textarea, select, [contenteditable="true"]') || document.querySelector('[role="dialog"]')) return;
      if (historyShortcut) {
        event.preventDefault();
        // El menú no edita texto: cerrarlo permite recuperar de inmediato la
        // última acción, incluida la creación de una clase de asociación.
        setNodeMenu(null);
        setRelationMenu(null);
        if (event.key.toLowerCase() === 'y' || event.shiftKey) redoDiagram(); else undoDiagram();
        return;
      }
      if (document.querySelector('[role="menu"]')) return;
      if ((event.key !== 'Delete' && event.key !== 'Supr') || !selectedNodeId || !canUseRelations) return;
      event.preventDefault();
      setNodeMenu(null); deleteNode(selectedNodeId);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  // The shortcuts intentionally read the latest store actions when the key is pressed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canUseRelations, selectedNodeId, nodes, undo, redo]);
  const createProject = () => { setProjectName(''); setProjectNameError(''); setNewProjectOpen(true); };
  const leaveProject = async () => { clearTimeout(saveTimerRef.current); await persistPendingChanges(); if (activeDiagramRef.current) socketSendRef.current?.({ type: 'presence.leave', diagram_id: activeDiagramRef.current }); window.sessionStorage.removeItem('diagramcraft-active-project'); diagramLoadedRef.current = false; activeProjectRef.current = null; activeDiagramRef.current = null; hasPendingChangesRef.current = false; setActiveProjectId(null); setActiveDiagramId(null); setOnlineMembers([]); setNodeMenu(null); setSaveStatus('local'); if (restore(loadPrincipalDraft())) scheduleCurrentSave(); setProjectsOpen(false); setToast('Volviste al lienzo principal.'); };
  const confirmCreateProject = async () => {
    const normalizedName = projectName.trim();
    if (!normalizedName) return;
    if (projects.some((project) => (project.nombre || project.name || '').trim().toLocaleLowerCase() === normalizedName.toLocaleLowerCase())) {
      setProjectNameError('Ya tienes un proyecto activo con este nombre.');
      return;
    }
    try {
      const project = await crearProyecto(normalizedName);
      setProjects((current) => [project, ...current]);
      setNewProjectOpen(false);
      await openProject(project, true, true);
      setToast(`Proyecto “${project.nombre || project.name}” creado.`);
    } catch (requestError) {
      const nombreError = requestError.response?.data?.errors?.nombre;
      const message = Array.isArray(nombreError) ? nombreError.join(' ') : nombreError;
      if (message) setProjectNameError(message);
      else setToast(requestError.response?.data?.detail || 'No se pudo crear el proyecto.');
    }
  };
  const sendInvite = async (rol) => {
    if (!invite.trim()) return;
    if (!activeProject) { setToast('Crea o selecciona un proyecto antes de invitar colaboradores.'); return; }
    try {
      const invitation = await invitarProyecto(activeProject.id, invite.trim(), rol);
      const pendingInvitation = invitation.invitacion || invitation;
      setProjects((items) => items.map((project) => project.id === activeProject.id ? { ...project, invitaciones_pendientes: [...(project.invitaciones_pendientes || []), pendingInvitation] } : project));
      setInvite(''); setToast('Invitación enviada. Esperando aceptación.');
    } catch (requestError) {
      setToast(requestError.response?.data?.detail || 'No se pudo enviar la invitación.');
    }
  };
  const resendInvite = async (invitation) => {
    try {
      const updated = await reenviarInvitacion(invitation.id);
      const renewedInvitation = updated.invitacion || updated;
      setProjects((items) => items.map((project) => project.id === activeProject?.id ? { ...project, invitaciones_pendientes: (project.invitaciones_pendientes || []).map((item) => String(item.id) === String(invitation.id) ? { ...item, ...renewedInvitation } : item) } : project));
      setToast('Invitación reenviada.');
    } catch (requestError) { setToast(requestError.response?.data?.detail || 'No se pudo reenviar la invitación.'); }
  };
  const cancelInvite = async (invitation) => {
    try {
      await cancelarInvitacion(invitation.id);
      setProjects((items) => items.map((project) => project.id === activeProject?.id ? { ...project, invitaciones_pendientes: (project.invitaciones_pendientes || []).filter((item) => String(item.id) !== String(invitation.id)) } : project));
      setToast('Invitación cancelada.');
    } catch (requestError) { setToast(requestError.response?.data?.detail || 'No se pudo cancelar la invitación.'); }
  };
  const changeMemberRole = async (member, rol) => {
    if (!activeProject) return;
    try {
      const updated = await actualizarRolMiembro(activeProject.id, member.usuario.id, rol);
      setProjects((items) => items.map((project) => project.id === activeProject.id ? { ...project, miembros: project.miembros.map((item) => item.id === member.id ? { ...item, ...updated, rol: updated.rol || rol } : item) } : project));
      setToast('Rol actualizado.');
    } catch (requestError) { setToast(requestError.response?.data?.detail || 'No se pudo actualizar el rol.'); }
  };
  const removeMember = async (member) => {
    if (!activeProject) return;
    try {
      await eliminarColaborador(activeProject.id, member.usuario.id);
      setProjects((items) => items.map((project) => project.id === activeProject.id ? { ...project, miembros: project.miembros.filter((item) => item.id !== member.id) } : project));
      setToast('Colaborador eliminado.');
    } catch (requestError) { setToast(requestError.response?.data?.detail || 'No se pudo eliminar el colaborador.'); }
  };
  const leaveCollaboration = async (project) => {
    if (!currentUser?.id || !project?.id) return;
    if (leavingProjectRef.current) return;
    leavingProjectRef.current = true;
    try {
      await eliminarColaborador(project.id, currentUser.id);
    } catch (requestError) {
      // Si el primer DELETE ya se completó, el segundo responde 404. La
      // interfaz igualmente debe salir del proyecto porque ya no es miembro.
      if (requestError.response?.status !== 404) {
        setToast(requestError.response?.data?.detail || 'No se pudo abandonar el proyecto.');
        return;
      }
    } finally {
      leavingProjectRef.current = false;
    }

    try {
      setProjects((items) => items.filter((item) => String(item.id) !== String(project.id)));
      if (String(activeProjectId) === String(project.id)) {
        returnToPrincipalCanvas('Abandonaste el proyecto. Volviste al lienzo principal.');
      } else {
        setToast('Abandonaste el proyecto.');
      }
    } catch { setToast('No se pudo actualizar el lienzo después de abandonar el proyecto.'); }
  };

  if (loading) return <State message="Cargando proyectos…" />;
  if (error) return <State message={error} error />;
  const displayedProject = activeProject || { name: 'Sin proyecto' };
  const visibleOnlineMembers = onlineMembers.slice(0, 3);
  const defaultAnchor = (handle, side) => ({ side: handle || side, offset: 0.5 });
  const relationAnchorsByNode = edges.reduce((anchors, edge) => {
    const preview = relationAnchorPreview[edge.id] || {};
    const sourceAnchor = preview.source || edge.data?.sourceAnchor || defaultAnchor(edge.sourceHandle, 'right');
    const targetAnchor = preview.target || edge.data?.targetAnchor || defaultAnchor(edge.targetHandle, 'left');
    anchors[edge.source] = [...(anchors[edge.source] || []), { edgeId: edge.id, end: 'source', anchor: sourceAnchor }];
    anchors[edge.target] = [...(anchors[edge.target] || []), { edgeId: edge.id, end: 'target', anchor: targetAnchor }];
    return anchors;
  }, {});
  const canvasNodes = nodes.map((node) => ({ ...node, draggable: !node.data.positionLocked, data: { ...node.data, canManage: canUseRelations, projectName: displayedProject.nombre || displayedProject.name, relationAnchors: relationAnchorsByNode[node.id], onRelationAnchorPreview: previewRelationAnchor, onRelationAnchorCommit: commitRelationAnchor, onOpenMenu: (x, y) => openNodeMenu(node.id, x, y) } }));
  const nodeBounds = (node) => node ? { x: node.positionAbsolute?.x ?? node.position.x, y: node.positionAbsolute?.y ?? node.position.y, width: node.width || 250, height: node.height || 110 } : null;
  const relationSegments = edges.map((edge) => {
    const sourceAnchor = relationAnchorPreview[edge.id]?.source || edge.data?.sourceAnchor;
    const targetAnchor = relationAnchorPreview[edge.id]?.target || edge.data?.targetAnchor;
    const sourceSide = sourceAnchor?.side || edge.sourceHandle || 'right';
    const targetSide = targetAnchor?.side || edge.targetHandle || 'left';
    const source = anchorPoint(nodeBounds(nodes.find((node) => node.id === edge.source)), sourceAnchor, sourceSide);
    const target = anchorPoint(nodeBounds(nodes.find((node) => node.id === edge.target)), targetAnchor, targetSide);
    return {
      edge,
      source,
      target,
      curve: source && target ? bezierSamples(source, target, sourceSide, targetSide) : [],
    };
  });
  const relationJumps = {};
  for (let index = 0; index < relationSegments.length; index += 1) {
    for (let otherIndex = index + 1; otherIndex < relationSegments.length; otherIndex += 1) {
      const current = relationSegments[index];
      const other = relationSegments[otherIndex];
      if (!current.source || !current.target || !other.source || !other.target) continue;
      if ([current.edge.source, current.edge.target].some((nodeId) => nodeId === other.edge.source || nodeId === other.edge.target)) continue;
      const crossing = curveIntersection(current.curve, other.curve);
      if (crossing) relationJumps[other.edge.id] = [...(relationJumps[other.edge.id] || []), crossing];
    }
  }
  const canvasEdges = edges.map((edge) => {
    const sourceNode = nodes.find((node) => node.id === edge.source);
    const targetNode = nodes.find((node) => node.id === edge.target);
    const boundsFor = (node) => node ? {
      x: node.positionAbsolute?.x ?? node.position.x,
      y: node.positionAbsolute?.y ?? node.position.y,
      width: node.width || 250,
      height: node.height || 110,
    } : null;
    const associationClassNode = nodes.find((node) => node.id === edge.data?.associationClassNodeId);
    const associationClassPosition = associationClassNode ? {
      x: (associationClassNode.positionAbsolute?.x ?? associationClassNode.position.x) + (associationClassNode.width || 250) / 2,
      y: (associationClassNode.positionAbsolute?.y ?? associationClassNode.position.y) + (associationClassNode.height || 110) / 2,
    } : null;
    return { ...edge, data: { ...edge.data, sourceAnchor: relationAnchorPreview[edge.id]?.source || edge.data?.sourceAnchor, targetAnchor: relationAnchorPreview[edge.id]?.target || edge.data?.targetAnchor, sourceBounds: boundsFor(sourceNode), targetBounds: boundsFor(targetNode), associationClassPosition, crossings: relationJumps[edge.id] || [], highlighted: highlightedEdgeId === edge.id, canManage: canUseRelations, onOpenMenu: (x, y) => openRelationMenu(edge.id, x, y) } };
  });
  const syncIndicator = {
    local: { label: 'Borrador local', color: 'text-slate-300' },
    empty: { label: 'Diagrama aún no guardado', color: 'text-slate-300' },
    pending: { label: 'Cambios pendientes', color: 'text-amber-300' },
    saving: { label: 'Guardando diagrama…', color: 'text-amber-300' },
    saved: { label: socketStatus === 'connected' ? 'Guardado · Sync Live' : 'Guardado · Sin conexión en vivo', color: socketStatus === 'connected' ? 'text-emerald-300' : 'text-slate-300' },
    error: { label: 'Error al guardar', color: 'text-rose-300' },
  }[saveStatus];

  return <div className="flex h-screen min-w-[1024px] flex-col overflow-hidden bg-[#070c1a] text-slate-200">
    <header className="flex h-[70px] shrink-0 items-center gap-2 overflow-hidden border-b border-[#1d2a4a] bg-[#091124] px-3">
      <div className="flex shrink-0 items-center gap-2 border-r border-slate-700/70 pr-3"><div className="grid h-8 w-8 place-items-center rounded-xl border border-indigo-400/40 bg-indigo-500/15 text-indigo-300">◈</div><div><div className="text-sm font-bold text-white">DiagramCraft <span className="ml-1 rounded border border-indigo-400/30 bg-indigo-500/15 px-1 py-0.5 font-mono text-[9px] text-indigo-300">STUDIO</span></div><div className={`text-[9px] ${socketStatus === 'connected' ? 'text-emerald-400' : 'text-slate-400'}`}>● {socketStatus === 'connected' ? 'Sync Live' : 'Sin conexión'} · Modelo UML/JPA</div></div></div>
      <button onClick={() => setProjectsOpen(true)} className="flex shrink-0 items-center gap-2 rounded-lg border border-indigo-400/40 bg-[#111b35] px-3 py-2 text-xs font-bold text-white hover:bg-indigo-500/20"><span className="max-w-48 truncate">{displayedProject.nombre || displayedProject.name}</span><FiChevronDown className="text-indigo-300" /></button>
      <button onClick={createProject} className="flex shrink-0 items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-500"><FiPlus /> Nuevo Proyecto</button>
      <div className="ml-auto hidden min-w-0 flex-1 rounded-full border border-indigo-400/30 bg-[#0d162d] px-3 py-2 text-[10px] text-indigo-100 xl:block"><FiZap className="mr-1 inline text-indigo-400" />Voz/IA: <i>“Crea entidad Pedido con relación 1:N a Detalle”</i><span className="ml-2 rounded bg-indigo-900/60 px-1.5 py-0.5 font-mono text-[9px] text-indigo-300">Spacebar</span></div>
      <button onClick={() => setPeopleOpen(true)} title={visibleOnlineMembers.map((member) => member.usuario?.username || member.username || member.email || 'Usuario').join(', ') || 'Sin colaboradores conectados'} className="hidden shrink-0 items-center gap-2 rounded-lg border border-slate-600 bg-[#131d36] px-3 py-2 text-xs font-bold hover:bg-slate-700 lg:flex"><span className="flex -space-x-1">{visibleOnlineMembers.map((member, index) => { const user = member.usuario || member; const name = user.username || user.email || 'U'; const colors = ['bg-indigo-600', 'bg-emerald-600', 'bg-sky-500']; return <i key={user.id || name} className={`grid h-6 w-6 place-items-center rounded-full border-2 border-[#091124] ${colors[index]} text-[8px] not-italic`}>{name.slice(0, 2).toUpperCase()}</i>; })}{visibleOnlineMembers.length === 0 && <i className="grid h-6 w-6 place-items-center rounded-full border-2 border-[#091124] bg-slate-600 text-[8px] not-italic">—</i>}</span><span className="text-[9px] text-emerald-300">{onlineMembers.length}<br /><span className="text-slate-400">en línea</span></span></button>
      <div className="ml-1 flex shrink-0 gap-1"><button onClick={() => setShareOpen(true)} className="flex items-center gap-1 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-3 py-2.5 text-[11px] font-bold text-white hover:from-indigo-500 hover:to-violet-500"><FiShare2 /> Compartir / Invitar</button><button onClick={() => setToast('Importación XMI disponible al conectar la persistencia del diagrama.')} className="flex items-center gap-1 rounded-lg border border-slate-600 bg-[#131d36] px-2.5 py-2.5 text-[11px] font-medium hover:bg-slate-700"><FiUpload /> Importar</button><button onClick={() => setToast('Exportación XMI disponible al conectar la persistencia del diagrama.')} className="flex items-center gap-1 rounded-lg border border-slate-600 bg-[#131d36] px-2.5 py-2.5 text-[11px] font-medium hover:bg-slate-700"><FiDownload /> XMI (EA)</button><button onClick={generateSpringBoot} disabled={generating || isReadOnly || !activeDiagramId} className="flex items-center gap-1 rounded-lg bg-indigo-500 px-3 py-2.5 text-[11px] font-bold text-white hover:bg-indigo-400 disabled:cursor-wait disabled:opacity-55"><FiZap className="text-yellow-200" /> {generating ? 'Generando…' : 'Generar 4 Capas'}</button><button onClick={onLogout} title="Cerrar sesión" className="rounded-lg bg-rose-600 p-2.5 text-white hover:bg-rose-500"><FiLogOut /></button></div>
    </header>
    <div className="flex min-h-0 flex-1"><div className={`relative z-20 shrink-0 transition-[width] duration-300 ${sidebarOpen ? 'w-80' : 'w-0'}`}><div className="h-full overflow-hidden"><EditorToolbar readOnly={isReadOnly} canUseRelations={canUseRelations} onlineMembers={onlineMembers} nodes={nodes} edges={edges} generating={generating} onCreate={(kind) => canEdit && createNode(kind)} onRelation={(type) => canUseRelations && setRelationType(type)} onCommand={() => {}} onListen={() => {}} onGenerate={generateSpringBoot} /></div><button onClick={() => setSidebarOpen((open) => !open)} title={sidebarOpen ? 'Ocultar panel' : 'Mostrar panel'} className={`absolute top-4 z-30 grid h-8 w-5 place-items-center rounded-r-md border border-l-0 border-slate-600 bg-[#17233f] text-slate-300 shadow-lg hover:bg-indigo-600 ${sidebarOpen ? '-right-5' : 'left-0'}`}>{sidebarOpen ? <FiChevronLeft /> : <FiChevronRight />}</button></div><main className="relative flex-1 bg-[#080f21]"><ReactFlow onInit={(instance) => { reactFlowRef.current = instance; }} nodes={canvasNodes} edges={canvasEdges} nodesDraggable={canEdit} nodesConnectable={canUseRelations} connectionMode={ConnectionMode.Loose} elementsSelectable={canEdit} onNodesChange={canEdit ? onNodesChange : undefined} onEdgesChange={canEdit ? onEdgesChange : undefined} onConnect={canUseRelations ? onConnect : undefined} onReconnect={canUseRelations ? reconnectRelation : undefined} onNodeClick={(event, node) => { setNodeMenu(null); setRelationMenu(null); selectNode(node.id); setEditorPosition({ x: event.clientX, y: event.clientY }); }} onPaneClick={() => { selectNode(null); setNodeMenu(null); setRelationMenu(null); }} nodeTypes={nodeTypes} edgeTypes={edgeTypes} fitView><Background color="#52607a" gap={26} size={1.2} /><Controls className="!border-slate-700 !bg-[#101a31] !fill-slate-200" /><MiniMap className="!border !border-slate-700 !bg-[#101a31]" nodeColor="#6366f1" /></ReactFlow>{canUseRelations && <PropertiesPanel node={selectedNode} position={editorPosition} onClose={() => { selectNode(null); setEditorPosition(null); }} onUpdate={(patch) => updateNode(selectedNode.id, patch)} onAddAttribute={() => addAttribute(selectedNode.id)} onUpdateAttribute={(index, patch) => updateAttribute(selectedNode.id, index, patch)} onRemoveAttribute={(index) => removeAttribute(selectedNode.id, index)} onAddMethod={() => addMethod(selectedNode.id)} onUpdateMethod={(index, value) => updateMethod(selectedNode.id, index, value)} onRemoveMethod={(index) => removeMethod(selectedNode.id, index)} onDelete={() => requestDeleteNode(selectedNode.id)} />}<div className={`absolute bottom-3 left-4 rounded bg-[#101a31]/90 px-3 py-1.5 font-mono text-[10px] ${syncIndicator.color}`}>● {isReadOnly ? 'Modo solo lectura' : syncIndicator.label}</div></main></div>
    {toast && <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded bg-[#18264a] px-4 py-3">{toast}</div>}
    {generationErrors.length > 0 && <GenerationErrorDialog errors={generationErrors} onClose={() => { setGenerationErrors([]); setHighlightedEdgeId(null); }} onFocus={focusGenerationIssue} />}
    {projectsOpen && <ProjectsDialog projects={projects} activeId={activeProjectId} currentUserId={currentUser?.id} onClose={() => setProjectsOpen(false)} onNew={createProject} onOpen={openProject} onLeaveProject={leaveProject} onLeaveCollaboration={leaveCollaboration} onRefresh={() => listarProyectos().then(setProjects)} />}
    {newProjectOpen && <NewProjectDialog name={projectName} setName={(name) => { setProjectName(name); setProjectNameError(''); }} error={projectNameError} onClose={() => setNewProjectOpen(false)} onCreate={confirmCreateProject} />}
    {shareOpen && <CollaboratorsDialog project={activeProject} email={invite} setEmail={setInvite} onlineMembers={onlineMembers} acceptedMember={acceptedInvitationMember} onDismissAccepted={() => setAcceptedInvitationMember(null)} onClose={() => setShareOpen(false)} onInvite={sendInvite} onResendInvite={resendInvite} onCancelInvite={cancelInvite} onChangeRole={changeMemberRole} onRemove={removeMember} onViewCanvas={() => activeProject && openProject(activeProject)} currentUserId={currentUser?.id} canInvite={isOwner} canManage={isOwner} />}
    {peopleOpen && <PeopleDialog members={onlineMembers} project={activeProject} onClose={() => setPeopleOpen(false)} />}
    {relationType && <RelationDialog nodes={nodes} type={relationType} target={relationTarget} setTarget={setRelationTarget} onClose={() => { setRelationType(null); setRelationTarget(''); }} onCreate={(source) => { if (createRelation(relationType, source, relationTarget)) { setRelationType(null); setRelationTarget(''); } }} />}
    {pendingConnection && <ConnectionRelationDialog nodes={nodes} connection={pendingConnection} onClose={() => setPendingConnection(null)} onCreate={(type) => {
      if (createRelation(type, pendingConnection.source, pendingConnection.target)) setPendingConnection(null);
    }} />}
    {deleteCandidate && <DeleteNodeConfirmation node={deleteCandidate} relationCount={edges.filter((edge) => edge.source === deleteCandidate.id || edge.target === deleteCandidate.id).length} onClose={() => setDeleteCandidate(null)} onConfirm={() => { deleteNode(deleteCandidate.id); setDeleteCandidate(null); }} />}
    {nodeMenu && createPortal(<NodeContextMenu node={nodes.find((node) => node.id === nodeMenu.id)} position={nodeMenu} onClose={() => setNodeMenu(null)} onEdit={() => { selectNode(nodeMenu.id); setEditorPosition({ x: nodeMenu.x, y: nodeMenu.y }); setNodeMenu(null); }} onDuplicate={() => { duplicateNode(nodeMenu.id); setNodeMenu(null); }} onToggleLock={() => { const node = nodes.find((item) => item.id === nodeMenu.id); toggleNodeLock(nodeMenu.id, !node.data.positionLocked); setNodeMenu(null); }} onDelete={() => requestDeleteNode(nodeMenu.id)} />, document.body)}
    {relationMenu && createPortal(<AssociationRelationContextMenu edge={edges.find((edge) => edge.id === relationMenu.id)} position={relationMenu} onClose={() => setRelationMenu(null)} onCreateAssociationClass={() => { createAssociationClass(relationMenu.id); setRelationMenu(null); }} onUnlinkAssociationClass={() => { unlinkAssociationClass(relationMenu.id); setRelationMenu(null); }} onDelete={() => { deleteRelation(relationMenu.id); setRelationMenu(null); }} />, document.body)}
  </div>;
}

function State({ message, detail, action, error, children }) { return <div className={`grid h-screen place-items-center bg-[#070c1a] p-6 text-center ${error ? 'text-rose-300' : 'text-slate-200'}`}><div><h1 className="text-xl font-bold text-white">{message}</h1>{detail && <p className="mt-2 text-slate-400">{detail}</p>}{action && <button onClick={action} className="mt-5 rounded-lg bg-indigo-600 px-4 py-3 font-bold"><FiPlus className="mr-1 inline" /> Crear proyecto</button>}{children}</div></div>; }
function GenerationErrorDialog({ errors, onClose, onFocus }) {
  useEscapeClose(true, onClose);
  return <div className="fixed inset-0 z-[10001] grid place-items-center bg-slate-950/60 p-5" onMouseDown={onClose}><section role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()} className="max-h-[80vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-rose-400/50 bg-[#101a31] p-5 shadow-2xl"><header className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-extrabold text-rose-200">No se pudo generar el proyecto</h2><p className="mt-1 text-sm text-slate-400">Corrige los elementos indicados y vuelve a intentarlo.</p></div><button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-white">×</button></header><ul className="mt-4 space-y-2">{errors.map((issue, index) => <li key={`${issue.message}-${index}`} className="rounded-lg border border-slate-700 bg-[#091124] p-3"><p className="text-sm text-slate-100">{issue.message}</p>{issue.field && <small className="mt-1 block font-mono text-slate-400">{issue.field}</small>}{(issue.node_id || issue.edge_id || issue.element_id) && <button onClick={() => onFocus(issue)} className="mt-2 text-xs font-bold text-cyan-300 hover:text-cyan-100">Ver elemento en el diagrama</button>}</li>)}</ul><button onClick={onClose} className="mt-5 w-full rounded-lg border border-slate-600 py-2 font-bold text-slate-200 hover:bg-slate-700">Cerrar</button></section></div>;
}
function NodeContextMenu({ node, position, onClose, onEdit, onDuplicate, onToggleLock, onDelete }) { useEscapeClose(Boolean(node), onClose); if (!node) return null; return <div className="fixed inset-0 z-[10000]" onMouseDown={onClose}><section role="menu" onMouseDown={(event) => event.stopPropagation()} style={{ left: Math.min(position.x, window.innerWidth - 300), top: Math.min(position.y, window.innerHeight - 280) }} className="fixed w-72 rounded-2xl border border-slate-500/45 bg-[#2a344f] p-3 text-slate-100 shadow-2xl"><div className="mb-2 flex justify-between px-2 text-[10px] font-bold uppercase tracking-wide text-slate-300"><span>Acciones de clase</span><span>Proyecto</span></div><button onClick={onEdit} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left font-bold hover:bg-slate-600/50"><FiEdit3 className="text-violet-200" />Editar campos y métodos</button><button onClick={onDuplicate} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left font-bold hover:bg-slate-600/50"><FiCopy className="text-violet-200" />Duplicar nodo</button><button onClick={onToggleLock} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left font-bold hover:bg-slate-600/50">{node.data.positionLocked ? <FiUnlock className="text-cyan-200" /> : <FiLock className="text-cyan-200" />}{node.data.positionLocked ? 'Desbloquear posición' : 'Bloquear posición'}</button><div className="mt-2 rounded-xl bg-rose-950/45 p-1"><button onClick={onDelete} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left font-bold text-rose-200 hover:bg-rose-900/40"><FiTrash2 />Eliminar clase del diagrama</button></div></section></div>; }
function RelationContextMenu({ position, onClose, onDelete }) { useEscapeClose(true, onClose); return <div className="fixed inset-0 z-[10000]" onMouseDown={onClose}><section role="menu" onMouseDown={(event) => event.stopPropagation()} style={{ left: Math.min(position.x, window.innerWidth - 240), top: Math.min(position.y, window.innerHeight - 100) }} className="fixed w-56 rounded-xl border border-slate-500/45 bg-[#2a344f] p-2 shadow-2xl"><button onClick={onDelete} className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-bold text-rose-200 hover:bg-rose-900/40"><FiTrash2 />Eliminar relación</button></section></div>; }
function DeleteNodeConfirmation({ node, relationCount, onClose, onConfirm }) { useEscapeClose(true, onClose); return <div role="dialog" aria-modal="true" className="fixed inset-0 z-[80] grid place-items-center bg-black/70 p-4"><section className="w-full max-w-md rounded-2xl border border-rose-400/50 bg-[#101a31] p-5 shadow-2xl"><h2 className="text-lg font-bold text-white">¿Eliminar nodo de clase?</h2><p className="mt-2 text-sm text-slate-300">Se eliminará “{node.data.title}” y {relationCount} relación{relationCount === 1 ? '' : 'es'} conectada{relationCount === 1 ? '' : 's'}.</p><div className="mt-6 flex justify-end gap-3"><button onClick={onClose} className="rounded-lg border border-slate-600 px-4 py-2">Cancelar</button><button onClick={onConfirm} className="rounded-lg bg-rose-600 px-4 py-2 font-bold text-white">Eliminar</button></div></section></div>; }
function RelationDialog({ nodes, type, target, setTarget, onClose, onCreate }) {
  const sourceCandidates = nodes.filter((node) => type === 'realizacion' || type === 'herencia' ? isClassNode(node) : true);
  const [source, setSource] = useState(sourceCandidates[0]?.id || '');
  const sourceNode = nodes.find((node) => node.id === source);
  const targetCandidates = nodes.filter((node) => isAllowedRelation(type, sourceNode, node));
  const targetNode = nodes.find((node) => node.id === target);
  const canCreate = isAllowedRelation(type, sourceNode, targetNode);
  const label = relationLabels[type] || type;
  const hint = type === 'realizacion'
    ? 'La realización requiere una clase que implemente una interfaz.'
    : type === 'herencia'
      ? 'La herencia requiere una clase hija y una clase padre.'
      : null;
  return <Modal title={`Crear relación UML: ${label}`} onClose={onClose}>{hint && <p className="mb-3 text-xs text-indigo-200">{hint}</p>}<select value={source} onChange={(event) => { setSource(event.target.value); setTarget(''); }} className="w-full rounded bg-slate-800 p-2">{sourceCandidates.map((node) => <option key={node.id} value={node.id}>{node.data.title}</option>)}</select><select value={target} onChange={(event) => setTarget(event.target.value)} className="mt-3 w-full rounded bg-slate-800 p-2"><option value="">Destino</option>{targetCandidates.map((node) => <option key={node.id} value={node.id}>{node.data.title}</option>)}</select><button disabled={!canCreate} onClick={() => onCreate(source)} className="mt-4 w-full rounded bg-indigo-600 p-2 disabled:cursor-not-allowed disabled:opacity-40">Crear {label}</button></Modal>;
}
function AssociationClassDialog({ edge, nodes, onClose, onLink }) {
  useEscapeClose(Boolean(edge), onClose);
  if (!edge) return null;
  const candidates = nodes.filter((node) => node.id !== edge.source && node.id !== edge.target);
  return <div role="dialog" aria-modal="true" className="fixed inset-0 z-[10001] grid place-items-center bg-black/70 p-4">
    <section className="w-full max-w-md rounded-2xl border border-indigo-400/50 bg-[#101a31] p-5 shadow-2xl">
      <div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-bold text-white">Clase de asociación</h2><p className="mt-1 text-sm text-slate-400">Elige la clase que aporta atributos propios a esta asociación.</p></div><button onClick={onClose} aria-label="Cerrar" className="rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-white"><FiX /></button></div>
      {candidates.length > 0 ? <div className="mt-4 space-y-2">{candidates.map((node) => <button key={node.id} onClick={() => onLink(node.id)} className="flex w-full items-center justify-between rounded-xl border border-slate-600 bg-[#0b1430] px-4 py-3 text-left hover:border-indigo-400 hover:bg-indigo-500/15"><span className="font-bold text-white">{node.data.title}</span><span className="text-xs text-slate-400">{node.data.properties?.length || 0} atributos</span></button>)}</div> : <p className="mt-5 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100">Crea otra clase para usarla como clase de asociación.</p>}
      <button onClick={onClose} className="mt-4 w-full rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-700">Cancelar</button>
    </section>
  </div>;
}
export { AssociationClassDialog };
function AssociationRelationContextMenu({ edge, position, onClose, onCreateAssociationClass, onUnlinkAssociationClass, onDelete }) {
  useEscapeClose(Boolean(edge), onClose);
  if (!edge) return null;
  if (edge.data?.relationType !== 'asociacion') return <RelationContextMenu position={position} onClose={onClose} onDelete={onDelete} />;
  const linked = Boolean(edge.data?.associationClassNodeId);
  return <div className="fixed inset-0 z-[10000]" onMouseDown={onClose}>
    <section role="menu" onMouseDown={(event) => event.stopPropagation()} style={{ left: Math.min(position.x, window.innerWidth - 280), top: Math.min(position.y, window.innerHeight - 180) }} className="fixed w-64 rounded-xl border border-slate-500/45 bg-[#2a344f] p-2 shadow-2xl">
      {!linked && <button onClick={onCreateAssociationClass} className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-bold text-cyan-100 hover:bg-slate-600/50">Vincular clase de asociación</button>}
      {linked && <button onClick={onUnlinkAssociationClass} className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-bold text-slate-200 hover:bg-slate-600/50">Quitar clase de asociación</button>}
      <button onClick={onDelete} className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-bold text-rose-200 hover:bg-rose-900/40"><FiTrash2 />Eliminar relación</button>
    </section>
  </div>;
}
function ConnectionRelationDialog({ nodes, connection, onClose, onCreate }) {
  useEscapeClose(true, onClose);
  const source = nodes.find((node) => node.id === connection.source);
  const target = nodes.find((node) => node.id === connection.target);
  const options = [
    ['asociacion', 'Asociación', 'Línea sólida'],
    ['agregacion', 'Agregación', 'Rombo vacío en el todo'],
    ['composicion', 'Composición', 'Rombo lleno en el todo'],
    ['herencia', 'Herencia', 'Triángulo vacío'],
    ['realizacion', 'Realización', 'Trazo discontinuo'],
    ['dependencia', 'Dependencia', 'Flecha discontinua'],
  ];
  return <div role="dialog" aria-modal="true" className="fixed inset-0 z-[10001] grid place-items-center bg-black/70 p-4">
    <section className="w-full max-w-lg rounded-2xl border border-indigo-400/50 bg-[#101a31] p-5 shadow-2xl">
      <div className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-bold text-white">Elegir relación UML</h2><p className="mt-1 text-sm text-slate-400">{source?.data.title || 'Clase origen'} <span className="text-indigo-300">→</span> {target?.data.title || 'Clase destino'}</p></div><button onClick={onClose} aria-label="Cancelar conexión" className="rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-white"><FiX /></button></div>
      <p className="mt-4 text-xs text-slate-300">Selecciona el tipo de relación que deseas crear.</p>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">{options.map(([type, label, detail]) => { const allowed = isAllowedRelation(type, source, target); return <button key={type} disabled={!allowed} title={allowed ? detail : 'Este origen y destino no son válidos para esta relación UML.'} onClick={() => onCreate(type)} className="rounded-xl border border-slate-600 bg-[#0b1430] p-3 text-left transition hover:border-indigo-400 hover:bg-indigo-500/15 disabled:cursor-not-allowed disabled:opacity-35"><b className="block text-sm text-white">{label}</b><span className="mt-1 block text-[11px] text-slate-400">{detail}</span></button>; })}</div>
      <button onClick={onClose} className="mt-4 w-full rounded-lg border border-slate-600 px-4 py-2 text-sm font-medium text-slate-200 hover:bg-slate-700">Cancelar</button>
    </section>
  </div>;
}
function Modal({ title, children, onClose }) { useEscapeClose(true, onClose); return <div className="fixed inset-0 z-40 grid place-items-center bg-black/70 p-4"><section className="w-full max-w-md rounded-xl bg-[#101a31] p-6"><div className="mb-5 flex justify-between"><h2 className="font-bold">{title}</h2><button onClick={onClose}><FiX /></button></div>{children}</section></div>; }
