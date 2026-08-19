import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { resolveTaskFinishDeliveryRemote } from '../../src/application/task-finish/task-finish-delivery-remote.mjs';
import { resolveTaskFinishTargetBranch } from '../../src/application/task-finish/task-finish-delivery-target.mjs';
import { createTaskFinishProductHandlers } from '../../src/application/task-finish/task-finish-product-executor.mjs';
import { createIsolatedGitCarrier, observeGitTaskContribution } from '../../src/application/task-finish/git-task-contribution.mjs';
import { createTaskFinishSqliteRuntime, persistTaskFinishRun } from '../helpers/task-finish-sqlite-fixture.mjs';

function command(cwd, executable, args) {
  const result = spawnSync(executable, args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, `${executable} ${args.join(' ')}\n${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

function writeExecutable(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  fs.chmodSync(file, 0o755);
}

function repositoryFixture(t) {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-task-finish-remote-'));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  const seed = path.join(fixture, 'seed');
  const remote = path.join(fixture, 'remote.git');
  const retained = path.join(fixture, 'workspace');
  fs.mkdirSync(seed);
  fs.writeFileSync(path.join(seed, 'AGENTS.md'), '# Finish remote test fixture\n');
  fs.mkdirSync(path.join(seed, 'projects'), { recursive: true });
  fs.writeFileSync(path.join(seed, 'projects', 'manifest.yml'), 'schemaVersion: buildr.projects/v2\nprojects: {}\n');
  command(seed, 'git', ['init', '-b', 'dev']);
  command(seed, 'git', ['config', 'user.name', 'Buildr Remote Test']);
  command(seed, 'git', ['config', 'user.email', 'remote@example.com']);
  fs.writeFileSync(path.join(seed, '.gitignore'), '/.buildr/\n/.worktrees/\n');
  fs.writeFileSync(path.join(seed, 'README.md'), '# baseline\n');
  writeExecutable(path.join(seed, 'projects', 'product', 'buildr'), '#!/usr/bin/env node\nconsole.log(JSON.stringify({ health: { ready: true }, findings: [] }));\n');
  command(seed, 'git', ['add', 'AGENTS.md', 'projects/manifest.yml', '.gitignore', 'README.md', 'projects/product/buildr']);
  command(seed, 'git', ['commit', '-m', 'baseline']);
  command(fixture, 'git', ['init', '--bare', remote]);
  command(seed, 'git', ['remote', 'add', 'origin', remote]);
  command(seed, 'git', ['push', '-u', 'origin', 'dev']);
  command(fixture, 'git', ['clone', '--branch', 'dev', remote, retained]);
  command(retained, 'git', ['config', 'user.name', 'Buildr Remote Test']);
  command(retained, 'git', ['config', 'user.email', 'remote@example.com']);
  return { fixture, remote, retained };
}

function deliveryFixture(t, hook, prepareCandidate = null) {
  const data = repositoryFixture(t);
  const environmentRoot = path.join(data.retained, '.worktrees', 'delivery');
  command(data.retained, 'git', ['worktree', 'add', '-b', 'codex/delivery', environmentRoot, 'dev']);
  if (prepareCandidate) prepareCandidate(environmentRoot);
  else fs.writeFileSync(path.join(environmentRoot, 'feature.txt'), 'candidate\n');
  command(environmentRoot, 'git', ['add', '-A']);
  command(environmentRoot, 'git', ['commit', '-m', 'candidate']);
  const expectedTargetRef = command(data.retained, 'git', ['rev-parse', 'dev']);
  const contribution = observeGitTaskContribution({ root: environmentRoot, deliveryBaselineHead: expectedTargetRef });
  const isolated = createIsolatedGitCarrier({ repositoryRoot: environmentRoot, workspaceRoot: data.retained, runId: 'delivery-remote-evidence', deliveryBaselineHead: expectedTargetRef, taskContribution: contribution, message: 'delivery carrier' });
  const carrierRef = isolated.head;
  if (hook) writeExecutable(path.join(data.remote, 'hooks', 'post-receive'), hook({ ...data, expectedTargetRef, carrierRef }));
  const run = {
    runId: 'delivery-remote-evidence',
    identity: {
      task: 'delivery-remote-evidence',
      handoffIdentity: 'sha256-handoff',
      candidateIdentity: 'sha256-candidate',
      candidateGeneration: 1,
      contentTargetIdentity: 'sha256-content-target',
      agent: 'codex',
      targetBranch: 'dev',
      remote: 'origin',
      environmentRoot,
      workspaceRoot: data.retained,
    },
    deliveryCarrier: {
      identity: 'sha256-carrier',
      ...isolated,
      kind: 'git-isolated-commit',
      head: carrierRef,
      branch: null,
      expectedTargetRef,
      targetRef: 'origin/dev',
    },
  };
  const sqliteRuntime = createTaskFinishSqliteRuntime(data.retained, 'delivery-remote-evidence');
  const persistedRun = persistTaskFinishRun(sqliteRuntime, data.retained, run.identity, run.runId);
  persistedRun.deliveryCarrier = run.deliveryCarrier;
  sqliteRuntime.writeTaskFinishRunPersistence(data.retained, persistedRun);
  const runtime = {
    ...sqliteRuntime,
    assertTaskDevelopmentCarrier: () => ({ status: 'equivalent' }),
    resolveTaskEnvironmentExecution: () => ({
      ready: true,
      controllerInvocation: {
        command: path.join(data.retained, 'projects', 'product', 'buildr'),
        argsPrefix: [],
        sourceRoot: path.join(data.retained, 'projects', 'product'),
      },
    }),
  };
  return { ...data, environmentRoot, expectedTargetRef, carrierRef, run: persistedRun, runtime, handlers: createTaskFinishProductHandlers({ runtime, root: environmentRoot }) };
}

test('dirty retained Workspace preflight exposes structured unrelated paths', async (t) => {
  const data = deliveryFixture(t, null);
  fs.writeFileSync(path.join(data.retained, 'local-note.txt'), 'unrelated local work\n');

  const result = await data.handlers.preflight({ run: data.run });

  assert.equal(result.status, 'blocked');
  assert.equal(result.failure.code, 'task-finish.retained-workspace-dirty');
  const retainedFinding = result.failure.findings.find((item) => item.code === 'task-finish.retained-workspace-dirty');
  assert.deepEqual(retainedFinding.unrelatedPaths, ['local-note.txt']);
});

test('preflight 在 retained 已与远端对齐时通过且不 fetch', async (t) => {
  const data = deliveryFixture(t, null);
  const beforeHead = command(data.retained, 'git', ['rev-parse', 'HEAD']);
  const result = await data.handlers.preflight({ run: data.run });
  assert.equal(result.status, 'passed', JSON.stringify(result.failure, null, 2));
  assert.ok(result.checks.some((item) => item.check === 'retained-remote-alignment' && item.code === 'task-finish.retained-remote-aligned'));
  assert.equal(command(data.retained, 'git', ['rev-parse', 'HEAD']), beforeHead);
  assert.equal(command(data.retained, 'git', ['symbolic-ref', '--short', 'HEAD']), 'dev');
});

test('preflight 在 retained 落后远端时 blocked', async (t) => {
  const data = deliveryFixture(t, null);
  const seed = path.join(data.fixture, 'seed');
  fs.writeFileSync(path.join(seed, 'ahead.txt'), 'remote advanced\n');
  command(seed, 'git', ['add', 'ahead.txt']);
  command(seed, 'git', ['commit', '-m', 'advance remote']);
  command(seed, 'git', ['push', 'origin', 'dev']);
  const result = await data.handlers.preflight({ run: data.run });
  assert.equal(result.status, 'blocked');
  assert.equal(result.failure.code, 'task-finish.retained-workspace-behind');
  assert.ok(result.checks.every((item) => item.check !== 'prepare-isolated-carrier'));
});

test('preflight 在 retained 与远端分叉时 blocked', async (t) => {
  const data = deliveryFixture(t, null);
  fs.writeFileSync(path.join(data.retained, 'local.txt'), 'retained only\n');
  command(data.retained, 'git', ['add', 'local.txt']);
  command(data.retained, 'git', ['commit', '-m', 'retained divergence']);
  const seed = path.join(data.fixture, 'seed');
  fs.writeFileSync(path.join(seed, 'remote-only.txt'), 'remote only\n');
  command(seed, 'git', ['add', 'remote-only.txt']);
  command(seed, 'git', ['commit', '-m', 'remote divergence']);
  command(seed, 'git', ['push', 'origin', 'dev']);
  command(data.retained, 'git', ['fetch', 'origin']);
  const result = await data.handlers.preflight({ run: data.run });
  assert.equal(result.status, 'blocked');
  assert.equal(result.failure.code, 'task-finish.retained-workspace-diverged');
});

test('preflight 在远端不可观察时 blocked', async (t) => {
  const data = deliveryFixture(t, null);
  command(data.retained, 'git', ['remote', 'set-url', 'origin', path.join(data.fixture, 'missing.git')]);
  const result = await data.handlers.preflight({ run: data.run });
  assert.equal(result.status, 'blocked');
  assert.equal(result.failure.code, 'task-finish.target-observation-failed');
});

test('workspace source 缺少 Environment remote 时解析 retained branch upstream', (t) => {
  const { retained, remote } = repositoryFixture(t);
  assert.deepEqual(resolveTaskFinishTargetBranch({ root: retained }), { targetBranch: 'dev', source: 'retained-current' });
  assert.deepEqual(resolveTaskFinishTargetBranch({ root: retained, requestedTargetBranch: 'dev' }), { targetBranch: 'dev', source: 'explicit' });
  assert.throws(
    () => resolveTaskFinishTargetBranch({ root: retained, requestedTargetBranch: 'main' }),
    (error) => error.code === 'task_finish.target_branch_mismatch' && error.details.retainedBranch === 'dev',
  );
  command(retained, 'git', ['checkout', '--detach']);
  assert.throws(
    () => resolveTaskFinishTargetBranch({ root: retained }),
    (error) => error.code === 'task_finish.target_branch_unavailable' && error.details.retainedBranch === null,
  );
  command(retained, 'git', ['checkout', 'dev']);

  let resolved = resolveTaskFinishDeliveryRemote({ root: retained, targetBranch: 'dev' });
  assert.deepEqual(resolved, { remote: 'origin', source: 'branch-upstream', configuredRemotes: ['origin'] });

  command(retained, 'git', ['branch', '--unset-upstream']);
  resolved = resolveTaskFinishDeliveryRemote({ root: retained, targetBranch: 'dev' });
  assert.deepEqual(resolved, { remote: 'origin', source: 'unique-configured', configuredRemotes: ['origin'] });

  command(retained, 'git', ['config', '--unset-all', 'remote.origin.url']);
  assert.throws(
    () => resolveTaskFinishDeliveryRemote({ root: retained, targetBranch: 'dev' }),
    (error) => error.code === 'task_finish.remote_unavailable' && error.details.source === 'unique-configured',
  );
  command(retained, 'git', ['config', 'remote.origin.url', remote]);

  command(retained, 'git', ['remote', 'add', 'backup', remote]);
  assert.throws(
    () => resolveTaskFinishDeliveryRemote({ root: retained, targetBranch: 'dev' }),
    (error) => error.code === 'task_finish.remote_unavailable' && error.details.configuredRemotes.join(',') === 'backup,origin',
  );
  assert.throws(
    () => resolveTaskFinishDeliveryRemote({ root: retained, targetBranch: 'dev', requestedRemote: 'missing' }),
    (error) => error.code === 'task_finish.remote_unavailable' && error.details.source === 'explicit',
  );
});

test('push 后远端回读不一致时返回 target race 且不形成 remoteAfterRef', async (t) => {
  const data = deliveryFixture(t, ({ expectedTargetRef }) => `#!/bin/sh\nread old new ref\ngit update-ref "$ref" "${expectedTargetRef}" "$new"\n`);
  const result = await data.handlers.deliver({ run: data.run });
  assert.equal(result.status, 'blocked', JSON.stringify(result, null, 2));
  assert.equal(result.failure.code, 'task-finish.target-race');
  assert.equal(result.output.delivery.status, 'blocked');
  assert.equal(Object.hasOwn(result.output.delivery, 'remoteAfterRef'), false);
  assert.deepEqual(result.operations.slice(-2).map((operation) => operation.id), ['deliver-push', 'deliver-target-readback']);
  assert.equal(command(data.retained, 'git', ['ls-remote', '--heads', 'origin', 'dev']).split(/\s+/)[0], data.expectedTargetRef);
});

test('deliver 前Development handoff漂移时零lease零push', async (t) => {
  const data = deliveryFixture(t);
  const remoteBefore = command(data.retained, 'git', ['ls-remote', '--heads', 'origin', 'dev']).split(/\s+/)[0];
  let expected = null;
  data.runtime.assertTaskDevelopmentCarrier = (_root, _task, identity) => {
    expected = identity;
    return { status: 'stale', diagnostic: { code: 'task_development_carrier_identity_mismatch' } };
  };
  const result = await data.handlers.deliver({ run: data.run });
  assert.equal(result.status, 'failed');
  assert.equal(result.failure.code, 'task-finish.carrier-not-equivalent');
  assert.deepEqual(expected, {
    handoffIdentity: data.run.identity.handoffIdentity,
    candidateIdentity: data.run.identity.candidateIdentity,
    candidateGeneration: data.run.identity.candidateGeneration,
    contentTargetIdentity: data.run.identity.contentTargetIdentity,
  });
  assert.deepEqual(result.operations, undefined);
  assert.equal(command(data.retained, 'git', ['ls-remote', '--heads', 'origin', 'dev']).split(/\s+/)[0], remoteBefore);
  assert.equal(data.runtime.readTaskFinishRunPersistence(data.retained, { taskId: data.run.identity.task }).lease, null);
});

test('push 后远端无法回读时只保留可恢复 deliver 阻塞', async (t) => {
  const data = deliveryFixture(t, ({ remote }) => `#!/bin/sh\nmv "${remote}" "${remote}.offline"\n`);
  const result = await data.handlers.deliver({ run: data.run });
  assert.equal(result.status, 'blocked');
  assert.equal(result.failure.code, 'task-finish.remote-readback-failed', JSON.stringify(result, null, 2));
  assert.equal(result.output, undefined);
  assert.deepEqual(result.operations.filter((operation) => operation.id.startsWith('deliver-target-readback')).map((operation) => operation.id), [
    'deliver-target-readback',
    'deliver-target-readback-2',
    'deliver-target-readback-3',
  ]);
});

test('push 后远端回读暂态失败时有限重试且不重复push', async (t) => {
  const data = deliveryFixture(t);
  const realGit = process.env.PATH
    .split(path.delimiter)
    .map((entry) => path.join(entry, 'git'))
    .find((candidate) => fs.existsSync(candidate));
  assert.ok(realGit, 'git executable must be resolvable before installing the test wrapper');
  const wrapperRoot = path.join(data.fixture, 'git-wrapper');
  const counter = path.join(wrapperRoot, 'ls-remote-count');
  writeExecutable(path.join(wrapperRoot, 'git'), `#!/bin/sh
if [ "$1" = "ls-remote" ]; then
  count=0
  if [ -f "${counter}" ]; then count=$(tr -d '\\n' < "${counter}"); fi
  count=$((count + 1))
  echo "$count" > "${counter}"
  if [ "$count" -eq 2 ]; then exit 1; fi
fi
exec "${realGit}" "$@"
`);
  const previousPath = process.env.PATH;
  process.env.PATH = `${wrapperRoot}${path.delimiter}${previousPath}`;
  let result;
  try {
    result = await data.handlers.deliver({ run: data.run });
  } finally {
    process.env.PATH = previousPath;
  }
  assert.equal(result.status, 'passed', JSON.stringify(result, null, 2));
  assert.equal(result.operations.filter((operation) => operation.id === 'deliver-push').length, 1);
  const readbacks = result.operations.filter((operation) => operation.id.startsWith('deliver-target-readback'));
  assert.equal(readbacks.length, 2, JSON.stringify(readbacks));
  assert.notEqual(readbacks[0].status, 0);
  assert.equal(readbacks.at(-1).status, 0);
  assert.equal(result.output.delivery.remoteAfterRef, data.carrierRef);
});

test('远端 target 已精确包含 carrier 时不重复 merge/push 并继续 Doctor', async (t) => {
  const data = deliveryFixture(t);
  command(data.retained, 'git', ['merge', '--ff-only', data.carrierRef]);
  command(data.retained, 'git', ['push', 'origin', 'dev']);
  fs.writeFileSync(path.join(data.retained, 'later.txt'), 'independent target advance\n');
  command(data.retained, 'git', ['add', 'later.txt']);
  command(data.retained, 'git', ['commit', '-m', 'advance target after carrier']);
  command(data.retained, 'git', ['push', 'origin', 'dev']);
  const latestTargetRef = command(data.retained, 'git', ['rev-parse', 'HEAD']);

  const result = await data.handlers.deliver({ run: data.run });
  assert.equal(result.status, 'passed', JSON.stringify(result, null, 2));
  assert.equal(result.output.delivery.targetDisposition, 'already-contained');
  assert.equal(result.output.delivery.carrierRef, data.carrierRef);
  assert.equal(result.output.delivery.finalRemoteRef, latestTargetRef);
  assert.equal(result.output.delivery.containment.status, 'contained');
  assert.equal(result.operations.some((operation) => operation.id === 'deliver-contained-target-fetch'), true);
  assert.equal(result.operations.some((operation) => operation.id === 'deliver-fast-forward'), false);
  assert.equal(result.operations.some((operation) => operation.id === 'deliver-push'), false);
});

test('远端 target 已精确包含 rename carrier 时使用删除与新增路径完成证明', async (t) => {
  const data = deliveryFixture(t, null, (environmentRoot) => {
    command(environmentRoot, 'git', ['mv', 'README.md', 'README-renamed.md']);
  });
  command(data.retained, 'git', ['merge', '--ff-only', data.carrierRef]);
  command(data.retained, 'git', ['push', 'origin', 'dev']);
  fs.writeFileSync(path.join(data.retained, 'later.txt'), 'independent target advance\n');
  command(data.retained, 'git', ['add', 'later.txt']);
  command(data.retained, 'git', ['commit', '-m', 'advance target after rename carrier']);
  command(data.retained, 'git', ['push', 'origin', 'dev']);

  const result = await data.handlers.deliver({ run: data.run });
  assert.equal(result.status, 'passed', JSON.stringify(result, null, 2));
  assert.equal(result.output.delivery.targetDisposition, 'already-contained');
  assert.deepEqual(result.output.delivery.containment.changedPaths, ['README-renamed.md', 'README.md']);
  assert.equal(result.output.delivery.containment.checkedPaths.every((entry) => entry.exact), true);
});

test('远端 target 覆盖 carrier 路径时仍按 target race 停止', async (t) => {
  const data = deliveryFixture(t);
  command(data.retained, 'git', ['merge', '--ff-only', data.carrierRef]);
  command(data.retained, 'git', ['push', 'origin', 'dev']);
  fs.writeFileSync(path.join(data.retained, 'feature.txt'), 'changed after carrier\n');
  command(data.retained, 'git', ['add', 'feature.txt']);
  command(data.retained, 'git', ['commit', '-m', 'replace carrier path']);
  command(data.retained, 'git', ['push', 'origin', 'dev']);

  const result = await data.handlers.deliver({ run: data.run });
  assert.equal(result.status, 'blocked');
  assert.equal(result.failure.code, 'task-finish.target-race');
  assert.equal(result.failure.findings[1].code, 'task-finish.carrier-path-not-contained');
  assert.equal(result.operations.some((operation) => operation.id === 'deliver-push'), false);
});
