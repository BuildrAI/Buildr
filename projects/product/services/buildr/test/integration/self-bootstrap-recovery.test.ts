import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import test from 'node:test';
import { runDirectSelfBootstrapCloseout } from '../../../../../../skills/buildr-self-bootstrap-sync/scripts/closeout.mjs';
import { restartDevelopmentInstance, inspectDevelopmentInstance } from '../../../../../../skills/buildr-self-bootstrap-sync/scripts/development-web-continuity.mjs';
import { git, executor, createSelfBootstrapCloseoutFixtures } from '../helpers/self-bootstrap-closeout-fixture.ts';

const { fixture, runtimeRecoveryFixture } = createSelfBootstrapCloseoutFixtures();

test('a projected closeout script loads runtime policy from the explicit product root', async t => {
  const f = fixture(t), projected = path.join(path.dirname(f.root), 'agent-runtime', 'closeout.mjs');
  fs.mkdirSync(path.dirname(projected), { recursive: true });
  fs.copyFileSync(path.resolve(import.meta.dirname, '../../../../../../skills/buildr-self-bootstrap-sync/scripts/closeout.mjs'), projected);
  fs.copyFileSync(path.resolve(import.meta.dirname, '../../../../../../skills/buildr-self-bootstrap-sync/scripts/development-web-continuity.mjs'), path.join(path.dirname(projected), 'development-web-continuity.mjs'));
  fs.copyFileSync(path.resolve(import.meta.dirname, '../../../../../../skills/buildr-self-bootstrap-sync/scripts/detached-launch.mjs'), path.join(path.dirname(projected), 'detached-launch.mjs'));
  fs.copyFileSync(path.resolve(import.meta.dirname, '../../../../../../skills/buildr-self-bootstrap-sync/scripts/dsh-development-plugin.mjs'), path.join(path.dirname(projected), 'dsh-development-plugin.mjs'));
  fs.copyFileSync(path.resolve(import.meta.dirname, '../../../../../../skills/buildr-self-bootstrap-sync/scripts/dsh-desktop-continuity.mjs'), path.join(path.dirname(projected), 'dsh-desktop-continuity.mjs'));
  const { runDirectSelfBootstrapCloseout: runProjected } = await import((await import('node:url')).pathToFileURL(projected).href);
  fs.writeFileSync(path.join(f.root, 'README.md'), 'documentation\n');
  git(f.root, 'add', '.'); git(f.root, 'commit', '-m', 'documentation'); git(f.root, 'push', 'origin', 'dev');
  const result = runProjected({ workspaceRoot: f.root, baseRef: f.baseRef, deliveredRef: git(f.root, 'rev-parse', 'HEAD'), targetBranch: 'dev', remote: 'origin', agent: 'codex', nodeExecutable: process.execPath, environment: f.environment, execute: executor(f.root) });
  assert.equal(result.status, 'not-applicable', JSON.stringify(result));
});

test('a restarted instance with a different runtime proof cannot pass closeout', t => {
  const f = fixture(t), file = path.join(f.root, 'projects/product/services/buildr/package-lock.json');
  fs.writeFileSync(file, '{}\n'); git(f.root, 'add', '.'); git(f.root, 'commit', '-m', 'dependency change'); git(f.root, 'push', 'origin', 'dev');
  const result = runDirectSelfBootstrapCloseout({ workspaceRoot: f.root, baseRef: f.baseRef, deliveredRef: git(f.root, 'rev-parse', 'HEAD'), targetBranch: 'dev', remote: 'origin', agent: 'codex', nodeExecutable: process.execPath, environment: f.environment, execute: executor(f.root, { runningDevelopmentInstance: true, observedRestartRuntimeIdentity: 'sha256-' + '0'.repeat(64) }) });
  assert.equal(result.diagnostic?.code, 'self-bootstrap-closeout.development-web-restart-identity-mismatch');
  assert.equal(result.phases.some((phase: any) => phase.id === 'finalize'), false);
});

for (const [options, code] of [
  [{ failLauncherInstall: true }, 'self-bootstrap-closeout.local-app-install-failed'],
  [{ observedLauncherHead: '0'.repeat(40) }, 'self-bootstrap-closeout.local-app-identity-mismatch'],
] as const) {
  test(`failed update preserves the running app: ${code}`, t => {
    const f = runtimeRecoveryFixture(t), calls: string[][] = [];
    const perform = executor(f.root, { runningDevelopmentInstance: true, ...options });
    const result = runDirectSelfBootstrapCloseout({ ...f.input, execute: (command: string, args: string[], context: any) => {
      calls.push(args); return perform(command, args, context);
    } });
    assert.equal(result.status, 'blocked');
    assert.partialDeepStrictEqual(result.diagnostic, { code: code });
    assert.partialDeepStrictEqual(result.diagnostic, { details: { developmentWebRecovery: { disposition: 'preserved' } } });
    assert.partialDeepStrictEqual(result.diagnostic, { details: { developmentWebRecovery: { instance: { pid: 71173 } } } });
    assert.equal(calls.some(args => args.includes('restart')), false);
    assert.equal(fs.existsSync(f.pending), false);
  });
}

for (const badDevelopmentPage of [true, 'missing']) {
  test(`failed installation cannot clear pending on healthy identity with ${badDevelopmentPage} page evidence`, t => {
    const f = runtimeRecoveryFixture(t);
    const perform = executor(f.root, { runningDevelopmentInstance: true, failLauncherInstall: true, badDevelopmentPage: true });
    const result = runDirectSelfBootstrapCloseout({ ...f.input, execute: (executable: string, args: string[], context: any) => {
      const output = perform(executable, args, context);
      if (badDevelopmentPage === 'missing' && args[1] === 'inspect') {
        const payload = JSON.parse(output.stdout); delete payload.pageVerification; output.stdout = JSON.stringify(payload);
      }
      return output;
    } });
    assert.equal(result.status, 'blocked');
    assert.equal(result.diagnostic?.code, 'self-bootstrap-closeout.local-app-install-failed');
    assert.partialDeepStrictEqual(result.diagnostic, { details: { developmentWebRecovery: {
      status: 'failed', code: 'self-bootstrap-closeout.development-web-recovery-page-failed', pending: path.join(fs.realpathSync(f.root), '.buildr/local/self-bootstrap-development-web-recovery.json'),
    } } });
    assert.equal(fs.existsSync(f.pending), true);
    assert.doesNotMatch(result.diagnostic!.message, /已确认运行/);
  });
}

test('failed restart retains the recovery obligation and a fresh invocation restores an absent instance', t => {
  const f = runtimeRecoveryFixture(t);
  const failed = runDirectSelfBootstrapCloseout({ ...f.input, execute: executor(f.root, { runningDevelopmentInstance: true, failDevelopmentRestart: true }) });
  assert.equal(failed.status, 'blocked');
  assert.partialDeepStrictEqual(failed.diagnostic, { details: { developmentWebRecovery: { status: 'failed' } } });
  assert.equal(JSON.parse(fs.readFileSync(f.pending, 'utf8')).continuity.instance.pid, 71173);
  const calls: string[][] = [], perform = executor(f.root);
  const recovered = runDirectSelfBootstrapCloseout({ ...f.input, execute: (command: string, args: string[], context: any) => {
    calls.push(args); return perform(command, args, context);
  } });
  assert.equal(recovered.status, 'passed', JSON.stringify(recovered));
  const restart = calls.find(args => args[1] === 'restart')!;
  assert.equal(restart[restart.indexOf('--previous-pid') + 1], '71173');
  assert.equal(fs.existsSync(f.pending), false);
  assert.equal(recovered.phases.find((p: any) => p.id === 'install-buildr-web').effects[0].status, 'passed');
});

test('a transient restart failure recovers immediately while retaining the original update failure', t => {
  const f = runtimeRecoveryFixture(t);
  const result = runDirectSelfBootstrapCloseout({ ...f.input, execute: executor(f.root, { runningDevelopmentInstance: true, developmentRestartFailures: 1 }) });
  assert.equal(result.status, 'blocked');
  assert.partialDeepStrictEqual(result.diagnostic, { code: 'self-bootstrap-closeout.development-web-restart-failed' });
  assert.partialDeepStrictEqual(result.diagnostic, { details: { developmentWebRecovery: { status: 'passed' } } });
  assert.partialDeepStrictEqual(result.diagnostic, { details: { developmentWebRecovery: { instance: { pid: 71174 } } } });
  assert.equal(fs.existsSync(f.pending), false);
});

test('an installation failure on retry still restores the app from the persisted obligation', t => {
  const f = runtimeRecoveryFixture(t);
  runDirectSelfBootstrapCloseout({ ...f.input, execute: executor(f.root, { runningDevelopmentInstance: true, failDevelopmentRestart: true }) });
  assert.equal(fs.existsSync(f.pending), true);
  const result = runDirectSelfBootstrapCloseout({ ...f.input, execute: executor(f.root, { failLauncherInstall: true }) });
  assert.partialDeepStrictEqual(result.diagnostic, { code: 'self-bootstrap-closeout.local-app-install-failed' });
  assert.partialDeepStrictEqual(result.diagnostic, { details: { developmentWebRecovery: { status: 'passed' } } });
  assert.equal(fs.existsSync(f.pending), false);
});

test('an invalid recovery obligation is preserved and cannot trigger installation or restart', t => {
  const f = runtimeRecoveryFixture(t);
  fs.mkdirSync(path.dirname(f.pending), { recursive: true }); fs.writeFileSync(f.pending, '{broken');
  const calls: string[][] = [], perform = executor(f.root);
  const result = runDirectSelfBootstrapCloseout({ ...f.input, execute: (command: string, args: string[], context: any) => {
    calls.push(args); return perform(command, args, context);
  } });
  assert.partialDeepStrictEqual(result.diagnostic, { code: 'self-bootstrap-closeout.development-web-recovery-invalid' });
  assert.equal(fs.readFileSync(f.pending, 'utf8'), '{broken');
  assert.equal(calls.some(args => ['install', 'restart'].includes(args[1])), false);
});

test('a recovery obligation cannot switch its application data root during retry', t => {
  const f = runtimeRecoveryFixture(t);
  runDirectSelfBootstrapCloseout({ ...f.input, execute: executor(f.root, { runningDevelopmentInstance: true, failDevelopmentRestart: true }) });
  const before = fs.readFileSync(f.pending, 'utf8'), calls: string[][] = [], perform = executor(f.root);
  const result = runDirectSelfBootstrapCloseout({ ...f.input,
    environment: { ...f.environment, BUILDR_APP_DATA_DIR: path.join(f.root, '.buildr/local/other-app') },
    execute: (command: string, args: string[], context: any) => { calls.push(args); return perform(command, args, context); } });
  assert.partialDeepStrictEqual(result.diagnostic, { code: 'self-bootstrap-closeout.development-web-recovery-root-mismatch' });
  assert.equal(fs.readFileSync(f.pending, 'utf8'), before);
  assert.equal(calls.some(args => ['install', 'restart'].includes(args[1])), false);
});

test('changed recovery metadata is preserved without denying that the app recovered', t => {
  const f = runtimeRecoveryFixture(t), perform = executor(f.root, { runningDevelopmentInstance: true });
  let changed = '';
  const result = runDirectSelfBootstrapCloseout({ ...f.input, execute: (command: string, args: string[], context: any) => {
    const output = perform(command, args, context);
    if (args[1] === 'restart') {
      const pending = JSON.parse(fs.readFileSync(f.pending, 'utf8'));
      pending.continuity.instance.pid += 100;
      changed = JSON.stringify(pending); fs.writeFileSync(f.pending, changed);
    }
    return output;
  } });
  assert.partialDeepStrictEqual(result.diagnostic, { code: 'self-bootstrap-closeout.development-web-recovery-changed' });
  assert.partialDeepStrictEqual(result.diagnostic, { details: { developmentWebRecovery: { status: 'passed' } } });
  assert.partialDeepStrictEqual(result.diagnostic, { details: { developmentWebRecovery: { cleanup: { status: 'failed' } } } });
  assert.equal(fs.readFileSync(f.pending, 'utf8'), changed);
});

for (const failFirstStart of [false, true]) {
  test(`real isolated development process recovers and is reused after handoff (first start fails: ${failFirstStart})`, async t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-web-continuity-'));
    const dataRoot = path.join(directory, 'data'), sourceRoot = path.join(directory, 'source');
    fs.mkdirSync(dataRoot); fs.mkdirSync(sourceRoot);
    const identity = { schemaVersion: 'buildr.launcher-identity/v1', channel: 'development', source: 'checkout',
      sourceRoot, developmentRuntime: { executable: process.execPath }, checkout: { head: 'a'.repeat(40) } };
    const identityFile = path.join(directory, 'identity.json'); fs.writeFileSync(identityFile, JSON.stringify(identity));
    const configFile = path.join(directory, 'config.json'), instanceFile = path.join(dataRoot, 'instance.json');
    const oldProof = `sha256-${'1'.repeat(64)}`, newProof = `sha256-${'2'.repeat(64)}`;
    const configure = (proof: string) => fs.writeFileSync(configFile, JSON.stringify({ dataRoot, identity, proof }));
    configure(oldProof);
    const children: ReturnType<typeof spawn>[] = [];
    const serverProgram = `
      const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
      const config = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
      const file = path.join(config.dataRoot, 'instance.json'), secret = 'isolated-secret';
      const server = http.createServer((request, response) => {
        if (request.url === '/') {
          if (request.headers['x-buildr-instance']) { response.writeHead(403).end(); return; }
          response.setHeader('content-type', 'text/html');
          response.end('<html><head><link rel="stylesheet" href="/assets/app.css"></head><body><div id="root"></div><script type="module" src="/assets/app.js"></script></body></html>'); return;
        }
        if (request.url === '/assets/app.js' || request.url === '/assets/app.css') {
          if (request.headers['x-buildr-instance']) { response.writeHead(403).end(); return; }
          response.setHeader('content-type', request.url.endsWith('.js') ? 'text/javascript' : 'text/css');
          response.end(request.url.endsWith('.js') ? 'export {};' : 'body {}'); return;
        }
        if (request.headers['x-buildr-instance'] !== secret) { response.writeHead(403).end(); return; }
        if (request.url === '/api/v1/app/quit-instance' && request.method === 'POST') {
          response.writeHead(202).end(); setImmediate(() => server.close(() => {
            if (JSON.parse(fs.readFileSync(file, 'utf8')).pid === process.pid) fs.unlinkSync(file);
          })); return;
        }
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ schemaVersion: 'buildr.local-app-health/v1', status: 'ready', pid: process.pid, launcherIdentity: config.identity, productIdentity: { developmentRuntimeIdentity: config.proof } }));
      });
      server.listen(0, '127.0.0.1', () => fs.writeFileSync(file, JSON.stringify({
        url: 'http://127.0.0.1:4458', testingUrl: 'http://127.0.0.1:' + server.address().port,
        pid: process.pid, secret, launcherIdentity: config.identity, productIdentity: { developmentRuntimeIdentity: config.proof }
      })));
    `;
    const launch = () => {
      const child = spawn(process.execPath, ['-e', serverProgram, configFile], { stdio: 'ignore' }); children.push(child); return child;
    };
    t.after(async () => {
      await Promise.all(children.map(child => new Promise<void>(resolve => {
        if (child.exitCode !== null || child.signalCode !== null) return resolve();
        child.once('exit', () => resolve()); child.kill('SIGKILL');
      })));
      fs.rmSync(directory, { recursive: true, force: true });
    });
    const previous = launch();
    assert.ok(previous.pid);
    for (let attempt = 0; !fs.existsSync(instanceFile) && attempt < 100; attempt++) await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(fs.existsSync(instanceFile), true);
    // Only this isolated receipt is routed to its ephemeral HTTP listener.
    // The everyday development port is never contacted or occupied.
    const fetchImpl: typeof fetch = async (url: any, options: any) => {
      const state = JSON.parse(fs.readFileSync(instanceFile, 'utf8'));
      const response = await fetch(new URL(new URL(url).pathname, state.testingUrl), options);
      // The explicit test transport maps the logical instance origin to its
      // ephemeral listener; do not present that mapping as a server redirect.
      return new Response(response.body, { status: response.status, headers: response.headers });
    };
    configure(newProof);
    let attempts = 0;
    const input = { projectBridge: path.join(directory, 'buildr'), launcherIdentityPath: identityFile,
      expectedSourceRoot: sourceRoot, expectedHead: identity.checkout.head, expectedRuntimeIdentity: newProof,
      nodeExecutable: process.execPath, previousPid: previous.pid, dataRoot, fetchImpl, releasePort: async () => [],
      spawnImpl: (_program: any, args: any) => {
        assert.deepEqual(args, ['web', '--port', '4458', '--no-open']);
        attempts++;
        if (failFirstStart && attempts === 1) {
          const child = spawn(process.execPath, ['-e', 'process.exit(1)'], { stdio: 'ignore' }); children.push(child); return child;
        }
        return launch();
      } };
    const beforeInvalid = attempts;
    await assert.rejects(restartDevelopmentInstance({ ...input, previousPid: 0, timeoutMs: 2000 }), /Invalid previous Development Web PID/);
    assert.equal(attempts, beforeInvalid);
    assert.equal(attempts, 0);
    assert.equal((await inspectDevelopmentInstance({ dataRoot, fetchImpl })).instance?.pid, previous.pid);
    if (failFirstStart) await assert.rejects(restartDevelopmentInstance({ ...input, timeoutMs: 300 }), (error: any) => error.code === 'development-web-continuity.start-timeout');
    const result = await restartDevelopmentInstance({ ...input, timeoutMs: 2000 });
    assert.equal(result.status, 'passed'); assert.ok(result.instance); assert.notEqual(result.instance.pid, previous.pid);
    assert.equal((await inspectDevelopmentInstance({ dataRoot, fetchImpl })).status, 'healthy-development');
    const beforeReuse = attempts;
    const reused = await restartDevelopmentInstance({ ...input, timeoutMs: 2000 });
    assert.equal(reused.disposition, 'reused'); assert.ok(reused.instance); assert.equal(reused.instance.pid, result.instance.pid);
    assert.equal(attempts, beforeReuse);
    const forced = await restartDevelopmentInstance({ ...input, previousPid: result.instance.pid, forceRestart: true, timeoutMs: 2000 });
    assert.equal(forced.status, 'passed');
    assert.notEqual(forced.instance?.pid, result.instance.pid);
    assert.equal(attempts, beforeReuse + 1);
    assert.equal((await inspectDevelopmentInstance({ dataRoot, fetchImpl })).instance?.pid, forced.instance?.pid);
  });
}
