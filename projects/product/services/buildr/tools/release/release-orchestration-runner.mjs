#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { createRuntime } from '../../src/bootstrap/runtime.mjs';
import { sameFilesystemPath } from '../../src/infrastructure/filesystem/filesystem-path-identity.mjs';
import { closeoutReleaseGitResources, reconcilePublishedReleaseWithDev } from './release-git-convergence.mjs';
import { createReleaseLifecycle, projectReleaseLifecycleOrchestration } from './release-lifecycle.mjs';
import { compactReleasePhaseTimeline, createReleasePhaseTimeline, projectCandidateAttempts } from './release-phase-timeline.mjs';
import { inspectHostedReleaseTransaction } from './release-transaction-evidence.mjs';
import { runHostedReleaseTransaction } from './release-transaction-runner.mjs';

export const releaseOrchestrationSchema = 'buildr.release-orchestration-result/v1';

const serviceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const workspaceRoot = path.resolve(serviceRoot, '../../../..');
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u;
const TASK = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/u;

function identity(value) {
  return `sha256-${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function required(value, pattern, label) {
  if (typeof value !== 'string' || !pattern.test(value)) throw new Error(`${label} is invalid.`);
  return value;
}

function effects(steps) {
  return steps.flatMap((step) => step.effects ?? []);
}

function step(owner, operation, result, disposition = 'executed') {
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

function candidateAttempts(context, options) {
  if (Array.isArray(options.candidateAttempts) && options.candidateAttempts.length) return options.candidateAttempts;
  const candidate = context?.candidate;
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

function timeline(options, state = {}) {
  const context = state.context ?? state.evidence?.context ?? null;
  const phases = [];
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
  for (const [key, phase, ownerId] of [['reconciliation', 'dev-reconciliation', 'release-git-convergence'], ['gitCloseout', 'release-git-closeout', 'release-git-convergence'], ['taskCompletion', 'task-completion', 'task-record'], ['environmentCleanup', 'environment-cleanup', 'task-environment'], ['doctor', 'doctor', 'doctor']]) {
    const result = state[key];
    if (result) phases.push({ id: phase, phase, status: ['passed', 'completed', 'cleaned', 'ready'].includes(result.status) ? 'passed' : 'blocked', owner: { id: ownerId, identity: result.identity ?? result.recordDigest ?? result.receiptDigest ?? null }, startedAt: null, finishedAt: result.observedAt ?? null, waitType: 'machine-execution' });
  }
  return createReleasePhaseTimeline({
    version: options.version,
    generation: Number(context?.selection?.generation ?? options.generation ?? 0),
    terminalStatus: state.doctor?.status === 'ready' ? 'closed' : state.blocked ? 'blocked' : 'active',
    phases,
  });
}

function result(options, action, status, state, steps, nextActions = []) {
  const phaseTimeline = timeline(options, { ...state, action, blocked: status === 'blocked' });
  const lifecycle = state.lifecycle ? projectReleaseLifecycleOrchestration(state.lifecycle, phaseTimeline.identity) : null;
  const value = {
    schemaVersion: releaseOrchestrationSchema,
    action,
    status,
    version: options.version,
    releaseTask: options.releaseTask ?? state.context?.environment?.taskId ?? null,
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

function blocked(options, action, state, steps, ownerResult, fallback) {
  const nextActions = ownerResult?.nextActions?.length ? ownerResult.nextActions : [fallback];
  return result(options, action, 'blocked', state, steps, nextActions);
}

function doctorIsReady(value) {
  return value?.status === 'ready' || (value?.ok === true && value?.health?.ready === true);
}

function parseControllerOutput(run, label) {
  const source = String(run?.stdout || run?.stderr || '').trim();
  let value = null;
  try { value = source ? JSON.parse(source) : null; } catch { /* handled below */ }
  if (run?.status !== 0) return { schemaVersion: 'buildr.retained-controller-result/v1', status: 'blocked', diagnostic: { code: `${label}-failed`, message: value?.diagnostic?.message || source || `${label} failed.` }, ownerResult: value, effects: [], nextActions: value?.nextActions ?? [`恢复${label}后重试。`] };
  if (!value) return { schemaVersion: 'buildr.retained-controller-result/v1', status: 'blocked', diagnostic: { code: `${label}-invalid-output`, message: `${label} returned invalid JSON.` }, effects: [], nextActions: [`恢复${label} JSON输出后重试。`] };
  return value;
}

export function resolveRetainedController(environmentResult, canonicalWorkspace) {
  const environment = environmentResult?.environment;
  const root = path.resolve(canonicalWorkspace);
  const sourceRoot = path.resolve(environment?.controller?.sourceRoot ?? '');
  const relative = path.relative(root, sourceRoot);
  if (!environment || !sameFilesystemPath(environment.workspace?.root, root)) throw new Error('Task Environment does not belong to the canonical Workspace.');
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative) || relative.split(path.sep).includes('.worktrees')) throw new Error('Task Environment retained controller source is not a retained Workspace checkout.');
  const executable = environment.runtimeInvocation?.executable;
  if (!path.isAbsolute(executable ?? '')) throw new Error('Task Environment retained controller executable is invalid.');
  const entry = path.join(sourceRoot, 'bin', 'buildr.mjs');
  return { executable, argsPrefix: [entry], sourceRoot, workspaceRoot: root, identity: environment.controller.identity };
}

function defaultInvokeRetained(controller, args) {
  const run = spawnSync(controller.executable, [...controller.argsPrefix, ...args], { cwd: controller.workspaceRoot, encoding: 'utf8' });
  return parseControllerOutput(run, args.slice(0, 3).join('-'));
}

async function prepareDispatch(options, dependencies) {
  const readiness = await (dependencies.runHostedReleaseTransaction ?? runHostedReleaseTransaction)({ ...options.transaction, action: 'readiness' }, dependencies.transactionDependencies);
  const context = readiness.context ?? null;
  const steps = [step('release-transaction-runner', 'readiness', readiness)];
  if (readiness.status !== 'ready' || !context?.identity) return blocked(options, 'prepare-dispatch', { readiness, context }, steps, readiness, '修复current release readiness后重试。');
  return result(options, 'prepare-dispatch', 'awaiting-publication-authorization', { readiness, context }, steps, ['请维护者对current frozen context明确授权publication后，以同一context digest执行dispatch。']);
}

async function dispatch(options, dependencies) {
  if (options.publicationAuthorized !== true || typeof options.expectedContextDigest !== 'string') {
    return blocked(options, 'dispatch', { context: null }, [], { nextActions: ['提供维护者显式publication授权与expected current context digest后重试。'] }, '提供显式授权后重试。');
  }
  const readiness = await (dependencies.runHostedReleaseTransaction ?? runHostedReleaseTransaction)({ ...options.transaction, action: 'readiness' }, dependencies.transactionDependencies);
  const context = readiness.context ?? null;
  const steps = [step('release-transaction-runner', 'readiness', readiness)];
  if (readiness.status !== 'ready' || !context?.identity) return blocked(options, 'dispatch', { readiness, context }, steps, readiness, '修复current release readiness后重试。');
  if (context.identity !== options.expectedContextDigest) {
    const drift = { status: 'blocked', contextIdentity: context.identity, effects: [], nextActions: ['current context已漂移；重新执行prepare-dispatch并取得新的显式publication授权。'] };
    steps.push(step('release-transaction-runner', 'context-digest-check', drift));
    return blocked(options, 'dispatch', { readiness, context }, steps, drift, '重新准备并授权current context。');
  }
  const dispatched = await (dependencies.runHostedReleaseTransaction ?? runHostedReleaseTransaction)({ ...options.transaction, action: 'dispatch', releaseContext: context, publicationAuthorized: true }, dependencies.transactionDependencies);
  steps.push(step('release-transaction-runner', 'dispatch', dispatched));
  if (dispatched.status !== 'passed') return blocked(options, 'dispatch', { readiness, dispatch: dispatched, context }, steps, dispatched, '按protected transaction owner返回的恢复动作重试。');
  return result(options, 'dispatch', 'passed', { readiness, dispatch: dispatched, context }, steps, []);
}

async function closeout(options, dependencies) {
  const steps = [];
  const inspect = await (dependencies.inspectHostedReleaseTransaction ?? inspectHostedReleaseTransaction)({ runId: options.publishRunId, repository: options.repository, ghCommand: options.ghCommand }, dependencies.evidenceDependencies);
  const evidence = inspect?.evidence ?? null;
  steps.push(step('release-transaction-evidence', 'inspect-run', inspect));
  if (inspect?.status !== 'passed' || !evidence) return blocked(options, 'closeout', { evidence }, steps, inspect, '恢复matching hosted Publication evidence后重试。');
  const context = evidence.context;
  if (context?.release?.version !== options.version) return blocked(options, 'closeout', { evidence, context }, steps, { nextActions: ['Publication evidence version与请求version不一致，重新选择matching run。'] }, '选择matching Publication run。');

  const reconciliation = (dependencies.reconcilePublishedReleaseWithDev ?? reconcilePublishedReleaseWithDev)({ repo: options.repo, publicationEvidence: evidence, remote: options.remote, main: options.main, dev: options.dev }, dependencies.gitDependencies);
  steps.push(step('release-git-convergence', 'reconcile-dev', reconciliation));
  if (reconciliation.status !== 'passed') return blocked(options, 'closeout', { evidence, context, reconciliation }, steps, reconciliation, '恢复dev provenance reconciliation后重试。');

  const generation = context.selection?.generation;
  const expectedCommit = context.release?.sourceCommit;
  if (options.generation != null && Number(options.generation) !== generation) return blocked(options, 'closeout', { evidence, context, reconciliation }, steps, { nextActions: ['请求generation与Publication context不一致，使用current evidence generation重试。'] }, '修正generation。');
  if (options.expectedCommit != null && options.expectedCommit !== expectedCommit) return blocked(options, 'closeout', { evidence, context, reconciliation }, steps, { nextActions: ['请求expected commit与Publication context不一致，使用current evidence source重试。'] }, '修正expected commit。');
  const gitCloseout = (dependencies.closeoutReleaseGitResources ?? closeoutReleaseGitResources)({
    repo: options.repo,
    remote: options.remote,
    version: options.version,
    generation,
    expectedCommit,
    authorizeCarrierCleanup: options.authorizeCarrierCleanup === true,
    authorizeLocalSelectionCleanup: options.authorizeLocalSelectionCleanup === true,
  }, dependencies.gitDependencies);
  steps.push(step('release-git-convergence', 'closeout', gitCloseout));
  if (gitCloseout.status !== 'passed') return blocked(options, 'closeout', { evidence, context, reconciliation, gitCloseout }, steps, gitCloseout, '取得明确cleanup授权或恢复Git closeout后重试。');

  const root = path.resolve(options.canonicalWorkspace ?? options.repo ?? workspaceRoot);
  const runtime = dependencies.runtime ?? createRuntime();
  const inspectTask = dependencies.inspectTaskRecord ?? ((target, taskId) => runtime.inspectTaskRecord(target, taskId));
  const inspectEnvironment = dependencies.inspectTaskEnvironment ?? ((target, taskId) => runtime.inspectTaskEnvironment(target, taskId));
  let taskResult = inspectTask(root, options.releaseTask);
  const environmentResult = inspectEnvironment(root, options.releaseTask);
  let controller;
  try { controller = (dependencies.resolveRetainedController ?? resolveRetainedController)(environmentResult, root); } catch (error) {
    return blocked(options, 'closeout', { evidence, context, reconciliation, gitCloseout }, steps, { nextActions: [error.message] }, '恢复matching retained controller后重试。');
  }
  const invokeRetained = dependencies.invokeRetainedController ?? defaultInvokeRetained;
  const activeLifecycle = createReleaseLifecycle({
    version: options.version,
    releaseTask: { taskId: options.releaseTask, status: taskResult.record.status, recordDigest: taskResult.recordDigest, noChange: taskResult.record.result?.noChange ?? null },
    selection: { status: context.selection.status, generation, identity: context.selection.identity },
    candidate: { status: context.candidate.status, identity: context.candidate.aggregateIdentity },
    readiness: { status: 'ready', contextDigest: context.identity },
    publication: { status: 'passed', runId: evidence.publish.runId, evidenceIdentity: evidence.identity },
    convergence: { status: reconciliation.status, recoveryIdentity: reconciliation.recoveryIdentity },
    closeout: { status: gitCloseout.status, identity: gitCloseout.identity, formalReleaseRef: gitCloseout.formalReleaseRef },
  });
  if (activeLifecycle.status !== 'passed' || activeLifecycle.phase !== 'closed') return blocked(options, 'closeout', { evidence, context, reconciliation, gitCloseout, lifecycle: activeLifecycle }, steps, activeLifecycle, '恢复release lifecycle closed事实后重试。');

  let taskCompletion;
  if (taskResult.record.status === 'completed' && taskResult.record.result?.noChange === true) taskCompletion = { status: 'completed', recordDigest: taskResult.recordDigest, effects: [] };
  else if (taskResult.record.status === 'active') {
    taskCompletion = invokeRetained(controller, ['task', 'complete', options.releaseTask, '--summary', options.completionSummary ?? `Release ${options.version} Publication、dev provenance与资源收尾已完成。`, '--no-change', '--target', root, '--json']);
    taskResult = inspectTask(root, options.releaseTask);
  } else taskCompletion = { status: 'blocked', effects: [], nextActions: [`Release Task状态${taskResult.record.status}不能作为closeout完成事实。`] };
  steps.push(step('task-record', 'complete-no-change', taskCompletion, taskCompletion.effects?.length ? 'executed' : 'reused'));
  if (taskResult.record.status !== 'completed' || taskResult.record.result?.noChange !== true) return blocked(options, 'closeout', { evidence, context, reconciliation, gitCloseout, lifecycle: activeLifecycle, taskCompletion }, steps, taskCompletion, '恢复Task no-change completion后重试。');

  const currentEnvironment = inspectEnvironment(root, options.releaseTask);
  let environmentCleanup = currentEnvironment.status === 'cleaned'
    ? { status: 'cleaned', effects: [] }
    : invokeRetained(controller, ['task', 'environment', 'cleanup', options.releaseTask, '--target', root, '--json']);
  steps.push(step('task-environment', 'cleanup', environmentCleanup, environmentCleanup.effects?.length ? 'executed' : 'reused'));
  if (environmentCleanup.status !== 'cleaned') return blocked(options, 'closeout', { evidence, context, reconciliation, gitCloseout, lifecycle: activeLifecycle, taskCompletion, environmentCleanup }, steps, environmentCleanup, '恢复Task Environment cleanup后重试。');

  const doctor = invokeRetained(controller, ['doctor', '--target', root, '--json', '--detail', 'compact', ...(options.agent ? ['--agent', options.agent] : [])]);
  steps.push(step('doctor', 'inspect', doctor));
  if (!doctorIsReady(doctor)) return blocked(options, 'closeout', { evidence, context, reconciliation, gitCloseout, lifecycle: activeLifecycle, taskCompletion, environmentCleanup, doctor }, steps, doctor, '修复Doctor blocker后以同一closeout恢复。');
  const completedLifecycle = createReleaseLifecycle({ ...activeLifecycle.facts, version: options.version, releaseTask: { taskId: options.releaseTask, status: 'completed', recordDigest: taskResult.recordDigest, noChange: true } });
  return result(options, 'closeout', 'passed', { evidence, context, reconciliation, gitCloseout, lifecycle: completedLifecycle, taskCompletion, environmentCleanup, doctor }, steps, []);
}

export async function runReleaseOrchestration(options = {}, dependencies = {}) {
  const action = options.action;
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

export function compactReleaseOrchestration(value) {
  const compactTimeline = compactReleasePhaseTimeline(value.timeline);
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

export function inspectReleaseOrchestration(value, expectedTimelineIdentity = null) {
  if (value?.schemaVersion !== releaseOrchestrationSchema || !value.timeline || value.timelineIdentity !== value.timeline.identity) throw new Error('Release orchestration Result is invalid.');
  if (expectedTimelineIdentity !== null && value.timelineIdentity !== expectedTimelineIdentity) throw new Error('Release orchestration timeline identity does not match the expected identity.');
  compactReleasePhaseTimeline(value.timeline);
  return value;
}

function parseOptions(argv) {
  const [action, ...rest] = argv;
  const options = { action, detail: 'compact', output: null, input: null };
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index];
    const value = rest[index + 1];
    if (!key?.startsWith('--') || value === undefined) throw new Error(`Invalid argument: ${key || '<missing>'}`);
    options[key.slice(2)] = value;
  }
  if (!options.input) throw new Error('Usage: release-orchestration-runner.mjs <prepare-dispatch|dispatch|closeout|inspect> --input <json-file> [--timeline-identity <sha256>] [--detail compact|full] [--output <json-file>]');
  if (!['compact', 'full'].includes(options.detail)) throw new Error('--detail must be compact or full.');
  const input = JSON.parse(fs.readFileSync(path.resolve(options.input), 'utf8'));
  if (action === 'inspect') return { action, detail: options.detail, output: options.output ? path.resolve(options.output) : null, expectedTimelineIdentity: options['timeline-identity'] ?? null, inspectedResult: input };
  return { ...input, action, detail: options.detail, output: options.output ? path.resolve(options.output) : null };
}

if (process.argv[1] && sameFilesystemPath(process.argv[1], fileURLToPath(import.meta.url))) {
  let options = null;
  try {
    options = parseOptions(process.argv.slice(2));
    const value = options.action === 'inspect'
      ? inspectReleaseOrchestration(options.inspectedResult, options.expectedTimelineIdentity)
      : await runReleaseOrchestration(options);
    if (options.output) fs.writeFileSync(options.output, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    process.stdout.write(`${JSON.stringify(options.detail === 'full' ? value : compactReleaseOrchestration(value), null, 2)}\n`);
    if (value.status === 'blocked') process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ schemaVersion: releaseOrchestrationSchema, status: 'blocked', error: error.message, effects: [], nextActions: ['修复release orchestration输入或current owner事实后重试。'] }, null, 2)}\n`);
    process.exitCode = 1;
  }
}
