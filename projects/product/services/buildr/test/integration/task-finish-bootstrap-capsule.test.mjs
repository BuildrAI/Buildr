import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import {
  finalizeTaskFinishBootstrapRecovery,
  prepareTaskFinishBootstrapRecoveryContext,
} from '../../src/task/application/finish/task-finish-bootstrap-recovery.mjs';

function git(root, args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function run(environmentRoot, workspaceRoot) {
  return {
    runId: 'repair-finish-20260814000000-capsule',
    identity: {
      task: 'repair-finish', handoffIdentity: 'sha256-handoff', candidateIdentity: 'sha256-candidate', candidateGeneration: 3,
      contentTargetIdentity: 'sha256-content', environmentRoot, workspaceRoot,
    },
  };
}

function runtime(environmentRoot, workspaceRoot) {
  return {
    inspectTaskEnvironment() {
      return {
        status: 'ready',
        environment: {
          workspace: { root: workspaceRoot },
          scopes: [{ selector: 'workspace', validationRoot: environmentRoot }],
        },
      };
    },
    assertTaskDevelopmentCarrier() { return { status: 'equivalent' }; },
  };
}

test('retained bootstrap从current Environment clean HEAD创建、复用并撤销run-owned provider capsule', (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-bootstrap-capsule-'));
  const environmentRoot = `${workspaceRoot}-task`;
  t.after(() => {
    try { spawnSync('git', ['worktree', 'remove', '--force', environmentRoot], { cwd: workspaceRoot }); } catch {}
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
    fs.rmSync(environmentRoot, { recursive: true, force: true });
  });

  git(workspaceRoot, ['init', '-b', 'dev']);
  git(workspaceRoot, ['config', 'user.name', 'Buildr Test']);
  git(workspaceRoot, ['config', 'user.email', 'buildr@example.com']);
  const provider = 'projects/product/services/buildr/src/task/application/finish/task-finish-product-executor.mjs';
  write(path.join(workspaceRoot, provider), 'export function createTaskFinishProductHandlers() { return {}; }\n');
  git(workspaceRoot, ['add', provider]);
  git(workspaceRoot, ['commit', '-m', 'base']);
  git(workspaceRoot, ['worktree', 'add', '-b', 'codex/repair-finish', environmentRoot, 'dev']);
  write(path.join(environmentRoot, provider), 'export function createTaskFinishProductHandlers() { return { repaired: true }; }\n');
  git(environmentRoot, ['add', provider]);
  git(environmentRoot, ['commit', '-m', 'fix provider']);

  const currentRun = run(environmentRoot, workspaceRoot);
  const retainedRuntime = runtime(environmentRoot, workspaceRoot);
  const context = prepareTaskFinishBootstrapRecoveryContext({ run: currentRun, targetRoot: workspaceRoot, runtime: retainedRuntime });
  assert.equal(fs.existsSync(context.executorModule), true);
  assert.equal(git(path.join(context.capsuleRoot, 'source'), ['rev-parse', 'HEAD^{commit}']), context.sourceCommit);
  assert.equal(context.sourceCommit, git(environmentRoot, ['rev-parse', 'HEAD^{commit}']));
  assert.notEqual(context.sourceCommit, git(workspaceRoot, ['rev-parse', 'HEAD^{commit}']));

  const reused = prepareTaskFinishBootstrapRecoveryContext({
    run: {
      ...currentRun,
      bootstrapRecovery: {
        identity: context.identity,
        capsule: { root: context.capsuleRoot, manifest: context.manifestPath, source: context.sourceRoot },
      },
    },
    targetRoot: workspaceRoot,
    runtime: retainedRuntime,
  });
  assert.equal(reused.identity, context.identity);
  assert.equal(reused.executorModule, context.executorModule);

  const injectedDrift = path.join(context.sourceRoot, 'untracked-drift.txt');
  write(injectedDrift, 'drift\n');
  assert.throws(
    () => prepareTaskFinishBootstrapRecoveryContext({
      run: { ...currentRun, bootstrapRecovery: { identity: context.identity, capsule: { manifest: context.manifestPath } } },
      targetRoot: workspaceRoot,
      runtime: retainedRuntime,
    }),
    (error) => error.code === 'task_finish.bootstrap_recovery_capsule_drift',
  );
  fs.rmSync(injectedDrift);

  currentRun.bootstrapRecovery = {
    identity: context.identity,
    capsule: {
      root: context.capsuleRoot,
      manifest: context.manifestPath,
      source: context.sourceRoot,
      revocation: { status: 'active', tombstone: context.revocationPath },
    },
  };
  fs.renameSync(context.sourceRoot, context.quarantineRoot);
  const attention = finalizeTaskFinishBootstrapRecovery(currentRun, {
    removePath() { throw Object.assign(new Error('injected residual cleanup failure'), { code: 'EINJECTED' }); },
  });
  assert.equal(attention.capsule.revocation.status, 'revoked');
  assert.equal(attention.capsule.revocation.residualCleanup.status, 'attention');
  assert.equal(fs.existsSync(context.quarantineRoot), true);
  currentRun.bootstrapRecovery = attention;
  const revoked = finalizeTaskFinishBootstrapRecovery(currentRun);
  assert.equal(revoked.capsule.revocation.status, 'revoked');
  assert.equal(revoked.capsule.revocation.residualCleanup, null);
  assert.equal(fs.existsSync(context.capsuleRoot), true);
  assert.equal(fs.existsSync(context.sourceRoot), false);
  assert.equal(fs.existsSync(context.revocationPath), true);

  currentRun.bootstrapRecovery = revoked;
  const terminal = prepareTaskFinishBootstrapRecoveryContext({ run: currentRun, targetRoot: workspaceRoot, runtime: retainedRuntime });
  assert.equal(terminal.state, 'revoked');
});

test('dirty Task source不能形成bootstrap capsule', (t) => {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-bootstrap-dirty-'));
  const environmentRoot = `${workspaceRoot}-task`;
  t.after(() => {
    try { spawnSync('git', ['worktree', 'remove', '--force', environmentRoot], { cwd: workspaceRoot }); } catch {}
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
    fs.rmSync(environmentRoot, { recursive: true, force: true });
  });
  git(workspaceRoot, ['init', '-b', 'dev']);
  git(workspaceRoot, ['config', 'user.name', 'Buildr Test']);
  git(workspaceRoot, ['config', 'user.email', 'buildr@example.com']);
  const provider = 'projects/product/services/buildr/src/task/application/finish/task-finish-product-executor.mjs';
  write(path.join(workspaceRoot, provider), 'export const base = true;\n');
  git(workspaceRoot, ['add', provider]);
  git(workspaceRoot, ['commit', '-m', 'base']);
  git(workspaceRoot, ['worktree', 'add', '-b', 'codex/repair-dirty', environmentRoot, 'dev']);
  assert.throws(
    () => prepareTaskFinishBootstrapRecoveryContext({
      run: run(environmentRoot, workspaceRoot),
      targetRoot: workspaceRoot,
      runtime: { ...runtime(environmentRoot, workspaceRoot), inspectTaskEnvironment: () => ({ status: 'blocked', environment: { workspace: { root: workspaceRoot }, scopes: [] } }) },
    }),
    (error) => error.code === 'task_finish.bootstrap_recovery_environment_not_current',
  );
  assert.throws(
    () => prepareTaskFinishBootstrapRecoveryContext({
      run: run(environmentRoot, workspaceRoot),
      targetRoot: workspaceRoot,
      runtime: { ...runtime(environmentRoot, workspaceRoot), assertTaskDevelopmentCarrier: () => ({ status: 'stale' }) },
    }),
    (error) => error.code === 'task_finish.bootstrap_recovery_development_not_current',
  );
  write(path.join(environmentRoot, provider), 'export const dirty = true;\n');
  assert.throws(
    () => prepareTaskFinishBootstrapRecoveryContext({ run: run(environmentRoot, workspaceRoot), targetRoot: workspaceRoot, runtime: runtime(environmentRoot, workspaceRoot) }),
    (error) => error.code === 'task_finish.bootstrap_recovery_source_dirty',
  );
});
