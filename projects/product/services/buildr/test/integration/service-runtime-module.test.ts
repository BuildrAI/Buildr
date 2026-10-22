import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createCodeApplication } from '../../src/modules/code/application/code-application.ts';
import { CODE_APPLICATION } from '../../src/modules/code/module.ts';
import { CONNECTION_SKILLS_APPLICATION } from '../../src/modules/connection-skills/module.ts';
import { WORKSPACE_APPLICATION } from '../../src/modules/workspace/module.ts';
import { SERVICE_DEPLOYMENT_APPLICATION, SERVICE_RUNTIME_APPLICATION, SERVICE_RUNTIME_MODULE, SERVICE_RUNTIME_VIEW } from '../../src/modules/service-runtime/module.ts';

const serverScript = `
const port = Number((process.argv.find(item => item.startsWith('--port=')) || '--port=0').slice(7));
require('http').createServer((request, response) => { response.end('ok'); }).listen(port, '127.0.0.1', () => {
  console.log('cwd=' + process.cwd() + ' Started TestApp on ' + port);
});
setInterval(() => {}, 1000);
`;

function fixture(t: test.TestContext, options: { programReady?: boolean; availability?: string[] } = {}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-service-runtime-module-'));
  const repository = path.join(base, 'repository');
  fs.mkdirSync(path.join(repository, 'app'), { recursive: true });
  const git = (...args: string[]) => execFileSync('git', ['--no-optional-locks', '-C', repository, ...args], { encoding: 'utf8', env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '--initial-branch=dev-pigs');
  git('config', 'user.name', 'Fixture Person');
  git('config', 'user.email', 'fixture@example.com');
  git('config', 'commit.gpgSign', 'false');
  fs.writeFileSync(path.join(repository, 'app', 'server.js'), 'module.exports = 1;\n');
  git('add', '--', '.');
  git('commit', '-m', 'fixture');
  const head = git('rev-parse', 'HEAD');

  const workspaceRoot = path.join(base, 'workspace');
  fs.mkdirSync(path.join(workspaceRoot, 'services', 'pigs'), { recursive: true });
  fs.writeFileSync(path.join(workspaceRoot, 'services', 'pigs', 'runtime.yml'), `version: 1
source: agent
verifiedAt: '2026-10-21T14:02:00+08:00'
local:
  command: [${JSON.stringify(process.execPath)}, -e, ${JSON.stringify(serverScript)}, --]
  cwd: .
  preferredPort: 18111
  portOverride: --port
  readiness:
    kind: log
    pattern: Started TestApp
  timeoutSeconds: 15
environments:
  qa:
    connectionId: jixian-yunque
    program: deploy
    target: 农牧后端业务服务
    targetRef: JX-FRESHX-PIGS-QA
    integrationBranch: dev-pigs
    timeoutSeconds: 30
`, 'utf8');

  const catalog = {
    diagnostics: [],
    repositories: [{ id: 'repo-pigs', code: 'pigs-repo', name: 'Fixture Repository', source: { type: 'workspace', path: repository } }],
    services: [{ id: 'service-pigs', code: 'pigs', name: '农牧后端业务服务', repositoryId: 'repo-pigs', modulePath: 'app' }],
    projects: [{ id: 'project-jixian', code: 'jixian', serviceIds: ['service-pigs'] }],
  };
  const code = createCodeApplication({
    assetCatalog: () => catalog,
    resolveSourceRoot: (_root: string, source: { path: string }) => source.path,
    readTaskScope: () => { throw new Error('missing task'); },
    readTask: () => { throw new Error('missing task'); },
    readGitWorktreeEvidence: () => null,
  } as any);
  const calls: Array<{ program: string; args: string[]; input: any }> = [];
  const connections = {
    get: () => ({
      instance: {
        id: 'jixian-yunque',
        name: '云雀（集鲜）',
        revision: 'opaque-revision',
        availability: { ready: (options.availability ?? []).length === 0, diagnostics: options.availability ?? [] },
        programAvailability: { deploy: { ready: options.programReady !== false, diagnostics: options.programReady === false ? ['未找到可执行程序 yunque。'] : [] } },
      },
    }),
    run: async (_root: string, request: { id: string; expectedRevision: string; program: string; args: string[]; input: string }) => {
      calls.push({ program: request.program, args: request.args, input: JSON.parse(request.input) });
      assert.equal(request.expectedRevision, 'opaque-revision');
      return {
        status: 'exited' as const,
        exitCode: 0,
        signal: null,
        stdout: request.input.includes('list-branches')
          ? JSON.stringify({ branches: [{ branch: 'dev-pigs', commit: '3f2a1c9d0e', integration: true }] })
          : JSON.stringify({ state: 'submitted', version: 'dev-pigs@3f2a1c9', externalUrl: 'https://yunque.example/builds/91' }),
        stderr: '',
        diagnostics: [],
      };
    },
  };
  const descriptor: any = SERVICE_RUNTIME_MODULE.create({ [WORKSPACE_APPLICATION]: { assetCatalog: () => catalog }, [CODE_APPLICATION]: code, [CONNECTION_SKILLS_APPLICATION]: connections });
  t.after(async () => {
    for (const run of await descriptor.provides[SERVICE_RUNTIME_APPLICATION].listRuns(workspaceRoot)) {
      if (run.status === 'starting' || run.status === 'running') await descriptor.provides[SERVICE_RUNTIME_APPLICATION].stopRun(workspaceRoot, run.id);
    }
    fs.rmSync(base, { recursive: true, force: true });
  });
  return { base, repository, workspaceRoot, head, descriptor, calls, view: descriptor.provides[SERVICE_RUNTIME_VIEW], runtime: descriptor.provides[SERVICE_RUNTIME_APPLICATION], deployment: descriptor.provides[SERVICE_DEPLOYMENT_APPLICATION], cli: descriptor.contributions.cli[0] };
}

test('模块按登记目录、代码库工作树与连接实例组装运行与部署能力', async t => {
  const f = fixture(t);
  assert.deepEqual(Object.keys(f.descriptor.provides).sort(), [SERVICE_RUNTIME_APPLICATION, SERVICE_DEPLOYMENT_APPLICATION, SERVICE_RUNTIME_VIEW].sort());
  assert.deepEqual(f.descriptor.contributions.http.map((item: any) => item.id), ['service-runtime.http']);

  const detail = await f.view.detail(f.workspaceRoot, 'pigs');
  assert.equal(detail.service.projects[0], 'jixian');
  assert.equal(detail.service.definition?.local.preferredPort, 18111);
  assert.equal(detail.service.environments.qa.defined, true);
  assert.equal(detail.service.environments.qa.integrationBranch, 'dev-pigs');
  assert.equal(detail.worktrees.length, 1);
  assert.deepEqual(
    { id: detail.worktrees[0]!.id.slice(0, 9), path: detail.worktrees[0]!.path, label: detail.worktrees[0]!.label, main: detail.worktrees[0]!.main, branch: detail.worktrees[0]!.branch, head: detail.worktrees[0]!.head, dirty: detail.worktrees[0]!.dirty },
    { id: 'checkout-', path: path.join(fs.realpathSync(f.repository), 'app'), label: '主检出', main: true, branch: 'dev-pigs', head: f.head, dirty: false },
  );

  const started = await f.runtime.startRun(f.workspaceRoot, { serviceCode: 'pigs', worktreeId: detail.worktrees[0]!.id });
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline && f.runtime.readLog(f.workspaceRoot, started.id).log === '') await new Promise(resolve => setTimeout(resolve, 100));
  const log = f.runtime.readLog(f.workspaceRoot, started.id).log;
  assert.match(log, new RegExp(`cwd=${path.join(fs.realpathSync(f.repository), 'app')} Started TestApp on ${started.actualPort}`));
  await f.runtime.stopRun(f.workspaceRoot, started.id);

  fs.writeFileSync(path.join(f.repository, 'app', 'untracked.txt'), 'dirty\n');
  assert.equal((await f.view.detail(f.workspaceRoot, 'pigs')).worktrees[0]!.dirty, true);
});

test('部署计划经连接实例的声明程序读取远端分支并提交', async t => {
  const f = fixture(t);
  const plan = await f.deployment.plan(f.workspaceRoot, { serviceCode: 'pigs' });
  assert.deepEqual(plan.provider, { connectionId: 'jixian-yunque', name: '云雀（集鲜）', program: 'deploy', revision: 'opaque-revision' });
  assert.equal(plan.branch, 'dev-pigs');
  assert.equal(plan.remoteCommit, '3f2a1c9d0e');
  assert.equal(plan.local?.head, f.head);
  assert.equal(plan.available, true);
  assert.deepEqual(f.calls[0], { program: 'deploy', args: [], input: { protocol: 'buildr.service-deployment/v1', action: 'list-branches', service: { code: 'pigs' }, environment: 'qa', target: '农牧后端业务服务', targetRef: 'JX-FRESHX-PIGS-QA' } });

  const record = await f.deployment.submit(f.workspaceRoot, { serviceCode: 'pigs', branch: 'dev-pigs', commit: '3f2a1c9d0e' });
  assert.equal(record.state, 'submitted');
  assert.equal(record.externalUrl, 'https://yunque.example/builds/91');
  const overview = await f.view.overview(f.workspaceRoot);
  assert.equal(overview.services[0]!.environments.qa.latest?.state, 'submitted');
});

test('连接实例或部署程序不可用时只降级部署动作', async t => {
  const unavailable = fixture(t, { availability: ['实例已停用。'] });
  const plan = await unavailable.deployment.plan(unavailable.workspaceRoot, { serviceCode: 'pigs' });
  assert.equal(plan.available, false);
  assert.match(plan.diagnostics.join(' '), /实例已停用/);
  assert.equal((await unavailable.view.detail(unavailable.workspaceRoot, 'pigs')).worktrees.length, 1);

  const programMissing = fixture(t, { programReady: false });
  const blocked = await programMissing.deployment.plan(programMissing.workspaceRoot, { serviceCode: 'pigs' });
  assert.equal(blocked.available, false);
  assert.match(blocked.diagnostics.join(' '), /部署程序 deploy 未就绪/);
  await assert.rejects(programMissing.deployment.submit(programMissing.workspaceRoot, { serviceCode: 'pigs', branch: 'dev-pigs', commit: '3f2a1c9d0e' }), (error: any) => error.code === 'service_deployment_provider_unavailable');
  assert.equal(programMissing.calls.length, 0);
});

test('CLI 与 HTTP 共享同一读模型', async t => {
  const f = fixture(t);
  const overview: any = await f.cli.run(null, { argv: ['node', 'buildr', 'service-runtime', 'overview', '--target', f.workspaceRoot] });
  assert.equal(overview.services[0]!.code, 'pigs');
  const worktrees: any = await f.cli.run(null, { argv: ['node', 'buildr', 'service-runtime', 'worktrees', '--service', 'pigs', '--target', f.workspaceRoot] });
  assert.equal(worktrees[0].label, '主检出');
  await assert.rejects(async () => f.cli.run(null, { argv: ['node', 'buildr', 'service-runtime', 'start', '--target', f.workspaceRoot] }), /需要 --service/);
});
