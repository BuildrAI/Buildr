import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import YAML from 'yaml';

import { createRuntime } from '../../src/application/compose-runtime.mjs';
import { createLocalWorkspaceServer } from '../../src/interfaces/local-app/http/server.mjs';

const PRODUCT_ROOT = path.resolve(import.meta.dirname, '../..');
const BUILDR = path.join(PRODUCT_ROOT, 'bin', 'buildr.mjs');
function run(command, args, cwd = PRODUCT_ROOT) { return spawnSync(command, args, { cwd, encoding: 'utf8' }); }
function runBuildr(args) { return run(process.execPath, [BUILDR, ...args]); }
function setup(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-service-product-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const root = path.join(base, 'workspace');
  assert.equal(runBuildr(['init', '--target', root, '--name', 'Demo', '--description', 'Demo workspace']).status, 0);
  const project = runBuildr(['project', 'create', 'demo', '--target', root, '--name', 'Demo', '--description', 'Demo project']);
  assert.equal(project.status, 0, project.stderr);
  return { base, root };
}

test('Service create 写入 v2 Domain、父 UUID 与受控 metadata', (t) => {
  const { base, root } = setup(t);
  const source = path.join(base, 'source');
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, 'README.md'), '# api\n');
  const result = runBuildr(['service', 'create', 'demo/api', source, '--target', root, '--name', 'Public API', '--description', '接口服务', '--type', 'backend', '--json']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).service.code, 'api');
  const runtime = createRuntime();
  const list = runtime.listServices(root, 'demo');
  assert.equal(list.schemaVersion, 'buildr.services/v2');
  assert.equal(list.services[0].workspaceId, runtime.getWorkspace(root).workspace.id);
  assert.equal(list.services[0].projectId, runtime.projectDetail(root, 'demo').project.id);
  assert.deepEqual(list.services[0].source, { type: 'workspace', path: 'projects/demo/services/api' });
  const updated = runtime.updateServiceMetadata(root, 'demo', 'api', { revision: list.revision, name: 'API', description: '新说明', type: 'application' });
  assert.equal(updated.service.type, 'application');
  assert.throws(() => runtime.updateServiceMetadata(root, 'demo', 'api', { revision: list.revision, name: 'stale' }), (error) => error.code === 'service_revision_conflict');
});

test('Git Service 保存 integrationBranch，观察态不进入 Domain', (t) => {
  const { base, root } = setup(t);
  const source = path.join(base, 'git-source');
  fs.mkdirSync(source);
  assert.equal(run('git', ['init', '-b', 'dev'], source).status, 0);
  fs.writeFileSync(path.join(source, 'README.md'), '# api\n');
  assert.equal(run('git', ['add', 'README.md'], source).status, 0);
  assert.equal(run('git', ['-c', 'user.name=Buildr Test', '-c', 'user.email=buildr@example.com', 'commit', '-m', 'init'], source).status, 0);
  const remote = path.join(base, 'api.git');
  assert.equal(run('git', ['clone', '--bare', source, remote]).status, 0);
  const result = runBuildr(['service', 'create', 'demo/api', remote, '--target', root, '--name', 'API', '--description', '接口', '--type', 'backend', '--integration-branch', 'dev']);
  assert.equal(result.status, 0, result.stderr);
  const runtime = createRuntime();
  let detail = runtime.serviceDetail(root, 'demo', 'api');
  assert.equal(detail.service.source.git.integrationBranch, 'dev');
  assert.equal(detail.observed.currentBranch, 'dev');
  assert.equal(run('git', ['checkout', '-b', 'tasks/example'], path.join(root, 'projects', 'demo', 'services', 'api')).status, 0);
  detail = runtime.serviceDetail(root, 'demo', 'api');
  assert.ok(detail.comparison.findings.some((finding) => finding.code === 'service.git_branch_drift'));
  const stored = YAML.parse(fs.readFileSync(path.join(root, 'projects', 'demo', 'services', 'manifest.yml'), 'utf8')).services.api;
  assert.equal(stored.currentBranch, undefined);
});

test('sync 显式迁移 v1 Service registry 并优先使用 branch', (t) => {
  const { root } = setup(t);
  fs.mkdirSync(path.join(root, 'projects', 'demo', 'services', 'api'), { recursive: true });
  const file = path.join(root, 'projects', 'demo', 'services', 'manifest.yml');
  fs.writeFileSync(file, ['schemaVersion: buildr.services/v1', 'project: demo', 'services:', '  api:', '    title: API', '    description: 接口', '    type: backend', '    path: services/api', '    repo:', '      kind: workspace', ''].join('\n'));
  const before = fs.readFileSync(file, 'utf8');
  const runtime = createRuntime();
  assert.equal(runtime.listServices(root, 'demo').migrationRequired, true);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  const result = runBuildr(['sync', 'codex', '--target', root]);
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  const registry = YAML.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(registry.schemaVersion, 'buildr.services/v2');
  assert.match(registry.services.api.id, /^[0-9a-f-]{36}$/);
  assert.equal(registry.services.api.projectId, runtime.projectDetail(root, 'demo').project.id);
});

test('Service HTTP API 复用安全边界、CAS 与 prompt-only 创建', async (t) => {
  const { base, root } = setup(t);
  process.env.BUILDR_APP_DATA_DIR = path.join(base, 'app-data');
  t.after(() => delete process.env.BUILDR_APP_DATA_DIR);
  const source = path.join(base, 'source');
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, 'README.md'), '# api\n');
  assert.equal(runBuildr(['service', 'create', 'demo/api', source, '--target', root, '--name', 'API', '--description', '接口', '--type', 'backend']).status, 0);
  const runtime = createRuntime();
  const instance = createLocalWorkspaceServer(runtime, { targetRoot: root });
  t.after(() => instance.server.close());
  const { url, sessionToken, initialWorkspaceId } = await instance.ready;
  const apiBase = `${url}/api/v1/workspaces/${initialWorkspaceId}`;
  const list = await fetch(`${apiBase}/projects/demo/services`).then((response) => response.json());
  assert.equal(list.services[0].code, 'api');
  const detail = await fetch(`${apiBase}/projects/demo/services/api`).then((response) => response.json());
  let response = await fetch(`${apiBase}/projects/demo/services/api`, { method: 'PUT', headers: { origin: url, 'content-type': 'application/json', 'x-buildr-session': sessionToken }, body: JSON.stringify({ revision: detail.revision, name: 'From UI', description: 'Saved', type: 'application' }) });
  assert.equal(response.status, 200);
  const updated = await response.json();
  assert.equal(updated.service.name, 'From UI');
  response = await fetch(`${apiBase}/projects/demo/services/api`, { method: 'PUT', headers: { origin: url, 'content-type': 'application/json', 'x-buildr-session': sessionToken }, body: JSON.stringify({ revision: detail.revision, name: 'Stale' }) });
  assert.equal(response.status, 409);
  response = await fetch(`${apiBase}/prompts/service-create`, { method: 'POST', headers: { origin: url, 'content-type': 'application/json', 'x-buildr-session': sessionToken }, body: JSON.stringify({ projectCode: 'demo', code: 'worker', name: 'Worker', description: '任务服务', type: 'backend', sourceType: 'local', localPath: '/tmp/worker' }) });
  assert.equal(response.status, 200);
  const prompt = await response.json();
  assert.match(prompt.prompt, /标准命令 buildr service create demo\/worker/);
  assert.equal(runtime.listServices(root, 'demo').services.length, 1);
});
