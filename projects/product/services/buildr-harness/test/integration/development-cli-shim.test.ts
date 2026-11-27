import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ExecutorStorage } from '../../src/application/executor-storage.ts';
import type { AgentExecutor } from '../../src/contracts.ts';
import { prepareDevelopmentCliEnvironment } from '../../src/storage/development-cli-environment.ts';
import { DEVELOPMENT_SOURCE_SCHEMA } from '../../src/process/development-cli-shim.ts';

function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function runGit(root: string, args: string[]): string {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function initGit(root: string): void {
  runGit(root, ['init', '-q']);
  runGit(root, ['config', 'user.name', 'Buildr Fixture']);
  runGit(root, ['config', 'user.email', 'fixture@example.com']);
  runGit(root, ['add', '.']);
  runGit(root, ['commit', '-qm', 'fixture']);
}

function sha256(value: string): string {
  return `sha256-${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function webProfileIdentity(profile: 'released' | 'development', dataRoot: string): string {
  const channel = profile === 'released' ? 'npm' : 'development';
  const runtimeRole = profile === 'released' ? 'host' : 'development';
  const rootIdentity = sha256(path.resolve(dataRoot));
  return sha256(JSON.stringify({
    schemaVersion: 'buildr.web-profile/v1',
    profile,
    channel,
    runtimeRole,
    rootIdentity,
  }));
}

function createWorkspace(root: string, name: string, dataRoot: string, profile: 'released' | 'development'): string {
  const target = path.join(root, name);
  const id = crypto.randomUUID();
  fs.mkdirSync(path.join(target, '.buildr'), { recursive: true });
  fs.writeFileSync(path.join(target, '.buildr', 'workspace.yml'), `schemaVersion: buildr.workspace/v1\nid: ${id}\nname: ${name}\ndescription: Shim fixture\n`);
  writeJson(path.join(dataRoot, 'workspace-registry.json'), {
    schemaVersion: 'buildr.local-workspace-registry/v1',
    roots: [target],
    lastOpenedRoot: target,
  });
  writeJson(path.join(target, '.buildr', 'local', 'web-management.json'), {
    schemaVersion: 'buildr.workspace-web-management/v1',
    workspaceId: id,
    canonicalRoot: target,
    claimedAt: '2026-11-24T00:00:00.000Z',
    owner: {
      schemaVersion: 'buildr.workspace-web-management-owner/v1',
      profile,
      channel: profile === 'released' ? 'npm' : 'development',
      runtimeRole: profile === 'released' ? 'host' : 'development',
      profileIdentity: webProfileIdentity(profile, dataRoot),
    },
  });
  return target;
}

function createDevelopmentSource(base: string, dataRoot: string): { sourceRoot: string; entry: string; sourceFile: string } {
  const gitRoot = path.join(base, 'dev-checkout');
  const sourceRoot = path.join(gitRoot, 'projects', 'product', 'services', 'buildr');
  const entry = path.join(sourceRoot, 'bin', 'buildr.mjs');
  fs.mkdirSync(path.join(sourceRoot, 'src'), { recursive: true });
  fs.mkdirSync(path.join(sourceRoot, 'resources'), { recursive: true });
  fs.mkdirSync(path.join(sourceRoot, 'tools', 'development', 'programs'), { recursive: true });
  fs.mkdirSync(path.dirname(entry), { recursive: true });
  fs.writeFileSync(path.resolve(sourceRoot, '..', '..', '.node-version'), '24.15.0\n');
  writeJson(path.join(sourceRoot, 'package.json'), { name: '@buildr-ai/buildr', version: '9.9.9-dev' });
  fs.writeFileSync(path.join(sourceRoot, 'resources', 'manifest.yml'), 'schemaVersion: buildr.resources/v1\n');
  fs.writeFileSync(
    entry,
    `process.stdout.write(JSON.stringify({ source: 'development', argv: process.argv.slice(2), cwd: process.cwd(), appData: process.env.BUILDR_APP_DATA_DIR, routedEntry: process.env.BUILDR_WORKSPACE_CLI_ROUTED_ENTRY, npmEntry: process.env.BUILDR_NPM_ENTRY_PATH ?? null }));\n`,
  );
  initGit(gitRoot);

  const sourceFile = path.join(dataRoot, 'development-source.json');
  writeJson(sourceFile, {
    schemaVersion: DEVELOPMENT_SOURCE_SCHEMA,
    channel: 'development',
    runtimeRole: 'development',
    source: 'checkout',
    platform: process.platform,
    protocolIdentity: 'buildr.web-protocol/v1',
    sourceRoot,
    workspaceRoot: gitRoot,
    launcherTarget: path.join(base, 'Buildr Dev'),
    buildId: 'fixture-dev',
    version: '9.9.9-dev',
    updatedAt: '2026-11-24T00:00:00.000Z',
    developmentRuntime: {
      executable: process.execPath,
      version: process.versions.node,
      identity: `development-host:${fs.realpathSync(process.execPath)}:${process.versions.node}`,
    },
  });
  return { sourceRoot, entry, sourceFile };
}

function fakeExecutor(): AgentExecutor {
  return {
    descriptor: {
      id: 'codex',
      label: 'Codex',
      capabilities: {
        text: true,
        images: false,
        approval: true,
        questions: true,
        stop: true,
        resume: true,
        maxInputBytes: 1024,
      },
    },
    async open() { throw new Error('unused'); },
  };
}

test('ExecutorStorage injects dev-cli-bin only for registered development profile', (t) => {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-dev-shim-storage-')));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));

  const releasedDataRoot = path.join(base, 'released-data');
  const releasedStorageRoot = path.join(releasedDataRoot, 'agent-service');
  fs.mkdirSync(releasedStorageRoot, { recursive: true });
  createDevelopmentSource(base, releasedDataRoot);

  const releasedStorage = new ExecutorStorage(releasedStorageRoot, { profileId: 'released' });
  const releasedOptions = releasedStorage.options(fakeExecutor(), {
    connectionId: 'codex',
    configRoot: path.join(releasedStorageRoot, 'connections', 'codex'),
    environment: { HOME: base, PATH: '/usr/bin' },
  });
  assert.equal(fs.existsSync(path.join(releasedStorageRoot, 'toolchains', 'dev-cli-bin')), false);
  assert.doesNotMatch(releasedOptions.environment.PATH ?? '', /dev-cli-bin/);

  const unregisteredDevData = path.join(base, 'isolated-dev-unregistered');
  const unregisteredDevStorage = path.join(unregisteredDevData, 'agent-service');
  fs.mkdirSync(unregisteredDevStorage, { recursive: true });
  const unregEnv = prepareDevelopmentCliEnvironment(unregisteredDevStorage, 'development', { HOME: base, PATH: '/usr/bin' }, {
    defaultDevelopmentDataRoot: path.join(base, 'host-default-dev'),
  });
  assert.equal(fs.existsSync(path.join(unregisteredDevStorage, 'toolchains', 'dev-cli-bin')), false);
  assert.equal(unregEnv.PATH, '/usr/bin');

  const registeredDevData = path.join(base, 'isolated-dev-registered');
  const registeredDevStorage = path.join(registeredDevData, 'agent-service');
  fs.mkdirSync(registeredDevStorage, { recursive: true });
  createDevelopmentSource(path.join(base, 'reg'), registeredDevData);
  const devStorage = new ExecutorStorage(registeredDevStorage, { profileId: 'development' });
  const devOptions = devStorage.options(fakeExecutor(), {
    connectionId: 'codex',
    configRoot: path.join(registeredDevStorage, 'connections', 'codex'),
    environment: { HOME: base, PATH: '/usr/bin' },
  });
  const shimDir = path.join(registeredDevStorage, 'toolchains', 'dev-cli-bin');
  assert.equal(devOptions.environment.PATH?.split(path.delimiter)[0], shimDir);
  assert.equal(fs.existsSync(path.join(shimDir, process.platform === 'win32' ? 'buildr.cmd' : 'buildr')), true);
});

test('development session shim bypasses broken/absent global npm for development workspaces and delegates global or released commands cleanly', (t) => {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-dev-shim-routing-')));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));

  const devDataRoot = path.join(base, 'dev-data');
  const storageRoot = path.join(devDataRoot, 'agent-service');
  const releasedDataRoot = path.join(devDataRoot, '.peer', 'released');
  fs.mkdirSync(storageRoot, { recursive: true });
  const dev = createDevelopmentSource(base, devDataRoot);
  const devWorkspace = createWorkspace(base, 'dev-workspace', devDataRoot, 'development');
  const releasedWorkspace = createWorkspace(base, 'released-workspace', releasedDataRoot, 'released');
  const unregisteredDir = path.join(base, 'unregistered-dir');
  fs.mkdirSync(unregisteredDir, { recursive: true });

  const devStorage = new ExecutorStorage(storageRoot, { profileId: 'development' });
  const downstreamBin = path.join(base, 'downstream-bin');
  fs.mkdirSync(downstreamBin, { recursive: true });

  // First test without ANY downstream buildr in PATH: development workspace & unregistered dir still succeed!
  const noGlobalEnv = devStorage.options(fakeExecutor(), {
    connectionId: 'codex',
    configRoot: path.join(storageRoot, 'connections', 'codex'),
    environment: {
      HOME: base,
      PATH: [path.dirname(process.execPath), '/usr/bin', '/bin'].join(path.delimiter),
      BUILDR_NPM_ENTRY_PATH: '/stale/npm/bin/buildr.mjs',
    },
  }).environment;
  const shimCommand = path.join(storageRoot, 'toolchains', 'dev-cli-bin', process.platform === 'win32' ? 'buildr.cmd' : 'buildr');

  const devRun = spawnSync(shimCommand, ['future-cmd', '中文 参数'], { cwd: devWorkspace, env: noGlobalEnv, encoding: 'utf8' });
  assert.equal(devRun.status, 0, devRun.stderr);
  const devOutput = JSON.parse(devRun.stdout);
  assert.equal(devOutput.source, 'development');
  assert.deepEqual(devOutput.argv, ['future-cmd', '中文 参数']);
  assert.equal(devOutput.cwd, devWorkspace);
  assert.equal(devOutput.appData, devDataRoot);
  assert.equal(devOutput.routedEntry, dev.entry);
  assert.equal(devOutput.npmEntry, null);

  // Bare `buildr` lookup via PATH resolves to dev-cli-bin first without needing an absolute shim path.
  const bareCommand = process.platform === 'win32' ? 'buildr.cmd' : 'buildr';
  const bareRun = spawnSync(bareCommand, ['bare-cmd'], {
    cwd: devWorkspace,
    env: noGlobalEnv,
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });
  assert.equal(bareRun.status, 0, bareRun.stderr);
  assert.equal(JSON.parse(bareRun.stdout).source, 'development');
  assert.deepEqual(JSON.parse(bareRun.stdout).argv, ['bare-cmd']);

  const unregRun = spawnSync(shimCommand, ['init', '--name', 'fresh'], { cwd: unregisteredDir, env: noGlobalEnv, encoding: 'utf8' });
  assert.equal(unregRun.status, 0, unregRun.stderr);
  assert.equal(JSON.parse(unregRun.stdout).source, 'development');

  // Install a fake downstream global buildr (to simulate npm CLI) and verify delegation strips dev-cli-bin!
  if (process.platform === 'win32') {
    fs.writeFileSync(
      path.join(downstreamBin, 'buildr.cmd'),
      `@echo off\r\n"${process.execPath}" -e "console.log(JSON.stringify({ source: 'downstream', argv: process.argv.slice(1), cwd: process.cwd(), path: process.env.PATH, appData: process.env.BUILDR_APP_DATA_DIR ?? null }))" %*\r\n`,
    );
  } else {
    fs.writeFileSync(
      path.join(downstreamBin, 'buildr'),
      `#!/bin/sh\nexec '${process.execPath.replaceAll("'", "'\\''")}' -e "console.log(JSON.stringify({ source: 'downstream', argv: process.argv.slice(1), cwd: process.cwd(), path: process.env.PATH, appData: process.env.BUILDR_APP_DATA_DIR ?? null }))" "$@"\n`,
      { mode: 0o755 },
    );
  }

  const withGlobalEnv = devStorage.options(fakeExecutor(), {
    connectionId: 'codex',
    configRoot: path.join(storageRoot, 'connections', 'codex'),
    environment: {
      HOME: base,
      BUILDR_APP_DATA_DIR: devDataRoot,
      PATH: [downstreamBin, path.dirname(process.execPath), '/usr/bin', '/bin'].join(path.delimiter),
    },
  }).environment;

  // Even with a broken/different global buildr on PATH, dev workspace still goes directly to local dev checkout!
  const devStillDirect = spawnSync(shimCommand, ['task', 'list', '--json'], { cwd: devWorkspace, env: withGlobalEnv, encoding: 'utf8' });
  assert.equal(devStillDirect.status, 0, devStillDirect.stderr);
  assert.equal(JSON.parse(devStillDirect.stdout).source, 'development');

  // Global installation commands and released workspaces strip shimDir and delegate downstream!
  for (const [args, cwd] of [
    [['update', '--track', 'candidate'], devWorkspace],
    [['installation', 'status', '--json'], devWorkspace],
    [['web', 'launcher', 'status'], devWorkspace],
    [['web'], devWorkspace],
    [['task', 'list', '--json'], releasedWorkspace],
    [['web', '--target', releasedWorkspace], devWorkspace],
  ] as const) {
    const delegated = spawnSync(shimCommand, [...args], { cwd, env: withGlobalEnv, encoding: 'utf8' });
    assert.equal(delegated.status, 0, `${args.join(' ')}: ${delegated.stderr}`);
    const payload = JSON.parse(delegated.stdout);
    assert.equal(payload.source, 'downstream');
    assert.deepEqual(payload.argv, [...args]);
    assert.equal(payload.cwd, cwd);
    assert.doesNotMatch(payload.path, /dev-cli-bin/);
    assert.equal(payload.appData, releasedDataRoot);
  }

  // Dual-registered conflict or corrupt development-source.json fails closed without falling back downstream.
  writeJson(path.join(releasedDataRoot, 'workspace-registry.json'), {
    schemaVersion: 'buildr.local-workspace-registry/v1',
    roots: [releasedWorkspace, devWorkspace],
    lastOpenedRoot: devWorkspace,
  });
  const conflictRun = spawnSync(shimCommand, ['task', 'list'], { cwd: devWorkspace, env: withGlobalEnv, encoding: 'utf8' });
  assert.notEqual(conflictRun.status, 0);
  assert.match(conflictRun.stderr, /workspace_cli\.management_conflict/);

  writeJson(path.join(releasedDataRoot, 'workspace-registry.json'), {
    schemaVersion: 'buildr.local-workspace-registry/v1',
    roots: [releasedWorkspace],
    lastOpenedRoot: releasedWorkspace,
  });
  fs.writeFileSync(dev.sourceFile, '{broken');
  const corruptRun = spawnSync(shimCommand, ['task', 'list'], { cwd: devWorkspace, env: withGlobalEnv, encoding: 'utf8' });
  assert.notEqual(corruptRun.status, 0);
  assert.match(corruptRun.stderr, /workspace_cli\.development_unavailable/);
});

test('compiled development-cli-environment emits executable .js shim wrapper', async (t) => {
  const { prepareDevelopmentCliEnvironment: prepareCompiled } = await import('../../build/storage/development-cli-environment.js');
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-dev-shim-compiled-')));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));

  const devDataRoot = path.join(base, 'dev-data');
  const storageRoot = path.join(devDataRoot, 'agent-service');
  fs.mkdirSync(storageRoot, { recursive: true });
  createDevelopmentSource(base, devDataRoot);
  const devWorkspace = createWorkspace(base, 'dev-workspace', devDataRoot, 'development');

  const compiledEnv = prepareCompiled(storageRoot, 'development', {
    HOME: base,
    PATH: [path.dirname(process.execPath), '/usr/bin', '/bin'].join(path.delimiter),
  });
  const shimDir = path.join(storageRoot, 'toolchains', 'dev-cli-bin');
  const wrapper = path.join(shimDir, process.platform === 'win32' ? 'buildr.cmd' : 'buildr');
  const wrapperText = fs.readFileSync(wrapper, 'utf8');
  assert.match(wrapperText, /build[\\/]process[\\/]development-cli-shim\.js/);
  assert.equal(compiledEnv.PATH?.split(path.delimiter)[0], shimDir);

  const run = spawnSync(wrapper, ['compiled-check'], { cwd: devWorkspace, env: compiledEnv, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(JSON.parse(run.stdout).source, 'development');
  assert.deepEqual(JSON.parse(run.stdout).argv, ['compiled-check']);
});
