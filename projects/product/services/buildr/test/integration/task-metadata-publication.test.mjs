import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';

import {
  createPublicationSnapshot,
  findEquivalentPublicationCommit,
  inspectPublicationRange,
  verifyPublicationSnapshot,
} from '../../package/targets/workspace/skills/buildr/task-metadata-publication/scripts/publication.mjs';

function git(root, args, { allowFailure = false } = {}) {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  if (result.status !== 0 && !allowFailure) throw new Error(result.stderr || `git ${args.join(' ')} failed`);
  return result;
}

function write(root, relative, content) {
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}

function fixture(t, { gitBacked = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-task-metadata-publication-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  write(root, '.buildr/workspace.yml', 'schemaVersion: buildr.workspace/v1\nid: 11111111-1111-4111-8111-111111111111\nname: Fixture\nprofile: team\n');
  write(root, 'AGENTS.md', '# fixture\n');
  if (gitBacked) {
    git(root, ['init', '-b', 'main']);
    git(root, ['config', 'user.name', 'Buildr Test']);
    git(root, ['config', 'user.email', 'buildr@example.com']);
    git(root, ['add', '.buildr/workspace.yml', 'AGENTS.md']);
    git(root, ['commit', '-m', 'initial']);
  }
  return fs.realpathSync(root);
}

const taskPaths = (task = 'demo-task') => [
  `.buildr/tasks/${task}/development.yml`,
  `.buildr/tasks/${task}/verification.yml`,
  `.buildr/tasks/${task}/reviews/planning.yml`,
  `.buildr/tasks/${task}/reviews/completion.yml`,
];

test('snapshot覆盖全部/部分/全部缺失并排除Environment、Finish、runtime与其他Task', (t) => {
  const root = fixture(t);
  const empty = createPublicationSnapshot({ workspaceRoot: root, taskId: 'demo-task', repositoryRoot: root });
  assert.equal(empty.status, 'not-applicable');
  assert.equal(empty.snapshot.absentPaths.length, 4);
  assert.deepEqual(empty.snapshot.operationPaths, []);

  write(root, taskPaths()[0], 'development: demo\n');
  write(root, taskPaths()[1], 'verification: passed\n');
  write(root, '.buildr/tasks/demo-task/task.yml', 'legacy task: excluded\n');
  write(root, '.buildr/tasks/demo-task/environment.json', '{"machine":true}\n');
  write(root, '.buildr/task-finish/run.json', '{}\n');
  write(root, '.buildr/asset-review/inbox/demo.md', '# local\n');
  write(root, '.agents/runtime.txt', 'runtime\n');
  write(root, '.buildr/tasks/other-task/task.yml', 'task: other\n');
  const partial = createPublicationSnapshot({ workspaceRoot: root, taskId: 'demo-task', repositoryRoot: root });
  assert.equal(partial.status, 'ready');
  assert.deepEqual(partial.snapshot.presentPaths, [taskPaths()[0], taskPaths()[1]]);
  assert.deepEqual(partial.snapshot.operationPaths, [taskPaths()[0], taskPaths()[1]]);

  for (const [index, recordPath] of taskPaths().entries()) write(root, recordPath, `record: ${index}\n`);
  const all = createPublicationSnapshot({ workspaceRoot: root, taskId: 'demo-task', repositoryRoot: root });
  assert.equal(all.snapshot.presentPaths.length, 4);
  assert.equal(all.snapshot.declaredPaths.some((entry) => entry.includes('environment.json') || entry.includes('other-task')), false);
});

test('snapshot只读保留unrelated dirty/staged/untracked并对occupied、symlink与ownership冲突fail closed', (t) => {
  const root = fixture(t);
  write(root, taskPaths()[0], 'development: demo\n');
  write(root, 'staged.txt', 'staged\n');
  git(root, ['add', 'staged.txt']);
  write(root, 'dirty.txt', 'dirty\n');
  const before = git(root, ['status', '--porcelain=v1']).stdout;
  const snapshot = createPublicationSnapshot({ workspaceRoot: root, taskId: 'demo-task', repositoryRoot: root });
  assert.equal(snapshot.status, 'ready');
  assert.equal(git(root, ['status', '--porcelain=v1']).stdout, before);

  fs.rmSync(path.join(root, taskPaths()[0]));
  fs.symlinkSync('missing', path.join(root, taskPaths()[0]));
  const symlink = createPublicationSnapshot({ workspaceRoot: root, taskId: 'demo-task', repositoryRoot: root });
  assert.equal(symlink.status, 'blocked');
  assert.equal(symlink.diagnostic.code, 'task_metadata_publication_path_occupied');

  const conflict = createPublicationSnapshot({
    workspaceRoot: root,
    taskId: 'demo-task',
    repositoryRoot: root,
    declarations: [
      { owner: 'writer-a/v1', path: '.buildr/tasks/<task-id>/task.yml' },
      { owner: 'writer-b/v1', path: '.buildr/tasks/<task-id>/task.yml' },
    ],
  });
  assert.equal(conflict.status, 'blocked');
  assert.equal(conflict.diagnostic.code, 'task_metadata_publication_ownership_conflict');
});

test('post-commit验证exact diff/bytes并阻止snapshot后drift', (t) => {
  const root = fixture(t);
  for (const [index, recordPath] of taskPaths().entries()) write(root, recordPath, `record: ${index}\n`);
  const snapshot = createPublicationSnapshot({ workspaceRoot: root, taskId: 'demo-task', repositoryRoot: root });
  git(root, ['add', '--', ...snapshot.snapshot.operationPaths]);
  git(root, ['commit', '-m', 'chore(task): publish metadata']);
  const commit = git(root, ['rev-parse', 'HEAD']).stdout.trim();
  const verified = verifyPublicationSnapshot({ token: snapshot.snapshot.token, commit });
  assert.equal(verified.status, 'verified');
  assert.deepEqual(verified.paths, [...snapshot.snapshot.operationPaths].sort());

  write(root, taskPaths()[1], 'verification: changed after snapshot\n');
  const drift = verifyPublicationSnapshot({ token: snapshot.snapshot.token, commit });
  assert.equal(drift.status, 'blocked');
  assert.equal(drift.diagnostic.code, 'task_metadata_publication_snapshot_drift');
  assert.deepEqual(drift.diagnostic.details.liveMismatches, [taskPaths()[1]]);
});

test('equivalent commit可安全复用且完整range阻止scope外commit', (t) => {
  const root = fixture(t);
  const target = git(root, ['rev-parse', 'HEAD']).stdout.trim();
  write(root, taskPaths()[0], 'development: demo\n');
  const snapshot = createPublicationSnapshot({ workspaceRoot: root, taskId: 'demo-task', repositoryRoot: root });
  git(root, ['add', '--', ...snapshot.snapshot.operationPaths]);
  git(root, ['commit', '-m', 'chore(task): publish metadata']);
  const metadataCommit = git(root, ['rev-parse', 'HEAD']).stdout.trim();
  const equivalent = findEquivalentPublicationCommit({ token: snapshot.snapshot.token, targetRef: target, sourceRef: metadataCommit });
  assert.equal(equivalent.status, 'reusable');
  assert.equal(equivalent.commit, metadataCommit);
  assert.equal(inspectPublicationRange({ token: snapshot.snapshot.token, targetRef: target, sourceRef: metadataCommit }).status, 'verified');

  write(root, 'delivery.txt', 'candidate source\n');
  git(root, ['add', 'delivery.txt']);
  git(root, ['commit', '-m', 'feat: delivery']);
  const outside = inspectPublicationRange({ token: snapshot.snapshot.token, targetRef: target, sourceRef: 'HEAD' });
  assert.equal(outside.status, 'blocked');
  assert.equal(outside.diagnostic.code, 'task_metadata_publication_range_outside_scope');
  assert.ok(outside.diagnostic.details.outside.some((entry) => entry.paths.includes('delivery.txt')));
  assert.equal(git(root, ['rev-parse', `${metadataCommit}^{tree}`]).status, 0, 'shared/candidate history remains untouched');
});

test('无Git返回local-only且失败不改变Task、Development或Finish bytes', (t) => {
  const root = fixture(t, { gitBacked: false });
  const task = write(root, taskPaths()[0], 'status: completed\n');
  const development = write(root, taskPaths()[1], 'candidate: stable\n');
  const finish = write(root, '.buildr/task-finish/run.json', '{"status":"done"}\n');
  const before = [task, development, finish].map((file) => fs.readFileSync(file));
  const local = createPublicationSnapshot({ workspaceRoot: root, taskId: 'demo-task' });
  assert.equal(local.status, 'local-only');
  assert.equal(local.snapshot.presentPaths.length, 2);

  fs.rmSync(task);
  fs.mkdirSync(task);
  const failed = createPublicationSnapshot({ workspaceRoot: root, taskId: 'demo-task' });
  assert.equal(failed.status, 'blocked');
  assert.deepEqual(fs.readFileSync(development), before[1]);
  assert.deepEqual(fs.readFileSync(finish), before[2]);
});

test('push rejection保留local metadata commit并允许等价重试', (t) => {
  const root = fixture(t);
  const remote = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-task-metadata-remote-'));
  t.after(() => fs.rmSync(remote, { recursive: true, force: true }));
  git(remote, ['init', '--bare']);
  git(root, ['remote', 'add', 'origin', remote]);
  git(root, ['push', '-u', 'origin', 'main']);
  const target = git(root, ['rev-parse', 'origin/main']).stdout.trim();
  write(root, taskPaths()[0], 'task: demo\n');
  const snapshot = createPublicationSnapshot({ workspaceRoot: root, taskId: 'demo-task', repositoryRoot: root });
  git(root, ['add', '--', ...snapshot.snapshot.operationPaths]);
  git(root, ['commit', '-m', 'chore(task): publish metadata']);
  const commit = git(root, ['rev-parse', 'HEAD']).stdout.trim();
  write(remote, 'hooks/pre-receive', '#!/bin/sh\nexit 1\n');
  fs.chmodSync(path.join(remote, 'hooks/pre-receive'), 0o755);
  assert.notEqual(git(root, ['push', 'origin', 'main'], { allowFailure: true }).status, 0);
  assert.equal(git(root, ['rev-parse', 'HEAD']).stdout.trim(), commit);
  assert.equal(git(root, ['rev-parse', 'origin/main']).stdout.trim(), target);
  const retry = findEquivalentPublicationCommit({ token: snapshot.snapshot.token, targetRef: 'origin/main', sourceRef: 'HEAD' });
  assert.equal(retry.status, 'reusable');
  assert.equal(retry.commit, commit);
});
