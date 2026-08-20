import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createRuntime } from '../../src/application/compose-runtime.mjs';
import {
  createIsolatedGitCarrier,
  inspectAgentReviewedZeroDeltaContainment,
  inspectGitCarrierContainment,
  observeGitTaskContribution,
} from '../../src/application/task-finish/git-task-contribution.mjs';
import { gitTaskContributionIdentity } from '../../src/infrastructure/git/git-task-contribution.mjs';
import {
  createFinishRun,
  writeFinishCompletion,
} from '../../src/application/task-finish/task-finish-run.mjs';
import {
  normalizeTaskFinishRepositorySet,
  taskFinishCarrierSetIdentity,
  taskFinishDeliverySetIdentity,
  taskFinishRepositorySetIdentity,
} from '../../src/application/task-finish/task-finish-repository-set.mjs';
import { executeRetainedTaskFinishCleanup } from '../../src/interfaces/internal/task-finish-retained-cleanup.mjs';

function git(root, args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, `git ${args.join(' ')}\n${result.stderr || result.stdout}`);
  return result.stdout.trim();
}

function writePreparedCompletion(root, run, runtime) {
  writeFinishCompletion({
    root,
    runId: run.runId,
    completion: {
      schemaVersion: 'buildr.task-finish-completion/v1',
      runId: run.runId,
      task: run.identity.task,
      handoffIdentity: run.identity.handoffIdentity,
      candidateIdentity: run.identity.candidateIdentity,
      candidateGeneration: run.identity.candidateGeneration,
      contentTargetIdentity: run.identity.contentTargetIdentity,
      carrierIdentity: run.deliveryCarrier.identity,
      carrierRef: run.deliveryCarrier.head,
      finalRemoteRef: run.delivery.finalRemoteRef,
      targetBranch: run.identity.targetBranch,
      status: 'prepared',
      preparedAt: new Date().toISOString(),
    },
    runtime,
  });
}

function readyRun(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-retained-cleanup-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, '.buildr'), { recursive: true });
  fs.mkdirSync(path.join(root, 'projects'), { recursive: true });
  fs.writeFileSync(path.join(root, 'projects', 'manifest.yml'), 'schemaVersion: buildr.projects/v2\nprojects: {}\n');
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '# Retained cleanup SQLite Test\n');
  fs.writeFileSync(path.join(root, '.buildr', 'workspace.yml'), `schemaVersion: buildr.workspace/v1\nid: 123e4567-e89b-42d3-a456-426614174003\nname: Retained cleanup SQLite Test\ndescription: Retained cleanup SQLite Test\nruntime:\n  node:\n    version: ${process.versions.node}\n`);
  const runtime = createRuntime();
  runtime.createTaskRecord(root, { taskId: 'finish-task', title: 'Finish Task', intent: 'SQLite-only retained cleanup test.', projects: [], services: [], changes: [] });
  const run = createFinishRun({
    root,
    runId: 'retained-cleanup',
    identity: {
      task: 'finish-task',
      handoffIdentity: 'sha256-handoff',
      candidateIdentity: 'sha256-candidate',
      candidateGeneration: 1,
      contentTargetIdentity: 'sha256-content-target',
      agent: 'codex',
      targetBranch: 'dev',
      remote: 'origin',
      environmentRoot: path.join(root, '.worktrees', 'finish-task'),
      workspaceRoot: root,
    },
    runtime,
  });
  run.deliveryCarrier = { identity: 'sha256-carrier', head: 'carrier-ref' };
  run.delivery = { status: 'delivered', carrierRef: 'carrier-ref', remoteAfterRef: 'carrier-ref', finalRemoteRef: 'carrier-ref' };
  run.phases.find((phase) => phase.id === 'deliver').status = 'passed';
  run.phases.find((phase) => phase.id === 'cleanup').status = 'running';
  runtime.writeTaskFinishRunPersistence(root, run);
  writePreparedCompletion(root, run, runtime);
  return { root, run, runtime };
}

function alreadyContainedRun(t) {
  const current = readyRun(t);
  const { root, run, runtime } = current;
  git(root, ['init', '-b', 'dev']);
  git(root, ['config', 'user.name', 'Buildr Retained Cleanup']);
  git(root, ['config', 'user.email', 'retained-cleanup@example.com']);
  git(root, ['add', '-A']);
  git(root, ['commit', '-m', 'baseline']);
  fs.writeFileSync(path.join(root, 'feature.txt'), 'delivered content\n');
  git(root, ['add', 'feature.txt']);
  git(root, ['commit', '-m', 'delivery carrier']);
  const carrierRef = git(root, ['rev-parse', 'HEAD']);
  const carrierEntry = git(root, ['ls-tree', 'HEAD', 'feature.txt']).match(/^(\d+) \S+ ([0-9a-f]+)\t/);
  assert.ok(carrierEntry);
  fs.writeFileSync(path.join(root, 'later.txt'), 'self-bootstrap successor\n');
  git(root, ['add', 'later.txt']);
  git(root, ['commit', '-m', 'self-bootstrap successor']);
  const finalRemoteRef = git(root, ['rev-parse', 'HEAD']);
  run.deliveryCarrier = {
    identity: 'sha256-contained-carrier',
    head: carrierRef,
    changedPaths: ['feature.txt'],
    changes: [{
      path: 'feature.txt',
      beforeMode: '000000',
      afterMode: carrierEntry[1],
      beforeBlob: '0000000000000000000000000000000000000000',
      afterBlob: carrierEntry[2],
      status: 'A',
    }],
  };
  const containment = inspectGitCarrierContainment({ repositoryRoot: root, targetRef: finalRemoteRef, carrier: run.deliveryCarrier });
  assert.equal(containment.status, 'contained');
  run.delivery = {
    status: 'delivered',
    targetDisposition: 'already-contained',
    carrierRef,
    remoteAfterRef: finalRemoteRef,
    finalRemoteRef,
    containment,
  };
  runtime.writeTaskFinishRunPersistence(root, run);
  writePreparedCompletion(root, run, runtime);
  return current;
}

function zeroDeltaContainedRun(t) {
  const current = readyRun(t);
  const { root, run, runtime } = current;
  fs.writeFileSync(path.join(root, '.gitignore'), '/.buildr/\n');
  fs.writeFileSync(path.join(root, 'shared.txt'), 'original meaning\n');
  git(root, ['init', '-b', 'dev']);
  git(root, ['config', 'user.name', 'Buildr Retained Cleanup']);
  git(root, ['config', 'user.email', 'retained-cleanup@example.com']);
  git(root, ['add', '-A']);
  git(root, ['commit', '-m', 'original baseline']);
  const originalHead = git(root, ['rev-parse', 'HEAD']);
  const originalTree = git(root, ['rev-parse', 'HEAD^{tree}']);
  fs.writeFileSync(path.join(root, 'shared.txt'), 'task meaning already present\n');
  git(root, ['add', 'shared.txt']);
  git(root, ['commit', '-m', 'later target already contains task meaning']);
  const baselineHead = git(root, ['rev-parse', 'HEAD']);
  const baselineTree = git(root, ['rev-parse', 'HEAD^{tree}']);
  const carrierRoot = path.join(root, '.buildr', 'transient', 'task-finish', 'carriers', run.runId);
  fs.mkdirSync(path.dirname(carrierRoot), { recursive: true });
  git(root, ['worktree', 'add', '--detach', carrierRoot, baselineHead]);

  run.deliveryCarrier = {
    identity: 'sha256-zero-delta-carrier',
    status: 'verified',
    reuseMode: 'agent-reviewed-delivery-adaptation',
    kind: 'git-isolated-commit',
    root: carrierRoot,
    head: baselineHead,
    tree: baselineTree,
    changedPaths: [],
    changes: [],
    activationPaths: ['shared.txt'],
    zeroDelta: true,
    deliveryBaseline: { head: baselineHead, tree: baselineTree },
    taskContribution: {
      identity: gitTaskContributionIdentity(root, originalTree, baselineTree),
      originalBaseline: { head: originalHead, tree: originalTree },
      source: { head: baselineHead, tree: baselineTree },
    },
    carrierDeltaIdentity: gitTaskContributionIdentity(carrierRoot, baselineTree, baselineTree),
    cleanliness: { clean: true },
  };
  const containment = inspectAgentReviewedZeroDeltaContainment({
    repositoryRoot: root,
    targetRef: baselineHead,
    carrier: run.deliveryCarrier,
    runId: run.runId,
  });
  assert.equal(containment.status, 'contained');
  run.delivery = {
    status: 'delivered',
    targetDisposition: 'already-contained',
    carrierRef: baselineHead,
    remoteAfterRef: baselineHead,
    finalRemoteRef: baselineHead,
    containment,
  };
  runtime.writeTaskFinishRunPersistence(root, run);
  writePreparedCompletion(root, run, runtime);
  return current;
}

async function realZeroDeltaCleanupRun(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-retained-cleanup-subprocess-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sourceServiceRoot = fileURLToPath(new URL('../..', import.meta.url));
  const targetServiceRoot = path.join(root, 'projects', 'product', 'services', 'buildr');
  fs.mkdirSync(targetServiceRoot, { recursive: true });
  for (const entry of ['src', 'bin', 'package']) {
    fs.cpSync(path.join(sourceServiceRoot, entry), path.join(targetServiceRoot, entry), { recursive: true });
  }
  for (const entry of ['package.json', 'package-lock.json']) {
    fs.copyFileSync(path.join(sourceServiceRoot, entry), path.join(targetServiceRoot, entry));
  }
  fs.symlinkSync(path.join(sourceServiceRoot, 'node_modules'), path.join(targetServiceRoot, 'node_modules'), 'dir');
  fs.mkdirSync(path.join(root, 'projects'), { recursive: true });
  fs.writeFileSync(path.join(root, 'projects', 'manifest.yml'), 'schemaVersion: buildr.projects/v2\nprojects: {}\n');
  fs.mkdirSync(path.join(root, '.buildr'), { recursive: true });
  fs.writeFileSync(path.join(root, '.buildr', 'workspace.yml'), `schemaVersion: buildr.workspace/v1\nid: 123e4567-e89b-42d3-a456-426614174004\nname: Retained cleanup subprocess test\ndescription: Retained cleanup subprocess test\nruntime:\n  node:\n    version: ${process.versions.node}\n`);
  fs.writeFileSync(path.join(root, '.gitignore'), '/.buildr/\n/.agents/\n/.claude/\n/.codex/\n/.cursor/\n/.qoder/\n/.trae/\n/.trae-work/\n/.workbuddy/\n**/node_modules/\n');
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '# Retained cleanup subprocess test\n');
  fs.writeFileSync(path.join(root, 'shared.txt'), 'original meaning\n');
  git(root, ['init', '-b', 'dev']);
  git(root, ['config', 'user.name', 'Buildr Retained Cleanup']);
  git(root, ['config', 'user.email', 'retained-cleanup@example.com']);
  git(root, ['add', '-A']);
  git(root, ['commit', '-m', 'original baseline']);

  const composeRuntimeUrl = pathToFileURL(path.join(targetServiceRoot, 'src', 'application', 'compose-runtime.mjs')).href;
  const executorUrl = pathToFileURL(path.join(targetServiceRoot, 'src', 'application', 'task-finish', 'task-finish-product-executor.mjs')).href;
  const [{ createRuntime: createRetainedRuntime }, { createTaskFinishProductHandlers }] = await Promise.all([
    import(composeRuntimeUrl),
    import(executorUrl),
  ]);
  const runtime = createRetainedRuntime();
  const retainedCli = path.join(targetServiceRoot, 'bin', 'buildr.mjs');
  const currentProductInvocation = runtime.currentProductInvocation;
  runtime.currentProductInvocation = (options = {}) => currentProductInvocation({
    ...options,
    cliPath: options.cliPath || retainedCli,
  });
  const retainedInvocation = runtime.currentProductInvocation();
  assert.equal(retainedInvocation.argsPrefix[0], retainedCli);
  assert.equal(path.basename(path.dirname(retainedInvocation.argsPrefix[0])), 'bin');
  assert.equal(path.basename(retainedInvocation.argsPrefix[0]), 'buildr.mjs');
  assert.notEqual(path.resolve(retainedInvocation.argsPrefix[0]), path.resolve(process.argv[1]));
  runtime.createTaskRecord(root, {
    taskId: 'zero-delta-subprocess',
    title: 'Zero Delta Subprocess',
    intent: 'Exercise retained cleanup through the real subprocess consumer.',
    projects: [],
    services: [],
    changes: [],
  });
  const preparedEnvironment = runtime.prepareTaskEnvironment(root, 'zero-delta-subprocess', {
    adapter: 'codex',
    useGit: false,
    plan: {
      schemaVersion: 'buildr.task-environment-plan/v1',
      notApplicableReason: 'This fixture has no scoped technical preparation.',
      services: [],
    },
  });
  assert.equal(preparedEnvironment.status, 'ready', JSON.stringify(preparedEnvironment, null, 2));
  const originalHead = git(root, ['rev-parse', 'HEAD']);
  const originalTree = git(root, ['rev-parse', 'HEAD^{tree}']);
  fs.writeFileSync(path.join(root, 'shared.txt'), 'task meaning already present\n');
  git(root, ['add', 'shared.txt']);
  git(root, ['commit', '-m', 'later target already contains task meaning', '-m', 'Buildr-Task: prior-task']);
  const baselineHead = git(root, ['rev-parse', 'HEAD']);
  const baselineTree = git(root, ['rev-parse', 'HEAD^{tree}']);
  const runId = 'zero-delta-subprocess-run';
  const carrierRoot = path.join(root, '.buildr', 'transient', 'task-finish', 'carriers', runId);
  fs.mkdirSync(path.dirname(carrierRoot), { recursive: true });
  git(root, ['worktree', 'add', '--detach', carrierRoot, baselineHead]);
  const run = createFinishRun({
    root,
    runId,
    identity: {
      task: 'zero-delta-subprocess',
      handoffIdentity: 'sha256-handoff',
      candidateIdentity: 'sha256-candidate',
      candidateGeneration: 1,
      contentTargetIdentity: 'sha256-content-target',
      agent: 'codex',
      targetBranch: 'dev',
      remote: 'origin',
      environmentRoot: root,
      workspaceRoot: root,
    },
    runtime,
  });
  run.deliveryCarrier = {
    identity: 'sha256-zero-delta-subprocess-carrier',
    status: 'verified',
    reuseMode: 'agent-reviewed-delivery-adaptation',
    kind: 'git-isolated-commit',
    root: carrierRoot,
    head: baselineHead,
    tree: baselineTree,
    changedPaths: [],
    changes: [],
    activationPaths: ['shared.txt'],
    zeroDelta: true,
    deliveryBaseline: { head: baselineHead, tree: baselineTree },
    taskContribution: {
      identity: gitTaskContributionIdentity(root, originalTree, baselineTree),
      originalBaseline: { head: originalHead, tree: originalTree },
      source: { head: baselineHead, tree: baselineTree },
    },
    carrierDeltaIdentity: gitTaskContributionIdentity(carrierRoot, baselineTree, baselineTree),
    cleanliness: { clean: true },
  };
  const containment = inspectAgentReviewedZeroDeltaContainment({ repositoryRoot: root, targetRef: baselineHead, carrier: run.deliveryCarrier, runId });
  assert.equal(containment.status, 'contained');
  run.delivery = {
    status: 'delivered',
    targetDisposition: 'already-contained',
    carrierRef: baselineHead,
    remoteAfterRef: baselineHead,
    finalRemoteRef: baselineHead,
    containment,
  };
  run.phases.find((phase) => phase.id === 'deliver').status = 'passed';
  run.phases.find((phase) => phase.id === 'cleanup').status = 'running';
  runtime.writeTaskFinishRunPersistence(root, run);
  writeFinishCompletion({
    root,
    runId,
    completion: {
      schemaVersion: 'buildr.task-finish-completion/v1',
      runId,
      task: run.identity.task,
      handoffIdentity: run.identity.handoffIdentity,
      candidateIdentity: run.identity.candidateIdentity,
      candidateGeneration: run.identity.candidateGeneration,
      contentTargetIdentity: run.identity.contentTargetIdentity,
      carrierIdentity: run.deliveryCarrier.identity,
      carrierRef: baselineHead,
      finalRemoteRef: baselineHead,
      targetBranch: 'dev',
      status: 'prepared',
      preparedAt: new Date().toISOString(),
      association: {
        schemaVersion: 'buildr.task-terminal-delivery-associations/v1',
        handoffIdentity: run.identity.handoffIdentity,
        candidateIdentity: run.identity.candidateIdentity,
        candidateGeneration: run.identity.candidateGeneration,
        gates: { planning: null, completion: null, verification: null },
        observedAt: new Date().toISOString(),
        source: 'task-finish-application',
      },
    },
    runtime,
  });
  return { root, run, runtime, carrierRoot, createTaskFinishProductHandlers };
}

test('retained cleanup bootstrap derives Environment authorization from durable Finish facts', async (t) => {
  const { root, run, runtime: sqliteRuntime } = readyRun(t);
  let authorization = null;
  const runtime = {
    ...sqliteRuntime,
    resolveTaskEnvironmentExecution: () => ({
      ready: true,
      workspaceRoot: root,
      environmentRoot: run.identity.environmentRoot,
      repositories: [{ selector: 'workspace', startPoint: 'dev' }, { selector: 'product/buildr', startPoint: 'dev' }],
    }),
    cleanupTaskEnvironment: async (workspaceRoot, task, value) => {
      assert.equal(workspaceRoot, fs.realpathSync(root));
      assert.equal(task, run.identity.task);
      authorization = value;
      return { status: 'cleaned', effects: [], diagnostic: null };
    },
  };
  const result = await executeRetainedTaskFinishCleanup({ targetRoot: root, runId: run.runId, runtime });
  assert.equal(result.status, 'cleaned');
  assert.deepEqual(authorization, {
    type: 'finish',
    deliveries: { workspace: 'dev', 'product/buildr': 'dev' },
    candidateRef: 'carrier-ref',
    integratedContributions: { workspace: run.deliveryCarrier },
  });
});

test('retained cleanup uses saved cleanup context when execution foundations are blocked', async (t) => {
  const { root, run, runtime: sqliteRuntime } = readyRun(t);
  let cleanupCalled = false;
  const runtime = {
    ...sqliteRuntime,
    resolveTaskEnvironmentExecution: () => ({ ready: false, blocked: { code: 'task_environment_probe_blocked', message: 'Runtime projection is stale.' } }),
    resolveTaskEnvironmentCleanupContext: () => ({
      ready: true,
      workspaceRoot: root,
      environmentRoot: run.identity.environmentRoot,
      repositories: [{ selector: 'workspace', startPoint: 'dev' }],
    }),
    cleanupTaskEnvironment: async () => {
      cleanupCalled = true;
      return { status: 'cleaned', effects: [], diagnostic: null };
    },
  };
  const result = await executeRetainedTaskFinishCleanup({ targetRoot: root, runId: run.runId, runtime });
  assert.equal(result.status, 'cleaned');
  assert.equal(cleanupCalled, true);
});

test('retained cleanup accepts an exact already-contained successor and preserves the carrier authorization', async (t) => {
  const { root, run, runtime: sqliteRuntime } = alreadyContainedRun(t);
  let authorization = null;
  const runtime = {
    ...sqliteRuntime,
    resolveTaskEnvironmentExecution: () => ({
      ready: true,
      workspaceRoot: root,
      environmentRoot: run.identity.environmentRoot,
      repositories: [{ selector: 'workspace', startPoint: 'dev' }],
    }),
    cleanupTaskEnvironment: async (_workspaceRoot, _task, value) => {
      authorization = value;
      return { status: 'cleaned', effects: [], diagnostic: null };
    },
  };
  const result = await executeRetainedTaskFinishCleanup({ targetRoot: root, runId: run.runId, runtime });
  assert.equal(result.status, 'cleaned');
  assert.equal(authorization.candidateRef, run.deliveryCarrier.head);
  assert.deepEqual(authorization.integratedContributions, { workspace: run.deliveryCarrier });
});

test('retained cleanup reconstructs the dedicated Agent-reviewed zero-delta proof', async (t) => {
  const { root, run, runtime: sqliteRuntime } = zeroDeltaContainedRun(t);
  let authorization = null;
  const runtime = {
    ...sqliteRuntime,
    resolveTaskEnvironmentExecution: () => ({
      ready: true,
      workspaceRoot: root,
      environmentRoot: run.identity.environmentRoot,
      repositories: [{ selector: 'workspace', startPoint: 'dev' }],
    }),
    cleanupTaskEnvironment: async (_workspaceRoot, _task, value) => {
      authorization = value;
      return { status: 'cleaned', effects: [], diagnostic: null };
    },
  };
  const result = await executeRetainedTaskFinishCleanup({ targetRoot: root, runId: run.runId, runtime });
  assert.equal(result.status, 'cleaned');
  assert.equal(authorization.candidateRef, run.deliveryCarrier.head);
  assert.equal(run.delivery.containment.code, 'task-finish.agent-reviewed-zero-delta-contained');
  assert.equal(run.delivery.containment.proof, 'agent-reviewed-zero-delta');
});

test('real retained cleanup subprocess closes zero-delta Environment and carrier ownership', async (t) => {
  const { root, run, runtime, carrierRoot, createTaskFinishProductHandlers } = await realZeroDeltaCleanupRun(t);
  const handlers = createTaskFinishProductHandlers({ runtime, root });
  const result = await handlers.cleanup({ run });
  assert.equal(result.status, 'passed', JSON.stringify(result, null, 2));
  const retainedCleanup = result.operations.find((item) => item.id === 'cleanup-retained-environment-manager');
  assert.equal(retainedCleanup?.status, 0, JSON.stringify(retainedCleanup, null, 2));
  assert.equal(runtime.inspectTaskEnvironment(root, run.identity.task).status, 'cleaned');
  assert.equal(fs.existsSync(carrierRoot), false);
  assert.equal(runtime.inspectTaskRecord(root, run.identity.task).record.status, 'completed');
});

test('retained cleanup rejects zero-delta proof, carrier, baseline and target drift before cleanup', async (t) => {
  const cases = [
    (run) => { run.delivery.containment = { ...run.delivery.containment, identity: 'sha256-tampered' }; },
    (run) => { run.deliveryCarrier.zeroDelta = false; },
    (run, root) => { run.deliveryCarrier.root = path.join(root, '.buildr', 'transient', 'task-finish', 'carriers', 'another-run'); },
    (run) => { run.deliveryCarrier.changedPaths = ['shared.txt']; },
    (run) => { run.deliveryCarrier.deliveryBaseline = { ...run.deliveryCarrier.deliveryBaseline, tree: '0'.repeat(40) }; },
    (run) => { run.delivery.finalRemoteRef = run.deliveryCarrier.taskContribution.originalBaseline.head; run.delivery.remoteAfterRef = run.delivery.finalRemoteRef; },
  ];
  for (const mutate of cases) {
    const { root, run, runtime } = zeroDeltaContainedRun(t);
    mutate(run, root);
    runtime.writeTaskFinishRunPersistence(root, run);
    await assert.rejects(
      executeRetainedTaskFinishCleanup({ targetRoot: root, runId: run.runId, runtime }),
      (error) => error.code === 'task-finish.retained-cleanup-run-not-ready',
    );
  }
});

test('retained cleanup rejects missing or mismatched already-contained evidence', async (t) => {
  for (const mutate of [
    (delivery) => { delete delivery.containment; },
    (delivery) => { delivery.containment = { ...delivery.containment, targetRef: delivery.carrierRef }; },
  ]) {
    const { root, run, runtime } = alreadyContainedRun(t);
    mutate(run.delivery);
    runtime.writeTaskFinishRunPersistence(root, run);
    await assert.rejects(
      executeRetainedTaskFinishCleanup({ targetRoot: root, runId: run.runId, runtime }),
      (error) => error.code === 'task-finish.retained-cleanup-run-not-ready',
    );
  }
});

test('retained cleanup rejects legacy delivery without finalRemoteRef', async (t) => {
  const { root, run, runtime } = readyRun(t);
  delete run.delivery.finalRemoteRef;
  runtime.writeTaskFinishRunPersistence(root, run);
  await assert.rejects(
    executeRetainedTaskFinishCleanup({ targetRoot: root, runId: run.runId, runtime }),
    (error) => error.code === 'task-finish.retained-cleanup-run-not-ready',
  );
});

test('retained cleanup still requires finalRemoteRef for an activation-aware run', async (t) => {
  const { root, run, runtime } = readyRun(t);
  run.deliveryCarrier.activationPlan = { identity: 'sha256-activation-plan' };
  delete run.delivery.finalRemoteRef;
  runtime.writeTaskFinishRunPersistence(root, run);
  await assert.rejects(
    executeRetainedTaskFinishCleanup({ targetRoot: root, runId: run.runId, runtime }),
    (error) => error.code === 'task-finish.retained-cleanup-run-not-ready',
  );
});

test('retained cleanup 从 repository-set run 重建贡献与 no-contribution 授权', async (t) => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-retained-cleanup-multi-'));
  t.after(() => fs.rmSync(fixture, { recursive: true, force: true }));
  const root = path.join(fixture, 'workspace');
  const service = path.join(fixture, 'service');
  for (const repository of [root, service]) {
    fs.mkdirSync(repository);
    git(repository, ['init', '-b', 'dev']);
    git(repository, ['config', 'user.name', 'Buildr Retained Cleanup']);
    git(repository, ['config', 'user.email', 'retained-cleanup@example.com']);
    fs.writeFileSync(path.join(repository, '.gitignore'), '/.buildr/\n/.worktrees/\n');
    fs.writeFileSync(path.join(repository, 'shared.txt'), `${path.basename(repository)} baseline\n`);
    git(repository, ['add', '-A']);
    git(repository, ['commit', '-m', 'baseline']);
  }
  fs.mkdirSync(path.join(root, 'projects'), { recursive: true });
  fs.writeFileSync(path.join(root, 'projects', 'manifest.yml'), 'schemaVersion: buildr.projects/v2\nprojects: {}\n');
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '# Retained cleanup multi test\n');
  fs.mkdirSync(path.join(root, '.buildr'), { recursive: true });
  fs.writeFileSync(path.join(root, '.buildr', 'workspace.yml'), `schemaVersion: buildr.workspace/v1\nid: 123e4567-e89b-42d3-a456-426614174005\nname: Retained cleanup multi\ndescription: Retained cleanup multi\nruntime:\n  node:\n    version: ${process.versions.node}\n`);
  git(root, ['add', 'AGENTS.md', 'projects/manifest.yml']);
  git(root, ['commit', '-m', 'workspace authority']);

  const task = 'finish-multi-cleanup';
  const workspaceTaskRoot = path.join(root, '.worktrees', task);
  const serviceTaskRoot = path.join(fixture, 'service-task');
  git(root, ['worktree', 'add', '-b', `codex/${task}`, workspaceTaskRoot, 'dev']);
  git(service, ['worktree', 'add', '-b', `codex/${task}`, serviceTaskRoot, 'dev']);
  fs.writeFileSync(path.join(serviceTaskRoot, 'feature.txt'), 'service contribution\n');
  git(serviceTaskRoot, ['add', 'feature.txt']);
  git(serviceTaskRoot, ['commit', '-m', 'service contribution']);
  const workspaceTarget = git(root, ['rev-parse', 'dev']);
  const serviceTarget = git(service, ['rev-parse', 'dev']);
  const workspaceContribution = observeGitTaskContribution({ root: workspaceTaskRoot, deliveryBaselineHead: workspaceTarget });
  const serviceContribution = observeGitTaskContribution({ root: serviceTaskRoot, deliveryBaselineHead: serviceTarget });
  const isolated = createIsolatedGitCarrier({
    repositoryRoot: serviceTaskRoot,
    workspaceRoot: root,
    runId: 'retained-cleanup-multi-run',
    repositorySelector: 'service:example',
    deliveryBaselineHead: serviceTarget,
    taskContribution: serviceContribution,
    message: 'delivery carrier',
  });
  const carrier = {
    ...isolated,
    identity: 'sha256-service-carrier',
    kind: 'git-isolated-commit',
    repositorySelector: 'service:example',
    expectedTargetRef: serviceTarget,
    reuseMode: 'deterministic-reuse',
  };
  git(service, ['merge', '--ff-only', carrier.head]);
  const plans = normalizeTaskFinishRepositorySet([
    {
      selector: 'workspace', sourcePath: '.', retainedRoot: root, taskRoot: workspaceTaskRoot,
      environmentBranch: `codex/${task}`, targetBranch: 'dev', remote: null,
      disposition: 'not-applicable', reason: 'no-contribution', taskContribution: workspaceContribution,
    },
    {
      selector: 'service:example', sourcePath: 'projects/example', retainedRoot: service, taskRoot: serviceTaskRoot,
      environmentBranch: `codex/${task}`, targetBranch: 'dev', remote: 'origin',
      disposition: 'applicable', reason: null, taskContribution: serviceContribution,
    },
  ]);
  const runtime = createRuntime();
  runtime.createTaskRecord(root, { taskId: task, title: 'Multi retained cleanup', intent: 'Reconstruct repository authorization.', projects: [], services: [], changes: [] });
  const run = createFinishRun({
    root,
    runId: 'retained-cleanup-multi-run',
    identity: {
      task, handoffIdentity: 'sha256-handoff', candidateIdentity: 'sha256-candidate', candidateGeneration: 1,
      contentTargetIdentity: 'sha256-content', agent: 'codex', repositories: plans,
      repositorySetIdentity: taskFinishRepositorySetIdentity(plans), environmentRoot: workspaceTaskRoot, workspaceRoot: root,
    },
    runtime,
  });
  const serviceState = run.repositories.find((repository) => repository.selector === 'service:example');
  serviceState.deliveryCarrier = carrier;
  serviceState.delivery = { status: 'delivered', targetDisposition: 'carrier', carrierRef: carrier.head, remoteAfterRef: carrier.head, finalRemoteRef: carrier.head };
  run.phases.find((phase) => phase.id === 'deliver').status = 'passed';
  run.phases.find((phase) => phase.id === 'cleanup').status = 'running';
  runtime.writeTaskFinishRunPersistence(root, run);
  writeFinishCompletion({
    root,
    runId: run.runId,
    completion: {
      schemaVersion: 'buildr.task-finish-completion/v2', runId: run.runId, task,
      handoffIdentity: run.identity.handoffIdentity, candidateIdentity: run.identity.candidateIdentity,
      candidateGeneration: 1, contentTargetIdentity: run.identity.contentTargetIdentity,
      repositorySetIdentity: run.identity.repositorySetIdentity,
      carrierSetIdentity: taskFinishCarrierSetIdentity(run.repositories),
      deliverySetIdentity: taskFinishDeliverySetIdentity(run.repositories),
      repositories: [
        { selector: 'service:example', disposition: 'applicable', carrierIdentity: carrier.identity, carrierRef: carrier.head, finalRemoteRef: carrier.head, taskContributionIdentity: serviceContribution.identity },
        { selector: 'workspace', disposition: 'not-applicable', carrierIdentity: null, carrierRef: null, finalRemoteRef: workspaceTarget, taskContributionIdentity: workspaceContribution.identity },
      ],
      status: 'prepared', preparedAt: new Date().toISOString(),
    },
    runtime,
  });
  let authorization = null;
  Object.assign(runtime, {
    resolveTaskEnvironmentExecution: () => ({ ready: true, workspaceRoot: root, environmentRoot: workspaceTaskRoot, repositories: plans.map((plan) => ({ selector: plan.selector, startPoint: 'dev' })) }),
    cleanupTaskEnvironment: async (_root, _task, value) => {
      authorization = value;
      return { status: 'cleaned', effects: [], diagnostic: null };
    },
  });

  const result = await executeRetainedTaskFinishCleanup({ targetRoot: root, runId: run.runId, runtime });
  assert.equal(result.status, 'cleaned');
  assert.equal(authorization.type, 'finish');
  assert.equal(authorization.integratedContributions.workspace.kind, 'no-contribution');
  assert.equal(authorization.integratedContributions['service:example'].identity, carrier.identity);
  assert.equal(authorization.deliveries.workspace, workspaceTarget);
  assert.equal(authorization.deliveries['service:example'], carrier.head);
});

test('retained cleanup bootstrap rejects an unprepared Finish run', async (t) => {
  const { root, run, runtime } = readyRun(t);
  run.phases.find((phase) => phase.id === 'deliver').status = 'pending';
  runtime.writeTaskFinishRunPersistence(root, run);
  await assert.rejects(
    executeRetainedTaskFinishCleanup({ targetRoot: root, runId: run.runId, runtime }),
    (error) => error.code === 'task-finish.retained-cleanup-run-not-ready',
  );
});
