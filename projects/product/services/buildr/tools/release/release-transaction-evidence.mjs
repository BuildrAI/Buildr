#!/usr/bin/env node

import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { sameFilesystemPath } from '../../src/infrastructure/filesystem/filesystem-path-identity.mjs';
import { longRunningOperationSummary } from '../../src/infrastructure/contracts/public-json.ts';
import { releasePreparationBindingSchema, validateReleasePreparationBinding } from './release-preparation-binding.ts';
import { releaseContextSchema, validateReleaseContext } from './release-readiness.mjs';
import { validateReleaseTaskEvidenceCorrelation } from './release-task-evidence-correlation.ts';

export const releaseTransactionContextSchema = 'buildr.release-transaction-context/v2';
export const releaseTransactionEvidenceSchema = 'buildr.release-transaction-evidence/v2';
export const releaseTransactionInspectSchema = 'buildr.release-transaction-inspect/v1';

const SHA = /^[a-f0-9]{40}$/u;
const DIGEST = /^sha256-[a-f0-9]{64}$/u;
const TASK = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/u;

function closed(value, fields, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  for (const field of Object.keys(value)) if (!fields.includes(field)) throw new Error(`${label}.${field} is not supported.`);
  return value;
}

function task(value, label) {
  if (!TASK.test(value || '')) throw new Error(`${label} must be a Task ID.`);
  return value;
}

function sha(value, label) {
  if (!SHA.test(value || '')) throw new Error(`${label} must be a full Git SHA.`);
  return value;
}

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${label} must be a positive integer.`);
  return value;
}

function canonicalIdentity(value) {
  return `sha256-${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function taskProjection(value, label) {
  closed(value, ['taskId', 'title', 'status'], label);
  if (value.status !== 'completed') throw new Error(`${label} must be completed.`);
  return { taskId: task(value.taskId, `${label}.taskId`), title: String(value.title || ''), status: value.status };
}

export function createReleaseTransactionContext(input) {
  closed(input, ['releaseTask', 'supportTasks', 'candidate', 'convergence', 'preparation', 'taskCorrelation'], 'release transaction context input');
  const releaseTask = taskProjection(input.releaseTask, 'releaseTask');
  const supportTasks = [...(input.supportTasks ?? [])].map((item, index) => taskProjection(item, `supportTasks[${index}]`)).sort((left, right) => left.taskId.localeCompare(right.taskId));
  if (new Set([releaseTask.taskId, ...supportTasks.map((item) => item.taskId)]).size !== supportTasks.length + 1) throw new Error('Release/support Task IDs must be unique.');
  const candidate = closed(input.candidate, ['sourceCommit', 'workflow', 'runId', 'runAttempt', 'runUrl'], 'candidate');
  sha(candidate.sourceCommit, 'candidate.sourceCommit');
  positiveInteger(candidate.runId, 'candidate.runId');
  if (candidate.runAttempt !== null && candidate.runAttempt !== undefined) positiveInteger(candidate.runAttempt, 'candidate.runAttempt');
  if (candidate.workflow !== '.github/workflows/verify.yml') throw new Error('candidate.workflow must be .github/workflows/verify.yml.');
  const convergence = closed(input.convergence, ['candidateBase', 'candidateTree', 'sourceCommit', 'mainCommit', 'devCommit'], 'convergence');
  for (const [field, value] of Object.entries(convergence)) sha(value, `convergence.${field}`);
  if (convergence.sourceCommit !== convergence.mainCommit) throw new Error('Publish source commit must match mainCommit.');
  if (input.preparation?.schemaVersion !== releasePreparationBindingSchema || !DIGEST.test(input.preparation.identity || '')) throw new Error('Release preparation binding is invalid.');
  validateReleasePreparationBinding(input.preparation);
  if (input.preparation.taskId !== releaseTask.taskId || input.preparation.sourceCommit !== convergence.sourceCommit) throw new Error('Release preparation binding does not match release Task/final source.');
  const taskCorrelation = input.taskCorrelation == null ? null : validateReleaseTaskEvidenceCorrelation(input.taskCorrelation);
  if (taskCorrelation && (taskCorrelation.releaseTask.taskId !== releaseTask.taskId
    || taskCorrelation.supportTasks.map((item) => item.taskId).join('\0') !== supportTasks.map((item) => item.taskId).join('\0'))) {
    throw new Error('Release task evidence correlation does not match release/support Tasks.');
  }
  const value = {
    schemaVersion: releaseTransactionContextSchema,
    releaseTask,
    supportTasks,
    candidate: {
      sourceCommit: candidate.sourceCommit,
      workflow: candidate.workflow,
      runId: candidate.runId,
      runAttempt: candidate.runAttempt ?? null,
      runUrl: String(candidate.runUrl || ''),
    },
    convergence: { ...convergence },
    preparation: input.preparation,
    ...(taskCorrelation ? { taskCorrelation } : {}),
  };
  value.identity = canonicalIdentity(value);
  return value;
}

export function validateReleaseTransactionContext(value, options = {}) {
  closed(value, ['schemaVersion', 'releaseTask', 'supportTasks', 'candidate', 'convergence', 'preparation', 'taskCorrelation', 'identity'], 'release transaction context');
  if (value.schemaVersion !== releaseTransactionContextSchema || !DIGEST.test(value.identity || '')) throw new Error('Release transaction context schema/identity is invalid.');
  const recreated = createReleaseTransactionContext({
    releaseTask: value.releaseTask,
    supportTasks: value.supportTasks,
    candidate: value.candidate,
    convergence: value.convergence,
    preparation: value.preparation,
    taskCorrelation: value.taskCorrelation || null,
  });
  if (recreated.identity !== value.identity) throw new Error(`Release transaction context identity mismatch: ${value.identity} != ${recreated.identity}.`);
  if (options.repo) validateReleasePreparationBinding(recreated.preparation, { repo: options.repo });
  return recreated;
}

function validateEvidenceContext(value, options = {}) {
  return value?.schemaVersion === releaseContextSchema ? validateReleaseContext(value) : validateReleaseTransactionContext(value, options);
}

function contextSourceCommit(context) {
  return context.schemaVersion === releaseContextSchema ? context.convergence?.mainCommit : context.convergence?.sourceCommit;
}

function recoveryClass({ outcome, tagCommit, registryPublished, conflict = false, requested = null }) {
  if (outcome === 'passed') return null;
  if (requested && ['same-attempt', 'new-attempt', 'blocked-new-version'].includes(requested)) return requested;
  if (conflict) return 'blocked-new-version';
  return tagCommit || registryPublished ? 'new-attempt' : 'new-attempt';
}

function attemptSteps({ tagCommit, registryPublished, githubRelease, registrySmoke }) {
  const reachedTag = Boolean(tagCommit);
  const reachedRegistry = registryPublished === true;
  return [
    ['oidc', reachedTag ? 'passed' : 'unknown'],
    ['pre-tag', reachedTag ? 'passed' : 'unknown'],
    ['tag', reachedTag ? 'passed' : 'not-reached'],
    ['npm', reachedRegistry ? 'passed' : reachedTag ? 'failed' : 'not-reached'],
    ['dist-tag-readback', reachedRegistry ? 'passed' : 'not-reached'],
    ['github-release', githubRelease ? 'passed' : reachedRegistry ? 'unknown' : 'not-reached'],
    ['registry-smoke', registrySmoke === 'passed' ? 'passed' : reachedRegistry ? 'unknown' : 'not-reached'],
  ].map(([id, status]) => ({ id, status }));
}

export function createReleaseTransactionEvidence({ context, publish, outcome, publicFacts = null, observedAt = new Date().toISOString() }) {
  const normalizedContext = validateEvidenceContext(context);
  closed(publish, ['repository', 'workflow', 'runId', 'runAttempt', 'runUrl', 'headSha'], 'publish');
  positiveInteger(publish.runId, 'publish.runId');
  positiveInteger(publish.runAttempt, 'publish.runAttempt');
  sha(publish.headSha, 'publish.headSha');
  if (!publish.repository || publish.workflow !== '.github/workflows/publish.yml' || !publish.runUrl) throw new Error('Publish run repository/workflow/url is invalid.');
  if (publish.headSha !== contextSourceCommit(normalizedContext)) throw new Error('Publish run head does not match release context source.');
  if (!['passed', 'failed', 'cancelled'].includes(outcome)) throw new Error(`Unsupported release transaction outcome: ${outcome}.`);
  const version = String(publicFacts?.version || '');
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(version)) throw new Error('Release transaction evidence requires the target version.');
  const tagCommit = publicFacts?.tagCommit ?? null;
  if (tagCommit !== null) sha(tagCommit, 'release.tagCommit');
  if (outcome === 'passed' && tagCommit !== publish.headSha) throw new Error('Passed release transaction must observe the tag at the publish source commit.');
  const value = {
    schemaVersion: releaseTransactionEvidenceSchema,
    status: outcome,
    context: normalizedContext,
    publish: { ...publish },
    release: {
      tag: `v${version}`,
      tagCommit,
      npmVersion: version,
      npmDistTag: publicFacts?.npmDistTag ?? null,
      registryPublished: publicFacts?.registryPublished === true,
      registryIntegrity: publicFacts?.registryIntegrity ?? null,
      githubRelease: publicFacts?.githubRelease ?? null,
      registrySmoke: publicFacts?.registrySmoke ?? (outcome === 'passed' ? 'passed' : 'unknown'),
    },
    attempt: {
      runId: publish.runId,
      runAttempt: publish.runAttempt,
      steps: attemptSteps({ tagCommit, registryPublished: publicFacts?.registryPublished, githubRelease: publicFacts?.githubRelease, registrySmoke: publicFacts?.registrySmoke ?? (outcome === 'passed' ? 'passed' : 'unknown') }),
      recovery: recoveryClass({ outcome, tagCommit, registryPublished: publicFacts?.registryPublished, conflict: publicFacts?.conflict === true, requested: publicFacts?.recoveryClass }),
    },
    observedAt,
    aggregateEligible: false,
  };
  value.identity = canonicalIdentity(value);
  return value;
}

export function validateReleaseTransactionEvidence(value) {
  closed(value, ['schemaVersion', 'status', 'context', 'publish', 'release', 'attempt', 'observedAt', 'aggregateEligible', 'identity'], 'release transaction evidence');
  if (value.schemaVersion !== releaseTransactionEvidenceSchema || !DIGEST.test(value.identity || '')) throw new Error('Release transaction evidence schema/identity is invalid.');
  closed(value.release, ['tag', 'tagCommit', 'npmVersion', 'npmDistTag', 'registryPublished', 'registryIntegrity', 'githubRelease', 'registrySmoke'], 'release transaction evidence release');
  closed(value.attempt, ['runId', 'runAttempt', 'steps', 'recovery'], 'release transaction evidence attempt');
  if (value.attempt.runId !== value.publish.runId || value.attempt.runAttempt !== value.publish.runAttempt || !Array.isArray(value.attempt.steps)) throw new Error('Release transaction attempt identity is invalid.');
  if (value.attempt.recovery !== null && !['same-attempt', 'new-attempt', 'blocked-new-version'].includes(value.attempt.recovery)) throw new Error('Release transaction recovery class is invalid.');
  if (value.release.tag !== `v${value.release.npmVersion}`) throw new Error('Release transaction evidence tag/version mismatch.');
  if (value.release.registryIntegrity !== null && !/^sha512-[A-Za-z0-9+/]+={0,2}$/u.test(value.release.registryIntegrity)) throw new Error('Release transaction evidence Registry integrity is invalid.');
  const recreated = createReleaseTransactionEvidence({
    context: value.context,
    publish: value.publish,
    outcome: value.status,
    publicFacts: {
      version: value.release.npmVersion,
      tagCommit: value.release.tagCommit,
      npmDistTag: value.release.npmDistTag,
      registryPublished: value.release.registryPublished,
      registryIntegrity: value.release.registryIntegrity,
      githubRelease: value.release.githubRelease,
      registrySmoke: value.release.registrySmoke,
      recoveryClass: value.attempt.recovery,
    },
    observedAt: value.observedAt,
  });
  if (recreated.identity !== value.identity) throw new Error(`Release transaction evidence identity mismatch: ${value.identity} != ${recreated.identity}.`);
  return recreated;
}

function findEvidenceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? findEvidenceFiles(file) : entry.name === 'release-transaction-evidence.json' ? [file] : [];
  });
}

function executeOrThrow(execute, command, args, cwd) {
  const result = execute(command, args, { cwd, encoding: 'utf8' });
  if (result?.status !== 0) throw new Error(`${command} ${args.join(' ')} failed: ${String(result?.stderr ?? result?.stdout ?? '').trim()}`);
  return String(result?.stdout ?? '');
}

export async function inspectHostedReleaseTransaction(options, dependencies = {}) {
  const runId = positiveInteger(Number(options.runId), 'runId');
  const repository = String(options.repository || 'BuildrAI/Buildr');
  const ghCommand = options.ghCommand || 'gh';
  const execute = dependencies.execute ?? ((command, args, spawnOptions) => spawnSync(command, args, spawnOptions));
  const temporary = (dependencies.makeTempDirectory ?? ((prefix) => fs.mkdtempSync(prefix)))(path.join(os.tmpdir(), 'buildr-release-evidence-'));
  try {
    executeOrThrow(execute, ghCommand, ['run', 'download', String(runId), '--repo', repository, '--pattern', 'release-evidence-*', '--dir', temporary], process.cwd());
    const files = findEvidenceFiles(temporary);
    if (files.length !== 1) throw new Error(`Expected exactly one release transaction evidence file for run ${runId}, found ${files.length}.`);
    const evidence = validateReleaseTransactionEvidence(JSON.parse(fs.readFileSync(files[0], 'utf8')));
    if (evidence.status === 'passed' && (!evidence.release.registryPublished || !evidence.release.registryIntegrity || evidence.release.registrySmoke !== 'passed' || !evidence.release.githubRelease)) {
      throw new Error(`Passed release transaction ${runId} is missing official Registry/GitHub/smoke evidence.`);
    }
    const run = JSON.parse(executeOrThrow(execute, ghCommand, ['api', `repos/${repository}/actions/runs/${runId}`], process.cwd()));
    const actual = {
      repository: run?.repository?.full_name ?? null,
      event: run?.event ?? null,
      headSha: run?.head_sha ?? null,
      workflow: typeof run?.path === 'string' ? run.path.split('@')[0] : null,
      runAttempt: Number(run?.run_attempt),
    };
    const expected = { repository, event: 'workflow_dispatch', headSha: evidence.publish.headSha, workflow: evidence.publish.workflow, runAttempt: evidence.publish.runAttempt };
    if (evidence.publish.runId !== runId || JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Release evidence/run readback mismatch: ${JSON.stringify({ expected: { runId, ...expected }, actual: { runId: evidence.publish.runId, ...actual } })}`);
    return { schemaVersion: releaseTransactionInspectSchema, status: evidence.status, runId, correlationIdentity: evidence.context.identity, evidenceIdentity: evidence.identity, evidence };
  } finally {
    (dependencies.removeDirectory ?? ((directory) => fs.rmSync(directory, { recursive: true, force: true })))(temporary);
  }
}

export function compactReleaseTransactionInspect(value) {
  const evidence = value?.evidence || value;
  const runId = value?.runId || evidence?.publish?.runId || null;
  const taskId = evidence?.context?.preparation?.taskId || evidence?.context?.releaseTask?.taskId || null;
  return longRunningOperationSummary({
    operation: 'release.transaction.inspect',
    terminal: true,
    status: value?.status === 'passed' || value?.status === 'ready' ? 'passed' : value?.status === 'cancelled' ? 'cancelled' : 'failed',
    taskId,
    runId: runId === null ? null : String(runId),
    resultIdentity: value?.evidenceIdentity || evidence?.identity || null,
    stages: evidence?.attempt?.steps || [],
    primaryFailure: value?.status === 'failed' ? { code: 'release.transaction_failed', message: value?.error || 'Release transaction evidence reports failure.' } : null,
    cleanup: { status: 'not-applicable' },
    outputTruncated: Boolean(value?.evidence),
    recovery: runId === null ? null : { owner: 'release-transaction-evidence', operation: 'inspect-run', taskId, runId: String(runId), recordId: null },
  });
}

function parseOptions(argv) {
  const [action, ...rest] = argv;
  const options = { action };
  for (let index = 0; index < rest.length; index += 2) {
    const key = rest[index];
    const value = rest[index + 1];
    if (!key?.startsWith('--') || value === undefined) throw new Error(`Invalid release transaction evidence argument: ${key || '<missing>'}`);
    options[key.slice(2)] = value;
  }
  return options;
}

if (process.argv[1] && sameFilesystemPath(process.argv[1], fileURLToPath(import.meta.url))) {
  let options = null;
  try {
    options = parseOptions(process.argv.slice(2));
    let value;
    let resultSchema;
    if (options.action === 'validate-context' && options.input && options.output) {
      value = validateEvidenceContext(JSON.parse(fs.readFileSync(path.resolve(options.input), 'utf8')), { repo: options.repo });
      resultSchema = value.schemaVersion;
    } else if (options.action === 'finalize' && options.context && options.output) {
      const context = validateEvidenceContext(JSON.parse(fs.readFileSync(path.resolve(options.context), 'utf8')));
      const outcome = options.outcome === 'success' ? 'passed' : options.outcome === 'cancelled' ? 'cancelled' : 'failed';
      const registryState = options['registry-state'] && fs.statSync(path.resolve(options['registry-state']), { throwIfNoEntry: false })?.isFile()
        ? JSON.parse(fs.readFileSync(path.resolve(options['registry-state']), 'utf8'))
        : null;
      let tagCommit = options['tag-commit'] || null;
      if (!tagCommit && options.repo) {
        const observedTag = spawnSync('git', ['rev-parse', `v${options.version}^{commit}`], { cwd: path.resolve(options.repo), encoding: 'utf8' });
        if (observedTag.status === 0) tagCommit = observedTag.stdout.trim();
      }
      value = createReleaseTransactionEvidence({
        context,
        publish: {
          repository: options.repository,
          workflow: options.workflow,
          runId: Number(options['run-id']),
          runAttempt: Number(options['run-attempt']),
          runUrl: options['run-url'],
          headSha: options['head-sha'],
        },
        outcome,
        publicFacts: {
          version: options.version,
          tagCommit,
          npmDistTag: options['npm-dist-tag'],
          registryPublished: registryState?.published === true,
          registryIntegrity: registryState?.published === true ? registryState.integrity : null,
          githubRelease: outcome === 'passed' ? options['github-release'] : null,
          registrySmoke: outcome === 'passed' ? 'passed' : 'unknown',
          conflict: options.conflict === 'true',
          recoveryClass: options['recovery-class'] || null,
        },
      });
      resultSchema = releaseTransactionEvidenceSchema;
    } else if (options.action === 'inspect' && options.input) {
      value = validateReleaseTransactionEvidence(JSON.parse(fs.readFileSync(path.resolve(options.input), 'utf8')));
      resultSchema = releaseTransactionEvidenceSchema;
    } else if (options.action === 'inspect-run' && options['run-id']) {
      value = await inspectHostedReleaseTransaction({ runId: Number(options['run-id']), repository: options.repository, ghCommand: options.gh });
      resultSchema = releaseTransactionInspectSchema;
    } else {
      throw new Error('Usage: release-transaction-evidence.mjs validate-context --input <json-file> --output <json-file> | finalize --context <json-file> --output <json-file> ... | inspect --input <json-file> | inspect-run --run-id <id> [--repository <owner/repo>]');
    }
    if (options.output) {
      const output = path.resolve(options.output);
      fs.mkdirSync(path.dirname(output), { recursive: true });
      const temporary = `${output}.${process.pid}.tmp`;
      fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
      fs.renameSync(temporary, output);
    }
    const full = options.detail === 'full';
    const output = options.action === 'inspect-run'
      ? (full ? value : compactReleaseTransactionInspect(value))
      : { schemaVersion: resultSchema, status: 'ready', identity: value.identity };
    process.stdout.write(`${JSON.stringify(output)}\n`);
  } catch (error) {
    const blocked = { schemaVersion: releaseTransactionContextSchema, status: 'blocked', error: error.message };
    process.stderr.write(`${JSON.stringify(options?.detail === 'full' ? blocked : compactReleaseTransactionInspect({ status: 'failed', error: error.message }))}\n`);
    process.exitCode = 1;
  }
}
