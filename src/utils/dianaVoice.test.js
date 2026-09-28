import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanDianaSpeech, selectBestSpanishVoice, speechSegments } from './dianaVoice.js';

test('elige una voz natural española y prioriza es-BO', () => {
  const selected = selectBestSpanishVoice([
    { name: 'Microsoft Elena Natural', voiceURI: 'es-es', lang: 'es-ES', localService: true },
    { name: 'Google español Bolivia', voiceURI: 'es-bo', lang: 'es-BO', localService: false },
  ]);
  assert.equal(selected.voiceURI, 'es-bo');
});

test('la preferencia explícita de voz prevalece', () => {
  const selected = selectBestSpanishVoice([
    { name: 'Microsoft Elena Natural', voiceURI: 'es-es', lang: 'es-ES', localService: true },
    { name: 'Google español', voiceURI: 'es-mx', lang: 'es-MX', localService: true },
  ], 'es-mx');
  assert.equal(selected.voiceURI, 'es-mx');
});

test('limpia contenido técnico y limita la respuesta hablada', () => {
  const segments = speechSegments('Listo. {"status": "ok"} Visita https://example.test. Una frase más. Otra más.');
  assert.ok(segments.length <= 3);
  assert.ok(!segments.join(' ').includes('https://'));
  assert.ok(!segments.join(' ').includes('status'));
  assert.equal(cleanDianaSpeech('  Hola   Diana  '), 'Hola Diana');
});
