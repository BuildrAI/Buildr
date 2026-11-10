#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const DEVELOPMENT_WEB_CONTINUITY_SCHEMA = 'buildr.development-web-continuity/v1';
export const DEFAULT_DEVELOPMENT_WEB_PORT = 4458;

function platformDataRoot(environment, platform, home) {
  if (platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'Buildr Dev');
  if (platform === 'win32') return path.join(environment.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'Buildr Dev');
  return path.join(environment.XDG_STATE_HOME || path.join(home, '.local', 'state'), 'buildr-dev');
}

export function developmentWebDataRoot(environment = process.env, platform = process.platform, home = os.homedir()) {
  if (environment.BUILDR_APP_DATA_DIR) return path.resolve(environment.BUILDR_APP_DATA_DIR);
  // An agent shell runs under an isolated HOME, while the installed application
  // still lives under the real user home; prefer a candidate that exists.
  const candidates = [];
  if (environment.BUILDR_HOST_HOME) candidates.push(platformDataRoot(environment, platform, environment.BUILDR_HOST_HOME));
  candidates.push(platformDataRoot(environment, platform, home));
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0];
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

/** A manually started source service can prove the same owner without pretending it has a Launcher identity. */
export function developmentSourceBinding(instance) {
  if (instance?.launcherIdentity != null) return instance.launcherIdentity;
  const product = instance?.productIdentity;
  if (product?.channel !== 'development' || product.runtime?.role !== 'development'
    || typeof product.sourceRoot !== 'string' || !path.isAbsolute(product.sourceRoot)
    || typeof product.runtime.executable !== 'string' || !path.isAbsolute(product.runtime.executable)
    || !/^sha256-[a-f0-9]{64}$/.test(product.developmentRuntimeIdentity || '')) return null;
  return { channel: 'development', sourceRoot: product.sourceRoot, developmentRuntime: { executable: product.runtime.executable } };
}

function publicInstance(state, port, restartInProgress = false) {
  return {
    url: state.url,
    port,
    pid: state.pid,
    launcherIdentity: state.launcherIdentity || null,
    productIdentity: state.productIdentity || null,
    restartInProgress,
  };
}

// A deliberately small HTML tokenizer, not a DOM/rendering proof. Skip inactive
// markup and raw text, and never treat quoted attribute contents as new tags.
function* activePageTags(html) {
  const rawNames = new Set(['script', 'style', 'textarea', 'title', 'noscript', 'xmp', 'iframe', 'noembed', 'noframes', 'plaintext']);
  let offset = 0, templateDepth = 0, rawTag = null;
  while (offset < html.length) {
    if (rawTag) {
      if (rawTag === 'plaintext') return;
      const closing = new RegExp(`</${rawTag}(?=[\\s/>])`, 'gi');
      closing.lastIndex = offset;
      const match = closing.exec(html);
      if (!match) return;
      offset = match.index;
      rawTag = null;
    }
    const start = html.indexOf('<', offset);
    if (start < 0) return;
    if (html.startsWith('<!--', start)) {
      const end = html.indexOf('-->', start + 4);
      if (end < 0) return;
      offset = end + 3;
      continue;
    }
    let end = start + 1, quote = null;
    for (; end < html.length; end++) {
      const char = html[end];
      if (quote) { if (char === quote) quote = null; }
      else if (char === '"' || char === "'") quote = char;
      else if (char === '>') break;
    }
    if (end === html.length) return;
    offset = end + 1;
    const token = html.slice(start, end + 1);
    const tag = /^<(\/?)([a-z][a-z0-9:-]*)(?=[\s/>])/i.exec(token);
    if (!tag) continue;
    const name = tag[2].toLowerCase();
    if (tag[1]) {
      if (name === 'template' && templateDepth > 0) templateDepth--;
      continue;
    }
    if (name === 'template') templateDepth++;
    const attrs = Object.create(null);
    for (const attr of token.slice(tag[0].length, -1).matchAll(/([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
      const key = attr[1].toLowerCase();
      // HTML keeps the first occurrence of duplicate attributes.
      if (!(key in attrs)) attrs[key] = attr[2] ?? attr[3] ?? attr[4] ?? '';
    }
    if (rawNames.has(name)) rawTag = name;
    if (templateDepth === 0) yield { name, attrs, raw: rawNames.has(name) };
  }
}

/**
 * HTTP delivery proof only; no HTML, session tokens, or resource URLs enter diagnostics.
 * @param {{url: string, fetchImpl?: typeof fetch, timeoutMs?: number, maxResources?: number, now?: () => number}} options
 */
export async function verifyDevelopmentPage({ url, fetchImpl = fetch, timeoutMs = 1000,
  maxResources = 64, now = () => performance.now() } = {}) {
  const started = now();
  const signal = AbortSignal.timeout(Math.max(1, timeoutMs));
  let resourceCount = 0;
  const result = (status, reason = null) => ({ status, reason, resourceCount, durationMs: Math.max(0, now() - started) });
  try {
    const origin = new URL(url);
    const get = async (target) => {
      const response = await fetchImpl(target.href, { redirect: 'error', signal });
      if (response.redirected || (response.url && new URL(response.url).origin !== origin.origin)) throw new Error('redirect-rejected');
      if (!response.ok) throw new Error('http-response-failed');
      return response;
    };
    const page = await get(new URL('/', origin));
    if (!/^text\/html(?:;|$)/i.test(page.headers.get('content-type') || '')) return result('failed', 'page-media-type');
    const html = await page.text();
    const resources = new Map();
    let moduleEntry = false, rootFound = false;
    for (const { name, attrs, raw } of activePageTags(html)) {
      if (!raw && attrs.id === 'root') rootFound = true;
      let reference, kind;
      if (name === 'script' && attrs.src) {
        reference = attrs.src; kind = 'script';
        if (attrs.type?.toLowerCase() === 'module') moduleEntry = true;
      } else if (name === 'link' && /^(stylesheet|modulepreload)$/i.test(attrs.rel || '') && attrs.href) {
        reference = attrs.href; kind = attrs.rel.toLowerCase() === 'stylesheet' ? 'style' : 'script';
      } else continue;
      const target = new URL(reference.replaceAll('&amp;', '&'), origin);
      if (target.origin !== origin.origin || target.username || target.password) return result('failed', 'resource-origin');
      resources.set(target.href, kind);
      if (resources.size > maxResources) return result('failed', 'resource-limit');
    }
    if (!rootFound) return result('failed', 'page-root-missing');
    if (!moduleEntry) return result('failed', 'module-entry-missing');
    for (const [reference, kind] of resources) {
      if (signal.aborted || now() - started >= timeoutMs) return result('failed', 'page-timeout');
      const response = await get(new URL(reference));
      const mime = response.headers.get('content-type') || '';
      if (!(kind === 'style' ? /^text\/css(?:;|$)/i : /^(?:text|application)\/(?:javascript|ecmascript)(?:;|$)/i).test(mime)) return result('failed', 'resource-media-type');
      const body = await response.text();
      if (!body.trim() || /^\s*(?:<!doctype\s+html|<html)\b/i.test(body)) return result('failed', 'resource-content');
      resourceCount++;
    }
    if (signal.aborted || now() - started >= timeoutMs) return result('failed', 'page-timeout');
    return result('passed');
  } catch {
    return result('failed', signal.aborted ? 'page-timeout' : 'page-request-failed');
  }
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
  let restartInProgress = false;
  try {
    const response = await fetchImpl(`${state.url}/api/v1/health`, {
      headers: { 'x-buildr-instance': state.secret },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return { schemaVersion: DEVELOPMENT_WEB_CONTINUITY_SCHEMA, action: 'inspect', status: 'stale', reason: `health-${response.status}`, instance: null };
    const health = await response.json();
    if (health.schemaVersion !== 'buildr.local-app-health/v1' || !['ready', 'stopping'].includes(health.status) || health.pid !== state.pid
      || ['launcherIdentity', 'productIdentity', 'webProfile'].some(key => JSON.stringify(health[key] ?? null) !== JSON.stringify(state[key] ?? null))) {
      return { schemaVersion: DEVELOPMENT_WEB_CONTINUITY_SCHEMA, action: 'inspect', status: 'stale', reason: 'health-identity-mismatch', instance: null };
    }
    restartInProgress = health.restartInProgress === true;
    if (health.status === 'stopping') return { schemaVersion: DEVELOPMENT_WEB_CONTINUITY_SCHEMA, action: 'inspect', status: 'stale', reason: 'instance-stopping', instance: publicInstance(state, port, restartInProgress) };
  } catch {
    return { schemaVersion: DEVELOPMENT_WEB_CONTINUITY_SCHEMA, action: 'inspect', status: 'stale', reason: 'health-unreachable', instance: null };
  }
  const instance = publicInstance(state, port, restartInProgress);
  if (developmentSourceBinding(state)?.channel !== 'development') {
    return { schemaVersion: DEVELOPMENT_WEB_CONTINUITY_SCHEMA, action: 'inspect', status: 'different-owner', reason: state.launcherIdentity?.channel || 'launcher-identity-missing', instance };
  }
  return { schemaVersion: DEVELOPMENT_WEB_CONTINUITY_SCHEMA, action: 'inspect', status: 'healthy-development', reason: null, instance,
    pageVerification: await verifyDevelopmentPage({ url: instance.url, fetchImpl, timeoutMs }) };
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
  const source = developmentSourceBinding(instance);
  return instance.port === expected.port
    && instance.productIdentity?.developmentRuntimeIdentity === expected.runtimeIdentity
    && samePath(source?.sourceRoot, expected.sourceRoot)
    && samePath(source?.developmentRuntime?.executable, expected.nodeExecutable);
}

function matchesDevelopmentOwner(instance, expected) {
  const source = developmentSourceBinding(instance);
  return source?.channel === 'development'
    && samePath(source?.sourceRoot, expected.sourceRoot)
    && samePath(source?.developmentRuntime?.executable, expected.nodeExecutable);
}

/** PIDs listening on the development port; ownership is decided by command line, not by name. */
export function portListeners(port, platform = process.platform, run = spawnSync) {
  const output = run(platform === 'win32' ? 'netstat' : 'lsof',
    platform === 'win32' ? ['-ano'] : ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], { encoding: 'utf8' })?.stdout || '';
  if (platform === 'win32') {
    return output.split(/\r?\n/)
      .filter(line => new RegExp(`[:.]${port}\\s`).test(line) && /LISTENING/i.test(line))
      .map(line => Number(line.trim().split(/\s+/).pop()))
      .filter(pid => Number.isInteger(pid) && pid > 0);
  }
  return output.split(/\s+/).map(Number).filter(pid => Number.isInteger(pid) && pid > 0);
}

export function processCommand(pid, platform = process.platform, run = spawnSync) {
  const output = run(platform === 'win32' ? 'wmic' : 'ps',
    platform === 'win32' ? ['process', 'where', `ProcessId=${pid}`, 'get', 'CommandLine', '/value'] : ['-o', 'command=', '-p', String(pid)],
    { encoding: 'utf8' })?.stdout || '';
  return output.trim();
}

/**
 * A previous start can leave the port bound without an instance record (the app
 * records itself only after it is healthy). Release it only when the command line
 * proves it is this checkout's development entry and port; anything else is
 * reported instead of stopped.
 */
export async function releaseCheckoutPort({ port, serviceRoot, expectedPid = /** @type {number | undefined} */ (undefined), platform = process.platform, run = spawnSync,
  killProcess = process.kill.bind(process), wait = (duration) => new Promise(resolve => setTimeout(resolve, duration)), timeoutMs = 5000 }) {
  const released = [];
  const listeners = portListeners(port, platform, run);
  if (expectedPid !== undefined && listeners.some(pid => pid !== expectedPid)) throw continuityError('owner-mismatch', 'The shutdown port owner changed; no process was stopped.');
  for (const pid of listeners) {
    const command = processCommand(pid, platform, run);
    const entry = path.join(serviceRoot, 'bin', 'buildr.mjs');
    if (!command.includes(entry) || !command.includes(`--port ${port}`)) {
      throw continuityError('port-occupied', `Port ${port} is held by a process this runner cannot prove: ${pid} ${command}`);
    }
    try { killProcess(pid, 'SIGTERM'); }
    catch (error) { if (error.code !== 'ESRCH') throw error; continue; }
    released.push(pid);
  }
  const deadline = Date.now() + timeoutMs;
  for (const pid of released) {
    for (;;) {
      const alive = portListeners(port, platform, run).includes(pid);
      if (!alive) break;
      if (Date.now() >= deadline) {
        try { killProcess(pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
        break;
      }
      await wait(50);
    }
  }
  return released;
}

function continuityError(code, message) {
  return Object.assign(new Error(message), { code: `development-web-continuity.${code}` });
}

async function waitForRestart({ dataRoot, expected, fetchImpl, timeoutMs, wait, spawnError }) {
  let pageVerification = null;
  const deadline = Date.now() + timeoutMs;
  do {
    const observed = await inspectDevelopmentInstance({ dataRoot, fetchImpl, timeoutMs: Math.min(1000, Math.max(1, deadline - Date.now())) });
    if (observed.status === 'healthy-development') {
      const { instance } = observed;
      if (!matchesRunningSource(instance, expected)) {
        const error = new Error('Recovered Development Web instance does not match the requested port and runtime source.');
        error.code = 'development-web-continuity.instance-mismatch';
        error.details = { expected, actual: instance };
        throw error;
      }
      pageVerification = observed.pageVerification;
      if (observed.pageVerification?.status === 'passed') return { instance, pageVerification: observed.pageVerification };
    }
    if (spawnError()) throw spawnError();
    if (Date.now() >= deadline) break;
    await wait(50);
  } while (Date.now() <= deadline);
  const error = new Error(`Development Web did not become healthy on port ${expected.port} before timeout.`);
  error.code = 'development-web-continuity.start-timeout';
  error.details = { pageVerification };
  throw error;
}

/**
 * @param {{projectBridge: string, launcherIdentityPath: string, expectedSourceRoot: string,
 * expectedHead: string, expectedRuntimeIdentity: string, nodeExecutable: string, previousPid: number,
 * port?: number, expectedPort?: number, previousPort?: number, dataRoot?: string, environment?: NodeJS.ProcessEnv,
 * forceRestart?: boolean, timeoutMs?: number, fetchImpl?: typeof fetch,
 * spawnImpl?: (command: string, args: string[], options: import('node:child_process').SpawnOptions) => import('node:child_process').ChildProcess,
 * killProcess?: typeof process.kill, wait?: (duration: number) => Promise<unknown>,
 * now?: () => number, releasePort?: typeof releaseCheckoutPort}} options
 */
export async function restartDevelopmentInstance({
  projectBridge,
  port = DEFAULT_DEVELOPMENT_WEB_PORT,
  expectedPort = DEFAULT_DEVELOPMENT_WEB_PORT,
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
  // A successor that must adopt changed source runs the isolated development
  // web preparation (contracts, agent package, frontend build) before it can
  // serve a verified page; that preparation alone takes tens of seconds.
  timeoutMs = 120000,
  fetchImpl = fetch,
  spawnImpl = spawn,
  killProcess = process.kill.bind(process),
  wait = (duration) => new Promise((resolve) => setTimeout(resolve, duration)),
  now = () => performance.now(),
  releasePort = releaseCheckoutPort,
}) {
  const started = now();
  const shutdownReleased = [];
  let shutdownStarted = null, shutdownMs = null, startupStarted = null, priorPage = 'unknown';
  const timings = (recovered, pageVerification = null) => {
    const ended = now();
    return { totalMs: Math.max(0, ended - started), shutdownMs,
      startupMs: startupStarted === null ? null : Math.max(0, ended - startupStarted - (pageVerification?.durationMs ?? 0)),
      pageVerificationMs: pageVerification?.durationMs ?? null, interruption: {
        status: shutdownStarted === null ? 'not-observed' : !recovered ? 'ongoing' : priorPage === 'passed' ? 'measured-upper-bound' : priorPage === 'failed' ? 'preexisting-unavailable' : 'unknown',
        previousPageStatus: priorPage,
        durationMs: shutdownStarted !== null && recovered && priorPage === 'passed' ? Math.max(0, ended - shutdownStarted) : null } };
  };
  try {
    const identity = readJson(launcherIdentityPath);
    const expected = { sourceRoot: expectedSourceRoot, head: expectedHead, nodeExecutable, port, runtimeIdentity: expectedRuntimeIdentity };
    assertRestartIdentity(identity, expected);
    if (!/^sha256-[a-f0-9]{64}$/.test(expectedRuntimeIdentity || '')) throw new Error('Development Web recovery requires the current runtime source proof.');
    if (!Number.isInteger(port) || port <= 0 || port > 65535 || port !== expectedPort) throw new Error(`Development Web continuity port must be ${expectedPort}: ${port}`);
    if (!Number.isInteger(previousPort) || previousPort <= 0 || previousPort > 65535) throw new Error(`Invalid previous Development Web port: ${previousPort}`);
    if (!Number.isInteger(previousPid) || previousPid <= 0) throw new Error(`Invalid previous Development Web PID: ${previousPid}`);
    const finishShutdown = async (state) => {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        let current;
        try { current = JSON.parse(fs.readFileSync(instanceFile(dataRoot), 'utf8')); }
        catch (error) {
          if (error.code === 'ENOENT') return;
          throw continuityError('owner-mismatch', 'The development instance record changed during shutdown; it has been preserved.');
        }
        if (JSON.stringify(current) !== JSON.stringify(state)) throw continuityError('owner-mismatch', 'The development instance record changed during shutdown; it has been preserved.');
        try { killProcess(state.pid, 0); }
        catch (error) { if (error.code === 'ESRCH') return; throw error; }
        if (Date.now() >= deadline) {
          // A successful authenticated quit can hang while detaching an old
          // bridge. Re-prove stopping, receipt and exact listener before the
          // existing owned-port release; never signal an Agent process group.
          const observed = await inspectDevelopmentInstance({dataRoot, fetchImpl});
          if (observed.reason !== 'instance-stopping' || observed.instance?.pid !== state.pid ||
            JSON.stringify(readJson(instanceFile(dataRoot))) !== JSON.stringify(state) || !matchesDevelopmentOwner(observed.instance, expected)) {
            throw continuityError('shutdown-timeout', 'The previous Development Web did not confirm shutdown; it has been preserved.');
          }
          shutdownReleased.push(...await releasePort({port: loopbackPort(state.url), serviceRoot: path.join(path.dirname(projectBridge), 'services', 'buildr'), expectedPid: state.pid, killProcess, wait}));
          return;
        }
        await wait(50);
      }
    };
    const coordinationDeadline = Date.now() + timeoutMs;
    let coordinated = false;
    while (true) {
      const before = await inspectDevelopmentInstance({ dataRoot, fetchImpl });
      if (before.status === 'different-owner' || (before.instance && !matchesDevelopmentOwner(before.instance, expected))) {
        throw continuityError('owner-mismatch', 'The current instance belongs to a different owner.');
      }
      if (before.instance?.restartInProgress || (coordinated && before.status !== 'healthy-development')) {
        coordinated = true;
        if (Date.now() >= coordinationDeadline) throw continuityError('restart-wait-timeout', 'The concurrent Development Web restart did not settle before timeout.');
        await wait(50);
        continue;
      }
      if (before.reason === 'instance-stopping') {
        if (before.instance?.pid !== previousPid) throw continuityError('owner-mismatch', 'The stopping instance changed; it has been preserved.');
        shutdownStarted = now();
        const state = readJson(instanceFile(dataRoot));
        if (state?.pid !== before.instance.pid || state?.url !== before.instance.url || !matchesDevelopmentOwner(state, expected) ||
          ['launcherIdentity', 'productIdentity'].some(key => JSON.stringify(state[key] ?? null) !== JSON.stringify(before.instance[key] ?? null))) throw continuityError('owner-mismatch', 'The stopping instance changed; it has been preserved.');
        await finishShutdown(state);
        shutdownMs = Math.max(0, now() - shutdownStarted);
        break;
      }
      if (before.status !== 'healthy-development') break;
      if ((!forceRestart || (coordinated && before.instance.pid !== previousPid)) && matchesRunningSource(before.instance, expected)) {
        if (before.pageVerification?.status !== 'passed') throw Object.assign(continuityError('page-verification-failed', 'Development Web page delivery verification failed.'), { details: { pageVerification: before.pageVerification, timings: timings(false) } });
        return { schemaVersion: DEVELOPMENT_WEB_CONTINUITY_SCHEMA, action: 'restart', status: 'passed', pageVerification: before.pageVerification, timings: timings(true, before.pageVerification),
          disposition: 'reused', previous: { pid: previousPid, port: previousPort }, instance: before.instance, launcherIdentity: identity, cleanup: null };
      }
      // Only the exact, authenticated observation may be stopped. Installing the
      // new launcher no longer stops the app before its identity is validated.
      const state = readJson(instanceFile(dataRoot));
      if (state?.pid !== before.instance.pid || state?.url !== before.instance.url
        || !matchesDevelopmentOwner(state, expected)
        || ['launcherIdentity', 'productIdentity'].some(key => JSON.stringify(state[key] ?? null) !== JSON.stringify(before.instance[key] ?? null))) {
        throw Object.assign(new Error('The running development instance changed; it has been preserved.'), { code: 'development-web-continuity.owner-mismatch' });
      }
      priorPage = before.pageVerification?.status ?? 'unknown';
      const quitStarted = now();
      const response = await fetchImpl(`${state.url}/api/v1/app/quit-instance`, {
        method: 'POST', headers: { 'x-buildr-instance': state.secret }, signal: AbortSignal.timeout(1000),
      });
      if (response.status === 409 || response.status === 503) {
        const failure = await response.json().catch(() => null);
        if (['restart_in_progress', 'app_shutting_down'].includes(failure?.error?.code)) {
          coordinated = true;
          if (Date.now() >= coordinationDeadline) throw continuityError('restart-wait-timeout', 'The concurrent Development Web restart did not settle before timeout.');
          await wait(50);
          continue;
        }
      }
      if (response.status !== 202) throw Object.assign(new Error('Development Web rejected the authenticated shutdown request.'), { code: 'development-web-continuity.shutdown-rejected' });
      shutdownStarted = quitStarted;
      await response.arrayBuffer();
      await finishShutdown(state);
      shutdownMs = Math.max(0, now() - shutdownStarted);
      break;
    }
    // A start that died before writing its receipt leaves the port bound with no
    // record to authenticate. Release it only when the holder proves ownership.
    const stalePort = [...shutdownReleased, ...(fs.existsSync(instanceFile(dataRoot))
      ? []
      : await releasePort({ port, serviceRoot: path.join(path.dirname(projectBridge), 'services', 'buildr'), killProcess, wait }))];
    fs.mkdirSync(dataRoot, { recursive: true });
    const logRoot = path.join(dataRoot, 'logs');
    fs.mkdirSync(logRoot, { recursive: true });
    const log = fs.openSync(path.join(logRoot, 'self-bootstrap-development-web.log'), 'a');
    let child;
    let childError = null;
    startupStarted = now();
    try {
      child = spawnImpl(projectBridge, ['web', '--port', String(port), '--no-open'], {
        cwd: path.resolve(path.dirname(projectBridge), '../..'),
        detached: true,
        stdio: ['ignore', log, log],
        env: {
          ...environment,
          // The spawned app must record itself where continuity observes it, even
          // when the caller runs under an isolated HOME.
          BUILDR_APP_DATA_DIR: dataRoot,
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
      const { instance, pageVerification } = await waitForRestart({ dataRoot, expected, fetchImpl, timeoutMs, wait, spawnError: () => childError });
      return {
        schemaVersion: DEVELOPMENT_WEB_CONTINUITY_SCHEMA,
        action: 'restart',
        status: 'passed',
        pageVerification, timings: timings(true, pageVerification),
        previous: { pid: previousPid, port: previousPort },
        instance,
        launcherIdentity: identity,
        stalePort,
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
      error.details = { ...(error.details || {}), cleanup, timings: timings(false, error.details?.pageVerification) };
      throw error;
    }
  } catch (error) {
    error.details = { ...(error.details || {}), timings: error.details?.timings ?? timings(false) };
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
