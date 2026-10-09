/** Exact artifact consumption. Package code runs only in an owned smoke scope. */
import { createHash } from 'node:crypto';
import { spawnSync, type SpawnSyncOptionsWithStringEncoding } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { isDeepStrictEqual } from 'node:util';
import { artifactFromTarball } from '../../buildr/tools/release/package-artifact-observation.ts';
import { parseCompatibilityArtifact, type CompatibilityArtifact } from '../../buildr/tools/release/package-compatibility.ts';

export const PEER_INPUT_SCHEMA = 'buildr.package-artifact-input/v1';
export const PEER_SCHEMA = 'buildr.dsh-prepared-buildr-peer/v1';
export const MAIN_PACKAGE = '@buildr-ai/buildr';
export const OFFICIAL_REGISTRY = 'https://registry.npmjs.org/';
const OWNER = '.buildr-peer-owner.json';
export const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
function fail(reason: string): never { throw new Error(`buildr_peer_invalid: ${reason}`); }
const record = (value: unknown): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value as any : fail('expected object');
export function realFile(value: string, limit = 128 * 1024 * 1024): Buffer {
  if (typeof value !== 'string' || !path.isAbsolute(value) || value.includes('\0')) fail('absolute input required');
  const info = lstatSync(value);
  if (!info.isFile() || info.size > limit || realpathSync(value) !== path.join(realpathSync(path.dirname(value)), path.basename(value))) fail('bounded regular file required');
  return readFileSync(value);
}
/** Validate archive paths before npm extraction; never follows archive links. */
export function packageArchiveFiles(bytes: Buffer): Map<string, Buffer> {
  const tar = gunzipSync(bytes, { maxOutputLength: 256 * 1024 * 1024 });
  const files = new Map<string, Buffer>(); let position = 0, nextPath: string | undefined;
  const number = (part: Buffer) => { const raw = part.toString('ascii').replace(/\0.*$/s, '').trim(); if (!/^[0-7]+$/.test(raw)) fail('tar number'); return Number.parseInt(raw, 8); };
  while (position + 512 <= tar.length) {
    const h = tar.subarray(position, position + 512);
    if (h.every(b => b === 0)) { if (tar.subarray(position).some(b => b !== 0)) fail('trailing archive data'); break; }
    if (number(h.subarray(148, 156)) !== h.reduce((sum, b, i) => sum + (i >= 148 && i < 156 ? 32 : b), 0)) fail('tar checksum');
    const length = number(h.subarray(124, 136)), start = position + 512;
    if (!Number.isSafeInteger(length) || start + length > tar.length) fail('truncated archive');
    const body = tar.subarray(start, start + length), kind = String.fromCharCode(h[156] || 48);
    const str = (a: number, b: number) => h.subarray(a, b).toString('utf8').replace(/\0.*$/s, '');
    position = start + Math.ceil(length / 512) * 512;
    if (kind === 'x' || kind === 'g') {
      for (let offset = 0; offset < body.length;) {
        const space = body.indexOf(32, offset), size = Number(body.subarray(offset, space).toString());
        if (space < offset || !Number.isSafeInteger(size) || size <= space - offset + 1 || offset + size > body.length) fail('tar extended header');
        const item = body.subarray(space + 1, offset + size).toString('utf8');
        if (!item.endsWith('\n')) fail('tar extended entry');
        if (item.startsWith('path=')) { if (kind === 'g') fail('global archive path'); nextPath = item.slice(5, -1); }
        offset += size;
      } continue;
    }
    if (kind === 'L') { nextPath = body.toString('utf8').replace(/\0.*$/s, ''); continue; }
    const prefix = str(345, 500), filename = nextPath ?? (prefix ? `${prefix}/${str(0, 100)}` : str(0, 100)); nextPath = undefined;
    if (!filename.startsWith('package/') || filename.includes('\\') || filename.split('/').some(p => p === '..' || p === '.') || filename.includes('\0')) fail('unsafe archive path');
    if (kind === '5') continue;
    if (kind !== '0' || files.has(filename)) fail('archive links, special files or duplicates');
    if (/(?:^|\/)(?:\.npmrc|\.env(?:\.[^/]+)?)$/.test(filename)) fail('credential configuration in archive');
    files.set(filename, Buffer.from(body));
  }
  if (!files.has('package/package.json')) fail('package metadata missing');
  return files;
}
export function readArtifactInput(filename: string): { artifact: CompatibilityArtifact; tarball: string; bytes: Buffer; metadata: Record<string, any>; files: Map<string, Buffer> } {
  const input = record(JSON.parse(realFile(path.resolve(filename), 256 * 1024).toString('utf8')));
  if (input.schemaVersion !== PEER_INPUT_SCHEMA) fail('artifact input schema');
  const artifact = parseCompatibilityArtifact(input.artifact);
  if (artifact.packageName !== MAIN_PACKAGE && artifact.packageName !== '@buildr-ai/buildr-dsh-plugin') fail('package identity');
  if (artifact.verifiedContracts !== undefined) fail('input cannot self-attest observed contracts');
  if (typeof input.tarball !== 'string' || !input.tarball || input.tarball.includes('\0')) fail('explicit tarball required');
  const tarball = path.isAbsolute(input.tarball) ? input.tarball : path.resolve(path.dirname(filename), input.tarball);
  const bytes = realFile(tarball), files = packageArchiveFiles(bytes), metadata = record(JSON.parse(files.get('package/package.json')!.toString('utf8')));
  const observed = artifactFromTarball(bytes, { origin: artifact.origin, packageName: artifact.packageName, version: artifact.version, integrity: artifact.integrity, ...(artifact.sourceCommit ? { sourceCommit: artifact.sourceCommit } : {}), ...(artifact.sourceTree ? { sourceTree: artifact.sourceTree } : {}) });
  if (!isDeepStrictEqual({ ...observed, ...(artifact.sourceTree ? { sourceTree: artifact.sourceTree } : {}) }, artifact)) fail('artifact metadata or byte identity mismatch');
  return { artifact, tarball, bytes, metadata, files };
}
export interface SmokeScope { root: string; workspace: string; appData: string; productData: string }
export function inspectSmokeScope(env: NodeJS.ProcessEnv): SmokeScope {
  const inputRoot = env.BUILDR_SMOKE_ROOT;
  if (!inputRoot || !path.isAbsolute(inputRoot)) fail('official smoke ownership required');
  const root = realpathSync(inputRoot);
  if (!lstatSync(path.join(root, '.buildr-smoke-owner')).isFile()) fail('official smoke ownership required');
  const owned = (value: string | undefined) => { if (!value || !path.isAbsolute(value)) fail('smoke path missing'); const relative = path.relative(inputRoot, value); if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) fail('smoke path outside ownership'); const canonical = path.join(root, relative); if (existsSync(canonical) && realpathSync(canonical) !== canonical) fail('smoke child path changed'); return canonical; };
  return { root, workspace: owned(env.BUILDR_SMOKE_WORKSPACE_ROOT), appData: owned(env.BUILDR_APP_DATA_DIR), productData: owned(env.BUILDR_PRODUCT_DATA_DIR) };
}
export function smokePeerEnvironment(scope: SmokeScope, nodeExecutable: string): NodeJS.ProcessEnv {
  const root = scope.root;
  for (const dir of ['home', 'appdata', 'localappdata', 'config', 'cache', 'data', 'state', 'tmp', 'npm-cache', 'npm-config']) mkdirSync(path.join(root, dir), { recursive: true });
  const user = path.join(root, 'npm-config/user.npmrc'), global = path.join(root, 'npm-config/global.npmrc');
  for (const file of [user, global]) { if (existsSync(file)) { if (realFile(file, 1024).length !== 0) fail('owned npm configuration changed'); } else writeFileSync(file, '', { mode: 0o600 }); }
  return { PATH: `${path.dirname(nodeExecutable)}${path.delimiter}/usr/bin${path.delimiter}/bin`, ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
    HOME: path.join(root, 'home'), USERPROFILE: path.join(root, 'home'), APPDATA: path.join(root, 'appdata'), LOCALAPPDATA: path.join(root, 'localappdata'),
    XDG_CONFIG_HOME: path.join(root, 'config'), XDG_CACHE_HOME: path.join(root, 'cache'), XDG_DATA_HOME: path.join(root, 'data'), XDG_STATE_HOME: path.join(root, 'state'),
    TMPDIR: path.join(root, 'tmp'), TMP: path.join(root, 'tmp'), TEMP: path.join(root, 'tmp'), NPM_CONFIG_USERCONFIG: user, NPM_CONFIG_GLOBALCONFIG: global, NPM_CONFIG_CACHE: path.join(root, 'npm-cache'), NPM_CONFIG_REGISTRY: OFFICIAL_REGISTRY,
    BUILDR_APP_DATA_DIR: scope.appData, BUILDR_PRODUCT_DATA_DIR: scope.productData, BUILDR_LOCAL_APP_NO_OPEN: '1' };
}
export interface PreparedBuildrPeer { schemaVersion: typeof PEER_SCHEMA; status: 'prepared'; artifact: CompatibilityArtifact; root: string; packageRoot: string; nodeExecutable: string; cliEntry: string; cliSha256: string; nodeSha256: string; sourceCapture: boolean; manifestPath: string; files: Record<string, string>; npmVersion: string }
export type PeerExecute = (executable: string, args: string[], options: SpawnSyncOptionsWithStringEncoding) => Pick<ReturnType<typeof spawnSync>, 'status' | 'stdout' | 'stderr' | 'error'>;
export function resolvePeerNpm(nodeExecutable: string, explicit?: string): string {
  const candidates = explicit ? [explicit] : [path.join(path.dirname(nodeExecutable), 'npm'), path.resolve(path.dirname(nodeExecutable), '../lib/node_modules/npm/bin/npm-cli.js'), path.join(path.dirname(nodeExecutable), 'node_modules/npm/bin/npm-cli.js')];
  for (const candidate of candidates) { try { const actual = realpathSync(candidate); if (actual.endsWith('.js') || actual.endsWith('.cjs')) { realFile(actual); return actual; } } catch {} }
  return fail('Node-associated npm JS entry unavailable');
}
/** Install original bytes with scripts disabled; no global/user configuration is inherited. */
export function prepareBuildrPeer(options: { artifactManifest: string; nodeExecutable?: string; npmCli?: string; ownedRoot?: string; execute?: PeerExecute }): PreparedBuildrPeer {
  const input = readArtifactInput(path.resolve(options.artifactManifest));
  if (input.artifact.packageName !== MAIN_PACKAGE) fail('Buildr peer must be the main package');
  const nodeExecutable = realpathSync(options.nodeExecutable ?? process.execPath); realFile(nodeExecutable);
  const npmCli = resolvePeerNpm(nodeExecutable, options.npmCli);
  const root = realpathSync(mkdtempSync(path.join(realpathSync(options.ownedRoot ?? tmpdir()), 'buildr-peer-'))), manifestPath = path.join(root, 'peer.json');
  writeFileSync(path.join(root, OWNER), JSON.stringify({ schemaVersion: PEER_SCHEMA, artifact: input.artifact }));
  const scope = { root, workspace: path.join(root, 'workspace'), appData: path.join(root, 'app-data'), productData: path.join(root, 'product-data') }, environment = smokePeerEnvironment(scope, nodeExecutable);
  const execute = options.execute ?? spawnSync;
  const run = (args: string[]) => { const result = execute(nodeExecutable, [npmCli, ...args], { cwd: root, env: environment, shell: false, encoding: 'utf8', timeout: 180_000, maxBuffer: 2 * 1024 * 1024 }); if (result.error || result.status !== 0) fail('isolated npm operation failed'); return String(result.stdout).trim(); };
  const npmVersion = run(['--version']); if (!/^\d+\.\d+\.\d+$/.test(npmVersion)) fail('npm version response');
  const tarball = path.join(root, 'artifact.tgz'); writeFileSync(tarball, input.bytes);
  const prefix = path.join(root, 'prefix');
  run(['install', '--global', '--prefix', prefix, '--ignore-scripts', '--legacy-peer-deps', '--no-audit', '--no-fund', '--registry', OFFICIAL_REGISTRY, tarball]);
  const packageRoot = path.join(prefix, ...(process.platform === 'win32' ? [] : ['lib']), 'node_modules', '@buildr-ai', 'buildr');
  if (realpathSync(packageRoot) !== packageRoot) fail('installed package path changed');
  const files = Object.fromEntries([...input.files].map(([name, body]) => { const relative = name.slice('package/'.length), installed = path.join(packageRoot, relative); if (hash(realFile(installed)) !== hash(body)) fail('installed bytes differ from artifact'); return [relative, hash(body)]; }));
  const bin = record(input.metadata.bin).buildr;
  if (typeof bin !== 'string' || path.isAbsolute(bin) || path.relative(packageRoot, path.resolve(packageRoot, bin)).startsWith('..') || !files[bin.replace(/^\.\//, '')]) fail('public bin entry is missing or unsafe');
  const cliEntry = path.resolve(packageRoot, bin), sourceCapture = input.artifact.compatibility?.provides.includes('buildr.agent-asset-source-result/v1') ?? false;
  const prepared: PreparedBuildrPeer = { schemaVersion: PEER_SCHEMA, status: 'prepared', artifact: input.artifact, root, packageRoot, nodeExecutable, cliEntry, cliSha256: hash(realFile(cliEntry)), nodeSha256: hash(realFile(nodeExecutable)), sourceCapture, manifestPath, files, npmVersion };
  writeFileSync(manifestPath, `${JSON.stringify(prepared, null, 2)}\n`); return readPreparedBuildrPeer(manifestPath);
}
export function readPreparedBuildrPeer(filename: string): PreparedBuildrPeer {
  const peer = record(JSON.parse(realFile(path.resolve(filename), 16 * 1024 * 1024).toString('utf8'))) as PreparedBuildrPeer;
  if (peer.schemaVersion !== PEER_SCHEMA || peer.status !== 'prepared' || realpathSync(peer.root) !== peer.root || peer.manifestPath !== path.join(peer.root, 'peer.json')) fail('prepared peer ownership');
  const owner = record(JSON.parse(realFile(path.join(peer.root, OWNER), 256 * 1024).toString('utf8'))), artifact = parseCompatibilityArtifact(peer.artifact);
  if (owner.schemaVersion !== PEER_SCHEMA || !isDeepStrictEqual(owner.artifact, artifact) || artifact.packageName !== MAIN_PACKAGE) fail('prepared artifact ownership');
  if (hash(realFile(path.join(peer.root, 'artifact.tgz'))) !== artifact.artifactSha256) fail('prepared tarball drift');
  if (path.relative(peer.root, peer.packageRoot).startsWith('..') || realpathSync(peer.packageRoot) !== peer.packageRoot || path.relative(peer.packageRoot, peer.cliEntry).startsWith('..')) fail('prepared path escape');
  if (hash(realFile(peer.nodeExecutable)) !== peer.nodeSha256 || hash(realFile(peer.cliEntry)) !== peer.cliSha256) fail('prepared entry drift');
  const original = packageArchiveFiles(realFile(path.join(peer.root, 'artifact.tgz')));
  const metadata = JSON.parse(original.get('package/package.json')!.toString('utf8'));
  const observed = artifactFromTarball(realFile(path.join(peer.root, 'artifact.tgz')), { origin: artifact.origin, packageName: artifact.packageName, version: artifact.version, integrity: artifact.integrity, ...(artifact.sourceCommit ? { sourceCommit: artifact.sourceCommit } : {}) });
  if (!isDeepStrictEqual({ ...observed, ...(artifact.sourceTree ? { sourceTree: artifact.sourceTree } : {}) }, artifact) || peer.cliEntry !== path.resolve(peer.packageRoot, record(metadata.bin).buildr)) fail('prepared metadata drift');
  if (!isDeepStrictEqual(Object.fromEntries([...original].map(([key, body]) => [key.slice(8), hash(body)])), peer.files)) fail('prepared inventory drift');
  for (const [name, digest] of Object.entries(peer.files)) if (hash(realFile(path.join(peer.packageRoot, name))) !== digest) fail('installed peer drift');
  if (peer.sourceCapture !== (artifact.compatibility?.provides.includes('buildr.agent-asset-source-result/v1') ?? false)) fail('capability declaration drift');
  return peer;
}
export function runPeerCli(peer: PreparedBuildrPeer, scope: SmokeScope, args: readonly string[], options: { cwd?: string; input?: string; timeoutMs?: number } = {}) {
  return spawnSync(peer.nodeExecutable, [peer.cliEntry, ...args], { cwd: options.cwd ?? scope.workspace, env: smokePeerEnvironment(scope, peer.nodeExecutable), input: options.input, shell: false, encoding: 'utf8', timeout: options.timeoutMs ?? 30_000, maxBuffer: 2 * 1024 * 1024 });
}
