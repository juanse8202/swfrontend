import test from 'node:test';
import assert from 'node:assert/strict';
import { isStaleRevisionPayload, normalizeVoiceTranscript, planNeedsConfirmation, voiceFinalAction, voiceRecognitionError } from './aiFlow.js';

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

test('los borrados y revisiones obsoletas se detectan sin modificar el lienzo', () => {
  assert.equal(planNeedsConfirmation({}, { operations: [{ type: 'node.delete' }] }), true);
  assert.equal(planNeedsConfirmation({}, { operations: [{ op: 'project.create' }] }), true);
  assert.equal(planNeedsConfirmation({}, { operations: [{ op: 'create_node' }] }), true);
  assert.equal(isStaleRevisionPayload({ response: { data: { code: 'stale_revision' } } }), true);
});
