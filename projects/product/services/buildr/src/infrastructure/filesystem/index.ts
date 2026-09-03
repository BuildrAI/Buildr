import fs from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { BOOTSTRAP_CONTRACT_RESOURCE, RESOURCE_WORKSPACE_ROOT } from '../product-layout.ts';
import { resolveProductRoot } from '../product-resources/index.ts';

let activeWorkspaceMutation: any = null;

const EXCLUSIVE_FILE_LOCK_SCHEMA = 'buildr.exclusive-file-lock/v1';
const EXCLUSIVE_FILE_LOCK_TIMEOUT_MS = 5_000;
const EXCLUSIVE_FILE_LOCK_RETRY_DELAY_MS = 25;

function waitSynchronously(milliseconds: any): any  {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function exclusiveFileLockError(message: any, code: any, file: any, cause: any = null): any  {
  const error: Error & Record<string, any> = new Error(message, cause ? { cause } : undefined);
  error.code = code;
  error.operation = 'exclusive-file-lock';
  error.target = file;
  return error;
}

function validateExclusiveFileLockRecord(value: any, target: any): any  {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (Object.keys(value).sort().join(',') !== 'createdAt,pid,schemaVersion,target,token') return null;
  if (
    value.schemaVersion !== EXCLUSIVE_FILE_LOCK_SCHEMA
    || !Number.isInteger(value.pid) || value.pid <= 0
    || typeof value.token !== 'string' || !/^[a-f0-9]{32}$/.test(value.token)
    || typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt))
    || typeof value.target !== 'string' || path.resolve(value.target) !== target
  ) return null;
  return value;
}

function readExclusiveFileLock(file: any, target: any): any  {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    let value: any = null;
    try { value = JSON.parse(raw); } catch {}
    return { raw, record: validateExclusiveFileLockRecord(value, target) };
  } catch (error: any) {
    if (error.code === 'ENOENT') return null;
    throw exclusiveFileLockError(`Cannot read exclusive filesystem lock ${file}: ${error.message}`, 'buildr_exclusive_file_lock_read_failed', file, error);
  }
}

function exclusiveFileLockOwnerAlive(record: any, options: any = {}): any  {
  if (options.ownerAlive) return options.ownerAlive(record.pid, record);
  try {
    process.kill(record.pid, 0);
    return true;
  } catch (error: any) {
    return error.code !== 'ESRCH';
  }
}

function publishExclusiveFileLockCandidate(file: any, record: any): any  {
  const candidate = `${file}.candidate-${record.pid}-${record.token}`;
  try {
    fs.writeFileSync(candidate, `${JSON.stringify(record)}\n`, { flag: 'wx', mode: 0o600 });
    const descriptor = fs.openSync(candidate, 'r+');
    try { fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
    fs.linkSync(candidate, file);
    return true;
  } catch (error: any) {
    if (error.code === 'EEXIST') return false;
    throw exclusiveFileLockError(`Cannot acquire exclusive filesystem lock ${file}: ${error.message}`, 'buildr_exclusive_file_lock_acquire_failed', file, error);
  } finally {
    fs.rmSync(candidate, { force: true });
  }
}

function moveAndRemoveExclusiveFileLock(file: any, observed: any, operationToken: any): any  {
  const quarantine = `${file}.${operationToken}-${crypto.randomUUID()}`;
  try {
    fs.renameSync(file, quarantine);
  } catch (error: any) {
    if (error.code === 'ENOENT') return false;
    throw exclusiveFileLockError(`Cannot claim exclusive filesystem lock ${file} for ${operationToken}: ${error.message}`, 'buildr_exclusive_file_lock_claim_failed', file, error);
  }
  let moved;
  try {
    moved = fs.readFileSync(quarantine, 'utf8');
    if (moved !== observed.raw) {
      if (!fs.existsSync(file)) fs.renameSync(quarantine, file);
      throw exclusiveFileLockError(`Exclusive filesystem lock ${file} changed while ${operationToken} claimed it.`, 'buildr_exclusive_file_lock_ownership_lost', file);
    }
    fs.rmSync(quarantine, { force: true });
    return true;
  } catch (error: any) {
    if (error?.code?.startsWith?.('buildr_exclusive_file_lock_')) throw error;
    throw exclusiveFileLockError(`Cannot remove claimed exclusive filesystem lock ${file}: ${error.message}`, 'buildr_exclusive_file_lock_release_failed', file, error);
  }
}

export function acquireExclusiveFileLock(file: any, target: any, options: any = {}): any  {
  const resolvedFile = path.resolve(file);
  const resolvedTarget = path.resolve(target);
  const now = options.now || Date.now;
  const pause = options.wait || waitSynchronously;
  const timeoutMs = options.timeoutMs ?? EXCLUSIVE_FILE_LOCK_TIMEOUT_MS;
  const retryDelayMs = options.retryDelayMs ?? EXCLUSIVE_FILE_LOCK_RETRY_DELAY_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs < 0 || !Number.isFinite(retryDelayMs) || retryDelayMs <= 0) {
    throw new Error('Exclusive filesystem lock timeout and retry delay must be bounded non-negative milliseconds.');
  }
  fs.mkdirSync(path.dirname(resolvedFile), { recursive: true });
  const startedAt = now();
  const deadline = startedAt + timeoutMs;
  const record = Object.freeze({
    schemaVersion: EXCLUSIVE_FILE_LOCK_SCHEMA,
    pid: process.pid,
    token: crypto.randomBytes(16).toString('hex'),
    createdAt: new Date(startedAt).toISOString(),
    target: resolvedTarget,
  });
  while (true) {
    if (publishExclusiveFileLockCandidate(resolvedFile, record)) {
      return Object.freeze({ owner: true, file: resolvedFile, target: resolvedTarget, record });
    }
    const observed = readExclusiveFileLock(resolvedFile, resolvedTarget);
    if (!observed) continue;
    if (observed.record && !exclusiveFileLockOwnerAlive(observed.record, options)) {
      if (moveAndRemoveExclusiveFileLock(resolvedFile, observed, 'stale')) continue;
    }
    const observedAt = now();
    if (observedAt >= deadline) {
      const owner = observed.record
        ? `pid=${observed.record.pid} createdAt=${observed.record.createdAt}`
        : 'owner=invalid-or-unknown';
      throw exclusiveFileLockError(`Exclusive filesystem lock wait expired for ${resolvedFile}: ${owner}.`, 'buildr_exclusive_file_lock_timeout', resolvedFile);
    }
    pause(Math.min(retryDelayMs, Math.max(1, deadline - observedAt)));
  }
}

export function releaseExclusiveFileLock(lock: any): any  {
  if (!lock?.owner || typeof lock.file !== 'string' || typeof lock.target !== 'string' || !lock.record) return false;
  const file = path.resolve(lock.file);
  const target = path.resolve(lock.target);
  const expected = validateExclusiveFileLockRecord(lock.record, target);
  if (!expected) return false;
  const observed = readExclusiveFileLock(file, target);
  if (!observed?.record) return false;
  if (JSON.stringify(observed.record) !== JSON.stringify(expected)) return false;
  return moveAndRemoveExclusiveFileLock(file, observed, 'release');
}

export function withExclusiveFileLock(file: any, target: any, callback: any, options: any = {}): any  {
  const lock = acquireExclusiveFileLock(file, target, options);
  let result;
  let primaryError: any = null;
  try {
    options.onAcquired?.(lock);
    result = callback(lock);
  } catch (error: any) {
    primaryError = error;
  }
  const released = releaseExclusiveFileLock(lock);
  if (!released) {
    throw exclusiveFileLockError(
      `Exclusive filesystem lock ownership was lost before release: ${lock.file}.`,
      'buildr_exclusive_file_lock_ownership_lost',
      lock.file,
      primaryError,
    );
  }
  if (primaryError) throw primaryError;
  return result;
}

export function atomicWriteFile(file: any, content: any, encoding: any = 'utf8', options: any = {}): any  {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = path.join(path.dirname(file), `.${path.basename(file)}.buildr-tmp-${process.pid}-${crypto.randomUUID()}`);
  try {
    fs.writeFileSync(temporary, content, { encoding, ...options });
    try {
      const descriptor = fs.openSync(temporary, 'r');
      try { fs.fsyncSync(descriptor); } finally { fs.closeSync(descriptor); }
    } catch {
      // Some filesystems do not support fsync for these files; rename is still atomic.
    }
    fs.renameSync(temporary, file);
    if (activeWorkspaceMutation && process.env.BUILDR_FAULT_AFTER_MUTATION_WRITE) {
      activeWorkspaceMutation.writeCount = (activeWorkspaceMutation.writeCount || 0) + 1;
      if (activeWorkspaceMutation.writeCount === Number(process.env.BUILDR_FAULT_AFTER_MUTATION_WRITE)) {
        throw new Error(`Injected Buildr mutation failure after write ${activeWorkspaceMutation.writeCount}.`);
      }
    }
  } finally {
    if (fs.existsSync(temporary)) fs.rmSync(temporary, { force: true });
  }
}

export function atomicWriteJson(file: any, value: any, options: any = {}): any  {
  atomicWriteFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8', options);
}

export function registerWorkspaceInfrastructure(runtime: any): any  {
  const doctor = (...args: any[]) => runtime.doctor(...args);
  const workspaceSymlinkSegment = (...args: any[]) => runtime.workspaceSymlinkSegment(...args);
  const collectFiles = (...args: any[]) => runtime.collectFiles(...args);
  const isGitUrl = (...args: any[]) => runtime.isGitUrl(...args);
  const trackWrite = (...args: any[]) => runtime.trackWrite(...args);

  function optionValue(args: any, name: any, fallback: any): any  {
    const index = args.indexOf(name);
    if (index === -1) return fallback;
    const value = args[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for ${name}`);
    }
    return value;
  }

  function optionValueRaw(args: any, name: any, fallback: any): any  {
    const index = args.indexOf(name);
    if (index === -1) return fallback;
    const value = args[index + 1];
    if (value === undefined) {
      throw new Error(`Missing value for ${name}`);
    }
    return value;
  }

  function withResolvedTarget(args: any): any  {
    const nextArgs: any[] = [...args];
    const targetRoot = path.resolve(optionValue(nextArgs, '--target', process.cwd()));
    const targetIndex = nextArgs.indexOf('--target');
    if (targetIndex === -1) {
      nextArgs.push('--target', targetRoot);
    } else {
      nextArgs[targetIndex + 1] = targetRoot;
    }
    return { args: nextArgs, targetRoot };
  }

  function withOption(args: any, name: any, value: any): any  {
    const nextArgs: any[] = [...args];
    const index = nextArgs.indexOf(name);
    if (index === -1) nextArgs.push(name, value);
    else nextArgs[index + 1] = value;
    return nextArgs;
  }

  function skillScopeForRuleScope(scope: any): any  {
    const parts = scope.split('/');
    return parts[0] === 'projects' && parts[1] ? `projects/${parts[1]}` : '.';
  }

  function ensureDirectory(dir: any): any  {
    fs.mkdirSync(dir, { recursive: true });
  }

  function copyDirectory(source: any, target: any): any  {
    fs.cpSync(source, target, { recursive: true });
  }

  function removePath(target: any): any  {
    fs.rmSync(target, { recursive: true, force: true });
  }

  function parseYamlDocument(content: any, label: any = 'YAML document'): any  {
    let document;
    try {
      document = YAML.parseDocument(content, { uniqueKeys: true, prettyErrors: true });
    } catch (error: any) {
      throw new Error(`${label} is invalid YAML: ${error.message}`);
    }
    if (document.errors.length) throw new Error(`${label} is invalid YAML: ${document.errors.map((error: any) => error.message).join('; ')}`);
    const value = document.toJS({ mapAsMap: false });
    if (value === null || value === undefined) return {};
    if (typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be a YAML mapping.`);
    return value;
  }

  function mutationStateRoot(targetRoot: any): any  {
    return path.join(targetRoot, '.buildr', 'mutations');
  }

  function mutationLockPath(targetRoot: any): any  {
    return path.join(mutationStateRoot(targetRoot), 'lock.json');
  }

  function mutationRecoveryReceiptPath(targetRoot: any, transactionId: any): any  {
    return path.join(mutationStateRoot(targetRoot), `recovered-${transactionId}.json`);
  }

  function pathIsEqualOrInside(candidate: any, root: any): any  {
    const relative = path.relative(root, candidate);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  }

  function assertSafeAssetTarget(targetRoot: any, target: any, containerRoot: any, label: any = 'Managed asset target'): any  {
    const resolvedTarget = path.resolve(target);
    const resolvedContainer = path.resolve(containerRoot);
    const relative = path.relative(resolvedContainer, resolvedTarget);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error(`${label} must be a strict descendant of ${resolvedContainer}: ${resolvedTarget}`);
    }
    const protectedRoots = [targetRoot, productRoot(), process.cwd(), os.homedir(), path.parse(resolvedTarget).root].map((item: any) => path.resolve(item));
    for (const protectedRoot of protectedRoots) {
      if (resolvedTarget === protectedRoot || pathIsEqualOrInside(protectedRoot, resolvedTarget)) {
        throw new Error(`${label} is protected: ${resolvedTarget}`);
      }
    }
    const targetRelative = path.relative(targetRoot, resolvedTarget);
    if (!targetRelative.startsWith('..') && !path.isAbsolute(targetRelative)) {
      const symlink = workspaceSymlinkSegment(targetRoot, targetRelative);
      if (symlink) throw new Error(`${label} crosses a symbolic link: ${symlink}`);
    }
    return resolvedTarget;
  }

  function normalizedGitIdentity(value: any): any  {
    if (!value) return null;
    const trimmed = String(value).trim().replace(/\/$/, '').replace(/\.git$/, '');
    if (trimmed.startsWith('file://')) {
      try { return path.resolve(new URL(trimmed).pathname).replace(/\.git$/, ''); } catch {}
    }
    if (!isGitUrl(trimmed) && fs.existsSync(trimmed)) return path.resolve(trimmed).replace(/\.git$/, '');
    return trimmed;
  }

  function sameGitIdentity(left: any, right: any): any  {
    return normalizedGitIdentity(left) === normalizedGitIdentity(right);
  }

  function snapshotMutationPath(transactionRoot: any, targetRoot: any, target: any, index: any): any  {
    const resolved = path.resolve(target);
    const relative = toPosixRelative(targetRoot, resolved);
    const backup = path.join(transactionRoot, 'backup', String(index));
    const existed = fs.existsSync(resolved);
    if (existed) {
      ensureDirectory(path.dirname(backup));
      fs.cpSync(resolved, backup, { recursive: true, preserveTimestamps: true });
    }
    return { target: resolved, relative, backup, existed };
  }

  let injectedRestoreRemovalFaults = 0;

  function removeMutationRestoreTarget(target: any): any  {
    if (!fs.existsSync(target)) return;
    const faultLimit = Number(process.env.BUILDR_FAULT_MUTATION_RESTORE_REMOVE || 0);
    if (faultLimit > injectedRestoreRemovalFaults) {
      injectedRestoreRemovalFaults += 1;
      const error: Error & Record<string, any> = new Error(`Injected Buildr mutation restore removal failure for ${target}.`);
      error.code = 'EBUSY';
      throw error;
    }
    fs.rmSync(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    if (fs.existsSync(target)) throw new Error(`Mutation restore could not remove target: ${target}`);
  }

  function mutationPathFingerprint(target: any): any  {
    if (!fs.existsSync(target)) return null;
    const visit = (current: any, relative: any = '') => {
      const stat = fs.lstatSync(current);
      if (stat.isSymbolicLink()) return [{ path: relative, type: 'symlink', target: fs.readlinkSync(current) }];
      if (stat.isFile()) return [{ path: relative, type: 'file', integrity: crypto.createHash('sha256').update(fs.readFileSync(current)).digest('hex') }];
      if (!stat.isDirectory()) return [{ path: relative, type: 'other', mode: stat.mode }];
      const entries: any[] = [{ path: relative, type: 'directory' }];
      for (const name of fs.readdirSync(current).sort()) entries.push(...visit(path.join(current, name), relative ? `${relative}/${name}` : name));
      return entries;
    };
    return JSON.stringify(visit(target));
  }

  function restoreMutationSnapshot(snapshot: any): any  {
    removeMutationRestoreTarget(snapshot.target);
    if (snapshot.existed) {
      if (!fs.existsSync(snapshot.backup)) throw new Error(`Mutation backup is missing for ${snapshot.relative || snapshot.target}`);
      ensureDirectory(path.dirname(snapshot.target));
      fs.cpSync(snapshot.backup, snapshot.target, { recursive: true, preserveTimestamps: true });
      if (mutationPathFingerprint(snapshot.target) !== mutationPathFingerprint(snapshot.backup)) {
        throw new Error(`Mutation restore verification failed for ${snapshot.relative || snapshot.target}`);
      }
    } else if (fs.existsSync(snapshot.target)) {
      throw new Error(`Mutation restore expected target to remain absent: ${snapshot.relative || snapshot.target}`);
    }
  }

  function withWorkspaceMutation(targetRoot: any, operation: any, affectedPaths: any, callback: any, options: any = {}): any  {
    const root = path.resolve(targetRoot);
    if (activeWorkspaceMutation?.targetRoot === root) return callback(activeWorkspaceMutation);
    for (const affectedPath of affectedPaths) {
      const resolved = path.resolve(affectedPath);
      const relative = path.relative(root, resolved);
      if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`Mutation target must stay inside workspace and cannot be the workspace root: ${resolved}`);
      const symlink = workspaceSymlinkSegment(root, relative);
      if (symlink) throw new Error(`Mutation target crosses a symbolic link: ${symlink}`);
    }
    const lockFile = mutationLockPath(root);
    if (existsFile(lockFile)) {
      let existing: any = {};
      try { existing = JSON.parse(fs.readFileSync(lockFile, 'utf8')); } catch {}
      throw new Error(`Workspace source mutation is blocked by incomplete transaction ${existing.transactionId || '<unknown>'} (${existing.operation || 'unknown operation'}). Run buildr doctor --target ${root} --json.`);
    }
    if (process.env.BUILDR_FAIL_IF_MUTATION_STARTED === '1' || process.env.BUILDR_FAIL_IF_MUTATION_STARTED === operation) {
      throw new Error(`Injected failure because workspace mutation started: ${operation}`);
    }
    const transactionId = `${Date.now()}-${process.pid}-${crypto.randomUUID()}`;
    const transactionRoot = path.join(mutationStateRoot(root), transactionId);
    ensureDirectory(transactionRoot);
    const record: any = { schemaVersion: 'buildr.mutation/v1', transactionId, operation, phase: 'preflight', affectedPaths: [...new Set(affectedPaths.map((item: any) => toPosixRelative(root, path.resolve(item))))], startedAt: new Date().toISOString() };
    try {
      fs.writeFileSync(lockFile, `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
    } catch (error: any) {
      fs.rmSync(transactionRoot, { recursive: true, force: true });
      throw new Error(`Cannot acquire workspace mutation lock: ${error.message}`);
    }
    let snapshots;
    try {
      if (options.preSnapshot) options.preSnapshot({ targetRoot: root, transactionId, transactionRoot, record });
      snapshots = [...new Set(affectedPaths.map((item: any) => path.resolve(item)))].map((item: any, index: any) => snapshotMutationPath(transactionRoot, root, item, index));
    } catch (error: any) {
      fs.rmSync(transactionRoot, { recursive: true, force: true });
      fs.rmSync(lockFile, { force: true });
      throw error;
    }
    const journalSnapshots = snapshots.map(({ target, relative, existed }: any, index: any) => ({ index, target, relative, existed }));
    record.phase = 'commit';
    atomicWriteJson(path.join(transactionRoot, 'journal.json'), { ...record, snapshots: journalSnapshots });
    activeWorkspaceMutation = { targetRoot: root, transactionId, transactionRoot, record };
    try {
      const result = callback(activeWorkspaceMutation);
      record.phase = 'committed';
      atomicWriteJson(path.join(transactionRoot, 'journal.json'), { ...record, snapshots: journalSnapshots });
      fs.rmSync(transactionRoot, { recursive: true, force: true });
      fs.rmSync(lockFile, { force: true });
      return result;
    } catch (error: any) {
      record.phase = 'rollback';
      try {
        for (const snapshot of [...snapshots].reverse()) restoreMutationSnapshot(snapshot);
        record.phase = 'rolled-back';
        atomicWriteJson(path.join(transactionRoot, 'journal.json'), { ...record, snapshots: journalSnapshots });
        fs.rmSync(transactionRoot, { recursive: true, force: true });
        fs.rmSync(lockFile, { force: true });
      } catch (rollbackError: any) {
        record.phase = 'rollback-failed';
        record.error = error.message;
        record.rollbackError = rollbackError.message;
        atomicWriteJson(path.join(transactionRoot, 'journal.json'), { ...record, snapshots: journalSnapshots });
        throw new Error(`${error.message}\nRollback failed: ${rollbackError.message}. Run buildr doctor --target ${root} --json.`);
      }
      throw error;
    } finally {
      activeWorkspaceMutation = null;
    }
  }

  function productRoot(): any  {
    return resolveProductRoot();
  }

  function resourcesRoot(): any  {
    return path.join(productRoot(), 'resources');
  }

  function resourceWorkspaceRoot(): any  {
    return path.join(productRoot(), RESOURCE_WORKSPACE_ROOT);
  }

  function bootstrapContractPath(): any  {
    return path.join(productRoot(), BOOTSTRAP_CONTRACT_RESOURCE);
  }

  function developmentWorkspaceRoot(): any  {
    const root = productRoot();
    const parent = path.resolve(root, '..');
    if (
      path.basename(root) === 'product' &&
      existsFile(path.join(parent, 'AGENTS.md')) &&
      existsDirectory(path.join(parent, 'rules'))
    ) {
      return parent;
    }
    return null;
  }

  function renderTemplate(content: any, variables: any): any  {
    return content.replace(/\{\{([A-Za-z0-9_]+)\}\}/g, (_: any, key: any) => {
      if (variables[key] === undefined) {
        throw new Error(`Missing template variable: ${key}`);
      }
      return variables[key];
    });
  }

  function writeIfMissing(file: any, content: any): any  {
    if (fs.existsSync(file)) return false;
    atomicWriteFile(file, content);
    return true;
  }

  function writeMappedFileIfMissing(targetRoot: any, outputRoot: any, entry: any, variables: any, created: any): any  {
    const sourceFile = path.resolve(productRoot(), entry.source);
    const targetFile = path.join(outputRoot, entry.target);
    const sourceContent = fs.readFileSync(sourceFile, 'utf8');
    const content = entry.mode === 'render' ? renderTemplate(sourceContent, variables) : sourceContent;
    trackWrite(targetRoot, targetFile, content, created);
  }

  function appendGitignoreEntries(file: any, entries: any): any  {
    const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    const lines: any = new Set(existing.split(/\r?\n/).filter(Boolean));
    const missing = entries.filter((entry: any) => !lines.has(entry));
    if (missing.length === 0) return false;

    const prefix = existing && !existing.endsWith('\n') ? '\n' : '';
    atomicWriteFile(file, `${existing}${prefix}${missing.join('\n')}\n`);
    return true;
  }

  function hasFlag(args: any, name: any): any  {
    return args.includes(name);
  }

  function toPosixRelative(from: any, to: any): any  {
    const relative = path.relative(from, to).split(path.sep).join('/');
    return relative || '.';
  }

  function existsDirectory(dir: any): any  {
    return fs.existsSync(dir) && fs.statSync(dir).isDirectory();
  }

  function existsFile(file: any): any  {
    return fs.existsSync(file) && fs.statSync(file).isFile();
  }

  const BUILDR_REQUIRED_BLOCK_START = '<!-- buildr:required begin -->';
  const BUILDR_REQUIRED_BLOCK_END = '<!-- buildr:required end -->';
  const requiredBlockPattern = () => /<!-- buildr:required begin -->(?:(?!<!-- buildr:required begin -->)[\s\S])*?<!-- buildr:required end -->/g;

  function packageRequiredBlock(): any  {
    const source = fs.readFileSync(path.join(resourceWorkspaceRoot(), 'AGENTS.md'), 'utf8');
    const blocks: any[] = [...source.matchAll(requiredBlockPattern())];
    if (blocks.length !== 1) throw new Error('Package AGENTS.md must contain exactly one Buildr required block.');
    return blocks[0][0];
  }

  function ensureRootRequiredBlock(targetRoot: any, changed: any = []): any  {
    const agentsPath = path.join(targetRoot, 'AGENTS.md');
    const existing = existsFile(agentsPath) ? fs.readFileSync(agentsPath, 'utf8') : '';
    const block = packageRequiredBlock();
    let inserted = false;
    // Preserve all text outside complete managed spans, including whitespace.
    // Unpaired markers have no known owned body: strip only the markers.
    let next = '';
    let offset = 0;
    const withoutMarkers = (text: any) => text.replaceAll(BUILDR_REQUIRED_BLOCK_START, '').replaceAll(BUILDR_REQUIRED_BLOCK_END, '');
    for (const match of existing.matchAll(requiredBlockPattern())) {
      next += withoutMarkers(existing.slice(offset, match.index));
      next += inserted ? '' : block;
      inserted = true;
      offset = match.index + match[0].length;
    }
    next += withoutMarkers(existing.slice(offset));
    if (!inserted) next = `${block}\n${next}`;
    if (next !== existing) {
      atomicWriteFile(agentsPath, next, 'utf8');
      changed.push('AGENTS.md');
      return true;
    }
    return false;
  }

  function rootRequiredBlockStatus(targetRoot: any): any  {
    const agentsPath = path.join(targetRoot, 'AGENTS.md');
    if (!existsFile(agentsPath)) return { exists: false, valid: false, path: 'AGENTS.md' };
    const content = fs.readFileSync(agentsPath, 'utf8');
    const blocks: any[] = [...content.matchAll(requiredBlockPattern())];
    return {
      exists: true,
      valid: blocks.length === 1 && blocks[0][0] === packageRequiredBlock()
        && content.split(BUILDR_REQUIRED_BLOCK_START).length === 2
        && content.split(BUILDR_REQUIRED_BLOCK_END).length === 2,
      path: 'AGENTS.md',
    };
  }

  function writeFileIfChanged(file: any, content: any): any  {
    if (existsFile(file) && fs.readFileSync(file, 'utf8') === content) return false;
    atomicWriteFile(file, content, 'utf8');
    return true;
  }

  function copyFileIfChanged(sourceFile: any, targetFile: any): any  {
    return writeFileIfChanged(targetFile, fs.readFileSync(sourceFile, 'utf8'));
  }

  function copyDirectoryIfChanged(sourceDir: any, targetDir: any): any  {
    let changed = false;
    for (const sourceFile of collectFiles(sourceDir)) {
      const relative = path.relative(sourceDir, sourceFile);
      const targetFile = path.join(targetDir, relative);
      if (copyFileIfChanged(sourceFile, targetFile)) changed = true;
    }
    return changed;
  }

  function buildrWorkspaceIdentity(targetRoot: any): any  {
    const assets: any = {
      agentsFile: existsFile(path.join(targetRoot, 'AGENTS.md')),
      metadataFile: existsFile(path.join(targetRoot, '.buildr', 'workspace.yml')),
      rootOrganization: existsDirectory(path.join(targetRoot, 'projects')),
    };
    const required: any[] = ['AGENTS.md', '.buildr/workspace.yml', 'projects'];
    const missing: any[] = [
      ...(!assets.agentsFile ? ['AGENTS.md'] : []),
      ...(!assets.metadataFile ? ['.buildr/workspace.yml'] : []),
      ...(!assets.rootOrganization ? ['projects'] : []),
    ];
    const presentCount = required.length - missing.length;
    return {
      state: missing.length === 0 ? 'valid' : presentCount === 0 ? 'absent' : 'incomplete',
      required,
      missing,
      ...assets,
    };
  }

  function isInitializedBuildrWorkspace(targetRoot: any): any  {
    return buildrWorkspaceIdentity(targetRoot).state === 'valid';
  }

  function assertInitializedBuildrWorkspace(targetRoot: any): any  {
    if (!isInitializedBuildrWorkspace(targetRoot)) {
      throw new Error(`Target is not an initialized Buildr workspace: ${targetRoot}. 请先运行 buildr init。`);
    }
  }

  function addDoctorFinding(result: any, status: any, code: any, message: any, extra: any = {}): any  {
    const gitFinding = /(?:git|remote|branch|dirty|worktree)/.test(code);
    const prefix = code.split('.')[0];
    const domainAliases: Record<string, string> = { projects: 'project', project: 'project', services: 'service', service: 'service', runtime: 'runtime', components: 'component', component: 'component', commands: 'command', command: 'command', capability: 'capability', mutation: 'transaction', installation: 'installation', launcher: 'installation' };
    const domain = extra.domain || (gitFinding ? 'git' : (domainAliases[prefix] || 'workspace'));
    const defaultActions: any = {
      workspace: ['inspect', 'sync'], project: ['inspect', 'create', 'update', 'sync'], service: ['inspect', 'create', 'update', 'sync'],
      git: ['inspect', 'finish'], runtime: ['inspect', 'render', 'sync'], component: ['inspect', 'reconcile', 'sync'],
      command: ['inspect', 'execute'], capability: ['inspect', 'execute'], transaction: ['recover'], installation: ['inspect', 'update'],
    };
    const scope = extra.scope || (extra.project && extra.service ? `projects/${extra.project}/services/${extra.service}` : extra.project ? `projects/${extra.project}` : '.');
    const affectedActions = Array.isArray(extra.affectedActions) ? extra.affectedActions : defaultActions[domain];
    const ownershipUnit = extra.ownershipUnit || extra.path || `${domain}:${scope}`;
    result.findings.push({ status, code, message, domain, scope, affectedActions, ownershipUnit, ...extra });
  }

  Object.assign(runtime, { optionValue, optionValueRaw, withResolvedTarget, withOption, skillScopeForRuleScope, ensureDirectory, copyDirectory, removePath, atomicWriteFile, atomicWriteJson, parseYamlDocument, mutationStateRoot, mutationLockPath, mutationRecoveryReceiptPath, pathIsEqualOrInside, assertSafeAssetTarget, normalizedGitIdentity, sameGitIdentity, snapshotMutationPath, removeMutationRestoreTarget, mutationPathFingerprint, restoreMutationSnapshot, withWorkspaceMutation, productRoot, resourcesRoot, resourceWorkspaceRoot, bootstrapContractPath, developmentWorkspaceRoot, renderTemplate, writeIfMissing, writeMappedFileIfMissing, appendGitignoreEntries, hasFlag, toPosixRelative, existsDirectory, existsFile, ensureRootRequiredBlock, rootRequiredBlockStatus, writeFileIfChanged, copyFileIfChanged, copyDirectoryIfChanged, buildrWorkspaceIdentity, isInitializedBuildrWorkspace, assertInitializedBuildrWorkspace, addDoctorFinding });
  return runtime;
}
