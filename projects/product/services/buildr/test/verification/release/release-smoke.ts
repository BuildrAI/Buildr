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
import { sameFilesystemPath } from '../../../src/infrastructure/filesystem/filesystem-path-identity.ts';
import { buildApplicationPayload } from '../../../tools/release/application-payload.ts';
import { createReleaseArtifact, readReleaseArtifact } from '../../../tools/release/release-artifact.ts';
import { officialRegistry } from '../../../tools/release/registry-version-state.ts';
import { readSharedCandidatePackage } from './candidate-package.ts';
import { buildGeneratedArtifactSet } from '../../../tools/build/artifact-set.ts';
import { cleanupVerificationHarnessRoot, createVerificationPhaseRecorder } from '../timing/phases.ts';
import { createExactNodeExecutionEnvironment } from '../../../src/infrastructure/process.ts';

const productRoot: any = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const packageName: any = '@buildr-ai/buildr';
const exactRegistryPackagePattern: any = /^@buildr-ai\/buildr@(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/;
const platformLauncherIntegration: any = process.argv.includes('--platform-launcher');

export const RELEASE_ARTIFACT_MANIFEST_ENV: any = 'BUILDR_RELEASE_ARTIFACT_MANIFEST';
export const RELEASE_PACKAGE_SPEC_ENV: any = 'BUILDR_RELEASE_PACKAGE_SPEC';
export const RELEASE_LAUNCHER_READINESS_TIMEOUT_MS: any = 15_000;
export const RELEASE_READINESS_POLL_INTERVAL_MS: any = 50;

export function resolveReleaseSmokeSource(env: any = process.env): any  {
  const candidateRequested: any = Boolean(env.BUILDR_CANDIDATE_TARBALL || env.BUILDR_CANDIDATE_PACK_METADATA);
  const artifactRequested: any = Boolean(env[RELEASE_ARTIFACT_MANIFEST_ENV]);
  const registryRequested: any = Boolean(env[RELEASE_PACKAGE_SPEC_ENV]);
  const explicitSources: any = [candidateRequested, artifactRequested, registryRequested].filter(Boolean).length;
  if (explicitSources > 1) throw new Error('release smoke accepts exactly one explicit package source');

  if (candidateRequested) {
    const shared: any = readSharedCandidatePackage(env);
    return {
      kind: 'candidate-tarball',
      installTarget: shared.tarball,
      expectedName: shared.metadata.name ?? packageName,
      expectedVersion: shared.metadata.version ?? null,
      offline: true,
    };
  }
  if (artifactRequested) {
    const artifact: any = readReleaseArtifact(env[RELEASE_ARTIFACT_MANIFEST_ENV], { packageName });
    return {
      kind: 'release-artifact',
      installTarget: artifact.tarball,
      expectedName: artifact.manifest.packageName,
      expectedVersion: artifact.manifest.version,
      offline: true,
    };
  }
  if (registryRequested) {
    const match: any = exactRegistryPackagePattern.exec(env[RELEASE_PACKAGE_SPEC_ENV]);
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

function run(command: any, args: any, options: any = {}): any  {
  const result: any = spawnSync(command, args, {
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

function parseJson(label: any, output: any, schemaVersion: any): any  {
  const payload: any = JSON.parse(output);
  assert.equal(payload.schemaVersion, schemaVersion, `${label} schemaVersion`);
  return payload;
}

function observeProcess(pid: any, options: any = {}): any  {
  const platform: any = options.platform ?? process.platform;
  const kill: any = options.kill ?? process.kill;
  const runProcess: any = options.runProcess ?? spawnSync;
  const numericPid: any = Number(pid);
  if (!Number.isInteger(numericPid) || numericPid <= 0) return { pid: null, processGroupId: null, alive: false, observation: 'pid-unavailable' };
  let alive: any = false;
  try {
    kill(numericPid, 0);
    alive = true;
  } catch (error: any) {
    if (error.code !== 'ESRCH') return { pid: numericPid, processGroupId: null, alive: false, observation: `pid-probe-failed:${error.code ?? error.message}` };
  }
  if (!alive || platform === 'win32') return { pid: numericPid, processGroupId: null, alive, observation: alive ? 'pid-alive' : 'pid-exited' };
  const sampled: any = runProcess('/bin/ps', ['-p', String(numericPid), '-o', 'pid=,ppid=,pgid=,etime='], { encoding: 'utf8' });
  if (sampled.status !== 0 || !sampled.stdout.trim()) {
    return { pid: numericPid, processGroupId: null, alive, observation: `ps-unavailable:${sampled.status}` };
  }
  const [observedPid, parentPid, processGroupId, elapsed]: any = sampled.stdout.trim().split(/\s+/u);
  return {
    pid: Number(observedPid),
    parentPid: Number(parentPid),
    processGroupId: Number(processGroupId),
    elapsed,
    alive,
    observation: 'ps-sampled',
  };
}

function readJsonIfPresent(file: any): any  {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function sanitizeInstance(instance: any): any  {
  if (!instance || typeof instance !== 'object') return null;
  const { secret, ...portable }: any = instance;
  return { ...portable, secretPresent: typeof secret === 'string' && secret.length > 0 };
}

function launcherFailureEvidenceBase(env: any = process.env): any  {
  const phaseOutput: any = env.BUILDR_VERIFICATION_PHASE_OUTPUT;
  if (phaseOutput) return path.resolve(phaseOutput).replace(/\.phases\.jsonl$/u, '');
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-release-launcher-failure-')), 'release-tarball-smoke');
}

export function preserveLauncherFailureEvidence(options: any): any  {
  const base: any = launcherFailureEvidenceBase(options.env);
  const evidencePath: any = `${base}.launcher-failure.json`;
  const retainedLogPath: any = `${base}.launcher.log`;
  const instancePath: any = path.join(options.appData, 'instance.json');
  const instance: any = readJsonIfPresent(instancePath);
  const processObservation: any = options.error?.readiness?.process ?? observeProcess(instance?.pid);
  const launcherLogPath: any = options.launcherHome
    ? path.join(options.launcherHome, 'Library', 'Logs', 'Buildr', 'launcher.log')
    : null;
  let launcherLog: any = null;
  if (launcherLogPath && fs.statSync(launcherLogPath, { throwIfNoEntry: false })?.isFile()) {
    fs.mkdirSync(path.dirname(retainedLogPath), { recursive: true });
    fs.copyFileSync(launcherLogPath, retainedLogPath);
    launcherLog = {
      sourcePath: launcherLogPath,
      retainedPath: retainedLogPath,
      sha256: `sha256-${crypto.createHash('sha256').update(fs.readFileSync(retainedLogPath)).digest('hex')}`,
    };
  }
  const readiness: any = options.error?.readiness ?? {};
  const evidence: any = {
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
  wait = (delayMs: any) => new Promise((resolve: any) => setTimeout(resolve, delayMs)),
}: any): Promise<any>  {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error('Buildr Web readiness timeout must be a positive number.');
  if (!Number.isFinite(pollIntervalMs) || pollIntervalMs <= 0) throw new Error('Buildr Web readiness poll interval must be a positive number.');
  const startedAt: any = now();
  let lastConnectionError: any = null;
  let attempts: any = 0;
  let lastInstance: any = null;
  while (now() - startedAt < timeoutMs) {
    attempts += 1;
    let instance: any = null;
    try { instance = JSON.parse(fs.readFileSync(path.join(appData, 'instance.json'), 'utf8')); } catch {}
    lastInstance = instance ?? lastInstance;
    if (instance) {
      let response: any = null;
      try {
        response = await fetchHealth(`${instance.url}/api/v1/health`, { headers: { 'x-buildr-instance': instance.secret } });
      } catch (error: any) {
        lastConnectionError = error;
      }
      if (!response) {
        if (child?.exitCode !== null && child) break;
        await wait(Math.min(pollIntervalMs, Math.max(1, timeoutMs - (now() - startedAt))));
        continue;
      }
      assert.equal(response.status, 200);
      const health: any = await response.json();
      assert.equal(health.schemaVersion, 'buildr.local-app-health/v1');
      assert.equal(health.status, 'ready');
      if (child) assert.equal(health.pid, child.pid);
      return { ...health, url: instance.url };
    }
    if (child?.exitCode !== null && child) break;
    await wait(Math.min(pollIntervalMs, Math.max(1, timeoutMs - (now() - startedAt))));
  }
  const elapsedMs: any = Math.max(0, now() - startedAt);
  const processObservation: any = observeProcess(lastInstance?.pid ?? child?.pid);
  const error: Error & Record<string, any> = new Error(`Buildr Web did not become ready within ${timeoutMs}ms: elapsed=${elapsedMs}ms instance=${path.join(appData, 'instance.json')} pid=${processObservation.pid ?? 'n/a'} pgid=${processObservation.processGroupId ?? 'n/a'} ${stderr()}${lastConnectionError ? ` (${lastConnectionError.cause?.code ?? lastConnectionError.message})` : ''}`.trim());
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

async function waitForProcessExit(pid: any, timeoutMs: any = 5_000): Promise<any>  {
  const deadline: any = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try { process.kill(pid, 0); } catch (error: any) {
      if (error.code === 'ESRCH') return;
      throw error;
    }
    await new Promise((resolve: any) => setTimeout(resolve, 50));
  }
  throw new Error(`Process ${pid} did not exit within ${timeoutMs}ms.`);
}

async function canBindLoopbackPort(port: any): Promise<any>  {
  const probe: any = net.createServer();
  return new Promise((resolve: any, reject: any) => {
    probe.once('error', (error: any) => {
      if (error.code === 'EADDRINUSE') resolve(false);
      else reject(error);
    });
    probe.listen(port, '127.0.0.1', () => probe.close(() => resolve(true)));
  });
}

async function waitForChildClose(child: any, timeoutMs: any): Promise<any>  {
  if (child.exitCode !== null || child.signalCode !== null) return true;
  return new Promise((resolve: any) => {
    const onClose: any = () => {
      clearTimeout(timer);
      resolve(true);
    };
    const timer: any = setTimeout(() => {
      child.off('close', onClose);
      resolve(false);
    }, timeoutMs);
    child.once('close', onClose);
  });
}

async function stopChildProcess(child: any, timeoutMs: any = 2_000): Promise<any>  {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  if (await waitForChildClose(child, timeoutMs)) return;
  child.kill('SIGKILL');
  if (!await waitForChildClose(child, timeoutMs)) throw new Error(`Owned child process ${child.pid} did not close after SIGKILL.`);
}

export function cleanupReleaseSmokeRoot(root: any, options: any = {}): any  {
  return cleanupVerificationHarnessRoot(root, options);
}

export async function runReleaseSmoke(env: any = process.env): Promise<any>  {
  const expectedVersion: any = fs.readFileSync(path.resolve(productRoot, '../..', '.node-version'), 'utf8').trim();
  const exactNode: any = createExactNodeExecutionEnvironment({ nodeExecutable: process.execPath, env, requireNpm: true, expectedVersion });
  const nodeExecutable: any = exactNode.nodeExecutable;
  const npmExecutable: any = exactNode.npmExecutable;
  const root: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-release-smoke-'));
  const packDirectory: any = path.join(root, 'pack');
  const prefix: any = path.join(root, 'prefix');
  const workspace: any = path.join(root, 'workspace');
  const appData: any = path.join(root, 'app-data');
  const npmCache: any = path.join(root, 'npm-cache');
  const runtimeEnv: any = {
    ...exactNode.env,
    BUILDR_APP_DATA_DIR: appData,
    BUILDR_PRODUCT_DATA_DIR: appData,
    npm_config_cache: npmCache,
    npm_config_update_notifier: 'false',
  };
  process.stdout.write(`[release-smoke] node=${JSON.stringify(exactNode.audit)}\n`);
  const source: any = resolveReleaseSmokeSource(env);
  const phase: any = createVerificationPhaseRecorder('release-tarball-smoke', { persistEvidence: true });
  let web: any = null;
  let launcherProcess: any = null;
  let installedMetadata: any = null;
  let buildrScript: any = null;
  let launcherTarget: any = null;
  let launcherHome: any = null;

  function runBuildr(buildrScript: any, args: any): any  {
    return run(nodeExecutable, [buildrScript, ...args], {
      cwd: workspace,
      env: runtimeEnv,
    });
  }

  function assertExactRuntimeIdentity(health: any, label: any): any  {
    assert.equal(health.productIdentity?.runtime?.version, exactNode.audit.version, `${label} Node version`);
    assert.equal(
      sameFilesystemPath(health.productIdentity?.runtime?.executable, exactNode.audit.executable),
      true,
      `${label} Node executable: ${JSON.stringify({ actual: health.productIdentity?.runtime, expected: exactNode.audit })}`,
    );
  }

  try {
    let installTarget: any = source.installTarget;
    let expectedVersion: any = source.expectedVersion;
    await phase.run('source-preparation', async () => {
      fs.mkdirSync(packDirectory, { recursive: true });
      fs.mkdirSync(workspace, { recursive: true });
      if (!installTarget) {
        const sourceCommit: any = run('git', ['rev-parse', 'HEAD'], { cwd: productRoot }).trim();
        const generated: any = await buildGeneratedArtifactSet(path.join(root, 'generated-artifacts'), { sourceIdentity: sourceCommit });
        const payload: any = await buildApplicationPayload(path.join(root, 'application-payload'), sourceCommit, { generatedArtifactManifest: generated.manifest, webDistRoot: generated.webDistRoot });
        const artifact: any = createReleaseArtifact(payload.root, packDirectory, { testContextRoot: generated.testContextRoot });
        installTarget = artifact.tarball;
        expectedVersion = artifact.manifest.version;
      }
    });

    let installedPackageRoot: any = null;
    await phase.run('package-installation', async () => {
      const installArgs: any = source.offline
        ? ['install', '--offline', '--global', '--prefix', prefix, installTarget]
        : ['install', '--prefer-online', '--global', '--prefix', prefix, '--registry', officialRegistry, installTarget];
      run(npmExecutable, installArgs, { env: runtimeEnv });
      const modulesRoot: any = process.platform === 'win32' ? path.join(prefix, 'node_modules') : path.join(prefix, 'lib', 'node_modules');
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
      const updateCheck: any = parseJson('registry update check', run(nodeExecutable, [buildrScript, 'update', 'check', '--json'], {
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
    let webStderr: any = '';
    web = spawn(nodeExecutable, [buildrScript, 'web', '--no-open', '--port', '0'], {
      cwd: workspace,
      env: { ...process.env, ...runtimeEnv },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    web.stderr.setEncoding('utf8');
    web.stderr.on('data', (chunk: any) => { webStderr += chunk; });
    const health: any = await waitForWebReadiness({ appData, child: web, stderr: () => webStderr });
    assert.equal(health.productIdentity.channel, 'npm');
    assertExactRuntimeIdentity(health, 'direct Web');
    await stopChildProcess(web);
    web = null;

      if (launcherTarget) {
      const installedLauncher: any = parseJson('launcher install', runBuildr(buildrScript, ['web', 'launcher', 'install', '--target', launcherTarget, '--json']), 'buildr.launcher-status/v1');
      assert.equal(installedLauncher.status, 'ready');
      assert.equal(installedLauncher.binding.schemaVersion, 'buildr.npm-launcher-binding/v2');
      assert.deepEqual(installedLauncher.binding.webPort, { preferred: 4457, fallback: 'random' });
      assert.equal(sameFilesystemPath(installedLauncher.binding.hostNode.path, nodeExecutable), true, JSON.stringify({ actual: installedLauncher.binding.hostNode.path, expected: nodeExecutable }));
      assert.equal(sameFilesystemPath(installedLauncher.binding.packageEntry.path, buildrScript), true);
      assert.equal(installedLauncher.binding.installationOwnershipIdentity, health.productIdentity.installationIdentity);

      const launchLauncher: any = async () => {
        launcherHome = path.join(root, 'launcher-home');
        fs.mkdirSync(launcherHome, { recursive: true });
        const launcherEnvironment: any = {
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
          const { launchPlatformLauncher }: any = await import('./platform-launcher-invocation.ts');
          const launched: any = launchPlatformLauncher({ target: launcherTarget, workspace, environment: launcherEnvironment });
          launcherProcess = launched.process;
          assert.doesNotMatch(launched.output, /already running/i, 'platform Launcher must execute the short-lived entry');
          return;
        }
        if (process.platform === 'darwin') {
          const executable: any = path.join(launcherTarget, 'Contents', 'MacOS', 'Buildr Web');
          const launched: any = spawnSync(executable, [], { cwd: workspace, env: launcherEnvironment, encoding: 'utf8' });
          if (launched.status !== 0) throw new Error(`${executable} exited ${launched.status}:\n${launched.stdout}\n${launched.stderr}`);
          return;
        }
        launcherProcess = spawn(nodeExecutable, [buildrScript, 'web', '--launcher-binding', installedLauncher.bindingPath], {
          cwd: workspace,
          env: launcherEnvironment,
          stdio: ['ignore', 'ignore', 'pipe'],
        });
      };
      const stopLauncherServer: any = async (launcherHealth: any) => {
        try { process.kill(launcherHealth.pid, 'SIGTERM'); } catch {}
        await waitForProcessExit(launcherHealth.pid);
        await stopChildProcess(launcherProcess);
        launcherProcess = null;
      };
      const waitForLauncherReadiness: any = async (startup: any) => {
        const startedAt: any = Date.now();
        try {
          const launcherHealth: any = await waitForWebReadiness({ appData });
          assertExactRuntimeIdentity(launcherHealth, `${startup} Launcher`);
          return launcherHealth;
        } catch (error: any) {
          const retained: any = preserveLauncherFailureEvidence({
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

      const defaultPortAvailable: any = await canBindLoopbackPort(4457);
      await launchLauncher();
      const launcherHealth: any = await waitForLauncherReadiness('default-port');
      assert.equal(launcherHealth.productIdentity.installationIdentity, health.productIdentity.installationIdentity);
      assert.equal(launcherHealth.launcherIdentity.bindingIdentity, installedLauncher.binding.bindingIdentity);
      assert.equal(Number(new URL(launcherHealth.url).port) === 4457, defaultPortAvailable, 'default Launcher uses 4457 exactly when it is available');
      if (process.platform === 'darwin') {
        await new Promise((resolve: any) => setTimeout(resolve, 2_000));
        const launcherLogPath: any = path.join(root, 'launcher-home', 'Library', 'Logs', 'Buildr', 'launcher.log');
        const launcherLogBeforeRepeatedOpen: any = fs.readFileSync(launcherLogPath);
        await launchLauncher();
        const repeatedOpenDeadline: any = Date.now() + RELEASE_LAUNCHER_READINESS_TIMEOUT_MS;
        let repeatedLauncherLog: any = '';
        while (Date.now() < repeatedOpenDeadline && !/Buildr Web 已运行：/.test(repeatedLauncherLog)) {
          try {
            repeatedLauncherLog = fs.readFileSync(launcherLogPath).subarray(launcherLogBeforeRepeatedOpen.length).toString('utf8');
          } catch {}
          if (!/Buildr Web 已运行：/.test(repeatedLauncherLog)) await new Promise((resolve: any) => setTimeout(resolve, RELEASE_READINESS_POLL_INTERVAL_MS));
        }
        assert.match(repeatedLauncherLog, /Buildr Web 已运行：/, 'repeated macOS open executes the CLI reuse path within the shared Launcher readiness budget');
        const repeated: any = await waitForLauncherReadiness('repeated-open');
        assert.equal(repeated.pid, launcherHealth.pid, 'repeated macOS open reuses the released instance');
      }
      await stopLauncherServer(launcherHealth);

      const occupied: any = net.createServer();
      await new Promise((resolve: any, reject: any) => {
        occupied.once('error', reject);
        occupied.listen(0, '127.0.0.1', resolve);
      });
      try {
        const occupiedPort: any = occupied.address().port;
        const occupiedPolicy: any = parseJson('launcher repair occupied port', runBuildr(buildrScript, ['web', 'launcher', 'repair', '--target', launcherTarget, '--port', String(occupiedPort), '--json']), 'buildr.launcher-status/v1');
        assert.deepEqual(occupiedPolicy.binding.webPort, { preferred: occupiedPort, fallback: 'random' });
        await launchLauncher();
        const fallbackHealth: any = await waitForLauncherReadiness('occupied-port-fallback');
        assert.notEqual(Number(new URL(fallbackHealth.url).port), occupiedPort);
        assert.equal(fallbackHealth.launcherIdentity.bindingIdentity, occupiedPolicy.binding.bindingIdentity);
        await stopLauncherServer(fallbackHealth);
      } finally {
        await new Promise((resolve: any) => occupied.close(resolve));
      }

      const randomPolicy: any = parseJson('launcher repair random port', runBuildr(buildrScript, ['web', 'launcher', 'repair', '--target', launcherTarget, '--port', '0', '--json']), 'buildr.launcher-status/v1');
      assert.deepEqual(randomPolicy.binding.webPort, { preferred: 0, fallback: 'random' });
      await launchLauncher();
      const randomHealth: any = await waitForLauncherReadiness('random-port');
      assert.ok(Number(new URL(randomHealth.url).port) > 0);
      assert.equal(randomHealth.launcherIdentity.bindingIdentity, randomPolicy.binding.bindingIdentity);
      await stopLauncherServer(randomHealth);

      if (process.platform === 'darwin') {
        fs.appendFileSync(path.join(launcherTarget, 'Contents', 'MacOS', 'Buildr Web'), '\n# drift\n');
      } else {
        const driftScript: any = '$shell=New-Object -ComObject WScript.Shell; $s=$shell.CreateShortcut($env:BUILDR_LAUNCHER_SHORTCUT); $s.Arguments="foreign"; $s.Save()';
        run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', driftScript], {
          cwd: workspace,
          env: { ...runtimeEnv, BUILDR_LAUNCHER_SHORTCUT: launcherTarget },
        });
      }
      const stale: any = parseJson('launcher drift status', run(nodeExecutable, [buildrScript, 'web', 'launcher', 'status', '--target', launcherTarget, '--json'], {
        cwd: workspace,
        env: runtimeEnv,
        expectedStatus: 1,
      }), 'buildr.launcher-status/v1');
      assert.ok(['stale', 'invalid'].includes(stale.status));
      const repaired: any = parseJson('launcher repair', runBuildr(buildrScript, ['web', 'launcher', 'repair', '--target', launcherTarget, '--json']), 'buildr.launcher-status/v1');
      assert.equal(repaired.status, 'ready');
      const uninstalled: any = parseJson('launcher uninstall', runBuildr(buildrScript, ['web', 'launcher', 'uninstall', '--target', launcherTarget, '--json']), 'buildr.launcher-status/v1');
      assert.equal(uninstalled.status, 'absent');
      assert.equal(fs.existsSync(installedPackageRoot), true, 'Launcher uninstall must retain the npm package');
      }
    });

    await phase.run('workspace-lifecycle', async () => {
      runBuildr(buildrScript, ['init', '--agent', 'codex', '--target', workspace, '--name', 'release-smoke', '--profile', 'team']);
      runBuildr(buildrScript, ['sync', 'codex', '--target', workspace]);
      const doctorBefore: any = parseJson('doctor before uninstall', runBuildr(buildrScript, ['doctor', '--agent', 'codex', '--target', workspace, '--json']), 'buildr.doctor/v1');
      assert.equal(doctorBefore.summary.error, 0);
    });

    await phase.run('uninstall-final-doctor', async () => {
      runBuildr(buildrScript, ['component', 'uninstall', 'openspec', '--agent', 'codex', '--target', workspace, '--reason', 'release-smoke']);
      const doctorAfter: any = parseJson('doctor after uninstall', runBuildr(buildrScript, ['doctor', '--agent', 'codex', '--target', workspace, '--json']), 'buildr.doctor/v1');
      assert.equal(doctorAfter.summary.error, 0);
      assert.equal(fs.existsSync(path.join(workspace, '.agents', 'skills', 'openspec-explore')), false);
    });

    console.log(`Buildr release smoke passed (${platformLauncherIntegration ? 'platform-launcher' : 'headless-launcher'}) from ${source.kind} on ${process.platform} with Node ${process.versions.node}.`);
    return { source: source.kind, version: installedMetadata.version };
  } finally {
    let cleanupFailure: any = null;
    try {
      await phase.run('owned-process-cleanup', async () => {
        await stopChildProcess(web);
        await stopChildProcess(launcherProcess);
      });
    } catch (error: any) {
      cleanupFailure = error;
    }
    const cleanupStartedAt: any = Date.now();
    try {
      const cleanup: any = cleanupReleaseSmokeRoot(root);
      phase.record('harness-root-cleanup', cleanupStartedAt, Date.now(), cleanup.status === 'retained' ? 'retained' : 'passed');
    } catch (error: any) {
      phase.record('harness-root-cleanup', cleanupStartedAt, Date.now(), 'failed');
      cleanupFailure ??= error;
    }
    phase.emit();
    if (cleanupFailure) throw cleanupFailure;
  }
}

if (process.argv[1] && sameFilesystemPath(process.argv[1], fileURLToPath(import.meta.url))) await runReleaseSmoke();
