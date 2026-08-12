import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import {
  createSelfBootstrapCloseoutPlan,
  runSelfBootstrapCloseout,
  runSelfBootstrapCloseoutCommand,
} from '../../../../../../skills/buildr-self-bootstrap-sync/scripts/closeout.mjs';
import { RUNTIME_ADAPTERS, skillDestinationRoot } from '../../src/infrastructure/runtime/adapter-contract.mjs';

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
  fs.mkdirSync(path.join(root, 'projects', 'product', 'services', 'buildr', 'package'), { recursive: true });
  fs.mkdirSync(path.join(root, 'projects', 'product', 'services', 'buildr', 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(root, 'projects', 'product', 'services', 'buildr', 'bin'), { recursive: true });
  fs.mkdirSync(path.join(root, 'skills', 'generated'), { recursive: true });
  const launcher = path.join(root, 'projects', 'product', 'services', 'buildr', 'scripts', 'run-development-cli');
  const cliEntry = path.join(root, 'projects', 'product', 'services', 'buildr', 'bin', 'buildr.mjs');
  const defaultBin = path.join(base, 'default-bin');
  fs.writeFileSync(path.join(root, 'components', 'workspace', 'buildr-self-bootstrap', 'component.yml'), 'schemaVersion: buildr.component/v1\nid: buildr-self-bootstrap\n');
  fs.writeFileSync(path.join(root, 'projects', 'product', 'services', 'buildr', 'package', 'manifest.yml'), 'schemaVersion: buildr.package/v1\n');
  fs.writeFileSync(path.join(root, 'projects', 'product', 'services', 'buildr', 'package.json'), JSON.stringify({ name: '@buildr-ai/buildr', version: '0.1.0-test' }));
  fs.writeFileSync(launcher, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
  fs.writeFileSync(cliEntry, '#!/usr/bin/env node\n', { mode: 0o755 });
  fs.mkdirSync(defaultBin);
  fs.symlinkSync(launcher, path.join(defaultBin, 'buildr'));
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
    launcher,
    cliEntry,
    defaultBuildr: path.join(defaultBin, 'buildr'),
    environment: { ...process.env, PATH: `${defaultBin}${path.delimiter}${process.env.PATH || ''}` },
  };
}

function finishResult(root, baseRef, changedPaths, overrides = {}) {
  const identity = {
    task: 'closeout-task',
    handoffIdentity: 'sha256-handoff',
    candidateIdentity: 'sha256-candidate',
    candidateGeneration: 1,
    contentTargetIdentity: 'sha256-content',
    agent: 'codex',
    targetBranch: 'dev',
    remote: 'origin',
    environmentRoot: path.join(root, '.worktrees', 'task'),
    workspaceRoot: root,
    workspaceNodeIdentity: 'sha256-node',
  };
  return {
    schemaVersion: 'buildr.task-finish-result/v2',
    runId: 'closeout-run',
    status: 'complete',
    identity,
    resolvedContext: { capability: { id: 'buildr.task-finish', version: 1 }, identity: 'sha256-context' },
    carrier: { identity: 'sha256-carrier', changedPaths },
    delivery: { status: 'delivered', remoteAfterRef: baseRef, finalRemoteRef: baseRef },
    completion: { finalRemoteRef: baseRef },
    ...overrides,
  };
}

function doctorBlockedResult(root, baseRef, changedPaths, overrides = {}) {
  const base = finishResult(root, baseRef, changedPaths);
  const carrierRoot = path.join(root, '.buildr', 'transient', 'task-finish', 'carriers', base.runId);
  return {
    ...base,
    status: 'blocked',
    primaryFailure: { phase: 'deliver', operation: 'retained-doctor' },
    carrier: { ...base.carrier, root: carrierRoot },
    delivery: { status: 'activation-blocked', remoteAfterRef: baseRef, finalRemoteRef: baseRef },
    resume: { phase: 'deliver', token: 'sha256-resume' },
    ...overrides,
  };
}

function createCarrier(root, runId = 'closeout-run') {
  const carrierRoot = path.join(root, '.buildr', 'transient', 'task-finish', 'carriers', runId);
  fs.mkdirSync(carrierRoot, { recursive: true });
  fs.writeFileSync(path.join(carrierRoot, 'carrier.txt'), 'owned\n');
  return carrierRoot;
}

function executor(root, options = {}) {
  const canonicalRoot = fs.realpathSync(root);
  return (executable, args, context) => {
    if (executable === 'git') {
      if (args[0] === 'push' && options.failPush) return { status: 1, stdout: '', stderr: 'simulated push failure' };
      return run(executable, args, context.cwd);
    }
    const productScript = path.join(canonicalRoot, 'projects', 'product', 'services', 'buildr', 'bin', 'buildr.mjs');
    const launcher = path.join(canonicalRoot, 'projects', 'product', 'services', 'buildr', 'scripts', 'run-development-cli');
    let resolvedExecutable = null;
    try { resolvedExecutable = fs.realpathSync(executable); } catch { /* unexpected commands are handled below */ }
    if (resolvedExecutable === launcher) {
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
        return { status: 0, stdout: JSON.stringify({ package: options.observedPackage || '@buildr-ai/buildr', version: options.observedVersion || '0.1.0-test' }), stderr: '' };
      }
      if (args[0] === 'doctor') return { status: 0, stdout: JSON.stringify({ health: { ready: true } }), stderr: '' };
      if (args[0] === 'task') return { status: 0, stdout: JSON.stringify({ status: 'complete', runId: 'closeout-run', resolvedContext: { identity: 'sha256-context' } }), stderr: '' };
    }
    if (executable === process.execPath && args[0] === productScript) {
      const productArgs = args.slice(1);
      if (productArgs[0] === 'task' && productArgs[1] === 'finish' && productArgs[2] === 'inspect') {
        return { status: 0, stdout: JSON.stringify(options.finishInspection), stderr: '' };
      }
      if (productArgs[0] === 'sync') {
        fs.writeFileSync(path.join(root, 'skills', 'generated', 'SKILL.md'), 'v2\n');
        return { status: options.failSync ? 1 : 0, stdout: '{"status":"synced"}', stderr: options.failSync ? 'sync failed' : '' };
      }
      if (productArgs[0] === 'web') return { status: 0, stdout: JSON.stringify({ status: 'installed', channel: 'development' }), stderr: '' };
    }
    if (executable === path.join(canonicalRoot, 'projects', 'product', 'services', 'buildr', 'scripts', 'install-buildr-cli')) return { status: options.failCliInstall ? 1 : 0, stdout: 'installed', stderr: options.failCliInstall ? 'install failed' : '' };
    return { status: 1, stdout: '', stderr: `unexpected command: ${executable} ${args.join(' ')}` };
  };
}

function phase(result, id) {
  return result.phases.find((item) => item.id === id);
}

test('fresh closeout以精确successor commit和remote readback完成', (t) => {
  const { root, baseRef, environment } = fixture(t);
  const result = runSelfBootstrapCloseout({
    finishResult: finishResult(root, baseRef, ['projects/product/services/buildr/package/manifest.yml']),
    workspaceRoot: root,
    nodeExecutable: process.execPath,
    execute: executor(root),
    environment,
  });
  assert.equal(result.status, 'passed', JSON.stringify(result.diagnostic));
  assert.equal(phase(result, 'sync').status, 'passed');
  assert.equal(phase(result, 'commit').status, 'passed');
  assert.equal(phase(result, 'push').status, 'passed');
  assert.equal(phase(result, 'install-cli').status, 'not-applicable');
  assert.equal(phase(result, 'finalize').status, 'passed');
  const head = git(root, 'rev-parse', 'HEAD');
  assert.notEqual(head, baseRef);
  assert.equal(git(root, 'rev-parse', 'HEAD^'), baseRef);
  assert.equal(git(root, 'ls-remote', '--heads', 'origin', 'dev').split(/\s+/)[0], head);
  const message = git(root, 'show', '-s', '--format=%B', 'HEAD');
  assert.match(message, /Buildr-Finish-Run: closeout-run/);
  assert.match(message, new RegExp(`Buildr-Closeout-Plan: ${result.plan.identity}`));
});

test('commit后push失败保留successor，重跑从同一commit恢复', (t) => {
  const { root, baseRef, environment } = fixture(t);
  const input = finishResult(root, baseRef, ['projects/product/services/buildr/package/manifest.yml']);
  const first = runSelfBootstrapCloseout({ finishResult: input, workspaceRoot: root, nodeExecutable: process.execPath, execute: executor(root, { failPush: true }), environment });
  assert.equal(first.status, 'blocked');
  assert.equal(phase(first, 'commit').status, 'passed');
  assert.equal(phase(first, 'push').status, 'blocked');
  const successor = git(root, 'rev-parse', 'HEAD');
  assert.equal(git(root, 'ls-remote', '--heads', 'origin', 'dev').split(/\s+/)[0], baseRef);

  const second = runSelfBootstrapCloseout({ finishResult: input, workspaceRoot: root, nodeExecutable: process.execPath, execute: executor(root), environment });
  assert.equal(second.status, 'passed', JSON.stringify(second.diagnostic));
  assert.equal(git(root, 'rev-parse', 'HEAD'), successor);
  assert.equal(git(root, 'ls-remote', '--heads', 'origin', 'dev').split(/\s+/)[0], successor);
});

test('remote已包含合法successor时不重复commit或push', (t) => {
  const { root, baseRef, environment } = fixture(t);
  const input = finishResult(root, baseRef, ['projects/product/services/buildr/package/manifest.yml']);
  const first = runSelfBootstrapCloseout({ finishResult: input, workspaceRoot: root, nodeExecutable: process.execPath, execute: executor(root), environment });
  assert.equal(first.status, 'passed');
  const successor = git(root, 'rev-parse', 'HEAD');
  const second = runSelfBootstrapCloseout({ finishResult: input, workspaceRoot: root, nodeExecutable: process.execPath, execute: executor(root), environment });
  assert.equal(second.status, 'passed', JSON.stringify(second.diagnostic));
  assert.equal(git(root, 'rev-parse', 'HEAD'), successor);
  assert.equal(phase(second, 'commit').effects.length, 0);
  assert.equal(phase(second, 'push').effects.length, 0);
});

test('无匹配动作not-applicable且身份漂移fail closed', (t) => {
  const { root, baseRef, environment } = fixture(t);
  const none = runSelfBootstrapCloseout({ finishResult: finishResult(root, baseRef, ['README.md']), workspaceRoot: root, nodeExecutable: process.execPath, execute: executor(root), environment });
  assert.equal(none.status, 'not-applicable');
  assert.equal(phase(none, 'sync').operations.length, 0);

  fs.writeFileSync(path.join(root, 'unknown.txt'), 'unknown\n');
  git(root, 'add', '--', 'unknown.txt');
  git(root, 'commit', '-m', 'unknown successor');
  const drift = runSelfBootstrapCloseout({ finishResult: finishResult(root, baseRef, ['projects/product/services/buildr/src/example.mjs']), workspaceRoot: root, nodeExecutable: process.execPath, execute: executor(root), environment });
  assert.equal(drift.status, 'blocked');
  assert.equal(drift.diagnostic.code, 'self-bootstrap-closeout.successor-identity-unprovable');
  assert.equal(phase(drift, 'install-cli').status, 'not-applicable');
});

test('安装失败保留前序事实，Doctor blocked使用同一run resume', (t) => {
  const firstFixture = fixture(t);
  const installFailure = runSelfBootstrapCloseout({
    finishResult: finishResult(firstFixture.root, firstFixture.baseRef, ['projects/product/services/buildr/src/example.mjs']),
    workspaceRoot: firstFixture.root,
    nodeExecutable: process.execPath,
    execute: executor(firstFixture.root, { failCliInstall: true }),
    environment: firstFixture.environment,
  });
  assert.equal(installFailure.status, 'blocked');
  assert.equal(phase(installFailure, 'install-cli').status, 'blocked');
  assert.equal(phase(installFailure, 'finalize').status, 'not-applicable');

  const secondFixture = fixture(t);
  const blocked = doctorBlockedResult(secondFixture.root, secondFixture.baseRef, ['projects/product/services/buildr/src/example.mjs']);
  createCarrier(secondFixture.root);
  const resumed = runSelfBootstrapCloseout({ finishResult: blocked, workspaceRoot: secondFixture.root, nodeExecutable: process.execPath, execute: executor(secondFixture.root), environment: secondFixture.environment });
  assert.equal(resumed.status, 'passed', JSON.stringify(resumed.diagnostic));
  assert.equal(phase(resumed, 'finalize').operations.at(-1).id, 'resume-finish-run');
  assert.equal(phase(resumed, 'finalize').operations.filter((item) => item.id === 'final-doctor').length, 0);
});

test('默认CLI identity evidence覆盖完整入口链且complete只经默认入口Doctor', (t) => {
  const { root, baseRef, environment, launcher, cliEntry, defaultBuildr } = fixture(t);
  const result = runSelfBootstrapCloseout({
    finishResult: finishResult(root, baseRef, ['projects/product/services/buildr/src/example.mjs']),
    workspaceRoot: root,
    nodeExecutable: process.execPath,
    execute: executor(root),
    environment,
  });

  assert.equal(result.status, 'passed', JSON.stringify(result.diagnostic));
  assert.equal(phase(result, 'verify-cli-identity').status, 'passed');
  assert.equal(result.cliIdentity.status, 'passed');
  assert.equal(result.cliIdentity.command, 'buildr');
  assert.equal(result.cliIdentity.pathEntry, defaultBuildr);
  assert.equal(fs.realpathSync(result.cliIdentity.launcher.expected), fs.realpathSync(launcher));
  assert.equal(fs.realpathSync(result.cliIdentity.launcher.observed), fs.realpathSync(launcher));
  assert.equal(fs.realpathSync(result.cliIdentity.cliEntry.expected), fs.realpathSync(cliEntry));
  assert.equal(fs.realpathSync(result.cliIdentity.cliEntry.observed), fs.realpathSync(cliEntry));
  assert.deepEqual(result.cliIdentity.nodeExecutable, { expected: process.execPath, observed: process.execPath });
  assert.deepEqual(result.cliIdentity.package, { expected: '@buildr-ai/buildr', observed: '@buildr-ai/buildr' });
  assert.deepEqual(result.cliIdentity.version, { expected: '0.1.0-test', observed: '0.1.0-test' });
  assert.equal(phase(result, 'finalize').operations.filter((item) => item.id === 'final-doctor').length, 1);
  assert.equal(phase(result, 'finalize').operations[0].executable, defaultBuildr);
});

test('默认CLI identity对PATH shadowing和旧symlink fail closed', async (t) => {
  for (const scenario of ['shadow', 'old-symlink']) {
    await t.test(scenario, (t) => {
      const current = fixture(t);
      const foreign = path.join(path.dirname(current.root), `${scenario}-launcher`);
      fs.writeFileSync(foreign, '#!/bin/sh\nexit 0\n', { mode: 0o755 });
      const shadowBin = path.join(path.dirname(current.root), `${scenario}-bin`);
      fs.mkdirSync(shadowBin);
      fs.symlinkSync(foreign, path.join(shadowBin, 'buildr'));
      const environment = scenario === 'shadow'
        ? { ...current.environment, PATH: `${shadowBin}${path.delimiter}${current.environment.PATH}` }
        : { ...current.environment, PATH: shadowBin };
      const result = runSelfBootstrapCloseout({
        finishResult: finishResult(current.root, current.baseRef, ['projects/product/services/buildr/src/example.mjs']),
        workspaceRoot: current.root,
        nodeExecutable: process.execPath,
        execute: executor(current.root),
        environment,
      });

      assert.equal(result.status, 'blocked');
      assert.equal(result.diagnostic.code, 'self-bootstrap-closeout.default-cli-launcher-mismatch');
      assert.equal(phase(result, 'finalize').status, 'not-applicable');
    });
  }
});

test('默认CLI identity对入口链、版本和启动失败 fail closed', async (t) => {
  const scenarios = [
    ['entry', { observedCliEntry: '/tmp/old-buildr.mjs' }, 'self-bootstrap-closeout.default-cli-entry-mismatch'],
    ['version', { observedVersion: '0.0.0-old' }, 'self-bootstrap-closeout.default-cli-version-mismatch'],
    ['startup', { failCliInspection: true }, 'self-bootstrap-closeout.default-cli-inspection-failed'],
  ];
  for (const [name, options, code] of scenarios) {
    await t.test(name, (t) => {
      const current = fixture(t);
      const result = runSelfBootstrapCloseout({
        finishResult: finishResult(current.root, current.baseRef, ['projects/product/services/buildr/src/example.mjs']),
        workspaceRoot: current.root,
        nodeExecutable: process.execPath,
        execute: executor(current.root, options),
        environment: current.environment,
      });

      assert.equal(result.status, 'blocked');
      assert.equal(result.diagnostic.code, code);
      assert.equal(phase(result, 'finalize').status, 'not-applicable');
      assert.equal(result.cliIdentity.status, 'blocked');
    });
  }
});

test('Doctor blocked preflight只排除同一run自有carrier', (t) => {
  const { root, baseRef, environment } = fixture(t);
  const input = doctorBlockedResult(root, baseRef, ['projects/product/services/buildr/src/example.mjs']);
  createCarrier(root);

  const result = runSelfBootstrapCloseout({ finishResult: input, workspaceRoot: root, nodeExecutable: process.execPath, execute: executor(root), environment });

  assert.equal(result.status, 'passed', JSON.stringify(result.diagnostic));
  assert.match(phase(result, 'preflight').operations.find((item) => item.id === 'preflight-untracked').stdout, /closeout-run/);
});

test('Doctor blocked preflight拒绝与run identity不匹配的carrier root', (t) => {
  const { root, baseRef, environment } = fixture(t);
  const input = doctorBlockedResult(root, baseRef, ['projects/product/services/buildr/src/example.mjs'], {
    carrier: {
      identity: 'sha256-carrier',
      changedPaths: ['projects/product/services/buildr/src/example.mjs'],
      root: createCarrier(root, 'different-run'),
    },
  });

  const result = runSelfBootstrapCloseout({ finishResult: input, workspaceRoot: root, nodeExecutable: process.execPath, execute: executor(root), environment });

  assert.equal(result.status, 'blocked');
  assert.equal(result.diagnostic.code, 'self-bootstrap-closeout.carrier-root-mismatch');
});

test('Doctor blocked preflight拒绝symlink carrier root', (t) => {
  const { root, baseRef, environment } = fixture(t);
  const input = doctorBlockedResult(root, baseRef, ['projects/product/services/buildr/src/example.mjs']);
  const outside = path.join(path.dirname(root), 'outside-carrier');
  const carrierRoot = path.join(root, '.buildr', 'transient', 'task-finish', 'carriers', input.runId);
  fs.mkdirSync(outside, { recursive: true });
  fs.mkdirSync(path.dirname(carrierRoot), { recursive: true });
  fs.symlinkSync(outside, carrierRoot);

  const result = runSelfBootstrapCloseout({ finishResult: input, workspaceRoot: root, nodeExecutable: process.execPath, execute: executor(root), environment });

  assert.equal(result.status, 'blocked');
  assert.equal(result.diagnostic.code, 'self-bootstrap-closeout.carrier-root-invalid');
});

test('Doctor blocked preflight仍阻断carrier外的untracked差异', (t) => {
  const { root, baseRef, environment } = fixture(t);
  const input = doctorBlockedResult(root, baseRef, ['projects/product/services/buildr/src/example.mjs']);
  createCarrier(root);
  fs.writeFileSync(path.join(root, 'unrelated.txt'), 'unrelated\n');

  const result = runSelfBootstrapCloseout({ finishResult: input, workspaceRoot: root, nodeExecutable: process.execPath, execute: executor(root), environment });

  assert.equal(result.status, 'blocked');
  assert.equal(result.diagnostic.code, 'self-bootstrap-closeout.workspace-dirty');
  assert.deepEqual(result.diagnostic.details.changedPaths, ['unrelated.txt']);
});

test('Doctor blocked preflight不排除carrier路径下的staged差异', (t) => {
  const { root, baseRef, environment } = fixture(t);
  const input = doctorBlockedResult(root, baseRef, ['projects/product/services/buildr/src/example.mjs']);
  const carrierRoot = createCarrier(root);
  git(root, 'add', '--', path.relative(root, path.join(carrierRoot, 'carrier.txt')));

  const result = runSelfBootstrapCloseout({ finishResult: input, workspaceRoot: root, nodeExecutable: process.execPath, execute: executor(root), environment });

  assert.equal(result.status, 'blocked');
  assert.equal(result.diagnostic.code, 'self-bootstrap-closeout.workspace-dirty');
  assert.deepEqual(result.diagnostic.details.changedPaths, ['.buildr/transient/task-finish/carriers/closeout-run/carrier.txt']);
});

test('plan identity由run、frozen paths和去重动作确定', () => {
  const root = '/tmp/buildr-plan';
  const result = finishResult(root, 'a'.repeat(40), [
    'projects/product/services/buildr/package/manifest.yml',
    'projects/product/services/buildr/package.json',
  ]);
  const first = createSelfBootstrapCloseoutPlan(result);
  const second = createSelfBootstrapCloseoutPlan(result);
  assert.deepEqual(first, second);
  assert.equal(first.actions['sync-retained-workspace'].length, 1);
  assert.equal(first.actions['install-development-cli'].length, 1);
  assert.equal(first.actions['install-development-local-app'].length, 1);
});

test('Skill命令入口通过Product CLI只读取得同一Finish Result', (t) => {
  const { root, baseRef, environment, defaultBuildr } = fixture(t);
  const finish = finishResult(root, baseRef, ['projects/product/services/buildr/src/example.mjs']);
  const result = runSelfBootstrapCloseoutCommand({
    args: ['--run', finish.runId, '--target', root, '--node-executable', process.execPath],
    actualNodeExecutable: process.execPath,
    execute: executor(root, { finishInspection: finish }),
    environment,
  });
  assert.equal(result.status, 'passed', JSON.stringify(result.diagnostic));
  assert.equal(phase(result, 'install-cli').status, 'passed');
  const defaultOperation = phase(result, 'finalize').operations.find((item) => item.kind === 'default-cli');
  assert.equal(defaultOperation.executable, defaultBuildr);
  assert.equal(result.runId, finish.runId);
});

test('Skill runner从每个Agent声明的runtime投射位置启动时不依赖Product源码相对路径', async (t) => {
  const sourceRunner = new URL('../../../../../../skills/buildr-self-bootstrap-sync/scripts/closeout.mjs', import.meta.url);

  for (const adapter of Object.values(RUNTIME_ADAPTERS)) {
    await t.test(adapter.id, (t) => {
      const base = fs.mkdtempSync(path.join(os.tmpdir(), `buildr-self-bootstrap-${adapter.id}-`));
      const runtimeRoot = skillDestinationRoot(adapter, 'workspace', base);
      const renderedDirectory = path.join(runtimeRoot, 'skills', 'buildr-self-bootstrap-sync', 'scripts');
      const renderedRunner = path.join(renderedDirectory, 'closeout.mjs');
      fs.mkdirSync(renderedDirectory, { recursive: true });
      fs.copyFileSync(sourceRunner, renderedRunner);
      t.after(() => fs.rmSync(base, { recursive: true, force: true }));

      const result = spawnSync(process.execPath, [renderedRunner], { cwd: base, encoding: 'utf8' });
      assert.equal(result.status, 1);
      assert.equal(result.stdout, '');
      const error = JSON.parse(result.stderr);
      assert.equal(error.schemaVersion, 'buildr.self-bootstrap-closeout-result/v1');
      assert.equal(error.status, 'blocked');
      assert.equal(error.diagnostic.code, 'self-bootstrap-closeout.arguments-incomplete');
    });
  }
});
