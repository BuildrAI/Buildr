#!/usr/bin/env node

import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { sameFilesystemPath } from '../../src/infrastructure/filesystem/filesystem-path-identity.mjs';
import { createRuntime } from '../../src/application/compose-runtime.mjs';
import { createExactNodeExecutionEnvironment } from '../../src/infrastructure/process.mjs';
import {
  releasePublishAuthority,
  releaseWorkflowPath,
  sha256,
} from './release-authority.mjs';
import { createReleaseEnvironmentBinding } from './release-environment-binding.mjs';
import { createReleaseTransactionContext, createReleaseTransactionEvidence, validateReleaseTransactionContext } from './release-transaction-evidence.mjs';

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
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || value === undefined) throw new Error(`Invalid argument: ${key || '<missing>'}`);
    options[key.slice(2)] = value;
  }
  return {
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
    timeoutMs: Number(options['timeout-ms'] || 20 * 60 * 1000),
  };
}

function parseJson(value, label) {
  try { return JSON.parse(value); } catch { throw new Error(`${label} returned invalid JSON.`); }
}

function fullCommit(execute, repo, ref) {
  return requiredHash(invoke(execute, 'git', ['rev-parse', ref], repo).trim(), ref);
}

function packageVersionAt(execute, repo, commit) {
  const source = invoke(execute, 'git', ['show', `${commit}:${packagePath}`], repo);
  const metadata = parseJson(source, `git show ${commit}:${packagePath}`);
  return metadata?.version ?? null;
}

async function defaultWait(delayMs) {
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

export async function runHostedReleaseTransaction(options = {}, dependencies = {}) {
  const rawExecute = dependencies.execute ?? defaultExecute;
  const exactNode = createExactNodeExecutionEnvironment({ nodeExecutable: process.execPath, env: process.env, requireNpm: true });
  const execute = (command, args, executeOptions = {}) => rawExecute(command, args, { ...executeOptions, env: executeOptions.env ?? exactNode.env });
  const wait = dependencies.wait ?? defaultWait;
  const onStatus = dependencies.onStatus ?? ((message) => process.stderr.write(`${message}\n`));
  const nowMs = dependencies.nowMs ?? (() => Date.now());
  const releaseId = dependencies.releaseId ?? crypto.randomUUID();
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
  const environmentNodeVersion = invoke(execute, 'git', ['show', `${sourceCommit}:projects/product/.node-version`], repo).trim();
  if (exactNode.audit.version !== environmentNodeVersion) throw new Error(`Release runner Node ${exactNode.audit.version} does not match Task Environment project Node ${environmentNodeVersion}.`);
  let context;
  if (options.releaseContext) context = validateReleaseTransactionContext(options.releaseContext);
  else {
    if (!options.releaseTask) throw new Error('--release-task is required.');
    const candidateRunId = Number(options.candidateRunId);
    if (!Number.isSafeInteger(candidateRunId) || candidateRunId < 1) throw new Error('--candidate-run-id must be a positive GitHub run id.');
    const runtime = dependencies.runtime ?? createRuntime();
    const releaseTaskResult = runtime.inspectTaskRecord(repo, options.releaseTask);
    const releaseTask = releaseTaskResult?.record;
    const supportTasks = (options.supportTasks ?? []).map((taskId) => runtime.inspectTaskRecord(repo, taskId)?.record);
    const retrospectiveSources = releaseTaskResult?.retrospectiveRelations?.sources ?? [];
    const environment = createReleaseEnvironmentBinding({
      task: releaseTask,
      environmentResult: runtime.inspectTaskEnvironment(repo, options.releaseTask),
      repo,
      sourceCommit,
      nodeAudit: exactNode.audit,
      readSourceFile: (commit, file) => invoke(execute, 'git', ['show', `${commit}:${file}`], repo),
    });
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
    if (devTree !== candidateTree) throw new Error(`Dev bridge tree ${devTree} does not match Candidate tree ${candidateTree}.`);
    context = createReleaseTransactionContext({
      releaseTask,
      retrospectiveSources,
      supportTasks,
      candidate: {
        sourceCommit: candidateSourceCommit,
        workflow: '.github/workflows/verify.yml',
        runId: candidateRunId,
        runAttempt: Number(candidateRun.run_attempt),
        runUrl: candidateRun.html_url || `https://github.com/${releasePublishAuthority.repository}/actions/runs/${candidateRunId}`,
      },
      convergence: { candidateBase, candidateTree, sourceCommit, mainCommit: sourceCommit, devCommit },
      environment,
    });
  }
  const contextIdentity = context.convergence;
  if (contextIdentity.candidateBase !== candidateBase || contextIdentity.candidateTree !== candidateTree || contextIdentity.sourceCommit !== sourceCommit || contextIdentity.mainCommit !== remoteMain) {
    throw new Error(`Release transaction context does not match requested Candidate/main identity: ${JSON.stringify({ requested: { candidateBase, candidateTree, sourceCommit, remoteMain }, context: contextIdentity })}`);
  }
  if (context.environment.node.version !== exactNode.audit.version || context.environment.node.executionIdentity !== exactNode.audit.identity) {
    throw new Error(`Release transaction context Node does not match the exact runner environment: ${JSON.stringify({ context: context.environment.node, runner: exactNode.audit })}`);
  }

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
    schemaVersion: 'buildr.release-transaction-runner/v2',
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
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    const result = { schemaVersion: 'buildr.release-transaction-runner/v2', status: 'blocked', error: error.message, effects: [], nextActions: ['修复current release transaction输入或GitHub run后重新dispatch；不得本机创建tag或publish。'] };
    if (options?.output) fs.writeFileSync(options.output, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
    process.stderr.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = 1;
  }
}
