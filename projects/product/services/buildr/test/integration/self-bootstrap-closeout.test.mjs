import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { runDirectSelfBootstrapCloseout, runSelfBootstrapCloseoutCommand } from '../../../../../../skills/buildr-self-bootstrap-sync/scripts/closeout.mjs';
import { DEFAULT_DEVELOPMENT_WEB_PORT } from '../../../../../../skills/buildr-self-bootstrap-sync/scripts/development-web-continuity.mjs';

function run(executable, args, cwd) {
  const result = spawnSync(executable, args, { cwd, encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout || '', stderr: result.stderr || '' };
}

function git(root, ...args) {
  const result = run('git', args, root);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function fixture(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-self-bootstrap-closeout-'));
  const root = path.join(base, 'workspace');
  const remote = path.join(base, 'remote.git');
  fs.mkdirSync(path.join(root, 'components', 'workspace', 'buildr-self-bootstrap'), { recursive: true });
  fs.mkdirSync(path.join(root, 'projects', 'product', 'services', 'buildr', 'resources'), { recursive: true });
  fs.mkdirSync(path.join(root, 'projects', 'product', 'services', 'buildr', 'tools', 'development'), { recursive: true });
  fs.mkdirSync(path.join(root, 'projects', 'product', 'services', 'buildr', 'bin'), { recursive: true });
  fs.mkdirSync(path.join(root, 'projects', 'product', 'services', 'buildr', 'package', 'launchers'), { recursive: true });
  fs.mkdirSync(path.join(root, 'skills', 'generated'), { recursive: true });
  fs.mkdirSync(path.join(root, '.buildr'), { recursive: true });
  const projectBridge = path.join(root, 'projects', 'product', 'buildr');
  const launcher = path.join(root, 'projects', 'product', 'services', 'buildr', 'tools', 'development', 'run-development-cli');
  const cliEntry = path.join(root, 'projects', 'product', 'services', 'buildr', 'bin', 'buildr.mjs');
  const sourceServiceRoot = path.resolve(import.meta.dirname, '../..');
  const defaultBin = path.join(base, 'default-bin');
  fs.writeFileSync(path.join(root, 'components', 'workspace', 'buildr-self-bootstrap', 'component.yml'), 'schemaVersion: buildr.component/v1\nid: buildr-self-bootstrap\n');
  fs.writeFileSync(path.join(root, 'projects', 'product', 'services', 'buildr', 'resources', 'manifest.yml'), 'schemaVersion: buildr.package/v1\n');
  fs.writeFileSync(path.join(root, 'projects', 'product', 'services', 'buildr', 'package.json'), JSON.stringify({ name: '@buildr-ai/buildr', version: '0.1.0-test' }));
  fs.writeFileSync(projectBridge, `#!/bin/sh
exec '${launcher}' "$@"
`, { mode: 0o755 });
  fs.copyFileSync(path.join(sourceServiceRoot, 'tools', 'development', 'run-development-cli'), launcher);
  fs.chmodSync(launcher, 0o755);
  fs.writeFileSync(cliEntry, `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === 'version') console.log(JSON.stringify({ package: '@buildr-ai/buildr', version: '0.1.0-test' }));
else if (args[0] === 'doctor') console.log(JSON.stringify({ health: { ready: true } }));
else if (args[0] === 'task' && args[1] === 'finish' && args[2] === 'run') console.log(JSON.stringify({ status: 'complete', runId: 'closeout-run', resolvedContext: { identity: 'sha256-context' }, resumePreflight: 'passed', doctor: 'ready' }));
else if (args[0] === 'sync') console.log(JSON.stringify({ status: 'synced' }));
else process.exitCode = 2;
`, { mode: 0o755 });
  fs.mkdirSync(path.join(root, 'projects', 'product', 'services', 'buildr', 'node_modules', 'yaml'), { recursive: true });
  fs.writeFileSync(path.join(root, 'projects', 'product', 'services', 'buildr', 'node_modules', 'yaml', 'package.json'), JSON.stringify({ name: 'yaml', version: '0.0.0-test', type: 'module', exports: './index.mjs' }));
  fs.writeFileSync(path.join(root, 'projects', 'product', 'services', 'buildr', 'node_modules', 'yaml', 'index.mjs'), 'export default {};\n');
  fs.writeFileSync(path.join(root, '.gitignore'), 'node_modules/\n.buildr/local/\n');
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '# Self-bootstrap closeout test fixture\n');
  fs.writeFileSync(path.join(root, 'projects', 'manifest.yml'), 'schemaVersion: buildr.projects/v2\nprojects: {}\n');
  fs.writeFileSync(path.join(root, '.buildr', 'workspace.yml'), `schemaVersion: buildr.workspace/v1
id: 123e4567-e89b-42d3-a456-426614174008
name: Self-bootstrap closeout fixture
description: Self-bootstrap closeout fixture
runtime:
  node:
    version: ${process.versions.node}
`);
  fs.writeFileSync(path.join(root, 'projects', 'product', 'services', 'buildr', 'package', 'launchers', 'manage.mjs'), '#!/usr/bin/env node\n', { mode: 0o755 });
  fs.mkdirSync(defaultBin);
  fs.writeFileSync(path.join(defaultBin, 'buildr'), '#!/bin/sh\nexit 97\n', { mode: 0o755 });
  fs.writeFileSync(path.join(root, 'skills', 'generated', 'SKILL.md'), 'v1\n');
  git(root, 'init', '-b', 'dev');
  git(root, 'config', 'user.name', 'Buildr Test');
  git(root, 'config', 'user.email', 'buildr-test@example.com');
  git(root, 'add', '--', '.');
  git(root, 'commit', '-m', 'baseline');
  run('git', ['init', '--bare', remote], base);
  git(root, 'remote', 'add', 'origin', remote);
  git(root, 'push', '-u', 'origin', 'dev');
  const baseRef = git(root, 'rev-parse', 'HEAD');
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  return {
    root,
    remote,
    baseRef,
    projectBridge,
    launcher,
    cliEntry,
    defaultBuildr: path.join(defaultBin, 'buildr'),
    environment: { ...process.env, BUILDR_CLI_INSTALL_DIR: defaultBin, PATH: `${defaultBin}${path.delimiter}${process.env.PATH || ''}` },
  };
}

function executor(root, options = {}) {
  const canonicalRoot = fs.realpathSync(root);
  let finishResumeIndex = 0;
  let successfulPushes = 0;
  let postPushReadbacks = 0;
  return (executable, args, context) => {
    if (executable === 'git') {
      if (args[0] === 'push' && options.failPush) return { status: 1, stdout: '', stderr: 'simulated push failure' };
      if (args[0] === 'ls-remote' && successfulPushes > 0 && postPushReadbacks < (options.failRemoteReadbackAttempts || 0)) {
        postPushReadbacks += 1;
        return { status: 1, stdout: '', stderr: 'simulated transient remote readback failure' };
      }
      const result = run(executable, args, context.cwd);
      if (args[0] === 'push' && result.status === 0) successfulPushes += 1;
      return result;
    }
    const productScript = path.join(canonicalRoot, 'projects', 'product', 'services', 'buildr', 'bin', 'buildr.mjs');
    const projectBridge = path.join(canonicalRoot, 'projects', 'product', 'buildr');
    const launcher = path.join(canonicalRoot, 'projects', 'product', 'services', 'buildr', 'tools', 'development', 'run-development-cli');
    const launcherManager = path.join(canonicalRoot, 'projects', 'product', 'services', 'buildr', 'package', 'launchers', 'manage.mjs');
    const continuityHelper = path.join(canonicalRoot, 'skills', 'buildr-self-bootstrap-sync', 'scripts', 'development-web-continuity.mjs');
    const targetLeaseDriver = path.join(canonicalRoot, 'projects', 'product', 'services', 'buildr', 'src', 'task', 'interfaces', 'internal', 'task-finish-target-lease-driver.mjs');
    const maintenanceDriver = path.join(canonicalRoot, 'projects', 'product', 'services', 'buildr', 'src', 'task', 'interfaces', 'internal', 'task-finish-maintenance-driver.mjs');
    let resolvedExecutable = null;
    try { resolvedExecutable = fs.realpathSync(executable); } catch { /* unexpected commands are handled below */ }
    if (resolvedExecutable === fs.realpathSync(projectBridge)) {
      if (context.env?.BUILDR_INTERNAL_DEVELOPMENT_CLI_IDENTITY_JSON === '1') {
        if (options.failCliInspection) return { status: 1, stdout: '', stderr: 'inspection failed' };
        return {
          status: 0,
          stdout: JSON.stringify({
            schemaVersion: 'buildr.development-cli-identity/v1',
            launcher: options.observedLauncher || launcher,
            cliEntry: options.observedCliEntry || productScript,
            nodeExecutable: options.observedNodeExecutable || process.execPath,
          }),
          stderr: '',
        };
      }
      if (args[0] === 'version') {
        if (options.failCliVersion) return { status: 1, stdout: '', stderr: 'version failed' };
        return { status: 0, stdout: JSON.stringify({
          package: options.observedPackage || '@buildr-ai/buildr',
          version: options.observedVersion || '0.1.0-test',
          channel: options.observedChannel || 'development',
          sourceCommit: options.observedSourceCommit || git(canonicalRoot, 'rev-parse', 'HEAD'),
          runtime: { executable: options.observedVersionNode || process.execPath },
        }), stderr: '' };
      }
      if (args[0] === 'doctor') return { status: 0, stdout: JSON.stringify({ health: { ready: true } }), stderr: '' };
      if (args[0] === 'task') {
        const payload = options.finishResumeResults?.[finishResumeIndex++] || { status: 'complete', runId: 'closeout-run', resolvedContext: { identity: 'sha256-context' }, resumePreflight: 'passed', doctor: 'ready' };
        return { status: 0, stdout: JSON.stringify(payload), stderr: '' };
      }
    }
    if (executable === process.execPath && args[0] === productScript) {
      const productArgs = args.slice(1);
      if (productArgs[0] === 'task' && productArgs[1] === 'inspect') {
        const inspectedTask = productArgs[2];
        if (options.taskInspectionFailures?.includes(inspectedTask)) return { status: 1, stdout: '', stderr: `task inspection failed: ${inspectedTask}` };
        const inspection = options.taskInspections?.[inspectedTask] ?? { record: { status: options.defaultTaskStatus || 'active' } };
        return { status: 0, stdout: JSON.stringify(inspection), stderr: '' };
      }
      if (productArgs[0] === 'task' && productArgs[1] === 'finish' && productArgs[2] === 'inspect') {
        const inspectedRun = productArgs[productArgs.indexOf('--run') + 1];
        if (options.finishInspectionFailures?.includes(inspectedRun)) return { status: 1, stdout: '', stderr: `inspection failed: ${inspectedRun}` };
        const inspection = options.finishInspections?.[inspectedRun] ?? options.finishInspection;
        return { status: 0, stdout: JSON.stringify(inspection), stderr: '' };
      }
      if (productArgs[0] === 'task' && productArgs[1] === 'finish' && productArgs[2] === 'run') {
        const payload = options.finishResumeResults?.[finishResumeIndex++] || { status: 'complete', runId: 'closeout-run', resolvedContext: { identity: 'sha256-context' }, resumePreflight: 'passed', doctor: 'ready' };
        return { status: 0, stdout: JSON.stringify(payload), stderr: '' };
      }
      if (productArgs[0] === 'sync') {
        fs.writeFileSync(path.join(root, 'skills', 'generated', 'SKILL.md'), 'v2\n');
        return { status: options.failSync ? 1 : 0, stdout: '{"status":"synced"}', stderr: options.failSync ? 'sync failed' : '' };
      }
    }
    if (executable === process.execPath && args[0] === targetLeaseDriver) {
      if (options.realTargetLeaseDriver) return run(executable, [options.realTargetLeaseDriver, ...args.slice(1)], context.cwd);
      const action = args[1];
      const value = (name) => args[args.indexOf(name) + 1];
      const targetIdentity = value('--target-identity');
      if (options.targetLeaseHeld && action !== 'release') return {
        status: 1,
        stdout: JSON.stringify({
          schemaVersion: 'buildr.task-finish-target-lease-driver-result/v1', operation: action, status: 'blocked',
          taskId: value('--task'), runId: value('--run'), targetIdentity, resolvedTargetIdentity: targetIdentity, resolution: 'exact', lease: null,
          existing: { taskId: 'foreign-task', runId: 'foreign-run', targetIdentity, expiresAt: new Date(Date.now() + 60_000).toISOString(), expired: false },
        }),
        stderr: '',
      };
      return {
        status: 0,
        stdout: JSON.stringify({
          schemaVersion: 'buildr.task-finish-target-lease-driver-result/v1', operation: action, status: 'passed',
          taskId: value('--task'), runId: value('--run'), targetIdentity, resolvedTargetIdentity: targetIdentity, resolution: 'exact',
          ...(action === 'release' ? { released: true } : { lease: { token: 'self-bootstrap-lease-token', expiresAt: new Date(Date.now() + 900_000).toISOString() }, existing: null }),
        }),
        stderr: '',
      };
    }
    if (executable === process.execPath && args[0] === maintenanceDriver) {
      const value = (name) => args[args.indexOf(name) + 1];
      return {
        status: 0,
        stdout: JSON.stringify({ schemaVersion: 'buildr.task-finish-maintenance-driver-result/v1', operation: 'maintenance', status: 'refreshed', taskId: value('--task'), runId: value('--run'), maintenance: { delivery: 'delivered', activation: 'passed', environmentCleanup: 'pending', diagnostics: 'not-opened' } }),
        stderr: '',
      };
    }
    if (executable === process.execPath && args[0] === launcherManager) {
      if (options.failLauncherInstall) return { status: 1, stdout: '', stderr: 'launcher manager failed' };
      return {
        status: 0,
        stdout: JSON.stringify({
          schemaVersion: 'buildr.launcher-status/v1',
          channel: 'development',
          installed: true,
          target: path.join(canonicalRoot, 'Buildr Web Dev.app'),
          identity: {
            schemaVersion: 'buildr.launcher-identity/v1',
            channel: 'development',
            webPort: DEFAULT_DEVELOPMENT_WEB_PORT,
            source: 'checkout',
            sourceRoot: options.observedLauncherSourceRoot || path.join(canonicalRoot, 'projects', 'product', 'services', 'buildr'),
            developmentRuntime: { executable: options.observedLauncherNode || process.execPath },
            checkout: { head: options.observedLauncherHead || git(canonicalRoot, 'rev-parse', 'HEAD') },
          },
        }),
        stderr: '',
      };
    }
    if (executable === process.execPath && args[0] === continuityHelper) {
      if (args[1] === 'inspect') {
        if (options.failContinuityInspect) return { status: 1, stdout: '', stderr: 'continuity inspection failed' };
        const healthy = options.runningDevelopmentInstance === true;
        return {
          status: 0,
          stdout: JSON.stringify({
            schemaVersion: 'buildr.development-web-continuity/v1',
            action: 'inspect',
            status: healthy ? 'healthy-development' : (options.continuityStatus || 'not-running'),
            reason: healthy ? null : (options.continuityStatus || 'instance-record-absent'),
            instance: healthy ? {
              url: 'http://127.0.0.1:4317',
              port: 4317,
              pid: options.previousDevelopmentPid || 71173,
              launcherIdentity: { channel: 'development' },
              productIdentity: null,
            } : null,
          }),
          stderr: '',
        };
      }
      if (args[1] === 'restart') {
        if (options.occupiedDevelopmentPort) {
          return { status: 1, stdout: '', stderr: JSON.stringify({ code: 'EADDRINUSE', message: `listen EADDRINUSE: 127.0.0.1:${DEFAULT_DEVELOPMENT_WEB_PORT}` }) };
        }
        if (options.failDevelopmentRestart) {
          return { status: 1, stdout: '', stderr: JSON.stringify({ code: 'development-web-continuity.start-timeout', details: { cleanup: { pid: 72200, status: 'requested' } } }) };
        }
        const value = (name) => args[args.indexOf(name) + 1];
        const previousPid = Number(value('--previous-pid'));
        const port = Number(value('--port'));
        const previousPort = Number(value('--previous-port'));
        return {
          status: 0,
          stdout: JSON.stringify({
            schemaVersion: 'buildr.development-web-continuity/v1',
            action: 'restart',
            status: 'passed',
            previous: { pid: previousPid, port: previousPort },
            instance: {
              url: `http://127.0.0.1:${port}`,
              port,
              pid: options.restartedDevelopmentPid || previousPid + 1,
              launcherIdentity: { channel: 'development' },
              productIdentity: null,
            },
            launcherIdentity: {
              schemaVersion: 'buildr.launcher-identity/v1',
              channel: 'development',
              source: 'checkout',
              sourceRoot: options.observedRestartSourceRoot || path.join(canonicalRoot, 'projects', 'product', 'services', 'buildr'),
              developmentRuntime: { executable: options.observedRestartNode || process.execPath },
              checkout: { head: options.observedRestartHead || git(canonicalRoot, 'rev-parse', 'HEAD') },
            },
            cleanup: null,
          }),
          stderr: '',
        };
      }
    }
    return { status: 1, stdout: '', stderr: `unexpected command: ${executable} ${args.join(' ')}` };
  };
}

function directFixture(t) {
  const current = fixture(t);
  fs.appendFileSync(path.join(current.root, 'projects/product/services/buildr/resources/manifest.yml'), '# delivered change\n');
  git(current.root, 'add', '--', 'projects/product/services/buildr/resources/manifest.yml');
  git(current.root, 'commit', '-m', 'delivered product');
  git(current.root, 'push', 'origin', 'dev');
  const deliveredRef = git(current.root, 'rev-parse', 'HEAD');
  const taskId = 'direct-closeout';
  const options = { taskInspections: { [taskId]: { record: { taskId, status: 'completed', result: { summary: 'Delivered.' }, scope: { projects: ['product'] } } } } };
  const input = { workspaceRoot: current.root, taskId, baseRef: current.baseRef, deliveredRef, targetBranch: 'dev', remote: 'origin', agent: 'codex', nodeExecutable: process.execPath, environment: current.environment };
  return { ...current, input, options };
}

test('direct activation uses real Git without Finish and does not repeat a successful push', (t) => {
  const current = directFixture(t);
  const calls = [];
  const perform = executor(current.root, current.options);
  const execute = (exe, args, context) => { calls.push([exe, ...args]); return perform(exe, args, context); };
  const first = runDirectSelfBootstrapCloseout({ ...current.input, execute });
  assert.equal(first.status, 'passed', JSON.stringify(first));
  assert.equal(first.runId, null);
  assert.equal(first.delivery.observed, true);
  assert.equal(calls.some((args) => args.includes('finish') || args.some((arg) => typeof arg === 'string' && arg.endsWith('task-finish-target-lease-driver.mjs'))), false);
  assert.equal(calls.filter((args) => args[0] === 'git' && args[1] === 'push').length, 1);
  calls.length = 0;
  const second = runDirectSelfBootstrapCloseout({ ...current.input, execute });
  assert.equal(second.status, 'passed', JSON.stringify(second));
  assert.equal(calls.filter((args) => args[0] === 'git' && args[1] === 'push').length, 0);
});

test('direct activation resumes only its own committed successor after push failure', (t) => {
  const current = directFixture(t);
  const first = runDirectSelfBootstrapCloseout({ ...current.input, execute: executor(current.root, { ...current.options, failPush: true }) });
  assert.equal(first.status, 'blocked');
  assert.equal(first.diagnostic.code, 'self-bootstrap-closeout.push-failed');
  assert.equal(first.delivery.observed, true);
  const successor = git(current.root, 'rev-parse', 'HEAD');
  assert.notEqual(successor, current.input.deliveredRef);
  const recovered = runDirectSelfBootstrapCloseout({ ...current.input, execute: executor(current.root, current.options) });
  assert.equal(recovered.status, 'passed', JSON.stringify(recovered));
  assert.equal(git(current.root, 'rev-parse', 'HEAD'), successor);
  assert.equal(recovered.phases.some((stage) => stage.id === 'commit'), false);
});

test('direct activation preserves dirty work and rejects incomplete Task before mutation', (t) => {
  const current = directFixture(t);
  fs.writeFileSync(path.join(current.root, 'user-work.txt'), 'keep me\n');
  const blocked = runDirectSelfBootstrapCloseout({ ...current.input, execute: executor(current.root, current.options) });
  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.diagnostic.code, 'self-bootstrap-closeout.workspace-dirty');
  assert.equal(fs.readFileSync(path.join(current.root, 'user-work.txt'), 'utf8'), 'keep me\n');
  const noTask = runDirectSelfBootstrapCloseout({ ...current.input, execute: executor(current.root) });
  assert.equal(noTask.diagnostic.code, 'self-bootstrap-closeout.task-not-completed');
  assert.equal(git(current.root, 'rev-parse', 'HEAD'), current.input.deliveredRef);
});

test('runner 拒绝旧运行输入且不启动外部操作', () => {
  assert.throws(() => runSelfBootstrapCloseoutCommand({ args: ['--run', 'legacy'], execute: () => { throw new Error('must not execute'); } }), (error) => error.code === 'self-bootstrap-closeout.option-unknown');
});

test('直接激活拒绝把带相同标记的合并提交当作自己的待推送后继', (t) => {
  const current = directFixture(t);
  git(current.root, 'switch', '-c', 'other-work');
  fs.writeFileSync(path.join(current.root, 'unrelated.txt'), 'unrelated contribution');
  git(current.root, 'add', '--', 'unrelated.txt');
  git(current.root, 'commit', '-m', 'other contribution');
  git(current.root, 'switch', 'dev');
  git(current.root, 'merge', '--no-ff', 'other-work', '-m', `merge fixture\n\nBuildr-Activation-Task: ${current.input.taskId}\nBuildr-Activation-Delivery: ${current.input.deliveredRef}`);
  const before = git(current.root, 'rev-parse', 'HEAD');
  const result = runDirectSelfBootstrapCloseout({ ...current.input, execute: executor(current.root, current.options) });
  assert.equal(result.status, 'blocked');
  assert.equal(result.diagnostic.code, 'self-bootstrap-closeout.remote-drift');
  assert.equal(git(current.root, 'rev-parse', 'HEAD'), before);
  assert.equal(git(current.root, 'ls-remote', 'origin', 'refs/heads/dev').split(/\s+/)[0], current.input.deliveredRef);
});
