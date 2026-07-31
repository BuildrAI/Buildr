import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const productRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const helper = path.join(productRoot, 'package/targets/workspace/skills/buildr/task-asset-review/scripts/observation.mjs');
const ID_A = '11111111-1111-4111-8111-111111111111';
const ID_B = '22222222-2222-4222-8222-222222222222';

function workspace(root, id) {
  fs.mkdirSync(path.join(root, '.buildr'), { recursive: true });
  fs.writeFileSync(path.join(root, '.buildr', 'workspace.yml'), `schemaVersion: buildr.workspace/v1\nid: ${id}\nname: Test\n`);
  fs.writeFileSync(path.join(root, '.gitignore'), '/.buildr/asset-review/\n');
}

function git(root, args) {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function initGitWorkspace(root, id = ID_A) {
  workspace(root, id);
  git(root, ['init', '-q']);
  git(root, ['config', 'user.email', 'test@example.com']);
  git(root, ['config', 'user.name', 'Buildr Test']);
  git(root, ['add', '.']);
  git(root, ['commit', '-qm', 'initial']);
}

function run(action, root, appData, extra = [], expectedStatus = 0) {
  const result = spawnSync(process.execPath, [helper, action, '--workspace-root', root, ...extra], {
    encoding: 'utf8',
    env: { ...process.env, BUILDR_APP_DATA_DIR: appData },
  });
  assert.equal(result.status, expectedStatus, result.stderr || result.stdout);
  return JSON.parse(expectedStatus === 0 ? result.stdout : result.stderr);
}

function legacyObservation({ observationId, owner = 'root-agent', workspaceId = ID_A, sourceTask = 'source-task' }) {
  const now = new Date().toISOString();
  return `---
schemaVersion: "buildr.task-asset-observation/v1"
observationId: "${observationId}"
workspaceId: "${workspaceId}"
owner: "${owner}"
status: observing
createdAt: "${now}"
updatedAt: "${now}"
source: {"task":"${sourceTask}"}
decision: null
destination: null
---

# Task Asset Observation

## Observations

- legacy finding

## Agent Review

_Pending._

## Human Decision

_Pending._

## Handoff Evidence

_Pending._
`;
}

test('不同物理 Workspace 使用各自 untracked inbox', (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-asset-observation-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const rootA = path.join(base, 'workspace-a');
  const rootB = path.join(base, 'workspace-b');
  const appData = path.join(base, 'app-data');
  workspace(rootA, ID_A);
  workspace(rootB, ID_B);

  const first = run('list', rootA, appData);
  const other = run('list', rootB, appData);
  assert.equal(first.inbox, path.join(rootA, '.buildr', 'asset-review', 'inbox'));
  assert.equal(other.inbox, path.join(rootB, '.buildr', 'asset-review', 'inbox'));
  assert.notEqual(first.inbox, other.inbox);
});

test('linked task worktree 与主 checkout 解析到同一 canonical inbox', (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-asset-observation-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const root = path.join(base, 'workspace');
  const taskRoot = path.join(base, 'task-worktree');
  const appData = path.join(base, 'app-data');
  initGitWorkspace(root);
  git(root, ['worktree', 'add', '-q', '-b', 'task/test', taskRoot]);
  fs.mkdirSync(path.join(taskRoot, 'service'), { recursive: true });

  const main = run('list', root, appData);
  const task = run('list', path.join(taskRoot, 'service'), appData);
  assert.equal(task.canonicalWorkspaceRoot, fs.realpathSync(root));
  assert.equal(task.inbox, main.inbox);
});

test('缺少根 gitignore 契约时 fail closed', (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-asset-observation-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const root = path.join(base, 'workspace');
  workspace(root, ID_A);
  fs.rmSync(path.join(root, '.gitignore'));
  const result = run('list', root, path.join(base, 'app-data'), [], 1);
  assert.equal(result.error.code, 'observation_gitignore_missing');
});

test('lifecycle 约束结构化审查、独立 handoff 与完成证据', (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-asset-observation-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const root = path.join(base, 'workspace');
  const appData = path.join(base, 'app-data');
  workspace(root, ID_A);
  const identity = ['--observation-id', 'task-1', '--owner', 'root-agent'];

  const started = run('start', root, appData, [...identity, '--source', '{"task":"source-task"}']);
  assert.equal(started.observation.status, 'observing');
  assert.equal(fs.statSync(started.file).mode & 0o777, 0o600);
  const mismatch = run('observe', root, appData, ['--observation-id', 'task-1', '--owner', 'other-agent', '--message', 'bad'], 1);
  assert.equal(mismatch.error.code, 'observation_owner_mismatch');

  run('observe', root, appData, [...identity, '--message', 'stable finding', '--evidence', 'test']);
  const completeCoverage = run('finalize', root, appData, [...identity, '--candidate-type', 'skill', '--coverage', 'complete', '--evidence-summary', 'covered', '--review', 'no candidate'], 1);
  assert.equal(completeCoverage.error.code, 'asset_observation_invalid');
  const finalized = run('finalize', root, appData, [...identity, '--candidate-type', 'skill', '--coverage', 'partial', '--evidence-summary', 'missing lifecycle', '--review', 'skill candidate']);
  assert.equal(finalized.observation.status, 'awaiting-human');
  const accepted = run('accept', root, appData, [...identity, '--candidate-type', 'skill', '--summary', 'improve provider']);
  assert.equal(accepted.observation.status, 'accepted');
  const sameTask = run('handoff', root, appData, [...identity, '--destination', '{"task":"source-task","sourceTask":"source-task","assetType":"skill","assetId":"task-asset-review"}'], 1);
  assert.equal(sameTask.error.code, 'observation_handoff_invalid');
  run('handoff', root, appData, [...identity, '--destination', '{"task":"asset-task","sourceTask":"source-task","assetType":"skill","assetId":"task-asset-review"}']);
  const premature = run('complete', root, appData, [...identity, '--outcome', 'no-change'], 1);
  assert.equal(premature.error.code, 'asset_observation_invalid');
  run('complete', root, appData, [...identity, '--outcome', 'no-change', '--completion', '{"task":"asset-task","conclusion":"existing skill already covers it","evidenceReference":"review report"}']);
  assert.equal(fs.existsSync(started.file), false);
  assert.equal(fs.readdirSync(path.dirname(started.file)).some((name) => name.endsWith('.tmp')), false);
});

test('discard 与 reject 都精确删除且不创建 tombstone', (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-asset-observation-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const root = path.join(base, 'workspace');
  const appData = path.join(base, 'app-data');
  workspace(root, ID_A);

  const discardIdentity = ['--observation-id', 'task-discard', '--owner', 'root-agent'];
  const discarded = run('start', root, appData, [...discardIdentity, '--source', '{"task":"source-task"}']);
  const result = run('discard', root, appData, [...discardIdentity, '--review', 'complete coverage; no candidate']);
  assert.equal(result.result, 'discarded');
  assert.equal(fs.existsSync(discarded.file), false);

  const rejectIdentity = ['--observation-id', 'task-reject', '--owner', 'root-agent'];
  const rejected = run('start', root, appData, [...rejectIdentity, '--source', '{"task":"reject-source"}']);
  run('finalize', root, appData, [...rejectIdentity, '--candidate-type', 'product-followup', '--coverage', 'absent', '--evidence-summary', 'missing product support', '--review', 'product candidate']);
  run('reject', root, appData, rejectIdentity);
  assert.equal(fs.existsSync(rejected.file), false);
  assert.deepEqual(run('list', root, appData).files, []);
});

test('匹配的 legacy observation 迁移，内容冲突时 fail closed', (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-asset-observation-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const root = path.join(base, 'workspace');
  const appData = path.join(base, 'app-data');
  workspace(root, ID_A);
  const legacyInbox = path.join(appData, 'asset-review', ID_A, 'inbox');
  fs.mkdirSync(legacyInbox, { recursive: true });
  const source = path.join(legacyInbox, 'legacy-task.md');
  fs.writeFileSync(source, legacyObservation({ observationId: 'legacy-task' }));

  const migrated = run('list', root, appData);
  assert.equal(migrated.migration[0].result, 'migrated');
  assert.equal(fs.existsSync(source), false);
  assert.equal(fs.existsSync(path.join(root, '.buildr', 'asset-review', 'inbox', 'legacy-task.md')), true);

  fs.mkdirSync(legacyInbox, { recursive: true });
  const conflictSource = path.join(legacyInbox, 'legacy-task.md');
  fs.writeFileSync(conflictSource, legacyObservation({ observationId: 'legacy-task', sourceTask: 'different-task' }));
  const conflict = run('list', root, appData, [], 1);
  assert.equal(conflict.error.code, 'observation_migration_conflict');
  assert.equal(fs.existsSync(conflictSource), true);
});

test('asset-integrated completion 核验 tracked record 与 remote integration', (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-asset-observation-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const root = path.join(base, 'workspace');
  const appData = path.join(base, 'app-data');
  initGitWorkspace(root);
  const identity = ['--observation-id', 'asset-observation', '--owner', 'root-agent'];
  run('start', root, appData, [...identity, '--source', '{"task":"source-task"}']);
  run('finalize', root, appData, [...identity, '--candidate-type', 'skill', '--coverage', 'partial', '--evidence-summary', 'missing behavior', '--review', 'skill candidate']);
  run('accept', root, appData, [...identity, '--candidate-type', 'skill', '--summary', 'improve skill']);
  run('handoff', root, appData, [...identity, '--destination', '{"task":"asset-task","sourceTask":"source-task","assetType":"skill","assetId":"task-asset-review"}']);

  const relativeRecord = 'asset-maintenance/skills/task-asset-review/records/asset-observation.md';
  const record = path.join(root, relativeRecord);
  fs.mkdirSync(path.dirname(record), { recursive: true });
  fs.writeFileSync(record, 'observationId: asset-observation\n');
  git(root, ['add', relativeRecord]);
  git(root, ['commit', '-qm', 'asset update']);
  const commit = git(root, ['rev-parse', 'HEAD']);
  git(root, ['update-ref', 'refs/remotes/origin/dev', commit]);
  const completion = JSON.stringify({ task: 'asset-task', assetType: 'skill', assetId: 'task-asset-review', maintenanceRecord: relativeRecord, commit, targetBranch: 'dev', remoteRef: 'refs/remotes/origin/dev' });
  run('complete', root, appData, [...identity, '--outcome', 'asset-integrated', '--completion', completion]);
  assert.deepEqual(run('list', root, appData).files, []);
});

test('product-absorbed completion 核验匹配 change 的 proposal 或 design', (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-asset-observation-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const root = path.join(base, 'workspace');
  const appData = path.join(base, 'app-data');
  workspace(root, ID_A);
  const identity = ['--observation-id', 'product-observation', '--owner', 'root-agent'];
  run('start', root, appData, [...identity, '--source', '{"task":"source-task"}']);
  run('finalize', root, appData, [...identity, '--candidate-type', 'product-followup', '--coverage', 'absent', '--evidence-summary', 'missing product support', '--review', 'product candidate']);
  run('accept', root, appData, [...identity, '--candidate-type', 'product-followup', '--summary', 'add product support']);
  run('handoff', root, appData, [...identity, '--destination', '{"task":"product-task","sourceTask":"source-task","change":"asset-review-product"}']);

  const relativeArtifact = 'projects/product/openspec/changes/asset-review-product/proposal.md';
  fs.mkdirSync(path.dirname(path.join(root, relativeArtifact)), { recursive: true });
  fs.writeFileSync(path.join(root, relativeArtifact), '# Proposal\n\nSource: product-observation\n');
  const wrong = run('complete', root, appData, [...identity, '--outcome', 'product-absorbed', '--completion', JSON.stringify({ task: 'product-task', change: 'different-change', artifact: relativeArtifact })], 1);
  assert.equal(wrong.error.code, 'observation_evidence_invalid');
  run('complete', root, appData, [...identity, '--outcome', 'product-absorbed', '--completion', JSON.stringify({ task: 'product-task', change: 'asset-review-product', artifact: relativeArtifact })]);
  assert.deepEqual(run('list', root, appData).files, []);
});

test('product-absorbed completion 接受 Task Finish 已归档 Change 的证据', (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-asset-observation-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const root = path.join(base, 'workspace');
  const appData = path.join(base, 'app-data');
  workspace(root, ID_A);
  const identity = ['--observation-id', 'archived-product-observation', '--owner', 'root-agent'];
  run('start', root, appData, [...identity, '--source', '{"task":"source-task"}']);
  run('finalize', root, appData, [...identity, '--candidate-type', 'product-followup', '--coverage', 'absent', '--evidence-summary', 'missing product support', '--review', 'product candidate']);
  run('accept', root, appData, [...identity, '--candidate-type', 'product-followup', '--summary', 'add product support']);
  run('handoff', root, appData, [...identity, '--destination', '{"task":"product-task","sourceTask":"source-task","change":"asset-review-product"}']);

  const relativeArtifact = 'projects/product/openspec/changes/archive/2026-07-28-asset-review-product/design.md';
  fs.mkdirSync(path.dirname(path.join(root, relativeArtifact)), { recursive: true });
  fs.writeFileSync(path.join(root, relativeArtifact), '# Design\n');
  run('complete', root, appData, [...identity, '--outcome', 'product-absorbed', '--completion', JSON.stringify({ task: 'product-task', change: 'asset-review-product', artifact: relativeArtifact })]);
  assert.deepEqual(run('list', root, appData).files, []);
});
