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

export function createWorkspaceMutation(dependencies: Dependencies) {
  let activeMutation: any = null;
  let injectedRestoreRemovalFaults = 0;

  const mutationStateRoot = (targetRoot: string) => path.join(targetRoot, '.buildr', 'mutations');
  const mutationLockPath = (targetRoot: string) => path.join(mutationStateRoot(targetRoot), 'lock.json');
  const mutationRecoveryReceiptPath = (targetRoot: string, transactionId: string) => path.join(mutationStateRoot(targetRoot), `recovered-${transactionId}.json`);

  function snapshotMutationPath(transactionRoot: string, targetRoot: string, target: string, index: number): any {
    const resolved = path.resolve(target);
    const relative = dependencies.toPosixRelative(targetRoot, resolved);
    const backup = path.join(transactionRoot, 'backup', String(index));
    const existed = fs.existsSync(resolved);
    if (existed) {
      dependencies.ensureDirectory(path.dirname(backup));
      fs.cpSync(resolved, backup, { recursive: true, preserveTimestamps: true });
    }
    return { target: resolved, relative, backup, existed };
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
      if (!stat.isDirectory()) return [{ path: relative, type: 'other', mode: stat.mode }];
      const entries: any[] = [{ path: relative, type: 'directory' }];
      for (const name of fs.readdirSync(current).sort()) entries.push(...visit(path.join(current, name), relative ? `${relative}/${name}` : name));
      return entries;
    };
    return JSON.stringify(visit(target));
  }

  function restoreMutationSnapshot(snapshot: any): void {
    removeMutationRestoreTarget(snapshot.target);
    if (snapshot.existed) {
      if (!fs.existsSync(snapshot.backup)) throw new Error(`Mutation backup is missing for ${snapshot.relative || snapshot.target}`);
      dependencies.ensureDirectory(path.dirname(snapshot.target));
      fs.cpSync(snapshot.backup, snapshot.target, { recursive: true, preserveTimestamps: true });
      if (mutationPathFingerprint(snapshot.target) !== mutationPathFingerprint(snapshot.backup)) throw new Error(`Mutation restore verification failed for ${snapshot.relative || snapshot.target}`);
    } else if (fs.existsSync(snapshot.target)) throw new Error(`Mutation restore expected target to remain absent: ${snapshot.relative || snapshot.target}`);
  }

  function withWorkspaceMutation(targetRoot: string, operation: string, affectedPaths: string[], callback: (mutation: any) => any, options: any = {}): any {
    const root = path.resolve(targetRoot);
    if (activeMutation?.targetRoot === root) return callback(activeMutation);
    for (const affectedPath of affectedPaths) {
      const resolved = path.resolve(affectedPath);
      const relative = path.relative(root, resolved);
      if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`Mutation target must stay inside workspace and cannot be the workspace root: ${resolved}`);
      const symlink = dependencies.workspaceSymlinkSegment(root, relative);
      if (symlink) throw new Error(`Mutation target crosses a symbolic link: ${symlink}`);
    }
    const lockFile = mutationLockPath(root);
    if (dependencies.existsFile(lockFile)) {
      let existing: any = {};
      try { existing = JSON.parse(fs.readFileSync(lockFile, 'utf8')); } catch {}
      throw new Error(`Workspace source mutation is blocked by incomplete transaction ${existing.transactionId || '<unknown>'} (${existing.operation || 'unknown operation'}). Run buildr doctor --target ${root} --json.`);
    }
    if (process.env.BUILDR_FAIL_IF_MUTATION_STARTED === '1' || process.env.BUILDR_FAIL_IF_MUTATION_STARTED === operation) throw new Error(`Injected failure because workspace mutation started: ${operation}`);
    const transactionId = `${Date.now()}-${process.pid}-${crypto.randomUUID()}`;
    const transactionRoot = path.join(mutationStateRoot(root), transactionId);
    dependencies.ensureDirectory(transactionRoot);
    const record: any = { schemaVersion: 'buildr.mutation/v1', transactionId, operation, phase: 'preflight', affectedPaths: [...new Set(affectedPaths.map((item) => dependencies.toPosixRelative(root, path.resolve(item))))], startedAt: new Date().toISOString() };
    try { fs.writeFileSync(lockFile, `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' }); }
    catch (error) {
      fs.rmSync(transactionRoot, { recursive: true, force: true });
      throw new Error(`Cannot acquire workspace mutation lock: ${error instanceof Error ? error.message : String(error)}`);
    }
    let snapshots: any[];
    try {
      options.preSnapshot?.({ targetRoot: root, transactionId, transactionRoot, record });
      snapshots = [...new Set(affectedPaths.map((item) => path.resolve(item)))].map((item, index) => snapshotMutationPath(transactionRoot, root, item, index));
    } catch (error) {
      fs.rmSync(transactionRoot, { recursive: true, force: true });
      fs.rmSync(lockFile, { force: true });
      throw error;
    }
    const journalSnapshots = snapshots.map(({ target, relative, existed }, index) => ({ index, target, relative, existed }));
    record.phase = 'commit';
    atomicWriteJson(path.join(transactionRoot, 'journal.json'), { ...record, snapshots: journalSnapshots });
    activeMutation = { targetRoot: root, transactionId, transactionRoot, record };
    setAtomicWriteMutationObserver(activeMutation);
    try {
      const result = callback(activeMutation);
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
        record.error = error instanceof Error ? error.message : String(error);
        record.rollbackError = rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
        atomicWriteJson(path.join(transactionRoot, 'journal.json'), { ...record, snapshots: journalSnapshots });
        throw new Error(`${record.error}\nRollback failed: ${record.rollbackError}. Run buildr doctor --target ${root} --json.`);
      }
      throw error;
    } finally {
      activeMutation = null;
      setAtomicWriteMutationObserver(null);
    }
  }

  return Object.freeze({ mutationStateRoot, mutationLockPath, mutationRecoveryReceiptPath, snapshotMutationPath, removeMutationRestoreTarget, mutationPathFingerprint, restoreMutationSnapshot, withWorkspaceMutation });
}
