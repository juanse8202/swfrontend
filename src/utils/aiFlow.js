export const isStaleRevisionPayload = (value) => {
  const body = value?.response?.data || value || {};
  return body.code === 'stale_revision' || body.error?.code === 'stale_revision';
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

export const voiceRecognitionError = (error, hasPendingPlan) => {
  if (error === 'no-speech' && hasPendingPlan) {
    return { preservePendingPlan: true, message: 'No detecté una confirmación. Pulsa el micrófono y di confirmar o cancelar.' };
  }
  return { preservePendingPlan: false, message: null };
};
