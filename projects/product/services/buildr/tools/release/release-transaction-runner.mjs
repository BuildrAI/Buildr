#!/usr/bin/env node

import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { sameFilesystemPath } from '../../src/infrastructure/filesystem/filesystem-path-identity.ts';
import { longRunningOperationSummary } from '../../src/infrastructure/contracts/public-json.ts';
import { createRuntime } from '../../src/bootstrap/runtime.ts';
import { createExactNodeExecutionEnvironment } from '../../src/infrastructure/process.ts';
import {
  releasePublishAuthority,
  releaseWorkflowPath,
  sha256,
} from './release-authority.mjs';
import { validateReleasePreparationBinding } from './release-preparation-binding.ts';
import { readReleaseArtifact } from './release-artifact.mjs';
import { createReleaseContext, evaluateReleaseReadiness, releaseContextIdentity, validateReleaseContext } from './release-readiness.mjs';
import { inspectReleaseSelection } from './release-selection.mjs';
import { createReleaseTaskEvidenceCorrelationFromRuntime } from './release-task-evidence-correlation.ts';
import { createReleaseTransactionEvidence } from './release-transaction-evidence.mjs';

const serviceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const workspaceRoot = path.resolve(serviceRoot, '../../../..');
const packagePath = 'projects/product/services/buildr/package.json';

function defaultExecute(command, args, options = {}) {
  if (options.stream) return spawnSync(command, args, { cwd: options.cwd, env: options.env ?? process.env, stdio: 'inherit' });
  return spawnSync(command, args, { cwd: options.cwd, encoding: 'utf8', env: options.env ?? process.env });
}

function invoke(execute, executable, args, cwd, options = {}) {
  const result = execute(executable, args, { cwd, ...options });
  if (result?.status !== 0) throw new Error(`${executable} ${args.join(' ')} failed: ${String(result?.stderr ?? result?.stdout ?? '').trim()}`);
  return String(result?.stdout ?? '');
}

function requiredHash(value, name) {
  if (!/^[a-f0-9]{40}$/.test(value ?? '')) throw new Error(`${name} must be a full lowercase 40-character Git identity.`);
  return value;
}

function requiredVersion(value) {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(value ?? '')) throw new Error('--version must be a release version without the v prefix.');
  return value;
}

function parseOptions(argv) {
  const values = [...argv];
  const action = values[0] && !values[0].startsWith('--') ? values.shift() : 'readiness';
  if (!['readiness', 'dispatch'].includes(action)) throw new Error(`Unsupported release transaction action: ${action}.`);
  const options = {};
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index];
    const value = values[index + 1];
    if (!key?.startsWith('--') || value === undefined) throw new Error(`Invalid argument: ${key || '<missing>'}`);
    options[key.slice(2)] = value;
  }
  const detail = options.detail || 'compact';
  if (!['compact', 'full'].includes(detail)) throw new Error('--detail must be compact or full.');
  return {
    action,
    repo: path.resolve(options.repo || workspaceRoot),
    sourceCommit: options['source-commit'] || 'origin/main',
    remoteMain: options['remote-main'] || 'origin/main',
    version: requiredVersion(options.version),
    candidateBase: requiredHash(options['candidate-base'], '--candidate-base'),
    candidateTree: requiredHash(options['candidate-tree'], '--candidate-tree'),
    releaseTask: options['release-task'],
    supportTasks: String(options['support-tasks'] || '').split(',').map((item) => item.trim()).filter(Boolean),
    candidateRunId: Number(options['candidate-run-id']),
    devCommit: options['dev-commit'] || 'origin/dev',
    ghCommand: options.gh || 'gh',
    output: options.output ? path.resolve(options.output) : null,
    detail,
    timeoutMs: Number(options['timeout-ms'] || 20 * 60 * 1000),
    publicationAuthorized: options['publication-authorized'] === 'true',
    releaseContext: options['release-context'] ? JSON.parse(fs.readFileSync(path.resolve(options['release-context']), 'utf8')) : null,
    preparationBinding: options.preparation ? JSON.parse(fs.readFileSync(path.resolve(options.preparation), 'utf8')) : null,
  };
}

export function compactReleaseTransaction(result) {
  const runId = result.github?.runId || result.evidence?.publish?.runId || null;
  const taskId = result.context?.preparation?.taskId || result.context?.releaseTask?.taskId || null;
  const failedFinding = result.findings?.find((finding) => finding.severity === 'blocked') || null;
  const failed = result.error ? { code: 'release.transaction_failed', message: result.error } : failedFinding ? { code: failedFinding.code, message: failedFinding.nextAction || failedFinding.expected } : null;
  const normalizedStatus = result.status === 'passed' || result.status === 'ready'
    ? 'passed'
    : result.status === 'cancelled' ? 'cancelled' : result.status === 'failed' ? 'failed' : 'blocked';
  return longRunningOperationSummary({
    operation: `release.transaction.${result.action || 'unknown'}`,
    terminal: true,
    status: normalizedStatus,
    taskId,
    runId: runId === null ? null : String(runId),
    resultIdentity: result.evidence?.identity || result.contextIdentity || result.context?.identity || null,
    stages: result.evidence?.attempt?.steps || (result.findings || []).map((finding) => ({ id: finding.code, status: finding.severity === 'blocked' ? 'blocked' : 'unknown' })),
    primaryFailure: failed,
    cleanup: { status: 'not-applicable' },
    outputTruncated: Boolean(result.context || result.evidence || result.findings?.length),
    recovery: runId === null ? null : {
      owner: 'release-transaction-evidence', operation: 'inspect-run', taskId, runId: String(runId), recordId: null,
    },
  });
}

function parseJson(value, label) {
  try { return JSON.parse(value); } catch { throw new Error(`${label} returned invalid JSON.`); }
}

function fullCommit(execute, repo, ref) {
  return requiredHash(invoke(execute, 'git', ['rev-parse', ref], repo).trim(), ref);
}

function commitParents(execute, repo, commit) {
  return invoke(execute, 'git', ['rev-list', '--parents', '-n', '1', commit], repo).trim().split(/\s+/u).slice(1).filter((value) => /^[a-f0-9]{40}$/u.test(value));
}

function packageVersionAt(execute, repo, commit) {
  const source = invoke(execute, 'git', ['show', `${commit}:${packagePath}`], repo);
  const metadata = parseJson(source, `git show ${commit}:${packagePath}`);
  return metadata?.version ?? null;
}

function taskContextProjection(record) {
  if (!record) return record;
  return { taskId: record.taskId, title: record.title, status: record.status };
}

async function defaultWait(delayMs) {
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

function findSingleFile(root, name) {
  const matches = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(target);
      else if (entry.isFile() && entry.name === name) matches.push(target);
    }
  };
  visit(root);
  if (matches.length !== 1) throw new Error(`Expected exactly one ${name} in Candidate artifacts, found ${matches.length}.`);
  return matches[0];
}

function readCandidateEvidence({ candidateRunId, ghCommand, repo, execute, dependencies }) {
  if (dependencies.candidateEvidence) return dependencies.candidateEvidence;
  const root = (dependencies.makeTempDirectory ?? ((prefix) => fs.mkdtempSync(prefix)))(path.join(os.tmpdir(), 'buildr-release-candidate-'));
  try {
    for (const name of ['candidate-aggregate', 'candidate-package']) {
      invoke(execute, ghCommand, ['run', 'download', String(candidateRunId), '--repo', releasePublishAuthority.repository, '--name', name, '--dir', path.join(root, name)], repo);
    }
    const aggregate = JSON.parse(fs.readFileSync(findSingleFile(path.join(root, 'candidate-aggregate'), 'candidate-ci-aggregate.json'), 'utf8'));
    const artifact = readReleaseArtifact(findSingleFile(path.join(root, 'candidate-package'), 'release-artifact.json'));
    return { aggregate, manifest: artifact.manifest };
  } finally {
    (dependencies.removeDirectory ?? ((directory) => fs.rmSync(directory, { recursive: true, force: true })))(root);
  }
}

function taskCorrelationProjection(value) {
  return value ? {
    identity: value.identity,
    status: value.status,
    sourceCommit: value.source?.sourceCommit || null,
    sourceTree: value.source?.sourceTree || null,
    remoteRef: value.source?.remoteRef || null,
  } : null;
}

export async function runHostedReleaseTransaction(options = {}, dependencies = {}) {
  const rawExecute = dependencies.execute ?? defaultExecute;
  const exactNode = createExactNodeExecutionEnvironment({ nodeExecutable: process.execPath, env: process.env, requireNpm: true });
  const execute = (command, args, executeOptions = {}) => rawExecute(command, args, { ...executeOptions, env: executeOptions.env ?? exactNode.env });
  const wait = dependencies.wait ?? defaultWait;
  const onStatus = dependencies.onStatus ?? ((message) => process.stderr.write(`${message}\n`));
  const nowMs = dependencies.nowMs ?? (() => Date.now());
  const releaseId = dependencies.releaseId ?? crypto.randomUUID();
  const action = options.action || 'readiness';
  const repo = path.resolve(options.repo || workspaceRoot);
  const ghCommand = options.ghCommand || 'gh';
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 20 * 60 * 1000;
  const version = requiredVersion(options.version);
  const candidateBase = requiredHash(options.candidateBase, 'candidateBase');
  const candidateTree = requiredHash(options.candidateTree, 'candidateTree');
  const sourceCommit = fullCommit(execute, repo, options.sourceCommit || 'origin/main');
  const remoteMain = fullCommit(execute, repo, options.remoteMain || 'origin/main');
  if (sourceCommit !== remoteMain) throw new Error(`Release source ${sourceCommit} is not current origin/main ${remoteMain}.`);
  const actualVersion = packageVersionAt(execute, repo, sourceCommit);
  if (actualVersion !== version) throw new Error(`Release version ${version} does not match ${sourceCommit} package version ${actualVersion ?? '<missing>'}.`);
  const actualTree = fullCommit(execute, repo, `${sourceCommit}^{tree}`);
  if (actualTree !== candidateTree) throw new Error(`Release candidate tree ${candidateTree} does not match source tree ${actualTree}.`);
  const workflowSource = invoke(execute, 'git', ['show', `${sourceCommit}:${releaseWorkflowPath}`], repo);
  const workflowSha256 = sha256(workflowSource);
  const title = `Release ${version} (${releaseId})`;
  const productNodeVersion = invoke(execute, 'git', ['show', `${sourceCommit}:projects/product/.node-version`], repo).trim();
  if (exactNode.audit.version !== productNodeVersion) throw new Error(`Release runner Node ${exactNode.audit.version} does not match Product exact Node ${productNodeVersion}.`);
  let context;
  if (options.releaseContext) context = validateReleaseContext(options.releaseContext);
  else {
    if (!options.releaseTask) throw new Error('--release-task is required.');
    const candidateRunId = Number(options.candidateRunId);
    if (!Number.isSafeInteger(candidateRunId) || candidateRunId < 1) throw new Error('--candidate-run-id must be a positive GitHub run id.');
    const runtime = dependencies.runtime ?? createRuntime();
    const releaseTaskResult = runtime.inspectTaskRecord(repo, options.releaseTask);
    const releaseTask = releaseTaskResult?.record;
    const supportTasks = (options.supportTasks ?? []).map((taskId) => taskContextProjection(runtime.inspectTaskRecord(repo, taskId)?.record));
    const preparation = validateReleasePreparationBinding(options.preparationBinding ?? dependencies.preparationBinding, { repo });
    if (preparation.taskId !== releaseTask.taskId || preparation.sourceCommit !== sourceCommit) throw new Error('Release preparation binding does not match the active release Task/publication source.');
    const candidateRun = parseJson(invoke(execute, ghCommand, ['api', `repos/${releasePublishAuthority.repository}/actions/runs/${candidateRunId}`], repo), 'Candidate run readback');
    const candidateActual = {
      repository: candidateRun?.repository?.full_name ?? null,
      event: candidateRun?.event ?? null,
      status: candidateRun?.status ?? null,
      conclusion: candidateRun?.conclusion ?? null,
      workflowPath: typeof candidateRun?.path === 'string' ? candidateRun.path.split('@')[0] : null,
    };
    const candidateExpected = {
      repository: releasePublishAuthority.repository,
      status: 'completed',
      conclusion: 'success',
      workflowPath: '.github/workflows/verify.yml',
    };
    if (JSON.stringify({ ...candidateActual, event: undefined }) !== JSON.stringify({ ...candidateExpected, event: undefined }) || !['pull_request', 'workflow_dispatch'].includes(candidateActual.event)) throw new Error(`Candidate run readback mismatch: ${JSON.stringify({ expected: { ...candidateExpected, event: ['pull_request', 'workflow_dispatch'] }, actual: candidateActual })}`);
    const candidateSourceCommit = requiredHash(candidateRun?.head_sha, 'Candidate run head SHA');
    const candidateSourceTree = fullCommit(execute, repo, `${candidateSourceCommit}^{tree}`);
    if (candidateSourceTree !== candidateTree) throw new Error(`Candidate run tree ${candidateSourceTree} does not match frozen candidate tree ${candidateTree}.`);
    const devCommit = fullCommit(execute, repo, options.devCommit || 'origin/dev');
    const devTree = fullCommit(execute, repo, `${devCommit}^{tree}`);
    const taskCorrelation = options.taskCorrelation || createReleaseTaskEvidenceCorrelationFromRuntime({
      runtime,
      root: repo,
      releaseTask: options.releaseTask,
      releaseTaskStatus: 'active',
      supportTasks: options.supportTasks ?? [],
      source: { sourceCommit, sourceTree: actualTree, remoteRef: remoteMain },
    });
    const inspectSelection = dependencies.inspectSelection ?? inspectReleaseSelection;
    const selection = inspectSelection({ version, repo, devRef: options.devCommit || 'origin/dev' }, { execute: rawExecute });
    const mainParents = commitParents(execute, repo, sourceCommit);
    if (selection.status !== 'frozen' || selection.releaseHead !== candidateBase) throw new Error(`Candidate base ${candidateBase} does not match current frozen release generation ${selection.releaseHead ?? '<missing>'}.`);
    if (candidateSourceCommit !== selection.releaseHead) throw new Error(`Candidate run source ${candidateSourceCommit} is stale; current final release source is ${selection.releaseHead}.`);
    if (mainParents.length !== 2 || !mainParents.includes(selection.releaseHead)) throw new Error(`Current main ${sourceCommit} is not the protected merge commit for final release source ${selection.releaseHead}.`);
    const reconciliation = selection.reconciliationChain?.at(-1) ?? null;
    const candidateEvidence = readCandidateEvidence({ candidateRunId, ghCommand, repo, execute, dependencies });
    const aggregate = candidateEvidence.aggregate;
    const manifest = candidateEvidence.manifest;
    const aggregateWorkflow = aggregate?.workflow;
    const aggregateWorkflowActual = {
      runId: aggregateWorkflow?.runId == null ? null : String(aggregateWorkflow.runId),
      aggregateAttempt: Number(aggregateWorkflow?.aggregateAttempt),
    };
    const aggregateWorkflowExpected = {
      runId: String(candidateRunId),
      aggregateAttempt: Number(candidateRun.run_attempt),
    };
    if (JSON.stringify(aggregateWorkflowActual) !== JSON.stringify(aggregateWorkflowExpected)) {
      throw new Error(`Candidate aggregate workflow identity mismatch: ${JSON.stringify({ expected: aggregateWorkflowExpected, actual: aggregateWorkflowActual })}`);
    }
    context = createReleaseContext({
      selection: selection.selectionIdentity ? {
        identity: selection.selectionIdentity,
        version: selection.version,
        branch: selection.branch,
        releaseHead: selection.releaseHead,
        releaseTree: selection.releaseTree,
        generation: selection.generation,
        status: selection.status,
        ...(reconciliation ? { reconciliationIdentity: reconciliation.reconciliationIdentity } : {}),
      } : null,
      release: { version, sourceCommit: candidateSourceCommit, sourceTree: candidateSourceTree },
      candidate: {
        workflow: '.github/workflows/verify.yml',
        runId: candidateRunId,
        runAttempt: Number(candidateRun.run_attempt),
        runUrl: candidateRun.html_url || `https://github.com/${releasePublishAuthority.repository}/actions/runs/${candidateRunId}`,
        sourceCommit: aggregate.sourceCommit || candidateSourceCommit,
        sourceTree: candidateSourceTree,
        registryIdentity: aggregate.registryIdentity,
        aggregateIdentity: releaseContextIdentity(aggregate),
        status: aggregate.status,
      },
      artifact: {
        artifactName: 'candidate-package',
        sourceCommit: manifest.sourceCommit,
        filename: manifest.filename,
        size: manifest.size,
        sha256: manifest.sha256,
        integrity: manifest.integrity,
        applicationPayloadDigest: manifest.applicationPayloadDigest,
      },
      convergence: {
        mainCommit: sourceCommit,
        mainTree: actualTree,
        devCommit,
        devTree,
        ...(reconciliation ? { mergeCommit: sourceCommit, mergeParents: mainParents, mergeMethod: mainParents.length === 2 ? 'merge' : null, reconciliationIdentity: reconciliation.reconciliationIdentity } : {}),
      },
      preparation: { identity: preparation.identity, status: preparation.outcome.status, taskId: preparation.taskId, sourceCommit: preparation.sourceCommit, nodeVersion: preparation.node.version, nodeIdentity: preparation.node.executionIdentity },
      node: { authority: preparation.node.authority, version: exactNode.audit.version, executionIdentity: exactNode.audit.identity },
      workflow: { path: releaseWorkflowPath, digest: `sha256-${workflowSha256}`, repository: releasePublishAuthority.repository, environment: releasePublishAuthority.environment },
      taskCorrelation: taskCorrelationProjection(taskCorrelation),
    });
  }
  const observedBindings = {
    version: context.release?.version,
    mainCommit: context.convergence?.mainCommit,
    mainTree: context.convergence?.mainTree,
    workflowDigest: context.workflow?.digest,
    nodeVersion: context.node?.version,
    nodeIdentity: context.node?.executionIdentity,
  };
  const expectedBindings = {
    version,
    mainCommit: sourceCommit,
    mainTree: actualTree,
    workflowDigest: `sha256-${workflowSha256}`,
    nodeVersion: exactNode.audit.version,
    nodeIdentity: exactNode.audit.identity,
  };
  if (JSON.stringify(observedBindings) !== JSON.stringify(expectedBindings)) throw new Error(`Release context/current source binding mismatch: ${JSON.stringify({ expected: expectedBindings, actual: observedBindings })}`);
  const readiness = evaluateReleaseReadiness({ stage: 'dispatch-check', context });
  if (action !== 'dispatch') return { schemaVersion: 'buildr.release-transaction-runner/v3', action: 'readiness', ...readiness };
  if (!options.publicationAuthorized) return { schemaVersion: 'buildr.release-transaction-runner/v3', action: 'dispatch', status: 'blocked', context, contextIdentity: context.identity, findings: [{ code: 'publication-authorization-required', severity: 'blocked', owner: 'maintainer', expected: true, actual: false, nextAction: '请维护者对当前frozen context明确授权publication。' }], deferredChecks: readiness.deferredChecks, effects: [], nextActions: ['请维护者对当前frozen context明确授权publication。'] };
  if (readiness.status !== 'ready') return { schemaVersion: 'buildr.release-transaction-runner/v3', action: 'dispatch', ...readiness };

  invoke(execute, ghCommand, [
    'workflow', 'run', releasePublishAuthority.workflow,
    '--repo', releasePublishAuthority.repository,
    '--ref', 'main',
    '-f', `release_id=${releaseId}`,
    '-f', `version=${version}`,
    '-f', `source_commit=${sourceCommit}`,
    '-f', `candidate_base=${candidateBase}`,
    '-f', `candidate_tree=${candidateTree}`,
    '-f', `workflow_sha256=${workflowSha256}`,
    '-f', `context_digest=${context.identity}`,
    '-f', `candidate_run_id=${context.candidate.runId}`,
    '-f', `release_context=${JSON.stringify(context)}`,
  ], repo);

  const startedAt = nowMs();
  let run = null;
  while (!run && nowMs() - startedAt <= timeoutMs) {
    const runs = parseJson(invoke(execute, ghCommand, [
      'run', 'list',
      '--repo', releasePublishAuthority.repository,
      '--workflow', releasePublishAuthority.workflow,
      '--event', 'workflow_dispatch',
      '--branch', 'main',
      '--limit', '100',
      '--json', 'databaseId,displayTitle,headSha,status,conclusion,url',
    ], repo), 'gh run list');
    run = Array.isArray(runs) ? runs.find((item) => item?.displayTitle === title && item?.headSha === sourceCommit) : null;
    if (!run) await wait(3_000);
  }
  if (!run) throw new Error(`Timed out locating GitHub release transaction ${releaseId}.`);

  const runId = Number(run.databaseId);
  if (!Number.isSafeInteger(runId) || runId < 1) throw new Error('GitHub release transaction returned an invalid run id.');
  const runUrl = run.url || `https://github.com/${releasePublishAuthority.repository}/actions/runs/${runId}`;
  onStatus(`GitHub release transaction: ${runUrl}`);
  onStatus(`The reversible jobs run first. Approve the single ${releasePublishAuthority.environment} deployment when GitHub requests it; no npm password or OTP is needed.`);
  invoke(execute, ghCommand, ['run', 'watch', String(runId), '--repo', releasePublishAuthority.repository, '--exit-status', '--interval', '5'], repo, { stream: true });
  const currentRun = parseJson(invoke(execute, ghCommand, ['api', `repos/${releasePublishAuthority.repository}/actions/runs/${runId}`], repo), 'GitHub run readback');
  const actual = {
    repository: currentRun?.repository?.full_name ?? null,
    event: currentRun?.event ?? null,
    headSha: currentRun?.head_sha ?? null,
    status: currentRun?.status ?? null,
    conclusion: currentRun?.conclusion ?? null,
    workflowPath: typeof currentRun?.path === 'string' ? currentRun.path.split('@')[0] : null,
  };
  const expected = {
    repository: releasePublishAuthority.repository,
    event: 'workflow_dispatch',
    headSha: sourceCommit,
    status: 'completed',
    conclusion: 'success',
    workflowPath: releaseWorkflowPath,
  };
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Release transaction readback mismatch: ${JSON.stringify({ expected, actual })}`);
  const evidence = createReleaseTransactionEvidence({
    context,
    publish: { repository: releasePublishAuthority.repository, workflow: releaseWorkflowPath, runId, runAttempt: Number(currentRun.run_attempt), runUrl, headSha: sourceCommit },
    outcome: 'passed',
    publicFacts: { version, tagCommit: sourceCommit, npmDistTag: version.includes('-') ? 'next' : 'latest', registryPublished: true, githubRelease: `https://github.com/${releasePublishAuthority.repository}/releases/tag/v${version}`, registrySmoke: 'passed' },
  });
  return {
    schemaVersion: 'buildr.release-transaction-runner/v3',
    action: 'dispatch',
    status: 'passed',
    releaseId,
    version,
    tag: `v${version}`,
    sourceCommit,
    candidateBase,
    candidateTree,
    workflow: { path: releaseWorkflowPath, sha256: workflowSha256 },
    github: { repository: releasePublishAuthority.repository, runId, runAttempt: Number(currentRun.run_attempt), runUrl },
    node: exactNode.audit,
    context,
    evidence,
    effects: [{ type: 'workflow-dispatched', runId, runUrl }],
    nextActions: [],
  };
}

if (process.argv[1] && sameFilesystemPath(process.argv[1], fileURLToPath(import.meta.url))) {
  let options = null;
  try {
    options = parseOptions(process.argv.slice(2));
    const result = await runHostedReleaseTransaction(options);
    if (options.output) fs.writeFileSync(options.output, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
    process.stdout.write(`${JSON.stringify(options.detail === 'full' ? result : compactReleaseTransaction(result), null, 2)}\n`);
  } catch (error) {
    const result = { schemaVersion: 'buildr.release-transaction-runner/v3', status: 'blocked', error: error.message, effects: [], nextActions: ['修复current release readiness输入后重试；只有明确publication授权才能dispatch，且不得本机创建tag或publish。'] };
    if (options?.output) fs.writeFileSync(options.output, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
    process.stderr.write(`${JSON.stringify(options?.detail === 'full' ? result : compactReleaseTransaction(result), null, 2)}\n`);
    process.exitCode = 1;
  }
}
