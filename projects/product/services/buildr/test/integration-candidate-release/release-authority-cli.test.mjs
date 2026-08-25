import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  releaseAuthorityPreflightSchema,
  releaseAuthorityProbeSchema,
  sha256,
} from '../../tools/release/release-authority.mjs';
import { runReleaseAuthorityOidcProbe } from '../../tools/release/release-authority-oidc-probe.mjs';
import { containsCredentialMaterial } from '../../tools/release/release-authority-preflight.mjs';
import { createReleaseEnvironmentBinding } from '../../tools/release/release-environment-binding.mjs';
import { createReleaseTaskEvidenceCorrelation } from '../../tools/release/release-task-evidence-correlation.mjs';
import { runHostedReleaseTransaction } from '../../tools/release/release-transaction-runner.mjs';
import { createReleaseContext } from '../../tools/release/release-readiness.mjs';
import { createReleaseTransactionEvidence, inspectHostedReleaseTransaction, validateReleaseTransactionEvidence } from '../../tools/release/release-transaction-evidence.mjs';
import { ensureReleaseTag, inspectReleaseTag } from '../../tools/release/release-tag-ensure.mjs';
import { createExactNodeExecutionEnvironment } from '../../src/infrastructure/process.mjs';

const serviceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const runId = 987;
const runAttempt = 1;
const fixtureCommit = 'a'.repeat(40);
const candidateBase = 'b'.repeat(40);
const candidateTree = 'c'.repeat(40);
const candidateSourceCommit = 'e'.repeat(40);
const version = '0.1.0-rc.15';
const workflow = `on:
  workflow_dispatch:
    inputs:
      release_id: { required: true, type: string }
      release_context: { required: true, type: string }
      context_digest: { required: true, type: string }
      candidate_run_id: { required: true, type: string }
      version: { required: true, type: string }
      source_commit: { required: true, type: string }
      candidate_base: { required: true, type: string }
      candidate_tree: { required: true, type: string }
      workflow_sha256: { required: true, type: string }
jobs:
  contract: { runs-on: ubuntu-latest }
  candidate: { runs-on: ubuntu-latest }
  host-node: { runs-on: ubuntu-latest }
  launcher: { runs-on: ubuntu-latest }
  release:
    needs: [contract, candidate, host-node, launcher]
    environment: npm-production
    permissions: { contents: write, id-token: write }
    steps:
      - run: node tools/release/release-authority-oidc-probe.mjs fixture
      - run: node tools/release/release-convergence.mjs --stage pre-tag
      - run: node tools/release/release-tag-ensure.mjs preflight fixture
      - run: node tools/release/release-tag-ensure.mjs ensure fixture
      - run: node tools/release/trusted-publish.mjs fixture.tgz
`;

const digest = (letter) => `sha256-${letter.repeat(64)}`;
const gitSha = (letter) => letter.repeat(40);

function completedTaskEvidence(taskId) {
  const carrierIdentity = digest('7');
  return {
    taskId,
    environment: { taskId, status: 'cleaned', receiptIdentity: digest('2'), receiptDigest: digest('3'), declarationIdentity: digest('4'), executionIdentity: digest('5') },
    development: { taskId, status: 'current', receiptIdentity: digest('f'), handoffIdentity: digest('a'), candidateIdentity: digest('b'), candidateGeneration: 2, contentTargetIdentity: digest('c'), taskContextIdentity: digest('d'), contributionIdentity: digest('e') },
    finish: {
      taskId, status: 'complete', runId: 42, resultIdentity: digest('6'), handoffIdentity: digest('a'), candidateIdentity: digest('b'), candidateGeneration: 2, contentTargetIdentity: digest('c'), deliveryStatus: 'delivered', deliveryRef: gitSha('8'), sourceTree: gitSha('9'),
      repositories: [{ selector: 'workspace', disposition: 'applicable', carrierIdentity, carrierRef: gitSha('a'), remote: 'origin', targetBranch: 'dev', deliveryStatus: 'delivered', finalRemoteRef: gitSha('b') }],
      executionRecord: { recordId: 'finish-record-42', identity: digest('0'), status: 'retained', outcome: 'passed', lifecycleStatus: 'retained', evidenceIdentity: digest('1') },
      activation: 'passed', environmentCleanup: 'cleaned', diagnostics: 'passed',
    },
    selfBootstrap: { schemaVersion: 'buildr.self-bootstrap-closeout-result/v1', status: 'passed', taskId, runId: 42, resultIdentity: digest('4'), activationIdentity: digest('5'), planIdentity: digest('6'), carrierIdentity, deliveredRef: gitSha('8'), sourceTree: gitSha('9') },
  };
}

function readyTaskCorrelation(releaseTask, supportTasks) {
  return createReleaseTaskEvidenceCorrelation({
    releaseTask: { ...releaseTask, recordDigest: digest('1') },
    retrospectiveSources: [],
    supportTasks: supportTasks.map((task) => ({ ...task, recordDigest: digest('1') })),
    taskEvidence: [releaseTask, ...supportTasks].map((task) => completedTaskEvidence(task.taskId)),
    source: { sourceCommit: fixtureCommit, sourceTree: candidateTree, remoteRef: fixtureCommit },
  });
}

function hostedEnvironment(sourceCommit = fixtureCommit) {
  return {
    GITHUB_REPOSITORY: 'BuildrAI/Buildr',
    GITHUB_WORKFLOW_REF: 'BuildrAI/Buildr/.github/workflows/publish.yml@refs/heads/main',
    GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_SHA: sourceCommit,
    GITHUB_RUN_ID: String(runId),
    GITHUB_RUN_ATTEMPT: String(runAttempt),
    GITHUB_SERVER_URL: 'https://github.com',
    ACTIONS_ID_TOKEN_REQUEST_URL: 'https://actions.example/id-token',
    ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'github-request-secret',
  };
}

function releaseContext() {
  const exactNode = createExactNodeExecutionEnvironment({ nodeExecutable: process.execPath, env: process.env, requireNpm: true });
  const environment = {
    schemaVersion: 'buildr.release-environment-binding/v1',
    taskId: 'release-0-1-0-rc-15',
    environmentStatus: 'cleaned',
    sourceCommit: fixtureCommit,
    service: 'product/buildr',
    serviceRoot: 'projects/product/services/buildr',
    planIdentity: `sha256-${'1'.repeat(64)}`,
    declarationIdentity: `sha256-${'2'.repeat(64)}`,
    recipe: { id: 'service:product/buildr/buildr.npm-ci', identity: `sha256-${'3'.repeat(64)}`, stepId: 'service:product/buildr/buildr.npm-ci/npm-ci' },
    inputs: { 'package.json': `sha256-${'4'.repeat(64)}`, 'package-lock.json': `sha256-${'5'.repeat(64)}` },
    node: { authority: 'projects/product/.node-version', version: exactNode.audit.version, executionIdentity: exactNode.audit.identity },
  };
  environment.identity = `sha256-${sha256(JSON.stringify(environment))}`;
  return createReleaseContext({
    selection: { identity: digest('6'), version, branch: `release-${version}`, releaseHead: candidateSourceCommit, releaseTree: candidateTree, generation: 1, status: 'frozen' },
    release: { version, sourceCommit: candidateSourceCommit, sourceTree: candidateTree },
    candidate: { workflow: '.github/workflows/verify.yml', runId: 654, runAttempt: 1, runUrl: 'https://github.com/BuildrAI/Buildr/actions/runs/654', sourceCommit: candidateSourceCommit, sourceTree: candidateTree, registryIdentity: digest('7'), aggregateIdentity: digest('8'), status: 'passed' },
    artifact: { artifactName: 'candidate-package', sourceCommit: candidateSourceCommit, filename: 'buildr-ai-buildr.tgz', size: 123, sha256: '9'.repeat(64), integrity: 'sha512-Zml4dHVyZQ==', applicationPayloadDigest: digest('a') },
    convergence: { mainCommit: fixtureCommit, mainTree: candidateTree, devCommit: 'd'.repeat(40), devTree: candidateTree },
    environment: { identity: environment.identity, status: environment.environmentStatus, taskId: environment.taskId, nodeVersion: environment.node.version, nodeIdentity: environment.node.executionIdentity },
    node: { authority: environment.node.authority, version: exactNode.audit.version, executionIdentity: exactNode.audit.identity },
    workflow: { path: '.github/workflows/publish.yml', digest: `sha256-${sha256(workflow)}`, repository: 'BuildrAI/Buildr', environment: 'npm-production' },
    taskCorrelation: { identity: digest('b'), carrierIdentity: digest('c'), status: 'passed', sourceCommit: fixtureCommit, sourceTree: candidateTree, remoteRef: fixtureCommit },
  });
}

function probeRepo(t, prefix) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  fs.mkdirSync(path.join(repo, '.github', 'workflows'), { recursive: true });
  fs.writeFileSync(path.join(repo, '.github', 'workflows', 'publish.yml'), workflow);
  return repo;
}

test('hosted OIDC probe exchanges identity but never retains either token', async (t) => {
  const repo = probeRepo(t, 'buildr-authority-probe-');
  const created = '2026-08-13T00:04:00.000Z';
  const expires = '2026-08-13T01:04:00.000Z';
  const requests = [];
  const result = await runReleaseAuthorityOidcProbe({ repo, sourceCommit: fixtureCommit, workflowSha256: sha256(workflow) }, {
    env: hostedEnvironment(),
    now: () => '2026-08-13T00:05:00.000Z',
    fetchImpl: async (url, options) => {
      requests.push({ url: String(url), options });
      if (requests.length === 1) return new Response(JSON.stringify({ value: 'header.payload.signature' }), { status: 200 });
      return new Response(JSON.stringify({ token_type: 'oidc', token: 'npm_registry_secret_that_must_not_escape', created, expires }), { status: 201 });
    },
  });
  assert.equal(requests[0].url, 'https://actions.example/id-token?audience=npm%3Aregistry.npmjs.org');
  assert.match(requests[1].url, /\/oidc\/token\/exchange\/package\/%40buildr-ai%2Fbuildr$/);
  assert.equal(requests[1].options.headers.Authorization, 'Bearer header.payload.signature');
  assert.equal(result.status, 'ready');
  assert.equal(result.npm.exchange.status, 201);
  assert.equal(JSON.stringify(result).includes('npm_registry_secret'), false);
  assert.equal(JSON.stringify(result).includes('header.payload.signature'), false);
  assert.equal(containsCredentialMaterial(result), false);
});

test('hosted OIDC probe normalizes Registry Unix-second exchange timestamps', async (t) => {
  const repo = probeRepo(t, 'buildr-authority-probe-unix-time-');
  const created = '2026-08-13T00:04:00.000Z';
  const expires = 1786583040;
  let requestCount = 0;
  const result = await runReleaseAuthorityOidcProbe({ repo, sourceCommit: fixtureCommit, workflowSha256: sha256(workflow) }, {
    env: hostedEnvironment(),
    now: () => '2026-08-13T00:05:00.000Z',
    fetchImpl: async () => {
      requestCount += 1;
      if (requestCount === 1) return new Response(JSON.stringify({ value: 'header.payload.signature' }), { status: 200 });
      return new Response(JSON.stringify({ token_type: 'oidc', token: 'npm_registry_secret_that_must_not_escape', created, expires }), { status: 201 });
    },
  });
  assert.equal(result.npm.exchange.created, created);
  assert.equal(result.npm.exchange.expires, new Date(expires * 1000).toISOString());
  assert.equal(containsCredentialMaterial(result), false);
});

test('hosted OIDC probe fails closed on exchange rejection without parsing a secret body', async (t) => {
  const repo = probeRepo(t, 'buildr-authority-probe-reject-');
  let count = 0;
  await assert.rejects(runReleaseAuthorityOidcProbe({ repo, sourceCommit: fixtureCommit, workflowSha256: sha256(workflow) }, {
    env: hostedEnvironment(),
    fetchImpl: async () => (++count === 1 ? new Response(JSON.stringify({ value: 'header.payload.signature' }), { status: 200 }) : new Response('registry-secret-body', { status: 403 })),
  }), (error) => error.code === 'npm_oidc_exchange_failed' && error.actual.status === 403);
});

test('hosted OIDC probe CLI creates the nested evidence directory even when blocked', (t) => {
  const repo = probeRepo(t, 'buildr-authority-probe-output-');
  const output = path.join(repo, 'runner-temp', 'authority', 'release-authority.json');
  const result = spawnSync(process.execPath, [
    path.join(serviceRoot, 'tools', 'release', 'release-authority-oidc-probe.mjs'),
    '--repo', repo,
    '--source-commit', fixtureCommit,
    '--workflow-sha256', sha256(workflow),
    '--output', output,
  ], { encoding: 'utf8', env: {} });
  assert.equal(result.status, 1);
  const evidence = JSON.parse(fs.readFileSync(output, 'utf8'));
  assert.equal(evidence.schemaVersion, releaseAuthorityProbeSchema);
  assert.equal(evidence.status, 'blocked');
  assert.equal(containsCredentialMaterial(evidence), false);
});

test('release transaction runner dispatches and follows exactly one frozen workflow run', async () => {
  const currentRun = { id: runId, run_attempt: runAttempt, repository: { full_name: 'BuildrAI/Buildr' }, event: 'workflow_dispatch', head_sha: fixtureCommit, status: 'completed', conclusion: 'success', path: '.github/workflows/publish.yml', html_url: `https://github.com/BuildrAI/Buildr/actions/runs/${runId}` };
  const calls = [];
  const execute = (command, args) => {
    const key = [command, ...args].join(' ');
    calls.push(key);
    if (key === 'git rev-parse origin/main') return { status: 0, stdout: `${fixtureCommit}\n` };
    if (key === `git rev-parse ${fixtureCommit}^{tree}`) return { status: 0, stdout: `${candidateTree}\n` };
    if (key === `git show ${fixtureCommit}:projects/product/services/buildr/package.json`) return { status: 0, stdout: JSON.stringify({ version }) };
    if (key === `git show ${fixtureCommit}:projects/product/.node-version`) return { status: 0, stdout: `${process.versions.node}\n` };
    if (key === `git show ${fixtureCommit}:.github/workflows/publish.yml`) return { status: 0, stdout: workflow };
    if (key.startsWith('gh workflow run publish.yml ')) return { status: 0, stdout: '' };
    if (key.startsWith('gh run list ')) return { status: 0, stdout: JSON.stringify([{ databaseId: runId, displayTitle: `Release ${version} (fixture-release-id)`, headSha: fixtureCommit, status: 'queued', conclusion: null, url: currentRun.html_url }]) };
    if (key.startsWith(`gh run watch ${runId} `)) return { status: 0, stdout: '' };
    if (key === `gh api repos/BuildrAI/Buildr/actions/runs/${runId}`) return { status: 0, stdout: JSON.stringify(currentRun) };
    return { status: 1, stderr: `unexpected command: ${key}` };
  };
  const context = releaseContext();
  const readiness = await runHostedReleaseTransaction({ repo: '/fixture', sourceCommit: 'origin/main', remoteMain: 'origin/main', version, candidateBase, candidateTree, releaseContext: context, ghCommand: 'gh', timeoutMs: 1_000 }, { execute, wait: async () => {}, releaseId: 'fixture-release-id', onStatus: () => {} });
  assert.equal(readiness.status, 'ready');
  assert.deepEqual(readiness.effects, []);
  const unauthorized = await runHostedReleaseTransaction({ action: 'dispatch', repo: '/fixture', sourceCommit: 'origin/main', remoteMain: 'origin/main', version, candidateBase, candidateTree, releaseContext: context, ghCommand: 'gh', timeoutMs: 1_000 }, { execute, wait: async () => {}, releaseId: 'fixture-release-id', onStatus: () => {} });
  assert.equal(unauthorized.status, 'blocked');
  assert.equal(unauthorized.findings[0].code, 'publication-authorization-required');
  assert.deepEqual(unauthorized.effects, []);
  assert.equal(calls.some((item) => item.startsWith('gh workflow run publish.yml ')), false);
  const result = await runHostedReleaseTransaction({ action: 'dispatch', publicationAuthorized: true, repo: '/fixture', sourceCommit: 'origin/main', remoteMain: 'origin/main', version, candidateBase, candidateTree, releaseContext: context, ghCommand: 'gh', timeoutMs: 1_000 }, { execute, wait: async () => {}, releaseId: 'fixture-release-id', onStatus: () => {} });
  assert.equal(result.status, 'passed', JSON.stringify(result));
  assert.equal(result.github.runId, runId);
  assert.equal(calls.filter((item) => item.startsWith('gh workflow run publish.yml ')).length, 1);
  for (const input of [`release_id=fixture-release-id`, `version=${version}`, `source_commit=${fixtureCommit}`, `candidate_base=${candidateBase}`, `candidate_tree=${candidateTree}`, `workflow_sha256=${sha256(workflow)}`, `context_digest=${context.identity}`, 'candidate_run_id=654', `release_context=${JSON.stringify(context)}`]) {
    assert.equal(calls.some((item) => item.includes(input)), true, input);
  }
  assert.equal(calls.some((item) => item.startsWith('git tag ') || item.startsWith('git push ')), false);
  assert.equal(calls.some((item) => item.startsWith('npm ')), false);
});

test('release transaction runner binds preparation inputs to the final frozen source commit', async (t) => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-release-source-binding-'));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  const service = path.join(repo, 'projects', 'product', 'services', 'buildr');
  fs.mkdirSync(service, { recursive: true });
  const sourceFiles = new Map([
    ['projects/product/services/buildr/package.json', `${JSON.stringify({ name: '@buildr-ai/buildr', version })}\n`],
    ['projects/product/services/buildr/package-lock.json', `${JSON.stringify({ name: '@buildr-ai/buildr', version, lockfileVersion: 3 })}\n`],
    ['projects/product/.node-version', `${process.versions.node}\n`],
  ]);
  for (const [file, contents] of sourceFiles) {
    const target = path.join(repo, file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, contents);
  }
  const inputs = [...sourceFiles]
    .filter(([file]) => file.includes('/services/buildr/'))
    .map(([file, contents]) => ({ path: path.join(repo, file), identity: `sha256-${sha256(contents)}`, preparedIdentity: `sha256-${sha256(contents)}` }));
  const environmentResult = {
    status: 'cleaned',
    environment: {
      scopes: [{ selector: 'service:product/buildr', sourcePath: 'projects/product/services/buildr', executionRoot: service }],
      preparationPlan: { identity: `sha256-${'1'.repeat(64)}` },
      preparationScopes: [{ selector: 'service:product/buildr', status: 'ready', recipeIds: ['service:product/buildr/buildr.npm-ci'] }],
      preparationRecipes: [{ id: 'service:product/buildr/buildr.npm-ci', status: 'ready', identity: `sha256-${'2'.repeat(64)}` }],
      preparationSteps: [{ id: 'service:product/buildr/buildr.npm-ci/npm-ci', status: 'ready', cwd: service, inputs }],
      preparationDeclarations: [{ project: 'product', preparedIdentity: `sha256-${'3'.repeat(64)}` }],
    },
  };
  const completeTaskRecord = (taskId, title) => ({
    schemaVersion: 'buildr.task-record/v2',
    taskId,
    title,
    intent: `${title} intent`,
    scope: { projects: ['product'], services: [{ project: 'product', service: 'buildr' }] },
    changes: [],
    parentTaskId: null,
    childTaskIds: [],
    retrospectiveSourceTaskIds: [],
    status: 'completed',
    result: { summary: `${title} completed`, noChange: false },
    createdAt: '2026-08-20T00:00:00.000Z',
    updatedAt: '2026-08-20T00:01:00.000Z',
  });
  const releaseTask = {
    ...completeTaskRecord('release-fixture', 'Release fixture'),
    status: 'active',
    result: null,
  };
  const supportTask = completeTaskRecord('support-fixture', 'Support fixture');
  const retrospectiveTask = completeTaskRecord('retrospective-fixture', 'Retrospective fixture');
  const developmentReadModel = (taskId) => ({
    development: {
      receiptDigest: digest('f'),
      receipt: {
        taskContext: { identity: digest('d') },
        contentTarget: { identity: digest('c') },
        candidate: { identity: digest('b'), generation: 2 },
        handoffs: [{ identity: digest('a'), candidate: { identity: digest('b'), generation: 2, contentTargetIdentity: digest('c') }, contributionHandoff: { identity: digest('e') } }],
      },
      applicability: { status: 'candidate-current', handoff: 'current', reasons: [] },
    },
    taskId,
  });
  const finishReadModel = (taskId) => ({
    result: {
      status: 'complete',
      taskId,
      runId: 42,
      identity: {
        run: digest('6'),
        handoffIdentity: digest('a'),
        candidateIdentity: digest('b'),
        candidateGeneration: 2,
        contentTargetIdentity: digest('c'),
        repositories: [{ selector: 'workspace', disposition: 'applicable', carrierIdentity: digest('7'), carrierRef: gitSha('a'), remote: 'origin', targetBranch: 'dev', status: 'delivered', finalRemoteRef: gitSha('b') }],
      },
      delivery: { status: 'delivered', finalRemoteRef: gitSha('8'), carrierTree: gitSha('9') },
      executionRecord: { recordId: 'finish-record-42', identity: digest('0'), status: 'retained', outcome: 'passed', lifecycleStatus: 'retained', evidenceIdentity: digest('1') },
      maintenance: { activation: 'passed', environmentCleanup: 'cleaned', diagnostics: 'passed', selfBootstrap: { schemaVersion: 'buildr.self-bootstrap-closeout-result/v1', status: 'passed', taskId, runId: 42, resultIdentity: digest('4') } },
    },
  });
  const runtime = {
    inspectTaskRecord: (_repo, taskId) => taskId === releaseTask.taskId
      ? { record: releaseTask, recordDigest: digest('1'), retrospectiveRelations: { sources: [retrospectiveTask] } }
      : { record: taskId === supportTask.taskId ? supportTask : retrospectiveTask, recordDigest: digest('1'), retrospectiveRelations: { sources: [] } },
    inspectTaskEnvironment: () => environmentResult,
    inspectTaskDevelopment: (_repo, taskId) => developmentReadModel(taskId),
    inspectTaskFinishReadModel: ({ taskId }) => finishReadModel(taskId),
  };
  const currentRun = { id: runId, run_attempt: runAttempt, repository: { full_name: 'BuildrAI/Buildr' }, event: 'workflow_dispatch', head_sha: fixtureCommit, status: 'completed', conclusion: 'success', path: '.github/workflows/publish.yml', html_url: `https://github.com/BuildrAI/Buildr/actions/runs/${runId}` };
  const candidateRun = { repository: { full_name: 'BuildrAI/Buildr' }, event: 'pull_request', status: 'completed', conclusion: 'success', path: '.github/workflows/verify.yml', head_sha: candidateSourceCommit, run_attempt: 1, html_url: 'https://github.com/BuildrAI/Buildr/actions/runs/654' };
  const devCommit = 'd'.repeat(40);
  const oldPackage = `${JSON.stringify({ name: '@buildr-ai/buildr', version: '0.1.0-rc.14' })}\n`;
  const calls = [];
  const execute = (command, args) => {
    const key = [command, ...args].join(' ');
    calls.push(key);
    if (key === 'git rev-parse origin/main') return { status: 0, stdout: `${fixtureCommit}\n` };
    if (key === `git rev-parse ${fixtureCommit}^{tree}` || key === `git rev-parse ${candidateSourceCommit}^{tree}` || key === `git rev-parse ${devCommit}^{tree}`) return { status: 0, stdout: `${candidateTree}\n` };
    if (key === 'git rev-parse origin/dev') return { status: 0, stdout: `${devCommit}\n` };
    if (key === `git show ${fixtureCommit}:projects/product/services/buildr/package.json`) return { status: 0, stdout: sourceFiles.get('projects/product/services/buildr/package.json') };
    if (key === `git show ${fixtureCommit}:projects/product/services/buildr/package-lock.json`) return { status: 0, stdout: sourceFiles.get('projects/product/services/buildr/package-lock.json') };
    if (key === `git show ${fixtureCommit}:projects/product/.node-version`) return { status: 0, stdout: sourceFiles.get('projects/product/.node-version') };
    if (key === `git show ${candidateBase}:projects/product/.node-version`) return { status: 0, stdout: '0.0.0\n' };
    if (key === `git show ${candidateBase}:projects/product/services/buildr/package.json`) return { status: 0, stdout: oldPackage };
    if (key === `git show ${fixtureCommit}:.github/workflows/publish.yml`) return { status: 0, stdout: workflow };
    if (key === 'gh api repos/BuildrAI/Buildr/actions/runs/654') return { status: 0, stdout: JSON.stringify(candidateRun) };
    if (key.startsWith('gh workflow run publish.yml ')) return { status: 0, stdout: '' };
    if (key.startsWith('gh run list ')) return { status: 0, stdout: JSON.stringify([{ databaseId: runId, displayTitle: 'Release 0.1.0-rc.15 (fixture-release-id)', headSha: fixtureCommit, status: 'queued', conclusion: null, url: currentRun.html_url }]) };
    if (key.startsWith(`gh run watch ${runId} `)) return { status: 0, stdout: '' };
    if (key === `gh api repos/BuildrAI/Buildr/actions/runs/${runId}`) return { status: 0, stdout: JSON.stringify(currentRun) };
    return { status: 1, stderr: `unexpected command: ${key}` };
  };

  const result = await runHostedReleaseTransaction({ action: 'dispatch', publicationAuthorized: true, repo, sourceCommit: 'origin/main', remoteMain: 'origin/main', version, candidateBase, candidateTree, releaseTask: releaseTask.taskId, supportTasks: [supportTask.taskId], candidateRunId: 654, devCommit: 'origin/dev', ghCommand: 'gh', timeoutMs: 1_000 }, {
    execute,
    wait: async () => {},
    releaseId: 'fixture-release-id',
    onStatus: () => {},
    runtime,
    inspectSelection: () => ({ selectionIdentity: digest('6'), version, branch: `release-${version}`, releaseHead: candidateSourceCommit, releaseTree: candidateTree, generation: 1, status: 'frozen' }),
    candidateEvidence: {
      aggregate: { sourceCommit: candidateSourceCommit, registryIdentity: digest('7'), status: 'passed' },
      manifest: { sourceCommit: candidateSourceCommit, filename: 'buildr-ai-buildr.tgz', size: 123, sha256: '9'.repeat(64), integrity: 'sha512-Zml4dHVyZQ==', applicationPayloadDigest: digest('a') },
    },
  });

  assert.equal(result.status, 'passed', JSON.stringify(result));
  assert.equal(result.context.taskCorrelation.status, 'passed');
  assert.equal(result.context.taskCorrelation.sourceCommit, fixtureCommit);
  assert.equal(result.context.environment.taskId, releaseTask.taskId);
  assert.equal(result.context.environment.status, 'cleaned');
  assert.equal(calls.includes(`git show ${candidateBase}:projects/product/services/buildr/package.json`), false);
  assert.equal(calls.includes(`git show ${candidateBase}:projects/product/.node-version`), false);
  assert.equal(calls.filter((item) => item.startsWith('gh workflow run publish.yml ')).length, 1);
});

test('release environment binding consumes the completed Task Environment Service receipt', (t) => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-release-environment-'));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  const service = path.join(repo, 'projects', 'product', 'services', 'buildr');
  fs.mkdirSync(service, { recursive: true });
  const sourceFiles = new Map([
    ['projects/product/services/buildr/package.json', '{"name":"@buildr-ai/buildr"}\n'],
    ['projects/product/services/buildr/package-lock.json', '{"lockfileVersion":3}\n'],
    ['projects/product/.node-version', `${process.versions.node}\n`],
  ]);
  for (const [file, contents] of sourceFiles) fs.writeFileSync(path.join(repo, file), contents);
  const inputs = [...sourceFiles].filter(([file]) => file.includes('/services/buildr/')).map(([file, contents]) => ({ path: path.join(repo, file), identity: `sha256-${sha256(contents)}`, preparedIdentity: `sha256-${sha256(contents)}` }));
  const environmentResult = {
    status: 'cleaned',
    environment: {
      scopes: [{ selector: 'service:product/buildr', sourcePath: 'projects/product/services/buildr', executionRoot: service }],
      preparationPlan: { identity: `sha256-${'1'.repeat(64)}` },
      preparationScopes: [{ selector: 'service:product/buildr', status: 'ready', recipeIds: ['service:product/buildr/buildr.npm-ci'] }],
      preparationRecipes: [{ id: 'service:product/buildr/buildr.npm-ci', status: 'ready', identity: `sha256-${'2'.repeat(64)}` }],
      preparationSteps: [{ id: 'service:product/buildr/buildr.npm-ci/npm-ci', status: 'ready', cwd: service, inputs }],
      preparationDeclarations: [{ project: 'product', preparedIdentity: `sha256-${'3'.repeat(64)}` }],
    },
  };
  const binding = createReleaseEnvironmentBinding({
    task: { taskId: 'release-fixture', status: 'completed' },
    environmentResult,
    repo,
    sourceCommit: candidateBase,
    nodeAudit: { version: process.versions.node, identity: `sha256-${'4'.repeat(64)}` },
    readSourceFile: (_commit, file) => sourceFiles.get(file),
  });

  const activeBinding = createReleaseEnvironmentBinding({
    task: { taskId: 'release-fixture', status: 'active' },
    taskStatus: 'active',
    environmentResult,
    repo,
    sourceCommit: candidateBase,
    nodeAudit: { version: process.versions.node, identity: `sha256-${'4'.repeat(64)}` },
    readSourceFile: (_commit, file) => sourceFiles.get(file),
  });
  assert.equal(activeBinding.taskId, 'release-fixture');
  assert.throws(() => createReleaseEnvironmentBinding({ task: { taskId: 'release-fixture', status: 'active' }, environmentResult, repo, sourceCommit: candidateBase, nodeAudit: { version: process.versions.node, identity: `sha256-${'4'.repeat(64)}` }, readSourceFile: (_commit, file) => sourceFiles.get(file) }), /must be completed for this release action/u);
  assert.equal(binding.environmentStatus, 'cleaned');
  assert.equal(binding.serviceRoot, 'projects/product/services/buildr');
  assert.equal(binding.recipe.stepId, 'service:product/buildr/buildr.npm-ci/npm-ci');
  assert.match(binding.identity, /^sha256-[a-f0-9]{64}$/u);
  const drifted = structuredClone(environmentResult);
  drifted.environment.preparationSteps[0].cwd = path.join(repo, 'projects', 'product');
  assert.throws(() => createReleaseEnvironmentBinding({ task: { taskId: 'release-fixture', status: 'completed' }, environmentResult: drifted, repo, sourceCommit: candidateBase, nodeAudit: { version: process.versions.node, identity: `sha256-${'4'.repeat(64)}` }, readSourceFile: (_commit, file) => sourceFiles.get(file) }), /cwd must be the Task Environment product\/buildr Service execution root/u);
  fs.rmSync(path.join(service, 'package-lock.json'));
  assert.throws(() => createReleaseEnvironmentBinding({ task: { taskId: 'release-fixture', status: 'completed' }, environmentResult, repo, sourceCommit: candidateBase, nodeAudit: { version: process.versions.node, identity: `sha256-${'4'.repeat(64)}` }, readSourceFile: (_commit, file) => sourceFiles.get(file) }), /requires the Buildr Service package-lock/u);
});

test('release transaction evidence is a closed correlated read model', () => {
  const context = releaseContext();
  const evidence = createReleaseTransactionEvidence({
    context,
    publish: { repository: 'BuildrAI/Buildr', workflow: '.github/workflows/publish.yml', runId, runAttempt, runUrl: `https://github.com/BuildrAI/Buildr/actions/runs/${runId}`, headSha: fixtureCommit },
    outcome: 'passed',
    publicFacts: { version, tagCommit: fixtureCommit, npmDistTag: 'next', registryPublished: true, registryIntegrity: 'sha512-aW50ZWdyaXR5', githubRelease: `https://github.com/BuildrAI/Buildr/releases/tag/v${version}`, registrySmoke: 'passed' },
    observedAt: '2026-08-19T00:00:00.000Z',
  });
  assert.equal(validateReleaseTransactionEvidence(evidence).identity, evidence.identity);
  assert.equal(evidence.release.registryIntegrity, 'sha512-aW50ZWdyaXR5');
  const drifted = structuredClone(evidence);
  drifted.context.selection.version = '0.1.0-rc.99';
  assert.throws(() => validateReleaseTransactionEvidence(drifted), /identity mismatch/u);
  const extended = structuredClone(evidence);
  extended.sidecar = {};
  assert.throws(() => validateReleaseTransactionEvidence(extended), /sidecar is not supported/u);
  const beforePublicWrite = createReleaseTransactionEvidence({
    context,
    publish: evidence.publish,
    outcome: 'failed',
    publicFacts: { version, npmDistTag: 'next', registryPublished: false, registrySmoke: 'unknown' },
  });
  assert.equal(beforePublicWrite.release.tagCommit, null);
  assert.equal(beforePublicWrite.release.registryPublished, false);
  assert.equal(beforePublicWrite.release.githubRelease, null);
  assert.equal(beforePublicWrite.attempt.recovery, 'new-attempt');
  assert.deepEqual(beforePublicWrite.attempt.steps.find((step) => step.id === 'tag'), { id: 'tag', status: 'not-reached' });
  const afterTagFailure = createReleaseTransactionEvidence({
    context,
    publish: evidence.publish,
    outcome: 'failed',
    publicFacts: { version, tagCommit: fixtureCommit, npmDistTag: 'next', registryPublished: false, registrySmoke: 'unknown' },
  });
  assert.equal(afterTagFailure.attempt.recovery, 'new-attempt');
  assert.deepEqual(afterTagFailure.attempt.steps.find((step) => step.id === 'npm'), { id: 'npm', status: 'failed' });
  const conflicted = createReleaseTransactionEvidence({
    context,
    publish: evidence.publish,
    outcome: 'failed',
    publicFacts: { version, npmDistTag: 'next', registryPublished: true, registryIntegrity: 'sha512-Y29uZmxpY3Q=', conflict: true },
  });
  assert.equal(conflicted.attempt.recovery, 'blocked-new-version');
  const retrying = createReleaseTransactionEvidence({
    context,
    publish: evidence.publish,
    outcome: 'failed',
    publicFacts: { version, npmDistTag: 'next', registryPublished: false, recoveryClass: 'same-attempt' },
  });
  assert.equal(retrying.attempt.recovery, 'same-attempt');
});

test('release transaction finalizer preserves official Registry integrity in the hosted artifact', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-release-finalize-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const contextFile = path.join(root, 'context.json');
  const registryFile = path.join(root, 'registry.json');
  const output = path.join(root, 'release-transaction-evidence.json');
  fs.writeFileSync(contextFile, `${JSON.stringify(releaseContext())}\n`);
  fs.writeFileSync(registryFile, `${JSON.stringify({ published: true, integrity: 'sha512-aW50ZWdyaXR5' })}\n`);
  const result = spawnSync(process.execPath, [
    path.join(serviceRoot, 'tools', 'release', 'release-transaction-evidence.mjs'), 'finalize',
    '--context', contextFile, '--output', output, '--outcome', 'success',
    '--repository', 'BuildrAI/Buildr', '--workflow', '.github/workflows/publish.yml',
    '--run-id', String(runId), '--run-attempt', String(runAttempt),
    '--run-url', `https://github.com/BuildrAI/Buildr/actions/runs/${runId}`, '--head-sha', fixtureCommit,
    '--version', version, '--npm-dist-tag', 'next',
    '--tag-commit', fixtureCommit,
    '--github-release', `https://github.com/BuildrAI/Buildr/releases/tag/v${version}`,
    '--registry-state', registryFile,
  ], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const evidence = validateReleaseTransactionEvidence(JSON.parse(fs.readFileSync(output, 'utf8')));
  assert.equal(evidence.release.registryIntegrity, 'sha512-aW50ZWdyaXR5');
  assert.equal(evidence.release.registrySmoke, 'passed');
});

test('release transaction inspect reads exactly one hosted artifact and rejects cross-run drift', async (t) => {
  const evidence = createReleaseTransactionEvidence({
    context: releaseContext(),
    publish: { repository: 'BuildrAI/Buildr', workflow: '.github/workflows/publish.yml', runId, runAttempt, runUrl: `https://github.com/BuildrAI/Buildr/actions/runs/${runId}`, headSha: fixtureCommit },
    outcome: 'passed',
    publicFacts: { version, tagCommit: fixtureCommit, npmDistTag: 'next', registryPublished: true, registryIntegrity: 'sha512-aW50ZWdyaXR5', githubRelease: `https://github.com/BuildrAI/Buildr/releases/tag/v${version}`, registrySmoke: 'passed' },
  });
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-release-inspect-test-'));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  let readbackRunId = runId;
  const execute = (_command, args) => {
    if (args[0] === 'run' && args[1] === 'download') {
      const directory = args[args.indexOf('--dir') + 1];
      const artifact = path.join(directory, 'release-evidence-fixture', 'contract');
      fs.mkdirSync(artifact, { recursive: true });
      fs.writeFileSync(path.join(artifact, 'release-transaction-evidence.json'), `${JSON.stringify(evidence)}\n`);
      return { status: 0, stdout: '' };
    }
    if (args[0] === 'api') return { status: 0, stdout: JSON.stringify({ repository: { full_name: 'BuildrAI/Buildr' }, event: 'workflow_dispatch', head_sha: fixtureCommit, path: '.github/workflows/publish.yml@refs/heads/main', run_attempt: readbackRunId === runId ? runAttempt : 2 }) };
    return { status: 1, stderr: `unexpected gh call: ${args.join(' ')}` };
  };
  const result = await inspectHostedReleaseTransaction({ runId, repository: 'BuildrAI/Buildr', ghCommand: 'gh' }, { execute, makeTempDirectory: () => temporary, removeDirectory: () => {} });
  assert.equal(result.correlationIdentity, evidence.context.identity);
  assert.equal(result.evidenceIdentity, evidence.identity);
  readbackRunId = runId + 1;
  await assert.rejects(inspectHostedReleaseTransaction({ runId, repository: 'BuildrAI/Buildr', ghCommand: 'gh' }, { execute, makeTempDirectory: () => temporary, removeDirectory: () => {} }), /evidence\/run readback mismatch/u);
});

function git(cwd, ...args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, `git ${args.join(' ')}\n${result.stderr}`);
  return result.stdout.trim();
}

test('release tag ensure creates once, reuses the same source, and rejects drift', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-release-tag-ensure-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const remote = path.join(root, 'remote.git');
  const repo = path.join(root, 'repo');
  git(root, 'init', '--bare', remote);
  fs.mkdirSync(repo);
  git(repo, 'init', '-b', 'main');
  git(repo, 'config', 'user.name', 'Buildr Test');
  git(repo, 'config', 'user.email', 'buildr@example.com');
  fs.writeFileSync(path.join(repo, 'fixture.txt'), 'one\n');
  git(repo, 'add', '.');
  git(repo, 'commit', '-m', 'one');
  const first = git(repo, 'rev-parse', 'HEAD');
  git(repo, 'remote', 'add', 'origin', remote);
  git(repo, 'push', 'origin', 'main');
  assert.equal(inspectReleaseTag({ repo, tag: 'v0.1.0', sourceCommit: first }).action, 'create');
  const created = ensureReleaseTag({ repo, tag: 'v0.1.0', sourceCommit: first });
  assert.equal(created.status, 'passed');
  assert.equal(created.effects[0].type, 'tag-created');
  assert.equal(ensureReleaseTag({ repo, tag: 'v0.1.0', sourceCommit: first }).effects[0].type, 'tag-reused');
  fs.writeFileSync(path.join(repo, 'fixture.txt'), 'two\n');
  git(repo, 'add', '.');
  git(repo, 'commit', '-m', 'two');
  const second = git(repo, 'rev-parse', 'HEAD');
  const drift = inspectReleaseTag({ repo, tag: 'v0.1.0', sourceCommit: second });
  assert.equal(drift.status, 'blocked');
  assert.equal(drift.diagnostic.code, 'release_tag_target_mismatch');
});

test('release tag ensure accepts a concurrent writer only when remote resolves to the same source', () => {
  const sourceCommit = 'd'.repeat(40);
  let pushed = false;
  const execute = (command, args) => {
    const key = [command, ...args].join(' ');
    if (key === `git rev-parse ${sourceCommit}^{commit}`) return { status: 0, stdout: `${sourceCommit}\n` };
    if (key.startsWith('git ls-remote --tags origin ')) return { status: 0, stdout: pushed ? `${sourceCommit}\trefs/tags/v0.1.0\n` : '' };
    if (key.includes(' tag -a v0.1.0 ')) return { status: 0, stdout: '' };
    if (key === 'git push origin refs/tags/v0.1.0') {
      pushed = true;
      return { status: 1, stderr: 'remote ref appeared concurrently' };
    }
    return { status: 1, stderr: `unexpected command: ${key}` };
  };
  const result = ensureReleaseTag({ repo: '/fixture', tag: 'v0.1.0', sourceCommit }, { execute });
  assert.equal(result.status, 'passed');
  assert.equal(result.effects[0].type, 'tag-concurrently-reused');
});

test('release authority preflight CLI writes static ready evidence without control-plane mutation', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-release-authority-cli-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const repo = path.join(root, 'repo');
  fs.mkdirSync(path.join(repo, 'projects', 'product', 'services', 'buildr'), { recursive: true });
  fs.mkdirSync(path.join(repo, '.github', 'workflows'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'projects', 'product', 'services', 'buildr', 'package.json'), `${JSON.stringify({ name: '@buildr-ai/buildr', repository: { url: 'git+https://github.com/BuildrAI/Buildr.git' } })}\n`);
  fs.writeFileSync(path.join(repo, '.github', 'workflows', 'publish.yml'), workflow);
  for (const args of [['init', '-b', 'main'], ['config', 'user.name', 'Buildr Test'], ['config', 'user.email', 'buildr@example.com'], ['remote', 'add', 'origin', 'git@github.com:BuildrAI/Buildr.git'], ['add', '.'], ['commit', '-m', 'fixture']]) git(repo, ...args);
  const sourceCommit = git(repo, 'rev-parse', 'HEAD');
  const fakeGh = path.join(root, 'fake-gh.mjs');
  fs.writeFileSync(fakeGh, `#!/usr/bin/env node
const key=process.argv.slice(2).join(' ');
if(key==='repo view --json nameWithOwner') process.stdout.write(JSON.stringify({nameWithOwner:'BuildrAI/Buildr'}));
else if(key==='api repos/BuildrAI/Buildr/environments/npm-production') process.stdout.write(JSON.stringify({name:'npm-production'}));
else { process.stderr.write('unexpected gh command: '+key); process.exitCode=1; }
`, { mode: 0o755 });
  const evidencePath = path.join(root, 'authority-evidence.json');
  const result = spawnSync(process.execPath, [
    path.join(serviceRoot, 'tools', 'release', 'release-authority-preflight.mjs'),
    '--repo', repo,
    '--source-commit', sourceCommit,
    '--gh', fakeGh,
    '--output', evidencePath,
  ], { cwd: serviceRoot, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
  assert.equal(evidence.schemaVersion, releaseAuthorityPreflightSchema);
  assert.equal(evidence.status, 'ready');
  assert.deepEqual(evidence.observed.github, { repository: 'BuildrAI/Buildr', environment: 'npm-production' });
  assert.deepEqual(evidence.findings, []);
  assert.equal(containsCredentialMaterial(evidence), false);
});
