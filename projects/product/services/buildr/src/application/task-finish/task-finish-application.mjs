import crypto from 'node:crypto';
import path from 'node:path';

import { sameFilesystemPath } from '../../infrastructure/filesystem/filesystem-path-identity.mjs';

import { observeTaskFinishEntryReadiness, taskFinishEntryGapsError } from './task-finish-entry-readiness.mjs';
import { executeFinishRun, inspectFinishRun, readTaskFinishResults, resolvedFinishContext, resolveFinishRun } from './task-finish-run.mjs';
import { releaseFinishOccupancy } from './task-finish-occupancy-release.mjs';
import { cleanupTaskFinishDiagnosticsEvidence, createTaskFinishDiagnosticsEvidence } from './diagnostics-evidence.mjs';
import { publicTaskFinishDeliveryCommit } from './task-finish-delivery-commit.mjs';
import { projectTaskFinishResult } from './task-finish-result-projection.mjs';
import {
  activateTaskFinishBootstrapRecovery,
  createTaskFinishBootstrapRecoveryRuntimeFacade,
  finalizeTaskFinishBootstrapRecovery,
  importTaskFinishBootstrapRecoveryProvider,
  inspectTaskFinishBootstrapRecoveryQualification,
  prepareTaskFinishBootstrapRecoveryContext,
} from './task-finish-bootstrap-recovery.mjs';
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

function frozenDevelopmentIdentity(run) {
  return {
    handoffIdentity: run.identity.handoffIdentity,
    candidateIdentity: run.identity.candidateIdentity,
    candidateGeneration: run.identity.candidateGeneration,
    contentTargetIdentity: run.identity.contentTargetIdentity,
  };
}

function untouchedPhase(phase) {
  return Boolean(phase && phase.status === 'pending' && phase.attempts === 0);
}

function replaceablePrepareFailure(run) {
  const preflight = run?.phases?.find((phase) => phase.id === 'preflight');
  const prepare = run?.phases?.find((phase) => phase.id === 'prepare');
  const later = (run?.phases || []).filter((phase) => ['verify', 'deliver', 'cleanup'].includes(phase.id));
  const phaseFailure = prepare?.failure;
  const primaryFailure = run?.primaryFailure;
  const recognizedLegacyMismatch = (failure) => Boolean(run?.schemaVersion === 'buildr.task-finish-run/v2'
    && failure.phase === 'prepare'
    && failure.operation === 'carrier-preparation'
    && failure.code === 'task-finish.commit-message-mismatch');
  const recognized = (failure) => Boolean(failure
    && failure.phase === 'prepare'
    && failure.operation === 'carrier-preparation'
    && ((failure.code === 'task-finish.carrier-prepare-failed' && failure.diagnostic == null)
      || recognizedLegacyMismatch(failure)));
  return Boolean(run?.status === 'failed'
    && preflight?.status === 'passed'
    && preflight.attempts > 0
    && prepare?.status === 'failed'
    && prepare.attempts > 0
    && run.resume == null
    && recognized(phaseFailure)
    && recognized(primaryFailure)
    && later.length === 3
    && later.every(untouchedPhase));
}

function replaceableLegacyCommitMismatch(run) {
  return Boolean(run?.schemaVersion === 'buildr.task-finish-run/v2'
    && replaceablePrepareFailure(run)
    && run.primaryFailure?.code === 'task-finish.commit-message-mismatch');
}

function finishRunSideEffectFacts(persistence) {
  const run = persistence?.run;
  const prepare = run?.phases?.find((phase) => phase.id === 'prepare');
  const downstreamPhases = (run?.phases || []).filter((phase) => ['verify', 'deliver', 'cleanup'].includes(phase.id));
  const safePrepareFailure = replaceablePrepareFailure(run);
  const facts = {
    carrier: Boolean(run?.deliveryCarrier),
    lease: Boolean(persistence?.lease),
    delivery: Boolean(run?.delivery),
    retained: Boolean(run?.delivery?.remoteAfterRef || run?.delivery?.activation),
    cleanup: Boolean(persistence?.preparedCompletion || run?.completion || downstreamPhases.find((phase) => phase.id === 'cleanup' && !untouchedPhase(phase))),
    uncertainPhase: Boolean((prepare && !untouchedPhase(prepare) && !safePrepareFailure)
      || downstreamPhases.find((phase) => !untouchedPhase(phase))),
  };
  return {
    ...facts,
    categories: Object.entries(facts).filter(([, present]) => present).map(([category]) => category),
  };
}

function replaceableStaleRun(persistence) {
  const run = persistence?.run;
  const preflight = run?.phases?.find((phase) => phase.id === 'preflight');
  const laterPhases = (run?.phases || []).filter((phase) => phase.id !== 'preflight');
  const facts = finishRunSideEffectFacts(persistence);
  const preflightOnly = Boolean(run
    && ['blocked', 'failed'].includes(run.status)
    && ['blocked', 'failed'].includes(preflight?.status)
    && laterPhases.length === 4
    && laterPhases.every(untouchedPhase));
  return Boolean((preflightOnly || replaceablePrepareFailure(run)) && facts.categories.length === 0);
}

function cleanupResumeAllowed(persistence) {
  const run = persistence?.run;
  return Boolean(run
    && run.resume?.phase === 'cleanup'
    && (persistence?.preparedCompletion || run.delivery?.finalRemoteRef));
}

function currentRunIdentityError(run, current, facts) {
  return inputError(
    'task_finish.current_run_identity_conflict',
    'Current Task Finish run is bound to a different Development handoff and owns recovery or delivery facts.',
    'run',
    {
      taskId: run.identity.task,
      runId: run.runId,
      frozen: frozenDevelopmentIdentity(run),
      current,
      sideEffectFacts: facts.categories,
      nextAction: 'Inspect the current Finish run and resolve or complete its owned recovery facts before starting a new handoff.',
    },
  );
}

function supersededRunError(run, current) {
  return inputError(
    'task_finish.development_handoff_superseded',
    'The requested no-side-effect Finish run was superseded by a newer Development handoff.',
    'run',
    {
      taskId: run.identity.task,
      runId: run.runId,
      frozen: frozenDevelopmentIdentity(run),
      current,
      nextAction: `Run task finish again for ${run.identity.task} without --run and provide a fresh --commit-message.`,
    },
  );
}

function markRunSuperseded(run, reason = 'development-handoff') {
  const updatedAt = new Date().toISOString();
  const next = JSON.parse(JSON.stringify(run));
  const stoppedPhase = next.phases.find((phase) => ['blocked', 'failed'].includes(phase.status));
  const phaseId = ['preflight', 'prepare'].includes(stoppedPhase?.id) ? stoppedPhase.id : 'preflight';
  const legacyReplacement = reason === 'legacy-commit-message-mismatch';
  const failure = {
    phase: phaseId,
    operation: legacyReplacement ? 'carrier-preparation' : 'development-handoff',
    check: legacyReplacement ? 'carrier-preparation' : 'development-handoff',
    failureClass: legacyReplacement ? 'product-execution-failure' : 'upstream-candidate-defect',
    code: legacyReplacement ? 'task-finish.legacy-commit-message-mismatch-superseded' : 'task-finish.development-handoff-superseded',
    status: 'failed',
    exitCode: null,
    message: legacyReplacement
      ? 'A no-side-effect legacy commit-message mismatch run was superseded by the repository-set Finish path.'
      : 'A newer current Development handoff superseded this no-side-effect run.',
    findings: [],
    diagnostic: null,
  };
  next.status = 'failed';
  next.primaryFailure = failure;
  next.resume = null;
  next.updatedAt = updatedAt;
  if (stoppedPhase) {
    stoppedPhase.status = 'failed';
    stoppedPhase.completedAt ||= updatedAt;
    stoppedPhase.failure = failure;
  }
  return next;
}

function assertArgs(action, args) {
  const allowedByAction = {
    run: new Set(['--run', '--task', '--agent', '--target-branch', '--remote', '--commit-message', '--resume', '--accept-zero-delta-adaptation', '--bootstrap-recovery', '--release-occupancy', '--target', '--detail', '--json']),
    inspect: new Set(['--run', '--target', '--detail', '--json']),
  };
  const allowed = allowedByAction[action];
  if (!allowed) throw inputError('task_finish.unsupported_action', `Task Finish only supports run and inspect: ${action || '<missing>'}`, 'run');
  for (let index = 0; index < args.length; index += 1) {
    const option = args[index];
    if (!option.startsWith('--') || !allowed.has(option)) throw inputError('task_finish.unknown_parameter', `Unknown argument: ${option}`, action);
    if (option === '--json' || option === '--accept-zero-delta-adaptation' || option === '--bootstrap-recovery' || option === '--release-occupancy') continue;
    const value = args[index + 1];
    if (!value || value.startsWith('--')) throw inputError('task_finish.missing_parameter', `Missing value for ${option}`, action);
    if (option === '--detail' && !['compact', 'full', 'self-bootstrap'].includes(value)) {
      throw inputError('task_finish.detail_invalid', '--detail must be compact, full, or self-bootstrap.', action, { detail: value });
    }
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
    schemaVersion: 'buildr.task-finish-result/v3',
    runId: null,
    status: 'blocked',
    identity: { ...identity, environmentRoot: null, workspaceRoot: null },
    resolvedContext: resolvedFinishContext(identity),
    handoff: { identity: identity.handoffIdentity },
    candidate: { identity: identity.candidateIdentity, generation: identity.candidateGeneration, contentTargetIdentity: identity.contentTargetIdentity },
    deliveryCommit: null,
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
      bootstrapRecoveryExecutions: 0,
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
    const requestedCommitMessage = optionValue(command.args, '--commit-message', null);
    const acceptZeroDeltaAdaptation = command.args.includes('--accept-zero-delta-adaptation');
    const bootstrapRecoveryRequested = command.args.includes('--bootstrap-recovery');
    const releaseOccupancyRequested = command.args.includes('--release-occupancy');
    const requestedRunId = optionValue(command.args, '--run', null);
    const requestedTaskId = optionValue(command.args, '--task', null);
    if (releaseOccupancyRequested && (resumeToken || bootstrapRecoveryRequested || acceptZeroDeltaAdaptation)) {
      throw inputError('task_finish.release_occupancy_mutex', '--release-occupancy cannot be combined with --resume, --bootstrap-recovery, or --accept-zero-delta-adaptation.', 'run');
    }
    if (releaseOccupancyRequested && !requestedRunId) {
      throw inputError('task_finish.release_occupancy_run_required', '--release-occupancy requires an existing --run <run-id>.', 'run');
    }
    if (releaseOccupancyRequested && !requestedTaskId) {
      throw inputError('task_finish.release_occupancy_task_required', '--release-occupancy requires --task <task-id>.', 'run');
    }
    if (bootstrapRecoveryRequested && !requestedRunId) {
      throw inputError('task_finish.bootstrap_recovery_run_required', '--bootstrap-recovery requires an existing --run <run-id>.', 'run');
    }
    if (acceptZeroDeltaAdaptation && (!requestedRunId || !resumeToken)) {
      throw inputError('task_finish.zero_delta_adaptation_context_invalid', '--accept-zero-delta-adaptation requires an existing --run and its current --resume token.', 'run');
    }
    const withReadCompatibility = runtime.withWorkspaceStructuredStoreReadCompatibility
      ? (operation) => runtime.withWorkspaceStructuredStoreReadCompatibility(root, operation)
      : (operation) => operation();
    const prepared = withReadCompatibility(() => {
        const runId = requestedRunId;
        let finishRun = null;
        let finishPersistence = null;
        if (runId) {
          finishPersistence = runtime.readTaskFinishRunPersistence?.(root, { runId }, { optional: true }) || null;
          finishRun = finishPersistence?.run || null;
          if (!finishRun && releaseOccupancyRequested) {
          throw inputError('task_finish.release_occupancy_run_missing', 'Occupancy release requires an existing Task Finish run.', 'run');
        }
        if (!finishRun) {
            const completed = runtime.readTaskFinishCompletionPersistence?.(root, { runId }, { optional: true });
            if (completed?.completion?.result) {
              if (acceptZeroDeltaAdaptation) throw inputError('task_finish.zero_delta_adaptation_context_invalid', '--accept-zero-delta-adaptation only applies to a current adaptation-required run.', 'run');
              if (requestedCommitMessage != null) throw inputError('task_finish.commit_message_override', 'An existing Task Finish run does not accept --commit-message.', 'run');
              return { completed: completed.completion.result };
            }
          }
        }
        if (finishRun) {
          if (requestedCommitMessage != null) throw inputError('task_finish.commit_message_override', 'An existing Task Finish run does not accept --commit-message.', 'run');
          if (!sameFilesystemPath(finishRun.identity.workspaceRoot, root)) throw inputError('task_finish.environment_mismatch', 'Task Finish run is bound to a different canonical Workspace.', 'run');
          if (!cleanupResumeAllowed(finishPersistence) && !releaseOccupancyRequested) {
            const assertion = runtime.assertTaskDevelopmentCarrier(root, finishRun.identity.task, frozenDevelopmentIdentity(finishRun));
            if (assertion.status !== 'equivalent') {
              const current = assertion.diagnostic?.details?.current || null;
              if (replaceableStaleRun(finishPersistence)) throw supersededRunError(finishRun, current);
              throw currentRunIdentityError(finishRun, current, finishRunSideEffectFacts(finishPersistence));
            }
          }
        }
        if (!finishRun && releaseOccupancyRequested) {
          throw inputError('task_finish.release_occupancy_run_missing', 'Occupancy release requires an existing Task Finish run.', 'run');
        }
        if (!finishRun) {
          const task = optionValue(command.args, '--task', null);
          if (!task) throw inputError('task_finish.missing_parameter', 'Task Finish run requires --task <task-id>.', 'run');
          const current = runtime.readTaskFinishRunPersistence?.(root, { taskId: task }, { optional: true });
          const currentRun = current?.run;
          const entry = observeTaskFinishEntryReadiness({
            runtime,
            root,
            task,
            requestedAgent: optionValue(command.args, '--agent', null),
            requestedTargetBranch: optionValue(command.args, '--target-branch', null),
            requestedRemote: optionValue(command.args, '--remote', null),
            requestedCommitMessage,
            requireCommitMessage: !currentRun,
          });
          if (!entry.ready) throw taskFinishEntryGapsError(entry, 'run');
          const handoff = entry.handoff;
          const identity = {
            ...entry.identityParts,
            deliveryCommitIdentity: currentRun?.identity?.deliveryCommitIdentity || entry.deliveryCommit?.identity || null,
          };
          const handoffChanged = currentRun && (currentRun.identity?.handoffIdentity !== handoff.identity
            || currentRun.identity?.candidateIdentity !== handoff.candidate.identity
            || currentRun.identity?.candidateGeneration !== handoff.candidate.generation
            || currentRun.identity?.contentTargetIdentity !== handoff.candidate.contentTargetIdentity);
          const legacyMismatchReplacement = currentRun && !handoffChanged && replaceableLegacyCommitMismatch(currentRun);
          if (currentRun && handoffChanged && cleanupResumeAllowed(current)) {
            finishRun = currentRun;
          } else if (currentRun && handoffChanged) {
            if (!replaceableStaleRun(current)) {
              throw currentRunIdentityError(currentRun, {
                handoffIdentity: handoff.identity,
                candidateIdentity: handoff.candidate.identity,
                candidateGeneration: handoff.candidate.generation,
                contentTargetIdentity: handoff.candidate.contentTargetIdentity,
              }, finishRunSideEffectFacts(current));
            }
            if (!entry.deliveryCommit) {
              const missing = observeTaskFinishEntryReadiness({
                runtime, root, task,
                requestedAgent: optionValue(command.args, '--agent', null),
                requestedTargetBranch: optionValue(command.args, '--target-branch', null),
                requestedRemote: optionValue(command.args, '--remote', null),
                requestedCommitMessage,
                requireCommitMessage: true,
              });
              throw taskFinishEntryGapsError(missing, 'run');
            }
            identity.deliveryCommitIdentity = entry.deliveryCommit.identity;
            return { identity, deliveryCommit: entry.deliveryCommit, developmentHandoff: handoff, replaceableStaleRun: currentRun, finishRun: null };
          }
          if (legacyMismatchReplacement && requestedCommitMessage != null) {
            if (!entry.deliveryCommit || entry.deliveryCommit.identity !== currentRun.identity?.deliveryCommitIdentity) {
              throw inputError('task_finish.commit_message_override', 'Legacy mismatch recovery must reuse the frozen Task Finish commit message.', 'run');
            }
            identity.deliveryCommitIdentity = entry.deliveryCommit.identity;
            return { identity, deliveryCommit: entry.deliveryCommit, developmentHandoff: handoff, replaceableStaleRun: currentRun, replacementReason: 'legacy-commit-message-mismatch', finishRun: null };
          }
          if (finishRun && currentRun && requestedCommitMessage != null) throw inputError('task_finish.commit_message_override', 'An existing Task Finish run does not accept --commit-message.', 'run');
          if (!finishRun) {
            if (currentRun && requestedCommitMessage != null) throw inputError('task_finish.commit_message_override', 'An existing Task Finish run does not accept --commit-message.', 'run');
            finishRun = resolveFinishRun({ root, runId, resumeToken, runtime, identity, deliveryCommit: entry.deliveryCommit, developmentHandoff: handoff });
          }
        }
        if (finishRun && ['blocked', 'cleanup_pending'].includes(finishRun.status) && !releaseOccupancyRequested && (!resumeToken || finishRun.resume?.token !== resumeToken)) {
          throw inputError('task_finish.resume_token_mismatch', 'Task Finish blocked run requires its current product-generated resume token.', 'run');
        }
        if (acceptZeroDeltaAdaptation && (finishRun?.status !== 'blocked' || finishRun.deliveryCarrier?.reuseMode !== 'adaptation-required')) {
          throw inputError('task_finish.zero_delta_adaptation_context_invalid', '--accept-zero-delta-adaptation only applies to a current adaptation-required run.', 'run');
        }
        return { finishRun, identity: finishRun?.identity || null, deliveryCommit: finishRun?.deliveryCommit || null, developmentHandoff: finishRun?.developmentHandoff || null, replaceableStaleRun: null, replacementReason: null };
      });
    const notOpened = publicTaskFinishExecutionRecord('not-opened');
    if (prepared.completed) {
      if (releaseOccupancyRequested) {
        throw inputError('task_finish.release_occupancy_already_delivered', 'Occupancy release refuses a Finish run that already formed a successful delivery.', 'run');
      }
      return print(withExecutionRecord(prepared.completed, notOpened), command.args);
    }
    let finishRun = prepared.finishRun;
    if (releaseOccupancyRequested) {
      return print(withExecutionRecord(releaseFinishOccupancy({
        root,
        run: finishRun,
        taskId: requestedTaskId,
        runtime,
      }), notOpened), command.args);
    }
    if (finishRun?.status === 'complete' || (finishRun?.status === 'failed' && !bootstrapRecoveryRequested)) return print(withExecutionRecord(inspectFinishRun({ root, runId: finishRun.runId, runtime }), notOpened), command.args);
    if (finishRun?.bootstrapRecovery && !bootstrapRecoveryRequested) {
      throw inputError('task_finish.bootstrap_recovery_flag_required', 'This run is bound to bootstrap recovery; resume it with --bootstrap-recovery and the current resume token.', 'run');
    }
    let bootstrapQualification = null;
    if (bootstrapRecoveryRequested) {
      const persistence = runtime.readTaskFinishRunPersistence(root, { runId: finishRun.runId }, { optional: false });
      bootstrapQualification = inspectTaskFinishBootstrapRecoveryQualification(persistence);
      if (!bootstrapQualification.ready) throw inputError(bootstrapQualification.code, bootstrapQualification.message, 'run', bootstrapQualification);
    }
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
    if (prepared.replaceableStaleRun) {
      const oldRun = markRunSuperseded(prepared.replaceableStaleRun, prepared.replacementReason);
      runtime.writeTaskFinishRunPersistence(root, oldRun);
      runtime.discardFailedTaskFinishRunPersistence?.(root, { taskId: identity.task, runId: oldRun.runId });
      finishRun = resolveFinishRun({ root, resumeToken, runtime, identity, deliveryCommit: prepared.deliveryCommit, developmentHandoff: prepared.developmentHandoff });
    }
    let handlers;
    if (bootstrapRecoveryRequested) {
      const persistence = runtime.readTaskFinishRunPersistence(root, { runId: finishRun.runId }, { optional: false });
      const bootstrapContext = prepareTaskFinishBootstrapRecoveryContext({ run: finishRun, targetRoot: root, runtime });
      if (bootstrapQualification.terminalOnly) {
        handlers = Object.freeze({});
      } else {
        const createTaskFinishProductHandlers = await importTaskFinishBootstrapRecoveryProvider(bootstrapContext);
        const handlerRuntime = createTaskFinishBootstrapRecoveryRuntimeFacade(runtime, bootstrapContext);
        handlers = createTaskFinishProductHandlers({ runtime: handlerRuntime, root: finishRun.identity.environmentRoot, acceptZeroDeltaAdaptation });
      }
      finishRun = activateTaskFinishBootstrapRecovery(finishRun, bootstrapContext, persistence);
      runtime.writeTaskFinishRunPersistence(root, finishRun);
    } else {
      const { createTaskFinishProductHandlers } = await import('./task-finish-product-executor.mjs');
      handlers = createTaskFinishProductHandlers({ runtime, root: finishRun.identity.environmentRoot, acceptZeroDeltaAdaptation });
    }
    const result = await executeFinishRun({
      root,
      run: finishRun,
      handlers,
      resumeToken,
      runtime,
      observer: evidence,
      bootstrapRecoveryFinalizer: finishRun.bootstrapRecovery ? finalizeTaskFinishBootstrapRecovery : null,
    });
    const snapshot = evidence.snapshot();
    const outcome = taskFinishExecutionRecordOutcome(result);
    let executionRecord;
    try {
      const sealed = runtime.sealTaskExecutionRecord(root, openedExecutionRecord.record.recordId, {
        outcome,
        files: createTaskFinishExecutionRecordFiles({
          invocationId,
          run: { ...finishRun, deliveryCommit: publicTaskFinishDeliveryCommit(finishRun.deliveryCommit), status: result.status, deliveryCarrier: result.carrier, delivery: result.delivery, completion: result.completion, primaryFailure: result.primaryFailure },
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
    if (args.includes('--json')) {
      const detail = optionValue(args, '--detail', 'compact');
      process.stdout.write(`${JSON.stringify(projectTaskFinishResult(result, detail), null, 2)}\n`);
    }
    else {
      console.log(`Task Finish run ${result.runId}: ${result.status}`);
      if (result.occupancy?.status === 'released') console.log('Occupancy: released');
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
