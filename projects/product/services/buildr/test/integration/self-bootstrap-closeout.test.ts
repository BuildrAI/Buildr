import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { runDirectSelfBootstrapCloseout, runSelfBootstrapCloseoutCommand } from '../../../../../../skills/buildr-self-bootstrap-sync/scripts/closeout.mjs';
import { DEFAULT_DEVELOPMENT_WEB_PORT } from '../../../../../../skills/buildr-self-bootstrap-sync/scripts/development-web-continuity.mjs';

function run(executable: any, args: any, cwd: any): any  {
  const result: any = spawnSync(executable, args, { cwd, encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout || '', stderr: result.stderr || '' };
}

function git(root: any, ...args: any[]): any  {
  const result: any = run('git', args, root);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

function fixture(t: any): any  {
  const base: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-self-bootstrap-closeout-'));
  const root: any = path.join(base, 'workspace');
  const remote: any = path.join(base, 'remote.git');
  fs.mkdirSync(path.join(root, 'components', 'workspace', 'buildr-self-bootstrap'), { recursive: true });
  fs.mkdirSync(path.join(root, 'projects', 'product', 'services', 'buildr', 'resources'), { recursive: true });
  fs.mkdirSync(path.join(root, 'projects', 'product', 'services', 'buildr', 'tools', 'development'), { recursive: true });
  fs.mkdirSync(path.join(root, 'projects', 'product', 'services', 'buildr', 'bin'), { recursive: true });
  fs.mkdirSync(path.join(root, 'projects', 'product', 'services', 'buildr', 'tools', 'build', 'launcher'), { recursive: true });
  fs.mkdirSync(path.join(root, 'skills', 'generated'), { recursive: true });
  fs.mkdirSync(path.join(root, '.buildr'), { recursive: true });
  const projectBridge: any = path.join(root, 'projects', 'product', 'buildr');
  const launcher: any = path.join(root, 'projects', 'product', 'services', 'buildr', 'tools', 'development', 'run-development-cli');
  const cliEntry: any = path.join(root, 'projects', 'product', 'services', 'buildr', 'bin', 'buildr.mjs');
  const sourceServiceRoot: any = path.resolve(import.meta.dirname, '../..');
  const defaultBin: any = path.join(base, 'default-bin');
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
  fs.writeFileSync(path.join(root, 'projects', 'product', 'services', 'buildr', 'tools', 'build', 'launcher', 'manage.ts'), '#!/usr/bin/env node\n', { mode: 0o755 });
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
  const baseRef: any = git(root, 'rev-parse', 'HEAD');
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

function executor(root: any, options: any = {}): any  {
  const canonicalRoot: any = fs.realpathSync(root);
  let finishResumeIndex: any = 0;
  let successfulPushes: any = 0;
  let postPushReadbacks: any = 0;
  return (executable: any, args: any, context: any) => {
    if (executable === 'git') {
      if (args[0] === 'push' && options.failPush) return { status: 1, stdout: '', stderr: 'simulated push failure' };
      if (args[0] === 'ls-remote' && successfulPushes > 0 && postPushReadbacks < (options.failRemoteReadbackAttempts || 0)) {
        postPushReadbacks += 1;
        return { status: 1, stdout: '', stderr: 'simulated transient remote readback failure' };
      }
      const result: any = run(executable, args, context.cwd);
      if (args[0] === 'push' && result.status === 0) successfulPushes += 1;
      return result;
    }
    const productScript: any = path.join(canonicalRoot, 'projects', 'product', 'services', 'buildr', 'bin', 'buildr.mjs');
    const projectBridge: any = path.join(canonicalRoot, 'projects', 'product', 'buildr');
    const launcher: any = path.join(canonicalRoot, 'projects', 'product', 'services', 'buildr', 'tools', 'development', 'run-development-cli');
    const launcherManager: any = path.join(canonicalRoot, 'projects', 'product', 'services', 'buildr', 'tools', 'build', 'launcher', 'manage.ts');
    const continuityHelper: any = path.join(canonicalRoot, 'skills', 'buildr-self-bootstrap-sync', 'scripts', 'development-web-continuity.mjs');
    let resolvedExecutable: any = null;
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
        const payload: any = options.finishResumeResults?.[finishResumeIndex++] || { status: 'complete', runId: 'closeout-run', resolvedContext: { identity: 'sha256-context' }, resumePreflight: 'passed', doctor: 'ready' };
        return { status: 0, stdout: JSON.stringify(payload), stderr: '' };
      }
    }
    if (executable === process.execPath && args[0] === productScript) {
      const productArgs: any = args.slice(1);
      if (productArgs[0] === 'task' && productArgs[1] === 'inspect') {
        const inspectedTask: any = productArgs[2];
        if (options.taskInspectionFailures?.includes(inspectedTask)) return { status: 1, stdout: '', stderr: `task inspection failed: ${inspectedTask}` };
        const inspection: any = options.taskInspections?.[inspectedTask] ?? { record: { status: options.defaultTaskStatus || 'active' } };
        return { status: 0, stdout: JSON.stringify(inspection), stderr: '' };
      }
      if (productArgs[0] === 'task' && productArgs[1] === 'finish' && productArgs[2] === 'inspect') {
        const inspectedRun: any = productArgs[productArgs.indexOf('--run') + 1];
        if (options.finishInspectionFailures?.includes(inspectedRun)) return { status: 1, stdout: '', stderr: `inspection failed: ${inspectedRun}` };
        const inspection: any = options.finishInspections?.[inspectedRun] ?? options.finishInspection;
        return { status: 0, stdout: JSON.stringify(inspection), stderr: '' };
      }
      if (productArgs[0] === 'task' && productArgs[1] === 'finish' && productArgs[2] === 'run') {
        const payload: any = options.finishResumeResults?.[finishResumeIndex++] || { status: 'complete', runId: 'closeout-run', resolvedContext: { identity: 'sha256-context' }, resumePreflight: 'passed', doctor: 'ready' };
        return { status: 0, stdout: JSON.stringify(payload), stderr: '' };
      }
      if (productArgs[0] === 'sync') {
        fs.writeFileSync(path.join(root, 'skills', 'generated', 'SKILL.md'), 'v2\n');
        return { status: options.failSync ? 1 : 0, stdout: '{"status":"synced"}', stderr: options.failSync ? 'sync failed' : '' };
      }
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
        const healthy: any = options.runningDevelopmentInstance === true;
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
        const value: any = (name: any) => args[args.indexOf(name) + 1];
        const previousPid: any = Number(value('--previous-pid'));
        const port: any = Number(value('--port'));
        const previousPort: any = Number(value('--previous-port'));
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

function directFixture(t: any): any  {
  const current: any = fixture(t);
  fs.appendFileSync(path.join(current.root, 'projects/product/services/buildr/resources/manifest.yml'), '# delivered change\n');
  git(current.root, 'add', '--', 'projects/product/services/buildr/resources/manifest.yml');
  git(current.root, 'commit', '-m', 'delivered product');
  git(current.root, 'push', 'origin', 'dev');
  const deliveredRef: any = git(current.root, 'rev-parse', 'HEAD');
  const taskId: any = 'direct-closeout';
  const options: any = { taskInspections: { [taskId]: { record: { taskId, status: 'completed', result: { summary: 'Delivered.' }, scope: { projects: ['product'] } } } } };
  const input: any = { workspaceRoot: current.root, taskId, baseRef: current.baseRef, deliveredRef, targetBranch: 'dev', remote: 'origin', agent: 'codex', nodeExecutable: process.execPath, environment: current.environment };
  return { ...current, input, options };
}

test('direct activation uses real Git without Finish and does not repeat a successful push', (t: any) => {
  const current: any = directFixture(t);
  const calls: any[] = [];
  const perform: any = executor(current.root, current.options);
  const execute: any = (exe: any, args: any, context: any) => { calls.push([exe, ...args]); return perform(exe, args, context); };
  const first: any = runDirectSelfBootstrapCloseout({ ...current.input, execute });
  assert.equal(first.status, 'passed', JSON.stringify(first));
  assert.equal(first.runId, null);
  assert.equal(first.delivery.observed, true);
  assert.equal(calls.some((args: any) => args.includes('finish') || args.some((arg: any) => typeof arg === 'string' && arg.endsWith('task-finish-target-lease-driver.mjs'))), false);
  assert.equal(calls.filter((args: any) => args[0] === 'git' && args[1] === 'push').length, 1);
  calls.length = 0;
  const second: any = runDirectSelfBootstrapCloseout({ ...current.input, execute });
  assert.equal(second.status, 'passed', JSON.stringify(second));
  assert.equal(calls.filter((args: any) => args[0] === 'git' && args[1] === 'push').length, 0);
});

test('direct activation resumes only its own committed successor after push failure', (t: any) => {
  const current: any = directFixture(t);
  const first: any = runDirectSelfBootstrapCloseout({ ...current.input, execute: executor(current.root, { ...current.options, failPush: true }) });
  assert.equal(first.status, 'blocked');
  assert.equal(first.diagnostic.code, 'self-bootstrap-closeout.push-failed');
  assert.equal(first.delivery.observed, true);
  const successor: any = git(current.root, 'rev-parse', 'HEAD');
  assert.notEqual(successor, current.input.deliveredRef);
  const recovered: any = runDirectSelfBootstrapCloseout({ ...current.input, execute: executor(current.root, current.options) });
  assert.equal(recovered.status, 'passed', JSON.stringify(recovered));
  assert.equal(git(current.root, 'rev-parse', 'HEAD'), successor);
  assert.equal(recovered.phases.some((stage: any) => stage.id === 'commit'), false);
});

test('direct activation preserves dirty work regardless of Task metadata', (t: any) => {
  const current: any = directFixture(t);
  fs.writeFileSync(path.join(current.root, 'user-work.txt'), 'keep me\n');
  const blocked: any = runDirectSelfBootstrapCloseout({ ...current.input, execute: executor(current.root, current.options) });
  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.diagnostic.code, 'self-bootstrap-closeout.workspace-dirty');
  assert.equal(fs.readFileSync(path.join(current.root, 'user-work.txt'), 'utf8'), 'keep me\n');
  const noTask: any = runDirectSelfBootstrapCloseout({ ...current.input, execute: executor(current.root) });
  assert.equal(noTask.diagnostic.code, 'self-bootstrap-closeout.workspace-dirty');
  assert.equal(git(current.root, 'rev-parse', 'HEAD'), current.input.deliveredRef);
});

test('CLI activates without a Task and never reads or writes Task records', (t: any) => {
  const current: any = directFixture(t);
  const calls: any[] = [];
  const perform = executor(current.root);
  const result: any = runSelfBootstrapCloseoutCommand({
    args: ['--target', current.root, '--base-ref', current.baseRef, '--delivered-ref', current.input.deliveredRef,
      '--branch', 'dev', '--remote', 'origin', '--agent', 'codex', '--node-executable', process.execPath],
    environment: current.environment,
    execute: (command: any, args: any, context: any) => { calls.push(args); return perform(command, args, context); },
  });
  assert.equal(result.status, 'passed', JSON.stringify(result));
  assert.equal(result.taskId, null);
  assert.equal(calls.some(args => args.includes('task')), false);
  assert.equal(fs.readFileSync(path.join(current.root, 'skills/generated/SKILL.md'), 'utf8'), 'v2\n');
});

test('an optional unfinished or unavailable Task does not gate activation', (t: any) => {
  const current: any = directFixture(t);
  const calls: any[] = [];
  const perform = executor(current.root, { taskInspectionFailures: [current.input.taskId] });
  const result: any = runDirectSelfBootstrapCloseout({ ...current.input,
    execute: (command: any, args: any, context: any) => { calls.push(args); return perform(command, args, context); } });
  assert.equal(result.status, 'passed', JSON.stringify(result));
  assert.equal(calls.some(args => args.includes('task')), false);
});

test('taskless recovery binds the delivery inputs and ignores optional Task annotation', (t: any) => {
  const current: any = directFixture(t);
  const input = { ...current.input, taskId: null };
  const first: any = runDirectSelfBootstrapCloseout({ ...input, execute: executor(current.root, { failPush: true }) });
  assert.equal(first.diagnostic.code, 'self-bootstrap-closeout.push-failed');
  const successor = git(current.root, 'rev-parse', 'HEAD');
  const mismatched: any = runDirectSelfBootstrapCloseout({ ...input, baseRef: input.deliveredRef, execute: executor(current.root) });
  // An empty scope needs no activation and cannot push the pending successor.
  assert.equal(mismatched.status, 'not-applicable');
  assert.equal(git(current.root, 'ls-remote', 'origin', 'refs/heads/dev').split(/\s+/)[0], input.deliveredRef);
  const wrongHost: any = runDirectSelfBootstrapCloseout({ ...input, agent: 'claude-code', execute: executor(current.root) });
  assert.equal(wrongHost.diagnostic.code, 'self-bootstrap-closeout.remote-drift');
  const recovered: any = runDirectSelfBootstrapCloseout({ ...input, taskId: 'optional-note', execute: executor(current.root) });
  assert.equal(recovered.status, 'passed', JSON.stringify(recovered));
  assert.equal(git(current.root, 'rev-parse', 'HEAD'), successor);
  assert.equal(recovered.phases.some((stage: any) => ['sync', 'commit'].includes(stage.id)), false);
});

for (const changedPath of ['AGENTS.md', 'projects/product/AGENTS.md', 'rules/manifest.yml', 'components/workspace/buildr-self-bootstrap/contributions/task-finish.md']) {
  test(`taskless ${changedPath} changes trigger projection`, (t: any) => {
    const current: any = fixture(t);
    const file = path.join(current.root, changedPath);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, '\nupdated instruction\n');
    git(current.root, 'add', '--', changedPath);
    git(current.root, 'commit', '-m', 'update instruction');
    git(current.root, 'push', 'origin', 'dev');
    const result: any = runDirectSelfBootstrapCloseout({ workspaceRoot: current.root, baseRef: current.baseRef,
      deliveredRef: git(current.root, 'rev-parse', 'HEAD'), targetBranch: 'dev', remote: 'origin', agent: 'codex',
      nodeExecutable: process.execPath, environment: current.environment, execute: executor(current.root) });
    assert.equal(result.status, 'passed', JSON.stringify(result));
    assert.ok(result.phases.some((stage: any) => stage.id === 'sync'));
  });
}

test('unrelated documentation does not activate or access Task records', (t: any) => {
  const current: any = fixture(t);
  fs.writeFileSync(path.join(current.root, 'notes.md'), 'Unrelated documentation.\n');
  git(current.root, 'add', '--', 'notes.md');
  git(current.root, 'commit', '-m', 'documentation');
  git(current.root, 'push', 'origin', 'dev');
  const calls: any[] = [];
  const perform = executor(current.root);
  const result: any = runDirectSelfBootstrapCloseout({ workspaceRoot: current.root, baseRef: current.baseRef,
    deliveredRef: git(current.root, 'rev-parse', 'HEAD'), targetBranch: 'dev', remote: 'origin', agent: 'codex',
    nodeExecutable: process.execPath, environment: current.environment,
    execute: (command: any, args: any, context: any) => { calls.push(args); return perform(command, args, context); } });
  assert.equal(result.status, 'not-applicable');
  assert.equal(calls.some(args => args.includes('sync') || args.includes('task') || args[0] === 'push'), false);
});

test('taskless activation rejects a delivery absent from the remote', (t: any) => {
  const current: any = fixture(t);
  fs.appendFileSync(path.join(current.root, 'skills/generated/SKILL.md'), 'unpublished\n');
  git(current.root, 'add', '--', 'skills/generated/SKILL.md');
  git(current.root, 'commit', '-m', 'not delivered');
  const head = git(current.root, 'rev-parse', 'HEAD');
  const result: any = runDirectSelfBootstrapCloseout({ workspaceRoot: current.root, baseRef: current.baseRef,
    deliveredRef: head, targetBranch: 'dev', remote: 'origin', agent: 'codex',
    nodeExecutable: process.execPath, environment: current.environment, execute: executor(current.root) });
  assert.equal(result.diagnostic.code, 'self-bootstrap-closeout.delivery-unconfirmed');
  assert.equal(result.delivery.observed, false);
  assert.equal(git(current.root, 'rev-parse', 'HEAD'), head);
  assert.equal(result.phases.some((stage: any) => ['sync', 'commit', 'push'].includes(stage.id)), false);
});

test('legacy task-marked pending successors remain recoverable', (t: any) => {
  const current: any = directFixture(t);
  const first: any = runDirectSelfBootstrapCloseout({ ...current.input, execute: executor(current.root, { failPush: true }) });
  assert.equal(first.diagnostic.code, 'self-bootstrap-closeout.push-failed');
  git(current.root, 'commit', '--amend', '-m', `Legacy activation\n\nBuildr-Activation-Task: ${current.input.taskId}\nBuildr-Activation-Delivery: ${current.input.deliveredRef}`);
  const legacyHead = git(current.root, 'rev-parse', 'HEAD');
  const result: any = runDirectSelfBootstrapCloseout({ ...current.input, execute: executor(current.root) });
  assert.equal(result.status, 'passed', JSON.stringify(result));
  assert.equal(git(current.root, 'rev-parse', 'HEAD'), legacyHead);
  assert.equal(result.phases.some((stage: any) => ['sync', 'commit'].includes(stage.id)), false);
});

test('runner 拒绝旧运行输入且不启动外部操作', () => {
  assert.throws(() => runSelfBootstrapCloseoutCommand({ args: ['--run', 'legacy'], execute: () => { throw new Error('must not execute'); } }), (error: any) => error.code === 'self-bootstrap-closeout.option-unknown');
});

test('直接激活拒绝把带相同标记的合并提交当作自己的待推送后继', (t: any) => {
  const current: any = directFixture(t);
  git(current.root, 'switch', '-c', 'other-work');
  fs.writeFileSync(path.join(current.root, 'unrelated.txt'), 'unrelated contribution');
  git(current.root, 'add', '--', 'unrelated.txt');
  git(current.root, 'commit', '-m', 'other contribution');
  git(current.root, 'switch', 'dev');
  git(current.root, 'merge', '--no-ff', 'other-work', '-m', `merge fixture\n\nBuildr-Activation-Task: ${current.input.taskId}\nBuildr-Activation-Delivery: ${current.input.deliveredRef}`);
  const before: any = git(current.root, 'rev-parse', 'HEAD');
  const result: any = runDirectSelfBootstrapCloseout({ ...current.input, execute: executor(current.root, current.options) });
  assert.equal(result.status, 'blocked');
  assert.equal(result.diagnostic.code, 'self-bootstrap-closeout.remote-drift');
  assert.equal(git(current.root, 'rev-parse', 'HEAD'), before);
  assert.equal(git(current.root, 'ls-remote', 'origin', 'refs/heads/dev').split(/\s+/)[0], current.input.deliveredRef);
});

test('workspace-owned release Skill changes activate the same retained projection runner', (t: any) => {
  const current: any = fixture(t);
  const skill = path.join(current.root, 'skills', 'buildr-release', 'SKILL.md');
  fs.mkdirSync(path.dirname(skill), { recursive: true });
  fs.writeFileSync(skill, '---\nname: buildr-release\ndescription: Release fixture\n---\nRelease flow.\n');
  git(current.root, 'add', '--', 'skills/buildr-release/SKILL.md');
  git(current.root, 'commit', '-m', 'deliver release Skill');
  git(current.root, 'push', 'origin', 'dev');
  const deliveredRef = git(current.root, 'rev-parse', 'HEAD');
  const taskId = 'release-skill-delivery';
  const performed: any[] = [];
  const execute = executor(current.root, { taskInspections: { [taskId]: { record: { taskId, status: 'completed', result: { summary: 'Delivered release Skill.' }, scope: { projects: ['product'] } } } } });
  const result: any = runDirectSelfBootstrapCloseout({ workspaceRoot: current.root, taskId, baseRef: current.baseRef, deliveredRef, targetBranch: 'dev', remote: 'origin', agent: 'codex', nodeExecutable: process.execPath, environment: current.environment,
    execute: (command: any, args: any, context: any) => { performed.push(args); return execute(command, args, context); } });
  assert.equal(result.status, 'passed', JSON.stringify(result));
  assert.ok(performed.some(args => args.includes('sync')));
  assert.equal(fs.readFileSync(path.join(current.root, 'skills', 'generated', 'SKILL.md'), 'utf8'), 'v2\n');
});
