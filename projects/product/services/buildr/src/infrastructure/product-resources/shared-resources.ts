import YAML from 'yaml';
import { parseSemver, compareVersions } from '../semantic-version.ts';
import { withExclusiveFileLock } from '../filesystem/exclusive-file-lock.ts';
import { isFinderMetadata } from '../filesystem/finder-metadata.ts';
import { LEGACY_ARCHIFY_SOURCE, preserveArchifyBeforeReplacement, preservedArchifyRoot } from './preserved-archify.ts';
import { preservedSkillRoot, preservedIdFromSource, preserveSkillSourceBeforeReplacement } from './preserved-skills.ts';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveProductRoot } from './index.ts';

type ResourceFile = { source: string; path: string; sha256: string; mode: number };
export type ResourceSet = { schemaVersion: 'buildr.shared-resources/v1'; id: string; version: string; files: ResourceFile[] };
const digest = (value: string | Buffer) => crypto.createHash('sha256').update(value).digest('hex');
// Only capability sources are shared. Initialization, launcher and package checks
// keep reading their installation-owned resources instead of a second copy.
const SHARED_SOURCE_ROOTS = ['workspace/skills/', 'runtime/skills/', 'workspace/components/buildr/', 'workspace/commands/buildr/'];
const isSharedSource = (source: string) => source.startsWith('workspace/skills/') || source.startsWith('runtime/skills/')
  || /^workspace\/components\/buildr\/[^/]+\/contributions\//.test(source)
  || /^workspace\/commands\/buildr\/[^/]+\/manifest\.yml$/.test(source);
// Everything else in the shared directory belongs to someone we cannot identify;
// recovery reports it instead of deleting it.
const OWNED_SHARED_ENTRIES = new Set(['skills', 'contracts', 'components', 'commands']);
// The pre-fixed layout kept one directory per resource identity; it is still ours.
const LEGACY_SET_DIRECTORY = /^\d+(?:\.\d+){1,3}(?:[-+][0-9A-Za-z.-]+)?$/;
const TRANSIENT_FILESYSTEM_CODES = new Set(['EPERM', 'EBUSY', 'ENOTEMPTY']);
const TRANSIENT_RETRY_ATTEMPTS = 6;
const TRANSIENT_RETRY_INITIAL_DELAY_MS = 25;
const TRANSIENT_RETRY_MAX_DELAY_MS = 400;
function pauseSynchronously(milliseconds: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}
/** Windows antivirus, indexers or a reader can hold a directory open for a moment. */
function withTransientRetry<T>(operation: () => T): T {
  let delay = TRANSIENT_RETRY_INITIAL_DELAY_MS;
  for (let attempt = 1; ; attempt += 1) {
    try { return operation(); }
    catch (error: any) {
      if (attempt >= TRANSIENT_RETRY_ATTEMPTS || !TRANSIENT_FILESYSTEM_CODES.has(error?.code)) throw error;
      pauseSynchronously(delay);
      delay = Math.min(delay * 2, TRANSIENT_RETRY_MAX_DELAY_MS);
    }
  }
}
function foreignSharedContent(target: string, entries: string[]): Error & Record<string, any> {
  return Object.assign(new Error(`共享资源目录 ${target} 含有 Buildr 无法识别的内容：${entries.join('、')}。为避免删除你的文件，已停止恢复；请将该目录移走后重试。`), { code: 'shared_resources_foreign_content', status: 409, target, entries: [...entries] });
}
const relativeFile = (value: string) => {
  if (!value || value.includes('\\') || value.includes('\0') || path.posix.normalize(value) !== value || value.startsWith('/') || value.split('/').includes('..')) throw new Error(`Invalid resource path: ${value}`);
  return value;
};
export function sharedResourcesRoot(environment: NodeJS.ProcessEnv = process.env, home = os.homedir()) {
  // Tool processes keep a private HOME for credentials. The existing host-home
  // hint locates shared capabilities only; it must not redirect native accounts.
  const hostHome = environment.BUILDR_HOST_HOME;
  const resourceHome = hostHome && path.isAbsolute(hostHome) ? hostHome : home;
  return path.join(environment.BUILDR_PRODUCT_DATA_DIR || path.join(resourceHome, '.buildr'), 'resources');
}
function assertPlainPath(file: string) {
  let current = path.resolve(file);
  while (true) {
    const stat = fs.lstatSync(current, { throwIfNoEntry: false });
    if (stat?.isSymbolicLink() && !(process.platform === 'darwin' && ['/var', '/tmp', '/etc'].includes(current))) throw new Error(`Shared resource path crosses a symbolic link: ${current}`);
    const parent = path.dirname(current); if (parent === current) break; current = parent;
  }
}
function destination(source: string) {
  if (source.startsWith('workspace/skills/contracts/')) return source.replace('workspace/skills/contracts/', 'contracts/');
  if (source.startsWith('workspace/')) return source.slice('workspace/'.length);
  if (source.startsWith('runtime/skills/')) return source.replace('runtime/skills/', 'skills/product/');
  return source;
}
export function describePackageResources(product = resolveProductRoot()): ResourceSet {
  const version = JSON.parse(fs.readFileSync(path.join(product, 'package.json'), 'utf8')).version;
  if (typeof version !== 'string' || !/^[0-9A-Za-z.+-]+$/.test(version)) throw new Error('Invalid package resource version.');
  const root = path.join(product, 'resources');
  const files: ResourceFile[] = [];
  function scan(directory: string) {
    for (const name of fs.readdirSync(directory).sort()) {
      const file = path.join(directory, name); const stat = fs.lstatSync(file);
      if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) throw new Error(`Unsupported package resource: ${file}`);
      if (isFinderMetadata(name, stat)) continue;
      const source = path.relative(root, file).split(path.sep).join('/');
      if (stat.isDirectory()) {
        if (SHARED_SOURCE_ROOTS.some(prefix => prefix.startsWith(`${source}/`) || `${source}/`.startsWith(prefix))) scan(file);
      } else if (isSharedSource(source)) {
        files.push({ source, path: destination(source), sha256: digest(fs.readFileSync(file)), mode: stat.mode & 0o777 });
      }
    }
  }
  scan(root);
  const id = `${version}-${digest(JSON.stringify(files))}`;
  return { schemaVersion: 'buildr.shared-resources/v1', id, version, files };
}
function inspectResourceDirectory(root: string, expectedId?: string): ResourceSet {
  assertPlainPath(root);
  const value = readDescriptor(root);
  if (expectedId && value.id !== expectedId) throw new Error('共享资源已更新，此工作空间需要按最新版重新准备。');
  const seen = new Set<string>();
  for (const entry of value.files) {
    relativeFile(entry.path); relativeFile(entry.source);
    if (seen.has(entry.path)) throw new Error(`Duplicate shared resource: ${entry.path}`); seen.add(entry.path);
    const file = path.join(root, entry.path); assertPlainPath(file);
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || digest(fs.readFileSync(file)) !== entry.sha256 || (process.platform !== 'win32' && (stat.mode & 0o111) !== (entry.mode & 0o111))) throw new Error(`Shared resource damaged: ${entry.path}`);
  }
  function verifyInventory(directory: string) {
    for (const name of fs.readdirSync(directory)) {
      const file = path.join(directory, name); const stat = fs.lstatSync(file);
      if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory())) throw new Error(`Unsupported shared resource: ${file}`);
      if (isFinderMetadata(name, stat)) continue;
      if (stat.isDirectory()) verifyInventory(file);
      else { const relative = path.relative(root, file).split(path.sep).join('/'); if (relative !== 'resource-set.json' && !seen.has(relative)) throw new Error(`Unexpected shared resource: ${relative}`); }
    }
  }
  verifyInventory(root);
  return value;
}
function readDescriptor(root: string): ResourceSet {
  const file = path.join(root, 'resource-set.json'); assertPlainPath(file);
  const value = JSON.parse(fs.readFileSync(file, 'utf8')) as ResourceSet;
  if (typeof value.version !== 'string' || value.schemaVersion !== 'buildr.shared-resources/v1' || !Array.isArray(value.files) || `${value.version}-${digest(JSON.stringify(value.files))}` !== value.id) throw new Error('Shared resource descriptor identity mismatch.');
  return value;
}
/** Metadata observation only; Doctor and publication perform full integrity verification. */
export function readSharedResourceSet(): ResourceSet {
  return readDescriptor(sharedResourcesRoot());
}
export function inspectSharedResources(expectedId?: string): ResourceSet {
  return inspectResourceDirectory(sharedResourcesRoot(), expectedId);
}
/** Only an identified or clearly install-owned directory may be replaced. */
function assertOwnedSharedDirectory(target: string): void {
  const stat = fs.lstatSync(target, { throwIfNoEntry: false });
  if (!stat) return;
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw Object.assign(new Error(`共享资源路径 ${target} 不是普通目录，已停止恢复；请将该路径移走后重试。`), { code: 'shared_resources_foreign_content', status: 409, target, entries: [path.basename(target)] });
  const unknown = fs.readdirSync(target).filter(name => {
    if (name === 'resource-set.json' || OWNED_SHARED_ENTRIES.has(name)) return false;
    const own = fs.lstatSync(path.join(target, name), { throwIfNoEntry: false });
    return !(own?.isDirectory() && !own.isSymbolicLink() && LEGACY_SET_DIRECTORY.test(name));
  }).sort();
  if (unknown.length) throw foreignSharedContent(target, unknown);
}
/** Consume the current shared set; a directory without a readable descriptor is rebuilt from this installation. */
export function ensurePackageResources(product = resolveProductRoot()): ResourceSet {
  const target = sharedResourcesRoot();
  try { return readSharedResourceSet(); }
  catch {
    return fs.existsSync(target) ? recoverSharedResources(product, target) : initializeSharedResources(product, target);
  }
}
function initializeSharedResources(product: string, target: string): ResourceSet {
  const parent = path.dirname(target), previous = path.join(parent, '.resources-previous');
  if (fs.existsSync(previous)) {
    return withExclusiveFileLock(path.join(parent, '.resources.lock'), target, () => {
      assertPlainPath(previous); assertPlainPath(target);
      if (!fs.existsSync(target) && fs.existsSync(previous)) withTransientRetry(() => fs.renameSync(previous, target));
      try { return readDescriptor(target); }
      catch { /* The restored backup is unidentified too; rebuild it under the same lock. */ }
      assertOwnedSharedDirectory(target);
      return publishWithinLock(product, describePackageResources(product), target, { recovery: true });
    });
  }
  try { return publishPackageResources(product, { expectedId: null }); }
  catch (publicationError: any) {
    if (['shared_resources_changed','shared_resources_downgrade'].includes(publicationError.code)) return readSharedResourceSet();
    throw publicationError;
  }
}
/** An unidentified directory has no publisher identity to protect; rebuild it or keep foreign content untouched. */
function recoverSharedResources(product: string, target: string): ResourceSet {
  const parent = path.dirname(target);
  return withExclusiveFileLock(path.join(parent, '.resources.lock'), target, () => {
    try { return readDescriptor(target); }
    catch { /* Another publisher may have converged it before we took the lock. */ }
    assertOwnedSharedDirectory(target);
    return publishWithinLock(product, describePackageResources(product), target, { recovery: true });
  });
}
/** Observation used by explicit update jobs across process restart. */
export function observeSharedResourcePublication(): string | null {
  const target = sharedResourcesRoot();
  try { return readDescriptor(target).id; }
  catch (error: any) {
    if (error.code === 'ENOENT' && !fs.existsSync(target)) {
      const previous = path.join(path.dirname(target), '.resources-previous');
      return fs.existsSync(previous) ? readDescriptor(previous).id : null;
    }
    // Explicit preparation may migrate an old directory layout or repair metadata.
    // Observe its actual metadata so another publisher cannot silently supersede it.
    if (fs.existsSync(target)) {
      const descriptor = path.join(target, 'resource-set.json');
      const stat = fs.lstatSync(descriptor, { throwIfNoEntry: false });
      // An unidentified directory is observed by listing; never read through a link.
      if (stat?.isFile() && !stat.isSymbolicLink()) { assertPlainPath(descriptor); return `unprepared-${digest(fs.readFileSync(descriptor))}`; }
      return `unprepared-${digest(JSON.stringify(fs.readdirSync(target).sort()))}`;
    }
    throw error;
  }
}
/** Explicit update only: publish a complete directory against an observed shared identity. */
export function publishPackageResources(product = resolveProductRoot(), options: { expectedId?: string | null } = {}): ResourceSet {
  const desired = describePackageResources(product), target = sharedResourcesRoot();
  const expectedId = options.expectedId === undefined ? observeSharedResourcePublication() : options.expectedId;
  const parent = path.dirname(target);
  fs.mkdirSync(parent, { recursive: true });
  return withExclusiveFileLock(path.join(parent, '.resources.lock'), target, () => publishWithinLock(product, desired, target, { expectedId }));
}
function publishWithinLock(product: string, desired: ResourceSet, target: string, options: { expectedId?: string | null; recovery?: boolean }): ResourceSet {
  const parent = path.dirname(target), stage = path.join(parent, '.resources-next'), previous = path.join(parent, '.resources-previous');
  for (const file of [target, stage, previous]) assertPlainPath(file);
  // A crash between the two renames must not strand the stable public path.
  if (!fs.existsSync(target) && fs.existsSync(previous)) withTransientRetry(() => fs.renameSync(previous, target));
  const currentId = observeSharedResourcePublication();
  // Replacing an unidentified set must never remove content we cannot claim.
  if (currentId?.startsWith('unprepared-')) assertOwnedSharedDirectory(target);
  if (options.recovery !== true) {
    if (currentId && !currentId.startsWith('unprepared-')) {
      const current = readDescriptor(target);
      if (parseSemver(current.version) && parseSemver(desired.version) && compareVersions(desired.version,current.version)<0) throw Object.assign(new Error('当前共享资源版本更高，已保留现有内容；请升级程序后再准备。'), {code:'shared_resources_downgrade'});
    }
    if (currentId !== options.expectedId && currentId !== desired.id) throw Object.assign(new Error('共享资源在更新期间已变化，请重新核对后重试。'), { code: 'shared_resources_changed' });
  }
    // Two-stage retirement: sources declared `replaces`/`retired` in the package
    // manifest keep a preserved copy so workspaces still referencing them can
    // resolve until their manifest converges. Archify keeps its historical path.
    const retiredSources = retiredSkillSourcePrefixes(product);
    if (!desired.files.some(file => file.source.startsWith(LEGACY_ARCHIFY_SOURCE))) retiredSources.add(LEGACY_ARCHIFY_SOURCE);
    if (retiredSources.size) {
      let old: ResourceSet | null = null;
      try { old = readDescriptor(target); }
      catch { /* An unidentified set has no preservable identity; its source area is left untouched. */ }
      if (old) {
        for (const sourcePrefix of retiredSources) {
          if (desired.files.some(file => file.source.startsWith(sourcePrefix))) continue;
          preserveSkillSourceBeforeReplacement(target, old, sourcePrefix, sourcePrefix, inspectResourceDirectory, assertPlainPath);
        }
      }
    }
    try {
      const existing = inspectResourceDirectory(target, desired.id);
      withTransientRetry(() => fs.rmSync(stage, { recursive: true, force: true }));
      withTransientRetry(() => fs.rmSync(previous, { recursive: true, force: true }));
      return existing;
    } catch { /* Missing, old or damaged official content is replaced as a whole. */ }
    withTransientRetry(() => fs.rmSync(stage, { recursive: true, force: true }));
    fs.mkdirSync(stage);
    let published = false;
    try {
      for (const entry of desired.files) {
        const file = path.join(stage, entry.path); fs.mkdirSync(path.dirname(file), { recursive: true });
        const bytes = fs.readFileSync(path.join(product, 'resources', entry.source));
        if (digest(bytes) !== entry.sha256) throw new Error('Package resources changed during preparation.');
        fs.writeFileSync(file, bytes, { flag: 'wx', mode: entry.mode });
      }
      fs.writeFileSync(path.join(stage, 'resource-set.json'), `${JSON.stringify(desired)}\n`, { flag: 'wx' });
      inspectResourceDirectory(stage, desired.id);
      withTransientRetry(() => fs.rmSync(previous, { recursive: true, force: true }));
      if (fs.existsSync(target)) withTransientRetry(() => fs.renameSync(target, previous));
      try {
        withTransientRetry(() => fs.renameSync(stage, target));
        inspectResourceDirectory(target, desired.id);
      } catch (error) {
        // If the new directory was published but failed verification, move it aside first.
        if (fs.existsSync(target)) withTransientRetry(() => fs.renameSync(target, stage));
        if (fs.existsSync(previous)) withTransientRetry(() => fs.renameSync(previous, target));
        throw error;
      }
      published = true;
      // Includes superseded official files, old version directories and old damaged sets.
      try { withTransientRetry(() => fs.rmSync(previous, { recursive: true, force: true })); }
      catch (error: any) { console.warn(`共享资源备份目录暂时无法清理，已保留：${previous}`, error?.message || error); }
      return desired;
    } finally {
      // A failed rollback leaves its candidates intact for the next explicit recovery.
      if (published || fs.existsSync(target)) withTransientRetry(() => fs.rmSync(stage, { recursive: true, force: true }));
    }
}
const adoptionPath = (root: string) => path.join(root, '.buildr/local/package-resources.json');
export function readResourceAdoption(root: string): { resourceSet: string; ready: boolean } | null {
  const file = adoptionPath(root); assertPlainPath(file);
  if (!fs.existsSync(file)) return null;
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (value.schemaVersion !== 'buildr.resource-adoption/v1' || typeof value.resourceSet !== 'string' || !/^[0-9A-Za-z.+-]+-[a-f0-9]{64}$/.test(value.resourceSet) || typeof value.ready !== 'boolean') throw new Error('Invalid workspace resource adoption.');
  return { resourceSet: value.resourceSet, ready: value.ready && value.layout === 'fixed' };
}
export function adoptPackageResources(root: string, ready = false, expectedId?: string) {
  const resources = ensurePackageResources();
  if (expectedId && resources.id !== expectedId) throw Object.assign(new Error('共享资源在入口生成期间已变化，请重试。'), { code: 'shared_resources_changed' });
  const file = adoptionPath(root); assertPlainPath(file);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  try { fs.writeFileSync(temporary, `${JSON.stringify({ schemaVersion: 'buildr.resource-adoption/v1', resourceSet: resources.id, ready, layout: 'fixed' })}\n`, { flag: 'wx' }); fs.renameSync(temporary, file); }
  finally { fs.rmSync(temporary, { force: true }); }
  return resources;
}
export function resolveSharedResource(_root: string, source: string): string {
  relativeFile(source);
  const normalizedSource = source.replace(/^resources\//, '');
  const base = sharedResourcesRoot(); assertPlainPath(base);
  const descriptor = readDescriptor(base);
  if (normalizedSource.startsWith(LEGACY_ARCHIFY_SOURCE) && !descriptor.files.some(item => item.source.startsWith(LEGACY_ARCHIFY_SOURCE))) {
    const preserved = readPreservedArchify();
    const entry = preserved.set.files.find(item => item.source === normalizedSource);
    if (!entry) throw new Error(`Archify 历史来源未声明：${source}`);
    return path.join(preserved.root, entry.path);
  }
  // Adoption describes generated workspace entry points, not permission to
  // read declared immutable sources. A checkout may legitimately lack that
  // local receipt; descriptor, file identity and integrity remain mandatory.
  const entry = descriptor.files.find(item => item.source === normalizedSource);
  if (!entry) {
    // Retired shared skill sources stay resolvable from the preserved area so a
    // stale manifest entry converges instead of failing the workspace outright.
    if (normalizedSource.startsWith('workspace/skills/')) {
      const preserved = readPreservedSkill(normalizedSource);
      if (preserved) return preserved;
    }
    throw new Error(`Shared resource is not declared: ${source}`);
  }
  relativeFile(entry.path);
  const file = path.join(base, entry.path); assertPlainPath(file);
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || digest(fs.readFileSync(file)) !== entry.sha256 || (process.platform !== 'win32' && (stat.mode & 0o111) !== (entry.mode & 0o111))) throw new Error(`Shared resource damaged: ${source}`);
  return file;
}
export function readPreservedArchify(): { root: string; sourceRoot: string; set: ResourceSet } {
  const root = preservedArchifyRoot(sharedResourcesRoot());
  const set = inspectResourceDirectory(root);
  if (!set.files.every(file => file.source.startsWith(LEGACY_ARCHIFY_SOURCE) && file.path === `files/${file.source.slice(LEGACY_ARCHIFY_SOURCE.length)}`)) throw new Error('Archify 保留来源映射无效。');
  return { root, sourceRoot: path.join(root, 'files'), set };
}
/** Resolve a file inside the preserved copy of a retired shared skill source, or null. */
export function readPreservedSkill(normalizedSource: string): string | null {
  const match = normalizedSource.match(/^workspace\/skills\/(.+?)\/([^/]+)$/);
  if (!match) return null;
  const root = preservedSkillRoot(sharedResourcesRoot(), match[1]!);
  try {
    const set = inspectResourceDirectory(root);
    const prefix = `skills/${match[1]}/`;
    const entry = set.files.find(item => item.source === normalizedSource && item.path === `files/${match[2]}`);
    if (!entry || !set.files.every(item => item.source.startsWith(`workspace/${prefix}`) && item.path === `files/${item.source.slice(`workspace/${prefix}`.length)}`)) return null;
    relativeFile(entry.path);
    const file = path.join(root, entry.path); assertPlainPath(file);
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || digest(fs.readFileSync(file)) !== entry.sha256 || (process.platform !== 'win32' && (stat.mode & 0o111) !== (entry.mode & 0o111))) throw new Error(`Preserved shared resource damaged: ${normalizedSource}`);
    return file;
  } catch (error: any) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}
/** Shared-source prefixes retired by the package manifest (`replaces` or explicit `retired`). */
export function retiredSkillSourcePrefixes(product = resolveProductRoot()): Set<string> {
  const manifestPath = path.join(product, 'resources', 'manifest.yml');
  if (!fs.existsSync(manifestPath)) return new Set();
  const parsed = (YAML as any).parse(fs.readFileSync(manifestPath, 'utf8')) || {};
  const prefixes = new Set<string>();
  for (const skill of parsed?.builtins?.skills || []) {
    if (skill?.replaces?.target) prefixes.add(`workspace/${String(skill.replaces.target).replace(/\/$/, '')}/`);
    if (skill?.retired === true && skill?.target) prefixes.add(`workspace/${String(skill.target).replace(/\/$/, '')}/`);
  }
  return prefixes;
}
/** Local references are rebuilt on another machine or after interrupted preparation. */
export function prepareWorkspaceResourceAdoption(root: string) {
  const resources = ensurePackageResources();
  let adopted: ReturnType<typeof readResourceAdoption> = null;
  try { adopted = readResourceAdoption(root); }
  catch {
    const file = adoptionPath(root); assertPlainPath(file);
    if (fs.existsSync(file)) fs.renameSync(file, `${file}.damaged-${crypto.randomUUID()}`);
  }
  if (adopted?.resourceSet === resources.id) return;
  adoptPackageResources(root, false, resources.id);
}
