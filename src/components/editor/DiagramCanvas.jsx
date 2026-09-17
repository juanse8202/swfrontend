import { useCallback, useEffect, useRef, useState } from 'react';
import ReactFlow, { Background, Controls, MiniMap } from 'reactflow';
import 'reactflow/dist/style.css';
import { FiChevronDown, FiChevronLeft, FiChevronRight, FiDownload, FiLogOut, FiPlus, FiShare2, FiUpload, FiX, FiZap } from 'react-icons/fi';
import ClassNode from './ClassNode';
import RelationEdge from './RelationEdge';
import EditorToolbar from './EditorToolbar';
import PropertiesPanel from './PropertiesPanel';
import ProjectsDialog from './ProjectsDialog';
import NewProjectDialog from './NewProjectDialog';
import PeopleDialog from './PeopleDialog';
import CollaboratorsDialog from '../collaboration/CollaboratorsDialog';
import useDiagramStore, { createStarterDiagram, setDiagramMutationListener } from '../../stores/diagramStore';
import { actualizarRolMiembro, contenidoDiagrama, crearDiagramaPrincipal, crearProyecto, eliminarColaborador, guardarDiagrama, invitarProyecto, listarProyectos, obtenerDiagramaPrincipal } from '../../api/diagramApi';
import { obtenerSesion } from '../../api/authApi';
import { useDiagramSocket } from '../../hooks/useDiagramSocket';

const nodeTypes = { umlClass: ClassNode };
const edgeTypes = { relationEdge: RelationEdge };
const principalDraftKey = 'diagramcraft-principal-draft';

function loadPrincipalDraft() {
  try { return JSON.parse(window.sessionStorage.getItem(principalDraftKey)) || createStarterDiagram(); } catch { return createStarterDiagram(); }
}

export default function DiagramCanvas({ onLogout }) {
  const store = useDiagramStore();
  const { nodes, edges, selectedNodeId, onNodesChange: applyNodesChange, onEdgesChange: applyEdgesChange, onConnect: applyConnect, selectNode, createNode: addNode, createRelation: addRelation, updateNode: patchNode, addAttribute: appendAttribute, updateAttribute: patchAttribute, removeAttribute: deleteAttribute, deleteNode: removeNode, restore } = store;
  const [projects, setProjects] = useState([]);
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [activeDiagramId, setActiveDiagramId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [projectsOpen, setProjectsOpen] = useState(false);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [shareOpen, setShareOpen] = useState(false);
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [invite, setInvite] = useState('');
  const [relationType, setRelationType] = useState(null);
  const [relationTarget, setRelationTarget] = useState('');
  const [toast, setToast] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [saveStatus, setSaveStatus] = useState('local');
  const [currentUser, setCurrentUser] = useState(null);
  const [onlineMembers, setOnlineMembers] = useState([]);
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

  const onSocketMessage = useCallback((event) => {
    if (event?.type === 'presence.update') {
      setOnlineMembers(Array.isArray(event.miembros) ? event.miembros : Array.isArray(event.members) ? event.members : Array.isArray(event.users) ? event.users : []);
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
      restore({ nodes: event.nodes, edges: event.edges }, { preserveSelection: true });
      diagramStateRef.current = { nodes: event.nodes, edges: event.edges };
      hasPendingChangesRef.current = false;
      setSaveStatus('saved');
    }
  }, [restore]);
  const { status: socketStatus, send: sendSocketEvent } = useDiagramSocket(activeDiagramId, onSocketMessage);

  useEffect(() => {
    if (socketStatus === 'connected' && activeDiagramId) sendSocketEvent({ type: 'presence.join', diagram_id: activeDiagramId });
  }, [activeDiagramId, sendSocketEvent, socketStatus]);

  async function persistPendingChanges() {
    if (!diagramLoadedRef.current || !activeProjectRef.current || !hasPendingChangesRef.current) return;
    if (savingRef.current) { saveQueuedRef.current = true; return; }
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
    } catch (requestError) {
      setSaveStatus('error');
      setToast(requestError.response?.data?.detail || 'No se pudo guardar el diagrama.');
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
  const onNodesChange = (changes) => { applyNodesChange(changes); scheduleCurrentSave(); };
  const onEdgesChange = (changes) => { applyEdgesChange(changes); scheduleCurrentSave(); };
  const onConnect = (connection) => { applyConnect(connection); scheduleCurrentSave(); };
  const createNode = (...args) => { const node = addNode(...args); scheduleCurrentSave(); return node; };
  const createRelation = (...args) => { const created = addRelation(...args); if (created) scheduleCurrentSave(); return created; };
  const updateNode = (...args) => { patchNode(...args); scheduleCurrentSave(); };
  const addAttribute = (...args) => { appendAttribute(...args); scheduleCurrentSave(); };
  const updateAttribute = (...args) => { patchAttribute(...args); scheduleCurrentSave(); };
  const removeAttribute = (...args) => { deleteAttribute(...args); scheduleCurrentSave(); };
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
      const diagram = forceEmpty ? null : await obtenerDiagramaPrincipal(project);
      restore(diagram ? contenidoDiagrama(diagram) : { nodes: [], edges: [] });
      diagramStateRef.current = useDiagramStore.getState();
      hasPendingChangesRef.current = false;
      activeProjectRef.current = project.id;
      activeDiagramRef.current = diagram?.id || null;
      diagramLoadedRef.current = true;
      setActiveProjectId(project.id);
      setActiveDiagramId(diagram?.id || null);
      setSaveStatus(diagram ? 'saved' : 'empty');
      window.sessionStorage.setItem('diagramcraft-active-project', String(project.id));
      if (closeDialog) setProjectsOpen(false);
      if (!diagram) setToast(`El proyecto “${project.nombre || project.name}” aún no tiene un diagrama principal.`);
    } catch (requestError) {
      setToast(requestError.response?.data?.detail || 'No se pudo cargar el diagrama principal.');
    }
  // persistPendingChanges solo opera sobre refs; restore es la única dependencia reactiva.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restore]);

  useEffect(() => {
    let mounted = true;
    listarProyectos().then((items) => {
      if (!mounted) return;
      setProjects(items);
      setLoading(false);
      const savedProjectId = window.sessionStorage.getItem('diagramcraft-active-project');
      const savedProject = items.find((project) => String(project.id) === savedProjectId);
      if (savedProject) openProject(savedProject, false);
      else restore(loadPrincipalDraft());
    }).catch((requestError) => {
      if (!mounted) return;
      setError(requestError.response?.data?.detail || 'No se pudieron cargar tus proyectos.');
      setLoading(false);
    });
    return () => { mounted = false; };
  }, [openProject, restore]);

  useEffect(() => { obtenerSesion().then((session) => setCurrentUser(session?.user || session)).catch(() => setCurrentUser(null)); }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(''), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  const activeProject = projects.find((project) => project.id === activeProjectId);
  const currentMember = activeProject?.miembros?.find((member) => String(member.usuario?.id) === String(currentUser?.id));
  const currentRole = currentMember?.rol;
  const isOwner = currentRole === 'propietario' || String(activeProject?.propietario?.id || activeProject?.owner?.id) === String(currentUser?.id);
  // Fuera de un proyecto se permite el borrador local. Dentro de un proyecto,
  // solo los roles explícitos del backend habilitan edición.
  const canEdit = !activeProject || isOwner || ['propietario', 'arquitecto', 'editor'].includes(currentRole);
  const isReadOnly = Boolean(activeProject && !canEdit);
  const canUseRelations = !activeProject || isOwner || ['propietario', 'arquitecto'].includes(currentRole);
  useEffect(() => { canEditRef.current = canEdit; }, [canEdit]);
  const selectedNode = nodes.find((node) => node.id === selectedNodeId);
  const createProject = () => { setProjectName(''); setNewProjectOpen(true); };
  const leaveProject = async () => { clearTimeout(saveTimerRef.current); await persistPendingChanges(); window.sessionStorage.removeItem('diagramcraft-active-project'); diagramLoadedRef.current = false; activeProjectRef.current = null; activeDiagramRef.current = null; hasPendingChangesRef.current = false; setActiveProjectId(null); setActiveDiagramId(null); setSaveStatus('local'); restore(loadPrincipalDraft()); setProjectsOpen(false); setToast('Volviste al lienzo principal.'); };
  const confirmCreateProject = async () => {
    if (!projectName.trim()) return;
    try {
      const project = await crearProyecto(projectName.trim());
      setProjects((current) => [project, ...current]);
      setNewProjectOpen(false);
      await openProject(project, true, true);
      setToast(`Proyecto “${project.nombre || project.name}” creado.`);
    } catch (requestError) {
      setToast(requestError.response?.data?.detail || 'No se pudo crear el proyecto.');
    }
  };
  const sendInvite = async (rol) => {
    if (!invite.trim()) return;
    if (!activeProject) { setToast('Crea o selecciona un proyecto antes de invitar colaboradores.'); return; }
    try {
      await invitarProyecto(activeProject.id, invite.trim(), rol);
      setInvite(''); setShareOpen(false); setToast('Invitación enviada.');
    } catch (requestError) {
      setToast(requestError.response?.data?.detail || 'No se pudo enviar la invitación.');
    }
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

  if (loading) return <State message="Cargando proyectos…" />;
  if (error) return <State message={error} error />;
  const displayedProject = activeProject || { name: 'Sin proyecto' };
  const visibleOnlineMembers = onlineMembers.slice(0, 3);
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
      <div className="ml-1 flex shrink-0 gap-1"><button onClick={() => setShareOpen(true)} className="flex items-center gap-1 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-3 py-2.5 text-[11px] font-bold text-white hover:from-indigo-500 hover:to-violet-500"><FiShare2 /> Compartir / Invitar</button><button onClick={() => setToast('Importación XMI disponible al conectar la persistencia del diagrama.')} className="flex items-center gap-1 rounded-lg border border-slate-600 bg-[#131d36] px-2.5 py-2.5 text-[11px] font-medium hover:bg-slate-700"><FiUpload /> Importar</button><button onClick={() => setToast('Exportación XMI disponible al conectar la persistencia del diagrama.')} className="flex items-center gap-1 rounded-lg border border-slate-600 bg-[#131d36] px-2.5 py-2.5 text-[11px] font-medium hover:bg-slate-700"><FiDownload /> XMI (EA)</button><button onClick={() => setToast('Generador de 4 capas listo para los nodos del diagrama.')} className="flex items-center gap-1 rounded-lg bg-indigo-500 px-3 py-2.5 text-[11px] font-bold text-white hover:bg-indigo-400"><FiZap className="text-yellow-200" /> Generar 4 Capas</button><button onClick={onLogout} title="Cerrar sesión" className="rounded-lg bg-rose-600 p-2.5 text-white hover:bg-rose-500"><FiLogOut /></button></div>
    </header>
    <div className="flex min-h-0 flex-1"><div className={`relative z-20 shrink-0 transition-[width] duration-300 ${sidebarOpen ? 'w-80' : 'w-0'}`}><div className="h-full overflow-hidden"><EditorToolbar readOnly={isReadOnly} canUseRelations={canUseRelations} onlineMembers={onlineMembers} nodes={nodes} edges={edges} onCreate={(kind) => canEdit && createNode(kind)} onRelation={(type) => canUseRelations && setRelationType(type)} onCommand={() => {}} onListen={() => {}} onGenerate={() => {}} /></div><button onClick={() => setSidebarOpen((open) => !open)} title={sidebarOpen ? 'Ocultar panel' : 'Mostrar panel'} className={`absolute top-4 z-30 grid h-8 w-5 place-items-center rounded-r-md border border-l-0 border-slate-600 bg-[#17233f] text-slate-300 shadow-lg hover:bg-indigo-600 ${sidebarOpen ? '-right-5' : 'left-0'}`}>{sidebarOpen ? <FiChevronLeft /> : <FiChevronRight />}</button></div><main className="relative flex-1 bg-[#080f21]"><ReactFlow nodes={nodes} edges={edges} nodesDraggable={canEdit} nodesConnectable={canUseRelations} elementsSelectable={canEdit} onNodesChange={canEdit ? onNodesChange : undefined} onEdgesChange={canEdit ? onEdgesChange : undefined} onConnect={canUseRelations ? onConnect : undefined} onNodeClick={(_, node) => selectNode(node.id)} onPaneClick={() => selectNode(null)} nodeTypes={nodeTypes} edgeTypes={edgeTypes} fitView><Background color="#52607a" gap={26} size={1.2} /><Controls className="!border-slate-700 !bg-[#101a31] !fill-slate-200" /><MiniMap className="!border !border-slate-700 !bg-[#101a31]" nodeColor="#6366f1" /></ReactFlow>{canEdit && <PropertiesPanel node={selectedNode} onClose={() => selectNode(null)} onUpdate={(patch) => updateNode(selectedNode.id, patch)} onAddAttribute={() => addAttribute(selectedNode.id)} onUpdateAttribute={(index, patch) => updateAttribute(selectedNode.id, index, patch)} onRemoveAttribute={(index) => removeAttribute(selectedNode.id, index)} onDelete={() => deleteNode(selectedNode.id)} />}<div className={`absolute bottom-3 left-4 rounded bg-[#101a31]/90 px-3 py-1.5 font-mono text-[10px] ${syncIndicator.color}`}>● {isReadOnly ? 'Modo solo lectura' : syncIndicator.label}</div></main></div>
    {toast && <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded bg-[#18264a] px-4 py-3">{toast}</div>}
    {projectsOpen && <ProjectsDialog projects={projects} activeId={activeProjectId} onClose={() => setProjectsOpen(false)} onNew={createProject} onOpen={openProject} onDuplicate={() => setToast('La duplicación se administra en el backend.')} onLeaveProject={leaveProject} />}
    {newProjectOpen && <NewProjectDialog name={projectName} setName={setProjectName} onClose={() => setNewProjectOpen(false)} onCreate={confirmCreateProject} />}
    {shareOpen && <CollaboratorsDialog project={activeProject} email={invite} setEmail={setInvite} onClose={() => setShareOpen(false)} onInvite={sendInvite} onChangeRole={changeMemberRole} onRemove={removeMember} currentUserId={currentUser?.id} canInvite={isOwner} canManage={isOwner} />}
    {peopleOpen && <PeopleDialog members={onlineMembers} project={activeProject} onClose={() => setPeopleOpen(false)} />}
    {relationType && <RelationDialog nodes={nodes} type={relationType} target={relationTarget} setTarget={setRelationTarget} onClose={() => { setRelationType(null); setRelationTarget(''); }} onCreate={(source) => { if (createRelation(relationType, source, relationTarget)) { setRelationType(null); setRelationTarget(''); } }} />}
  </div>;
}

function State({ message, detail, action, error, children }) { return <div className={`grid h-screen place-items-center bg-[#070c1a] p-6 text-center ${error ? 'text-rose-300' : 'text-slate-200'}`}><div><h1 className="text-xl font-bold text-white">{message}</h1>{detail && <p className="mt-2 text-slate-400">{detail}</p>}{action && <button onClick={action} className="mt-5 rounded-lg bg-indigo-600 px-4 py-3 font-bold"><FiPlus className="mr-1 inline" /> Crear proyecto</button>}{children}</div></div>; }
function RelationDialog({ nodes, type, target, setTarget, onClose, onCreate }) { const [source, setSource] = useState(nodes[0]?.id || ''); return <Modal title="Crear relación JPA" onClose={onClose}><select value={source} onChange={(event) => setSource(event.target.value)} className="w-full rounded bg-slate-800 p-2">{nodes.map((node) => <option key={node.id} value={node.id}>{node.data.title}</option>)}</select><select value={target} onChange={(event) => setTarget(event.target.value)} className="mt-3 w-full rounded bg-slate-800 p-2"><option value="">Destino</option>{nodes.map((node) => <option key={node.id} value={node.id}>{node.data.title}</option>)}</select><button onClick={() => onCreate(source)} className="mt-4 w-full rounded bg-indigo-600 p-2">Crear {type}</button></Modal>; }
function Modal({ title, children, onClose }) { return <div className="fixed inset-0 z-40 grid place-items-center bg-black/70 p-4"><section className="w-full max-w-md rounded-xl bg-[#101a31] p-6"><div className="mb-5 flex justify-between"><h2 className="font-bold">{title}</h2><button onClick={onClose}><FiX /></button></div>{children}</section></div>; }
