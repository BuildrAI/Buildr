#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const DEVELOPMENT_WEB_CONTINUITY_SCHEMA = 'buildr.development-web-continuity/v1';

function appDataRoot(environment = process.env) {
  if (environment.BUILDR_APP_DATA_DIR) return path.resolve(environment.BUILDR_APP_DATA_DIR);
  if (process.platform === 'darwin') return path.join(os.homedir(), 'Library', 'Application Support', 'Buildr');
  return path.join(environment.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'Buildr');
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
  dataRoot = appDataRoot(),
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

async function waitForRestart({ dataRoot, expected, previousPid, fetchImpl, timeoutMs, wait }) {
  const deadline = Date.now() + timeoutMs;
  do {
    const observed = await inspectDevelopmentInstance({ dataRoot, fetchImpl, timeoutMs: Math.min(1000, Math.max(1, timeoutMs)) });
    if (observed.status === 'healthy-development') {
      const { instance } = observed;
      const identity = instance.launcherIdentity;
      if (instance.port !== expected.port || instance.pid === previousPid) {
        const error = new Error('Recovered Development Web instance did not preserve the requested port or replace the stopped PID.');
        error.code = 'development-web-continuity.instance-mismatch';
        error.details = { expected: { port: expected.port, previousPid }, actual: instance };
        throw error;
      }
      assertRestartIdentity(identity, expected);
      return instance;
    }
    if (Date.now() >= deadline) break;
    await wait(50);
  } while (Date.now() <= deadline);
  const error = new Error(`Development Web did not become healthy on port ${expected.port} before timeout.`);
  error.code = 'development-web-continuity.start-timeout';
  throw error;
}

export async function restartDevelopmentInstance({
  projectBridge,
  port,
  launcherIdentityPath,
  expectedSourceRoot,
  expectedHead,
  nodeExecutable,
  previousPid,
  dataRoot = appDataRoot(),
  environment = process.env,
  timeoutMs = 10000,
  fetchImpl = fetch,
  spawnImpl = spawn,
  killProcess = process.kill.bind(process),
  wait = (duration) => new Promise((resolve) => setTimeout(resolve, duration)),
} = {}) {
  const identity = readJson(launcherIdentityPath);
  const expected = { sourceRoot: expectedSourceRoot, head: expectedHead, nodeExecutable, port };
  assertRestartIdentity(identity, expected);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) throw new Error(`Invalid Development Web continuity port: ${port}`);
  if (!Number.isInteger(previousPid) || previousPid <= 0) throw new Error(`Invalid previous Development Web PID: ${previousPid}`);
  fs.mkdirSync(dataRoot, { recursive: true });
  const logRoot = path.join(dataRoot, 'logs');
  fs.mkdirSync(logRoot, { recursive: true });
  const log = fs.openSync(path.join(logRoot, 'self-bootstrap-development-web.log'), 'a');
  let child;
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
    child.unref?.();
  } finally {
    fs.closeSync(log);
  }
  try {
    const instance = await waitForRestart({ dataRoot, expected, previousPid, fetchImpl, timeoutMs, wait });
    return {
      schemaVersion: DEVELOPMENT_WEB_CONTINUITY_SCHEMA,
      action: 'restart',
      status: 'passed',
      previous: { pid: previousPid, port },
      instance,
      launcherIdentity: identity,
      cleanup: null,
    };
  } catch (error) {
    let cleanup = { pid: child?.pid || null, status: 'not-applicable', reason: 'spawn-pid-unavailable' };
    if (Number.isInteger(child?.pid) && child.pid > 0) {
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
    port: Number(option(args, '--port')),
    launcherIdentityPath: option(args, '--launcher-identity'),
    expectedSourceRoot: option(args, '--expected-source-root'),
    expectedHead: option(args, '--expected-head'),
    nodeExecutable: option(args, '--node-executable'),
    previousPid: Number(option(args, '--previous-pid')),
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().then((result) => console.log(JSON.stringify(result, null, 2))).catch((error) => {
    console.error(JSON.stringify({ code: error.code || 'development-web-continuity.failed', message: error.message, details: error.details || null }));
    process.exitCode = 1;
  });
}
