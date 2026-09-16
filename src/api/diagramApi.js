import api from './axios';

const list = (payload) => (Array.isArray(payload) ? payload : payload?.results || []);

export async function listarProyectos() {
  const { data } = await api.get('/proyectos/proyectos/');
  return list(data).map((project) => ({ ...project, name: project.nombre || project.name }));
}

export async function crearProyecto(nombre) {
  const { data } = await api.post('/proyectos/proyectos/', { nombre });
  return { ...data, name: data.nombre || data.name };
}

export async function listarDiagramas(proyectoId) {
  const { data } = await api.get('/diagramas/diagramas/', { params: { proyecto: proyectoId } });
  return list(data);
}

export async function obtenerDiagramaPrincipal(proyecto) {
  const embedded = proyecto.diagrama_principal || proyecto.diagramaPrincipal;
  if (embedded) return embedded;
  const diagrams = await listarDiagramas(proyecto.id);
  return diagrams.find((diagram) => diagram.es_principal || diagram.principal || diagram.is_main) || diagrams[0] || null;
}

export function contenidoDiagrama(diagrama) {
  let content = diagrama?.contenido || diagrama?.contenido_json || diagrama?.data || diagrama?.diagrama || diagrama;
  if (typeof content === 'string') {
    try { content = JSON.parse(content); } catch { return {}; }
  }
  if (!content || typeof content !== 'object') return {};
  return { ...content, nodes: content.nodes || content.nodos || [], edges: content.edges || content.aristas || [] };
}

export async function invitarProyecto(proyectoId, email) {
  const { data } = await api.post(`/proyectos/proyectos/${proyectoId}/invitar/`, { email });
  return data;
}
