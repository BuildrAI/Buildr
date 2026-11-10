import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import YAML from 'yaml';

import { createRuntime } from '../helpers/runtime-harness.ts';
import { createLocalWorkspaceServer } from '../../src/web/http/server.ts';
import { copyPreparedGitRepository, copyPreparedWorkspace, copyPreparedLegacyWorkspace } from '../helpers/prepared-fixtures.ts';

const PRODUCT_ROOT: any = path.resolve(import.meta.dirname, '../..');
const BUILDR: any = path.join(PRODUCT_ROOT, 'bin', 'buildr.mjs');

function tempRoot(t: any): any  {
  const root: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-project-product-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function run(command: any, args: any, cwd: any = PRODUCT_ROOT): any  {
  return spawnSync(command, args, { cwd, encoding: 'utf8' });
}

function runBuildr(args: any): any  {
  return run(process.execPath, [BUILDR, ...args]);
}

function initWorkspace(t: any): any  {
  return copyPreparedWorkspace(t, 'project-product').root;
}

test('Project create 写入 v2 Domain，Application 受控修改并生成 prompt', (t: any) => {
  const root: any = copyPreparedLegacyWorkspace(t, 'legacy-project-domain').root;
  let result: any = runBuildr(['project', 'create', 'demo', '--target', root, '--name', 'Demo Project', '--description', 'Project description']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /project-testing/);
  assert.match(result.stdout, /trigger: project-registered/);
  const runtime: any = createRuntime();
  const list: any = runtime.listProjects(root);
  assert.equal(list.schemaVersion, 'buildr.projects/v2');
  assert.equal(list.migrationRequired, false);
  assert.equal(list.projects.length, 1);
  assert.match(list.projects[0].id, /^[0-9a-f-]{36}$/);
  assert.equal(list.projects[0].workspaceId, runtime.getWorkspace(root).workspace.id);
  assert.equal(list.projects[0].code, 'demo');
  assert.deepEqual(list.projects[0].source, { type: 'workspace', path: 'projects/demo' });

  const updated: any = runtime.updateProjectMetadata(root, 'demo', { revision: list.revision, name: 'Renamed', description: 'Updated' });
  assert.equal(updated.project.name, 'Renamed');
  assert.throws(() => runtime.updateProjectMetadata(root, 'demo', { revision: list.revision, name: 'Stale' }), (error: any) => error.code === 'project_revision_conflict');
  assert.throws(() => runtime.updateProjectMetadata(root, 'demo', { revision: updated.revision, source: {} }), (error: any) => error.code === 'project_update_field_forbidden');


});

test('Project create 重入保留已有 v1 与 v2 Service registry', (t: any) => {
  const root: any = copyPreparedLegacyWorkspace(t, 'legacy-project-reentry').root;
  const legacyManifest: any = path.join(root, 'projects', 'legacy', 'services', 'manifest.yml');
  fs.mkdirSync(path.dirname(legacyManifest), { recursive: true });
  const legacyContent: any = [
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

  let result: any = runBuildr(['project', 'create', 'legacy', '--target', root, '--name', 'Legacy', '--description', 'Legacy project']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(legacyManifest, 'utf8'), legacyContent);

  result = runBuildr(['project', 'create', 'demo', '--target', root, '--name', 'Demo', '--description', 'Demo project']);
  assert.equal(result.status, 0, result.stderr);
  const source: any = path.join(tempRoot(t), 'source');
  fs.mkdirSync(source);
  fs.writeFileSync(path.join(source, 'README.md'), '# api\n');
  result = runBuildr(['service', 'create', 'demo/api', source, '--target', root, '--name', 'API', '--description', 'API service', '--type', 'backend']);
  assert.equal(result.status, 0, result.stderr);
  const canonicalManifest: any = path.join(root, 'projects', 'demo', 'services', 'manifest.yml');
  const canonicalContent: any = fs.readFileSync(canonicalManifest, 'utf8');

  result = runBuildr(['project', 'create', 'demo', '--target', root, '--name', 'Demo renamed', '--description', 'Updated project']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(canonicalManifest, 'utf8'), canonicalContent);
  assert.equal(createRuntime().projectDetail(root, 'demo').project.name, 'Demo renamed');
});

test('Git Project 保存 integrationBranch，实际 branch 与 dirty 状态只实时观察', (t: any) => {
  const root: any = initWorkspace(t);
  const fixture: any = copyPreparedGitRepository(t, 'project-git-source').attached;
  const url: any = `file://${fixture}`;
  const result: any = runBuildr(['project', 'create', 'git-demo', '--target', root, '--repo', url, '--remote', 'origin', '--integration-branch', 'dev', '--name', 'Git Demo', '--description', 'Git project']);
  assert.equal(result.status, 0, result.stderr);
  const runtime: any = createRuntime();
  let detail: any = runtime.projectDetail(root, 'git-demo');
  assert.equal(detail.project.source.git.integrationBranch, 'dev');
  assert.equal(detail.observed.currentBranch, 'dev');
  assert.equal(detail.comparison.findings.some((finding: any) => finding.code === 'project.git_branch_drift'), false);
  assert.equal(detail.observed.dirty, true, 'Project baseline repair is visible as actual uncommitted Git state');
  fs.writeFileSync(path.join(root, 'projects', 'git-demo', 'dirty.txt'), crypto.randomUUID());
  detail = runtime.projectDetail(root, 'git-demo');
  assert.equal(detail.observed.dirty, true);
  assert.ok(detail.comparison.findings.some((finding: any) => finding.code === 'project.git_dirty'));
  const stored: any = YAML.parse(fs.readFileSync(path.join(root, 'projects', 'manifest.yml'), 'utf8')).projects['git-demo'];
  assert.equal(stored.currentBranch, undefined);
  assert.equal(stored.dirty, undefined);

  assert.equal(run('git', ['checkout', '-b', 'task/demo'], path.join(root, 'projects', 'git-demo')).status, 0);
  const doctor: any = runBuildr(['doctor', '--target', root, '--json', '--detail', 'full']);
  const report: any = JSON.parse(doctor.stdout);
  assert.ok(report.findings.some((finding: any) => finding.code === 'project.git_branch_drift'));
  const reported: any = report.projectRegistry.projects.find((project: any) => project.code === 'git-demo');
  assert.equal(reported.source.git.integrationBranch, 'dev');
  assert.equal(reported.currentBranch, undefined);
  assert.equal(fs.existsSync(path.join(root, 'projects', 'git-demo', 'preparation.yml')), false, 'doctor does not initialize declarations');
  assert.equal(fs.existsSync(path.join(root, 'projects', 'git-demo', 'verification.yml')), false, 'doctor does not initialize declarations');
});

test('Project attach 登记外部 Git root 且不修改外部内容', (t: any) => {
  const root: any = initWorkspace(t);
  const { attached }: any = copyPreparedGitRepository(t, 'project-attach');
  const before: any = { head: run('git', ['rev-parse', 'HEAD'], attached).stdout, status: run('git', ['status', '--porcelain'], attached).stdout, readme: fs.readFileSync(path.join(attached, 'README.md'), 'utf8') };

  const result: any = runBuildr(['project', 'create', 'external', '--target', root, '--attach', attached, '--name', 'External', '--description', 'External project']);
  assert.equal(result.status, 0, result.stderr);
  const detail: any = createRuntime().projectDetail(root, 'external');
  assert.equal(detail.project.source.root, 'attached');
  assert.equal(detail.project.source.path, fs.realpathSync(attached));
  assert.equal(detail.sourceLocation.ownership, 'external');
  assert.equal(detail.observed.currentBranch, 'dev');
  assert.deepEqual({ head: run('git', ['rev-parse', 'HEAD'], attached).stdout, status: run('git', ['status', '--porcelain'], attached).stdout, readme: fs.readFileSync(path.join(attached, 'README.md'), 'utf8') }, before);
  assert.equal(fs.existsSync(path.join(attached, 'services', 'manifest.yml')), false);
  assert.equal(fs.existsSync(path.join(root, 'projects', 'external')), false);
  const inspected = runBuildr(['doctor', '--target', root, '--scope', 'projects/external', '--json', '--detail', 'full']);
  assert.ok(inspected.stdout.trim(), inspected.stderr || `Doctor exited ${inspected.status}`);
  const doctor: any = JSON.parse(inspected.stdout);
  assert.equal(doctor.projects.find((project: any) => project.code === 'external').exists, true);
  assert.equal(doctor.findings.some((finding: any) => finding.code === 'project.missing'), false);
  assert.ok(doctor.findings.every((finding: any) => finding.domain && finding.scope && finding.ownershipUnit && Array.isArray(finding.affectedActions)));
  assert.equal(doctor.health.generalWorkPermitted, null);
  assert.ok(Array.isArray(doctor.domainHealth));
  const duplicate: any = runBuildr(['project', 'create', 'duplicate', '--target', root, '--attach', attached, '--name', 'Duplicate', '--description', 'Duplicate project']);
  assert.equal(duplicate.status, 1);
  assert.match(duplicate.stderr, /already registered/);
  assert.equal(createRuntime().listProjects(root).projects.length, 1);
});

test('sync 显式把 v1 Project registry 迁移为 v2', (t: any) => {
  const root: any = initWorkspace(t);
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
  const result: any = runBuildr(['sync', 'codex', '--target', root]);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const registry: any = YAML.parse(fs.readFileSync(path.join(root, 'projects', 'manifest.yml'), 'utf8'));
  assert.equal(registry.schemaVersion, 'buildr.projects/v2');
  assert.match(registry.projects.legacy.id, /^[0-9a-f-]{36}$/);
  assert.equal(registry.projects.legacy.workspaceId, YAML.parse(fs.readFileSync(path.join(root, '.buildr', 'workspace.yml'), 'utf8')).id);
});
