import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from '../../../../../infrastructure/process.ts';
import { getRuntimeAdapterFor } from '../adapter-contract.ts';

export const RUNTIME_SKILL_PROJECTION_SCHEMA_V1 = 'buildr.runtime-skill-projection/v1';
export const RUNTIME_SKILL_PROJECTION_SCHEMA = 'buildr.skill-projection/v2';
export const SKILL_PROJECTION_OWNERSHIP_RECEIPTS_DIRECTORY = 'skill-projection-ownership-receipts';
export const SUPPORTED_SKILL_SOURCE_ENTRIES = Object.freeze([
  'SKILL.md',
  'agents',
  'assets',
  'examples',
  'references',
  'scripts',
  'templates',
]);

const SUPPORTED_SKILL_SOURCE_ENTRY_SET: any = new Set(SUPPORTED_SKILL_SOURCE_ENTRIES);
const SHA256_PATTERN = /^sha256-[a-f0-9]{64}$/;
const gitExecutableIndexCache: any = new Map();

function toPosix(value: any): any  {
  return value.split(path.sep).join('/');
}

export function sha256Integrity(content: any): any  {
  return `sha256-${crypto.createHash('sha256').update(content).digest('hex')}`;
}

export function ownerExecutable(mode: any): any  {
  return (mode & 0o100) === 0o100;
}

function assertSafeRelativeFile(relative: any, label: any): any  {
  const normalized = path.posix.normalize(relative.replaceAll('\\', '/'));
  if (!relative || path.posix.isAbsolute(normalized) || normalized === '..' || normalized.startsWith('../') || normalized !== relative.replaceAll('\\', '/')) {
    throw new Error(`${label} must stay inside the Skill directory: ${relative}`);
  }
  return normalized;
}

function findGitRepository(sourceDir: any): any  {
  let current = path.resolve(sourceDir);
  while (true) {
    const marker = path.join(current, '.git');
    if (fs.existsSync(marker)) {
      const markerStat = fs.statSync(marker);
      if (markerStat.isDirectory()) return { root: current, index: path.join(marker, 'index') };
      if (markerStat.isFile()) {
        const match = /^gitdir:\s*(.+)\s*$/u.exec(fs.readFileSync(marker, 'utf8'));
        if (match) {
          const gitDirectory = path.resolve(current, match[1]);
          return { root: current, index: path.join(gitDirectory, 'index') };
        }
      }
      return null;
    }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function repositoryExecutablePaths(repository: any): any  {
  if (!fs.existsSync(repository.index)) return new Set();
  const stat = fs.statSync(repository.index);
  const identity = `${stat.size}:${stat.mtimeMs}`;
  const cached = gitExecutableIndexCache.get(repository.root);
  if (cached?.identity === identity) return cached.paths;
  const indexed = spawnSync('git', ['-C', repository.root, 'ls-files', '--stage', '-z'], { encoding: 'buffer', timeout: 30_000, maxBuffer: 8 * 1024 * 1024 });
  if (indexed.status !== 0) {
    const detail = indexed.error?.message || indexed.stderr?.toString('utf8').trim() || `status=${indexed.status} signal=${indexed.signal || 'none'}`;
    throw new Error(`Unable to read executable intent from Git index: ${repository.root} (${detail})`);
  }
  const executable: any = new Set();
  for (const record of indexed.stdout.toString('utf8').split('\0').filter(Boolean)) {
    const match = /^(\d{6}) [0-9a-f]+ \d\t([\s\S]+)$/u.exec(record);
    if (!match || match[1] !== '100755') continue;
    executable.add(match[2]);
  }
  gitExecutableIndexCache.set(repository.root, { identity, paths: executable });
  return executable;
}

function gitExecutablePaths(sourceDir: any): any  {
  const repository = findGitRepository(sourceDir);
  if (!repository) return new Set();
  const sourceRelative = toPosix(path.relative(repository.root, sourceDir));
  const prefix = sourceRelative ? `${sourceRelative}/` : '';
  return new Set([...repositoryExecutablePaths(repository)]
    .filter((file: any) => file.startsWith(prefix))
    .map((file: any) => file.slice(prefix.length))
    .filter(Boolean));
}

function inspectSourceEntry(sourceDir: any, absolute: any, relative: any, files: any, indexedExecutable: any): any  {
  const stat = fs.lstatSync(absolute);
  if (stat.isSymbolicLink()) throw new Error(`Skill source must not contain symbolic links: ${path.join(sourceDir, relative)}`);
  if (stat.isDirectory()) {
    for (const child of fs.readdirSync(absolute).sort()) {
      inspectSourceEntry(sourceDir, path.join(absolute, child), path.posix.join(relative, child), files, indexedExecutable);
    }
    return;
  }
  if (!stat.isFile()) throw new Error(`Skill source must contain only regular files and directories: ${path.join(sourceDir, relative)}`);
  files.push({
    relativePath: assertSafeRelativeFile(relative, 'Skill source file'),
    sourceFile: absolute,
    content: fs.readFileSync(absolute),
    executable: indexedExecutable.has(relative) || ownerExecutable(stat.mode),
  });
}

export function enumerateSkillSourceFiles(sourceDir: any): any  {
  if (!sourceDir) return [];
  const rootStat = fs.lstatSync(sourceDir);
  if (rootStat.isSymbolicLink()) throw new Error(`Skill source directory must not be a symbolic link: ${sourceDir}`);
  if (!rootStat.isDirectory()) throw new Error(`Skill source directory does not exist: ${sourceDir}`);
  const entries = fs.readdirSync(sourceDir).sort();
  const unknown = entries.filter((entry: any) => !SUPPORTED_SKILL_SOURCE_ENTRY_SET.has(entry));
  if (unknown.length) throw new Error(`Skill source contains unsupported top-level entries: ${unknown.join(', ')}`);
  const indexedExecutable = gitExecutablePaths(sourceDir);
  const files: any[] = [];
  for (const entry of entries) inspectSourceEntry(sourceDir, path.join(sourceDir, entry), entry, files, indexedExecutable);
  if (!files.some((file: any) => file.relativePath === 'SKILL.md')) throw new Error(`Skill source must contain SKILL.md: ${sourceDir}`);
  return files.sort((left: any, right: any) => left.relativePath.localeCompare(right.relativePath));
}

function decodeBase64(content: any, label: any): any  {
  if (typeof content !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(content)) {
    throw new Error(`runtime write base64 content is invalid: ${label}`);
  }
  return Buffer.from(content, 'base64');
}

export function runtimeWriteBuffer(item: any, source: any = false): any  {
  const contentKey = source ? 'sourceContent' : 'content';
  const encodingKey = source ? 'sourceContentEncoding' : 'contentEncoding';
  const content = item[contentKey];
  if (content === undefined || content === null) return null;
  const encoding = item[encodingKey] || 'utf8';
  if (encoding === 'utf8') return Buffer.from(content, 'utf8');
  if (encoding === 'base64') return decodeBase64(content, item.targetFile);
  throw new Error(`runtime write content encoding is invalid: ${item.targetFile}`);
}

export function runtimeWriteMode(item: any): any  {
  if (item.mode === undefined) return null;
  if (item.mode !== 0 && item.mode !== 0o100) throw new Error(`runtime write mode is invalid: ${item.targetFile}`);
  return item.mode;
}

export function runtimeWriteModeMatches(file: any, item: any, platform: any = process.platform): any  {
  const expectedMode = runtimeWriteMode(item);
  return expectedMode === null || platform === 'win32' || ownerExecutable(fs.statSync(file).mode) === (expectedMode === 0o100);
}

export function runtimeFileMatches(file: any, integrity: any, executable: any, platform: any = process.platform): any  {
  if (!fs.existsSync(file) || !fs.lstatSync(file).isFile() || fs.lstatSync(file).isSymbolicLink()) return false;
  if (sha256Integrity(fs.readFileSync(file)) !== integrity) return false;
  return executable === undefined || platform === 'win32' || ownerExecutable(fs.statSync(file).mode) === executable;
}

function normalizedReceiptSegments(adapterId: any, runtimePath: any): any  {
  const normalized = assertSafeRelativeFile(`${runtimePath}.json`, 'Skill runtime path');
  const adapter = assertSafeRelativeFile(`${adapterId}.json`, 'Skill adapter id').slice(0, -5);
  return { adapter, normalized };
}

const SHARED_SKILL_OWNERS = Object.freeze(['agents-standard', 'codex', 'cursor', 'trae']);

export function skillProjectionOwnerId(adapterId: any, runtimeRoot: any = null): string {
  const root = runtimeRoot || getRuntimeAdapterFor(adapterId).traits.skills.root;
  return root === '.agents' ? 'agents-standard' : getRuntimeAdapterFor(adapterId).id;
}

// Raw locators are only for compatibility reads. New writes use the shared owner.
export function historicalSkillProjectionOwnershipReceiptRoot(targetRoot: any, destination: any, ownerId: any = null): any {
  if (!['workspace', 'user'].includes(destination)) throw new Error(`Unsupported Skill projection ownership receipt destination: ${destination}.`);
  const root = path.join(targetRoot, '.buildr', 'agent-runtime', destination);
  if (!ownerId) return root;
  const { adapter } = normalizedReceiptSegments(ownerId, 'receipt-root');
  return path.join(root, adapter, SKILL_PROJECTION_OWNERSHIP_RECEIPTS_DIRECTORY);
}

export function historicalSkillProjectionOwnershipReceiptTarget(targetRoot: any, destination: any, ownerId: any, runtimePath: any): any {
  const { normalized } = normalizedReceiptSegments(ownerId, runtimePath);
  return path.join(historicalSkillProjectionOwnershipReceiptRoot(targetRoot, destination, ownerId), ...normalized.split('/'));
}

export function skillProjectionOwnershipReceiptRoot(targetRoot: any, destination: any, adapterId: any = null): any {
  return historicalSkillProjectionOwnershipReceiptRoot(targetRoot, destination, adapterId ? skillProjectionOwnerId(adapterId) : null);
}

export function skillProjectionOwnershipReceiptTarget(targetRoot: any, destination: any, adapterId: any, runtimePath: any): any {
  return historicalSkillProjectionOwnershipReceiptTarget(targetRoot, destination, skillProjectionOwnerId(adapterId), runtimePath);
}

export function legacySkillProjectionOwnershipReceiptRoot(targetRoot: any, runtimeRoot: any, adapterId: any = null): any  {
  const root = path.join(targetRoot, runtimeRoot, 'buildr', 'skill-projection-receipts');
  if (!adapterId) return root;
  const { adapter } = normalizedReceiptSegments(adapterId, 'receipt-root');
  return path.join(root, adapter);
}

export function legacySkillProjectionOwnershipReceiptTarget(targetRoot: any, runtimeRoot: any, adapterId: any, runtimePath: any): any  {
  const { adapter, normalized } = normalizedReceiptSegments(adapterId, runtimePath);
  return path.join(targetRoot, runtimeRoot, 'buildr', 'skill-projection-receipts', adapter, ...normalized.split('/'));
}

function receiptInventoryIntegrity(files: any): any  {
  return sha256Integrity(Buffer.from(JSON.stringify(files), 'utf8'));
}

export function buildSkillProjectionReceipt({ adapterId, destination = 'workspace', skillId, runtimePath, sources, assetIdentity, sourceIdentity, sourceWorkspaceId, sourceDigest, renderDigest, capabilityBindings = null, files }: any): any  {
  const inventory = files.map((file: any) => ({
    path: assertSafeRelativeFile(file.path, 'Skill receipt file'),
    integrity: file.integrity,
    executable: file.executable === true,
  })).sort((left: any, right: any) => left.path.localeCompare(right.path));
  const receipt: any = {
    schemaVersion: RUNTIME_SKILL_PROJECTION_SCHEMA,
    agent: adapterId,
    adapterId,
    destination,
    skillId: skillId || runtimePath,
    runtimePath,
    assetIdentity,
    sourceIdentity,
    sourceWorkspaceId,
    sourceDigest,
    renderDigest: renderDigest || receiptInventoryIntegrity(inventory),
    sources: [...new Set(sources)].sort(),
    files: inventory,
    integrity: receiptInventoryIntegrity(inventory),
  };
  if (capabilityBindings) {
    receipt.capabilityBindings = capabilityBindings;
    receipt.capabilityBindingsIntegrity = sha256Integrity(Buffer.from(JSON.stringify(capabilityBindings), 'utf8'));
  }
  return receipt;
}

export function renderSkillProjectionReceipt(receipt: any): any  {
  return `${JSON.stringify(receipt, null, 2)}\n`;
}

export function parseSkillProjectionReceipt(content: any, label: any = 'runtime Skill projection receipt'): any  {
  let receipt;
  try { receipt = JSON.parse(content); }
  catch (error: any) { throw new Error(`Invalid ${label} JSON: ${error.message}`); }
  const supportedSchema = [RUNTIME_SKILL_PROJECTION_SCHEMA_V1, RUNTIME_SKILL_PROJECTION_SCHEMA].includes(receipt?.schemaVersion);
  if (!receipt || !supportedSchema || typeof receipt.adapterId !== 'string' || typeof receipt.runtimePath !== 'string' || !Array.isArray(receipt.sources) || !Array.isArray(receipt.files) || !SHA256_PATTERN.test(receipt.integrity || '')) {
    throw new Error(`Invalid ${label} schema.`);
  }
  if (receipt.agent !== undefined && receipt.agent !== receipt.adapterId) throw new Error(`Invalid ${label} owner identity: agent differs from adapterId.`);
  if (receipt.schemaVersion === RUNTIME_SKILL_PROJECTION_SCHEMA && (!['user', 'workspace'].includes(receipt.destination) || typeof receipt.skillId !== 'string' || typeof receipt.assetIdentity !== 'string' || typeof receipt.sourceIdentity !== 'string' || typeof receipt.sourceWorkspaceId !== 'string' || !SHA256_PATTERN.test(receipt.sourceDigest || '') || !SHA256_PATTERN.test(receipt.renderDigest || ''))) throw new Error(`Invalid ${label} v2 identity or digest evidence.`);
  const hasCapabilityBindings = receipt.capabilityBindings !== undefined;
  const hasCapabilityBindingsIntegrity = receipt.capabilityBindingsIntegrity !== undefined;
  if (hasCapabilityBindings !== hasCapabilityBindingsIntegrity) throw new Error(`Invalid ${label} capability binding evidence.`);
  if (hasCapabilityBindings && (!receipt.capabilityBindings || typeof receipt.capabilityBindings !== 'object' || Array.isArray(receipt.capabilityBindings) || !SHA256_PATTERN.test(receipt.capabilityBindingsIntegrity || '') || sha256Integrity(Buffer.from(JSON.stringify(receipt.capabilityBindings), 'utf8')) !== receipt.capabilityBindingsIntegrity)) {
    throw new Error(`Invalid ${label} capability binding evidence.`);
  }
  const seen: any = new Set();
  const files = receipt.files.map((file: any) => {
    if (!file || typeof file.path !== 'string' || !SHA256_PATTERN.test(file.integrity || '') || typeof file.executable !== 'boolean') throw new Error(`Invalid ${label} file entry.`);
    const relative = assertSafeRelativeFile(file.path, 'Skill receipt file');
    if (seen.has(relative)) throw new Error(`Duplicate ${label} file entry: ${relative}`);
    seen.add(relative);
    return { path: relative, integrity: file.integrity, executable: file.executable };
  }).sort((left: any, right: any) => left.path.localeCompare(right.path));
  if (receiptInventoryIntegrity(files) !== receipt.integrity) throw new Error(`Invalid ${label} inventory integrity.`);
  return { ...receipt, files };
}

export function readSkillProjectionReceipt(file: any, expected: any = {}): any  {
  if (!fs.existsSync(file)) return null;
  if (fs.lstatSync(file).isSymbolicLink() || !fs.lstatSync(file).isFile()) throw new Error(`Runtime Skill projection receipt must be a regular file: ${file}`);
  const receipt = parseSkillProjectionReceipt(fs.readFileSync(file, 'utf8'), file);
  if (expected.adapterId && receipt.adapterId !== expected.adapterId) throw new Error(`Runtime Skill projection receipt adapter mismatch: ${file}`);
  if (expected.runtimePath && receipt.runtimePath !== expected.runtimePath) throw new Error(`Runtime Skill projection receipt path mismatch: ${file}`);
  if (expected.destination && receipt.schemaVersion === RUNTIME_SKILL_PROJECTION_SCHEMA && receipt.destination !== expected.destination) throw new Error(`Runtime Skill projection receipt destination mismatch: ${file}`);
  return receipt;
}

function stableReceiptValue(value: any): any  {
  if (Array.isArray(value)) return value.map(stableReceiptValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key: any) => [key, stableReceiptValue(value[key])]));
}

export function skillProjectionOwnershipReceiptsEquivalent(left: any, right: any, options: any = {}): any {
  const normalize = (receipt: any) => {
    const owner = SHARED_SKILL_OWNERS.includes(receipt.adapterId) ? 'agents-standard' : receipt.adapterId;
    return { ...receipt, adapterId: owner, ...(receipt.agent !== undefined ? { agent: owner } : {}), ...(options.ignoreRuntimePath ? { runtimePath: '' } : {}) };
  };
  return JSON.stringify(stableReceiptValue(normalize(left))) === JSON.stringify(stableReceiptValue(normalize(right)));
}

function assertProjectionPath(targetRoot: string, target: string): void {
  const relative = path.relative(path.resolve(targetRoot), path.resolve(target));
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error(`Skill projection path is outside target root: ${target}`);
  let current = path.resolve(targetRoot);
  for (const segment of ['.', ...relative.split(path.sep)]) {
    if (segment !== '.') current = path.join(current, segment);
    const stat = fs.lstatSync(current, { throwIfNoEntry: false });
    if (stat?.isSymbolicLink()) throw new Error(`Skill projection path crosses a symbolic link: ${current}`);
  }
}

function projectionFiles(targetRoot: string, directory: string): string[] {
  assertProjectionPath(targetRoot, directory);
  if (!fs.existsSync(directory)) return [];
  const files: string[] = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    assertProjectionPath(targetRoot, file);
    if (entry.isDirectory()) files.push(...projectionFiles(targetRoot, file));
    else if (entry.isFile()) files.push(file);
    else throw new Error(`Skill projection must contain only regular files: ${file}`);
  }
  return files.sort();
}

export function assertSkillProjectionReceiptFiles({ targetRoot, targetDir, receipt, receiptFile }: any): void {
  const files = projectionFiles(targetRoot, targetDir);
  const expected = new Set(receipt.files.map((file: any) => path.resolve(targetDir, ...file.path.split('/'))));
  const unknown = files.filter((file) => !expected.has(path.resolve(file)));
  const mismatches = receipt.files.filter((file: any) => !runtimeFileMatches(path.join(targetDir, ...file.path.split('/')), file.integrity, file.executable));
  if (!receipt.files.some((file: any) => file.path === 'SKILL.md') || unknown.length || mismatches.length) {
    throw new Error(`Skill projection ownership receipt cannot prove the current runtime files; no files were changed: ${receiptFile}\n- ${[...unknown, ...mismatches.map((file: any) => file.path)].join('\n- ')}`);
  }
}

export function listSkillProjectionOwnershipReceipts({ targetRoot, runtimeRoot, destination, adapterId }: any): any[] {
  const ownerId = skillProjectionOwnerId(adapterId, runtimeRoot);
  const owners = runtimeRoot === '.agents' ? SHARED_SKILL_OWNERS : [ownerId];
  const entries: any[] = [];
  for (const owner of owners) {
    for (const legacy of [false, true]) {
      const directory = legacy ? legacySkillProjectionOwnershipReceiptRoot(targetRoot, runtimeRoot, owner) : historicalSkillProjectionOwnershipReceiptRoot(targetRoot, destination, owner);
      for (const file of projectionFiles(targetRoot, directory).filter((file) => file.endsWith('.json'))) {
        const receipt = readSkillProjectionReceipt(file, { adapterId: owner, destination });
        const expectedFile = legacy ? legacySkillProjectionOwnershipReceiptTarget(targetRoot, runtimeRoot, owner, receipt.runtimePath) : historicalSkillProjectionOwnershipReceiptTarget(targetRoot, destination, owner, receipt.runtimePath);
        if (path.resolve(file) !== path.resolve(expectedFile)) throw new Error(`Runtime Skill projection ownership receipt target mismatch: ${file}`);
        const targetDir = path.join(targetRoot, runtimeRoot, 'skills', ...receipt.runtimePath.split('/'));
        assertProjectionPath(targetRoot, targetDir);
        entries.push({ file, directory, legacy, ownerId: owner, receipt, runtimePath: receipt.runtimePath, targetDir, runtimeRoot });
      }
    }
  }
  return entries;
}

export function observeSkillProjectionOwnershipReceipt({ targetRoot, runtimeRoot, destination, adapterId, runtimePath, runtimeSkillDir, legacyRuntimePaths = [], skillId, assetIdentity, sourceIdentity, sourceWorkspaceId, receiptEntries }: any): any {
  const ownerId = skillProjectionOwnerId(adapterId, runtimeRoot);
  const canonicalFile = historicalSkillProjectionOwnershipReceiptTarget(targetRoot, destination, ownerId, runtimePath);
  assertProjectionPath(targetRoot, canonicalFile);
  const paths = new Set([runtimePath, ...legacyRuntimePaths]);
  const entries = (receiptEntries || listSkillProjectionOwnershipReceipts({ targetRoot, runtimeRoot, destination, adapterId })).filter((entry: any) => paths.has(entry.runtimePath) || (skillId && assetIdentity && entry.receipt.skillId === skillId && entry.receipt.assetIdentity === assetIdentity));
  const canonical = entries.find((entry: any) => entry.file === canonicalFile);
  const target = canonical || entries.find((entry: any) => entry.runtimePath === runtimePath);
  const preferred = target || entries[0];
  const migrations = entries.filter((entry: any) => entry.file !== canonicalFile);
  for (const oldPath of legacyRuntimePaths) {
    if (oldPath === runtimePath || entries.some((entry: any) => entry.runtimePath === oldPath)) continue;
    const normalized = assertSafeRelativeFile(oldPath, 'Legacy Skill runtime path');
    const oldDirectory = path.join(targetRoot, runtimeRoot, 'skills', ...normalized.split('/'));
    if (projectionFiles(targetRoot, oldDirectory).length) throw new Error(`Legacy Skill projection has no proven owner; no files were changed: ${oldDirectory}`);
  }
  for (const entry of entries) {
    const receipt = entry.receipt;
    if (receipt.schemaVersion === RUNTIME_SKILL_PROJECTION_SCHEMA && ((skillId && receipt.skillId !== skillId) || (assetIdentity && receipt.assetIdentity !== assetIdentity) || (sourceIdentity && receipt.sourceIdentity !== sourceIdentity) || (destination === 'user' && sourceWorkspaceId && receipt.sourceWorkspaceId !== sourceWorkspaceId))) {
      throw new Error(`Skill projection ownership identity conflict; no files were changed: ${entry.file}`);
    }
    if (preferred && !skillProjectionOwnershipReceiptsEquivalent(preferred.receipt, receipt, { ignoreRuntimePath: true })) {
      throw new Error(`Skill projection ownership receipt conflict; canonical and legacy receipts differ, so no files were changed:\n- ${preferred.file}\n- ${entry.file}`);
    }
    if (migrations.length) {
      assertSkillProjectionReceiptFiles({ targetRoot, targetDir: entry.targetDir, receipt, receiptFile: entry.file });
      if (skillId) {
        const content = fs.readFileSync(path.join(entry.targetDir, 'SKILL.md'), 'utf8');
        const name = /^---\r?\n[\s\S]*?^name:\s*([^\r\n]+)[\s\S]*?^---/m.exec(content)?.[1]?.trim().replace(/^['"]|['"]$/g, '');
        if (name !== skillId) throw new Error(`Legacy Skill projection identity cannot be proven; no files were changed: ${entry.targetDir}`);
      }
    }
  }
  if (migrations.length && !target && projectionFiles(targetRoot, runtimeSkillDir).length) throw new Error(`Skill migration target is not empty or owned; no files were changed: ${runtimeSkillDir}`);
  const legacy = migrations[0];
  return {
    ownerId,
    receipt: preferred?.receipt || null,
    receiptFile: preferred?.file || null,
    targetReceipt: target?.receipt || null,
    canonicalFile,
    canonicalReceipt: canonical?.receipt || null,
    legacyFile: legacy?.file || legacySkillProjectionOwnershipReceiptTarget(targetRoot, runtimeRoot, adapterId, runtimePath),
    legacyReceipt: legacy?.receipt || null,
    entries,
    migrations,
    relocations: [...new Map(entries.filter((entry: any) => entry.runtimePath !== runtimePath).map((entry: any) => [entry.targetDir, entry])).values()],
    migration: !migrations.length ? null : canonical ? 'dual-equivalent' : 'legacy-only',
  };
}

export function buildCompanionWrite(targetFile: any, sourceFile: any, relativePath: any, content: any, executable: any, metadata: any = {}): any  {
  const encoded = content.toString('base64');
  return {
    targetFile,
    content: encoded,
    contentEncoding: 'base64',
    sourceContent: encoded,
    sourceContentEncoding: 'base64',
    mode: executable ? 0o100 : 0,
    sourceFile,
    skillRelativePath: toPosix(relativePath),
    ...metadata,
  };
}
