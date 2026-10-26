import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import YAML from 'yaml';

import { createRuntime } from '../helpers/runtime-harness.ts';
import { createLocalWorkspaceServer } from '../../src/web/http/server.ts';
import { copyPreparedGitRepository, copyPreparedLegacyProjectWorkspace } from '../helpers/prepared-fixtures.ts';

const PRODUCT_ROOT: any = path.resolve(import.meta.dirname, '../..');
const BUILDR: any = path.join(PRODUCT_ROOT, 'bin', 'buildr.mjs');
function run(command: any, args: any, cwd: any = PRODUCT_ROOT): any  { return spawnSync(command, args, { cwd, encoding: 'utf8' }); }
function runBuildr(args: any): any  { return run(process.execPath, [BUILDR, ...args]); }
function setup(t: any): any  {
  const prepared: any = copyPreparedLegacyProjectWorkspace(t, 'legacy-service-product');
  return { base: prepared.base, root: prepared.root };
}

test('Service HTTP API 复用安全边界、CAS 与 prompt-only 创建', async (t: any) => {
  const { base, root }: any = setup(t);
  process.env.BUILDR_APP_DATA_DIR = path.join(base, 'app-data');
  t.after(() => delete process.env.BUILDR_APP_DATA_DIR);
  const source: any = path.join(base, 'source');
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, 'README.md'), '# api\n');
  assert.equal(runBuildr(['service', 'create', 'demo/api', source, '--target', root, '--name', 'API', '--description', '接口', '--type', 'backend']).status, 0);
  const runtime: any = createRuntime();
  const instance: any = createLocalWorkspaceServer(runtime, { targetRoot: root });
  t.after(() => instance.server.close());
  const { url, sessionToken, initialWorkspaceId }: any = await instance.ready;
  const apiBase: any = `${url}/api/v1/workspaces/${initialWorkspaceId}`;
  const list: any = await fetch(`${apiBase}/projects/demo/services`).then((response: any) => response.json());
  assert.equal(list.services[0].code, 'api');
  const detail: any = await fetch(`${apiBase}/projects/demo/services/api`).then((response: any) => response.json());
  const readmeDoc: any = await fetch(`${apiBase}/projects/demo/services/api/documents/README.md`).then((response: any) => response.json());
  assert.equal(readmeDoc.exists, true);
  assert.match(readmeDoc.content, /# api/);
  const agentsDoc: any = await fetch(`${apiBase}/projects/demo/services/api/documents/AGENTS.md`).then((response: any) => response.json());
  assert.equal(agentsDoc.exists, false);
  assert.equal(agentsDoc.content, null);
  let response: any = await fetch(`${apiBase}/projects/demo/services/api/documents/secrets.env`);
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'service_document_not_allowed');
  response = await fetch(`${apiBase}/projects/demo/services/api`, { method: 'PUT', headers: { origin: url, 'content-type': 'application/json', 'x-buildr-session': sessionToken }, body: JSON.stringify({ revision: detail.revision, name: 'From UI', description: 'Saved', type: 'application' }) });
  assert.equal(response.status, 200);
  const updated: any = await response.json();
  assert.equal(updated.service.name, 'From UI');
  response = await fetch(`${apiBase}/projects/demo/services/api`, { method: 'PUT', headers: { origin: url, 'content-type': 'application/json', 'x-buildr-session': sessionToken }, body: JSON.stringify({ revision: detail.revision, name: 'Stale' }) });
  assert.equal(response.status, 409);
  response = await fetch(`${apiBase}/prompts/service-create`, { method: 'POST', headers: { origin: url, 'content-type': 'application/json', 'x-buildr-session': sessionToken }, body: JSON.stringify({ projectCode: 'demo', code: 'worker', name: 'Worker', description: '任务服务', type: 'backend', sourceType: 'local', localPath: '/tmp/worker' }) });
  assert.equal(response.status, 200);
  const prompt: any = await response.json();
  assert.match(prompt.prompt, /标准命令 buildr service create demo\/worker/);
  assert.match(prompt.prompt, /trigger: service-registered/);
  assert.match(prompt.prompt, /service:demo\/worker/);
  assert.equal(runtime.listServices(root, 'demo').services.length, 1);
});
