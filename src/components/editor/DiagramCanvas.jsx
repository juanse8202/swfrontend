import { Component, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ReactFlow, { Background, ConnectionMode, Controls, MiniMap, useUpdateNodeInternals } from 'reactflow';
import 'reactflow/dist/style.css';
import { FiChevronDown, FiChevronLeft, FiChevronRight, FiCopy, FiEdit3, FiLock, FiLogOut, FiPlus, FiShare2, FiTrash2, FiUnlock, FiX, FiZap } from 'react-icons/fi';
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
import { actualizarRolMiembro, cancelarInvitacion, contenidoDiagrama, crearDiagramaPrincipal, crearProyecto, eliminarColaborador, exportarXmi, generarSpringBoot, guardarDiagrama, importarXmi, invitarProyecto, listarProyectos, obtenerDiagrama, obtenerDiagramaPrincipal, reenviarInvitacion } from '../../api/diagramApi';
import { obtenerSesion } from '../../api/authApi';
import { applyAiPlan, interpretAi } from '../../api/aiApi';
import { useDiagramSocket } from '../../hooks/useDiagramSocket';
import { interpretationClarificationMessage, isStaleRevisionPayload, normalizeVoiceTranscript, parseProjectCreationCommand, planNeedsConfirmation, voiceFinalAction, voiceRecognitionError, voiceSessionForPendingPlan } from '../../utils/aiFlow';
import { DEFAULT_VOICE_PREFERENCES, selectBestSpanishVoice, speechSegments } from '../../utils/dianaVoice';
import { isOwnSocketEvent, saveSnapshotIsCurrent, shouldReplaceRemoteDocument } from '../../utils/collaborationSync';
import { appendXmiImportFormData, canStartXmiPreview, isValidXmiPreview, selectionFromMapping, toggleXmiCandidate, xmiCount, xmiImportErrorMessage, xmiList, xmiPreviewContractError, xmiText } from '../../utils/xmiImport';

const nodeTypes = { umlClass: ClassNode };
const edgeTypes = { relationEdge: RelationEdge };
const createRequestId = () => crypto.randomUUID?.() || `ai-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const principalDraftKey = 'diagramcraft-principal-draft';
const relationLabels = { asociacion: 'Asociación', agregacion: 'Agregación', composicion: 'Composición', herencia: 'Herencia', realizacion: 'Realización', dependencia: 'Dependencia' };
const classNodeKinds = new Set(['class', 'entity']);
const isClassNode = (node) => classNodeKinds.has(node?.data?.kind || 'entity');
const isAllowedRelation = (type, source, target) => {
  if (!source || !target || source.id === target.id) return false;
  if (type === 'realizacion') return isClassNode(source) && target.data?.kind === 'interface';
  if (type === 'herencia') return isClassNode(source) && isClassNode(target);
  if (['asociacion', 'agregacion', 'composicion'].includes(type)) return isClassNode(source) && isClassNode(target);
  return true;
};
const isManyMultiplicity = (value) => ['*', 'N', '0..*', '1..*'].includes(String(value || '').trim());
const canUseAssociationClass = (edge) => edge?.data?.relationType === 'asociacion'
  && isManyMultiplicity(edge.data?.multiplicidadOrigen)
  && isManyMultiplicity(edge.data?.multiplicidadDestino);

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
    return { message: value?.message || value?.mensaje || value?.detail || 'El modelo UML tiene un error de validación.', node_id: value?.node_id || value?.nodeId || extra.node_id, edge_id: value?.edge_id || value?.edgeId || extra.edge_id, element_id: value?.element_id || value?.elementId || extra.element_id };
  };
  if (Array.isArray(raw)) return raw.map((value) => item(value));
  if (typeof raw === 'object' && raw) return Object.entries(raw).flatMap(([key, value]) => (Array.isArray(value) ? value.map((entry) => item(entry, { field: key })) : [item(value, { field: key })]));
  return [item(fallback || 'No se pudo generar el proyecto.')];
};
const saveErrorMessage = (payload) => {
  const findMessage = (value) => {
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.map(findMessage).find(Boolean);
    if (value && typeof value === 'object') return Object.values(value).map(findMessage).find(Boolean);
    return null;
  };
  return findMessage(readGenerationError(payload));
};
const zipFilename = (header) => {
  const match = /filename\*?=(?:UTF-8''|")?([^;"]+)/i.exec(header || '');
  try { return match?.[1] ? decodeURIComponent(match[1].replace(/["]/g, '')) : 'spring-boot-project.zip'; } catch { return 'spring-boot-project.zip'; }
};

function ImportedNodeInternalsRefresher({ refreshToken, nodeIds }) {
  const updateNodeInternals = useUpdateNodeInternals();
  useEffect(() => {
    if (!refreshToken || !nodeIds.length) return undefined;
    const ids = nodeIds.split('|').filter(Boolean);
    const refresh = () => updateNodeInternals(ids);
    const firstFrame = requestAnimationFrame(() => {
      refresh();
      requestAnimationFrame(refresh);
    });
    const finalRefresh = window.setTimeout(refresh, 160);
    return () => {
      cancelAnimationFrame(firstFrame);
      window.clearTimeout(finalRefresh);
    };
  }, [nodeIds, refreshToken, updateNodeInternals]);
  return null;
}

export default function DiagramCanvas({ onLogout }) {
  const store = useDiagramStore();
  const { nodes, edges, selectedNodeId, closeRelationEditor, onNodesChange: applyNodesChange, onEdgesChange: applyEdgesChange, syncRelationHandles, reconnectRelation: reconnectStoreRelation, updateRelationAnchors: persistRelationAnchors, selectNode, createNode: addNode, createRelation: addRelation, updateNode: patchNode, addAttribute: appendAttribute, updateAttribute: patchAttribute, removeAttribute: deleteAttribute, addMethod: appendMethod, updateMethod: patchMethod, removeMethod: deleteMethod, duplicateNode: copyNode, setNodePositionLocked, deleteNode: removeNode, deleteRelation: removeRelation, createAssociationClassNode, clearAssociationClassNode, undo, redo, restore } = store;
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
  const [xmiBusy, setXmiBusy] = useState(false);
  // One state only: it belongs to this canvas and survives modal renders until
  // the user cancels, replaces the file, or completes the final import.
  const [pendingXmiFile, setPendingXmiFile] = useState(null);
  const [mappingMode, setMappingMode] = useState('class');
  const [xmiPreview, setXmiPreview] = useState(null);
  const [xmiPreviewError, setXmiPreviewError] = useState(null);
  const [isXmiPreviewing, setIsXmiPreviewing] = useState(false);
  const [isXmiImporting, setIsXmiImporting] = useState(false);
  const [isXmiDialogOpen, setIsXmiDialogOpen] = useState(false);
  const [xmiSelectedIds, setXmiSelectedIds] = useState([]);
  const [xmiExcludedIds, setXmiExcludedIds] = useState([]);
  const [xmiReport, setXmiReport] = useState(null);
  const [importLayoutRefresh, setImportLayoutRefresh] = useState(0);
  const [generationErrors, setGenerationErrors] = useState([]);
  const [highlightedEdgeId, setHighlightedEdgeId] = useState(null);
  const [aiCommand, setAiCommand] = useState('');
  const [aiStatus, setAiStatus] = useState('inactivo');
  const [aiMessage, setAiMessage] = useState('');
  const [aiPlan, setAiPlan] = useState(null);
  const [aiHistory, setAiHistory] = useState([]);
  const [voicePreferences, setVoicePreferences] = useState(() => {
    try {
      return { ...DEFAULT_VOICE_PREFERENCES, ...JSON.parse(window.localStorage.getItem('diagramcraft-diana-voice-preferences') || '{}') };
    } catch { return DEFAULT_VOICE_PREFERENCES; }
  });
  const [voices, setVoices] = useState([]);
  const voiceEnabled = voicePreferences.enabled;
  const [voiceState, setVoiceState] = useState('idle');
  const savingRef = useRef(false);
  const saveTimerRef = useRef(null);
  const saveQueuedRef = useRef(false);
  const saveQueuedGenerationRef = useRef(null);
  const saveAbortRef = useRef(null);
  const authoritativeReloadRef = useRef(null);
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
  const xmiInputRef = useRef(null);
  const xmiImportAbortRef = useRef(null);
  const xmiImportRequestRef = useRef(0);
  const xmiPreviewingRef = useRef(false);
  const aiRequestRef = useRef(0);
  const aiAbortRef = useRef(null);
  const speechRecognitionRef = useRef(null);
  const speechTranscriptRef = useRef('');
  const speechPausedRef = useRef(false);
  const voiceEnabledRef = useRef(voiceEnabled);
  const voicePreferencesRef = useRef(voicePreferences);
  const voicesRef = useRef(voices);
  const toggleVoiceRef = useRef(null);
  const voiceSessionRef = useRef('idle');
  const voiceRequestIdsRef = useRef(new Set());
  const aiPlanRef = useRef(null);
  const aiStatusRef = useRef('inactivo');
  const voicePlanActionRef = useRef(false);
  const localProjectApplyRef = useRef(false);
  const localSocketRequestIdsRef = useRef(new Map());
  const saveGenerationRef = useRef(0);
  const aiEchoRef = useRef(null);
  const diagramRevisionRef = useRef(null);

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

  const revisionOf = (document) => document?.revision ?? document?.version ?? document?.current_revision ?? null;
  const isStaleRevision = isStaleRevisionPayload;
  const rememberLocalSocketRequest = (requestId) => {
    const now = Date.now();
    for (const [id, createdAt] of localSocketRequestIdsRef.current) {
      if (now - createdAt > 60_000) localSocketRequestIdsRef.current.delete(id);
    }
    localSocketRequestIdsRef.current.set(requestId, now);
  };
  useEffect(() => { aiPlanRef.current = aiPlan; }, [aiPlan]);
  useEffect(() => { aiStatusRef.current = aiStatus; }, [aiStatus]);
  const invalidatePendingSaves = useCallback(() => {
    clearTimeout(saveTimerRef.current);
    clearTimeout(socketSyncTimerRef.current);
    saveQueuedRef.current = false;
    saveQueuedGenerationRef.current = null;
    saveGenerationRef.current += 1;
    saveAbortRef.current?.abort();
    saveAbortRef.current = null;
    return saveGenerationRef.current;
  }, []);
  const replaceWithAuthoritativeDocument = useCallback((document, diagramId, { recordHistory = false, markAiEcho = false } = {}) => {
    if (!Array.isArray(document?.nodes) || !Array.isArray(document?.edges)
      || String(diagramId) !== String(activeDiagramRef.current)) return false;
    invalidatePendingSaves();
    const viewport = reactFlowRef.current?.getViewport?.();
    restore({ nodes: document.nodes, edges: document.edges }, { preserveSelection: true, recordHistory });
    const restored = useDiagramStore.getState();
    diagramStateRef.current = { nodes: restored.nodes, edges: restored.edges };
    diagramRevisionRef.current = revisionOf(document) ?? diagramRevisionRef.current;
    hasPendingChangesRef.current = false;
    if (markAiEcho) aiEchoRef.current = JSON.stringify(diagramStateRef.current);
    setSaveStatus('saved');
    window.requestAnimationFrame(() => { if (viewport) reactFlowRef.current?.setViewport?.(viewport); });
    return true;
  }, [invalidatePendingSaves, restore]);
  const addAiHistory = (role, message) => {
    if (message) setAiHistory((items) => [...items, { id: `${Date.now()}-${Math.random()}`, role, message }].slice(-6));
  };
  const speakDiana = useCallback((message, { resumeListening = false } = {}) => {
    if (!voiceEnabledRef.current || !window.speechSynthesis || !message) return;
    const phrases = speechSegments(message);
    if (!phrases.length) return;
    speechPausedRef.current = true;
    speechRecognitionRef.current?.abort();
    speechRecognitionRef.current = null;
    window.speechSynthesis.cancel();
    const preferences = voicePreferencesRef.current;
    const voice = selectBestSpanishVoice(voicesRef.current, preferences.voiceURI);
    const speakNext = (index) => {
      const utterance = new SpeechSynthesisUtterance(phrases[index]);
      utterance.lang = voice?.lang || import.meta.env.VITE_SPEECH_LANGUAGE || 'es-BO';
      utterance.rate = preferences.rate;
      utterance.pitch = preferences.pitch;
      utterance.volume = 1;
      if (voice) utterance.voice = voice;
      utterance.onend = utterance.onerror = () => {
        if (index + 1 < phrases.length) { speakNext(index + 1); return; }
        speechPausedRef.current = false;
        if (resumeListening && ['instruction', 'confirmation'].includes(voiceSessionRef.current)) window.setTimeout(() => toggleVoiceRef.current?.(), 100);
      };
      window.speechSynthesis.speak(utterance);
    };
    speakNext(0);
  }, []);
  const restoreAuthoritativeDocument = useCallback(async (message = 'El diagrama cambió en otra sesión; se cargó la versión más reciente.') => {
    const diagramId = activeDiagramRef.current;
    if (!diagramId) return false;
    if (authoritativeReloadRef.current?.diagramId === String(diagramId)) return authoritativeReloadRef.current.promise;
    const generation = invalidatePendingSaves();
    let completeReload;
    const reloadPromise = new Promise((resolve) => { completeReload = resolve; });
    authoritativeReloadRef.current = { diagramId: String(diagramId), promise: reloadPromise };
    try {
      const diagram = await obtenerDiagrama(diagramId);
      if (generation !== saveGenerationRef.current || String(diagramId) !== String(activeDiagramRef.current)) return false;
      if (!replaceWithAuthoritativeDocument(contenidoDiagrama(diagram), diagramId)) return false;
      if (message) setToast(message);
      return true;
    } catch {
      setSaveStatus('error');
      setToast('Hay un conflicto de revisión y no se pudo recargar el diagrama. Recarga la página antes de continuar.');
      return false;
    } finally {
      completeReload?.(true);
      if (authoritativeReloadRef.current?.promise === reloadPromise) authoritativeReloadRef.current = null;
    }
  }, [invalidatePendingSaves, replaceWithAuthoritativeDocument]);

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
      if (event.code === 'stale_revision' || event?.error?.code === 'stale_revision') {
        const ownEvent = isOwnSocketEvent(event, diagramStateRef.current, localSocketRequestIdsRef.current);
        restoreAuthoritativeDocument(ownEvent ? null : 'El diagrama cambió en otra sesión. Se cargó la versión actual para evitar sobrescribir cambios.');
        return;
      }
      setToast(`Error de sincronización: ${event.detail || 'el servidor rechazó el cambio.'}`);
      return;
    }
    if (event?.type !== 'diagram.update' || String(event.diagram_id) !== String(activeDiagramRef.current)) return;
    if (Array.isArray(event.nodes) && Array.isArray(event.edges)) {
      const incomingRevision = revisionOf(event);
      const currentRevision = diagramRevisionRef.current;
      const ownEvent = isOwnSocketEvent(event, diagramStateRef.current, localSocketRequestIdsRef.current);
      const incoming = JSON.stringify({ nodes: event.nodes, edges: event.edges });
      if (aiEchoRef.current && incoming === aiEchoRef.current) {
        aiEchoRef.current = null;
        return;
      }
      if (!shouldReplaceRemoteDocument(incomingRevision, currentRevision)) return;
      const replaced = replaceWithAuthoritativeDocument({ nodes: event.nodes, edges: event.edges, revision: incomingRevision }, event.diagram_id);
      if (replaced && !ownEvent) setToast('El diagrama cambió en otra sesión. Se cargó la versión actual para evitar sobrescribir cambios.');
    }
  }, [replaceWithAuthoritativeDocument, returnToPrincipalCanvas, restoreAuthoritativeDocument]);
  const { status: socketStatus, send: sendSocketEvent } = useDiagramSocket(activeDiagramId, onSocketMessage);

  useEffect(() => {
    socketSendRef.current = sendSocketEvent;
    return () => { socketSendRef.current = null; };
  }, [sendSocketEvent]);

  useEffect(() => {
    if (socketStatus === 'connected' && activeDiagramId) sendSocketEvent({ type: 'presence.join', diagram_id: activeDiagramId });
  }, [activeDiagramId, sendSocketEvent, socketStatus]);

  async function persistPendingChanges({ silent = false, scheduledGeneration = saveGenerationRef.current, scheduledRevision = diagramRevisionRef.current } = {}) {
    if (!diagramLoadedRef.current || !activeProjectRef.current || !hasPendingChangesRef.current) return true;
    if (!saveSnapshotIsCurrent({ scheduledGeneration, currentGeneration: saveGenerationRef.current, scheduledRevision, currentRevision: diagramRevisionRef.current })) return false;
    if (savingRef.current) { saveQueuedRef.current = true; saveQueuedGenerationRef.current = scheduledGeneration; return false; }
    savingRef.current = true;
    const diagramId = activeDiagramRef.current;
    const contenido = { nodes: diagramStateRef.current.nodes, edges: diagramStateRef.current.edges };
    const controller = new AbortController();
    saveAbortRef.current = controller;
    setSaveStatus('saving');
    try {
      if (diagramId) {
        const saved = await guardarDiagrama(diagramId, contenido, scheduledRevision, { signal: controller.signal });
        if (!saveSnapshotIsCurrent({ scheduledGeneration, currentGeneration: saveGenerationRef.current, scheduledRevision, currentRevision: diagramRevisionRef.current }) || String(diagramId) !== String(activeDiagramRef.current)) return false;
        return replaceWithAuthoritativeDocument(saved, diagramId);
      } else {
        const diagram = await crearDiagramaPrincipal(activeProjectRef.current, contenido);
        if (scheduledGeneration !== saveGenerationRef.current) return false;
        activeDiagramRef.current = diagram.id;
        diagramRevisionRef.current = revisionOf(diagram);
        setActiveDiagramId(diagram.id);
      }
      hasPendingChangesRef.current = false;
      setSaveStatus('saved');
      return true;
    } catch (requestError) {
      if (isStaleRevision(requestError)) {
        invalidatePendingSaves();
        await restoreAuthoritativeDocument('Tu guardado usaba una revisión anterior. Se restauró el diagrama actual para evitar sobrescribir cambios remotos.');
        setToast('El diagrama cambió en otra sesión. Se cargó la versión actual para evitar sobrescribir cambios.');
        return false;
      }
      if (requestError.code === 'ERR_CANCELED') return false;
      setSaveStatus('error');
      if (!silent) setToast(saveErrorMessage(requestError.response?.data) || 'No se pudo guardar el diagrama.');
      return false;
    } finally {
      savingRef.current = false;
      if (saveAbortRef.current === controller) saveAbortRef.current = null;
      if (saveQueuedRef.current && saveQueuedGenerationRef.current === saveGenerationRef.current && hasPendingChangesRef.current) {
        saveQueuedRef.current = false;
        saveQueuedGenerationRef.current = null;
        setSaveStatus('pending');
        scheduleSave();
      }
    }
  }

  function scheduleSave() {
    if (!diagramLoadedRef.current || !activeProjectRef.current) return;
    const scheduledGeneration = saveGenerationRef.current;
    const scheduledRevision = diagramRevisionRef.current;
    clearTimeout(saveTimerRef.current);
    setSaveStatus('pending');
    saveTimerRef.current = setTimeout(() => { persistPendingChanges({ scheduledGeneration, scheduledRevision }); }, 700);
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
    // REST es el único escritor del documento. El backend publica el estado
    // persistido por WebSocket después de guardar, evitando una carrera entre
    // un diagram.update local y el PATCH de autosave.
    scheduleSave();
  }

  const isCurrentAiRequest = (requestId, diagramId) => requestId === aiRequestRef.current && String(diagramId) === String(activeDiagramRef.current);
  const aiSelection = () => ({ node_ids: selectedNodeId ? [selectedNodeId] : [], edge_ids: highlightedEdgeId ? [highlightedEdgeId] : [] });
  const applyAuthoritativeAiResult = (payload, diagramId) => {
    const document = payload?.diagram && String(payload.diagram.id) === String(diagramId)
      ? payload.diagram
      : payload?.result || payload;
    if (!Array.isArray(document?.nodes) || !Array.isArray(document?.edges) || String(diagramId) !== String(activeDiagramRef.current)) return false;
    return replaceWithAuthoritativeDocument({
      ...document,
      revision: document.revision ?? document.version ?? payload?.revision ?? payload?.version,
    }, diagramId, { recordHistory: true, markAiEcho: true });
  };
  const applyCurrentAiPlan = async (plan, confirm = true) => {
    if (plan?.localProjectCreation) {
      if (localProjectApplyRef.current || aiPlanRef.current !== plan) return;
      localProjectApplyRef.current = true;
      try { return await applyLocalProjectPlan(plan); }
      finally { localProjectApplyRef.current = false; }
    }
    const diagramId = activeDiagramRef.current;
    if (!plan?.plan_id || !diagramId) return;
    invalidatePendingSaves();
    const requestId = ++aiRequestRef.current;
    aiAbortRef.current?.abort();
    const controller = new AbortController();
    aiAbortRef.current = controller;
    const idempotencyKey = createRequestId();
    rememberLocalSocketRequest(idempotencyKey);
    setAiStatus('aplicando');
    setAiMessage('Aplicando el plan autorizado…');
    try {
      const { data } = await applyAiPlan(diagramId, {
        plan_id: plan.plan_id,
        idempotency_key: idempotencyKey,
        confirm,
        expected_revision: diagramRevisionRef.current,
        request_id: plan.request_id,
      }, { signal: controller.signal });
      if (!isCurrentAiRequest(requestId, diagramId)) return;
      if (!applyAuthoritativeAiResult(data, diagramId)) throw new Error('El servidor no devolvió un diagrama autorizado.');
      aiPlanRef.current = null;
      setAiPlan(null);
      voiceSessionRef.current = 'idle';
      setVoiceState('idle');
      setAiStatus('exito');
      if (data?.project?.id && data?.diagram?.id) {
        const availableProjects = await refreshProjects();
        const createdProject = availableProjects.find((project) => String(project.id) === String(data.project.id));
        if (createdProject) await openProject(createdProject, true);
      }
      speakDiana(data?.summary || data?.message || 'Listo, apliqué el plan al diagrama.');
      addAiHistory('diana', data?.summary || data?.message || 'Plan aplicado de forma segura.');
      setAiMessage(data?.summary || data?.message || 'Instrucción aplicada correctamente.');
      setToast('El Agente IA actualizó el diagrama.');
    } catch (requestError) {
      if (requestError.code === 'ERR_CANCELED' || !isCurrentAiRequest(requestId, diagramId)) return;
      if (isStaleRevision(requestError)) {
        aiPlanRef.current = null;
        setAiPlan(null);
        await restoreAuthoritativeDocument('El plan usaba una revisión anterior y no se aplicó. Se cargó la versión actual.');
        setAiStatus('error');
        setAiMessage('El plan está desactualizado; vuelve a pedirlo sobre el diagrama actual.');
        return;
      }
      setAiStatus('error');
      setAiMessage(requestError.response?.data?.detail || requestError.response?.data?.message || 'No se pudo aplicar el plan; el lienzo no fue modificado.');
      const issue = requestError.response?.data;
      if (issue?.target || issue?.node_id || issue?.edge_id) focusGenerationIssue(issue.target ? { element_id: issue.target } : issue);
    } finally {
      if (isCurrentAiRequest(requestId, diagramId)) aiAbortRef.current = null;
    }
  };
  const interpretAiCommand = async (instruction, suppliedRequestId) => {
    const diagramId = activeDiagramRef.current;
    if (!instruction?.trim()) { setAiStatus('error'); setAiMessage('Escribe una instrucción antes de enviarla.'); return; }
    const projectRequest = parseProjectCreationCommand(instruction);
    if (!diagramId) {
      if (!projectRequest.isProjectCreation) {
        setAiStatus('error');
        setAiMessage('Selecciona un diagrama guardado antes de usar el Agente IA.');
        return;
      }
      if (!projectRequest.name) {
        setAiStatus('aclaracion');
        setAiMessage('¿Qué nombre deseas para el proyecto?');
        speakDiana('¿Qué nombre deseas para el proyecto?');
        return;
      }
      const localPlan = {
        localProjectCreation: true,
        name: projectRequest.name,
        summary: `Crear proyecto ${projectRequest.name}.`,
        operations: [{ op: 'project.create', payload: { name: projectRequest.name, create_main_diagram: true } }],
      };
      aiPlanRef.current = localPlan;
      setAiPlan(localPlan);
      setAiStatus('confirmacion');
      voiceSessionRef.current = 'confirmation';
      setVoiceState('confirmation');
      const message = `Perfecto. Preparé el proyecto ${projectRequest.name}. Di “confirmar” o pulsa Confirmar.`;
      setAiMessage(message);
      addAiHistory('usuario', instruction.trim());
      addAiHistory('diana', message);
      speakDiana(message, { resumeListening: true });
      return;
    }
    if (isReadOnly) { setAiStatus('error'); setAiMessage('No tienes permiso para modificar este diagrama.'); return; }
    clearTimeout(saveTimerRef.current);
    clearTimeout(socketSyncTimerRef.current);
    const saved = await persistPendingChanges({ silent: true });
    if (!saved || String(diagramId) !== String(activeDiagramRef.current)) { setAiStatus('error'); setAiMessage('No se pudieron sincronizar los cambios pendientes antes de interpretar.'); return; }
    const voiceRequestId = suppliedRequestId || createRequestId();
    if (voiceRequestIdsRef.current.has(voiceRequestId)) return;
    voiceRequestIdsRef.current.add(voiceRequestId);
    const requestId = ++aiRequestRef.current;
    aiAbortRef.current?.abort();
    const controller = new AbortController();
    aiAbortRef.current = controller;
    setAiStatus('interpretando');
    setAiMessage('Interpretando la instrucción…');
    aiPlanRef.current = null;
    setAiPlan(null);
    addAiHistory('usuario', instruction.trim());
    try {
      const { data } = await interpretAi(diagramId, instruction.trim(), aiSelection(), { signal: controller.signal, expectedRevision: diagramRevisionRef.current, requestId: voiceRequestId });
      if (!isCurrentAiRequest(requestId, diagramId)) return;
      const status = String(data?.status || data?.type || data?.kind || 'ready').toLowerCase();
      if (status === 'clarification' || status === 'aclaracion') {
        const candidates = (data?.candidates || []).map((candidate) => candidate.name || candidate.title || candidate.id).filter(Boolean);
        setAiStatus('aclaracion');
        setAiMessage(`${data?.question || data?.message || 'Necesito una aclaración.'}${candidates.length ? ` Opciones: ${candidates.join(', ')}.` : ''}`);
        return;
      }
      if (status === 'unsupported' || status === 'error') {
        const message = data?.question || 'No entendí completamente la instrucción. ¿Puedes decir qué clase, entidad, interfaz o relación deseas crear?';
        setAiStatus('aclaracion');
        setAiMessage(message);
        addAiHistory('diana', message);
        speakDiana(message);
        return;
      }
      const plan = data?.plan || data;
      const normalizedPlan = { ...plan, plan_id: plan.plan_id || plan.id || data?.plan_id, request_id: voiceRequestId, summary: plan.summary || data?.summary || data?.message || 'Plan listo para aplicar.' };
      if (!normalizedPlan.plan_id) throw new Error('La respuesta no contiene un plan aplicable.');
      addAiHistory('diana', normalizedPlan.summary);
      const destructive = planNeedsConfirmation(data, plan);
      if (destructive) {
        aiPlanRef.current = normalizedPlan;
        setAiPlan(normalizedPlan);
        setAiStatus('confirmacion');
        voiceSessionRef.current = 'confirmation';
        const isProjectPlan = (plan.operations || data.operations || []).some((operation) => (operation.op || operation.type) === 'project.create');
        const confirmationMessage = isProjectPlan
          ? `Perfecto. ${normalizedPlan.summary} Di “confirmar” o pulsa Confirmar.`
          : `${normalizedPlan.summary} Di “confirmar” o pulsa Confirmar.`;
        setAiMessage(confirmationMessage);
        speakDiana(confirmationMessage, { resumeListening: true });
        return;
      }
      await applyCurrentAiPlan(normalizedPlan, true);
    } catch (requestError) {
      if (requestError.code === 'ERR_CANCELED' || !isCurrentAiRequest(requestId, diagramId)) return;
      const clarification = interpretationClarificationMessage(requestError);
      if (clarification) {
        voiceSessionRef.current = 'idle';
        setVoiceState('idle');
        setAiStatus('aclaracion');
        setAiMessage(clarification);
        addAiHistory('diana', clarification);
        speakDiana(clarification);
        return;
      }
      setAiStatus('error');
      setAiMessage(requestError.response?.data?.detail || requestError.response?.data?.message || requestError.message || 'No se pudo interpretar la instrucción.');
    } finally {
      if (isCurrentAiRequest(requestId, diagramId)) aiAbortRef.current = null;
    }
  };
  const cancelAi = () => {
    aiRequestRef.current += 1;
    aiAbortRef.current?.abort();
    aiAbortRef.current = null;
    voiceSessionRef.current = 'idle';
    setVoiceState('idle');
    aiPlanRef.current = null;
    setAiPlan(null);
    setAiStatus('inactivo');
    setAiMessage('Plan cancelado.');
  };
  const stopVoiceRecognition = () => {
    voiceSessionRef.current = 'idle';
    speechRecognitionRef.current?.abort();
    speechRecognitionRef.current = null;
    setVoiceState('idle');
    setAiStatus('inactivo');
  };
  const toggleVoiceRecognition = () => {
    const ActiveRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (speechRecognitionRef.current) { stopVoiceRecognition(); setAiMessage('Reconocimiento de voz detenido.'); return; }
    voiceEnabledRef.current = true;
    setVoicePreferences((preferences) => ({ ...preferences, enabled: true }));
    voiceSessionRef.current = voiceSessionForPendingPlan(voiceSessionRef.current, Boolean(aiPlanRef.current));
    voiceSessionRef.current = ['instruction', 'confirmation'].includes(voiceSessionRef.current) ? voiceSessionRef.current : 'wake';
    speechTranscriptRef.current = '';
    if (!ActiveRecognition) { setAiStatus('error'); setAiMessage('Este navegador no admite reconocimiento de voz. Puedes escribir la instrucción.'); return; }
    const recognition = new ActiveRecognition();
    recognition.lang = import.meta.env.VITE_SPEECH_LANGUAGE || 'es-ES';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results).filter((result) => result.isFinal).map((result) => result[0]?.transcript?.trim()).filter(Boolean).join(' ');
      if (!transcript || transcript === speechTranscriptRef.current) return;
      speechTranscriptRef.current = transcript;
      const pendingPlan = aiPlanRef.current;
      const action = voiceFinalAction(transcript, voiceSessionRef.current, Boolean(pendingPlan));
      console.debug('[Diana voz] transcripción final', {
        transcript, normalized: normalizeVoiceTranscript(transcript), action,
        hasPendingPlan: Boolean(pendingPlan), status: aiStatusRef.current,
      });
      const stopCommandRecognition = () => {
        voiceSessionRef.current = 'idle';
        speechRecognitionRef.current?.abort();
        speechRecognitionRef.current = null;
        setVoiceState('idle');
      };
      if (action === 'stop') {
        stopVoiceRecognition();
        setAiMessage('De acuerdo, dejaré de escuchar.');
        speakDiana('De acuerdo, dejaré de escuchar.');
        return;
      }
      if (action === 'cancel') {
        console.debug('[Diana voz] cancelando plan pendiente');
        stopCommandRecognition();
        cancelAi();
        setAiMessage('Plan cancelado.');
        return;
      }
      if (action === 'confirm') {
        if (!pendingPlan || voicePlanActionRef.current || ['aplicando', 'interpretando'].includes(aiStatusRef.current) || aiAbortRef.current) return;
        voicePlanActionRef.current = true;
        stopCommandRecognition();
        setAiMessage('Confirmando el plan…');
        console.debug('[Diana voz] aplicando plan confirmado', { planId: pendingPlan.plan_id });
        applyCurrentAiPlan(pendingPlan, true).finally(() => { voicePlanActionRef.current = false; });
        return;
      }
      if (action === 'confirm_without_plan' || action === 'cancel_without_plan') {
        stopCommandRecognition();
        setAiMessage('No hay un plan pendiente para confirmar o cancelar.');
        return;
      }
      setAiCommand(transcript);
      if (voiceSessionRef.current === 'wake') {
        if (action === 'wake') {
          voiceSessionRef.current = 'instruction';
          speechTranscriptRef.current = '';
          setVoiceState('instruction');
          setAiStatus('escuchando');
          speakDiana('Hola, soy Diana. ¿Qué necesitas modelar?', { resumeListening: true });
          setAiMessage('Hola, soy Diana. Te escucho.');
          return;
        }
        setAiMessage('Di “Hola Diana” para iniciar una instrucción.');
        return;
      }
      if (action === 'send') {
        voiceSessionRef.current = 'idle';
        setVoiceState('idle');
        const instruction = transcript.replace(/^\s*diana\s*,?\s*/i, '');
        interpretAiCommand(instruction, crypto.randomUUID?.() || `voice-${Date.now()}-${Math.random().toString(36).slice(2)}`);
        return;
      }
      setAiStatus('inactivo');
      setAiMessage('Transcripción lista para revisar y enviar.');
    };
    recognition.onerror = (event) => {
      if (event.error === 'aborted') return;
      const pendingPlan = aiPlanRef.current;
      const voiceError = voiceRecognitionError(event.error, Boolean(pendingPlan));
      console.debug('[Diana voz] error de reconocimiento', { error: event.error, hasPendingPlan: Boolean(pendingPlan) });
      if (voiceError.preservePendingPlan) {
        voiceSessionRef.current = 'confirmation';
        speechRecognitionRef.current = null;
        setVoiceState('idle');
        setAiStatus('confirmacion');
        setAiMessage(voiceError.message);
        return;
      }
      const messages = { 'not-allowed': 'Permiso de micrófono denegado.', 'service-not-allowed': 'El navegador no permite el servicio de voz.', 'no-speech': 'No se detectó voz. Inténtalo otra vez.', network: 'Error de red en el reconocimiento de voz.', aborted: 'Reconocimiento de voz detenido.' };
      setAiStatus('error'); setAiMessage(messages[event.error] || 'No se pudo reconocer la voz. Puedes escribir la instrucción.');
    };
    recognition.onend = () => {
      if (speechRecognitionRef.current === recognition) speechRecognitionRef.current = null;
      if (voiceSessionRef.current === 'instruction' && !speechPausedRef.current) { window.setTimeout(toggleVoiceRecognition, 0); return; }
      setVoiceState('idle');
      setAiStatus((current) => current === 'escuchando' ? 'inactivo' : current);
    };
    speechRecognitionRef.current = recognition;
    setAiStatus('escuchando');
    setVoiceState(voiceSessionRef.current);
    setAiMessage('Escuchando… habla y revisa la transcripción antes de enviarla.');
    setAiMessage(voiceSessionRef.current === 'confirmation'
      ? 'Escuchando confirmación: di “confirmar” o “cancelar”.'
      : voiceSessionRef.current === 'instruction'
      ? 'Hola, soy Diana. Te escucho: di una sola instrucción para el diagrama.'
      : 'Escuchando. Di “Hola Diana” para iniciar una instrucción.');
    try {
      console.debug('[Diana voz] iniciando reconocimiento', { session: voiceSessionRef.current, hasPendingPlan: Boolean(aiPlanRef.current) });
      recognition.start();
    }
    catch { speechRecognitionRef.current = null; setVoiceState('idle'); setAiStatus('error'); setAiMessage('No se pudo iniciar el micrófono. Revisa el permiso de Edge o usa la entrada de texto.'); }
  };
  useEffect(() => { toggleVoiceRef.current = toggleVoiceRecognition; });
  useEffect(() => () => {
    aiRequestRef.current += 1;
    aiAbortRef.current?.abort();
    saveAbortRef.current?.abort();
    xmiImportAbortRef.current?.abort();
    xmiImportAbortRef.current = null;
    clearTimeout(saveTimerRef.current);
    clearTimeout(socketSyncTimerRef.current);
    speechRecognitionRef.current?.abort();
    speechRecognitionRef.current = null;
  }, [activeDiagramId]);
  useEffect(() => {
    const synth = window.speechSynthesis;
    if (!synth) return undefined;
    const loadVoices = () => setVoices(synth.getVoices());
    loadVoices();
    synth.addEventListener?.('voiceschanged', loadVoices);
    return () => synth.removeEventListener?.('voiceschanged', loadVoices);
  }, []);
  useEffect(() => {
    voiceEnabledRef.current = voicePreferences.enabled;
    voicePreferencesRef.current = voicePreferences;
    window.localStorage.setItem('diagramcraft-diana-voice-preferences', JSON.stringify(voicePreferences));
  }, [voicePreferences]);
  useEffect(() => {
    const updatePreferences = (event) => setVoicePreferences((current) => ({ ...current, ...event.detail }));
    const previewVoice = () => speakDiana('Hola, soy Diana. ¿Qué te gustaría modelar?');
    window.addEventListener('diana-voice-settings', updatePreferences);
    window.addEventListener('diana-voice-preview', previewVoice);
    return () => {
      window.removeEventListener('diana-voice-settings', updatePreferences);
      window.removeEventListener('diana-voice-preview', previewVoice);
    };
  }, [speakDiana]);
  useEffect(() => { voicesRef.current = voices; }, [voices]);
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
  const createRelation = (...args) => { const [type, sourceId, targetId] = args; const source = nodes.find((node) => node.id === sourceId); const target = nodes.find((node) => node.id === targetId); if (!isAllowedRelation(type, source, target)) { setToast(['asociacion', 'agregacion', 'composicion'].includes(type) ? 'Las asociaciones, agregaciones y composiciones requieren clases o entidades.' : type === 'realizacion' ? 'La realización debe ir de una clase o entidad hacia una interface.' : 'La herencia debe ir de una clase o entidad hija hacia una clase o entidad padre.'); return false; } const created = addRelation(...args); if (created) scheduleCurrentSave(); return created; };
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
    const socketSyncTimer = socketSyncTimerRef.current;
    return () => {
      clearTimeout(socketSyncTimer);
      setDiagramMutationListener(null);
    };
  }, []);

  const openProject = useCallback(async (project, closeDialog = true, forceEmpty = false, preloadedDiagram = null) => {
    try {
      clearTimeout(saveTimerRef.current);
      await persistPendingChanges();
      diagramLoadedRef.current = false;
      setNodeMenu(null);
      const diagram = forceEmpty ? null : preloadedDiagram || await obtenerDiagramaPrincipal(project);
      const migrated = restore(diagram ? contenidoDiagrama(diagram) : { nodes: [], edges: [] });
      const restored = useDiagramStore.getState();
      diagramStateRef.current = { nodes: restored.nodes, edges: restored.edges };
      hasPendingChangesRef.current = false;
      activeProjectRef.current = project.id;
      activeDiagramRef.current = diagram?.id || null;
      diagramRevisionRef.current = diagram?.revision ?? diagram?.version ?? null;
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
      const jpaManaged = typeof edge.data?.jpaManaged === 'boolean'
        ? edge.data.jpaManaged
        : source?.data?.kind === 'entity' && target?.data?.kind === 'entity';
      if (['asociacion', 'agregacion', 'composicion'].includes(type) && jpaManaged && (!source || !target || source.data?.kind !== 'entity' || target.data?.kind !== 'entity')) return [{ edge_id: edge.id, message: 'Una relación marcada como JPA solo puede conectar dos entidades.' }];
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
  const downloadXmi = async () => {
    if (!activeDiagramId || xmiBusy) return;
    setXmiBusy(true);
    try {
      const response = await exportarXmi(activeDiagramId);
      const url = URL.createObjectURL(new Blob([response.data], { type: response.headers['content-type'] || 'application/xml' }));
      const link = document.createElement('a'); link.href = url; link.download = zipFilename(response.headers['content-disposition']).replace(/\.zip$/i, '.xmi'); document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 0);
      setToast('XMI exportado correctamente.');
    } catch (requestError) {
      const issues = generationIssues(requestError.response?.data, requestError.response?.status === 403 ? 'No tienes permisos para exportar XMI.' : 'No se pudo exportar el XMI.');
      setXmiReport({ error: true, errors: issues });
      focusGenerationIssue(issues[0]);
    }
    finally { setXmiBusy(false); }
  };
  const uploadXmi = async (event) => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file || !activeDiagramId || xmiBusy || isXmiImporting) return;
    xmiImportRequestRef.current += 1;
    xmiImportAbortRef.current?.abort();
    xmiPreviewingRef.current = false;
    setIsXmiDialogOpen(true);
    setXmiPreview(null);
    setXmiPreviewError(null);
    setXmiSelectedIds([]);
    setXmiExcludedIds([]);
    setMappingMode('class');
    if (!/\.(xmi|xml)$/i.test(file.name || '')) {
      setPendingXmiFile(null);
      setXmiPreviewError('Selecciona un archivo XMI válido.');
      return;
    }
    setPendingXmiFile(file);
  };
  const closeXmiImport = () => {
    xmiImportRequestRef.current += 1;
    xmiImportAbortRef.current?.abort();
    xmiImportAbortRef.current = null;
    xmiPreviewingRef.current = false;
    setPendingXmiFile(null);
    setMappingMode('class');
    setXmiPreview(null);
    setXmiPreviewError(null);
    setXmiSelectedIds([]);
    setXmiExcludedIds([]);
    setIsXmiPreviewing(false);
    setIsXmiDialogOpen(false);
  };
  const handleGenerateXmiPreview = async () => {
    console.debug('XMI preview clicked', {
      hasFile: pendingXmiFile instanceof File,
      fileName: pendingXmiFile?.name ?? null,
      mappingMode,
    });
    // A new explicit attempt never inherits a message from a prior file/mode.
    setXmiPreviewError(null);
    const file = pendingXmiFile;
    const diagramId = activeDiagramRef.current;
    if (!(file instanceof File)) {
      setXmiPreviewError('Selecciona un archivo XMI válido.');
      return;
    }
    if (!diagramId || !canStartXmiPreview(file, isXmiPreviewing, xmiPreviewingRef.current)) return;
    const request = ++xmiImportRequestRef.current;
    xmiImportAbortRef.current?.abort();
    const controller = new AbortController();
    xmiImportAbortRef.current = controller;
    xmiPreviewingRef.current = true;
    setIsXmiPreviewing(true);
    setXmiPreview(null);
    setXmiPreviewError(null);
    setXmiSelectedIds([]);
    setXmiExcludedIds([]);
    try {
      const formData = appendXmiImportFormData(new FormData(), { file, mappingMode, dryRun: true });
      console.debug('XMI FormData', [...formData.entries()].map(([key, value]) => [
        key,
        value instanceof File ? `${value.name} (${value.size} bytes)` : value,
      ]));
      console.debug('XMI request starting');
      const result = await importarXmi(diagramId, formData, { signal: controller.signal });
      if (request !== xmiImportRequestRef.current || String(diagramId) !== String(activeDiagramRef.current)) return;
      console.debug('XMI response received', { dryRun: result?.dry_run, keys: Object.keys(result ?? {}) });
      console.debug('XMI dry-run response shape', {
        dryRun: result?.dry_run,
        hasReport: Boolean(result?.report),
        hasMapping: Boolean(result?.report?.mapping),
        hasPreview: Boolean(result?.preview),
        keys: Object.keys(result || {}),
      });
      if (!isValidXmiPreview(result)) {
        setXmiPreviewError(xmiPreviewContractError(result));
        return;
      }
      const mapping = result.report.mapping;
      setXmiPreview(result);
      const selection = selectionFromMapping(mapping);
      setXmiSelectedIds(selection.selectedIds);
      setXmiExcludedIds(selection.excludedIds);
    } catch (requestError) {
      console.debug('XMI request failed', { message: requestError?.message, code: requestError?.code, status: requestError?.response?.status });
      if (requestError.code === 'ERR_CANCELED' || request !== xmiImportRequestRef.current) return;
      setXmiPreview(null);
      setXmiPreviewError('No se pudo contactar al servidor para generar la previsualización.');
    } finally {
      if (xmiImportAbortRef.current === controller) xmiImportAbortRef.current = null;
      if (request === xmiImportRequestRef.current) {
        xmiPreviewingRef.current = false;
        setIsXmiPreviewing(false);
      }
    }
  };
  const changeXmiMappingMode = (nextMappingMode) => {
    if (isXmiImporting) return;
    xmiImportRequestRef.current += 1;
    xmiImportAbortRef.current?.abort();
    xmiPreviewingRef.current = false;
    setMappingMode(nextMappingMode);
    setXmiPreview(null);
    setXmiPreviewError(null);
    setXmiSelectedIds([]);
    setXmiExcludedIds([]);
    setIsXmiPreviewing(false);
  };
  const toggleXmiSelection = (candidate, checked) => {
    const next = toggleXmiCandidate({ selectedIds: xmiSelectedIds, excludedIds: xmiExcludedIds }, candidate, checked);
    setXmiSelectedIds(next.selectedIds);
    setXmiExcludedIds(next.excludedIds);
  };
  const confirmXmiImport = async () => {
    const file = pendingXmiFile;
    if (!file || !activeDiagramId || xmiBusy || isXmiPreviewing || isXmiImporting || !isValidXmiPreview(xmiPreview)) return;
    const diagramId = activeDiagramRef.current;
    const request = ++xmiImportRequestRef.current;
    xmiImportAbortRef.current?.abort();
    const controller = new AbortController();
    xmiImportAbortRef.current = controller;
    setIsXmiImporting(true);
    setXmiPreviewError(null);
    setXmiBusy(true);
    try {
      const formData = appendXmiImportFormData(new FormData(), { file,
        mappingMode,
        dryRun: false,
        selectedIds: xmiSelectedIds,
        excludedIds: xmiExcludedIds,
      });
      console.debug('XMI FormData', [...formData.entries()].map(([key, value]) => [
        key,
        value instanceof File ? `${value.name} (${value.size} bytes)` : value,
      ]));
      const data = await importarXmi(diagramId, formData, { signal: controller.signal });
      if (request !== xmiImportRequestRef.current || String(diagramId) !== String(activeDiagramRef.current)) return;
      const finalPayload = data?.diagram || data;
      const document = { ...finalPayload, ...contenidoDiagrama(finalPayload), revision: finalPayload?.revision ?? data?.revision };
      if (!replaceWithAuthoritativeDocument(document, diagramId, { recordHistory: true })) throw new Error('El servidor no devolvió el diagrama autoritativo.');
      setImportLayoutRefresh((current) => current + 1);
      // React Flow calculates class-card dimensions and connection handles
      // asynchronously.  The store already assigned imported connectors to
      // their nearest sides from the UMLDI geometry; wait before fitting the
      // camera so the first visible frame uses those handles.
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => window.setTimeout(resolve, 80))));
      reactFlowRef.current?.fitView({ padding: 0.2, duration: 180 });
      const report = data.report || {};
      setXmiReport(report);
      const umlNonPersistent = report.umlNonPersistentRelations || 0;
      setToast(`XMI importado: ${report.imported?.nodes || 0} nodos, ${report.imported?.edges || 0} relaciones${umlNonPersistent ? ` (${umlNonPersistent} UML no persistentes)` : ''}.`);
      setIsXmiDialogOpen(false);
      setPendingXmiFile(null);
    } catch (requestError) {
      if (requestError.code === 'ERR_CANCELED' || request !== xmiImportRequestRef.current) return;
      const issues = generationIssues(requestError.response?.data, 'No se pudo importar el XMI.');
      setXmiReport({ error: true, errors: issues });
      focusGenerationIssue(issues[0]);
      setXmiPreviewError(xmiImportErrorMessage(requestError));
    } finally {
      if (xmiImportAbortRef.current === controller) xmiImportAbortRef.current = null;
      setXmiBusy(false);
      if (request === xmiImportRequestRef.current) setIsXmiImporting(false);
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
  async function applyLocalProjectPlan(plan) {
    const name = String(plan?.name || '').trim();
    if (!name) return;
    if (projects.some((project) => (project.nombre || project.name || '').trim().toLocaleLowerCase() === name.toLocaleLowerCase())) {
      aiPlanRef.current = null;
      setAiPlan(null);
      voiceSessionRef.current = 'idle';
      setVoiceState('idle');
      setAiStatus('error');
      setAiMessage('Ya tienes un proyecto activo con ese nombre.');
      return;
    }
    setAiStatus('aplicando');
    setAiMessage('Creando el proyecto…');
    try {
      const project = await crearProyecto(name);
      setProjects((current) => [project, ...current.filter((item) => String(item.id) !== String(project.id))]);
      const principalDiagram = await obtenerDiagramaPrincipal(project);
      await openProject(project, true, false, principalDiagram);
      aiPlanRef.current = null;
      setAiPlan(null);
      voiceSessionRef.current = 'idle';
      setVoiceState('idle');
      const message = `Proyecto ${project.nombre || project.name || name} creado.`;
      setAiStatus('exito');
      setAiMessage(message);
      addAiHistory('diana', message);
      speakDiana(message);
      setToast(message);
    } catch (requestError) {
      aiPlanRef.current = null;
      setAiPlan(null);
      voiceSessionRef.current = 'idle';
      setVoiceState('idle');
      setAiStatus('error');
      setAiMessage(requestError.response?.data?.detail || 'No se pudo crear el proyecto.');
    }
  }
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
  // Leave ordinary nodes undefined so React Flow's global lock control can
  // disable the whole canvas. A position-locked node remains non-draggable
  // even when the canvas itself is unlocked.
  const canvasNodes = nodes.map((node) => ({ ...node, draggable: node.data.positionLocked ? false : undefined, data: { ...node.data, canManage: canUseRelations, projectName: displayedProject.nombre || displayedProject.name, relationAnchors: relationAnchorsByNode[node.id], onRelationAnchorPreview: previewRelationAnchor, onRelationAnchorCommit: commitRelationAnchor, onOpenMenu: (x, y) => openNodeMenu(node.id, x, y) } }));
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
    return { ...edge, data: { ...edge.data, sourceKind: sourceNode?.data?.kind || 'entity', targetKind: targetNode?.data?.kind || 'entity', sourceAnchor: relationAnchorPreview[edge.id]?.source || edge.data?.sourceAnchor, targetAnchor: relationAnchorPreview[edge.id]?.target || edge.data?.targetAnchor, sourceBounds: boundsFor(sourceNode), targetBounds: boundsFor(targetNode), associationClassPosition, crossings: relationJumps[edge.id] || [], highlighted: highlightedEdgeId === edge.id, canManage: canUseRelations, onOpenMenu: (x, y) => openRelationMenu(edge.id, x, y) } };
  });
  const syncIndicator = {
    local: { label: 'Borrador local', color: 'text-slate-300' },
    empty: { label: 'Diagrama aún no guardado', color: 'text-slate-300' },
    pending: { label: 'Cambios pendientes', color: 'text-amber-300' },
    saving: { label: 'Guardando diagrama…', color: 'text-amber-300' },
    saved: { label: socketStatus === 'connected' ? 'Guardado · Sync Live' : 'Guardado · Sin conexión en vivo', color: socketStatus === 'connected' ? 'text-emerald-300' : 'text-slate-300' },
    error: { label: 'Error al guardar', color: 'text-rose-300' },
  }[saveStatus];
  // El panel mantiene una firma uniforme para ediciones de atributos; el
  // segundo argumento no se usa al crear un atributo nuevo.
  const index = undefined;

  return <div className="flex h-screen min-w-[1024px] flex-col overflow-hidden bg-[#070c1a] text-slate-200">
    <header className="flex h-[70px] shrink-0 items-center gap-2 overflow-hidden border-b border-[#1d2a4a] bg-[#091124] px-3">
      <div className="flex shrink-0 items-center gap-2 border-r border-slate-700/70 pr-3"><div className="grid h-8 w-8 place-items-center rounded-xl border border-indigo-400/40 bg-indigo-500/15 text-indigo-300">◈</div><div><div className="text-sm font-bold text-white">DiagramCraft <span className="ml-1 rounded border border-indigo-400/30 bg-indigo-500/15 px-1 py-0.5 font-mono text-[9px] text-indigo-300">STUDIO</span></div><div className={`text-[9px] ${socketStatus === 'connected' ? 'text-emerald-400' : 'text-slate-400'}`}>● {socketStatus === 'connected' ? 'Sync Live' : 'Sin conexión'} · Modelo UML/JPA</div></div></div>
      <button onClick={() => setProjectsOpen(true)} className="flex shrink-0 items-center gap-2 rounded-lg border border-indigo-400/40 bg-[#111b35] px-3 py-2 text-xs font-bold text-white hover:bg-indigo-500/20"><span className="max-w-48 truncate">{displayedProject.nombre || displayedProject.name}</span><FiChevronDown className="text-indigo-300" /></button>
      <button onClick={createProject} className="flex shrink-0 items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-500"><FiPlus /> Nuevo Proyecto</button>
      <input ref={xmiInputRef} type="file" accept=".xmi,.xml,application/xml,text/xml" className="hidden" onChange={uploadXmi} />
      <div className="flex shrink-0 gap-1"><button disabled={xmiBusy || isReadOnly || !activeDiagramId} onClick={() => xmiInputRef.current?.click()} className="rounded border border-cyan-500/50 px-2 py-2 text-[10px] disabled:opacity-40">{xmiBusy ? 'XMI…' : 'Importar XMI (EA)'}</button><button disabled={xmiBusy || isReadOnly || !activeDiagramId} onClick={downloadXmi} className="rounded border border-cyan-500/50 px-2 py-2 text-[10px] disabled:opacity-40">Exportar XMI (EA)</button></div>
      <div className="ml-auto hidden min-w-0 flex-1 rounded-full border border-indigo-400/30 bg-[#0d162d] px-3 py-2 text-[10px] text-indigo-100 xl:block"><FiZap className="mr-1 inline text-indigo-400" />Voz/IA: <i>“Crea entidad Pedido con relación 1:N a Detalle”</i><span className="ml-2 rounded bg-indigo-900/60 px-1.5 py-0.5 font-mono text-[9px] text-indigo-300">Spacebar</span></div>
      <button onClick={() => setPeopleOpen(true)} title={visibleOnlineMembers.map((member) => member.usuario?.username || member.username || member.email || 'Usuario').join(', ') || 'Sin colaboradores conectados'} className="hidden shrink-0 items-center gap-2 rounded-lg border border-slate-600 bg-[#131d36] px-3 py-2 text-xs font-bold hover:bg-slate-700 lg:flex"><span className="flex -space-x-1">{visibleOnlineMembers.map((member, index) => { const user = member.usuario || member; const name = user.username || user.email || 'U'; const colors = ['bg-indigo-600', 'bg-emerald-600', 'bg-sky-500']; return <i key={user.id || name} className={`grid h-6 w-6 place-items-center rounded-full border-2 border-[#091124] ${colors[index]} text-[8px] not-italic`}>{name.slice(0, 2).toUpperCase()}</i>; })}{visibleOnlineMembers.length === 0 && <i className="grid h-6 w-6 place-items-center rounded-full border-2 border-[#091124] bg-slate-600 text-[8px] not-italic">—</i>}</span><span className="text-[9px] text-emerald-300">{onlineMembers.length}<br /><span className="text-slate-400">en línea</span></span></button>
      <div className="ml-1 flex shrink-0 gap-1"><button onClick={() => setShareOpen(true)} className="flex items-center gap-1 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-3 py-2.5 text-[11px] font-bold text-white hover:from-indigo-500 hover:to-violet-500"><FiShare2 /> Compartir / Invitar</button><button onClick={generateSpringBoot} disabled={generating || isReadOnly || !activeDiagramId} className="flex items-center gap-1 rounded-lg bg-indigo-500 px-3 py-2.5 text-[11px] font-bold text-white hover:bg-indigo-400 disabled:cursor-wait disabled:opacity-55"><FiZap className="text-yellow-200" /> {generating ? 'Generando…' : 'Generar 4 Capas'}</button><button onClick={onLogout} title="Cerrar sesión" className="rounded-lg bg-rose-600 p-2.5 text-white hover:bg-rose-500"><FiLogOut /></button></div>
    </header>
    <div className="flex min-h-0 flex-1"><div className={`relative z-20 shrink-0 transition-[width] duration-300 ${sidebarOpen ? 'w-80' : 'w-0'}`}><div className="h-full overflow-hidden"><EditorToolbar readOnly={isReadOnly} canUseRelations={canUseRelations} onlineMembers={onlineMembers} nodes={nodes} edges={edges} generating={generating} command={aiCommand} onCommandChange={setAiCommand} aiStatus={aiStatus} aiMessage={aiMessage} aiPlan={aiPlan} listening={aiStatus === 'escuchando'} onCreate={(kind) => canEdit && createNode(kind)} onRelation={(type) => canUseRelations && setRelationType(type)} onCommand={interpretAiCommand} onListen={toggleVoiceRecognition} onConfirmAi={() => applyCurrentAiPlan(aiPlan, true)} onCancelAi={cancelAi} onGenerate={generateSpringBoot} /></div><button onClick={() => setSidebarOpen((open) => !open)} title={sidebarOpen ? 'Ocultar panel' : 'Mostrar panel'} className={`absolute top-4 z-30 grid h-8 w-5 place-items-center rounded-r-md border border-l-0 border-slate-600 bg-[#17233f] text-slate-300 shadow-lg hover:bg-indigo-600 ${sidebarOpen ? '-right-5' : 'left-0'}`}>{sidebarOpen ? <FiChevronLeft /> : <FiChevronRight />}</button></div><main className="relative flex-1 bg-[#080f21]"><ReactFlow onInit={(instance) => { reactFlowRef.current = instance; }} nodes={canvasNodes} edges={canvasEdges} nodesDraggable={canEdit} nodesConnectable={canUseRelations} connectionMode={ConnectionMode.Loose} elementsSelectable={canEdit} onNodesChange={canEdit ? onNodesChange : undefined} onEdgesChange={canEdit ? onEdgesChange : undefined} onConnect={canUseRelations ? onConnect : undefined} onReconnect={canUseRelations ? reconnectRelation : undefined} onNodeClick={(event, node) => { closeRelationEditor(); setNodeMenu(null); setRelationMenu(null); selectNode(node.id); setEditorPosition({ x: event.clientX, y: event.clientY }); }} onPaneClick={() => { closeRelationEditor(); selectNode(null); setNodeMenu(null); setRelationMenu(null); }} nodeTypes={nodeTypes} edgeTypes={edgeTypes} fitView><ImportedNodeInternalsRefresher refreshToken={importLayoutRefresh} nodeIds={nodes.map((node) => node.id).join('|')} /><Background color="#52607a" gap={26} size={1.2} /><Controls className="!border-slate-700 !bg-[#101a31] !fill-slate-200" /><MiniMap className="!border !border-slate-700 !bg-[#101a31]" nodeColor="#6366f1" /></ReactFlow>{canUseRelations && <PropertiesPanel node={selectedNode} position={editorPosition} onClose={() => { selectNode(null); setEditorPosition(null); }} onUpdate={(patch) => updateNode(selectedNode.id, patch)} onAddAttribute={() => addAttribute(selectedNode.id, index)} onUpdateAttribute={(index, patch) => updateAttribute(selectedNode.id, index, patch)} onRemoveAttribute={(index) => removeAttribute(selectedNode.id, index)} onAddMethod={() => addMethod(selectedNode.id)} onUpdateMethod={(index, value) => updateMethod(selectedNode.id, index, value)} onRemoveMethod={(index) => removeMethod(selectedNode.id, index)} onDelete={() => requestDeleteNode(selectedNode.id)} />}<div className={`absolute bottom-3 left-4 rounded bg-[#101a31]/90 px-3 py-1.5 font-mono text-[10px] ${syncIndicator.color}`}>● {isReadOnly ? 'Modo solo lectura' : syncIndicator.label}</div></main></div>
    <div aria-live="polite" className="fixed right-4 top-[76px] z-30 max-w-xs rounded-lg border border-indigo-400/30 bg-[#0d162d]/95 px-3 py-2 text-[10px] text-indigo-100 shadow-lg">
      <div className="font-bold text-cyan-200">Diana · {voiceState === 'idle' ? (voiceEnabled ? 'voz preparada' : 'texto listo') : 'micrófono activo'}</div>
      {aiHistory.slice(-2).map((entry) => <p key={entry.id} className="mt-1 truncate text-slate-300"><b>{entry.role === 'diana' ? 'Diana' : 'Tú'}:</b> {entry.message}</p>)}
    </div>
    {toast && <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded bg-[#18264a] px-4 py-3">{toast}</div>}
    {generationErrors.length > 0 && <GenerationErrorDialog errors={generationErrors} onClose={() => { setGenerationErrors([]); setHighlightedEdgeId(null); }} onFocus={(issue) => { focusGenerationIssue(issue); setGenerationErrors([]); }} />}
    {isXmiDialogOpen && <XmiImportDialogBoundary onClose={closeXmiImport} onRetry={handleGenerateXmiPreview}><XmiImportConfirmation file={pendingXmiFile} mappingMode={mappingMode} preview={xmiPreview} previewError={xmiPreviewError} isPreviewing={isXmiPreviewing} isImporting={isXmiImporting} selectedIds={xmiSelectedIds} excludedIds={xmiExcludedIds} busy={xmiBusy} onClose={closeXmiImport} onConfirm={confirmXmiImport} onPreview={handleGenerateXmiPreview} onMappingMode={changeXmiMappingMode} onToggleCandidate={toggleXmiSelection} /></XmiImportDialogBoundary>}
    {xmiReport && <SafeXmiReportDialog report={xmiReport} onClose={() => setXmiReport(null)} onFocus={focusGenerationIssue} />}
    {projectsOpen && <ProjectsDialog projects={projects} activeId={activeProjectId} currentUserId={currentUser?.id} onClose={() => setProjectsOpen(false)} onNew={createProject} onOpen={openProject} onLeaveProject={leaveProject} onLeaveCollaboration={leaveCollaboration} onRefresh={() => listarProyectos().then(setProjects)} />}
    {newProjectOpen && <NewProjectDialog name={projectName} setName={(name) => { setProjectName(name); setProjectNameError(''); }} error={projectNameError} onClose={() => setNewProjectOpen(false)} onCreate={confirmCreateProject} />}
    {shareOpen && <CollaboratorsDialog project={activeProject} email={invite} setEmail={setInvite} onlineMembers={onlineMembers} acceptedMember={acceptedInvitationMember} onDismissAccepted={() => setAcceptedInvitationMember(null)} onClose={() => setShareOpen(false)} onInvite={sendInvite} onResendInvite={resendInvite} onCancelInvite={cancelInvite} onChangeRole={changeMemberRole} onRemove={removeMember} onViewCanvas={() => activeProject && openProject(activeProject)} currentUserId={currentUser?.id} canInvite={isOwner} canManage={isOwner} />}
    {peopleOpen && <PeopleDialog members={onlineMembers} project={activeProject} onClose={() => setPeopleOpen(false)} />}
    {relationType && <RelationDialog nodes={nodes} type={relationType} target={relationTarget} setTarget={setRelationTarget} onClose={() => { setRelationType(null); setRelationTarget(''); }} onCreate={(source) => { if (createRelation(relationType, source, relationTarget)) { setRelationType(null); setRelationTarget(''); } }} />}
    {pendingConnection && <ConnectionRelationDialog nodes={nodes} connection={pendingConnection} onClose={() => setPendingConnection(null)} onCreate={(type) => {
      if (createRelation(type, pendingConnection.source, pendingConnection.target)) setPendingConnection(null);
    }} />}
    {deleteCandidate && <DeleteNodeConfirmation node={deleteCandidate} relationCount={edges.filter((edge) => edge.source === deleteCandidate.id || edge.target === deleteCandidate.id).length} onClose={() => setDeleteCandidate(null)} onConfirm={() => { deleteNode(deleteCandidate.id); setDeleteCandidate(null); }} />}
    {nodeMenu && createPortal(<NodeContextMenu node={nodes.find((node) => node.id === nodeMenu.id)} position={nodeMenu} onClose={() => setNodeMenu(null)} onEdit={() => { closeRelationEditor(); selectNode(nodeMenu.id); setEditorPosition({ x: nodeMenu.x, y: nodeMenu.y }); setNodeMenu(null); }} onDuplicate={() => { duplicateNode(nodeMenu.id); setNodeMenu(null); }} onToggleLock={() => { const node = nodes.find((item) => item.id === nodeMenu.id); toggleNodeLock(nodeMenu.id, !node.data.positionLocked); setNodeMenu(null); }} onDelete={() => requestDeleteNode(nodeMenu.id)} />, document.body)}
    {relationMenu && createPortal(<AssociationRelationContextMenu edge={edges.find((edge) => edge.id === relationMenu.id)} position={relationMenu} onClose={() => setRelationMenu(null)} onCreateAssociationClass={() => { createAssociationClass(relationMenu.id); setRelationMenu(null); }} onUnlinkAssociationClass={() => { unlinkAssociationClass(relationMenu.id); setRelationMenu(null); }} onDelete={() => { deleteRelation(relationMenu.id); setRelationMenu(null); }} />, document.body)}
  </div>;
}

function State({ message, detail, action, error, children }) { return <div className={`grid h-screen place-items-center bg-[#070c1a] p-6 text-center ${error ? 'text-rose-300' : 'text-slate-200'}`}><div><h1 className="text-xl font-bold text-white">{message}</h1>{detail && <p className="mt-2 text-slate-400">{detail}</p>}{action && <button onClick={action} className="mt-5 rounded-lg bg-indigo-600 px-4 py-3 font-bold"><FiPlus className="mr-1 inline" /> Crear proyecto</button>}{children}</div></div>; }
function GenerationErrorDialog({ errors, onClose, onFocus }) {
  useEscapeClose(true, onClose);
  return <div className="fixed inset-0 z-[10001] grid place-items-center bg-slate-950/60 p-5" onMouseDown={onClose}><section role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()} className="max-h-[80vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-rose-400/50 bg-[#101a31] p-5 shadow-2xl"><header className="flex items-start justify-between gap-4"><div><h2 className="text-lg font-extrabold text-rose-200">No se pudo generar el proyecto</h2><p className="mt-1 text-sm text-slate-400">Corrige los elementos indicados y vuelve a intentarlo.</p></div><button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-white">×</button></header><ul className="mt-4 space-y-2">{errors.map((issue, index) => { const canFocus = Boolean(issue.node_id || issue.edge_id || issue.element_id); return <li key={`${issue.message}-${index}`} role={canFocus ? 'button' : undefined} tabIndex={canFocus ? 0 : undefined} onClick={() => canFocus && onFocus(issue)} onKeyDown={(event) => { if (canFocus && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); onFocus(issue); } }} className={`rounded-lg border border-slate-700 bg-[#091124] p-3 ${canFocus ? 'cursor-pointer hover:border-cyan-400/70 hover:bg-cyan-400/5' : ''}`}><p className="text-sm text-slate-100">{issue.message}</p>{issue.field && <small className="mt-1 block font-mono text-slate-400">{issue.field}</small>}{canFocus && <small className="mt-2 block text-xs font-bold text-cyan-300">Clic para ver el elemento en el diagrama</small>}</li>; })}</ul><button onClick={onClose} className="mt-5 w-full rounded-lg border border-slate-600 py-2 font-bold text-slate-200 hover:bg-slate-700">Cerrar</button></section></div>;
}
class XmiImportDialogBoundary extends Component {
  constructor(props) { super(props); this.state = { failed: false }; }
  static getDerivedStateFromError() { return { failed: true }; }
  retry = () => { this.setState({ failed: false }); this.props.onRetry?.(); };
  render() {
    if (!this.state.failed) return this.props.children;
    return <div role="dialog" aria-modal="true" className="fixed inset-0 z-[90] grid place-items-center bg-black/70 p-4"><section className="w-full max-w-md rounded-2xl border border-rose-400/40 bg-[#101a31] p-5 shadow-2xl"><h2 className="text-lg font-bold text-white">No se pudo mostrar la importación XMI</h2><p className="mt-2 text-sm text-slate-300">El editor continúa seguro. Puedes reintentar la previsualización o cerrar este diálogo.</p><div className="mt-5 flex justify-end gap-3"><button onClick={this.props.onClose} className="rounded border border-slate-600 px-3 py-2">Cerrar</button><button onClick={this.retry} className="rounded bg-cyan-600 px-3 py-2 font-bold text-white">Reintentar</button></div></section></div>;
  }
}

function SafeXmiReportDialog({ report: inputReport, onClose, onFocus }) {
  const source = inputReport && typeof inputReport === 'object' ? inputReport : {};
  const normalizeIssue = (issue) => ({
    ...(issue && typeof issue === 'object' ? issue : {}),
    message: xmiText(issue, 'No se pudo procesar el XMI.'),
  });
  const report = {
    ...source,
    dialect: xmiText(source.dialect, 'No especificado'),
    xmi_version: xmiText(source.xmi_version, 'No especificada'),
    exporter: xmiText(source.exporter, 'Desconocido'),
    imported: { nodes: xmiCount(source.imported?.nodes), edges: xmiCount(source.imported?.edges) },
    errors: xmiList(source.errors).map(normalizeIssue),
    warnings: xmiList(source.warnings).map((warning) => xmiText(warning, 'Advertencia de importación XMI.')).filter(Boolean),
  };
  return <XmiReportDialog report={report} onClose={onClose} onFocus={onFocus} />;
}

function XmiImportConfirmation({ file: inputFile, mappingMode, preview: suppliedPreview, previewError, isPreviewing, isImporting, selectedIds, excludedIds, busy, onClose, onConfirm, onPreview, onMappingMode, onToggleCandidate, onRetry = onPreview }) {
  useEscapeClose(!busy, onClose);
  const file = inputFile || { name: 'Sin archivo seleccionado', size: 0 };
  const state = { phase: isImporting ? 'importing' : isPreviewing ? 'previewing' : suppliedPreview ? 'previewReady' : previewError ? 'error' : 'idle', mappingMode, preview: suppliedPreview, selectedIds, excludedIds, error: previewError };
  const rawPreview = suppliedPreview && typeof suppliedPreview === 'object' ? suppliedPreview : null;
  const report = rawPreview?.report && typeof rawPreview.report === 'object' ? rawPreview.report : {};
  const rawMapping = report.mapping && typeof report.mapping === 'object' ? report.mapping : {};
  // The API may return an array of nodes/edges in its preview. JSX must show
  // the count, never the raw objects ({ id, type, position, data, attrs }).
  const preview = rawPreview ? {
    ...rawPreview,
    nodes: xmiCount(rawPreview.nodes ?? report.imported?.nodes),
    edges: xmiCount(rawPreview.edges ?? report.imported?.edges),
  } : null;
  const mapping = {
    ...rawMapping,
    candidates: xmiList(rawMapping.candidates),
    entities: xmiList(rawMapping.entities),
    classes: xmiList(rawMapping.classes),
    excluded: xmiList(rawMapping.excluded),
    warnings: xmiList(rawMapping.warnings),
  };
  const entityIds = new Set(xmiList(mapping.entities).map((item) => String(item?.xmi_id || item?.xmiId || item?.id || '')));
  const excluded = xmiList(mapping.excluded);
  const candidates = xmiList(mapping.candidates).map((candidate) => {
    const sourceCandidate = candidate && typeof candidate === 'object' ? candidate : {};
    const xmiId = String(sourceCandidate.xmi_id || sourceCandidate.xmiId || sourceCandidate.id || '');
    const excludedInfo = excluded.find((item) => String(item?.xmi_id || item?.xmiId || item?.id || '') === xmiId);
    return {
      ...sourceCandidate,
      xmi_id: xmiId,
      name: xmiText(sourceCandidate.name, xmiId),
      evidence: xmiList(sourceCandidate.evidence).map((item) => xmiText(item)).filter(Boolean),
      default_entity: entityIds.has(xmiId),
      technical: Boolean(sourceCandidate.technical || excludedInfo?.reason === 'technical_table'),
    };
  });
  const classes = xmiList(mapping.classes);
  const warnings = [...xmiList(report.warnings), ...xmiList(mapping.warnings)]
    .map((warning) => xmiText(warning, 'Advertencia de importación XMI.'))
    .filter(Boolean);
  const phaseLabel = state.phase === 'previewing' ? 'Analizando XMI…' : state.phase === 'importing' ? 'Importando…' : '';
  const canImport = state.phase === 'previewReady' && !busy;
  const modes = [
    ['class', 'Clases Java UML', 'Conserva el XMI como diseño UML. Genera código Java normal; no crea persistencia JPA.'],
    ['entity', 'Entidades JPA para tablas de negocio', 'El backend propone clases elegibles con identificador confiable. Puedes desmarcar las que deben seguir como Class Java.'],
    ['auto', 'Detectar automáticamente', 'El backend usa PK/id, FK, asociaciones o metadatos XMI. Si hay duda, conserva Class Java.'],
  ];
  if (!preview) return <div role="dialog" aria-modal="true" className="fixed inset-0 z-[90] grid place-items-center bg-black/70 p-4"><section className="w-full max-w-xl rounded-2xl border border-cyan-400/40 bg-[#101a31] p-5 shadow-2xl"><header className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-bold text-white">Importar XMI (EA)</h2><p className="mt-1 text-sm text-slate-300">{inputFile ? `${file.name} · ${(file.size / 1024).toFixed(1)} KB` : 'Selecciona un archivo XMI o XML.'}</p></div><button type="button" disabled={busy || isImporting} onClick={onClose} className="rounded border border-slate-600 px-2 py-1 disabled:opacity-40">×</button></header><fieldset disabled={isPreviewing || isImporting || !inputFile} className="mt-5"><legend className="mb-2 font-semibold text-white">Importar clases como:</legend>{modes.map(([value, title, copy]) => <label key={value} className="mb-2 flex cursor-pointer gap-3 rounded-lg border border-slate-700 bg-[#091124] p-3"><input type="radio" name="xmi-mapping-mode" checked={mappingMode === value} onChange={() => onMappingMode(value)} /><span><b className="block text-sm text-slate-100">{title}</b><span className="mt-1 block text-xs text-slate-400">{copy}</span></span></label>)}</fieldset>{isPreviewing && <p className="mt-4 rounded border border-cyan-400/30 bg-cyan-950/30 p-3 text-sm text-cyan-100">Analizando XMI…</p>}{previewError && <p className="mt-4 rounded border border-rose-400/30 bg-rose-950/30 p-3 text-sm text-rose-100">{previewError}</p>}{!inputFile && !previewError && <p className="mt-4 text-sm text-slate-400">Selecciona un archivo y genera la previsualización.</p>}<div className="mt-6 flex justify-end gap-3"><button type="button" disabled={busy || isImporting} onClick={onClose} className="rounded-lg border border-slate-600 px-4 py-2 disabled:opacity-40">Cancelar</button><button type="button" disabled={isPreviewing || isImporting} onClick={onPreview} className="rounded-lg bg-cyan-600 px-4 py-2 font-bold text-white disabled:opacity-40">{isPreviewing ? 'Analizando…' : 'Generar previsualización'}</button></div></section></div>;
  return <div role="dialog" aria-modal="true" className="fixed inset-0 z-[90] grid place-items-center bg-black/70 p-4"><section className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-cyan-400/40 bg-[#101a31] p-5 shadow-2xl"><header className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-bold text-white">Importar XMI (EA)</h2><p className="mt-1 text-sm text-slate-300"><b>{file.name}</b> · {(file.size / 1024).toFixed(1)} KB</p></div><button disabled={busy} onClick={onClose} className="rounded border border-slate-600 px-2 py-1 disabled:opacity-40">×</button></header><fieldset disabled={['previewing', 'importing'].includes(state.phase)} className="mt-5"><legend className="mb-2 font-semibold text-white">Importar clases como:</legend><div className="space-y-2">{modes.map(([value, title, copy]) => <label key={value} className="flex cursor-pointer gap-3 rounded-lg border border-slate-700 bg-[#091124] p-3"><input type="radio" name="xmi-mapping-mode" value={value} checked={state.mappingMode === value} onChange={() => onMappingMode(value)} /><span><b className="block text-sm text-slate-100">{title}</b><span className="mt-1 block text-xs text-slate-400">{copy}</span></span></label>)}</div></fieldset>{phaseLabel && <p className="mt-4 rounded border border-cyan-400/30 bg-cyan-950/30 p-3 text-sm text-cyan-100">{phaseLabel}</p>}{state.error && <div className="mt-4 rounded border border-rose-400/30 bg-rose-950/30 p-3 text-sm text-rose-100"><p>{state.error}</p><button onClick={onRetry} className="mt-2 rounded border border-rose-300/40 px-2 py-1 text-xs">Reintentar análisis</button></div>}{state.phase === 'previewReady' && <><section className="mt-5 rounded-lg border border-slate-700 bg-[#091124] p-3"><h3 className="font-semibold text-white">Previsualización del backend</h3><dl className="mt-3 grid grid-cols-2 gap-2 text-xs"><div><dt className="text-slate-400">Nodos detectados</dt><dd>{preview.nodes ?? report.imported?.nodes ?? 0}</dd></div><div><dt className="text-slate-400">Relaciones detectadas</dt><dd>{preview.edges ?? report.imported?.edges ?? 0}</dd></div><div><dt className="text-slate-400">Entity propuestas</dt><dd>{(mapping.entities || []).length}</dd></div><div><dt className="text-slate-400">Class Java</dt><dd>{classes.length}</dd></div><div><dt className="text-slate-400">Interfaces</dt><dd>{classes.filter((item) => item?.kind === 'interface').length}</dd></div><div><dt className="text-slate-400">Relaciones JPA propuestas</dt><dd>No disponible en la previsualización.</dd></div></dl>{(report.dialect || report.xmi_version || report.exporter) && <p className="mt-3 text-xs text-slate-400">{[report.dialect, report.xmi_version, report.exporter].filter(Boolean).join(' · ')}</p>}</section>{candidates.length > 0 && <section className="mt-4"><h3 className="font-semibold text-white">Candidatos a Entity</h3><div className="mt-2 space-y-2">{candidates.map((candidate) => { const checked = state.selectedIds.includes(candidate.xmi_id); const disabled = candidate.kind === 'interface' || !candidate.has_identifier || candidate.technical; return <label key={candidate.xmi_id} className={`block rounded-lg border p-3 ${disabled ? 'border-slate-800 bg-slate-900/50 opacity-75' : 'border-slate-700 bg-[#091124]'}`}><div className="flex gap-3"><input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onToggleCandidate(candidate, event.target.checked)} /><span className="min-w-0"><b className="block text-sm text-slate-100">{candidate.name || candidate.xmi_id}</b><span className="block font-mono text-[10px] text-slate-500">{candidate.xmi_id}</span>{candidate.technical ? <span className="mt-1 block text-xs text-amber-200">Tabla técnica de Django: no se recomienda convertir automáticamente.</span> : candidate.kind === 'interface' ? <span className="mt-1 block text-xs text-slate-400">Las interfaces no pueden convertirse en Entity.</span> : !candidate.has_identifier ? <span className="mt-1 block text-xs text-slate-400">Sin identificador confiable: se mantiene como Class Java.</span> : <span className="mt-1 block text-xs text-cyan-100">{checked ? 'Se generará @Entity y podrá crear tabla, repositorio, servicio y controlador.' : 'Se generará código Java normal; no crea tabla ni persistencia JPA.'}</span>}{candidate.evidence?.length > 0 && <span className="mt-1 block text-xs text-slate-400">Evidencia: {candidate.evidence.join(', ')}</span>}</span></div></label>; })}</div></section>}{excluded.filter((item) => item?.reason === 'technical_table').length > 0 && <p className="mt-3 text-xs text-amber-200">Se excluyeron tablas técnicas de Django.</p>}{warnings.length > 0 && <ul className="mt-4 space-y-1 rounded border border-amber-400/25 bg-amber-950/20 p-3 text-xs text-amber-100">{warnings.map((warning, index) => <li key={index}>{typeof warning === 'string' ? warning : warning.message}</li>)}</ul>}</>}<p className="mt-5 text-sm text-amber-200">El modo reemplazar sustituirá el diagrama actual solo después de confirmar esta importación.</p><div className="mt-6 flex justify-end gap-3"><button disabled={busy || state.phase === 'importing'} onClick={onClose} className="rounded-lg border border-slate-600 px-4 py-2 disabled:opacity-40">Cancelar</button><button disabled={!canImport} onClick={onConfirm} className="rounded-lg bg-cyan-600 px-4 py-2 font-bold text-white disabled:opacity-40">{state.phase === 'importing' ? 'Importando…' : 'Importar definitivamente'}</button></div></section></div>;
}
function XmiReportDialog({ report, onClose, onFocus }) { useEscapeClose(Boolean(report), onClose); const errors = report.errors || []; const warnings = report.warnings || []; return <div role="dialog" aria-modal="true" className="fixed inset-0 z-[90] grid place-items-center bg-black/70 p-4"><section className="w-full max-w-lg rounded-2xl border border-cyan-400/40 bg-[#101a31] p-5 shadow-2xl"><div className="flex items-center justify-between"><h2 className="text-lg font-bold text-white">{report.error ? 'No se pudo procesar el XMI' : 'Reporte de compatibilidad XMI'}</h2><button onClick={onClose}><FiX /></button></div>{report.error ? <ul className="mt-4 space-y-2 text-sm text-rose-200">{errors.map((issue, index) => <li key={`${issue.message}-${index}`} className="rounded border border-rose-400/30 p-2"><div>{issue.message}</div>{(issue.node_id || issue.edge_id || issue.element_id) && <button onClick={() => onFocus(issue)} className="mt-1 text-cyan-300 underline">Ver elemento en el diagrama</button>}</li>)}</ul> : <><dl className="mt-4 grid grid-cols-2 gap-2 text-sm"><div><dt className="text-slate-400">Dialecto</dt><dd>{report.dialect || 'No especificado'}</dd></div><div><dt className="text-slate-400">Versión</dt><dd>{report.xmi_version || 'No especificada'}</dd></div><div><dt className="text-slate-400">Exporter</dt><dd>{report.exporter || 'Desconocido'}</dd></div><div><dt className="text-slate-400">Importados</dt><dd>{report.imported?.nodes || 0} nodos, {report.imported?.edges || 0} relaciones</dd></div></dl>{warnings.length > 0 && <ul className="mt-4 space-y-1 text-sm text-amber-200">{warnings.map((warning, index) => <li key={index}>{typeof warning === 'string' ? warning : warning.message}</li>)}</ul>}</>}<div className="mt-5 flex justify-end"><button onClick={onClose} className="rounded-lg border border-slate-600 px-4 py-2">Cerrar</button></div></section></div>; }
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
  const [menuPosition, setMenuPosition] = useState(position);
  const dragRef = useRef(null);
  if (!edge) return null;
  if (edge.data?.relationType !== 'asociacion') return <RelationContextMenu position={position} onClose={onClose} onDelete={onDelete} />;
  const linked = Boolean(edge.data?.associationClassNodeId);
  const canLinkAssociationClass = canUseAssociationClass(edge);
  const startDrag = (event) => {
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = { x: event.clientX - menuPosition.x, y: event.clientY - menuPosition.y };
    const onMove = (moveEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      setMenuPosition({
        x: Math.max(8, Math.min(moveEvent.clientX - drag.x, window.innerWidth - 272)),
        y: Math.max(8, Math.min(moveEvent.clientY - drag.y, window.innerHeight - 150)),
      });
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };
  return <div className="fixed inset-0 z-[10000]" onMouseDown={onClose}>
    <section role="menu" onMouseDown={(event) => event.stopPropagation()} style={{ left: Math.min(menuPosition.x, window.innerWidth - 280), top: Math.min(menuPosition.y, window.innerHeight - 180) }} className="fixed w-64 rounded-xl border border-slate-500/45 bg-[#2a344f] p-2 shadow-2xl">
      <div onMouseDown={startDrag} className="cursor-move rounded-lg px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-400 hover:bg-slate-600/50">Relación · arrastra para mover</div>
      {!linked && canLinkAssociationClass && <button onClick={onCreateAssociationClass} className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-sm font-bold text-cyan-100 hover:bg-slate-600/50">Vincular clase de asociación</button>}
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
