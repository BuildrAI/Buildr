import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

import { planRetainedTaskFinishActivation } from './task-finish-activation.mjs';
import { resolveTaskFinishDeliveryRemote } from './task-finish-delivery-remote.mjs';
import { acquireFinishTargetLease, readFinishCompletion, releaseFinishTargetLease, writeFinishCompletion } from './task-finish-run.mjs';
import { TASK_FINISH_RAW_COMMAND_OUTPUT } from './execution-record.mjs';
import { legacyTaskFinishDeliveryCommit, publicTaskFinishDeliveryCommit } from './task-finish-delivery-commit.mjs';
import { classifyFinalDoctorResult } from '../../infrastructure/final-doctor-process.mjs';
import {
  adoptAgentReviewedGitCarrier,
  createIsolatedGitCarrier,
  inspectGitCarrierContainment,
  observeGitTaskContribution,
  removeIsolatedGitCarrier,
  verifyGitTaskContributionCarrier,
} from './git-task-contribution.mjs';

const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;

function digest(value) {
  return `sha256-${crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex')}`;
}

function deliveredGate(gate, type) {
  if (!gate) return null;
  if (gate.disposition) return {
    status: 'gate-disposition',
    disposition: gate.disposition,
    targetIdentity: gate.targetIdentity,
    summary: gate.summary,
    source: gate.source,
  };
  return {
    status: type === 'verification' ? 'verified-at-delivery' : 'adopted-at-delivery',
    targetIdentity: gate.targetIdentity,
    resultDigest: gate.resultDigest,
    outcome: gate.outcome,
  };
}

function terminalAssociation(handoff, observedAt) {
  return {
    schemaVersion: 'buildr.task-terminal-delivery-associations/v1',
    handoffIdentity: handoff.identity,
    candidateIdentity: handoff.candidate.identity,
    candidateGeneration: handoff.candidate.generation,
    gates: {
      planning: deliveredGate(handoff.gates?.planning, 'planning'),
      completion: deliveredGate(handoff.gates?.completion, 'completion'),
      verification: deliveredGate(handoff.gates?.verification, 'verification'),
    },
    observedAt,
    source: 'task-finish-application',
  };
}

function deliveryCarrier(run, isolated, { reuseMode, status = 'prepared', activationPlan = null }) {
  const deliveryCommit = isolated.deliveryCommit || publicTaskFinishDeliveryCommit(run.deliveryCommit || legacyTaskFinishDeliveryCommit(run.identity.task));
  const carrier = {
    identity: digest({ head: isolated.head, tree: isolated.tree, expectedTargetRef: isolated.deliveryBaseline.head, taskContributionIdentity: isolated.taskContribution.identity, handoffIdentity: run.identity.handoffIdentity, candidateIdentity: run.identity.candidateIdentity, contentTargetIdentity: run.identity.contentTargetIdentity, deliveryCommitIdentity: deliveryCommit?.identity || null, reuseMode, activationPlanIdentity: activationPlan?.identity || null }),
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
    deliveryCommit,
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
  const observation = {
    kind: 'command', id, command, args, cwd,
    status: result.status, signal: result.signal || null, startedAt, durationMs,
    stdout: boundedText(result.stdout), stderr: boundedText(result.stderr),
  };
  Object.defineProperty(observation, TASK_FINISH_RAW_COMMAND_OUTPUT, {
    value: { stdout: result.stdout, stderr: result.stderr },
    enumerable: false,
  });
  return observation;
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
    errorCode: result.error?.code || null,
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

function runThroughRetainedController(context, id, args, cwd, { json = false } = {}) {
  const invocation = context?.controllerInvocation;
  if (!invocation?.command || !Array.isArray(invocation.argsPrefix)) return null;
  const execute = json ? runJsonCommand : runCommand;
  return execute(id, invocation.command, [...invocation.argsPrefix, ...args], cwd);
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

  function activationPlan(run, changedPaths) {
    return planRetainedTaskFinishActivation({ agent: run.identity.agent, changedPaths });
  }

  function frozenDevelopmentIdentity(run) {
    return {
      handoffIdentity: run.identity.handoffIdentity,
      candidateIdentity: run.identity.candidateIdentity,
      candidateGeneration: run.identity.candidateGeneration,
      contentTargetIdentity: run.identity.contentTargetIdentity,
    };
  }

  function developmentCarrier(run) {
    const assertion = runtime.assertTaskDevelopmentCarrier(
      run.identity.workspaceRoot,
      run.identity.task,
      frozenDevelopmentIdentity(run),
    );
    const receipt = assertion.development?.receipt || null;
    const handoff = assertion.status === 'equivalent'
      ? run.developmentHandoff || receipt?.handoffs?.find((item) => item.identity === run.identity.handoffIdentity) || null
      : null;
    return { assertion, receipt, handoff, matches: assertion.status === 'equivalent' };
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

      const retainedActivation = activationPlan(run, []);
      checks.push(finding('retained-activation', 'ok', 'task-finish.activation-plan-ready', 'Task Finish activation is limited to Workspace root runtime rendering.', { planIdentity: retainedActivation.identity }));

      const deliveryCommit = run.deliveryCommit || legacyTaskFinishDeliveryCommit(run.identity.task);
      if (run.identity.deliveryCommitIdentity && (!run.deliveryCommit || run.identity.deliveryCommitIdentity !== run.deliveryCommit.identity)) checks.push(finding('delivery-commit', 'error', 'task-finish.commit-message-mismatch', 'Frozen Task Finish delivery commit facts do not match the run identity.'));
      else checks.push(finding('delivery-commit', 'ok', run.deliveryCommit ? 'task-finish.delivery-commit-frozen' : 'task-finish.delivery-commit-legacy', `Delivery commit ${deliveryCommit.subject} is frozen for this run.`));

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
        const equivalent = developmentCarrier(run).assertion;
        if (equivalent.status !== 'equivalent') return { status: 'failed', operations, failure: { operation: 'carrier-equivalence', failureClass: 'upstream-candidate-defect', code: 'task-finish.carrier-not-equivalent', message: 'Development handoff changed while Delivery Adaptation was being adopted.', diagnostic: equivalent.diagnostic }, output: { deliveryCarrier: carrier } };
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
          deliveryCommit: run.deliveryCommit || legacyTaskFinishDeliveryCommit(run.identity.task),
        });
      } catch (error) {
        operations.push({ kind: 'product', id: 'prepare-isolated-carrier', status: 'failed', code: error.code || 'task-finish.carrier-prepare-failed' });
        return { status: 'failed', operations, failure: { operation: 'carrier-preparation', failureClass: 'product-execution-failure', code: error.code || 'task-finish.carrier-prepare-failed', message: error.message, diagnostic: error.details || error.cleanup || null } };
      }
      if (isolated.status === 'adaptation-required') {
        const plan = activationPlan(run, isolated.changedPaths || []);
        const carrier = deliveryCarrier(run, isolated, { reuseMode: 'adaptation-required', status: 'blocked', activationPlan: plan });
        operations.push({ kind: 'product', id: 'prepare-isolated-carrier', status: 'blocked', code: isolated.conflict.code, carrierRoot: isolated.root });
        const equivalent = developmentCarrier(run).assertion;
        if (equivalent.status !== 'equivalent') {
          const cleanup = removeIsolatedGitCarrier({ repositoryRoot: environmentRoot, workspaceRoot: run.identity.workspaceRoot, runId: run.runId, expectedRoot: isolated.root });
          return { status: 'failed', operations, failure: { operation: 'carrier-equivalence', failureClass: 'upstream-candidate-defect', code: 'task-finish.carrier-not-equivalent', message: 'Development handoff changed during isolated carrier preparation.', diagnostic: { development: equivalent.diagnostic, carrierCleanup: cleanup } } };
        }
        return {
          status: 'blocked', operations,
          inputIdentity: run.identity.handoffIdentity, outputIdentity: carrier.identity,
          failure: { operation: 'delivery-adaptation', failureClass: 'semantic-review-required', code: 'task-finish.delivery-adaptation-required', message: 'Task Contribution requires Agent-reviewed Delivery Adaptation on the isolated carrier.', diagnostic: isolated.conflict },
          output: { deliveryCarrier: carrier },
        };
      }
      operations.push({ kind: 'product', id: 'prepare-isolated-carrier', status: 'passed', carrierRoot: isolated.root });
      const equivalent = developmentCarrier(run).assertion;
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
      const equivalent = developmentCarrier(run).assertion;
      if (equivalent.status !== 'equivalent') return { status: 'failed', failure: { operation: 'carrier-equivalence', failureClass: 'upstream-candidate-defect', code: 'task-finish.carrier-not-equivalent', message: 'Delivery carrier is no longer content-equivalent to the Development handoff.', diagnostic: equivalent.diagnostic } };
      const equivalence = { status: 'equivalent', reuseMode: run.deliveryCarrier.reuseMode, semanticEquivalence: run.deliveryCarrier.reuseMode === 'deterministic-reuse' ? 'deterministic-git-identity' : 'agent-reviewed-not-proven-by-buildr', handoffIdentity: run.identity.handoffIdentity, candidateIdentity: run.identity.candidateIdentity, candidateGeneration: run.identity.candidateGeneration, contentTargetIdentity: run.identity.contentTargetIdentity, taskContributionIdentity: run.deliveryCarrier.taskContribution.identity, deliveryBaselineIdentity: digest(run.deliveryCarrier.deliveryBaseline), carrierIdentity: run.deliveryCarrier.identity, formalVerificationExecutions: 0 };
      return { status: 'passed', inputIdentity: run.deliveryCarrier.identity, outputIdentity: digest(equivalence), output: { equivalence } };
    },

    async deliver({ run }) {
      const operations = [];
      const carrier = verifyGitTaskContributionCarrier({ repositoryRoot: environmentRoot, carrier: run.deliveryCarrier });
      if (carrier.status !== 'equivalent') return { status: 'blocked', failure: { operation: 'carrier', failureClass: 'semantic-review-required', code: carrier.code || 'task-finish.carrier-changed', message: 'Delivery Carrier facts changed before delivery.' } };
      if (!developmentCarrier(run).matches) return { status: 'failed', failure: { operation: 'carrier-equivalence', failureClass: 'upstream-candidate-defect', code: 'task-finish.carrier-not-equivalent', message: 'Development handoff is no longer current before delivery.' } };
      const retainedRoot = run.identity.workspaceRoot;
      const lease = acquireFinishTargetLease({
        root: retainedRoot,
        runtime,
        targetIdentity: `${run.identity.remote || 'local'}:${run.identity.targetBranch}`,
        run,
      });
      if (lease.blocked) return { status: 'blocked', failure: { operation: 'target-lease', failureClass: 'transient-external-condition', code: 'task-finish.target-lease-held', message: 'Target branch lease is held by another Finish run.', findings: [lease.existing] } };
      try {
        if (!run.identity.remote) return { status: 'failed', operations, failure: { operation: 'delivery-remote', failureClass: 'product-execution-failure', code: 'task-finish.delivery-remote-missing', message: 'Task Finish cannot deliver without a frozen delivery remote.' } };
        const remote = git(retainedRoot, 'deliver-target-observe', ['ls-remote', '--heads', run.identity.remote, run.identity.targetBranch]);
        operations.push(remote.observation);
        if (remote.result.status !== 0) return { status: 'blocked', operations, failure: { operation: 'target-observation', failureClass: 'transient-external-condition', code: 'task-finish.target-observation-failed', exitCode: remote.result.status, message: 'Unable to observe remote target ref.', diagnostic: remote.observation.stderr } };
        const observedTargetRef = remote.result.stdout.trim().split(/\s+/)[0] || null;
        const alreadyDelivered = observedTargetRef === run.deliveryCarrier.head;
        let alreadyContained = false;
        let containment = null;
        if (!alreadyDelivered && observedTargetRef !== run.deliveryCarrier.expectedTargetRef) {
          const fetched = git(retainedRoot, 'deliver-contained-target-fetch', ['fetch', run.identity.remote, run.identity.targetBranch]);
          operations.push(fetched.observation);
          const fetchedTargetRef = fetched.result.status === 0 ? gitText(retainedRoot, ['rev-parse', `${run.identity.remote}/${run.identity.targetBranch}^{commit}`]) : null;
          if (fetched.result.status === 0 && fetchedTargetRef === observedTargetRef) containment = inspectGitCarrierContainment({ repositoryRoot: retainedRoot, targetRef: observedTargetRef, carrier: run.deliveryCarrier });
          else containment = { status: 'unprovable', code: fetched.result.status === 0 ? 'task-finish.containment-target-race' : 'task-finish.containment-fetch-failed', expected: observedTargetRef, observed: fetchedTargetRef, diagnostic: fetched.observation.stderr };
          alreadyContained = containment.status === 'contained';
          if (!alreadyContained) return { status: 'blocked', operations, failure: { operation: 'target-transition', failureClass: 'transient-external-condition', code: 'task-finish.target-race', message: 'Target ref changed after carrier preparation and exact carrier containment could not be proved.', findings: [{ expected: run.deliveryCarrier.expectedTargetRef, observed: observedTargetRef }, containment] }, output: { delivery: { status: 'blocked', expectedTargetRef: run.deliveryCarrier.expectedTargetRef, observedTargetRef, carrierRef: run.deliveryCarrier.head } } };
          const retainedIdentity = currentGitIdentity(retainedRoot);
          const readiness = retainedWorkspaceReadiness(retainedIdentity);
          if (retainedIdentity.branch !== run.identity.targetBranch || !readiness.ready || retainedIdentity.head !== observedTargetRef) return { status: 'blocked', operations, failure: { operation: 'retained-workspace', failureClass: 'transient-external-condition', code: 'task-finish.retained-workspace-not-ready', message: 'Retained Workspace is not clean at the exactly-contained remote target ref.', findings: [retainedIdentity] } };
        }
        if (!alreadyDelivered && !alreadyContained) {
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
        const expectedRemoteAfterRef = alreadyContained ? observedTargetRef : run.deliveryCarrier.head;
        if (remoteAfterRef !== expectedRemoteAfterRef) return { status: 'blocked', operations, failure: { operation: 'target-transition', failureClass: 'transient-external-condition', code: 'task-finish.target-race', message: 'Remote target ref changed after delivery evidence was established; delivery remains blocked without Candidate applicability claims.', findings: [{ expected: expectedRemoteAfterRef, observed: remoteAfterRef }] }, output: { delivery: { status: 'blocked', expectedTargetRef: run.deliveryCarrier.expectedTargetRef, observedTargetRef, carrierRef: run.deliveryCarrier.head } } };

        const context = taskEnvironment(run);
        if (!context?.ready) return { status: 'blocked', operations, failure: { operation: 'retained-controller', failureClass: 'transient-external-condition', code: context?.blocked?.code || 'task-finish.retained-controller-unavailable', message: context?.blocked?.message || 'Retained Environment controller is unavailable.' } };
        const plan = run.deliveryCarrier.activationPlan || activationPlan(run, run.deliveryCarrier.changedPaths || []);
        const beforeActivation = activationGitDelta(retainedRoot);
        if (beforeActivation === null) return { status: 'blocked', operations, failure: { operation: 'retained-activation', failureClass: 'transient-external-condition', code: 'task-finish.activation-status-unavailable', message: 'Unable to observe retained Git status before activation.' } };
        if (beforeActivation.length) return { status: 'blocked', operations, failure: { operation: 'retained-activation', failureClass: 'transient-external-condition', code: 'task-finish.activation-workspace-dirty', message: 'Retained Workspace has non-metadata changes before activation.', findings: beforeActivation } };
        if (plan.mode === 'render-runtime') {
          const rendered = runThroughRetainedController(context, 'deliver-retained-render', ['render', run.identity.agent, '--target', retainedRoot], retainedRoot);
          if (!rendered) return { status: 'blocked', operations, failure: { operation: 'retained-render', failureClass: 'transient-external-condition', code: 'task-finish.retained-controller-unavailable', message: 'Retained Environment controller invocation is unavailable.' } };
          operations.push(rendered.observation);
          if (rendered.result.status !== 0) return { status: 'blocked', operations, failure: { operation: 'retained-render', failureClass: 'transient-external-condition', code: 'task-finish.retained-render-failed', exitCode: rendered.result.status, message: 'Retained Workspace runtime render failed.', diagnostic: rendered.observation.stderr } };
          const renderDelta = activationGitDelta(retainedRoot);
          const tracked = (renderDelta || []).filter((entry) => entry.status !== '??');
          if (tracked.length) return { status: 'blocked', operations, failure: { operation: 'retained-render', failureClass: 'product-execution-failure', code: 'task-finish.render-produced-tracked-delta', message: 'Runtime render produced tracked Git changes.', findings: tracked } };
        }
        const blockedDelivery = (doctorCode = null) => ({
          status: 'activation-blocked',
          targetDisposition: alreadyContained ? 'already-contained' : 'carrier',
          expectedTargetRef: run.deliveryCarrier.expectedTargetRef,
          observedTargetRef,
          carrierRef: run.deliveryCarrier.head,
          remoteAfterRef,
          finalRemoteRef: remoteAfterRef,
          containment,
          activation: { status: 'blocked', plan, doctorCode },
          retainedDoctor: 'blocked',
          runtimeInstall: 'not-applicable',
          localAppDelivery: 'not-applicable',
        });
        const doctor = runThroughRetainedController(context, 'deliver-retained-doctor', ['doctor', '--agent', run.identity.agent, '--target', retainedRoot, '--json', '--detail', 'compact'], retainedRoot, { json: true });
        if (!doctor) return {
          status: 'blocked', operations,
          failure: { operation: 'retained-doctor', failureClass: 'transient-external-condition', code: 'task-finish.retained-controller-unavailable', message: 'Retained Environment controller invocation is unavailable.' },
          output: { delivery: blockedDelivery('task-finish.retained-controller-unavailable') },
        };
        operations.push(doctor.observation);
        const doctorProcess = classifyFinalDoctorResult(doctor.result);
        if (doctorProcess.status !== 'passed' || doctor.payload?.health?.ready !== true) {
          const doctorCode = doctorProcess.status === 'doctor-failed'
            ? 'task-finish.retained-doctor-failed'
            : doctorProcess.code === 'doctor.passed'
              ? 'task-finish.retained-doctor-not-ready'
              : doctorProcess.code;
          return {
            status: 'blocked', operations,
            failure: { operation: 'retained-doctor', failureClass: 'transient-external-condition', code: doctorCode, exitCode: doctor.result.status, message: doctorProcess.status === 'passed' ? 'Retained Workspace doctor is not ready.' : doctorProcess.message, diagnostic: doctor.payload?.findings || doctorProcess.diagnostic || doctor.observation.stderr },
            output: { delivery: blockedDelivery(doctorCode) },
          };
        }
        const activation = { status: 'passed', plan };
        const delivery = { status: 'delivered', targetDisposition: alreadyContained ? 'already-contained' : 'carrier', expectedTargetRef: run.deliveryCarrier.expectedTargetRef, observedTargetRef, carrierRef: run.deliveryCarrier.head, remoteAfterRef, finalRemoteRef: remoteAfterRef, containment, activation, retainedDoctor: 'passed', runtimeInstall: 'not-applicable', localAppDelivery: 'not-applicable' };
        return { status: 'passed', operations, inputIdentity: run.deliveryCarrier.identity, outputIdentity: remoteAfterRef, output: { delivery } };
      } finally {
        releaseFinishTargetLease(lease, { root: retainedRoot, runtime });
      }
    },

    async cleanup({ run }) {
      const operations = [];
      const finalRemoteRef = run.delivery?.finalRemoteRef;
      if (run.delivery?.carrierRef !== run.deliveryCarrier?.head || !finalRemoteRef) return { status: 'blocked', failure: { operation: 'cleanup-readiness', failureClass: 'transient-external-condition', code: 'task-finish.delivery-not-complete', message: 'Cleanup requires completed carrier and final remote delivery evidence.' } };
      const previousCompletion = readFinishCompletion({ root: run.identity.workspaceRoot, runId: run.runId, runtime });
      let association = previousCompletion?.association || null;
      if (association && (previousCompletion.task !== run.identity.task || previousCompletion.handoffIdentity !== run.identity.handoffIdentity || previousCompletion.candidateIdentity !== run.identity.candidateIdentity)) {
        return { status: 'blocked', operations, failure: { operation: 'terminal-association', failureClass: 'product-execution-failure', code: 'task-finish.terminal-association-identity-mismatch', message: 'Prepared terminal association does not match the current Finish run identity.' } };
      }
      if (!association) {
        const handoff = run.developmentHandoff || developmentCarrier(run).handoff;
        if (!handoff) return { status: 'blocked', operations, failure: { operation: 'terminal-association', failureClass: 'product-execution-failure', code: 'task-finish.frozen-handoff-unavailable', message: 'Cannot persist terminal delivery associations because the run has no matching frozen Development handoff snapshot.' } };
        association = terminalAssociation(handoff, new Date().toISOString());
      }
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
        finalRemoteRef,
        taskContributionIdentity: run.deliveryCarrier.taskContribution.identity,
        deliveryBaseline: run.deliveryCarrier.deliveryBaseline,
        targetBranch: run.identity.targetBranch,
        status: 'prepared',
        preparedAt: new Date().toISOString(),
        association,
      };
      const completionFile = writeFinishCompletion({ root: run.identity.workspaceRoot, runId: run.runId, completion: prepared, runtime });
      let context = taskEnvironment(run);
      if (!context?.ready && typeof runtime.resolveTaskEnvironmentCleanupContext === 'function') {
        context = runtime.resolveTaskEnvironmentCleanupContext(run.identity.workspaceRoot, run.identity.task);
      }
      const deliveries = Object.fromEntries((context.repositories || []).map((repository) => [repository.selector, repository.selector === 'workspace' ? run.identity.targetBranch : repository.startPoint]));
      const integratedContributions = { workspace: run.deliveryCarrier };
      let cleanedEnvironment = previousCompletion?.cleanup?.status === 'cleaned' ? previousCompletion.cleanup : null;
      if (cleanedEnvironment) {
        operations.push({ operation: 'cleanup-task-environment', status: 'reused-cleaned-boundary', effects: [], diagnostic: null });
      } else {
        const delegated = await cleanupThroughRetainedController(runtime, context, run, deliveries, integratedContributions);
        if (delegated.observation) operations.push(delegated.observation);
        cleanedEnvironment = delegated.payload || {
          status: 'blocked', effects: [], diagnostic: {
            code: 'task-finish.retained-cleanup-unavailable',
            message: 'Receipt-bound retained Environment Manager cleanup entry is unavailable.',
          },
        };
      }
      operations.push({ operation: 'cleanup-task-environment', status: cleanedEnvironment.status, effects: cleanedEnvironment.effects, diagnostic: cleanedEnvironment.diagnostic });
      if (cleanedEnvironment.status !== 'cleaned') return { status: 'blocked', operations, failure: { operation: 'environment-cleanup', failureClass: 'transient-external-condition', code: cleanedEnvironment.diagnostic?.code || 'task-finish.environment-cleanup-failed', message: cleanedEnvironment.diagnostic?.message || 'Task Environment cleanup failed.', diagnostic: cleanedEnvironment } };
      writeFinishCompletion({ root: run.identity.workspaceRoot, runId: run.runId, completion: { ...prepared, status: 'prepared', cleanup: cleanedEnvironment, environmentCleanedAt: cleanedEnvironment.completedAt || new Date().toISOString() }, runtime });
      const carrierCleanup = removeIsolatedGitCarrier({ repositoryRoot: run.identity.workspaceRoot, workspaceRoot: run.identity.workspaceRoot, runId: run.runId, expectedRoot: run.deliveryCarrier.root });
      operations.push({ kind: 'product', id: 'cleanup-isolated-carrier', status: carrierCleanup.status, details: carrierCleanup });
      if (!['removed', 'not-applicable'].includes(carrierCleanup.status)) return { status: 'blocked', operations, failure: { operation: 'carrier-cleanup', failureClass: 'transient-external-condition', code: carrierCleanup.code || 'task-finish.carrier-cleanup-failed', message: 'Unable to clean the run-owned isolated Delivery Carrier.', diagnostic: carrierCleanup } };
      let taskCompletion;
      try {
        if (typeof runtime.completeTaskRecordFromFinish !== 'function') throw Object.assign(new Error('Task Record Application Finish completion entry is unavailable.'), { code: 'task-finish.task-record-completion-unavailable' });
        taskCompletion = runtime.completeTaskRecordFromFinish(run.identity.workspaceRoot, run.identity.task);
      } catch (error) {
        const diagnostic = { code: error.code || 'task-finish.task-record-completion-failed', message: error.message, details: error.details || null };
        operations.push({ operation: 'complete-task-record', status: 'blocked', taskId: run.identity.task, effects: [], diagnostic });
        return { status: 'blocked', operations, failure: { operation: 'task-record-completion', failureClass: error.code === 'task_record_finish_terminal_conflict' ? 'semantic-review-required' : 'transient-external-condition', code: diagnostic.code, message: diagnostic.message, diagnostic } };
      }
      operations.push({ operation: 'complete-task-record', status: taskCompletion.status, taskId: taskCompletion.taskId, recordDigest: taskCompletion.recordDigest, effects: taskCompletion.effects });
      if (taskCompletion.status !== 'completed' || taskCompletion.record?.status !== 'completed' || taskCompletion.record?.result?.noChange !== false) {
        return { status: 'blocked', operations, failure: { operation: 'task-record-completion', failureClass: 'product-execution-failure', code: 'task-finish.task-record-completion-invalid', message: 'Task Record Application did not confirm a delivered completed Task.', diagnostic: taskCompletion } };
      }
      const complete = { ...prepared, status: 'complete', completedAt: new Date().toISOString(), cleanup: cleanedEnvironment };
      writeFinishCompletion({ root: run.identity.workspaceRoot, runId: run.runId, completion: complete, runtime });
      return { status: 'passed', operations, inputIdentity: run.delivery.carrierRef, outputIdentity: digest(complete), output: { completion: { ...complete, receipt: completionFile, cleanup: cleanedEnvironment } } };
    },
  };
}
