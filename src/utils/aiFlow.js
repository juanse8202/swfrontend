export const isStaleRevisionPayload = (value) => {
  const body = value?.response?.data || value || {};
  return body.code === 'stale_revision' || body.error?.code === 'stale_revision';
};

export const interpretationClarificationMessage = (value) => {
  const body = value?.response?.data || value || {};
  const code = String(body.code || body.error?.code || '').toLowerCase();
  const status = Number(value?.response?.status || body.status_code || 0);
  if (['stale_revision', 'permission_denied', 'authentication_required'].includes(code)) return null;
  const recoverable = status === 400 || status === 422 || ['ai_interpretation_failed', 'invalid_instruction', 'unsupported_instruction'].includes(code);
  if (!recoverable) return null;
  return body.question || 'No entendí completamente la instrucción. ¿Puedes decir qué clase, entidad, interfaz o relación deseas crear?';
};

export const planNeedsConfirmation = (response, plan) => (
  Boolean(response?.requires_confirmation || plan?.requires_confirmation)
  || (plan?.operations || response?.operations || []).some((operation) => /delete|remove|project\.create|create_node|add_attribute|add_method|create_relation/i.test(operation?.type || operation?.op || ''))
);

export const normalizeVoiceTranscript = (transcript) => String(transcript || '')
  .toLocaleLowerCase('es')
  .replace(/[^\p{L}\p{N}\s]/gu, ' ')
  .replace(/\s+/g, ' ')
  .trim();

export const voiceFinalAction = (transcript, session, hasPendingPlan) => {
  const text = normalizeVoiceTranscript(transcript);
  if (/diana[, ]+deja de escuchar/.test(text)) return 'stop';
  if (/^(?:diana )?cancela(r)?(?: el plan)?$/.test(text)) return hasPendingPlan ? 'cancel' : 'cancel_without_plan';
  if (/^(?:diana )?confirma(r)?(?: el plan)?$/.test(text)) return hasPendingPlan ? 'confirm' : 'confirm_without_plan';
  if (session === 'wake') return /hola diana/.test(text) ? 'wake' : /^diana[,: ]/.test(text) ? 'send' : 'ignore';
  return session === 'instruction' && text ? 'send' : 'ignore';
};

export const voiceSessionForPendingPlan = (session, hasPendingPlan) => (
  session === 'confirmation' && !hasPendingPlan ? 'wake' : session
);

export const voiceRecognitionError = (error, hasPendingPlan) => {
  if (error === 'no-speech' && hasPendingPlan) {
    return { preservePendingPlan: true, message: 'No detecté una confirmación. Pulsa el micrófono y di confirmar o cancelar.' };
  }
  return { preservePendingPlan: false, message: null };
};

export const parseProjectCreationCommand = (instruction) => {
  const text = String(instruction || '').trim();
  const match = text.match(/^\s*(?:diana\s*,?\s*)?(?:(?:crea|crear)\s+(?:un\s+)?)?proyecto(?:\s+(?:llamado|denominado))?(?:\s+(?<name>.+?))?\s*[.!?]*\s*$/i);
  if (!match) return { isProjectCreation: false, name: null };
  const name = (match.groups?.name || '').trim().replace(/[.,;:]+$/g, '').trim();
  return { isProjectCreation: true, name: name || null };
};

const planValue = (value) => {
  if (value && typeof value === 'object') return value.title || value.name || value.id || value.node_id || '';
  return value || '';
};

export const relationPlanPreview = (operation) => {
  const details = operation?.payload || operation?.data || operation || {};
  const type = details.relation_type || details.relationType || details.type || operation?.relation_type || '';
  const source = planValue(details.source || details.source_id || details.sourceId);
  const target = planValue(details.target || details.target_id || details.targetId);
  const action = String(operation?.op || operation?.type || '').toLowerCase();
  const verb = /delete|remove/.test(action) ? 'Eliminar' : /update|change/.test(action) ? 'Actualizar' : 'Crear';
  const metadata = [
    details.multiplicidadOrigen || details.source_multiplicity || details.sourceMultiplicity,
    details.multiplicidadDestino || details.target_multiplicity || details.targetMultiplicity,
    details.rolOrigen || details.source_role || details.sourceRole,
    details.rolDestino || details.target_role || details.targetRole,
    details.navegabilidad || details.navigability,
    details.whole || details.whole_id ? `todo: ${planValue(details.whole || details.whole_id)}` : '',
    details.part || details.part_id ? `parte: ${planValue(details.part || details.part_id)}` : '',
  ].filter(Boolean);
  const jpa = typeof details.jpaManaged === 'boolean' || typeof details.jpa_managed === 'boolean'
    ? `; JPA: ${(details.jpaManaged ?? details.jpa_managed) ? 'sí' : 'no'}`
    : '';
  return `${verb} relación ${type || 'UML'}${source || target ? `: ${source || 'origen'} → ${target || 'destino'}` : ''}${metadata.length ? ` (${metadata.join(', ')})` : ''}${jpa}`;
};
