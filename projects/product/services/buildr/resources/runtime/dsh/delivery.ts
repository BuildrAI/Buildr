/** Local delivery preparation owned by the DSH adapter; DSH still owns installation and activation. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { discoverBinding, fileDigest, queryInstallation, validateBinding, childEnvironment } from './process.ts';
import type { Binding, QueryBinding } from './process.ts';
import { objectRecord } from './bridge.ts';

interface DeliveryDependencies {
  signal?: AbortSignal;
  query?(binding: QueryBinding, signal: AbortSignal): Promise<unknown>;
  digest?(file: string): Promise<string>;
  platform?: string;
  status?: unknown;
}

interface DeliveryInput {
  bundleRoot: string;
  output: string;
  invocation: { command?: string; argsPrefix?: string[] };
}

const execute = promisify(execFile);
function reject(message: string): never { throw new Error(`DSH 插件准备失败：${message}`); }
function assertStatus(value: unknown): Record<string, unknown> {
  const status = objectRecord(value);
  if (status.schemaVersion !== 'buildr.installation-status/v1') reject('公开安装状态格式不受支持。');
  return status;
}

async function queryCommand(command: string | undefined, args: string[] | undefined, env: NodeJS.ProcessEnv, signal: AbortSignal): Promise<Record<string, unknown>> {
  if (!command || !args) reject('没有提供当前 Buildr 查询入口。');
  const result = await execute(command, [...args, 'installation', 'status', '--json'], {
    env, signal, shell: false, timeout: 10_000, maxBuffer: 2 * 1024 * 1024, encoding: 'utf8',
  });
  return assertStatus(JSON.parse(result.stdout) as unknown);
}

/**
 * Register this machine's Buildr from what Buildr itself published, with no user choice involved.
 *
 * Buildr's own registry records each installation's exact entry, and public status records the Node
 * that runs it, so registration copies two paths and nothing else. It never asks which channel to
 * use: a plugin package serves exactly one installation, and that is decided by the package.
 */
export async function createDeliveryBinding(status: unknown, dependencies: DeliveryDependencies = {}): Promise<Binding> {
  const inventory = assertStatus(status);
  const signal = dependencies.signal ?? AbortSignal.timeout(30_000);
  const npm = objectRecord(objectRecord(inventory.channels).npm);
  if (!['installed', 'current'].includes(String(npm.status))) {
    reject('公开状态未证明已安装 Buildr。请先安装 Buildr 后重试。');
  }
  const runtime = objectRecord(npm.runtime);
  const declared = runtime.executable;
  const nodeExecutable = typeof declared === 'string' && path.isAbsolute(declared) ? declared : process.execPath;
  const discovered = await discoverBinding(dependencies.environment ?? process.env, dependencies.platform ?? process.platform);
  if (discovered === null) reject('没有找到已登记的 Buildr 安装；请先安装 Buildr 后重试。');
  const binding: Binding = {
    nodeExecutable,
    cliEntry: discovered.cliEntry,
    cliSha256: await (dependencies.digest ?? fileDigest)(discovered.cliEntry),
    nodeSha256: await (dependencies.digest ?? fileDigest)(nodeExecutable),
  };
  validateBinding(binding);
  // Re-read public status through the registered entry, so a stale registry entry is never written.
  // A caller that already supplied verified status has done this check and needs no second run.
  if (dependencies.status === undefined) assertStatus(await (dependencies.query ?? queryInstallation)(binding, signal));
  return binding;
}

/**
 * Copy only regular files. A symlink, socket or device is never followed into the bundle, so a
 * prepared package cannot be used to reach outside the built artifact.
 */
async function copyRegularTree(source: string, destination: string): Promise<void> {
  await fs.mkdir(destination, { recursive: true });
  for (const dirent of await fs.readdir(source, { withFileTypes: true })) {
    const from = path.join(source, dirent.name);
    const to = path.join(destination, dirent.name);
    if (dirent.isSymbolicLink()) continue;
    if (dirent.isDirectory()) { await copyRegularTree(from, to); continue; }
    if (!dirent.isFile()) continue;
    await fs.writeFile(to, await fs.readFile(from), { mode: 0o600 });
  }
}

/** Prepare a private npm-format archive using macOS tar. Never edits a DSH profile or invokes a package manager. */
export async function prepareDshPlugin({ bundleRoot, output, invocation }: DeliveryInput, dependencies: DeliveryDependencies = {}): Promise<any> {
  const platform = dependencies.platform ?? process.platform;
  if (platform !== 'darwin') reject('第一版只支持 macOS 桌面版。');
  const source = path.resolve(bundleRoot);
  const target = path.resolve(output);
  if (target === source || target.startsWith(`${source}${path.sep}`)) reject('绑定输出必须与未绑定产物分离。');
  try { await fs.lstat(target); reject('输出已存在；保留原内容，请使用新的输出目录。'); }
  catch (error) { if (objectRecord(error).code !== 'ENOENT') throw error; }
  const manifest = objectRecord(JSON.parse(await fs.readFile(path.join(source, 'package.json'), 'utf8')) as unknown);
  // The bundle declares its own patch layer, and the released and development variants declare
  // different ones; the preparation writes the layer that layer's name says.
  const declaredPatch = objectRecord(objectRecord(manifest.dsh).bundle).patch;
  if (typeof manifest.name !== 'string' || !manifest.name.startsWith('@buildr-ai/dsh-plugin')
      || typeof declaredPatch !== 'string' || !declaredPatch.endsWith('.yml')
      || manifest.scripts && Object.keys(manifest.scripts).length) reject('产物不是无安装脚本的 Buildr DSH 组合包。');
  await fs.access(path.join(source, 'lib', 'index.js'));
  await fs.access(path.join(source, 'lib', 'client.js'));
  // Prefer a caller-provided status; otherwise read it through the entry that invoked preparation.
  const initial = dependencies.status ?? await queryCommand(invocation.command, invocation.argsPrefix,
    childEnvironment(process.env, { nodeExecutable: process.execPath, cliEntry: invocation.argsPrefix?.at(-1) ?? '' }, 'npm'), dependencies.signal ?? AbortSignal.timeout(30_000));
  const binding = await createDeliveryBinding(initial, dependencies);
  // The directory must be new; errors preserve partial output for diagnosis, never delete other writers' files.
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.mkdir(target, { mode: 0o700 });
  const packageRoot = path.join(target, 'package');
  const archive = path.join(target, 'buildr-dsh-plugin.tgz');
  await fs.mkdir(packageRoot);
  await copyRegularTree(path.join(source, 'lib'), path.join(packageRoot, 'lib'));
  await fs.writeFile(path.join(packageRoot, 'package.json'), `${JSON.stringify({ ...manifest, private: true }, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  const dev = String(manifest.name).endsWith('-dev');
  const entryId = dev ? 'buildr-dev' : 'buildr';
  await fs.writeFile(path.join(packageRoot, declaredPatch as string), `${JSON.stringify([{ insert: [{ id: entryId, name: manifest.name, config: { binding } }] }], null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  // COPYFILE_DISABLE stops macOS tar from writing AppleDouble `._*` companions: they are not package
  // content, and a consumer that reads the archive sees files the build never intended to ship.
  await execute('/usr/bin/tar', ['-czf', archive, '-C', target, 'package'], {
    shell: false, timeout: 10_000, maxBuffer: 64 * 1024, signal: dependencies.signal, encoding: 'utf8',
    env: { ...process.env, COPYFILE_DISABLE: '1' },
  });
  await fs.chmod(archive, 0o600);
  return {
    schemaVersion: 'buildr.dsh-plugin-delivery/v1', status: 'prepared', output: target, packageRoot, archive,
    archiveSha256: await fileDigest(archive),
    package: `${manifest.name}@${manifest.version}`, installationApplied: false,
    requires: { platform: 'darwin-desktop', slot: 'sidebar.footer.action', currentDesktopValidated: false },
    install: { tool: 'plugin_manager', arguments: { action: 'install_bundle', target: archive, enabled: true } },
    disable: { tool: 'plugin_manager', arguments: { action: 'set_bundle', target: manifest.name, enabled: false } },
    uninstall: { tool: 'plugin_manager', arguments: { action: 'remove_bundle', target: manifest.name } },
  };
}
