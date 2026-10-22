import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServiceRuntimeApplication, ServiceRuntimeError } from '../../src/modules/service-runtime/application/service-runtime-application.ts';
import { probePortAvailable } from '../../src/modules/service-runtime/infrastructure/managed-process.ts';

const serverScript = `
const port = Number((process.argv.find(item => item.startsWith('--port=')) || '--port=0').slice(7));
require('http').createServer((request, response) => { response.end('ok'); }).listen(port, '127.0.0.1', () => {
  console.log('Started TestApp on ' + port);
});
setInterval(() => {}, 1000);
`;

const definitionYaml = `version: 1
source: agent
verifiedAt: '2026-10-21T14:02:00+08:00'
local:
  command: [${JSON.stringify(process.execPath)}, -e, ${JSON.stringify(serverScript)}, --]
  cwd: .
  preferredPort: 18081
  portOverride: --port
  readiness:
    kind: log
    pattern: Started TestApp
  timeoutSeconds: 15
`;

async function waitFor(predicate: () => boolean | Promise<boolean>, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error('等待超时');
}

test('启动、就绪、重复启动拒绝与停止', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'service-runtime-life-'));
  const worktree = path.join(root, 'work');
  fs.mkdirSync(worktree, { recursive: true });
  const application = createServiceRuntimeApplication({
    resolveService: () => ({ id: 'svc', code: 'demo' }),
    listWorktrees: () => [{ id: 'wt-main', path: worktree, label: '主检出', main: true, branch: 'dev', head: 'abc', dirty: false, taskId: null, taskTitle: null }],
  });
  await application.writeDefinition(root, 'demo', definitionYaml);
  assert.equal(application.readDefinition(root, 'demo')?.definition.local.preferredPort, 18081);

  const started = await application.startRun(root, { serviceCode: 'demo', worktreeId: 'wt-main' });
  assert.equal(started.worktreeId, 'wt-main');
  assert.equal(started.branch, 'dev');
  assert.equal(started.status, 'starting');
  await waitFor(() => (application.listRuns(root, 'demo').then(runs => runs.some(run => run.id === started.id && run.status === 'running'))));
  const running = (await application.listRuns(root, 'demo')).find(run => run.id === started.id)!;
  assert.equal(running.actualPort, 18081);
  assert.match(running.portNote, /使用首选端口/);
  assert.match(application.readLog(root, started.id).log, /Started TestApp on 18081/);

  await assert.rejects(
    application.startRun(root, { serviceCode: 'demo', worktreeId: 'wt-main' }),
    (error: unknown) => error instanceof ServiceRuntimeError && error.code === 'service_runtime_worktree_busy',
  );

  const stopped = await application.stopRun(root, started.id);
  assert.equal(stopped.status, 'stopped');
  await waitFor(() => probePortAvailable(18081));
  fs.rmSync(root, { recursive: true, force: true });
});

test('就绪超时标记失败并清理进程', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'service-runtime-timeout-'));
  const worktree = path.join(root, 'work');
  fs.mkdirSync(worktree, { recursive: true });
  const silent = definitionYaml.replace('pattern: Started TestApp', 'pattern: NeverAppears').replace('timeoutSeconds: 15', 'timeoutSeconds: 10');
  const application = createServiceRuntimeApplication({
    resolveService: () => ({ id: 'svc', code: 'demo' }),
    listWorktrees: () => [{ id: 'wt-main', path: worktree, label: '主检出', main: true, branch: 'dev', head: 'abc', dirty: false, taskId: null, taskTitle: null }],
  });
  await application.writeDefinition(root, 'demo', silent);
  await assert.rejects(
    application.startRun(root, { serviceCode: 'demo', worktreeId: 'wt-missing' }),
    (error: unknown) => error instanceof ServiceRuntimeError && error.code === 'service_runtime_worktree_unknown',
  );
  const started = await application.startRun(root, { serviceCode: 'demo', worktreeId: 'wt-main' });
  await waitFor(() => application.listRuns(root, 'demo').then(runs => runs.some(run => run.id === started.id && run.status === 'failed')), 20000);
  const failed = (await application.listRuns(root, 'demo')).find(run => run.id === started.id)!;
  assert.match(failed.failure ?? '', /就绪检查超时/);
  await waitFor(() => probePortAvailable(failed.actualPort));
  fs.rmSync(root, { recursive: true, force: true });
});
