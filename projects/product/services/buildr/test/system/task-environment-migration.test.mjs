import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import test, { after } from 'node:test';
import { pathToFileURL } from 'node:url';

import { materializeCleanProductSource } from '../helpers/clean-product-source.mjs';

const SOURCE_PRODUCT_ROOT = path.resolve(import.meta.dirname, '../..');
const managerFixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-clean-migration-manager-'));
const { root: PRODUCT_ROOT, cli: BUILDR } = materializeCleanProductSource(SOURCE_PRODUCT_ROOT, path.join(managerFixtureRoot, 'product'));
const { createRuntime } = await import(pathToFileURL(path.join(PRODUCT_ROOT, 'src', 'application', 'compose-runtime.mjs')).href);

after(() => fs.rmSync(managerFixtureRoot, { recursive: true, force: true }));

function command(cwd, executable, args) {
  const result = spawnSync(executable, args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, `${executable} ${args.join(' ')}\n${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

function buildr(args) {
  return command(PRODUCT_ROOT, process.execPath, [BUILDR, ...args]);
}

function legacyRepository(root, taskId, { live = true } = {}) {
  const checkoutPath = path.join(root, '.worktrees', taskId);
  const branch = `codex/${taskId}`;
  if (live) command(root, 'git', ['worktree', 'add', '-b', branch, checkoutPath, 'dev']);
  return {
    selector: 'workspace',
    entityType: 'workspace',
    sourcePath: '.',
    sourceRepository: root,
    checkoutPath,
    branch,
    startPoint: 'dev',
    head: live ? command(checkoutPath, 'git', ['rev-parse', 'HEAD']) : null,
    clean: live ? true : null,
    remote: null,
    remoteUrl: null,
    state: live ? 'ready' : 'missing',
    blocked: null,
  };
}

function writeLegacyReceipt(directory, root, taskId, repository, overrides = {}) {
  const receipt = {
    schemaVersion: 'buildr.task-environment-receipt/v1',
    taskId,
    workspaceRoot: root,
    environmentRoot: path.join(root, '.worktrees', taskId),
    agent: 'codex',
    state: 'ready',
    isolation: 'git-worktree',
    planDigest: `legacy-${taskId}`,
    repositories: [repository],
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
  const file = path.join(directory, `${taskId}.json`);
  fs.writeFileSync(file, `${JSON.stringify(receipt, null, 2)}\n`);
  return { file, bytes: fs.readFileSync(file) };
}

test('一次性迁移完整覆盖 A/B/C/D，D 类全局零迁移后 A/B/C 原子清退旧 authority', { timeout: 45_000 }, async (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-task-environment-migration-'));
  const appData = path.join(base, 'app-data');
  const previousAppData = process.env.BUILDR_APP_DATA_DIR;
  process.env.BUILDR_APP_DATA_DIR = appData;
  t.after(() => {
    if (previousAppData === undefined) delete process.env.BUILDR_APP_DATA_DIR;
    else process.env.BUILDR_APP_DATA_DIR = previousAppData;
    fs.rmSync(base, { recursive: true, force: true });
  });

  const rootInput = path.join(base, 'workspace');
  buildr(['init', '--target', rootInput, '--name', 'migration', '--description', 'Task Environment migration fixture', '--profile', 'team']);
  command(rootInput, 'git', ['init', '-b', 'dev']);
  command(rootInput, 'git', ['config', 'user.name', 'Buildr Test']);
  command(rootInput, 'git', ['config', 'user.email', 'buildr-test@example.com']);
  command(rootInput, 'git', ['add', '.']);
  command(rootInput, 'git', ['commit', '-m', 'baseline']);
  const root = fs.realpathSync(rootInput);

  buildr(['task', 'create', 'legacy-a', '--title', 'Legacy A', '--intent', 'migrate formal environment', '--target', root]);
  command(root, 'git', ['add', '.buildr/tasks/legacy-a/task.yml']);
  command(root, 'git', ['commit', '-m', 'create formal legacy task']);

  const common = path.resolve(root, command(root, 'git', ['rev-parse', '--git-common-dir']));
  const legacyRoot = path.join(common, 'buildr', 'task-environments');
  const adoptions = path.join(legacyRoot, 'adoptions');
  fs.mkdirSync(adoptions, { recursive: true });
  const fixtures = {
    A: writeLegacyReceipt(legacyRoot, root, 'legacy-a', legacyRepository(root, 'legacy-a')),
    B: writeLegacyReceipt(legacyRoot, root, 'legacy-b', legacyRepository(root, 'legacy-b')),
    C: writeLegacyReceipt(legacyRoot, root, 'legacy-c', legacyRepository(root, 'legacy-c', { live: false })),
    D: writeLegacyReceipt(legacyRoot, root, 'legacy-d', legacyRepository(root, 'legacy-d', { live: false })),
  };
  for (const taskId of ['legacy-a', 'legacy-b', 'legacy-c']) {
    fs.writeFileSync(path.join(adoptions, `${taskId}.json`), `${JSON.stringify({ schemaVersion: 'buildr.task-environment-adoption-receipt/v1', taskId }, null, 2)}\n`);
  }
  const invalidAdoption = path.join(adoptions, 'legacy-d.json');
  fs.writeFileSync(invalidAdoption, '{"schemaVersion":"wrong"}\n');
  const orphanAdoption = path.join(adoptions, 'legacy-orphan.json');
  fs.writeFileSync(orphanAdoption, `${JSON.stringify({ schemaVersion: 'buildr.task-environment-adoption-receipt/v1', taskId: 'legacy-orphan' }, null, 2)}\n`);
  const linkedReceipt = path.join(legacyRoot, 'legacy-linked.json');
  fs.symlinkSync(path.basename(fixtures.C.file), linkedReceipt);

  const runtime = createRuntime();
  const planned = runtime.migrateLegacyTaskEnvironments(root, { apply: false });
  assert.equal(planned.status, 'blocked');
  assert.deepEqual(planned.counts, { total: 6, A: 1, B: 1, C: 2, D: 2 });
  assert.deepEqual(Object.fromEntries(planned.entries.map((entry) => [entry.taskId, entry.classification])), { 'legacy-a': 'A', 'legacy-b': 'B', 'legacy-c': 'C', 'legacy-d': 'D', 'legacy-linked': 'D', 'legacy-orphan': 'C' });

  const blocked = runtime.migrateLegacyTaskEnvironments(root, { apply: true });
  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.diagnostic.code, 'task_environment_legacy_identity_conflict');
  for (const fixture of Object.values(fixtures)) assert.deepEqual(fs.readFileSync(fixture.file), fixture.bytes);
  assert.equal(fs.existsSync(orphanAdoption), true);
  assert.equal(fs.existsSync(path.join(root, '.buildr', 'tasks', 'legacy-a', 'environment.json')), false);
  assert.equal(runtime.readGitWorktreeEvidence(root, 'legacy-b', { optional: true }), null);

  fs.rmSync(fixtures.D.file);
  fs.rmSync(invalidAdoption);
  fs.rmSync(linkedReceipt);
  const optionalBuiltin = path.join(root, 'skills', 'buildr', 'task-triage', 'SKILL.md');
  const optionalBuiltinBytes = fs.readFileSync(optionalBuiltin);
  fs.appendFileSync(optionalBuiltin, '\n本地冲突不得被 sync 覆盖。\n');
  const conflictedSync = spawnSync(process.execPath, [BUILDR, 'sync', 'codex', '--target', root], { cwd: PRODUCT_ROOT, encoding: 'utf8' });
  assert.notEqual(conflictedSync.status, 0);
  assert.match(`${conflictedSync.stderr}\n${conflictedSync.stdout}`, /optional Buildr 内置能力需要用户决策/);
  for (const taskId of ['legacy-a', 'legacy-b', 'legacy-c']) assert.equal(fs.existsSync(path.join(legacyRoot, `${taskId}.json`)), true, 'source preflight 通过前不得迁移旧 authority');
  assert.equal(fs.existsSync(orphanAdoption), true);
  assert.equal(fs.existsSync(path.join(root, '.buildr', 'tasks', 'legacy-a', 'environment.json')), false);
  assert.equal(runtime.readGitWorktreeEvidence(root, 'legacy-b', { optional: true }), null);
  fs.writeFileSync(optionalBuiltin, optionalBuiltinBytes);

  const migrated = runtime.migrateLegacyTaskEnvironments(root, { apply: true });
  assert.equal(migrated.status, 'migrated', JSON.stringify(migrated, null, 2));
  assert.deepEqual(migrated.counts, { total: 4, A: 1, B: 1, C: 2, D: 0 });
  for (const taskId of ['legacy-a', 'legacy-b', 'legacy-c']) {
    assert.equal(fs.existsSync(path.join(legacyRoot, `${taskId}.json`)), false);
    assert.equal(fs.existsSync(path.join(adoptions, `${taskId}.json`)), false);
  }
  assert.equal(fs.existsSync(orphanAdoption), false);

  const environment = runtime.inspectTaskEnvironment(root, 'legacy-a');
  assert.equal(environment.status, 'ready');
  assert.equal(environment.environment.status, 'ready');
  assert.equal(environment.environment.scopes[0].provider.capability, 'buildr.git-worktree-provider/v1');
  const aEvidence = runtime.readGitWorktreeEvidence(root, 'legacy-a').evidence;
  assert.equal(aEvidence.schemaVersion, 'buildr.git-worktree-evidence/v1');

  const bEvidence = runtime.readGitWorktreeEvidence(root, 'legacy-b').evidence;
  assert.equal(bEvidence.schemaVersion, 'buildr.git-worktree-evidence/v1');
  assert.deepEqual(Object.keys(bEvidence.repositories[0]).sort(), ['branch', 'checkoutPath', 'clean', 'diagnostic', 'entityType', 'head', 'registered', 'remote', 'remoteUrl', 'selector', 'sourcePath', 'sourceRepository', 'startPoint', 'state'].sort());
  assert.equal(Object.hasOwn(bEvidence.repositories[0], 'blocked'), false);
  assert.equal(fs.existsSync(path.join(root, '.buildr', 'tasks', 'legacy-b')), false, 'B 类不得创建正式 Task 或 Environment Receipt');
  assert.equal(runtime.readGitWorktreeEvidence(root, 'legacy-c', { optional: true }), null);

  buildr(['task', 'abandon', 'legacy-a', '--reason', 'migration fixture complete', '--target', root]);
  const cleanedA = await runtime.cleanupTaskEnvironment(root, 'legacy-a');
  assert.equal(cleanedA.status, 'cleaned');
  const cleanedB = runtime.cleanupGitWorktrees({ workspaceRoot: root, taskId: 'legacy-b', allowDirty: true });
  assert.equal(cleanedB.status, 'cleaned');
});
