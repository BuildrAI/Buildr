import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { atomicWriteJson } from '../../src/infrastructure/filesystem/atomic-files.ts';
import { createWorkspaceMutation } from '../../src/infrastructure/filesystem/workspace-mutation.ts';
import { workspaceSymlinkSegment } from '../../src/infrastructure/filesystem/workspace-path.ts';
import { registerWorkspaceOperations } from '../../src/modules/workspace/application/workspace-operations.ts';

function fixture(t: TestContext) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-mutation-recovery-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const root = path.join(base, 'workspace');
  const outside = path.join(base, 'outside');
  fs.mkdirSync(root);
  fs.mkdirSync(outside);
  const existsFile = (file: string) => fs.statSync(file, { throwIfNoEntry: false })?.isFile() === true;
  const api = createWorkspaceMutation({
    ensureDirectory: directory => fs.mkdirSync(directory, { recursive: true }),
    existsFile,
    toPosixRelative: (from, to) => path.relative(from, to).split(path.sep).join('/'),
    workspaceSymlinkSegment,
  });
  const runtime: any = { ...api, existsFile, atomicWriteJson, assertName: (id: string) => assert.match(id, /^[a-zA-Z0-9_-]+$/), projectRepository: {}, workspaceRepository: {} };
  registerWorkspaceOperations(runtime);
  const file = (relative: string, content: string) => {
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
    return target;
  };
  const journal = (targets: string[], id = 'recovery') => {
    const transactionRoot = path.join(api.mutationStateRoot(root), id);
    fs.mkdirSync(transactionRoot, { recursive: true });
    const snapshots = targets.map((target, index) => api.snapshotMutationPath(transactionRoot, root, target, index));
    const record = { schemaVersion: 'buildr.mutation/v1', transactionId: id, operation: 'test', phase: 'rollback-failed', snapshots: snapshots.map(({ target, relative, existed }, index) => ({ index, target, relative, existed })) };
    atomicWriteJson(path.join(transactionRoot, 'journal.json'), record);
    atomicWriteJson(api.mutationLockPath(root), { transactionId: id });
    return { id, transactionRoot, snapshots, record };
  };
  return { base, root, outside, api, runtime, file, journal };
}

test('manual recovery restores files, directories and absent targets, then becomes a no-op', t => {
  const f = fixture(t);
  const a = f.file('assets/a.txt', 'original');
  const b = f.file('directory/nested/b.txt', 'nested');
  const fresh = path.join(f.root, 'new.txt');
  const tx = f.journal([a, path.dirname(path.dirname(b)), fresh]);
  fs.writeFileSync(a, 'changed');
  fs.writeFileSync(b, 'changed');
  fs.writeFileSync(fresh, 'new');
  assert.deepEqual(f.runtime.recoverWorkspaceMutation({ id: tx.id, targetRoot: f.root }), { id: tx.id, alreadyRecovered: false });
  assert.equal(fs.readFileSync(a, 'utf8'), 'original');
  assert.equal(fs.readFileSync(b, 'utf8'), 'nested');
  assert.equal(fs.existsSync(fresh), false);
  assert.equal(fs.existsSync(tx.transactionRoot), false);
  assert.equal(fs.existsSync(f.api.mutationLockPath(f.root)), false);
  fs.writeFileSync(a, 'after recovery');
  assert.equal(f.runtime.recoverWorkspaceMutation({ id: tx.id, targetRoot: f.root }).alreadyRecovered, true);
  assert.equal(fs.readFileSync(a, 'utf8'), 'after recovery');
});

for (const linkKind of ['ancestor', 'target', 'dangling-target'] as const) {
  test(`manual recovery refuses ${linkKind} links before restoring any target`, t => {
    const f = fixture(t);
    const unsafe = f.file('assets/a.txt', 'original');
    const safe = f.file('safe.txt', 'original safe');
    const tx = f.journal([unsafe, safe]);
    fs.writeFileSync(safe, 'keep current safe');
    const sentinel = path.join(f.outside, 'a.txt');
    fs.writeFileSync(sentinel, 'outside sentinel');
    if (linkKind === 'ancestor') {
      fs.rmSync(path.dirname(unsafe), { recursive: true });
      fs.symlinkSync(f.outside, path.dirname(unsafe), 'junction');
    } else {
      fs.unlinkSync(unsafe);
      fs.symlinkSync(linkKind === 'target' ? sentinel : path.join(f.outside, 'missing'), unsafe);
    }
    assert.throws(() => f.runtime.recoverWorkspaceMutation({ id: tx.id, targetRoot: f.root }), /symbolic link/);
    assert.equal(fs.readFileSync(sentinel, 'utf8'), 'outside sentinel');
    assert.equal(fs.readFileSync(safe, 'utf8'), 'keep current safe');
    assert.equal(fs.existsSync(tx.transactionRoot), true);
    assert.equal(fs.existsSync(f.api.mutationLockPath(f.root)), true);
    assert.equal(fs.existsSync(f.api.mutationRecoveryReceiptPath(f.root, tx.id)), false);
  });
}

for (const corrupt of ['missing', 'backup-link', 'backup-parent-link', 'invalid-index', 'control-target'] as const) {
  test(`recovery preflights every backup and rejects ${corrupt} without deleting targets`, t => {
    const f = fixture(t);
    const a = f.file('a.txt', 'original a');
    const b = f.file('b.txt', 'original b');
    const tx = f.journal([a, b]);
    fs.writeFileSync(a, 'current a');
    fs.writeFileSync(b, 'current b');
    const backup = tx.snapshots[0].backup;
    const sentinel = path.join(f.outside, 'original.txt');
    fs.writeFileSync(sentinel, 'outside sentinel');
    if (corrupt === 'missing') fs.unlinkSync(backup);
    if (corrupt === 'backup-link') { fs.unlinkSync(backup); fs.symlinkSync(sentinel, backup); }
    if (corrupt === 'backup-parent-link') {
      fs.renameSync(path.dirname(backup), path.join(f.outside, 'backup'));
      fs.symlinkSync(path.join(f.outside, 'backup'), path.dirname(backup), 'junction');
    }
    if (corrupt === 'invalid-index') tx.record.snapshots[0].index = '../outside' as any;
    if (corrupt === 'control-target') tx.record.snapshots[0].target = path.join(f.root, '.buildr');
    atomicWriteJson(path.join(tx.transactionRoot, 'journal.json'), tx.record);
    assert.throws(() => f.runtime.recoverWorkspaceMutation({ id: tx.id, targetRoot: f.root }), /Mutation/);
    assert.equal(fs.readFileSync(a, 'utf8'), 'current a');
    assert.equal(fs.readFileSync(b, 'utf8'), 'current b');
    assert.equal(fs.readFileSync(sentinel, 'utf8'), 'outside sentinel');
    assert.equal(fs.existsSync(path.join(tx.transactionRoot, 'journal.json')), true);
    assert.equal(fs.existsSync(f.api.mutationLockPath(f.root)), true);
  });
}

for (const control of ['workspace', 'state', 'transaction', 'journal', 'lock', 'receipt'] as const) {
  test(`manual recovery refuses linked ${control} control paths`, t => {
    const f = fixture(t);
    const a = f.file('a.txt', 'original');
    const tx = f.journal([a]);
    fs.writeFileSync(a, 'current');
    const source = control === 'workspace' ? f.root : control === 'state' ? f.api.mutationStateRoot(f.root) : control === 'transaction' ? tx.transactionRoot : control === 'journal' ? path.join(tx.transactionRoot, 'journal.json') : control === 'lock' ? f.api.mutationLockPath(f.root) : f.api.mutationRecoveryReceiptPath(f.root, tx.id);
    const displaced = path.join(f.outside, 'displaced');
    if (control === 'receipt') fs.writeFileSync(displaced, 'receipt sentinel');
    else fs.renameSync(source, displaced);
    fs.symlinkSync(displaced, source, ['workspace', 'state', 'transaction'].includes(control) ? 'junction' : 'file');
    assert.throws(() => f.runtime.recoverWorkspaceMutation({ id: tx.id, targetRoot: f.root }), /unsafe|symbolic link/);
    assert.equal(fs.readFileSync(a, 'utf8'), 'current');
    assert.equal(fs.lstatSync(source).isSymbolicLink(), true);
  });
}

test('restore rechecks target ancestors and backup contents after plan preflight', t => {
  const f = fixture(t);
  const a = f.file('assets/a.txt', 'original');
  const tx = f.journal([a]);
  fs.writeFileSync(a, 'current');
  const plan = f.api.prepareMutationRestore(f.root, tx.transactionRoot, tx.record.snapshots);
  fs.writeFileSync(tx.snapshots[0].backup, 'changed backup');
  assert.throws(() => f.api.restoreMutationSnapshot(plan[0]), /backup changed/);
  assert.equal(fs.readFileSync(a, 'utf8'), 'current');
  fs.writeFileSync(tx.snapshots[0].backup, 'original');
  const sentinel = path.join(f.outside, 'a.txt');
  fs.writeFileSync(sentinel, 'outside sentinel');
  fs.rmSync(path.dirname(a), { recursive: true });
  fs.symlinkSync(f.outside, path.dirname(a), 'junction');
  assert.throws(() => f.api.restoreMutationSnapshot(plan[0]), /symbolic link/);
  assert.equal(fs.readFileSync(sentinel, 'utf8'), 'outside sentinel');
});

test('failed manual recovery retains backups for retry and matching lock cleanup is repeatable', t => {
  const f = fixture(t);
  const a = f.file('a.txt', 'original');
  const tx = f.journal([a]);
  fs.writeFileSync(a, 'current');
  const previous = process.env.BUILDR_FAULT_MUTATION_RESTORE_REMOVE;
  process.env.BUILDR_FAULT_MUTATION_RESTORE_REMOVE = '1';
  try { assert.throws(() => f.runtime.recoverWorkspaceMutation({ id: tx.id, targetRoot: f.root }), /Injected/); }
  finally { if (previous === undefined) delete process.env.BUILDR_FAULT_MUTATION_RESTORE_REMOVE; else process.env.BUILDR_FAULT_MUTATION_RESTORE_REMOVE = previous; }
  assert.equal(fs.readFileSync(a, 'utf8'), 'current');
  assert.equal(fs.readFileSync(tx.snapshots[0].backup, 'utf8'), 'original');
  assert.equal(fs.existsSync(f.api.mutationLockPath(f.root)), true);
  f.runtime.recoverWorkspaceMutation({ id: tx.id, targetRoot: f.root });
  assert.equal(fs.readFileSync(a, 'utf8'), 'original');
  atomicWriteJson(f.api.mutationLockPath(f.root), { transactionId: tx.id });
  assert.equal(f.runtime.recoverWorkspaceMutation({ id: tx.id, targetRoot: f.root }).alreadyRecovered, true);
  assert.equal(fs.existsSync(f.api.mutationLockPath(f.root)), false);
});

test('automatic rollback restores the original file and clears its transaction', t => {
  const f = fixture(t);
  const a = f.file('a.txt', 'original');
  assert.throws(() => f.api.withWorkspaceMutation(f.root, 'test', [a], () => {
    fs.writeFileSync(a, 'changed');
    throw new Error('failed action');
  }), /failed action/);
  assert.equal(fs.readFileSync(a, 'utf8'), 'original');
  assert.deepEqual(fs.readdirSync(f.api.mutationStateRoot(f.root)), []);
});

test('automatic rollback preflights the entire plan when an ancestor became a link', t => {
  const f = fixture(t);
  const unsafe = f.file('assets/a.txt', 'original');
  const safe = f.file('safe.txt', 'original safe');
  const sentinel = path.join(f.outside, 'a.txt');
  fs.writeFileSync(sentinel, 'outside sentinel');
  assert.throws(() => f.api.withWorkspaceMutation(f.root, 'test', [unsafe, safe], () => {
    fs.writeFileSync(safe, 'current safe');
    fs.rmSync(path.dirname(unsafe), { recursive: true });
    fs.symlinkSync(f.outside, path.dirname(unsafe), 'junction');
    throw new Error('failed action');
  }), /Rollback failed:.*symbolic link/);
  assert.equal(fs.readFileSync(sentinel, 'utf8'), 'outside sentinel');
  assert.equal(fs.readFileSync(safe, 'utf8'), 'current safe');
  const lock = JSON.parse(fs.readFileSync(f.api.mutationLockPath(f.root), 'utf8'));
  const transactionRoot = path.join(f.api.mutationStateRoot(f.root), lock.transactionId);
  assert.equal(JSON.parse(fs.readFileSync(path.join(transactionRoot, 'journal.json'), 'utf8')).phase, 'rollback-failed');
  assert.equal(fs.readFileSync(path.join(transactionRoot, 'backup/0'), 'utf8'), 'original');
  fs.unlinkSync(path.dirname(unsafe));
  f.runtime.recoverWorkspaceMutation({ id: lock.transactionId, targetRoot: f.root });
  assert.equal(fs.readFileSync(unsafe, 'utf8'), 'original');
  assert.equal(fs.readFileSync(safe, 'utf8'), 'original safe');
});

test('partially restored recovery retries from the retained complete backup', t => {
  const f = fixture(t);
  const a = f.file('a.txt', 'original a');
  const b = f.file('b.txt', 'original b');
  const tx = f.journal([a, b]);
  fs.writeFileSync(a, 'current a');
  fs.writeFileSync(b, 'current b');
  let calls = 0;
  f.runtime.restoreMutationSnapshot = (snapshot: any) => {
    if (++calls === 2) throw new Error('second restore failed');
    f.api.restoreMutationSnapshot(snapshot);
  };
  assert.throws(() => f.runtime.recoverWorkspaceMutation({ id: tx.id, targetRoot: f.root }), /second restore failed/);
  assert.equal(fs.readFileSync(a, 'utf8'), 'current a');
  assert.equal(fs.readFileSync(b, 'utf8'), 'original b');
  assert.equal(fs.existsSync(tx.snapshots[0].backup), true);
  assert.equal(fs.existsSync(tx.snapshots[1].backup), true);
  assert.equal(fs.existsSync(f.api.mutationLockPath(f.root)), true);
  f.runtime.restoreMutationSnapshot = f.api.restoreMutationSnapshot;
  f.runtime.recoverWorkspaceMutation({ id: tx.id, targetRoot: f.root });
  assert.equal(fs.readFileSync(a, 'utf8'), 'original a');
  assert.equal(fs.readFileSync(b, 'utf8'), 'original b');
});

test('restore refuses a replaced workspace identity after preflight', t => {
  const f = fixture(t);
  const a = f.file('a.txt', 'original');
  const tx = f.journal([a]);
  const plan = f.api.prepareMutationRestore(f.root, tx.transactionRoot, tx.record.snapshots);
  fs.renameSync(f.root, path.join(f.outside, 'old-workspace'));
  fs.mkdirSync(f.root);
  fs.writeFileSync(a, 'replacement workspace');
  assert.throws(() => f.api.restoreMutationSnapshot(plan[0]), /workspace root changed/);
  assert.equal(fs.readFileSync(a, 'utf8'), 'replacement workspace');
});

test('automatic rollback does not write diagnostic journals through a redirected state directory', t => {
  const f = fixture(t);
  const a = f.file('a.txt', 'original');
  let previousJournal = '';
  let journalFile = '';
  assert.throws(() => f.api.withWorkspaceMutation(f.root, 'test', [a], (mutation: any) => {
    journalFile = path.join(f.outside, 'mutations', mutation.transactionId, 'journal.json');
    previousJournal = fs.readFileSync(path.join(mutation.transactionRoot, 'journal.json'), 'utf8');
    fs.renameSync(f.api.mutationStateRoot(f.root), path.join(f.outside, 'mutations'));
    fs.symlinkSync(path.join(f.outside, 'mutations'), f.api.mutationStateRoot(f.root), 'junction');
    throw new Error('failed action');
  }), /symbolic link/);
  assert.equal(fs.readFileSync(journalFile, 'utf8'), previousJournal);
  assert.equal(fs.existsSync(path.join(path.dirname(journalFile), 'backup/0')), true);
  assert.equal(fs.existsSync(path.join(f.outside, 'mutations/lock.json')), true);
});

test('automatic rollback preserves current targets when a backup has disappeared', t => {
  const f = fixture(t);
  const a = f.file('a.txt', 'original');
  assert.throws(() => f.api.withWorkspaceMutation(f.root, 'test', [a], (mutation: any) => {
    fs.writeFileSync(a, 'current');
    fs.unlinkSync(path.join(mutation.transactionRoot, 'backup/0'));
    throw new Error('failed action');
  }), /Rollback failed: Mutation backup is missing/);
  assert.equal(fs.readFileSync(a, 'utf8'), 'current');
  assert.equal(fs.existsSync(f.api.mutationLockPath(f.root)), true);
});
