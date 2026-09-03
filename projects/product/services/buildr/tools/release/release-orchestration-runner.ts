#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { createRuntime } from '../../src/bootstrap/runtime.ts';
import { sameFilesystemPath } from '../../src/infrastructure/filesystem/filesystem-path-identity.ts';
import { closeoutReleaseGitResources, reconcilePublishedReleaseWithDev } from './release-git-convergence.ts';
import { createReleaseLifecycle, projectReleaseLifecycleOrchestration } from './release-lifecycle.ts';
import { compactReleasePhaseTimeline, createReleasePhaseTimeline, projectCandidateAttempts } from './release-phase-timeline.ts';
import { inspectHostedReleaseTransaction } from './release-transaction-evidence.ts';
import { runHostedReleaseTransaction } from './release-transaction-runner.ts';

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
  if (run?.status !== 0) return { schemaVersion: 'buildr.retained-controller-result/v1', status: 'blocked', diagnostic: { code: `${label}-failed`, message: value?.diagnostic?.message || source || `${label} failed.` }, ownerResult: value, effects: [], nextActions: value?.nextActions ?? [`恢复${label}后重试。`] };
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
  const runtime: any = dependencies.runtime ?? createRuntime();
  const inspectTask: any = dependencies.inspectTaskRecord ?? ((target: any, taskId: any) => runtime.inspectTaskRecord(target, taskId));
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

function parseOptions(argv: any): any  {
  const [action, ...rest]: any = argv;
  const options: any = { action, detail: 'compact', output: null, input: null };
  for (let index: any = 0; index < rest.length; index += 2) {
    const key: any = rest[index];
    const value: any = rest[index + 1];
    if (!key?.startsWith('--') || value === undefined) throw new Error(`Invalid argument: ${key || '<missing>'}`);
    options[key.slice(2)] = value;
  }
  if (!options.input) throw new Error('Usage: release-orchestration-runner.ts <prepare-dispatch|dispatch|closeout|inspect> --input <json-file> [--timeline-identity <sha256>] [--detail compact|full] [--output <json-file>]');
  if (!['compact', 'full'].includes(options.detail)) throw new Error('--detail must be compact or full.');
  const input: any = JSON.parse(fs.readFileSync(path.resolve(options.input), 'utf8'));
  if (action === 'inspect') return { action, detail: options.detail, output: options.output ? path.resolve(options.output) : null, expectedTimelineIdentity: options['timeline-identity'] ?? null, inspectedResult: input };
  return { ...input, action, detail: options.detail, output: options.output ? path.resolve(options.output) : null };
}

if (process.argv[1] && sameFilesystemPath(process.argv[1], fileURLToPath(import.meta.url))) {
  let options: any = null;
  try {
    options = parseOptions(process.argv.slice(2));
    const value: any = options.action === 'inspect'
      ? inspectReleaseOrchestration(options.inspectedResult, options.expectedTimelineIdentity)
      : await runReleaseOrchestration(options);
    if (options.output) fs.writeFileSync(options.output, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    process.stdout.write(`${JSON.stringify(options.detail === 'full' ? value : compactReleaseOrchestration(value), null, 2)}\n`);
    if (value.status === 'blocked') process.exitCode = 1;
  } catch (error: any) {
    process.stderr.write(`${JSON.stringify({ schemaVersion: releaseOrchestrationSchema, status: 'blocked', error: error.message, effects: [], nextActions: ['修复release orchestration输入或current owner事实后重试。'] }, null, 2)}\n`);
    process.exitCode = 1;
  }
}
