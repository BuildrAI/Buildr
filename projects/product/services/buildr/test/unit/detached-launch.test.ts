import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  buildLaunchdPlistXml,
  launchDetachedProcess,
  parseLaunchctlPrint,
  pruneExitedLaunchdJobs,
  shouldUsePlatformIsolation,
} from '../../src/infrastructure/detached-launch.ts';

test('shouldUsePlatformIsolation 按平台、显式开关与测试环境隔离标志决策', () => {
  assert.equal(shouldUsePlatformIsolation({}, { platform: 'darwin' }), 'launchd');
  assert.equal(shouldUsePlatformIsolation({ XDG_RUNTIME_DIR: '/run/user/1000' }, { platform: 'linux', hasSystemd: () => true }), 'systemd');
  assert.equal(shouldUsePlatformIsolation({ XDG_RUNTIME_DIR: '/run/user/1000' }, { platform: 'linux', hasSystemd: () => false }), 'direct');
  assert.equal(shouldUsePlatformIsolation({}, { platform: 'win32' }), 'direct');

  assert.equal(shouldUsePlatformIsolation({ BUILDR_TEST_STATE_REQUIRED: '1' }, { platform: 'darwin' }), 'direct');
  assert.equal(shouldUsePlatformIsolation({ NODE_TEST_CONTEXT: 'child-v8' }, { platform: 'darwin' }), 'direct');

  assert.equal(shouldUsePlatformIsolation({ BUILDR_DETACHED_ISOLATION: 'off' }, { platform: 'darwin' }), 'direct');
  assert.equal(
    shouldUsePlatformIsolation({ BUILDR_TEST_STATE_REQUIRED: '1', BUILDR_DETACHED_ISOLATION: 'launchd' }, { platform: 'darwin' }),
    'launchd',
  );
  assert.equal(
    shouldUsePlatformIsolation({ BUILDR_TEST_STATE_REQUIRED: '1', BUILDR_DETACHED_ISOLATION: 'systemd' }, { platform: 'linux' }),
    'systemd',
  );
  assert.equal(shouldUsePlatformIsolation({ BUILDR_DETACHED_ISOLATION: 'launchd' }, { platform: 'linux' }), 'direct');
});

test('buildLaunchdPlistXml 生成安全的独立 Interactive plist 并正确转义特殊字符', () => {
  const xml = buildLaunchdPlistXml({
    label: 'ai.buildr.test.job&1',
    programArguments: ['/usr/local/bin/node', '--flag="x"', "a&b<'c'>"],
    workingDirectory: '/tmp/work & space',
    environment: { TOKEN: 'sec&<>"\'ret', OMITTED: undefined },
    standardOutPath: '/tmp/out.log',
    standardErrorPath: '/tmp/err.log',
  });
  assert.match(xml, /<key>RunAtLoad<\/key>\s*<true\/>/);
  assert.match(xml, /<key>KeepAlive<\/key>\s*<false\/>/);
  assert.match(xml, /<key>ProcessType<\/key>\s*<string>Interactive<\/string>/);
  assert.match(xml, /<key>AbandonProcessGroup<\/key>\s*<true\/>/);
  assert.match(xml, /<string>ai\.buildr\.test\.job&amp;1<\/string>/);
  assert.match(xml, /<string>sec&amp;&lt;&gt;&quot;&apos;ret<\/string>/);
  assert.doesNotMatch(xml, /OMITTED/);
});

test('parseLaunchctlPrint 只匹配顶层单制表符字段，忽略嵌套 coalition state', () => {
  const stoppedWithNestedCoalition = [
    'gui/501/ai.buildr.test = {',
    '\tactive count = 0',
    '\tstate = not running',
    '\truns = 1',
    '\tlast exit code = 42',
    '\tlast terminating signal = Terminated: 15',
    '\tresource coalition = {',
    '\t\tID = 99999',
    '\t\tstate = active',
    '\t}',
    '}',
  ].join('\n');
  assert.deepEqual(parseLaunchctlPrint(stoppedWithNestedCoalition), {
    state: 'not running',
    pid: undefined,
    exitCode: 42,
    signal: 'Terminated: 15',
    runs: 1,
  });

  const runningOutput = [
    'gui/501/ai.buildr.live = {',
    '\tstate = running',
    '\tpid = 48123',
    '\truns = 1',
    '\tlast exit code = (never exited)',
    '}',
  ].join('\n');
  assert.deepEqual(parseLaunchctlPrint(runningOutput), {
    state: 'running',
    pid: 48123,
    exitCode: null,
    signal: null,
    runs: 1,
  });
});

test('launchDetachedProcess 在 macOS 先尝试 gui 再回退 user 域，立即清理 staging plist 并移除 IPC 描述符环境', t => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-harness-detached-'));
  t.after(() => fs.rmSync(stateDir, { recursive: true, force: true }));

  const calls: Array<{ file: string; args: string[]; plistSnapshot?: string }> = [];
  let pollPrints = 0;
  const handle = launchDetachedProcess(
    {
      command: '/opt/node/bin/node',
      args: ['entry.mjs', '--port', '9519'],
      cwd: '/tmp/app',
      env: { KEEP: 'yes', NODE_CHANNEL_FD: '3', NODE_CHANNEL_SERIALIZATION_MODE: 'json' },
      labelPrefix: 'harness agent',
      stateDir,
      standardOutPath: path.join(stateDir, 'out.log'),
      standardErrorPath: path.join(stateDir, 'out.log'),
    },
    {
      platform: 'darwin',
      env: { BUILDR_DETACHED_ISOLATION: 'launchd' },
      uid: () => 501,
      runCommand: (file, args) => {
        if (args[0] === 'bootstrap') {
          const plistPath = args[2]!;
          const plistSnapshot = fs.readFileSync(plistPath, 'utf8');
          calls.push({ file, args, plistSnapshot });
          if (args[1] === 'gui/501') return { status: 125, stdout: '', stderr: 'no gui session' };
          return { status: 0, stdout: '', stderr: '' };
        }
        if (args[0] === 'print') {
          calls.push({ file, args });
          pollPrints += 1;
          return { status: 0, stdout: '\tstate = running\n\tpid = 77889\n\truns = 1\n', stderr: '' };
        }
        if (args[0] === 'bootout') {
          calls.push({ file, args });
          return { status: 0, stdout: '', stderr: '' };
        }
        return { status: 0, stdout: '', stderr: '' };
      },
      isPidAlive: pid => pid === 77889,
    },
  );

  assert.equal(handle.isolationMode, 'launchd');
  assert.equal(handle.domainTarget, 'user/501');
  assert.equal(handle.pid, 77889);
  assert.ok(handle.jobLabel?.startsWith('ai.buildr.harness-agent.'));

  const bootstrapUser = calls.find(c => c.args[0] === 'bootstrap' && c.args[1] === 'user/501');
  assert.ok(bootstrapUser?.plistSnapshot);
  assert.doesNotMatch(bootstrapUser.plistSnapshot, /NODE_CHANNEL_FD|NODE_CHANNEL_SERIALIZATION_MODE/);
  assert.match(bootstrapUser.plistSnapshot, /<key>KEEP<\/key>/);

  const remaining = fs.readdirSync(stateDir);
  assert.ok(!remaining.some(name => name.endsWith('.plist')), 'staging plist must be unlinked immediately');
  assert.equal(remaining.filter(name => name.endsWith('.json')).length, 1);

  const recordText = fs.readFileSync(path.join(stateDir, remaining.find(n => n.endsWith('.json'))!), 'utf8');
  assert.doesNotMatch(recordText, /KEEP|TOKEN|SECRET/);

  assert.equal(pollPrints, 1);
  assert.deepEqual(handle.pollStatus(), { running: true, pid: 77889, exitCode: null, signal: null });
  handle.bootout();
  assert.ok(calls.some(c => c.args[0] === 'bootout' && c.args[1] === `user/501/${handle.jobLabel}`));
  assert.equal(fs.readdirSync(stateDir).length, 0);
});

test('launchDetachedProcess 快速退出的 launchd 作业立即结束轮询，全域失败则平滑回退 direct，并支持 Linux systemd mock', t => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-harness-fast-'));
  t.after(() => fs.rmSync(stateDir, { recursive: true, force: true }));

  let sleeps = 0;
  const exitedHandle = launchDetachedProcess(
    { command: '/bin/true', args: [], labelPrefix: 'handoff', stateDir, pollTimeoutMs: 5000, pollIntervalMs: 100 },
    {
      platform: 'darwin',
      env: { BUILDR_DETACHED_ISOLATION: 'launchd' },
      uid: () => 501,
      sleepSync: () => { sleeps += 1; },
      runCommand: (_file, args) => {
        if (args[0] === 'bootstrap') return { status: 0, stdout: '', stderr: '' };
        if (args[0] === 'print') return { status: 0, stdout: '\tstate = not running\n\truns = 1\n\tlast exit code = 0\n', stderr: '' };
        return { status: 0, stdout: '', stderr: '' };
      },
    },
  );
  assert.equal(sleeps, 0);
  assert.equal(exitedHandle.pid, 0);
  assert.deepEqual(exitedHandle.pollStatus(), { running: false, pid: undefined, exitCode: 0, signal: null });

  const fallback = launchDetachedProcess(
    { command: process.execPath, args: ['-e', 'setTimeout(() => {}, 200)'], labelPrefix: 'fallback', env: { BUILDR_DETACHED_ISOLATION: 'launchd' } },
    {
      platform: 'darwin',
      env: { BUILDR_DETACHED_ISOLATION: 'launchd' },
      uid: () => 501,
      runCommand: () => ({ status: 1, stdout: '', stderr: 'bootstrap denied' }),
    },
  );
  assert.equal(fallback.isolationMode, 'direct');
  assert.ok(fallback.pid > 1);
  fallback.bootout();

  const systemdCalls: Array<{ file: string; args: string[] }> = [];
  const systemdHandle = launchDetachedProcess(
    { command: '/usr/bin/node', args: ['srv.mjs'], cwd: '/srv/app', env: { SECRET_X: 'abc' }, labelPrefix: 'linux-srv' },
    {
      platform: 'linux',
      env: { BUILDR_DETACHED_ISOLATION: 'systemd', XDG_RUNTIME_DIR: '/run/user/1000' },
      runCommand: (file, args) => {
        systemdCalls.push({ file, args });
        if (file === 'systemctl' && args.includes('show')) {
          return { status: 0, stdout: 'MainPID=90123\nActiveState=active\nSubState=running\nExecMainStatus=0\n', stderr: '' };
        }
        return { status: 0, stdout: '', stderr: '' };
      },
      isPidAlive: pid => pid === 90123,
    },
  );
  assert.equal(systemdHandle.isolationMode, 'systemd');
  assert.equal(systemdHandle.pid, 90123);
  assert.ok(systemdCalls.some(c => c.file === 'systemd-run' && c.args.includes('--collect') && c.args.includes('--property=KillMode=control-group')));
  systemdHandle.bootout();
  assert.ok(systemdCalls.some(c => c.file === 'systemctl' && c.args.includes('stop')));
});

test('pruneExitedLaunchdJobs 清理已退出和失效作业并保留存活作业', t => {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-harness-prune-'));
  t.after(() => fs.rmSync(stateDir, { recursive: true, force: true }));

  fs.writeFileSync(path.join(stateDir, 'ai.buildr.dead.json'), JSON.stringify({ label: 'ai.buildr.dead', domain: 'gui/501', pid: 1001, createdAtMs: 100 }));
  fs.writeFileSync(path.join(stateDir, 'ai.buildr.live.json'), JSON.stringify({ label: 'ai.buildr.live', domain: 'gui/501', pid: 2002, createdAtMs: 100 }));
  fs.writeFileSync(path.join(stateDir, 'ai.buildr.missing.json'), JSON.stringify({ label: 'ai.buildr.missing', domain: 'gui/501', createdAtMs: 100 }));
  fs.writeFileSync(path.join(stateDir, 'corrupt.json'), '{not-json');

  const bootedOut: string[] = [];
  pruneExitedLaunchdJobs(stateDir, 10_000, {
    now: () => 500,
    isPidAlive: pid => pid === 2002,
    runCommand: (_file, args) => {
      if (args[0] === 'print' && args[1] === 'gui/501/ai.buildr.dead') {
        return { status: 0, stdout: '\tstate = not running\n\truns = 1\n\tlast exit code = 0\n', stderr: '' };
      }
      if (args[0] === 'print' && args[1] === 'gui/501/ai.buildr.live') {
        return { status: 0, stdout: '\tstate = running\n\tpid = 2002\n', stderr: '' };
      }
      if (args[0] === 'print' && args[1] === 'gui/501/ai.buildr.missing') {
        return { status: 113, stdout: '', stderr: 'not found' };
      }
      if (args[0] === 'bootout') {
        bootedOut.push(args[1]!);
        return { status: 0, stdout: '', stderr: '' };
      }
      return { status: 0, stdout: '', stderr: '' };
    },
  });

  assert.deepEqual(bootedOut, ['gui/501/ai.buildr.dead']);
  assert.deepEqual(fs.readdirSync(stateDir), ['ai.buildr.live.json']);
});
