import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { atomicWriteJson, setAtomicWriteMutationObserver } from './atomic-files.ts';

type Dependencies = {
  ensureDirectory(directory: string): void;
  existsFile(file: string): boolean;
  toPosixRelative(root: string, file: string): string;
  workspaceSymlinkSegment(root: string, relative: string): string | null;
};

// Paths above the workspace may have platform aliases (for example /var on macOS).
// Pin the real workspace identity, then reject links in every path we operate on.
export function createMutationPathGuard(targetRoot: string) {
  const root = path.resolve(targetRoot);
  const identity = fs.lstatSync(root);
  if (!identity.isDirectory() || identity.isSymbolicLink()) throw new Error(`Mutation workspace root is unsafe: ${root}`);
  const realRoot = fs.realpathSync(root);
  return (target: string, kind?: 'file' | 'directory') => {
    const currentRoot = fs.lstatSync(root);
    if (!currentRoot.isDirectory() || currentRoot.isSymbolicLink() || currentRoot.dev !== identity.dev || currentRoot.ino !== identity.ino || fs.realpathSync(root) !== realRoot) {
      throw new Error(`Mutation workspace root changed: ${root}`);
    }
    const resolved = path.resolve(target);
    const relative = path.relative(root, resolved);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error(`Mutation path escapes workspace: ${target}`);
    let current = root;
    const segments = relative ? relative.split(path.sep) : [];
    for (const [index, segment] of segments.entries()) {
      current = path.join(current, segment);
      const stat = fs.lstatSync(current, { throwIfNoEntry: false });
      if (!stat) return;
      if (stat.isSymbolicLink()) throw new Error(`Mutation path crosses a symbolic link: ${current}`);
      const terminal = index === segments.length - 1;
      if ((!terminal || kind === 'directory') && !stat.isDirectory()) throw new Error(`Mutation path must be a directory: ${current}`);
      if (terminal && (kind === 'file' ? !stat.isFile() : !stat.isDirectory() && !stat.isFile())) throw new Error(`Mutation path has an unsafe file type: ${current}`);
    }
  };
}

export function createWorkspaceMutation(dependencies: Dependencies) {
  let activeMutation: any = null;
  let injectedRestoreRemovalFaults = 0;

  const mutationStateRoot = (targetRoot: string) => path.join(targetRoot, '.buildr', 'mutations');
  const mutationLockPath = (targetRoot: string) => path.join(mutationStateRoot(targetRoot), 'lock.json');
  const mutationRecoveryReceiptPath = (targetRoot: string, transactionId: string) => path.join(mutationStateRoot(targetRoot), `recovered-${transactionId}.json`);

  function snapshotMutationPath(transactionRoot: string, targetRoot: string, target: string, index: number, assertPath = createMutationPathGuard(targetRoot)): any {
    const resolved = path.resolve(target);
    const relative = dependencies.toPosixRelative(targetRoot, resolved);
    const backup = path.join(transactionRoot, 'backup', String(index));
    assertPath(resolved);
    assertPath(backup);
    const existed = fs.existsSync(resolved);
    if (existed) {
      dependencies.ensureDirectory(path.dirname(backup));
      assertPath(resolved);
      assertPath(backup);
      fs.cpSync(resolved, backup, { recursive: true, preserveTimestamps: true, dereference: false, verbatimSymlinks: true });
    }
    return { index, target: resolved, relative, backup, existed };
  }

  function removeMutationRestoreTarget(target: string): void {
    if (!fs.existsSync(target)) return;
    const faultLimit = Number(process.env.BUILDR_FAULT_MUTATION_RESTORE_REMOVE || 0);
    if (faultLimit > injectedRestoreRemovalFaults) {
      injectedRestoreRemovalFaults += 1;
      const error: Error & { code?: string } = new Error(`Injected Buildr mutation restore removal failure for ${target}.`);
      error.code = 'EBUSY';
      throw error;
    }
    fs.rmSync(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
    if (fs.existsSync(target)) throw new Error(`Mutation restore could not remove target: ${target}`);
  }

  function mutationPathFingerprint(target: string): string | null {
    if (!fs.existsSync(target)) return null;
    const visit = (current: string, relative = ''): any[] => {
      const stat = fs.lstatSync(current);
      if (stat.isSymbolicLink()) return [{ path: relative, type: 'symlink', target: fs.readlinkSync(current) }];
      if (stat.isFile()) return [{ path: relative, type: 'file', integrity: crypto.createHash('sha256').update(fs.readFileSync(current)).digest('hex') }];
      if (!stat.isDirectory()) throw new Error(`Mutation snapshot has an unsafe file type: ${current}`);
      const entries: any[] = [{ path: relative, type: 'directory' }];
      for (const name of fs.readdirSync(current).sort()) entries.push(...visit(path.join(current, name), relative ? `${relative}/${name}` : name));
      return entries;
    };
    return JSON.stringify(visit(target));
  }

  function prepareMutationRestore(targetRoot: string, transactionRoot: string, snapshots: any[], assertPath = createMutationPathGuard(targetRoot)): any[] {
    const root = path.resolve(targetRoot);
    const stateRoot = mutationStateRoot(root);
    if (path.dirname(path.resolve(transactionRoot)) !== stateRoot) throw new Error(`Mutation transaction root is unsafe: ${transactionRoot}`);
    const targets = new Set<string>();
    const indexes = new Set<number>();
    const plan = snapshots.map((snapshot) => {
      if (!snapshot || typeof snapshot.target !== 'string' || !path.isAbsolute(snapshot.target) || typeof snapshot.existed !== 'boolean' || !Number.isSafeInteger(snapshot.index) || snapshot.index < 0) throw new Error('Mutation recovery snapshot is invalid.');
      const target = path.resolve(snapshot.target);
      const relative = path.relative(root, target);
      const relativeState = path.relative(target, stateRoot);
      if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative) || target === stateRoot || target.startsWith(`${stateRoot}${path.sep}`) || (!relativeState.startsWith(`..${path.sep}`) && relativeState !== '..' && !path.isAbsolute(relativeState))) throw new Error(`Mutation recovery target is unsafe: ${target}`);
      if (targets.has(target) || indexes.has(snapshot.index)) throw new Error('Mutation recovery snapshot is duplicated.');
      targets.add(target);
      indexes.add(snapshot.index);
      const backup = path.join(transactionRoot, 'backup', String(snapshot.index));
      let fingerprint: string | null;
      const assertSafe = () => {
        assertPath(transactionRoot, 'directory');
        assertPath(path.join(transactionRoot, 'journal.json'), 'file');
        assertPath(target);
        assertPath(backup);
        if (snapshot.existed) {
          const current = mutationPathFingerprint(backup);
          if (current === null) throw new Error(`Mutation backup is missing for ${relative}`);
          if (fingerprint !== undefined && current !== fingerprint) throw new Error(`Mutation backup changed for ${relative}`);
          fingerprint = current;
        }
      };
      assertSafe();
      return { target, relative, backup, existed: snapshot.existed, assertSafe };
    });
    return plan;
  }

  function restoreMutationSnapshot(snapshot: any): void {
    if (typeof snapshot.assertSafe !== 'function') throw new Error('Mutation restore requires a preflighted recovery plan.');
    snapshot.assertSafe();
    removeMutationRestoreTarget(snapshot.target);
    if (snapshot.existed) {
      snapshot.assertSafe();
      dependencies.ensureDirectory(path.dirname(snapshot.target));
      snapshot.assertSafe();
      fs.cpSync(snapshot.backup, snapshot.target, { recursive: true, preserveTimestamps: true, dereference: false, verbatimSymlinks: true });
      snapshot.assertSafe();
      if (mutationPathFingerprint(snapshot.target) !== mutationPathFingerprint(snapshot.backup)) throw new Error(`Mutation restore verification failed for ${snapshot.relative || snapshot.target}`);
    } else if (fs.existsSync(snapshot.target)) throw new Error(`Mutation restore expected target to remain absent: ${snapshot.relative || snapshot.target}`);
  }

  function withWorkspaceMutation(targetRoot: string, operation: string, affectedPaths: string[], callback: (mutation: any) => any, options: any = {}): any {
    const root = path.resolve(targetRoot);
    if (activeMutation?.targetRoot === root) return callback(activeMutation);
    const assertPath = createMutationPathGuard(root);
    assertPath(mutationStateRoot(root), 'directory');
    for (const affectedPath of affectedPaths) {
      const resolved = path.resolve(affectedPath);
      const relative = path.relative(root, resolved);
      if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`Mutation target must stay inside workspace and cannot be the workspace root: ${resolved}`);
      const symlink = dependencies.workspaceSymlinkSegment(root, relative);
      if (symlink) throw new Error(`Mutation target crosses a symbolic link: ${symlink}`);
      assertPath(resolved);
    }
    const lockFile = mutationLockPath(root);
    assertPath(lockFile, 'file');
    if (dependencies.existsFile(lockFile)) {
      let existing: any = {};
      try { existing = JSON.parse(fs.readFileSync(lockFile, 'utf8')); } catch {}
      throw new Error(`Workspace source mutation is blocked by incomplete transaction ${existing.transactionId || '<unknown>'} (${existing.operation || 'unknown operation'}). Run buildr doctor --target ${root} --json.`);
    }
    if (process.env.BUILDR_FAIL_IF_MUTATION_STARTED === '1' || process.env.BUILDR_FAIL_IF_MUTATION_STARTED === operation) throw new Error(`Injected failure because workspace mutation started: ${operation}`);
    const transactionId = `${Date.now()}-${process.pid}-${crypto.randomUUID()}`;
    const transactionRoot = path.join(mutationStateRoot(root), transactionId);
    const assertControlPaths = () => {
      assertPath(transactionRoot, 'directory');
      assertPath(path.join(transactionRoot, 'journal.json'), 'file');
      assertPath(lockFile, 'file');
    };
    assertControlPaths();
    dependencies.ensureDirectory(transactionRoot);
    const record: any = { schemaVersion: 'buildr.mutation/v1', transactionId, operation, phase: 'preflight', affectedPaths: [...new Set(affectedPaths.map((item) => dependencies.toPosixRelative(root, path.resolve(item))))], startedAt: new Date().toISOString() };
    try { assertControlPaths(); fs.writeFileSync(lockFile, `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' }); }
    catch (error) {
      assertControlPaths();
      fs.rmSync(transactionRoot, { recursive: true, force: true });
      throw new Error(`Cannot acquire workspace mutation lock: ${error instanceof Error ? error.message : String(error)}`);
    }
    let snapshots: any[];
    try {
      options.preSnapshot?.({ targetRoot: root, transactionId, transactionRoot, record });
      snapshots = [...new Set(affectedPaths.map((item) => path.resolve(item)))].map((item, index) => snapshotMutationPath(transactionRoot, root, item, index, assertPath));
    } catch (error) {
      assertControlPaths();
      fs.rmSync(transactionRoot, { recursive: true, force: true });
      fs.rmSync(lockFile, { force: true });
      throw error;
    }
    const journalSnapshots = snapshots.map(({ target, relative, existed }, index) => ({ index, target, relative, existed }));
    record.phase = 'commit';
    assertControlPaths();
    atomicWriteJson(path.join(transactionRoot, 'journal.json'), { ...record, snapshots: journalSnapshots });
    activeMutation = { targetRoot: root, transactionId, transactionRoot, record };
    setAtomicWriteMutationObserver(activeMutation);
    try {
      const result = callback(activeMutation);
      record.phase = 'committed';
      assertControlPaths();
      atomicWriteJson(path.join(transactionRoot, 'journal.json'), { ...record, snapshots: journalSnapshots });
      assertControlPaths();
      fs.rmSync(transactionRoot, { recursive: true, force: true });
      assertControlPaths();
      fs.rmSync(lockFile, { force: true });
      return result;
    } catch (error) {
      record.phase = 'rollback';
      try {
        assertControlPaths();
        const plan = prepareMutationRestore(root, transactionRoot, [...snapshots].reverse(), assertPath);
        for (const snapshot of plan) restoreMutationSnapshot(snapshot);
        record.phase = 'rolled-back';
        assertControlPaths();
        atomicWriteJson(path.join(transactionRoot, 'journal.json'), { ...record, snapshots: journalSnapshots });
        assertControlPaths();
        fs.rmSync(transactionRoot, { recursive: true, force: true });
        assertControlPaths();
        fs.rmSync(lockFile, { force: true });
      } catch (rollbackError) {
        record.phase = 'rollback-failed';
        record.error = error instanceof Error ? error.message : String(error);
        record.rollbackError = rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
        assertControlPaths();
        atomicWriteJson(path.join(transactionRoot, 'journal.json'), { ...record, snapshots: journalSnapshots });
        throw new Error(`${record.error}\nRollback failed: ${record.rollbackError}. Run buildr doctor --target ${root} --json.`);
      }
      throw error;
    } finally {
      activeMutation = null;
      setAtomicWriteMutationObserver(null);
    }
  }

  return Object.freeze({ mutationStateRoot, mutationLockPath, mutationRecoveryReceiptPath, snapshotMutationPath, removeMutationRestoreTarget, mutationPathFingerprint, prepareMutationRestore, restoreMutationSnapshot, withWorkspaceMutation });
}
