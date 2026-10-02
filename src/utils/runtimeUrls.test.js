import test from 'node:test';
import assert from 'node:assert/strict';
import { apiBaseUrlFrom, apiOriginFrom, websocketBaseUrlFrom } from './runtimeUrls.js';

test('normaliza API productiva y construye WebSocket seguro', () => {
  assert.equal(apiOriginFrom('https://api.diagramcraft.uk/api'), 'https://api.diagramcraft.uk');
  assert.equal(apiBaseUrlFrom('https://api.diagramcraft.uk'), 'https://api.diagramcraft.uk/api');
  assert.equal(websocketBaseUrlFrom('https://api.diagramcraft.uk/api'), 'wss://api.diagramcraft.uk/ws');
});

test('conserva el modo local y una URL WebSocket configurada', () => {
  assert.equal(websocketBaseUrlFrom('http://localhost:8000/api'), 'ws://localhost:8000/ws');
  assert.equal(websocketBaseUrlFrom('https://api.diagramcraft.uk', 'wss://sockets.diagramcraft.uk/ws/'), 'wss://sockets.diagramcraft.uk/ws');
});
