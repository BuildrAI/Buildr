/** Host-only subprocess adapter: discovery, public status queries, and launcher reuse. */
import { execFile } from 'node:child_process';
import type { ExecFileOptionsWithStringEncoding } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { createBuildrBridge, BuildrBridgeError, objectRecord } from './bridge.ts';
import { assertSupportedPlatform, launcherExecutable, launcherIdentityCandidates } from './platform.ts';
import type { BuildrChannel } from './platform.ts';
import type { Config } from './src/types.ts';

/**
 * Everything this plugin needs to reach this machine's Buildr: two paths and nothing else.
 *
 * It records no channel and no installation identity. The channel is a property of the plugin
 * package, and installation identity is read from Buildr's public status on every click, so upgrading
 * Buildr or switching installations never requires re-registering anything.
 */
export interface Binding {
  nodeExecutable: string;
  cliEntry: string;
  nodeSha256?: string;
  cliSha256?: string;
}

export interface ProcessDependencies {
  exec?(file: string, args: string[], options: ExecFileOptionsWithStringEncoding): Promise<{ stdout: string; stderr?: string }>;
  environment?: NodeJS.ProcessEnv;
  platform?: string;
  executable?: string;
  /** Digest provider, so a caller that already verified an entry can reuse the same evidence. */
  digest?(file: string): Promise<string>;
}

const execute = promisify(execFile);
const digestPattern = /^sha256-[a-f0-9]{64}$/;

function invalid(message: string): never { throw new BuildrBridgeError('invalid-binding', message); }

/** Validate a registration that came from configuration; every field is a machine-local path. */
export function validateBinding(input: unknown): Readonly<Binding> {
  const value = objectRecord(input);
  for (const field of ['nodeExecutable', 'cliEntry'] as const) {
    if (typeof value[field] !== 'string' || !path.isAbsolute(value[field] as string) || (value[field] as string).includes('\0')) {
      invalid('Buildr 接入必须使用经过核实的绝对安装路径。');
    }
  }
  for (const field of ['nodeSha256', 'cliSha256'] as const) {
    if (value[field] !== undefined && (typeof value[field] !== 'string' || !digestPattern.test(value[field] as string))) invalid('Buildr 入口校验摘要无效。');
  }
  return Object.freeze({ ...value }) as unknown as Readonly<Binding>;
}

export async function fileDigest(file: string): Promise<string> {
  const info = await stat(file);
  if (!info.isFile()) invalid('Buildr 接入路径不是普通文件。');
  return `sha256-${createHash('sha256').update(await readFile(file)).digest('hex')}`;
}

async function verifyFile(file: string, expected?: string, digest: (file: string) => Promise<string> = fileDigest): Promise<void> {
  try {
    const info = await stat(file);
    if (!info.isFile()) throw new Error('not a file');
    if (expected && await digest(file) !== expected) throw new Error('digest changed');
  } catch {
    throw new BuildrBridgeError('installation-drift', 'Buildr 安装入口缺失或已变化，请重新安装 Buildr 后重试。');
  }
}

/**
 * Where a global npm installation of Buildr can live, derived from the runtime already running this
 * plugin. PATH is deliberately not consulted: a desktop application commonly inherits a minimal PATH,
 * so "whichever buildr is first on PATH" is not a dependable answer.
 */
function packageCandidates(environment: NodeJS.ProcessEnv, platform: string, executable: string): string[] {
  const directory = path.dirname(executable);
  const candidates = [
    // A normal npm prefix: <prefix>/bin/node with <prefix>/lib/node_modules on macOS and Linux.
    path.join(directory, '..', 'lib', 'node_modules'),
    // The same prefix, and the Windows layout, where node sits beside node_modules.
    path.join(directory, '..', 'node_modules'),
    path.join(directory, 'node_modules'),
  ];
  // nvm and similar version managers keep every Node under one home with a shared global root.
  const nvmHome = environment.NVM_DIR?.trim();
  if (nvmHome) candidates.push(path.join(nvmHome, 'versions', 'node', path.basename(directory), 'lib', 'node_modules'));
  if (platform === 'win32') {
    const appData = environment.APPDATA?.trim();
    if (appData) candidates.push(path.join(appData, 'npm', 'node_modules'));
  }
  return candidates;
}

/**
 * Buildr's own registry of what it installed on this machine, including each installation's exact
 * entry. Reading it is discovery, not guessing: the file is written by Buildr itself. The platform
 * state root mirrors the one Buildr's public status code publishes, so a miss is simply a miss.
 */
export function registryFile(environment: NodeJS.ProcessEnv, platform: string): string {
  const home = environment.HOME?.trim() || os.homedir();
  if (platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'Buildr', 'product-installations.json');
  if (platform === 'win32') {
    const appData = environment.LOCALAPPDATA?.trim() || path.join(home, 'AppData', 'Local');
    return path.join(appData, 'Buildr', 'product-installations.json');
  }
  const stateHome = environment.XDG_STATE_HOME?.trim() || path.join(home, '.local', 'state');
  return path.join(stateHome, 'buildr', 'product-installations.json');
}

/** The npm installation Buildr recorded, exactly as Buildr recorded it. */
async function registeredInstallations(environment: NodeJS.ProcessEnv, platform: string): Promise<{ entryPath: string; node?: string }[]> {
  try {
    const registry = objectRecord(JSON.parse(await readFile(registryFile(environment, platform), 'utf8')) as unknown);
    const installations = registry.installations;
    if (!Array.isArray(installations)) return [];
    return installations.flatMap(item => {
      const record = objectRecord(item);
      const origin = objectRecord(record.origin);
      const runtime = objectRecord(record.runtime);
      if (origin.package !== '@buildr-ai/buildr' || origin.channel !== 'npm') return [];
      const entryPath = record.entryPath;
      if (typeof entryPath !== 'string' || !path.isAbsolute(entryPath)) return [];
      const node = runtime.executable;
      return [{ entryPath, ...(typeof node === 'string' && path.isAbsolute(node) ? { node } : {}) }];
    });
  } catch {
    return [];
  }
}

/** Read the entry a package declares, so the plugin runs Buildr's own documented command. */
async function packageEntry(packageRoot: string): Promise<string | undefined> {
  try {
    const manifest = objectRecord(JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8')) as unknown);
    if (manifest.name !== '@buildr-ai/buildr') return undefined;
    const declared = objectRecord(manifest.bin).buildr ?? manifest.main;
    if (typeof declared !== 'string' || path.isAbsolute(declared)) return undefined;
    const entry = path.resolve(packageRoot, declared);
    return path.relative(packageRoot, entry).startsWith('..') ? undefined : entry;
  } catch {
    return undefined;
  }
}

/**
 * Find this machine's Buildr without asking the user anything. Discovery reads only Buildr's own
 * published package layout; when nothing is found the caller reports that, rather than guessing.
 */
export async function discoverBinding(
  environment: NodeJS.ProcessEnv = process.env,
  platform: string = process.platform,
  executable: string = process.execPath,
): Promise<Readonly<Binding> | null> {
  assertSupportedPlatform(platform);
  for (const recorded of await registeredInstallations(environment, platform)) {
    try {
      await verifyFile(recorded.entryPath);
    } catch {
      continue;
    }
    return Object.freeze({ nodeExecutable: recorded.node ?? executable, cliEntry: recorded.entryPath });
  }
  for (const modules of packageCandidates(environment, platform, executable)) {
    const root = path.join(modules, '@buildr-ai', 'buildr');
    const entry = await packageEntry(root);
    if (entry === undefined) continue;
    try {
      await verifyFile(entry);
    } catch {
      continue;
    }
    return Object.freeze({ nodeExecutable: executable, cliEntry: entry });
  }
  return null;
}

/** One channel's entry: what to execute, with which runtime, and how the entry path is passed. */
export interface ChannelCommand { executable: string; argv: string[]; nodeExecutable: string }

/**
 * Resolve how to run one channel. The registered pointer covers the npm installation; the development
 * channel reports its own source root in public status, and Buildr's documented Product wrapper sits
 * beside that root, so a development entry needs no separate registration.
 */
export function channelCommand(binding: Binding, channel: BuildrChannel, status?: unknown): ChannelCommand {
  if (channel === 'development') {
    const development = objectRecord(objectRecord(status).channels).development;
    const root = objectRecord(objectRecord(development).identity).sourceRoot;
    const runtimeExecutable = objectRecord(objectRecord(development).runtime).executable;
    const nodeExecutable = typeof runtimeExecutable === 'string' && path.isAbsolute(runtimeExecutable) ? runtimeExecutable : binding.nodeExecutable;
    if (typeof root !== 'string' || !path.isAbsolute(root)) {
      throw new BuildrBridgeError('channel-missing', '这台机器上没有检测到 Buildr 开发版；开发版入口来自它自己的源码登记。');
    }
    return { executable: path.resolve(root, '../../buildr'), argv: [], nodeExecutable };
  }
  return { executable: binding.nodeExecutable, argv: [binding.cliEntry], nodeExecutable: binding.nodeExecutable };
}

/** Do not inherit another Buildr channel's environment from the DSH process. */
export function childEnvironment(environment: NodeJS.ProcessEnv, binding: Binding, channel: BuildrChannel): NodeJS.ProcessEnv {
  const result = Object.fromEntries(Object.entries(environment).filter(([key]) => !key.startsWith('BUILDR_') && key !== 'NODE_OPTIONS' && key !== 'NODE_PATH'));
  if (channel === 'development') result.BUILDR_NODE = binding.nodeExecutable;
  return result;
}

/** Execute the registered entry. The query is channel-neutral; the caller decides which channel to act on. */
export async function queryInstallation(binding: Binding, signal: AbortSignal, { exec = execute, environment = process.env, digest = fileDigest }: ProcessDependencies = {}): Promise<unknown> {
  signal.throwIfAborted();
  await verifyFile(binding.nodeExecutable, binding.nodeSha256, digest);
  await verifyFile(binding.cliEntry, binding.cliSha256, digest);
  signal.throwIfAborted();
  const command = channelCommand(binding, 'npm');
  try {
    const result = await exec(command.executable, [...command.argv, 'installation', 'status', '--json'], {
      cwd: path.dirname(binding.cliEntry), env: childEnvironment(environment, binding, 'npm'),
      shell: false, windowsHide: true, signal, timeout: 10_000, maxBuffer: 2 * 1024 * 1024, encoding: 'utf8',
    });
    return JSON.parse(result.stdout) as unknown;
  } catch {
    if (signal.aborted) throw signal.reason;
    throw new BuildrBridgeError('query-failed', 'Buildr 安装状态查询失败，请检查本机 Buildr 后重试。');
  }
}

/** The launcher Buildr reports for a channel, so a non-conventional installation stays reachable. */
function launcherTarget(status: unknown, channel: BuildrChannel, environment: NodeJS.ProcessEnv, platform: string): string | undefined {
  const reported = objectRecord(objectRecord(status).launchers)[channel];
  if (typeof reported === 'string' && path.isAbsolute(reported)) return reported;
  const npmTarget = objectRecord(objectRecord(status).launcher).target;
  if (channel === 'npm' && typeof npmTarget === 'string' && npmTarget) return npmTarget;
  return launcherIdentityCandidates(channel, environment, platform).at(-1)?.root;
}

/** Reuse Buildr's own launcher for the requested channel rather than opening the app through a browser. */
export async function launchInstallation(
  binding: Binding, channel: BuildrChannel, status: unknown, signal: AbortSignal,
  { exec = execute, environment = process.env, platform = process.platform }: ProcessDependencies = {},
): Promise<void> {
  assertSupportedPlatform(platform);
  const target = launcherTarget(status, channel, environment, platform);
  if (target === undefined) throw new BuildrBridgeError('launcher-mismatch', '未找到该渠道的 Buildr 启动器，请先安装并重试。');
  const file = launcherExecutable(target, channel, platform);
  await verifyFile(file);
  signal.throwIfAborted();
  try {
    await exec(file, [], {
      cwd: path.dirname(file),
      env: { ...childEnvironment(environment, binding, channel), BUILDR_LAUNCHER_NO_OPEN: '1', BUILDR_LAUNCHER_NO_NOTIFY: '1' },
      shell: false, windowsHide: true, signal, timeout: 10_000, maxBuffer: 64 * 1024, encoding: 'utf8',
    });
  } catch {
    if (signal.aborted) throw signal.reason;
    throw new BuildrBridgeError('launch-failed', 'Buildr 启动器未成功启动，请检查安装后重试。');
  }
}

/**
 * One disposable coordinator per installed Host plugin instance. An unregistered install is normal:
 * the pointer is resolved from configuration or discovered here, and only a real miss is reported.
 */
export function createInstalledBuildrBridge(
  config: Config, channel: BuildrChannel, dependencies: ProcessDependencies = {},
  binding: Readonly<Binding> | null = config?.binding === undefined ? null : validateBinding(config.binding),
) {
  assertSupportedPlatform(dependencies.platform ?? process.platform);
  if (binding === null) return null;
  return createBuildrBridge({ ...binding, channel }, {
    query: signal => queryInstallation(binding, signal, dependencies),
    launch: (target, status, signal) => launchInstallation(binding, target, status, signal, dependencies),
    timeoutMs: config.timeoutMs ?? 30_000, pollMs: config.pollMs ?? 300,
  });
}

export type { BuildrChannel } from './platform.ts';
