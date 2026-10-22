import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServiceDeploymentApplication, type DeploymentConnectionPort } from '../../src/modules/service-runtime/application/service-deployment-application.ts';
import { DEPLOYMENT_ADAPTER_PROTOCOL, normalizeDeploymentResult, parseBranchListOutput, parseDeploymentOutput, type ProgramObservation } from '../../src/modules/service-runtime/domain/deployment.ts';
import { ServiceRuntimeError } from '../../src/modules/service-runtime/domain/errors.ts';

const definitionYaml = `version: 1
source: agent
verifiedAt: '2026-10-21T14:02:00+08:00'
local:
  command: [mvnd, spring-boot:run]
  cwd: saas-freshx-biz
  preferredPort: 8080
  portOverride: --server.port
  readiness:
    kind: log
    pattern: Started FreshXApplication
  timeoutSeconds: 180
environments:
  qa:
    connectionId: jixian-yunque
    program: deploy
    target: 农牧后端业务服务
    targetRef: JX-FRESHX-PIGS-QA
    integrationBranch: dev-pigs
    timeoutSeconds: 60
`;

function workspace(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-deployment-'));
  fs.mkdirSync(path.join(root, 'services', 'pigs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'services', 'pigs', 'runtime.yml'), definitionYaml, 'utf8');
  return root;
}

function exited(stdout: string, exitCode = 0): ProgramObservation {
  return { status: 'exited', exitCode, signal: null, stdout, diagnostics: [] };
}

const plan = { serviceCode: 'pigs', environment: 'qa', target: 'JX-FRESHX-PIGS-QA', targetRef: 'service:jixian/pigs', branch: 'dev-pigs', commit: '3f2a1c9d0e' };

type RunCall = { program: string; args: string[]; input: any; timeoutMs: number };

const mainWorktree = { id: 'checkout-main', path: '/tmp/checkout', label: '主检出', main: true, branch: 'dev-pigs', head: '99887766', dirty: true, taskId: null, taskTitle: null };

function deployment(options: { root: string; describe?: DeploymentConnectionPort['describe']; run?: (call: RunCall) => Promise<ProgramObservation>; worktrees?: any[] }) {
  const calls: RunCall[] = [];
  const application = createServiceDeploymentApplication({
    resolveService: (_root, serviceCode) => (serviceCode === 'pigs' ? { id: 'service-pigs', code: 'pigs' } : null),
    listWorktrees: () => options.worktrees ?? [mainWorktree],
    connection: {
      describe: options.describe ?? ((_root, connectionId) => ({ id: connectionId, name: '云雀（集鲜）', revision: 'rev-1', diagnostic: null })),
      run: async (_root, call) => {
        calls.push({ program: call.program, args: call.args, input: JSON.parse(call.input), timeoutMs: call.timeoutMs });
        return options.run ? options.run(calls[calls.length - 1]!) : exited('{}');
      },
    },
    now: () => '2026-10-21T15:00:00.000Z',
    newId: () => `deploy-${calls.length}`,
  });
  return { application, calls };
}

const branchOutput = JSON.stringify({ protocol: DEPLOYMENT_ADAPTER_PROTOCOL, branches: [{ branch: 'dev-pigs', commit: '3f2a1c9d0e', integration: true }, { branch: 'feature/portfolios', commit: 'a11c0ffee0' }] });

test('受理输出归一化为 submitted 并补默认版本', () => {
  const outcome = normalizeDeploymentResult(exited(JSON.stringify({ state: 'submitted', externalUrl: 'https://yunque.example/builds/91', at: '2026-10-21T15:00:01.000Z' })), plan);
  assert.equal(outcome.state, 'submitted');
  assert.equal(outcome.version, 'dev-pigs@3f2a1c9');
  assert.equal(outcome.externalUrl, 'https://yunque.example/builds/91');
});

test('超时、无法解析与非零退出的成功声明都保留 unknown', () => {
  const timeout = normalizeDeploymentResult({ status: 'timeout', exitCode: null, signal: 'SIGTERM', stdout: '', diagnostics: [] }, plan);
  assert.equal(timeout.state, 'unknown');
  assert.match(timeout.diagnostics.join(' '), /超时/);
  const unparsable = normalizeDeploymentResult(exited('构建已启动'), plan);
  assert.equal(unparsable.state, 'unknown');
  assert.match(unparsable.diagnostics.join(' '), /未返回符合/);
  const conflicting = normalizeDeploymentResult(exited(JSON.stringify({ state: 'success' }), 1), plan);
  assert.equal(conflicting.state, 'unknown');
});

test('输出解析拒绝非法状态与不安全外链', () => {
  assert.equal(parseDeploymentOutput(JSON.stringify({ state: 'done' })), null);
  assert.equal(parseDeploymentOutput('not json'), null);
  const parsed = parseDeploymentOutput(JSON.stringify({ state: 'failed', externalUrl: 'javascript:alert(1)', diagnostics: ['流水线失败'] }));
  assert.equal(parsed?.externalUrl, null);
  assert.deepEqual(parsed?.diagnostics, ['流水线失败']);
  assert.deepEqual(parseBranchListOutput(JSON.stringify({ branches: [{ branch: 'dev' }] })), null);
  assert.equal(parseBranchListOutput(branchOutput)?.length, 2);
});

test('计划默认登记集成分支并给出远端提交与本地对照', async () => {
  const root = workspace();
  const { application, calls } = deployment({
    root,
    run: async call => (call.input.action === 'list-branches' ? exited(branchOutput) : exited(JSON.stringify({ state: 'submitted' }))),
  });
  const view = await application.plan(root, { serviceCode: 'pigs', worktreeId: 'checkout-main' });
  assert.equal(calls[0]!.input.action, 'list-branches');
  assert.equal(calls[0]!.program, 'deploy');
  assert.equal(calls[0]!.timeoutMs, 60_000);
  assert.equal(view.branch, 'dev-pigs');
  assert.equal(view.integration, true);
  assert.equal(view.remoteCommit, '3f2a1c9d0e');
  assert.equal(view.version, 'dev-pigs@3f2a1c9');
  assert.equal(view.available, true);
  assert.deepEqual(view.local, mainWorktree);
  assert.equal(view.worktrees.length, 1);
  const other = await application.plan(root, { serviceCode: 'pigs', branch: 'feature/portfolios' });
  assert.equal(other.integration, false);
  assert.equal(other.remoteCommit, 'a11c0ffee0');
});

test('提供者缺失只降级部署动作', async () => {
  const root = workspace();
  const { application } = deployment({ root, describe: () => null });
  const view = await application.plan(root, { serviceCode: 'pigs' });
  assert.equal(view.available, false);
  assert.equal(view.provider, null);
  assert.match(view.diagnostics.join(' '), /部署动作不可用/);
  await assert.rejects(
    application.submit(root, { serviceCode: 'pigs', branch: 'dev-pigs', commit: '3f2a1c9d0e' }),
    (error: unknown) => error instanceof ServiceRuntimeError && error.code === 'service_deployment_provider_unavailable',
  );
});

test('提交保存最近结果并按环境隔离', async () => {
  const root = workspace();
  const { application } = deployment({
    root,
    run: async call => (call.input.action === 'submit'
      ? exited(JSON.stringify({ state: 'submitted', version: 'dev-pigs@3f2a1c9', externalUrl: 'https://yunque.example/builds/91' }))
      : exited(branchOutput)),
  });
  const record = await application.submit(root, { serviceCode: 'pigs', branch: 'dev-pigs', commit: '3f2a1c9d0e' });
  assert.equal(record.state, 'submitted');
  assert.equal(record.version, 'dev-pigs@3f2a1c9');
  assert.equal(record.submittedAt, '2026-10-21T15:00:00.000Z');
  assert.deepEqual(record.provider, { connectionId: 'jixian-yunque', revision: 'rev-1', program: 'deploy' });
  assert.equal(application.latest(root, 'pigs')?.id, record.id);
  assert.equal(application.latest(root, 'pigs', 'reg'), null);
});

test('未知结果不自动重试，确认后才允许同一计划', async () => {
  const root = workspace();
  const { application, calls } = deployment({ root, run: async () => ({ status: 'timeout', exitCode: null, signal: 'SIGTERM', stdout: '', diagnostics: [] }) });
  const first = await application.submit(root, { serviceCode: 'pigs', branch: 'dev-pigs', commit: '3f2a1c9d0e' });
  assert.equal(first.state, 'unknown');
  await assert.rejects(
    application.submit(root, { serviceCode: 'pigs', branch: 'dev-pigs', commit: '3f2a1c9d0e' }),
    (error: unknown) => error instanceof ServiceRuntimeError && error.code === 'service_deployment_unknown_pending',
  );
  assert.equal(calls.length, 1);
  const acknowledged = await application.submit(root, { serviceCode: 'pigs', branch: 'dev-pigs', commit: '3f2a1c9d0e', acknowledgeUnknown: true });
  assert.equal(acknowledged.state, 'unknown');
  assert.equal(calls.length, 2);
  const otherCommit = await application.submit(root, { serviceCode: 'pigs', branch: 'dev-pigs', commit: 'fffffffffff' });
  assert.equal(otherCommit.state, 'unknown');
  assert.equal(calls.length, 3);
});

test('提交未发出记为 failed 并可重新提交', async () => {
  const root = workspace();
  let attempts = 0;
  const { application } = deployment({
    root,
    run: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('此接入需要当前本机的个人认证，请先保存完整账号。');
      return exited(JSON.stringify({ state: 'success', version: 'dev-pigs@3f2a1c9', at: '2026-10-21T15:04:00.000Z', externalUrl: 'https://yunque.example/builds/92' }));
    },
  });
  const failed = await application.submit(root, { serviceCode: 'pigs', branch: 'dev-pigs', commit: '3f2a1c9d0e' });
  assert.equal(failed.state, 'failed');
  assert.match(failed.diagnostics.join(' '), /提交未发出/);
  const succeeded = await application.submit(root, { serviceCode: 'pigs', branch: 'dev-pigs', commit: '3f2a1c9d0e' });
  assert.equal(succeeded.state, 'success');
  assert.equal(application.latest(root, 'pigs')?.externalUrl, 'https://yunque.example/builds/92');
});

test('运行定义登记的其他环境直接参与部署', async () => {
  const root = workspace();
  fs.appendFileSync(path.join(root, 'services', 'pigs', 'runtime.yml'), `  prod:
    connectionId: jixian-yunque
    target: 农牧后端业务服务
    targetRef: JX-FRESHX-PIGS-PROD
    integrationBranch: main
`, 'utf8');
  const { application, calls } = deployment({
    root,
    run: async () => exited(JSON.stringify({ state: 'submitted', externalUrl: 'https://yunque.example/builds/93' })),
  });
  const record = await application.submit(root, { serviceCode: 'pigs', environment: 'prod', branch: 'main', commit: 'abc1234def' });
  assert.equal(record.environment, 'prod');
  assert.equal(record.targetRef, 'JX-FRESHX-PIGS-PROD');
  assert.equal(calls[0]?.input.environment, 'prod');
  assert.equal(application.latest(root, 'pigs', 'prod')?.state, 'submitted');
});

test('未登记环境目标时拒绝部署', async () => {
  const root = workspace();
  fs.writeFileSync(path.join(root, 'services', 'pigs', 'runtime.yml'), definitionYaml.replace(/environments:\n(?: +.*\n)+/, ''), 'utf8');
  const { application } = deployment({ root });
  await assert.rejects(
    application.plan(root, { serviceCode: 'pigs' }),
    (error: unknown) => error instanceof ServiceRuntimeError && error.code === 'service_deployment_environment_undefined',
  );
});

const adapterTemplate = path.join('resources', 'workspace', 'skills', 'buildr', 'connection-authoring', 'templates', 'deployment-adapter.mjs');

function sample(mode: string) {
  const result = spawnSync(process.execPath, [adapterTemplate, '--mock', mode], { encoding: 'utf8', timeout: 10_000 });
  return { status: 'exited' as const, exitCode: result.status, signal: null, stdout: result.stdout, diagnostics: [] };
}

test('随包部署适配器样例经归一化后保持声明状态', () => {
  assert.equal(fs.existsSync(adapterTemplate), true, '缺少随包部署适配器样例');
  const samplePlan = { ...plan, branch: 'dev-example', commit: '0000000000000000000000000000000000000000' };
  const success = normalizeDeploymentResult(sample('success'), samplePlan);
  assert.equal(success.state, 'success');
  assert.equal(success.version, 'dev-example@0000000');
  assert.match(success.externalUrl ?? '', /^https:\/\/ci\.example\.invalid\//);
  assert.equal(normalizeDeploymentResult(sample('failed'), samplePlan).state, 'failed');
  const unknown = normalizeDeploymentResult(sample('unknown'), samplePlan);
  assert.equal(unknown.state, 'unknown');
  assert.match(unknown.diagnostics.join(' '), /先到外部系统核对实际记录/);
  const invalid = sample('bogus');
  assert.equal(invalid.exitCode, 2);
  assert.equal(normalizeDeploymentResult(invalid, samplePlan).state, 'failed');
  const branches = parseBranchListOutput(sample('branches').stdout);
  assert.deepEqual(branches, [{ branch: 'dev-example', commit: '0000000000000000000000000000000000000000', integration: true }]);
});
