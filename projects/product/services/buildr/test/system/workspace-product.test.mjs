import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import test from 'node:test';
import YAML from 'yaml';

import { createRuntime } from '../../src/application/compose-runtime.mjs';
import { workspaceNodeRuntimePaths } from '../../src/infrastructure/filesystem/workspace-node-runtime.mjs';
import { createLocalWorkspaceServer } from '../../src/interfaces/local-app/http/server.mjs';
import { stopPreview } from '../../src/interfaces/local-app/runtime/preview-manager.mjs';

const PRODUCT_ROOT = path.resolve(import.meta.dirname, '../..');
const BUILDR = path.join(PRODUCT_ROOT, 'bin', 'buildr.mjs');
const TEST_APP_DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-workspace-product-app-data-'));
const setupRuntime = createRuntime();
process.once('exit', () => fs.rmSync(TEST_APP_DATA, { recursive: true, force: true }));

function temporaryRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-workspace-product-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function isolateLocalAppData(t, appData) {
  const previous = process.env.BUILDR_APP_DATA_DIR;
  process.env.BUILDR_APP_DATA_DIR = appData;
  t.after(() => {
    if (previous === undefined) delete process.env.BUILDR_APP_DATA_DIR;
    else process.env.BUILDR_APP_DATA_DIR = previous;
  });
  return appData;
}

function runBuildr(args, options = {}) {
  const env = options.env || { ...process.env, BUILDR_APP_DATA_DIR: process.env.BUILDR_APP_DATA_DIR || TEST_APP_DATA };
  return spawnSync(process.execPath, [BUILDR, ...args], { cwd: PRODUCT_ROOT, encoding: 'utf8', ...options, env });
}

function initWorkspaceViaCli(t, options = {}) {
  const root = path.join(temporaryRoot(t), 'workspace');
  const result = runBuildr(['init', '--target', root, '--name', options.name || 'Demo', '--description', options.description || 'Demo workspace', '--profile', 'team'], options.env ? { env: options.env } : {});
  assert.equal(result.status, 0, result.stderr);
  return root;
}

function initWorkspace(t, options = {}) {
  if (options.env) return initWorkspaceViaCli(t, options);
  const root = path.join(temporaryRoot(t), 'workspace');
  const previousLog = console.log;
  console.log = () => {};
  try {
    setupRuntime.initBuildr(['--target', root, '--name', options.name || 'Demo', '--description', options.description || 'Demo workspace', '--profile', 'team']);
  } finally {
    console.log = previousLog;
  }
  return root;
}

function initGitWorkspace(t, options = {}) {
  const root = initWorkspace(t, options);
  execFileSync('git', ['init', '--initial-branch=dev', root], { stdio: 'ignore' });
  execFileSync('git', ['-C', root, 'config', 'user.email', 'buildr-test@example.com']);
  execFileSync('git', ['-C', root, 'config', 'user.name', 'Buildr Test']);
  execFileSync('git', ['-C', root, 'add', '.']);
  execFileSync('git', ['-C', root, 'commit', '-m', 'fixture'], { stdio: 'ignore' });
  return root;
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function writeLegacyWorkspace(root, workspaceId) {
  fs.mkdirSync(path.join(root, '.buildr'), { recursive: true });
  fs.mkdirSync(path.join(root, 'skills'), { recursive: true });
  fs.mkdirSync(path.join(root, 'projects'), { recursive: true });
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '# Fixture\n');
  fs.writeFileSync(path.join(root, '.buildr', 'workspace.yml'), 'schemaVersion: 1\nkind: organization\nname: Legacy\nprofile: team\n');
  fs.writeFileSync(path.join(root, 'skills', 'manifest.yml'), YAML.stringify({ schemaVersion: 'buildr.skills/v3', workspaceId, skills: [] }));
}

test('init 生成 canonical Workspace，并让两个 Manifest 复用同一 UUID', (t) => {
  const root = initWorkspaceViaCli(t);
  const workspace = YAML.parse(fs.readFileSync(path.join(root, '.buildr', 'workspace.yml'), 'utf8'));
  const skills = YAML.parse(fs.readFileSync(path.join(root, 'skills', 'manifest.yml'), 'utf8'));
  assert.equal(workspace.schemaVersion, 'buildr.workspace/v1');
  assert.match(workspace.id, /^[0-9a-f-]{36}$/);
  assert.equal(workspace.id, skills.workspaceId);
  assert.equal(workspace.description, 'Demo workspace');
  assert.equal(workspace.runtime.node.version, process.versions.node);
});

test('Task 本机目录在 package、init 与 sync 中整体忽略', (t) => {
  const broadEntry = '/.buildr/tasks/';
  const preciseEntry = '/.buildr/tasks/*/environment.json';
  const packageGitignore = fs.readFileSync(path.join(PRODUCT_ROOT, 'package', 'targets', 'workspace', 'gitignore'), 'utf8').split(/\r?\n/);
  assert.equal(packageGitignore.filter((line) => line === broadEntry).length, 1);
  assert.equal(packageGitignore.includes(preciseEntry), false);

  const root = initWorkspaceViaCli(t);
  const gitignore = path.join(root, '.gitignore');
  let lines = fs.readFileSync(gitignore, 'utf8').split(/\r?\n/);
  assert.equal(lines.filter((line) => line === broadEntry).length, 1);
  assert.equal(lines.includes(preciseEntry), false);

  fs.writeFileSync(gitignore, `${lines.filter((line) => line !== broadEntry).join('\n').replace(/\n*$/u, '')}\n${preciseEntry}\ncustom-user-entry\n`);
  let result = runBuildr(['sync', 'codex', '--target', root]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  lines = fs.readFileSync(gitignore, 'utf8').split(/\r?\n/);
  assert.equal(lines.filter((line) => line === broadEntry).length, 1);
  assert.equal(lines.filter((line) => line === preciseEntry).length, 1);
  assert.equal(lines.filter((line) => line === 'custom-user-entry').length, 1);

  const afterFirstSync = fs.readFileSync(gitignore, 'utf8');
  result = runBuildr(['sync', 'codex', '--target', root]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(fs.readFileSync(gitignore, 'utf8'), afterFirstSync);
});

test('doctor 只读诊断被删除的 Workspace Node，sync 按原声明恢复且不改版本', (t) => {
  const appData = path.join(temporaryRoot(t), 'node-app-data');
  const root = path.join(temporaryRoot(t), 'workspace');
  const env = { ...process.env, BUILDR_APP_DATA_DIR: appData, BUILDR_NODE_RUNTIME_DATA_DIR: appData };
  let result = runBuildr(['init', '--target', root, '--name', 'node-recovery', '--description', 'Node recovery workspace'], { env });
  assert.equal(result.status, 0, result.stderr);
  const manifest = path.join(root, '.buildr', 'workspace.yml');
  const declared = YAML.parse(fs.readFileSync(manifest, 'utf8')).runtime.node.version;
  const before = fs.readFileSync(manifest, 'utf8');
  const managed = workspaceNodeRuntimePaths(declared, { dataRoot: appData });
  fs.rmSync(managed.root, { recursive: true, force: true });

  result = runBuildr(['doctor', '--agent', 'codex', '--target', root, '--json', '--detail', 'full'], { env });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.ok(report.findings.some((finding) => finding.code === 'workspace.node_runtime_missing' && /sync/.test(finding.command)));
  assert.equal(fs.existsSync(managed.node), false, 'doctor 必须保持只读');
  assert.equal(fs.readFileSync(manifest, 'utf8'), before);

  result = runBuildr(['sync', 'codex', '--target', root], { env });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(fs.existsSync(managed.node), true);
  assert.equal(YAML.parse(fs.readFileSync(manifest, 'utf8')).runtime.node.version, declared);
  result = runBuildr(['doctor', '--agent', 'codex', '--target', root, '--json', '--detail', 'full'], { env });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(JSON.parse(result.stdout).workspaceNode.identity.version, declared);
});

test('未提供 description 时 init 写入 TODO，doctor 返回可见诊断', (t) => {
  const root = path.join(temporaryRoot(t), 'workspace');
  let result = runBuildr(['init', '--target', root, '--name', 'needs-description']);
  assert.equal(result.status, 0, result.stderr);
  result = runBuildr(['doctor', '--target', root, '--json']);
  const report = JSON.parse(result.stdout);
  assert.ok(report.findings.some((finding) => finding.code === 'workspace.description_todo'));
});

test('Workspace 应用层只修改白名单字段并防止 revision 覆盖', (t) => {
  const root = initWorkspace(t);
  const runtime = createRuntime();
  const before = runtime.getWorkspace(root);
  const updated = runtime.updateWorkspaceMetadata(root, { revision: before.revision, name: 'Renamed', description: 'Updated description' });
  assert.equal(updated.workspace.name, 'Renamed');
  assert.notEqual(updated.revision, before.revision);
  assert.throws(() => runtime.updateWorkspaceMetadata(root, { revision: before.revision, name: 'Stale' }), (error) => error.code === 'workspace_revision_conflict');
  assert.throws(() => runtime.updateWorkspaceMetadata(root, { revision: updated.revision, id: crypto.randomUUID() }), (error) => error.code === 'workspace_update_field_forbidden');
  assert.equal(runtime.getWorkspace(root).workspace.name, 'Renamed');
});

test('Getting Started projection 汇总 Workspace 范围，开始工作 prompt 再选择任务范围', (t) => {
  const root = initWorkspace(t);
  const runtime = createRuntime();
  let projection = runtime.getWorkspaceGettingStarted(root);
  assert.equal(projection.phase, 'project-empty');
  assert.equal(projection.primaryAction.type, 'project-create');
  assert.equal(runtime.listProjects(root).projects.length, 0);
  const created = runBuildr(['project', 'create', 'demo', '--target', root, '--name', 'Demo', '--description', 'Demo project']);
  assert.equal(created.status, 0, created.stderr);
  const other = runBuildr(['project', 'create', 'other', '--target', root, '--name', 'Other', '--description', 'Other project']);
  assert.equal(other.status, 0, other.stderr);
  projection = runtime.getWorkspaceGettingStarted(root);
  assert.equal(projection.phase, 'service-empty');
  assert.equal(projection.projects.length, 2);
  assert.equal(projection.services.length, 0);
  assert.equal('selectedProject' in projection, false);
  assert.throws(() => runtime.getWorkspaceGettingStarted(root, { projectCode: 'demo' }), (error) => error.code === 'workspace_getting_started_field_forbidden');
  const prompt = runtime.generateStartWorkPrompt(root, { projectCode: 'demo', goal: '先梳理项目范围' });
  assert.match(prompt.prompt, /项目：Demo（demo）/);
  assert.match(prompt.prompt, /本次不限定/);
  assert.equal(prompt.copiedMeansStarted, false);
  assert.throws(() => runtime.generateStartWorkPrompt(root, { projectCode: 'missing', goal: '不应回退' }), (error) => error.code === 'project_not_found');
  assert.throws(() => runtime.generateStartWorkPrompt(root, { projectCode: 'demo', goal: 'x', rootPath: root }), (error) => error.code === 'workspace_start_work_field_forbidden');
});

test('目录选择候选以结构化结果恢复，不在失败时写入 Registry', (t) => {
  const appData = isolateLocalAppData(t, path.join(temporaryRoot(t), 'picker-app-data'));
  const runtime = createRuntime();
  const candidate = path.join(temporaryRoot(t), 'not-initialized'); fs.mkdirSync(candidate);
  const result = runtime.inspectLocalWorkspaceCandidate(candidate, runtime.listRegisteredWorkspaces().revision);
  assert.equal(result.status, 'uninitialized');
  assert.match(result.prompt, new RegExp(candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.deepEqual(runtime.listRegisteredWorkspaces().workspaces, []);
});

test('本机 Workspace 登记只保存 root，并支持幂等登记、切换、移除和 revision CAS', (t) => {
  const appData = isolateLocalAppData(t, path.join(temporaryRoot(t), 'app-data'));
  const first = initWorkspace(t, { name: 'First' });
  const second = initWorkspace(t, { name: 'Second' });
  const runtime = createRuntime();

  let registry = runtime.listRegisteredWorkspaces();
  assert.deepEqual(registry.workspaces, []);
  const emptyRevision = registry.revision;
  registry = runtime.registerLocalWorkspace({ rootPath: first, revision: registry.revision });
  assert.equal(registry.workspaces.length, 1);
  assert.equal(registry.workspaces[0].workspace.name, 'First');
  assert.equal(registry.lastOpenedWorkspaceId, registry.workspaces[0].workspace.id);
  assert.throws(() => runtime.registerLocalWorkspace({ rootPath: second, revision: emptyRevision }), (error) => error.code === 'workspace_registry_revision_conflict');

  registry = runtime.registerLocalWorkspace({ rootPath: first, revision: registry.revision });
  assert.equal(registry.workspaces.length, 1, '重复 root 必须幂等');
  registry = runtime.registerLocalWorkspace({ rootPath: second, revision: registry.revision });
  assert.equal(registry.workspaces.length, 2);
  const secondId = registry.lastOpenedWorkspaceId;
  assert.equal(runtime.resolveRegisteredWorkspace(secondId).rootPath, second);

  const stored = JSON.parse(fs.readFileSync(path.join(appData, 'workspace-registry.json'), 'utf8'));
  assert.deepEqual(Object.keys(stored).sort(), ['lastOpenedRoot', 'roots', 'schemaVersion']);
  assert.ok(stored.roots.includes(first));
  assert.doesNotMatch(JSON.stringify(stored), /First|Second/);

  registry = runtime.removeRegisteredWorkspace({ workspaceId: secondId, revision: registry.revision });
  assert.equal(registry.workspaces.length, 1);
  assert.ok(fs.existsSync(second), '移除登记不得删除 Workspace');
});

test('本机 Workspace 登记隔离不可用 root 并阻止重复 identity', (t) => {
  const appData = isolateLocalAppData(t, path.join(temporaryRoot(t), 'app-data-conflict'));
  const first = initWorkspace(t, { name: 'Original' });
  const duplicate = path.join(temporaryRoot(t), 'duplicate');
  fs.cpSync(first, duplicate, { recursive: true });
  const runtime = createRuntime();
  let registry = runtime.listRegisteredWorkspaces();
  registry = runtime.registerLocalWorkspace({ rootPath: first, revision: registry.revision });
  assert.throws(
    () => runtime.registerLocalWorkspace({ rootPath: duplicate, revision: registry.revision }),
    (error) => error.code === 'workspace_registry_identity_conflict',
  );
  fs.rmSync(first, { recursive: true, force: true });
  registry = runtime.listRegisteredWorkspaces();
  assert.equal(registry.workspaces[0].status, 'unavailable');
});

test('legacy migration 复用 Skills UUID，失败时回滚，identity 冲突零写入', (t) => {
  const runtime = createRuntime();
  const workspaceId = crypto.randomUUID();
  const root = path.join(temporaryRoot(t), 'legacy');
  writeLegacyWorkspace(root, workspaceId);
  const metadataFile = path.join(root, '.buildr', 'workspace.yml');
  const skillsFile = path.join(root, 'skills', 'manifest.yml');
  const originalMetadata = fs.readFileSync(metadataFile, 'utf8');
  const originalSkills = fs.readFileSync(skillsFile, 'utf8');

  process.env.BUILDR_FAULT_AFTER_MUTATION_WRITE = '1';
  try {
    assert.throws(() => runtime.migrateWorkspaceMetadata(root), /Injected Buildr mutation failure/);
  } finally {
    delete process.env.BUILDR_FAULT_AFTER_MUTATION_WRITE;
  }
  assert.equal(fs.readFileSync(metadataFile, 'utf8'), originalMetadata);
  assert.equal(fs.readFileSync(skillsFile, 'utf8'), originalSkills);

  const migrated = runtime.migrateWorkspaceMetadata(root);
  assert.deepEqual(migrated.changed, ['.buildr/workspace.yml']);
  assert.equal(migrated.workspace.id, workspaceId);
  assert.equal(migrated.migrationRequired, false);
  assert.match(migrated.workspace.description, /^TODO:/);

  const conflictRoot = path.join(temporaryRoot(t), 'conflict');
  writeLegacyWorkspace(conflictRoot, crypto.randomUUID());
  const canonical = runtime.renderWorkspaceManifest({ workspace: { id: crypto.randomUUID(), name: 'Conflict', description: 'Conflict workspace', runtime: { node: { version: process.versions.node } } } });
  fs.writeFileSync(path.join(conflictRoot, '.buildr', 'workspace.yml'), canonical);
  const conflictMetadataHash = sha256(path.join(conflictRoot, '.buildr', 'workspace.yml'));
  const conflictSkillsHash = sha256(path.join(conflictRoot, 'skills', 'manifest.yml'));
  assert.throws(() => runtime.migrateWorkspaceMetadata(conflictRoot), (error) => error.code === 'workspace_identity_conflict');
  assert.equal(sha256(path.join(conflictRoot, '.buildr', 'workspace.yml')), conflictMetadataHash);
  assert.equal(sha256(path.join(conflictRoot, 'skills', 'manifest.yml')), conflictSkillsHash);
});

test('sync 显式迁移 legacy Workspace，并在 identity 冲突时保持零写入', (t) => {
  const root = initWorkspace(t, { name: 'legacy-sync' });
  const skills = YAML.parse(fs.readFileSync(path.join(root, 'skills', 'manifest.yml'), 'utf8'));
  const workspaceId = skills.workspaceId;
  fs.writeFileSync(path.join(root, '.buildr', 'workspace.yml'), 'schemaVersion: 1\nkind: organization\nname: Legacy\nprofile: team\n');
  let result = runBuildr(['sync', 'codex', '--target', root]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const migrated = YAML.parse(fs.readFileSync(path.join(root, '.buildr', 'workspace.yml'), 'utf8'));
  assert.equal(migrated.schemaVersion, 'buildr.workspace/v1');
  assert.equal(migrated.id, workspaceId);

  const conflictRoot = initWorkspace(t, { name: 'legacy-conflict' });
  const conflictSkillsFile = path.join(conflictRoot, 'skills', 'manifest.yml');
  const conflictSkills = YAML.parse(fs.readFileSync(conflictSkillsFile, 'utf8'));
  conflictSkills.workspaceId = crypto.randomUUID();
  fs.writeFileSync(conflictSkillsFile, YAML.stringify(conflictSkills));
  const before = sha256(path.join(conflictRoot, '.buildr', 'workspace.yml'));
  result = runBuildr(['sync', 'codex', '--target', conflictRoot]);
  assert.notEqual(result.status, 0);
  assert.equal(sha256(path.join(conflictRoot, '.buildr', 'workspace.yml')), before);
});

test('本地应用只监听 loopback，并保护写 API、revision 与 prompt-only 创建', async (t) => {
  const root = initWorkspace(t);
  isolateLocalAppData(t, path.join(temporaryRoot(t), 'local-app-data'));
  const runtime = createRuntime();
  const metadataFile = path.join(root, '.buildr', 'workspace.yml');
  const beforeHash = sha256(metadataFile);
  const instance = createLocalWorkspaceServer(runtime, { targetRoot: root });
  t.after(() => instance.server.close());
  const { url, sessionToken, initialWorkspaceId } = await instance.ready;
  const workspaceBase = `/workspaces/${initialWorkspaceId}`;
  const apiBase = `/api/v1/workspaces/${initialWorkspaceId}`;
  assert.match(url, /^http:\/\/127\.0\.0\.1:\d+$/);

  const html = await fetch(url).then((response) => response.text());
  assert.match(html, /Buildr 工作空间/);
  assert.match(html, /id="resource-nav-toggle"/);
  assert.match(html, /工作空间设置/);
  assert.doesNotMatch(html, /https?:\/\//);
  let response;
  for (const route of [`${workspaceBase}/`, `${workspaceBase}/settings`, `${workspaceBase}/projects`, `${workspaceBase}/projects/product`, `${workspaceBase}/services`]) {
    response = await fetch(`${url}${route}`);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /Buildr 工作空间/);
  }
  for (const asset of ['/app.js', '/api-client.js', '/router.js', '/markdown.js', '/features/workspaces.js', '/features/workspace.js', '/features/projects.js', '/features/project-detail.js', '/features/services.js', '/features/change-detail.js', '/features/agent-actions.js']) {
    response = await fetch(`${url}${asset}`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/javascript/);
  }
  response = await fetch(`${url}/unknown-page`);
  assert.equal(response.status, 404);
  response = await fetch(`${url}${workspaceBase}/projects/product/extra`);
  assert.equal(response.status, 404);
  response = await fetch(`${url}${workspaceBase}/projects/%2Ftmp`);
  assert.equal(response.status, 404);
  response = await fetch(`${url}/api/v1/unknown`);
  assert.equal(response.status, 404);
  const registry = await fetch(`${url}/api/v1/workspaces`).then((response) => response.json());
  assert.equal(registry.workspaces.length, 1);
  assert.equal(registry.workspaces[0].workspace.id, initialWorkspaceId);
  const current = await fetch(`${url}${apiBase}`).then((response) => response.json());
  assert.equal(current.workspace.name, 'Demo');
  assert.equal(sha256(metadataFile), beforeHash, '只读启动和读取不得修改 Workspace');
  const created = runBuildr(['project', 'create', 'web-demo', '--target', root, '--name', 'Web Demo', '--description', 'HTTP projection fixture']);
  assert.equal(created.status, 0, created.stderr);
  const gettingStarted = await fetch(`${url}${apiBase}/getting-started?project=missing`).then((response) => response.json());
  assert.equal(gettingStarted.phase, 'service-empty');
  assert.equal(gettingStarted.projects.length, 1);
  assert.equal('selectedProject' in gettingStarted, false);
  response = await fetch(`${url}${apiBase}/changes`);
  assert.equal(response.status, 404);

  response = await fetch(`${url}${apiBase}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', 'x-buildr-session': sessionToken },
    body: JSON.stringify({ revision: current.revision, name: 'Blocked' }),
  });
  assert.equal(response.status, 403);

  response = await fetch(`${url}${apiBase}`, {
    method: 'PUT',
    headers: { origin: url, 'content-type': 'application/json', 'x-buildr-session': 'invalid' },
    body: JSON.stringify({ revision: current.revision, name: 'Blocked' }),
  });
  assert.equal(response.status, 403);

  response = await fetch(`${url}${apiBase}`, {
    method: 'PUT',
    headers: { origin: url, 'content-type': 'text/plain', 'x-buildr-session': sessionToken },
    body: JSON.stringify({ revision: current.revision, name: 'Blocked' }),
  });
  assert.equal(response.status, 415);

  response = await fetch(`${url}/api/v1/prompts/workspace-create`, {
    method: 'POST',
    headers: { origin: url, 'content-type': 'application/json', 'x-buildr-session': sessionToken },
    body: JSON.stringify({ name: 'Large', description: 'x'.repeat(40 * 1024) }),
  });
  assert.equal(response.status, 413);

  response = await fetch(`${url}${apiBase}?path=/tmp/other`);
  assert.equal(response.status, 400);

  response = await fetch(`${url}${apiBase}`, {
    method: 'PUT',
    headers: { origin: url, 'content-type': 'application/json', 'x-buildr-session': sessionToken },
    body: JSON.stringify({ revision: current.revision, name: 'From UI', description: 'Saved by local app' }),
  });
  assert.equal(response.status, 200);
  const updated = await response.json();
  assert.equal(updated.workspace.name, 'From UI');

  response = await fetch(`${url}${apiBase}`, {
    method: 'PUT',
    headers: { origin: url, 'content-type': 'application/json', 'x-buildr-session': sessionToken },
    body: JSON.stringify({ revision: current.revision, name: 'Stale UI' }),
  });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error.code, 'workspace_revision_conflict');

  response = await fetch(`${url}/api/v1/prompts/workspace-create`, {
    method: 'POST',
    headers: { origin: url, 'content-type': 'application/json', 'x-buildr-session': sessionToken },
    body: JSON.stringify({ name: 'Next', description: 'Next workspace', targetPath: '' }),
  });
  assert.equal(response.status, 200);
  const prompt = await response.json();
  assert.match(prompt.prompt, /先读取并遵循当前可用的 Buildr Skill/);
  assert.match(prompt.prompt, /目标位置尚未指定/);
  assert.equal(prompt.copiedMeansCreated, false);
});

test('本地应用文章入口只读投影项目文章、配图和稳定错误状态', async (t) => {
  const root = initWorkspace(t);
  const appData = isolateLocalAppData(t, path.join(temporaryRoot(t), 'publication-app-data'));
  const created = runBuildr(['project', 'create', 'product', '--target', root, '--name', 'Buildr Product', '--description', '文章测试项目']);
  assert.equal(created.status, 0, created.stderr);
  const publicationRoot = path.join(root, 'projects', 'product', 'docs', 'publications');
  fs.mkdirSync(path.join(publicationRoot, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(publicationRoot, 'README.md'), '# index\n');
  fs.writeFileSync(path.join(publicationRoot, 'article.md'), '---\nid: article\ntitle: 测试文章\nstatus: published\ntargets:\n  - platform: local-app\n    status: published\n---\n\n# 测试文章\n\n![封面](assets/cover.png)\n');
  fs.writeFileSync(path.join(publicationRoot, 'assets', 'cover.png'), 'png');
  const runtime = createRuntime();
  const instance = createLocalWorkspaceServer(runtime, { targetRoot: root });
  t.after(() => instance.server.close());
  const { url, initialWorkspaceId } = await instance.ready;
  const registry = runtime.readWorkspaceRegistryPersistence();
  assert.equal(registry.file, path.join(appData, 'workspace-registry.json'));
  assert.deepEqual(registry.registry.roots, [root]);
  const apiBase = `${url}/api/v1/workspaces/${initialWorkspaceId}`;
  let response = await fetch(`${url}/workspaces/${initialWorkspaceId}/articles`);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Buildr 工作空间/);
  const list = await fetch(`${apiBase}/publications`).then((item) => item.json());
  assert.equal(list.publications[0].id, 'article');
  const detail = await fetch(`${apiBase}/publications/article`).then((item) => item.json());
  assert.match(detail.content, /assets\/cover\.png/);
  response = await fetch(`${apiBase}/publications/article/assets/assets/cover.png`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/png');
  assert.equal(await response.text(), 'png');
  response = await fetch(`${apiBase}/publications/article/assets/../../.buildr/workspace.yml`);
  assert.notEqual(response.status, 200);
  response = await fetch(`${apiBase}/publications/missing`);
  assert.equal(response.status, 404);
  response = await fetch(`${apiBase}/publications?path=/tmp/other`);
  assert.equal(response.status, 400);
});

test('全局本机应用隔离多个 Workspace，并保护 health 与退出操作', async (t) => {
  const base = temporaryRoot(t);
  isolateLocalAppData(t, path.join(base, 'global-app-data'));
  const first = initWorkspace(t, { name: 'global-first' });
  const second = initWorkspace(t, { name: 'global-second' });
  const runtime = createRuntime();
  let registry = runtime.listRegisteredWorkspaces();
  registry = runtime.registerLocalWorkspace({ rootPath: first, revision: registry.revision });
  registry = runtime.registerLocalWorkspace({ rootPath: second, revision: registry.revision });
  const [firstEntry, secondEntry] = registry.workspaces;
  let shutdown = false;
  const instance = createLocalWorkspaceServer(runtime, { instanceSecret: 'known-secret', onShutdown: () => { shutdown = true; } });
  const { url, sessionToken } = await instance.ready;

  let response = await fetch(`${url}/api/v1/health`, { headers: { 'x-buildr-instance': 'wrong' } });
  assert.equal(response.status, 403);
  response = await fetch(`${url}/api/v1/health`, { headers: { 'x-buildr-instance': 'known-secret' } });
  assert.equal(response.status, 200);

  const firstData = await fetch(`${url}/api/v1/workspaces/${firstEntry.workspace.id}`).then((item) => item.json());
  const secondData = await fetch(`${url}/api/v1/workspaces/${secondEntry.workspace.id}`).then((item) => item.json());
  assert.equal(firstData.workspace.name, 'global-first');
  assert.equal(secondData.workspace.name, 'global-second');
  response = await fetch(`${url}/api/v1/workspaces/${firstEntry.workspace.id}?root=${encodeURIComponent(second)}`);
  assert.equal(response.status, 400);
  response = await fetch(`${url}/api/v1/workspaces/00000000-0000-4000-8000-000000000000`);
  assert.equal(response.status, 404);

  response = await fetch(`${url}/api/v1/app/quit`, { method: 'POST', headers: { origin: url, 'content-type': 'application/json', 'x-buildr-session': 'wrong' }, body: '{}' });
  assert.equal(response.status, 403);
  response = await fetch(`${url}/api/v1/app/quit`, { method: 'POST', headers: { origin: url, 'content-type': 'application/json', 'x-buildr-session': sessionToken }, body: '{}' });
  assert.equal(response.status, 202);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(shutdown, true);
});

test('buildr app 重复启动复用单实例并从陈旧 runtime state 恢复', { timeout: 15_000 }, async (t) => {
  const base = temporaryRoot(t);
  const root = initWorkspace(t, { name: 'single-instance' });
  const appData = path.join(base, 'single-instance-data');
  fs.mkdirSync(appData, { recursive: true });
  fs.writeFileSync(path.join(appData, 'instance.json'), '{"schemaVersion":"buildr.local-app-instance/v1","url":"http://127.0.0.1:1","secret":"stale","pid":999999}\n');
  const env = { ...process.env, BUILDR_APP_DATA_DIR: appData };
  const child = spawn(process.execPath, [BUILDR, 'app', '--target', root, '--no-open'], { cwd: PRODUCT_ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  let errors = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  child.stderr.on('data', (chunk) => { errors += chunk; });
  t.after(() => { if (child.exitCode === null) child.kill('SIGTERM'); });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Buildr app 未就绪：${output}\n${errors}`)), 5000);
    const poll = setInterval(() => {
      if (output.includes('Buildr 本地应用：')) {
        clearTimeout(timeout);
        clearInterval(poll);
        resolve();
      }
    }, 25);
    child.once('exit', (code) => {
      if (!output.includes('Buildr 本地应用：')) {
        clearTimeout(timeout);
        clearInterval(poll);
        reject(new Error(`Buildr app 提前退出 ${code}：${errors}`));
      }
    });
  });
  const reused = spawnSync(process.execPath, [BUILDR, 'app', '--target', root, '--no-open'], { cwd: PRODUCT_ROOT, env, encoding: 'utf8', timeout: 5000 });
  assert.equal(reused.status, 0, reused.stderr);
  assert.match(reused.stdout, /Buildr 本地应用已运行/);
  child.kill('SIGTERM');
  await new Promise((resolve) => child.once('exit', resolve));
  assert.equal(fs.existsSync(path.join(appData, 'instance.json')), false);
});

test('独立 checkout preview 并行隔离、输出身份并只停止自身实例', { timeout: 20_000 }, async (t) => {
  const base = temporaryRoot(t);
  const appData = path.join(base, 'preview-data');
  const env = { ...process.env, BUILDR_APP_DATA_DIR: appData };
  const first = initGitWorkspace(t, { name: 'preview-first' });
  const second = initGitWorkspace(t, { name: 'preview-second' });
  const started = [];
  t.after(async () => {
    for (const name of started) {
      try { await stopPreview(name, { dataRoot: appData, caller: null }); } catch { /* assertion path retains diagnostic */ }
    }
  });

  const firstStart = runBuildr(['app', 'preview', 'start', 'first-task', '--target', first, '--no-open', '--json'], { env });
  assert.equal(firstStart.status, 0, firstStart.stderr);
  started.push('first-task');
  const firstPreview = JSON.parse(firstStart.stdout);
  assert.equal(firstPreview.status, 'started');
  assert.equal(firstPreview.owner.worktree, first);
  assert.equal(firstPreview.owner.branch, 'dev');
  assert.equal(firstPreview.owner.dirty, false);
  assert.equal(firstPreview.owner.taskId, null);
  assert.equal(firstPreview.owner.environmentRoot, first);
  assert.equal(firstPreview.owner.identityMode, 'standalone-checkout');
  assert.equal(firstPreview.owner.repositorySet[0].selector, 'workspace');
  assert.equal(firstPreview.owner.productCheckout, PRODUCT_ROOT);
  const firstPage = await fetch(firstPreview.url).then((response) => response.text());
  assert.match(firstPage, /first-task/);
  assert.match(firstPage, /buildr-preview/);

  const secondStart = runBuildr(['app', 'preview', 'start', 'second-task', '--target', second, '--no-open', '--json'], { env });
  assert.equal(secondStart.status, 0, secondStart.stderr);
  started.push('second-task');
  const secondPreview = JSON.parse(secondStart.stdout);
  assert.notEqual(secondPreview.url, firstPreview.url);
  assert.equal(secondPreview.owner.worktree, second);
  assert.equal(secondPreview.owner.identityMode, 'standalone-checkout');

  const collision = runBuildr(['app', 'preview', 'start', 'first-task', '--target', second, '--no-open', '--json'], { env });
  assert.notEqual(collision.status, 0);
  assert.match(collision.stderr, /正由 .* 使用/);

  const listed = runBuildr(['app', 'preview', 'list', '--json'], { env });
  assert.equal(listed.status, 0, listed.stderr);
  assert.deepEqual(JSON.parse(listed.stdout).previews.map((item) => item.instance).sort(), ['first-task', 'second-task']);

  const stopped = await stopPreview('first-task', { dataRoot: appData, caller: null });
  started.splice(started.indexOf('first-task'), 1);
  assert.equal(stopped.status, 'stopped');
  const remaining = JSON.parse(runBuildr(['app', 'preview', 'list', '--json'], { env }).stdout).previews;
  assert.deepEqual(remaining.map((item) => item.instance), ['second-task']);
  const secondPid = secondPreview.pid;
  const secondStopped = runBuildr(['app', 'preview', 'stop', 'second-task', '--json'], { env });
  assert.equal(secondStopped.status, 0, secondStopped.stderr);
  started.splice(started.indexOf('second-task'), 1);
  for (let index = 0; index < 40; index += 1) {
    try { process.kill(secondPid, 0); } catch (error) { if (error.code === 'ESRCH') break; throw error; }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.throws(() => process.kill(secondPid, 0), (error) => error.code === 'ESRCH');
});

test('public CLI 暴露 app 与 init description help', () => {
  const appHelp = runBuildr(['app', '--help']);
  assert.equal(appHelp.status, 0, appHelp.stderr);
  assert.match(appHelp.stdout, /只监听 127\.0\.0\.1/);
  const previewHelp = runBuildr(['app', 'preview', 'start', '--help']);
  assert.equal(previewHelp.status, 0, previewHelp.stderr);
  assert.match(previewHelp.stdout, /Task Environment 的任务验证工作区/);
  assert.match(previewHelp.stdout, /动态资源/);
  const initHelp = runBuildr(['init', '--help']);
  assert.equal(initHelp.status, 0, initHelp.stderr);
  assert.match(initHelp.stdout, /--description <text>/);
});
