import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import test from 'node:test';
import { acquireExclusiveFileLock, releaseExclusiveFileLock } from '../../src/infrastructure/filesystem/exclusive-file-lock.ts';
import { CodexDesktopApplication } from '../../src/modules/codex-desktop/application/codex-desktop-application.ts';
import { CODEX_DESKTOP_PLUGIN_VERSION } from '../../src/modules/codex-desktop/infrastructure/codex-plugin-installation.ts';
import { CodexDesktopRepository } from '../../src/modules/codex-desktop/persistence/codex-desktop-repository.ts';

const applicationUrl = new URL('../../src/modules/codex-desktop/application/codex-desktop-application.ts', import.meta.url).href;
const serverUrl = new URL('../../src/modules/codex-desktop/interfaces/mcp/codex-mcp-server.ts', import.meta.url).href;
async function fixture(t: test.TestContext) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-codex-concurrency-'));
  const clients: ReturnType<typeof client>[] = [];
  t.after(async () => {
    for (const current of clients) if (current.child.exitCode === null) current.child.kill();
    await Promise.all(clients.map(current => current.exited.catch(() => {})));
    fs.rmSync(base, { recursive: true, force: true });
  });
  const home = path.join(base, 'codex'), appPath = path.join(base, 'ChatGPT.app'), dataRoot = path.join(base, 'profile');
  for (const directory of [home, appPath, dataRoot]) fs.mkdirSync(directory);
  const application = new CodexDesktopApplication({ dataRoot,
    resolveWorkspace: id => ({ rootPath: base, workspace: { id } }), listWorkspaces: () => ({ workspaces: [] }),
    readTaskIdentity: () => null, readOrigin: () => null,
    installPlugin: async () => ({ pluginVersion: CODEX_DESKTOP_PLUGIN_VERSION, status: 'awaiting-desktop', safeReason: null }),
  });
  const registration = { kind: 'codex' as const, id: 'agent-' + crypto.randomUUID(), label: 'Codex', executable: process.execPath, version: 'fixture', codexHome: home };
  const reconnect = () => application.connect(registration, { appPath, appVersion: 'fixture' });
  const connection = await reconnect();
  const file = path.join(dataRoot, 'codex-desktop/connections.json');
  return { application, base, dataRoot, home, connection, file, reconnect, repository: new CodexDesktopRepository(dataRoot), leasesFile: path.join(dataRoot, 'codex-desktop/connector-leases.json'), lockGate: path.join(base, 'resume-lock-attempt'), start: (mode?: 'connections' | 'active-lease' | 'directory-wait') => { const current = client(dataRoot, home, connection.id, mode); clients.push(current); return current; } };
}

function client(dataRoot: string, home: string, connectionId: string, mode?: 'connections' | 'active-lease' | 'directory-wait') {
  const source = `
    import { CodexDesktopApplication } from ${JSON.stringify(applicationUrl)};
    import { runCodexMcpServer } from ${JSON.stringify(serverUrl)};
    import fs from 'node:fs';
    const dataRoot = ${JSON.stringify(dataRoot)};
    const application = new CodexDesktopApplication({dataRoot, resolveWorkspace: id => ({rootPath:dataRoot,workspace:{id}}), listWorkspaces:()=>({workspaces:[]}), readTaskIdentity:()=>null, readOrigin:()=>null, installPlugin:async()=>{throw Error('No installation in the MCP fixture');}});
    const started = application.connectorStarted.bind(application);
    application.connectorStarted = (...args) => {process.send({event:'initializing'}); return started(...args);};
    const failure = ${JSON.stringify(mode ?? null)};
    if(failure === 'directory-wait') {
      const link = fs.linkSync;
      let paused = false;
      fs.linkSync = (from,to) => {
        try {return link(from,to);} catch(error) {
          if(!paused && error.code === 'EEXIST' && String(to).endsWith('/connections.json.lock')) {
            paused = true; process.send({event:'lock-waiting'});
            const deadline = Date.now()+4000;
            while(!fs.existsSync(${JSON.stringify(path.join(dataRoot, '..', 'resume-lock-attempt'))})) {
              if(Date.now()>deadline) throw Error('fixture lock wait gate timed out');
              Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,5);
            }
          }
          throw error;
        }
      };
    } else if(failure) {
      const rename = fs.renameSync;
      fs.renameSync = (from,to) => {
        const selected = failure === 'connections' ? String(to).endsWith('/connections.json') : String(to).endsWith('/connector-leases.json') && JSON.parse(fs.readFileSync(from,'utf8')).owners.some(owner=>owner.phase==='active');
        if(selected) throw Object.assign(new Error('fixture runtime publication failure'),{code:'EIO'});
        return rename(from,to);
      };
    }
    process.send({event:'ready'});
    await runCodexMcpServer(application,{connectionId:${JSON.stringify(connectionId)}});
    process.disconnect();
  `;
  const child = spawn(process.execPath, ['--input-type=module', '--eval', source], { stdio: ['pipe', 'pipe', 'pipe', 'ipc'], env: { ...process.env, CODEX_HOME: home, BUILDR_APP_DATA_DIR: dataRoot, BUILDR_PRODUCT_DATA_DIR: dataRoot } });
  let stderr = '', buffered = '';
  const responses: Record<number, any> = {}, waiting = new Map<number, (response: any) => void>();
  child.stderr.on('data', chunk => { stderr += chunk; });
  child.stdout.on('data', chunk => {
    buffered += chunk;
    let end: number;
    while ((end = buffered.indexOf('\n')) >= 0) {
      const line = buffered.slice(0, end); buffered = buffered.slice(end + 1);
      const response = JSON.parse(line); responses[response.id] = response;
      waiting.get(response.id)?.(response); waiting.delete(response.id);
    }
  });
  const event = (name: string) => new Promise<void>((resolve, reject) => {
    child.on('message', (message: { event?: string }) => { if (message.event === name) resolve(); });
    child.once('error', reject);
    child.once('exit', code => reject(new Error(`MCP fixture exited before ${name}: ${code}; ${stderr}`)));
  });
  const ready = event('ready'), initializing = event('initializing'), lockWaiting = event('lock-waiting');
  const exited = new Promise<void>((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`MCP fixture exit ${code}: ${stderr}`)));
  });
  // Attach rejection handlers before a test can fail and terminate still-running fixtures.
  void ready.catch(() => {}); void initializing.catch(() => {}); void lockWaiting.catch(() => {}); void exited.catch(() => {});
  const request = (id: number, method: string, params: unknown = {}) => new Promise<any>((resolve, reject) => {
    const timer = setTimeout(() => { waiting.delete(id); reject(new Error(`MCP fixture response timeout: ${method}`)); }, 5_000);
    waiting.set(id, response => { clearTimeout(timer); resolve(response); });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
  return { child, ready, initializing, lockWaiting, exited, request, responses, close: async () => { child.stdin.end(); await exited; } };
}

test('four real desktop MCP clients wait for a short connection write and all initialize and list tools', { timeout: 15_000 }, async t => {
  const f = await fixture(t), clients = Array.from({ length: 4 }, () => f.start());
  await Promise.all(clients.map(current => current.ready));
  const lock = acquireExclusiveFileLock(f.file + '.lock', f.file);
  let replies: Promise<any>[] = [];
  try {
    replies = clients.map(current => current.request(1, 'initialize'));
    await Promise.all(clients.map(current => current.initializing));
    await delay(150);
    assert.ok(clients.every(current => current.responses[1] === undefined), 'initialization must wait while the connection write lock is held');
  } finally { releaseExclusiveFileLock(lock); }
  for (const response of await Promise.all(replies)) {
    assert.equal(response.error, undefined);
    assert.equal(response.result.serverInfo.version, CODEX_DESKTOP_PLUGIN_VERSION);
  }
  for (const response of await Promise.all(clients.map(current => current.request(2, 'tools/list')))) {
    assert.equal(response.error, undefined);
    assert.ok(response.result.tools.some((tool: { name: string }) => tool.name === 'buildr_codex_panel'));
  }
  const stored = JSON.parse(fs.readFileSync(f.file, 'utf8')).connections[0];
  assert.equal(stored.id, f.connection.id); assert.equal(stored.status, 'ready');
  assert.ok(clients.some(current => current.child.pid === stored.connectorPid));
  const tracked = clients.find(current => current.child.pid === stored.connectorPid)!;
  await tracked.close();
  assert.equal(f.application.listConnections().connections[0].status, 'ready', 'the last writer stopping must retain the other live connections');
  for (const current of clients.filter(current => current !== tracked)) assert.ok((await current.request(3, 'tools/list')).result.tools.length);
  assert.equal((await f.reconnect()).status, 'ready', 'maintenance of the same installed identity preserves active peers');
  const replacement = JSON.parse(fs.readFileSync(f.file, 'utf8')).connections[0];
  assert.notEqual(replacement.connectorPid, tracked.child.pid);
  const older = clients.find(current => current !== tracked && current.child.pid !== replacement.connectorPid)!;
  await older.close();
  assert.equal(JSON.parse(fs.readFileSync(f.file, 'utf8')).connections[0].status, 'ready', 'an older connector stopping cannot clear another active connector');
  await Promise.all(clients.filter(current => current !== older && current !== tracked).map(current => current.close()));
  const stopped = JSON.parse(fs.readFileSync(f.file, 'utf8')).connections[0];
  assert.equal(stopped.status, 'awaiting-desktop'); assert.equal(stopped.connectorPid, null);
  assert.equal(fs.existsSync(f.file + '.lock'), false);
});

test('a persistently held connection lock returns a bounded initialize failure without changing stored state', { timeout: 10_000 }, async t => {
  const f = await fixture(t), current = f.start(); await current.ready;
  const before = fs.readFileSync(f.file, 'utf8'), lock = acquireExclusiveFileLock(f.file + '.lock', f.file);
  try {
    const started = Date.now(), response = await current.request(1, 'initialize'), elapsed = Date.now() - started;
    assert.equal(response.error.code, -32603); assert.match(response.error.message, /Codex 关联正在更新/);
    assert.ok(elapsed >= 750 && elapsed < 3_000, `connection lock failure must be bounded, elapsed=${elapsed}`);
    assert.equal(fs.readFileSync(f.file, 'utf8'), before);
    assert.equal((await current.request(2, 'tools/list')).error.code, -32002);
    await current.close();
    assert.equal(fs.readFileSync(f.file, 'utf8'), before, 'failed initialization must not publish a connectorStopped update');
  } finally { releaseExclusiveFileLock(lock); }
});

test('a connection version changed while initialize waits is rechecked under the lock', { timeout: 10_000 }, async t => {
  const f = await fixture(t), current = f.start(); await current.ready;
  const lock = acquireExclusiveFileLock(f.file + '.lock', f.file);
  let reply: Promise<any>;
  try {
    reply = current.request(1, 'initialize'); await current.initializing; await delay(100);
    const state = JSON.parse(fs.readFileSync(f.file, 'utf8')); state.connections[0].pluginVersion = 'later-version';
    fs.writeFileSync(f.file, JSON.stringify(state, null, 2) + '\n');
  } finally { releaseExclusiveFileLock(lock); }
  const response = await reply!;
  assert.equal(response.error.code, -32603); assert.match(response.error.message, /连接版本与已安装版本不符/);
  await current.close();
  const stored = JSON.parse(fs.readFileSync(f.file, 'utf8')).connections[0];
  assert.equal(stored.pluginVersion, 'later-version'); assert.equal(stored.status, 'awaiting-desktop'); assert.equal(stored.lastSeenAt, null);
});

test('a connection directory replaced during a real lock wait is rejected before writing through its symlink', { timeout: 10_000 }, async t => {
  const f = await fixture(t), current = f.start('directory-wait'); await current.ready;
  const directory = path.dirname(f.file), retained = directory + '-retained', outside = path.join(f.base, 'outside');
  fs.mkdirSync(outside);
  const before = fs.statSync(outside, { bigint: true }).mtimeNs;
  const lock = acquireExclusiveFileLock(f.file + '.lock', f.file);
  let moved = false;
  try {
    const reply = current.request(1, 'initialize'); await current.lockWaiting;
    fs.renameSync(directory, retained); fs.symlinkSync(outside, directory); moved = true;
    fs.writeFileSync(f.lockGate, 'resume');
    const response = await reply;
    assert.equal(response.error.code, -32603); assert.match(response.error.message, /本机数据目录被替换或不可用/);
    await current.close();
    assert.deepEqual(fs.readdirSync(outside), []);
    assert.equal(fs.statSync(outside, { bigint: true }).mtimeNs, before, 'even temporary lock files must not be written outside the original directory');
  } finally {
    if (moved) { fs.unlinkSync(directory); fs.renameSync(retained, directory); }
    releaseExclusiveFileLock(lock);
  }
});

for (const releaseDuringStop of [true, false]) {
  test('connector stopping ' + (releaseDuringStop ? 'waits for a short write lock' : 'reports a persistent lock failure without remaining ready'), { timeout: 10_000 }, async t => {
    const f = await fixture(t), current = f.start(); await current.ready;
    assert.ok((await current.request(1, 'initialize')).result);
    const before = fs.readFileSync(f.file, 'utf8'), lock = acquireExclusiveFileLock(f.file + '.lock', f.file);
    let released = false;
    try {
      current.child.stdin.end();
      if (releaseDuringStop) {
        await delay(150);
        assert.equal(current.child.exitCode, null);
        assert.equal(fs.readFileSync(f.file, 'utf8'), before);
        releaseExclusiveFileLock(lock); released = true;
        await current.exited;
        assert.equal(JSON.parse(fs.readFileSync(f.file, 'utf8')).connections[0].connectorPid, null);
      } else {
        await assert.rejects(current.exited, /Codex 关联正在更新/);
        assert.equal(fs.readFileSync(f.file, 'utf8'), before, 'a failed stop must preserve the previously stored connector identity');
      }
      assert.equal(f.application.listConnections().connections[0].status, 'awaiting-desktop', 'a connector that has exited cannot be reported ready');
    } finally { if (!released) releaseExclusiveFileLock(lock); }
  });
}

for (const failure of ['connections', 'active-lease'] as const) {
  test(`failed ${failure} publication cannot advertise the still-running failed initialize as ready`, { timeout: 10_000 }, async t => {
    const f = await fixture(t), current = f.start(failure); await current.ready;
    const response = await current.request(1, 'initialize');
    assert.equal(response.error.code, -32603); assert.match(response.error.message, /fixture runtime publication failure/);
    assert.equal(current.child.exitCode, null);
    const runtime = f.repository.readConnectorLeases();
    assert.equal(runtime.owners.length, 1); assert.equal(runtime.owners[0].phase, 'starting');
    assert.equal(f.application.listConnections().connections[0].status, 'awaiting-desktop');
    assert.equal((await current.request(2, 'tools/list')).error.code, -32002);
    await current.close();
    const replacement = f.start(); await replacement.ready;
    assert.ok((await replacement.request(1, 'initialize')).result);
    assert.equal(f.repository.readConnectorLeases().owners.length, 1, 'a dead failed owner is safely removed by the next initialization');
    await replacement.close();
  });
}

test('legacy helpers retain the v1 shape and cannot clear the readiness of active new peers', { timeout: 10_000 }, async t => {
  const f = await fixture(t), current = f.start(); await current.ready;
  assert.ok((await current.request(1, 'initialize')).result);
  const originalKeys = Object.keys(f.repository.readConnections().connections[0]).sort();
  f.repository.mutateConnections(state => { Object.assign(state.connections[0], { status: 'awaiting-desktop', connectorPid: null, safeReason: 'legacy helper stopped' }); });
  assert.equal(f.application.listConnections().connections[0].status, 'ready');
  assert.ok((await current.request(2, 'tools/list')).result.tools.length);
  await current.close();
  assert.equal(f.application.listConnections().connections[0].status, 'awaiting-desktop');
  f.repository.mutateConnections(state => { Object.assign(state.connections[0], { status: 'ready', connectorPid: process.pid }); });
  assert.equal(f.application.listConnections().connections[0].status, 'ready', 'an older active helper without a runtime lease remains compatible');
  assert.deepEqual(Object.keys(f.repository.readConnections().connections[0]).sort(), originalKeys);
});

test('dead and mismatched runtime owners never revive a waiting or explicitly removed connection', async t => {
  const f = await fixture(t);
  f.application.connectorStarted(f.connection.id, CODEX_DESKTOP_PLUGIN_VERSION);
  const valid = f.repository.readConnectorLeases().owners[0];
  f.repository.mutateConnections(state => { Object.assign(state.connections[0], { status: 'awaiting-desktop', connectorPid: null }); });
  for (const change of [{ phase: 'starting' }, { scopeIdentity: 'sha256-' + 'f'.repeat(64) }, { pluginVersion: 'old-version' }, { pluginEntryIdentity: 'sha256-' + 'f'.repeat(64) }]) {
    fs.writeFileSync(f.leasesFile, JSON.stringify({ schemaVersion: 'buildr.codex-desktop-connector-leases/v1', owners: [{ ...valid, ...change }] }));
    assert.equal(f.application.listConnections().connections[0].status, 'awaiting-desktop');
  }
  fs.writeFileSync(f.leasesFile, JSON.stringify({ schemaVersion: 'buildr.codex-desktop-connector-leases/v1', owners: [valid] }));
  assert.equal(f.application.listConnections().connections[0].status, 'ready');
  fs.renameSync(f.home, f.home + '-previous'); fs.mkdirSync(f.home);
  assert.equal(f.application.listConnections().connections[0].status, 'unavailable', 'a matching lease cannot override a changed real configuration scope');
  fs.rmdirSync(f.home); fs.renameSync(f.home + '-previous', f.home);
  f.application.disconnect(f.connection.agentId);
  fs.writeFileSync(f.leasesFile, JSON.stringify({ schemaVersion: 'buildr.codex-desktop-connector-leases/v1', owners: [valid] }));
  assert.equal(f.application.listConnections().connections[0].status, 'disconnected');
  assert.equal((await f.reconnect()).status, 'awaiting-desktop', 'same-version reconnect clears owners from the removed authorization');
  assert.deepEqual(f.repository.readConnectorLeases().owners, []);
});

for (const invalid of ['damaged', 'symlink', 'oversized']) {
  test(`a ${invalid} runtime lease file does not create readiness or get overwritten by initialize`, { timeout: 10_000 }, async t => {
    const f = await fixture(t), current = f.start(); await current.ready;
    const outside = path.join(f.base, 'retained-runtime.json');
    if (invalid === 'symlink') { fs.writeFileSync(outside, fs.readFileSync(f.leasesFile)); fs.rmSync(f.leasesFile); fs.symlinkSync(outside, f.leasesFile); }
    else fs.writeFileSync(f.leasesFile, invalid === 'damaged' ? '{damaged' : ' '.repeat(4 * 1024 * 1024 + 1));
    const before = fs.readFileSync(f.leasesFile), connections = fs.readFileSync(f.file);
    assert.equal(f.application.listConnections().connections[0].status, 'unavailable');
    assert.equal((await current.request(1, 'initialize')).error.code, -32603);
    await current.close();
    assert.deepEqual(fs.readFileSync(f.leasesFile), before); assert.deepEqual(fs.readFileSync(f.file), connections);
    if (invalid === 'symlink') assert.equal(fs.lstatSync(f.leasesFile).isSymbolicLink(), true);
  });
}

test('an abruptly exited owner is ignored without rewriting state and is removed during the next lifecycle write', { timeout: 10_000 }, async t => {
  const f = await fixture(t), current = f.start(); await current.ready;
  assert.ok((await current.request(1, 'initialize')).result);
  const before = fs.readFileSync(f.leasesFile);
  current.child.kill('SIGKILL'); await current.exited.catch(() => {});
  assert.equal(f.application.listConnections().connections[0].status, 'awaiting-desktop');
  assert.deepEqual(fs.readFileSync(f.leasesFile), before, 'read-only liveness checks do not rewrite the runtime file');
  const replacement = f.start(); await replacement.ready;
  assert.ok((await replacement.request(1, 'initialize')).result);
  assert.equal(f.repository.readConnectorLeases().owners.length, 1);
  assert.equal(f.repository.readConnectorLeases().owners[0].pid, replacement.child.pid);
  await replacement.close();
});
