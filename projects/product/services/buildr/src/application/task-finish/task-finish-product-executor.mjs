import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

import { planRetainedTaskFinishActivation } from './task-finish-activation.mjs';
import { classifyRetainedConvergencePaths } from './task-finish-impact.mjs';
import { resolveTaskFinishDeliveryRemote } from './task-finish-delivery-remote.mjs';
import { acquireFinishTargetLease, releaseFinishTargetLease, writeFinishCompletion } from './task-finish-run.mjs';
import {
  adoptAgentReviewedGitCarrier,
  createIsolatedGitCarrier,
  observeGitTaskContribution,
  removeIsolatedGitCarrier,
  verifyGitTaskContributionCarrier,
} from './git-task-contribution.mjs';

const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;

function digest(value) {
  return `sha256-${crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex')}`;
}

function deliveryCarrier(run, isolated, { reuseMode, status = 'prepared', activationPlan = null }) {
  const carrier = {
    identity: digest({ head: isolated.head, tree: isolated.tree, expectedTargetRef: isolated.deliveryBaseline.head, taskContributionIdentity: isolated.taskContribution.identity, handoffIdentity: run.identity.handoffIdentity, candidateIdentity: run.identity.candidateIdentity, contentTargetIdentity: run.identity.contentTargetIdentity, reuseMode, activationPlanIdentity: activationPlan?.identity || null }),
    status,
    reuseMode,
    kind: 'git-isolated-commit',
    root: isolated.root,
    head: isolated.head,
    tree: isolated.tree,
    branch: null,
    expectedTargetRef: isolated.deliveryBaseline.head,
    targetRef: `${run.identity.remote}/${run.identity.targetBranch}`,
    changedPaths: isolated.changedPaths,
    changes: isolated.changes || [],
    deliveryBaseline: isolated.deliveryBaseline,
    taskContribution: isolated.taskContribution,
    handoffIdentity: run.identity.handoffIdentity,
    candidateIdentity: run.identity.candidateIdentity,
    contentTargetIdentity: run.identity.contentTargetIdentity,
    preparedAt: new Date().toISOString(),
    activationPlan,
  };
  if (isolated.conflict) carrier.adaptation = { status: 'required', reason: isolated.conflict };
  if (isolated.carrierDeltaIdentity) carrier.carrierDeltaIdentity = isolated.carrierDeltaIdentity;
  if (isolated.cleanliness) carrier.cleanliness = isolated.cleanliness;
  return carrier;
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

function statusEntries(root) {
  const result = spawnSync('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all'], { cwd: root, encoding: 'utf8', maxBuffer: MAX_OUTPUT_BYTES });
  if (result.status !== 0) return null;
  const entries = [];
  const chunks = result.stdout.split('\0').filter(Boolean);
  for (let index = 0; index < chunks.length; index += 1) {
    const raw = chunks[index];
    const status = raw.slice(0, 2);
    const file = normalizePortablePath(raw.slice(3));
    entries.push({ status, path: file });
    if (status[0] === 'R' || status[0] === 'C') index += 1;
  }
  return entries;
}

function activationGitDelta(root) {
  const entries = statusEntries(root);
  if (entries === null) return null;
  return entries.filter((entry) => !controlMetadataPath(entry.path));
}

function managedActivationPaths(runtime, retainedRoot, agent) {
  if (typeof runtime.buildSyncSourcePlan !== 'function') return [];
  const plan = runtime.buildSyncSourcePlan(retainedRoot, agent);
  return [...new Set((plan.affectedPaths || []).map((item) => normalizePortablePath(path.relative(retainedRoot, item))))].filter(Boolean).sort();
}

function isManagedPath(candidate, managedPaths) {
  return managedPaths.some((managed) => candidate === managed || candidate.startsWith(`${managed.replace(/\/$/, '')}/`));
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

function phaseFailure(findings, fallbackClass = 'product-execution-failure') {
  const errors = findings.filter((item) => item.severity === 'error');
  const primary = errors[0] || findings[0];
  return {
    operation: primary?.check || null,
    check: primary?.check || null,
    failureClass: primary?.failureClass || fallbackClass,
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

  function taskRecord(run) {
    if (typeof runtime.inspectTaskRecord !== 'function') return { taskId: run.identity.task, scope: { projects: [], services: [] } };
    return runtime.inspectTaskRecord(run.identity.workspaceRoot, run.identity.task)?.record || { taskId: run.identity.task, scope: { projects: [], services: [] } };
  }

  function activationPlan(run, changedPaths) {
    return planRetainedTaskFinishActivation({ workspaceRoot: run.identity.workspaceRoot, agent: run.identity.agent, task: taskRecord(run), changedPaths });
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
      if (!development.matches) checks.push(finding('development-handoff', 'error', 'task-finish.development-handoff-not-current', 'Formal Development handoff is missing, stale, or does not match this run.', { failureClass: 'upstream-candidate-defect' }));
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

      try {
        const retainedActivation = activationPlan(run, []);
        checks.push(finding('retained-activation', 'ok', 'task-finish.activation-authority-ready', 'Retained Task Finish activation declarations are valid for the Task scope.', { planIdentity: retainedActivation.identity }));
      } catch (error) {
        checks.push(finding('retained-activation', 'error', error.code || 'task-finish.activation-declaration-invalid', error.message, { details: error.details }));
      }

      const errors = checks.filter((item) => item.severity === 'error');
      if (errors.length) {
        const transientOnly = errors.every((item) => item.failureClass === 'transient-external-condition');
        return { status: transientOnly ? 'blocked' : 'failed', checks, failure: phaseFailure(checks, transientOnly ? 'transient-external-condition' : 'product-execution-failure') };
      }
      return { status: 'passed', checks, inputIdentity: run.identity.handoffIdentity, outputIdentity: digest(checks) };
    },

    async prepare({ run }) {
      const operations = [];
      if (!developmentCarrier(run).matches) return { status: 'failed', failure: { operation: 'development-handoff', failureClass: 'upstream-candidate-defect', code: 'task-finish.development-handoff-not-current', message: 'Development handoff changed before carrier preparation.' } };
      if (!currentWorkspaceNode(run).matches) return { status: 'failed', failure: { operation: 'workspace-node', failureClass: 'product-execution-failure', code: 'task-finish.workspace-node-drift', message: 'Workspace Node identity changed before carrier preparation.' } };
      const context = taskEnvironment(run);
      if (!context?.ready) return { status: 'blocked', failure: { operation: 'environment-context', failureClass: 'transient-external-condition', code: context?.blocked?.code || 'task-finish.environment-not-ready', message: context?.blocked?.message || 'Task Environment is not ready.' } };
      if (!run.identity.remote) return { status: 'failed', failure: { operation: 'delivery-remote', failureClass: 'product-execution-failure', code: 'task-finish.delivery-remote-missing', message: 'Task Finish cannot prepare a delivery carrier without a frozen delivery remote.' } };

      const fetched = git(environmentRoot, 'prepare-target-fetch', ['fetch', run.identity.remote, run.identity.targetBranch]);
      operations.push(fetched.observation);
      if (fetched.result.status !== 0) return { status: 'blocked', operations, failure: { operation: 'target-fetch', failureClass: 'transient-external-condition', code: 'task-finish.target-fetch-failed', exitCode: fetched.result.status, message: 'Unable to observe the target branch.', diagnostic: fetched.observation.stderr } };
      const targetRef = `${run.identity.remote}/${run.identity.targetBranch}`;
      const expectedTargetRef = gitText(environmentRoot, ['rev-parse', `${targetRef}^{commit}`]);
      if (!expectedTargetRef) return { status: 'blocked', operations, failure: { operation: 'target-observation', failureClass: 'transient-external-condition', code: 'task-finish.target-ref-missing', message: `Target ref is unavailable: ${targetRef}` } };
      if (run.deliveryCarrier?.reuseMode === 'adaptation-required') {
        if (run.deliveryCarrier.deliveryBaseline?.head !== expectedTargetRef) return { status: 'blocked', operations, failure: { operation: 'delivery-baseline', failureClass: 'transient-external-condition', code: 'task-finish.target-race', message: 'Delivery Baseline changed while the isolated carrier awaited adaptation.', findings: [{ expected: run.deliveryCarrier.deliveryBaseline?.head, observed: expectedTargetRef }] } };
        const currentContribution = observeGitTaskContribution({ root: environmentRoot, deliveryBaselineHead: run.deliveryCarrier.taskContribution.originalBaseline.head });
        if (currentContribution.identity !== run.deliveryCarrier.taskContribution.identity || currentContribution.source.tree !== run.deliveryCarrier.taskContribution.source.tree) return { status: 'blocked', operations, failure: { operation: 'task-contribution', failureClass: 'semantic-review-required', code: 'task-finish.task-contribution-drift-unresolved', message: 'Frozen Task Contribution no longer matches the Delivery Adaptation source facts; Development applicability must be inspected before any rebuild.' } };
        const adopted = adoptAgentReviewedGitCarrier({ repositoryRoot: environmentRoot, carrier: run.deliveryCarrier });
        if (adopted.status !== 'adopted') return { status: 'blocked', operations, failure: { operation: 'delivery-adaptation', failureClass: 'semantic-review-required', code: adopted.code || 'task-finish.delivery-adaptation-required', message: 'Delivery Adaptation is not ready for deterministic verification.', findings: [adopted] }, output: { deliveryCarrier: run.deliveryCarrier } };
        const isolated = { ...run.deliveryCarrier, ...adopted, taskContribution: run.deliveryCarrier.taskContribution, deliveryBaseline: run.deliveryCarrier.deliveryBaseline };
        const plan = activationPlan(run, isolated.changedPaths || run.deliveryCarrier.changedPaths || []);
        const carrier = deliveryCarrier(run, isolated, { reuseMode: 'agent-reviewed-delivery-adaptation', activationPlan: plan });
        const compatibilityChecks = typeof runtime.runTaskFinishCarrierCompatibility === 'function'
          ? await runtime.runTaskFinishCarrierCompatibility({ task: run.identity.task, carrier, handoffIdentity: run.identity.handoffIdentity, candidateIdentity: run.identity.candidateIdentity })
          : { status: 'not-required', checks: [], basis: 'The current Project adapter declares no carrier-specific compatibility checks.' };
        if (!['passed', 'not-required'].includes(compatibilityChecks?.status)) return { status: 'blocked', operations, failure: { operation: 'carrier-compatibility', failureClass: 'semantic-review-required', code: 'task-finish.compatibility-checks-failed', message: 'Project-required Delivery Carrier compatibility checks did not pass.', findings: [compatibilityChecks] }, output: { deliveryCarrier: run.deliveryCarrier } };
        carrier.adaptation = { status: 'agent-reviewed', compatibilityChecks };
        operations.push({ kind: 'product', id: 'adopt-agent-reviewed-delivery-carrier', status: 'passed', carrierRoot: carrier.root });
        operations.push({ kind: 'product', id: 'carrier-compatibility-checks', status: compatibilityChecks.status, checks: compatibilityChecks.checks || [], evidenceIdentity: compatibilityChecks.evidenceIdentity || null });
        return { status: 'passed', operations, inputIdentity: run.identity.handoffIdentity, outputIdentity: carrier.identity, output: { deliveryCarrier: carrier } };
      }
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
        return { status: 'failed', operations, failure: { operation: 'carrier-preparation', failureClass: 'product-execution-failure', code: error.code || 'task-finish.carrier-prepare-failed', message: error.message, diagnostic: error.details || error.cleanup || null } };
      }
      if (isolated.status === 'adaptation-required') {
        const plan = activationPlan(run, isolated.changedPaths || []);
        const carrier = deliveryCarrier(run, isolated, { reuseMode: 'adaptation-required', status: 'blocked', activationPlan: plan });
        operations.push({ kind: 'product', id: 'prepare-isolated-carrier', status: 'blocked', code: isolated.conflict.code, carrierRoot: isolated.root });
        return {
          status: 'blocked', operations,
          inputIdentity: run.identity.handoffIdentity, outputIdentity: carrier.identity,
          failure: { operation: 'delivery-adaptation', failureClass: 'semantic-review-required', code: 'task-finish.delivery-adaptation-required', message: 'Task Contribution requires Agent-reviewed Delivery Adaptation on the isolated carrier.', diagnostic: isolated.conflict },
          output: { deliveryCarrier: carrier },
        };
      }
      operations.push({ kind: 'product', id: 'prepare-isolated-carrier', status: 'passed', carrierRoot: isolated.root });
      const equivalent = runtime.assertTaskDevelopmentCarrier(run.identity.workspaceRoot, run.identity.task);
      if (equivalent.status !== 'equivalent') {
        const cleanup = removeIsolatedGitCarrier({ repositoryRoot: environmentRoot, workspaceRoot: run.identity.workspaceRoot, runId: run.runId, expectedRoot: isolated.root });
        return { status: 'failed', operations, failure: { operation: 'carrier-equivalence', failureClass: 'upstream-candidate-defect', code: 'task-finish.carrier-not-equivalent', message: 'Task Content Target or Development handoff changed during isolated carrier preparation.', diagnostic: { development: equivalent.diagnostic, carrierCleanup: cleanup } } };
      }
      const plan = activationPlan(run, isolated.changedPaths || []);
      const carrier = deliveryCarrier(run, isolated, { reuseMode: 'deterministic-reuse', activationPlan: plan });
      return { status: 'passed', operations, inputIdentity: run.identity.handoffIdentity, outputIdentity: carrier.identity, output: { deliveryCarrier: carrier } };
    },

    async verify({ run }) {
      const observed = verifyGitTaskContributionCarrier({ repositoryRoot: environmentRoot, carrier: run.deliveryCarrier });
      if (observed.status !== 'equivalent') return { status: 'blocked', failure: { operation: 'carrier-verification', failureClass: 'semantic-review-required', code: observed.code || 'task-finish.carrier-changed', message: 'Delivery Carrier facts cannot be verified.', findings: [observed] } };
      const equivalent = runtime.assertTaskDevelopmentCarrier(run.identity.workspaceRoot, run.identity.task);
      if (equivalent.status !== 'equivalent') return { status: 'failed', failure: { operation: 'carrier-equivalence', failureClass: 'upstream-candidate-defect', code: 'task-finish.carrier-not-equivalent', message: 'Delivery carrier is no longer content-equivalent to the Development handoff.', diagnostic: equivalent.diagnostic } };
      const equivalence = { status: 'equivalent', reuseMode: run.deliveryCarrier.reuseMode, semanticEquivalence: run.deliveryCarrier.reuseMode === 'deterministic-reuse' ? 'deterministic-git-identity' : 'agent-reviewed-not-proven-by-buildr', handoffIdentity: run.identity.handoffIdentity, candidateIdentity: run.identity.candidateIdentity, candidateGeneration: run.identity.candidateGeneration, contentTargetIdentity: run.identity.contentTargetIdentity, taskContributionIdentity: run.deliveryCarrier.taskContribution.identity, deliveryBaselineIdentity: digest(run.deliveryCarrier.deliveryBaseline), carrierIdentity: run.deliveryCarrier.identity, formalVerificationExecutions: 0 };
      return { status: 'passed', inputIdentity: run.deliveryCarrier.identity, outputIdentity: digest(equivalence), output: { equivalence } };
    },

    async deliver({ run }) {
      const operations = [];
      const carrier = verifyGitTaskContributionCarrier({ repositoryRoot: environmentRoot, carrier: run.deliveryCarrier });
      if (carrier.status !== 'equivalent') return { status: 'blocked', failure: { operation: 'carrier', failureClass: 'semantic-review-required', code: carrier.code || 'task-finish.carrier-changed', message: 'Delivery Carrier facts changed before delivery.' } };
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
        const pendingConvergence = run.delivery?.convergenceRef ? run.delivery : null;
        if (pendingConvergence) {
          const convergenceRef = pendingConvergence.convergenceRef;
          if (pendingConvergence.activation?.plan?.identity !== run.deliveryCarrier.activationPlan?.identity) return { status: 'failed', operations, failure: { operation: 'activation-resume', failureClass: 'product-execution-failure', code: 'task-finish.activation-plan-drift', message: 'The blocked delivery activation plan no longer matches its Delivery Carrier.' } };
          const retainedIdentity = currentGitIdentity(retainedRoot);
          const carrierAncestor = gitText(retainedRoot, ['merge-base', '--is-ancestor', run.deliveryCarrier.head, convergenceRef]) === '';
          const retainedDelta = activationGitDelta(retainedRoot);
          if (retainedIdentity.head !== convergenceRef || retainedDelta === null || retainedDelta.length > 0 || !carrierAncestor) return { status: 'blocked', operations, failure: { operation: 'convergence-resume', failureClass: 'transient-external-condition', code: 'task-finish.convergence-resume-drift', message: 'Retained convergence HEAD, tree, or carrier ancestry changed before resume.', findings: [{ expected: convergenceRef, observed: retainedIdentity.head, delta: retainedDelta, carrierAncestor }] } };
          if (![run.deliveryCarrier.head, convergenceRef].includes(observedTargetRef)) return { status: 'blocked', operations, failure: { operation: 'convergence-resume', failureClass: 'transient-external-condition', code: 'task-finish.target-race', message: 'Remote target changed while convergence delivery was blocked.', findings: [{ expected: [run.deliveryCarrier.head, convergenceRef], observed: observedTargetRef }] } };
          if (observedTargetRef === run.deliveryCarrier.head) {
            const pushed = git(retainedRoot, 'deliver-convergence-push', ['push', run.identity.remote, `${run.identity.targetBranch}:${run.identity.targetBranch}`]);
            operations.push(pushed.observation);
            if (pushed.result.status !== 0) return { status: 'blocked', operations, failure: { operation: 'convergence-push', failureClass: 'transient-external-condition', code: 'task-finish.convergence-push-failed', exitCode: pushed.result.status, message: 'Retained activation convergence push failed.', diagnostic: pushed.observation.stderr }, output: { delivery: pendingConvergence } };
          }
          const finalReadback = git(retainedRoot, 'deliver-convergence-readback', ['ls-remote', '--heads', run.identity.remote, run.identity.targetBranch]);
          operations.push(finalReadback.observation);
          const finalRemoteRef = finalReadback.result.status === 0 ? finalReadback.result.stdout.trim().split(/\s+/)[0] || null : null;
          if (finalRemoteRef !== convergenceRef) return { status: 'blocked', operations, failure: { operation: 'convergence-readback', failureClass: 'transient-external-condition', code: 'task-finish.convergence-readback-failed', message: 'Unable to prove the final retained activation remote ref.', findings: [{ expected: convergenceRef, observed: finalRemoteRef }] }, output: { delivery: pendingConvergence } };
          const delivery = { ...pendingConvergence, status: 'delivered', finalRemoteRef };
          return { status: 'passed', operations, inputIdentity: run.deliveryCarrier.identity, outputIdentity: finalRemoteRef, output: { delivery } };
        }
        const alreadyDelivered = observedTargetRef === run.deliveryCarrier.head;
        if (!alreadyDelivered && observedTargetRef !== run.deliveryCarrier.expectedTargetRef) return { status: 'blocked', operations, failure: { operation: 'target-transition', failureClass: 'transient-external-condition', code: 'task-finish.target-race', message: 'Target ref changed after carrier preparation; rebuild the isolated carrier on the latest Delivery Baseline.', findings: [{ expected: run.deliveryCarrier.expectedTargetRef, observed: observedTargetRef }] }, output: { delivery: { status: 'blocked', expectedTargetRef: run.deliveryCarrier.expectedTargetRef, observedTargetRef, carrierRef: run.deliveryCarrier.head } } };
        if (!alreadyDelivered) {
          const retainedIdentity = currentGitIdentity(retainedRoot);
          const readiness = retainedWorkspaceReadiness(retainedIdentity);
          if (retainedIdentity.branch !== run.identity.targetBranch || !readiness.ready || retainedIdentity.head !== observedTargetRef) return { status: 'blocked', operations, failure: { operation: 'retained-workspace', failureClass: 'transient-external-condition', code: 'task-finish.retained-workspace-not-ready', message: 'Retained Workspace is not clean at the observed target ref.', findings: [retainedIdentity] } };
          const merged = git(retainedRoot, 'deliver-fast-forward', ['merge', '--ff-only', run.deliveryCarrier.head]);
          operations.push(merged.observation);
          if (merged.result.status !== 0) return { status: 'failed', operations, failure: { operation: 'target-transition', failureClass: 'product-execution-failure', code: 'task-finish.fast-forward-failed', exitCode: merged.result.status, message: 'Delivery carrier is not a fast-forward transition.', diagnostic: merged.observation.stderr } };
          const pushed = git(retainedRoot, 'deliver-push', ['push', run.identity.remote, `${run.identity.targetBranch}:${run.identity.targetBranch}`]);
          operations.push(pushed.observation);
          if (pushed.result.status !== 0) return { status: 'blocked', operations, failure: { operation: 'target-push', failureClass: 'transient-external-condition', code: 'task-finish.push-failed', exitCode: pushed.result.status, message: 'Target push failed.', diagnostic: pushed.observation.stderr } };
        }

        const readback = git(retainedRoot, 'deliver-target-readback', ['ls-remote', '--heads', run.identity.remote, run.identity.targetBranch]);
        operations.push(readback.observation);
        if (readback.result.status !== 0) return { status: 'blocked', operations, failure: { operation: 'target-readback', failureClass: 'transient-external-condition', code: 'task-finish.remote-readback-failed', exitCode: readback.result.status, message: 'Unable to read back the remote target ref after delivery.', diagnostic: readback.observation.stderr } };
        const remoteAfterRef = readback.result.stdout.trim().split(/\s+/)[0] || null;
        if (remoteAfterRef !== run.deliveryCarrier.head) return { status: 'blocked', operations, failure: { operation: 'target-transition', failureClass: 'transient-external-condition', code: 'task-finish.target-race', message: 'Remote target ref does not match the carrier after push; delivery remains blocked without Candidate applicability claims.', findings: [{ expected: run.deliveryCarrier.head, observed: remoteAfterRef }] }, output: { delivery: { status: 'blocked', expectedTargetRef: run.deliveryCarrier.expectedTargetRef, observedTargetRef, carrierRef: run.deliveryCarrier.head } } };

        const retainedCli = path.join(retainedRoot, 'projects', 'product', 'buildr');
        const impact = classifyRetainedConvergencePaths(run.deliveryCarrier.changedPaths || []);
        const plan = run.deliveryCarrier.activationPlan || activationPlan(run, run.deliveryCarrier.changedPaths || []);
        const beforeActivation = activationGitDelta(retainedRoot);
        if (beforeActivation === null) return { status: 'blocked', operations, failure: { operation: 'retained-activation', failureClass: 'transient-external-condition', code: 'task-finish.activation-status-unavailable', message: 'Unable to observe retained Git status before activation.' } };
        if (beforeActivation.length) return { status: 'blocked', operations, failure: { operation: 'retained-activation', failureClass: 'transient-external-condition', code: 'task-finish.activation-workspace-dirty', message: 'Retained Workspace has non-metadata changes before activation.', findings: beforeActivation } };
        let managedPaths = [];
        if (plan.mode === 'render-runtime') {
          const rendered = runCommand('deliver-retained-render', retainedCli, ['render', run.identity.agent, '--target', retainedRoot], retainedRoot);
          operations.push(rendered.observation);
          if (rendered.result.status !== 0) return { status: 'blocked', operations, failure: { operation: 'retained-render', failureClass: 'transient-external-condition', code: 'task-finish.retained-render-failed', exitCode: rendered.result.status, message: 'Retained Workspace runtime render failed.', diagnostic: rendered.observation.stderr } };
          const renderDelta = activationGitDelta(retainedRoot);
          const tracked = (renderDelta || []).filter((entry) => entry.status !== '??');
          if (tracked.length) return { status: 'blocked', operations, failure: { operation: 'retained-render', failureClass: 'product-execution-failure', code: 'task-finish.render-produced-tracked-delta', message: 'Runtime render produced tracked Git changes.', findings: tracked } };
        } else if (plan.mode === 'sync-workspace') {
          managedPaths = managedActivationPaths(runtime, retainedRoot, run.identity.agent);
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
        const activation = { status: 'passed', plan, managedPaths, ownedPaths: [], convergenceRef: null };
        let finalRemoteRef = remoteAfterRef;
        let convergenceRef = null;
        if (plan.mode === 'sync-workspace') {
          const delta = activationGitDelta(retainedRoot);
          if (delta === null) return { status: 'blocked', operations, failure: { operation: 'retained-sync', failureClass: 'transient-external-condition', code: 'task-finish.activation-status-unavailable', message: 'Unable to observe retained Git status after sync.' } };
          const unknown = delta.filter((entry) => !isManagedPath(entry.path, managedPaths));
          if (unknown.length) return { status: 'blocked', operations, failure: { operation: 'retained-sync', failureClass: 'product-execution-failure', code: 'task-finish.sync-produced-unknown-delta', message: 'Retained sync produced Git changes outside its managed mutation plan.', findings: unknown } };
          const ownedPaths = [...new Set(delta.map((entry) => entry.path))].sort();
          activation.ownedPaths = ownedPaths;
          if (ownedPaths.length) {
            const staged = git(retainedRoot, 'deliver-convergence-stage', ['add', '--', ...ownedPaths]);
            operations.push(staged.observation);
            if (staged.result.status !== 0) return { status: 'blocked', operations, failure: { operation: 'convergence-stage', failureClass: 'product-execution-failure', code: 'task-finish.convergence-stage-failed', message: 'Unable to stage the exact retained activation paths.', diagnostic: staged.observation.stderr } };
            const cached = (gitText(retainedRoot, ['diff', '--cached', '--name-only', '-z']) || '').split('\0').filter(Boolean).sort();
            if (JSON.stringify(cached) !== JSON.stringify(ownedPaths)) return { status: 'blocked', operations, failure: { operation: 'convergence-stage', failureClass: 'product-execution-failure', code: 'task-finish.convergence-stage-scope-mismatch', message: 'Staged convergence paths do not exactly match the activation-owned paths.', findings: [{ expected: ownedPaths, observed: cached }] } };
            const committed = git(retainedRoot, 'deliver-convergence-commit', ['commit', '-m', `收敛 ${run.identity.task} Workspace activation`]);
            operations.push(committed.observation);
            if (committed.result.status !== 0) return { status: 'blocked', operations, failure: { operation: 'convergence-commit', failureClass: 'product-execution-failure', code: 'task-finish.convergence-commit-failed', message: 'Unable to commit retained activation convergence.', diagnostic: committed.observation.stderr } };
            convergenceRef = gitText(retainedRoot, ['rev-parse', 'HEAD']);
            activation.convergenceRef = convergenceRef;
            const delivery = { status: 'blocked', expectedTargetRef: run.deliveryCarrier.expectedTargetRef, observedTargetRef, carrierRef: run.deliveryCarrier.head, remoteAfterRef, convergenceRef, impact, activation, retainedDoctor: 'passed', runtimeInstall: impact.requiresCliInstall || impact.requiresLocalAppInstall ? 'passed' : 'not-applicable', localAppDelivery };
            const pushed = git(retainedRoot, 'deliver-convergence-push', ['push', run.identity.remote, `${run.identity.targetBranch}:${run.identity.targetBranch}`]);
            operations.push(pushed.observation);
            if (pushed.result.status !== 0) return { status: 'blocked', operations, failure: { operation: 'convergence-push', failureClass: 'transient-external-condition', code: 'task-finish.convergence-push-failed', exitCode: pushed.result.status, message: 'Retained activation convergence push failed.', diagnostic: pushed.observation.stderr }, output: { delivery } };
            const finalReadback = git(retainedRoot, 'deliver-convergence-readback', ['ls-remote', '--heads', run.identity.remote, run.identity.targetBranch]);
            operations.push(finalReadback.observation);
            finalRemoteRef = finalReadback.result.status === 0 ? finalReadback.result.stdout.trim().split(/\s+/)[0] || null : null;
            if (finalRemoteRef !== convergenceRef) return { status: 'blocked', operations, failure: { operation: 'convergence-readback', failureClass: 'transient-external-condition', code: 'task-finish.convergence-readback-failed', message: 'Unable to prove the final retained activation remote ref.', findings: [{ expected: convergenceRef, observed: finalRemoteRef }] }, output: { delivery } };
          }
        }
        const delivery = { status: 'delivered', expectedTargetRef: run.deliveryCarrier.expectedTargetRef, observedTargetRef, carrierRef: run.deliveryCarrier.head, remoteAfterRef, finalRemoteRef, ...(convergenceRef ? { convergenceRef } : {}), impact, activation, retainedDoctor: 'passed', runtimeInstall: impact.requiresCliInstall || impact.requiresLocalAppInstall ? 'passed' : 'not-applicable', localAppDelivery };
        return { status: 'passed', operations, inputIdentity: run.deliveryCarrier.identity, outputIdentity: finalRemoteRef, output: { delivery } };
      } finally {
        releaseFinishTargetLease(lease);
      }
    },

    async cleanup({ run }) {
      const operations = [];
      const finalRemoteRef = run.delivery?.finalRemoteRef
        || (!run.deliveryCarrier?.activationPlan && run.delivery?.remoteAfterRef === run.deliveryCarrier?.head
          ? run.delivery.remoteAfterRef
          : null);
      if (run.delivery?.carrierRef !== run.deliveryCarrier?.head || !finalRemoteRef) return { status: 'blocked', failure: { operation: 'cleanup-readiness', failureClass: 'transient-external-condition', code: 'task-finish.delivery-not-complete', message: 'Cleanup requires completed carrier and final remote delivery evidence.' } };
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
