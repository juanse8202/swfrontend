import test from 'node:test';
import assert from 'node:assert/strict';
import { interpretationClarificationMessage, isStaleRevisionPayload, normalizeVoiceTranscript, parseProjectCreationCommand, planNeedsConfirmation, relationPlanPreview, voiceFinalAction, voiceRecognitionError, voiceSessionForPendingPlan } from './aiFlow.js';

test('una transcripción final despierta a Diana y solo la siguiente se envía', () => {
  assert.equal(voiceFinalAction('Hola Diana', 'wake', false), 'wake');
  assert.equal(voiceFinalAction('crea Pedido', 'instruction', false), 'send');
  assert.equal(voiceFinalAction('Diana, crea una clase Persona', 'wake', false), 'send');
});

test('cancelar y confirmar se reservan para el plan pendiente', () => {
  assert.equal(voiceFinalAction('cancelar', 'instruction', true), 'cancel');
  assert.equal(voiceFinalAction('Diana, cancelar', 'wake', true), 'cancel');
  assert.equal(voiceFinalAction('cancela.', 'instruction', true), 'cancel');
  assert.equal(voiceFinalAction('confirmar', 'instruction', true), 'confirm');
  assert.equal(voiceFinalAction('Diana, confirmar', 'wake', true), 'confirm');
  assert.equal(voiceFinalAction('confirma!!!', 'wake', true), 'confirm');
  assert.equal(voiceFinalAction('Diana, confirmar el plan', 'wake', true), 'confirm');
  assert.equal(voiceFinalAction('cancelar el plan', 'wake', true), 'cancel');
  assert.equal(voiceFinalAction('confirmar', 'wake', false), 'confirm_without_plan');
  assert.equal(voiceFinalAction('cancelar', 'wake', false), 'cancel_without_plan');
});

test('normaliza espacios y puntuacion antes de decidir un comando de voz', () => {
  assert.equal(normalizeVoiceTranscript('  CONFIRMA,   por favor! '), 'confirma por favor');
  assert.equal(normalizeVoiceTranscript('  Diana, confirmar... '), 'diana confirmar');
});

test('una frase normal conserva el flujo de transcripcion hacia la instruccion', () => {
  assert.equal(voiceFinalAction('Diana, crea una clase Persona.', 'wake', false), 'send');
  assert.equal(voiceFinalAction('crea una clase Persona', 'instruction', false), 'send');
});

test('no-speech conserva el plan pendiente de confirmacion', () => {
  assert.deepEqual(voiceRecognitionError('no-speech', true), {
    preservePendingPlan: true,
    message: 'No detecté una confirmación. Pulsa el micrófono y di confirmar o cancelar.',
  });
  assert.equal(voiceRecognitionError('no-speech', false).preservePendingPlan, false);
});

test('extrae nombres dinamicos para crear proyectos sin diagrama', () => {
  assert.deepEqual(parseProjectCreationCommand('Crea un proyecto llamado Software'), { isProjectCreation: true, name: 'Software' });
  assert.deepEqual(parseProjectCreationCommand('Crear proyecto Biblioteca Digital'), { isProjectCreation: true, name: 'Biblioteca Digital' });
  assert.deepEqual(parseProjectCreationCommand('Proyecto Hospital Central'), { isProjectCreation: true, name: 'Hospital Central' });
  assert.deepEqual(parseProjectCreationCommand('Proyecto'), { isProjectCreation: true, name: null });
  assert.deepEqual(parseProjectCreationCommand('Crea una clase Persona'), { isProjectCreation: false, name: null });
});

test('el plan local de proyecto conserva confirmacion y cancelacion explicitas', () => {
  const localProjectPlan = { localProjectCreation: true, name: 'Software', operations: [{ op: 'project.create', payload: { name: 'Software' } }] };
  assert.equal(planNeedsConfirmation({}, localProjectPlan), true);
  assert.equal(voiceFinalAction('confirmar', 'confirmation', true), 'confirm');
  assert.equal(voiceFinalAction('Diana, confirmar', 'confirmation', true), 'confirm');
  assert.equal(voiceFinalAction('confirma', 'confirmation', true), 'confirm');
  assert.equal(voiceFinalAction('cancelar', 'confirmation', true), 'cancel');
});

test('una confirmacion sin plan pendiente vuelve a escuchar la activacion de Diana', () => {
  assert.equal(voiceSessionForPendingPlan('confirmation', false), 'wake');
  assert.equal(voiceSessionForPendingPlan('confirmation', true), 'confirmation');
  assert.equal(voiceSessionForPendingPlan('instruction', false), 'instruction');
});

test('los borrados y revisiones obsoletas se detectan sin modificar el lienzo', () => {
  assert.equal(planNeedsConfirmation({}, { operations: [{ type: 'node.delete' }] }), true);
  assert.equal(planNeedsConfirmation({}, { operations: [{ op: 'project.create' }] }), true);
  assert.equal(planNeedsConfirmation({}, { operations: [{ op: 'create_node' }] }), true);
  assert.equal(isStaleRevisionPayload({ response: { data: { code: 'stale_revision' } } }), true);
});

test('un error recuperable de interpretación vuelve a pedir una instrucción', () => {
  assert.equal(interpretationClarificationMessage({ response: { status: 400, data: { code: 'ai_interpretation_failed' } } }), 'No entendí completamente la instrucción. ¿Puedes decir qué clase, entidad, interfaz o relación deseas crear?');
  assert.equal(interpretationClarificationMessage({ response: { status: 409, data: { code: 'stale_revision' } } }), null);
  assert.equal(interpretationClarificationMessage({ response: { status: 403, data: { code: 'permission_denied' } } }), null);
});

test('resume operaciones de relaciones sin perder los seis tipos UML', () => {
  for (const relationType of ['asociacion', 'agregacion', 'composicion', 'herencia', 'realizacion', 'dependencia']) {
    const preview = relationPlanPreview({ op: 'create_relation', payload: { relation_type: relationType, source: 'Cliente', target: 'Pedido', jpaManaged: false } });
    assert.match(preview, new RegExp(relationType));
    assert.match(preview, /Cliente → Pedido/);
  }
  assert.match(relationPlanPreview({ op: 'delete_relation', payload: { relation_type: 'dependencia', source: 'Factura', target: 'Impresora' } }), /^Eliminar relación/);
  const updated = relationPlanPreview({ op: 'update_relation', payload: { relation_type: 'agregacion', source: 'Cliente', target: 'Pedido', sourceMultiplicity: '1', targetMultiplicity: '0..*', navigability: 'source_to_target', whole: 'Cliente', part: 'Pedido' } });
  assert.match(updated, /^Actualizar relación/);
  assert.match(updated, /source_to_target/);
  assert.match(updated, /todo: Cliente/);
});
