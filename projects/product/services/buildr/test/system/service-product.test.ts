import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import YAML from 'yaml';

import { createRuntime } from '../../src/bootstrap/runtime.ts';
import { createLocalWorkspaceServer } from '../../src/web/http/server.ts';
import { copyPreparedGitRepository, copyPreparedProjectWorkspace } from '../helpers/prepared-fixtures.ts';

const PRODUCT_ROOT: any = path.resolve(import.meta.dirname, '../..');
const BUILDR: any = path.join(PRODUCT_ROOT, 'bin', 'buildr.mjs');
function run(command: any, args: any, cwd: any = PRODUCT_ROOT): any  { return spawnSync(command, args, { cwd, encoding: 'utf8' }); }
function runBuildr(args: any): any  { return run(process.execPath, [BUILDR, ...args]); }
function setup(t: any): any  {
  const prepared: any = copyPreparedProjectWorkspace(t, 'service-product');
  return { base: prepared.base, root: prepared.root };
}

test('Service create 写入 v2 Domain、父 UUID 与受控 metadata', (t: any) => {
  const { base, root }: any = setup(t);
  const source: any = path.join(base, 'source');
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, 'README.md'), '# api\n');
  const result: any = runBuildr(['service', 'create', 'demo/api', source, '--target', root, '--name', 'Public API', '--description', '接口服务', '--type', 'backend', '--json']);
  assert.equal(result.status, 0, result.stderr);
  const created: any = JSON.parse(result.stdout);
  assert.equal(created.service.code, 'api');
  assert.match(created.nextActions[0], /trigger: service-registered/);
  assert.match(created.nextActions[0], /service:demo\/api/);
  assert.match(created.nextActions[0], /routine-maintenance或user-decision-required/);
  assert.match(created.nextActions[0], /改变长期适用性时请求用户确认/);
  const runtime: any = createRuntime();
  const list: any = runtime.listServices(root, 'demo');
  assert.equal(list.schemaVersion, 'buildr.services/v2');
  assert.equal(list.services[0].workspaceId, runtime.getWorkspace(root).workspace.id);
  assert.equal(list.services[0].projectId, runtime.projectDetail(root, 'demo').project.id);
  assert.deepEqual(list.services[0].source, { type: 'workspace', path: 'projects/demo/services/api' });
  const updated: any = runtime.updateServiceMetadata(root, 'demo', 'api', { revision: list.revision, name: 'API', description: '新说明', type: 'application' });
  assert.equal(updated.service.type, 'application');
  assert.throws(() => runtime.updateServiceMetadata(root, 'demo', 'api', { revision: list.revision, name: 'stale' }), (error: any) => error.code === 'service_revision_conflict');
});

test('Git Service 保存 integrationBranch，观察态不进入 Domain', (t: any) => {
  const { root }: any = setup(t);
  const { remote }: any = copyPreparedGitRepository(t, 'service-git-source');
  const result: any = runBuildr(['service', 'create', 'demo/api', remote, '--target', root, '--name', 'API', '--description', '接口', '--type', 'backend', '--integration-branch', 'dev']);
  assert.equal(result.status, 0, result.stderr);
  const runtime: any = createRuntime();
  let detail: any = runtime.serviceDetail(root, 'demo', 'api');
  assert.equal(detail.service.source.git.integrationBranch, 'dev');
  assert.equal(detail.observed.currentBranch, 'dev');
  assert.equal(run('git', ['checkout', '-b', 'tasks/example'], path.join(root, 'projects', 'demo', 'services', 'api')).status, 0);
  detail = runtime.serviceDetail(root, 'demo', 'api');
  assert.ok(detail.comparison.findings.some((finding: any) => finding.code === 'service.git_branch_drift'));
  const stored: any = YAML.parse(fs.readFileSync(path.join(root, 'projects', 'demo', 'services', 'manifest.yml'), 'utf8')).services.api;
  assert.equal(stored.currentBranch, undefined);
});

test('Service attach 只登记外部 Git root，不复制或修改内容', (t: any) => {
  const { root }: any = setup(t);
  const { attached }: any = copyPreparedGitRepository(t, 'service-attach');
  const before: any = { head: run('git', ['rev-parse', 'HEAD'], attached).stdout, status: run('git', ['status', '--porcelain'], attached).stdout, readme: fs.readFileSync(path.join(attached, 'README.md'), 'utf8') };

  const result: any = runBuildr(['service', 'create', 'demo/external', '--attach', attached, '--target', root, '--name', 'External', '--description', 'External service', '--type', 'backend', '--json']);
  assert.equal(result.status, 0, result.stderr);
  const detail: any = JSON.parse(result.stdout);
  assert.equal(detail.service.source.root, 'attached');
  assert.equal(detail.service.source.path, fs.realpathSync(attached));
  assert.equal(detail.sourceLocation.ownership, 'external');
  assert.deepEqual({ head: run('git', ['rev-parse', 'HEAD'], attached).stdout, status: run('git', ['status', '--porcelain'], attached).stdout, readme: fs.readFileSync(path.join(attached, 'README.md'), 'utf8') }, before);
  assert.equal(fs.existsSync(path.join(root, 'projects', 'demo', 'services', 'external')), false);
  const doctor: any = JSON.parse(runBuildr(['doctor', '--target', root, '--scope', 'projects/demo/services/external', '--json', '--detail', 'full']).stdout);
  assert.equal(doctor.services.find((service: any) => service.name === 'external').exists, true);
  assert.equal(doctor.findings.some((finding: any) => finding.code === 'service.git.missing'), false);
  const duplicate: any = runBuildr(['service', 'create', 'demo/duplicate', '--attach', attached, '--target', root, '--name', 'Duplicate', '--description', 'Duplicate service']);
  assert.equal(duplicate.status, 1);
  assert.match(duplicate.stderr, /already registered/);
});

test('sync 显式迁移 v1 Service registry 并优先使用 branch', (t: any) => {
  const { root }: any = setup(t);
  fs.mkdirSync(path.join(root, 'projects', 'demo', 'services', 'api'), { recursive: true });
  const file: any = path.join(root, 'projects', 'demo', 'services', 'manifest.yml');
  fs.writeFileSync(file, ['schemaVersion: buildr.services/v1', 'project: demo', 'services:', '  api:', '    title: API', '    description: 接口', '    type: backend', '    path: services/api', '    repo:', '      kind: workspace', ''].join('\n'));
  const before: any = fs.readFileSync(file, 'utf8');
  const runtime: any = createRuntime();
  assert.equal(runtime.listServices(root, 'demo').migrationRequired, true);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  const result: any = runBuildr(['sync', 'codex', '--target', root]);
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  const registry: any = YAML.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(registry.schemaVersion, 'buildr.services/v2');
  assert.match(registry.services.api.id, /^[0-9a-f-]{36}$/);
  assert.equal(registry.services.api.projectId, runtime.projectDetail(root, 'demo').project.id);
});

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
