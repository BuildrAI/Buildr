import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

import { classifyRetainedConvergencePaths } from './task-finish-impact.mjs';
import { resolveTaskFinishDeliveryRemote } from './task-finish-delivery-remote.mjs';
import { acquireFinishTargetLease, releaseFinishTargetLease, writeFinishCompletion } from './task-finish-run.mjs';
import {
  createIsolatedGitCarrier,
  observeGitTaskContribution,
  removeIsolatedGitCarrier,
  verifyGitTaskContributionCarrier,
} from './git-task-contribution.mjs';

const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;

function digest(value) {
  return `sha256-${crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex')}`;
}

function normalizePortablePath(value) {
  return path.posix.normalize(String(value || '').replaceAll('\\', '/')).replace(/^\.\//, '');
}

function boundedText(value, limit = 2000) {
  const text = String(value || '');
  return { preview: text.slice(0, limit), bytes: Buffer.byteLength(text), digest: digest(text), truncated: text.length > limit };
}

function commandObservation(id, command, args, cwd, result, startedAt, durationMs) {
  return {
    kind: 'command', id, command, args, cwd,
    status: result.status, signal: result.signal || null, startedAt, durationMs,
    stdout: boundedText(result.stdout), stderr: boundedText(result.stderr),
  };
}

function runCommand(id, command, args, cwd, options = {}) {
  const started = process.hrtime.bigint();
  const startedAt = new Date().toISOString();
  const runtimePath = `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH || ''}`;
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: MAX_OUTPUT_BYTES,
    env: options.env || { ...process.env, PATH: runtimePath },
  });
  const normalized = {
    status: Number.isInteger(result.status) ? result.status : 1,
    signal: result.signal || null,
    stdout: result.stdout || '',
    stderr: result.stderr || result.error?.message || '',
  };
  return {
    result: normalized,
    observation: commandObservation(id, command, args, cwd, normalized, startedAt, Math.round(Number(process.hrtime.bigint() - started) / 1e6)),
  };
}

function runJsonCommand(id, command, args, cwd, options = {}) {
  const executed = runCommand(id, command, args, cwd, options);
  let payload = null;
  try { payload = JSON.parse(executed.result.stdout); } catch { /* caller reports the command observation */ }
  return { ...executed, payload };
}

function git(root, id, args) {
  return runCommand(id, 'git', args, root);
}

function gitText(root, args) {
  const value = spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: MAX_OUTPUT_BYTES });
  return value.status === 0 ? value.stdout.trim() : null;
}

function controlMetadataPath(value) {
  const normalized = normalizePortablePath(value);
  return Boolean(normalized) && normalized.split('/').some((segment) => segment === '.buildr' || segment === '.git');
}

async function cleanupThroughRetainedController(runtime, context, run, deliveries, integratedContributions) {
  if (typeof runtime.cleanupTaskEnvironmentThroughRetainedController === 'function') {
    return {
      payload: await runtime.cleanupTaskEnvironmentThroughRetainedController(run.identity.workspaceRoot, run.identity.task, {
        runId: run.runId,
        deliveries,
        candidateRef: run.delivery.carrierRef,
        integratedContributions,
      }),
      observation: null,
    };
  }
  const invocation = context.controllerInvocation;
  if (!invocation?.command || !invocation?.sourceRoot) return { payload: null, observation: null };
  const bootstrap = path.join(invocation.sourceRoot, 'src', 'interfaces', 'internal', 'task-finish-retained-cleanup.mjs');
  const executed = runJsonCommand('cleanup-retained-environment-manager', invocation.command, [
    bootstrap,
    '--run', run.runId,
    '--target', run.identity.workspaceRoot,
  ], run.identity.workspaceRoot);
  return { payload: executed.payload, observation: executed.observation, result: executed.result };
}

function currentGitIdentity(root) {
  const head = gitText(root, ['rev-parse', 'HEAD']);
  const tree = gitText(root, ['rev-parse', 'HEAD^{tree}']);
  const branch = gitText(root, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
  const status = spawnSync('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all'], { cwd: root, encoding: 'utf8', maxBuffer: MAX_OUTPUT_BYTES });
  return { head, tree, branch, status: status.status === 0 ? status.stdout : null, clean: status.status === 0 && status.stdout.length === 0 };
}

function retainedWorkspaceReadiness(identity) {
  if (identity.status === null) return { ready: false, workspaceMetadata: [], unrelated: ['git-status-unavailable'] };
  const workspaceMetadata = [];
  const unrelated = [];
  for (const entry of identity.status.split('\0').filter(Boolean)) {
    const status = entry.slice(0, 2);
    const file = normalizePortablePath(entry.slice(3));
    if (['??', ' M', ' D', ' T', 'M ', 'D ', 'T ', 'A ', 'AM'].includes(status) && controlMetadataPath(file)) workspaceMetadata.push(file);
    else unrelated.push(file || entry);
  }
  return { ready: unrelated.length === 0, workspaceMetadata: [...new Set(workspaceMetadata)].sort(), unrelated };
}

function targetLeasePath(root, targetBranch) {
  const common = gitText(root, ['rev-parse', '--git-common-dir']);
  if (!common) throw new Error('Unable to resolve Git common directory for Task Finish target lease.');
  return path.join(path.resolve(root, common), 'buildr', 'task-finish', 'leases', `${targetBranch.replaceAll('/', '_')}.json`);
}

function finding(check, severity, code, message, extra = {}) {
  return { check, severity, code, message, ...extra };
}

function phaseFailure(findings, fallbackClass = 'upstream-candidate-defect') {
  const errors = findings.filter((item) => item.severity === 'error');
  const primary = errors[0] || findings[0];
  return {
    operation: primary?.check || null,
    check: primary?.check || null,
    failureClass: fallbackClass,
    code: primary?.code || 'task-finish.preflight-failed',
    status: 'failed',
    exitCode: primary?.exitCode ?? null,
    message: primary?.message || 'Task Finish preflight failed.',
    findings: errors,
    diagnostic: { digest: digest(errors), preview: errors.slice(0, 10) },
  };
}

export function createTaskFinishProductHandlers({ runtime, root }) {
  const environmentRoot = path.resolve(root);

  function taskEnvironment(run) {
    return runtime.resolveTaskEnvironmentExecution(run.identity.workspaceRoot, run.identity.task);
  }

  function developmentCarrier(run) {
    const model = runtime.inspectTaskDevelopment(run.identity.workspaceRoot, run.identity.task);
    const receipt = model.development?.receipt;
    const current = model.development?.applicability?.handoff === 'current';
    const handoff = current ? [...receipt.handoffs].reverse().find((item) => item.identity === run.identity.handoffIdentity) || null : null;
    const matches = Boolean(handoff
      && handoff.candidate.identity === run.identity.candidateIdentity
      && handoff.candidate.contentTargetIdentity === run.identity.contentTargetIdentity);
    return { model, receipt, handoff, matches };
  }

  function currentWorkspaceNode(run) {
    const observed = runtime.workspaceNodeExecution(environmentRoot);
    return { ...observed, matches: Boolean(observed.ready && run.identity.workspaceNodeIdentity && observed.identity?.digest === run.identity.workspaceNodeIdentity) };
  }

  return {
    async preflight({ run }) {
      const checks = [];
      const context = taskEnvironment(run);
      if (!context?.ready) checks.push(finding('environment-context', 'error', context?.blocked?.code || 'task-finish.not-task-environment', context?.blocked?.message || 'Task Finish requires a ready Task Environment.'));
      else checks.push(finding('environment-context', 'ok', 'task-finish.environment-ready', 'Task Environment binding is ready.'));

      const development = developmentCarrier(run);
      if (!development.matches) checks.push(finding('development-handoff', 'error', 'task-finish.development-handoff-not-current', 'Formal Development handoff is missing, stale, or does not match this run.'));
      else checks.push(finding('development-handoff', 'ok', 'task-finish.development-handoff-current', `Development handoff ${run.identity.handoffIdentity} is current.`));

      const workspaceNode = currentWorkspaceNode(run);
      if (!workspaceNode.matches) checks.push(finding('workspace-node', 'error', 'task-finish.workspace-node-drift', 'Workspace Node identity does not match the Task Finish run.'));
      else checks.push(finding('workspace-node', 'ok', 'task-finish.workspace-node-ready', `Workspace Node ${workspaceNode.identity.version} is ready.`));

      const taskIdentity = currentGitIdentity(environmentRoot);
      if (!taskIdentity.head || !taskIdentity.tree || !taskIdentity.branch) checks.push(finding('delivery-adapter', 'error', 'task-finish.git-carrier-unavailable', 'The current Finish adapter requires a readable Git delivery carrier.'));
      else if (context?.repositories?.[0]?.branch && taskIdentity.branch !== context.repositories[0].branch) checks.push(finding('delivery-adapter', 'error', 'task-finish.task-branch-mismatch', 'Task branch does not match the Environment Receipt.'));
      else checks.push(finding('delivery-adapter', 'ok', 'task-finish.git-carrier-ready', `Git carrier branch ${taskIdentity.branch} is available.`));

      const retainedIdentity = currentGitIdentity(run.identity.workspaceRoot);
      const retainedReadiness = retainedWorkspaceReadiness(retainedIdentity);
      if (!retainedIdentity.head || retainedIdentity.branch !== run.identity.targetBranch) checks.push(finding('retained-workspace', 'error', 'task-finish.retained-target-mismatch', `Retained Workspace must be on target branch ${run.identity.targetBranch}.`, { failureClass: 'transient-external-condition' }));
      else if (!retainedReadiness.ready) checks.push(finding('retained-workspace', 'error', 'task-finish.retained-workspace-dirty', 'Retained Workspace has unrelated uncommitted changes.', { failureClass: 'transient-external-condition', unrelated: retainedReadiness.unrelated }));
      else checks.push(finding('retained-workspace', 'ok', 'task-finish.retained-workspace-ready', 'Retained Workspace is ready for target transition.', { workspaceMetadata: retainedReadiness.workspaceMetadata }));

      if (!run.identity.remote) checks.push(finding('delivery-remote', 'error', 'task-finish.delivery-remote-missing', 'Task Finish run is not bound to a retained Workspace delivery remote.'));
      else {
        try {
          const resolved = resolveTaskFinishDeliveryRemote({ root: run.identity.workspaceRoot, targetBranch: run.identity.targetBranch, requestedRemote: run.identity.remote });
          checks.push(finding('delivery-remote', 'ok', 'task-finish.delivery-remote-ready', `Delivery remote ${resolved.remote} is configured in the retained Workspace.`));
        } catch (error) {
          checks.push(finding('delivery-remote', 'error', 'task-finish.delivery-remote-unavailable', error.message, { failureClass: 'transient-external-condition', details: error.details }));
        }
      }

      const errors = checks.filter((item) => item.severity === 'error');
      if (errors.length) {
        const transientOnly = errors.every((item) => item.failureClass === 'transient-external-condition');
        return { status: transientOnly ? 'blocked' : 'failed', checks, failure: phaseFailure(checks, transientOnly ? 'transient-external-condition' : 'upstream-candidate-defect') };
      }
      return { status: 'passed', checks, inputIdentity: run.identity.handoffIdentity, outputIdentity: digest(checks) };
    },

    async prepare({ run }) {
      const operations = [];
      if (!developmentCarrier(run).matches) return { status: 'failed', failure: { operation: 'development-handoff', failureClass: 'upstream-candidate-defect', code: 'task-finish.development-handoff-not-current', message: 'Development handoff changed before carrier preparation.' } };
      if (!currentWorkspaceNode(run).matches) return { status: 'failed', failure: { operation: 'workspace-node', failureClass: 'upstream-candidate-defect', code: 'task-finish.workspace-node-drift', message: 'Workspace Node identity changed before carrier preparation.' } };
      const context = taskEnvironment(run);
      if (!context?.ready) return { status: 'blocked', failure: { operation: 'environment-context', failureClass: 'transient-external-condition', code: context?.blocked?.code || 'task-finish.environment-not-ready', message: context?.blocked?.message || 'Task Environment is not ready.' } };
      if (!run.identity.remote) return { status: 'failed', failure: { operation: 'delivery-remote', failureClass: 'product-execution-failure', code: 'task-finish.delivery-remote-missing', message: 'Task Finish cannot prepare a delivery carrier without a frozen delivery remote.' } };

      const fetched = git(environmentRoot, 'prepare-target-fetch', ['fetch', run.identity.remote, run.identity.targetBranch]);
      operations.push(fetched.observation);
      if (fetched.result.status !== 0) return { status: 'blocked', operations, failure: { operation: 'target-fetch', failureClass: 'transient-external-condition', code: 'task-finish.target-fetch-failed', exitCode: fetched.result.status, message: 'Unable to observe the target branch.', diagnostic: fetched.observation.stderr } };
      const targetRef = `${run.identity.remote}/${run.identity.targetBranch}`;
      const expectedTargetRef = gitText(environmentRoot, ['rev-parse', `${targetRef}^{commit}`]);
      if (!expectedTargetRef) return { status: 'blocked', operations, failure: { operation: 'target-observation', failureClass: 'transient-external-condition', code: 'task-finish.target-ref-missing', message: `Target ref is unavailable: ${targetRef}` } };
      let isolated;
      try {
        const taskContribution = observeGitTaskContribution({ root: environmentRoot, deliveryBaselineHead: expectedTargetRef });
        isolated = createIsolatedGitCarrier({
          repositoryRoot: environmentRoot,
          workspaceRoot: run.identity.workspaceRoot,
          runId: run.runId,
          deliveryBaselineHead: expectedTargetRef,
          taskContribution,
          message: `交付 ${run.identity.task}`,
        });
      } catch (error) {
        operations.push({ kind: 'product', id: 'prepare-isolated-carrier', status: 'failed', code: error.code || 'task-finish.carrier-prepare-failed' });
        return { status: 'failed', operations, failure: { operation: 'task-contribution', failureClass: 'upstream-candidate-defect', code: error.code || 'task-finish.carrier-prepare-failed', message: error.message, diagnostic: error.details || error.cleanup || null } };
      }
      operations.push({ kind: 'product', id: 'prepare-isolated-carrier', status: 'passed', carrierRoot: isolated.root });
      const equivalent = runtime.assertTaskDevelopmentCarrier(run.identity.workspaceRoot, run.identity.task);
      if (equivalent.status !== 'equivalent') {
        const cleanup = removeIsolatedGitCarrier({ repositoryRoot: environmentRoot, workspaceRoot: run.identity.workspaceRoot, runId: run.runId, expectedRoot: isolated.root });
        return { status: 'failed', operations, failure: { operation: 'carrier-equivalence', failureClass: 'upstream-candidate-defect', code: 'task-finish.carrier-not-equivalent', message: 'Task Content Target or Development handoff changed during isolated carrier preparation.', diagnostic: { development: equivalent.diagnostic, carrierCleanup: cleanup } } };
      }
      const deliveryCarrier = {
        identity: digest({ head: isolated.head, tree: isolated.tree, expectedTargetRef, taskContributionIdentity: isolated.taskContribution.identity, handoffIdentity: run.identity.handoffIdentity, candidateIdentity: run.identity.candidateIdentity, contentTargetIdentity: run.identity.contentTargetIdentity }),
        kind: 'git-isolated-commit',
        root: isolated.root,
        head: isolated.head,
        tree: isolated.tree,
        branch: null,
        expectedTargetRef,
        targetRef,
        changedPaths: isolated.changedPaths,
        deliveryBaseline: isolated.deliveryBaseline,
        taskContribution: isolated.taskContribution,
        handoffIdentity: run.identity.handoffIdentity,
        candidateIdentity: run.identity.candidateIdentity,
        contentTargetIdentity: run.identity.contentTargetIdentity,
        preparedAt: new Date().toISOString(),
      };
      return { status: 'passed', operations, inputIdentity: run.identity.handoffIdentity, outputIdentity: deliveryCarrier.identity, output: { deliveryCarrier } };
    },

    async verify({ run }) {
      const observed = verifyGitTaskContributionCarrier({ repositoryRoot: environmentRoot, carrier: run.deliveryCarrier });
      if (observed.status !== 'equivalent') return { status: 'failed', failure: { operation: 'carrier-equivalence', failureClass: 'upstream-candidate-defect', code: observed.code || 'task-finish.carrier-changed', message: 'Delivery Carrier or Task Contribution changed after preparation.', findings: [observed] } };
      const equivalent = runtime.assertTaskDevelopmentCarrier(run.identity.workspaceRoot, run.identity.task);
      if (equivalent.status !== 'equivalent') return { status: 'failed', failure: { operation: 'carrier-equivalence', failureClass: 'upstream-candidate-defect', code: 'task-finish.carrier-not-equivalent', message: 'Delivery carrier is no longer content-equivalent to the Development handoff.', diagnostic: equivalent.diagnostic } };
      const equivalence = { status: 'equivalent', handoffIdentity: run.identity.handoffIdentity, candidateIdentity: run.identity.candidateIdentity, candidateGeneration: run.identity.candidateGeneration, contentTargetIdentity: run.identity.contentTargetIdentity, taskContributionIdentity: run.deliveryCarrier.taskContribution.identity, deliveryBaselineIdentity: digest(run.deliveryCarrier.deliveryBaseline), carrierIdentity: run.deliveryCarrier.identity, formalVerificationExecutions: 0 };
      return { status: 'passed', inputIdentity: run.deliveryCarrier.identity, outputIdentity: digest(equivalence), output: { equivalence } };
    },

    async deliver({ run }) {
      const operations = [];
      const carrier = verifyGitTaskContributionCarrier({ repositoryRoot: environmentRoot, carrier: run.deliveryCarrier });
      if (carrier.status !== 'equivalent') return { status: 'failed', failure: { operation: 'carrier', failureClass: 'upstream-candidate-defect', code: carrier.code || 'task-finish.carrier-changed', message: 'Delivery Carrier or Task Contribution changed before delivery.' } };
      if (runtime.assertTaskDevelopmentCarrier(run.identity.workspaceRoot, run.identity.task).status !== 'equivalent') return { status: 'failed', failure: { operation: 'carrier-equivalence', failureClass: 'upstream-candidate-defect', code: 'task-finish.carrier-not-equivalent', message: 'Development handoff is no longer current before delivery.' } };
      const retainedRoot = run.identity.workspaceRoot;
      const lease = acquireFinishTargetLease({ file: targetLeasePath(retainedRoot, run.identity.targetBranch), run });
      if (lease.blocked) return { status: 'blocked', failure: { operation: 'target-lease', failureClass: 'transient-external-condition', code: 'task-finish.target-lease-held', message: 'Target branch lease is held by another Finish run.', findings: [lease.existing] } };
      try {
        if (!run.identity.remote) return { status: 'failed', operations, failure: { operation: 'delivery-remote', failureClass: 'product-execution-failure', code: 'task-finish.delivery-remote-missing', message: 'Task Finish cannot deliver without a frozen delivery remote.' } };
        const remote = git(retainedRoot, 'deliver-target-observe', ['ls-remote', '--heads', run.identity.remote, run.identity.targetBranch]);
        operations.push(remote.observation);
        if (remote.result.status !== 0) return { status: 'blocked', operations, failure: { operation: 'target-observation', failureClass: 'transient-external-condition', code: 'task-finish.target-observation-failed', exitCode: remote.result.status, message: 'Unable to observe remote target ref.', diagnostic: remote.observation.stderr } };
        const observedTargetRef = remote.result.stdout.trim().split(/\s+/)[0] || null;
        const alreadyDelivered = observedTargetRef === run.deliveryCarrier.head;
        if (!alreadyDelivered && observedTargetRef !== run.deliveryCarrier.expectedTargetRef) return { status: 'blocked', operations, failure: { operation: 'target-transition', failureClass: 'transient-external-condition', code: 'task-finish.target-race', message: 'Target ref changed after carrier preparation; rebuild the isolated carrier on the latest Delivery Baseline.', findings: [{ expected: run.deliveryCarrier.expectedTargetRef, observed: observedTargetRef }] }, output: { delivery: { status: 'blocked', expectedTargetRef: run.deliveryCarrier.expectedTargetRef, observedTargetRef, carrierRef: run.deliveryCarrier.head } } };
        if (!alreadyDelivered) {
          const retainedIdentity = currentGitIdentity(retainedRoot);
          const readiness = retainedWorkspaceReadiness(retainedIdentity);
          if (retainedIdentity.branch !== run.identity.targetBranch || !readiness.ready || retainedIdentity.head !== observedTargetRef) return { status: 'blocked', operations, failure: { operation: 'retained-workspace', failureClass: 'transient-external-condition', code: 'task-finish.retained-workspace-not-ready', message: 'Retained Workspace is not clean at the observed target ref.', findings: [retainedIdentity] } };
          const merged = git(retainedRoot, 'deliver-fast-forward', ['merge', '--ff-only', run.deliveryCarrier.head]);
          operations.push(merged.observation);
          if (merged.result.status !== 0) return { status: 'failed', operations, failure: { operation: 'target-transition', failureClass: 'upstream-candidate-defect', code: 'task-finish.fast-forward-failed', exitCode: merged.result.status, message: 'Delivery carrier is not a fast-forward transition.', diagnostic: merged.observation.stderr } };
          const pushed = git(retainedRoot, 'deliver-push', ['push', run.identity.remote, `${run.identity.targetBranch}:${run.identity.targetBranch}`]);
          operations.push(pushed.observation);
          if (pushed.result.status !== 0) return { status: 'blocked', operations, failure: { operation: 'target-push', failureClass: 'transient-external-condition', code: 'task-finish.push-failed', exitCode: pushed.result.status, message: 'Target push failed.', diagnostic: pushed.observation.stderr } };
        }

        const readback = git(retainedRoot, 'deliver-target-readback', ['ls-remote', '--heads', run.identity.remote, run.identity.targetBranch]);
        operations.push(readback.observation);
        if (readback.result.status !== 0) return { status: 'blocked', operations, failure: { operation: 'target-readback', failureClass: 'transient-external-condition', code: 'task-finish.remote-readback-failed', exitCode: readback.result.status, message: 'Unable to read back the remote target ref after delivery.', diagnostic: readback.observation.stderr } };
        const remoteAfterRef = readback.result.stdout.trim().split(/\s+/)[0] || null;
        if (remoteAfterRef !== run.deliveryCarrier.head) return { status: 'failed', operations, failure: { operation: 'target-transition', failureClass: 'upstream-candidate-defect', code: 'task-finish.target-race', message: 'Remote target ref does not match the carrier after push; return to Task Development.', findings: [{ expected: run.deliveryCarrier.head, observed: remoteAfterRef }] }, output: { delivery: { status: 'failed', expectedTargetRef: run.deliveryCarrier.expectedTargetRef, observedTargetRef, carrierRef: run.deliveryCarrier.head } } };

        const retainedCli = path.join(retainedRoot, 'projects', 'product', 'buildr');
        const impact = classifyRetainedConvergencePaths(run.deliveryCarrier.changedPaths || []);
        if (impact.requiresRuntimeSync) {
          const synced = runCommand('deliver-retained-sync', retainedCli, ['sync', run.identity.agent, '--target', retainedRoot], retainedRoot);
          operations.push(synced.observation);
          if (synced.result.status !== 0) return { status: 'blocked', operations, failure: { operation: 'retained-sync', failureClass: 'transient-external-condition', code: 'task-finish.retained-sync-failed', exitCode: synced.result.status, message: 'Retained Workspace sync failed.', diagnostic: synced.observation.stderr } };
        }
        const doctor = runJsonCommand('deliver-retained-doctor', retainedCli, ['doctor', '--agent', run.identity.agent, '--target', retainedRoot, '--json'], retainedRoot);
        operations.push(doctor.observation);
        if (doctor.result.status !== 0 || doctor.payload?.health?.ready !== true) return { status: 'blocked', operations, failure: { operation: 'retained-doctor', failureClass: 'transient-external-condition', code: 'task-finish.retained-doctor-failed', exitCode: doctor.result.status, message: 'Retained Workspace doctor is not ready.', diagnostic: doctor.payload?.findings || doctor.observation.stderr } };
        if (impact.requiresCliInstall || impact.requiresLocalAppInstall) {
          const installer = path.join(retainedRoot, 'projects', 'product', 'services', 'buildr', 'scripts', 'install-buildr-cli');
          const installed = runCommand('deliver-cli-install', installer, ['--node-executable', process.execPath], retainedRoot);
          operations.push(installed.observation);
          if (installed.result.status !== 0) return { status: 'blocked', operations, failure: { operation: 'runtime-install', failureClass: 'transient-external-condition', code: 'task-finish.cli-install-failed', exitCode: installed.result.status, message: 'Default Buildr CLI installation failed.', diagnostic: installed.observation.stderr } };
        }
        let localAppDelivery = 'not-applicable';
        if (impact.requiresLocalAppInstall) {
          const installed = runJsonCommand('deliver-local-app-install', retainedCli, ['app', 'launcher', 'install', '--channel', 'development', '--json'], retainedRoot);
          operations.push(installed.observation);
          if (installed.result.status !== 0 || installed.payload?.installed !== true) return { status: 'blocked', operations, failure: { operation: 'local-app-install', failureClass: 'transient-external-condition', code: 'task-finish.local-app-install-failed', exitCode: installed.result.status, message: 'Buildr development launcher installation failed.', diagnostic: installed.payload || installed.observation.stderr } };
          localAppDelivery = { status: 'passed', channel: 'development' };
        }
        return { status: 'passed', operations, inputIdentity: run.deliveryCarrier.identity, outputIdentity: remoteAfterRef, output: { delivery: { status: 'delivered', expectedTargetRef: run.deliveryCarrier.expectedTargetRef, observedTargetRef, carrierRef: run.deliveryCarrier.head, remoteAfterRef, impact, retainedDoctor: 'passed', runtimeInstall: impact.requiresCliInstall || impact.requiresLocalAppInstall ? 'passed' : 'not-applicable', localAppDelivery } } };
      } finally {
        releaseFinishTargetLease(lease);
      }
    },

    async cleanup({ run }) {
      const operations = [];
      if (run.delivery?.carrierRef !== run.deliveryCarrier?.head) return { status: 'blocked', failure: { operation: 'cleanup-readiness', failureClass: 'transient-external-condition', code: 'task-finish.delivery-not-complete', message: 'Cleanup requires completed delivery evidence.' } };
      const prepared = {
        schemaVersion: 'buildr.task-finish-completion/v1',
        runId: run.runId,
        task: run.identity.task,
        handoffIdentity: run.identity.handoffIdentity,
        candidateIdentity: run.identity.candidateIdentity,
        candidateGeneration: run.identity.candidateGeneration,
        contentTargetIdentity: run.identity.contentTargetIdentity,
        carrierIdentity: run.deliveryCarrier.identity,
        carrierRef: run.deliveryCarrier.head,
        taskContributionIdentity: run.deliveryCarrier.taskContribution.identity,
        deliveryBaseline: run.deliveryCarrier.deliveryBaseline,
        targetBranch: run.identity.targetBranch,
        status: 'prepared',
        preparedAt: new Date().toISOString(),
      };
      const completionFile = writeFinishCompletion({ root: run.identity.workspaceRoot, runId: run.runId, completion: prepared });
      const context = taskEnvironment(run);
      const deliveries = Object.fromEntries((context.repositories || []).map((repository) => [repository.selector, repository.selector === 'workspace' ? run.identity.targetBranch : repository.startPoint]));
      const integratedContributions = { workspace: run.deliveryCarrier };
      const delegated = await cleanupThroughRetainedController(runtime, context, run, deliveries, integratedContributions);
      if (delegated.observation) operations.push(delegated.observation);
      const cleanedEnvironment = delegated.payload || {
        status: 'blocked', effects: [], diagnostic: {
          code: 'task-finish.retained-cleanup-unavailable',
          message: 'Receipt-bound retained Environment Manager cleanup entry is unavailable.',
        },
      };
      operations.push({ operation: 'cleanup-task-environment', status: cleanedEnvironment.status, effects: cleanedEnvironment.effects, diagnostic: cleanedEnvironment.diagnostic });
      if (cleanedEnvironment.status !== 'cleaned') return { status: 'blocked', operations, failure: { operation: 'environment-cleanup', failureClass: 'transient-external-condition', code: cleanedEnvironment.diagnostic?.code || 'task-finish.environment-cleanup-failed', message: cleanedEnvironment.diagnostic?.message || 'Task Environment cleanup failed.', diagnostic: cleanedEnvironment } };
      const carrierCleanup = removeIsolatedGitCarrier({ repositoryRoot: run.identity.workspaceRoot, workspaceRoot: run.identity.workspaceRoot, runId: run.runId, expectedRoot: run.deliveryCarrier.root });
      operations.push({ kind: 'product', id: 'cleanup-isolated-carrier', status: carrierCleanup.status, details: carrierCleanup });
      if (!['removed', 'not-applicable'].includes(carrierCleanup.status)) return { status: 'blocked', operations, failure: { operation: 'carrier-cleanup', failureClass: 'transient-external-condition', code: carrierCleanup.code || 'task-finish.carrier-cleanup-failed', message: 'Unable to clean the run-owned isolated Delivery Carrier.', diagnostic: carrierCleanup } };
      const complete = { ...prepared, status: 'complete', completedAt: new Date().toISOString(), cleanup: cleanedEnvironment };
      writeFinishCompletion({ root: run.identity.workspaceRoot, runId: run.runId, completion: complete });
      return { status: 'passed', operations, inputIdentity: run.delivery.carrierRef, outputIdentity: digest(complete), output: { completion: { status: 'complete', receipt: completionFile, cleanup: cleanedEnvironment } } };
    },
  };
}
