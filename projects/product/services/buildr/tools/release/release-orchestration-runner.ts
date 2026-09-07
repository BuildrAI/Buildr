#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { createReleaseToolRuntime } from './runtime.ts';
import { sameFilesystemPath } from '../../src/infrastructure/filesystem/filesystem-path-identity.ts';
import { closeoutReleaseGitResources, reconcilePublishedReleaseWithDev, reconcileReleaseToMain, ensureReleaseToMainPullRequest, pushReleaseBranch, releaseCarrierBranchFor } from './release-git-convergence.ts';
import { createReleaseSelection, selectReleaseCommit, freezeReleaseSelection, reopenReleaseSelection, inspectReleaseSelection } from './release-selection.ts';
import { resolveReleaseExecutionBinding } from './release-execution-binding.ts';
import { observeUnpublishedRelease } from './release-observation.ts';
import { retryCandidateFailedShards, classifyCandidateFailure } from './candidate-failed-shard-retry.ts';
import { releasePublishAuthority } from './release-authority.ts';
import { createReleaseLifecycle, projectReleaseLifecycleOrchestration } from './release-lifecycle.ts';
import { compactReleasePhaseTimeline, createReleasePhaseTimeline, projectCandidateAttempts } from './release-phase-timeline.ts';
import { inspectHostedReleaseTransaction } from './release-transaction-evidence.ts';
import { runHostedReleaseTransaction, readCandidateEvidence } from './release-transaction-runner.ts';
import { assertReleaseConsumptionCoverage } from './release-consumption.ts';

export const releaseOrchestrationSchema: any = 'buildr.release-orchestration-result/v1';

const serviceRoot: any = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const workspaceRoot: any = path.resolve(serviceRoot, '../../../..');
const VERSION: any = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;
const TASK: any = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/u;

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
  for (const [key, phase, ownerId] of [['reconciliation', 'dev-reconciliation', 'release-git-convergence'], ['gitCloseout', 'release-git-closeout', 'release-git-convergence'], ['taskCompletion', 'task-completion', 'task-record'], ['worktreeCleanup', 'worktree-cleanup', 'task-worktree'], ['doctor', 'doctor', 'doctor']]) {
    const result: any = state[key];
    if (result) phases.push({ id: phase, phase, status: ['passed', 'completed', 'cleaned', 'ready'].includes(result.status) ? 'passed' : 'blocked', owner: { id: ownerId, identity: result.identity ?? result.recordDigest ?? result.receiptDigest ?? null }, startedAt: null, finishedAt: result.observedAt ?? null, waitType: 'machine-execution' });
  }
  return createReleasePhaseTimeline({
    version: options.version,
    generation: Number(context?.selection?.generation ?? options.generation ?? 0),
    terminalStatus: state.doctor?.status === 'ready' ? 'closed' : state.blocked ? 'blocked' : 'active',
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
      activation: state.doctor?.status ?? 'not-run',
    },
    nextActions,
    timeline: phaseTimeline,
    ...(state.context ? { context: state.context } : {}),
    ...(lifecycle ? { lifecycle } : {}),
  };
  return value;
}

function blocked(options: any, action: any, state: any, steps: any, ownerResult: any, fallback: any): any  {
  const nextActions: any = ownerResult?.nextActions?.length ? ownerResult.nextActions : [fallback];
  return result(options, action, 'blocked', state, steps, nextActions);
}

function doctorIsReady(value: any): any  {
  return value?.status === 'ready' || (value?.ok === true && value?.health?.ready === true);
}

function normalizeDoctorResult(value: any): any  {
  if (!doctorIsReady(value) || value?.status === 'ready') return value;
  return { ...value, status: 'ready' };
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
  const executable: any = fs.realpathSync(path.resolve(nodeExecutable));
  if (!path.isAbsolute(executable)) throw new Error('Release retained controller executable is invalid.');
  const requiredNode: any = fs.readFileSync(path.join(root, 'projects/product/.node-version'), 'utf8').trim();
  if (process.versions.node !== requiredNode) throw new Error(`Release retained controller requires Product Node ${requiredNode}, actual ${process.versions.node}.`);
  const entry: any = path.join(sourceRoot, 'bin', 'buildr.mjs');
  if (!fs.statSync(entry, { throwIfNoEntry: false })?.isFile()) throw new Error('Release retained controller CLI is missing.');
  return { executable, argsPrefix: [entry], sourceRoot, workspaceRoot: root, identity: identity({ executable, sourceRoot, entry, requiredNode }) };
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

  const reconciliation: any = (dependencies.reconcilePublishedReleaseWithDev ?? reconcilePublishedReleaseWithDev)({ repo: options.repo, publicationEvidence: evidence, remote: options.remote, main: options.main, dev: options.dev }, dependencies.gitDependencies);
  steps.push(step('release-git-convergence', 'reconcile-dev', reconciliation));
  if (reconciliation.status !== 'passed') return blocked(options, 'closeout', { evidence, context, reconciliation }, steps, reconciliation, '恢复dev provenance reconciliation后重试。');

  const generation: any = context.selection?.generation;
  const expectedCommit: any = context.release?.sourceCommit;
  if (options.generation != null && Number(options.generation) !== generation) return blocked(options, 'closeout', { evidence, context, reconciliation }, steps, { nextActions: ['请求generation与Publication context不一致，使用current evidence generation重试。'] }, '修正generation。');
  if (options.expectedCommit != null && options.expectedCommit !== expectedCommit) return blocked(options, 'closeout', { evidence, context, reconciliation }, steps, { nextActions: ['请求expected commit与Publication context不一致，使用current evidence source重试。'] }, '修正expected commit。');
  const gitCloseout: any = (dependencies.closeoutReleaseGitResources ?? closeoutReleaseGitResources)({
    repo: options.repo,
    remote: options.remote,
    version: options.version,
    generation,
    expectedCommit,
    publicationEvidence: evidence,
    authorizeCarrierCleanup: options.authorizeCarrierCleanup === true,
    authorizeLocalSelectionCleanup: options.authorizeLocalSelectionCleanup === true,
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

  let taskCompletion: any;
  if (taskResult.record.status === 'completed') taskCompletion = { status: 'completed', recordDigest: taskResult.recordDigest, effects: [] };
  else if (taskResult.record.status === 'active') {
    taskCompletion = invokeRetained(controller, ['task', 'complete', options.releaseTask, '--summary', options.completionSummary ?? `Release ${options.version} Publication、dev provenance与资源收尾已完成。`, '--expected-record', taskResult.recordDigest, '--target', root, '--json']);
    taskResult = inspectTask(root, options.releaseTask);
  } else taskCompletion = { status: 'blocked', effects: [], nextActions: [`Release Task状态${taskResult.record.status}不能作为closeout完成事实。`] };
  steps.push(step('task-record', 'complete', taskCompletion, taskCompletion.effects?.length ? 'executed' : 'reused'));
  if (taskResult.record.status !== 'completed') return blocked(options, 'closeout', { evidence, context, reconciliation, gitCloseout, lifecycle: activeLifecycle, taskCompletion }, steps, taskCompletion, '恢复Task completion后重试。');

  const worktreeCleanup: any = invokeRetained(controller, [
    'worktree', 'cleanup', options.releaseTask,
    '--expected-source', `workspace=${context.release.sourceCommit}`,
    '--delivered-ref', `workspace=${context.convergence.mainCommit}`,
    '--target', root, '--json',
  ]);
  steps.push(step('task-worktree', 'cleanup', worktreeCleanup, worktreeCleanup.effects?.length ? 'executed' : 'reused'));
  if (worktreeCleanup.status !== 'cleaned') return blocked(options, 'closeout', { evidence, context, reconciliation, gitCloseout, lifecycle: activeLifecycle, taskCompletion, worktreeCleanup }, steps, worktreeCleanup, '恢复Task Worktree cleanup后重试。');

  const doctor: any = normalizeDoctorResult(invokeRetained(controller, ['doctor', '--target', root, '--json', '--detail', 'compact', ...(options.agent ? ['--agent', options.agent] : [])]));
  steps.push(step('doctor', 'inspect', doctor));
  if (!doctorIsReady(doctor)) return blocked(options, 'closeout', { evidence, context, reconciliation, gitCloseout, lifecycle: activeLifecycle, taskCompletion, worktreeCleanup, doctor }, steps, doctor, '修复Doctor blocker后以同一closeout恢复。');
  const completedLifecycle: any = createReleaseLifecycle({ ...activeLifecycle.facts, version: options.version, releaseTask: { taskId: options.releaseTask, status: 'completed', recordDigest: taskResult.recordDigest } });
  return result(options, 'closeout', 'passed', { evidence, context, reconciliation, gitCloseout, lifecycle: completedLifecycle, taskCompletion, worktreeCleanup, doctor }, steps, []);
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

export async function runReleaseOperation(options: any, dependencies: any = {}): Promise<any> {
  let action = options.action;
  if (!['prepare', 'inspect', 'publish', 'resume'].includes(action)) throw new Error('Release operation must be prepare, inspect, publish or resume.');
  required(options.version, VERSION, 'version');
  if (!options.workspace) throw new Error('Release operation requires --workspace <canonical-workspace>.');
  const workspace = fs.realpathSync(path.resolve(options.workspace));
  const file = operationFile(workspace, options.version);
  const saved = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
  if (saved && (saved.version !== options.version || saved.workspace !== workspace)) throw new Error('Release operation document identity conflicts with the requested Workspace/version.');
  let state: any = saved ?? { schemaVersion: 'buildr.release-operation-input/v1', version: options.version, workspace, sources: [], candidate: null, publication: null };
  const currentEffects: any[] = [];
  const execute = dependencies.execute ?? ((command: string, args: string[], spawnOptions: any) => spawnSync(command, args, { ...spawnOptions, encoding: 'utf8', timeout: 30_000 }));
  const command = (executable: string, args: string[], cwd = workspace) => {
    const value = execute(executable, args, { cwd });
    if (value.status !== 0) throw new Error(`${executable} ${args[0]} failed: ${String(value.stderr || value.stdout || value.error?.message || '').trim()}`);
    return String(value.stdout || '').trim();
  };
  const git = (args: string[], cwd = workspace) => command('git', args, cwd);
  const gh = (args: string[], cwd = workspace) => command(options.ghCommand || 'gh', args, cwd);
  const readRun = (runId: number) => JSON.parse(gh(['api', `repos/${releasePublishAuthority.repository}/actions/runs/${runId}`]));
  const answer = (status: string, nextActions: string[] = [], extra: any = {}) => {
    if (options.detail !== 'full') {
      const { result: _result, run, selection, ...rest } = extra;
      extra = { ...rest,
        ...(run ? { run: { id: run.id, status: run.status, conclusion: run.conclusion, headSha: run.head_sha, url: run.html_url } } : {}),
        ...(selection ? { selection: { status: selection.status, releaseHead: selection.releaseHead, generation: selection.generation, diagnostic: selection.diagnostic } } : {}),
      };
    }
    return {
    schemaVersion: 'buildr.release-operation-result/v1', action, status, version: options.version,
    baseline: state.baseline ?? null, selectedSources: state.sources, sourceCommit: state.sourceCommit ?? null,
    candidate: state.candidate, publication: state.publication, contextIdentity: state.context?.identity ?? null,
    effects: currentEffects, nextActions, ...extra,
    };
  };
  const take = (value: any) => {
    currentEffects.push(...(value.effects || []));
    if (!['passed', 'ready', 'created', 'inspected', 'updated', 'reused'].includes(value.status)) throw Object.assign(new Error(value.diagnostic?.message || value.nextActions?.join(' ') || 'Release owner did not complete.'), { ownerResult: value });
    return value;
  };
  if (action === 'inspect') {
    const selection = inspectReleaseSelection({ version: options.version, repo: workspace, devRef: 'origin/dev' });
    const run = state.publication?.runId ? readRun(state.publication.runId) : state.candidate?.runId ? readRun(state.candidate.runId) : null;
    return answer('inspected', ['按当前运行终态继续同一prepare或resume。'], { selection, run });
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
    if (action === 'publish' && state.publication?.requested) action = 'resume';
    if (action === 'publish') {
      if (options.authorized !== true || !state.context || !state.transaction) return answer('authorization-required', ['先完成prepare，再对展示的版本与内容明确授权发布。']);
      git(['fetch', '--no-tags', 'origin', 'refs/heads/dev:refs/remotes/origin/dev', 'refs/heads/main:refs/remotes/origin/main']);
      currentEffects.push({ type: 'remote-refs-refreshed', refs: ['origin/dev', 'origin/main'] });
      const previous = dependencies.orchestrationDependencies ?? {};
      const transactionDependencies = { ...previous.transactionDependencies,
        onDispatchIntent: (intent: any) => { state.publication = { requested: true, releaseId: intent.releaseId, contextIdentity: intent.contextIdentity, runId: null }; writeOperation(file, state); },
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
      const run = readRun(state.publication.runId);
      if (run.status !== 'completed') return answer('publication-running', ['等待当前发布运行；不重复派发。'], { run });
      if (run.conclusion !== 'success') {
        if (state.publication.retryRequested && Number(run.run_attempt) < 2) return answer('publication-retry-unconfirmed', ['回读同一运行的新attempt；不重复重跑请求。']);
        const failure = classifyCandidateFailure(gh(['run', 'view', String(run.id), '--repo', releasePublishAuthority.repository, '--log-failed']));
        if (failure !== 'transient' || Number(run.run_attempt) >= 2) return answer('diagnosis-required', ['读取发布步骤证据并诊断失败；已成立公开事实必须保留。'], { run });
        const effect = { type: 'publication-failed-jobs-rerun', runId: run.id, previousAttempt: run.run_attempt, state: 'unknown' };
        currentEffects.push(effect);
        state.publication.retryRequested = true;
        writeOperation(file, state);
        gh(['run', 'rerun', String(run.id), '--failed', '--repo', releasePublishAuthority.repository]);
        effect.state = 'confirmed';
        return answer('publication-running', ['等待同一运行的新attempt终态。']);
      }
      const closed = await runReleaseOrchestration({ action: 'closeout', version: options.version, releaseTask: `release-${options.version}`, publishRunId: state.publication.runId,
        repo: workspace, canonicalWorkspace: workspace, remote: 'origin', agent: options.agent || 'codex', authorizeCarrierCleanup: true, authorizeLocalSelectionCleanup: true }, dependencies.orchestrationDependencies);
      currentEffects.push(...closed.effects);
      state.closeout = { status: closed.status, outcomes: closed.outcomes };
      writeOperation(file, state);
      return answer(closed.status, closed.nextActions, { outcomes: closed.outcomes, result: closed });
    }
    // The explicit selection is resolved once. Later dev changes never become
    // additional release content unless the caller selects their exact commits.
    git(['fetch', '--no-tags', 'origin', 'refs/heads/dev:refs/remotes/origin/dev', 'refs/heads/main:refs/remotes/origin/main']);
    currentEffects.push({ type: 'remote-refs-refreshed', refs: ['origin/dev', 'origin/main'] });
    const existingSelection = inspectReleaseSelection({ version: options.version, repo: workspace, devRef: 'origin/dev' });
    const baseline = git(['rev-parse', '--verify', `${options.baseline || state.baseline || existingSelection.devBaseline || 'origin/dev'}^{commit}`]);
    if (state.baseline && state.baseline !== baseline) throw new Error('Existing release baseline differs; select a deliberate replacement before changing it.');
    state.baseline = baseline;
    const sources = (options.sources || []).map((ref: string) => git(['rev-parse', '--verify', `${ref}^{commit}`]));
    state.sources = [...new Set([...state.sources, ...sources])];
    state.supportTasks = options.supportTasks || state.supportTasks || [];
    writeOperation(file, state);
    const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || command(options.ghCommand || 'gh', ['auth', 'token']);
    const publicState = await observeUnpublishedRelease(options.version, { token, ...dependencies.observationOptions });
    if (publicState.status !== 'unpublished') return answer('public-state-blocked', ['先核实当前公开事实或活动发布运行；不改变已发布集合。'], { publicState });
    const runtime = dependencies.runtime ?? createReleaseToolRuntime();
    const taskId = `release-${options.version}`;
    const controller = (dependencies.resolveRetainedController ?? resolveRetainedController)(workspace);
    const invoke = dependencies.invokeRetainedController ?? defaultInvokeRetained;
    let task: any;
    try { task = runtime.inspectTask(workspace, taskId); }
    catch (error: any) {
      if (error.code !== 'task_record_not_found') throw error;
      if (git(['branch', '--show-current']) !== 'dev' || git(['status', '--porcelain=v1']).trim() || git(['rev-parse', 'HEAD']) !== git(['rev-parse', 'origin/dev'])) throw new Error('Creating a release Task requires the clean retained dev baseline to be synchronized first.');
      task = take(invoke(controller, ['task', 'create', taskId, '--title', `准备发布 ${options.version}`, '--intent', '验证已明确选择的最终发布组合和唯一产物；公开发布需独立授权。', '--project', 'product', '--service', 'product/buildr', '--service', 'product/buildr-web', '--target', workspace, '--json']));
    }
    if (task.record?.status !== 'active') throw new Error('Release preparation requires the matching active Task.');
    let worktree = runtime.inspectGitWorktrees({ workspaceRoot: workspace, taskId });
    if (worktree.status !== 'ready') worktree = take(invoke(controller, ['worktree', 'create', taskId, '--target', workspace, '--branch', `codex/${taskId}`, '--start-point', baseline, '--include', 'workspace', '--json']));
    const repo = worktree.repositories.find((entry: any) => entry.selector === 'workspace')?.checkoutPath;
    if (!repo) throw new Error('Release Worktree has no matching workspace repository.');
    const binding = () => resolveReleaseExecutionBinding({ version: options.version, workspace, repo }, runtime);
    let selection = inspectReleaseSelection({ version: options.version, repo, devRef: 'origin/dev' });
    if (selection.status === 'blocked') {
      const existing = git(['for-each-ref', '--format=%(refname)', `refs/heads/release-${options.version}`, `refs/buildr/release/${options.version}/`], repo);
      if (existing) throw new Error(selection.diagnostic?.message || 'Existing release selection cannot be read.');
      selection = take(createReleaseSelection({ version: options.version, repo, baseline, devRef: 'origin/dev', executionBinding: binding() }));
    }
    if (selection.devBaseline !== baseline) throw new Error('The existing release baseline differs from the explicit selection.');
    state.sources = [...new Set([...selection.selectionChain.map((entry: any) => entry.sourceDevCommit), ...state.sources])];
    const unselected = state.sources.filter((source: string) => !selection.selectionChain.some((entry: any) => entry.sourceDevCommit === source));
    if (unselected.length && selection.status === 'frozen') take(reopenReleaseSelection({ version: options.version, repo, devRef: 'origin/dev', executionBinding: binding(), confirm: true, reason: '纳入已授权并完成相关验证的明确dev修复提交' }));
    for (const source of state.sources) take(selectReleaseCommit({ version: options.version, repo, source, devRef: 'origin/dev', executionBinding: binding() }));
    selection = take(freezeReleaseSelection({ version: options.version, repo, devRef: 'origin/dev', executionBinding: binding() }));
    const main = git(['rev-parse', 'origin/main'], repo);
    const mainParents = git(['rev-list', '--parents', '-n', '1', main], repo).split(/\s/u).slice(1);
    const alreadyMerged = mainParents.length === 2 && mainParents.includes(selection.releaseHead) && git(['rev-parse', `${main}^{tree}`], repo) === selection.releaseTree;
    if (!alreadyMerged) selection = take(reconcileReleaseToMain({ version: options.version, repo, devRef: 'origin/dev', mainRef: 'origin/main', executionBinding: binding(), confirm: true, reason: '冻结完整候选前核验当前main来源与最终组合' }));
    const sourceCommit = selection.releaseHead;
    if (JSON.parse(git(['show', `${sourceCommit}:projects/product/services/buildr/package.json`], repo)).version !== options.version) throw new Error('Selected source package version differs from the requested release; first deliver and select its version materials on dev.');
    state.sourceCommit = sourceCommit;
    const carrier = releaseCarrierBranchFor(options.version, selection.generation);
    for (const branch of [`release-${options.version}`, carrier]) {
      const observed = git(['ls-remote', 'origin', `refs/heads/${branch}`], repo).split(/\s/u)[0] || null;
      if (observed !== sourceCommit) pushReleaseBranch({ repo, branch, commit: sourceCommit, before: observed }, { execute }, currentEffects);
    }
    if (state.candidate?.sourceCommit !== sourceCommit) state.candidate = { sourceCommit, branch: carrier, runId: options.candidateRunId || null, dispatchRequested: false };
    if (!state.candidate.runId) {
      const find = () => JSON.parse(gh(['run', 'list', '--repo', releasePublishAuthority.repository, '--workflow', 'verify.yml', '--branch', carrier, '--event', 'workflow_dispatch', '--limit', '100', '--json', 'databaseId,headSha,status,conclusion'])).find((run: any) => run.headSha === sourceCommit);
      let existing = find();
      if (!existing && !state.candidate.dispatchRequested) {
        state.candidate.dispatchRequested = true;
        writeOperation(file, state);
        const effect = { type: 'candidate-dispatched', branch: carrier, sourceCommit, state: 'unknown' };
        currentEffects.push(effect);
        try { gh(['workflow', 'run', 'verify.yml', '--repo', releasePublishAuthority.repository, '--ref', carrier, '-f', 'purpose=candidate']); effect.state = 'confirmed'; }
        catch { /* Resolve response loss by the same source/carrier readback. */ }
        existing = find();
      }
      if (!existing) { writeOperation(file, state); return answer('candidate-dispatch-unconfirmed', ['稍后inspect/prepare回读同一载体的运行，不再次派发。']); }
      state.candidate.runId = Number(existing.databaseId);
    }
    writeOperation(file, state);
    const candidate = readRun(state.candidate.runId);
    if (candidate.head_sha !== sourceCommit) throw new Error('Candidate run source differs from the frozen release.');
    if (candidate.repository?.full_name !== releasePublishAuthority.repository || candidate.path?.split('@')[0] !== '.github/workflows/verify.yml' || candidate.event !== 'workflow_dispatch') throw new Error('Candidate run does not belong to the expected repository and verification workflow.');
    if (candidate.status !== 'completed') return answer('candidate-running', ['等待当前候选终态，再继续同一prepare。'], { run: candidate });
    if (candidate.conclusion !== 'success') {
      const retried = retryCandidateFailedShards({ runId: state.candidate.runId, sourceCommit, repo }, { execute });
      currentEffects.push(...retried.effects);
      return answer(retried.status === 'dispatched' ? 'candidate-running' : 'diagnosis-required', retried.nextActions, { retry: retried });
    }
    const candidateEvidence = readCandidateEvidence({ candidateRunId: state.candidate.runId, ghCommand: options.ghCommand || 'gh', repo, execute, dependencies: dependencies.candidateDependencies });
    assertReleaseConsumptionCoverage(candidateEvidence.aggregate, { sourceCommit, sourceTree: selection.releaseTree }, candidateEvidence.manifest);
    if (String(candidateEvidence.aggregate.workflow?.runId) !== String(state.candidate.runId) || Number(candidateEvidence.aggregate.workflow?.aggregateAttempt) !== Number(candidate.run_attempt)) throw new Error('Candidate evidence belongs to a different run/attempt.');
    const pr = take(ensureReleaseToMainPullRequest({ version: options.version, generation: selection.generation, repo, candidateCommit: sourceCommit, candidateTree: selection.releaseTree,
      authorizeReleasePush: true, authorizePullRequest: true }, { execute }));
    if (pr.pullRequest.state !== 'MERGED') {
      const effect = { type: 'release-main-merge', url: pr.pullRequest.url, sourceCommit, state: 'unknown' };
      currentEffects.push(effect);
      gh(['pr', 'merge', pr.pullRequest.url, '--repo', releasePublishAuthority.repository, '--merge', '--match-head-commit', sourceCommit], repo);
      effect.state = 'confirmed';
      git(['fetch', '--no-tags', 'origin', 'refs/heads/main:refs/remotes/origin/main'], repo);
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
    return answer('blocked', error.ownerResult?.nextActions || ['核对已发生效果并以同一版本继续；不重新创建现场或发布。'], { diagnostic: { code: error.code || 'release-operation-blocked', message: error.message }, ownerResult: error.ownerResult });
  } finally {
    fs.unlinkSync(lock);
  }
}

function parseOptions(argv: any): any  {
  const [action, ...rest]: any = argv;
  const options: any = { action, detail: 'compact', output: null, input: null, sources: [] };
  for (let index: any = 0; index < rest.length; index++) {
    const key: any = rest[index];
    if (key === '--authorized') { options.authorized = true; continue; }
    const value: any = rest[index + 1];
    if (!key?.startsWith('--') || value === undefined) throw new Error(`Invalid argument: ${key || '<missing>'}`);
    if (key === '--source') options.sources.push(value);
    else options[key.slice(2)] = value;
    index++;
  }
  if (!options.input && ['prepare', 'inspect', 'publish', 'resume'].includes(action)) return {
    ...options, normalOperation: true, candidateRunId: options['candidate-run-id'] ? Number(options['candidate-run-id']) : null,
    supportTasks: options['support-tasks'] ? options['support-tasks'].split(',').filter(Boolean) : undefined,
  };
  if (!options.input) throw new Error('Usage: release-orchestration-runner.ts <prepare|inspect|publish|resume> --version <version> --workspace <root> [--baseline <ref>] [--source <sha> ...] [--authorized]');
  if (!['compact', 'full'].includes(options.detail)) throw new Error('--detail must be compact or full.');
  const input: any = JSON.parse(fs.readFileSync(path.resolve(options.input), 'utf8'));
  if (action === 'inspect') return { action, detail: options.detail, output: options.output ? path.resolve(options.output) : null, expectedTimelineIdentity: options['timeline-identity'] ?? null, inspectedResult: input };
  return { ...input, action, detail: options.detail, output: options.output ? path.resolve(options.output) : null };
}

if (process.argv[1] && sameFilesystemPath(process.argv[1], fileURLToPath(import.meta.url))) {
  let options: any = null;
  try {
    options = parseOptions(process.argv.slice(2));
    const value: any = options.normalOperation ? await runReleaseOperation(options) : options.action === 'inspect'
      ? inspectReleaseOrchestration(options.inspectedResult, options.expectedTimelineIdentity)
      : await runReleaseOrchestration(options);
    if (options.output) fs.writeFileSync(options.output, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    process.stdout.write(`${JSON.stringify(options.normalOperation || options.detail === 'full' ? value : compactReleaseOrchestration(value), null, 2)}\n`);
    if (value.status === 'blocked') process.exitCode = 1;
  } catch (error: any) {
    process.stderr.write(`${JSON.stringify({ schemaVersion: releaseOrchestrationSchema, status: 'blocked', error: error.message, effects: [], nextActions: ['修复release orchestration输入或current owner事实后重试。'] }, null, 2)}\n`);
    process.exitCode = 1;
  }
}
