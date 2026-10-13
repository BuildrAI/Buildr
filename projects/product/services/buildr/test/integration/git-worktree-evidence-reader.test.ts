import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import childProcess, { execFileSync } from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { registerGitWorktreeProvider } from '../../src/modules/task/infrastructure/git-worktree-provider.ts';
import { readSourceControlTaskAssociations } from '../../src/modules/code/infrastructure/code-worktree-catalog.ts';

function fixture(t: test.TestContext) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-evidence-reader-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const git = (directory: string, ...args: string[]) => execFileSync('git', ['--no-optional-locks', '-C', directory, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const repository = (relative: string) => { const directory = path.join(root, relative); fs.mkdirSync(directory, { recursive: true }); git(directory, 'init', '--initial-branch=main'); return directory; };
  repository('.'); const service = repository('repositories/service');
  const services: Record<string, { source: { type: string; path: string } }> = { one: { source: { type: 'git', path: 'repositories/service' } }, two: { source: { type: 'git', path: 'repositories/service' } } };
  let discoveries = 0;
  const provider = registerGitWorktreeProvider({
    assertCanonicalTaskWorkspace: directory => fs.realpathSync(directory),
    readProjectRegistryRecord: () => { discoveries++; return { registry: { migrationRequired: false }, projects: { demo: { source: { type: 'workspace', path: '.' } } } }; },
    readServiceRegistryRecord: () => ({ services }), sameGitIdentity: (left, right) => left === right,
    atomicWriteJson: (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value)); },
    removePath: file => fs.rmSync(file, { force: true }),
  });
  function evidence(taskId: string, checkoutPath = path.join(root, taskId), extraSource?: string) {
    const member = (sourceRepository: string, selector: string, sourcePath: string) => ({ selector, entityType: selector === 'workspace' ? 'workspace' as const : 'service' as const, sourcePath, sourceRepository, checkoutPath, branch: taskId, startPoint: '0'.repeat(40), head: null, clean: true, registered: true, state: 'ready' as const, diagnostic: null, remote: null, remoteUrl: null });
    return { schemaVersion: 'buildr.git-worktree-evidence/v1' as const, taskId, workspaceRoot: root, branch: taskId, planDigest: 'sha256-' + '0'.repeat(64), status: 'ready' as const, repositories: [member(root, 'workspace', '.'), ...(extraSource ? [member(extraSource, 'service:demo/service', path.relative(root, extraSource))] : [])], effects: [], updatedAt: new Date().toISOString() };
  }
  const write = (taskId: string, checkoutPath?: string, extraSource?: string) => provider.writeGitWorktreeEvidence(root, evidence(taskId, checkoutPath, extraSource));
  return { root, service, services, provider, git, repository, evidence, write, discoveries: () => discoveries, reset: () => { discoveries = 0; } };
}

test('one evidence reader discovers once, reuses realpath roots and reads each current file', t => {
  const f = fixture(t), first = f.write('task-one'); f.write('task-two'); f.reset();
  const original = childProcess.spawnSync, calls: string[][] = [];
  const capture = t.mock.method(childProcess, 'spawnSync', (file: any, args: any, options: any) => { if (file === 'git') calls.push(args); return original(file, args, options); });
  syncBuiltinESMExports();
  let reading: ReturnType<typeof f.provider.createGitWorktreeEvidenceReader>;
  try {
    reading = f.provider.createGitWorktreeEvidenceReader(f.root, { requireComplete: true });
    assert.equal(reading.read('task-one')?.evidence.taskId, 'task-one'); assert.equal(reading.read('task-two')?.evidence.taskId, 'task-two');
  } finally { capture.mock.restore(); syncBuiltinESMExports(); }
  assert.equal(f.discoveries(), 1);
  assert.equal(calls.filter(args => args[args.indexOf('-C') + 1] === f.service && args.slice(-2).join(' ') === 'rev-parse --show-toplevel').length, 1);
  assert.ok(Object.isFrozen(reading.directories));
  fs.writeFileSync(first.file, JSON.stringify({ ...f.evidence('task-one'), branch: 'updated-evidence' }));
  assert.equal(reading.read('task-one')?.evidence.branch, 'updated-evidence');
  assert.equal(reading.read('missing', { optional: true }), null);
  assert.throws(() => reading.read('../escape', { optional: true }), /Invalid task id/);
  const added = f.repository('repositories/added'); f.services.three = { source: { type: 'git', path: 'repositories/added' } };
  const next = f.provider.createGitWorktreeEvidenceReader(f.root, { requireComplete: true });
  assert.equal(f.discoveries(), 2); assert.ok(next.directories.some(directory => directory.startsWith(added + path.sep)));
  assert.ok(!reading.directories.some(directory => directory.startsWith(added + path.sep)));
});

test('reader and single-task entry both reject duplicate evidence and literal-path substitutions', t => {
  const f = fixture(t), stored = f.write('task-one');
  const duplicate = path.join(f.service, '.git', 'buildr', 'task-worktrees', 'task-one.json');
  fs.mkdirSync(path.dirname(duplicate), { recursive: true }); fs.copyFileSync(stored.file, duplicate);
  const reading = f.provider.createGitWorktreeEvidenceReader(f.root, { requireComplete: true });
  const conflict = (error: unknown) => error instanceof Error && Reflect.get(error, 'code') === 'git_worktree_evidence_conflict';
  assert.throws(() => reading.read('task-one'), conflict); assert.throws(() => f.provider.readGitWorktreeEvidence(f.root, 'task-one'), conflict);
  fs.rmSync(duplicate); fs.renameSync(stored.file, stored.file + '.held'); fs.symlinkSync(stored.file + '.held', stored.file);
  assert.throws(() => reading.read('task-one'), /符号链接/);
  assert.throws(() => f.provider.readGitWorktreeEvidence(f.root, 'task-one'), /符号链接/);
});

test('root evidence still discovers retired sources and refuses duplicate records there', t => {
  const f = fixture(t), stored = f.write('retired-task', undefined, f.service);
  delete f.services.one; delete f.services.two;
  const duplicate = path.join(f.service, '.git', 'buildr', 'task-worktrees', 'retired-task.json');
  fs.mkdirSync(path.dirname(duplicate), { recursive: true }); fs.copyFileSync(stored.file, duplicate);
  const reading = f.provider.createGitWorktreeEvidenceReader(f.root, { requireComplete: true });
  assert.ok(!reading.directories.some(directory => directory.startsWith(f.service + path.sep)));
  assert.throws(() => reading.read('retired-task'), (error: unknown) => error instanceof Error && Reflect.get(error, 'code') === 'git_worktree_evidence_conflict');
  fs.rmSync(duplicate); assert.equal(reading.read('retired-task')?.evidence.repositories.length, 2);
});

test('SCM associations share the provider reader and strict discovery gaps never assert uniqueness', t => {
  const f = fixture(t), checkout = path.join(f.root, 'topic'); fs.mkdirSync(checkout); f.write('topic', checkout);
  const member = { worktreeId: 'checkout-' + 'a'.repeat(64), name: 'topic', location: checkout, isMain: false, isRegistered: false, branch: 'topic', head: null, available: true };
  const repositories = [{ id: 'repo', location: f.root, worktrees: [member] }];
  f.reset();
  const dependencies = { ...f.provider, readTask: (_root: string, id: string) => ({ taskId: id, title: id }) };
  const associated = [...readSourceControlTaskAssociations(f.root, repositories, dependencies).values()][0];
  assert.equal(associated.taskId, 'topic'); assert.equal(f.discoveries(), 1);
  f.services.invalid = { source: { type: 'git', path: 'missing-repository' } };
  assert.throws(() => f.provider.createGitWorktreeEvidenceReader(f.root, { requireComplete: true }), (error: unknown) => error instanceof Error && Reflect.get(error, 'code') === 'git_worktree_evidence_discovery_incomplete');
  const uncertain = [...readSourceControlTaskAssociations(f.root, repositories, dependencies, 'topic').values()][0];
  assert.equal(uncertain.taskId, null); assert.match(uncertain.taskDiagnostic || '', /尚未完整读取/);
});
