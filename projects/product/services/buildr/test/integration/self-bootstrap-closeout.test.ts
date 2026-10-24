import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import test from 'node:test';
import { runDirectSelfBootstrapCloseout, runSelfBootstrapCloseoutCommand, SELF_BOOTSTRAP_SYNC_RESUME_SCHEMA } from '../../../../../../skills/buildr-self-bootstrap-sync/scripts/closeout.mjs';
import { DEFAULT_DEVELOPMENT_WEB_PORT, restartDevelopmentInstance, inspectDevelopmentInstance } from '../../../../../../skills/buildr-self-bootstrap-sync/scripts/development-web-continuity.mjs';
import { parseTaskCommitTrailer } from '../../src/modules/task/commits/domain/task-commit.ts';
import { readDevelopmentRuntimeIdentity } from '../../src/modules/installation/infrastructure/development-runtime-inputs.ts';

function run(executable: any, args: any, cwd: any, binary = false): any  {
  const result: any = spawnSync(executable, args, { cwd, encoding: binary ? null : 'utf8' });
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
  fs.mkdirSync(path.join(root, 'skills/buildr-self-bootstrap-sync/scripts'), { recursive: true });
  fs.copyFileSync(path.resolve(import.meta.dirname, '../../../../../../skills/buildr-self-bootstrap-sync/scripts/development-web-continuity.mjs'), path.join(root, 'skills/buildr-self-bootstrap-sync/scripts/development-web-continuity.mjs'));
  fs.mkdirSync(path.join(root, '.buildr'), { recursive: true });
  const projectBridge: any = path.join(root, 'projects', 'product', 'buildr');
  const launcher: any = path.join(root, 'projects', 'product', 'services', 'buildr', 'tools', 'development', 'run-development-cli');
  const cliEntry: any = path.join(root, 'projects', 'product', 'services', 'buildr', 'bin', 'buildr.mjs');
  const sourceServiceRoot: any = path.resolve(import.meta.dirname, '../..');
  const policy = 'src/modules/installation/infrastructure/development-runtime-inputs.ts';
  fs.mkdirSync(path.dirname(path.join(root, 'projects/product/services/buildr', policy)), { recursive: true });
  fs.copyFileSync(path.join(sourceServiceRoot, policy), path.join(root, 'projects/product/services/buildr', policy));
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
  let developmentHealthy = options.runningDevelopmentInstance === true;
  let developmentPid = options.previousDevelopmentPid || 71173;
  let developmentPort = 4317;
  let restartAttempts = 0;
  return (executable: any, args: any, context: any) => {
    if (executable === 'git') {
      if (args[0] === 'add' && options.failStage) return { status: 128, stdout: '', stderr: 'simulated index.lock contention' };
      if (args[0] === 'push' && options.failPush) return { status: 1, stdout: '', stderr: 'simulated push failure' };
      if (args[0] === 'ls-remote' && successfulPushes > 0 && postPushReadbacks < (options.failRemoteReadbackAttempts || 0)) {
        postPushReadbacks += 1;
        return { status: 1, stdout: '', stderr: 'simulated transient remote readback failure' };
      }
      const result: any = run(executable, args, context.cwd, context.binary);
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
        for (const [relative, content] of Object.entries(options.syncFiles || { 'skills/generated/SKILL.md': 'v2\n' })) {
          const file = path.join(root, relative);
          fs.mkdirSync(path.dirname(file), { recursive: true });
          fs.writeFileSync(file, content as any);
        }
        return { status: options.failSync ? 1 : 0, stdout: '{"status":"synced"}', stderr: options.failSync ? 'sync failed' : '' };
      }
    }
    if (executable === process.execPath && args[0] === launcherManager) {
      if (args[1] === 'install') {
        if (!args.includes('--no-stop-instance')) developmentHealthy = false;
        if (options.failLauncherInstall) return { status: 1, stdout: '', stderr: 'launcher manager failed' };
      }
      return {
        status: 0,
        stdout: JSON.stringify({
          schemaVersion: 'buildr.launcher-status/v1',
          channel: 'development',
          installed: true,
          platform: process.platform,
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
        const healthy: any = developmentHealthy;
        return {
          status: 0,
          stdout: JSON.stringify({
            schemaVersion: 'buildr.development-web-continuity/v1',
            action: 'inspect',
            status: healthy ? 'healthy-development' : (options.continuityStatus || 'not-running'),
            reason: healthy ? null : (options.continuityStatus || 'instance-record-absent'),
            instance: healthy ? {
              url: `http://127.0.0.1:${developmentPort}`,
              port: developmentPort,
              pid: developmentPid,
              launcherIdentity: { channel: 'development', sourceRoot: path.join(canonicalRoot, 'projects/product/services/buildr'), developmentRuntime: { executable: process.execPath } },
              productIdentity: null,
            } : null,
          }),
          stderr: '',
        };
      }
      if (args[1] === 'restart') {
        restartAttempts += 1;
        developmentHealthy = false;
        if (options.occupiedDevelopmentPort) {
          return { status: 1, stdout: '', stderr: JSON.stringify({ code: 'EADDRINUSE', message: `listen EADDRINUSE: 127.0.0.1:${DEFAULT_DEVELOPMENT_WEB_PORT}` }) };
        }
        if (options.failDevelopmentRestart || restartAttempts <= (options.developmentRestartFailures || 0)) {
          return { status: 1, stdout: '', stderr: JSON.stringify({ code: 'development-web-continuity.start-timeout', details: { cleanup: { pid: 72200, status: 'requested' } } }) };
        }
        const value: any = (name: any) => args[args.indexOf(name) + 1];
        const previousPid: any = Number(value('--previous-pid'));
        const port: any = Number(value('--port'));
        const previousPort: any = Number(value('--previous-port'));
        developmentHealthy = true;
        developmentPid = options.restartedDevelopmentPid || previousPid + 1;
        developmentPort = port;
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
              productIdentity: { developmentRuntimeIdentity: options.observedRestartRuntimeIdentity || readDevelopmentRuntimeIdentity(path.join(canonicalRoot, 'projects/product/services/buildr'), canonicalRoot) },
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

function syncResumeFixture(t: any): any {
  const current = directFixture(t);
  const syncFiles = {
    '.buildr/builtin-receipts.json': '{"synced":true}\n',
    'skills/manifest.yml': 'skills: []\n',
    'skills/buildr/generated/SKILL.md': '已同步的源文件\n',
  };
  const failed: any = runDirectSelfBootstrapCloseout({ ...current.input, execute: executor(current.root, { failStage: true, syncFiles }) });
  assert.equal(failed.diagnostic.code, 'self-bootstrap-closeout.stage-failed');
  assert.equal(failed.phases.find((stage: any) => stage.id === 'sync').status, 'passed');
  const request = {
    schemaVersion: SELF_BOOTSTRAP_SYNC_RESUME_SCHEMA,
    workspaceRoot: current.root,
    baseRef: current.input.baseRef,
    deliveredRef: current.input.deliveredRef,
    targetBranch: current.input.targetBranch,
    remote: current.input.remote,
    agent: current.input.agent,
    expectedHead: git(current.root, 'rev-parse', 'HEAD'),
    stagedPaths: [],
    files: Object.keys(syncFiles).sort().map(relative => ({ path: relative, sha256: `sha256-${crypto.createHash('sha256').update(fs.readFileSync(path.join(current.root, relative))).digest('hex')}` })),
  };
  const resumeSync = path.join(path.dirname(current.root), 'resume-sync.json');
  return { ...current, request, resumeSync };
}

function writeSyncResume(current: any): void {
  fs.writeFileSync(current.resumeSync, JSON.stringify(current.request));
}

test('explicit sync resume commits the reviewed snapshot at a fresh delivered HEAD without repeating sync', (t: any) => {
  const current = syncResumeFixture(t);
  // An independently delivered owner repair can advance HEAD while preserving the sync snapshot.
  git(current.root, 'commit', '--allow-empty', '-m', 'delivered owner repair');
  git(current.root, 'push', 'origin', 'dev');
  current.request.expectedHead = git(current.root, 'rev-parse', 'HEAD');
  git(current.root, 'add', '--', 'skills/manifest.yml');
  current.request.stagedPaths = ['skills/manifest.yml'];
  writeSyncResume(current);
  const calls: any[] = [];
  const perform = executor(current.root);
  const result: any = runSelfBootstrapCloseoutCommand({
    args: ['--target', current.root, '--base-ref', current.input.baseRef, '--delivered-ref', current.input.deliveredRef,
      '--branch', 'dev', '--remote', 'origin', '--agent', 'codex', '--node-executable', process.execPath, '--resume-sync', current.resumeSync],
    environment: current.environment,
    execute: (command: any, args: any, context: any) => { calls.push([command, ...args]); return perform(command, args, context); },
  });
  assert.equal(result.status, 'passed', JSON.stringify(result));
  assert.equal(result.phases.some((stage: any) => stage.id === 'sync'), false);
  assert.equal(calls.some(args => args.includes('sync')), false);
  assert.equal(result.phases[0].effects[0].type, 'workspace-sync-resume');
  assert.equal(git(current.root, 'rev-parse', 'HEAD^'), current.request.expectedHead);
  assert.deepEqual(git(current.root, 'diff-tree', '--no-commit-id', '--name-only', '-r', result.successor).split('\n').sort(), current.request.files.map((file: any) => file.path));
  assert.equal(git(current.root, 'ls-remote', 'origin', 'refs/heads/dev').split(/\s+/)[0], result.successor);
  assert.equal(git(current.root, 'status', '--porcelain'), '');
  assert.ok(result.phases.some((stage: any) => stage.id === 'verify-development-entry' && stage.status === 'passed'));
  assert.ok(result.phases.some((stage: any) => stage.id === 'finalize' && stage.status === 'passed'));
});

for (const scenario of ['content', 'extra-path', 'missing-path', 'staging', 'partial-staging', 'head', 'remote', 'unsafe-path', 'traversal', 'symlink']) {
  test(`sync resume rejects ${scenario} drift without staging, committing or pushing`, (t: any) => {
    const current = syncResumeFixture(t);
    const first = current.request.files[0];
    if (scenario === 'content') fs.appendFileSync(path.join(current.root, first.path), 'changed\n');
    if (scenario === 'extra-path') fs.writeFileSync(path.join(current.root, 'skills/buildr/generated/other.md'), 'unreviewed\n');
    if (scenario === 'missing-path') fs.unlinkSync(path.join(current.root, first.path));
    if (scenario === 'staging') {
      fs.writeFileSync(path.join(current.root, 'user-staged.txt'), 'unrelated staged work\n');
      git(current.root, 'add', '--', 'user-staged.txt');
    }
    if (scenario === 'partial-staging') {
      git(current.root, 'add', '--', first.path);
      fs.appendFileSync(path.join(current.root, first.path), 'working copy differs\n');
      current.request.stagedPaths = [first.path];
      first.sha256 = `sha256-${crypto.createHash('sha256').update(fs.readFileSync(path.join(current.root, first.path))).digest('hex')}`;
    }
    if (scenario === 'head') git(current.root, 'commit', '--allow-empty', '-m', 'unexpected HEAD');
    if (scenario === 'remote') git(current.root, '--git-dir', current.remote, 'update-ref', 'refs/heads/dev', current.baseRef);
    if (scenario === 'unsafe-path' || scenario === 'symlink') {
      const relative = scenario === 'unsafe-path' ? 'projects/product/services/buildr/src/unreviewed.ts' : 'skills/buildr/generated/link.md';
      fs.mkdirSync(path.dirname(path.join(current.root, relative)), { recursive: true });
      if (scenario === 'symlink') fs.symlinkSync(path.join(current.root, first.path), path.join(current.root, relative));
      else fs.writeFileSync(path.join(current.root, relative), 'outside sync sources\n');
      current.request.files.push({ path: relative, sha256: `sha256-${crypto.createHash('sha256').update(fs.readFileSync(path.join(current.root, relative))).digest('hex')}` });
    }
    if (scenario === 'traversal') first.path = 'skills/buildr/../manifest.yml';
    writeSyncResume(current);
    const before = git(current.root, 'rev-parse', 'HEAD');
    const calls: any[] = [];
    const perform = executor(current.root);
    const result: any = runDirectSelfBootstrapCloseout({ ...current.input, resumeSync: current.resumeSync,
      execute: (command: any, args: any, context: any) => { calls.push([command, ...args]); return perform(command, args, context); } });
    assert.equal(result.status, 'blocked', JSON.stringify(result));
    assert.equal(git(current.root, 'rev-parse', 'HEAD'), before);
    assert.equal(calls.some(args => args[0] === 'git' && ['add', 'commit', 'push'].includes(args[1])), false);
    assert.equal(calls.some(args => args.includes('sync')), false);
  });
}

for (const field of ['baseRef', 'deliveredRef', 'targetBranch', 'remote', 'agent', 'workspaceRoot']) {
  test(`sync resume rejects a mismatched ${field} input before writes`, (t: any) => {
    const current = syncResumeFixture(t);
    current.request[field] = field.endsWith('Ref') ? current.baseRef : 'different-input';
    if (field === 'baseRef') current.request[field] = current.input.deliveredRef;
    writeSyncResume(current);
    const calls: any[] = [];
    const perform = executor(current.root);
    const result: any = runDirectSelfBootstrapCloseout({ ...current.input, resumeSync: current.resumeSync,
      execute: (command: any, args: any, context: any) => { calls.push([command, ...args]); return perform(command, args, context); } });
    assert.equal(result.status, 'blocked', JSON.stringify(result));
    assert.equal(git(current.root, 'rev-parse', 'HEAD'), current.input.deliveredRef);
    assert.equal(calls.some(args => args[0] === 'git' && ['add', 'commit', 'push'].includes(args[1])), false);
  });
}

for (const scenario of ['working-file', 'index-blob']) {
  test(`sync resume rejects ${scenario} changes during staging before commit`, (t: any) => {
    const current = syncResumeFixture(t);
    writeSyncResume(current);
    const perform = executor(current.root);
    const calls: any[] = [];
    const first = current.request.files[0];
    const result: any = runDirectSelfBootstrapCloseout({ ...current.input, resumeSync: current.resumeSync,
      execute: (command: any, args: any, context: any) => {
        calls.push([command, ...args]);
        if (command === 'git' && args[0] === 'add' && scenario === 'working-file') fs.appendFileSync(path.join(current.root, first.path), 'changed while staging\n');
        if (command === 'git' && args[0] === 'show' && args[1] === `:${first.path}` && scenario === 'index-blob') {
          const original = fs.readFileSync(path.join(current.root, first.path));
          fs.appendFileSync(path.join(current.root, first.path), 'unreviewed index bytes\n');
          git(current.root, 'add', '--', first.path);
          fs.writeFileSync(path.join(current.root, first.path), original);
        }
        return perform(command, args, context);
      } });
    assert.equal(result.status, 'blocked', JSON.stringify(result));
    assert.equal(git(current.root, 'rev-parse', 'HEAD'), current.input.deliveredRef);
    assert.equal(calls.some(args => args[0] === 'git' && ['commit', 'push'].includes(args[1])), false);
    assert.equal(calls.some(args => args.includes('sync')), false);
  });
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
  const message = git(current.root, 'show', '-s', '--format=%B', first.successor);
  assert.equal(message.split(/\r?\n/).filter((line: string) => line === `Buildr-Task: ${current.input.taskId}`).length, 1);
  assert.equal(parseTaskCommitTrailer(message).taskId, current.input.taskId);
  assert.match(message, /^Buildr-Activation-Identity: sha256-[a-f0-9]{64}$/m);
  assert.ok(message.includes(`Buildr-Activation-Task: ${current.input.taskId}`));
  assert.ok(message.includes(`Buildr-Activation-Delivery: ${current.input.deliveredRef}`));
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
  const message = git(current.root, 'show', '-s', '--format=%B', result.successor);
  assert.doesNotMatch(message, /^Buildr-(?:Activation-)?Task:/m);
  assert.equal(parseTaskCommitTrailer(message).taskId, null);
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
  assert.equal(parseTaskCommitTrailer(git(current.root, 'show', '-s', '--format=%B', successor)).taskId, null);
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

for (const [role, sourcePath] of [
  ['module', 'src/modules/workspace/application/runtime-fixture.ts'],
  ['bin', 'bin/runtime-fixture.mjs'],
  ['web', 'src/web/application/runtime-fixture.ts'],
]) {
  test(`package runtime source ${role} installs and restarts the retained development app before entry and Doctor verification`, (t: any) => {
    const current: any = fixture(t);
    const relative = `projects/product/services/buildr/${sourcePath}`;
    const file = path.join(current.root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'export const deliveredRuntime = true;\n');
    git(current.root, 'add', '--', relative);
    git(current.root, 'commit', '-m', `deliver ${role} runtime`);
    git(current.root, 'push', 'origin', 'dev');
    const deliveredRef = git(current.root, 'rev-parse', 'HEAD');
    const perform = executor(current.root, { runningDevelopmentInstance: true });
    const calls: Array<{ executable: string; args: string[]; entryInspection: boolean }> = [];
    const result: any = runDirectSelfBootstrapCloseout({
      workspaceRoot: current.root, baseRef: current.baseRef, deliveredRef,
      targetBranch: 'dev', remote: 'origin', agent: 'codex', nodeExecutable: process.execPath, environment: current.environment,
      execute: (executable: string, args: string[], context: any) => { calls.push({ executable, args, entryInspection: context.env?.BUILDR_INTERNAL_DEVELOPMENT_CLI_IDENTITY_JSON === '1' }); return perform(executable, args, context); },
    });
    assert.equal(result.status, 'passed', JSON.stringify(result));
    assert.deepEqual(result.phases.map((phase: any) => phase.id), ['preflight', 'install-buildr-web', 'verify-development-entry', 'finalize']);
    assert.ok(result.phases.every((phase: any) => phase.status === 'passed'));
    const canonicalRoot = fs.realpathSync(current.root);
    const manager = path.join(canonicalRoot, 'projects/product/services/buildr/tools/build/launcher/manage.ts');
    const continuity = path.join(canonicalRoot, 'skills/buildr-self-bootstrap-sync/scripts/development-web-continuity.mjs');
    const bridge = fs.realpathSync(current.projectBridge);
    const inspectIndex = calls.findIndex((call) => call.args[0] === continuity && call.args[1] === 'inspect');
    const installIndex = calls.findIndex((call) => call.args[0] === manager && call.args[1] === 'install');
    const restartIndex = calls.findIndex((call) => call.args[0] === continuity && call.args[1] === 'restart');
    const entryIndex = calls.findIndex((call) => call.executable === bridge && call.entryInspection);
    const doctorIndex = calls.findIndex((call) => call.executable === bridge && call.args[0] === 'doctor');
    assert.ok(inspectIndex >= 0 && inspectIndex < installIndex && installIndex < restartIndex && restartIndex < entryIndex && entryIndex < doctorIndex, JSON.stringify(calls));
    for (const index of [inspectIndex, installIndex, restartIndex]) assert.equal(calls[index].executable, process.execPath);
    assert.deepEqual(calls[installIndex].args.slice(1), ['install', '--channel', 'development', '--no-stop-instance']);
    const restart = calls[restartIndex].args;
    assert.equal(restart[restart.indexOf('--previous-pid') + 1], '71173');
    assert.equal(restart[restart.indexOf('--port') + 1], String(DEFAULT_DEVELOPMENT_WEB_PORT));
    assert.equal(git(current.root, 'rev-parse', 'HEAD'), deliveredRef);
    assert.equal(git(current.root, 'ls-remote', 'origin', 'refs/heads/dev').split(/\s+/)[0], deliveredRef);
  });
}

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

for (const relative of ['projects/product/services/buildr-web/test/runtime.test.ts', 'projects/product/services/dsh-plugin/plugin/bridge.ts', 'projects/product/services/buildr/docs/runtime.md']) {
  test(`non-runtime ${relative} does not install or restart the development app`, t => {
    const f = fixture(t), file = path.join(f.root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, 'documentation or independent work\n');
    git(f.root, 'add', '--', relative); git(f.root, 'commit', '-m', 'unrelated change'); git(f.root, 'push', 'origin', 'dev');
    const calls: string[][] = [], perform = executor(f.root, { runningDevelopmentInstance: true });
    const result = runDirectSelfBootstrapCloseout({ workspaceRoot: f.root, baseRef: f.baseRef, deliveredRef: git(f.root, 'rev-parse', 'HEAD'), targetBranch: 'dev', remote: 'origin', agent: 'codex', nodeExecutable: process.execPath, environment: f.environment,
      execute: (command: string, args: string[], context: any) => { calls.push(args); return perform(command, args, context); } });
    assert.equal(result.status, 'not-applicable');
    assert.equal(calls.some(args => args.includes('restart') || args.includes('--channel')), false);
  });
}
for (const relative of ['projects/product/services/buildr-agent/src/index.ts', 'projects/product/services/buildr-agent/package-lock.json', 'projects/product/services/buildr/package-lock.json', 'projects/product/services/buildr-web/vite.config.ts', 'projects/product/services/buildr-web/tsconfig.app.json', 'projects/product/services/buildr/tools/development/prepare-development-web.ts']) {
  test(`shared runtime policy restarts for ${relative}`, t => {
    const f = fixture(t), file = path.join(f.root, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, 'runtime input changed\n');
    git(f.root, 'add', '--', relative); git(f.root, 'commit', '-m', 'runtime input change'); git(f.root, 'push', 'origin', 'dev');
    const result = runDirectSelfBootstrapCloseout({ workspaceRoot: f.root, baseRef: f.baseRef, deliveredRef: git(f.root, 'rev-parse', 'HEAD'), targetBranch: 'dev', remote: 'origin', agent: 'codex', nodeExecutable: process.execPath, environment: f.environment, execute: executor(f.root, { runningDevelopmentInstance: true }) });
    assert.equal(result.status, 'passed', JSON.stringify(result));
    assert.ok(result.phases.some((phase: any) => phase.id === 'install-buildr-web' && phase.status === 'passed'));
  });
}

test('a projected closeout script loads runtime policy from the explicit product root', async t => {
  const f = fixture(t), projected = path.join(path.dirname(f.root), 'agent-runtime', 'closeout.mjs');
  fs.mkdirSync(path.dirname(projected), { recursive: true });
  fs.copyFileSync(path.resolve(import.meta.dirname, '../../../../../../skills/buildr-self-bootstrap-sync/scripts/closeout.mjs'), projected);
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

function runtimeRecoveryFixture(t: any): any {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.root, 'projects/product/services/buildr/package-lock.json'), '{}\n');
  git(f.root, 'add', '--', 'projects/product/services/buildr/package-lock.json');
  git(f.root, 'commit', '-m', 'runtime change');
  git(f.root, 'push', 'origin', 'dev');
  return { ...f, pending: path.join(f.root, '.buildr/local/self-bootstrap-development-web-recovery.json'),
    input: { workspaceRoot: f.root, baseRef: f.baseRef, deliveredRef: git(f.root, 'rev-parse', 'HEAD'),
      targetBranch: 'dev', remote: 'origin', agent: 'codex', nodeExecutable: process.execPath, environment: f.environment } };
}

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
    assert.equal(result.diagnostic.code, code);
    assert.equal(result.diagnostic.details.developmentWebRecovery.disposition, 'preserved');
    assert.equal(result.diagnostic.details.developmentWebRecovery.instance.pid, 71173);
    assert.equal(calls.some(args => args.includes('restart')), false);
    assert.equal(fs.existsSync(f.pending), false);
  });
}

test('failed restart retains the recovery obligation and a fresh invocation restores an absent instance', t => {
  const f = runtimeRecoveryFixture(t);
  const failed = runDirectSelfBootstrapCloseout({ ...f.input, execute: executor(f.root, { runningDevelopmentInstance: true, failDevelopmentRestart: true }) });
  assert.equal(failed.status, 'blocked');
  assert.equal(failed.diagnostic.details.developmentWebRecovery.status, 'failed');
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
  assert.equal(result.diagnostic.code, 'self-bootstrap-closeout.development-web-restart-failed');
  assert.equal(result.diagnostic.details.developmentWebRecovery.status, 'passed');
  assert.equal(result.diagnostic.details.developmentWebRecovery.instance.pid, 71174);
  assert.equal(fs.existsSync(f.pending), false);
});

test('an installation failure on retry still restores the app from the persisted obligation', t => {
  const f = runtimeRecoveryFixture(t);
  runDirectSelfBootstrapCloseout({ ...f.input, execute: executor(f.root, { runningDevelopmentInstance: true, failDevelopmentRestart: true }) });
  assert.equal(fs.existsSync(f.pending), true);
  const result = runDirectSelfBootstrapCloseout({ ...f.input, execute: executor(f.root, { failLauncherInstall: true }) });
  assert.equal(result.diagnostic.code, 'self-bootstrap-closeout.local-app-install-failed');
  assert.equal(result.diagnostic.details.developmentWebRecovery.status, 'passed');
  assert.equal(fs.existsSync(f.pending), false);
});

test('an invalid recovery obligation is preserved and cannot trigger installation or restart', t => {
  const f = runtimeRecoveryFixture(t);
  fs.mkdirSync(path.dirname(f.pending), { recursive: true }); fs.writeFileSync(f.pending, '{broken');
  const calls: string[][] = [], perform = executor(f.root);
  const result = runDirectSelfBootstrapCloseout({ ...f.input, execute: (command: string, args: string[], context: any) => {
    calls.push(args); return perform(command, args, context);
  } });
  assert.equal(result.diagnostic.code, 'self-bootstrap-closeout.development-web-recovery-invalid');
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
  assert.equal(result.diagnostic.code, 'self-bootstrap-closeout.development-web-recovery-root-mismatch');
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
  assert.equal(result.diagnostic.code, 'self-bootstrap-closeout.development-web-recovery-changed');
  assert.equal(result.diagnostic.details.developmentWebRecovery.status, 'passed');
  assert.equal(result.diagnostic.details.developmentWebRecovery.cleanup.status, 'failed');
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
        if (request.headers['x-buildr-instance'] !== secret) { response.writeHead(403).end(); return; }
        if (request.url === '/api/v1/app/quit-instance' && request.method === 'POST') {
          response.writeHead(202).end(); setImmediate(() => server.close(() => {
            if (JSON.parse(fs.readFileSync(file, 'utf8')).pid === process.pid) fs.unlinkSync(file);
          })); return;
        }
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ schemaVersion: 'buildr.local-app-health/v1', status: 'ready', pid: process.pid }));
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
    for (let attempt = 0; !fs.existsSync(instanceFile) && attempt < 100; attempt++) await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(fs.existsSync(instanceFile), true);
    // Only this isolated receipt is routed to its ephemeral HTTP listener.
    // The everyday development port is never contacted or occupied.
    const fetchImpl: typeof fetch = (url: any, options: any) => {
      const state = JSON.parse(fs.readFileSync(instanceFile, 'utf8'));
      return fetch(new URL(new URL(url).pathname, state.testingUrl), options);
    };
    configure(newProof);
    let attempts = 0;
    const input = { projectBridge: path.join(directory, 'buildr'), launcherIdentityPath: identityFile,
      expectedSourceRoot: sourceRoot, expectedHead: identity.checkout.head, expectedRuntimeIdentity: newProof,
      nodeExecutable: process.execPath, previousPid: previous.pid, dataRoot, fetchImpl,
      spawnImpl: (_program: any, args: any) => {
        assert.deepEqual(args, ['web', '--port', '4458', '--no-open']);
        attempts++;
        if (failFirstStart && attempts === 1) {
          const child = spawn(process.execPath, ['-e', 'process.exit(1)'], { stdio: 'ignore' }); children.push(child); return child;
        }
        return launch();
      } };
    await assert.rejects(restartDevelopmentInstance({ ...input, previousPid: previous.pid! + 1, timeoutMs: 2000 }), (error: any) => error.code === 'development-web-continuity.owner-mismatch');
    assert.equal(attempts, 0);
    assert.equal((await inspectDevelopmentInstance({ dataRoot, fetchImpl })).instance?.pid, previous.pid);
    if (failFirstStart) await assert.rejects(restartDevelopmentInstance({ ...input, timeoutMs: 300 }), (error: any) => error.code === 'development-web-continuity.start-timeout');
    const result = await restartDevelopmentInstance({ ...input, timeoutMs: 2000 });
    assert.equal(result.status, 'passed'); assert.notEqual(result.instance.pid, previous.pid);
    assert.equal((await inspectDevelopmentInstance({ dataRoot, fetchImpl })).status, 'healthy-development');
    const beforeReuse = attempts;
    const reused = await restartDevelopmentInstance({ ...input, timeoutMs: 2000 });
    assert.equal(reused.disposition, 'reused'); assert.equal(reused.instance.pid, result.instance.pid);
    assert.equal(attempts, beforeReuse);
  });
}
