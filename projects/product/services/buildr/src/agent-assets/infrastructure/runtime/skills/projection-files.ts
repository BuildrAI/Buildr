import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from '../../../../infrastructure/process.mjs';

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

export function skillProjectionOwnershipReceiptRoot(targetRoot: any, destination: any, adapterId: any = null): any  {
  if (!['workspace', 'user'].includes(destination)) throw new Error(`Unsupported Skill projection ownership receipt destination: ${destination}.`);
  const root = path.join(targetRoot, '.buildr', 'agent-runtime', destination);
  if (!adapterId) return root;
  const { adapter } = normalizedReceiptSegments(adapterId, 'receipt-root');
  return path.join(root, adapter, SKILL_PROJECTION_OWNERSHIP_RECEIPTS_DIRECTORY);
}

export function skillProjectionOwnershipReceiptTarget(targetRoot: any, destination: any, adapterId: any, runtimePath: any): any  {
  const { adapter, normalized } = normalizedReceiptSegments(adapterId, runtimePath);
  return path.join(targetRoot, '.buildr', 'agent-runtime', destination, adapter, SKILL_PROJECTION_OWNERSHIP_RECEIPTS_DIRECTORY, ...normalized.split('/'));
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

export function skillProjectionOwnershipReceiptsEquivalent(left: any, right: any): any  {
  return JSON.stringify(stableReceiptValue(left)) === JSON.stringify(stableReceiptValue(right));
}

function assertLegacyReceiptStillOwnsRuntime(receipt: any, runtimeSkillDir: any, legacyFile: any): any  {
  const mismatches = receipt.files.filter((file: any) => !runtimeFileMatches(path.join(runtimeSkillDir, ...file.path.split('/')), file.integrity, file.executable));
  if (mismatches.length > 0) {
    throw new Error(`Legacy Skill projection ownership receipt cannot prove the current runtime files; no files were changed: ${legacyFile}\n- ${mismatches.map((file: any) => file.path).join('\n- ')}`);
  }
}

export function observeSkillProjectionOwnershipReceipt({ targetRoot, runtimeRoot, destination, adapterId, runtimePath, runtimeSkillDir }: any): any  {
  const canonicalFile = skillProjectionOwnershipReceiptTarget(targetRoot, destination, adapterId, runtimePath);
  const legacyFile = legacySkillProjectionOwnershipReceiptTarget(targetRoot, runtimeRoot, adapterId, runtimePath);
  const expected: any = { adapterId, runtimePath, destination };
  const canonicalReceipt = readSkillProjectionReceipt(canonicalFile, expected);
  let legacyReceipt;
  try {
    legacyReceipt = readSkillProjectionReceipt(legacyFile, expected);
  } catch (error: any) {
    throw new Error(`Legacy Skill projection ownership receipt migration is blocked; no files were changed: ${error.message}`);
  }
  if (canonicalReceipt && legacyReceipt && !skillProjectionOwnershipReceiptsEquivalent(canonicalReceipt, legacyReceipt)) {
    throw new Error(`Skill projection ownership receipt conflict; canonical and legacy receipts differ, so no files were changed:\n- ${canonicalFile}\n- ${legacyFile}`);
  }
  if (!canonicalReceipt && legacyReceipt) assertLegacyReceiptStillOwnsRuntime(legacyReceipt, runtimeSkillDir, legacyFile);
  return {
    receipt: canonicalReceipt || legacyReceipt,
    receiptFile: canonicalReceipt ? canonicalFile : legacyReceipt ? legacyFile : null,
    canonicalFile,
    legacyFile,
    canonicalReceipt,
    legacyReceipt,
    migration: !legacyReceipt ? null : canonicalReceipt ? 'dual-equivalent' : 'legacy-only',
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
