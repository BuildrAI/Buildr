#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { createReleaseToolRuntime } from './runtime.ts';
import { sameFilesystemPath } from '../../../projects/product/services/buildr/src/infrastructure/filesystem/filesystem-path-identity.ts';
import { createExactNodeExecutionEnvironment } from '../../../projects/product/services/buildr/src/infrastructure/process.ts';
import { closeoutReleaseGitResources, reconcilePublishedReleaseWithDev, reconcileReleaseToMain, ensureReleaseToMainPullRequest, pushReleaseBranch, releaseCarrierBranchFor } from './release-git-convergence.ts';
import { createReleaseSelection, selectReleaseCommit, freezeReleaseSelection, reopenReleaseSelection, inspectReleaseSelection } from './release-selection.ts';
import { resolveReleaseExecutionBinding } from './release-execution-binding.ts';
import { observeUnpublishedRelease } from './release-observation.ts';
import { retryCandidateFailedShards, classifyCandidateFailure } from './candidate-failed-shard-retry.ts';
import { releaseCommandDiagnostic, releaseDispatchRejected, releaseRecoveryPlan } from './release-failure.ts';
import { extractReleaseNotes } from './release-notes.ts';
import { assertCandidateDispatchBudget, continueCandidateRepair } from './candidate-repair-operation.ts';
import { containsCredentialMaterial, releasePublishAuthority } from './release-authority.ts';
import { createReleaseLifecycle, projectReleaseLifecycleOrchestration } from './release-lifecycle.ts';
import { compactReleasePhaseTimeline, createReleasePhaseTimeline, projectCandidateAttempts } from './release-phase-timeline.ts';
import { inspectHostedReleaseTransaction } from './release-transaction-evidence.ts';
import { runHostedReleaseTransaction, readCandidateEvidence } from './release-transaction-runner.ts';
import { assertReleaseConsumptionCoverage } from '../../../projects/product/services/buildr/test/verification/release/release-consumption.ts';
import { normalizeReleaseTargets } from './release-targets.ts';
import { preparePackageRelease, continuePackageRelease, evaluateObservedPackagePlan, observePackageCounterparts } from './package-release-operation.ts';
import { observePublishedPackageArtifact } from './package-artifact-observation.ts';
import { createReleaseCandidatePlan, assertPluginSourceAggregate } from '../../../projects/product/services/buildr/test/verification/release/verify-pr-candidate.ts';
import { readPluginSourceCandidate } from './plugin-hosted-release.ts';
import { readReleaseArtifact, releaseArtifactManifestName } from './release-artifact.ts';
import { CANDIDATE_CI_SHARDS, CANDIDATE_CI_HOST_NODE_TUPLES } from '../../../projects/product/services/buildr/test/verification/registry.ts';
import { candidatePreparationDirectory, readCandidatePreparationSnapshot } from './release-task-evidence-correlation.ts';

export const releaseOrchestrationSchema: any = 'buildr.release-orchestration-result/v1';

const serviceRoot: any = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../projects/product/services/buildr');
const workspaceRoot: any = path.resolve(serviceRoot, '../../../..');
const VERSION: any = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;
const TASK: any = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/u;

async function prepareLocalSourceVerification(options: any): Promise<any> {
  // Source execution tools stay outside the production import graph. This
  // source-checkout release owner loads them only before a new dispatch.
  const owner = await import(new URL('../../../projects/product/services/buildr/test/verification/local-source-verification.ts', import.meta.url).href);
  return owner.prepareLocalSourceVerification(options);
}

function identity(value: any): any  {
  return `sha256-${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function required(value: any, pattern: any, label: any): any  {
  if (typeof value !== 'string' || !pattern.test(value)) throw new Error(`${label} is invalid.`);
  return value;
}

function effects(steps: any): any  {
  return steps.flatMap((step: any) => step.effects ?? []);
}

function step(owner: any, operation: any, result: any, disposition: any = 'executed'): any  {
  return {
    owner,
    operation,
    status: result?.status ?? 'blocked',
    disposition,
    identity: result?.identity ?? result?.evidenceIdentity ?? result?.contextIdentity ?? result?.recordDigest ?? null,
    effects: result?.effects ?? [],
    nextActions: result?.nextActions ?? [],
    ...(result?.github?.runId ? { runId: result.github.runId } : {}),
  };
}

function candidateAttempts(context: any, options: any): any  {
  if (Array.isArray(options.candidateAttempts) && options.candidateAttempts.length) return options.candidateAttempts;
  const candidate: any = context?.candidate;
  if (!candidate?.runId || !candidate?.runAttempt) return [];
  return [{
    runId: candidate.runId,
    runAttempt: candidate.runAttempt,
    status: candidate.status === 'passed' ? 'passed' : 'unknown',
    aggregateIdentity: candidate.aggregateIdentity ?? null,
    rerunScope: [],
    evidence: [],
    owner: { id: 'candidate-verification', identity: candidate.aggregateIdentity ?? null },
  }];
}

function timeline(options: any, state: any = {}): any  {
  const context: any = state.context ?? state.evidence?.context ?? null;
  const phases: any[] = [];
  if (context?.selection) phases.push({ id: 'selection', phase: 'selection', status: context.selection.status === 'frozen' ? 'passed' : 'blocked', owner: { id: 'release-selection', identity: context.selection.identity ?? null }, startedAt: null, finishedAt: null, waitType: 'machine-execution' });
  phases.push(...projectCandidateAttempts(candidateAttempts(context, options)));
  if (context?.convergence?.mainCommit) phases.push({ id: 'main-pr', phase: 'release-to-main', status: 'passed', owner: { id: 'release-git-convergence', identity: context.convergence.mainCommit }, startedAt: null, finishedAt: null, waitType: 'platform-queue' });
  if (context?.identity) phases.push({ id: 'readiness', phase: 'readiness', status: state.readiness?.status === 'ready' ? 'passed' : state.readiness ? 'blocked' : 'unknown', owner: { id: 'release-transaction-runner', identity: context.identity }, startedAt: null, finishedAt: null, waitType: 'machine-execution' });
  if (state.action === 'prepare-dispatch' || state.action === 'dispatch') phases.push({ id: 'publication-authorization', phase: 'publication-authorization', status: state.dispatch?.status === 'passed' ? 'passed' : 'pending', owner: { id: 'maintainer', identity: context?.identity ?? null }, startedAt: null, finishedAt: null, waitType: 'human-decision' });
  if (state.dispatch) phases.push({ id: 'dispatch', phase: 'dispatch', status: state.dispatch.status === 'passed' ? 'passed' : 'blocked', owner: { id: 'release-transaction-runner', identity: state.dispatch.contextIdentity ?? context?.identity ?? null }, startedAt: null, finishedAt: state.dispatch.evidence?.observedAt ?? null, waitType: 'machine-execution' });
  if (state.evidence) {
    phases.push({ id: 'publication-approval', phase: 'publication-approval', status: state.evidence.status === 'passed' ? 'passed' : 'blocked', owner: { id: 'github-environment', identity: state.evidence.identity }, startedAt: null, finishedAt: state.evidence.observedAt ?? null, waitType: 'environment-approval' });
    phases.push({ id: 'publication', phase: 'publication', status: state.evidence.status === 'passed' ? 'passed' : 'blocked', owner: { id: 'release-transaction-evidence', identity: state.evidence.identity }, startedAt: null, finishedAt: state.evidence.observedAt ?? null, waitType: 'machine-execution' });
  }
  for (const [key, phase, ownerId] of [['reconciliation', 'dev-reconciliation', 'release-git-convergence'], ['gitCloseout', 'release-git-closeout', 'release-git-convergence'], ['taskCompletion', 'task-completion', 'task-record'], ['worktreeCleanup', 'worktree-cleanup', 'task-worktree']]) {
    const result: any = state[key];
    if (result) phases.push({ id: phase, phase, status: ['passed', 'completed', 'cleaned', 'ready'].includes(result.status) ? 'passed' : 'blocked', owner: { id: ownerId, identity: result.identity ?? result.recordDigest ?? result.receiptDigest ?? null }, startedAt: null, finishedAt: result.observedAt ?? null, waitType: 'machine-execution' });
  }
  if (state.selfBootstrapCloseout) {
    const activation = state.selfBootstrapCloseout;
    phases.push({ id: 'self-bootstrap-activation', phase: 'self-bootstrap-activation',
      status: ['passed', 'not-applicable'].includes(activation.status) ? 'passed' : activation.status === 'pending' ? 'pending' : 'blocked',
      owner: { id: 'buildr-self-bootstrap-sync', identity: activation.identity ?? activation.receiptDigest ?? null },
      startedAt: null, finishedAt: activation.observedAt ?? null, waitType: 'machine-execution' });
  }
  return createReleasePhaseTimeline({
    version: options.version,
    generation: Number(context?.selection?.generation ?? options.generation ?? 0),
    terminalStatus: ['passed', 'not-applicable'].includes(state.selfBootstrapCloseout?.status) ? 'closed'
      : state.blocked || state.selfBootstrapCloseout && state.selfBootstrapCloseout.status !== 'pending' ? 'blocked' : 'active',
    phases,
  });
}

function result(options: any, action: any, status: any, state: any, steps: any, nextActions: any = []): any  {
  const phaseTimeline: any = timeline(options, { ...state, action, blocked: status === 'blocked' });
  const lifecycle: any = state.lifecycle ? projectReleaseLifecycleOrchestration(state.lifecycle, phaseTimeline.identity) : null;
  const value: any = {
    schemaVersion: releaseOrchestrationSchema,
    action,
    status,
    version: options.version,
    releaseTask: options.releaseTask ?? state.context?.preparation?.taskId ?? null,
    contextIdentity: state.context?.identity ?? null,
    orchestrationIdentity: identity({ action, version: options.version, task: options.releaseTask ?? null, context: state.context?.identity ?? null, timeline: phaseTimeline.identity }),
    timelineIdentity: phaseTimeline.identity,
    steps,
    effects: effects(steps),
    outcomes: {
      publication: state.evidence?.status ?? state.dispatch?.evidence?.status ?? 'not-observed',
      taskRegistration: state.taskCompletion?.status ?? 'not-run',
      cleanup: state.worktreeCleanup?.status ?? state.gitCloseout?.status ?? 'not-run',
      activation: state.selfBootstrapCloseout?.status === 'passed' ? 'ready' : state.selfBootstrapCloseout?.status ?? 'not-run',
    },
    ...(state.gitCloseout ? { cleanup: { status: state.gitCloseout.status, branches: state.gitCloseout.branches ?? [], findings: state.gitCloseout.findings ?? [], diagnostic: state.gitCloseout.diagnostic ?? null } } : {}),
    nextActions,
    timeline: phaseTimeline,
    ...(state.context ? { context: state.context } : {}),
    ...(state.closeoutProgress ? { closeoutProgress: state.closeoutProgress } : {}),
    ...(lifecycle ? { lifecycle } : {}),
  };
  return value;
}

function blocked(options: any, action: any, state: any, steps: any, ownerResult: any, fallback: any): any  {
  const nextActions: any = ownerResult?.nextActions?.length ? ownerResult.nextActions : [fallback];
  return result(options, action, 'blocked', state, steps, nextActions);
}

function parseControllerOutput(run: any, label: any): any  {
  const source: any = String(run?.stdout || run?.stderr || '').trim();
  let value: any = null;
  try { value = source ? JSON.parse(source) : null; } catch { /* handled below */ }
  if (run?.status !== 0) return { schemaVersion: 'buildr.retained-controller-result/v1', status: 'blocked', diagnostic: { code: `${label}-failed`, message: value?.diagnostic?.message || source || `${label} failed.` }, ownerResult: value, effects: value?.effects ?? [], nextActions: value?.nextActions ?? [`恢复${label}后重试。`] };
  if (!value) return { schemaVersion: 'buildr.retained-controller-result/v1', status: 'blocked', diagnostic: { code: `${label}-invalid-output`, message: `${label} returned invalid JSON.` }, effects: [], nextActions: [`恢复${label} JSON输出后重试。`] };
  return value;
}

export function resolveRetainedController(canonicalWorkspace: any, { nodeExecutable = process.execPath }: any = {}): any  {
  const root: any = fs.realpathSync(path.resolve(canonicalWorkspace));
  const sourceRoot: any = fs.realpathSync(path.join(root, 'projects/product/services/buildr'));
  const relative: any = path.relative(root, sourceRoot);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || relative.split(path.sep).includes('.worktrees')) throw new Error('Release retained controller source is not a retained Workspace checkout.');
  const requiredNode: any = fs.readFileSync(path.join(root, 'projects/product/.node-version'), 'utf8').trim();
  const execution: any = createExactNodeExecutionEnvironment({ nodeExecutable, minimumVersion: requiredNode });
  const executable: any = execution.nodeExecutable;
  const entry: any = path.join(sourceRoot, 'bin', 'buildr.mjs');
  if (!fs.statSync(entry, { throwIfNoEntry: false })?.isFile()) throw new Error('Release retained controller CLI is missing.');
  return { executable, argsPrefix: [entry], sourceRoot, workspaceRoot: root, identity: identity({ executable, sourceRoot, entry, requiredNode, nodeVersion: execution.audit.version }) };
}

function defaultInvokeRetained(controller: any, args: any): any  {
  const run: any = spawnSync(controller.executable, [...controller.argsPrefix, ...args], { cwd: controller.workspaceRoot, encoding: 'utf8' });
  return parseControllerOutput(run, args.slice(0, 3).join('-'));
}

async function prepareDispatch(options: any, dependencies: any): Promise<any>  {
  const readiness: any = await (dependencies.runHostedReleaseTransaction ?? runHostedReleaseTransaction)({ ...options.transaction, action: 'readiness' }, dependencies.transactionDependencies);
  const context: any = readiness.context ?? null;
  const steps: any[] = [step('release-transaction-runner', 'readiness', readiness)];
  if (readiness.status !== 'ready' || !context?.identity) return blocked(options, 'prepare-dispatch', { readiness, context }, steps, readiness, '修复current release readiness后重试。');
  return result(options, 'prepare-dispatch', 'awaiting-publication-authorization', { readiness, context }, steps, ['请维护者对current frozen context明确授权publication后，以同一context digest执行dispatch。']);
}

async function dispatch(options: any, dependencies: any): Promise<any>  {
  if (options.publicationAuthorized !== true || typeof options.expectedContextDigest !== 'string') {
    return blocked(options, 'dispatch', { context: null }, [], { nextActions: ['提供维护者显式publication授权与expected current context digest后重试。'] }, '提供显式授权后重试。');
  }
  const readiness: any = await (dependencies.runHostedReleaseTransaction ?? runHostedReleaseTransaction)({ ...options.transaction, action: 'readiness' }, dependencies.transactionDependencies);
  const context: any = readiness.context ?? null;
  const steps: any[] = [step('release-transaction-runner', 'readiness', readiness)];
  if (readiness.status !== 'ready' || !context?.identity) return blocked(options, 'dispatch', { readiness, context }, steps, readiness, '修复current release readiness后重试。');
  if (context.identity !== options.expectedContextDigest) {
    const drift: any = { status: 'blocked', contextIdentity: context.identity, effects: [], nextActions: ['current context已漂移；重新执行prepare-dispatch并取得新的显式publication授权。'] };
    steps.push(step('release-transaction-runner', 'context-digest-check', drift));
    return blocked(options, 'dispatch', { readiness, context }, steps, drift, '重新准备并授权current context。');
  }
  const dispatched: any = await (dependencies.runHostedReleaseTransaction ?? runHostedReleaseTransaction)({ ...options.transaction, action: 'dispatch', releaseContext: context, publicationAuthorized: true }, dependencies.transactionDependencies);
  steps.push(step('release-transaction-runner', 'dispatch', dispatched));
  if (dispatched.status === 'running' || dispatched.status === 'unknown') return result(options, 'dispatch', dispatched.status, { readiness, dispatch: dispatched, context }, steps, dispatched.nextActions);
  if (dispatched.status !== 'passed') return blocked(options, 'dispatch', { readiness, dispatch: dispatched, context }, steps, dispatched, '按protected transaction owner返回的恢复动作重试。');
  return result(options, 'dispatch', 'passed', { readiness, dispatch: dispatched, context }, steps, []);
}

async function closeout(options: any, dependencies: any): Promise<any>  {
  const steps: any[] = [];
  const inspect: any = await (dependencies.inspectHostedReleaseTransaction ?? inspectHostedReleaseTransaction)({ runId: options.publishRunId, repository: options.repository, ghCommand: options.ghCommand }, dependencies.evidenceDependencies);
  const evidence: any = inspect?.evidence ?? null;
  steps.push(step('release-transaction-evidence', 'inspect-run', inspect));
  if (inspect?.status !== 'passed' || !evidence) return blocked(options, 'closeout', { evidence }, steps, inspect, '恢复matching hosted Publication evidence后重试。');
  const context: any = evidence.context;
  if (context?.release?.version !== options.version) return blocked(options, 'closeout', { evidence, context }, steps, { nextActions: ['Publication evidence version与请求version不一致，重新选择matching run。'] }, '选择matching Publication run。');
  if (options.expectedContextDigest != null && options.expectedContextDigest !== context?.identity) return blocked(options, 'closeout', { evidence, context }, steps,
    { nextActions: ['Publication evidence context与本轮授权不一致，保留引用并选择matching run。'] }, '选择matching Publication context。');
  const generation: any = context.selection?.generation;
  const expectedCommit: any = context.release?.sourceCommit;
  if (options.generation != null && Number(options.generation) !== generation) return blocked(options, 'closeout', { evidence, context }, steps, { nextActions: ['请求generation与Publication context不一致，使用current evidence generation重试。'] }, '修正generation。');
  if (options.expectedCommit != null && options.expectedCommit !== expectedCommit) return blocked(options, 'closeout', { evidence, context }, steps, { nextActions: ['请求expected commit与Publication context不一致，使用current evidence source重试。'] }, '修正expected commit。');
  const retained = options.closeoutProgress?.contextIdentity === context.identity && options.closeoutProgress?.evidenceIdentity === evidence.identity
    && options.closeoutProgress?.taskCompletion?.status === 'completed' && options.closeoutProgress?.worktreeCleanup?.status === 'cleaned';
  let { reconciliation, gitCloseout, lifecycle, taskCompletion, worktreeCleanup } = retained ? options.closeoutProgress : {};
  if (!retained) {
    reconciliation = (dependencies.reconcilePublishedReleaseWithDev ?? reconcilePublishedReleaseWithDev)({ repo: options.repo, publicationEvidence: evidence, remote: options.remote, main: options.main, dev: options.dev,
      inspectDriftedReleaseForCleanup: true }, dependencies.gitDependencies);
    steps.push(step('release-git-convergence', 'reconcile-dev', reconciliation));
    if (reconciliation.status !== 'passed') return blocked(options, 'closeout', { evidence, context, reconciliation }, steps, reconciliation, '恢复dev provenance reconciliation后重试。');

    gitCloseout = (dependencies.closeoutReleaseGitResources ?? closeoutReleaseGitResources)({
      repo: options.repo,
      remote: options.remote,
      main: options.main,
      dev: options.dev,
      version: options.version,
      generation,
      expectedCommit,
      publicationEvidence: evidence,
      authorizeCarrierCleanup: options.authorizeCarrierCleanup === true,
      authorizeLocalSelectionCleanup: options.authorizeLocalSelectionCleanup === true,
      authorizeRemoteDelete: options.authorizeRemoteDelete === true,
      cleanupPolicy: options.cleanupPolicy,
      ghCommand: options.ghCommand,
      repository: options.repository,
    }, dependencies.gitDependencies);
    steps.push(step('release-git-convergence', 'closeout', gitCloseout));
    if (gitCloseout.status !== 'passed') return blocked(options, 'closeout', { evidence, context, reconciliation, gitCloseout }, steps, gitCloseout, '取得明确cleanup授权或恢复Git closeout后重试。');

    const root: any = path.resolve(options.canonicalWorkspace ?? options.repo ?? workspaceRoot);
    const runtime: any = dependencies.runtime ?? createReleaseToolRuntime();
    const inspectTask: any = dependencies.inspectTask ?? ((target: any, taskId: any) => runtime.inspectTask(target, taskId));
    let taskResult: any = inspectTask(root, options.releaseTask);
    let controller: any;
    try { controller = (dependencies.resolveRetainedController ?? resolveRetainedController)(root); } catch (error: any) {
      return blocked(options, 'closeout', { evidence, context, reconciliation, gitCloseout }, steps, { nextActions: [error.message] }, '恢复matching retained controller后重试。');
    }
    const invokeRetained: any = dependencies.invokeRetainedController ?? defaultInvokeRetained;
    const activeLifecycle: any = createReleaseLifecycle({
      version: options.version,
      releaseTask: { taskId: options.releaseTask, status: taskResult.record.status, recordDigest: taskResult.recordDigest },
      selection: { status: context.selection.status, generation, identity: context.selection.identity },
      candidate: { status: context.candidate.status, identity: context.candidate.aggregateIdentity },
      readiness: { status: 'ready', contextDigest: context.identity },
      publication: { status: 'passed', runId: evidence.publish.runId, evidenceIdentity: evidence.identity },
      convergence: { status: reconciliation.status, recoveryIdentity: reconciliation.recoveryIdentity },
      closeout: { status: gitCloseout.status, identity: gitCloseout.identity, formalReleaseRef: gitCloseout.formalReleaseRef },
    });
    if (activeLifecycle.status !== 'passed' || activeLifecycle.phase !== 'closed') return blocked(options, 'closeout', { evidence, context, reconciliation, gitCloseout, lifecycle: activeLifecycle }, steps, activeLifecycle, '恢复release lifecycle closed事实后重试。');

    if (taskResult.record.status === 'completed') taskCompletion = { status: 'completed', recordDigest: taskResult.recordDigest, effects: [] };
    else if (taskResult.record.status === 'active') {
      taskCompletion = invokeRetained(controller, ['task', 'complete', options.releaseTask, '--summary', options.completionSummary ?? `Release ${options.version} Publication、dev provenance与资源收尾已完成。`, '--expected-record', taskResult.recordDigest, '--target', root, '--json']);
      taskResult = inspectTask(root, options.releaseTask);
    } else taskCompletion = { status: 'blocked', effects: [], nextActions: [`Release Task状态${taskResult.record.status}不能作为closeout完成事实。`] };
    steps.push(step('task-record', 'complete', taskCompletion, taskCompletion.effects?.length ? 'executed' : 'reused'));
    if (taskResult.record.status !== 'completed') return blocked(options, 'closeout', { evidence, context, reconciliation, gitCloseout, lifecycle: activeLifecycle, taskCompletion }, steps, taskCompletion, '恢复Task completion后重试。');

    worktreeCleanup = invokeRetained(controller, [
      'worktree', 'cleanup', options.releaseTask,
      '--expected-source', `workspace=${context.release.sourceCommit}`,
      '--delivered-ref', `workspace=${context.convergence.mainCommit}`,
      '--target', root, '--json',
    ]);
    steps.push(step('task-worktree', 'cleanup', worktreeCleanup, worktreeCleanup.effects?.length ? 'executed' : 'reused'));
    if (worktreeCleanup.status !== 'cleaned') return blocked(options, 'closeout', { evidence, context, reconciliation, gitCloseout, lifecycle: activeLifecycle, taskCompletion, worktreeCleanup }, steps, worktreeCleanup, '恢复Task Worktree cleanup后重试。');

    lifecycle = createReleaseLifecycle({ ...activeLifecycle.facts, version: options.version, releaseTask: { taskId: options.releaseTask, status: 'completed', recordDigest: taskResult.recordDigest } });
  }
  const previous = retained ? options.closeoutProgress.selfBootstrapCloseout : null;
  const closeoutProgress = { contextIdentity: context.identity, evidenceIdentity: evidence.identity, reconciliation, gitCloseout, lifecycle, taskCompletion, worktreeCleanup,
    ...(previous ? { selfBootstrapCloseout: previous } : {}) };
  dependencies.onCloseoutProgress?.(closeoutProgress);
  const selfBootstrapCloseout = ['passed', 'not-applicable'].includes(previous?.status) ? previous : dependencies.selfBootstrapCloseout
    ? await dependencies.selfBootstrapCloseout({ workspace: path.resolve(options.canonicalWorkspace ?? options.repo ?? workspaceRoot), context, evidence })
    : { status: 'pending', effects: [], nextActions: ['接续buildr-self-bootstrap-sync唯一执行器，记录实际激活或不适用结果；保留已完成公开、任务登记及清理事实。'] };
  steps.push(step('buildr-self-bootstrap-sync', 'closeout', previous === selfBootstrapCloseout ? { ...selfBootstrapCloseout, effects: [] } : selfBootstrapCloseout, previous === selfBootstrapCloseout ? 'reused' : 'executed'));
  const passed = ['passed', 'not-applicable'].includes(selfBootstrapCloseout.status);
  return result(options, 'closeout', passed ? 'passed' : selfBootstrapCloseout.status === 'pending' ? 'published-self-bootstrap-pending' : 'published-self-bootstrap-blocked',
    { evidence, context, reconciliation, gitCloseout, lifecycle, taskCompletion, worktreeCleanup, selfBootstrapCloseout, closeoutProgress: { ...closeoutProgress, selfBootstrapCloseout } }, steps, passed ? [] : selfBootstrapCloseout.nextActions ?? ['接续唯一自举执行器。']);
}

export async function runReleaseOrchestration(options: any = {}, dependencies: any = {}): Promise<any>  {
  const action: any = options.action;
  required(options.version, VERSION, 'version');
  if (!['prepare-dispatch', 'dispatch', 'closeout'].includes(action)) throw new Error('action must be prepare-dispatch, dispatch, or closeout.');
  if (action === 'closeout') {
    required(options.releaseTask, TASK, 'releaseTask');
    if (!Number.isSafeInteger(Number(options.publishRunId)) || Number(options.publishRunId) < 1) throw new Error('publishRunId must be a positive integer.');
    return closeout({ ...options, publishRunId: Number(options.publishRunId) }, dependencies);
  }
  if (!options.transaction || typeof options.transaction !== 'object') throw new Error('transaction options are required.');
  return action === 'prepare-dispatch' ? prepareDispatch(options, dependencies) : dispatch(options, dependencies);
}

export function compactReleaseOrchestration(value: any): any  {
  const compactTimeline: any = compactReleasePhaseTimeline(value.timeline);
  return {
    schemaVersion: 'buildr.release-orchestration-summary/v1',
    action: value.action,
    status: value.status,
    version: value.version,
    releaseTask: value.releaseTask,
    orchestrationIdentity: value.orchestrationIdentity,
    contextIdentity: value.contextIdentity,
    timeline: compactTimeline,
    effects: value.effects,
    ...(value.cleanup ? { cleanup: value.cleanup } : {}),
    nextActions: value.nextActions,
  };
}

export function inspectReleaseOrchestration(value: any, expectedTimelineIdentity: any = null): any  {
  if (value?.schemaVersion !== releaseOrchestrationSchema || !value.timeline || value.timelineIdentity !== value.timeline.identity) throw new Error('Release orchestration Result is invalid.');
  if (expectedTimelineIdentity !== null && value.timelineIdentity !== expectedTimelineIdentity) throw new Error('Release orchestration timeline identity does not match the expected identity.');
  compactReleasePhaseTimeline(value.timeline);
  return value;
}

// One private operation document retains intent and remote operation pointers.
// Every successful fact is still read from Git, Task or GitHub on continuation.
// It is not a task/workflow state store and never makes a public result true.
function operationFile(workspace: string, version: string): string {
  const git = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: workspace, encoding: 'utf8', timeout: 30_000 });
  if (git.status !== 0) throw new Error('Canonical release Workspace Git directory is unavailable.');
  return path.join(git.stdout.trim(), 'buildr', 'release-operations', `${version}.json`);
}

function writeOperation(file: string, value: any): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, file);
}

export function reconcilePublicationAfterPreparedContext(publication: any, context: any, previousRun: any): any {
  if (!publication?.requested || publication.contextIdentity === context.identity) return { publication, effect: null };
  if (!publication.contextIdentity || !publication.runId || !previousRun) throw new Error('Previous Publication identity is incomplete; preserve it until the matching run can be read back.');
  if (previousRun.status !== 'completed') throw new Error('Previous Publication run is still active; preserve it until terminal readback.');
  if (previousRun.conclusion === 'success') throw new Error('Previous Publication succeeded; reconcile its public facts instead of replacing the context.');
  return {
    publication: null,
    effect: {
      type: 'stale-publication-pointer-released',
      previousRunId: publication.runId,
      previousContextIdentity: publication.contextIdentity,
      currentContextIdentity: context.identity,
      previousConclusion: previousRun.conclusion,
      publicState: 'unpublished',
    },
  };
}

export function localArtifactHandoff(repo: string, candidate: any): any {
  if (!['macos', 'windows'].includes(candidate?.localRunner) || !/^[a-f0-9]{40,64}$/u.test(candidate?.sourceCommit ?? '')
    || !Number.isSafeInteger(candidate.runId) || candidate.runId < 1) return null;
  const root = path.join(repo, 'projects/product/services/buildr');
  const directory = path.join(root, 'build/verification/candidates', candidate.sourceCommit);
  const artifactDirectory = path.join(directory, 'candidate-package');
  const evidenceDirectory = path.join(directory, 'local-evidence');
  const args = [path.join(root, 'test/verification/artifact.ts'), '--artifact-dir', artifactDirectory, '--output', evidenceDirectory];
  return { runner: candidate.localRunner, artifactDirectory, evidenceDirectory,
    download: { command: 'gh', args: ['run', 'download', String(candidate.runId), '--repo', releasePublishAuthority.repository,
      '--name', 'candidate-package', '--dir', artifactDirectory] },
    checks: [{ node: '24.x-stable>=24.15.0', args }, { node: '24.15.0', args: [...args, '--scope', 'platform', '--node-tuple', 'minimum'] }],
    nextAction: '确认制包作业已上传原包后下载并在隔离环境验包；不必等待另一系统验包结束，不重新打包。' };
}

function observeReleaseRun(pointer: any, readRun: (runId: number) => any): any {
  if (!pointer?.runId) return { status: pointer?.requested || pointer?.dispatchRequested ? 'dispatch-unconfirmed' : 'not-requested', run: null };
  try {
    const runId = Number(pointer.runId);
    if (!Number.isSafeInteger(runId) || runId < 1) throw new Error('Stored release run identity is invalid.');
    const run = readRun(runId);
    if (Number(run.id) !== runId) throw new Error('Release run readback returned a different identity.');
    return { status: 'observed', run: { id: run.id, status: run.status, conclusion: run.conclusion,
      headSha: run.head_sha, runAttempt: run.run_attempt, url: run.html_url } };
  } catch (error: any) {
    const message = String(error.message ?? 'Release run readback failed.');
    return { status: 'unknown', run: null, diagnostic: error.diagnostic ?? { code: 'release-run-readback-failed',
      message: containsCredentialMaterial(message) ? 'Release run readback failed.' : message.slice(0, 2048) } };
  }
}

function preserveCandidatePreparation(workspace: string, key: string, selection: any, mainCommit: string, run: any, buildr: any, plugin: any, verificationInputs: any): any {
  const directory = candidatePreparationDirectory(workspace, key, { sourceCommit: selection.releaseHead, generation: selection.generation,
    run: { id: run.id, attempt: run.run_attempt } }, true);
  const retain = (name: string, bytes: Buffer) => {
    const file = path.join(directory, name);
    const parent = path.dirname(file);
    if (!fs.lstatSync(parent, { throwIfNoEntry: false })) fs.mkdirSync(parent);
    if (!fs.lstatSync(parent).isDirectory() || fs.lstatSync(parent).isSymbolicLink()) throw new Error('Retained Candidate package directory is an alias.');
    const existing = fs.lstatSync(file, { throwIfNoEntry: false });
    if (existing && (!existing.isFile() || !fs.readFileSync(file).equals(bytes))) throw new Error(`Retained Candidate file differs: ${name}`);
    if (!existing) fs.writeFileSync(file, bytes, { flag: 'wx', mode: 0o600 });
  };
  const json = (name: string, value: any) => retain(name, Buffer.from(`${JSON.stringify(value, null, 2)}\n`));
  const artifacts: any = {};
  for (const [name, owned] of Object.entries({ buildr, 'dsh-plugin': plugin }) as any) {
    if (!owned) continue;
    const manifest = name === 'buildr' ? owned.manifest : owned.candidate ?? owned.aggregate.candidate;
    if (!Buffer.isBuffer(owned.tarballBytes) || path.basename(manifest.filename) !== manifest.filename
        || crypto.createHash('sha256').update(owned.tarballBytes).digest('hex') !== manifest.sha256
        || `sha512-${crypto.createHash('sha512').update(owned.tarballBytes).digest('base64')}` !== manifest.integrity) {
      throw new Error(`Verified ${name} Candidate original bytes are unavailable for retention.`);
    }
    retain(`${name}/${manifest.filename}`, owned.tarballBytes);
    json(`${name}/${name === 'buildr' ? releaseArtifactManifestName : 'candidate.json'}`, manifest);
    artifacts[name] = name === 'dsh-plugin' ? owned.aggregate.candidate : manifest;
  }
  const snapshot = { selection: { identity: selection.selectionIdentity, sourceCommit: selection.releaseHead, sourceTree: selection.releaseTree,
    generation: selection.generation, mainCommit }, run: { id: run.id, attempt: run.run_attempt }, artifacts,
    buildr: buildr ? { aggregate: buildr.aggregate, manifest: buildr.manifest } : null, plugin: plugin?.aggregate ?? null, verificationInputs };
  json('preparation-evidence.json', snapshot);
  return { ...snapshot.selection, directory, snapshotIdentity: identity(snapshot), run: snapshot.run, artifacts,
    status: 'verified', cleanup: 'pending' };
}

function readPreparedCandidate(workspace: string, state: any, selection: any): any {
  const prepared = state.preparation;
  if (!prepared || selection.status !== 'frozen' || prepared.identity !== selection.selectionIdentity
      || prepared.sourceCommit !== selection.releaseHead || prepared.sourceTree !== selection.releaseTree
      || prepared.generation !== selection.generation || state.candidate?.runId !== prepared.run.id
      || state.candidate?.sourceCommit !== prepared.sourceCommit) throw new Error('Completed preparation differs from the current frozen selection; explicitly prepare the changed selection.');
  const expectedDirectory = prepared.directory;
  const snapshot = readCandidatePreparationSnapshot(workspace, state.targets?.selectionId ?? state.version, prepared);
  if (snapshot.buildr) {
    const owned = readReleaseArtifact(path.join(expectedDirectory, 'buildr', releaseArtifactManifestName));
    if (JSON.stringify(owned.manifest) !== JSON.stringify(snapshot.buildr.manifest)) throw new Error('Retained main package manifest changed.');
    assertReleaseConsumptionCoverage(snapshot.buildr.aggregate, { sourceCommit: prepared.sourceCommit, sourceTree: prepared.sourceTree }, owned.manifest);
  }
  if (snapshot.plugin) {
    assertPluginSourceAggregate(snapshot.plugin, state.candidatePlan, prepared.run.id, prepared.run.attempt);
    const bytes = fs.readFileSync(path.join(expectedDirectory, 'dsh-plugin', snapshot.plugin.candidate.filename));
    if (crypto.createHash('sha256').update(bytes).digest('hex') !== snapshot.plugin.candidate.sha256) throw new Error('Retained plugin bytes changed.');
  }
  return snapshot;
}

function finishCandidatePreparation(workspace: string, state: any, selection: any, snapshot: any, owners: any): any {
  const prepared = state.preparation, taskId = `release-${state.targets?.selectionId ?? state.version}`;
  const { runtime, controller, invoke, save, effects, git } = owners;
  let stage = 'materials';
  const call = (args: string[]) => {
    const value = invoke(controller, [...args, '--target', workspace, '--json']);
    effects.push(...(value.effects ?? []));
    if (value.status === 'blocked' || value.diagnostic) throw Object.assign(new Error(value.diagnostic?.message ?? 'Preparation closeout owner did not complete.'), { ownerResult: value });
    return value;
  };
  const input = (name: string, value: string) => {
    candidatePreparationDirectory(workspace, state.targets?.selectionId ?? state.version, prepared);
    const file = path.join(prepared.directory, `${name}-${identity(value).slice(7, 23)}`);
    const stat = fs.lstatSync(file, { throwIfNoEntry: false });
    if (stat && (!stat.isFile() || stat.isSymbolicLink() || fs.readFileSync(file, 'utf8') !== value)) throw new Error('Preparation input file changed or is an alias.');
    if (!stat) fs.writeFileSync(file, value, { flag: 'wx', mode: 0o600 });
    return file;
  };
  try {
    const materialPath = 'candidate-preparation.md', materialId = 'candidate-preparation';
    const content = `# 候选准备结果\n\n源码：${prepared.sourceCommit}\n\n源码树：${prepared.sourceTree}\n\n候选运行：${prepared.run.id}，第 ${prepared.run.attempt} 次。\n\n${Object.entries(prepared.artifacts).map(([name, artifact]: any) => `${name}：${artifact.version}，SHA-256 ${artifact.sha256}`).join('\n\n')}\n\n所选必需源码与原包覆盖已通过；完整来源和复用保留在 ${path.relative(workspace, prepared.directory)}/preparation-evidence.json。\n\n本次到验包结束，未授权或执行公开；原包、证据和冻结来源保留，任务结束不表示已公开。\n`;
    const materials = call(['task', 'materials', 'inspect', taskId]);
    const reference = materials.materials?.documents?.find((item: any) => item.id === materialId);
    if (reference && (reference.source.kind !== 'task' || reference.source.path !== materialPath)) throw new Error('Preparation material identity is already used by another document.');
    const existing = path.join(workspace, '.buildr/local/task-materials', taskId, materialPath);
    const stat = fs.lstatSync(existing, { throwIfNoEntry: false });
    if (stat && (!stat.isFile() || stat.size > 512 * 1024 || fs.readFileSync(existing, 'utf8') !== content)) throw new Error('Preparation material changed; preserve it and resolve the document conflict.');
    if (!stat) call(['task', 'materials', 'write', taskId, '--path', materialPath, '--content', input('preparation-material.md', content), '--expected-document', 'absent']);
    if (!reference) call(['task', 'materials', 'record', taskId, '--materials', input('preparation-materials.json', JSON.stringify({
      schemaVersion: 'buildr.task-materials/v2', documents: [...(materials.materials?.documents ?? []),
        { id: materialId, role: 'delivery', title: '候选准备与验包结果', source: { kind: 'task', path: materialPath } }],
    })), '--expected-current', materials.materialsDigest]);
    prepared.materials = 'recorded'; save();
    stage = 'report';
    const checks: any[] = [];
    if (snapshot.buildr) {
      const evidenceIds = new Set(snapshot.buildr.aggregate.evidenceIds);
      for (const [kind, testing, ids] of [
        ['source', 'buildr-source', CANDIDATE_CI_SHARDS.filter((item: any) => !item.requiresArtifact && !item.producesArtifact).map((item: any) => item.id)],
        ['artifact', 'buildr-artifact', [...CANDIDATE_CI_SHARDS.filter((item: any) => item.requiresArtifact || item.producesArtifact), ...CANDIDATE_CI_HOST_NODE_TUPLES].map((item: any) => item.id)],
      ] as any) checks.push({ id: `candidate-${kind}`, project: 'product', testing, selection: 'full', targets: ids.filter((id: string) => evidenceIds.has(id)),
        source: 'command', outcome: 'passed', summary: `准确候选 ${prepared.run.id}/${prepared.run.attempt} 的完整 ${kind} 覆盖通过，原始来源及复用记录保留。` });
    }
    if (snapshot.plugin) checks.push({ id: 'candidate-plugin', project: 'product', service: 'dsh-plugin', testing: 'dsh-plugin', selection: 'full',
      targets: snapshot.plugin.verification.checks, source: 'command', outcome: 'passed', summary: '冻结插件原包、完整验证及准确主包对端通过；未执行插件公开或桌面交互验收。' });
    const report = { contentIdentity: prepared.snapshotIdentity, contentSummary: `冻结 ${prepared.sourceCommit}、源码树 ${prepared.sourceTree} 与同一原包。`, checks, gaps: [],
      conclusion: { outcome: 'passed', summary: '本次准备范围的必需源码与原包覆盖通过，公开不属于本次准备完成结论。' } };
    const observed = call(['task', 'verification', 'inspect', taskId, '--content-identity', prepared.snapshotIdentity]);
    if (observed.slot?.report?.content?.identity !== prepared.snapshotIdentity || observed.slot.report.conclusion?.outcome !== 'passed') {
      const task = runtime.inspectTask(workspace, taskId);
      if (task.record.status !== 'active') throw new Error('Completed preparation is missing its matching formal report; preserve the completed Task and correct its facts explicitly.');
      const recorded = call(['task', 'verification', 'record', taskId, '--report', input('preparation-report.json', JSON.stringify(report)),
        '--expected-report', observed.slot?.present ? observed.slot.reportDigest : 'absent']);
      if (recorded.status !== 'recorded' || recorded.slot?.report?.conclusion?.outcome !== 'passed') throw new Error('Preparation report registration was not confirmed.');
    }
    prepared.report = 'recorded'; save();
    stage = 'task';
    let task = runtime.inspectTask(workspace, taskId);
    if (task.record.status === 'active') {
      call(['task', 'complete', taskId, '--summary', '冻结候选的源码检查与同一原包验包已完成；原包、证据和冻结来源保留，尚未公开。', '--expected-record', task.recordDigest]);
      task = runtime.inspectTask(workspace, taskId);
    }
    if (task.record.status !== 'completed') throw new Error('Preparation Task completion was not confirmed.');
    prepared.taskRegistration = 'completed'; save();
    stage = 'cleanup';
    readPreparedCandidate(workspace, state, inspectReleaseSelection({ selectionId: state.targets?.selectionId, targets: state.targets,
      version: state.targets?.versions.buildr ?? state.version, repo: workspace, devRef: 'origin/dev' }));
    const branch = `codex/${taskId}`, checkout = path.join(workspace, '.worktrees', taskId);
    if (prepared.cleanup !== 'cleaned' && fs.existsSync(checkout) && !path.relative(checkout, fileURLToPath(import.meta.url)).startsWith('..')) {
      prepared.cleanup = 'after-owner-exit'; prepared.cleanupRequested = true; save();
      return { status: 'candidate-verified', nextActions: [`当前执行器退出后，以保留入口执行 worktree cleanup ${taskId} --expected-source workspace=${prepared.sourceCommit} --delivered-ref workspace=${prepared.sourceCommit} --target ${workspace} --json；保留 release 和冻结引用，再继续同一 prepare --stop-after candidate 或 resume 确认收尾完成。`] };
    }
    if (prepared.cleanup !== 'cleaned') {
      const listed = git(['worktree', 'list', '--porcelain']);
      const ownedBranch = git(['for-each-ref', '--format=%(objectname)', `refs/heads/${branch}`]);
      const provider = runtime.inspectGitWorktrees({ workspaceRoot: workspace, taskId });
      if (fs.existsSync(checkout) || listed.split(/\r?\n/u).includes(`worktree ${checkout}`) || ownedBranch || provider.evidencePath) {
        prepared.cleanupRequested = true; save();
        const cleaned = call(['worktree', 'cleanup', taskId, '--expected-source', `workspace=${prepared.sourceCommit}`, '--delivered-ref', `workspace=${prepared.sourceCommit}`]);
        if (cleaned.status !== 'cleaned') throw new Error('Preparation worktree cleanup was not confirmed.');
      } else if (!prepared.cleanupRequested || provider.status !== 'absent' && provider.diagnostic?.code !== 'git_worktree_evidence_missing') throw new Error('Preparation cleanup provider readback is unresolved.');
      prepared.cleanup = 'cleaned'; save();
    }
    prepared.status = 'completed'; save();
    return { status: 'candidate-verified', nextActions: [] };
  } catch (error: any) {
    save();
    return { status: `candidate-${stage}-closeout-required`, diagnostic: { code: `candidate-${stage}-closeout-required`, message: error.message },
      ownerResult: error.ownerResult, nextActions: [`只恢复候选准备的 ${stage}；继续同一 prepare --stop-after candidate 或 resume，保留检查、原包和冻结选择，不重跑候选。`] };
  }
}

export async function waitForReleaseMainPullRequest(options: any, dependencies: any = {}): Promise<any> {
  const now = dependencies.now ?? Date.now;
  const sleep = dependencies.sleep ?? ((ms: number) => new Promise(resolve => setTimeout(resolve, ms)));
  const startedAt = now(), deadline = startedAt + 30_000;
  const execute = dependencies.execute ?? spawnSync;
  let pullRequest: any = null, checks: any[] = [];
  const finish = (status: string, diagnostic?: any) => ({ status, pullRequest, checks, durationMs: now() - startedAt,
    ...(diagnostic ? { diagnostic } : {}) });
  const read = (args: string[]) => {
    const value = execute(options.ghCommand || 'gh', args, { cwd: options.repo, encoding: 'utf8',
      timeout: Math.max(1, deadline - now()), maxBuffer: 1024 * 1024 });
    if (!value.error && args[1] === 'checks' && value.status === 1 && !String(value.stdout || '').trim()
        && /^no (?:required )?checks reported on the '[^'\r\n]+' branch$/u.test(String(value.stderr || '').trim())) return [];
    let parsed: any;
    try { parsed = JSON.parse(String(value.stdout || '')); } catch { /* report the bounded command cause below */ }
    // gh pr checks uses 8 for pending and 1 for completed failing checks.
    if (value.error || parsed === undefined || (value.status !== 0 && !(args[1] === 'checks' && [1, 8].includes(value.status)))) {
      throw Object.assign(new Error('Protected pull request readback failed.'), {
        diagnostic: releaseCommandDiagnostic(options.ghCommand || 'gh', args, value),
      });
    }
    return parsed;
  };
  try {
    while (true) {
      if (pullRequest && now() >= deadline) return finish('pending');
      pullRequest = read(['pr', 'view', options.url, '--repo', releasePublishAuthority.repository, '--json',
        'state,headRefOid,headRefName,baseRefName,url,mergeStateStatus,mergeable,isDraft']);
      if (pullRequest.headRefOid !== options.sourceCommit || pullRequest.headRefName !== options.branch
          || pullRequest.baseRefName !== 'main' || pullRequest.url !== options.url) {
        return finish('blocked', { code: 'release-main-pr-head-drift', message: 'Protected pull request no longer matches the frozen release.' });
      }
      if (pullRequest.state === 'MERGED') return finish('ready');
      if (pullRequest.state !== 'OPEN' || pullRequest.isDraft || ['DIRTY', 'BEHIND'].includes(pullRequest.mergeStateStatus)) {
        return finish('blocked', { code: 'release-main-pr-not-mergeable', message: 'Protected pull request needs its reported conflict, base or draft condition resolved.' });
      }
      checks = read(['pr', 'checks', options.url, '--repo', releasePublishAuthority.repository, '--required', '--json', 'name,state,bucket,link']);
      if (!Array.isArray(checks) || checks.some(check => !['pass', 'fail', 'pending', 'skipping', 'cancel'].includes(check.bucket))) {
        throw new Error('Protected pull request checks returned an unknown result.');
      }
      if (checks.some(check => ['fail', 'cancel'].includes(check.bucket))) {
        return finish('blocked', { code: 'release-main-required-check-failed', message: 'A required protected pull request check failed or was cancelled; diagnose that check only.' });
      }
      // This release owner targets protected Buildr main, which requires a
      // Candidate gate. A new PR can briefly look clean before checks register.
      if (checks.length > 0 && !checks.some(check => check.bucket === 'pending') && ['CLEAN', 'UNSTABLE'].includes(pullRequest.mergeStateStatus)
          && pullRequest.mergeable === 'MERGEABLE') return finish('ready');
      const remaining = deadline - now();
      if (remaining <= 0) return finish('pending');
      await sleep(Math.min(3_000, remaining));
    }
  } catch (error: any) {
    return finish('unknown', error.diagnostic ?? { code: 'release-main-pr-readback-failed', message: error.message });
  }
}

export async function runReleaseOperation(options: any, dependencies: any = {}): Promise<any> {
  let action = options.action;
  if (options.stopAfter !== undefined && (options.stopAfter !== 'candidate' || action !== 'prepare')) throw new Error('--stop-after candidate is only supported by prepare.');
  const stopAfterCandidate = options.stopAfter === 'candidate';
  if (options.recoverPublication === true && (action !== 'resume' || options.authorized !== true)) throw new Error('Publication executor recovery requires explicit resume --recover-publication --authorized.');
  if (!['prepare', 'inspect', 'publish', 'resume'].includes(action)) throw new Error('Release operation must be prepare, inspect, publish or resume.');
  const targets = normalizeReleaseTargets({ packages: options.packages, version: options.version, pluginVersion: options.pluginVersion, selectionId: options.selectionId });
  const key = targets.selectionId;
  if (!options.workspace) throw new Error('Release operation requires --workspace <canonical-workspace>.');
  const workspace = fs.realpathSync(path.resolve(options.workspace));
  const file = operationFile(workspace, key);
  const saved = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
  const metadataFile = path.join(workspace, 'projects/product/services/buildr/package.json');
  const declaresCompatibility = fs.existsSync(metadataFile) && Object.hasOwn(JSON.parse(fs.readFileSync(metadataFile, 'utf8')), 'buildrCompatibility');
  const explicitTargets = options.packages !== undefined || options.pluginVersion !== undefined || options.selectionId !== undefined;
  const scoped = saved ? Boolean(saved.targets) : explicitTargets || declaresCompatibility;
  if (saved && (saved.workspace !== workspace || (saved.targets
      ? JSON.stringify(saved.targets) !== JSON.stringify(targets) : saved.version !== options.version || explicitTargets))) throw new Error('Release operation identity conflicts with the requested Workspace, targets or versions.');
  const selectionArgs = scoped ? { version: targets.versions.buildr ?? null, selectionId: key, targets } : { version: options.version };
  let state: any = saved ?? { schemaVersion: scoped ? 'buildr.release-operation-input/v2' : 'buildr.release-operation-input/v1',
    version: targets.versions.buildr ?? null, ...(scoped ? { targets } : {}), workspace, sources: [], candidate: null, publication: null };
  const currentEffects: any[] = [];
  let phase = action === 'publish' ? 'publication' : 'preflight';
  const operationStartedAt = Date.now();
  const execute = dependencies.execute ?? ((command: string, args: string[], spawnOptions: any) => spawnSync(command, args, { timeout: 30_000, ...spawnOptions, encoding: 'utf8' }));
  const command = (executable: string, args: string[], cwd = workspace) => {
    const timeout = executable === (options.ghCommand || 'gh') && args.includes('--log-failed') ? 90_000 : 30_000;
    const value = execute(executable, args, { cwd, timeout, maxBuffer: 8 * 1024 * 1024 });
    if (value.status !== 0 || value.error) {
      const diagnostic = releaseCommandDiagnostic(executable, args, value);
      throw Object.assign(new Error(`${executable} ${args[0]} failed: ${diagnostic.stderr || diagnostic.message || diagnostic.exitCode}`), { diagnostic });
    }
    return String(value.stdout || '').trim();
  };
  const git = (args: string[], cwd = workspace) => command('git', args, cwd);
  const gh = (args: string[], cwd = workspace) => command(options.ghCommand || 'gh', args, cwd);
  const readRun = (runId: number) => JSON.parse(gh(['api', `repos/${releasePublishAuthority.repository}/actions/runs/${runId}`]));
  const save = () => writeOperation(file, state);
  const packageDependencies = { ...dependencies.orchestrationDependencies, ...dependencies.packageDependencies,
    execute, runtime: dependencies.runtime, resolveRetainedController: dependencies.resolveRetainedController ?? resolveRetainedController,
    invokeRetainedController: dependencies.invokeRetainedController ?? defaultInvokeRetained,
    readCandidateEvidence: (runId: number) => readCandidateEvidence({ candidateRunId: runId, ghCommand: options.ghCommand || 'gh', repo: state.executionRoot ?? workspace, execute, dependencies: dependencies.candidateDependencies }),
  };
  const packageScope = () => ({ state, workspace, save, effects: currentEffects, execute, git, gh, readRun, ghCommand: options.ghCommand });
  const legacyRetryCompatibility = async () => {
    const runId = state.candidate?.runId ?? state.context?.candidate?.runId ?? state.transaction?.candidateRunId;
    if (!runId) return !declaresCompatibility;
    const original = packageDependencies.readCandidateEvidence(runId);
    if (!original.packageArtifact?.compatibility) return original.packageArtifact ? true : !declaresCompatibility;
    if (original.packageArtifact.integrity !== state.context.artifact?.integrity || original.packageArtifact.artifactSha256 !== state.context.artifact?.sha256
        || original.packageArtifact.sourceCommit !== state.context.release?.sourceCommit) throw new Error('Legacy retry Candidate differs from original authorized bytes.');
    const compatibility = await evaluateObservedPackagePlan(targets, { buildr: { artifact: original.packageArtifact, bytes: original.tarballBytes } },
      await observePackageCounterparts(packageDependencies), packageDependencies);
    state.compatibility = compatibility; save();
    return compatibility.status === 'passed';
  };
  const answer = (status: string, nextActions: string[] = [], extra: any = {}) => {
    if (options.detail !== 'full') {
      const { result: _result, run, selection, ...rest } = extra;
      extra = { ...rest,
        ...(run ? { run: { id: run.id, status: run.status, conclusion: run.conclusion, headSha: run.head_sha ?? run.headSha, url: run.html_url ?? run.url } } : {}),
        ...(selection ? { selection: { status: selection.status, releaseHead: selection.releaseHead, generation: selection.generation, diagnostic: selection.diagnostic } } : {}),
      };
    }
    return {
    schemaVersion: 'buildr.release-operation-result/v1', action, status, version: targets.versions.buildr ?? null,
    ...(scoped ? { selectionId: key, targets, compatibility: state.compatibility ?? null, packagePublications: state.packagePublications ?? {} } : {}),
    baseline: state.baseline ?? null, selectedSources: state.sources, sourceCommit: state.sourceCommit ?? null,
    candidate: state.candidate, publication: state.publication, contextIdentity: state.context?.identity ?? null,
    cleanupPlan: state.context ? { policy: state.publication?.requested ? state.publication.cleanupAuthorization?.policy ?? 'retain-formal-release-branch' : 'delete-owned-release-branches/v2',
      remoteBranches: [`release-${key}`, scoped || !state.publication?.requested || state.publication.cleanupAuthorization?.policy === 'delete-owned-release-branches/v2'
        ? `codex/release-main-${key}-g*` : releaseCarrierBranchFor(key, state.context.selection.generation)],
      retainedTag: targets.packages.includes('buildr') ? `v${targets.versions.buildr}` : null } : null,
    effects: currentEffects, nextActions, ...extra,
    recovery: releaseRecoveryPlan(phase, status, state, nextActions), operationDurationMs: Date.now() - operationStartedAt,
    };
  };
  const take = (value: any) => {
    currentEffects.push(...(value.effects || []));
    if (!['passed', 'ready', 'created', 'inspected', 'updated', 'reused'].includes(value.status)) throw Object.assign(new Error(value.diagnostic?.message || value.nextActions?.join(' ') || 'Release owner did not complete.'), { ownerResult: value });
    return value;
  };
  if (action === 'inspect') {
    const selection = inspectReleaseSelection({ ...selectionArgs, repo: workspace, devRef: 'origin/dev' });
    const runObservation = observeReleaseRun(state.publication?.runId ? state.publication : state.candidate, readRun);
    const packagePublications = scoped ? Object.fromEntries(targets.packages.map(name => {
      const pointer = state.packagePublications?.[name];
      // These are current run observations, not publication evidence. Inspection
      // never advances pointers, dispatches work, or rewrites prior public facts.
      return [name, { ...(pointer ?? {}), runObservation: observeReleaseRun(pointer, readRun) }];
    })) : null;
    return answer('inspected', ['按当前运行终态继续同一prepare或resume。'], { selection,
      run: runObservation.status === 'observed' ? runObservation.run : null, runObservation,
      ...(packagePublications ? { packagePublications } : {}) });
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const lock = `${file}.lock`;
  try { fs.writeFileSync(lock, `${process.pid}\n`, { flag: 'wx', mode: 0o600 }); }
  catch {
    const pid = Number(fs.readFileSync(lock, 'utf8').trim());
    try { process.kill(pid, 0); throw new Error('Another process owns this release operation.'); }
    catch (error: any) {
      if (error.code !== 'ESRCH') throw error;
      fs.unlinkSync(lock);
      fs.writeFileSync(lock, `${process.pid}\n`, { flag: 'wx', mode: 0o600 });
    }
  }
  try {
    if (fs.existsSync(file)) state = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (scoped && JSON.stringify(state.targets) !== JSON.stringify(targets)) throw new Error('Stored release targets changed while acquiring the operation lock.');
    if (stopAfterCandidate && (state.publicationAuthorization || state.publication?.requested || state.publicationEvidence
        || Object.values(state.packagePublications ?? {}).some((value: any) => value.requested || value.runId || value.evidence))) {
      return answer('blocked', ['此选择已有公开授权或公开请求；只读检查原事实，为新候选使用独立选择。'], {
        diagnostic: { code: 'candidate-only-publication-conflict', message: 'Candidate-only preparation cannot resume an authorized or requested publication.' },
      });
    }
    const preparationInputChanged = state.preparation && ((options.baseline && git(['rev-parse', `${options.baseline}^{commit}`]) !== state.baseline)
      || (options.sources ?? []).some((ref: string) => !state.sources.includes(git(['rev-parse', `${ref}^{commit}`]))));
    if (state.preparation && (options.verificationSource || options.sourceVerification || options.artifactVerification)) {
      const snapshot = readCandidatePreparationSnapshot(workspace, key, state.preparation);
      let different = Boolean(options.verificationSource && git(['rev-parse', `${options.verificationSource}^{commit}`]) !== snapshot.verificationInputs.sourceCommit);
      if (options.sourceVerification) {
        const { readVerificationReuseBundle } = await import('../../../projects/product/services/buildr/test/verification/verification-reuse.ts');
        const { encodeCandidateSourceImport } = await import('../../../projects/product/services/buildr/test/verification/candidate-source-reuse.ts');
        different ||= identity(encodeCandidateSourceImport(readVerificationReuseBundle(options.sourceVerification))) !== snapshot.verificationInputs.source;
      }
      if (options.artifactVerification) {
        const { readCandidateArtifactImports, encodeCandidateArtifactImport } = await import('../../../projects/product/services/buildr/test/verification/candidate-artifact-reuse.ts');
        different ||= identity(encodeCandidateArtifactImport(readCandidateArtifactImports(options.artifactVerification))) !== snapshot.verificationInputs.artifact;
      }
      if (different) {
        if ((dependencies.runtime ?? createReleaseToolRuntime()).inspectTask(workspace, `release-${key}`).record?.status === 'active') {
          state.preparationHistory = [...(state.preparationHistory ?? []), state.preparation]; state.preparation = null; save();
        } else return answer('blocked', ['保留已完成准备；验证来源或导入已改变，先明确恢复活动准备再补验，不忽略本次显式输入。'], {
          diagnostic: { code: 'completed-preparation-verification-changed', message: 'Completed preparation verification inputs changed; explicitly restore active preparation before adopting new proof.' },
        });
      }
    }
    if (preparationInputChanged && (dependencies.runtime ?? createReleaseToolRuntime()).inspectTask(workspace, `release-${key}`).record?.status === 'completed') {
      return answer('blocked', ['已完成准备仅消费原冻结选择；先明确恢复活动准备，再选入新源码或重定基线。'], {
        diagnostic: { code: 'completed-preparation-selection-changed', message: 'Completed preparation cannot select new source or baseline; explicitly restore active preparation.' },
      });
    }
    if (state.preparation && !preparationInputChanged && (stopAfterCandidate || action === 'resume' && !state.preparation.adoptionRequested)
        && !state.publicationAuthorization && !state.publication?.requested && !state.publicationEvidence) {
      phase = 'candidate-closeout';
      const selection = inspectReleaseSelection({ ...selectionArgs, repo: workspace, devRef: 'origin/dev' });
      const snapshot = readPreparedCandidate(workspace, state, selection);
      const runtime = dependencies.runtime ?? createReleaseToolRuntime();
      const completed = finishCandidatePreparation(workspace, state, selection, snapshot, { runtime,
        controller: (dependencies.resolveRetainedController ?? resolveRetainedController)(workspace),
        invoke: dependencies.invokeRetainedController ?? defaultInvokeRetained, save, effects: currentEffects, git });
      return answer(completed.status, completed.nextActions, { ...completed, stopAfter: 'candidate', sourceTree: selection.releaseTree,
        artifacts: snapshot.artifacts, preparationCloseout: state.preparation });
    }
    if (action === 'resume' && state.preparation?.adoptionRequested && !state.context && !state.publicationAuthorization && !state.publication?.requested) action = 'prepare';
    if (scoped && (action === 'publish' || action === 'resume' || (action === 'prepare' && (state.publicationAuthorization || Object.values(state.packagePublications ?? {}).some((value: any) => value.requested))))) {
      if (action === 'prepare') action = 'resume';
      const continued = await continuePackageRelease({ ...options, action }, packageScope(), packageDependencies);
      save(); return answer(continued.status, continued.nextActions, continued);
    }
    // Real legacy records retain their successful observations and authorization.
    // They cannot authorize a fresh publication of newly declared package bytes.
    if (!scoped && action === 'publish' && !state.publication?.requested && declaresCompatibility) return answer('preparation-required', ['此历史操作缺少逐包兼容证据；先迁移准确选择与候选，再授权新的公开写入。']);
    if (!scoped && action === 'publish' && !state.publication?.requested && state.candidate?.runId) {
      const original = packageDependencies.readCandidateEvidence(state.candidate.runId);
      if (original.packageArtifact?.compatibility) return answer('preparation-required', ['冻结主包已声明兼容契约，历史操作需迁移逐包证据后才能新增公开写入。']);
    }
    let observedPublicationRun: any = null;
    if (action === 'prepare' && state.publication?.requested) {
      observedPublicationRun = state.publication.runId ? readRun(state.publication.runId) : null;
      // A dispatched or successful release owns its existing recovery path.
      // A terminal failure may still be repaired only after the unpublished
      // observation below proves that it created no public release facts.
      if (!observedPublicationRun || observedPublicationRun.status !== 'completed' || observedPublicationRun.conclusion === 'success') action = 'resume';
    }
    if (action === 'publish' && state.publication?.requested) action = 'resume';
    if (action === 'publish') {
      if (options.authorized !== true || !state.context || !state.transaction) return answer('authorization-required', ['先完成prepare，再对展示的版本与内容明确授权发布。']);
      git(['fetch', '--no-tags', 'origin', 'refs/heads/dev:refs/remotes/origin/dev', 'refs/heads/main:refs/remotes/origin/main']);
      currentEffects.push({ type: 'remote-refs-refreshed', refs: ['origin/dev', 'origin/main'] });
      const previous = dependencies.orchestrationDependencies ?? {};
      const transactionDependencies = { ...previous.transactionDependencies,
        onDispatchIntent: (intent: any) => { state.publication = { requested: true, releaseId: intent.releaseId, contextIdentity: intent.contextIdentity, runId: null,
          cleanupAuthorization: { policy: 'delete-owned-release-branches/v2', contextIdentity: intent.contextIdentity } }; writeOperation(file, state); },
        onDispatchObserved: (run: any) => { state.publication = { ...state.publication, requested: true, runId: run.runId, contextIdentity: state.context.identity }; writeOperation(file, state); },
      };
      const dispatched = await runReleaseOrchestration({ action: 'dispatch', version: options.version, releaseTask: `release-${options.version}`, publicationAuthorized: true,
        expectedContextDigest: state.context.identity, transaction: state.transaction }, { ...previous, transactionDependencies });
      currentEffects.push(...dispatched.effects);
      const run = dispatched.steps?.find((item: any) => item.operation === 'dispatch');
      const runId = run?.runId ?? dispatched.publishRunId ?? null;
      if (runId) state.publication = { ...state.publication, requested: true, runId, contextIdentity: state.context.identity };
      writeOperation(file, state);
      return answer(dispatched.status, dispatched.nextActions, { result: dispatched });
    }
    if (action === 'resume' && state.publication?.requested && !state.publication.runId) {
      const title = `Release ${options.version} (${state.publication.releaseId || state.context.identity.slice(7, 31)})`;
      const runs = JSON.parse(gh(['run', 'list', '--repo', releasePublishAuthority.repository, '--workflow', 'publish.yml', '--event', 'workflow_dispatch', '--limit', '100', '--json', 'databaseId,displayTitle,headSha']));
      const run = runs.find((item: any) => item.displayTitle === title && item.headSha === state.context.convergence.mainCommit);
      if (!run) return answer('publication-dispatch-unconfirmed', ['继续回读同一发布请求；不把响应丢失当成未派发。']);
      state.publication.runId = run.databaseId;
      writeOperation(file, state);
    }
    if (action === 'resume' && state.publication?.runId) {
      const run = observedPublicationRun ?? readRun(state.publication.runId);
      if (run.status !== 'completed') return answer('publication-running', ['等待当前发布运行；不重复派发。'], { run });
      if (run.conclusion !== 'success') {
        if (state.publication.retryRequested && Number(run.run_attempt) < 2) return answer('publication-retry-unconfirmed', ['回读同一运行的新attempt；不重复重跑请求。']);
        const failure = classifyCandidateFailure(gh(['run', 'view', String(run.id), '--repo', releasePublishAuthority.repository, '--log-failed']));
        if (failure !== 'transient' || Number(run.run_attempt) >= 2) return answer('diagnosis-required', ['读取发布步骤证据并诊断失败；已成立公开事实必须保留。'], { run });
        if (!await legacyRetryCompatibility()) return answer('compatibility-blocked', ['原事实保留；新增重跑前需准确候选字节及当前公开对端兼容证据。'], { run });
        const effect = { type: 'publication-failed-jobs-rerun', runId: run.id, previousAttempt: run.run_attempt, state: 'unknown' };
        currentEffects.push(effect);
        state.publication.retryRequested = true;
        writeOperation(file, state);
        gh(['run', 'rerun', String(run.id), '--failed', '--repo', releasePublishAuthority.repository]);
        effect.state = 'confirmed';
        return answer('publication-running', ['等待同一运行的新attempt终态。']);
      }
      const cleanupAuthorized = ['delete-owned-release-branches/v1', 'delete-owned-release-branches/v2'].includes(state.publication.cleanupAuthorization?.policy)
        && state.publication.cleanupAuthorization?.contextIdentity === state.publication.contextIdentity
        && state.publication.contextIdentity === state.context?.identity;
      const closed = await runReleaseOrchestration({ action: 'closeout', version: options.version, releaseTask: `release-${options.version}`, publishRunId: state.publication.runId,
        expectedContextDigest: state.publication.contextIdentity,
        closeoutProgress: state.closeout?.progress,
        repo: workspace, canonicalWorkspace: workspace, remote: 'origin', agent: options.agent || 'codex', authorizeCarrierCleanup: true, authorizeLocalSelectionCleanup: true,
        authorizeRemoteDelete: cleanupAuthorized,
        cleanupPolicy: cleanupAuthorized ? state.publication.cleanupAuthorization.policy : undefined,
        ghCommand: options.ghCommand }, { ...dependencies.orchestrationDependencies,
          onCloseoutProgress: (progress: any) => { state.closeout = { ...state.closeout, progress }; save(); },
        });
      currentEffects.push(...closed.effects);
      state.closeout = { status: closed.status, outcomes: closed.outcomes, progress: closed.closeoutProgress };
      writeOperation(file, state);
      return answer(closed.status, closed.nextActions, { outcomes: closed.outcomes, cleanup: closed.cleanup, result: closed });
    }
    if (!scoped && declaresCompatibility) return answer('preparation-required', ['此历史操作需迁移到逐包选择后重新准备；原请求和已成立公开事实继续保留。']);
    // The explicit selection is resolved once. Later dev changes never become
    // additional release content unless the caller selects their exact commits.
    git(['fetch', '--no-tags', 'origin', 'refs/heads/dev:refs/remotes/origin/dev', 'refs/heads/main:refs/remotes/origin/main']);
    currentEffects.push({ type: 'remote-refs-refreshed', refs: ['origin/dev', 'origin/main'] });
    const existingSelection = inspectReleaseSelection({ ...selectionArgs, repo: workspace, devRef: 'origin/dev' });
    const baseline = git(['rev-parse', '--verify', `${options.baseline || state.baseline || existingSelection.devBaseline || 'origin/dev'}^{commit}`]);
    if (state.baseline && state.baseline !== baseline) throw new Error('Existing release baseline differs; select a deliberate replacement before changing it.');
    state.baseline = baseline;
    const sources = (options.sources || []).map((ref: string) => git(['rev-parse', '--verify', `${ref}^{commit}`]));
    state.sources = [...new Set([...state.sources, ...sources])];
    state.supportTasks = options.supportTasks || state.supportTasks || [];
    writeOperation(file, state);
    if (targets.packages.includes('buildr')) {
      const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || command(options.ghCommand || 'gh', ['auth', 'token']);
      const publicState = await (dependencies.observeUnpublishedRelease ?? observeUnpublishedRelease)(targets.versions.buildr, { token, ...dependencies.observationOptions });
      if (publicState.status !== 'unpublished') return answer('public-state-blocked', ['先核实当前公开事实或活动发布运行；不改变已发布集合。'], { publicState });
    }
    if (scoped && targets.packages.includes('dsh-plugin')) {
      const observe = packageDependencies.observePublishedPackageArtifact ?? observePublishedPackageArtifact;
      const plugin = await observe('dsh-plugin', { ...packageDependencies.observationOptions, version: targets.versions['dsh-plugin'] });
      if (plugin.observation.status !== 'absent') return answer('public-state-blocked', ['核对所选插件版本公开事实；不替换已公开或未知的包。'], { publicState: plugin.observation });
      if (!targets.packages.includes('buildr') && !state.preparationPeer) {
        const peer = await observe('buildr', packageDependencies.observationOptions ?? {});
        if (peer.observation.status !== 'present') return answer('peer-observation-blocked', ['核对准确公开主包对端；不要求发布新的主包版本。'], { publicState: peer.observation });
        state.preparationPeer = peer.observation.artifact; save();
      }
    }
    const runtime = dependencies.runtime ?? createReleaseToolRuntime();
    const taskId = `release-${key}`;
    const controller = (dependencies.resolveRetainedController ?? resolveRetainedController)(workspace);
    const invoke = dependencies.invokeRetainedController ?? defaultInvokeRetained;
    let task: any;
    try { task = runtime.inspectTask(workspace, taskId); }
    catch (error: any) {
      if (error.code !== 'task_record_not_found') throw error;
      if (git(['branch', '--show-current']) !== 'dev' || git(['status', '--porcelain=v1']).trim() || git(['rev-parse', 'HEAD']) !== git(['rev-parse', 'origin/dev'])) throw new Error('Creating a release Task requires the clean retained dev baseline to be synchronized first.');
      const services = targets.packages.flatMap(name => name === 'buildr' ? ['product/buildr', 'product/buildr-web'] : ['product/dsh-plugin']);
      task = take(invoke(controller, ['task', 'create', taskId, '--title', `准备发布 ${key}`, '--intent', '验证已明确选择的最终发布组合和唯一产物；公开发布需独立授权。', '--project', 'product', ...services.flatMap(service => ['--service', service]), '--target', workspace, '--json']));
    }
    const completedPreparation = task.record?.status === 'completed' && Boolean(state.preparation);
    if (task.record?.status !== 'active' && !completedPreparation) throw new Error('Release preparation requires the matching active Task.');
    if (completedPreparation) {
      if (preparationInputChanged) throw new Error('Completed preparation cannot select new source or a new baseline; explicitly restore active preparation before changing its frozen selection.');
      const snapshot = readPreparedCandidate(workspace, state, existingSelection);
      if (state.preparation.status !== 'completed') {
        const finished = finishCandidatePreparation(workspace, state, existingSelection, snapshot, { runtime, controller, invoke, save, effects: currentEffects, git });
        if (finished.status !== 'candidate-verified' || state.preparation.status !== 'completed') return answer(finished.status, finished.nextActions,
          { ...finished, preparationCloseout: state.preparation });
      }
      state.preparation.adoptionRequested = true; save();
    }
    let worktree = runtime.inspectGitWorktrees({ workspaceRoot: workspace, taskId });
    if (worktree.status !== 'ready') worktree = take(invoke(controller, ['worktree', 'create', taskId, '--target', workspace, '--branch', `codex/${taskId}`,
      '--start-point', completedPreparation ? existingSelection.releaseHead : baseline, '--include', 'workspace', '--json']));
    const repo = worktree.repositories.find((entry: any) => entry.selector === 'workspace')?.checkoutPath;
    if (!repo) throw new Error('Release Worktree has no matching workspace repository.');
    state.executionRoot = repo; save();
    const binding = () => resolveReleaseExecutionBinding({ ...selectionArgs, workspace, repo }, runtime);
    let selection = inspectReleaseSelection({ ...selectionArgs, repo, devRef: 'origin/dev' });
    if (!completedPreparation && selection.status === 'blocked') {
      const existing = git(['for-each-ref', '--format=%(refname)', `refs/heads/release-${key}`, `refs/buildr/release/${key}/`], repo);
      if (existing) throw new Error(selection.diagnostic?.message || 'Existing release selection cannot be read.');
      selection = take(createReleaseSelection({ ...selectionArgs, repo, baseline, devRef: 'origin/dev', executionBinding: binding() }));
    }
    if (selection.devBaseline !== baseline) throw new Error('The existing release baseline differs from the explicit selection.');
    state.sources = [...new Set([...selection.selectionChain.map((entry: any) => entry.sourceDevCommit), ...state.sources])];
    const unselected = state.sources.filter((source: string) => !selection.selectionChain.some((entry: any) => entry.sourceDevCommit === source));
    if (!completedPreparation) {
      if (unselected.length && selection.status === 'frozen') take(reopenReleaseSelection({ ...selectionArgs, repo, devRef: 'origin/dev', executionBinding: binding(), confirm: true, reason: '纳入已授权并完成相关验证的明确dev修复提交' }));
      for (const source of state.sources) take(selectReleaseCommit({ ...selectionArgs, repo, source, devRef: 'origin/dev', executionBinding: binding() }));
      selection = take(freezeReleaseSelection({ ...selectionArgs, repo, devRef: 'origin/dev', executionBinding: binding() }));
    }
    const main = git(['rev-parse', 'origin/main'], repo);
    const mainParents = git(['rev-list', '--parents', '-n', '1', main], repo).split(/\s/u).slice(1);
    const alreadyMerged = mainParents.length === 2 && mainParents[1] === selection.releaseHead && git(['rev-parse', `${main}^{tree}`], repo) === selection.releaseTree;
    if (completedPreparation && !alreadyMerged && main !== state.preparation.mainCommit) throw new Error('Main changed after completed preparation; explicitly restore active preparation to reconcile the changed source.');
    if (!alreadyMerged && !completedPreparation) selection = take(reconcileReleaseToMain({ ...selectionArgs, repo, devRef: 'origin/dev', mainRef: 'origin/main', executionBinding: binding(), confirm: true, reason: '冻结完整候选前核验当前main来源与最终组合' }));
    // Lifecycle action completion is not the selection's lifecycle state.
    selection = inspectReleaseSelection({ ...selectionArgs, repo, devRef: 'origin/dev' });
    if (selection.status !== 'frozen') throw new Error('Final release selection is no longer frozen.');
    const sourceCommit = selection.releaseHead;
    if (state.preparation && state.preparation.sourceCommit !== sourceCommit) {
      state.preparationHistory = [...(state.preparationHistory ?? []), state.preparation]; state.preparation = null; save();
    }
    for (const name of targets.packages) if (JSON.parse(git(['show', `${sourceCommit}:projects/product/services/${name}/package.json`, '--'], repo)).version !== targets.versions[name]) throw new Error(`Selected ${name} version differs from requested release; first deliver and select its version materials on dev.`);
    // These materials already belong to the release contract. Check the frozen
    // bytes before asking for expensive local source proof or a remote run.
    // Plugin-only preparation does not require an unrelated main release note.
    if (targets.packages.includes('buildr')) extractReleaseNotes(git(['show', `${sourceCommit}:CHANGELOG.md`, '--'], repo), targets.versions.buildr);
    state.sourceCommit = sourceCommit;
    let plan: any = null;
    if (scoped) {
      if (alreadyMerged) {
        plan = state.candidatePlan;
        if (!plan || plan.sourceCommit !== sourceCommit || plan.selection.identity !== selection.selectionIdentity) throw new Error('Merged release requires its original frozen source-admission plan.');
      } else {
        const rawGit = (args: string[]) => {
          if (args.join(' ') === 'rev-parse HEAD') return sourceCommit;
          const value = execute('git', args, { cwd: repo, timeout: 30_000, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
          if (value.status !== 0) {
            const stderr = String(value.stderr ?? '');
            const failure = { command: 'git', args, status: value.status ?? null, signal: value.signal ?? null,
              errorCode: value.error?.code ?? null, stdoutBytes: Buffer.byteLength(String(value.stdout ?? ''), 'utf8'),
              stderr: containsCredentialMaterial(stderr) ? '[credential-shaped diagnostic omitted]' : stderr.trim().slice(0, 2048) };
            throw new Error(`Candidate source inspection failed: ${JSON.stringify(failure)}`);
          }
          return String(value.stdout ?? '');
        };
        plan = createReleaseCandidatePlan({ BUILDR_RELEASE_PACKAGES: targets.packages.join(','), BUILDR_SOURCE_BUILDR_VERSION: targets.versions.buildr,
          BUILDR_PLUGIN_VERSION: targets.versions['dsh-plugin'], BUILDR_SELECTION_ID: key, BUILDR_SELECTION_BASELINE: baseline,
          BUILDR_SELECTION_MAIN: main, BUILDR_SELECTION_IDENTITY: selection.selectionIdentity, CANDIDATE_SOURCE_SHA: sourceCommit,
          ...(!targets.packages.includes('buildr') ? { BUILDR_BUILDR_PEER_VERSION: state.preparationPeer?.version, BUILDR_BUILDR_PEER_INTEGRITY: state.preparationPeer?.integrity } : {}) }, rawGit);
        state.candidatePlan = plan; save();
      }
    }
    const carrier = releaseCarrierBranchFor(key, selection.generation);
    const ensureCandidateBranch = (branch: string) => {
      const observed = git(['ls-remote', 'origin', `refs/heads/${branch}`], repo).split(/\s/u)[0] || null;
      if (observed !== sourceCommit) pushReleaseBranch({ repo, branch, commit: sourceCommit, before: observed }, { execute }, currentEffects);
    };
    if (!alreadyMerged) ensureCandidateBranch(`release-${key}`);
    if (state.candidate?.sourceCommit !== sourceCommit) {
      const platform = dependencies.platform ?? process.platform;
      const localRunner = platform === 'darwin' ? 'macos' : platform === 'win32' ? 'windows' : null;
      state.candidate = { sourceCommit, branch: carrier, runId: options.candidateRunId || null, dispatchRequested: false,
        ...(!options.candidateRunId && localRunner ? { localRunner } : {}) };
    }
    if (!completedPreparation && (options.verificationSource || options.artifactVerification || (options.sourceVerification && state.candidate.runId) || state.candidate.repair)) {
      phase = 'candidate-verification';
      const fields = scoped ? [`release_packages=${targets.packages.join(',')}`, `buildr_version=${JSON.parse(git(['show', `${sourceCommit}:projects/product/services/buildr/package.json`, '--'], repo)).version}`,
        `plugin_version=${plan.pluginVersion}`, `selection_id=${key}`, `selection_baseline=${baseline}`, `selection_main=${plan.selection.main}`,
        `selection_identity=${selection.selectionIdentity}`, ...(!targets.packages.includes('buildr') && plan.requirements.plugin
          ? [`buildr_peer_version=${state.preparationPeer.version}`, `buildr_peer_integrity=${state.preparationPeer.integrity}`] : [])] : [];
      let sourceTransport: string | undefined;
      if (options.sourceVerification) {
        const { readVerificationReuseBundle } = await import('../../../projects/product/services/buildr/test/verification/verification-reuse.ts');
        const { encodeCandidateSourceImport } = await import('../../../projects/product/services/buildr/test/verification/candidate-source-reuse.ts');
        sourceTransport = encodeCandidateSourceImport(readVerificationReuseBundle(options.sourceVerification));
      }
      let artifactTransport: string | undefined;
      if (options.artifactVerification) {
        const { readCandidateArtifactImports, encodeCandidateArtifactImport } = await import('../../../projects/product/services/buildr/test/verification/candidate-artifact-reuse.ts');
        artifactTransport = encodeCandidateArtifactImport(readCandidateArtifactImports(options.artifactVerification));
      }
      const repaired = continueCandidateRepair({ repo, candidate: state.candidate,
        verificationSource: options.verificationSource ?? state.candidate.repair?.verificationSource ?? sourceCommit, fields, sourceTransport, artifactTransport }, {
        gh: args => gh(args, repo), git: args => git(args, repo), save, ensureCarrier: () => ensureCandidateBranch(carrier),
      });
      currentEffects.push(...repaired.effects);
      if (sourceTransport !== undefined || artifactTransport !== undefined) {
        const inputIdentity = crypto.createHash('sha256').update(JSON.stringify({ source: sourceTransport ?? null, artifact: artifactTransport ?? null })).digest('hex');
        if (state.candidate.repair?.inputIdentity === inputIdentity) {
          state.candidate.repair.verificationInputs = {
            ...(sourceTransport !== undefined ? { source: identity(sourceTransport) } : {}),
            ...(artifactTransport !== undefined ? { artifact: identity(artifactTransport) } : {}),
          }; save();
        }
      }
      if (repaired.status !== 'adopted') return answer(repaired.status, repaired.nextActions, repaired);
      state.candidate.verificationInputs = { ...state.candidate.verificationInputs, ...state.candidate.repair?.verificationInputs }; save();
    }
    if (!state.candidate.runId) {
      const find = () => JSON.parse(gh(['run', 'list', '--repo', releasePublishAuthority.repository, '--workflow', 'verify.yml', '--branch', carrier, '--event', 'workflow_dispatch', '--limit', '100', '--json', 'databaseId,headSha,status,conclusion'])).find((run: any) => run.headSha === sourceCommit);
      let existing = find();
      if (!existing && state.candidate.dispatchRejected === true) state.candidate.dispatchRequested = false;
      if (!existing && !state.candidate.dispatchRequested) {
        phase = 'source-verification';
        const localSource = await (dependencies.prepareLocalSourceVerification ?? prepareLocalSourceVerification)({
          repo, sourceFile: options.sourceVerification, base: selection.devBaseline,
          packages: [...(!scoped || plan.requirements.buildr ? ['buildr'] : []), ...(scoped && plan.requirements.plugin ? ['dsh-plugin'] : [])],
        });
        if (localSource.status !== 'ready') {
          save();
          return answer('local-verification-required', localSource.nextActions, { localSource });
        }
        ensureCandidateBranch(carrier);
        phase = 'candidate-verification';
        const fields = scoped ? [`release_packages=${targets.packages.join(',')}`, `buildr_version=${JSON.parse(git(['show', `${sourceCommit}:projects/product/services/buildr/package.json`, '--'], repo)).version}`,
          `plugin_version=${plan.pluginVersion}`, `selection_id=${key}`, `selection_baseline=${baseline}`, `selection_main=${plan.selection.main}`,
          `selection_identity=${selection.selectionIdentity}`, ...(!targets.packages.includes('buildr') && plan.requirements.plugin
            ? [`buildr_peer_version=${state.preparationPeer.version}`, `buildr_peer_integrity=${state.preparationPeer.integrity}`] : [])] : [];
        if (localSource.transport) fields.push(`source_verification=${localSource.transport}`);
        if (state.candidate.localRunner) fields.push(`local_runner=${state.candidate.localRunner}`);
        assertCandidateDispatchBudget(['purpose=candidate', ...fields]);
        state.candidate.dispatchRequested = true;
        state.candidate.dispatchRejected = false;
        const effect = { type: 'candidate-dispatched', branch: carrier, sourceCommit, state: 'unknown' };
        currentEffects.push(effect);
        state.candidate.sourceVerification = { recordCount: localSource.recordCount ?? 0, digest: identity(localSource.transport ?? '') };
        writeOperation(file, state);
        try { gh(['workflow', 'run', 'verify.yml', '--repo', releasePublishAuthority.repository, '--ref', carrier, '-f', 'purpose=candidate', ...fields.flatMap(field => ['-f', field])]); effect.state = 'confirmed'; }
        catch (error: any) {
          state.candidate.dispatchDiagnostic = error.diagnostic ?? { code: 'candidate-dispatch-unknown', message: String(error.message).slice(-8192) };
          state.candidate.dispatchRejected = releaseDispatchRejected(state.candidate.dispatchDiagnostic);
          state.candidate.dispatchHistory = [...(state.candidate.dispatchHistory ?? []), { diagnostic: state.candidate.dispatchDiagnostic, rejected: state.candidate.dispatchRejected, observedAt: new Date().toISOString() }];
          if (state.candidate.dispatchRejected) effect.state = 'not-applied';
          writeOperation(file, state);
        }
        existing = find();
        if (!existing && state.candidate.dispatchRejected) {
          state.candidate.dispatchRequested = false; writeOperation(file, state);
          return answer('candidate-dispatch-rejected', ['修复明确拒绝的请求条件后继续同一prepare；保留源码证明与发布选择。'], { diagnostic: state.candidate.dispatchDiagnostic });
        }
      }
      if (!existing) { writeOperation(file, state); return answer('candidate-dispatch-unconfirmed', ['稍后inspect/prepare回读同一载体的运行，不再次派发。']); }
      state.candidate.runId = Number(existing.databaseId);
    }
    writeOperation(file, state);
    phase = 'candidate-verification';
    const candidate = readRun(state.candidate.runId);
    if (candidate.head_sha !== sourceCommit) throw new Error('Candidate run source differs from the frozen release.');
      if (candidate.repository?.full_name !== releasePublishAuthority.repository || candidate.path?.split('@')[0] !== '.github/workflows/verify.yml' || candidate.event !== 'workflow_dispatch' || (scoped && candidate.head_branch !== carrier)) throw new Error('Candidate run does not belong to the expected repository, carrier and verification workflow.');
    if (candidate.status !== 'completed' || candidate.conclusion !== 'success') ensureCandidateBranch(carrier);
    if (candidate.status !== 'completed') {
      const localArtifact = localArtifactHandoff(repo, state.candidate);
      return answer('candidate-running', [localArtifact?.nextAction ?? '等待当前候选终态，再继续同一prepare。'], {
        run: candidate, ...(localArtifact ? { localArtifact } : {}),
      });
    }
    if (candidate.conclusion !== 'success') {
      const previousRetry = state.candidate.retry;
      if (previousRetry?.runId === state.candidate.runId && Number(candidate.run_attempt) <= previousRetry.previousAttempt) {
        return answer('candidate-retry-unconfirmed', ['回读同一候选运行的新attempt；不重复发送失败作业恢复请求。'], { run: candidate });
      }
      const retried = retryCandidateFailedShards({ runId: state.candidate.runId, sourceCommit, repo, ghCommand: options.ghCommand }, { execute,
        onRetryIntent: (intent: any) => { state.candidate.retry = intent; save(); },
      });
      currentEffects.push(...retried.effects);
      return answer(retried.status === 'dispatched' ? 'candidate-running' : retried.status === 'unknown' ? 'candidate-retry-unconfirmed' : 'diagnosis-required', retried.nextActions, { retry: retried });
    }
    const artifactDestination = completedPreparation && state.preparation.artifacts.buildr ? path.join(state.preparation.directory, 'buildr')
      : state.candidate.localRunner ? path.join(repo, 'projects/product/services/buildr/build/verification/candidates', sourceCommit, 'candidate-package') : undefined;
    const candidateEvidence = !scoped || plan.requirements.buildr ? readCandidateEvidence({ candidateRunId: state.candidate.runId, ghCommand: options.ghCommand || 'gh', repo, execute,
      artifactDestination, dependencies: dependencies.candidateDependencies }) : null;
    if (candidateEvidence?.aggregate.status === 'incomplete') {
      const aggregate = candidateEvidence.aggregate;
      if (!state.candidate.localRunner || aggregate.sourceCommit !== sourceCommit || aggregate.sourceTree !== selection.releaseTree
        || String(aggregate.workflow?.runId) !== String(state.candidate.runId) || Number(aggregate.workflow?.aggregateAttempt) !== Number(candidate.run_attempt)
        || !Array.isArray(aggregate.deferredIds) || !aggregate.deferredIds.length
        || aggregate.findings?.some((finding: any) => finding.code !== 'evidence-missing' || !aggregate.deferredIds.includes(finding.id))) {
        throw new Error('Candidate local handoff differs from the frozen source or contains an unrelated failure.');
      }
      phase = 'artifact-verification';
      const handoff = localArtifactHandoff(repo, state.candidate);
      const evidenceDirectory = handoff.evidenceDirectory;
      const localArtifact = { ...handoff, artifactDirectory: candidateEvidence.artifactDirectory ?? artifactDestination,
        missingEvidenceIds: aggregate.deferredIds, artifact: candidateEvidence.manifest };
      state.candidate.awaitingLocalArtifact = localArtifact; save();
      return answer('local-artifact-verification-required', [
        `在冻结源码的 buildr 服务使用 test/verification/artifact.ts：--artifact-dir ${localArtifact.artifactDirectory} --output ${evidenceDirectory}；通用原包与平台启动器只跑一次，最低24.15.0及实际稳定24.x分别补安装运行兼容。`,
        `完成后继续同一 prepare，传入 --artifact-verification ${evidenceDirectory}；采用远端已通过结果，只补缺项和完整汇总，不重打包。`,
      ], { localArtifact });
    }
    if (candidateEvidence) {
      assertReleaseConsumptionCoverage(candidateEvidence.aggregate, { sourceCommit, sourceTree: selection.releaseTree }, candidateEvidence.manifest);
      if (String(candidateEvidence.aggregate.workflow?.runId) !== String(state.candidate.runId) || Number(candidateEvidence.aggregate.workflow?.aggregateAttempt) !== Number(candidate.run_attempt)) throw new Error('Candidate evidence belongs to a different run/attempt.');
    }
    let pluginSourceCandidate: any = null;
    if (scoped && plan.requirements.plugin) {
      plan.expectedPeer = targets.packages.includes('buildr') ? candidateEvidence?.packageArtifact : state.preparationPeer;
      plan.peerSourceCommit = sourceCommit;
      const pluginSource = readPluginSourceCandidate({ repo, plan, runId: state.candidate.runId, runAttempt: candidate.run_attempt, ghCommand: options.ghCommand }, { execute, ...dependencies.pluginSourceDependencies });
      assertPluginSourceAggregate(pluginSource.aggregate, plan, state.candidate.runId, candidate.run_attempt);
      if (!targets.packages.includes('buildr') && (pluginSource.aggregate.verification.peer.version !== state.preparationPeer.version || pluginSource.aggregate.verification.peer.integrity !== state.preparationPeer.integrity || pluginSource.aggregate.verification.peer.artifactSha256 !== state.preparationPeer.artifactSha256)) throw new Error('Plugin source Candidate consumed a different frozen registry peer.');
      state.pluginSourceAggregate = pluginSource.aggregate; pluginSourceCandidate = pluginSource; save();
    }
    if (stopAfterCandidate) {
      phase = 'candidate-closeout';
      state.preparation ??= preserveCandidatePreparation(workspace, key, selection, main, candidate, candidateEvidence, pluginSourceCandidate, {
        sourceCommit: candidateEvidence?.aggregate.verificationSource ?? state.candidate.repair?.verificationSource ?? sourceCommit,
        source: state.candidate.verificationInputs?.source ?? state.candidate.sourceVerification?.digest ?? null,
        artifact: state.candidate.verificationInputs?.artifact ?? null,
      }); save();
      const snapshot = readPreparedCandidate(workspace, state, selection);
      const completed = finishCandidatePreparation(workspace, state, selection, snapshot, { runtime, controller, invoke, save, effects: currentEffects, git });
      return answer(completed.status, completed.nextActions, { ...completed, stopAfter: 'candidate', sourceTree: selection.releaseTree, run: candidate,
        artifacts: snapshot.artifacts, preparationCloseout: state.preparation });
    }
    phase = 'adoption-readiness';
    const pr = take(ensureReleaseToMainPullRequest({ ...selectionArgs, generation: selection.generation, repo, candidateCommit: sourceCommit, candidateTree: selection.releaseTree,
      title: `Release ${key}`, body: `Release ${key} from frozen ${sourceCommit}.\n\nCandidate run ID: ${state.candidate.runId}${scoped ? `\nRelease selection: ${JSON.stringify(plan.selection)}${plan.requirements.plugin ? `\nBuildr peer: ${JSON.stringify(state.pluginSourceAggregate.verification.peer)}` : ''}` : ''}`,
      authorizeReleasePush: true, authorizePullRequest: true }, { execute }));
    if (pr.pullRequest.state !== 'MERGED') {
      const mainPullRequest = await waitForReleaseMainPullRequest({ repo, url: pr.pullRequest.url, sourceCommit, branch: carrier,
        ghCommand: options.ghCommand }, { execute, now: dependencies.now, sleep: dependencies.sleep });
      if (mainPullRequest.status !== 'ready') return answer(mainPullRequest.status === 'pending' ? 'main-merge-pending'
        : mainPullRequest.status === 'unknown' ? 'main-merge-readback-required' : 'blocked', [
        mainPullRequest.status === 'blocked' ? '只处理该合并请求报告的失败或冲突，再继续同一 prepare；保留候选与原包。'
          : '保留当前合并请求、候选与原包，稍后继续同一 prepare 回读合并条件；不重新派发候选或创建合并请求。',
      ], { mainPullRequest, ...(mainPullRequest.diagnostic ? { diagnostic: mainPullRequest.diagnostic } : {}) });
      if (mainPullRequest.pullRequest.state !== 'MERGED') {
        const effect = { type: 'release-main-merge', url: pr.pullRequest.url, sourceCommit, state: 'unknown' };
        currentEffects.push(effect);
        try {
          gh(['pr', 'merge', pr.pullRequest.url, '--repo', releasePublishAuthority.repository, '--merge', '--match-head-commit', sourceCommit], repo);
          effect.state = 'confirmed';
        } catch (error: any) {
          return answer('main-merge-readback-required', ['合并响应未确认；继续同一 prepare 先回读该合并请求，不重建候选或合并请求。'],
            { mainPullRequest, diagnostic: error.diagnostic });
        }
      }
      git(['fetch', '--no-tags', 'origin', 'refs/heads/main:refs/remotes/origin/main'], repo);
    }
    if (scoped) {
      const mainCommit = git(['rev-parse', 'origin/main'], repo);
      const actualParents = git(['rev-list', '--parents', '-n', '1', mainCommit], repo).split(/\s/u).slice(1);
      if (actualParents.length !== 2 || actualParents[1] !== sourceCommit || git(['rev-parse', `${mainCommit}^{tree}`], repo) !== selection.releaseTree) throw new Error('Protected main does not preserve the exact frozen tree through its merge second parent.');
      const prepared = await preparePackageRelease({ ...options, repo, selection, mainCommit, candidateEvidence }, packageScope(), packageDependencies);
      save(); return answer(prepared.status, prepared.nextActions, prepared);
    }
    state.transaction = { repo, canonicalWorkspace: workspace, version: options.version, sourceCommit: 'origin/main', remoteMain: 'origin/main', candidateBase: sourceCommit,
      candidateTree: selection.releaseTree, releaseTask: taskId, supportTasks: state.supportTasks, candidateRunId: state.candidate.runId,
      devCommit: state.context?.release?.sourceCommit === sourceCommit ? state.context.convergence.devCommit : git(['rev-parse', 'origin/dev'], repo) };
    const prepared = await runReleaseOrchestration({ action: 'prepare-dispatch', version: options.version, releaseTask: taskId, transaction: state.transaction }, {
      ...dependencies.orchestrationDependencies, transactionDependencies: { ...dependencies.orchestrationDependencies?.transactionDependencies, candidateEvidence },
    });
    currentEffects.push(...prepared.effects);
    if (prepared.context) {
      if (state.publication?.requested && state.publication.contextIdentity !== prepared.context.identity) {
        const previousRun = state.publication.runId ? readRun(state.publication.runId) : null;
        const reconciled = reconcilePublicationAfterPreparedContext(state.publication, prepared.context, previousRun);
        state.publication = reconciled.publication;
        if (reconciled.effect) currentEffects.push(reconciled.effect);
      }
      state.context = prepared.context;
    }
    writeOperation(file, state);
    return answer(prepared.status, prepared.nextActions, { result: prepared });
  } catch (error: any) {
    writeOperation(file, state);
    return answer('blocked', error.ownerResult?.nextActions || ['核对已发生效果并以同一版本继续；不重新创建现场或发布。'], { diagnostic: error.diagnostic ?? { code: error.code || 'release-operation-blocked', message: error.message }, ownerResult: error.ownerResult });
  } finally {
    fs.unlinkSync(lock);
  }
}

function parseOptions(argv: any): any  {
  if (argv.includes('--help')) return { help: true };
  const [action, ...rest]: any = argv;
  const options: any = { action, detail: 'compact', output: null, input: null, sources: [] };
  for (let index: any = 0; index < rest.length; index++) {
    const key: any = rest[index];
    if (key === '--authorized') { options.authorized = true; continue; }
    if (key === '--recover-publication') { options.recoverPublication = true; continue; }
    const value: any = rest[index + 1];
    if (!key?.startsWith('--') || value === undefined) throw new Error(`Invalid argument: ${key || '<missing>'}`);
    if (key === '--source') options.sources.push(value);
    else options[key.slice(2)] = value;
    index++;
  }
  if (!options.input && ['prepare', 'inspect', 'publish', 'resume'].includes(action)) return {
    ...options, normalOperation: true, candidateRunId: options['candidate-run-id'] ? Number(options['candidate-run-id']) : null,
    pluginVersion: options['plugin-version'], selectionId: options['selection-id'],
    sourceVerification: options['source-verification'],
    artifactVerification: options['artifact-verification'],
    verificationSource: options['verification-source'],
    stopAfter: options['stop-after'],
    supportTasks: options['support-tasks'] ? options['support-tasks'].split(',').filter(Boolean) : undefined,
  };
  if (options['stop-after'] !== undefined) throw new Error('--stop-after candidate is only supported by normal prepare, without --input.');
  if (!options.input) throw new Error('Usage: release-orchestration-runner.ts <prepare|inspect|publish|resume> --workspace <root> [--packages buildr|dsh-plugin|buildr,dsh-plugin] [--version <main-version>] [--plugin-version <plugin-version>] [--baseline <ref>] [--source <sha> ...] [--stop-after candidate] [--authorized] [--recover-publication]');
  if (!['compact', 'full'].includes(options.detail)) throw new Error('--detail must be compact or full.');
  const input: any = JSON.parse(fs.readFileSync(path.resolve(options.input), 'utf8'));
  if (action === 'inspect') return { action, detail: options.detail, output: options.output ? path.resolve(options.output) : null, expectedTimelineIdentity: options['timeline-identity'] ?? null, inspectedResult: input };
  return { ...input, action, detail: options.detail, output: options.output ? path.resolve(options.output) : null };
}

if (process.argv[1] && sameFilesystemPath(process.argv[1], fileURLToPath(import.meta.url))) {
  let options: any = null;
  try {
    options = parseOptions(process.argv.slice(2));
    if (options.help) {
      process.stdout.write('Usage: release-orchestration-runner.ts <prepare|inspect|publish|resume> --workspace <root> [--packages buildr|dsh-plugin|buildr,dsh-plugin] [--version <main-version>] [--plugin-version <plugin-version>] [--baseline <ref>] [--source <sha> ...] [--stop-after candidate] [--authorized] [--recover-publication]\n');
    } else {
    const value: any = options.normalOperation ? await runReleaseOperation(options) : options.action === 'inspect'
      ? inspectReleaseOrchestration(options.inspectedResult, options.expectedTimelineIdentity)
      : await runReleaseOrchestration(options);
    if (options.output) fs.writeFileSync(options.output, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    process.stdout.write(`${JSON.stringify(options.normalOperation || options.detail === 'full' ? value : compactReleaseOrchestration(value), null, 2)}\n`);
    if (value.status === 'blocked') process.exitCode = 1;
    }
  } catch (error: any) {
    process.stderr.write(`${JSON.stringify({ schemaVersion: releaseOrchestrationSchema, status: 'blocked', error: error.message, effects: [], nextActions: ['修复release orchestration输入或current owner事实后重试。'] }, null, 2)}\n`);
    process.exitCode = 1;
  }
}
