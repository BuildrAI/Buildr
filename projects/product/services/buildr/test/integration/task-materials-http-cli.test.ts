import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import test, { after } from 'node:test';
import { createRuntime, runtimeProvide } from '../helpers/runtime-harness.ts';
import { createLocalWorkspaceServer } from '../../src/web/http/server.ts';
import { taskRecordFixture, runBuildrJson } from '../helpers/task-record-system-fixture.ts';
import { cleanupLocalTaskLifecycleSystemContext } from '../helpers/task-lifecycle-system-context.ts';
import { TASK_MATERIALS_APPLICATION } from '../../src/modules/task/materials/module.ts';
import type { TaskMaterialsApplication } from '../../src/modules/task/materials/application/task-materials-application.ts';
import { TASK_MATERIALS_SCHEMAS, TASK_MATERIALS_VALIDATORS } from '../../src/modules/task/materials/application/task-materials-contracts.ts';
import { TASK_HTTP_OPERATIONS } from '../../src/modules/task/interfaces/http/task-http-schema.ts';

after(() => cleanupLocalTaskLifecycleSystemContext());

test('独立材料HTTP/CLI和真实Worker观察相同正文，零读取写入且Task Record/历史不变', { timeout: 30000 }, async t => {
  const { base, root } = taskRecordFixture(t, 'task-materials-http-cli');
  const priorApp = process.env.BUILDR_APP_DATA_DIR; const priorProduct = process.env.BUILDR_PRODUCT_DATA_DIR;
  process.env.BUILDR_APP_DATA_DIR = path.join(base, 'app-data'); process.env.BUILDR_PRODUCT_DATA_DIR = path.join(base, 'product-data');
  t.after(() => { if (priorApp === undefined) delete process.env.BUILDR_APP_DATA_DIR; else process.env.BUILDR_APP_DATA_DIR = priorApp; if (priorProduct === undefined) delete process.env.BUILDR_PRODUCT_DATA_DIR; else process.env.BUILDR_PRODUCT_DATA_DIR = priorProduct; });
  const runtime = createRuntime();
  runtime.createTask(root, { taskId: 'materials-one', title: '真实短说明', intent: '无 Change 任务', projects: [], services: [], changes: [] });
  const original = runtime.readTask(root, 'materials-one');
  const application = runtimeProvide(runtime, TASK_MATERIALS_APPLICATION) as TaskMaterialsApplication;
  const instance = createLocalWorkspaceServer(runtime, { targetRoot: root });
  t.after(() => new Promise<void>(resolve => instance.server.close(() => resolve())));
  const { url, initialWorkspaceId, sessionToken } = await instance.ready;
  const endpoint = `${url}/api/v1/workspaces/${initialWorkspaceId}/tasks/materials-one/materials`;
  const headers = { origin: url, 'x-buildr-session': sessionToken, 'content-type': 'application/json' };
  const request = async (resource = endpoint, options: RequestInit = {}) => { const response = await fetch(resource, options); return { status: response.status, body: await response.json() as any }; };
  let result = await request(); assert.equal(result.status, 200); assert.equal(result.body.materialsDigest, 'absent');
  assert.equal(fs.existsSync(path.join(root, '.buildr/local/task-materials')), false);
  const inputFile = path.join(base, 'brief-input.md'); fs.writeFileSync(inputFile, '# 问题与目标\n真实范围和完成依据。\n');
  const saved = runBuildrJson(['task', 'materials', 'write', 'materials-one', '--target', root, '--path', 'brief.md', '--content', inputFile, '--expected-document', 'absent']);
  assert.equal(saved.schemaVersion, 'buildr.task-materials-write-result/v2');
  const reference = { id: 'brief', role: 'solution', title: '任务说明', source: { kind: 'task', path: 'brief.md' } };
  result = await request(endpoint, { method: 'POST', headers, body: JSON.stringify({ expectedCurrent: 'absent', documents: [reference] }) });
  assert.equal(result.status, 200); assert.equal(result.body.documents[0].content, fs.readFileSync(inputFile, 'utf8'));
  const recordedDigest = result.body.materialsDigest;
  const cli = runBuildrJson(['task', 'materials', 'inspect', 'materials-one', '--target', root]);
  assert.deepEqual(cli, result.body); assert.deepEqual(application.inspectTaskMaterials(root, 'materials-one'), cli);
  result = await request(); assert.deepEqual(result.body, cli);
  result = await request(`${endpoint}/documents`, { method: 'POST', headers, body: JSON.stringify({ path: 'brief.md', content: '# 更新后的说明\n', expectedDocumentDigest: saved.actualDigest }) });
  assert.equal(result.status, 200); assert.equal(TASK_MATERIALS_VALIDATORS.validate(TASK_MATERIALS_SCHEMAS.writeResponse.$id, result.body).valid, true);
  result = await request(); assert.equal(result.body.documents[0].content, '# 更新后的说明\n'); assert.equal(result.body.materialsDigest, recordedDigest);
  const manifestFile = path.join(base, 'materials-input.json'); fs.writeFileSync(manifestFile, JSON.stringify({ schemaVersion: 'buildr.task-materials/v2', documents: [] }));
  const removed = runBuildrJson(['task', 'materials', 'record', 'materials-one', '--target', root, '--materials', manifestFile, '--expected-current', recordedDigest]);
  assert.deepEqual(removed.documents, []); assert.equal(fs.existsSync(path.join(root, '.buildr/local/task-materials/materials-one/brief.md')), true);
  assert.deepEqual(runtime.readTask(root, 'materials-one'), original);
  assert.deepEqual(TASK_HTTP_OPERATIONS.filter(item => item.id.startsWith('task-materials.')).map(item => [item.method, item.path]), [['GET', '/tasks/:taskId/materials'], ['POST', '/tasks/:taskId/materials'], ['POST', '/tasks/:taskId/materials/documents']]);

  for (const [invalidHeaders, status] of [[{ ...headers, origin: 'http://untrusted.example' }, 403], [{ ...headers, 'x-buildr-session': 'wrong' }, 403], [{ ...headers, 'content-type': 'text/plain' }, 415]] as const) {
    const denied = await request(endpoint, { method: 'POST', headers: invalidHeaders, body: JSON.stringify({ expectedCurrent: removed.materialsDigest, documents: [] }) }); assert.equal(denied.status, status);
  }
  const before = application.inspectTaskMaterials(root, 'materials-one');
  for (const [resource, body, status] of [
    [endpoint, { expectedCurrent: removed.materialsDigest, documents: [], unexpected: true }, 400],
    [endpoint, { expectedCurrent: 'absent', documents: [] }, 409],
    [`${endpoint}/documents`, { path: '../another/brief.md', content: 'escape', expectedDocumentDigest: 'absent' }, 400],
    [`${endpoint}/documents`, { path: '/tmp/escape.md', content: 'escape', expectedDocumentDigest: 'absent' }, 400],
    [`${endpoint}/documents`, { path: 'brief.md', content: 'old overwrite', expectedDocumentDigest: 'absent' }, 409],
    [`${endpoint}/documents`, { path: 'brief.md', content: 'secret', expectedDocumentDigest: 'absent', root }, 400],
    [endpoint, { expectedCurrent: removed.materialsDigest, documents: [], extra: 'x'.repeat(128 * 1024) }, 413],
  ] as const) { const denied = await request(resource, { method: 'POST', headers, body: JSON.stringify(body) }); assert.equal(denied.status, status, JSON.stringify(denied.body)); }
  const badUtf8 = Buffer.concat([Buffer.from('{"expectedCurrent":"absent","documents":[],"extra":"'), Buffer.from([0xff]), Buffer.from('"}')]);
  assert.equal((await request(endpoint, { method: 'POST', headers, body: badUtf8 })).status, 400);
  assert.equal((await request(`${endpoint}?unexpected=true`)).status, 400);
  assert.equal((await request(endpoint.replace('materials-one', 'missing-task'))).status, 404);
  assert.deepEqual(application.inspectTaskMaterials(root, 'materials-one'), before); assert.deepEqual(runtime.readTask(root, 'materials-one'), original);
});
