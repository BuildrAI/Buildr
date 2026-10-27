#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const DEVELOPMENT_WEB_CONTINUITY_SCHEMA = 'buildr.development-web-continuity/v1';
export const DEFAULT_DEVELOPMENT_WEB_PORT = 4458;

export function developmentWebDataRoot(environment = process.env, platform = process.platform, home = os.homedir()) {
  if (environment.BUILDR_APP_DATA_DIR) return path.resolve(environment.BUILDR_APP_DATA_DIR);
  if (platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'Buildr Dev');
  if (platform === 'win32') return path.join(environment.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'Buildr Dev');
  return path.join(environment.XDG_STATE_HOME || path.join(home, '.local', 'state'), 'buildr-dev');
}

function instanceFile(dataRoot) {
  return path.join(dataRoot, 'instance.json');
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function loopbackPort(value) {
  try {
    const url = new URL(value);
    const port = Number(url.port);
    return url.protocol === 'http:' && url.hostname === '127.0.0.1' && Number.isInteger(port) && port > 0 && port <= 65535
      ? port
      : null;
  } catch { return null; }
}

function samePath(left, right) {
  try { return fs.realpathSync(left) === fs.realpathSync(right); } catch { return path.resolve(left || '') === path.resolve(right || ''); }
}

function publicInstance(state, port) {
  return {
    url: state.url,
    port,
    pid: state.pid,
    launcherIdentity: state.launcherIdentity || null,
    productIdentity: state.productIdentity || null,
  };
}

export async function inspectDevelopmentInstance({
  dataRoot = developmentWebDataRoot(),
  fetchImpl = fetch,
  timeoutMs = 1000,
} = {}) {
  const state = readJson(instanceFile(dataRoot));
  if (!state) return { schemaVersion: DEVELOPMENT_WEB_CONTINUITY_SCHEMA, action: 'inspect', status: 'not-running', reason: 'instance-record-absent', instance: null };
  const port = loopbackPort(state.url);
  if (!port || !Number.isInteger(state.pid) || state.pid <= 0 || !state.secret) {
    return { schemaVersion: DEVELOPMENT_WEB_CONTINUITY_SCHEMA, action: 'inspect', status: 'stale', reason: 'instance-record-invalid', instance: null };
  }
  try {
    const response = await fetchImpl(`${state.url}/api/v1/health`, {
      headers: { 'x-buildr-instance': state.secret },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return { schemaVersion: DEVELOPMENT_WEB_CONTINUITY_SCHEMA, action: 'inspect', status: 'stale', reason: `health-${response.status}`, instance: null };
    const health = await response.json();
    if (health.schemaVersion !== 'buildr.local-app-health/v1' || health.status !== 'ready' || health.pid !== state.pid) {
      return { schemaVersion: DEVELOPMENT_WEB_CONTINUITY_SCHEMA, action: 'inspect', status: 'stale', reason: 'health-identity-mismatch', instance: null };
    }
  } catch {
    return { schemaVersion: DEVELOPMENT_WEB_CONTINUITY_SCHEMA, action: 'inspect', status: 'stale', reason: 'health-unreachable', instance: null };
  }
  const instance = publicInstance(state, port);
  if (state.launcherIdentity?.channel !== 'development') {
    return { schemaVersion: DEVELOPMENT_WEB_CONTINUITY_SCHEMA, action: 'inspect', status: 'different-owner', reason: state.launcherIdentity?.channel || 'launcher-identity-missing', instance };
  }
  return { schemaVersion: DEVELOPMENT_WEB_CONTINUITY_SCHEMA, action: 'inspect', status: 'healthy-development', reason: null, instance };
}

function assertRestartIdentity(identity, expected) {
  if (identity?.schemaVersion !== 'buildr.launcher-identity/v1'
    || identity.channel !== 'development'
    || identity.source !== 'checkout'
    || !samePath(identity.sourceRoot, expected.sourceRoot)
    || !samePath(identity.developmentRuntime?.executable, expected.nodeExecutable)
    || identity.checkout?.head !== expected.head) {
    const error = new Error('Installed Development Launcher identity does not match the retained successor.');
    error.code = 'development-web-continuity.launcher-identity-mismatch';
    error.details = { expected, actual: identity || null };
    throw error;
  }
}

function matchesRunningSource(instance, expected) {
  return instance.port === expected.port
    && instance.productIdentity?.developmentRuntimeIdentity === expected.runtimeIdentity
    && samePath(instance.launcherIdentity?.sourceRoot, expected.sourceRoot)
    && samePath(instance.launcherIdentity?.developmentRuntime?.executable, expected.nodeExecutable);
}

async function waitForRestart({ dataRoot, expected, fetchImpl, timeoutMs, wait, spawnError }) {
  const deadline = Date.now() + timeoutMs;
  do {
    const observed = await inspectDevelopmentInstance({ dataRoot, fetchImpl, timeoutMs: Math.min(1000, Math.max(1, timeoutMs)) });
    if (observed.status === 'healthy-development') {
      const { instance } = observed;
      if (!matchesRunningSource(instance, expected)) {
        const error = new Error('Recovered Development Web instance does not match the requested port and runtime source.');
        error.code = 'development-web-continuity.instance-mismatch';
        error.details = { expected, actual: instance };
        throw error;
      }
      return instance;
    }
    if (spawnError()) throw spawnError();
    if (Date.now() >= deadline) break;
    await wait(50);
  } while (Date.now() <= deadline);
  const error = new Error(`Development Web did not become healthy on port ${expected.port} before timeout.`);
  error.code = 'development-web-continuity.start-timeout';
  throw error;
}

/**
 * @param {{projectBridge: string, launcherIdentityPath: string, expectedSourceRoot: string,
 * expectedHead: string, expectedRuntimeIdentity: string, nodeExecutable: string, previousPid: number,
 * port?: number, previousPort?: number, dataRoot?: string, environment?: NodeJS.ProcessEnv,
 * forceRestart?: boolean, timeoutMs?: number, fetchImpl?: typeof fetch,
 * spawnImpl?: (command: string, args: string[], options: import('node:child_process').SpawnOptions) => import('node:child_process').ChildProcess,
 * killProcess?: typeof process.kill, wait?: (duration: number) => Promise<unknown>}} options
 */
export async function restartDevelopmentInstance({
  projectBridge,
  port = DEFAULT_DEVELOPMENT_WEB_PORT,
  previousPort = port,
  launcherIdentityPath,
  expectedSourceRoot,
  expectedHead,
  expectedRuntimeIdentity,
  nodeExecutable,
  previousPid,
  dataRoot = developmentWebDataRoot(),
  environment = process.env,
  forceRestart = false,
  timeoutMs = 10000,
  fetchImpl = fetch,
  spawnImpl = spawn,
  killProcess = process.kill.bind(process),
  wait = (duration) => new Promise((resolve) => setTimeout(resolve, duration)),
}) {
  const identity = readJson(launcherIdentityPath);
  const expected = { sourceRoot: expectedSourceRoot, head: expectedHead, nodeExecutable, port, runtimeIdentity: expectedRuntimeIdentity };
  assertRestartIdentity(identity, expected);
  if (!/^sha256-[a-f0-9]{64}$/.test(expectedRuntimeIdentity || '')) throw new Error('Development Web recovery requires the current runtime source proof.');
  if (port !== DEFAULT_DEVELOPMENT_WEB_PORT) throw new Error(`Development Web continuity port must be ${DEFAULT_DEVELOPMENT_WEB_PORT}: ${port}`);
  if (!Number.isInteger(previousPort) || previousPort <= 0 || previousPort > 65535) throw new Error(`Invalid previous Development Web port: ${previousPort}`);
  if (!Number.isInteger(previousPid) || previousPid <= 0) throw new Error(`Invalid previous Development Web PID: ${previousPid}`);
  const before = await inspectDevelopmentInstance({ dataRoot, fetchImpl });
  if (before.status === 'different-owner') throw Object.assign(new Error('The current instance belongs to a different owner.'), { code: 'development-web-continuity.owner-mismatch' });
  if (before.status === 'healthy-development') {
    if (!forceRestart && matchesRunningSource(before.instance, expected)) {
      return { schemaVersion: DEVELOPMENT_WEB_CONTINUITY_SCHEMA, action: 'restart', status: 'passed',
        disposition: 'reused', previous: { pid: previousPid, port: previousPort }, instance: before.instance, launcherIdentity: identity, cleanup: null };
    }
    // Only the exact, authenticated observation may be stopped. Installing the
    // new launcher no longer stops the app before its identity is validated.
    const state = readJson(instanceFile(dataRoot));
    if (before.instance.pid !== previousPid || state?.pid !== previousPid
      || !samePath(state.launcherIdentity?.sourceRoot, expectedSourceRoot)
      || !samePath(state.launcherIdentity?.developmentRuntime?.executable, nodeExecutable)) {
      throw Object.assign(new Error('The running development instance changed; it has been preserved.'), { code: 'development-web-continuity.owner-mismatch' });
    }
    const response = await fetchImpl(`${state.url}/api/v1/app/quit-instance`, {
      method: 'POST', headers: { 'x-buildr-instance': state.secret }, signal: AbortSignal.timeout(1000),
    });
    if (response.status !== 202) throw Object.assign(new Error('Development Web rejected the authenticated shutdown request.'), { code: 'development-web-continuity.shutdown-rejected' });
    await response.arrayBuffer();
    const deadline = Date.now() + timeoutMs;
    while (true) {
      // A transiently unreachable health endpoint does not prove exit. Wait
      // for the exact receipt to be removed or for the observed process to die.
      if (!fs.existsSync(instanceFile(dataRoot))) break;
      const current = readJson(instanceFile(dataRoot));
      if (!current || current.pid !== previousPid || current.secret !== state.secret) throw Object.assign(new Error('The development instance record changed during shutdown; it has been preserved.'), { code: 'development-web-continuity.owner-mismatch' });
      try { killProcess(previousPid, 0); }
      catch (error) { if (error.code === 'ESRCH') break; throw error; }
      if (Date.now() >= deadline) throw Object.assign(new Error('The previous Development Web did not finish shutting down.'), { code: 'development-web-continuity.shutdown-timeout' });
      await wait(50);
    }
  }
  fs.mkdirSync(dataRoot, { recursive: true });
  const logRoot = path.join(dataRoot, 'logs');
  fs.mkdirSync(logRoot, { recursive: true });
  const log = fs.openSync(path.join(logRoot, 'self-bootstrap-development-web.log'), 'a');
  let child;
  let childError = null;
  try {
    child = spawnImpl(projectBridge, ['web', '--port', String(port), '--no-open'], {
      cwd: path.resolve(path.dirname(projectBridge), '../..'),
      detached: true,
      stdio: ['ignore', log, log],
      env: {
        ...environment,
        BUILDR_NODE: nodeExecutable,
        BUILDR_LAUNCHER_IDENTITY: launcherIdentityPath,
      },
    });
    child.once?.('error', (error) => { childError = error; });
    child.unref?.();
  } finally {
    fs.closeSync(log);
  }
  try {
    const instance = await waitForRestart({ dataRoot, expected, fetchImpl, timeoutMs, wait, spawnError: () => childError });
    return {
      schemaVersion: DEVELOPMENT_WEB_CONTINUITY_SCHEMA,
      action: 'restart',
      status: 'passed',
      previous: { pid: previousPid, port: previousPort },
      instance,
      launcherIdentity: identity,
      cleanup: null,
    };
  } catch (error) {
    let cleanup = { pid: child?.pid || null, status: 'not-applicable', reason: 'spawn-pid-unavailable' };
    const observed = await inspectDevelopmentInstance({ dataRoot, fetchImpl });
    if (Number.isInteger(child?.pid) && child.pid > 0 && observed.instance?.pid === child.pid) {
      cleanup = { pid: child.pid, status: 'preserved', reason: 'authenticated-instance-still-running' };
    } else if (Number.isInteger(child?.pid) && child.pid > 0) {
      try {
        killProcess(child.pid, 'SIGTERM');
        cleanup = { pid: child.pid, status: 'requested', reason: null };
      } catch (cleanupError) {
        cleanup = { pid: child.pid, status: cleanupError?.code === 'ESRCH' ? 'already-exited' : 'failed', reason: cleanupError.message };
      }
    }
    error.details = { ...(error.details || {}), cleanup };
    throw error;
  }
}

function option(args, name, fallback = null) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`Missing value for ${name}`);
  return value;
}

async function main(args = process.argv.slice(2)) {
  const action = args[0];
  if (action === 'inspect') return inspectDevelopmentInstance();
  if (action !== 'restart') throw new Error('Usage: development-web-continuity.mjs inspect|restart');
  return restartDevelopmentInstance({
    projectBridge: option(args, '--project-bridge'),
    port: Number(option(args, '--port', String(DEFAULT_DEVELOPMENT_WEB_PORT))),
    previousPort: Number(option(args, '--previous-port', option(args, '--port', String(DEFAULT_DEVELOPMENT_WEB_PORT)))),
    launcherIdentityPath: option(args, '--launcher-identity'),
    expectedSourceRoot: option(args, '--expected-source-root'),
    expectedHead: option(args, '--expected-head'),
    expectedRuntimeIdentity: option(args, '--expected-runtime-identity'),
    nodeExecutable: option(args, '--node-executable'),
    previousPid: Number(option(args, '--previous-pid')),
    forceRestart: option(args, '--force-restart', 'false') === 'true',
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => {
    console.error(JSON.stringify({ code: error.code || 'development-web-continuity.failed', message: error.message, details: error.details || null }));
    process.exitCode = 1;
  });
}
