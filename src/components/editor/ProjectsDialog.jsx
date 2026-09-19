import { useCallback, useEffect, useMemo, useState } from 'react';
import { FiAlertTriangle, FiArchive, FiCheck, FiClock, FiCopy, FiDownload, FiFileText, FiFolder, FiInfo, FiLogOut, FiMoreVertical, FiPlus, FiSearch, FiTrash2, FiUsers, FiX } from 'react-icons/fi';
import { aceptarInvitacion, archivarProyecto, contenidoDiagrama, duplicarProyecto, eliminarProyecto, listarInvitacionesPendientes, listarProyectos, obtenerDiagramaPrincipal, rechazarInvitacion, restaurarProyecto } from '../../api/diagramApi';

const tabs = [['all', 'Todos'], ['recent', 'Recientes'], ['mine', 'Mis proyectos'], ['shared', 'Compartidos'], ['templates', 'Plantillas'], ['trash', 'Papelera']];
const projectName = (project) => project?.nombre || project?.name || 'Proyecto sin nombre';
const dateOf = (project) => new Date(project?.updated_at || project?.actualizado_en || project?.created_at || 0).getTime();
const countNodes = (project) => project?.total_entidades || 0;
const countEdges = (project) => project?.total_relaciones || 0;
const invitationProject = (invitation) => invitation.proyecto || invitation.project || invitation;
const invitationId = (invitation) => invitation.invitacion_id || invitation.invitation_id || invitation.id;

export default function ProjectsDialog({ projects, activeId, currentUserId, onClose, onNew, onOpen, onLeaveProject, onLeaveCollaboration, onRefresh }) {
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState('all');
  const [sort, setSort] = useState('recent');
  const [listedProjects, setListedProjects] = useState(projects);
  const [pendingInvites, setPendingInvites] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [archiveCandidate, setArchiveCandidate] = useState(null);
  const [menuProject, setMenuProject] = useState(null);
  const [infoProject, setInfoProject] = useState(null);
  const [leaveCandidate, setLeaveCandidate] = useState(null);

  const reloadPending = async () => {
    const invitations = await listarInvitacionesPendientes();
    setPendingInvites(invitations);
  };
  const reloadList = useCallback(async (selectedTab = tab) => {
    setLoading(true);
    try {
      const options = selectedTab === 'trash' ? { archivados: true } : { filtro: selectedTab };
      setListedProjects(await listarProyectos(options));
    } catch (error) { setMessage(error.response?.data?.detail || 'No se pudieron cargar los proyectos.'); }
    finally { setLoading(false); }
  }, [tab]);
  useEffect(() => {
    const timer = window.setTimeout(() => { reloadPending().catch(() => setMessage('No se pudieron cargar las invitaciones pendientes.')); }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => { reloadList(tab); }, 0);
    return () => window.clearTimeout(timer);
  }, [reloadList, tab]);

  const visibleProjects = useMemo(() => {
    const value = query.trim().toLowerCase();
    return listedProjects.filter((project) => !value || projectName(project).toLowerCase().includes(value)).sort((a, b) => sort === 'name' ? projectName(a).localeCompare(projectName(b)) : dateOf(b) - dateOf(a));
  }, [listedProjects, query, sort]);
  const refreshEverything = async () => { await Promise.all([reloadList(), reloadPending()]); await onRefresh?.(); };
  const accept = async (invitation) => {
    try { const result = await aceptarInvitacion(invitationId(invitation)); setPendingInvites((items) => items.filter((item) => invitationId(item) !== invitationId(invitation))); await onRefresh?.(); const project = result?.proyecto || result?.project; if (project?.id) onOpen(project); else await reloadList(); }
    catch (error) { setMessage(error.response?.data?.detail || 'No se pudo aceptar la invitación.'); }
  };
  const reject = async (invitation) => {
    try { await rechazarInvitacion(invitationId(invitation)); setPendingInvites((items) => items.filter((item) => invitationId(item) !== invitationId(invitation))); }
    catch (error) { setMessage(error.response?.data?.detail || 'No se pudo rechazar la invitación.'); }
  };
  const duplicate = async (project) => {
    try { await duplicarProyecto(project.id); await refreshEverything(); setMessage('Proyecto duplicado.'); }
    catch (error) { setMessage(error.response?.data?.detail || 'No se pudo duplicar el proyecto.'); }
  };
  const archive = async (project) => {
    try { await archivarProyecto(project.id); await refreshEverything(); setMessage('Proyecto movido a la papelera.'); }
    catch (error) { setMessage(error.response?.data?.detail || 'No se pudo archivar el proyecto.'); }
  };
  const restore = async (project) => {
    try { await restaurarProyecto(project.id); await reloadList('trash'); await onRefresh?.(); setMessage('Proyecto recuperado de la papelera.'); }
    catch (error) { setMessage(error.response?.data?.detail || 'No se pudo recuperar el proyecto.'); }
  };
  const remove = async (project) => {
    if (!window.confirm(`¿Eliminar definitivamente “${projectName(project)}”? Esta acción no se puede deshacer.`)) return;
    try { await eliminarProyecto(project.id); await reloadList(); await onRefresh?.(); setMessage('Proyecto eliminado definitivamente.'); }
    catch (error) { setMessage(error.response?.data?.detail || 'No se pudo eliminar el proyecto.'); }
  };
  const downloadSchema = async (project) => {
    try {
      const diagram = await obtenerDiagramaPrincipal(project);
      const content = contenidoDiagrama(diagram);
      const escapeXml = (value) => String(value ?? '').replace(/[<>&"']/g, (character) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[character]));
      const nodes = (content.nodes || []).map((node) => `  <entity id="${escapeXml(node.id)}" name="${escapeXml(node.data?.title)}" />`).join('\n');
      const edges = (content.edges || []).map((edge) => `  <relationship source="${escapeXml(edge.source)}" target="${escapeXml(edge.target)}" type="${escapeXml(edge.data?.label)}" />`).join('\n');
      const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<diagramcraft-project id="${escapeXml(project.id)}" name="${escapeXml(projectName(project))}">\n${nodes}\n${edges}\n</diagramcraft-project>\n`;
      const url = URL.createObjectURL(new Blob([xml], { type: 'application/xml' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `${projectName(project).replace(/[^a-z0-9-_]+/gi, '_') || 'proyecto'}.xml`;
      link.click();
      URL.revokeObjectURL(url);
      setMessage('Esquema XML descargado.');
    } catch (error) { setMessage(error.response?.data?.detail || 'No se pudo descargar el esquema del proyecto.'); }
  };

  return <div className="fixed inset-0 z-40 grid place-items-center bg-[#030715]/80 p-4 backdrop-blur-sm"><section className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-indigo-400/45 bg-[#0d1830] shadow-2xl shadow-indigo-950/50">
    <header className="flex items-center justify-between border-b border-slate-700/80 px-6 py-5"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl border border-indigo-400/40 bg-indigo-500/15 text-indigo-300"><FiClock /></span><div><div className="flex items-center gap-2"><h2 className="text-lg font-bold text-white">Historial de Proyectos</h2><span className="rounded-full bg-indigo-500/20 px-2 py-1 text-[10px] font-bold text-indigo-200">DiagramCraft Cloud</span></div><p className="text-sm text-slate-400">Explora, abre o gestiona tus diagramas y esquemas JPA en DiagramCraft Studio.</p></div></div><div className="flex items-center gap-3"><button onClick={onNew} className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2.5 text-sm font-bold text-white"><FiPlus /> Nuevo Proyecto</button><button onClick={onClose} className="rounded p-2 text-slate-400 hover:bg-slate-700"><FiX /></button></div></header>
    <div className="flex flex-wrap items-center gap-3 border-b border-slate-700/80 px-6 py-3"><div className="flex min-w-52 flex-1 items-center gap-2 rounded-lg border border-slate-600 bg-[#091329] px-3"><FiSearch className="text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre o entidad..." className="w-full bg-transparent py-2 text-sm outline-none placeholder:text-slate-500" /></div><div className="flex max-w-full gap-1 overflow-x-auto">{tabs.map(([key, label]) => <button key={key} onClick={() => setTab(key)} className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-bold ${tab === key ? 'bg-indigo-600 text-white' : 'bg-[#17233f] text-slate-300 hover:bg-slate-700'}`}>{label}{key === 'shared' && pendingInvites.length ? <span className="ml-1 rounded bg-amber-400/25 px-1.5 py-0.5 text-amber-200">{pendingInvites.length}</span> : null}</button>)}</div><select value={sort} onChange={(event) => setSort(event.target.value)} className="rounded-lg border border-slate-600 bg-[#17233f] px-3 py-2 text-xs text-slate-200"><option value="recent">Última edición</option><option value="name">Nombre</option></select></div>
    <main className="min-h-0 flex-1 space-y-5 overflow-auto p-6">{message && <p className="rounded-lg border border-indigo-400/30 bg-indigo-500/10 p-3 text-xs text-indigo-100">{message}</p>}{pendingInvites.length > 0 && tab !== 'trash' && <section><div className="mb-3 flex items-center justify-between border-b border-indigo-400/25 pb-3"><h3 className="flex items-center gap-2 font-bold text-amber-200"><span className="h-2.5 w-2.5 rounded-full bg-amber-400" /> Invitaciones pendientes <span className="rounded-full bg-amber-400/20 px-2 py-0.5 text-xs">{pendingInvites.length} nuevas</span></h3><span className="text-xs text-slate-400">Colaboración en tiempo real</span></div><div className="space-y-3">{pendingInvites.map((invitation) => <InvitationCard key={invitationId(invitation)} invitation={invitation} onAccept={() => accept(invitation)} onReject={() => reject(invitation)} />)}</div></section>}{pendingInvites.length > 0 && visibleProjects.length > 0 && <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-widest text-slate-500"><i className="h-px flex-1 bg-slate-700" /> Proyectos <i className="h-px flex-1 bg-slate-700" /></div>}<section className="space-y-3">{loading ? <p className="p-8 text-center text-sm text-slate-400">Cargando proyectos...</p> : visibleProjects.map((project) => <ProjectCard key={project.id} project={project} active={project.id === activeId} trash={tab === 'trash'} currentUserId={currentUserId} onOpen={() => onOpen(project)} onDuplicate={() => duplicate(project)} onArchive={() => setArchiveCandidate(project)} onRestore={() => restore(project)} onRemove={() => remove(project)} onToggleMenu={() => { const rect = document.activeElement?.getBoundingClientRect(); setMenuProject((current) => current?.project?.id === project.id ? null : { project, anchor: { right: rect?.right || window.innerWidth - 24, bottom: rect?.bottom || 100 } }); }} />)}{!loading && visibleProjects.length === 0 && <div className="rounded-xl border border-dashed border-slate-600 p-10 text-center text-sm text-slate-400">No hay proyectos para este filtro.</div>}</section></main>
    <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-700/80 px-6 py-4 text-xs text-slate-400"><span><b className="text-emerald-300">●</b> {listedProjects.length} proyectos disponibles · Sincronización en la nube activa</span><div className="flex items-center gap-4"><button onClick={() => setTab('trash')} className="flex items-center gap-1 hover:text-white"><FiArchive /> Papelera / Archivados</button>{activeId && <button onClick={onLeaveProject} className="rounded border border-slate-600 px-3 py-1.5 font-bold text-slate-200">Salir del proyecto</button>}</div></footer>
    {archiveCandidate && <ArchiveConfirmation project={archiveCandidate} onClose={() => setArchiveCandidate(null)} onConfirm={async () => { await archive(archiveCandidate); setArchiveCandidate(null); }} />}
    {menuProject && <CollaboratorActions project={menuProject.project} anchor={menuProject.anchor} onClose={() => setMenuProject(null)} onInfo={() => { setInfoProject(menuProject.project); setMenuProject(null); }} onDownload={() => { downloadSchema(menuProject.project); setMenuProject(null); }} onLeave={() => { setLeaveCandidate(menuProject.project); setMenuProject(null); }} />}
    {infoProject && <ProjectInfo project={infoProject} onClose={() => setInfoProject(null)} />}
    {leaveCandidate && <LeaveConfirmation project={leaveCandidate} onClose={() => setLeaveCandidate(null)} onConfirm={async () => { await onLeaveCollaboration?.(leaveCandidate); setLeaveCandidate(null); }} />}
  </section></div>;
}

function ArchiveConfirmation({ project, onClose, onConfirm }) {
  const [confirmed, setConfirmed] = useState(true);
  return <div className="fixed inset-0 z-[70] grid place-items-center bg-[#020617]/75 p-4 backdrop-blur-sm"><section className="w-full max-w-md overflow-hidden rounded-2xl border border-rose-400/55 bg-[#101a31] shadow-2xl shadow-rose-950/40"><header className="flex items-start gap-3 p-5"><span className="grid h-10 w-10 place-items-center rounded-xl border border-rose-400/40 bg-rose-500/15 text-rose-300"><FiAlertTriangle /></span><div className="min-w-0 flex-1"><span className="rounded bg-rose-500/15 px-2 py-1 font-mono text-[9px] font-bold uppercase tracking-wide text-rose-300">Acción destructiva</span><h3 className="mt-2 text-lg font-bold text-white">¿Eliminar proyecto?</h3><p className="truncate font-mono text-xs text-slate-300">“{projectName(project)}”</p></div><button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-700"><FiX /></button></header><div className="space-y-4 px-5 pb-5"><p className="text-xs leading-5 text-slate-300">Esta acción moverá el proyecto a la papelera durante 30 días antes de su eliminación permanente. Sus entidades JPA, relaciones y configuraciones se archivarán.</p><div className="rounded-xl border border-slate-700 bg-[#0b1529] p-3"><div className="mb-3 flex justify-between font-mono text-[10px] uppercase tracking-wide text-slate-400"><span>Impacto del proyecto</span><span className="text-rose-300">Afectará generación</span></div><div className="grid grid-cols-3 gap-2"><Impact value={countNodes(project)} label="Entidades JPA" /><Impact value={countEdges(project)} label="Relaciones" /><Impact value={project.miembros?.length || 0} label="Colaboradores" /></div></div><label className="flex cursor-pointer items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="h-4 w-4 accent-rose-500" /> Mover a la papelera (recuperable antes de 30 días)</label></div><footer className="flex justify-end gap-3 border-t border-slate-700 px-5 py-3"><button onClick={onClose} className="rounded-lg border border-slate-600 px-4 py-2 text-xs font-bold text-slate-200 hover:bg-slate-700">Cancelar</button><button disabled={!confirmed} onClick={onConfirm} className="flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-500 disabled:opacity-40"><FiTrash2 /> Sí, mover a papelera</button></footer></section></div>;
}

function Impact({ value, label }) { return <div className="rounded-lg bg-[#172544] p-2 text-center"><b className="block text-base text-indigo-200">{value}</b><span className="text-[9px] text-slate-400">{label}</span></div>; }

function InvitationCard({ invitation, onAccept, onReject }) {
  const project = invitationProject(invitation); const owner = invitation.invitador || invitation.invited_by || project.propietario || project.owner; const role = invitation.rol_invitacion || invitation.role || invitation.rol;
  return <article className="flex flex-wrap items-center gap-4 rounded-xl border border-violet-400/65 bg-[#121b3b] p-4"><span className="grid h-11 w-11 place-items-center rounded-xl bg-violet-500/25 text-violet-200"><FiUsers /></span><div className="min-w-48 flex-1"><div className="flex items-center gap-2"><h3 className="font-bold text-white">{projectName(project)}</h3><span className="rounded-full bg-amber-400/15 px-2 py-1 text-[10px] text-amber-200">Invitación pendiente</span></div><p className="mt-1 text-xs text-slate-400">Invitado por <b className="text-slate-200">{owner?.username || owner?.email || owner?.nombre || 'un colaborador'}</b>{role ? ` · Rol: ${role}` : ''}</p><p className="mt-2 flex gap-3 text-xs text-slate-400"><span><FiFileText className="mr-1 inline" />{countNodes(project)} Entidades</span><span>⌁ {countEdges(project)} Relaciones</span></p></div><div className="flex gap-2"><button onClick={onReject} className="rounded-lg border border-slate-600 px-3 py-2 text-xs font-bold text-slate-300">Rechazar</button><button onClick={onAccept} className="flex items-center gap-1 rounded-lg bg-gradient-to-r from-indigo-600 to-violet-600 px-3 py-2 text-xs font-bold text-white"><FiCheck /> Aceptar y abrir</button></div></article>;
}

function ProjectCard({ project, active, trash, currentUserId, onOpen, onDuplicate, onArchive, onRestore, onRemove, onToggleMenu }) {
  const owner = project.propietario || project.owner;
  const isOwner = String(owner?.id) === String(currentUserId);
  const isCollaborator = !trash && !isOwner && (project.miembros || []).some((member) => String(member.usuario?.id) === String(currentUserId));
  return <article className={`flex flex-wrap items-center gap-4 rounded-xl border p-4 ${active ? 'border-indigo-400 bg-indigo-500/10' : isCollaborator ? 'border-cyan-400/35 bg-cyan-500/[0.04]' : 'border-slate-700 bg-[#0b1529]'}`}><span className={`grid h-11 w-11 place-items-center rounded-xl ${isCollaborator ? 'bg-cyan-500/20 text-cyan-200' : 'bg-indigo-600/30 text-indigo-200'}`}><FiFolder /></span><div className="min-w-48 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-bold text-white">{projectName(project)}</h3>{isCollaborator && <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-[10px] font-bold text-emerald-300">● Colaborador activo</span>}{active && <span className="rounded-full bg-emerald-500/15 px-2 py-1 text-[10px] text-emerald-300">● Activo en lienzo</span>}{project.is_template && <span className="rounded-full bg-cyan-400/15 px-2 py-1 text-[10px] text-cyan-200">Plantilla</span>}</div><p className="mt-1 font-mono text-[11px] text-slate-400">Spring Boot 3.2 · JPA Hibernate</p>{owner && <p className="mt-1 text-xs text-slate-400">{isCollaborator ? 'Propietario' : 'Dueño'}: {owner.username || owner.email || owner.nombre}</p>}<p className="mt-2 flex gap-3 text-xs text-slate-400"><span><FiFileText className="mr-1 inline" />{countNodes(project)} Entidades</span><span>⌁ {countEdges(project)} Relaciones</span></p></div><div className="flex items-center gap-2">{trash ? <><button onClick={onRestore} className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white"><FiCheck /> Recuperar</button><button onClick={onRemove} className="flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white"><FiTrash2 /> Eliminar</button></> : <><button onClick={onDuplicate} title="Duplicar" className="rounded-lg border border-slate-600 p-2.5 hover:bg-slate-700"><FiCopy /></button><button onClick={onOpen} className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-bold">Abrir</button>{isCollaborator ? <button onClick={onToggleMenu} aria-label="Opciones del proyecto compartido" className="rounded-lg border border-indigo-400/45 bg-indigo-500/10 p-2.5 text-indigo-200 hover:bg-indigo-500/20"><FiMoreVertical /></button> : <button onClick={onArchive} title="Mover a papelera" className="rounded-lg border border-slate-600 p-2.5 hover:bg-slate-700"><FiArchive /></button>}</>}</div></article>;
}

function CollaboratorActions({ project, anchor, onClose, onInfo, onDownload, onLeave }) {
  return <section style={{ left: anchor.right, top: anchor.bottom, transform: 'translateX(-100%)' }} className="fixed z-[70] mt-2 w-72 overflow-hidden rounded-xl border border-indigo-400/45 bg-[#101a31] shadow-2xl shadow-black/45"><header className="flex items-center justify-between border-b border-slate-700 px-4 py-3"><div><h3 className="text-sm font-bold text-white">Opciones del proyecto</h3><p className="mt-0.5 max-w-52 truncate text-[10px] text-slate-400">{projectName(project)}</p></div><button onClick={onClose} aria-label="Cerrar" className="rounded p-1 text-slate-400 hover:bg-slate-700 hover:text-white"><FiX /></button></header><div className="space-y-1 p-2"><button onClick={onInfo} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs text-slate-200 hover:bg-slate-700"><FiInfo className="text-indigo-300" /> Ver información del proyecto</button><button onClick={onDownload} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs text-slate-200 hover:bg-slate-700"><FiDownload className="text-slate-300" /> Descargar esquema (.xml)</button><div className="my-1 border-t border-slate-700" /><button onClick={onLeave} className="flex w-full items-center gap-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2.5 text-left text-xs font-bold text-rose-300 hover:bg-rose-500/20"><FiLogOut /> Abandonar proyecto</button><p className="px-3 pb-1 pt-1 text-[9px] text-slate-500">El propietario conservará el proyecto y sus diagramas.</p></div></section>;
}

function ProjectInfo({ project, onClose }) {
  const owner = project.propietario || project.owner;
  return <div className="fixed inset-0 z-[70] grid place-items-center bg-[#020617]/75 p-4 backdrop-blur-sm"><section className="w-full max-w-md rounded-2xl border border-indigo-400/45 bg-[#101a31] p-5 shadow-2xl"><div className="flex items-start gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-500/15 text-indigo-200"><FiInfo /></span><div className="min-w-0 flex-1"><h3 className="font-bold text-white">Información del proyecto</h3><p className="mt-1 text-sm text-slate-300">{projectName(project)}</p></div><button onClick={onClose} className="text-slate-400 hover:text-white"><FiX /></button></div><dl className="mt-5 space-y-3 rounded-xl border border-slate-700 bg-[#0b1529] p-4 text-xs"><div className="flex justify-between gap-3"><dt className="text-slate-400">Propietario</dt><dd className="text-right text-slate-100">{owner?.username || owner?.email || 'No disponible'}</dd></div><div className="flex justify-between"><dt className="text-slate-400">Entidades</dt><dd>{countNodes(project)}</dd></div><div className="flex justify-between"><dt className="text-slate-400">Relaciones</dt><dd>{countEdges(project)}</dd></div></dl><button onClick={onClose} className="mt-5 w-full rounded-lg bg-slate-700 px-4 py-2 text-xs font-bold text-white hover:bg-slate-600">Entendido</button></section></div>;
}

function LeaveConfirmation({ project, onClose, onConfirm }) {
  return <div className="fixed inset-0 z-[70] grid place-items-center bg-[#020617]/75 p-4 backdrop-blur-sm"><section className="w-full max-w-md rounded-2xl border border-rose-400/55 bg-[#101a31] p-5 shadow-2xl shadow-rose-950/40"><div className="flex items-start gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl border border-rose-400/40 bg-rose-500/15 text-rose-300"><FiAlertTriangle /></span><div className="min-w-0 flex-1"><h3 className="font-bold text-white">¿Deseas abandonar el proyecto?</h3><p className="mt-1 text-xs text-rose-300">Confirmación de desvinculación</p></div><button onClick={onClose} className="text-slate-400 hover:text-white"><FiX /></button></div><p className="mt-5 text-sm leading-6 text-slate-200">Perderás el acceso al lienzo y sincronización de <b>“{projectName(project)}”</b>. Para volver deberás recibir una nueva invitación del propietario.</p><div className="mt-6 flex justify-end gap-3"><button onClick={onClose} className="rounded-lg border border-slate-600 px-4 py-2 text-xs font-bold text-slate-200">Cancelar</button><button onClick={onConfirm} className="flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-500"><FiLogOut /> Sí, abandonar proyecto</button></div></section></div>;
}
