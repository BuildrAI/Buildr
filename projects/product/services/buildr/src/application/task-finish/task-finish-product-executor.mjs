import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';

import { controlMetadataPath } from '../../infrastructure/git/control-metadata-path.mjs';
import { sameFilesystemPath } from '../../infrastructure/git/checkout-identity.mjs';

import { planRetainedTaskFinishActivation } from './task-finish-activation.mjs';
import { resolveTaskFinishDeliveryRemote } from './task-finish-delivery-remote.mjs';
import { acquireFinishTargetLease, readFinishCompletion, releaseFinishTargetLease, writeFinishCompletion } from './task-finish-run.mjs';
import { TASK_FINISH_RAW_COMMAND_OUTPUT } from './execution-record.mjs';
import { legacyTaskFinishDeliveryCommit, publicTaskFinishDeliveryCommit } from './task-finish-delivery-commit.mjs';
import { classifyFinalDoctorResult } from '../../infrastructure/final-doctor-process.mjs';
import {
  adoptAgentReviewedGitCarrier,
  createGitNoContributionProof,
  createIsolatedGitCarrier,
  inspectAgentReviewedZeroDeltaContainment,
  inspectGitCarrierContainment,
  observeGitTaskContribution,
  removeIsolatedGitCarrier,
  verifyGitTaskContributionCarrier,
} from './git-task-contribution.mjs';
import { taskFinishCarrierSetIdentity, taskFinishDeliverySetIdentity } from './task-finish-repository-set.mjs';

const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
const REMOTE_READBACK_ATTEMPTS = 3;

function digest(value) {
  return `sha256-${crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex')}`;
}

function remoteReadback(root, remote, branch, operations) {
  let observed = null;
  for (let attempt = 1; attempt <= REMOTE_READBACK_ATTEMPTS; attempt += 1) {
    const id = attempt === 1 ? 'deliver-target-readback' : `deliver-target-readback-${attempt}`;
    observed = git(root, id, ['ls-remote', '--heads', remote, branch]);
    operations.push(observed.observation);
    if (observed.result.status === 0) break;
    if (attempt < REMOTE_READBACK_ATTEMPTS) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
  }
  return observed;
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

function deliveryCarrier(run, isolated, { reuseMode, status = 'prepared', activationPlan = null, repository = null }) {
  const deliveryCommit = isolated.deliveryCommit || publicTaskFinishDeliveryCommit(run.deliveryCommit || legacyTaskFinishDeliveryCommit(run.identity.task));
  const activationPaths = isolated.activationPaths || isolated.changedPaths || [];
  const carrier = {
    identity: digest({ selector: repository?.selector || 'workspace', head: isolated.head, tree: isolated.tree, expectedTargetRef: isolated.deliveryBaseline.head, taskContributionIdentity: isolated.taskContribution.identity, handoffIdentity: run.identity.handoffIdentity, candidateIdentity: run.identity.candidateIdentity, contentTargetIdentity: run.identity.contentTargetIdentity, deliveryCommitIdentity: deliveryCommit?.identity || null, reuseMode, zeroDelta: isolated.zeroDelta === true, activationPaths, activationPlanIdentity: activationPlan?.identity || null }),
    status,
    reuseMode,
    kind: 'git-isolated-commit',
    root: isolated.root,
    head: isolated.head,
    tree: isolated.tree,
    branch: null,
    expectedTargetRef: isolated.deliveryBaseline.head,
    targetRef: `${repository?.remote || run.identity.remote}/${repository?.targetBranch || run.identity.targetBranch}`,
    repositorySelector: repository?.selector || 'workspace',
    changedPaths: isolated.changedPaths,
    changes: isolated.changes || [],
    activationPaths,
    zeroDelta: isolated.zeroDelta === true,
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
  let result;
  try {
    result = spawnSync(command, args, {
      cwd,
      encoding: 'utf8',
      maxBuffer: MAX_OUTPUT_BYTES,
      env: options.env || { ...process.env, PATH: runtimePath },
    });
  } catch (error) {
    result = { status: null, signal: null, error, stdout: '', stderr: '' };
  }
  const normalized = {
    status: Number.isInteger(result.status) ? result.status : 1,
    signal: result.signal || null,
    errorCode: result.error?.code || (result.error ? 'spawn_failed' : null),
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

async function cleanupThroughRetainedController(runtime, context, run, deliveries, integratedContributions) {
  if (typeof runtime.cleanupTaskEnvironmentThroughRetainedController === 'function') {
    const deliveredRepositories = (run.repositories || []).filter((repository) => repository.deliveryCarrier?.head);
    return {
      payload: await runtime.cleanupTaskEnvironmentThroughRetainedController(run.identity.workspaceRoot, run.identity.task, {
        runId: run.runId,
        deliveries,
        candidateRef: run.delivery?.carrierRef || (deliveredRepositories.length === 1 ? deliveredRepositories[0].deliveryCarrier.head : taskFinishDeliverySetIdentity(run.repositories)),
        integratedContributions,
      }),
      observation: null,
    };
  }
  const invocation = context.controllerInvocation;
  if (!invocation?.command || !Array.isArray(invocation.argsPrefix)) return { payload: null, observation: null };
  const executed = runJsonCommand('cleanup-retained-environment-manager', invocation.command, [
    ...invocation.argsPrefix,
    '__internal', 'task-finish-retained-cleanup',
    '--run', run.runId,
    '--target', run.identity.workspaceRoot,
  ], run.identity.workspaceRoot, { env: { ...process.env, BUILDR_INTERNAL_PRODUCT_REENTRY: '1' } });
  return { payload: executed.payload, observation: executed.observation, result: executed.result };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function repositoryPlan(run, selector) {
  return (run.identity.repositories || []).find((repository) => repository.selector === selector) || null;
}

function repositoryState(run, selector) {
  return (run.repositories || []).find((repository) => repository.selector === selector) || null;
}

function currentRepositoryContribution(plan, state) {
  const observed = observeGitTaskContribution({
    root: plan.taskRoot,
    deliveryBaselineHead: state.taskContribution.originalBaseline.head,
  });
  return {
    observed,
    current: observed.identity === state.taskContribution.identity
      && observed.source.head === state.taskContribution.source.head
      && observed.source.tree === state.taskContribution.source.tree,
  };
}

function repositoryActivationPlan(run, plan, changedPaths) {
  return plan.selector === 'workspace'
    ? planRetainedTaskFinishActivation({ agent: run.identity.agent, changedPaths })
    : planRetainedTaskFinishActivation({ agent: run.identity.agent, changedPaths: [] });
}

function repositoryEquivalence(run, plan, carrier) {
  return {
    status: 'equivalent',
    selector: plan.selector,
    reuseMode: carrier.reuseMode,
    semanticEquivalence: carrier.reuseMode === 'deterministic-reuse' ? 'deterministic-git-identity' : 'agent-reviewed-not-proven-by-buildr',
    handoffIdentity: run.identity.handoffIdentity,
    candidateIdentity: run.identity.candidateIdentity,
    candidateGeneration: run.identity.candidateGeneration,
    contentTargetIdentity: run.identity.contentTargetIdentity,
    taskContributionIdentity: carrier.taskContribution.identity,
    deliveryBaselineIdentity: digest(carrier.deliveryBaseline),
    carrierIdentity: carrier.identity,
    formalVerificationExecutions: 0,
  };
}

function multiFailure(operation, code, message, selector, extra = {}) {
  return { operation, failureClass: 'transient-external-condition', code, message, findings: [{ selector }, ...(extra.findings || [])], ...extra };
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

function gitOk(root, args) {
  return spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: MAX_OUTPUT_BYTES }).status === 0;
}

function observeRetainedRemoteAlignment({ root, remote, targetBranch, head }) {
  const observed = spawnSync('git', ['ls-remote', '--heads', remote, targetBranch], { cwd: root, encoding: 'utf8', maxBuffer: MAX_OUTPUT_BYTES });
  if (observed.status !== 0) {
    return finding('retained-remote-alignment', 'error', 'task-finish.target-observation-failed', 'Unable to observe remote target ref.', {
      failureClass: 'transient-external-condition',
      exitCode: Number.isInteger(observed.status) ? observed.status : 1,
    });
  }
  const observedTargetRef = String(observed.stdout || '').trim().split(/\s+/)[0] || null;
  if (!observedTargetRef) {
    return finding('retained-remote-alignment', 'error', 'task-finish.target-ref-missing', `Target ref is unavailable: ${remote}/${targetBranch}.`, {
      failureClass: 'transient-external-condition',
    });
  }
  if (head === observedTargetRef) {
    return finding('retained-remote-alignment', 'ok', 'task-finish.retained-remote-aligned', `Retained HEAD equals observed remote ${remote}/${targetBranch}.`, { observedTargetRef });
  }
  if (!gitOk(root, ['cat-file', '-e', `${observedTargetRef}^{commit}`]) || gitOk(root, ['merge-base', '--is-ancestor', head, observedTargetRef])) {
    return finding('retained-remote-alignment', 'error', 'task-finish.retained-workspace-behind', 'Retained Workspace is behind the observed remote target ref.', {
      failureClass: 'transient-external-condition',
      observedTargetRef,
      head,
    });
  }
  if (gitOk(root, ['merge-base', '--is-ancestor', observedTargetRef, head])) {
    return finding('retained-remote-alignment', 'error', 'task-finish.retained-workspace-not-ready', 'Retained Workspace HEAD is not the observed remote target ref.', {
      failureClass: 'transient-external-condition',
      observedTargetRef,
      head,
    });
  }
  return finding('retained-remote-alignment', 'error', 'task-finish.retained-workspace-diverged', 'Retained Workspace and the observed remote target ref have diverged.', {
    failureClass: 'transient-external-condition',
    observedTargetRef,
    head,
  });
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

function createLegacyTaskFinishProductHandlers({ runtime, root, acceptZeroDeltaAdaptation = false }) {
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

  return {
    async preflight({ run }) {
      const checks = [];
      const context = taskEnvironment(run);
      if (!context?.ready) checks.push(finding('environment-context', 'error', context?.blocked?.code || 'task-finish.not-task-environment', context?.blocked?.message || 'Task Finish requires a ready Task Environment.'));
      else checks.push(finding('environment-context', 'ok', 'task-finish.environment-ready', 'Task Environment binding is ready.'));

      const development = developmentCarrier(run);
      if (!development.matches) checks.push(finding('development-handoff', 'error', 'task-finish.development-handoff-not-current', 'Formal Development handoff is missing, stale, or does not match this run.', { failureClass: 'upstream-candidate-defect' }));
      else checks.push(finding('development-handoff', 'ok', 'task-finish.development-handoff-current', `Development handoff ${run.identity.handoffIdentity} is current.`));

      const taskIdentity = currentGitIdentity(environmentRoot);
      if (!taskIdentity.head || !taskIdentity.tree || !taskIdentity.branch) checks.push(finding('delivery-adapter', 'error', 'task-finish.git-carrier-unavailable', 'The current Finish adapter requires a readable Git delivery carrier.'));
      else if (context?.repositories?.[0]?.branch && taskIdentity.branch !== context.repositories[0].branch) checks.push(finding('delivery-adapter', 'error', 'task-finish.task-branch-mismatch', 'Task branch does not match the Environment Receipt.'));
      else checks.push(finding('delivery-adapter', 'ok', 'task-finish.git-carrier-ready', `Git carrier branch ${taskIdentity.branch} is available.`));

      const retainedIdentity = currentGitIdentity(run.identity.workspaceRoot);
      const retainedReadiness = retainedWorkspaceReadiness(retainedIdentity);
      if (!retainedIdentity.head || retainedIdentity.branch !== run.identity.targetBranch) checks.push(finding('retained-workspace', 'error', 'task-finish.retained-target-mismatch', `Retained Workspace must be on target branch ${run.identity.targetBranch}.`, { failureClass: 'transient-external-condition' }));
      else if (!retainedReadiness.ready) checks.push(finding('retained-workspace', 'error', 'task-finish.retained-workspace-dirty', 'Retained Workspace has unrelated uncommitted changes.', {
        failureClass: 'transient-external-condition',
        unrelated: retainedReadiness.unrelated,
        unrelatedPaths: retainedReadiness.unrelated.filter((item) => item !== 'git-status-unavailable'),
      }));
      else checks.push(finding('retained-workspace', 'ok', 'task-finish.retained-workspace-ready', 'Retained Workspace is ready for target transition.', { workspaceMetadata: retainedReadiness.workspaceMetadata }));

      let deliveryRemoteReady = false;
      if (!run.identity.remote) checks.push(finding('delivery-remote', 'error', 'task-finish.delivery-remote-missing', 'Task Finish run is not bound to a retained Workspace delivery remote.'));
      else {
        try {
          const resolved = resolveTaskFinishDeliveryRemote({ root: run.identity.workspaceRoot, targetBranch: run.identity.targetBranch, requestedRemote: run.identity.remote });
          checks.push(finding('delivery-remote', 'ok', 'task-finish.delivery-remote-ready', `Delivery remote ${resolved.remote} is configured in the retained Workspace.`));
          deliveryRemoteReady = true;
        } catch (error) {
          checks.push(finding('delivery-remote', 'error', 'task-finish.delivery-remote-unavailable', error.message, { failureClass: 'transient-external-condition', details: error.details }));
        }
      }
      if (deliveryRemoteReady && retainedIdentity.head && retainedIdentity.branch === run.identity.targetBranch) {
        checks.push(observeRetainedRemoteAlignment({
          root: run.identity.workspaceRoot,
          remote: run.identity.remote,
          targetBranch: run.identity.targetBranch,
          head: retainedIdentity.head,
        }));
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
        const adopted = adoptAgentReviewedGitCarrier({ repositoryRoot: environmentRoot, carrier: run.deliveryCarrier, acceptZeroDelta: acceptZeroDeltaAdaptation });
        if (adopted.status !== 'adopted') return { status: 'blocked', operations, failure: { operation: 'delivery-adaptation', failureClass: 'semantic-review-required', code: adopted.code || 'task-finish.delivery-adaptation-required', message: 'Delivery Adaptation is not ready for deterministic verification.', findings: [adopted] }, output: { deliveryCarrier: run.deliveryCarrier } };
        const isolated = { ...run.deliveryCarrier, ...adopted, taskContribution: run.deliveryCarrier.taskContribution, deliveryBaseline: run.deliveryCarrier.deliveryBaseline };
        const plan = activationPlan(run, isolated.activationPaths || isolated.changedPaths || run.deliveryCarrier.changedPaths || []);
        const carrier = deliveryCarrier(run, isolated, { reuseMode: 'agent-reviewed-delivery-adaptation', activationPlan: plan });
        const compatibilityChecks = typeof runtime.runTaskFinishCarrierCompatibility === 'function'
          ? await runtime.runTaskFinishCarrierCompatibility({ task: run.identity.task, carrier, handoffIdentity: run.identity.handoffIdentity, candidateIdentity: run.identity.candidateIdentity })
          : { status: 'not-required', checks: [], basis: 'The current Project adapter declares no carrier-specific compatibility checks.' };
        if (!['passed', 'not-required'].includes(compatibilityChecks?.status)) return { status: 'blocked', operations, failure: { operation: 'carrier-compatibility', failureClass: 'semantic-review-required', code: 'task-finish.compatibility-checks-failed', message: 'Project-required Delivery Carrier compatibility checks did not pass.', findings: [compatibilityChecks] }, output: { deliveryCarrier: run.deliveryCarrier } };
        carrier.adaptation = { status: 'agent-reviewed', zeroDelta: carrier.zeroDelta, compatibilityChecks };
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
        const plan = activationPlan(run, isolated.activationPaths || isolated.changedPaths || []);
        const carrier = deliveryCarrier(run, isolated, { reuseMode: 'adaptation-required', status: 'blocked', activationPlan: plan });
        carrier.adaptationGuidance = { preparationHints: context.preparationHints || { schemaVersion: 'buildr.task-finish-preparation-hints/v1', steps: [], unavailable: [] } };
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
      const plan = activationPlan(run, isolated.activationPaths || isolated.changedPaths || []);
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
        const zeroDeltaContainment = run.deliveryCarrier.zeroDelta === true
          && observedTargetRef === run.deliveryCarrier.expectedTargetRef
          && observedTargetRef === run.deliveryCarrier.head
          ? inspectAgentReviewedZeroDeltaContainment({ repositoryRoot: retainedRoot, targetRef: observedTargetRef, carrier: run.deliveryCarrier, runId: run.runId })
          : null;
        if (zeroDeltaContainment && zeroDeltaContainment.status !== 'contained') {
          return {
            status: 'blocked',
            operations,
            failure: {
              operation: 'carrier-containment',
              failureClass: 'semantic-review-required',
              code: zeroDeltaContainment.code,
              message: 'Agent-reviewed zero-delta Delivery Carrier containment cannot be reconstructed.',
              findings: [zeroDeltaContainment],
            },
          };
        }
        let alreadyContained = zeroDeltaContainment?.status === 'contained';
        let containment = zeroDeltaContainment;
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

        const readback = remoteReadback(retainedRoot, run.identity.remote, run.identity.targetBranch, operations);
        if (readback.result.status !== 0) return { status: 'blocked', operations, failure: { operation: 'target-readback', failureClass: 'transient-external-condition', code: 'task-finish.remote-readback-failed', exitCode: readback.result.status, message: 'Unable to read back the remote target ref after delivery.', diagnostic: readback.observation.stderr } };
        const remoteAfterRef = readback.result.stdout.trim().split(/\s+/)[0] || null;
        const expectedRemoteAfterRef = alreadyContained ? observedTargetRef : run.deliveryCarrier.head;
        if (remoteAfterRef !== expectedRemoteAfterRef) return { status: 'blocked', operations, failure: { operation: 'target-transition', failureClass: 'transient-external-condition', code: 'task-finish.target-race', message: 'Remote target ref changed after delivery evidence was established; delivery remains blocked without Candidate applicability claims.', findings: [{ expected: expectedRemoteAfterRef, observed: remoteAfterRef }] }, output: { delivery: { status: 'blocked', expectedTargetRef: run.deliveryCarrier.expectedTargetRef, observedTargetRef, carrierRef: run.deliveryCarrier.head } } };

        const context = taskEnvironment(run);
        if (!context?.ready) return { status: 'blocked', operations, failure: { operation: 'retained-controller', failureClass: 'transient-external-condition', code: context?.blocked?.code || 'task-finish.retained-controller-unavailable', message: context?.blocked?.message || 'Retained Environment controller is unavailable.' } };
        const plan = run.deliveryCarrier.activationPlan || activationPlan(run, run.deliveryCarrier.activationPaths || run.deliveryCarrier.changedPaths || []);
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

function createRepositorySetTaskFinishProductHandlers({ runtime, acceptZeroDeltaAdaptation = false }) {
  function taskEnvironment(run) {
    return runtime.resolveTaskEnvironmentExecution(run.identity.workspaceRoot, run.identity.task);
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
    const assertion = runtime.assertTaskDevelopmentCarrier(run.identity.workspaceRoot, run.identity.task, frozenDevelopmentIdentity(run));
    const receipt = assertion.development?.receipt || null;
    const handoff = assertion.status === 'equivalent'
      ? run.developmentHandoff || receipt?.handoffs?.find((item) => item.identity === run.identity.handoffIdentity) || null
      : null;
    return { assertion, handoff, matches: assertion.status === 'equivalent' };
  }

  function assertRepositoryContext(run, context, checks) {
    const current = new Map((context?.repositories || []).map((repository) => [repository.selector, repository]));
    for (const plan of run.identity.repositories) {
      const repository = current.get(plan.selector);
      if (!repository
        || !sameFilesystemPath(repository.checkoutPath, plan.taskRoot)
        || !sameFilesystemPath(repository.sourceRepository, plan.retainedRoot)
        || repository.branch !== plan.environmentBranch) {
        checks.push(finding('repository-context', 'error', 'task-finish.repository-context-mismatch', `Environment repository identity changed: ${plan.selector}.`, { selector: plan.selector }));
      }
    }
  }

  async function preflight({ run }) {
    const checks = [];
    const context = taskEnvironment(run);
    if (!context?.ready) checks.push(finding('environment-context', 'error', context?.blocked?.code || 'task-finish.not-task-environment', context?.blocked?.message || 'Task Finish requires a ready Task Environment.'));
    else {
      checks.push(finding('environment-context', 'ok', 'task-finish.environment-ready', 'Task Environment binding is ready.'));
      assertRepositoryContext(run, context, checks);
    }

    const development = developmentCarrier(run);
    if (!development.matches) checks.push(finding('development-handoff', 'error', 'task-finish.development-handoff-not-current', 'Formal Development handoff is missing, stale, or does not match this run.', { failureClass: 'upstream-candidate-defect' }));
    else checks.push(finding('development-handoff', 'ok', 'task-finish.development-handoff-current', `Development handoff ${run.identity.handoffIdentity} is current.`));

    for (const plan of run.identity.repositories) {
      const state = repositoryState(run, plan.selector);
      const taskIdentity = currentGitIdentity(plan.taskRoot);
      if (!taskIdentity.head || !taskIdentity.tree || taskIdentity.branch !== plan.environmentBranch) {
        checks.push(finding('repository-task-source', 'error', 'task-finish.task-branch-mismatch', `Task repository is unavailable or changed: ${plan.selector}.`, { selector: plan.selector }));
        continue;
      }
      const contribution = currentRepositoryContribution(plan, state);
      if (!contribution.current) {
        checks.push(finding('repository-task-contribution', 'error', 'task-finish.task-contribution-drift-unresolved', `Task Contribution changed: ${plan.selector}.`, { selector: plan.selector, failureClass: 'upstream-candidate-defect' }));
        continue;
      }
      if (plan.disposition === 'not-applicable') {
        checks.push(finding('repository-task-contribution', 'ok', 'task-finish.repository-no-contribution', `Repository has no Task Contribution: ${plan.selector}.`, { selector: plan.selector }));
        continue;
      }
      const retainedIdentity = currentGitIdentity(plan.retainedRoot);
      const readiness = retainedWorkspaceReadiness(retainedIdentity);
      if (!retainedIdentity.head || retainedIdentity.branch !== plan.targetBranch) {
        checks.push(finding('repository-retained', 'error', 'task-finish.retained-target-mismatch', `Retained repository must be on ${plan.targetBranch}: ${plan.selector}.`, { selector: plan.selector, failureClass: 'transient-external-condition' }));
      } else if (!readiness.ready) {
        checks.push(finding('repository-retained', 'error', 'task-finish.retained-workspace-dirty', `Retained repository has unrelated changes: ${plan.selector}.`, { selector: plan.selector, failureClass: 'transient-external-condition', unrelated: readiness.unrelated }));
      } else checks.push(finding('repository-retained', 'ok', 'task-finish.retained-workspace-ready', `Retained repository is ready: ${plan.selector}.`, { selector: plan.selector }));
      try {
        resolveTaskFinishDeliveryRemote({ root: plan.retainedRoot, targetBranch: plan.targetBranch, requestedRemote: plan.remote });
        checks.push(finding('repository-remote', 'ok', 'task-finish.delivery-remote-ready', `Delivery remote is ready: ${plan.selector}.`, { selector: plan.selector, remote: plan.remote }));
        if (retainedIdentity.head && retainedIdentity.branch === plan.targetBranch) {
          checks.push(observeRetainedRemoteAlignment({ root: plan.retainedRoot, remote: plan.remote, targetBranch: plan.targetBranch, head: retainedIdentity.head }));
        }
      } catch (error) {
        checks.push(finding('repository-remote', 'error', 'task-finish.delivery-remote-unavailable', error.message, { selector: plan.selector, failureClass: 'transient-external-condition', details: error.details }));
      }
    }

    const deliveryCommit = run.deliveryCommit || legacyTaskFinishDeliveryCommit(run.identity.task);
    if (run.identity.deliveryCommitIdentity && (!run.deliveryCommit || run.identity.deliveryCommitIdentity !== run.deliveryCommit.identity)) {
      checks.push(finding('delivery-commit', 'error', 'task-finish.commit-message-mismatch', 'Frozen Task Finish delivery commit facts do not match the run identity.'));
    } else checks.push(finding('delivery-commit', 'ok', run.deliveryCommit ? 'task-finish.delivery-commit-frozen' : 'task-finish.delivery-commit-legacy', `Delivery commit ${deliveryCommit.subject} is frozen for contributing repositories.`));

    const errors = checks.filter((item) => item.severity === 'error');
    if (errors.length) {
      const transientOnly = errors.every((item) => item.failureClass === 'transient-external-condition');
      return { status: transientOnly ? 'blocked' : 'failed', checks, failure: phaseFailure(checks, transientOnly ? 'transient-external-condition' : 'product-execution-failure') };
    }
    return { status: 'passed', checks, inputIdentity: run.identity.handoffIdentity, outputIdentity: digest(checks) };
  }

  async function prepare({ run }) {
    const operations = [];
    if (!developmentCarrier(run).matches) return { status: 'failed', failure: { operation: 'development-handoff', failureClass: 'upstream-candidate-defect', code: 'task-finish.development-handoff-not-current', message: 'Development handoff changed before repository carrier preparation.' } };
    const context = taskEnvironment(run);
    if (!context?.ready) return { status: 'blocked', failure: { operation: 'environment-context', failureClass: 'transient-external-condition', code: context?.blocked?.code || 'task-finish.environment-not-ready', message: context?.blocked?.message || 'Task Environment is not ready.' } };
    const repositories = clone(run.repositories);

    for (const plan of run.identity.repositories) {
      const state = repositories.find((repository) => repository.selector === plan.selector);
      const contribution = currentRepositoryContribution(plan, state);
      if (!contribution.current) return { status: 'failed', operations, failure: { operation: 'task-contribution', failureClass: 'upstream-candidate-defect', code: 'task-finish.task-contribution-drift-unresolved', message: `Task Contribution changed before prepare: ${plan.selector}.` }, output: { repositories } };
      if (plan.disposition === 'not-applicable') continue;
      if (state.delivery?.status === 'delivered') continue;

      const fetched = git(plan.taskRoot, `prepare-target-fetch:${plan.selector}`, ['fetch', plan.remote, plan.targetBranch]);
      operations.push(fetched.observation);
      if (fetched.result.status !== 0) return { status: 'blocked', operations, failure: multiFailure('target-fetch', 'task-finish.target-fetch-failed', `Unable to fetch target for ${plan.selector}.`, plan.selector, { exitCode: fetched.result.status, diagnostic: fetched.observation.stderr }), output: { repositories } };
      const expectedTargetRef = gitText(plan.taskRoot, ['rev-parse', `${plan.remote}/${plan.targetBranch}^{commit}`]);
      if (!expectedTargetRef) return { status: 'blocked', operations, failure: multiFailure('target-observation', 'task-finish.target-ref-missing', `Target ref is unavailable for ${plan.selector}.`, plan.selector), output: { repositories } };

      if (state.deliveryCarrier?.reuseMode === 'adaptation-required') {
        if (state.deliveryCarrier.deliveryBaseline?.head !== expectedTargetRef) return { status: 'blocked', operations, failure: multiFailure('delivery-baseline', 'task-finish.target-race', `Delivery Baseline changed for ${plan.selector}.`, plan.selector, { findings: [{ expected: state.deliveryCarrier.deliveryBaseline?.head, observed: expectedTargetRef }] }), output: { repositories } };
        const adopted = adoptAgentReviewedGitCarrier({ repositoryRoot: plan.taskRoot, carrier: state.deliveryCarrier, acceptZeroDelta: acceptZeroDeltaAdaptation });
        if (adopted.status !== 'adopted') return { status: 'blocked', operations, failure: { operation: 'delivery-adaptation', failureClass: 'semantic-review-required', code: adopted.code || 'task-finish.delivery-adaptation-required', message: `Delivery Adaptation is not ready: ${plan.selector}.`, findings: [{ selector: plan.selector }, adopted] }, output: { repositories } };
        const isolated = { ...state.deliveryCarrier, ...adopted, taskContribution: state.deliveryCarrier.taskContribution, deliveryBaseline: state.deliveryCarrier.deliveryBaseline };
        const activationPlan = repositoryActivationPlan(run, plan, isolated.activationPaths || isolated.changedPaths || []);
        const carrier = deliveryCarrier(run, isolated, { reuseMode: 'agent-reviewed-delivery-adaptation', activationPlan, repository: plan });
        const compatibilityChecks = typeof runtime.runTaskFinishCarrierCompatibility === 'function'
          ? await runtime.runTaskFinishCarrierCompatibility({ task: run.identity.task, repository: plan.selector, carrier, handoffIdentity: run.identity.handoffIdentity, candidateIdentity: run.identity.candidateIdentity })
          : { status: 'not-required', checks: [], basis: 'The current Project adapter declares no carrier-specific compatibility checks.' };
        if (!['passed', 'not-required'].includes(compatibilityChecks?.status)) return { status: 'blocked', operations, failure: { operation: 'carrier-compatibility', failureClass: 'semantic-review-required', code: 'task-finish.compatibility-checks-failed', message: `Carrier compatibility checks failed: ${plan.selector}.`, findings: [{ selector: plan.selector }, compatibilityChecks] }, output: { repositories } };
        carrier.adaptation = { status: 'agent-reviewed', zeroDelta: carrier.zeroDelta, compatibilityChecks };
        state.deliveryCarrier = carrier;
        operations.push({ kind: 'product', id: 'adopt-agent-reviewed-delivery-carrier', selector: plan.selector, status: 'passed', carrierRoot: carrier.root });
        continue;
      }

      let isolated;
      try {
        isolated = createIsolatedGitCarrier({
          repositoryRoot: plan.taskRoot,
          workspaceRoot: run.identity.workspaceRoot,
          runId: run.runId,
          repositorySelector: plan.selector,
          deliveryBaselineHead: expectedTargetRef,
          taskContribution: state.taskContribution,
          deliveryCommit: run.deliveryCommit || legacyTaskFinishDeliveryCommit(run.identity.task),
        });
      } catch (error) {
        operations.push({ kind: 'product', id: 'prepare-isolated-carrier', selector: plan.selector, status: 'failed', code: error.code || 'task-finish.carrier-prepare-failed' });
        return { status: 'failed', operations, failure: { operation: 'carrier-preparation', failureClass: 'product-execution-failure', code: error.code || 'task-finish.carrier-prepare-failed', message: error.message, findings: [{ selector: plan.selector }], diagnostic: error.details || error.cleanup || null }, output: { repositories } };
      }
      const activationPlan = repositoryActivationPlan(run, plan, isolated.activationPaths || isolated.changedPaths || []);
      if (isolated.status === 'adaptation-required') {
        const carrier = deliveryCarrier(run, isolated, { reuseMode: 'adaptation-required', status: 'blocked', activationPlan, repository: plan });
        carrier.adaptationGuidance = { preparationHints: context.preparationHints || { schemaVersion: 'buildr.task-finish-preparation-hints/v1', steps: [], unavailable: [] } };
        state.deliveryCarrier = carrier;
        operations.push({ kind: 'product', id: 'prepare-isolated-carrier', selector: plan.selector, status: 'blocked', code: isolated.conflict.code, carrierRoot: isolated.root });
        return { status: 'blocked', operations, inputIdentity: run.identity.handoffIdentity, outputIdentity: carrier.identity, failure: { operation: 'delivery-adaptation', failureClass: 'semantic-review-required', code: 'task-finish.delivery-adaptation-required', message: `Task Contribution requires Delivery Adaptation: ${plan.selector}.`, findings: [{ selector: plan.selector }], diagnostic: isolated.conflict }, output: { repositories } };
      }
      state.deliveryCarrier = deliveryCarrier(run, isolated, { reuseMode: 'deterministic-reuse', activationPlan, repository: plan });
      operations.push({ kind: 'product', id: 'prepare-isolated-carrier', selector: plan.selector, status: 'passed', carrierRoot: isolated.root });
    }
    if (!developmentCarrier(run).matches) return { status: 'failed', operations, failure: { operation: 'carrier-equivalence', failureClass: 'upstream-candidate-defect', code: 'task-finish.carrier-not-equivalent', message: 'Development handoff changed during repository carrier preparation.' }, output: { repositories } };
    return { status: 'passed', operations, inputIdentity: run.identity.handoffIdentity, outputIdentity: taskFinishCarrierSetIdentity(repositories) || run.identity.repositorySetIdentity, output: { repositories } };
  }

  async function verify({ run }) {
    const repositories = clone(run.repositories);
    for (const plan of run.identity.repositories.filter((repository) => repository.disposition === 'applicable')) {
      const state = repositories.find((repository) => repository.selector === plan.selector);
      const observed = verifyGitTaskContributionCarrier({ repositoryRoot: plan.taskRoot, carrier: state.deliveryCarrier });
      if (observed.status !== 'equivalent') return { status: 'blocked', failure: { operation: 'carrier-verification', failureClass: 'semantic-review-required', code: observed.code || 'task-finish.carrier-changed', message: `Delivery Carrier facts cannot be verified: ${plan.selector}.`, findings: [{ selector: plan.selector }, observed] }, output: { repositories } };
      state.equivalence = repositoryEquivalence(run, plan, state.deliveryCarrier);
    }
    if (!developmentCarrier(run).matches) return { status: 'failed', failure: { operation: 'carrier-equivalence', failureClass: 'upstream-candidate-defect', code: 'task-finish.carrier-not-equivalent', message: 'Repository carriers are no longer equivalent to the Development handoff.' }, output: { repositories } };
    return { status: 'passed', inputIdentity: taskFinishCarrierSetIdentity(repositories), outputIdentity: digest(repositories.map((repository) => repository.equivalence?.carrierIdentity || repository.disposition)), output: { repositories } };
  }

  function observeDeliveredRepository(plan, state, operations) {
    const remote = git(plan.retainedRoot, `deliver-target-observe:${plan.selector}`, ['ls-remote', '--heads', plan.remote, plan.targetBranch]);
    operations.push(remote.observation);
    if (remote.result.status !== 0) return { status: 'blocked', failure: multiFailure('target-observation', 'task-finish.target-observation-failed', `Unable to observe remote target: ${plan.selector}.`, plan.selector, { exitCode: remote.result.status, diagnostic: remote.observation.stderr }) };
    const observedTargetRef = remote.result.stdout.trim().split(/\s+/)[0] || null;
    if (state.delivery?.finalRemoteRef && observedTargetRef === state.delivery.finalRemoteRef) return { status: 'contained', observedTargetRef, containment: state.delivery.containment || null };
    const fetched = git(plan.retainedRoot, `deliver-contained-target-fetch:${plan.selector}`, ['fetch', plan.remote, plan.targetBranch]);
    operations.push(fetched.observation);
    const fetchedTargetRef = fetched.result.status === 0 ? gitText(plan.retainedRoot, ['rev-parse', `${plan.remote}/${plan.targetBranch}^{commit}`]) : null;
    const containment = fetchedTargetRef === observedTargetRef
      ? inspectGitCarrierContainment({ repositoryRoot: plan.retainedRoot, targetRef: observedTargetRef, carrier: state.deliveryCarrier })
      : { status: 'unprovable', code: 'task-finish.containment-target-race', observedTargetRef, fetchedTargetRef };
    return containment.status === 'contained'
      ? { status: 'contained', observedTargetRef, containment }
      : { status: 'blocked', failure: multiFailure('carrier-containment', 'task-finish.target-race', `Delivered repository is no longer provably contained: ${plan.selector}.`, plan.selector, { findings: [containment] }) };
  }

  async function deliver({ run, checkpoint }) {
    const operations = [];
    const repositories = clone(run.repositories);
    if (!developmentCarrier(run).matches) return { status: 'failed', failure: { operation: 'carrier-equivalence', failureClass: 'upstream-candidate-defect', code: 'task-finish.carrier-not-equivalent', message: 'Development handoff is no longer current before delivery.' }, output: { repositories } };
    for (const plan of run.identity.repositories.filter((repository) => repository.disposition === 'applicable')) {
      const state = repositories.find((repository) => repository.selector === plan.selector);
      const verified = verifyGitTaskContributionCarrier({ repositoryRoot: plan.taskRoot, carrier: state.deliveryCarrier });
      if (verified.status !== 'equivalent') return { status: 'blocked', operations, failure: { operation: 'carrier', failureClass: 'semantic-review-required', code: verified.code || 'task-finish.carrier-changed', message: `Delivery Carrier changed: ${plan.selector}.`, findings: [{ selector: plan.selector }, verified] }, output: { repositories } };

      if (state.delivery?.status === 'delivered') {
        const contained = observeDeliveredRepository(plan, state, operations);
        if (contained.status !== 'contained') return { status: 'blocked', operations, failure: contained.failure, output: { repositories } };
        state.delivery = { ...state.delivery, targetDisposition: 'already-contained', observedTargetRef: contained.observedTargetRef, finalRemoteRef: contained.observedTargetRef, remoteAfterRef: contained.observedTargetRef, containment: contained.containment };
        checkpoint?.({ output: { repositories }, outputIdentity: taskFinishDeliverySetIdentity(repositories) });
        continue;
      }

      const lease = acquireFinishTargetLease({ root: run.identity.workspaceRoot, runtime, targetIdentity: plan.leaseTargetIdentity, run });
      if (lease.blocked) return { status: 'blocked', operations, failure: multiFailure('target-lease', 'task-finish.target-lease-held', `Target lease is held: ${plan.selector}.`, plan.selector, { findings: [lease.existing] }), output: { repositories } };
      try {
        const remote = git(plan.retainedRoot, `deliver-target-observe:${plan.selector}`, ['ls-remote', '--heads', plan.remote, plan.targetBranch]);
        operations.push(remote.observation);
        if (remote.result.status !== 0) return { status: 'blocked', operations, failure: multiFailure('target-observation', 'task-finish.target-observation-failed', `Unable to observe remote target: ${plan.selector}.`, plan.selector, { exitCode: remote.result.status, diagnostic: remote.observation.stderr }), output: { repositories } };
        const observedTargetRef = remote.result.stdout.trim().split(/\s+/)[0] || null;
        const alreadyDelivered = observedTargetRef === state.deliveryCarrier.head;
        const zeroDeltaContainment = state.deliveryCarrier.zeroDelta === true
          && observedTargetRef === state.deliveryCarrier.expectedTargetRef
          && observedTargetRef === state.deliveryCarrier.head
          ? inspectAgentReviewedZeroDeltaContainment({ repositoryRoot: plan.retainedRoot, workspaceRoot: run.identity.workspaceRoot, targetRef: observedTargetRef, carrier: state.deliveryCarrier, runId: run.runId, repositorySelector: plan.selector })
          : null;
        if (zeroDeltaContainment && zeroDeltaContainment.status !== 'contained') return { status: 'blocked', operations, failure: { operation: 'carrier-containment', failureClass: 'semantic-review-required', code: zeroDeltaContainment.code, message: `Agent-reviewed zero-delta carrier containment cannot be reconstructed: ${plan.selector}.`, findings: [{ selector: plan.selector }, zeroDeltaContainment] }, output: { repositories } };
        let alreadyContained = zeroDeltaContainment?.status === 'contained';
        let containment = zeroDeltaContainment;
        if (!alreadyDelivered && observedTargetRef !== state.deliveryCarrier.expectedTargetRef) {
          const fetched = git(plan.retainedRoot, `deliver-contained-target-fetch:${plan.selector}`, ['fetch', plan.remote, plan.targetBranch]);
          operations.push(fetched.observation);
          const fetchedTargetRef = fetched.result.status === 0 ? gitText(plan.retainedRoot, ['rev-parse', `${plan.remote}/${plan.targetBranch}^{commit}`]) : null;
          containment = fetchedTargetRef === observedTargetRef
            ? inspectGitCarrierContainment({ repositoryRoot: plan.retainedRoot, targetRef: observedTargetRef, carrier: state.deliveryCarrier })
            : { status: 'unprovable', code: 'task-finish.containment-target-race', observedTargetRef, fetchedTargetRef };
          alreadyContained = containment.status === 'contained';
          if (!alreadyContained) return { status: 'blocked', operations, failure: multiFailure('target-transition', 'task-finish.target-race', `Target changed after carrier preparation: ${plan.selector}.`, plan.selector, { findings: [{ expected: state.deliveryCarrier.expectedTargetRef, observed: observedTargetRef }, containment] }), output: { repositories } };
        }
        if (!alreadyDelivered && !alreadyContained) {
          const retainedIdentity = currentGitIdentity(plan.retainedRoot);
          const readiness = retainedWorkspaceReadiness(retainedIdentity);
          if (retainedIdentity.branch !== plan.targetBranch || !readiness.ready || retainedIdentity.head !== observedTargetRef) return { status: 'blocked', operations, failure: multiFailure('retained-workspace', 'task-finish.retained-workspace-not-ready', `Retained repository is not ready: ${plan.selector}.`, plan.selector, { findings: [retainedIdentity] }), output: { repositories } };
          const merged = git(plan.retainedRoot, `deliver-fast-forward:${plan.selector}`, ['merge', '--ff-only', state.deliveryCarrier.head]);
          operations.push(merged.observation);
          if (merged.result.status !== 0) return { status: 'failed', operations, failure: { operation: 'target-transition', failureClass: 'product-execution-failure', code: 'task-finish.fast-forward-failed', exitCode: merged.result.status, message: `Carrier is not a fast-forward: ${plan.selector}.`, findings: [{ selector: plan.selector }], diagnostic: merged.observation.stderr }, output: { repositories } };
          const pushOperation = run.identity.repositories.length === 1 && plan.selector === 'workspace'
            ? 'deliver-push'
            : `deliver-push:${plan.selector}`;
          const pushed = git(plan.retainedRoot, pushOperation, ['push', plan.remote, `${plan.targetBranch}:${plan.targetBranch}`]);
          operations.push(pushed.observation);
          if (pushed.result.status !== 0) return { status: 'blocked', operations, failure: multiFailure('target-push', 'task-finish.push-failed', `Target push failed: ${plan.selector}.`, plan.selector, { exitCode: pushed.result.status, diagnostic: pushed.observation.stderr }), output: { repositories } };
        }
        const readback = remoteReadback(plan.retainedRoot, plan.remote, plan.targetBranch, operations);
        if (readback.result.status !== 0) return { status: 'blocked', operations, failure: multiFailure('target-readback', 'task-finish.remote-readback-failed', `Remote readback failed: ${plan.selector}.`, plan.selector, { exitCode: readback.result.status, diagnostic: readback.observation.stderr }), output: { repositories } };
        const remoteAfterRef = readback.result.stdout.trim().split(/\s+/)[0] || null;
        const expectedRemoteAfterRef = alreadyContained ? observedTargetRef : state.deliveryCarrier.head;
        if (remoteAfterRef !== expectedRemoteAfterRef) return { status: 'blocked', operations, failure: multiFailure('target-transition', 'task-finish.target-race', `Remote changed after delivery: ${plan.selector}.`, plan.selector, { findings: [{ expected: expectedRemoteAfterRef, observed: remoteAfterRef }] }), output: { repositories } };

        let activation = { status: 'not-applicable', plan: state.deliveryCarrier.activationPlan };
        let retainedDoctor = 'not-applicable';
        if (plan.selector === 'workspace') {
          const context = taskEnvironment(run);
          const activationPlan = state.deliveryCarrier.activationPlan || repositoryActivationPlan(run, plan, state.deliveryCarrier.activationPaths || state.deliveryCarrier.changedPaths || []);
          const beforeActivation = activationGitDelta(plan.retainedRoot);
          if (beforeActivation === null || beforeActivation.length) return { status: 'blocked', operations, failure: multiFailure('retained-activation', 'task-finish.activation-workspace-dirty', 'Retained Workspace is not ready for activation.', plan.selector, { findings: beforeActivation || [] }), output: { repositories } };
          if (activationPlan.mode === 'render-runtime') {
            const rendered = runThroughRetainedController(context, 'deliver-retained-render', ['render', run.identity.agent, '--target', plan.retainedRoot], plan.retainedRoot);
            if (!rendered || rendered.result.status !== 0) return { status: 'blocked', operations, failure: multiFailure('retained-render', 'task-finish.retained-render-failed', 'Retained Workspace runtime render failed.', plan.selector, { diagnostic: rendered?.observation?.stderr || null }), output: { repositories } };
            operations.push(rendered.observation);
          }
          const blockedDelivery = (doctorCode) => ({
            status: 'activation-blocked',
            selector: plan.selector,
            targetDisposition: alreadyContained ? 'already-contained' : 'carrier',
            expectedTargetRef: state.deliveryCarrier.expectedTargetRef,
            observedTargetRef,
            carrierRef: state.deliveryCarrier.head,
            remoteAfterRef,
            finalRemoteRef: remoteAfterRef,
            containment,
            activation: { status: 'blocked', plan: activationPlan, doctorCode },
            retainedDoctor: 'blocked',
            runtimeInstall: 'not-applicable',
            localAppDelivery: 'not-applicable',
          });
          const doctor = runThroughRetainedController(context, 'deliver-retained-doctor', ['doctor', '--agent', run.identity.agent, '--target', plan.retainedRoot, '--json', '--detail', 'compact'], plan.retainedRoot, { json: true });
          if (!doctor) {
            state.delivery = blockedDelivery('task-finish.retained-controller-unavailable');
            return { status: 'blocked', operations, failure: multiFailure('retained-doctor', 'task-finish.retained-controller-unavailable', 'Retained Environment controller is unavailable.', plan.selector), output: { repositories } };
          }
          operations.push(doctor.observation);
          const doctorProcess = classifyFinalDoctorResult(doctor.result);
          if (doctorProcess.status !== 'passed' || doctor.payload?.health?.ready !== true) {
            const doctorCode = doctorProcess.status === 'doctor-failed'
              ? 'task-finish.retained-doctor-failed'
              : doctorProcess.code === 'doctor.passed'
                ? 'task-finish.retained-doctor-not-ready'
                : doctorProcess.code;
            state.delivery = blockedDelivery(doctorCode);
            return { status: 'blocked', operations, failure: multiFailure('retained-doctor', doctorCode, doctorProcess.status === 'passed' ? 'Retained Workspace doctor is not ready.' : doctorProcess.message, plan.selector, { exitCode: doctor.result.status, diagnostic: doctor.payload?.findings || doctorProcess.diagnostic || doctor.observation.stderr }), output: { repositories } };
          }
          activation = { status: 'passed', plan: activationPlan };
          retainedDoctor = 'passed';
        }
        state.delivery = {
          status: 'delivered',
          selector: plan.selector,
          targetDisposition: alreadyContained ? 'already-contained' : 'carrier',
          expectedTargetRef: state.deliveryCarrier.expectedTargetRef,
          observedTargetRef,
          carrierRef: state.deliveryCarrier.head,
          remoteAfterRef,
          finalRemoteRef: remoteAfterRef,
          containment,
          activation,
          retainedDoctor,
          runtimeInstall: 'not-applicable',
          localAppDelivery: 'not-applicable',
        };
        checkpoint?.({ output: { repositories }, outputIdentity: taskFinishDeliverySetIdentity(repositories) });
      } finally {
        releaseFinishTargetLease(lease, { root: run.identity.workspaceRoot, runtime });
      }
    }
    const deliverySet = {
      status: 'delivered',
      repositorySetIdentity: run.identity.repositorySetIdentity,
      carrierSetIdentity: taskFinishCarrierSetIdentity(repositories),
      deliverySetIdentity: taskFinishDeliverySetIdentity(repositories),
      repositories: repositories.filter((repository) => repository.delivery).map((repository) => ({ selector: repository.selector, ...repository.delivery })),
    };
    const applicable = run.identity.repositories.filter((repository) => repository.disposition === 'applicable');
    const delivery = applicable.length === 1
      ? repositories.find((repository) => repository.selector === applicable[0].selector)?.delivery || null
      : deliverySet;
    return { status: 'passed', operations, inputIdentity: deliverySet.carrierSetIdentity, outputIdentity: deliverySet.deliverySetIdentity, output: { repositories, delivery } };
  }

  async function cleanup({ run }) {
    const operations = [];
    const repositories = clone(run.repositories);
    const applicable = run.identity.repositories.filter((repository) => repository.disposition === 'applicable');
    if (applicable.some((plan) => repositoryState(run, plan.selector)?.delivery?.status !== 'delivered')) return { status: 'blocked', failure: { operation: 'cleanup-readiness', failureClass: 'transient-external-condition', code: 'task-finish.delivery-not-complete', message: 'Cleanup requires completed delivery facts for every contributing repository.' }, output: { repositories } };
    const previousCompletion = readFinishCompletion({ root: run.identity.workspaceRoot, runId: run.runId, runtime });
    let association = previousCompletion?.association || null;
    if (!association) {
      const handoff = run.developmentHandoff || developmentCarrier(run).handoff;
      if (!handoff) return { status: 'blocked', failure: { operation: 'terminal-association', failureClass: 'product-execution-failure', code: 'task-finish.frozen-handoff-unavailable', message: 'Cannot persist terminal associations without the frozen Development handoff.' }, output: { repositories } };
      association = terminalAssociation(handoff, new Date().toISOString());
    }
    const deliveries = {};
    const integratedContributions = {};
    for (const plan of run.identity.repositories) {
      const state = repositories.find((repository) => repository.selector === plan.selector);
      if (plan.disposition === 'applicable') {
        deliveries[plan.selector] = state.delivery.finalRemoteRef;
        integratedContributions[plan.selector] = state.deliveryCarrier;
        continue;
      }
      const targetRef = gitText(plan.retainedRoot, ['rev-parse', `${plan.targetBranch}^{commit}`]);
      const noContribution = targetRef ? createGitNoContributionProof({ taskRoot: plan.taskRoot, targetRef, taskContribution: state.taskContribution }) : { status: 'stale', code: 'task-finish.no-contribution-target-unavailable' };
      if (noContribution.status !== 'equivalent') return { status: 'blocked', operations, failure: { operation: 'no-contribution-proof', failureClass: 'semantic-review-required', code: noContribution.code, message: `No-contribution cleanup proof cannot be formed: ${plan.selector}.`, findings: [{ selector: plan.selector }, noContribution] }, output: { repositories } };
      state.cleanupProof = noContribution.proof;
      deliveries[plan.selector] = targetRef;
      integratedContributions[plan.selector] = noContribution.proof;
    }
    const carrierSetIdentity = taskFinishCarrierSetIdentity(repositories);
    const deliverySetIdentity = taskFinishDeliverySetIdentity(repositories);
    const prepared = {
      schemaVersion: 'buildr.task-finish-completion/v2',
      runId: run.runId,
      task: run.identity.task,
      handoffIdentity: run.identity.handoffIdentity,
      candidateIdentity: run.identity.candidateIdentity,
      candidateGeneration: run.identity.candidateGeneration,
      contentTargetIdentity: run.identity.contentTargetIdentity,
      repositorySetIdentity: run.identity.repositorySetIdentity,
      carrierSetIdentity,
      deliverySetIdentity,
      repositories: run.identity.repositories.map((plan) => {
        const state = repositories.find((repository) => repository.selector === plan.selector);
        return { selector: plan.selector, disposition: plan.disposition, carrierIdentity: state.deliveryCarrier?.identity || null, carrierRef: state.deliveryCarrier?.head || null, finalRemoteRef: state.delivery?.finalRemoteRef || deliveries[plan.selector], taskContributionIdentity: state.taskContribution.identity };
      }),
      carrierIdentity: applicable.length === 1 ? repositoryState({ repositories }, applicable[0].selector)?.deliveryCarrier?.identity || null : null,
      carrierRef: applicable.length === 1 ? repositoryState({ repositories }, applicable[0].selector)?.deliveryCarrier?.head || null : null,
      finalRemoteRef: applicable.length === 1 ? repositoryState({ repositories }, applicable[0].selector)?.delivery?.finalRemoteRef || null : null,
      taskContributionIdentity: applicable.length === 1 ? repositoryState({ repositories }, applicable[0].selector)?.taskContribution?.identity || null : null,
      targetBranch: applicable.length === 1 ? applicable[0].targetBranch : null,
      status: 'prepared',
      preparedAt: new Date().toISOString(),
      association,
    };
    const completionFile = writeFinishCompletion({ root: run.identity.workspaceRoot, runId: run.runId, completion: prepared, runtime });
    let context = taskEnvironment(run);
    if (!context?.ready && typeof runtime.resolveTaskEnvironmentCleanupContext === 'function') context = runtime.resolveTaskEnvironmentCleanupContext(run.identity.workspaceRoot, run.identity.task);
    let cleanedEnvironment = previousCompletion?.cleanup?.status === 'cleaned' ? previousCompletion.cleanup : null;
    if (!cleanedEnvironment) {
      const delegated = await cleanupThroughRetainedController(runtime, context, { ...run, repositories }, deliveries, integratedContributions);
      if (delegated.observation) operations.push(delegated.observation);
      cleanedEnvironment = delegated.payload || { status: 'blocked', effects: [], diagnostic: { code: 'task-finish.retained-cleanup-unavailable', message: 'Retained Environment Manager cleanup entry is unavailable.' } };
    }
    operations.push({ operation: 'cleanup-task-environment', status: cleanedEnvironment.status, effects: cleanedEnvironment.effects, diagnostic: cleanedEnvironment.diagnostic });
    if (cleanedEnvironment.status !== 'cleaned') return { status: 'blocked', operations, failure: { operation: 'environment-cleanup', failureClass: 'transient-external-condition', code: cleanedEnvironment.diagnostic?.code || 'task-finish.environment-cleanup-failed', message: cleanedEnvironment.diagnostic?.message || 'Task Environment cleanup failed.', diagnostic: cleanedEnvironment }, output: { repositories } };
    writeFinishCompletion({ root: run.identity.workspaceRoot, runId: run.runId, completion: { ...prepared, cleanup: cleanedEnvironment, environmentCleanedAt: cleanedEnvironment.completedAt || new Date().toISOString() }, runtime });
    for (const plan of applicable) {
      const state = repositories.find((repository) => repository.selector === plan.selector);
      const carrierCleanup = removeIsolatedGitCarrier({ repositoryRoot: plan.retainedRoot, workspaceRoot: run.identity.workspaceRoot, runId: run.runId, repositorySelector: plan.selector, expectedRoot: state.deliveryCarrier.root });
      operations.push({ kind: 'product', id: 'cleanup-isolated-carrier', selector: plan.selector, status: carrierCleanup.status, details: carrierCleanup });
      if (!['removed', 'not-applicable'].includes(carrierCleanup.status)) return { status: 'blocked', operations, failure: { operation: 'carrier-cleanup', failureClass: 'transient-external-condition', code: carrierCleanup.code || 'task-finish.carrier-cleanup-failed', message: `Unable to clean Delivery Carrier: ${plan.selector}.`, findings: [{ selector: plan.selector }], diagnostic: carrierCleanup }, output: { repositories } };
    }
    let taskCompletion;
    try {
      taskCompletion = runtime.completeTaskRecordFromFinish(run.identity.workspaceRoot, run.identity.task);
    } catch (error) {
      return { status: 'blocked', operations, failure: { operation: 'task-record-completion', failureClass: 'transient-external-condition', code: error.code || 'task-finish.task-record-completion-failed', message: error.message, diagnostic: error.details || null }, output: { repositories } };
    }
    if (taskCompletion.status !== 'completed' || taskCompletion.record?.status !== 'completed' || taskCompletion.record?.result?.noChange !== false) return { status: 'blocked', operations, failure: { operation: 'task-record-completion', failureClass: 'product-execution-failure', code: 'task-finish.task-record-completion-invalid', message: 'Task Record Application did not confirm a delivered completed Task.', diagnostic: taskCompletion }, output: { repositories } };
    const complete = { ...prepared, status: 'complete', completedAt: new Date().toISOString(), cleanup: cleanedEnvironment };
    writeFinishCompletion({ root: run.identity.workspaceRoot, runId: run.runId, completion: complete, runtime });
    return { status: 'passed', operations, inputIdentity: deliverySetIdentity, outputIdentity: digest(complete), output: { repositories, completion: { ...complete, receipt: completionFile } } };
  }

  return { preflight, prepare, verify, deliver, cleanup };
}

export function createTaskFinishProductHandlers(options) {
  const legacy = createLegacyTaskFinishProductHandlers(options);
  const repositorySet = createRepositorySetTaskFinishProductHandlers(options);
  return Object.fromEntries(Object.keys(legacy).map((phase) => [phase, (input) => (
    Array.isArray(input.run?.identity?.repositories) && input.run.identity.repositories.length > 0
      ? repositorySet[phase](input)
      : legacy[phase](input)
  )]));
}
