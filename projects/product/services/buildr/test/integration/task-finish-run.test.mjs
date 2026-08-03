import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  createFinishRun,
  executeFinishRun,
  FINISH_PHASES,
  inspectFinishRun,
  readFinishRun,
} from '../../src/application/task-finish/task-finish-run.mjs';
import { createTaskFinishProductHandlers } from '../../src/application/task-finish/task-finish-product-executor.mjs';
import { spawnSync } from 'node:child_process';

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-task-finish-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function identity(root, task = 'finish-v2') {
  return {
    task,
    change: 'simplify-finish',
    project: 'product',
    agent: 'codex',
    targetBranch: 'dev',
    remote: null,
    environmentRoot: root,
    workspaceRoot: root,
    workspaceNodeIdentity: 'sha256-workspace-node',
  };
}

function passingHandlers(calls = []) {
  return Object.fromEntries(FINISH_PHASES.map((phase) => [phase, async () => {
    calls.push(phase);
    if (phase === 'prepare') return { status: 'passed', output: { frozenCandidate: { identity: 'candidate-v1', head: 'abc', tree: 'tree', branch: 'codex/finish-v2' } } };
    if (phase === 'verify') return { status: 'passed', output: { verification: { status: 'passed', executions: 1, resultDigest: 'sha256-result-v1', applicability: 'current' } } };
    if (phase === 'deliver') return { status: 'passed', output: { delivery: { status: 'delivered', candidateRef: 'abc' } } };
    if (phase === 'cleanup') return { status: 'passed', output: { completion: { status: 'complete', receipt: '/tmp/complete.json' } } };
    return { status: 'passed' };
  }]));
}

test('正常路径由单次产品调用完成五个固定阶段', async (t) => {
  const root = fixture(t);
  const calls = [];
  const run = createFinishRun({ root, runId: 'normal', identity: identity(root) });
  const result = await executeFinishRun({ root, run, handlers: passingHandlers(calls) });
  assert.equal(result.status, 'complete');
  assert.deepEqual(calls, FINISH_PHASES);
  assert.deepEqual(result.phases.map((phase) => phase.id), FINISH_PHASES);
  assert.equal(result.metrics.canonicalCliInvocations, 1);
  assert.equal(result.metrics.agentProviderCompletions, 0);
  assert.equal(result.metrics.manualRecoveryManifests, 0);
  assert.equal(result.metrics.formalVerificationExecutions, 1);
  assert.equal(result.identity.candidateKind, 'change');
  assert.equal(result.identity.change, 'simplify-finish');
});

test('code-only run 以 task 为主身份并保持 Change 可空', (t) => {
  const root = fixture(t);
  const run = createFinishRun({
    root,
    runId: 'code-only',
    identity: { ...identity(root, 'code-only'), candidateKind: 'code-only', change: null },
  });
  assert.equal(run.identity.task, 'code-only');
  assert.equal(run.identity.candidateKind, 'code-only');
  assert.equal(run.identity.change, null);
  assert.throws(
    () => createFinishRun({ root, runId: 'invalid-change', identity: { ...identity(root), candidateKind: 'change', change: null } }),
    /change candidate requires change/,
  );
  assert.throws(
    () => createFinishRun({ root, runId: 'invalid-code-only', identity: { ...identity(root), candidateKind: 'code-only' } }),
    /code-only candidate cannot declare change/,
  );
});

test('code-only preflight 将 Change 与 OpenSpec 检查稳定标记为不适用', async (t) => {
  const root = fixture(t);
  const git = (...args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  assert.equal(git('init', '-b', 'dev').status, 0);
  assert.equal(git('config', 'user.name', 'Buildr Test').status, 0);
  assert.equal(git('config', 'user.email', 'buildr-test@example.com').status, 0);
  fs.mkdirSync(path.join(root, 'projects', 'product'), { recursive: true });
  fs.writeFileSync(path.join(root, '.gitignore'), '.buildr/task-finish/\n.buildr/tasks/*/environment.json\n');
  fs.writeFileSync(path.join(root, 'projects', 'product', 'verification.yml'), 'schemaVersion: buildr.project-verification/v2\nresources: []\ncapabilities:\n  - id: product.delivery\n');
  const cli = path.join(root, 'fake-buildr.cjs');
  fs.writeFileSync(cli, 'process.stdout.write(JSON.stringify({ version: "2.0.0-test" }) + "\\n");\n');
  assert.equal(git('add', '-A').status, 0);
  assert.equal(git('commit', '-m', 'baseline').status, 0);
  fs.mkdirSync(path.join(root, '.buildr', 'tasks', 'code-only-preflight'), { recursive: true });
  fs.writeFileSync(path.join(root, '.buildr', 'tasks', 'code-only-preflight', 'task.yml'), 'taskId: code-only-preflight\nstatus: active\n');
  const runtime = {
    resolveTaskEnvironmentExecution: () => ({
      ready: true,
      taskId: 'code-only-preflight',
      workspaceRoot: root,
      validationRoot: root,
      repositories: [{ selector: 'workspace', branch: 'dev' }],
      cliInvocation: { command: process.execPath, argsPrefix: [cli] },
    }),
    readProjectRegistryPersistence: () => ({ registry: { projects: { product: { source: { path: 'projects/product' } } } } }),
    observeTaskVerificationDeclarations: () => [{ project: 'product', identity: 'sha256-declaration', valid: true, declaration: { capabilities: [{ id: 'product.delivery' }] } }],
    workspaceNodeExecution: () => ({ ready: true, status: 'ready', identity: { digest: 'sha256-workspace-node', version: '22.4.1' } }),
    parseOpenSpecChangeDelta: () => { throw new Error('OpenSpec parser must not run for code-only'); },
  };
  const run = createFinishRun({ root, runId: 'code-only-preflight', identity: { ...identity(root, 'code-only-preflight'), candidateKind: 'code-only', change: null } });
  const result = await createTaskFinishProductHandlers({ runtime, root, openspecCommand: '/must-not-run' }).preflight({ run });
  assert.equal(result.status, 'passed', JSON.stringify(result, null, 2));
  assert.deepEqual(result.checks.find((check) => check.check === 'retained-workspace').workspaceMetadata, ['.buildr/tasks/code-only-preflight/task.yml']);
  const notApplicable = result.checks.filter((check) => check.status === 'not-applicable');
  assert.deepEqual(notApplicable.map((check) => check.check), ['change', 'change-tasks', 'current-knowledge', 'openspec-validation', 'openspec-plan']);
  assert.equal(result.operations.some((operation) => /openspec/.test(operation.id)), false);
});

test('最终验证发现产品缺陷会终止收尾并返回研发流程', async (t) => {
  const root = fixture(t);
  const calls = [];
  const handlers = passingHandlers(calls);
  handlers.verify = async () => {
    calls.push('verify');
    return {
      status: 'failed',
      output: { verification: { status: 'failed', executions: 1 } },
      failure: {
        operation: 'verification',
        check: 'product.fast',
        failureClass: 'upstream-candidate-defect',
        code: 'task-finish.verification-check-failed',
        message: 'Formal verification check failed: product.fast',
      },
    };
  };
  const result = await executeFinishRun({ root, run: createFinishRun({ root, runId: 'defect', identity: identity(root, 'defect') }), handlers });
  assert.equal(result.status, 'failed');
  assert.equal(result.nextWorkflow, 'task-development');
  assert.equal(result.primaryFailure.phase, 'verify');
  assert.equal(result.primaryFailure.check, 'product.fast');
  assert.deepEqual(calls, ['preflight', 'prepare', 'verify']);
  assert.equal(result.phases.find((phase) => phase.id === 'deliver').attempts, 0);
  assert.equal(result.resume, null);
});

test('Finish 只通过 Application 复用 current、passed 且覆盖 required capability 的 Result', async (t) => {
  const root = fixture(t);
  const git = (...args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  assert.equal(git('init', '-b', 'codex/node-evidence').status, 0);
  assert.equal(git('config', 'user.name', 'Buildr Test').status, 0);
  assert.equal(git('config', 'user.email', 'buildr-test@example.com').status, 0);
  fs.writeFileSync(path.join(root, 'README.md'), '# candidate\n');
  fs.writeFileSync(path.join(root, '.gitignore'), '.buildr/\n');
  assert.equal(git('add', 'README.md', '.gitignore').status, 0);
  assert.equal(git('commit', '-m', 'candidate').status, 0);
  const head = git('rev-parse', 'HEAD').stdout.trim();
  const tree = git('rev-parse', 'HEAD^{tree}').stdout.trim();
  const required = {
    id: 'product.delivery', scope: { project: 'product', services: [] }, invocation: { kind: 'command' },
    applicability: { paths: ['**'], conditions: [] }, requiredForDelivery: true,
  };
  let currentSlot = {
    present: true,
    resultDigest: 'sha256-current-result',
    applicability: { status: 'current' },
    result: { conclusion: { outcome: 'passed' }, capabilities: [{ project: 'product', capability: 'product.delivery', outcome: 'passed' }] },
  };
  const runtime = {
    workspaceNodeExecution: () => ({ ready: true, status: 'ready', identity: { digest: 'sha256-workspace-node', version: '22.4.1' } }),
    resolveTaskEnvironmentExecution: () => ({ ready: true }),
    readTaskRecordPersistence: () => ({ record: { scope: { projects: ['product'], services: [] } } }),
    observeTaskVerificationDeclarations: () => [{ project: 'product', valid: true, declaration: { capabilities: [required] } }],
    inspectTaskVerification: () => ({ slot: currentSlot }),
    readProjectRegistryPersistence: () => ({ registry: { projects: { product: { source: { path: '.' } } } } }),
  };
  const run = createFinishRun({ root, runId: 'node-evidence', identity: identity(root, 'node-evidence') });
  run.frozenCandidate = { identity: 'frozen-node-candidate', head, tree, branch: 'codex/node-evidence', changedPaths: ['README.md'], workspaceNodeIdentity: 'sha256-workspace-node' };
  const handlers = createTaskFinishProductHandlers({ runtime, root });
  const reusable = await handlers.verify({ run });
  assert.equal(reusable.status, 'passed');
  assert.equal(reusable.output.verification.reused, true);
  assert.equal(reusable.output.verification.executions, 0);
  assert.equal(reusable.output.verification.resultDigest, 'sha256-current-result');

  currentSlot = { present: false, resultDigest: null, applicability: null, result: null };
  required.effects = { writes: ['shared-output'], externalSystems: [], authorization: 'explicit' };
  const authorizationRequired = await handlers.verify({ run });
  assert.equal(authorizationRequired.status, 'failed');
  assert.equal(authorizationRequired.failure.code, 'task-finish.verification-authorization-result-required');
});

test('target race 由产品生成恢复令牌重新准备候选并验证', async (t) => {
  const root = fixture(t);
  const firstCalls = [];
  const handlers = passingHandlers(firstCalls);
  handlers.deliver = async () => {
    firstCalls.push('deliver');
    return { status: 'blocked', failure: { operation: 'target-transition', failureClass: 'transient-external-condition', code: 'task-finish.target-race', message: 'Target ref changed after candidate freeze.' } };
  };
  const first = await executeFinishRun({ root, run: createFinishRun({ root, runId: 'resume', identity: identity(root, 'resume') }), handlers });
  assert.equal(first.status, 'blocked');
  assert.match(first.resume.token, /^sha256-/);
  assert.equal(first.nextAction, 'repeat-task-finish-run-with-resume-token');

  const secondCalls = [];
  const secondHandlers = passingHandlers(secondCalls);
  await assert.rejects(
    executeFinishRun({ root, run: readFinishRun({ root, runId: 'resume' }), handlers: secondHandlers }),
    /product-generated resume token/,
  );
  secondHandlers.prepare = async ({ run, phase }) => {
    secondCalls.push('prepare');
    assert.equal(run.frozenCandidate, null);
    assert.equal(run.verification, null);
    assert.equal(run.delivery, null);
    assert.equal(run.completion, null);
    assert.equal(phase.output, null);
    return { status: 'passed', output: { frozenCandidate: { identity: 'candidate-v2', head: 'def', tree: 'tree-v2', branch: 'codex/finish-v2' } } };
  };
  secondHandlers.verify = async () => {
    secondCalls.push('verify');
    return { status: 'passed', output: { verification: { status: 'passed', executions: 1, resultDigest: 'sha256-result-v2', applicability: 'current' } } };
  };
  const second = await executeFinishRun({ root, run: readFinishRun({ root, runId: 'resume' }), handlers: secondHandlers, resumeToken: first.resume.token });
  assert.equal(second.status, 'complete');
  assert.deepEqual(secondCalls, ['prepare', 'verify', 'deliver', 'cleanup']);
  assert.equal(second.candidate.identity, 'candidate-v2');
  assert.equal(second.verification.resultDigest, 'sha256-result-v2');
  assert.equal(second.phases.find((phase) => phase.id === 'preflight').attempts, 1);
  assert.equal(second.phases.find((phase) => phase.id === 'prepare').attempts, 2);
  assert.equal(second.phases.find((phase) => phase.id === 'verify').attempts, 2);
  assert.equal(second.phases.find((phase) => phase.id === 'deliver').attempts, 2);
  assert.equal(second.phases.find((phase) => phase.id === 'cleanup').attempts, 1);
  assert.equal(second.metrics.canonicalCliInvocations, 2);
  assert.equal(second.metrics.manualRecoveryManifests, 0);
  assert.equal(inspectFinishRun({ root, runId: 'resume' }).status, 'complete');
});

test('cleanup 暂态阻塞恢复时只重试 cleanup，不重跑验证或交付', async (t) => {
  const root = fixture(t);
  const firstCalls = [];
  const handlers = passingHandlers(firstCalls);
  handlers.cleanup = async () => {
    firstCalls.push('cleanup');
    return { status: 'blocked', failure: { operation: 'environment-cleanup', failureClass: 'transient-external-condition', code: 'task-finish.environment-busy', message: 'Task-owned process is still running.' } };
  };
  const first = await executeFinishRun({ root, run: createFinishRun({ root, runId: 'cleanup-resume', identity: identity(root, 'cleanup-resume') }), handlers });
  assert.equal(first.status, 'blocked');
  assert.deepEqual(firstCalls, FINISH_PHASES);

  const secondCalls = [];
  const second = await executeFinishRun({
    root,
    run: readFinishRun({ root, runId: 'cleanup-resume' }),
    handlers: passingHandlers(secondCalls),
    resumeToken: first.resume.token,
  });
  assert.equal(second.status, 'complete');
  assert.deepEqual(secondCalls, ['cleanup']);
  assert.equal(second.phases.find((phase) => phase.id === 'verify').attempts, 1);
  assert.equal(second.phases.find((phase) => phase.id === 'deliver').attempts, 1);
});

test('preflight 一次聚合候选、环境、OpenSpec、知识、验证和 retained 问题', async (t) => {
  const root = fixture(t);
  const git = (...args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  assert.equal(git('init', '-b', 'dev').status, 0);
  assert.equal(git('config', 'user.name', 'Buildr Test').status, 0);
  assert.equal(git('config', 'user.email', 'buildr-test@example.com').status, 0);
  fs.writeFileSync(path.join(root, 'README.md'), '# fixture\n');
  assert.equal(git('add', 'README.md').status, 0);
  assert.equal(git('commit', '-m', 'baseline').status, 0);
  const changeRoot = path.join(root, 'projects', 'product', 'openspec', 'changes', 'simplify-finish');
  fs.mkdirSync(changeRoot, { recursive: true });
  fs.writeFileSync(path.join(changeRoot, 'tasks.md'), '- [ ] unfinished\n');
  const runtime = {
    resolveTaskEnvironmentExecution: () => ({ ready: false, blocked: { code: 'task_environment_cli_unavailable', message: 'CLI dependency is missing.' }, repositories: [{ branch: 'dev' }] }),
    readProjectRegistryPersistence: () => ({ registry: { projects: { product: { source: { path: 'projects/product' } } } } }),
    observeTaskVerificationDeclarations: () => [{ project: 'product', identity: 'absent', valid: true, declaration: null }],
    parseOpenSpecChangeDelta: () => { throw new Error('delta is invalid'); },
    workspaceNodeExecution: () => ({ ready: false, status: 'missing', identity: null }),
  };
  const run = createFinishRun({ root, runId: 'aggregate', identity: identity(root, 'aggregate') });
  const result = await createTaskFinishProductHandlers({ runtime, root }).preflight({ run });
  assert.equal(result.status, 'failed');
  const codes = new Set(result.checks.filter((check) => check.severity === 'error').map((check) => check.code));
  for (const code of [
    'task_environment_cli_unavailable',
    'task-finish.workspace-node-drift',
    'task-finish.environment-cli-missing',
    'task-finish.tasks-incomplete',
    'task-finish.knowledge-impact-missing',
    'task-finish.openspec-plan-invalid',
    'task-finish.verification-policy-missing',
    'task-finish.retained-workspace-dirty',
  ]) assert.equal(codes.has(code), true, code);
  assert.ok(result.failure.findings.length >= 7);
  assert.equal(result.failure.failureClass, 'upstream-candidate-defect');
});
