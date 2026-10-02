import test from 'node:test';
import assert from 'node:assert/strict';
import { postXmiFormData } from './xmiApiContract.js';
import { appendXmiImportFormData } from '../utils/xmiImport.js';

test('el cliente HTTP recibe el FormData exacto del dry-run', async () => {
  const formData = appendXmiImportFormData(new FormData(), {
    file: new Blob(['<xmi:XMI/>'], { type: 'application/xml' }),
    mappingMode: 'class',
    dryRun: true,
  });
  let received;
  const httpClient = {
    post: async (url, body, options) => {
      received = { url, body, options };
      return { data: { dry_run: true } };
    },
  };

  const result = await postXmiFormData(httpClient, 36, formData, { signal: 'preview-signal' });

  assert.equal(result.dry_run, true);
  assert.equal(received.url, '/diagramas/diagramas/36/importar-xmi/');
  assert.equal(received.body, formData);
  assert.equal(received.options.signal, 'preview-signal');
  assert.equal(received.body.get('file') instanceof Blob, true);
  assert.equal(received.body.get('mode'), 'replace');
  assert.equal(received.body.get('mapping_mode'), 'class');
  assert.equal(received.body.get('dry_run'), 'true');
});
