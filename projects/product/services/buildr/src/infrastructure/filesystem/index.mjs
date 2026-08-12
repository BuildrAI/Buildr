import fs from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { PACKAGE_BOOTSTRAP_CONTRACT, PACKAGE_WORKSPACE_TARGET } from '../product-layout.mjs';

export function registerWorkspaceInfrastructure(runtime) {
  const doctor = (...args) => runtime.doctor(...args);
  const workspaceSymlinkSegment = (...args) => runtime.workspaceSymlinkSegment(...args);
  const collectFiles = (...args) => runtime.collectFiles(...args);
  const isGitUrl = (...args) => runtime.isGitUrl(...args);
  const trackWrite = (...args) => runtime.trackWrite(...args);

  function optionValue(args, name, fallback) {
    const index = args.indexOf(name);
    if (index === -1) return fallback;
    const value = args[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for ${name}`);
    }
    return value;
  }

  function optionValueRaw(args, name, fallback) {
    const index = args.indexOf(name);
    if (index === -1) return fallback;
    const value = args[index + 1];
    if (value === undefined) {
      throw new Error(`Missing value for ${name}`);
    }
    return value;
  }

  function withResolvedTarget(args) {
    const nextArgs = [...args];
    const targetRoot = path.resolve(optionValue(nextArgs, '--target', process.cwd()));
    const targetIndex = nextArgs.indexOf('--target');
    if (targetIndex === -1) {
      nextArgs.push('--target', targetRoot);
    } else {
      nextArgs[targetIndex + 1] = targetRoot;
    }
    return { args: nextArgs, targetRoot };
  }

  function withOption(args, name, value) {
    const nextArgs = [...args];
    const index = nextArgs.indexOf(name);
    if (index === -1) nextArgs.push(name, value);
    else nextArgs[index + 1] = value;
    return nextArgs;
  }

  function skillScopeForRuleScope(scope) {
    const parts = scope.split('/');
    return parts[0] === 'projects' && parts[1] ? `projects/${parts[1]}` : '.';
  }

  function ensureDirectory(dir) {
    fs.mkdirSync(dir, { recursive: true });
  }

  function copyDirectory(source, target) {
    fs.cpSync(source, target, { recursive: true });
  }

  function removePath(target) {
    fs.rmSync(target, { recursive: true, force: true });
  }

  function atomicWriteFile(file, content, encoding = 'utf8') {
    ensureDirectory(path.dirname(file));
    const temporary = path.join(path.dirname(file), `.${path.basename(file)}.buildr-tmp-${process.pid}-${crypto.randomUUID()}`);
    try {
      fs.writeFileSync(temporary, content, encoding);
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

  function atomicWriteJson(file, value) {
    atomicWriteFile(file, `${JSON.stringify(value, null, 2)}\n`);
  }

  function parseYamlDocument(content, label = 'YAML document') {
    let document;
    try {
      document = YAML.parseDocument(content, { uniqueKeys: true, prettyErrors: true });
    } catch (error) {
      throw new Error(`${label} is invalid YAML: ${error.message}`);
    }
    if (document.errors.length) throw new Error(`${label} is invalid YAML: ${document.errors.map((error) => error.message).join('; ')}`);
    const value = document.toJS({ mapAsMap: false });
    if (value === null || value === undefined) return {};
    if (typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be a YAML mapping.`);
    return value;
  }

  function mutationStateRoot(targetRoot) {
    return path.join(targetRoot, '.buildr', 'mutations');
  }

  function mutationLockPath(targetRoot) {
    return path.join(mutationStateRoot(targetRoot), 'lock.json');
  }

  function mutationRecoveryReceiptPath(targetRoot, transactionId) {
    return path.join(mutationStateRoot(targetRoot), `recovered-${transactionId}.json`);
  }

  function pathIsEqualOrInside(candidate, root) {
    const relative = path.relative(root, candidate);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  }

  function assertSafeAssetTarget(targetRoot, target, containerRoot, label = 'Managed asset target') {
    const resolvedTarget = path.resolve(target);
    const resolvedContainer = path.resolve(containerRoot);
    const relative = path.relative(resolvedContainer, resolvedTarget);
    if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error(`${label} must be a strict descendant of ${resolvedContainer}: ${resolvedTarget}`);
    }
    const protectedRoots = [targetRoot, productRoot(), process.cwd(), os.homedir(), path.parse(resolvedTarget).root].map((item) => path.resolve(item));
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

  function normalizedGitIdentity(value) {
    if (!value) return null;
    const trimmed = String(value).trim().replace(/\/$/, '').replace(/\.git$/, '');
    if (trimmed.startsWith('file://')) {
      try { return path.resolve(new URL(trimmed).pathname).replace(/\.git$/, ''); } catch {}
    }
    if (!isGitUrl(trimmed) && fs.existsSync(trimmed)) return path.resolve(trimmed).replace(/\.git$/, '');
    return trimmed;
  }

  function sameGitIdentity(left, right) {
    return normalizedGitIdentity(left) === normalizedGitIdentity(right);
  }

  function snapshotMutationPath(transactionRoot, targetRoot, target, index) {
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

  function removeMutationRestoreTarget(target) {
    if (!fs.existsSync(target)) return;
    const faultLimit = Number(process.env.BUILDR_FAULT_MUTATION_RESTORE_REMOVE || 0);
    if (faultLimit > injectedRestoreRemovalFaults) {
      injectedRestoreRemovalFaults += 1;
      const error = new Error(`Injected Buildr mutation restore removal failure for ${target}.`);
      error.code = 'EBUSY';
      throw error;
    }
    fs.rmSync(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    if (fs.existsSync(target)) throw new Error(`Mutation restore could not remove target: ${target}`);
  }

  function mutationPathFingerprint(target) {
    if (!fs.existsSync(target)) return null;
    const visit = (current, relative = '') => {
      const stat = fs.lstatSync(current);
      if (stat.isSymbolicLink()) return [{ path: relative, type: 'symlink', target: fs.readlinkSync(current) }];
      if (stat.isFile()) return [{ path: relative, type: 'file', integrity: crypto.createHash('sha256').update(fs.readFileSync(current)).digest('hex') }];
      if (!stat.isDirectory()) return [{ path: relative, type: 'other', mode: stat.mode }];
      const entries = [{ path: relative, type: 'directory' }];
      for (const name of fs.readdirSync(current).sort()) entries.push(...visit(path.join(current, name), relative ? `${relative}/${name}` : name));
      return entries;
    };
    return JSON.stringify(visit(target));
  }

  function restoreMutationSnapshot(snapshot) {
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

  let activeWorkspaceMutation = null;

  function withWorkspaceMutation(targetRoot, operation, affectedPaths, callback, options = {}) {
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
      let existing = {};
      try { existing = JSON.parse(fs.readFileSync(lockFile, 'utf8')); } catch {}
      throw new Error(`Workspace source mutation is blocked by incomplete transaction ${existing.transactionId || '<unknown>'} (${existing.operation || 'unknown operation'}). Run buildr doctor --target ${root} --json.`);
    }
    if (process.env.BUILDR_FAIL_IF_MUTATION_STARTED === '1' || process.env.BUILDR_FAIL_IF_MUTATION_STARTED === operation) {
      throw new Error(`Injected failure because workspace mutation started: ${operation}`);
    }
    const transactionId = `${Date.now()}-${process.pid}-${crypto.randomUUID()}`;
    const transactionRoot = path.join(mutationStateRoot(root), transactionId);
    ensureDirectory(transactionRoot);
    const record = { schemaVersion: 'buildr.mutation/v1', transactionId, operation, phase: 'preflight', affectedPaths: [...new Set(affectedPaths.map((item) => toPosixRelative(root, path.resolve(item))))], startedAt: new Date().toISOString() };
    try {
      fs.writeFileSync(lockFile, `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
    } catch (error) {
      fs.rmSync(transactionRoot, { recursive: true, force: true });
      throw new Error(`Cannot acquire workspace mutation lock: ${error.message}`);
    }
    let snapshots;
    try {
      if (options.preSnapshot) options.preSnapshot({ targetRoot: root, transactionId, transactionRoot, record });
      snapshots = [...new Set(affectedPaths.map((item) => path.resolve(item)))].map((item, index) => snapshotMutationPath(transactionRoot, root, item, index));
    } catch (error) {
      fs.rmSync(transactionRoot, { recursive: true, force: true });
      fs.rmSync(lockFile, { force: true });
      throw error;
    }
    const journalSnapshots = snapshots.map(({ target, relative, existed }, index) => ({ index, target, relative, existed }));
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
    } catch (error) {
      record.phase = 'rollback';
      try {
        for (const snapshot of [...snapshots].reverse()) restoreMutationSnapshot(snapshot);
        record.phase = 'rolled-back';
        atomicWriteJson(path.join(transactionRoot, 'journal.json'), { ...record, snapshots: journalSnapshots });
        fs.rmSync(transactionRoot, { recursive: true, force: true });
        fs.rmSync(lockFile, { force: true });
      } catch (rollbackError) {
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

  function productRoot() {
    return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  }

  function packageRoot() {
    return path.join(productRoot(), 'package');
  }

  function packageWorkspaceTargetRoot() {
    return path.join(productRoot(), PACKAGE_WORKSPACE_TARGET);
  }

  function packageBootstrapContractPath() {
    return path.join(productRoot(), PACKAGE_BOOTSTRAP_CONTRACT);
  }

  function developmentWorkspaceRoot() {
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

  function renderTemplate(content, variables) {
    return content.replace(/\{\{([A-Za-z0-9_]+)\}\}/g, (_, key) => {
      if (variables[key] === undefined) {
        throw new Error(`Missing template variable: ${key}`);
      }
      return variables[key];
    });
  }

  function writeIfMissing(file, content) {
    if (fs.existsSync(file)) return false;
    atomicWriteFile(file, content);
    return true;
  }

  function writeMappedFileIfMissing(targetRoot, outputRoot, entry, variables, created) {
    const sourceFile = path.resolve(productRoot(), entry.source);
    const targetFile = path.join(outputRoot, entry.target);
    const sourceContent = fs.readFileSync(sourceFile, 'utf8');
    const content = entry.mode === 'render' ? renderTemplate(sourceContent, variables) : sourceContent;
    trackWrite(targetRoot, targetFile, content, created);
  }

  function appendGitignoreEntries(file, entries) {
    const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    const lines = new Set(existing.split(/\r?\n/).filter(Boolean));
    const missing = entries.filter((entry) => !lines.has(entry));
    if (missing.length === 0) return false;

    const prefix = existing && !existing.endsWith('\n') ? '\n' : '';
    atomicWriteFile(file, `${existing}${prefix}${missing.join('\n')}\n`);
    return true;
  }

  function hasFlag(args, name) {
    return args.includes(name);
  }

  function toPosixRelative(from, to) {
    const relative = path.relative(from, to).split(path.sep).join('/');
    return relative || '.';
  }

  function existsDirectory(dir) {
    return fs.existsSync(dir) && fs.statSync(dir).isDirectory();
  }

  function existsFile(file) {
    return fs.existsSync(file) && fs.statSync(file).isFile();
  }

  const BUILDR_REQUIRED_BLOCK_START = '<!-- buildr:required begin -->';
  const BUILDR_REQUIRED_BLOCK_END = '<!-- buildr:required end -->';
  const BUILDR_REQUIRED_BLOCK = [
    BUILDR_REQUIRED_BLOCK_START,
    '请读取并遵循 [Buildr Core](rules/buildr/core.md)。',
    BUILDR_REQUIRED_BLOCK_END,
    '',
  ].join('\n');

  function ensureRootRequiredBlock(targetRoot, changed = []) {
    const agentsPath = path.join(targetRoot, 'AGENTS.md');
    const existing = existsFile(agentsPath) ? fs.readFileSync(agentsPath, 'utf8') : '';
    let next;
    const start = existing.indexOf(BUILDR_REQUIRED_BLOCK_START);
    const end = existing.indexOf(BUILDR_REQUIRED_BLOCK_END);
    if (start !== -1 && end !== -1 && end > start) {
      const afterEnd = end + BUILDR_REQUIRED_BLOCK_END.length;
      next = `${existing.slice(0, start)}${BUILDR_REQUIRED_BLOCK.trimEnd()}${existing.slice(afterEnd)}`;
      if (!next.endsWith('\n')) next += '\n';
    } else {
      const suffix = existing.trim() ? `\n${existing.replace(/^\s+/, '')}` : '';
      next = `${BUILDR_REQUIRED_BLOCK}${suffix}`;
    }
    if (next !== existing) {
      atomicWriteFile(agentsPath, next, 'utf8');
      changed.push('AGENTS.md');
      return true;
    }
    return false;
  }

  function rootRequiredBlockStatus(targetRoot) {
    const agentsPath = path.join(targetRoot, 'AGENTS.md');
    if (!existsFile(agentsPath)) return { exists: false, valid: false, path: 'AGENTS.md' };
    const content = fs.readFileSync(agentsPath, 'utf8');
    const start = content.indexOf(BUILDR_REQUIRED_BLOCK_START);
    const end = content.indexOf(BUILDR_REQUIRED_BLOCK_END);
    const block = start !== -1 && end !== -1 && end > start
      ? content.slice(start, end + BUILDR_REQUIRED_BLOCK_END.length)
      : '';
    return {
      exists: true,
      valid: block.includes('rules/buildr/core.md'),
      path: 'AGENTS.md',
    };
  }

  function writeFileIfChanged(file, content) {
    if (existsFile(file) && fs.readFileSync(file, 'utf8') === content) return false;
    atomicWriteFile(file, content, 'utf8');
    return true;
  }

  function copyFileIfChanged(sourceFile, targetFile) {
    return writeFileIfChanged(targetFile, fs.readFileSync(sourceFile, 'utf8'));
  }

  function copyDirectoryIfChanged(sourceDir, targetDir) {
    let changed = false;
    for (const sourceFile of collectFiles(sourceDir)) {
      const relative = path.relative(sourceDir, sourceFile);
      const targetFile = path.join(targetDir, relative);
      if (copyFileIfChanged(sourceFile, targetFile)) changed = true;
    }
    return changed;
  }

  function buildrWorkspaceIdentity(targetRoot) {
    const assets = {
      agentsFile: existsFile(path.join(targetRoot, 'AGENTS.md')),
      metadataFile: existsFile(path.join(targetRoot, '.buildr', 'workspace.yml')),
      rootOrganization: existsDirectory(path.join(targetRoot, 'projects')),
    };
    const required = ['AGENTS.md', '.buildr/workspace.yml', 'projects'];
    const missing = [
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

  function isInitializedBuildrWorkspace(targetRoot) {
    return buildrWorkspaceIdentity(targetRoot).state === 'valid';
  }

  function assertInitializedBuildrWorkspace(targetRoot) {
    if (!isInitializedBuildrWorkspace(targetRoot)) {
      throw new Error(`Target is not an initialized Buildr workspace: ${targetRoot}. 请先运行 buildr init。`);
    }
  }

  function addDoctorFinding(result, status, code, message, extra = {}) {
    result.findings.push({ status, code, message, ...extra });
  }

  Object.assign(runtime, { optionValue, optionValueRaw, withResolvedTarget, withOption, skillScopeForRuleScope, ensureDirectory, copyDirectory, removePath, atomicWriteFile, atomicWriteJson, parseYamlDocument, mutationStateRoot, mutationLockPath, mutationRecoveryReceiptPath, pathIsEqualOrInside, assertSafeAssetTarget, normalizedGitIdentity, sameGitIdentity, snapshotMutationPath, removeMutationRestoreTarget, mutationPathFingerprint, restoreMutationSnapshot, withWorkspaceMutation, productRoot, packageRoot, packageWorkspaceTargetRoot, packageBootstrapContractPath, developmentWorkspaceRoot, renderTemplate, writeIfMissing, writeMappedFileIfMissing, appendGitignoreEntries, hasFlag, toPosixRelative, existsDirectory, existsFile, ensureRootRequiredBlock, rootRequiredBlockStatus, writeFileIfChanged, copyFileIfChanged, copyDirectoryIfChanged, buildrWorkspaceIdentity, isInitializedBuildrWorkspace, assertInitializedBuildrWorkspace, addDoctorFinding });
  return runtime;
}
