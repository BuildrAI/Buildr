import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { after } from 'node:test';
import { createTestContextPool } from '../context/runtime.ts';
import { runDirectSelfBootstrapCloseout, SELF_BOOTSTRAP_SYNC_RESUME_SCHEMA } from '../../../../../../skills/buildr-self-bootstrap-sync/scripts/closeout.mjs';
import { DEFAULT_DEVELOPMENT_WEB_PORT } from '../../../../../../skills/buildr-self-bootstrap-sync/scripts/development-web-continuity.mjs';
import { readDevelopmentRuntimeIdentity } from '../../src/modules/installation/infrastructure/development-runtime-inputs.ts';

export function run(executable: any, args: any, cwd: any, binary = false): any  {
  const result: any = spawnSync(executable, args, { cwd, encoding: binary ? null : 'utf8' });
  return { status: result.status, stdout: result.stdout || '', stderr: result.stderr || '' };
}

export function git(root: any, ...args: any[]): any  {
  const result: any = run('git', args, root);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

export function prepareFixture(base: string): void {
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
  fs.copyFileSync(path.resolve(import.meta.dirname, '../../../../../../skills/buildr-self-bootstrap-sync/scripts/detached-launch.mjs'), path.join(root, 'skills/buildr-self-bootstrap-sync/scripts/detached-launch.mjs'));
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
exec "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)/services/buildr/tools/development/run-development-cli" "$@"
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
  fs.writeFileSync(path.join(root, 'projects/product/services/buildr/tools/development/prepare-development-agent.ts'), 'console.log(JSON.stringify({status:"passed"}));\n');
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
  git(root, 'rev-parse', 'HEAD');
}

export function executor(root: any, options: any = {}): any  {
  const canonicalRoot: any = fs.realpathSync(root);
  let finishResumeIndex: any = 0;
  let successfulPushes: any = 0;
  let postPushReadbacks: any = 0;
  let developmentHealthy = options.runningDevelopmentInstance === true;
  let developmentPid = options.previousDevelopmentPid || 71173;
  let developmentPort = 4317;
  let restartAttempts = 0;
  let agentPrepared = false;
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
    const agentPreparation = path.join(canonicalRoot, 'projects/product/services/buildr/tools/development/prepare-development-agent.ts');
    if (executable === process.execPath && args[0] === agentPreparation) {
      if (options.failAgentPreparation) return { status: 1, stdout: '', stderr: 'agent package preparation failed' };
      agentPrepared = true;
      return { status: 0, stdout: '{"status":"passed"}', stderr: '' };
    }
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
        if (options.requiresAgentPreparation && !agentPrepared) return { status: 1, stdout: '', stderr: "Cannot read properties of undefined (reading '$id')" };
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
          target: path.join(canonicalRoot, 'Buildr Development Dev.app'),
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
            pageVerification: healthy ? { status: options.badDevelopmentPage ? 'failed' : 'passed', reason: options.badDevelopmentPage ? 'invalid-html' : null, resourceCount: 1, durationMs: 1 } : null,
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

export function writeSyncResume(current: any): void {
  fs.writeFileSync(current.resumeSync, JSON.stringify(current.request));
}

export async function waitForExecutionFile(file: string, timeoutMs = 10000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!fs.existsSync(file)) {
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${file}`);
    await new Promise(resolve => setTimeout(resolve, 15));
  }
}

export function detachedFixture(t: any) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-closeout-handoff-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const runnerModule = path.join(directory, 'runner.mjs');
  fs.writeFileSync(runnerModule, `
    import fs from 'node:fs';
    import path from 'node:path';
    export async function runSelfBootstrapCloseoutCommand({args}) {
      const [directory, mode] = args;
      const lock = path.join(directory, 'activation.lock');
      fs.mkdirSync(lock);
      fs.writeFileSync(path.join(directory, 'worker-ready'), String(process.pid));
      if (mode === 'crash') process.exit(23);
      try {
        if (mode === 'wait') {
          while (!fs.existsSync(path.join(directory, 'continue'))) await new Promise(resolve => setTimeout(resolve, 15));
          fs.writeFileSync(path.join(directory, 'replacement-started'), 'healthy');
        }
        if (mode === 'throw') throw Object.assign(new Error('identity changed; preserved'), {code:'owner-mismatch'});
        return {schemaVersion:'buildr.self-bootstrap-closeout-result/v1',status:mode === 'blocked'?'blocked':'passed',args};
      } finally { fs.rmdirSync(lock); }
    }
  `);
  return { directory, runnerModule };
}

export function createSelfBootstrapCloseoutFixtures() {
  const fixturePool = createTestContextPool({ providers: [{
    key: 'self-bootstrap-closeout/v1', isolationMode: 'sandbox', resetStrategy: 'recreate', parallelSafety: 'worker-safe',
    prepare({ seedRoot }: any) { prepareFixture(seedRoot); },
    inspect({ seedRoot }: any) {
      assert.ok(fs.statSync(path.join(seedRoot, 'workspace/.git/HEAD')).isFile());
      assert.ok(fs.statSync(path.join(seedRoot, 'remote.git/HEAD')).isFile());
    },
  }] });
  after(() => fixturePool.cleanup());
  function fixture(t: any): any {
    const lease = fixturePool.acquire('self-bootstrap-closeout/v1');
    t.after(() => lease.release());
    const base = lease.root, root = path.join(base, 'workspace'), remote = path.join(base, 'remote.git');
    // Each sandbox owns independent Git objects, refs, index and remote. No hard
    // links or alternates can let one destructive recovery case pollute another.
    git(root, 'remote', 'set-url', 'origin', remote);
    const baseRef = git(root, 'rev-parse', 'HEAD');
    const projectBridge = path.join(root, 'projects/product/buildr');
    const launcher = path.join(root, 'projects/product/services/buildr/tools/development/run-development-cli');
    const cliEntry = path.join(root, 'projects/product/services/buildr/bin/buildr.mjs');
    const defaultBin = path.join(base, 'default-bin');
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
    assert.partialDeepStrictEqual(failed.diagnostic, { code: 'self-bootstrap-closeout.stage-failed' });
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
  return { fixture, directFixture, syncResumeFixture, runtimeRecoveryFixture };
}
