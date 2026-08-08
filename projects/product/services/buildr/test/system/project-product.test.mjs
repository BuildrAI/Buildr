import assert from 'node:assert/strict';
import crypto from 'node:crypto';
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

function tempRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-project-product-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function run(command, args, cwd = PRODUCT_ROOT) {
  return spawnSync(command, args, { cwd, encoding: 'utf8' });
}

function runBuildr(args) {
  return run(process.execPath, [BUILDR, ...args]);
}

function initWorkspace(t) {
  const root = path.join(tempRoot(t), 'workspace');
  const result = runBuildr(['init', '--target', root, '--name', 'Demo', '--description', 'Demo workspace']);
  assert.equal(result.status, 0, result.stderr);
  return root;
}

test('Project create 写入 v2 Domain，Application 受控修改并生成 prompt', (t) => {
  const root = initWorkspace(t);
  let result = runBuildr(['project', 'create', 'demo', '--target', root, '--name', 'Demo Project', '--description', 'Project description']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Next: 运行 declaration-intake Skill/);
  assert.match(result.stdout, /trigger: project-registered/);
  const runtime = createRuntime();
  const list = runtime.listProjects(root);
  assert.equal(list.schemaVersion, 'buildr.projects/v2');
  assert.equal(list.migrationRequired, false);
  assert.equal(list.projects.length, 1);
  assert.match(list.projects[0].id, /^[0-9a-f-]{36}$/);
  assert.equal(list.projects[0].workspaceId, runtime.getWorkspace(root).workspace.id);
  assert.equal(list.projects[0].code, 'demo');
  assert.deepEqual(list.projects[0].source, { type: 'workspace', path: 'projects/demo' });

  const updated = runtime.updateProjectMetadata(root, 'demo', { revision: list.revision, name: 'Renamed', description: 'Updated' });
  assert.equal(updated.project.name, 'Renamed');
  assert.throws(() => runtime.updateProjectMetadata(root, 'demo', { revision: list.revision, name: 'Stale' }), (error) => error.code === 'project_revision_conflict');
  assert.throws(() => runtime.updateProjectMetadata(root, 'demo', { revision: updated.revision, source: {} }), (error) => error.code === 'project_update_field_forbidden');

  const prompt = runtime.generateProjectCreatePrompt({ code: 'next', name: 'Next', description: 'Next project', sourceType: 'git', gitUrl: 'https://example.com/next.git', remote: 'upstream', integrationBranch: 'dev' });
  assert.match(prompt.prompt, /集成分支：dev/);
  assert.match(prompt.prompt, /不得盲目 checkout、stash 或 relink/);
  assert.match(prompt.prompt, /trigger: project-registered/);
  assert.match(prompt.prompt, /未经用户确认不得写入长期声明/);
  assert.equal(prompt.copiedMeansCreated, false);
});

test('Project create 重入保留已有 v1 与 v2 Service registry', (t) => {
  const root = initWorkspace(t);
  const legacyManifest = path.join(root, 'projects', 'legacy', 'services', 'manifest.yml');
  fs.mkdirSync(path.dirname(legacyManifest), { recursive: true });
  const legacyContent = [
    'schemaVersion: buildr.services/v1',
    'project: legacy',
    'services:',
    '  api:',
    '    title: Legacy API',
    '    description: Legacy service',
    '    type: backend',
    '    path: services/api',
    '    repo:',
    '      kind: workspace',
    '',
  ].join('\n');
  fs.writeFileSync(legacyManifest, legacyContent);

  let result = runBuildr(['project', 'create', 'legacy', '--target', root, '--name', 'Legacy', '--description', 'Legacy project']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(legacyManifest, 'utf8'), legacyContent);

  result = runBuildr(['project', 'create', 'demo', '--target', root, '--name', 'Demo', '--description', 'Demo project']);
  assert.equal(result.status, 0, result.stderr);
  const source = path.join(tempRoot(t), 'source');
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, 'README.md'), '# api\n');
  result = runBuildr(['service', 'create', 'demo/api', source, '--target', root, '--name', 'API', '--description', 'API service', '--type', 'backend']);
  assert.equal(result.status, 0, result.stderr);
  const canonicalManifest = path.join(root, 'projects', 'demo', 'services', 'manifest.yml');
  const canonicalContent = fs.readFileSync(canonicalManifest, 'utf8');

  result = runBuildr(['project', 'create', 'demo', '--target', root, '--name', 'Demo renamed', '--description', 'Updated project']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(canonicalManifest, 'utf8'), canonicalContent);
  assert.equal(createRuntime().projectDetail(root, 'demo').project.name, 'Demo renamed');
});

test('v1 Project registry 读取零写入，显式 migration 原子且幂等', (t) => {
  const root = initWorkspace(t);
  const manifest = path.join(root, 'projects', 'manifest.yml');
  fs.mkdirSync(path.join(root, 'projects', 'legacy'), { recursive: true });
  fs.writeFileSync(manifest, [
    'schemaVersion: buildr.projects/v1',
    'projects:',
    '  legacy:',
    '    title: Legacy',
    '    description: Legacy project',
    '    path: projects/legacy',
    '    repo:',
    '      kind: workspace',
    '',
  ].join('\n'));
  const before = fs.readFileSync(manifest, 'utf8');
  const runtime = createRuntime();
  const compatible = runtime.listProjects(root);
  assert.equal(compatible.migrationRequired, true);
  assert.equal(compatible.projects[0].id, null);
  assert.equal(fs.readFileSync(manifest, 'utf8'), before);

  process.env.BUILDR_FAULT_AFTER_MUTATION_WRITE = '1';
  try {
    assert.throws(() => runtime.migrateProjectRegistry(root), /Injected Buildr mutation failure/);
  } finally {
    delete process.env.BUILDR_FAULT_AFTER_MUTATION_WRITE;
  }
  assert.equal(fs.readFileSync(manifest, 'utf8'), before);

  const migrated = runtime.migrateProjectRegistry(root);
  assert.deepEqual(migrated.changed, ['projects/manifest.yml']);
  assert.equal(migrated.migrationRequired, false);
  const projectId = migrated.projects[0].id;
  assert.match(projectId, /^[0-9a-f-]{36}$/);
  assert.deepEqual(runtime.migrateProjectRegistry(root).changed, []);
  assert.equal(runtime.listProjects(root).projects[0].id, projectId);
});

test('Git Project 保存 integrationBranch，实际 branch 与 dirty 状态只实时观察', (t) => {
  const root = initWorkspace(t);
  const fixture = path.join(tempRoot(t), 'source');
  fs.mkdirSync(fixture, { recursive: true });
  assert.equal(run('git', ['init', '-b', 'dev'], fixture).status, 0);
  fs.writeFileSync(path.join(fixture, 'README.md'), '# demo\n');
  assert.equal(run('git', ['add', 'README.md'], fixture).status, 0);
  assert.equal(run('git', ['-c', 'user.name=Buildr Test', '-c', 'user.email=buildr@example.com', 'commit', '-m', 'init'], fixture).status, 0);
  const url = `file://${fixture}`;
  const result = runBuildr(['project', 'create', 'git-demo', '--target', root, '--repo', url, '--remote', 'origin', '--integration-branch', 'dev', '--name', 'Git Demo', '--description', 'Git project']);
  assert.equal(result.status, 0, result.stderr);
  const runtime = createRuntime();
  let detail = runtime.projectDetail(root, 'git-demo');
  assert.equal(detail.project.source.git.integrationBranch, 'dev');
  assert.equal(detail.observed.currentBranch, 'dev');
  assert.equal(detail.comparison.findings.some((finding) => finding.code === 'project.git_branch_drift'), false);
  assert.equal(detail.observed.dirty, true, 'Project baseline repair is visible as actual uncommitted Git state');
  fs.writeFileSync(path.join(root, 'projects', 'git-demo', 'dirty.txt'), crypto.randomUUID());
  detail = runtime.projectDetail(root, 'git-demo');
  assert.equal(detail.observed.dirty, true);
  assert.ok(detail.comparison.findings.some((finding) => finding.code === 'project.git_dirty'));
  const stored = YAML.parse(fs.readFileSync(path.join(root, 'projects', 'manifest.yml'), 'utf8')).projects['git-demo'];
  assert.equal(stored.currentBranch, undefined);
  assert.equal(stored.dirty, undefined);

  assert.equal(run('git', ['checkout', '-b', 'task/demo'], path.join(root, 'projects', 'git-demo')).status, 0);
  const doctor = runBuildr(['doctor', '--target', root, '--json', '--detail', 'full']);
  const report = JSON.parse(doctor.stdout);
  assert.ok(report.findings.some((finding) => finding.code === 'project.git_branch_drift'));
  const reported = report.projectRegistry.projects.find((project) => project.code === 'git-demo');
  assert.equal(reported.source.git.integrationBranch, 'dev');
  assert.equal(reported.currentBranch, undefined);
  assert.equal(fs.existsSync(path.join(root, 'projects', 'git-demo', 'preparation.yml')), false, 'doctor does not initialize declarations');
  assert.equal(fs.existsSync(path.join(root, 'projects', 'git-demo', 'verification.yml')), false, 'doctor does not initialize declarations');
});

test('sync 显式把 v1 Project registry 迁移为 v2', (t) => {
  const root = initWorkspace(t);
  fs.mkdirSync(path.join(root, 'projects', 'legacy'), { recursive: true });
  fs.writeFileSync(path.join(root, 'projects', 'manifest.yml'), [
    'schemaVersion: buildr.projects/v1',
    'projects:',
    '  legacy:',
    '    title: Legacy',
    '    description: Legacy project',
    '    path: projects/legacy',
    '    repo:',
    '      kind: workspace',
    '',
  ].join('\n'));
  const result = runBuildr(['sync', 'codex', '--target', root]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const registry = YAML.parse(fs.readFileSync(path.join(root, 'projects', 'manifest.yml'), 'utf8'));
  assert.equal(registry.schemaVersion, 'buildr.projects/v2');
  assert.match(registry.projects.legacy.id, /^[0-9a-f-]{36}$/);
  assert.equal(registry.projects.legacy.workspaceId, YAML.parse(fs.readFileSync(path.join(root, '.buildr', 'workspace.yml'), 'utf8')).id);
});

test('Project HTTP API 复用本机安全边界、CAS 与 prompt-only 创建', async (t) => {
  const root = initWorkspace(t);
  process.env.BUILDR_APP_DATA_DIR = path.join(path.dirname(root), 'app-data');
  t.after(() => delete process.env.BUILDR_APP_DATA_DIR);
  let result = runBuildr(['project', 'create', 'demo', '--target', root, '--name', 'Demo', '--description', 'Demo project']);
  assert.equal(result.status, 0, result.stderr);
  const runtime = createRuntime();
  const instance = createLocalWorkspaceServer(runtime, { targetRoot: root });
  t.after(() => instance.server.close());
  const { url, sessionToken, initialWorkspaceId } = await instance.ready;
  const apiBase = `${url}/api/v1/workspaces/${initialWorkspaceId}`;
  const list = await fetch(`${apiBase}/projects`).then((response) => response.json());
  assert.equal(list.projects[0].code, 'demo');
  const detail = await fetch(`${apiBase}/projects/demo`).then((response) => response.json());
  assert.equal(detail.project.name, 'Demo');

  let response = await fetch(`${apiBase}/projects/demo`, {
    method: 'PUT',
    headers: { origin: url, 'content-type': 'application/json', 'x-buildr-session': sessionToken },
    body: JSON.stringify({ revision: detail.revision, name: 'From UI', description: 'Saved' }),
  });
  assert.equal(response.status, 200);
  const updated = await response.json();
  assert.equal(updated.project.name, 'From UI');

  response = await fetch(`${apiBase}/projects/demo`, {
    method: 'PUT',
    headers: { origin: url, 'content-type': 'application/json', 'x-buildr-session': sessionToken },
    body: JSON.stringify({ revision: detail.revision, name: 'Stale' }),
  });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error.code, 'project_revision_conflict');

  response = await fetch(`${apiBase}/projects/demo`, {
    method: 'PUT',
    headers: { origin: url, 'content-type': 'application/json', 'x-buildr-session': sessionToken },
    body: JSON.stringify({ revision: updated.revision, path: '/tmp/other' }),
  });
  assert.equal(response.status, 400);

  response = await fetch(`${apiBase}/prompts/project-create`, {
    method: 'POST',
    headers: { origin: url, 'content-type': 'application/json', 'x-buildr-session': sessionToken },
    body: JSON.stringify({ code: 'next', name: 'Next', description: 'Next project', sourceType: 'workspace' }),
  });
  assert.equal(response.status, 200);
  const prompt = await response.json();
  assert.match(prompt.prompt, /canonical buildr project create/);
  assert.match(prompt.prompt, /declaration-intake Skill/);
  assert.equal(prompt.copiedMeansCreated, false);
  assert.equal(runtime.listProjects(root).projects.length, 1, 'prompt generation does not create Project');
  assert.equal(fs.existsSync(path.join(root, 'projects', 'demo', 'preparation.yml')), false, 'GET and prompt generation do not initialize declarations');
  assert.equal(fs.existsSync(path.join(root, 'projects', 'demo', 'verification.yml')), false, 'GET and prompt generation do not initialize declarations');
  assert.equal(fs.existsSync(path.join(root, 'projects', 'next')), false, 'prompt generation does not materialize candidate Project');
});
