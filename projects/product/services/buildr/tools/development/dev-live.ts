import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { spawn, type ChildProcess } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

import { activateAgentServiceRuntime } from '../../src/modules/agent-service/application/activate-runtime.ts';
import { buildrWebDataRoot } from '../../src/modules/workspace/module.ts';
import { buildWebDist } from '../build/web-dist.ts';
import { prepareDevelopmentAgent } from './prepare-development-agent.ts';

const DEFAULT_HOST_PORT = 4458;
const DEFAULT_WEB_PORT = 5173;
const DEFAULT_HARNESS_WEB_PORT = 5174;
const serviceRoot = path.resolve(import.meta.dirname, '../..');
const productRoot = path.resolve(serviceRoot, '..');
const agentRoot = path.join(productRoot, 'buildr-harness');
const webRoot = path.join(productRoot, 'buildr-web');
const harnessWebRoot = path.join(productRoot, 'buildr-harness-web');

type LiveOptions = {
  hostPort: number;
  webPort: number;
  harnessWebPort: number;
  open: boolean;
  workspaceRoot: string;
};

type InstanceRecord = {
  url?: string;
  pid?: number;
  secret?: string;
  launcherIdentity?: { channel?: string };
};

function optionValue(args: string[], name: string, fallback: string): string {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  const value = args[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`Missing value for ${name}.`);
  return value;
}

function positivePort(args: string[], name: string, fallback: number): number {
  const value = Number(optionValue(args, name, String(fallback)));
  if (!Number.isInteger(value) || value < 1 || value > 65535) throw new Error(`${name} must be a valid port.`);
  return value;
}

function findWorkspaceRoot(start: string): string | null {
  let current = path.resolve(start);
  while (true) {
    if (fs.existsSync(path.join(current, '.buildr', 'workspace.yml'))) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function readJson(file: string): any {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function instanceFile(dataRoot: string): string {
  return path.join(dataRoot, 'instance.json');
}

function alive(pid: number | undefined): boolean {
  if (!pid || !Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

async function hostHealth(url: string, secret: string): Promise<boolean> {
  try {
    const response = await fetch(new URL('/api/v1/health', url), {
      headers: { 'x-buildr-instance': secret },
      signal: AbortSignal.timeout(1000),
    });
    return response.ok;
  } catch { return false; }
}

async function portFree(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, '127.0.0.1');
  });
}

/** Only the ordinary development instance is owned here. Preview instances live
 * under their own data roots and are never discovered or stopped by dev mode. */
async function stopExistingDevelopmentInstance(dataRoot: string): Promise<void> {
  const record: InstanceRecord | null = readJson(instanceFile(dataRoot));
  if (!record || !alive(record.pid)) return;
  if (record.launcherIdentity?.channel && record.launcherIdentity.channel !== 'development') {
    throw new Error('Existing instance is not a development instance; refusing to stop it.');
  }
  if (!record.url || !record.secret || !await hostHealth(record.url, record.secret)) {
    throw new Error(`An unauthenticated process is using the development instance record (PID ${record.pid}); refusing to stop it.`);
  }
  const response = await fetch(new URL('/api/v1/app/quit-instance', record.url), {
    method: 'POST',
    headers: { 'x-buildr-instance': record.secret },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`Existing development instance did not accept stop: HTTP ${response.status}.`);
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (!alive(record.pid)) return;
    await delay(100);
  }
  throw new Error(`Existing development instance did not stop within 15s (PID ${record.pid}).`);
}

async function waitForHost(dataRoot: string, hostUrl: string, previousPid: number | null, stopped: () => boolean): Promise<InstanceRecord> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (stopped()) throw new Error('Development startup stopped.');
    const record: InstanceRecord | null = readJson(instanceFile(dataRoot));
    if (record?.secret && record.pid && record.pid !== previousPid && alive(record.pid)) {
      if (await hostHealth(hostUrl, record.secret)) return record;
    }
    await delay(200);
  }
  throw new Error('Development host did not become healthy within 30s.');
}

async function waitForPage(url: string, timeoutMs = 20_000, stopped: () => boolean = () => false): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (stopped()) throw new Error('Development startup stopped.');
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
    } catch { /* keep waiting */ }
    await delay(200);
  }
  throw new Error(`Development page did not become ready: ${url}`);
}

function spawnChild(command: string, args: string[], options: { cwd: string; env: NodeJS.ProcessEnv; detached?: boolean }): ChildProcess {
  const child = spawn(command, args, { ...options, stdio: 'inherit' });
  child.once('exit', (code, signal) => {
    if (code && code !== 0) console.error(`[dev] ${path.basename(command)} exited with code ${code}${signal ? ` (${signal})` : ''}.`);
  });
  return child;
}

function stopChild(child: ChildProcess | null): void {
  if (!child?.pid) return;
  try { process.kill(child.pid, 'SIGTERM'); } catch { /* already gone */ }
}

function stopHostGroup(child: ChildProcess | null): void {
  if (!child?.pid) return;
  try { process.kill(-child.pid, 'SIGTERM'); } catch { stopChild(child); }
}

function openBrowser(url: string): void {
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try { spawn(command, args, { stdio: 'ignore', detached: true }).unref(); } catch { /* browser open is best effort */ }
}

type HarnessWatch = {
  close(): void;
  ready: Promise<void>;
};

function watchHarness(dataRoot: string): HarnessWatch {
  let timer: NodeJS.Timeout | null = null;
  let running = false;
  let pending = false;
  let closed = false;
  const watchers: fs.FSWatcher[] = [];
  const schedule = () => {
    if (closed) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; void rebuild(); }, 500);
  };
  const rebuild = async (): Promise<void> => {
    if (closed) return;
    if (running) { pending = true; return; }
    running = true;
    console.log('[dev] harness changed; rebuilding runtime…');
    try {
      prepareDevelopmentAgent({ serviceRoot, agentRoot, build: true, buildWeb: false });
      const result: any = await activateAgentServiceRuntime({ dataRoot, profileId: 'development' });
      console.log(`[dev] harness runtime updated${result?.digest ? `: ${String(result.digest).slice(0, 12)}…` : ''}. If this change touched HTTP contracts, restart buildr dev so host-side types regenerate.`);
    } catch (error) {
      console.error('[dev] harness rebuild failed; previous runtime retained:', error instanceof Error ? error.message : String(error));
    } finally {
      running = false;
      if (pending && !closed) { pending = false; void rebuild(); }
    }
  };
  const sourceRoot = path.join(agentRoot, 'src');
  if (fs.existsSync(sourceRoot)) watchers.push(fs.watch(sourceRoot, { recursive: true }, schedule));
  for (const file of [path.join(agentRoot, 'tools', 'build.ts'), path.join(agentRoot, 'package.json'), path.join(agentRoot, 'tsconfig.json')]) {
    if (!fs.existsSync(file)) continue;
    watchers.push(fs.watch(file, schedule));
  }
  return {
    close() {
      closed = true;
      if (timer) clearTimeout(timer);
      for (const watcher of watchers) { try { watcher.close(); } catch { /* already closed */ } }
    },
    ready: Promise.resolve(),
  };
}

function assertDevelopmentCheckout(): void {
  for (const directory of [agentRoot, webRoot, harnessWebRoot]) {
    if (!fs.existsSync(path.join(directory, 'src'))) {
      throw new Error('buildr dev requires the Buildr product development checkout; run it from the product workspace.');
    }
  }
}

/** A fresh checkout may not have the ignored build outputs yet. The host still
 * renders its ordinary page to expose the development session token, so build
 * only the missing artifacts once; Vite serves the live sources afterwards. */
function ensureDevelopmentArtifacts(): void {
  if (!fs.existsSync(path.join(serviceRoot, 'node_modules', '@buildr-ai', 'buildr-harness', 'build', 'index.js'))) {
    console.log('[dev] preparing the development harness package (first run)…');
    prepareDevelopmentAgent({ serviceRoot, agentRoot, build: true });
  }
  if (!fs.existsSync(path.join(serviceRoot, 'web-dist', 'index.html'))) {
    console.log('[dev] building the development web shell (first run)…');
    buildWebDist(path.join(serviceRoot, 'web-dist'));
  }
}

function resolveOptions(args: string[]): LiveOptions {
  const valueOptions = new Set(['--target', '--port', '--web-port', '--harness-web-port']);
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === '--no-open') continue;
    if (!valueOptions.has(argument)) throw new Error(`Unknown buildr dev option: ${argument}.`);
    if (!args[index + 1] || args[index + 1].startsWith('--')) throw new Error(`Missing value for ${argument}.`);
    index++;
  }
  const workspace = optionValue(args, '--target', '');
  const workspaceRoot = workspace
    ? path.resolve(workspace)
    : findWorkspaceRoot(process.cwd()) || findWorkspaceRoot(serviceRoot);
  if (!workspaceRoot) throw new Error('Cannot find a Buildr workspace; run from the workspace or pass --target.');
  return {
    hostPort: positivePort(args, '--port', DEFAULT_HOST_PORT),
    webPort: positivePort(args, '--web-port', DEFAULT_WEB_PORT),
    harnessWebPort: positivePort(args, '--harness-web-port', DEFAULT_HARNESS_WEB_PORT),
    open: !args.includes('--no-open'),
    workspaceRoot,
  };
}

export async function runDevelopmentLive(args: string[] = []): Promise<void> {
  assertDevelopmentCheckout();
  const options = resolveOptions(args);
  ensureDevelopmentArtifacts();
  const dataRoot = buildrWebDataRoot();
  const hostUrl = `http://127.0.0.1:${options.hostPort}`;
  const webUrl = `http://127.0.0.1:${options.webPort}/`;
  const harnessWebUrl = `http://127.0.0.1:${options.harnessWebPort}`;
  const previous: InstanceRecord | null = readJson(instanceFile(dataRoot));
  const previousPid = alive(previous?.pid) ? previous!.pid! : null;

  console.log('Buildr dev mode');
  console.log(`  workspace: ${options.workspaceRoot}`);
  console.log(`  data:      ${dataRoot}`);
  console.log(`  host:      ${hostUrl} (source watch)`);
  console.log(`  web:       ${webUrl} (Vite HMR)`);
  console.log(`  harness:   ${harnessWebUrl}/harness/ (Vite HMR)`);
  console.log('  Ctrl+C to stop.');

  let host: ChildProcess | null = null;
  let web: ChildProcess | null = null;
  let harnessWeb: ChildProcess | null = null;
  let watcher: HarnessWatch | null = null;
  let stopping = false;
  let interrupted = false;
  const stop = async (): Promise<void> => {
    if (stopping) return;
    stopping = true;
    watcher?.close();
    stopChild(web);
    stopChild(harnessWeb);
    stopHostGroup(host);
    await delay(800);
    if (alive(host?.pid ?? undefined)) { try { process.kill(-host!.pid!, 'SIGKILL'); } catch { /* already gone */ } }
    console.log('\n[dev] stopped.');
  };
  const signal = new Promise<void>(resolve => {
    const finish = () => { interrupted = true; void stop().finally(resolve); };
    process.once('SIGINT', finish);
    process.once('SIGTERM', finish);
  });

  const startup = async (): Promise<void> => {
    await stopExistingDevelopmentInstance(dataRoot);
    if (stopping) return;
    if (!await portFree(options.hostPort)) throw new Error(`Port ${options.hostPort} is still occupied; refusing to take over an unowned process.`);
    if (stopping) return;
    host = spawnChild(process.execPath, [
      '--watch-path', path.join(serviceRoot, 'src'),
      '--watch-path', path.join(serviceRoot, 'bin'),
      path.join(serviceRoot, 'bin', 'buildr.mjs'),
      'web', '--target', options.workspaceRoot, '--port', String(options.hostPort), '--no-open',
    ], { cwd: serviceRoot, env: process.env, detached: true });
    const instance = await waitForHost(dataRoot, hostUrl, previousPid, () => stopping);
    if (stopping) return;
    const hostSessionUrl = instance.url || hostUrl;
    const env = { ...process.env, BUILDR_DEV_HOST_URL: hostSessionUrl, BUILDR_DEV_HARNESS_URL: harnessWebUrl, BUILDR_DEV_HARNESS_WEB_PORT: String(options.harnessWebPort) };
    const vite = (root: string, port: number, extra: string[] = []) => {
      const bin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
      if (!fs.existsSync(bin)) throw new Error(`Vite is unavailable in ${root}; install development dependencies first.`);
      return spawnChild(process.execPath, [bin, '--host', '127.0.0.1', '--port', String(port), '--strictPort', ...extra], { cwd: root, env });
    };
    web = vite(webRoot, options.webPort);
    if (stopping) return;
    harnessWeb = vite(harnessWebRoot, options.harnessWebPort);
    await Promise.all([
      waitForPage(webUrl, 20_000, () => stopping),
      waitForPage(`${harnessWebUrl}/harness/`, 20_000, () => stopping),
    ]);
    if (stopping) return;
    watcher = watchHarness(dataRoot);
    await watcher.ready;
    console.log('[dev] ready.');
    if (options.open) openBrowser(webUrl);
  };

  try {
    const started = startup();
    await Promise.race([started, signal]);
    if (!interrupted) await signal;
    else await started.catch(() => { /* startup aborts once stop is observed */ });
  } catch (error) {
    if (!interrupted) {
      await stop();
      throw error;
    }
  }
  await stop();
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  runDevelopmentLive(process.argv.slice(2)).catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
