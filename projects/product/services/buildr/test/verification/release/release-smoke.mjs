#!/usr/bin/env node

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { sameFilesystemPath } from '../../../src/infrastructure/filesystem/filesystem-path-identity.mjs';
import { buildApplicationPayload } from '../../../tools/release/application-payload.mjs';
import { createReleaseArtifact, readReleaseArtifact } from '../../../tools/release/release-artifact.mjs';
import { officialRegistry } from '../../../tools/release/registry-version-state.mjs';
import { readSharedCandidatePackage } from './candidate-package.mjs';
import { buildGeneratedArtifactSet } from '../../../tools/build/artifact-set.ts';
import { cleanupVerificationHarnessRoot, createVerificationPhaseRecorder } from '../timing/phases.mjs';
import { createExactNodeExecutionEnvironment } from '../../../src/infrastructure/process.mjs';

const productRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const packageName = '@buildr-ai/buildr';
const exactRegistryPackagePattern = /^@buildr-ai\/buildr@(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/;
const platformLauncherIntegration = process.argv.includes('--platform-launcher');

export const RELEASE_ARTIFACT_MANIFEST_ENV = 'BUILDR_RELEASE_ARTIFACT_MANIFEST';
export const RELEASE_PACKAGE_SPEC_ENV = 'BUILDR_RELEASE_PACKAGE_SPEC';
export const RELEASE_LAUNCHER_READINESS_TIMEOUT_MS = 15_000;
export const RELEASE_READINESS_POLL_INTERVAL_MS = 50;

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
    shell: process.platform === 'win32' && /\.cmd$/i.test(command),
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

function observeProcess(pid, options = {}) {
  const platform = options.platform ?? process.platform;
  const kill = options.kill ?? process.kill;
  const runProcess = options.runProcess ?? spawnSync;
  const numericPid = Number(pid);
  if (!Number.isInteger(numericPid) || numericPid <= 0) return { pid: null, processGroupId: null, alive: false, observation: 'pid-unavailable' };
  let alive = false;
  try {
    kill(numericPid, 0);
    alive = true;
  } catch (error) {
    if (error.code !== 'ESRCH') return { pid: numericPid, processGroupId: null, alive: false, observation: `pid-probe-failed:${error.code ?? error.message}` };
  }
  if (!alive || platform === 'win32') return { pid: numericPid, processGroupId: null, alive, observation: alive ? 'pid-alive' : 'pid-exited' };
  const sampled = runProcess('/bin/ps', ['-p', String(numericPid), '-o', 'pid=,ppid=,pgid=,etime='], { encoding: 'utf8' });
  if (sampled.status !== 0 || !sampled.stdout.trim()) {
    return { pid: numericPid, processGroupId: null, alive, observation: `ps-unavailable:${sampled.status}` };
  }
  const [observedPid, parentPid, processGroupId, elapsed] = sampled.stdout.trim().split(/\s+/u);
  return {
    pid: Number(observedPid),
    parentPid: Number(parentPid),
    processGroupId: Number(processGroupId),
    elapsed,
    alive,
    observation: 'ps-sampled',
  };
}

function readJsonIfPresent(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function sanitizeInstance(instance) {
  if (!instance || typeof instance !== 'object') return null;
  const { secret, ...portable } = instance;
  return { ...portable, secretPresent: typeof secret === 'string' && secret.length > 0 };
}

function launcherFailureEvidenceBase(env = process.env) {
  const phaseOutput = env.BUILDR_VERIFICATION_PHASE_OUTPUT;
  if (phaseOutput) return path.resolve(phaseOutput).replace(/\.phases\.jsonl$/u, '');
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-release-launcher-failure-')), 'release-tarball-smoke');
}

export function preserveLauncherFailureEvidence(options) {
  const base = launcherFailureEvidenceBase(options.env);
  const evidencePath = `${base}.launcher-failure.json`;
  const retainedLogPath = `${base}.launcher.log`;
  const instancePath = path.join(options.appData, 'instance.json');
  const instance = readJsonIfPresent(instancePath);
  const processObservation = options.error?.readiness?.process ?? observeProcess(instance?.pid);
  const launcherLogPath = options.launcherHome
    ? path.join(options.launcherHome, 'Library', 'Logs', 'Buildr', 'launcher.log')
    : null;
  let launcherLog = null;
  if (launcherLogPath && fs.statSync(launcherLogPath, { throwIfNoEntry: false })?.isFile()) {
    fs.mkdirSync(path.dirname(retainedLogPath), { recursive: true });
    fs.copyFileSync(launcherLogPath, retainedLogPath);
    launcherLog = {
      sourcePath: launcherLogPath,
      retainedPath: retainedLogPath,
      sha256: `sha256-${crypto.createHash('sha256').update(fs.readFileSync(retainedLogPath)).digest('hex')}`,
    };
  }
  const readiness = options.error?.readiness ?? {};
  const evidence = {
    schemaVersion: 'buildr.release-launcher-failure-evidence/v1',
    status: 'failed',
    startup: options.startup,
    elapsedMs: readiness.elapsedMs ?? Math.max(0, Date.now() - options.startedAt),
    budgetMs: readiness.budgetMs ?? RELEASE_LAUNCHER_READINESS_TIMEOUT_MS,
    launcherTarget: options.launcherTarget,
    instancePath,
    instance: sanitizeInstance(instance),
    process: processObservation,
    node: options.nodeAudit,
    launcherLog,
    error: options.error?.message ?? 'Launcher readiness failed.',
  };
  fs.mkdirSync(path.dirname(evidencePath), { recursive: true });
  fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  return { evidencePath, retainedLogPath: launcherLog?.retainedPath ?? null, evidence };
}

export async function waitForWebReadiness({
  appData,
  child = null,
  stderr = () => '',
  fetchHealth = fetch,
  timeoutMs = RELEASE_LAUNCHER_READINESS_TIMEOUT_MS,
  pollIntervalMs = RELEASE_READINESS_POLL_INTERVAL_MS,
  now = Date.now,
  wait = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)),
}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('Buildr Web readiness timeout must be a positive number.');
  if (!Number.isFinite(pollIntervalMs) || pollIntervalMs <= 0) throw new Error('Buildr Web readiness poll interval must be a positive number.');
  const startedAt = now();
  let lastConnectionError = null;
  let attempts = 0;
  let lastInstance = null;
  while (now() - startedAt < timeoutMs) {
    attempts += 1;
    let instance = null;
    try { instance = JSON.parse(fs.readFileSync(path.join(appData, 'instance.json'), 'utf8')); } catch {}
    lastInstance = instance ?? lastInstance;
    if (instance) {
      let response = null;
      try {
        response = await fetchHealth(`${instance.url}/api/v1/health`, { headers: { 'x-buildr-instance': instance.secret } });
      } catch (error) {
        lastConnectionError = error;
      }
      if (!response) {
        if (child?.exitCode !== null && child) break;
        await wait(Math.min(pollIntervalMs, Math.max(1, timeoutMs - (now() - startedAt))));
        continue;
      }
      assert.equal(response.status, 200);
      const health = await response.json();
      assert.equal(health.schemaVersion, 'buildr.local-app-health/v1');
      assert.equal(health.status, 'ready');
      if (child) assert.equal(health.pid, child.pid);
      return { ...health, url: instance.url };
    }
    if (child?.exitCode !== null && child) break;
    await wait(Math.min(pollIntervalMs, Math.max(1, timeoutMs - (now() - startedAt))));
  }
  const elapsedMs = Math.max(0, now() - startedAt);
  const processObservation = observeProcess(lastInstance?.pid ?? child?.pid);
  const error = new Error(`Buildr Web did not become ready within ${timeoutMs}ms: elapsed=${elapsedMs}ms instance=${path.join(appData, 'instance.json')} pid=${processObservation.pid ?? 'n/a'} pgid=${processObservation.processGroupId ?? 'n/a'} ${stderr()}${lastConnectionError ? ` (${lastConnectionError.cause?.code ?? lastConnectionError.message})` : ''}`.trim());
  error.readiness = {
    elapsedMs,
    budgetMs: timeoutMs,
    attempts,
    instancePath: path.join(appData, 'instance.json'),
    process: processObservation,
    lastConnectionError: lastConnectionError ? lastConnectionError.cause?.code ?? lastConnectionError.message : null,
  };
  throw error;
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

async function canBindLoopbackPort(port) {
  const probe = net.createServer();
  return new Promise((resolve, reject) => {
    probe.once('error', (error) => {
      if (error.code === 'EADDRINUSE') resolve(false);
      else reject(error);
    });
    probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)));
  });
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
  if (!await waitForChildClose(child, timeoutMs)) throw new Error(`Owned child process ${child.pid} did not close after SIGKILL.`);
}

export function cleanupReleaseSmokeRoot(root, options = {}) {
  return cleanupVerificationHarnessRoot(root, options);
}

export async function runReleaseSmoke(env = process.env) {
  const expectedVersion = fs.readFileSync(path.resolve(productRoot, '../..', '.node-version'), 'utf8').trim();
  const exactNode = createExactNodeExecutionEnvironment({ nodeExecutable: process.execPath, env, requireNpm: true, expectedVersion });
  const nodeExecutable = exactNode.nodeExecutable;
  const npmExecutable = exactNode.npmExecutable;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-release-smoke-'));
  const packDirectory = path.join(root, 'pack');
  const prefix = path.join(root, 'prefix');
  const workspace = path.join(root, 'workspace');
  const appData = path.join(root, 'app-data');
  const npmCache = path.join(root, 'npm-cache');
  const runtimeEnv = {
    ...exactNode.env,
    BUILDR_APP_DATA_DIR: appData,
    BUILDR_PRODUCT_DATA_DIR: appData,
    npm_config_cache: npmCache,
    npm_config_update_notifier: 'false',
  };
  process.stdout.write(`[release-smoke] node=${JSON.stringify(exactNode.audit)}\n`);
  const source = resolveReleaseSmokeSource(env);
  const phase = createVerificationPhaseRecorder('release-tarball-smoke', { persistEvidence: true });
  let web = null;
  let launcherProcess = null;
  let installedMetadata = null;
  let buildrScript = null;
  let launcherTarget = null;
  let launcherHome = null;

  function runBuildr(buildrScript, args) {
    return run(nodeExecutable, [buildrScript, ...args], {
      cwd: workspace,
      env: runtimeEnv,
    });
  }

  function assertExactRuntimeIdentity(health, label) {
    assert.equal(health.productIdentity?.runtime?.version, exactNode.audit.version, `${label} Node version`);
    assert.equal(
      sameFilesystemPath(health.productIdentity?.runtime?.executable, exactNode.audit.executable),
      true,
      `${label} Node executable: ${JSON.stringify({ actual: health.productIdentity?.runtime, expected: exactNode.audit })}`,
    );
  }

  try {
    let installTarget = source.installTarget;
    let expectedVersion = source.expectedVersion;
    await phase.run('source-preparation', async () => {
      fs.mkdirSync(packDirectory, { recursive: true });
      fs.mkdirSync(workspace, { recursive: true });
      if (!installTarget) {
        const sourceCommit = run('git', ['rev-parse', 'HEAD'], { cwd: productRoot }).trim();
        const generated = await buildGeneratedArtifactSet(path.join(root, 'generated-artifacts'), { sourceIdentity: sourceCommit });
        const payload = await buildApplicationPayload(path.join(root, 'application-payload'), sourceCommit, { generatedArtifactManifest: generated.manifest, webDistRoot: generated.webDistRoot });
        const artifact = createReleaseArtifact(payload.root, packDirectory, { testContextRoot: generated.testContextRoot });
        installTarget = artifact.tarball;
        expectedVersion = artifact.manifest.version;
      }
    });

    let installedPackageRoot = null;
    await phase.run('package-installation', async () => {
      const installArgs = source.offline
        ? ['install', '--offline', '--global', '--prefix', prefix, installTarget]
        : ['install', '--prefer-online', '--global', '--prefix', prefix, '--registry', officialRegistry, installTarget];
      run(npmExecutable, installArgs, { env: runtimeEnv });
      const modulesRoot = process.platform === 'win32' ? path.join(prefix, 'node_modules') : path.join(prefix, 'lib', 'node_modules');
      installedPackageRoot = path.join(modulesRoot, '@buildr-ai', 'buildr');
      installedMetadata = JSON.parse(fs.readFileSync(path.join(installedPackageRoot, 'package.json'), 'utf8'));
      assert.equal(installedMetadata.name, source.expectedName, 'installed package name');
      if (expectedVersion) assert.equal(installedMetadata.version, expectedVersion, 'installed package version');
      buildrScript = path.join(installedPackageRoot, 'bin', 'buildr.mjs');
      assert.equal(fs.existsSync(buildrScript), true, 'installed Buildr executable source must exist');
      launcherTarget = process.platform === 'darwin'
        ? path.join(root, 'Applications', 'Buildr Web.app')
        : process.platform === 'win32'
          ? path.join(root, 'Start Menu', 'Buildr Web.lnk')
          : null;
      if (launcherTarget) assert.equal(fs.existsSync(launcherTarget), false, 'ordinary npm install must not create a graphical Launcher');
    });

    await phase.run('web-launcher-lifecycle', async () => {
      const updateCheck = parseJson('registry update check', run(nodeExecutable, [buildrScript, 'update', 'check', '--json'], {
      cwd: workspace,
      expectedStatus: 1,
      env: {
        ...runtimeEnv,
        npm_config_registry: 'http://127.0.0.1:9',
        npm_config_fetch_retries: '0',
        npm_config_fetch_timeout: '1000',
      },
      }), 'buildr.update-check/v2');
      assert.equal(updateCheck.mode, 'npm');
      assert.equal(updateCheck.status, 'blocked');
      assert.deepEqual(Object.keys(updateCheck.tracks).sort(), ['candidate', 'stable']);
      assert.equal(updateCheck.freshness.status, 'unavailable');

    assert.equal(fs.existsSync(path.join(appData, 'instance.json')), false, 'ordinary CLI must not start HTTP');
    let webStderr = '';
    web = spawn(nodeExecutable, [buildrScript, 'web', '--no-open', '--port', '0'], {
      cwd: workspace,
      env: { ...process.env, ...runtimeEnv },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    web.stderr.setEncoding('utf8');
    web.stderr.on('data', (chunk) => { webStderr += chunk; });
    const health = await waitForWebReadiness({ appData, child: web, stderr: () => webStderr });
    assert.equal(health.productIdentity.channel, 'npm');
    assertExactRuntimeIdentity(health, 'direct Web');
    await stopChildProcess(web);
    web = null;

      if (launcherTarget) {
      const installedLauncher = parseJson('launcher install', runBuildr(buildrScript, ['web', 'launcher', 'install', '--target', launcherTarget, '--json']), 'buildr.launcher-status/v1');
      assert.equal(installedLauncher.status, 'ready');
      assert.equal(installedLauncher.binding.schemaVersion, 'buildr.npm-launcher-binding/v2');
      assert.deepEqual(installedLauncher.binding.webPort, { preferred: 4457, fallback: 'random' });
      assert.equal(sameFilesystemPath(installedLauncher.binding.hostNode.path, nodeExecutable), true, JSON.stringify({ actual: installedLauncher.binding.hostNode.path, expected: nodeExecutable }));
      assert.equal(sameFilesystemPath(installedLauncher.binding.packageEntry.path, buildrScript), true);
      assert.equal(installedLauncher.binding.installationOwnershipIdentity, health.productIdentity.installationIdentity);

      const launchLauncher = async () => {
        launcherHome = path.join(root, 'launcher-home');
        fs.mkdirSync(launcherHome, { recursive: true });
        const launcherEnvironment = {
          ...process.env,
          ...runtimeEnv,
          HOME: launcherHome,
          BUILDR_NODE_EXECUTABLE: nodeExecutable,
          BUILDR_APP_DATA_DIR: appData,
          BUILDR_PRODUCT_DATA_DIR: appData,
          BUILDR_LAUNCHER_NO_OPEN: '1',
          BUILDR_LAUNCHER_NO_NOTIFY: '1',
        };
        if (platformLauncherIntegration) {
          const { launchPlatformLauncher } = await import('./platform-launcher-invocation.mjs');
          const launched = launchPlatformLauncher({ target: launcherTarget, workspace, environment: launcherEnvironment });
          launcherProcess = launched.process;
          assert.doesNotMatch(launched.output, /already running/i, 'platform Launcher must execute the short-lived entry');
          return;
        }
        if (process.platform === 'darwin') {
          const executable = path.join(launcherTarget, 'Contents', 'MacOS', 'Buildr Web');
          const launched = spawnSync(executable, [], { cwd: workspace, env: launcherEnvironment, encoding: 'utf8' });
          if (launched.status !== 0) throw new Error(`${executable} exited ${launched.status}:\n${launched.stdout}\n${launched.stderr}`);
          return;
        }
        launcherProcess = spawn(nodeExecutable, [buildrScript, 'web', '--launcher-binding', installedLauncher.bindingPath], {
          cwd: workspace,
          env: launcherEnvironment,
          stdio: ['ignore', 'ignore', 'pipe'],
        });
      };
      const stopLauncherServer = async (launcherHealth) => {
        try { process.kill(launcherHealth.pid, 'SIGTERM'); } catch {}
        await waitForProcessExit(launcherHealth.pid);
        await stopChildProcess(launcherProcess);
        launcherProcess = null;
      };
      const waitForLauncherReadiness = async (startup) => {
        const startedAt = Date.now();
        try {
          const launcherHealth = await waitForWebReadiness({ appData });
          assertExactRuntimeIdentity(launcherHealth, `${startup} Launcher`);
          return launcherHealth;
        } catch (error) {
          const retained = preserveLauncherFailureEvidence({
            appData,
            launcherHome,
            launcherTarget,
            nodeAudit: exactNode.audit,
            startup,
            startedAt,
            error,
            env: process.env,
          });
          error.message = `${error.message}\nLauncher failure evidence: ${retained.evidencePath}${retained.retainedLogPath ? `\nLauncher log: ${retained.retainedLogPath}` : ''}`;
          throw error;
        }
      };

      const defaultPortAvailable = await canBindLoopbackPort(4457);
      await launchLauncher();
      const launcherHealth = await waitForLauncherReadiness('default-port');
      assert.equal(launcherHealth.productIdentity.installationIdentity, health.productIdentity.installationIdentity);
      assert.equal(launcherHealth.launcherIdentity.bindingIdentity, installedLauncher.binding.bindingIdentity);
      assert.equal(Number(new URL(launcherHealth.url).port) === 4457, defaultPortAvailable, 'default Launcher uses 4457 exactly when it is available');
      if (process.platform === 'darwin') {
        await new Promise((resolve) => setTimeout(resolve, 2_000));
        const launcherLogPath = path.join(root, 'launcher-home', 'Library', 'Logs', 'Buildr', 'launcher.log');
        const launcherLogBeforeRepeatedOpen = fs.readFileSync(launcherLogPath);
        await launchLauncher();
        const repeatedOpenDeadline = Date.now() + RELEASE_LAUNCHER_READINESS_TIMEOUT_MS;
        let repeatedLauncherLog = '';
        while (Date.now() < repeatedOpenDeadline && !/Buildr Web 已运行：/.test(repeatedLauncherLog)) {
          try {
            repeatedLauncherLog = fs.readFileSync(launcherLogPath).subarray(launcherLogBeforeRepeatedOpen.length).toString('utf8');
          } catch {}
          if (!/Buildr Web 已运行：/.test(repeatedLauncherLog)) await new Promise((resolve) => setTimeout(resolve, RELEASE_READINESS_POLL_INTERVAL_MS));
        }
        assert.match(repeatedLauncherLog, /Buildr Web 已运行：/, 'repeated macOS open executes the CLI reuse path within the shared Launcher readiness budget');
        const repeated = await waitForLauncherReadiness('repeated-open');
        assert.equal(repeated.pid, launcherHealth.pid, 'repeated macOS open reuses the released instance');
      }
      await stopLauncherServer(launcherHealth);

      const occupied = net.createServer();
      await new Promise((resolve, reject) => {
        occupied.once('error', reject);
        occupied.listen(0, '127.0.0.1', resolve);
      });
      try {
        const occupiedPort = occupied.address().port;
        const occupiedPolicy = parseJson('launcher repair occupied port', runBuildr(buildrScript, ['web', 'launcher', 'repair', '--target', launcherTarget, '--port', String(occupiedPort), '--json']), 'buildr.launcher-status/v1');
        assert.deepEqual(occupiedPolicy.binding.webPort, { preferred: occupiedPort, fallback: 'random' });
        await launchLauncher();
        const fallbackHealth = await waitForLauncherReadiness('occupied-port-fallback');
        assert.notEqual(Number(new URL(fallbackHealth.url).port), occupiedPort);
        assert.equal(fallbackHealth.launcherIdentity.bindingIdentity, occupiedPolicy.binding.bindingIdentity);
        await stopLauncherServer(fallbackHealth);
      } finally {
        await new Promise((resolve) => occupied.close(resolve));
      }

      const randomPolicy = parseJson('launcher repair random port', runBuildr(buildrScript, ['web', 'launcher', 'repair', '--target', launcherTarget, '--port', '0', '--json']), 'buildr.launcher-status/v1');
      assert.deepEqual(randomPolicy.binding.webPort, { preferred: 0, fallback: 'random' });
      await launchLauncher();
      const randomHealth = await waitForLauncherReadiness('random-port');
      assert.ok(Number(new URL(randomHealth.url).port) > 0);
      assert.equal(randomHealth.launcherIdentity.bindingIdentity, randomPolicy.binding.bindingIdentity);
      await stopLauncherServer(randomHealth);

      if (process.platform === 'darwin') {
        fs.appendFileSync(path.join(launcherTarget, 'Contents', 'MacOS', 'Buildr Web'), '\n# drift\n');
      } else {
        const driftScript = '$shell=New-Object -ComObject WScript.Shell; $s=$shell.CreateShortcut($env:BUILDR_LAUNCHER_SHORTCUT); $s.Arguments="foreign"; $s.Save()';
        run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', driftScript], {
          cwd: workspace,
          env: { ...runtimeEnv, BUILDR_LAUNCHER_SHORTCUT: launcherTarget },
        });
      }
      const stale = parseJson('launcher drift status', run(nodeExecutable, [buildrScript, 'web', 'launcher', 'status', '--target', launcherTarget, '--json'], {
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
    });

    await phase.run('workspace-lifecycle', async () => {
      runBuildr(buildrScript, ['init', '--agent', 'codex', '--target', workspace, '--name', 'release-smoke', '--profile', 'team']);
      runBuildr(buildrScript, ['sync', 'codex', '--target', workspace]);
      const doctorBefore = parseJson('doctor before uninstall', runBuildr(buildrScript, ['doctor', '--agent', 'codex', '--target', workspace, '--json']), 'buildr.doctor/v1');
      assert.equal(doctorBefore.summary.error, 0);
    });

    await phase.run('uninstall-final-doctor', async () => {
      runBuildr(buildrScript, ['component', 'uninstall', 'openspec', '--agent', 'codex', '--target', workspace, '--reason', 'release-smoke']);
      const doctorAfter = parseJson('doctor after uninstall', runBuildr(buildrScript, ['doctor', '--agent', 'codex', '--target', workspace, '--json']), 'buildr.doctor/v1');
      assert.equal(doctorAfter.summary.error, 0);
      assert.equal(fs.existsSync(path.join(workspace, '.agents', 'skills', 'openspec-explore')), false);
    });

    console.log(`Buildr release smoke passed (${platformLauncherIntegration ? 'platform-launcher' : 'headless-launcher'}) from ${source.kind} on ${process.platform} with Node ${process.versions.node}.`);
    return { source: source.kind, version: installedMetadata.version };
  } finally {
    let cleanupFailure = null;
    try {
      await phase.run('owned-process-cleanup', async () => {
        await stopChildProcess(web);
        await stopChildProcess(launcherProcess);
      });
    } catch (error) {
      cleanupFailure = error;
    }
    const cleanupStartedAt = Date.now();
    try {
      const cleanup = cleanupReleaseSmokeRoot(root);
      phase.record('harness-root-cleanup', cleanupStartedAt, Date.now(), cleanup.status === 'retained' ? 'retained' : 'passed');
    } catch (error) {
      phase.record('harness-root-cleanup', cleanupStartedAt, Date.now(), 'failed');
      cleanupFailure ??= error;
    }
    phase.emit();
    if (cleanupFailure) throw cleanupFailure;
  }
}

if (process.argv[1] && sameFilesystemPath(process.argv[1], fileURLToPath(import.meta.url))) await runReleaseSmoke();
