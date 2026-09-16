import { useCallback, useEffect, useRef, useState } from 'react';
import ReactFlow, { Background, Controls, MiniMap } from 'reactflow';
import 'reactflow/dist/style.css';
import { FiChevronDown, FiChevronLeft, FiChevronRight, FiDownload, FiLogOut, FiPlus, FiShare2, FiUpload, FiUsers, FiX, FiZap } from 'react-icons/fi';
import ClassNode from './ClassNode';
import RelationEdge from './RelationEdge';
import EditorToolbar from './EditorToolbar';
import PropertiesPanel from './PropertiesPanel';
import ProjectsDialog from './ProjectsDialog';
import NewProjectDialog from './NewProjectDialog';
import useDiagramStore, { createStarterDiagram } from '../../stores/diagramStore';
import { contenidoDiagrama, crearDiagramaPrincipal, crearProyecto, guardarDiagrama, invitarProyecto, listarProyectos, obtenerDiagramaPrincipal } from '../../api/diagramApi';
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
  const [invite, setInvite] = useState('');
  const [relationType, setRelationType] = useState(null);
  const [relationTarget, setRelationTarget] = useState('');
  const [toast, setToast] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const savingRef = useRef(false);
  const saveTimerRef = useRef(null);
  const saveQueuedRef = useRef(false);
  const diagramLoadedRef = useRef(false);
  const activeProjectRef = useRef(activeProjectId);
  const activeDiagramRef = useRef(activeDiagramId);
  const diagramStateRef = useRef({ nodes, edges });

  function scheduleSave() {
    if (!diagramLoadedRef.current || !activeProjectRef.current) return;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      if (savingRef.current) { saveQueuedRef.current = true; return; }
      savingRef.current = true;
      const contenido = diagramStateRef.current;
      try {
        if (activeDiagramRef.current) {
          await guardarDiagrama(activeDiagramRef.current, contenido);
        } else {
          const diagram = await crearDiagramaPrincipal(activeProjectRef.current, contenido);
          activeDiagramRef.current = diagram.id;
          setActiveDiagramId(diagram.id);
        }
      } catch (requestError) {
        setToast(requestError.response?.data?.detail || 'No se pudo guardar el diagrama.');
      } finally {
        savingRef.current = false;
        if (saveQueuedRef.current) { saveQueuedRef.current = false; scheduleSave(); }
      }
    }, 700);
  }

  function scheduleCurrentSave() {
    const current = useDiagramStore.getState();
    diagramStateRef.current = { nodes: current.nodes, edges: current.edges };
    if (!activeProjectRef.current) {
      window.sessionStorage.setItem(principalDraftKey, JSON.stringify(diagramStateRef.current));
      return;
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

  const openProject = useCallback(async (project, closeDialog = true) => {
    try {
      diagramLoadedRef.current = false;
      clearTimeout(saveTimerRef.current);
      const diagram = await obtenerDiagramaPrincipal(project);
      restore(diagram ? contenidoDiagrama(diagram) : createStarterDiagram());
      diagramStateRef.current = useDiagramStore.getState();
      activeProjectRef.current = project.id;
      activeDiagramRef.current = diagram?.id || null;
      diagramLoadedRef.current = true;
      setActiveProjectId(project.id);
      setActiveDiagramId(diagram?.id || null);
      window.sessionStorage.setItem('diagramcraft-active-project', String(project.id));
      if (closeDialog) setProjectsOpen(false);
      if (!diagram) setToast(`El proyecto “${project.nombre || project.name}” aún no tiene un diagrama principal.`);
    } catch (requestError) {
      setToast(requestError.response?.data?.detail || 'No se pudo cargar el diagrama principal.');
    }
  }, [restore]);

  const onSocketMessage = useCallback((event) => {
    const diagram = contenidoDiagrama(event);
    if (diagram.nodes || diagram.edges) restore(diagram);
  }, [restore]);
  const { status: socketStatus } = useDiagramSocket(activeDiagramId, onSocketMessage);

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

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(''), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  const activeProject = projects.find((project) => project.id === activeProjectId);
  const selectedNode = nodes.find((node) => node.id === selectedNodeId);
  const createProject = () => { setProjectName(''); setNewProjectOpen(true); };
  const leaveProject = () => { window.sessionStorage.removeItem('diagramcraft-active-project'); clearTimeout(saveTimerRef.current); diagramLoadedRef.current = false; activeProjectRef.current = null; activeDiagramRef.current = null; setActiveProjectId(null); setActiveDiagramId(null); restore(loadPrincipalDraft()); setProjectsOpen(false); setToast('Volviste al lienzo principal.'); };
  const confirmCreateProject = async () => {
    if (!projectName.trim()) return;
    try {
      const project = await crearProyecto(projectName.trim());
      setProjects((current) => [project, ...current]);
      setNewProjectOpen(false);
      await openProject(project);
      setToast(`Proyecto “${project.nombre || project.name}” creado.`);
    } catch (requestError) {
      setToast(requestError.response?.data?.detail || 'No se pudo crear el proyecto.');
    }
  };
  const sendInvite = async () => {
    if (!invite.trim()) return;
    if (!activeProject) { setToast('Crea o selecciona un proyecto antes de invitar colaboradores.'); return; }
    try {
      await invitarProyecto(activeProject.id, invite.trim());
      setInvite(''); setShareOpen(false); setToast('Invitación enviada.');
    } catch (requestError) {
      setToast(requestError.response?.data?.detail || 'No se pudo enviar la invitación.');
    }
  };

  if (loading) return <State message="Cargando proyectos…" />;
  if (error) return <State message={error} error />;
  const displayedProject = activeProject || { name: 'Sin proyecto' };

  return <div className="flex h-screen min-w-[1024px] flex-col overflow-hidden bg-[#070c1a] text-slate-200">
    <header className="flex h-[70px] shrink-0 items-center gap-2 overflow-hidden border-b border-[#1d2a4a] bg-[#091124] px-3">
      <div className="flex shrink-0 items-center gap-2 border-r border-slate-700/70 pr-3"><div className="grid h-8 w-8 place-items-center rounded-xl border border-indigo-400/40 bg-indigo-500/15 text-indigo-300">◈</div><div><div className="text-sm font-bold text-white">DiagramCraft <span className="ml-1 rounded border border-indigo-400/30 bg-indigo-500/15 px-1 py-0.5 font-mono text-[9px] text-indigo-300">STUDIO</span></div><div className={`text-[9px] ${socketStatus === 'connected' ? 'text-emerald-400' : 'text-slate-400'}`}>● {socketStatus === 'connected' ? 'Sync Live' : 'Sin conexión'} · Modelo UML/JPA</div></div></div>
      <button onClick={() => setProjectsOpen(true)} className="flex shrink-0 items-center gap-2 rounded-lg border border-indigo-400/40 bg-[#111b35] px-3 py-2 text-xs font-bold text-white hover:bg-indigo-500/20"><span className="max-w-48 truncate">{displayedProject.nombre || displayedProject.name}</span><FiChevronDown className="text-indigo-300" /></button>
      <button onClick={createProject} className="flex shrink-0 items-center gap-1 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-500"><FiPlus /> Nuevo Proyecto</button>
      <div className="ml-auto hidden min-w-0 flex-1 rounded-full border border-indigo-400/30 bg-[#0d162d] px-3 py-2 text-[10px] text-indigo-100 xl:block"><FiZap className="mr-1 inline text-indigo-400" />Voz/IA: <i>“Crea entidad Pedido con relación 1:N a Detalle”</i><span className="ml-2 rounded bg-indigo-900/60 px-1.5 py-0.5 font-mono text-[9px] text-indigo-300">Spacebar</span></div>
      <button className="hidden shrink-0 items-center gap-2 rounded-lg border border-slate-600 bg-[#131d36] px-3 py-2 text-xs font-bold hover:bg-slate-700 lg:flex"><span className="flex -space-x-1"><i className="grid h-6 w-6 place-items-center rounded-full border-2 border-[#091124] bg-indigo-600 text-[8px] not-italic">KR</i><i className="grid h-6 w-6 place-items-center rounded-full border-2 border-[#091124] bg-emerald-600 text-[8px] not-italic">IM</i><i className="grid h-6 w-6 place-items-center rounded-full border-2 border-[#091124] bg-sky-500 text-[8px] not-italic">TÚ</i></span><span className="text-[9px] text-emerald-300">3<br /><span className="text-slate-400">en línea</span></span></button>
      <div className="ml-1 flex shrink-0 gap-1"><button onClick={() => setShareOpen(true)} className="flex items-center gap-1 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-3 py-2.5 text-[11px] font-bold text-white hover:from-indigo-500 hover:to-violet-500"><FiShare2 /> Compartir / Invitar</button><button onClick={() => setToast('Importación XMI disponible al conectar la persistencia del diagrama.')} className="flex items-center gap-1 rounded-lg border border-slate-600 bg-[#131d36] px-2.5 py-2.5 text-[11px] font-medium hover:bg-slate-700"><FiUpload /> Importar</button><button onClick={() => setToast('Exportación XMI disponible al conectar la persistencia del diagrama.')} className="flex items-center gap-1 rounded-lg border border-slate-600 bg-[#131d36] px-2.5 py-2.5 text-[11px] font-medium hover:bg-slate-700"><FiDownload /> XMI (EA)</button><button onClick={() => setToast('Generador de 4 capas listo para los nodos del diagrama.')} className="flex items-center gap-1 rounded-lg bg-indigo-500 px-3 py-2.5 text-[11px] font-bold text-white hover:bg-indigo-400"><FiZap className="text-yellow-200" /> Generar 4 Capas</button><button onClick={onLogout} title="Cerrar sesión" className="rounded-lg bg-rose-600 p-2.5 text-white hover:bg-rose-500"><FiLogOut /></button></div>
    </header>
    <div className="flex min-h-0 flex-1"><div className={`relative z-20 shrink-0 transition-[width] duration-300 ${sidebarOpen ? 'w-80' : 'w-0'}`}><div className="h-full overflow-hidden"><EditorToolbar nodes={nodes} edges={edges} onCreate={(kind) => createNode(kind)} onRelation={setRelationType} onCommand={() => {}} onListen={() => {}} onGenerate={() => {}} /></div><button onClick={() => setSidebarOpen((open) => !open)} title={sidebarOpen ? 'Ocultar panel' : 'Mostrar panel'} className={`absolute top-4 z-30 grid h-8 w-5 place-items-center rounded-r-md border border-l-0 border-slate-600 bg-[#17233f] text-slate-300 shadow-lg hover:bg-indigo-600 ${sidebarOpen ? '-right-5' : 'left-0'}`}>{sidebarOpen ? <FiChevronLeft /> : <FiChevronRight />}</button></div><main className="relative flex-1 bg-[#080f21]"><ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} onNodeClick={(_, node) => selectNode(node.id)} onPaneClick={() => selectNode(null)} nodeTypes={nodeTypes} edgeTypes={edgeTypes} fitView><Background color="#52607a" gap={26} size={1.2} /><Controls className="!border-slate-700 !bg-[#101a31] !fill-slate-200" /><MiniMap className="!border !border-slate-700 !bg-[#101a31]" nodeColor="#6366f1" /></ReactFlow><PropertiesPanel node={selectedNode} onClose={() => selectNode(null)} onUpdate={(patch) => updateNode(selectedNode.id, patch)} onAddAttribute={() => addAttribute(selectedNode.id)} onUpdateAttribute={(index, patch) => updateAttribute(selectedNode.id, index, patch)} onRemoveAttribute={(index) => removeAttribute(selectedNode.id, index)} onDelete={() => deleteNode(selectedNode.id)} /><div className="absolute bottom-3 left-4 rounded bg-[#101a31]/90 px-3 py-1.5 font-mono text-[10px] text-emerald-300">● Diagrama sincronizado</div></main></div>
    {toast && <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded bg-[#18264a] px-4 py-3">{toast}</div>}
    {projectsOpen && <ProjectsDialog projects={projects} activeId={activeProjectId} onClose={() => setProjectsOpen(false)} onNew={createProject} onOpen={openProject} onDuplicate={() => setToast('La duplicación se administra en el backend.')} onLeaveProject={leaveProject} />}
    {newProjectOpen && <NewProjectDialog name={projectName} setName={setProjectName} onClose={() => setNewProjectOpen(false)} onCreate={confirmCreateProject} />}
    {shareOpen && <ShareDialog invite={invite} setInvite={setInvite} onClose={() => setShareOpen(false)} onInvite={sendInvite} />}
    {relationType && <RelationDialog nodes={nodes} type={relationType} target={relationTarget} setTarget={setRelationTarget} onClose={() => { setRelationType(null); setRelationTarget(''); }} onCreate={(source) => { if (createRelation(relationType, source, relationTarget)) { setRelationType(null); setRelationTarget(''); } }} />}
  </div>;
}

function State({ message, detail, action, error, children }) { return <div className={`grid h-screen place-items-center bg-[#070c1a] p-6 text-center ${error ? 'text-rose-300' : 'text-slate-200'}`}><div><h1 className="text-xl font-bold text-white">{message}</h1>{detail && <p className="mt-2 text-slate-400">{detail}</p>}{action && <button onClick={action} className="mt-5 rounded-lg bg-indigo-600 px-4 py-3 font-bold"><FiPlus className="mr-1 inline" /> Crear proyecto</button>}{children}</div></div>; }
function RelationDialog({ nodes, type, target, setTarget, onClose, onCreate }) { const [source, setSource] = useState(nodes[0]?.id || ''); return <Modal title="Crear relación JPA" onClose={onClose}><select value={source} onChange={(event) => setSource(event.target.value)} className="w-full rounded bg-slate-800 p-2">{nodes.map((node) => <option key={node.id} value={node.id}>{node.data.title}</option>)}</select><select value={target} onChange={(event) => setTarget(event.target.value)} className="mt-3 w-full rounded bg-slate-800 p-2"><option value="">Destino</option>{nodes.map((node) => <option key={node.id} value={node.id}>{node.data.title}</option>)}</select><button onClick={() => onCreate(source)} className="mt-4 w-full rounded bg-indigo-600 p-2">Crear {type}</button></Modal>; }
function ShareDialog({ invite, setInvite, onClose, onInvite }) { return <Modal title="Invitar al proyecto" onClose={onClose}><label className="text-sm">Correo del colaborador<input value={invite} onChange={(event) => setInvite(event.target.value)} placeholder="equipo@empresa.com" className="mt-2 w-full rounded border border-slate-600 bg-[#080f20] p-3" /></label><button onClick={onInvite} className="mt-4 flex w-full items-center justify-center gap-2 rounded bg-indigo-600 p-3 font-bold"><FiUsers /> Enviar invitación</button></Modal>; }
function Modal({ title, children, onClose }) { return <div className="fixed inset-0 z-40 grid place-items-center bg-black/70 p-4"><section className="w-full max-w-md rounded-xl bg-[#101a31] p-6"><div className="mb-5 flex justify-between"><h2 className="font-bold">{title}</h2><button onClick={onClose}><FiX /></button></div>{children}</section></div>; }
