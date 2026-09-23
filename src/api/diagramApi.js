import api from './axios';

const list = (payload) => (Array.isArray(payload) ? payload : payload?.results || []);
const projectIdOf = (project) => (typeof project === 'object' ? project?.id : project);
const belongsToProject = (diagram, proyectoId) => {
  // El endpoint ya filtra por proyecto. La comprobación adicional solo se
  // aplica cuando el serializer expone `proyecto`.
  if (diagram?.proyecto === undefined || diagram.proyecto === null) return true;
  return String(projectIdOf(diagram.proyecto)) === String(proyectoId);
};

export async function listarProyectos({ filtro, archivados } = {}) {
  const params = {};
  if (filtro && filtro !== 'all') params.filtro = filtro;
  if (archivados) params.archivados = 'true';
  const { data } = await api.get('/proyectos/proyectos/', { params });
  return list(data).map((project) => ({ ...project, name: project.nombre || project.name }));
}

export async function crearProyecto(nombre) {
  const { data } = await api.post('/proyectos/proyectos/', { nombre });
  return { ...data, name: data.nombre || data.name };
}

export async function listarDiagramas(proyectoId) {
  // Con api.baseURL = <host>/api, esto genera GET
  // <host>/api/diagramas/diagramas/?proyecto=<id>.
  const { data } = await api.get('/diagramas/diagramas/', { params: { proyecto: proyectoId } });
  return list(data).filter((diagram) => belongsToProject(diagram, proyectoId));
}

export async function crearDiagramaPrincipal(proyectoId, contenido) {
  const { data } = await api.post('/diagramas/diagramas/', {
    proyecto: proyectoId,
    nombre: 'Diagrama principal',
    es_principal: true,
    nodes: contenido.nodes || [],
    edges: contenido.edges || [],
  });
  return data;
}

export async function guardarDiagrama(diagramaId, contenido) {
  const { data } = await api.patch(`/diagramas/diagramas/${diagramaId}/`, {
    nodes: contenido.nodes || [],
    edges: contenido.edges || [],
  });
  return data;
}

// El servidor genera exclusivamente desde Diagrama.nodes y Diagrama.edges ya
// persistidos. Se solicita binario para recibir el ZIP sin transformaciones.
export function generarSpringBoot(diagramaId) {
  return api.post(`/diagramas/diagramas/${diagramaId}/generar-spring-boot/`, {}, { responseType: 'arraybuffer' });
}

export async function obtenerDiagramaPrincipal(proyecto) {
  const embedded = proyecto.diagrama_principal || proyecto.diagramaPrincipal;
  if (embedded && belongsToProject(embedded, proyecto.id)) return embedded;
  const diagrams = await listarDiagramas(proyecto.id);
  // La API ya respondió filtrada por proyecto; algunos serializers no envían
  // la bandera de principal cuando solo hay un diagrama.
  return diagrams.find((diagram) => diagram.es_principal || diagram.principal || diagram.is_main) || diagrams[0] || null;
}

export function contenidoDiagrama(diagrama) {
  let content = Array.isArray(diagrama?.nodes) || Array.isArray(diagrama?.edges)
    ? diagrama
    : diagrama?.contenido || diagrama?.contenido_json || diagrama?.data || diagrama?.diagrama || diagrama;
  if (typeof content === 'string') {
    try { content = JSON.parse(content); } catch { return {}; }
  }
  if (!content || typeof content !== 'object') return {};
  return { ...content, nodes: content.nodes || content.nodos || [], edges: content.edges || content.aristas || [] };
}

export async function invitarProyecto(proyectoId, email, rol) {
  const { data } = await api.post(`/proyectos/proyectos/${proyectoId}/invitar/`, { email, rol });
  return data;
}

export async function listarInvitacionesPendientes() {
  const { data } = await api.get('/proyectos/invitaciones/pendientes/');
  return list(data);
}

export async function aceptarInvitacion(invitacionId) {
  const { data } = await api.post(`/proyectos/invitaciones/${invitacionId}/aceptar/`);
  return data;
}

export async function rechazarInvitacion(invitacionId) {
  await api.post(`/proyectos/invitaciones/${invitacionId}/rechazar/`);
}

export async function reenviarInvitacion(invitacionId) {
  const { data } = await api.post(`/proyectos/invitaciones/${invitacionId}/reenviar/`);
  return data;
}

export async function cancelarInvitacion(invitacionId) {
  await api.delete(`/proyectos/invitaciones/${invitacionId}/`);
}

export async function duplicarProyecto(proyectoId) {
  const { data } = await api.post(`/proyectos/proyectos/${proyectoId}/duplicar/`);
  return { ...data, name: data.nombre || data.name };
}

export async function archivarProyecto(proyectoId) {
  const { data } = await api.post(`/proyectos/proyectos/${proyectoId}/archivar/`);
  return data;
}

export async function restaurarProyecto(proyectoId) {
  const { data } = await api.post(`/proyectos/proyectos/${proyectoId}/restaurar/`);
  return data;
}

export async function eliminarProyecto(proyectoId) {
  await api.delete(`/proyectos/proyectos/${proyectoId}/`);
}

export async function actualizarRolMiembro(proyectoId, usuarioId, rol) {
  const { data } = await api.patch(`/proyectos/proyectos/${proyectoId}/miembros/${usuarioId}/`, { rol });
  return data;
}

export async function eliminarColaborador(proyectoId, usuarioId) {
  await api.delete(`/proyectos/proyectos/${proyectoId}/colaboradores/${usuarioId}/`);
}
