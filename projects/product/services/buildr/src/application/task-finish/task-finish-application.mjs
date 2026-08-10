import crypto from 'node:crypto';
import path from 'node:path';

import { removeIsolatedGitCarrier } from './git-task-contribution.mjs';
import { observeTaskFinishEntryReadiness, taskFinishEntryGapsError } from './task-finish-entry-readiness.mjs';
import { executeFinishRun, inspectFinishRun, readFinishRun, readTaskFinishResults, resolveFinishRun } from './task-finish-run.mjs';
import { cleanupTaskFinishDiagnosticsEvidence, createTaskFinishDiagnosticsEvidence } from './diagnostics-evidence.mjs';
import {
  TASK_FINISH_EXECUTION_RECORD_KIND,
  TASK_FINISH_EXECUTION_RECORD_OWNER,
  TASK_FINISH_EXECUTION_RECORD_PRODUCER,
  createTaskFinishExecutionRecordFiles,
  publicTaskFinishExecutionRecord,
  taskFinishExecutionRecordOutcome,
} from './execution-record.mjs';

function inputError(code, message, action, details = null) {
  const error = new Error(message);
  Object.assign(error, { code, usage: `buildr help task finish ${action}`, nextAction: `buildr help task finish ${action}` });
  if (details) error.details = details;
  return error;
}

function assertArgs(action, args) {
  const allowedByAction = {
    run: new Set(['--run', '--task', '--agent', '--target-branch', '--remote', '--resume', '--target', '--detail', '--json']),
    inspect: new Set(['--run', '--target', '--detail', '--json']),
  };
  const allowed = allowedByAction[action];
  if (!allowed) throw inputError('task_finish.unsupported_action', `Task Finish only supports run and inspect: ${action || '<missing>'}`, 'run');
  for (let index = 0; index < args.length; index += 1) {
    const option = args[index];
    if (!option.startsWith('--') || !allowed.has(option)) throw inputError('task_finish.unknown_parameter', `Unknown argument: ${option}`, action);
    if (option === '--json') continue;
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw inputError('task_finish.missing_parameter', `Missing value for ${option}`, action);
    index += 1;
  }
}

function finishInvocationId(task) {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  return `${task}-${stamp}-${crypto.randomBytes(6).toString('hex')}`;
}

function withExecutionRecord(result, executionRecord) {
  return { ...result, executionRecord };
}

function executionGateResult(identity, executionRecord, diagnostic) {
  return {
    schemaVersion: 'buildr.task-finish-result/v2',
    runId: null,
    status: 'blocked',
    identity: { ...identity, environmentRoot: null, workspaceRoot: null },
    handoff: { identity: identity.handoffIdentity },
    candidate: { identity: identity.candidateIdentity, generation: identity.candidateGeneration, contentTargetIdentity: identity.contentTargetIdentity },
    carrier: null,
    phases: [],
    primaryFailure: {
      phase: null,
      operation: 'execution-record-open',
      check: null,
      failureClass: 'transient-external-condition',
      code: diagnostic.code || 'task-finish.execution-record-open-failed',
      status: 'blocked',
      exitCode: null,
      message: diagnostic.message,
      findings: [],
      diagnostic: null,
    },
    resume: null,
    nextWorkflow: null,
    nextAction: 'resolve-or-cleanup-task-finish-execution-record-capacity-and-retry',
    reuseMode: null,
    equivalence: null,
    delivery: null,
    completion: null,
    metrics: {
      canonicalCliInvocations: 0,
      agentProviderCompletions: 0,
      manualRecoveryManifests: 0,
      formalVerificationExecutions: 0,
      productCommandObservations: 0,
      productExecutionMs: 0,
      wallClockMs: 0,
      coverage: 'not-started',
    },
    createdAt: null,
    updatedAt: null,
    completedAt: null,
    executionRecord,
  };
}

export function registerTaskFinishApplication(runtime) {
  const optionValue = (...args) => runtime.optionValue(...args);
  const withResolvedTarget = (...args) => runtime.withResolvedTarget(...args);

  async function run(command) {
    const root = command.targetRoot;
    const resumeToken = optionValue(command.args, '--resume', null);
    const withReadCompatibility = runtime.withWorkspaceStructuredStoreReadCompatibility
      ? (operation) => runtime.withWorkspaceStructuredStoreReadCompatibility(root, operation)
      : (operation) => operation();
    const prepared = withReadCompatibility(() => {
        const runId = optionValue(command.args, '--run', null);
        let finishRun = null;
        if (runId) {
          try { finishRun = readFinishRun({ root, runId, runtime }); } catch {
            const completed = runtime.readTaskFinishCompletionPersistence?.(root, { runId }, { optional: true });
            if (completed?.completion?.result) return { completed: completed.completion.result };
          }
        }
        if (!finishRun) {
          const task = optionValue(command.args, '--task', null);
          if (!task) throw inputError('task_finish.missing_parameter', 'Task Finish run requires --task <task-id>.', 'run');
          const entry = observeTaskFinishEntryReadiness({
            runtime,
            root,
            task,
            requestedAgent: optionValue(command.args, '--agent', null),
            requestedTargetBranch: optionValue(command.args, '--target-branch', null),
            requestedRemote: optionValue(command.args, '--remote', null),
          });
          if (!entry.ready) throw taskFinishEntryGapsError(entry, 'run');
          const handoff = entry.handoff;
          const identity = entry.identityParts;
          const current = runtime.readTaskFinishRunPersistence?.(root, { taskId: task }, { optional: true });
          const currentRun = current?.run;
          const handoffChanged = currentRun && (currentRun.identity?.handoffIdentity !== handoff.identity
            || currentRun.identity?.candidateIdentity !== handoff.candidate.identity
            || currentRun.identity?.candidateGeneration !== handoff.candidate.generation
            || currentRun.identity?.contentTargetIdentity !== handoff.candidate.contentTargetIdentity);
          const staleFailedRun = currentRun?.status === 'failed' && handoffChanged ? currentRun : null;
          if (staleFailedRun) return { identity, staleFailedRun, finishRun: null };
          finishRun = resolveFinishRun({ root, runId, resumeToken, runtime, identity });
        } else if (path.resolve(finishRun.identity.workspaceRoot) !== path.resolve(root)) throw inputError('task_finish.environment_mismatch', 'Task Finish run is bound to a different canonical Workspace.', 'run');
        if (finishRun && ['blocked', 'cleanup_pending'].includes(finishRun.status) && (!resumeToken || finishRun.resume?.token !== resumeToken)) {
          throw inputError('task_finish.resume_token_mismatch', 'Task Finish blocked run requires its current product-generated resume token.', 'run');
        }
        return { finishRun, identity: finishRun?.identity || null, staleFailedRun: null };
      });
    const notOpened = publicTaskFinishExecutionRecord('not-opened');
    if (prepared.completed) return print(withExecutionRecord(prepared.completed, notOpened), command.args);
    let finishRun = prepared.finishRun;
    if (finishRun && ['failed', 'complete'].includes(finishRun.status)) return print(withExecutionRecord(inspectFinishRun({ root, runId: finishRun.runId, runtime }), notOpened), command.args);
    const identity = prepared.identity || finishRun?.identity;
    const invocationId = finishInvocationId(identity.task);
    let openedExecutionRecord;
    try {
      openedExecutionRecord = runtime.openTaskExecutionRecord(root, identity.task, {
        owner: TASK_FINISH_EXECUTION_RECORD_OWNER,
        kind: TASK_FINISH_EXECUTION_RECORD_KIND,
        runIdentity: invocationId,
        targetIdentity: identity.contentTargetIdentity,
        producer: TASK_FINISH_EXECUTION_RECORD_PRODUCER,
      });
    } catch (error) {
      const executionRecord = publicTaskFinishExecutionRecord('blocked', {
        outcome: 'blocked',
        diagnostic: error,
        nextActions: error.nextAction ? [error.nextAction] : ['处置或cleanup eligible execution records后重试Task Finish。'],
      });
      return print(executionGateResult(identity, executionRecord, error), command.args);
    }
    let evidence;
    try {
      evidence = createTaskFinishDiagnosticsEvidence(root, invocationId, { writeFile: runtime.atomicWriteFile });
    } catch (error) {
      const executionRecord = publicTaskFinishExecutionRecord('attention', {
        record: openedExecutionRecord.record,
        outcome: null,
        lifecycleStatus: 'open',
        diagnostic: error,
        nextActions: ['保留open record；修复diagnostics transient writer后由owner recovery处理。'],
      });
      return print(executionGateResult(identity, executionRecord, error), command.args);
    }
    if (prepared.staleFailedRun) {
      const oldRun = prepared.staleFailedRun;
      const oldWorkspaceRoot = oldRun.identity?.workspaceRoot || root;
      if (oldRun.deliveryCarrier?.root) {
        removeIsolatedGitCarrier({
          repositoryRoot: oldWorkspaceRoot,
          workspaceRoot: oldWorkspaceRoot,
          runId: oldRun.runId,
          expectedRoot: oldRun.deliveryCarrier.root,
        });
      }
      runtime.discardFailedTaskFinishRunPersistence?.(root, { taskId: identity.task, runId: oldRun.runId });
      finishRun = resolveFinishRun({ root, resumeToken, runtime, identity });
    }
    const { createTaskFinishProductHandlers } = await import('./task-finish-product-executor.mjs');
    const handlers = createTaskFinishProductHandlers({ runtime, root: finishRun.identity.environmentRoot });
    const result = await executeFinishRun({ root, run: finishRun, handlers, resumeToken, runtime, observer: evidence });
    const snapshot = evidence.snapshot();
    const outcome = taskFinishExecutionRecordOutcome(result);
    let executionRecord;
    try {
      const sealed = runtime.sealTaskExecutionRecord(root, openedExecutionRecord.record.recordId, {
        outcome,
        files: createTaskFinishExecutionRecordFiles({
          invocationId,
          run: { ...finishRun, status: result.status, deliveryCarrier: result.carrier, delivery: result.delivery, completion: result.completion, primaryFailure: result.primaryFailure },
          invocationOrdinal: snapshot.invocationOrdinal,
          outcome,
          startedAt: snapshot.startedAt,
          finishedAt: snapshot.finishedAt,
          durationMs: Math.max(0, Date.parse(snapshot.finishedAt) - Date.parse(snapshot.startedAt)),
          timeline: snapshot.timeline,
          phaseResults: snapshot.phaseResults,
          stdout: snapshot.stdout,
          stderr: snapshot.stderr,
          failure: snapshot.failure,
        }),
      });
      const cleanup = cleanupTaskFinishDiagnosticsEvidence(evidence, { removePath: runtime.removePath });
      executionRecord = publicTaskFinishExecutionRecord(cleanup.ok ? 'retained' : 'attention', {
        record: sealed.record,
        transientCleanup: cleanup,
        diagnostic: cleanup.ok ? null : cleanup,
        nextActions: cleanup.ok ? [] : ['record已retained；检查diagnostics cleanup diagnostic并重试精确cleanup。'],
      });
    } catch (error) {
      executionRecord = publicTaskFinishExecutionRecord('attention', {
        recordId: openedExecutionRecord.record.recordId,
        outcome,
        lifecycleStatus: 'open',
        diagnostic: error,
        nextActions: error.nextAction ? [error.nextAction] : ['保留open record与diagnostics transient，由Task Finish record owner恢复seal。'],
      });
    }
    return print(withExecutionRecord(result, executionRecord), command.args);
  }

  function inspect(command) {
    const runId = optionValue(command.args, '--run', null);
    if (!runId) throw inputError('task_finish.missing_parameter', 'Task Finish inspect requires --run.', 'inspect');
    return print(inspectFinishRun({ root: command.targetRoot, runId, runtime }), command.args);
  }

  function print(result, args) {
    if (args.includes('--json')) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    else {
      console.log(`Task Finish run ${result.runId}: ${result.status}`);
      if (result.primaryFailure) console.log(`Failure: ${result.primaryFailure.phase}/${result.primaryFailure.operation || result.primaryFailure.check || 'unknown'} - ${result.primaryFailure.message}`);
      if (result.nextWorkflow) console.log(`Next workflow: ${result.nextWorkflow}`);
      else if (result.nextAction) console.log(`Next: ${result.nextAction}`);
      else console.log('Next: none');
    }
    return result;
  }

  function inspectTaskFinishReadModel({ root, taskId, clock = Date.now }) {
    try {
      const current = runtime.readTaskFinishRunPersistence?.(root, { taskId }, { optional: true });
      if (current) return { taskId, state: 'current', result: inspectFinishRun({ root, runId: current.run.runId, clock, runtime }) };
      const terminal = readTaskFinishResults({ root, taskId, clock, runtime });
      if (terminal.results.length > 0) return { taskId, state: 'terminal', result: terminal.results[0].result, completion: terminal.results[0].completion, diagnostics: terminal.diagnostics };
      return { taskId, state: 'none', result: null, completion: null, diagnostics: terminal.diagnostics };
    } catch (error) {
      return { taskId, state: 'none', result: null, completion: null, diagnostics: [{ code: error.code || 'task_finish_read_unavailable', message: error.message }] };
    }
  }

  async function taskFinish(action, args) {
    assertArgs(action, args);
    const command = withResolvedTarget(args);
    return action === 'run' ? run(command) : inspect(command);
  }

  Object.assign(runtime, {
    taskFinish,
    inspectTaskFinishReadModel,
    readTaskFinishResults: ({ root, taskId, clock = Date.now }) => readTaskFinishResults({ root, taskId, clock, runtime }),
  });
}
