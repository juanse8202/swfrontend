import api from './axios';

// La sesión y el token CSRF los administra el interceptor de axios. Ninguna
// clave de proveedor de IA llega al navegador.
export function interpretAi(diagramId, instruction, selection, { expectedRevision, requestId, ...options } = {}) {
  return api.post(`/diagramas/diagramas/${diagramId}/interpretar-ia/`, {
    instruction,
    expected_revision: expectedRevision,
    request_id: requestId,
    selection: {
      node_ids: selection?.node_ids || [],
      edge_ids: selection?.edge_ids || [],
    },
  }, options);
}

export function applyAiPlan(diagramId, { plan_id, idempotency_key, confirm, expected_revision, request_id }, options = {}) {
  return api.post(`/diagramas/diagramas/${diagramId}/aplicar-plan-ia/`, {
    plan_id,
    idempotency_key,
    confirm,
    expected_revision,
    request_id,
  }, options);
}
