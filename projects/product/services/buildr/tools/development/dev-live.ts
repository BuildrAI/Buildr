import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';
import {spawn, execFile, type ChildProcess} from 'node:child_process';
import {promisify} from 'node:util';
import {pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {buildrWebDataRoot} from '../../src/modules/workspace/module.ts';
import {acquireExclusiveFileLock, releaseExclusiveFileLock} from '../../src/infrastructure/filesystem/exclusive-file-lock.ts';
import {DevelopmentUpdates, assertDevelopmentDependencies, developmentUpdatePaths, replaceDevelopmentHost, withDevelopmentUpdate} from './dev-update.ts';
import {createDevelopmentSnapshot, pruneDevelopmentSnapshots, type DevelopmentSnapshot} from './dev-snapshot.ts';

const execute = promisify(execFile);
const serviceRoot = path.resolve(import.meta.dirname, '../..');
const agentRoot = path.resolve(serviceRoot, '../buildr-harness');
type Instance = {url: string; secret: string; pid: number; productIdentity?: {channel?: string; sourceRoot?: string}; launcherIdentity?: {channel?: string; sourceRoot?: string}};
const read = <T>(file: string): T | undefined => {try {return JSON.parse(fs.readFileSync(file, 'utf8'));} catch (error: any) {if (error.code === 'ENOENT') return; throw error;}};
const alive = (pid?: number) => {if (!pid) return false; try {process.kill(pid, 0); return true;} catch (error: any) {return error.code !== 'ESRCH';}};
async function free(port: number) {return new Promise<boolean>(resolve => {const server = net.createServer(); server.once('error', () => resolve(false)); server.listen(port, '127.0.0.1', () => server.close(() => resolve(true)));});}
function options(args: string[]) {
  let port = 4458, target = process.cwd(), open = true;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--no-open') {open = false; continue;}
    if (!['--target', '--port'].includes(args[i]!)) throw new Error(`Unknown buildr dev option: ${args[i]}. Use the host --port; separate Vite ports have been retired.`);
    const key = args[i]!, value = args[++i];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${key}.`);
    if (key === '--target') target = path.resolve(value); else port = Number(value);
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Development host port must be a valid fixed port.');
  while (!fs.existsSync(path.join(target, '.buildr/workspace.yml'))) {
    const parent = path.dirname(target); if (parent === target) throw new Error('Cannot find a Buildr workspace; pass --target.'); target = parent;
  }
  return {port, target, open};
}

export async function runDevelopmentLive(args: string[] = []) {
  const opts = options(args);
  if (!fs.existsSync(path.resolve(serviceRoot, '../buildr-web/src'))) throw new Error('buildr dev requires the product source checkout.');
  const dataRoot = buildrWebDataRoot();
  const paths = developmentUpdatePaths(serviceRoot);
  const canonical = path.dirname(path.dirname(paths.lock));
  if (path.resolve(serviceRoot, '../../../..') !== path.dirname(canonical) && !process.env.BUILDR_APP_DATA_DIR) {
    throw new Error('A task worktree must use an isolated BUILDR_APP_DATA_DIR; candidate code cannot update the retained development profile.');
  }
  fs.mkdirSync(dataRoot, {recursive: true});
  const sessionLock = acquireExclusiveFileLock(path.join(dataRoot, 'development-live.lock'), serviceRoot, {timeoutMs: 0});
  const statusFile = path.join(dataRoot, 'development-live.json');
  const instanceFile = path.join(dataRoot, 'instance.json');
  const hostUrl = `http://127.0.0.1:${opts.port}`;
  let child: ChildProcess | undefined, owned: Instance | undefined, previous: DevelopmentSnapshot | undefined;
  let stopping = false, expectedExit = false, paused = false, queue: DevelopmentUpdates | undefined;
  let crashRestarts = 0;
  const watchers: fs.FSWatcher[] = [];
  const status: {phase: string; current: string | null; target: string | null; failure: string | null; pid: number; harness?: unknown} = {phase: 'preparing', current: null, target: null, failure: null, pid: process.pid};
  const publish = (phase: string, failure: string | null = null) => {
    status.phase = phase; status.failure = failure;
    const temporary = `${statusFile}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(status) + '\n', {mode: 0o600}); fs.renameSync(temporary, statusFile);
    console.log(`[dev] ${phase}; current=${status.current?.slice(0, 12) ?? 'none'} target=${status.target?.slice(0, 12) ?? 'none'}${failure ? `; ${failure}` : ''}`);
  };
  const helperEnv = () => {const env = {...process.env}; for (const key of ['BUILDR_DEV_LIVE', 'BUILDR_DEV_SNAPSHOT', 'BUILDR_DEV_SNAPSHOT_ID', 'BUILDR_DEV_STATUS_FILE']) delete env[key]; return env;};
  async function command(script: string, tail: string[] = []) {
    try {
      const result = await execute(process.execPath, [script, ...tail], {cwd: serviceRoot, env: helperEnv(), timeout: 240_000, maxBuffer: 8 * 1024 * 1024});
      if (result.stderr) process.stderr.write(result.stderr);
      return result.stdout;
    } catch (error: any) {
      for (const line of String(error.stderr || '').split('\n')) {
        try { const observed = JSON.parse(line); if (observed.status === 'unconfirmed') status.harness = observed; } catch { /* compiler output is not a runtime observation */ }
      }
      throw error;
    }
  }
  async function observe(instance: Instance) {
    const response = await fetch(new URL('/api/v1/health', instance.url), {headers: {'x-buildr-instance': instance.secret}, signal: AbortSignal.timeout(2000)});
    if (!response.ok) throw new Error(`development_instance_unconfirmed: HTTP ${response.status}`);
    const health: any = await response.json();
    if (health.pid !== instance.pid || health.productIdentity?.channel !== 'development' || path.resolve(health.productIdentity?.sourceRoot || '') !== serviceRoot) throw new Error('development_instance_owner_mismatch');
    return health;
  }
  async function stopHost() {
    const current = read<Instance>(instanceFile);
    if (owned && current && current.pid !== owned.pid && alive(owned.pid)) throw new Error('development_instance_replaced; original process retained');
    if (current && alive(current.pid)) {
      // A formal update may have replaced our child. Reauthenticate exact source
      // and record immediately before asking that instance to relinquish the port.
      await observe(current);
      const response = await fetch(new URL('/api/v1/app/quit-instance', current.url), {method: 'POST', headers: {'x-buildr-instance': current.secret}, signal: AbortSignal.timeout(5000)});
      if (!response.ok) throw new Error(`development_stop_unconfirmed: HTTP ${response.status}`);
      expectedExit = true;
      const deadline = Date.now() + 20_000;
      while (alive(current.pid) && Date.now() < deadline) await delay(100);
      if (alive(current.pid)) throw new Error('development_stop_unconfirmed; no force kill performed');
    } else if (owned && !current && alive(owned.pid)) {
      expectedExit = true;
      const deadline = Date.now() + 10_000;
      while (alive(owned.pid) && Date.now() < deadline) await delay(100);
      if (alive(owned.pid)) throw new Error('development_stop_unconfirmed; no force kill performed');
    } else if (child && child.exitCode === null && child.signalCode === null) {
      // Startup did not publish a listener: this is still our exact child handle,
      // not a recovered PID, and has not accepted browser operations.
      expectedExit = true; child.kill('SIGTERM');
      const deadline = Date.now() + 10_000;
      while (child.exitCode === null && child.signalCode === null && Date.now() < deadline) await delay(50);
      if (child.exitCode === null && child.signalCode === null) throw new Error('development_startup_exit_unconfirmed');
    }
    child = undefined; owned = undefined;
  }
  const snapshotEnv = (snapshot: DevelopmentSnapshot) => ({...helperEnv(), BUILDR_DEV_LIVE: '1', BUILDR_DEV_SNAPSHOT: snapshot.file, BUILDR_DEV_SNAPSHOT_ID: snapshot.id, BUILDR_DEV_STATUS_FILE: statusFile});
  async function check(snapshot: DevelopmentSnapshot) {
    await execute(process.execPath, ['--import', path.join(snapshot.root, 'loader.mjs'), '--input-type=module', '-e', `await import(${JSON.stringify(pathToFileURL(path.join(serviceRoot, 'src/bootstrap/runtime.ts')).href)})`], {cwd: serviceRoot, env: snapshotEnv(snapshot), timeout: 30_000, maxBuffer: 4 * 1024 * 1024});
  }
  async function start(snapshot: DevelopmentSnapshot) {
    if (stopping) throw new Error('Development startup stopped.');
    if (!await free(opts.port)) throw new Error(`Port ${opts.port} is occupied; refusing to take over an unowned process.`);
    expectedExit = false;
    child = spawn(process.execPath, ['--import', path.join(snapshot.root, 'loader.mjs'), path.join(serviceRoot, 'bin/buildr.mjs'), 'web', '--target', opts.target, '--port', String(opts.port), '--no-open'], {cwd: serviceRoot, env: snapshotEnv(snapshot), stdio: 'inherit'});
    const started = child;
    let starting = true;
    let startupError: Error | undefined;
    started.once('error', error => {startupError = error;});
    started.once('exit', () => {if (child === started && !starting && !expectedExit && !stopping) queue?.request('host-exit');});
    const deadline = Date.now() + 45_000;
    while (Date.now() < deadline && !stopping) {
      if (startupError) throw startupError;
      if (started.exitCode !== null || started.signalCode !== null) throw new Error(`development_host_exited: ${started.exitCode ?? started.signalCode}`);
      const current = read<Instance>(instanceFile);
      if (current && current.pid === started.pid) {
        await observe(current); owned = current;
        if (current.url !== hostUrl) throw new Error('development_port_changed; refusing a fallback address');
        const page = await fetch(hostUrl, {signal: AbortSignal.timeout(5000)});
        if (!page.ok || !(await page.text()).includes('/@vite/client')) throw new Error('development_source_page_not_ready');
        status.current = snapshot.id; starting = false; return;
      }
      await delay(100);
    }
    throw new Error('development_host_readiness_timeout');
  }
  async function update(changes: Set<string>, current: () => boolean) {
    if (fs.existsSync(paths.activation)) {paused = true; publish('suspended'); return;}
    await withDevelopmentUpdate(serviceRoot, async () => {
      if (stopping || !current()) return;
      if (changes.has('host-exit')) {
        if (++crashRestarts > 2) {publish('failed', 'development_host_restart_limit; fix the source to retry'); return;}
      } else crashRestarts = 0;
      publish('preparing');
      assertDevelopmentDependencies([serviceRoot, agentRoot, path.resolve(serviceRoot, '../buildr-web'), path.resolve(serviceRoot, '../buildr-harness-web')]);
      if (changes.has('harness') || !previous) {
        const output = await command(path.join(serviceRoot, 'tools/development/dev-harness-update.ts'), [dataRoot]);
        const line = output.trim().split('\n').at(-1); status.harness = line ? JSON.parse(line) : null;
      }
      const candidate = createDevelopmentSnapshot(serviceRoot);
      status.target = candidate.id;
      if (previous?.id === candidate.id && owned && alive(owned.pid) && !changes.has('host-exit') && !changes.has('resume')) {publish('ready'); return;}
      await check(candidate);
      if (!current() || stopping) return;
      publish('switching');
      const lastGood = previous?.id;
      previous = await replaceDevelopmentHost(candidate, previous, {check: async () => {}, stop: stopHost, start, report: (error, restored) => publish(restored ? 'restored' : 'recovery-failed', String((error as Error).message))});
      pruneDevelopmentSnapshots(serviceRoot, new Set([previous.id, ...(lastGood ? [lastGood] : [])]));
      if (previous.id === candidate.id) publish('ready');
    }, {stopped: () => stopping});
  }
  const failed = (error: unknown) => {
    if ((error as Error).message === 'development_activation_in_progress') {paused = true; publish('suspended');}
    else publish('failed', (error as Error).message);
  };
  let resolveStop: () => void;
  const stopped = new Promise<void>(resolve => {resolveStop = resolve;});
  const signal = () => {stopping = true; resolveStop();};
  process.once('SIGINT', signal); process.once('SIGTERM', signal);
  let observer: NodeJS.Timeout | undefined;
  try {
    // Prepare DTOs/package before freezing code. No first-run frontend production
    // build is needed to extract a session: the host now renders source directly.
    // Start the native watchers before preparing the initial host so its first
    // ready state cannot race with the watcher's asynchronous startup.
    let initialUpdate: Promise<void>;
    queue = new DevelopmentUpdates(async (changes, current) => {
      await initialUpdate;
      if (current() && !stopping) await update(changes, current);
    }, failed);
    for (const [root, kind] of [[path.join(serviceRoot, 'src'), 'host'], [path.join(serviceRoot, 'bin'), 'host'], [path.join(agentRoot, 'src'), 'harness'], [path.join(agentRoot, 'tools'), 'harness']] as const) {
      watchers.push(fs.watch(root, {recursive: true}, () => queue!.request(kind)));
    }
    for (const root of [serviceRoot, agentRoot, path.resolve(serviceRoot, '../buildr-web'), path.resolve(serviceRoot, '../buildr-harness-web')]) {
      watchers.push(fs.watch(root, (_event, filename) => {
        if (['package.json', 'package-lock.json', 'tsconfig.json'].includes(String(filename))) queue!.request('harness');
      }));
    }
    initialUpdate = update(new Set(['initial']), () => !stopping);
    await initialUpdate;
    observer = setInterval(() => {
      if (fs.existsSync(paths.activation)) {if (!paused) {paused = true; publish('suspended');}}
      else if (paused) {paused = false; queue!.request('resume');}
    }, 500);
    console.log(`Buildr dev: ${hostUrl} (same-origin source + API + HMR)`);
    if (opts.open) {
      const executable = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
      const browser = spawn(executable, process.platform === 'win32' ? ['/c', 'start', '', hostUrl] : [hostUrl], {stdio: 'ignore'}); browser.once('error', () => {}); browser.unref();
    }
    await stopped;
  } finally {
    stopping = true;
    process.removeListener('SIGINT', signal); process.removeListener('SIGTERM', signal);
    if (observer) clearInterval(observer);
    for (const watcher of watchers) watcher.close();
    await queue?.close();
    // Formal activation owns replacements while its lock exists; do not stop
    // its successor, or a different process merely sharing our previous port.
    const current = read<Instance>(instanceFile);
    try {
      if ((owned && current?.pid === owned.pid || child && !current) && !fs.existsSync(paths.activation)) await stopHost();
      publish('stopped');
    } finally {releaseExclusiveFileLock(sessionLock);}
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) runDevelopmentLive(process.argv.slice(2)).catch(error => {console.error(error.message); process.exitCode = 1;});
