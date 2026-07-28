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
    requiredAssurance: 'affected',
    workspaceNodeIdentity: 'sha256-workspace-node',
  };
}

function passingHandlers(calls = []) {
  return Object.fromEntries(FINISH_PHASES.map((phase) => [phase, async () => {
    calls.push(phase);
    if (phase === 'prepare') return { status: 'passed', output: { frozenCandidate: { identity: 'candidate-v1', head: 'abc', tree: 'tree', branch: 'codex/finish-v2' } } };
    if (phase === 'verify') return { status: 'passed', output: { verification: { status: 'passed', executions: 1, evidenceIdentity: 'evidence-v1' } } };
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

test('Finish 不复用缺少 Workspace Node identity 的旧验证证据', async (t) => {
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
  const summary = path.join(fixture(t), 'verification.json');
  fs.writeFileSync(summary, JSON.stringify({
    status: 'passed', requiredAssurance: 'affected', source: { candidateFingerprint: 'frozen-node-candidate' }, evidenceIdentity: 'sha256-old-evidence',
  }));
  const runtime = {
    workspaceNodeExecution: () => ({ ready: true, status: 'ready', identity: { digest: 'sha256-workspace-node', version: '22.4.1' } }),
    resolveTaskEnvironmentContext: () => ({ executionReady: false, blocked: { message: 'verification should execute instead of reusing legacy evidence' } }),
  };
  const run = createFinishRun({ root, runId: 'node-evidence', identity: identity(root, 'node-evidence') });
  run.frozenCandidate = { identity: 'frozen-node-candidate', head, tree, branch: 'codex/node-evidence', workspaceNodeIdentity: 'sha256-workspace-node' };
  const handlers = createTaskFinishProductHandlers({ runtime, root, existingVerificationSummary: summary });
  const legacy = await handlers.verify({ run });
  assert.equal(legacy.status, 'failed');
  assert.equal(legacy.failure.code, 'task-finish.candidate-context-invalid');

  fs.writeFileSync(summary, JSON.stringify({
    status: 'passed', requiredAssurance: 'affected', source: { candidateFingerprint: 'frozen-node-candidate' }, evidenceIdentity: 'sha256-current-evidence',
    workspaceNode: { identity: { digest: 'sha256-workspace-node' } },
  }));
  const reusable = await handlers.verify({ run });
  assert.equal(reusable.status, 'passed');
  assert.equal(reusable.output.verification.reused, true);
  assert.equal(reusable.output.verification.executions, 0);
});

test('target race 由产品生成恢复令牌且不重跑已通过阶段', async (t) => {
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
  const second = await executeFinishRun({ root, run: readFinishRun({ root, runId: 'resume' }), handlers: secondHandlers, resumeToken: first.resume.token });
  assert.equal(second.status, 'complete');
  assert.deepEqual(secondCalls, ['deliver', 'cleanup']);
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
    resolveTaskEnvironmentContext: () => ({ executionReady: false, blocked: { code: 'worktree.execution_cli_unavailable', message: 'CLI dependency is missing.' }, repositories: [{ branch: 'dev' }] }),
    readProjectRegistryPersistence: () => ({ registry: { projects: { product: { source: { path: 'projects/product' } } } } }),
    parseOpenSpecChangeDelta: () => { throw new Error('delta is invalid'); },
    workspaceNodeExecution: () => ({ ready: false, status: 'missing', identity: null }),
  };
  const run = createFinishRun({ root, runId: 'aggregate', identity: identity(root, 'aggregate') });
  const result = await createTaskFinishProductHandlers({ runtime, root }).preflight({ run });
  assert.equal(result.status, 'failed');
  const codes = new Set(result.checks.filter((check) => check.severity === 'error').map((check) => check.code));
  for (const code of [
    'worktree.execution_cli_unavailable',
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
