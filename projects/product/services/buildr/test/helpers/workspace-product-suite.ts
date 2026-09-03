import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import test from 'node:test';
import YAML from 'yaml';

import { createRuntime } from '../../src/bootstrap/runtime.ts';
import { createLocalWorkspaceServer } from '../../src/web/http/server.ts';
import { stopPreview } from '../../src/web/application/preview-lifecycle.ts';
import { copyPreparedWorkspace } from './prepared-fixtures.ts';

export function registerWorkspaceProductSuite(selectedSuite: any): any  {

const PRODUCT_ROOT: any = path.resolve(import.meta.dirname, '../..');
const BUILDR: any = path.join(PRODUCT_ROOT, 'bin', 'buildr.mjs');
const APP_PROCESS_TIMEOUT_MS: any = 60_000;
const APP_COMMAND_TIMEOUT_MS: any = 15_000;

function temporaryRoot(t: any): any  {
  const root: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-workspace-product-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function isolateBuildrWebData(t: any, appData: any): any  {
  const previous: any = process.env.BUILDR_APP_DATA_DIR;
  process.env.BUILDR_APP_DATA_DIR = appData;
  t.after(() => {
    if (previous === undefined) delete process.env.BUILDR_APP_DATA_DIR;
    else process.env.BUILDR_APP_DATA_DIR = previous;
  });
  return appData;
}

function runBuildr(args: any, options: any = {}): any  {
  const targetIndex: any = args.indexOf('--target');
  const targetRoot: any = targetIndex >= 0 ? args[targetIndex + 1] : null;
  const scopedAppData: any = options.env || process.env.BUILDR_APP_DATA_DIR
    ? null
    : targetRoot
      ? path.join(path.dirname(path.resolve(targetRoot)), 'app-data')
      : fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-workspace-product-command-'));
  const transientAppData: any = scopedAppData && !targetRoot ? scopedAppData : null;
  const env: any = options.env || { ...process.env, ...(scopedAppData ? { BUILDR_APP_DATA_DIR: scopedAppData } : {}) };
  try {
    return spawnSync(process.execPath, [BUILDR, ...args], { cwd: PRODUCT_ROOT, encoding: 'utf8', ...options, env });
  } finally {
    if (transientAppData) fs.rmSync(transientAppData, { recursive: true, force: true });
  }
}

function initWorkspaceViaCli(t: any, options: any = {}): any  {
  const root: any = path.join(temporaryRoot(t), 'workspace');
  const result: any = runBuildr(['init', '--target', root, '--name', options.name || 'Demo', '--description', options.description || 'Demo workspace', '--profile', 'team'], options.env ? { env: options.env } : {});
  assert.equal(result.status, 0, result.stderr);
  return root;
}

function initWorkspace(t: any, options: any = {}): any  {
  if (options.env) return initWorkspaceViaCli(t, options);
  if (selectedSuite === 'manifest-registry' && !options.freshIdentity) {
    const root: any = copyPreparedWorkspace(t, `workspace-${options.name || 'manifest'}`).root;
    const runtime: any = createRuntime();
    const current: any = runtime.getWorkspace(root);
    runtime.updateWorkspaceMetadata(root, {
      revision: current.revision,
      name: options.name || 'Demo',
      description: options.description || 'Demo workspace',
    });
    return root;
  }
  const root: any = path.join(temporaryRoot(t), 'workspace');
  const previousLog: any = console.log;
  console.log = () => {};
  try {
    createRuntime().initBuildr(['--target', root, '--name', options.name || 'Demo', '--description', options.description || 'Demo workspace', '--profile', 'team']);
  } finally {
    console.log = previousLog;
  }
  return root;
}

function initGitWorkspace(t: any, options: any = {}): any  {
  const root: any = initWorkspace(t, options);
  execFileSync('git', ['init', '--initial-branch=dev', root], { stdio: 'ignore' });
  execFileSync('git', ['-C', root, 'config', 'user.email', 'buildr-test@example.com']);
  execFileSync('git', ['-C', root, 'config', 'user.name', 'Buildr Test']);
  execFileSync('git', ['-C', root, 'add', '.']);
  execFileSync('git', ['-C', root, 'commit', '-m', 'fixture'], { stdio: 'ignore' });
  return root;
}

function sha256(file: any): any  {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function writeLegacyWorkspace(root: any, workspaceId: any): any  {
  fs.mkdirSync(path.join(root, '.buildr'), { recursive: true });
  fs.mkdirSync(path.join(root, 'skills'), { recursive: true });
  fs.mkdirSync(path.join(root, 'projects'), { recursive: true });
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '# Fixture\n');
  fs.writeFileSync(path.join(root, '.buildr', 'workspace.yml'), 'schemaVersion: 1\nkind: organization\nname: Legacy\nprofile: team\n');
  fs.writeFileSync(path.join(root, 'skills', 'manifest.yml'), YAML.stringify({ schemaVersion: 'buildr.skills/v3', workspaceId, skills: [] }));
}

const suiteTest: any = (suite: any, ...args: any[]) => {
  if (suite === selectedSuite) test(...args);
};

suiteTest('manifest-registry', 'init 生成 canonical Workspace，并让两个 Manifest 复用同一 UUID', (t: any) => {
  const root: any = initWorkspaceViaCli(t);
  const workspace: any = YAML.parse(fs.readFileSync(path.join(root, '.buildr', 'workspace.yml'), 'utf8'));
  const skills: any = YAML.parse(fs.readFileSync(path.join(root, 'skills', 'manifest.yml'), 'utf8'));
  assert.equal(workspace.schemaVersion, 'buildr.workspace/v1');
  assert.match(workspace.id, /^[0-9a-f-]{36}$/);
  assert.equal(workspace.id, skills.workspaceId);
  assert.equal(workspace.description, 'Demo workspace');
  assert.equal(Object.hasOwn(workspace, 'runtime'), false);
});

suiteTest('manifest-registry', 'Task 本机目录在 package、init 与 sync 中整体忽略', (t: any) => {
  const broadEntry: any = '/.buildr/tasks/';
  const packageGitignore: any = fs.readFileSync(path.join(PRODUCT_ROOT, 'resources', 'workspace', 'gitignore'), 'utf8').split(/\r?\n/);
  assert.equal(packageGitignore.filter((line: any) => line === broadEntry).length, 1);

  const root: any = initWorkspaceViaCli(t);
  const gitignore: any = path.join(root, '.gitignore');
  let lines: any = fs.readFileSync(gitignore, 'utf8').split(/\r?\n/);
  assert.equal(lines.filter((line: any) => line === broadEntry).length, 1);

  fs.writeFileSync(gitignore, `${lines.filter((line: any) => line !== broadEntry).join('\n').replace(/\n*$/u, '')}\ncustom-user-entry\n`);
  let result: any = runBuildr(['sync', 'codex', '--target', root]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  lines = fs.readFileSync(gitignore, 'utf8').split(/\r?\n/);
  assert.equal(lines.filter((line: any) => line === broadEntry).length, 1);
  assert.equal(lines.filter((line: any) => line === 'custom-user-entry').length, 1);

  const afterFirstSync: any = fs.readFileSync(gitignore, 'utf8');
  result = runBuildr(['sync', 'codex', '--target', root]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(fs.readFileSync(gitignore, 'utf8'), afterFirstSync);
});

suiteTest('manifest-registry', 'Skill 投射所有权回执 runtime state 在 package、init 与 sync 中整体忽略', (t: any) => {
  const entry: any = '/.buildr/agent-runtime/';
  const packageGitignore: any = fs.readFileSync(path.join(PRODUCT_ROOT, 'resources', 'workspace', 'gitignore'), 'utf8').split(/\r?\n/);
  assert.equal(packageGitignore.filter((line: any) => line === entry).length, 1);

  const root: any = initWorkspaceViaCli(t);
  const gitignore: any = path.join(root, '.gitignore');
  let lines: any = fs.readFileSync(gitignore, 'utf8').split(/\r?\n/);
  assert.equal(lines.filter((line: any) => line === entry).length, 1);

  fs.writeFileSync(gitignore, `${lines.filter((line: any) => line !== entry).join('\n').replace(/\n*$/u, '')}\ncustom-user-entry\n`);
  const result: any = runBuildr(['sync', 'codex', '--target', root]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  lines = fs.readFileSync(gitignore, 'utf8').split(/\r?\n/);
  assert.equal(lines.filter((line: any) => line === entry).length, 1);
  assert.equal(lines.includes('custom-user-entry'), true);
});

suiteTest('manifest-registry', '项目每日演进目录在 package、init 与 sync 中整体忽略', (t: any) => {
  const entry: any = '/.buildr/daily-progress/';
  const packageGitignore: any = fs.readFileSync(path.join(PRODUCT_ROOT, 'resources', 'workspace', 'gitignore'), 'utf8').split(/\r?\n/);
  assert.equal(packageGitignore.filter((line: any) => line === entry).length, 1);
  assert.equal(packageGitignore.includes('/.buildr/'), false);

  const root: any = initWorkspaceViaCli(t);
  const gitignore: any = path.join(root, '.gitignore');
  let lines: any = fs.readFileSync(gitignore, 'utf8').split(/\r?\n/);
  assert.equal(lines.filter((line: any) => line === entry).length, 1);

  fs.writeFileSync(gitignore, `${lines.filter((line: any) => line !== entry).join('\n').replace(/\n*$/u, '')}\ncustom-user-entry\n`);
  const result: any = runBuildr(['sync', 'codex', '--target', root]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  lines = fs.readFileSync(gitignore, 'utf8').split(/\r?\n/);
  assert.equal(lines.filter((line: any) => line === entry).length, 1);
  assert.equal(lines.includes('custom-user-entry'), true);
  assert.equal(lines.includes('/.buildr/'), false);
});

suiteTest('runtime-recovery', 'legacy runtime.node 不影响健康，sync 移除声明且不删除已有本机文件', (t: any) => {
  const appData: any = path.join(temporaryRoot(t), 'node-app-data');
  const root: any = path.join(temporaryRoot(t), 'workspace');
  const env: any = { ...process.env, BUILDR_APP_DATA_DIR: appData };
  let result: any = runBuildr(['init', '--target', root, '--name', 'node-recovery', '--description', 'Node recovery workspace'], { env });
  assert.equal(result.status, 0, result.stderr);
  const manifest: any = path.join(root, '.buildr', 'workspace.yml');
  fs.appendFileSync(manifest, `runtime:\n  node:\n    version: ${process.versions.node}\n`);
  const retainedRuntime: any = path.join(appData, 'runtimes', 'node', process.versions.node, 'retained-runtime.txt');
  fs.mkdirSync(path.dirname(retainedRuntime), { recursive: true });
  fs.writeFileSync(retainedRuntime, 'keep');

  result = runBuildr(['doctor', '--agent', 'codex', '--target', root, '--json', '--detail', 'full'], { env });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const report: any = JSON.parse(result.stdout);
  assert.equal(report.findings.some((finding: any) => /node_runtime/u.test(finding.code)), false);
  assert.equal(Object.hasOwn(report, 'workspaceNode'), false);
  assert.equal(fs.readFileSync(retainedRuntime, 'utf8'), 'keep');

  result = runBuildr(['sync', 'codex', '--target', root], { env });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(Object.hasOwn(YAML.parse(fs.readFileSync(manifest, 'utf8')), 'runtime'), false);
  assert.equal(fs.readFileSync(retainedRuntime, 'utf8'), 'keep');
  result = runBuildr(['doctor', '--agent', 'codex', '--target', root, '--json', '--detail', 'full'], { env });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(Object.hasOwn(JSON.parse(result.stdout), 'workspaceNode'), false);
});

suiteTest('manifest-registry', '未提供 description 时 init 写入 TODO，doctor 返回可见诊断', (t: any) => {
  const root: any = path.join(temporaryRoot(t), 'workspace');
  let result: any = runBuildr(['init', '--target', root, '--name', 'needs-description']);
  assert.equal(result.status, 0, result.stderr);
  result = runBuildr(['doctor', '--target', root, '--json']);
  const report: any = JSON.parse(result.stdout);
  assert.ok(report.findings.some((finding: any) => finding.code === 'workspace.description_todo'));
});

suiteTest('manifest-registry', 'Workspace 应用层只修改白名单字段并防止 revision 覆盖', (t: any) => {
  const root: any = initWorkspace(t);
  const runtime: any = createRuntime();
  const before: any = runtime.getWorkspace(root);
  const updated: any = runtime.updateWorkspaceMetadata(root, { revision: before.revision, name: 'Renamed', description: 'Updated description' });
  assert.equal(updated.workspace.name, 'Renamed');
  assert.notEqual(updated.revision, before.revision);
  assert.throws(() => runtime.updateWorkspaceMetadata(root, { revision: before.revision, name: 'Stale' }), (error: any) => error.code === 'workspace_revision_conflict');
  assert.throws(() => runtime.updateWorkspaceMetadata(root, { revision: updated.revision, id: crypto.randomUUID() }), (error: any) => error.code === 'workspace_update_field_forbidden');
  assert.equal(runtime.getWorkspace(root).workspace.name, 'Renamed');
});

suiteTest('manifest-registry', 'Getting Started projection 汇总 Workspace 范围，开始工作 prompt 再选择任务范围', (t: any) => {
  const root: any = initWorkspace(t);
  const runtime: any = createRuntime();
  let projection: any = runtime.getWorkspaceGettingStarted(root);
  assert.equal(projection.phase, 'project-empty');
  assert.equal(projection.primaryAction.type, 'project-create');
  assert.equal(runtime.listProjects(root).projects.length, 0);
  const created: any = runBuildr(['project', 'create', 'demo', '--target', root, '--name', 'Demo', '--description', 'Demo project']);
  assert.equal(created.status, 0, created.stderr);
  const other: any = runBuildr(['project', 'create', 'other', '--target', root, '--name', 'Other', '--description', 'Other project']);
  assert.equal(other.status, 0, other.stderr);
  projection = runtime.getWorkspaceGettingStarted(root);
  assert.equal(projection.phase, 'service-empty');
  assert.equal(projection.projects.length, 2);
  assert.equal(projection.services.length, 0);
  assert.equal('selectedProject' in projection, false);
  assert.throws(() => runtime.getWorkspaceGettingStarted(root, { projectCode: 'demo' }), (error: any) => error.code === 'workspace_getting_started_field_forbidden');
  const prompt: any = runtime.generateStartWorkPrompt(root, { projectCode: 'demo', goal: '先梳理项目范围' });
  assert.match(prompt.prompt, /项目：Demo（demo）/);
  assert.match(prompt.prompt, /本次不限定/);
  assert.match(prompt.prompt, /trigger: first-task-scope/);
  assert.match(prompt.prompt, /scope: project:demo/);
  assert.doesNotMatch(prompt.prompt, /service:demo\//);
  assert.match(prompt.prompt, /routine-maintenance或user-decision-required/);
  assert.match(prompt.prompt, /改变长期适用性时请求用户确认/);
  assert.equal(prompt.copiedMeansStarted, false);
  assert.throws(() => runtime.generateStartWorkPrompt(root, { projectCode: 'missing', goal: '不应回退' }), (error: any) => error.code === 'project_not_found');
  assert.throws(() => runtime.generateStartWorkPrompt(root, { projectCode: 'demo', goal: 'x', rootPath: root }), (error: any) => error.code === 'workspace_start_work_field_forbidden');
});

suiteTest('manifest-registry', '目录选择候选以结构化结果恢复，不在失败时写入 Registry', (t: any) => {
  const appData: any = isolateBuildrWebData(t, path.join(temporaryRoot(t), 'picker-app-data'));
  const runtime: any = createRuntime();
  const candidate: any = path.join(temporaryRoot(t), 'not-initialized'); fs.mkdirSync(candidate);
  const result: any = runtime.inspectLocalWorkspaceCandidate(candidate, runtime.listRegisteredWorkspaces().revision);
  assert.equal(result.status, 'uninitialized');
  assert.match(result.prompt, new RegExp(candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.deepEqual(runtime.listRegisteredWorkspaces().workspaces, []);
});

suiteTest('manifest-registry', '本机 Workspace 登记只保存 root，并支持幂等登记、切换、移除和 revision CAS', (t: any) => {
  const appData: any = isolateBuildrWebData(t, path.join(temporaryRoot(t), 'app-data'));
  const first: any = initWorkspace(t, { name: 'First', freshIdentity: true });
  const second: any = initWorkspace(t, { name: 'Second', freshIdentity: true });
  const runtime: any = createRuntime();

  let registry: any = runtime.listRegisteredWorkspaces();
  assert.deepEqual(registry.workspaces, []);
  const emptyRevision: any = registry.revision;
  registry = runtime.registerLocalWorkspace({ rootPath: first, revision: registry.revision });
  assert.equal(registry.workspaces.length, 1);
  assert.equal(registry.workspaces[0].workspace.name, 'First');
  assert.equal(registry.lastOpenedWorkspaceId, registry.workspaces[0].workspace.id);
  assert.throws(() => runtime.registerLocalWorkspace({ rootPath: second, revision: emptyRevision }), (error: any) => error.code === 'workspace_registry_revision_conflict');

  registry = runtime.registerLocalWorkspace({ rootPath: first, revision: registry.revision });
  assert.equal(registry.workspaces.length, 1, '重复 root 必须幂等');
  registry = runtime.registerLocalWorkspace({ rootPath: second, revision: registry.revision });
  assert.equal(registry.workspaces.length, 2);
  const secondId: any = registry.lastOpenedWorkspaceId;
  assert.equal(runtime.resolveRegisteredWorkspace(secondId).rootPath, second);

  const stored: any = JSON.parse(fs.readFileSync(path.join(appData, 'workspace-registry.json'), 'utf8'));
  assert.deepEqual(Object.keys(stored).sort(), ['lastOpenedRoot', 'roots', 'schemaVersion']);
  assert.ok(stored.roots.includes(first));
  assert.doesNotMatch(JSON.stringify(stored), /First|Second/);

  registry = runtime.removeRegisteredWorkspace({ workspaceId: secondId, revision: registry.revision });
  assert.equal(registry.workspaces.length, 1);
  assert.ok(fs.existsSync(second), '移除登记不得删除 Workspace');
});

suiteTest('manifest-registry', '本机 Workspace 登记隔离不可用 root 并阻止重复 identity', (t: any) => {
  const appData: any = isolateBuildrWebData(t, path.join(temporaryRoot(t), 'app-data-conflict'));
  const first: any = initWorkspace(t, { name: 'Original', freshIdentity: true });
  const duplicate: any = path.join(temporaryRoot(t), 'duplicate');
  fs.cpSync(first, duplicate, { recursive: true });
  const runtime: any = createRuntime();
  let registry: any = runtime.listRegisteredWorkspaces();
  registry = runtime.registerLocalWorkspace({ rootPath: first, revision: registry.revision });
  assert.throws(
    () => runtime.registerLocalWorkspace({ rootPath: duplicate, revision: registry.revision }),
    (error: any) => error.code === 'workspace_registry_identity_conflict',
  );
  fs.rmSync(first, { recursive: true, force: true });
  registry = runtime.listRegisteredWorkspaces();
  assert.equal(registry.workspaces[0].status, 'unavailable');
});

suiteTest('manifest-registry', 'legacy migration 复用 Skills UUID，失败时回滚，identity 冲突零写入', (t: any) => {
  const runtime: any = createRuntime();
  const workspaceId: any = crypto.randomUUID();
  const root: any = path.join(temporaryRoot(t), 'legacy');
  writeLegacyWorkspace(root, workspaceId);
  const metadataFile: any = path.join(root, '.buildr', 'workspace.yml');
  const skillsFile: any = path.join(root, 'skills', 'manifest.yml');
  const originalMetadata: any = fs.readFileSync(metadataFile, 'utf8');
  const originalSkills: any = fs.readFileSync(skillsFile, 'utf8');

  process.env.BUILDR_FAULT_AFTER_MUTATION_WRITE = '1';
  try {
    assert.throws(() => runtime.migrateWorkspaceMetadata(root), /Injected Buildr mutation failure/);
  } finally {
    delete process.env.BUILDR_FAULT_AFTER_MUTATION_WRITE;
  }
  assert.equal(fs.readFileSync(metadataFile, 'utf8'), originalMetadata);
  assert.equal(fs.readFileSync(skillsFile, 'utf8'), originalSkills);

  const migrated: any = runtime.migrateWorkspaceMetadata(root);
  assert.deepEqual(migrated.changed, ['.buildr/workspace.yml']);
  assert.equal(migrated.workspace.id, workspaceId);
  assert.equal(migrated.migrationRequired, false);
  assert.match(migrated.workspace.description, /^TODO:/);

  const conflictRoot: any = path.join(temporaryRoot(t), 'conflict');
  writeLegacyWorkspace(conflictRoot, crypto.randomUUID());
  const canonical: any = runtime.renderWorkspaceManifest({ workspace: { id: crypto.randomUUID(), name: 'Conflict', description: 'Conflict workspace', runtime: { node: { version: process.versions.node } } } });
  fs.writeFileSync(path.join(conflictRoot, '.buildr', 'workspace.yml'), canonical);
  const conflictMetadataHash: any = sha256(path.join(conflictRoot, '.buildr', 'workspace.yml'));
  const conflictSkillsHash: any = sha256(path.join(conflictRoot, 'skills', 'manifest.yml'));
  assert.throws(() => runtime.migrateWorkspaceMetadata(conflictRoot), (error: any) => error.code === 'workspace_identity_conflict');
  assert.equal(sha256(path.join(conflictRoot, '.buildr', 'workspace.yml')), conflictMetadataHash);
  assert.equal(sha256(path.join(conflictRoot, 'skills', 'manifest.yml')), conflictSkillsHash);
});

suiteTest('manifest-registry', 'sync 显式迁移 legacy Workspace，并在 identity 冲突时保持零写入', (t: any) => {
  const root: any = initWorkspace(t, { name: 'legacy-sync' });
  const skills: any = YAML.parse(fs.readFileSync(path.join(root, 'skills', 'manifest.yml'), 'utf8'));
  const workspaceId: any = skills.workspaceId;
  fs.writeFileSync(path.join(root, '.buildr', 'workspace.yml'), 'schemaVersion: 1\nkind: organization\nname: Legacy\nprofile: team\n');
  let result: any = runBuildr(['sync', 'codex', '--target', root]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const migrated: any = YAML.parse(fs.readFileSync(path.join(root, '.buildr', 'workspace.yml'), 'utf8'));
  assert.equal(migrated.schemaVersion, 'buildr.workspace/v1');
  assert.equal(migrated.id, workspaceId);

  const conflictRoot: any = initWorkspace(t, { name: 'legacy-conflict' });
  const conflictSkillsFile: any = path.join(conflictRoot, 'skills', 'manifest.yml');
  const conflictSkills: any = YAML.parse(fs.readFileSync(conflictSkillsFile, 'utf8'));
  conflictSkills.workspaceId = crypto.randomUUID();
  fs.writeFileSync(conflictSkillsFile, YAML.stringify(conflictSkills));
  const before: any = sha256(path.join(conflictRoot, '.buildr', 'workspace.yml'));
  result = runBuildr(['sync', 'codex', '--target', conflictRoot]);
  assert.notEqual(result.status, 0);
  assert.equal(sha256(path.join(conflictRoot, '.buildr', 'workspace.yml')), before);
});

suiteTest('buildr-web-http', 'Buildr Web Runtime 只监听 loopback，并保护写 API、revision 与 prompt-only 创建', async (t: any) => {
  const root: any = initWorkspace(t);
  isolateBuildrWebData(t, path.join(temporaryRoot(t), 'local-app-data'));
  const runtime: any = createRuntime();
  const metadataFile: any = path.join(root, '.buildr', 'workspace.yml');
  const beforeHash: any = sha256(metadataFile);
  const instance: any = createLocalWorkspaceServer(runtime, { targetRoot: root });
  t.after(() => instance.server.close());
  const { url, sessionToken, initialWorkspaceId }: any = await instance.ready;
  const workspaceBase: any = `/workspaces/${initialWorkspaceId}`;
  const apiBase: any = `/api/v1/workspaces/${initialWorkspaceId}`;
  assert.match(url, /^http:\/\/127\.0\.0\.1:\d+$/);

  const html: any = await fetch(url).then((response: any) => response.text());
  assert.match(html, /<title>Buildr Web<\/title>/);
  assert.match(html, /id="root"/);
  assert.match(html, /\/assets\/index-[^"]+\.js/);
  assert.match(html, /\/assets\/index-[^"]+\.css/);
  assert.doesNotMatch(html, /https?:\/\//);
  let response: any;
  for (const route of [`${workspaceBase}/`, `${workspaceBase}/settings`, `${workspaceBase}/projects`, `${workspaceBase}/projects/product`, `${workspaceBase}/services`]) {
    response = await fetch(`${url}${route}`);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /<title>Buildr Web<\/title>/);
  }
  const assetMatches: any = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((match: any) => match[1]);
  assert.ok(assetMatches.length >= 2, 'SPA shell must reference built web-dist assets');
  for (const asset of assetMatches) {
    response = await fetch(`${url}${asset}`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), asset.endsWith('.css') ? /text\/css/ : /(?:text|application)\/javascript/);
  }
  response = await fetch(`${url}/app.js`);
  assert.equal(response.status, 404);
  response = await fetch(`${url}/unknown-page`);
  assert.equal(response.status, 404);
  response = await fetch(`${url}${workspaceBase}/projects/product/extra`);
  assert.equal(response.status, 404);
  response = await fetch(`${url}${workspaceBase}/projects/%2Ftmp`);
  assert.equal(response.status, 404);
  response = await fetch(`${url}/api/v1/unknown`);
  assert.equal(response.status, 404);
  const registry: any = await fetch(`${url}/api/v1/workspaces`).then((response: any) => response.json());
  assert.equal(registry.workspaces.length, 1);
  assert.equal(registry.workspaces[0].workspace.id, initialWorkspaceId);
  const current: any = await fetch(`${url}${apiBase}`).then((response: any) => response.json());
  assert.equal(current.workspace.name, 'Demo');
  assert.equal(sha256(metadataFile), beforeHash, '只读启动和读取不得修改 Workspace');
  const created: any = runBuildr(['project', 'create', 'web-demo', '--target', root, '--name', 'Web Demo', '--description', 'HTTP projection fixture']);
  assert.equal(created.status, 0, created.stderr);
  const gettingStarted: any = await fetch(`${url}${apiBase}/getting-started?project=missing`).then((response: any) => response.json());
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
    body: JSON.stringify({ revision: current.revision, name: 'From UI', description: 'Saved by Buildr Web' }),
  });
  assert.equal(response.status, 200);
  const updated: any = await response.json();
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
  const prompt: any = await response.json();
  assert.match(prompt.prompt, /先读取并遵循当前可用的 Buildr Skill/);
  assert.match(prompt.prompt, /目标位置尚未指定/);
  assert.equal(prompt.copiedMeansCreated, false);
});

suiteTest('buildr-web-http', 'Buildr Web 文章入口只读投影项目文章、配图和稳定错误状态', async (t: any) => {
  const root: any = initWorkspace(t);
  const appData: any = isolateBuildrWebData(t, path.join(temporaryRoot(t), 'publication-app-data'));
  const created: any = runBuildr(['project', 'create', 'product', '--target', root, '--name', 'Buildr Product', '--description', '文章测试项目']);
  assert.equal(created.status, 0, created.stderr);
  const publicationRoot: any = path.join(root, 'projects', 'product', 'docs', 'publications');
  fs.mkdirSync(path.join(publicationRoot, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(publicationRoot, 'README.md'), '# index\n');
  fs.writeFileSync(path.join(publicationRoot, 'article.md'), '---\nid: article\ntitle: 测试文章\nstatus: published\ntargets:\n  - platform: local-app\n    status: published\n---\n\n# 测试文章\n\n![封面](assets/cover.png)\n');
  fs.writeFileSync(path.join(publicationRoot, 'assets', 'cover.png'), 'png');
  const runtime: any = createRuntime();
  const instance: any = createLocalWorkspaceServer(runtime, { targetRoot: root });
  t.after(() => instance.server.close());
  const { url, initialWorkspaceId }: any = await instance.ready;
  const registry: any = runtime.readWorkspaceRegistryPersistence();
  assert.equal(registry.file, path.join(appData, 'workspace-registry.json'));
  assert.deepEqual(registry.registry.roots, [root]);
  const apiBase: any = `${url}/api/v1/workspaces/${initialWorkspaceId}`;
  let response: any = await fetch(`${url}/workspaces/${initialWorkspaceId}/articles`);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /<title>Buildr Web<\/title>/);
  const list: any = await fetch(`${apiBase}/publications`).then((item: any) => item.json());
  assert.equal(list.publications[0].id, 'article');
  const detail: any = await fetch(`${apiBase}/publications/article`).then((item: any) => item.json());
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

suiteTest('buildr-web-http', '全局 Buildr Web Runtime 隔离多个 Workspace，并保护 health 与退出操作', async (t: any) => {
  const base: any = temporaryRoot(t);
  isolateBuildrWebData(t, path.join(base, 'global-app-data'));
  const first: any = initWorkspace(t, { name: 'global-first' });
  const second: any = initWorkspace(t, { name: 'global-second' });
  const runtime: any = createRuntime();
  let registry: any = runtime.listRegisteredWorkspaces();
  registry = runtime.registerLocalWorkspace({ rootPath: first, revision: registry.revision });
  registry = runtime.registerLocalWorkspace({ rootPath: second, revision: registry.revision });
  const [firstEntry, secondEntry]: any = registry.workspaces;
  let shutdown: any = false;
  const instance: any = createLocalWorkspaceServer(runtime, { instanceSecret: 'known-secret', onShutdown: () => { shutdown = true; } });
  const { url, sessionToken }: any = await instance.ready;

  let response: any = await fetch(`${url}/api/v1/health`, { headers: { 'x-buildr-instance': 'wrong' } });
  assert.equal(response.status, 403);
  response = await fetch(`${url}/api/v1/health`, { headers: { 'x-buildr-instance': 'known-secret' } });
  assert.equal(response.status, 200);

  const firstData: any = await fetch(`${url}/api/v1/workspaces/${firstEntry.workspace.id}`).then((item: any) => item.json());
  const secondData: any = await fetch(`${url}/api/v1/workspaces/${secondEntry.workspace.id}`).then((item: any) => item.json());
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
  await new Promise((resolve: any) => setTimeout(resolve, 20));
  assert.equal(shutdown, true);
});

suiteTest('app-process', 'buildr web 重复启动复用单实例并从陈旧 runtime state 恢复', { timeout: APP_PROCESS_TIMEOUT_MS }, async (t: any) => {
  const base: any = temporaryRoot(t);
  const root: any = initWorkspace(t, { name: 'single-instance' });
  const appData: any = path.join(base, 'single-instance-data');
  fs.mkdirSync(appData, { recursive: true });
  fs.writeFileSync(path.join(appData, 'instance.json'), '{"schemaVersion":"buildr.local-app-instance/v1","url":"http://127.0.0.1:1","secret":"stale","pid":999999}\n');
  const env: any = { ...process.env, BUILDR_APP_DATA_DIR: appData };
  const child: any = spawn(process.execPath, [BUILDR, 'web', '--target', root, '--no-open'], { cwd: PRODUCT_ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let output: any = '';
  let errors: any = '';
  child.stdout.on('data', (chunk: any) => { output += chunk; });
  child.stderr.on('data', (chunk: any) => { errors += chunk; });
  t.after(() => { if (child.exitCode === null) child.kill('SIGTERM'); });
  await new Promise((resolve: any, reject: any) => {
    const timeout: any = setTimeout(() => reject(new Error(`Buildr Web 未就绪：${output}\n${errors}`)), APP_COMMAND_TIMEOUT_MS);
    const poll: any = setInterval(() => {
      if (output.includes('Buildr Web：')) {
        clearTimeout(timeout);
        clearInterval(poll);
        resolve();
      }
    }, 25);
    child.once('exit', (code: any) => {
      if (!output.includes('Buildr Web：')) {
        clearTimeout(timeout);
        clearInterval(poll);
        reject(new Error(`Buildr Web 提前退出 ${code}：${errors}`));
      }
    });
  });
  const reused: any = spawnSync(process.execPath, [BUILDR, 'web', '--target', root, '--no-open'], { cwd: PRODUCT_ROOT, env, encoding: 'utf8', timeout: APP_COMMAND_TIMEOUT_MS });
  assert.equal(reused.status, 0, reused.stderr || reused.error?.message || `signal=${reused.signal}`);
  assert.match(reused.stdout, /Buildr Web 已运行/);
  child.kill('SIGTERM');
  await new Promise((resolve: any) => child.once('exit', resolve));
  if (process.platform === 'win32') {
    fs.rmSync(path.join(appData, 'instance.json'), { force: true });
  } else {
    assert.equal(fs.existsSync(path.join(appData, 'instance.json')), false);
  }
});

suiteTest('app-process', '独立 checkout preview 并行隔离、输出身份并只停止自身实例', { timeout: APP_PROCESS_TIMEOUT_MS }, async (t: any) => {
  const started: any[] = [];
  const timings: any[] = [];
  let currentPhase: any = 'setup';
  let appData: any;
  t.after(async () => {
    const cleanupStartedAt: any = performance.now();
    const errors: any[] = [];
    for (const name of started) {
      try { await stopPreview(name, { dataRoot: appData, caller: null }); } catch (error: any) {
        if (error.code !== 'preview_not_found') errors.push(error);
      }
    }
    timings.push(`cleanup=${Math.round(performance.now() - cleanupStartedAt)}ms`);
    t.diagnostic(`[preview-isolation-timing] current=${currentPhase} ${timings.join(' ')}`);
    if (errors.length) throw new AggregateError(errors, '预览测试进程清理失败');
  });

  const base: any = temporaryRoot(t);
  appData = path.join(base, 'preview-data');
  const env: any = { ...process.env, BUILDR_APP_DATA_DIR: appData };
  const measure: any = async (phase: any, operation: any) => {
    currentPhase = phase;
    const startedAt: any = performance.now();
    try {
      return await operation();
    } finally {
      timings.push(`${phase}=${Math.round(performance.now() - startedAt)}ms`);
    }
  };
  const runPreviewCommand: any = (phase: any, args: any) => measure(phase, () => runBuildr(args, { env, timeout: APP_COMMAND_TIMEOUT_MS }));
  const first: any = await measure('workspace-first', () => initGitWorkspace(t, { name: 'preview-first' }));
  const second: any = await measure('workspace-second', () => initGitWorkspace(t, { name: 'preview-second' }));
  started.push('first-task');
  const firstStart: any = await runPreviewCommand('start-first', ['web', 'preview', 'start', 'first-task', '--target', first, '--no-open', '--json']);
  assert.equal(firstStart.status, 0, firstStart.stderr);
  const firstPreview: any = JSON.parse(firstStart.stdout);
  assert.equal(firstPreview.status, 'started');
  assert.equal(firstPreview.owner.worktree, first);
  assert.equal(firstPreview.owner.branch, 'dev');
  assert.equal(firstPreview.owner.dirty, false);
  assert.equal(firstPreview.owner.taskId, null);
  assert.equal(firstPreview.owner.identityMode, 'standalone-checkout');
  assert.equal(firstPreview.owner.repositorySet[0].selector, 'workspace');
  assert.equal(firstPreview.owner.productCheckout, PRODUCT_ROOT);
  const firstPage: any = await measure('fetch-first', () => fetch(firstPreview.url).then((response: any) => response.text()));
  assert.match(firstPage, /first-task/);
  assert.match(firstPage, /buildr-preview/);

  started.push('second-task');
  const secondStart: any = await runPreviewCommand('start-second', ['web', 'preview', 'start', 'second-task', '--target', second, '--no-open', '--json']);
  assert.equal(secondStart.status, 0, secondStart.stderr);
  const secondPreview: any = JSON.parse(secondStart.stdout);
  assert.notEqual(secondPreview.url, firstPreview.url);
  assert.equal(secondPreview.owner.worktree, second);
  assert.equal(secondPreview.owner.identityMode, 'standalone-checkout');

  const collision: any = await runPreviewCommand('reject-collision', ['web', 'preview', 'start', 'first-task', '--target', second, '--no-open', '--json']);
  assert.notEqual(collision.status, 0);
  assert.match(collision.stderr, /无法证明属于当前 worktree/);

  const listed: any = await runPreviewCommand('list-both', ['web', 'preview', 'list', '--json']);
  assert.equal(listed.status, 0, listed.stderr);
  assert.deepEqual(JSON.parse(listed.stdout).previews.map((item: any) => item.instance).sort(), ['first-task', 'second-task']);

  const stopped: any = await measure('stop-first', () => stopPreview('first-task', { dataRoot: appData, caller: null }));
  started.splice(started.indexOf('first-task'), 1);
  assert.equal(stopped.status, 'stopped');
  const remainingResult: any = await runPreviewCommand('list-remaining', ['web', 'preview', 'list', '--json']);
  assert.equal(remainingResult.status, 0, remainingResult.stderr);
  const remaining: any = JSON.parse(remainingResult.stdout).previews;
  assert.deepEqual(remaining.map((item: any) => item.instance), ['second-task']);
  const secondPid: any = secondPreview.pid;
  const secondStopped: any = await runPreviewCommand('stop-second', ['web', 'preview', 'stop', 'second-task', '--json']);
  assert.equal(secondStopped.status, 0, secondStopped.stderr);
  started.splice(started.indexOf('second-task'), 1);
  await measure('confirm-second-exit', async () => {
    for (let index: any = 0; index < 40; index += 1) {
      try { process.kill(secondPid, 0); } catch (error: any) { if (error.code === 'ESRCH') break; throw error; }
      await new Promise((resolve: any) => setTimeout(resolve, 25));
    }
  });
  assert.throws(() => process.kill(secondPid, 0), (error: any) => error.code === 'ESRCH');
  currentPhase = 'completed';
});

suiteTest('manifest-registry', 'public CLI 暴露 web 与 init description help', () => {
  const appHelp: any = runBuildr(['web', '--help']);
  assert.equal(appHelp.status, 0, appHelp.stderr);
  assert.match(appHelp.stdout, /只监听 127\.0\.0\.1/);
  const previewHelp: any = runBuildr(['web', 'preview', 'start', '--help']);
  assert.equal(previewHelp.status, 0, previewHelp.stderr);
  assert.match(previewHelp.stdout, /Task 的受管 Git Worktree/);
  assert.match(previewHelp.stdout, /预览能力保存精确 owner/);
  const initHelp: any = runBuildr(['init', '--help']);
  assert.equal(initHelp.status, 0, initHelp.stderr);
  assert.match(initHelp.stdout, /--description <text>/);
});
}
