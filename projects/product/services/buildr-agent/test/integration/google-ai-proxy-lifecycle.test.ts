import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { createAgentService, connectAgentProcess, prepareAgentRuntime, stopAgentProcess } from '../../src/index.ts';
import { createGoogleAiProxyProvider } from '../../src/model-access/providers/google-ai-proxy.ts';
import { cliProxyBinaryName } from '../../src/model-access/providers/google-ai-proxy-install.ts';

function makeTempDir(t: TestContext): string {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'google-ai-proxy-lifecycle-')));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function processAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitUntil(check: () => boolean, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (check()) return;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  assert.ok(check(), 'condition timed out');
}

function writeMockCliProxy(directory: string, port: number, options: { ignoreSigterm?: boolean; neverListen?: boolean; pidFile: string; loginUrl?: string }): void {
  const authDir = path.join(directory, 'auth');
  fs.mkdirSync(authDir, { recursive: true });
  fs.writeFileSync(path.join(authDir, 'antigravity-user.json'), JSON.stringify({
    type: 'antigravity',
    email: 'user@example.com',
    refresh_token: 'refresh-tok',
    project_id: 'proj-1',
  }));
  fs.writeFileSync(path.join(directory, 'config.yaml'), JSON.stringify({
    'config-version': 8,
    server: { host: '127.0.0.1', port },
    access: { 'api-keys': ['mock-key'] },
    oauth: { 'auth-dir': authDir },
  }));
  const binaryPath = path.join(directory, cliProxyBinaryName());
  const lines = [
    '#!/usr/bin/env node',
    "import http from 'node:http';",
    "import fs from 'node:fs';",
    'const args = process.argv.slice(2);',
    `const pidFile = ${JSON.stringify(options.pidFile)};`,
    'fs.writeFileSync(pidFile, String(process.pid));',
    options.ignoreSigterm
      ? "process.on('SIGTERM', () => {});"
      : "process.on('SIGTERM', () => process.exit(0));",
    "if (args.includes('-antigravity-login')) {",
    `  console.log(${JSON.stringify((options.loginUrl ?? 'https://accounts.google.com/o/oauth2/v2/auth?state=1') + ' ')});`,
    '  setInterval(() => {}, 1000);',
    ...(options.neverListen
      ? ['} else {', '  setInterval(() => {}, 1000);']
      : [
          '} else {',
          '  const server = http.createServer((req, res) => {',
          "    if (req.url === '/v1/models') {",
          "      res.writeHead(200, { 'content-type': 'application/json' });",
          "      res.end(JSON.stringify({ data: [{ id: 'gemini-4-carbon-high', display_name: 'Gemini 4 Carbon' }] }));",
          '      return;',
          '    }',
          '    res.writeHead(404);',
          '    res.end();',
          '  });',
          `  server.listen(${port}, '127.0.0.1');`,
        ]),
    '}',
    '',
  ];
  fs.writeFileSync(binaryPath, lines.join('\n'), { mode: 0o755 });
}

async function findFreePort(): Promise<number> {
  const net = await import('node:net');
  const srv = net.createServer();
  await new Promise<void>(resolve => srv.listen(0, '127.0.0.1', () => resolve()));
  const port = (srv.address() as { port: number }).port;
  await new Promise<void>(resolve => srv.close(() => resolve()));
  return port;
}

test('closing AgentService stops running CLIProxyAPI server (including SIGTERM-ignoring process via SIGKILL)', async t => {
  for (const ignoreSigterm of [false, true]) {
    const root = makeTempDir(t);
    const proxyDir = path.join(root, 'CLIProxyAPI');
    const pidFile = path.join(root, 'proxy.pid');
    const port = await findFreePort();
    writeMockCliProxy(proxyDir, port, { ignoreSigterm, pidFile });

    const service = createAgentService({
      dataRoot: root,
      executors: [],
      modelProviders: [createGoogleAiProxyProvider(proxyDir, { stopGraceMs: 120 })],
      resolveWorkspace: () => ({ rootPath: root }),
      assertTask() {},
    });
    try {
      const added = await service.models.accounts.add({ provider: 'google-ai-subscription' });
      const checked = await service.models.accounts.check(added.id);
      assert.equal(checked.status, 'ready');
      assert.equal(checked.models.length, 1);
      const pid = Number(fs.readFileSync(pidFile, 'utf8').trim());
      assert.equal(processAlive(pid), true);

      await service.close();
      await waitUntil(() => !processAlive(pid));
    } finally {
      await service.close();
    }
  }
});

test('closing AgentService while CLIProxyAPI is still starting terminates the starting child without leaving orphans', async t => {
  const root = makeTempDir(t);
  const proxyDir = path.join(root, 'CLIProxyAPI');
  const pidFile = path.join(root, 'proxy-starting.pid');
  const port = await findFreePort();
  writeMockCliProxy(proxyDir, port, { neverListen: true, pidFile });

  const service = createAgentService({
    dataRoot: root,
    executors: [],
    modelProviders: [createGoogleAiProxyProvider(proxyDir, { stopGraceMs: 80 })],
    resolveWorkspace: () => ({ rootPath: root }),
    assertTask() {},
  });
  try {
    const added = await service.models.accounts.add({ provider: 'google-ai-subscription' });
    const checking = service.models.accounts.check(added.id);
    await waitUntil(() => fs.existsSync(pidFile));
    const pid = Number(fs.readFileSync(pidFile, 'utf8').trim());
    assert.equal(processAlive(pid), true);

    await service.close();
    await checking.catch(() => {});
    await waitUntil(() => !processAlive(pid));
  } finally {
    await service.close();
  }
});

test('closing AgentService while -antigravity-login is active terminates the login subprocess', async t => {
  const root = makeTempDir(t);
  const proxyDir = path.join(root, 'CLIProxyAPI');
  const pidFile = path.join(root, 'proxy-login.pid');
  const port = await findFreePort();
  writeMockCliProxy(proxyDir, port, { pidFile });

  const service = createAgentService({
    dataRoot: root,
    executors: [],
    modelProviders: [createGoogleAiProxyProvider(proxyDir, { stopGraceMs: 80 })],
    resolveWorkspace: () => ({ rootPath: root }),
    assertTask() {},
  });
  try {
    const added = await service.models.accounts.add({ provider: 'google-ai-subscription' });
    await service.models.accounts.login(added.id, { expectedRevision: added.revision });
    await waitUntil(() => fs.existsSync(pidFile));
    const pid = Number(fs.readFileSync(pidFile, 'utf8').trim());
    assert.equal(processAlive(pid), true);

    await service.close();
    await waitUntil(() => !processAlive(pid));
  } finally {
    await service.close();
  }
});

test('stopping isolated AgentProcess via authenticated shutdown terminates its CLIProxyAPI child process', async t => {
  const root = makeTempDir(t);
  const proxyDir = path.join(root, 'CLIProxyAPI');
  const pidFile = path.join(root, 'proxy-process.pid');
  const port = await findFreePort();
  writeMockCliProxy(proxyDir, port, { pidFile });

  const packageRoot = path.resolve(import.meta.dirname, '../../../buildr/node_modules/@buildr-ai/buildr-agent');
  const runtime = prepareAgentRuntime({ dataRoot: root, packageRoot });
  const connection = await connectAgentProcess({
    dataRoot: root,
    profileId: 'test',
    sourceId: 'buildr',
    runtime,
  });
  try {
    const added = await connection.operations.models.accounts.add({ provider: 'google-ai-subscription' });
    const checked = await connection.operations.models.accounts.check(added.id);
    assert.equal(checked.status, 'ready');
    const pid = Number(fs.readFileSync(pidFile, 'utf8').trim());
    assert.equal(processAlive(pid), true);

    await connection.disconnect();
    await stopAgentProcess({ dataRoot: root, profileId: 'test', mode: 'stop-owned' });
    await waitUntil(() => !processAlive(pid));
  } finally {
    await connection.disconnect().catch(() => {});
    await stopAgentProcess({ dataRoot: root, profileId: 'test', mode: 'stop-owned' }).catch(() => {});
    if (fs.existsSync(pidFile)) {
      const pid = Number(fs.readFileSync(pidFile, 'utf8').trim());
      if (processAlive(pid)) {
        try { process.kill(pid, 'SIGKILL'); } catch {}
      }
    }
  }
});

test('unexpected parent exit synchronously kills tracked CLIProxyAPI child via exit hook', async t => {
  const root = makeTempDir(t);
  const proxyDir = path.join(root, 'CLIProxyAPI');
  const pidFile = path.join(root, 'proxy-exit.pid');
  const port = await findFreePort();
  writeMockCliProxy(proxyDir, port, { pidFile });

  const runner = path.join(root, 'spawn-and-exit.ts');
  const providerModule = path.resolve(import.meta.dirname, '../../src/model-access/providers/google-ai-proxy.ts');
  const runnerLines = [
    `import { createGoogleAiProxyProvider } from ${JSON.stringify(providerModule)};`,
    `const runtime = await createGoogleAiProxyProvider(${JSON.stringify(proxyDir)}).open({ accountId: 'g', configRoot: ${JSON.stringify(proxyDir)}, environment: {} });`,
    'const obs = await runtime.inspect();',
    "if (obs.status !== 'ready') process.exit(2);",
    'process.exit(0);',
    '',
  ];
  fs.writeFileSync(runner, runnerLines.join('\n'));
  const child = spawn(process.execPath, [runner], { cwd: root, stdio: 'inherit' });
  const code = await new Promise<number | null>(resolve => child.once('exit', resolve));
  assert.equal(code, 0);
  const pid = Number(fs.readFileSync(pidFile, 'utf8').trim());
  await waitUntil(() => !processAlive(pid));
});

test('SIGTERM on isolated AgentProcess terminates both AgentProcess and its CLIProxyAPI child', async t => {
  const root = makeTempDir(t);
  const proxyDir = path.join(root, 'CLIProxyAPI');
  const pidFile = path.join(root, 'proxy-sigterm.pid');
  const port = await findFreePort();
  writeMockCliProxy(proxyDir, port, { pidFile });

  const packageRoot = path.resolve(import.meta.dirname, '../../../buildr/node_modules/@buildr-ai/buildr-agent');
  const runtime = prepareAgentRuntime({ dataRoot: root, packageRoot });
  const connection = await connectAgentProcess({
    dataRoot: root,
    profileId: 'test',
    sourceId: 'buildr',
    runtime,
  });
  try {
    const added = await connection.operations.models.accounts.add({ provider: 'google-ai-subscription' });
    const checked = await connection.operations.models.accounts.check(added.id);
    assert.equal(checked.status, 'ready');
    const status = await connection.lifecycle.status();
    const agentPid = status.identity.pid;
    const proxyPid = Number(fs.readFileSync(pidFile, 'utf8').trim());
    assert.equal(processAlive(agentPid), true);
    assert.equal(processAlive(proxyPid), true);

    await connection.disconnect();
    process.kill(agentPid, 'SIGTERM');
    await waitUntil(() => !processAlive(agentPid) && !processAlive(proxyPid), 8_000);
  } finally {
    await connection.disconnect().catch(() => {});
    await stopAgentProcess({ dataRoot: root, profileId: 'test', mode: 'stop-owned' }).catch(() => {});
    if (fs.existsSync(pidFile)) {
      const pid = Number(fs.readFileSync(pidFile, 'utf8').trim());
      if (processAlive(pid)) {
        try { process.kill(pid, 'SIGKILL'); } catch {}
      }
    }
  }
});
