import test from 'node:test';
import assert from 'node:assert/strict';
import { appendXmiImportFormData, canStartXmiPreview, initialXmiImportState, isValidXmiPreview, selectionFromMapping, toggleXmiCandidate, xmiCount, xmiImportErrorMessage, xmiList, xmiPreviewContractError, xmiText } from './xmiImport.js';

class FakeFormData {
  constructor() { this.items = []; }
  append(name, value) { this.items.push([name, value]); }
  values(name) { return this.items.filter(([key]) => key === name).map(([, value]) => value); }
}

test('XMI inicia en modo class y el dry run usa el contrato multipart exacto', () => {
  assert.equal(initialXmiImportState().mappingMode, 'class');
  const form = appendXmiImportFormData(new FakeFormData(), { file: 'modelo.xmi', mappingMode: 'auto', dryRun: true, selectedIds: ['a'], excludedIds: ['b'] });
  assert.deepEqual(form.values('file'), ['modelo.xmi']);
  assert.deepEqual(form.values('mode'), ['replace']);
  assert.deepEqual(form.values('mapping_mode'), ['auto']);
  assert.deepEqual(form.values('dry_run'), ['true']);
  assert.deepEqual(form.values('dryRun'), []);
  assert.deepEqual(form.values('selected_xmi_ids'), ['a']);
  assert.deepEqual(form.values('excluded_xmi_ids'), ['b']);
});

test('una entidad desmarcada se excluye y una clase marcada se selecciona sin duplicar IDs', () => {
  const defaults = selectionFromMapping({ entities: [{ xmi_id: 'cliente' }] });
  const unchecked = toggleXmiCandidate(defaults, { xmi_id: 'cliente', has_identifier: true, default_entity: true }, false);
  assert.deepEqual(unchecked, { selectedIds: [], excludedIds: ['cliente'] });
  const checked = toggleXmiCandidate(unchecked, { xmi_id: 'pedido', has_identifier: true }, true);
  assert.deepEqual(checked, { selectedIds: ['pedido'], excludedIds: ['cliente'] });
  assert.deepEqual(toggleXmiCandidate(checked, { xmi_id: 'pedido', has_identifier: true }, false), { selectedIds: [], excludedIds: ['cliente'] });
  const form = appendXmiImportFormData(new FakeFormData(), { file: 'modelo.xmi', selectedIds: ['cliente', 'pedido'], excludedIds: ['cliente'] });
  assert.deepEqual(form.values('selected_xmi_ids'), ['pedido']);
});

test('interfaces y tablas técnicas no se pueden seleccionar como entidades', () => {
  const base = { selectedIds: [], excludedIds: [] };
  assert.deepEqual(toggleXmiCandidate(base, { xmi_id: 'pagable', kind: 'interface', has_identifier: true }, true), base);
  assert.deepEqual(toggleXmiCandidate(base, { xmi_id: 'django_session', technical: true, has_identifier: true }, true), base);
});

test('una previsualización nula o incompleta es segura y no habilita importar', () => {
  assert.equal(isValidXmiPreview(null), false);
  assert.equal(isValidXmiPreview({ report: {} }), false);
  assert.equal(isValidXmiPreview({ dry_run: true, report: {} }), false);
  assert.equal(isValidXmiPreview({ dry_run: true, report: { mapping: {} }, preview: {} }), true);
  assert.deepEqual(xmiList(undefined), []);
  assert.deepEqual(selectionFromMapping({ entities: {} }), { selectedIds: [], excludedIds: [] });
});

test('una respuesta 200 sin dry_run se rechaza sin tocar el lienzo', () => {
  assert.equal(xmiPreviewContractError({ nodes: [], edges: [] }), 'El backend no está ejecutando el contrato de previsualización XMI. Verifica que dry_run=true sea enviado y que el backend esté actualizado.');
});

test('solo se permite un dry-run activo por clic explícito', () => {
  assert.equal(canStartXmiPreview({ name: 'Finanzas.xmi' }, false, false), true);
  assert.equal(canStartXmiPreview({ name: 'Finanzas.xmi' }, true, false), false);
  assert.equal(canStartXmiPreview({ name: 'Finanzas.xmi' }, false, true), false);
});

test('los objetos XMI se reducen a texto o conteos seguros antes de renderizar', () => {
  const node = { id: 'n-1', type: 'umlClass', position: {}, data: {}, attrs: [] };
  assert.equal(xmiCount([node]), 1);
  assert.equal(xmiCount(node), 0);
  assert.equal(xmiText({ message: 'Advertencia de EA' }), 'Advertencia de EA');
  assert.equal(xmiText(node, 'Mensaje seguro'), 'Mensaje seguro');
});

test('un error Axios con cuerpo objeto se convierte en texto y no en un hijo React', () => {
  const error = { response: { status: 400, data: { message: { detail: 'Archivo XMI inválido' } } } };
  assert.equal(xmiImportErrorMessage(error), 'Archivo XMI inválido');
});
