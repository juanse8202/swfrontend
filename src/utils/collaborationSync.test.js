import test from 'node:test';
import assert from 'node:assert/strict';
import { documentsMatch, isOwnSocketEvent, saveSnapshotIsCurrent, shouldReplaceRemoteDocument } from './collaborationSync.js';

test('descarta un autosave cuya generacion o revision ya no coinciden', () => {
  assert.equal(saveSnapshotIsCurrent({ scheduledGeneration: 3, currentGeneration: 3, scheduledRevision: 8, currentRevision: 8 }), true);
  assert.equal(saveSnapshotIsCurrent({ scheduledGeneration: 2, currentGeneration: 3, scheduledRevision: 8, currentRevision: 8 }), false);
  assert.equal(saveSnapshotIsCurrent({ scheduledGeneration: 3, currentGeneration: 3, scheduledRevision: 7, currentRevision: 8 }), false);
});

test('solo reemplaza por una revision remota mas reciente', () => {
  assert.equal(shouldReplaceRemoteDocument(5, 4), true);
  assert.equal(shouldReplaceRemoteDocument(4, 4), false);
  assert.equal(shouldReplaceRemoteDocument(3, 4), false);
});

test('reconoce el eco WebSocket propio por request_id o documento identico', () => {
  const local = { nodes: [{ id: 'persona' }], edges: [] };
  assert.equal(isOwnSocketEvent({ origin_request_id: 'sync-1', nodes: [], edges: [] }, local, new Set(['sync-1'])), true);
  assert.equal(isOwnSocketEvent({ origin_request_id: null, nodes: local.nodes, edges: [] }, local, new Set()), true);
  assert.equal(isOwnSocketEvent({ origin_request_id: 'other', nodes: [{ id: 'cliente' }], edges: [] }, local, new Set()), false);
  assert.equal(documentsMatch(local, { nodes: [{ id: 'persona' }], edges: [] }), true);
});
