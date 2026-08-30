import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import {
  SELF_BOOTSTRAP_RECOVERY_PLAN_SCHEMA,
  compactSelfBootstrapCloseout,
  createSelfBootstrapCloseoutPlan,
  discoverFinishCarrierEntries,
  runSelfBootstrapCloseout,
  runSelfBootstrapCloseoutCommand,
  runDirectSelfBootstrapCloseout,
} from '../../../../../../skills/buildr-self-bootstrap-sync/scripts/closeout.mjs';
import {
  DEFAULT_DEVELOPMENT_WEB_PORT,
  developmentWebDataRoot,
  inspectDevelopmentInstance,
  restartDevelopmentInstance,
} from '../../../../../../skills/buildr-self-bootstrap-sync/scripts/development-web-continuity.mjs';
import { RUNTIME_ADAPTERS, skillDestinationRoot } from '../../src/agent-assets/infrastructure/runtime/adapter-contract.mjs';
import { createRuntime } from '../../src/bootstrap/runtime.mjs';
import { createFinishRun, executeFinishRun } from '../../src/task/application/finish/task-finish-run.mjs';
import { selfBootstrapTaskFinishResult } from '../../src/task/application/finish/task-finish-self-bootstrap-projection.mjs';

function run(executable, args, cwd) {
  const result = spawnSync(executable, args, { cwd, encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout || '', stderr: result.stderr || '' };
}

function git(root, ...args) {
  const result = run('git', args, root);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function fixture(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-self-bootstrap-closeout-'));
  const root = path.join(base, 'workspace');
  const remote = path.join(base, 'remote.git');
  fs.mkdirSync(path.join(root, 'components', 'workspace', 'buildr-self-bootstrap'), { recursive: true });
  fs.mkdirSync(path.join(root, 'projects', 'product', 'services', 'buildr', 'resources'), { recursive: true });
  fs.mkdirSync(path.join(root, 'projects', 'product', 'services', 'buildr', 'tools', 'development'), { recursive: true });
  fs.mkdirSync(path.join(root, 'projects', 'product', 'services', 'buildr', 'bin'), { recursive: true });
  fs.mkdirSync(path.join(root, 'projects', 'product', 'services', 'buildr', 'package', 'launchers'), { recursive: true });
  fs.mkdirSync(path.join(root, 'skills', 'generated'), { recursive: true });
  fs.mkdirSync(path.join(root, '.buildr'), { recursive: true });
  const projectBridge = path.join(root, 'projects', 'product', 'buildr');
  const launcher = path.join(root, 'projects', 'product', 'services', 'buildr', 'tools', 'development', 'run-development-cli');
  const cliEntry = path.join(root, 'projects', 'product', 'services', 'buildr', 'bin', 'buildr.mjs');
  const sourceServiceRoot = path.resolve(import.meta.dirname, '../..');
  const defaultBin = path.join(base, 'default-bin');
  fs.writeFileSync(path.join(root, 'components', 'workspace', 'buildr-self-bootstrap', 'component.yml'), 'schemaVersion: buildr.component/v1\nid: buildr-self-bootstrap\n');
  fs.writeFileSync(path.join(root, 'projects', 'product', 'services', 'buildr', 'resources', 'manifest.yml'), 'schemaVersion: buildr.package/v1\n');
  fs.writeFileSync(path.join(root, 'projects', 'product', 'services', 'buildr', 'package.json'), JSON.stringify({ name: '@buildr-ai/buildr', version: '0.1.0-test' }));
  fs.writeFileSync(projectBridge, `#!/bin/sh
exec '${launcher}' "$@"
`, { mode: 0o755 });
  fs.copyFileSync(path.join(sourceServiceRoot, 'tools', 'development', 'run-development-cli'), launcher);
  fs.chmodSync(launcher, 0o755);
  fs.writeFileSync(cliEntry, `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === 'version') console.log(JSON.stringify({ package: '@buildr-ai/buildr', version: '0.1.0-test' }));
else if (args[0] === 'doctor') console.log(JSON.stringify({ health: { ready: true } }));
else if (args[0] === 'task' && args[1] === 'finish' && args[2] === 'run') console.log(JSON.stringify({ status: 'complete', runId: 'closeout-run', resolvedContext: { identity: 'sha256-context' }, resumePreflight: 'passed', doctor: 'ready' }));
else if (args[0] === 'sync') console.log(JSON.stringify({ status: 'synced' }));
else process.exitCode = 2;
`, { mode: 0o755 });
  fs.mkdirSync(path.join(root, 'projects', 'product', 'services', 'buildr', 'node_modules', 'yaml'), { recursive: true });
  fs.writeFileSync(path.join(root, 'projects', 'product', 'services', 'buildr', 'node_modules', 'yaml', 'package.json'), JSON.stringify({ name: 'yaml', version: '0.0.0-test', type: 'module', exports: './index.mjs' }));
  fs.writeFileSync(path.join(root, 'projects', 'product', 'services', 'buildr', 'node_modules', 'yaml', 'index.mjs'), 'export default {};\n');
  fs.writeFileSync(path.join(root, '.gitignore'), 'node_modules/\n.buildr/local/\n');
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '# Self-bootstrap closeout test fixture\n');
  fs.writeFileSync(path.join(root, 'projects', 'manifest.yml'), 'schemaVersion: buildr.projects/v2\nprojects: {}\n');
  fs.writeFileSync(path.join(root, '.buildr', 'workspace.yml'), `schemaVersion: buildr.workspace/v1
id: 123e4567-e89b-42d3-a456-426614174008
name: Self-bootstrap closeout fixture
description: Self-bootstrap closeout fixture
runtime:
  node:
    version: ${process.versions.node}
`);
  fs.writeFileSync(path.join(root, 'projects', 'product', 'services', 'buildr', 'package', 'launchers', 'manage.mjs'), '#!/usr/bin/env node\n', { mode: 0o755 });
  fs.mkdirSync(defaultBin);
  fs.writeFileSync(path.join(defaultBin, 'buildr'), '#!/bin/sh\nexit 97\n', { mode: 0o755 });
  fs.writeFileSync(path.join(root, 'skills', 'generated', 'SKILL.md'), 'v1\n');
  git(root, 'init', '-b', 'dev');
  git(root, 'config', 'user.name', 'Buildr Test');
  git(root, 'config', 'user.email', 'buildr-test@example.com');
  git(root, 'add', '--', '.');
  git(root, 'commit', '-m', 'baseline');
  run('git', ['init', '--bare', remote], base);
  git(root, 'remote', 'add', 'origin', remote);
  git(root, 'push', '-u', 'origin', 'dev');
  const baseRef = git(root, 'rev-parse', 'HEAD');
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  return {
    root,
    remote,
    baseRef,
    projectBridge,
    launcher,
    cliEntry,
    defaultBuildr: path.join(defaultBin, 'buildr'),
    environment: { ...process.env, BUILDR_CLI_INSTALL_DIR: defaultBin, PATH: `${defaultBin}${path.delimiter}${process.env.PATH || ''}` },
  };
}

function canonicalFinishResult(root, baseRef, changedPaths, overrides = {}) {
  const runId = overrides.runId || 'closeout-run';
  const identity = {
    task: 'closeout-task',
    handoffIdentity: 'sha256-handoff',
    candidateIdentity: 'sha256-candidate',
    candidateGeneration: 1,
    contentTargetIdentity: 'sha256-content',
    agent: 'codex',
    targetBranch: 'dev',
    remote: 'origin',
    environmentRoot: path.join(root, '.worktrees', 'task'),
    workspaceRoot: root,
  };
  return {
    schemaVersion: 'buildr.task-finish-result/v2',
    runId,
    status: 'complete',
    identity,
    resolvedContext: { capability: { id: 'buildr.task-finish', version: 1 }, identity: 'sha256-context' },
    carrier: {
      identity: 'sha256-carrier',
      root: path.join(root, '.buildr', 'transient', 'task-finish', 'carriers', runId),
      changedPaths,
    },
    delivery: { status: 'delivered', remoteAfterRef: baseRef, finalRemoteRef: baseRef },
    completion: { finalRemoteRef: baseRef },
    ...overrides,
  };
}

function finishResult(root, baseRef, changedPaths, overrides = {}) {
  return selfBootstrapTaskFinishResult(canonicalFinishResult(root, baseRef, changedPaths, overrides));
}

function doctorBlockedResult(root, baseRef, changedPaths, overrides = {}) {
  const base = canonicalFinishResult(root, baseRef, changedPaths);
  const carrierRoot = path.join(root, '.buildr', 'transient', 'task-finish', 'carriers', base.runId);
  return selfBootstrapTaskFinishResult({
    ...base,
    status: 'blocked',
    primaryFailure: { phase: 'deliver', operation: 'retained-doctor' },
    carrier: { ...base.carrier, root: carrierRoot },
    delivery: { status: 'activation-blocked', remoteAfterRef: baseRef, finalRemoteRef: baseRef },
    resume: { phase: 'deliver', token: 'sha256-resume' },
    ...overrides,
  });
}

function targetRaceResult(token = 'sha256-target-race') {
  return {
    schemaVersion: 'buildr.task-finish-self-bootstrap-input/v1',
    status: 'blocked',
    runId: 'closeout-run',
    primaryFailure: { phase: 'deliver', operation: 'target-transition', code: 'task-finish.target-race' },
    resume: { phase: 'deliver', token },
  };
}

function adaptationRequiredResult(root, token = 'sha256-adaptation') {
  const carrier = {
    selector: 'workspace',
    root: path.join(root, '.buildr', 'transient', 'task-finish', 'carriers', 'closeout-run'),
    identity: 'sha256-carrier',
    activationPaths: [],
  };
  return {
    schemaVersion: 'buildr.task-finish-self-bootstrap-input/v1',
    status: 'blocked',
    runId: 'closeout-run',
    primaryFailure: { phase: 'prepare', operation: 'delivery-adaptation', code: 'task-finish.delivery-adaptation-required' },
    workspaceRepository: { selector: 'workspace', disposition: 'applicable', carrier },
    carriers: [carrier],
    resume: { phase: 'prepare', token, carrierIdentity: 'sha256-carrier' },
  };
}

function cleanupPendingResult(root, baseRef, runId, taskId = `task-${runId}`, overrides = {}) {
  const carrierRoot = path.join(root, '.buildr', 'transient', 'task-finish', 'carriers', runId);
  const carrierIdentity = `sha256-carrier-${runId}`;
  return finishResult(root, baseRef, ['projects/product/services/buildr/src/example.mjs'], {
    runId,
    status: 'cleanup_pending',
    identity: {
      ...canonicalFinishResult(root, baseRef, []).identity,
      task: taskId,
    },
    primaryFailure: { phase: 'cleanup', operation: 'task-environment-cleanup' },
    carrier: { identity: carrierIdentity, root: carrierRoot, changedPaths: ['projects/product/services/buildr/src/example.mjs'] },
    resume: { phase: 'cleanup', token: `sha256-resume-${runId}`, carrierIdentity },
    ...overrides,
  });
}

function cleanedFinishResult(root, baseRef, runId, taskId = `task-${runId}`) {
  return selfBootstrapTaskFinishResult(canonicalFinishResult(root, baseRef, ['projects/product/services/buildr/src/example.mjs'], {
    runId,
    identity: {
      ...canonicalFinishResult(root, baseRef, []).identity,
      task: taskId,
    },
    phases: [{ id: 'cleanup', status: 'passed' }],
    carrier: {
      identity: `sha256-cleaned-${runId}`,
      changedPaths: ['projects/product/services/buildr/src/example.mjs'],
    },
    completion: {
      status: 'complete',
      finalRemoteRef: baseRef,
      cleanup: { status: 'cleaned' },
    },
  }));
}

function undeliveredBlockedResult(root, runId, taskId = `task-${runId}`, overrides = {}) {
  const carrierRoot = path.join(root, '.buildr', 'transient', 'task-finish', 'carriers', runId);
  const carrierIdentity = `sha256-carrier-${runId}`;
  return finishResult(root, 'a'.repeat(40), ['projects/product/services/buildr/src/example.mjs'], {
    runId,
    status: 'blocked',
    identity: {
      ...canonicalFinishResult(root, 'a'.repeat(40), []).identity,
      task: taskId,
    },
    primaryFailure: { phase: 'deliver', operation: 'push' },
    carrier: { identity: carrierIdentity, root: carrierRoot, changedPaths: ['projects/product/services/buildr/src/example.mjs'] },
    delivery: { status: 'blocked', remoteAfterRef: null, finalRemoteRef: null },
    completion: null,
    resume: { phase: 'deliver', token: `sha256-resume-${runId}`, carrierIdentity },
    ...overrides,
  });
}

function createCarrier(root, runId = 'closeout-run') {
  const carrierRoot = path.join(root, '.buildr', 'transient', 'task-finish', 'carriers', runId);
  fs.mkdirSync(carrierRoot, { recursive: true });
  fs.writeFileSync(path.join(carrierRoot, 'carrier.txt'), 'owned\n');
  return carrierRoot;
}

async function terminalRepositoryFinish(root, baseRef) {
  const runtime = createRuntime();
  const taskId = 'closeout-task';
  const runId = 'closeout-run';
  runtime.createTaskRecord(root, { taskId, title: taskId, intent: 'Prove terminal self-bootstrap lease integration.', projects: [], services: [], changes: [] });
  const run = createFinishRun({
    root,
    runId,
    identity: {
      task: taskId,
      handoffIdentity: 'sha256-handoff',
      candidateIdentity: 'sha256-candidate',
      candidateGeneration: 1,
      contentTargetIdentity: 'sha256-content',
      agent: 'codex',
      environmentRoot: path.join(root, '.worktrees', taskId),
      workspaceRoot: root,
      repositories: [{
        selector: 'workspace',
        sourcePath: '.',
        retainedRoot: root,
        taskRoot: path.join(root, '.worktrees', taskId),
        environmentBranch: `codex/${taskId}`,
        targetBranch: 'dev',
        remote: 'origin',
        disposition: 'applicable',
        taskContribution: {
          identity: 'sha256-workspace-contribution',
          originalBaseline: { tree: 'baseline-tree' },
          source: { tree: 'source-tree' },
        },
      }],
    },
    runtime,
  });
  runtime.writeTaskFinishRunPersistence(root, run);
  const plan = run.identity.repositories[0];
  const carrierIdentity = 'sha256-workspace-carrier';
  const repositories = [{
    ...run.repositories[0],
    deliveryCarrier: {
      selector: 'workspace',
      identity: carrierIdentity,
      activationPaths: ['projects/product/services/buildr/src/example.mjs'],
    },
    equivalence: { status: 'passed' },
    delivery: { status: 'delivered', remoteAfterRef: baseRef, finalRemoteRef: baseRef },
  }];
  const completion = {
    schemaVersion: 'buildr.task-finish-completion/v1',
    runId,
    task: taskId,
    handoffIdentity: run.identity.handoffIdentity,
    candidateIdentity: run.identity.candidateIdentity,
    candidateGeneration: run.identity.candidateGeneration,
    contentTargetIdentity: run.identity.contentTargetIdentity,
    carrierIdentity,
    carrierRef: baseRef,
    finalRemoteRef: baseRef,
    targetBranch: 'dev',
    status: 'complete',
    cleanup: { status: 'cleaned' },
    association: null,
    repositories: [{ selector: 'workspace', disposition: 'applicable', carrierIdentity, carrierRef: baseRef, finalRemoteRef: baseRef }],
  };
  const handlers = Object.fromEntries(['preflight', 'prepare', 'verify', 'deliver'].map((phaseId) => [phaseId, async () => ({ status: 'passed', output: { repositories } })]));
  handlers.cleanup = async () => ({ status: 'passed', output: { repositories, completion } });
  const result = await executeFinishRun({ root, run, handlers, runtime });
  assert.equal(result.status, 'complete');
  return { runtime, exactTargetIdentity: plan.leaseTargetIdentity, finishResult: selfBootstrapTaskFinishResult(result) };
}

function multiRepositoryFinishInput(root, baseRef, { workspaceDisposition = 'applicable', mode = 'doctor-blocked' } = {}) {
  const base = mode === 'doctor-blocked'
    ? doctorBlockedResult(root, baseRef, ['projects/product/services/buildr/src/workspace.mjs'])
    : finishResult(root, baseRef, ['projects/product/services/buildr/src/workspace.mjs']);
  const container = path.join(root, '.buildr', 'transient', 'task-finish', 'carriers', base.runId);
  const workspaceRoot = path.join(container, 'workspace-111');
  const serviceRoot = path.join(container, 'service-222');
  const workspaceCarrier = workspaceDisposition === 'applicable' ? {
    selector: 'workspace',
    identity: 'sha256-workspace-carrier',
    root: workspaceRoot,
    activationPaths: ['projects/product/services/buildr/src/workspace.mjs'],
  } : null;
  const serviceCarrier = {
    selector: 'service:product/example',
    identity: 'sha256-service-carrier',
    root: serviceRoot,
    activationPaths: ['projects/product/services/buildr/resources/manifest.yml'],
  };
  const workspaceRepository = {
    selector: 'workspace',
    disposition: workspaceDisposition,
    reason: workspaceDisposition === 'not-applicable' ? 'no-contribution' : null,
    targetBranch: 'dev',
    remote: 'origin',
    leaseTargetIdentity: 'sha256-workspace-target',
    carrier: workspaceCarrier,
    delivery: workspaceDisposition === 'applicable'
      ? { status: mode === 'doctor-blocked' ? 'activation-blocked' : 'delivered', remoteAfterRef: baseRef, finalRemoteRef: baseRef }
      : null,
  };
  const carriers = [serviceCarrier, ...(workspaceCarrier ? [workspaceCarrier] : [])];
  return {
    ...base,
    carrierContainerRoot: container,
    repositories: [
      { selector: 'service:product/example', disposition: 'applicable', reason: null, targetBranch: 'dev', remote: 'origin', leaseTargetIdentity: 'sha256-service-target', carrier: serviceCarrier, delivery: { status: 'delivered', remoteAfterRef: baseRef, finalRemoteRef: baseRef } },
      workspaceRepository,
    ],
    workspaceRepository,
    carriers,
    selfBootstrap: {
      applicability: workspaceDisposition,
      reason: workspaceDisposition === 'not-applicable' ? 'no-contribution' : null,
      activationPaths: workspaceCarrier?.activationPaths || [],
      baseRef: workspaceDisposition === 'applicable' ? baseRef : null,
    },
    resume: mode === 'doctor-blocked'
      ? { ...base.resume, carrierIdentity: workspaceCarrier?.identity || serviceCarrier.identity }
      : null,
  };
}

function executor(root, options = {}) {
  const canonicalRoot = fs.realpathSync(root);
  let finishResumeIndex = 0;
  let successfulPushes = 0;
  let postPushReadbacks = 0;
  return (executable, args, context) => {
    if (executable === 'git') {
      if (args[0] === 'push' && options.failPush) return { status: 1, stdout: '', stderr: 'simulated push failure' };
      if (args[0] === 'ls-remote' && successfulPushes > 0 && postPushReadbacks < (options.failRemoteReadbackAttempts || 0)) {
        postPushReadbacks += 1;
        return { status: 1, stdout: '', stderr: 'simulated transient remote readback failure' };
      }
      const result = run(executable, args, context.cwd);
      if (args[0] === 'push' && result.status === 0) successfulPushes += 1;
      return result;
    }
    const productScript = path.join(canonicalRoot, 'projects', 'product', 'services', 'buildr', 'bin', 'buildr.mjs');
    const projectBridge = path.join(canonicalRoot, 'projects', 'product', 'buildr');
    const launcher = path.join(canonicalRoot, 'projects', 'product', 'services', 'buildr', 'tools', 'development', 'run-development-cli');
    const launcherManager = path.join(canonicalRoot, 'projects', 'product', 'services', 'buildr', 'package', 'launchers', 'manage.mjs');
    const continuityHelper = path.join(canonicalRoot, 'skills', 'buildr-self-bootstrap-sync', 'scripts', 'development-web-continuity.mjs');
    const targetLeaseDriver = path.join(canonicalRoot, 'projects', 'product', 'services', 'buildr', 'src', 'task', 'interfaces', 'internal', 'task-finish-target-lease-driver.mjs');
    const maintenanceDriver = path.join(canonicalRoot, 'projects', 'product', 'services', 'buildr', 'src', 'task', 'interfaces', 'internal', 'task-finish-maintenance-driver.mjs');
    let resolvedExecutable = null;
    try { resolvedExecutable = fs.realpathSync(executable); } catch { /* unexpected commands are handled below */ }
    if (resolvedExecutable === fs.realpathSync(projectBridge)) {
      if (context.env?.BUILDR_INTERNAL_DEVELOPMENT_CLI_IDENTITY_JSON === '1') {
        if (options.failCliInspection) return { status: 1, stdout: '', stderr: 'inspection failed' };
        return {
          status: 0,
          stdout: JSON.stringify({
            schemaVersion: 'buildr.development-cli-identity/v1',
            launcher: options.observedLauncher || launcher,
            cliEntry: options.observedCliEntry || productScript,
            nodeExecutable: options.observedNodeExecutable || process.execPath,
          }),
          stderr: '',
        };
      }
      if (args[0] === 'version') {
        if (options.failCliVersion) return { status: 1, stdout: '', stderr: 'version failed' };
        return { status: 0, stdout: JSON.stringify({
          package: options.observedPackage || '@buildr-ai/buildr',
          version: options.observedVersion || '0.1.0-test',
          channel: options.observedChannel || 'development',
          sourceCommit: options.observedSourceCommit || git(canonicalRoot, 'rev-parse', 'HEAD'),
          runtime: { executable: options.observedVersionNode || process.execPath },
        }), stderr: '' };
      }
      if (args[0] === 'doctor') return { status: 0, stdout: JSON.stringify({ health: { ready: true } }), stderr: '' };
      if (args[0] === 'task') {
        const payload = options.finishResumeResults?.[finishResumeIndex++] || { status: 'complete', runId: 'closeout-run', resolvedContext: { identity: 'sha256-context' }, resumePreflight: 'passed', doctor: 'ready' };
        return { status: 0, stdout: JSON.stringify(payload), stderr: '' };
      }
    }
    if (executable === process.execPath && args[0] === productScript) {
      const productArgs = args.slice(1);
      if (productArgs[0] === 'task' && productArgs[1] === 'inspect') {
        const inspectedTask = productArgs[2];
        if (options.taskInspectionFailures?.includes(inspectedTask)) return { status: 1, stdout: '', stderr: `task inspection failed: ${inspectedTask}` };
        const inspection = options.taskInspections?.[inspectedTask] ?? { record: { status: options.defaultTaskStatus || 'active' } };
        return { status: 0, stdout: JSON.stringify(inspection), stderr: '' };
      }
      if (productArgs[0] === 'task' && productArgs[1] === 'finish' && productArgs[2] === 'inspect') {
        const inspectedRun = productArgs[productArgs.indexOf('--run') + 1];
        if (options.finishInspectionFailures?.includes(inspectedRun)) return { status: 1, stdout: '', stderr: `inspection failed: ${inspectedRun}` };
        const inspection = options.finishInspections?.[inspectedRun] ?? options.finishInspection;
        return { status: 0, stdout: JSON.stringify(inspection), stderr: '' };
      }
      if (productArgs[0] === 'task' && productArgs[1] === 'finish' && productArgs[2] === 'run') {
        const payload = options.finishResumeResults?.[finishResumeIndex++] || { status: 'complete', runId: 'closeout-run', resolvedContext: { identity: 'sha256-context' }, resumePreflight: 'passed', doctor: 'ready' };
        return { status: 0, stdout: JSON.stringify(payload), stderr: '' };
      }
      if (productArgs[0] === 'sync') {
        fs.writeFileSync(path.join(root, 'skills', 'generated', 'SKILL.md'), 'v2\n');
        return { status: options.failSync ? 1 : 0, stdout: '{"status":"synced"}', stderr: options.failSync ? 'sync failed' : '' };
      }
    }
    if (executable === process.execPath && args[0] === targetLeaseDriver) {
      if (options.realTargetLeaseDriver) return run(executable, [options.realTargetLeaseDriver, ...args.slice(1)], context.cwd);
      const action = args[1];
      const value = (name) => args[args.indexOf(name) + 1];
      const targetIdentity = value('--target-identity');
      if (options.targetLeaseHeld && action !== 'release') return {
        status: 1,
        stdout: JSON.stringify({
          schemaVersion: 'buildr.task-finish-target-lease-driver-result/v1', operation: action, status: 'blocked',
          taskId: value('--task'), runId: value('--run'), targetIdentity, resolvedTargetIdentity: targetIdentity, resolution: 'exact', lease: null,
          existing: { taskId: 'foreign-task', runId: 'foreign-run', targetIdentity, expiresAt: new Date(Date.now() + 60_000).toISOString(), expired: false },
        }),
        stderr: '',
      };
      return {
        status: 0,
        stdout: JSON.stringify({
          schemaVersion: 'buildr.task-finish-target-lease-driver-result/v1', operation: action, status: 'passed',
          taskId: value('--task'), runId: value('--run'), targetIdentity, resolvedTargetIdentity: targetIdentity, resolution: 'exact',
          ...(action === 'release' ? { released: true } : { lease: { token: 'self-bootstrap-lease-token', expiresAt: new Date(Date.now() + 900_000).toISOString() }, existing: null }),
        }),
        stderr: '',
      };
    }
    if (executable === process.execPath && args[0] === maintenanceDriver) {
      const value = (name) => args[args.indexOf(name) + 1];
      return {
        status: 0,
        stdout: JSON.stringify({ schemaVersion: 'buildr.task-finish-maintenance-driver-result/v1', operation: 'maintenance', status: 'refreshed', taskId: value('--task'), runId: value('--run'), maintenance: { delivery: 'delivered', activation: 'passed', environmentCleanup: 'pending', diagnostics: 'not-opened' } }),
        stderr: '',
      };
    }
    if (executable === process.execPath && args[0] === launcherManager) {
      if (options.failLauncherInstall) return { status: 1, stdout: '', stderr: 'launcher manager failed' };
      return {
        status: 0,
        stdout: JSON.stringify({
          schemaVersion: 'buildr.launcher-status/v1',
          channel: 'development',
          installed: true,
          target: path.join(canonicalRoot, 'Buildr Web Dev.app'),
          identity: {
            schemaVersion: 'buildr.launcher-identity/v1',
            channel: 'development',
            webPort: DEFAULT_DEVELOPMENT_WEB_PORT,
            source: 'checkout',
            sourceRoot: options.observedLauncherSourceRoot || path.join(canonicalRoot, 'projects', 'product', 'services', 'buildr'),
            developmentRuntime: { executable: options.observedLauncherNode || process.execPath },
            checkout: { head: options.observedLauncherHead || git(canonicalRoot, 'rev-parse', 'HEAD') },
          },
        }),
        stderr: '',
      };
    }
    if (executable === process.execPath && args[0] === continuityHelper) {
      if (args[1] === 'inspect') {
        if (options.failContinuityInspect) return { status: 1, stdout: '', stderr: 'continuity inspection failed' };
        const healthy = options.runningDevelopmentInstance === true;
        return {
          status: 0,
          stdout: JSON.stringify({
            schemaVersion: 'buildr.development-web-continuity/v1',
            action: 'inspect',
            status: healthy ? 'healthy-development' : (options.continuityStatus || 'not-running'),
            reason: healthy ? null : (options.continuityStatus || 'instance-record-absent'),
            instance: healthy ? {
              url: 'http://127.0.0.1:4317',
              port: 4317,
              pid: options.previousDevelopmentPid || 71173,
              launcherIdentity: { channel: 'development' },
              productIdentity: null,
            } : null,
          }),
          stderr: '',
        };
      }
      if (args[1] === 'restart') {
        if (options.occupiedDevelopmentPort) {
          return { status: 1, stdout: '', stderr: JSON.stringify({ code: 'EADDRINUSE', message: `listen EADDRINUSE: 127.0.0.1:${DEFAULT_DEVELOPMENT_WEB_PORT}` }) };
        }
        if (options.failDevelopmentRestart) {
          return { status: 1, stdout: '', stderr: JSON.stringify({ code: 'development-web-continuity.start-timeout', details: { cleanup: { pid: 72200, status: 'requested' } } }) };
        }
        const value = (name) => args[args.indexOf(name) + 1];
        const previousPid = Number(value('--previous-pid'));
        const port = Number(value('--port'));
        const previousPort = Number(value('--previous-port'));
        return {
          status: 0,
          stdout: JSON.stringify({
            schemaVersion: 'buildr.development-web-continuity/v1',
            action: 'restart',
            status: 'passed',
            previous: { pid: previousPid, port: previousPort },
            instance: {
              url: `http://127.0.0.1:${port}`,
              port,
              pid: options.restartedDevelopmentPid || previousPid + 1,
              launcherIdentity: { channel: 'development' },
              productIdentity: null,
            },
            launcherIdentity: {
              schemaVersion: 'buildr.launcher-identity/v1',
              channel: 'development',
              source: 'checkout',
              sourceRoot: options.observedRestartSourceRoot || path.join(canonicalRoot, 'projects', 'product', 'services', 'buildr'),
              developmentRuntime: { executable: options.observedRestartNode || process.execPath },
              checkout: { head: options.observedRestartHead || git(canonicalRoot, 'rev-parse', 'HEAD') },
            },
            cleanup: null,
          }),
          stderr: '',
        };
      }
    }
    return { status: 1, stdout: '', stderr: `unexpected command: ${executable} ${args.join(' ')}` };
  };
}

function phase(result, id) {
  return result.phases.find((item) => item.id === id);
}

function commitBuildrTask(root, taskId, pathname = `${taskId}.txt`) {
  fs.writeFileSync(path.join(root, pathname), `${taskId}\n`);
  git(root, 'add', '--', pathname);
  git(root, 'commit', '-m', `deliver ${taskId}`, '-m', `Buildr-Task: ${taskId}`);
  git(root, 'push', 'origin', 'dev');
  return git(root, 'rev-parse', 'HEAD');
}

function commitRemoteTask(remote, taskId, { buildrOwned = true } = {}) {
  const updater = path.join(path.dirname(remote), `updater-${taskId}`);
  const cloned = run('git', ['clone', '--branch', 'dev', remote, updater], path.dirname(remote));
  assert.equal(cloned.status, 0, cloned.stderr || cloned.stdout);
  git(updater, 'config', 'user.name', 'Buildr Remote Test');
  git(updater, 'config', 'user.email', 'buildr-remote-test@example.com');
  fs.writeFileSync(path.join(updater, `${taskId}.txt`), `${taskId}\n`);
  git(updater, 'add', '--', `${taskId}.txt`);
  if (buildrOwned) git(updater, 'commit', '-m', `deliver ${taskId}`, '-m', `Buildr-Task: ${taskId}`);
  else git(updater, 'commit', '-m', `unowned ${taskId}`);
  git(updater, 'push', 'origin', 'dev');
  return git(updater, 'rev-parse', 'HEAD');
}

test('fresh closeout以精确successor commit和remote readback完成', (t) => {
  const { root, baseRef, environment } = fixture(t);
  const result = runSelfBootstrapCloseout({
    finishResult: finishResult(root, baseRef, ['projects/product/services/buildr/resources/manifest.yml']),
    workspaceRoot: root,
    nodeExecutable: process.execPath,
    execute: executor(root),
    environment,
  });
  assert.equal(result.status, 'passed', JSON.stringify(result.diagnostic));
  assert.equal(phase(result, 'sync').status, 'passed');
  assert.equal(phase(result, 'commit').status, 'passed');
  assert.equal(phase(result, 'push').status, 'passed');
  assert.equal(phase(result, 'verify-development-entry').status, 'passed');
  assert.equal(phase(result, 'finalize').status, 'passed');
  const head = git(root, 'rev-parse', 'HEAD');
  assert.notEqual(head, baseRef);
  assert.equal(git(root, 'rev-parse', 'HEAD^'), baseRef);
  assert.equal(git(root, 'ls-remote', '--heads', 'origin', 'dev').split(/\s+/)[0], head);
  const message = git(root, 'show', '-s', '--format=%B', 'HEAD');
  assert.match(message, /Buildr-Finish-Run: closeout-run/);
  assert.match(message, new RegExp(`Buildr-Closeout-Plan: ${result.plan.identity}`));
});

test('Skill命令入口消费cleanup后无carrier root的terminal稳定投影', (t) => {
  const { root, baseRef, environment } = fixture(t);
  const canonical = canonicalFinishResult(root, baseRef, ['projects/product/services/buildr/src/example.mjs'], {
    phases: [{ id: 'cleanup', status: 'passed' }],
    carrier: {
      identity: 'sha256-cleaned-carrier',
      changedPaths: ['projects/product/services/buildr/src/example.mjs'],
    },
    completion: {
      status: 'complete',
      finalRemoteRef: baseRef,
      cleanup: { status: 'cleaned' },
    },
  });
  const finish = selfBootstrapTaskFinishResult(canonical);
  assert.equal(finish.workspaceRepository.carrier.root, null);
  assert.equal(finish.workspaceRepository.carrier.availability, 'cleaned');
  fs.mkdirSync(finish.carrierContainerRoot, { recursive: true });

  const result = runSelfBootstrapCloseoutCommand({
    args: ['--run', finish.runId, '--target', root, '--node-executable', process.execPath],
    actualNodeExecutable: process.execPath,
    execute: executor(root, { finishInspection: finish }),
    environment,
  });

  assert.equal(result.status, 'passed', JSON.stringify(result.diagnostic));
  assert.equal(fs.existsSync(finish.carrierContainerRoot), false);
  assert.equal(result.recoveryPlan.status, 'advisory');
  assert.equal(result.recoveryPlan.observations[0].classification, 'stale-empty-container');
  assert.equal(result.recoveryPlan.observations[0].effect.type, 'removed-stale-empty-carrier-container');
  assert.deepEqual(result.plan.frozenPaths, ['projects/product/services/buildr/src/example.mjs']);
  assert.equal(phase(result, 'verify-development-entry').status, 'passed');
  assert.equal(phase(result, 'finalize').status, 'passed');
});

test('foreign cleaned空run container自动收敛且不阻断当前closeout', (t) => {
  const { root, baseRef, environment } = fixture(t);
  const current = doctorBlockedResult(root, baseRef, ['projects/product/services/buildr/src/example.mjs']);
  const foreign = cleanedFinishResult(root, baseRef, 'foreign-cleaned-empty');
  createCarrier(root, current.runId);
  fs.mkdirSync(foreign.carrierContainerRoot, { recursive: true });

  const result = runSelfBootstrapCloseoutCommand({
    args: ['--run', current.runId, '--target', root, '--node-executable', process.execPath],
    actualNodeExecutable: process.execPath,
    execute: executor(root, { finishInspections: { [current.runId]: current, [foreign.runId]: foreign } }),
    environment,
  });

  assert.equal(result.status, 'passed', JSON.stringify(result.diagnostic));
  assert.equal(fs.existsSync(foreign.carrierContainerRoot), false);
  const observation = result.recoveryPlan.observations.find((item) => item.runId === foreign.runId);
  assert.equal(observation.classification, 'stale-empty-container');
  assert.equal(observation.owner.taskId, foreign.identity.taskId);
  assert.deepEqual(result.recoveryPlan.orderedSteps, []);
});

test('cleaned carrier container非空或identity不匹配时保持fail closed', async (t) => {
  for (const scenario of [
    {
      name: 'non-empty',
      mutate(root, finish) { fs.writeFileSync(path.join(finish.carrierContainerRoot, 'unexpected.txt'), 'retain\n'); },
      code: 'self-bootstrap-closeout.cleaned-carrier-container-not-empty',
    },
    {
      name: 'identity-mismatch',
      mutate(root, finish) { finish.workspaceRepository.carrier = { ...finish.workspaceRepository.carrier, identity: 'sha256-mismatched-cleaned-carrier' }; },
      code: 'self-bootstrap-closeout.workspace-carrier-set-mismatch',
    },
  ]) {
    await t.test(scenario.name, (t) => {
      const { root, baseRef, environment } = fixture(t);
      const finish = cleanedFinishResult(root, baseRef, `cleaned-${scenario.name}`);
      fs.mkdirSync(finish.carrierContainerRoot, { recursive: true });
      scenario.mutate(root, finish);

      const result = runSelfBootstrapCloseoutCommand({
        args: ['--run', finish.runId, '--target', root, '--node-executable', process.execPath],
        actualNodeExecutable: process.execPath,
        execute: executor(root, { finishInspection: finish }),
        environment,
      });

      assert.equal(result.status, 'blocked');
      assert.equal(fs.existsSync(finish.carrierContainerRoot), true);
      assert.deepEqual(result.effects, []);
      const observation = result.recoveryPlan.observations.find((item) => item.runId === finish.runId);
      assert.equal(observation.classification, 'unprovable');
      assert.equal(observation.diagnostic.code, scenario.code);
    });
  }

  await t.test('symlink', (t) => {
    const { root, baseRef, environment } = fixture(t);
    const finish = cleanedFinishResult(root, baseRef, 'cleaned-symlink');
    const outside = path.join(path.dirname(root), 'cleaned-symlink-outside');
    fs.mkdirSync(path.dirname(finish.carrierContainerRoot), { recursive: true });
    fs.mkdirSync(outside);
    fs.symlinkSync(outside, finish.carrierContainerRoot);

    const result = runSelfBootstrapCloseoutCommand({
      args: ['--run', finish.runId, '--target', root, '--node-executable', process.execPath],
      actualNodeExecutable: process.execPath,
      execute: executor(root, { finishInspection: finish }),
      environment,
    });

    assert.equal(result.status, 'blocked');
    assert.equal(fs.lstatSync(finish.carrierContainerRoot).isSymbolicLink(), true);
    assert.deepEqual(result.effects, []);
    const observation = result.recoveryPlan.observations.find((item) => item.runId === finish.runId);
    assert.equal(observation.classification, 'unprovable');
    assert.equal(observation.diagnostic.code, 'self-bootstrap-closeout.carrier-entry-invalid');
  });
});

test('commit后push失败保留successor，重跑从同一commit恢复', (t) => {
  const { root, baseRef, environment } = fixture(t);
  const input = finishResult(root, baseRef, ['projects/product/services/buildr/resources/manifest.yml']);
  const first = runSelfBootstrapCloseout({ finishResult: input, workspaceRoot: root, nodeExecutable: process.execPath, execute: executor(root, { failPush: true }), environment });
  assert.equal(first.status, 'blocked');
  assert.equal(phase(first, 'commit').status, 'passed');
  assert.equal(phase(first, 'push').status, 'blocked');
  const successor = git(root, 'rev-parse', 'HEAD');
  assert.equal(git(root, 'ls-remote', '--heads', 'origin', 'dev').split(/\s+/)[0], baseRef);

  const second = runSelfBootstrapCloseout({ finishResult: input, workspaceRoot: root, nodeExecutable: process.execPath, execute: executor(root), environment });
  assert.equal(second.status, 'passed', JSON.stringify(second.diagnostic));
  assert.equal(git(root, 'rev-parse', 'HEAD'), successor);
  assert.equal(git(root, 'ls-remote', '--heads', 'origin', 'dev').split(/\s+/)[0], successor);
});

test('remote已包含合法successor时不重复commit或push', (t) => {
  const { root, baseRef, environment } = fixture(t);
  const input = finishResult(root, baseRef, ['projects/product/services/buildr/resources/manifest.yml']);
  const first = runSelfBootstrapCloseout({ finishResult: input, workspaceRoot: root, nodeExecutable: process.execPath, execute: executor(root), environment });
  assert.equal(first.status, 'passed');
  const successor = git(root, 'rev-parse', 'HEAD');
  const second = runSelfBootstrapCloseout({ finishResult: input, workspaceRoot: root, nodeExecutable: process.execPath, execute: executor(root), environment });
  assert.equal(second.status, 'passed', JSON.stringify(second.diagnostic));
  assert.equal(git(root, 'rev-parse', 'HEAD'), successor);
  assert.equal(phase(second, 'commit').effects.length, 0);
  assert.equal(phase(second, 'push').effects.length, 0);
});

test('较早Result在已push的Buildr Task descendant上选择当前activation base', (t) => {
  const { root, baseRef, environment } = fixture(t);
  const descendant = commitBuildrTask(root, 'later-finish');
  const result = runSelfBootstrapCloseout({
    finishResult: finishResult(root, baseRef, ['projects/product/services/buildr/src/example.mjs']),
    workspaceRoot: root,
    nodeExecutable: process.execPath,
    execute: executor(root),
    environment,
  });
  assert.equal(result.status, 'passed', JSON.stringify(result.diagnostic));
  assert.equal(git(root, 'rev-parse', 'HEAD'), descendant);
  assert.equal(phase(result, 'commit').status, 'not-applicable');
  assert.deepEqual(phase(result, 'preflight').effects.find((item) => item.type === 'activation-base-selected'), {
    type: 'activation-base-selected',
    frozenRef: baseRef,
    activationBaseRef: descendant,
    recovery: 'fresh-descendant',
  });
  assert.deepEqual(phase(result, 'preflight').effects.find((item) => item.type === 'published-linear-descendant'), {
    type: 'published-linear-descendant',
    baseRef,
    head: descendant,
    commits: [descendant],
  });
});

test('无Buildr trailer且tree改变的已发布协作者successor可作为activation base但不复用旧研发证据', (t) => {
  const { root, remote, baseRef, environment } = fixture(t);
  const successor = commitRemoteTask(remote, 'human-successor', { buildrOwned: false });
  const result = runSelfBootstrapCloseout({
    finishResult: finishResult(root, baseRef, ['projects/product/services/buildr/src/example.mjs']),
    workspaceRoot: root,
    nodeExecutable: process.execPath,
    execute: executor(root),
    environment,
  });

  assert.equal(result.status, 'passed', JSON.stringify(result.diagnostic));
  assert.equal(git(root, 'rev-parse', 'HEAD'), successor);
  assert.notEqual(git(root, 'rev-parse', `${baseRef}^{tree}`), git(root, 'rev-parse', `${successor}^{tree}`));
  assert.equal(git(root, 'show', '-s', '--format=%B', successor).includes('Buildr-Task:'), false);
  assert.deepEqual(phase(result, 'preflight').effects.find((item) => item.type === 'published-linear-descendant'), {
    type: 'published-linear-descendant',
    baseRef,
    head: successor,
    commits: [successor],
  });
  assert.equal(phase(result, 'verify-development-entry').status, 'passed');
  assert.equal(phase(result, 'finalize').status, 'passed');
});

test('descendant sync successor以当前activation base为parent并可被下一Result顺序消费', (t) => {
  const { root, baseRef, environment } = fixture(t);
  const delivered = commitBuildrTask(root, 'later-finish');
  const first = runSelfBootstrapCloseout({
    finishResult: finishResult(root, baseRef, ['projects/product/services/buildr/resources/manifest.yml']),
    workspaceRoot: root,
    nodeExecutable: process.execPath,
    execute: executor(root),
    environment,
  });
  assert.equal(first.status, 'passed', JSON.stringify(first.diagnostic));
  const successor = git(root, 'rev-parse', 'HEAD');
  assert.notEqual(successor, delivered);
  assert.equal(git(root, 'rev-parse', 'HEAD^'), delivered);

  const secondInput = finishResult(root, delivered, ['projects/product/services/buildr/src/example.mjs'], {
    runId: 'second-closeout-run',
    identity: {
      ...finishResult(root, delivered, []).identity,
      task: 'second-closeout-task',
    },
  });
  const second = runSelfBootstrapCloseout({
    finishResult: secondInput,
    workspaceRoot: root,
    nodeExecutable: process.execPath,
    execute: executor(root),
    environment,
  });
  assert.equal(second.status, 'passed', JSON.stringify(second.diagnostic));
  assert.equal(git(root, 'rev-parse', 'HEAD'), successor);
  assert.equal(phase(second, 'verify-development-entry').status, 'passed');
});

test('published linear descendant仍拒绝merge history', (t) => {
  const { root, baseRef, environment } = fixture(t);
  git(root, 'checkout', '-b', 'side');
  fs.writeFileSync(path.join(root, 'side.txt'), 'side\n');
  git(root, 'add', '--', 'side.txt');
  git(root, 'commit', '-m', 'side delivery', '-m', 'Buildr-Task: side-task');
  git(root, 'checkout', 'dev');
  fs.writeFileSync(path.join(root, 'main.txt'), 'main\n');
  git(root, 'add', '--', 'main.txt');
  git(root, 'commit', '-m', 'main delivery', '-m', 'Buildr-Task: main-task');
  git(root, 'merge', '--no-ff', 'side', '-m', 'merge deliveries', '-m', 'Buildr-Task: merge-task');
  git(root, 'push', 'origin', 'dev');
  const result = runSelfBootstrapCloseout({
    finishResult: finishResult(root, baseRef, ['projects/product/services/buildr/src/example.mjs']),
    workspaceRoot: root,
    nodeExecutable: process.execPath,
    execute: executor(root),
    environment,
  });
  assert.equal(result.status, 'blocked');
  assert.equal(result.diagnostic.code, 'self-bootstrap-closeout.descendant-merge-unprovable');
});

test('普通descendant尚未push时拒绝选择activation base', (t) => {
  const { root, baseRef, environment } = fixture(t);
  fs.writeFileSync(path.join(root, 'local-only.txt'), 'local only\n');
  git(root, 'add', '--', 'local-only.txt');
  git(root, 'commit', '-m', 'local task delivery', '-m', 'Buildr-Task: local-only-task');
  const result = runSelfBootstrapCloseout({
    finishResult: finishResult(root, baseRef, ['projects/product/services/buildr/src/example.mjs']),
    workspaceRoot: root,
    nodeExecutable: process.execPath,
    execute: executor(root),
    environment,
  });
  assert.equal(result.status, 'blocked');
  assert.equal(result.diagnostic.code, 'self-bootstrap-closeout.remote-drift');
  assert.equal(phase(result, 'verify-development-entry').status, 'not-applicable');
});

test('同target activation lease被其他run持有时在任何激活副作用前停止', (t) => {
  const { root, baseRef, environment } = fixture(t);
  const result = runSelfBootstrapCloseout({
    finishResult: finishResult(root, baseRef, ['projects/product/services/buildr/resources/manifest.yml']),
    workspaceRoot: root,
    nodeExecutable: process.execPath,
    execute: executor(root, { targetLeaseHeld: true }),
    environment,
  });

  assert.equal(result.status, 'blocked');
  assert.equal(result.diagnostic.code, 'self-bootstrap-closeout.target-lease-held');
  assert.deepEqual(result.effects, []);
  assert.equal(phase(result, 'sync').status, 'not-applicable');
  assert.equal(git(root, 'rev-parse', 'HEAD'), baseRef);
});

test('terminal v3投影由bundled runner通过真实driver取得精确repository lease', async (t) => {
  const { root, baseRef, environment } = fixture(t);
  const terminal = await terminalRepositoryFinish(root, baseRef);
  assert.equal(terminal.finishResult.workspaceRepository.leaseTargetIdentity, terminal.exactTargetIdentity);
  const realTargetLeaseDriver = path.resolve(import.meta.dirname, '../../src/task/interfaces/internal/task-finish-target-lease-driver.mjs');

  const result = runSelfBootstrapCloseout({
    finishResult: terminal.finishResult,
    workspaceRoot: root,
    nodeExecutable: process.execPath,
    execute: executor(root, { realTargetLeaseDriver }),
    environment,
  });

  assert.equal(result.status, 'passed', JSON.stringify(result.diagnostic));
  assert.equal(result.plan.leaseTargetIdentity, terminal.exactTargetIdentity);
  const leaseOperations = result.phases.flatMap((item) => item.operations)
    .filter((item) => item.kind === 'task-finish-target-lease');
  assert.ok(leaseOperations.some((item) => item.action === 'acquire'));
  assert.ok(leaseOperations.some((item) => item.action === 'refresh'));
  assert.ok(leaseOperations.some((item) => item.action === 'release'));
  for (const item of leaseOperations) {
    const payload = JSON.parse(item.stdout);
    assert.equal(payload.targetIdentity, terminal.exactTargetIdentity);
    assert.equal(payload.resolvedTargetIdentity, terminal.exactTargetIdentity);
    assert.equal(payload.resolution, 'exact');
  }
  assert.deepEqual(terminal.runtime.inspectTaskFinishPersistence(root).leases, []);
  assert.equal(terminal.runtime.readTaskFinishCompletionPersistence(root, { taskId: 'closeout-task' }).status, 'complete');

  const legacyAcquire = run(process.execPath, [
    realTargetLeaseDriver,
    'acquire',
    '--task', 'closeout-task',
    '--run', 'closeout-run',
    '--target-identity', 'origin:dev',
    '--target', root,
  ], root);
  assert.equal(legacyAcquire.status, 0, legacyAcquire.stderr);
  const legacyPayload = JSON.parse(legacyAcquire.stdout);
  assert.equal(legacyPayload.targetIdentity, 'origin:dev');
  assert.equal(legacyPayload.resolvedTargetIdentity, terminal.exactTargetIdentity);
  assert.equal(legacyPayload.resolution, 'legacy-logical-unique');
  const legacyRelease = run(process.execPath, [
    realTargetLeaseDriver,
    'release',
    '--task', 'closeout-task',
    '--run', 'closeout-run',
    '--target-identity', 'origin:dev',
    '--target', root,
    '--lease-token', legacyPayload.lease.token,
  ], root);
  assert.equal(legacyRelease.status, 0, legacyRelease.stderr);
  assert.equal(JSON.parse(legacyRelease.stdout).released, true);
  assert.deepEqual(terminal.runtime.inspectTaskFinishPersistence(root).leases, []);
});

test('self-bootstrap push后remote readback有界重试且不重复push', async (t) => {
  for (const scenario of [
    { name: 'transient', failures: 1, expectedStatus: 'passed', expectedCode: null, expectedReadbacks: 2 },
    { name: 'persistent', failures: 3, expectedStatus: 'blocked', expectedCode: 'self-bootstrap-closeout.remote-readback-failed', expectedReadbacks: 3 },
  ]) {
    await t.test(scenario.name, (t) => {
      const { root, baseRef, environment } = fixture(t);
      const result = runSelfBootstrapCloseout({
        finishResult: finishResult(root, baseRef, ['projects/product/services/buildr/resources/manifest.yml']),
        workspaceRoot: root,
        nodeExecutable: process.execPath,
        execute: executor(root, { failRemoteReadbackAttempts: scenario.failures }),
        environment,
      });
      const push = phase(result, 'push');
      assert.equal(result.status, scenario.expectedStatus, JSON.stringify(result.diagnostic));
      assert.equal(result.diagnostic?.code || null, scenario.expectedCode);
      assert.equal(push.operations.filter((item) => item.id === 'successor-push').length, 1);
      assert.equal(push.operations.filter((item) => item.id.startsWith('remote-after-push')).length, scenario.expectedReadbacks);
    });
  }
});

test('无匹配动作not-applicable且未push successor fail closed', (t) => {
  const { root, baseRef, environment } = fixture(t);
  const none = runSelfBootstrapCloseout({ finishResult: finishResult(root, baseRef, ['README.md']), workspaceRoot: root, nodeExecutable: process.execPath, execute: executor(root), environment });
  assert.equal(none.status, 'not-applicable');
  assert.equal(phase(none, 'sync').operations.length, 0);
  assert.equal(phase(none, 'finalize').operations.at(-1).id, 'refresh-finish-maintenance');
  assert.equal(none.maintenance.delivery, 'delivered');

  fs.writeFileSync(path.join(root, 'unknown.txt'), 'unknown\n');
  git(root, 'add', '--', 'unknown.txt');
  git(root, 'commit', '-m', 'unknown successor');
  const drift = runSelfBootstrapCloseout({ finishResult: finishResult(root, baseRef, ['projects/product/services/buildr/src/example.mjs']), workspaceRoot: root, nodeExecutable: process.execPath, execute: executor(root), environment });
  assert.equal(drift.status, 'blocked');
  assert.equal(drift.diagnostic.code, 'self-bootstrap-closeout.remote-drift');
  assert.equal(phase(drift, 'verify-development-entry').status, 'not-applicable');
});

test('development entry验证失败保留前序事实，Doctor blocked使用同一run resume', (t) => {
  const firstFixture = fixture(t);
  const installFailure = runSelfBootstrapCloseout({
    finishResult: finishResult(firstFixture.root, firstFixture.baseRef, ['projects/product/services/buildr/src/example.mjs']),
    workspaceRoot: firstFixture.root,
    nodeExecutable: process.execPath,
    execute: executor(firstFixture.root, { failCliInspection: true }),
    environment: firstFixture.environment,
  });
  assert.equal(installFailure.status, 'blocked');
  assert.equal(phase(installFailure, 'verify-development-entry').status, 'blocked');
  assert.equal(phase(installFailure, 'finalize').status, 'not-applicable');
  assert.equal(phase(installFailure, 'finalize').operations.at(-1).id, 'refresh-finish-maintenance');
  assert.ok(installFailure.maintenance, 'blocked terminal result must be persisted after Task/run identity is known');

  const secondFixture = fixture(t);
  const blocked = doctorBlockedResult(secondFixture.root, secondFixture.baseRef, ['projects/product/services/buildr/src/example.mjs']);
  createCarrier(secondFixture.root);
  const resumed = runSelfBootstrapCloseout({ finishResult: blocked, workspaceRoot: secondFixture.root, nodeExecutable: process.execPath, execute: executor(secondFixture.root), environment: secondFixture.environment });
  assert.equal(resumed.status, 'passed', JSON.stringify(resumed.diagnostic));
  assert.equal(phase(resumed, 'finalize').operations.find((item) => item.id === 'resume-finish-run').id, 'resume-finish-run');
  assert.equal(phase(resumed, 'finalize').operations.at(-1).id, 'refresh-finish-maintenance');
  assert.equal(phase(resumed, 'finalize').operations.filter((item) => item.id === 'final-doctor').length, 0);
});

test('自举恢复闭环以显式Project bridge完成sync、Launcher、identity与same-run resume', (t) => {
  const { root, baseRef, environment, defaultBuildr, projectBridge } = fixture(t);
  const input = doctorBlockedResult(root, baseRef, [
    'projects/product/services/buildr/resources/manifest.yml',
    'projects/product/services/buildr/src/example.mjs',
    'projects/product/services/buildr/package/launchers/manage.mjs',
  ]);
  createCarrier(root);

  const result = runSelfBootstrapCloseout({
    finishResult: input,
    workspaceRoot: root,
    nodeExecutable: process.execPath,
    execute: executor(root),
    environment,
  });

  assert.equal(result.status, 'passed', JSON.stringify(result.diagnostic));
  for (const id of ['sync', 'install-buildr-web', 'verify-development-entry', 'finalize']) {
    assert.equal(phase(result, id).status, 'passed', `${id} must pass in the same closeout chain`);
  }
  assert.equal(fs.readFileSync(defaultBuildr, 'utf8'), '#!/bin/sh\nexit 97\n');
  assert.equal(fs.realpathSync(result.developmentEntryIdentity.projectBridge), fs.realpathSync(projectBridge));
  assert.equal(fs.realpathSync(result.developmentEntryIdentity.nodeExecutable.observed), fs.realpathSync(process.execPath));
  const resumed = phase(result, 'finalize').operations.find((item) => item.id === 'resume-finish-run');
  assert.equal(JSON.parse(resumed.stdout).resumePreflight, 'passed');
  assert.equal(JSON.parse(resumed.stdout).doctor, 'ready');
});

test('Development Launcher只调用内部manager并在identity或安装失败时阻断finalize', (t) => {
  for (const scenario of [
    { name: 'success', options: {}, status: 'passed', code: null },
    { name: 'manager-failure', options: { failLauncherInstall: true }, status: 'blocked', code: 'self-bootstrap-closeout.local-app-install-failed' },
    { name: 'identity-drift', options: { observedLauncherHead: 'f'.repeat(40) }, status: 'blocked', code: 'self-bootstrap-closeout.local-app-identity-mismatch' },
  ]) {
    const current = fixture(t);
    const result = runSelfBootstrapCloseout({
      finishResult: finishResult(current.root, current.baseRef, ['projects/product/services/buildr/package/launchers/manage.mjs']),
      workspaceRoot: current.root,
      nodeExecutable: process.execPath,
      execute: executor(current.root, scenario.options),
      environment: current.environment,
    });
    assert.equal(result.status, scenario.status, `${scenario.name}: ${JSON.stringify(result.diagnostic)}`);
    assert.equal(result.diagnostic?.code || null, scenario.code);
    const install = phase(result, 'install-buildr-web');
    const manager = install.operations.find((item) => item.id === 'install-development-buildr-web');
    assert.equal(manager.kind, 'development-launcher-manager');
    assert.deepEqual(manager.args, ['install', '--channel', 'development']);
    assert.doesNotMatch(`${manager.script} ${manager.args.join(' ')}`, /bin\/buildr\.mjs web launcher/u);
    assert.equal(phase(result, 'finalize').status, scenario.status === 'passed' ? 'passed' : 'not-applicable');
  }
});

test('Development Web连续性只恢复安装前健康实例并迁移到固定端口', (t) => {
  const current = fixture(t);
  const result = runSelfBootstrapCloseout({
    finishResult: finishResult(current.root, current.baseRef, ['projects/product/services/buildr/package/launchers/manage.mjs']),
    workspaceRoot: current.root,
    nodeExecutable: process.execPath,
    execute: executor(current.root, { runningDevelopmentInstance: true }),
    environment: current.environment,
  });

  assert.equal(result.status, 'passed', JSON.stringify(result.diagnostic));
  const install = phase(result, 'install-buildr-web');
  assert.deepEqual(install.operations.filter((item) => item.kind !== 'task-finish-target-lease').map((item) => item.id), [
    'inspect-development-web-continuity',
    'install-development-buildr-web',
    'restart-development-web-continuity',
  ]);
  const restart = install.operations.find((item) => item.id === 'restart-development-web-continuity');
  assert.equal(restart.args[restart.args.indexOf('--port') + 1], String(DEFAULT_DEVELOPMENT_WEB_PORT));
  assert.equal(restart.args[restart.args.indexOf('--previous-port') + 1], '4317');
  const effect = install.effects.find((item) => item.type === 'development-web-continuity');
  assert.deepEqual(effect, {
    type: 'development-web-continuity', status: 'passed', reason: null,
    previousPid: 71173, currentPid: 71174, previousPort: 4317, currentPort: DEFAULT_DEVELOPMENT_WEB_PORT,
  });
});

test('Development Web安装前未运行、记录过期或owner不同时保持按需启动', (t) => {
  for (const continuityStatus of ['not-running', 'stale', 'different-owner']) {
    const current = fixture(t);
    const result = runSelfBootstrapCloseout({
      finishResult: finishResult(current.root, current.baseRef, ['projects/product/services/buildr/package/launchers/manage.mjs']),
      workspaceRoot: current.root,
      nodeExecutable: process.execPath,
      execute: executor(current.root, { continuityStatus }),
      environment: current.environment,
    });

    assert.equal(result.status, 'passed', `${continuityStatus}: ${JSON.stringify(result.diagnostic)}`);
    const install = phase(result, 'install-buildr-web');
    assert.equal(install.operations.some((item) => item.id === 'restart-development-web-continuity'), false);
    assert.deepEqual(install.effects.find((item) => item.type === 'development-web-continuity'), {
      type: 'development-web-continuity', status: 'not-applicable', reason: continuityStatus,
      previousPid: null, currentPid: null, previousPort: null, currentPort: null,
    });
  }
});

test('Development Web恢复失败或identity漂移时阻断后续activation', async (t) => {
  for (const scenario of [
    { name: 'start-timeout', options: { runningDevelopmentInstance: true, failDevelopmentRestart: true }, code: 'self-bootstrap-closeout.development-web-restart-failed' },
    { name: 'occupied-port', options: { runningDevelopmentInstance: true, occupiedDevelopmentPort: true }, code: 'self-bootstrap-closeout.development-web-restart-failed' },
    { name: 'identity-drift', options: { runningDevelopmentInstance: true, observedRestartHead: 'f'.repeat(40) }, code: 'self-bootstrap-closeout.development-web-restart-identity-mismatch' },
  ]) {
    await t.test(scenario.name, (t) => {
      const current = fixture(t);
      const result = runSelfBootstrapCloseout({
        finishResult: finishResult(current.root, current.baseRef, ['projects/product/services/buildr/package/launchers/manage.mjs']),
        workspaceRoot: current.root,
        nodeExecutable: process.execPath,
        execute: executor(current.root, scenario.options),
        environment: current.environment,
      });
      assert.equal(result.status, 'blocked');
      assert.equal(result.diagnostic.code, scenario.code);
      assert.equal(phase(result, 'verify-development-entry').status, 'not-applicable');
      assert.equal(phase(result, 'finalize').status, 'not-applicable');
      if (scenario.name === 'start-timeout') assert.match(phase(result, 'install-buildr-web').operations.find((item) => item.id === 'restart-development-web-continuity').stderr, /"status":"requested"/u);
      if (scenario.name === 'occupied-port') assert.match(phase(result, 'install-buildr-web').operations.find((item) => item.id === 'restart-development-web-continuity').stderr, /EADDRINUSE.*4458/u);
    });
  }
});

test('continuity helper认证health、验证新identity并回收失败启动PID', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-development-web-continuity-'));
  const dataRoot = path.join(root, 'data');
  const failureDataRoot = path.join(root, 'failure-data');
  const sourceRoot = path.join(root, 'service');
  const projectBridge = path.join(root, 'projects', 'product', 'buildr');
  const identityPath = path.join(root, 'launcher-identity.json');
  fs.mkdirSync(dataRoot, { recursive: true });
  fs.mkdirSync(failureDataRoot, { recursive: true });
  fs.mkdirSync(sourceRoot, { recursive: true });
  fs.mkdirSync(path.dirname(projectBridge), { recursive: true });
  fs.writeFileSync(projectBridge, '#!/bin/sh\n', { mode: 0o755 });
  const launcherIdentity = {
    schemaVersion: 'buildr.launcher-identity/v1',
    channel: 'development',
    source: 'checkout',
    sourceRoot,
    developmentRuntime: { executable: process.execPath },
    checkout: { head: 'a'.repeat(40) },
  };
  fs.writeFileSync(identityPath, JSON.stringify(launcherIdentity));
  const healthyFetch = async (_url, options) => {
    assert.equal(options.headers['x-buildr-instance'], 'secret');
    return { ok: true, status: 200 };
  };
  fs.writeFileSync(path.join(dataRoot, 'instance.json'), JSON.stringify({
    url: 'http://127.0.0.1:4317', secret: 'secret', pid: 71173, launcherIdentity,
  }));
  const inspected = await inspectDevelopmentInstance({ dataRoot, fetchImpl: healthyFetch });
  assert.equal(inspected.status, 'healthy-development');
  assert.equal(inspected.instance.port, 4317);

  let spawnOptions;
  const restarted = await restartDevelopmentInstance({
    projectBridge,
    port: DEFAULT_DEVELOPMENT_WEB_PORT,
    previousPort: 4317,
    launcherIdentityPath: identityPath,
    expectedSourceRoot: sourceRoot,
    expectedHead: 'a'.repeat(40),
    nodeExecutable: process.execPath,
    previousPid: 71173,
    dataRoot,
    fetchImpl: healthyFetch,
    spawnImpl: (_command, _args, options) => {
      spawnOptions = options;
      fs.writeFileSync(path.join(dataRoot, 'instance.json'), JSON.stringify({
        url: `http://127.0.0.1:${DEFAULT_DEVELOPMENT_WEB_PORT}`, secret: 'secret', pid: 71174, launcherIdentity,
      }));
      return { pid: 71174, exitCode: null, unref() {} };
    },
  });
  assert.equal(restarted.status, 'passed');
  assert.deepEqual(restarted.previous, { pid: 71173, port: 4317 });
  assert.equal(restarted.instance.port, DEFAULT_DEVELOPMENT_WEB_PORT);
  assert.equal(restarted.instance.pid, 71174);
  assert.equal(spawnOptions.env.BUILDR_NODE, process.execPath);
  assert.equal(spawnOptions.env.BUILDR_LAUNCHER_IDENTITY, identityPath);

  const killed = [];
  await assert.rejects(() => restartDevelopmentInstance({
    projectBridge,
    port: DEFAULT_DEVELOPMENT_WEB_PORT,
    previousPort: 4317,
    launcherIdentityPath: identityPath,
    expectedSourceRoot: sourceRoot,
    expectedHead: 'a'.repeat(40),
    nodeExecutable: process.execPath,
    previousPid: 71173,
    dataRoot: failureDataRoot,
    timeoutMs: 0,
    fetchImpl: healthyFetch,
    spawnImpl: () => ({ pid: 72200, exitCode: null, unref() {} }),
    killProcess: (pid, signal) => killed.push({ pid, signal }),
  }), (error) => {
    assert.equal(error.code, 'development-web-continuity.start-timeout');
    assert.deepEqual(error.details.cleanup, { pid: 72200, status: 'requested', reason: null });
    return true;
  });
  assert.deepEqual(killed, [{ pid: 72200, signal: 'SIGTERM' }]);
  await assert.rejects(() => restartDevelopmentInstance({
    projectBridge,
    port: 4317,
    previousPort: 4317,
    launcherIdentityPath: identityPath,
    expectedSourceRoot: sourceRoot,
    expectedHead: 'a'.repeat(40),
    nodeExecutable: process.execPath,
    previousPid: 71173,
    dataRoot,
    fetchImpl: healthyFetch,
  }), /continuity port must be 4458/u);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
});

test('continuity helper默认只读Development数据根且不复用正式产品根', () => {
  assert.equal(
    developmentWebDataRoot({}, 'darwin', '/test-home'),
    '/test-home/Library/Application Support/Buildr Dev',
  );
  assert.equal(
    developmentWebDataRoot({ LOCALAPPDATA: 'C:\\TestHome\\AppData\\Local' }, 'win32', 'C:\\TestHome'),
    path.join('C:\\TestHome\\AppData\\Local', 'Buildr Dev'),
  );
  assert.equal(
    developmentWebDataRoot({ XDG_STATE_HOME: '/tmp/state' }, 'linux', '/home/tester'),
    '/tmp/state/buildr-dev',
  );
  assert.equal(developmentWebDataRoot({ BUILDR_APP_DATA_DIR: '/tmp/isolated' }, 'darwin', '/test-home'), '/tmp/isolated');
});

test('development entry identity evidence覆盖完整入口链且complete只经Project bridge Doctor', (t) => {
  const { root, baseRef, environment, launcher, cliEntry, projectBridge, defaultBuildr } = fixture(t);
  const result = runSelfBootstrapCloseout({
    finishResult: finishResult(root, baseRef, ['projects/product/services/buildr/src/example.mjs']),
    workspaceRoot: root,
    nodeExecutable: process.execPath,
    execute: executor(root),
    environment,
  });

  assert.equal(result.status, 'passed', JSON.stringify(result.diagnostic));
  assert.equal(phase(result, 'verify-development-entry').status, 'passed');
  assert.equal(result.developmentEntryIdentity.status, 'passed');
  assert.equal(result.developmentEntryIdentity.command, 'projects/product/buildr');
  assert.equal(fs.realpathSync(result.developmentEntryIdentity.projectBridge), fs.realpathSync(projectBridge));
  assert.equal(fs.realpathSync(result.developmentEntryIdentity.launcher.expected), fs.realpathSync(launcher));
  assert.equal(fs.realpathSync(result.developmentEntryIdentity.launcher.observed), fs.realpathSync(launcher));
  assert.equal(fs.realpathSync(result.developmentEntryIdentity.cliEntry.expected), fs.realpathSync(cliEntry));
  assert.equal(fs.realpathSync(result.developmentEntryIdentity.cliEntry.observed), fs.realpathSync(cliEntry));
  assert.deepEqual(result.developmentEntryIdentity.nodeExecutable, { expected: process.execPath, observed: process.execPath });
  assert.deepEqual(result.developmentEntryIdentity.package, { expected: '@buildr-ai/buildr', observed: '@buildr-ai/buildr' });
  assert.deepEqual(result.developmentEntryIdentity.version, { expected: '0.1.0-test', observed: '0.1.0-test' });
  assert.deepEqual(result.developmentEntryIdentity.channel, { expected: 'development', observed: 'development' });
  assert.equal(phase(result, 'finalize').operations.filter((item) => item.id === 'final-doctor').length, 1);
  assert.equal(fs.realpathSync(phase(result, 'finalize').operations.find((item) => item.id === 'final-doctor').executable), fs.realpathSync(projectBridge));
  assert.equal(fs.readFileSync(defaultBuildr, 'utf8'), '#!/bin/sh\nexit 97\n');
});

test('development entry identity忽略PATH shadowing和旧symlink', async (t) => {
  for (const scenario of ['shadow', 'old-symlink']) {
    await t.test(scenario, (t) => {
      const current = fixture(t);
      const foreign = path.join(path.dirname(current.root), `${scenario}-launcher`);
      fs.writeFileSync(foreign, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
      const shadowBin = path.join(path.dirname(current.root), `${scenario}-bin`);
      fs.mkdirSync(shadowBin);
      fs.symlinkSync(foreign, path.join(shadowBin, 'buildr'));
      const environment = scenario === 'shadow'
        ? { ...current.environment, PATH: `${shadowBin}${path.delimiter}${current.environment.PATH}` }
        : { ...current.environment, PATH: shadowBin };
      const result = runSelfBootstrapCloseout({
        finishResult: finishResult(current.root, current.baseRef, ['projects/product/services/buildr/src/example.mjs']),
        workspaceRoot: current.root,
        nodeExecutable: process.execPath,
        execute: executor(current.root),
        environment,
      });

      assert.equal(result.status, 'passed', JSON.stringify(result.diagnostic));
      assert.equal(phase(result, 'verify-development-entry').status, 'passed');
      assert.equal(phase(result, 'finalize').status, 'passed');
    });
  }
});

test('development entry identity对入口链、版本和启动失败 fail closed', async (t) => {
  const scenarios = [
    ['entry', { observedCliEntry: '/tmp/old-buildr.mjs' }, 'self-bootstrap-closeout.development-entry-cli-mismatch'],
    ['version', { observedVersion: '0.0.0-old' }, 'self-bootstrap-closeout.development-entry-version-mismatch'],
    ['channel', { observedChannel: 'npm' }, 'self-bootstrap-closeout.development-entry-version-mismatch'],
    ['startup', { failCliInspection: true }, 'self-bootstrap-closeout.development-entry-inspection-failed'],
  ];
  for (const [name, options, code] of scenarios) {
    await t.test(name, (t) => {
      const current = fixture(t);
      const result = runSelfBootstrapCloseout({
        finishResult: finishResult(current.root, current.baseRef, ['projects/product/services/buildr/src/example.mjs']),
        workspaceRoot: current.root,
        nodeExecutable: process.execPath,
        execute: executor(current.root, options),
        environment: current.environment,
      });

      assert.equal(result.status, 'blocked');
      assert.equal(result.diagnostic.code, code);
      assert.equal(phase(result, 'finalize').status, 'not-applicable');
      assert.equal(result.developmentEntryIdentity.status, 'blocked');
    });
  }
});

test('Doctor blocked preflight只排除同一run自有carrier', (t) => {
  const { root, baseRef, environment } = fixture(t);
  const input = doctorBlockedResult(root, baseRef, ['projects/product/services/buildr/src/example.mjs']);
  createCarrier(root);

  const result = runSelfBootstrapCloseout({ finishResult: input, workspaceRoot: root, nodeExecutable: process.execPath, execute: executor(root), environment });

  assert.equal(result.status, 'passed', JSON.stringify(result.diagnostic));
  assert.match(phase(result, 'preflight').operations.find((item) => item.id === 'preflight-untracked').stdout, /closeout-run/);
});

test('latest target在activation前触发同一Finish run有界target-race恢复', (t) => {
  const { root, remote, baseRef, environment } = fixture(t);
  const input = doctorBlockedResult(root, baseRef, ['projects/product/services/buildr/resources/manifest.yml']);
  createCarrier(root);
  const latestRef = commitRemoteTask(remote, 'concurrent-finish');
  const converged = finishResult(root, latestRef, ['projects/product/services/buildr/resources/manifest.yml'], {
    runId: input.runId,
  });
  const result = runSelfBootstrapCloseout({
    finishResult: input,
    workspaceRoot: root,
    nodeExecutable: process.execPath,
    execute: executor(root, { finishResumeResults: [targetRaceResult(), converged] }),
    environment,
  });

  assert.equal(result.status, 'passed', JSON.stringify(result.diagnostic));
  assert.deepEqual(phase(result, 'preflight').operations.filter((item) => item.id.startsWith('resume-finish')).map((item) => item.id), [
    'resume-finish-before-activation',
    'resume-finish-target-race-before-activation',
  ]);
  assert.equal(phase(result, 'sync').status, 'passed');
  assert.equal(phase(result, 'finalize').operations.some((item) => item.id.startsWith('resume-finish')), false);
  assert.equal(result.plan.baseRef, latestRef);
});

test('latest target需要Delivery Adaptation时在sync安装Doctor前交还完整适配提示', (t) => {
  const { root, remote, baseRef, environment } = fixture(t);
  const input = doctorBlockedResult(root, baseRef, ['projects/product/services/buildr/resources/manifest.yml']);
  createCarrier(root);
  commitRemoteTask(remote, 'adaptation-baseline');
  const expectedCommitMessage = '交付任务\n\nBuildr-Task: closeout-task';
  const adaptation = {
    ...adaptationRequiredResult(root),
    deliveryAdaptation: {
      expectedCommitMessage,
      preparationHints: [{ id: 'prepare', cwd: '.', executable: 'npm', args: ['test'] }],
    },
  };
  const result = runSelfBootstrapCloseout({
    finishResult: input,
    workspaceRoot: root,
    nodeExecutable: process.execPath,
    execute: executor(root, { finishResumeResults: [adaptation] }),
    environment,
  });

  assert.equal(result.status, 'blocked');
  assert.equal(result.diagnostic.code, 'self-bootstrap-closeout.target-race-adaptation-required');
  assert.deepEqual(result.diagnostic.details.deliveryAdaptation, adaptation.deliveryAdaptation);
  assert.equal(phase(result, 'sync').status, 'not-applicable');
  assert.equal(phase(result, 'install-buildr-web').status, 'not-applicable');
  assert.equal(phase(result, 'verify-development-entry').status, 'not-applicable');
  assert.equal(phase(result, 'finalize').status, 'not-applicable');
  assert.deepEqual(result.effects.map((item) => item.type), ['retained-target-fast-forward']);
});

test('foreign-clear retry遇到target-race时有界承接一次并完成', (t) => {
  const { root, baseRef, environment } = fixture(t);
  const input = doctorBlockedResult(root, baseRef, ['projects/product/services/buildr/src/example.mjs']);
  createCarrier(root);
  const result = runSelfBootstrapCloseout({
    finishResult: input,
    workspaceRoot: root,
    nodeExecutable: process.execPath,
    allowLatestRemoteFastForward: true,
    execute: executor(root, { finishResumeResults: [
      targetRaceResult(),
      { status: 'complete', runId: input.runId, resolvedContext: { identity: 'sha256-context-after-race' } },
    ] }),
    environment,
  });

  assert.equal(result.status, 'passed', JSON.stringify(result.diagnostic));
  assert.deepEqual(phase(result, 'finalize').operations.filter((item) => item.id.startsWith('resume-finish')).map((item) => item.id), [
    'resume-finish-run',
    'resume-finish-target-race',
  ]);
});

test('foreign-clear target-race恢复需要Delivery Adaptation时交给Agent', (t) => {
  const { root, baseRef, environment } = fixture(t);
  const input = doctorBlockedResult(root, baseRef, ['projects/product/services/buildr/src/example.mjs']);
  createCarrier(root);
  const adaptation = adaptationRequiredResult(root);
  const result = runSelfBootstrapCloseout({
    finishResult: input,
    workspaceRoot: root,
    nodeExecutable: process.execPath,
    allowLatestRemoteFastForward: true,
    execute: executor(root, { finishResumeResults: [targetRaceResult(), adaptation] }),
    environment,
  });

  assert.equal(result.status, 'blocked');
  assert.equal(result.diagnostic.code, 'self-bootstrap-closeout.target-race-adaptation-required');
  assert.equal(result.diagnostic.details.runId, input.runId);
  assert.equal(result.diagnostic.details.carrier.root, adaptation.workspaceRepository.carrier.root);
  assert.equal(result.diagnostic.details.resume.token, adaptation.resume.token);
  assert.equal(phase(result, 'finalize').operations.filter((item) => item.id.startsWith('resume-finish')).length, 2);
});

test('foreign-clear target-race恢复拒绝不匹配的Delivery Adaptation carrier', (t) => {
  const { root, baseRef, environment } = fixture(t);
  const input = doctorBlockedResult(root, baseRef, ['projects/product/services/buildr/src/example.mjs']);
  createCarrier(root);
  const adaptation = adaptationRequiredResult(root);
  adaptation.resume.carrierIdentity = 'sha256-other-carrier';
  const result = runSelfBootstrapCloseout({
    finishResult: input,
    workspaceRoot: root,
    nodeExecutable: process.execPath,
    allowLatestRemoteFastForward: true,
    execute: executor(root, { finishResumeResults: [targetRaceResult(), adaptation] }),
    environment,
  });

  assert.equal(result.status, 'blocked');
  assert.equal(result.diagnostic.code, 'self-bootstrap-closeout.finish-resume-incomplete');
  assert.equal(phase(result, 'finalize').operations.filter((item) => item.id.startsWith('resume-finish')).length, 2);
});

test('普通closeout遇到target-race时同样有界恢复一次', (t) => {
  const { root, baseRef, environment } = fixture(t);
  const input = doctorBlockedResult(root, baseRef, ['projects/product/services/buildr/src/example.mjs']);
  createCarrier(root);
  const result = runSelfBootstrapCloseout({
    finishResult: input,
    workspaceRoot: root,
    nodeExecutable: process.execPath,
    execute: executor(root, { finishResumeResults: [targetRaceResult()] }),
    environment,
  });

  assert.equal(result.status, 'passed', JSON.stringify(result.diagnostic));
  assert.equal(phase(result, 'finalize').operations.filter((item) => item.id.startsWith('resume-finish')).length, 2);
});

test('foreign-clear target-race恢复再次race时停止且不形成循环', (t) => {
  const { root, baseRef, environment } = fixture(t);
  const input = doctorBlockedResult(root, baseRef, ['projects/product/services/buildr/src/example.mjs']);
  createCarrier(root);
  const result = runSelfBootstrapCloseout({
    finishResult: input,
    workspaceRoot: root,
    nodeExecutable: process.execPath,
    allowLatestRemoteFastForward: true,
    execute: executor(root, { finishResumeResults: [targetRaceResult(), targetRaceResult('sha256-target-race-again')] }),
    environment,
  });

  assert.equal(result.status, 'blocked');
  assert.equal(result.diagnostic.code, 'self-bootstrap-closeout.finish-resume-incomplete');
  assert.equal(result.diagnostic.details.resume.token, 'sha256-target-race-again');
  assert.equal(phase(result, 'finalize').operations.filter((item) => item.id.startsWith('resume-finish')).length, 2);
});

test('Doctor blocked preflight拒绝与run identity不匹配的carrier root', (t) => {
  const { root, baseRef, environment } = fixture(t);
  const input = doctorBlockedResult(root, baseRef, ['projects/product/services/buildr/src/example.mjs'], {
    carrier: {
      identity: 'sha256-carrier',
      changedPaths: ['projects/product/services/buildr/src/example.mjs'],
      root: createCarrier(root, 'different-run'),
    },
  });

  const result = runSelfBootstrapCloseout({ finishResult: input, workspaceRoot: root, nodeExecutable: process.execPath, execute: executor(root), environment });

  assert.equal(result.status, 'blocked');
  assert.equal(result.diagnostic.code, 'self-bootstrap-closeout.carrier-root-mismatch');
});

test('Doctor blocked preflight拒绝symlink carrier root', (t) => {
  const { root, baseRef, environment } = fixture(t);
  const input = doctorBlockedResult(root, baseRef, ['projects/product/services/buildr/src/example.mjs']);
  const outside = path.join(path.dirname(root), 'outside-carrier');
  const carrierRoot = path.join(root, '.buildr', 'transient', 'task-finish', 'carriers', input.runId);
  fs.mkdirSync(outside, { recursive: true });
  fs.mkdirSync(path.dirname(carrierRoot), { recursive: true });
  fs.symlinkSync(outside, carrierRoot);

  const result = runSelfBootstrapCloseout({ finishResult: input, workspaceRoot: root, nodeExecutable: process.execPath, execute: executor(root), environment });

  assert.equal(result.status, 'blocked');
  assert.equal(result.diagnostic.code, 'self-bootstrap-closeout.carrier-root-invalid');
});

test('Doctor blocked preflight仍阻断carrier外的untracked差异', (t) => {
  const { root, baseRef, environment } = fixture(t);
  const input = doctorBlockedResult(root, baseRef, ['projects/product/services/buildr/src/example.mjs']);
  createCarrier(root);
  fs.writeFileSync(path.join(root, 'unrelated.txt'), 'unrelated\n');

  const result = runSelfBootstrapCloseout({ finishResult: input, workspaceRoot: root, nodeExecutable: process.execPath, execute: executor(root), environment });

  assert.equal(result.status, 'blocked');
  assert.equal(result.diagnostic.code, 'self-bootstrap-closeout.workspace-dirty');
  assert.deepEqual(result.diagnostic.details.changedPaths, ['unrelated.txt']);
});

test('Doctor blocked preflight不排除carrier路径下的staged差异', (t) => {
  const { root, baseRef, environment } = fixture(t);
  const input = doctorBlockedResult(root, baseRef, ['projects/product/services/buildr/src/example.mjs']);
  const carrierRoot = createCarrier(root);
  git(root, 'add', '--', path.relative(root, path.join(carrierRoot, 'carrier.txt')));

  const result = runSelfBootstrapCloseout({ finishResult: input, workspaceRoot: root, nodeExecutable: process.execPath, execute: executor(root), environment });

  assert.equal(result.status, 'blocked');
  assert.equal(result.diagnostic.code, 'self-bootstrap-closeout.workspace-dirty');
  assert.deepEqual(result.diagnostic.details.changedPaths, ['.buildr/transient/task-finish/carriers/closeout-run/carrier.txt']);
});

test('proven foreign carrier只隔离未跟踪根且不掩盖staged差异', (t) => {
  const { root, baseRef, environment } = fixture(t);
  const current = doctorBlockedResult(root, baseRef, ['projects/product/services/buildr/src/example.mjs']);
  const foreign = cleanupPendingResult(root, baseRef, 'foreign-staged');
  createCarrier(root, current.runId);
  const foreignRoot = createCarrier(root, foreign.runId);
  const stagedPath = path.relative(root, path.join(foreignRoot, 'carrier.txt'));
  git(root, 'add', '--', stagedPath);

  const result = runSelfBootstrapCloseoutCommand({
    args: ['--run', current.runId, '--target', root, '--node-executable', process.execPath],
    actualNodeExecutable: process.execPath,
    execute: executor(root, { finishInspections: { [current.runId]: current, [foreign.runId]: foreign } }),
    environment,
  });

  assert.equal(result.status, 'blocked');
  assert.equal(result.recoveryPlan.status, 'advisory');
  assert.equal(result.diagnostic.code, 'self-bootstrap-closeout.workspace-dirty');
  assert.deepEqual(result.diagnostic.details.changedPaths, [stagedPath]);
});

test('plan identity由run、frozen paths和去重动作确定', () => {
  const root = '/tmp/buildr-plan';
  const result = finishResult(root, 'a'.repeat(40), [
    'projects/product/services/buildr/resources/manifest.yml',
    'projects/product/services/buildr/package.json',
  ]);
  const first = createSelfBootstrapCloseoutPlan(result);
  const second = createSelfBootstrapCloseoutPlan(result);
  assert.deepEqual(first, second);
  assert.equal(first.actions['sync-retained-workspace'].length, 1);
  assert.ok(first.actions['verify-development-entry'].length >= 1);
  assert.equal(first.actions['install-development-buildr-web'].length, 1);
});

test('Buildr runtime Skill source变化必须触发retained workspace sync', () => {
  const root = '/tmp/buildr-runtime-skill-plan';
  const result = finishResult(root, 'a'.repeat(40), [
    'projects/product/services/buildr/package/targets/runtime/skills/buildr/SKILL.md',
  ]);
  const plan = createSelfBootstrapCloseoutPlan(result);
  assert.deepEqual(plan.actions['sync-retained-workspace'], [
    'projects/product/services/buildr/package/targets/runtime/skills/buildr/SKILL.md',
  ]);
  assert.equal(plan.actions['verify-development-entry'].length, 1);
  assert.equal(plan.actions['install-development-buildr-web'].length, 0);
});

test('self-bootstrap精确路径矩阵区分通用runtime render与专用产品动作', () => {
  const root = '/tmp/buildr-self-bootstrap-path-matrix';
  const runtimeSourcePaths = [
    'skills/buildr-self-bootstrap-sync/SKILL.md',
    'skills/buildr-self-bootstrap-sync/scripts/closeout.mjs',
    'components/workspace/buildr-self-bootstrap/component.yml',
    'components/workspace/buildr-self-bootstrap/contributions/task-finish-post-finish.md',
  ];
  const runtimeSourcePlan = createSelfBootstrapCloseoutPlan(finishResult(root, 'a'.repeat(40), runtimeSourcePaths));
  assert.deepEqual(runtimeSourcePlan.actions, {
    'sync-retained-workspace': [],
    'install-development-buildr-web': [],
    'verify-development-entry': [],
  });

  const installerWrapperPlan = createSelfBootstrapCloseoutPlan(finishResult(root, 'b'.repeat(40), [
    'projects/product/services/buildr/tools/development/install-buildr-development',
  ]));
  assert.deepEqual(installerWrapperPlan.actions, {
    'sync-retained-workspace': [],
    'install-development-buildr-web': [],
    'verify-development-entry': [],
  });

  const launcherManagerPath = 'projects/product/services/buildr/package/launchers/manage.mjs';
  const launcherManagerPlan = createSelfBootstrapCloseoutPlan(finishResult(root, 'c'.repeat(40), [launcherManagerPath]));
  assert.deepEqual(launcherManagerPlan.actions, {
    'sync-retained-workspace': [],
    'install-development-buildr-web': [launcherManagerPath],
    'verify-development-entry': [launcherManagerPath],
  });

  const runtimeSkillPath = 'projects/product/services/buildr/package/targets/runtime/skills/buildr/SKILL.md';
  const runtimeSkillPlan = createSelfBootstrapCloseoutPlan(finishResult(root, 'd'.repeat(40), [runtimeSkillPath]));
  assert.deepEqual(runtimeSkillPlan.actions, {
    'sync-retained-workspace': [runtimeSkillPath],
    'install-development-buildr-web': [],
    'verify-development-entry': [runtimeSkillPath],
  });
});

test('零差异 Finish Result优先按activation paths规划自举并兼容changedPaths回退', () => {
  const root = '/tmp/buildr-zero-delta-plan';
  const zeroDelta = finishResult(root, 'a'.repeat(40), [], {
    carrier: {
      identity: 'sha256-zero-delta-carrier',
      root: path.join(root, '.buildr', 'transient', 'task-finish', 'carriers', 'closeout-run'),
      changedPaths: [],
      activationPaths: [
        'projects/product/services/buildr/resources/manifest.yml',
        'projects/product/services/buildr/src/example.mjs',
      ],
      zeroDelta: true,
    },
  });
  const plan = createSelfBootstrapCloseoutPlan(zeroDelta);
  assert.deepEqual(plan.frozenPaths, zeroDelta.workspaceRepository.carrier.activationPaths);
  assert.equal(plan.actions['sync-retained-workspace'].length, 1);
  assert.ok(plan.actions['verify-development-entry'].length >= 1);

  const legacy = createSelfBootstrapCloseoutPlan(finishResult(root, 'b'.repeat(40), ['projects/product/services/buildr/src/legacy.mjs']));
  assert.deepEqual(legacy.frozenPaths, ['projects/product/services/buildr/src/legacy.mjs']);
});

test('Skill命令入口通过Product CLI只读取得同一Finish Result', (t) => {
  const { root, baseRef, environment, projectBridge } = fixture(t);
  const finish = finishResult(root, baseRef, ['projects/product/services/buildr/src/example.mjs']);
  const result = runSelfBootstrapCloseoutCommand({
    args: ['--run', finish.runId, '--target', root, '--node-executable', process.execPath],
    actualNodeExecutable: process.execPath,
    execute: executor(root, { finishInspection: finish }),
    environment,
  });
  assert.equal(result.status, 'passed', JSON.stringify(result.diagnostic));
  assert.equal(phase(result, 'verify-development-entry').status, 'passed');
  const developmentOperation = phase(result, 'finalize').operations.find((item) => item.kind === 'development-entry');
  assert.equal(fs.realpathSync(developmentOperation.executable), fs.realpathSync(projectBridge));
  assert.equal(result.runId, finish.runId);
});

test('稳定投影同major新增字段不影响runner，未知major在零effect前拒绝', (t) => {
  const { root, baseRef, environment } = fixture(t);
  const additive = { ...finishResult(root, baseRef, ['README.md']), futureFacts: { additive: true } };
  const accepted = runSelfBootstrapCloseout({
    finishResult: additive,
    workspaceRoot: root,
    nodeExecutable: process.execPath,
    execute: executor(root),
    environment,
  });
  assert.equal(accepted.status, 'not-applicable');

  const rejected = runSelfBootstrapCloseout({
    finishResult: { ...additive, schemaVersion: 'buildr.task-finish-self-bootstrap-input/v2' },
    workspaceRoot: root,
    nodeExecutable: process.execPath,
    execute: executor(root),
    environment,
  });
  assert.equal(rejected.status, 'blocked');
  assert.equal(rejected.diagnostic.code, 'self-bootstrap-closeout.finish-result-schema-invalid');
  assert.deepEqual(rejected.effects, []);
  assert.equal(phase(rejected, 'preflight').operations.length, 0);
});

test('多仓库nested carrier只使用Workspace paths且验证全部carrier', (t) => {
  const { root, baseRef, environment } = fixture(t);
  const input = multiRepositoryFinishInput(root, baseRef);
  for (const carrier of input.carriers) {
    fs.mkdirSync(carrier.root, { recursive: true });
    fs.writeFileSync(path.join(carrier.root, 'carrier.txt'), `${carrier.selector}\n`);
  }
  const result = runSelfBootstrapCloseout({
    finishResult: input,
    workspaceRoot: root,
    nodeExecutable: process.execPath,
    execute: executor(root),
    environment,
  });
  assert.equal(result.status, 'passed', JSON.stringify(result.diagnostic));
  assert.deepEqual(result.plan.frozenPaths, ['projects/product/services/buildr/src/workspace.mjs']);
  assert.deepEqual(result.plan.actions['sync-retained-workspace'], []);
  assert.equal(result.plan.actions['verify-development-entry'].includes('projects/product/services/buildr/resources/manifest.yml'), false);
});

test('Workspace无贡献时Service carrier不触发自举且环境留给Finish cleanup', (t) => {
  const { root, baseRef, environment } = fixture(t);
  const input = multiRepositoryFinishInput(root, baseRef, { workspaceDisposition: 'not-applicable', mode: 'complete' });
  for (const carrier of input.carriers) {
    fs.mkdirSync(carrier.root, { recursive: true });
    fs.writeFileSync(path.join(carrier.root, 'carrier.txt'), `${carrier.selector}\n`);
  }
  const result = runSelfBootstrapCloseoutCommand({
    args: ['--run', input.runId, '--target', root, '--node-executable', process.execPath],
    actualNodeExecutable: process.execPath,
    execute: executor(root, { finishInspection: input }),
    environment,
  });
  assert.equal(result.status, 'not-applicable', JSON.stringify(result.diagnostic));
  assert.deepEqual(result.plan.frozenPaths, []);
  assert.equal(result.plan.applicability, 'not-applicable');
  assert.equal(fs.existsSync(input.carriers[0].root), true);
  assert.deepEqual(result.effects, []);
  assert.equal(phase(result, 'finalize').operations.at(-1).id, 'refresh-finish-maintenance');
  assert.equal(result.maintenance.delivery, 'delivered');
});

test('多仓库carrier越界或重复realpath时在activation前fail closed', async (t) => {
  for (const scenario of ['escaped', 'duplicate']) {
    await t.test(scenario, (t) => {
      const { root, baseRef, environment } = fixture(t);
      const input = multiRepositoryFinishInput(root, baseRef);
      for (const carrier of input.carriers) fs.mkdirSync(carrier.root, { recursive: true });
      if (scenario === 'escaped') {
        const outside = path.join(path.dirname(root), 'escaped-carrier');
        fs.mkdirSync(outside);
        input.carriers[0] = { ...input.carriers[0], root: outside };
        input.repositories[0] = { ...input.repositories[0], carrier: input.carriers[0] };
      } else {
        input.carriers[0] = { ...input.carriers[0], root: input.carriers[1].root };
        input.repositories[0] = { ...input.repositories[0], carrier: input.carriers[0] };
      }
      const result = runSelfBootstrapCloseoutCommand({
        args: ['--run', input.runId, '--target', root, '--node-executable', process.execPath],
        actualNodeExecutable: process.execPath,
        execute: executor(root, { finishInspection: input }),
        environment,
      });
      assert.equal(result.status, 'blocked');
      assert.equal(result.recoveryPlan.status, 'blocked');
      assert.deepEqual(result.effects, []);
      const observation = result.recoveryPlan.observations.find((item) => item.runId === input.runId);
      assert.equal(observation.classification, 'unprovable');
      assert.match(observation.diagnostic.code, scenario === 'escaped' ? /outside-container/ : /realpath-duplicate/);
    });
  }
});

test('multi-run preflight让proven foreign carrier共存并保留owner建议', (t) => {
  const { root, baseRef, environment } = fixture(t);
  const current = doctorBlockedResult(root, baseRef, ['projects/product/services/buildr/src/example.mjs']);
  const predecessorZ = cleanupPendingResult(root, baseRef, 'run-z', 'task-z');
  const predecessorA = cleanupPendingResult(root, baseRef, 'run-a', 'task-a');
  createCarrier(root, current.runId);
  createCarrier(root, predecessorZ.runId);
  createCarrier(root, predecessorA.runId);
  const invocations = [];
  const delegated = executor(root, {
    finishInspections: {
      [current.runId]: current,
      [predecessorZ.runId]: predecessorZ,
      [predecessorA.runId]: predecessorA,
    },
  });
  const execute = (...args) => {
    invocations.push({ executable: args[0], args: args[1] });
    return delegated(...args);
  };

  const result = runSelfBootstrapCloseoutCommand({
    args: ['--run', current.runId, '--target', root, '--node-executable', process.execPath],
    actualNodeExecutable: process.execPath,
    execute,
    environment,
  });

  assert.equal(result.status, 'passed', JSON.stringify(result.diagnostic));
  assert.equal(result.recoveryPlan.schemaVersion, SELF_BOOTSTRAP_RECOVERY_PLAN_SCHEMA);
  assert.equal(result.recoveryPlan.status, 'advisory');
  assert.deepEqual(result.recoveryPlan.orderedSteps.map((step) => `${step.action}:${step.owner.runId}`), [
    'resume-owner-cleanup:run-a',
    'resume-owner-cleanup:run-z',
  ]);
  assert.deepEqual(result.recoveryPlan.orderedSteps.map((step) => step.command.args[step.command.args.indexOf('--resume') + 1]), [
    predecessorA.resume.token,
    predecessorZ.resume.token,
  ]);
  assert.ok(result.recoveryPlan.orderedSteps.every((step) => step.authorization.required === true));
  assert.equal(result.recoveryPlan.observations.filter((item) => item.classification === 'isolated-coexisting').length, 2);
  assert.equal(fs.existsSync(predecessorA.workspaceRepository.carrier.root), true);
  assert.equal(fs.existsSync(predecessorZ.workspaceRepository.carrier.root), true);
  assert.ok(invocations.some((item) => item.args[0]?.endsWith('task-finish-target-lease-driver.mjs')));
});

test('兼容retry参数允许无trailer的latest published dev并完成activation', (t) => {
  const { root, remote, baseRef, environment } = fixture(t);
  const current = finishResult(root, baseRef, ['projects/product/services/buildr/src/example.mjs']);
  const successor = commitRemoteTask(remote, 'human-after-foreign', { buildrOwned: false });

  const result = runSelfBootstrapCloseoutCommand({
    args: ['--run', current.runId, '--target', root, '--node-executable', process.execPath, '--retry-after-foreign-clear', 'true'],
    actualNodeExecutable: process.execPath,
    execute: executor(root, { finishInspection: current }),
    environment,
  });

  assert.equal(result.status, 'passed', JSON.stringify(result.diagnostic));
  assert.equal(git(root, 'rev-parse', 'HEAD'), successor);
  assert.ok(result.effects.some((effect) => effect.type === 'retained-target-fast-forward' && effect.before === baseRef && effect.after === successor));
  assert.equal(phase(result, 'verify-development-entry').status, 'passed');
  assert.equal(phase(result, 'finalize').status, 'passed');
});

test('本地与remote分叉时报告remote drift并保留本地分支', (t) => {
  const { root, remote, baseRef, environment } = fixture(t);
  const current = finishResult(root, baseRef, ['projects/product/services/buildr/src/example.mjs']);
  commitRemoteTask(remote, 'remote-diverged-finish');
  fs.writeFileSync(path.join(root, 'local-diverged-finish.txt'), 'local\n');
  git(root, 'add', '--', 'local-diverged-finish.txt');
  git(root, 'commit', '-m', 'local delivery', '-m', 'Buildr-Task: local-diverged-finish');
  const localHead = git(root, 'rev-parse', 'HEAD');

  const result = runSelfBootstrapCloseoutCommand({
    args: ['--run', current.runId, '--target', root, '--node-executable', process.execPath, '--retry-after-foreign-clear', 'true'],
    actualNodeExecutable: process.execPath,
    execute: executor(root, { finishInspection: current }),
    environment,
  });

  assert.equal(result.status, 'blocked');
  assert.equal(result.diagnostic.code, 'self-bootstrap-closeout.remote-drift');
  assert.equal(git(root, 'rev-parse', 'HEAD'), localHead);
  assert.deepEqual(result.effects, []);
});

test('multi-run preflight让可证明状态共存且对inspect失败保持fail closed', async (t) => {
  for (const scenario of [
    {
      name: 'unsupported-state',
      makeForeign(root, baseRef) {
        return doctorBlockedResult(root, baseRef, ['projects/product/services/buildr/src/example.mjs'], {
          runId: 'foreign-doctor-blocked',
          identity: { ...canonicalFinishResult(root, baseRef, []).identity, task: 'foreign-task' },
          carrier: {
            identity: 'sha256-foreign-doctor',
            root: path.join(root, '.buildr', 'transient', 'task-finish', 'carriers', 'foreign-doctor-blocked'),
            changedPaths: ['projects/product/services/buildr/src/example.mjs'],
          },
          resume: { phase: 'deliver', token: 'sha256-foreign-doctor', carrierIdentity: 'sha256-foreign-doctor' },
        });
      },
      options(foreign, current) { return { finishInspections: { [current.runId]: current, [foreign.runId]: foreign } }; },
      classification: 'isolated-coexisting',
      expectedStatus: 'passed',
      planStatus: 'advisory',
    },
    {
      name: 'inspect-failure',
      makeForeign(root, baseRef) { return cleanupPendingResult(root, baseRef, 'foreign-unreadable'); },
      options(foreign, current) { return { finishInspections: { [current.runId]: current }, finishInspectionFailures: [foreign.runId] }; },
      classification: 'unprovable',
      expectedStatus: 'blocked',
      planStatus: 'blocked',
    },
  ]) {
    await t.test(scenario.name, (t) => {
      const { root, baseRef, environment } = fixture(t);
      const current = doctorBlockedResult(root, baseRef, ['projects/product/services/buildr/src/example.mjs']);
      const foreign = scenario.makeForeign(root, baseRef);
      createCarrier(root, current.runId);
      createCarrier(root, foreign.runId);
      const result = runSelfBootstrapCloseoutCommand({
        args: ['--run', current.runId, '--target', root, '--node-executable', process.execPath],
        actualNodeExecutable: process.execPath,
        execute: executor(root, scenario.options(foreign, current)),
        environment,
      });
      const observation = result.recoveryPlan.observations.find((item) => item.runId === foreign.runId);
      assert.equal(result.status, scenario.expectedStatus, JSON.stringify(result.diagnostic));
      assert.equal(result.recoveryPlan.status, scenario.planStatus);
      assert.equal(observation.classification, scenario.classification);
      assert.equal(result.recoveryPlan.orderedSteps.some((step) => step.action === 'resume-owner-cleanup'), false);
    });
  }
});

test('multi-run carrier inventory拒绝symlink并把identity漂移标为unprovable', async (t) => {
  await t.test('symlink', (t) => {
    const { root } = fixture(t);
    const carrierRoot = path.join(root, '.buildr', 'transient', 'task-finish', 'carriers');
    const outside = path.join(path.dirname(root), 'foreign-outside');
    fs.mkdirSync(carrierRoot, { recursive: true });
    fs.mkdirSync(outside);
    fs.symlinkSync(outside, path.join(carrierRoot, 'foreign-symlink'));
    const observation = discoverFinishCarrierEntries(root).find((item) => item.runId === 'foreign-symlink');
    assert.equal(observation.diagnostic.code, 'self-bootstrap-closeout.carrier-entry-invalid');
  });

  for (const scenario of [
    ['workspace', (foreign) => ({ ...foreign, identity: { ...foreign.identity, workspaceRoot: path.dirname(foreign.identity.workspaceRoot) } }), 'self-bootstrap-closeout.foreign-workspace-mismatch'],
    ['carrier', (foreign) => ({ ...foreign, resume: { ...foreign.resume, carrierIdentity: 'sha256-drifted' } }), 'self-bootstrap-closeout.resume-carrier-mismatch'],
    ['token', (foreign) => ({ ...foreign, resume: { ...foreign.resume, token: null } }), 'self-bootstrap-closeout.foreign-cleanup-resume-invalid'],
  ]) {
    await t.test(scenario[0], (t) => {
      const { root, baseRef, environment } = fixture(t);
      const current = doctorBlockedResult(root, baseRef, ['projects/product/services/buildr/src/example.mjs']);
      const foreignBase = cleanupPendingResult(root, baseRef, `foreign-${scenario[0]}`);
      const foreign = scenario[1](foreignBase);
      createCarrier(root, current.runId);
      createCarrier(root, foreign.runId);
      const result = runSelfBootstrapCloseoutCommand({
        args: ['--run', current.runId, '--target', root, '--node-executable', process.execPath],
        actualNodeExecutable: process.execPath,
        execute: executor(root, { finishInspections: { [current.runId]: current, [foreign.runId]: foreign } }),
        environment,
      });
      const observation = result.recoveryPlan.observations.find((item) => item.runId === foreign.runId);
      assert.equal(observation.classification, 'unprovable');
      assert.equal(observation.diagnostic.code, scenario[2]);
    });
  }
});

test('abandoned未交付foreign carrier仅生成owner occupancy建议且不阻塞当前closeout', (t) => {
  const { root, baseRef, environment } = fixture(t);
  const current = doctorBlockedResult(root, baseRef, ['projects/product/services/buildr/src/example.mjs']);
  const predecessorCleanup = cleanupPendingResult(root, baseRef, 'run-cleanup', 'task-cleanup');
  const predecessorOccupancy = undeliveredBlockedResult(root, 'run-occupancy', 'task-occupancy');
  createCarrier(root, current.runId);
  createCarrier(root, predecessorCleanup.runId);
  const occupancyRoot = createCarrier(root, predecessorOccupancy.runId);
  const result = runSelfBootstrapCloseoutCommand({
    args: ['--run', current.runId, '--target', root, '--node-executable', process.execPath],
    actualNodeExecutable: process.execPath,
    execute: executor(root, {
      finishInspections: {
        [current.runId]: current,
        [predecessorCleanup.runId]: predecessorCleanup,
        [predecessorOccupancy.runId]: predecessorOccupancy,
      },
      taskInspections: {
        'task-cleanup': { record: { status: 'active' } },
        'task-occupancy': { record: { status: 'abandoned' } },
      },
    }),
    environment,
  });
  const occupancy = result.recoveryPlan.observations.find((item) => item.runId === predecessorOccupancy.runId);
  assert.equal(result.status, 'passed');
  assert.equal(result.recoveryPlan.status, 'advisory');
  assert.equal(occupancy.classification, 'isolated-coexisting');
  assert.deepEqual(result.recoveryPlan.orderedSteps.map((step) => `${step.action}:${step.owner.runId}`), [
    'resume-owner-cleanup:run-cleanup',
    'resume-owner-release-occupancy:run-occupancy',
  ]);
  const occupancyStep = result.recoveryPlan.orderedSteps.find((step) => step.action === 'resume-owner-release-occupancy');
  assert.equal(occupancyStep.command.args.includes('--release-occupancy'), true);
  assert.equal(occupancyStep.command.args[occupancyStep.command.args.indexOf('--task') + 1], 'task-occupancy');
  assert.equal(occupancyStep.command.args[occupancyStep.command.args.indexOf('--run') + 1], 'run-occupancy');
  assert.equal(occupancyStep.command.args.includes('--resume'), false);
  assert.deepEqual(occupancyStep.expectedEffects, ['delete-owned-finish-carrier']);
  assert.equal(fs.existsSync(occupancyRoot), true);
});

test('active或已交付foreign carrier与当前closeout隔离共存且不给occupancy释放建议', async (t) => {
  for (const scenario of [
    {
      name: 'active-undelivered',
      taskStatus: 'active',
      makeForeign(root) { return undeliveredBlockedResult(root, 'foreign-active', 'foreign-active-task'); },
    },
    {
      name: 'abandoned-delivered',
      taskStatus: 'abandoned',
      makeForeign(root, baseRef) {
        return undeliveredBlockedResult(root, 'foreign-delivered', 'foreign-delivered-task', {
          delivery: { status: 'delivered', remoteAfterRef: baseRef, finalRemoteRef: baseRef },
        });
      },
    },
  ]) {
    await t.test(scenario.name, (t) => {
      const { root, baseRef, environment } = fixture(t);
      const current = doctorBlockedResult(root, baseRef, ['projects/product/services/buildr/src/example.mjs']);
      const foreign = scenario.makeForeign(root, baseRef);
      createCarrier(root, current.runId);
      createCarrier(root, foreign.runId);
      const result = runSelfBootstrapCloseoutCommand({
        args: ['--run', current.runId, '--target', root, '--node-executable', process.execPath],
        actualNodeExecutable: process.execPath,
        execute: executor(root, {
          finishInspections: { [current.runId]: current, [foreign.runId]: foreign },
          taskInspections: { [foreign.identity.task]: { record: { status: scenario.taskStatus } } },
        }),
        environment,
      });
      const observation = result.recoveryPlan.observations.find((item) => item.runId === foreign.runId);
      assert.equal(result.status, 'passed');
      assert.equal(result.recoveryPlan.status, 'advisory');
      assert.equal(observation.classification, 'isolated-coexisting');
      assert.equal(result.recoveryPlan.orderedSteps.some((step) => step.action === 'resume-owner-release-occupancy'), false);
    });
  }
});

test('Skill runner从每个Agent声明的runtime投射位置启动时不依赖Product源码相对路径', async (t) => {
  const sourceRunner = new URL('../../../../../../skills/buildr-self-bootstrap-sync/scripts/closeout.mjs', import.meta.url);

  for (const adapter of Object.values(RUNTIME_ADAPTERS)) {
    await t.test(adapter.id, (t) => {
      const base = fs.mkdtempSync(path.join(os.tmpdir(), `buildr-self-bootstrap-${adapter.id}-`));
      const runtimeRoot = skillDestinationRoot(adapter, 'workspace', base);
      const renderedDirectory = path.join(runtimeRoot, 'skills', 'buildr-self-bootstrap-sync', 'scripts');
      const renderedRunner = path.join(renderedDirectory, 'closeout.mjs');
      fs.mkdirSync(renderedDirectory, { recursive: true });
      fs.copyFileSync(sourceRunner, renderedRunner);
      t.after(() => fs.rmSync(base, { recursive: true, force: true }));

      const result = spawnSync(process.execPath, [renderedRunner], { cwd: base, encoding: 'utf8' });
      assert.equal(result.status, 1);
      assert.equal(result.stdout, '');
      const error = JSON.parse(result.stderr);
      assert.equal(error.schemaVersion, 'buildr.long-running-operation-summary/v1');
      assert.equal(error.detail, 'compact');
      assert.equal(error.status, 'blocked');
      assert.equal(error.primaryFailure.code, 'self-bootstrap-closeout.arguments-incomplete');
      assert.equal(error.recovery, null);
    });
  }
});

test('self-bootstrap compact只保留阶段与portable recovery', () => {
  const output = compactSelfBootstrapCloseout({
    schemaVersion: 'buildr.self-bootstrap-closeout-result/v1',
    status: 'blocked', taskId: 'demo-task', runId: 'finish-run-1',
    phases: [{ id: 'sync', status: 'blocked', operations: [{ stdout: 'secret' }], effects: [{ path: '/private' }] }],
    effects: [{ token: 'secret' }], diagnostic: { code: 'sync.failed', message: 'sync failed', details: { argv: ['secret'] } },
    maintenance: { environmentCleanup: 'attention', selfBootstrap: { resultIdentity: 'sha256-result' } },
  });
  assert.equal(output.schemaVersion, 'buildr.long-running-operation-summary/v1');
  assert.equal(output.resultIdentity, 'sha256-result');
  assert.equal(output.primaryFailure.stage, 'sync');
  assert.equal(output.cleanup.status, 'failed');
  assert.deepEqual(output.recovery, { owner: 'task-finish', operation: 'inspect', taskId: 'demo-task', runId: 'finish-run-1', recordId: null });
  for (const forbidden of ['operations', 'effects', 'stdout', '/private', 'argv', 'token']) assert.equal(JSON.stringify(output).includes(forbidden), false, forbidden);
});


function directFixture(t) {
  const current = fixture(t);
  fs.appendFileSync(path.join(current.root, 'projects/product/services/buildr/resources/manifest.yml'), '# delivered change\n');
  git(current.root, 'add', '--', 'projects/product/services/buildr/resources/manifest.yml');
  git(current.root, 'commit', '-m', 'delivered product');
  git(current.root, 'push', 'origin', 'dev');
  const deliveredRef = git(current.root, 'rev-parse', 'HEAD');
  const taskId = 'direct-closeout';
  const options = { taskInspections: { [taskId]: { record: { taskId, status: 'completed', result: { noChange: false, summary: 'Delivered.' }, scope: { projects: ['product'] } } } } };
  const input = { workspaceRoot: current.root, taskId, baseRef: current.baseRef, deliveredRef, targetBranch: 'dev', remote: 'origin', agent: 'codex', nodeExecutable: process.execPath, environment: current.environment };
  return { ...current, input, options };
}

test('direct activation uses real Git without Finish and does not repeat a successful push', (t) => {
  const current = directFixture(t);
  const calls = [];
  const perform = executor(current.root, current.options);
  const execute = (exe, args, context) => { calls.push([exe, ...args]); return perform(exe, args, context); };
  const first = runDirectSelfBootstrapCloseout({ ...current.input, execute });
  assert.equal(first.status, 'passed', JSON.stringify(first));
  assert.equal(first.runId, null);
  assert.equal(first.delivery.observed, true);
  assert.equal(calls.some((args) => args.includes('finish') || args.some((arg) => typeof arg === 'string' && arg.endsWith('task-finish-target-lease-driver.mjs'))), false);
  assert.equal(calls.filter((args) => args[0] === 'git' && args[1] === 'push').length, 1);
  calls.length = 0;
  const second = runDirectSelfBootstrapCloseout({ ...current.input, execute });
  assert.equal(second.status, 'passed', JSON.stringify(second));
  assert.equal(calls.filter((args) => args[0] === 'git' && args[1] === 'push').length, 0);
});

test('direct activation resumes only its own committed successor after push failure', (t) => {
  const current = directFixture(t);
  const first = runDirectSelfBootstrapCloseout({ ...current.input, execute: executor(current.root, { ...current.options, failPush: true }) });
  assert.equal(first.status, 'blocked');
  assert.equal(first.diagnostic.code, 'self-bootstrap-closeout.push-failed');
  assert.equal(first.delivery.observed, true);
  const successor = git(current.root, 'rev-parse', 'HEAD');
  assert.notEqual(successor, current.input.deliveredRef);
  const recovered = runDirectSelfBootstrapCloseout({ ...current.input, execute: executor(current.root, current.options) });
  assert.equal(recovered.status, 'passed', JSON.stringify(recovered));
  assert.equal(git(current.root, 'rev-parse', 'HEAD'), successor);
  assert.equal(recovered.phases.some((stage) => stage.id === 'commit'), false);
});

test('direct activation preserves dirty work and rejects incomplete Task before mutation', (t) => {
  const current = directFixture(t);
  fs.writeFileSync(path.join(current.root, 'user-work.txt'), 'keep me\n');
  const blocked = runDirectSelfBootstrapCloseout({ ...current.input, execute: executor(current.root, current.options) });
  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.diagnostic.code, 'self-bootstrap-closeout.workspace-dirty');
  assert.equal(fs.readFileSync(path.join(current.root, 'user-work.txt'), 'utf8'), 'keep me\n');
  const noTask = runDirectSelfBootstrapCloseout({ ...current.input, execute: executor(current.root) });
  assert.equal(noTask.diagnostic.code, 'self-bootstrap-closeout.task-not-completed');
  assert.equal(git(current.root, 'rev-parse', 'HEAD'), current.input.deliveredRef);
});
