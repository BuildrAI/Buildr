#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { sameFilesystemPath } from '../../../src/infrastructure/filesystem/filesystem-path-identity.mjs';
import { buildApplicationPayload } from '../../../scripts/release/application-payload.mjs';
import { createReleaseArtifact, readReleaseArtifact } from '../../../scripts/release/release-artifact.mjs';
import { officialRegistry } from '../../../scripts/release/registry-version-state.mjs';
import { readSharedCandidatePackage } from './candidate-package.mjs';

const productRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const packageName = '@buildr-ai/buildr';
const exactRegistryPackagePattern = /^@buildr-ai\/buildr@(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/;
const npmExecutable = process.platform === 'win32' ? 'npm.cmd' : 'npm';

export const RELEASE_ARTIFACT_MANIFEST_ENV = 'BUILDR_RELEASE_ARTIFACT_MANIFEST';
export const RELEASE_PACKAGE_SPEC_ENV = 'BUILDR_RELEASE_PACKAGE_SPEC';

export function resolveReleaseSmokeSource(env = process.env) {
  const candidateRequested = Boolean(env.BUILDR_CANDIDATE_TARBALL || env.BUILDR_CANDIDATE_PACK_METADATA);
  const artifactRequested = Boolean(env[RELEASE_ARTIFACT_MANIFEST_ENV]);
  const registryRequested = Boolean(env[RELEASE_PACKAGE_SPEC_ENV]);
  const explicitSources = [candidateRequested, artifactRequested, registryRequested].filter(Boolean).length;
  if (explicitSources > 1) throw new Error('release smoke accepts exactly one explicit package source');

  if (candidateRequested) {
    const shared = readSharedCandidatePackage(env);
    return {
      kind: 'candidate-tarball',
      installTarget: shared.tarball,
      expectedName: shared.metadata.name ?? packageName,
      expectedVersion: shared.metadata.version ?? null,
      offline: true,
    };
  }
  if (artifactRequested) {
    const artifact = readReleaseArtifact(env[RELEASE_ARTIFACT_MANIFEST_ENV], { packageName });
    return {
      kind: 'release-artifact',
      installTarget: artifact.tarball,
      expectedName: artifact.manifest.packageName,
      expectedVersion: artifact.manifest.version,
      offline: true,
    };
  }
  if (registryRequested) {
    const match = exactRegistryPackagePattern.exec(env[RELEASE_PACKAGE_SPEC_ENV]);
    if (!match) throw new Error('registry release smoke requires exact @buildr-ai/buildr@<version> package spec');
    return {
      kind: 'official-registry',
      installTarget: env[RELEASE_PACKAGE_SPEC_ENV],
      expectedName: packageName,
      expectedVersion: match[1],
      offline: false,
    };
  }
  return { kind: 'standalone-pack', installTarget: null, expectedName: packageName, expectedVersion: null, offline: true };
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? productRoot,
    encoding: 'utf8',
    env: { ...process.env, ...options.env },
    shell: process.platform === 'win32' && command === npmExecutable,
  });
  if (result.status !== (options.expectedStatus ?? 0)) {
    throw new Error(`${command} ${args.join(' ')} exited ${result.status}:\n${result.stdout}\n${result.stderr}`);
  }
  return result.stdout;
}

function parseJson(label, output, schemaVersion) {
  const payload = JSON.parse(output);
  assert.equal(payload.schemaVersion, schemaVersion, `${label} schemaVersion`);
  return payload;
}

async function waitForWebReadiness({ appData, child = null, stderr = () => '' }) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    let instance = null;
    try { instance = JSON.parse(fs.readFileSync(path.join(appData, 'instance.json'), 'utf8')); } catch {}
    if (instance) {
      const response = await fetch(`${instance.url}/api/v1/health`, { headers: { 'x-buildr-instance': instance.secret } });
      assert.equal(response.status, 200);
      const health = await response.json();
      assert.equal(health.schemaVersion, 'buildr.local-app-health/v1');
      assert.equal(health.status, 'ready');
      if (child) assert.equal(health.pid, child.pid);
      return health;
    }
    if (child?.exitCode !== null && child) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Buildr Web did not become ready: ${stderr()}`);
}

async function waitForProcessExit(pid, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { process.kill(pid, 0); } catch (error) {
      if (error.code === 'ESRCH') return;
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Process ${pid} did not exit within ${timeoutMs}ms.`);
}

async function waitForChildClose(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return true;
  return new Promise((resolve) => {
    const onClose = () => {
      clearTimeout(timer);
      resolve(true);
    };
    const timer = setTimeout(() => {
      child.off('close', onClose);
      resolve(false);
    }, timeoutMs);
    child.once('close', onClose);
  });
}

async function stopChildProcess(child, timeoutMs = 2_000) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  if (await waitForChildClose(child, timeoutMs)) return;
  child.kill('SIGKILL');
  await waitForChildClose(child, timeoutMs);
}

export function cleanupReleaseSmokeRoot(root, options = {}) {
  const removeRoot = options.removeRoot ?? ((target) => fs.rmSync(target, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }));
  const warn = options.warn ?? console.warn;
  try {
    removeRoot(root);
    return { status: 'cleaned', root };
  } catch (error) {
    warn(`Buildr release smoke retained temporary root ${root}: ${error.code ?? error.message}`);
    return { status: 'retained', root, error };
  }
}

export async function runReleaseSmoke(env = process.env) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-release-smoke-'));
  const packDirectory = path.join(root, 'pack');
  const prefix = path.join(root, 'prefix');
  const workspace = path.join(root, 'workspace');
  const appData = path.join(root, 'app-data');
  const npmCache = path.join(root, 'npm-cache');
  const runtimeData = process.env.BUILDR_NODE_RUNTIME_DATA_DIR || appData;
  const runtimeEnv = {
    BUILDR_APP_DATA_DIR: appData,
    BUILDR_NODE_RUNTIME_DATA_DIR: runtimeData,
    npm_config_cache: npmCache,
    npm_config_update_notifier: 'false',
  };
  const source = resolveReleaseSmokeSource(env);
  let web = null;
  let launcherProcess = null;

  function runBuildr(buildrScript, args) {
    return run(process.execPath, [buildrScript, ...args], {
      cwd: workspace,
      env: runtimeEnv,
    });
  }

  try {
    fs.mkdirSync(packDirectory, { recursive: true });
    fs.mkdirSync(workspace, { recursive: true });

    let installTarget = source.installTarget;
    let expectedVersion = source.expectedVersion;
    if (!installTarget) {
      const sourceCommit = run('git', ['rev-parse', 'HEAD'], { cwd: productRoot }).trim();
      const payload = await buildApplicationPayload(path.join(root, 'application-payload'), sourceCommit);
      const artifact = createReleaseArtifact(payload.root, packDirectory);
      installTarget = artifact.tarball;
      expectedVersion = artifact.manifest.version;
    }
    const installArgs = source.offline
      ? ['install', '--offline', '--global', '--prefix', prefix, installTarget]
      : ['install', '--prefer-online', '--global', '--prefix', prefix, '--registry', officialRegistry, installTarget];
    run(npmExecutable, installArgs, { env: runtimeEnv });

    const modulesRoot = process.platform === 'win32' ? path.join(prefix, 'node_modules') : path.join(prefix, 'lib', 'node_modules');
    const installedPackageRoot = path.join(modulesRoot, '@buildr-ai', 'buildr');
    const installedMetadata = JSON.parse(fs.readFileSync(path.join(installedPackageRoot, 'package.json'), 'utf8'));
    assert.equal(installedMetadata.name, source.expectedName, 'installed package name');
    if (expectedVersion) assert.equal(installedMetadata.version, expectedVersion, 'installed package version');
    const buildrScript = path.join(installedPackageRoot, 'bin', 'buildr.mjs');
    assert.equal(fs.existsSync(buildrScript), true, 'installed Buildr executable source must exist');

    const launcherTarget = process.platform === 'darwin'
      ? path.join(root, 'Applications', 'Buildr Web.app')
      : process.platform === 'win32'
        ? path.join(root, 'Start Menu', 'Buildr Web.lnk')
        : null;
    if (launcherTarget) assert.equal(fs.existsSync(launcherTarget), false, 'ordinary npm install must not create a graphical Launcher');

    const updateCheck = parseJson('registry update check', run(process.execPath, [buildrScript, 'update', 'check', '--json'], {
      cwd: workspace,
      expectedStatus: 1,
      env: {
        ...runtimeEnv,
        npm_config_registry: 'http://127.0.0.1:9',
        npm_config_fetch_retries: '0',
        npm_config_fetch_timeout: '1000',
      },
    }), 'buildr.update-check/v1');
    assert.equal(updateCheck.mode, 'npm');
    assert.equal(updateCheck.status, 'blocked');

    assert.equal(fs.existsSync(path.join(appData, 'instance.json')), false, 'ordinary CLI must not start HTTP');
    let webStderr = '';
    web = spawn(process.execPath, [buildrScript, 'web', '--no-open', '--port', '0'], {
      cwd: workspace,
      env: { ...process.env, ...runtimeEnv },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    web.stderr.setEncoding('utf8');
    web.stderr.on('data', (chunk) => { webStderr += chunk; });
    const health = await waitForWebReadiness({ appData, child: web, stderr: () => webStderr });
    assert.equal(health.productIdentity.channel, 'npm');
    await stopChildProcess(web);
    web = null;

    if (launcherTarget) {
      const installedLauncher = parseJson('launcher install', runBuildr(buildrScript, ['web', 'launcher', 'install', '--target', launcherTarget, '--json']), 'buildr.launcher-status/v1');
      assert.equal(installedLauncher.status, 'ready');
      assert.equal(sameFilesystemPath(installedLauncher.binding.hostNode.path, process.execPath), true);
      assert.equal(sameFilesystemPath(installedLauncher.binding.packageEntry.path, buildrScript), true);
      assert.equal(installedLauncher.binding.installationOwnershipIdentity, health.productIdentity.installationIdentity);

      if (process.platform === 'darwin') {
        launcherProcess = spawn(path.join(launcherTarget, 'Contents', 'MacOS', 'Buildr Web'), [], {
          cwd: workspace,
          env: { ...process.env, ...runtimeEnv, BUILDR_LAUNCHER_NO_OPEN: '1' },
          stdio: ['ignore', 'ignore', 'pipe'],
        });
      } else {
        launcherProcess = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Start-Process -FilePath $env:BUILDR_LAUNCHER_SHORTCUT -Wait'], {
          cwd: workspace,
          env: { ...process.env, ...runtimeEnv, BUILDR_LAUNCHER_NO_OPEN: '1', BUILDR_LAUNCHER_SHORTCUT: launcherTarget },
          stdio: ['ignore', 'ignore', 'pipe'],
        });
      }
      const launcherHealth = await waitForWebReadiness({ appData });
      assert.equal(launcherHealth.productIdentity.installationIdentity, health.productIdentity.installationIdentity);
      assert.equal(launcherHealth.launcherIdentity.bindingIdentity, installedLauncher.binding.bindingIdentity);
      try { process.kill(launcherHealth.pid, 'SIGTERM'); } catch {}
      await waitForProcessExit(launcherHealth.pid);
      await stopChildProcess(launcherProcess);

      if (process.platform === 'darwin') {
        fs.appendFileSync(path.join(launcherTarget, 'Contents', 'MacOS', 'Buildr Web'), '\n# drift\n');
      } else {
        const driftScript = '$shell=New-Object -ComObject WScript.Shell; $s=$shell.CreateShortcut($env:BUILDR_LAUNCHER_SHORTCUT); $s.Arguments="foreign"; $s.Save()';
        run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', driftScript], {
          cwd: workspace,
          env: { ...runtimeEnv, BUILDR_LAUNCHER_SHORTCUT: launcherTarget },
        });
      }
      const stale = parseJson('launcher drift status', run(process.execPath, [buildrScript, 'web', 'launcher', 'status', '--target', launcherTarget, '--json'], {
        cwd: workspace,
        env: runtimeEnv,
        expectedStatus: 1,
      }), 'buildr.launcher-status/v1');
      assert.ok(['stale', 'invalid'].includes(stale.status));
      const repaired = parseJson('launcher repair', runBuildr(buildrScript, ['web', 'launcher', 'repair', '--target', launcherTarget, '--json']), 'buildr.launcher-status/v1');
      assert.equal(repaired.status, 'ready');
      const uninstalled = parseJson('launcher uninstall', runBuildr(buildrScript, ['web', 'launcher', 'uninstall', '--target', launcherTarget, '--json']), 'buildr.launcher-status/v1');
      assert.equal(uninstalled.status, 'absent');
      assert.equal(fs.existsSync(installedPackageRoot), true, 'Launcher uninstall must retain the npm package');
    }

    runBuildr(buildrScript, ['init', '--agent', 'codex', '--target', workspace, '--name', 'release-smoke', '--profile', 'team']);
    runBuildr(buildrScript, ['sync', 'codex', '--target', workspace]);
    const doctorBefore = parseJson('doctor before uninstall', runBuildr(buildrScript, ['doctor', '--agent', 'codex', '--target', workspace, '--json']), 'buildr.doctor/v1');
    assert.equal(doctorBefore.summary.error, 0);

    runBuildr(buildrScript, ['component', 'uninstall', 'openspec', '--agent', 'codex', '--target', workspace, '--reason', 'release-smoke']);
    const doctorAfter = parseJson('doctor after uninstall', runBuildr(buildrScript, ['doctor', '--agent', 'codex', '--target', workspace, '--json']), 'buildr.doctor/v1');
    assert.equal(doctorAfter.summary.error, 0);
    assert.equal(fs.existsSync(path.join(workspace, '.agents', 'skills', 'openspec-explore')), false);

    console.log(`Buildr release smoke passed from ${source.kind} on ${process.platform} with Node ${process.versions.node}.`);
    return { source: source.kind, version: installedMetadata.version };
  } finally {
    await stopChildProcess(web);
    await stopChildProcess(launcherProcess);
    cleanupReleaseSmokeRoot(root);
  }
}

if (process.argv[1] && sameFilesystemPath(process.argv[1], fileURLToPath(import.meta.url))) await runReleaseSmoke();
