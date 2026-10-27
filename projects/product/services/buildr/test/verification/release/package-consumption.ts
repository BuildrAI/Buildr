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
import { buildApplicationPayload } from '../../../../../../../skills/buildr-release/scripts/application-payload.ts';
import { createReleaseArtifact, readReleaseArtifact } from '../../../../../../../skills/buildr-release/scripts/release-artifact.ts';
import { officialRegistry } from '../../../../../../../skills/buildr-release/scripts/registry-version-state.ts';
import { readSharedCandidatePackage } from '../../../../../../../skills/buildr-release/scripts/candidate-package.ts';
import { cleanupVerificationHarnessRoot, createVerificationPhaseRecorder } from '../timing/phases.ts';
import { createExactNodeExecutionEnvironment } from '../../../src/infrastructure/process.ts';
import { stopOwnedChildProcess as stopChildProcess } from '../support/owned-process.ts';

const productRoot: any = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const packageName: any = '@buildr-ai/buildr';
const exactRegistryPackagePattern: any = /^@buildr-ai\/buildr@(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/;
const platformLauncherIntegration: any = process.argv.includes('--platform-launcher');

export const RELEASE_ARTIFACT_MANIFEST_ENV: any = 'BUILDR_RELEASE_ARTIFACT_MANIFEST';
export const RELEASE_PACKAGE_SPEC_ENV: any = 'BUILDR_RELEASE_PACKAGE_SPEC';
export const RELEASE_LAUNCHER_READINESS_TIMEOUT_MS: any = 15_000;
/** 平台 Launcher 真实链路（.lnk→wscript→vbs→cmd→Host Node→web）比直启多数段
 * 串行进程创建与首扫成本，共享 Windows runner 上需要更宽的就绪预算。 */
export const RELEASE_PLATFORM_LAUNCHER_READINESS_TIMEOUT_MS: any = 45_000;
export const RELEASE_READINESS_POLL_INTERVAL_MS: any = 50;

const progressStages = new Set([
  'package-installation', 'update-check', 'direct-web-start', 'direct-web-readiness', 'direct-web-stop',
  'launcher-install', 'launcher-port-probe', 'launcher-launch-default', 'launcher-readiness-default', 'launcher-stop-default',
  'launcher-launch-repeat', 'launcher-repeat-log', 'launcher-readiness-repeat', 'launcher-repair-occupied',
  'launcher-launch-occupied', 'launcher-readiness-occupied', 'launcher-stop-occupied', 'launcher-repair-random',
  'launcher-launch-random', 'launcher-readiness-random', 'launcher-stop-random', 'launcher-drift', 'launcher-status-drift',
  'launcher-repair-drift', 'launcher-uninstall', 'workspace-init', 'workspace-sync', 'workspace-doctor-before',
  'workspace-component-uninstall', 'workspace-doctor-after', 'cleanup-direct-web', 'cleanup-launcher', 'cleanup-root',
]);

function progressChild(value: any): any {
  if (!value) return {};
  const exitCode = value.childExitCode !== undefined ? value.childExitCode : value.status !== undefined ? value.status : value.exitCode;
  const signal = value.childSignal !== undefined ? value.childSignal : value.signal !== undefined ? value.signal : value.signalCode;
  const errorCode = value.childErrorCode ?? value.error?.code;
  const pid = value.childPid ?? value.pid;
  const signals = ['SIGTERM', 'SIGKILL', 'SIGABRT', 'SIGSEGV', 'SIGBUS', 'SIGILL', 'SIGFPE', 'SIGHUP', 'SIGINT', 'SIGQUIT', 'SIGBREAK'];
  const errors = ['ETIMEDOUT', 'ENOENT', 'EACCES', 'EPERM', 'ENOEXEC', 'EPIPE', 'ECONNRESET', 'ENOTDIR', 'E2BIG', 'ENOMEM', 'ENFILE', 'EMFILE', 'UNKNOWN', 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER'];
  return {
    ...(Number.isSafeInteger(pid) && pid > 0 ? { childPid: pid } : {}),
    ...(exitCode === null || Number.isSafeInteger(exitCode) ? { childExitCode: exitCode } : {}),
    ...(signal === null || signals.includes(signal) ? { childSignal: signal } : {}),
    ...(errors.includes(errorCode) ? { childErrorCode: errorCode } : {}),
  };
}

/** Independent crash breadcrumbs: no started status is added to completed phase evidence. */
export function createPackageConsumptionProgressRecorder(options: any = {}): any {
  const directory = (options.env ?? process.env).BUILDR_DIAGNOSTICS_OUTPUT;
  const file = typeof directory === 'string' && directory ? path.join(path.resolve(directory), `release-smoke-progress-${process.pid}.jsonl`) : null;
  let sequence = 0, available = Boolean(file);
  const write = (stage: string, status: string, startedAt: number, observation: any = null) => {
    if (!available || !progressStages.has(stage) || sequence >= 256) return;
    try {
      const now = Date.now();
      const record = { schemaVersion: 'buildr.release-smoke-progress/v1', scope: 'release-tarball-consumption', pid: process.pid,
        sequence: sequence + 1, stage, status, at: new Date(now).toISOString(),
        ...(status === 'started' ? {} : { durationMs: Math.max(0, now - startedAt) }), ...progressChild(observation) };
      fs.mkdirSync(path.dirname(file!), { recursive: true });
      fs.writeFileSync(file!, `${JSON.stringify(record)}\n`, { encoding: 'utf8', flag: sequence === 0 ? 'w' : 'a' });
      sequence += 1;
    } catch { available = false; } // Diagnostics never replace the actual operation outcome.
  };
  const observe = (reader: any, error?: any) => {
    try { return { ...progressChild(reader?.()), ...progressChild(error) }; } catch { return {}; }
  };
  return {
    file,
    runSync(stage: string, operation: any, observation?: any) {
      const startedAt = Date.now(); write(stage, 'started', startedAt, observe(observation));
      try { const value = operation(); write(stage, 'passed', startedAt, observe(observation)); return value; }
      catch (error) { write(stage, 'failed', startedAt, observe(observation, error)); throw error; }
    },
    async run(stage: string, operation: any, observation?: any) {
      const startedAt = Date.now(); write(stage, 'started', startedAt, observe(observation));
      try { const value = await operation(); write(stage, 'passed', startedAt, observe(observation)); return value; }
      catch (error) { write(stage, 'failed', startedAt, observe(observation, error)); throw error; }
    },
  };
}

export function resolvePackageConsumptionSource(env: any = process.env): any  {
  const candidateRequested: any = Boolean(env.BUILDR_CANDIDATE_TARBALL || env.BUILDR_CANDIDATE_PACK_METADATA);
  const artifactRequested: any = Boolean(env[RELEASE_ARTIFACT_MANIFEST_ENV]);
  const registryRequested: any = Boolean(env[RELEASE_PACKAGE_SPEC_ENV]);
  const explicitSources: any = [candidateRequested, artifactRequested, registryRequested].filter(Boolean).length;
  if (explicitSources > 1) throw new Error('package consumption accepts exactly one explicit package source');

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
    if (!match) throw new Error('registry package consumption requires exact @buildr-ai/buildr@<version> package spec');
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

export function runPackageConsumptionCommand(command: any, args: any, options: any = {}): any  {
  let observed: any = null;
  const execute = () => {
  const result: any = spawnSync(command, args, {
    cwd: options.cwd ?? productRoot,
    encoding: 'utf8',
    env: { ...process.env, ...options.env },
    shell: process.platform === 'win32' && /\.cmd$/i.test(command),
  });
  observed = result;
  if (result.status !== (options.expectedStatus ?? 0)) {
    throw Object.assign(new Error(`${command} ${args.join(' ')} exited ${result.status}:\n${result.stdout}\n${result.stderr}`), {
      childExitCode: result.status, childSignal: result.signal, childErrorCode: result.error?.code ?? null,
    });
  }
  return result.stdout;
  };
  return options.progress ? options.progress.runSync(options.progressStage, execute, () => observed) : execute();
}
const run = runPackageConsumptionCommand;

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
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-release-launcher-failure-')), 'release-tarball-consumption');
}

export function preserveLauncherFailureEvidence(options: any): any  {
  const base: any = launcherFailureEvidenceBase(options.env);
  const evidencePath: any = `${base}.launcher-failure.json`;
  const retainedLogPath: any = `${base}.launcher.log`;
  const instancePath: any = path.join(options.appData, 'instance.json');
  const instance: any = readJsonIfPresent(instancePath);
  const processObservation: any = options.error?.readiness?.process ?? observeProcess(instance?.pid);
  const launcherLogCandidates: any[] = [];
  if (options.launcherHome) launcherLogCandidates.push(path.join(options.launcherHome, 'Library', 'Logs', 'Buildr', 'launcher.log'));
  // Windows npm Launcher 的 runner 把输出写到 binding 目录下的 logs/；binding 根
  // 位于 BUILDR_PRODUCT_DATA_DIR（本检查固定为 appData）下的 launchers/<channel>。
  if (options.appData) {
    const launchersRoot: any = path.join(options.appData, 'launchers');
    for (const channel of ['npm']) launcherLogCandidates.push(path.join(launchersRoot, channel, 'logs', 'launcher.log'));
    try {
      for (const entry of fs.readdirSync(launchersRoot, { withFileTypes: true })) {
        if (entry.isDirectory() && entry.name !== 'npm') launcherLogCandidates.push(path.join(launchersRoot, entry.name, 'logs', 'launcher.log'));
      }
    } catch {}
  }
  const launcherLogPath: any = launcherLogCandidates.find((file: any) => fs.statSync(file, { throwIfNoEntry: false })?.isFile()) ?? null;
  let launcherLog: any = null;
  if (launcherLogPath) {
    fs.mkdirSync(path.dirname(retainedLogPath), { recursive: true });
    fs.copyFileSync(launcherLogPath, retainedLogPath);
    launcherLog = {
      sourcePath: launcherLogPath,
      retainedPath: retainedLogPath,
      sha256: `sha256-${crypto.createHash('sha256').update(fs.readFileSync(retainedLogPath)).digest('hex')}`,
    };
  }
  const readiness: any = options.error?.readiness ?? {};
  const launcherProcess: any = options.launcherProcess;
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
    launcherProcess: launcherProcess ? {
      pid: launcherProcess.pid ?? null,
      exitCode: launcherProcess.exitCode ?? null,
      signalCode: launcherProcess.signalCode ?? null,
      stderr: typeof options.launcherStderr === 'function' ? options.launcherStderr() : null,
    } : null,
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

export function cleanupPackageConsumptionRoot(root: any, options: any = {}): any  {
  return cleanupVerificationHarnessRoot(root, options);
}

export async function runPackageConsumption(env: any = process.env): Promise<any>  {
  const minimumVersion: any = fs.readFileSync(path.resolve(productRoot, '../..', '.node-version'), 'utf8').trim();
  const exactNode: any = createExactNodeExecutionEnvironment({ nodeExecutable: process.execPath, env, requireNpm: true, minimumVersion });
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
  process.stdout.write(`[package-consumption] node=${JSON.stringify(exactNode.audit)}\n`);
  const source: any = resolvePackageConsumptionSource(env);
  const phase: any = createVerificationPhaseRecorder('release-tarball-consumption', { persistEvidence: true });
  const progress = createPackageConsumptionProgressRecorder({ env });
  let web: any = null;
  let launcherProcess: any = null;
  let installedMetadata: any = null;
  let buildrScript: any = null;
  let launcherTarget: any = null;
  let launcherHome: any = null;

  function runBuildr(buildrScript: any, args: any, progressStage?: string): any  {
    return run(nodeExecutable, [buildrScript, ...args], {
      cwd: workspace,
      env: runtimeEnv,
      ...(progressStage ? { progress, progressStage } : {}),
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
        const { buildGeneratedArtifactSet } = await import('../../../tools/build/artifact-set.ts');
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
      run(npmExecutable, installArgs, { env: runtimeEnv, progress, progressStage: 'package-installation' });
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
      progress, progressStage: 'update-check',
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
    let launcherStderr: any = '';
    progress.runSync('direct-web-start', () => { web = spawn(nodeExecutable, [buildrScript, 'web', '--no-open', '--port', '0'], {
      cwd: workspace,
      env: { ...process.env, ...runtimeEnv },
      stdio: ['ignore', 'pipe', 'pipe'],
    }); }, () => web);
    web.stderr.setEncoding('utf8');
    web.stderr.on('data', (chunk: any) => { webStderr += chunk; });
    const health: any = await progress.run('direct-web-readiness', () => waitForWebReadiness({ appData, child: web, stderr: () => webStderr }), () => web);
    assert.equal(health.productIdentity.channel, 'npm');
    assertExactRuntimeIdentity(health, 'direct Web');
    await progress.run('direct-web-stop', () => stopChildProcess(web), () => web);
    web = null;

      if (launcherTarget) {
      const installedLauncher: any = parseJson('launcher install', runBuildr(buildrScript, ['web', 'launcher', 'install', '--target', launcherTarget, '--json'], 'launcher-install'), 'buildr.launcher-status/v1');
      assert.equal(installedLauncher.status, 'ready');
      assert.equal(installedLauncher.binding.schemaVersion, 'buildr.npm-launcher-binding/v2');
      assert.deepEqual(installedLauncher.binding.webPort, { preferred: 4457, fallback: 'random' });
      assert.equal(sameFilesystemPath(installedLauncher.binding.hostNode.path, nodeExecutable), true, JSON.stringify({ actual: installedLauncher.binding.hostNode.path, expected: nodeExecutable }));
      assert.equal(sameFilesystemPath(installedLauncher.binding.packageEntry.path, buildrScript), true);
      assert.equal(installedLauncher.binding.installationOwnershipIdentity, health.productIdentity.installationIdentity);

      const launchLauncher: any = async (progressStage: string) => {
        let launchObservation: any = null;
        return progress.run(progressStage, async () => {
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
          if (launcherProcess?.stderr) {
            launcherProcess.stderr.setEncoding('utf8');
            launcherProcess.stderr.on('data', (chunk: any) => { launcherStderr += chunk; });
          }
          launchObservation = launcherProcess;
          assert.doesNotMatch(launched.output, /already running/i, 'platform Launcher must execute the short-lived entry');
          return;
        }
        if (process.platform === 'darwin') {
          const executable: any = path.join(launcherTarget, 'Contents', 'MacOS', 'Buildr Web');
          const launched: any = spawnSync(executable, [], { cwd: workspace, env: launcherEnvironment, encoding: 'utf8' });
          launchObservation = launched;
          if (launched.status !== 0) throw new Error(`${executable} exited ${launched.status}:\n${launched.stdout}\n${launched.stderr}`);
          return;
        }
        launcherProcess = spawn(nodeExecutable, [buildrScript, 'web', '--launcher-binding', installedLauncher.bindingPath], {
          cwd: workspace,
          env: launcherEnvironment,
          stdio: ['ignore', 'ignore', 'pipe'],
        });
        if (launcherProcess?.stderr) {
          launcherProcess.stderr.setEncoding('utf8');
          launcherProcess.stderr.on('data', (chunk: any) => { launcherStderr += chunk; });
        }
        launchObservation = launcherProcess;
        }, () => launchObservation);
      };
      const stopLauncherServer: any = async (launcherHealth: any, progressStage: string) => progress.run(progressStage, async () => {
        try { process.kill(launcherHealth.pid, 'SIGTERM'); } catch {}
        await waitForProcessExit(launcherHealth.pid);
        await stopChildProcess(launcherProcess);
        launcherProcess = null;
      }, () => ({ pid: launcherHealth.pid }));
      const waitForLauncherReadiness: any = async (startup: any, progressStage: string) => progress.run(progressStage, async () => {
        const startedAt: any = Date.now();
        try {
          const launcherHealth: any = await waitForWebReadiness({ appData, timeoutMs: RELEASE_PLATFORM_LAUNCHER_READINESS_TIMEOUT_MS });
          assertExactRuntimeIdentity(launcherHealth, `${startup} Launcher`);
          return launcherHealth;
        } catch (error: any) {
          const retained: any = preserveLauncherFailureEvidence({
            appData,
            launcherHome,
            launcherTarget,
            launcherProcess,
            launcherStderr: () => launcherStderr ? launcherStderr.slice(-8192) : null,
            nodeAudit: exactNode.audit,
            startup,
            startedAt,
            error,
            env: process.env,
          });
          error.message = `${error.message}\nLauncher failure evidence: ${retained.evidencePath}${retained.retainedLogPath ? `\nLauncher log: ${retained.retainedLogPath}` : ''}`;
          throw error;
        }
      }, () => launcherProcess);

      const defaultPortAvailable: any = await progress.run('launcher-port-probe', () => canBindLoopbackPort(4457));
      await launchLauncher('launcher-launch-default');
      const launcherHealth: any = await waitForLauncherReadiness('default-port', 'launcher-readiness-default');
      assert.equal(launcherHealth.productIdentity.installationIdentity, health.productIdentity.installationIdentity);
      assert.equal(launcherHealth.launcherIdentity.bindingIdentity, installedLauncher.binding.bindingIdentity);
      assert.equal(Number(new URL(launcherHealth.url).port) === 4457, defaultPortAvailable, 'default Launcher uses 4457 exactly when it is available');
      if (process.platform === 'darwin') {
        await new Promise((resolve: any) => setTimeout(resolve, 2_000));
        const launcherLogPath: any = path.join(root, 'launcher-home', 'Library', 'Logs', 'Buildr', 'launcher.log');
        const launcherLogBeforeRepeatedOpen: any = fs.readFileSync(launcherLogPath);
        await launchLauncher('launcher-launch-repeat');
        await progress.run('launcher-repeat-log', async () => {
        const repeatedOpenDeadline: any = Date.now() + RELEASE_LAUNCHER_READINESS_TIMEOUT_MS;
        let repeatedLauncherLog: any = '';
        while (Date.now() < repeatedOpenDeadline && !/Buildr Web 已运行：/.test(repeatedLauncherLog)) {
          try {
            repeatedLauncherLog = fs.readFileSync(launcherLogPath).subarray(launcherLogBeforeRepeatedOpen.length).toString('utf8');
          } catch {}
          if (!/Buildr Web 已运行：/.test(repeatedLauncherLog)) await new Promise((resolve: any) => setTimeout(resolve, RELEASE_READINESS_POLL_INTERVAL_MS));
        }
        assert.match(repeatedLauncherLog, /Buildr Web 已运行：/, 'repeated macOS open executes the CLI reuse path within the shared Launcher readiness budget');
        });
        const repeated: any = await waitForLauncherReadiness('repeated-open', 'launcher-readiness-repeat');
        assert.equal(repeated.pid, launcherHealth.pid, 'repeated macOS open reuses the released instance');
      }
      await stopLauncherServer(launcherHealth, 'launcher-stop-default');

      const occupied: any = net.createServer();
      await new Promise((resolve: any, reject: any) => {
        occupied.once('error', reject);
        occupied.listen(0, '127.0.0.1', resolve);
      });
      try {
        const occupiedPort: any = occupied.address().port;
        const occupiedPolicy: any = parseJson('launcher repair occupied port', runBuildr(buildrScript, ['web', 'launcher', 'repair', '--target', launcherTarget, '--port', String(occupiedPort), '--json'], 'launcher-repair-occupied'), 'buildr.launcher-status/v1');
        assert.deepEqual(occupiedPolicy.binding.webPort, { preferred: occupiedPort, fallback: 'random' });
        await launchLauncher('launcher-launch-occupied');
        const fallbackHealth: any = await waitForLauncherReadiness('occupied-port-fallback', 'launcher-readiness-occupied');
        assert.notEqual(Number(new URL(fallbackHealth.url).port), occupiedPort);
        assert.equal(fallbackHealth.launcherIdentity.bindingIdentity, occupiedPolicy.binding.bindingIdentity);
        await stopLauncherServer(fallbackHealth, 'launcher-stop-occupied');
      } finally {
        await new Promise((resolve: any) => occupied.close(resolve));
      }

      const randomPolicy: any = parseJson('launcher repair random port', runBuildr(buildrScript, ['web', 'launcher', 'repair', '--target', launcherTarget, '--port', '0', '--json'], 'launcher-repair-random'), 'buildr.launcher-status/v1');
      assert.deepEqual(randomPolicy.binding.webPort, { preferred: 0, fallback: 'random' });
      await launchLauncher('launcher-launch-random');
      const randomHealth: any = await waitForLauncherReadiness('random-port', 'launcher-readiness-random');
      assert.ok(Number(new URL(randomHealth.url).port) > 0);
      assert.equal(randomHealth.launcherIdentity.bindingIdentity, randomPolicy.binding.bindingIdentity);
      await stopLauncherServer(randomHealth, 'launcher-stop-random');

      progress.runSync('launcher-drift', () => {
      if (process.platform === 'darwin') {
        fs.appendFileSync(path.join(launcherTarget, 'Contents', 'MacOS', 'Buildr Web'), '\n# drift\n');
      } else {
        const driftScript: any = '$shell=New-Object -ComObject WScript.Shell; $s=$shell.CreateShortcut($env:BUILDR_LAUNCHER_SHORTCUT); $s.Arguments="foreign"; $s.Save()';
        run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', driftScript], {
          cwd: workspace,
          env: { ...runtimeEnv, BUILDR_LAUNCHER_SHORTCUT: launcherTarget },
        });
      }
      });
      const stale: any = parseJson('launcher drift status', run(nodeExecutable, [buildrScript, 'web', 'launcher', 'status', '--target', launcherTarget, '--json'], {
        cwd: workspace,
        env: runtimeEnv,
        expectedStatus: 1,
        progress, progressStage: 'launcher-status-drift',
      }), 'buildr.launcher-status/v1');
      assert.ok(['stale', 'invalid'].includes(stale.status));
      const repaired: any = parseJson('launcher repair', runBuildr(buildrScript, ['web', 'launcher', 'repair', '--target', launcherTarget, '--json'], 'launcher-repair-drift'), 'buildr.launcher-status/v1');
      assert.equal(repaired.status, 'ready');
      const uninstalled: any = parseJson('launcher uninstall', runBuildr(buildrScript, ['web', 'launcher', 'uninstall', '--target', launcherTarget, '--json'], 'launcher-uninstall'), 'buildr.launcher-status/v1');
      assert.equal(uninstalled.status, 'absent');
      assert.equal(fs.existsSync(installedPackageRoot), true, 'Launcher uninstall must retain the npm package');
      }
    });

    await phase.run('workspace-lifecycle', async () => {
      runBuildr(buildrScript, ['init', '--agent', 'codex', '--target', workspace, '--name', 'release-smoke', '--profile', 'team'], 'workspace-init');
      runBuildr(buildrScript, ['sync', 'codex', '--target', workspace], 'workspace-sync');
      const doctorBefore: any = parseJson('doctor before uninstall', runBuildr(buildrScript, ['doctor', '--agent', 'codex', '--target', workspace, '--json'], 'workspace-doctor-before'), 'buildr.doctor/v2');
      assert.equal(doctorBefore.summary.error, 0);
    });

    await phase.run('uninstall-final-doctor', async () => {
      runBuildr(buildrScript, ['component', 'uninstall', 'openspec', '--agent', 'codex', '--target', workspace, '--reason', 'release-smoke'], 'workspace-component-uninstall');
      const doctorAfter: any = parseJson('doctor after uninstall', runBuildr(buildrScript, ['doctor', '--agent', 'codex', '--target', workspace, '--json'], 'workspace-doctor-after'), 'buildr.doctor/v2');
      assert.equal(doctorAfter.summary.error, 0);
      assert.equal(fs.existsSync(path.join(workspace, '.agents', 'skills', 'openspec-explore')), false);
    });

    console.log(`Buildr package consumption passed (${platformLauncherIntegration ? 'platform-launcher' : 'headless-launcher'}) from ${source.kind} on ${process.platform} with Node ${process.versions.node}.`);
    return { source: source.kind, version: installedMetadata.version };
  } finally {
    let cleanupFailure: any = null;
    try {
      await phase.run('owned-process-cleanup', async () => {
        await progress.run('cleanup-direct-web', () => stopChildProcess(web), () => web);
        await progress.run('cleanup-launcher', () => stopChildProcess(launcherProcess), () => launcherProcess);
      });
    } catch (error: any) {
      cleanupFailure = error;
    }
    const cleanupStartedAt: any = Date.now();
    try {
      const cleanup: any = progress.runSync('cleanup-root', () => cleanupPackageConsumptionRoot(root));
      phase.record('harness-root-cleanup', cleanupStartedAt, Date.now(), cleanup.status === 'retained' ? 'retained' : 'passed');
    } catch (error: any) {
      phase.record('harness-root-cleanup', cleanupStartedAt, Date.now(), 'failed');
      cleanupFailure ??= error;
    }
    phase.emit();
    if (cleanupFailure) throw cleanupFailure;
  }
}

if (process.argv[1] && sameFilesystemPath(process.argv[1], fileURLToPath(import.meta.url))) await runPackageConsumption();
