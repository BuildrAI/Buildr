import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createCodeApplication } from '../../src/modules/code/application/code-application.ts';
import { createCodeHttpContribution } from '../../src/modules/code/interfaces/http/code-http.ts';
import { CODE_HTTP_SCHEMAS, CODE_HTTP_VALIDATORS } from '../../src/modules/code/interfaces/http/code-http-contracts.ts';
import { runCodeGitMutation } from '../../src/modules/code/infrastructure/code-git-mutation-runner.ts';

function fixture(t: test.TestContext, format = 'sha1') {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-commit-operation-')), root = path.join(base, 'repository');
  fs.mkdirSync(root); t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const gitAt = (location: string, ...args: string[]) => execFileSync('git', ['-C', location, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const git = (...args: string[]) => gitAt(root, ...args);
  git('init', '--initial-branch=main', '--object-format=' + format); git('config', 'user.name', 'Commit Fixture'); git('config', 'user.email', 'fixture@example.invalid'); git('config', 'commit.gpgSign', 'false');
  const write = (file: string, value: string, directory = root) => fs.writeFileSync(path.join(directory, file), value);
  const commit = (message = 'base') => { git('add', '--all'); git('commit', '-qm', message); return git('rev-parse', 'HEAD'); };
  const app = createCodeApplication({ assetCatalog: () => ({ repositories: [{ id: 'repo-one', code: 'repo', name: 'Fixture', source: { type: 'workspace', path: root } }], services: [], projects: [] }), resolveSourceRoot: (_root, source) => source.path, readTaskScope: () => ({ projects: [], services: [] }), readGitWorktreeEvidence: () => null });
  const input = () => ({ repositoryId: 'repo-one', worktreeId: app.sourceControl(root).repositories[0].worktrees.find(item => item.isRegistered)!.worktreeId });
  const request = (message = 'all current changes', mode: 'commit' | 'commit-push' = 'commit', location = input()) => ({ ...location, expectedRevision: app.commitContext(root, location).revision, message, mode });
  const index = () => { const file = git('rev-parse', '--path-format=absolute', '--git-path', 'index'); return fs.existsSync(file) ? crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') : null; };
  const remote = () => { const target = path.join(base, 'remote.git'); gitAt(base, 'init', '--bare', '--object-format=' + format, target); git('remote', 'add', 'origin', target); git('push', '-u', 'origin', 'main'); return target; };
  return { base, root, app, git, gitAt, write, commit, input, request, index, remote };
}
const hasCode = (code: string) => (error: unknown) => (error as { code?: string }).code === code;

test('all final working contents, deletions and untracked files commit with an independent worktree preserved', async t => {
  const f = fixture(t); f.write('same.txt', 'base\n'); f.write('delete.txt', 'delete\n'); f.commit();
  const linked = path.join(f.base, 'linked'); f.git('worktree', 'add', '-b', 'linked', linked); f.write('same.txt', 'other checkout\n', linked);
  f.write('same.txt', 'staged\n'); f.git('add', '--', 'same.txt'); f.write('same.txt', 'final\n'); f.write('new.txt', 'new\n'); fs.unlinkSync(path.join(f.root, 'delete.txt'));
  const snapshot = f.app.commitSnapshot(f.root, f.input()); assert.equal(snapshot.files.find(file => file.path === 'new.txt')?.untracked, true);
  const result = await f.app.commitChanges(f.root, f.request());
  assert.equal(result.commit.status, 'succeeded'); assert.equal(result.effects.indexUpdated, true); assert.equal(result.push.status, 'not-requested');
  assert.equal(f.git('show', 'HEAD:same.txt'), 'final'); assert.equal(f.git('show', 'HEAD:new.txt'), 'new'); assert.throws(() => f.git('show', 'HEAD:delete.txt'));
  assert.equal(f.git('status', '--porcelain'), ''); assert.equal(fs.readFileSync(path.join(linked, 'same.txt'), 'utf8'), 'other checkout\n'); assert.equal(f.gitAt(linked, 'show', 'HEAD:same.txt'), 'base');
  assert.equal(CODE_HTTP_VALIDATORS.validate(CODE_HTTP_SCHEMAS.commitChanges.$id, result).valid, true);
});

test('unborn repositories and SHA-256 commits remain supported', async t => {
  for (const format of ['sha1', 'sha256']) { const f = fixture(t, format); f.write('first.txt', 'first\n'); const result = await f.app.commitChanges(f.root, f.request('first commit')); assert.equal(result.commit.completed, true); assert.equal(result.commit.hash?.length, format === 'sha1' ? 40 : 64); assert.equal(f.git('status', '--porcelain'), ''); }
});

test('large complete contents can be observed and committed even when generation diff exceeds its limit', async t => {
  const f = fixture(t), before = ('a'.repeat(1024) + '\n').repeat(5500), after = ('b'.repeat(1024) + '\n').repeat(5500);
  f.write('large.txt', before); f.commit(); f.write('large.txt', after);
  const context = f.app.commitContext(f.root, f.input());
  assert.equal(context.hasChanges, true); assert.equal(context.fileCount, 1);
  const observation = f.app.commitSnapshot(f.root, f.input(), { includeDiff: false });
  assert.equal(observation.revision, context.revision); assert.equal(observation.diff, '');
  assert.throws(() => f.app.commitSnapshot(f.root, f.input()), error => hasCode('code_commit_observation_incomplete')(error) && (error as { status?: number }).status === 409);
  const result = await f.app.commitChanges(f.root, { ...f.input(), expectedRevision: context.revision, message: 'large contents', mode: 'commit' });
  assert.equal(result.commit.status, 'succeeded');
  assert.equal(f.git('status', '--porcelain'), '');
  assert.equal(crypto.createHash('sha256').update(execFileSync('git', ['-C', f.root, 'show', 'HEAD:large.txt'], { maxBuffer: 8 * 1024 * 1024 })).digest('hex'), crypto.createHash('sha256').update(after).digest('hex'));
});

test('failed repository hooks execute and preserve the original index and worktree', async t => {
  const f = fixture(t); f.write('same.txt', 'base\n'); f.commit(); f.write('same.txt', 'staged\n'); f.git('add', '--', 'same.txt'); f.write('same.txt', 'working\n');
  const beforeIndex = f.index(), head = f.git('rev-parse', 'HEAD');
  fs.writeFileSync(path.join(f.root, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\nprintf hook-ran > hook-marker\nexit 1\n', { mode: 0o755 });
  const result = await f.app.commitChanges(f.root, f.request());
  assert.equal(result.commit.completed, false); assert.equal(result.commit.status, 'failed'); assert.equal(f.index(), beforeIndex); assert.equal(f.git('rev-parse', 'HEAD'), head); assert.equal(fs.readFileSync(path.join(f.root, 'same.txt'), 'utf8'), 'working\n'); assert.equal(fs.readFileSync(path.join(f.root, 'hook-marker'), 'utf8'), 'hook-ran');
});

test('post-commit file modifications remain uncommitted instead of being cleaned away', async t => {
  const f = fixture(t); f.write('same.txt', 'base\n'); f.commit(); f.write('same.txt', 'to commit\n');
  fs.writeFileSync(path.join(f.root, '.git', 'hooks', 'post-commit'), '#!/bin/sh\nprintf "later edit\\n" > same.txt\n', { mode: 0o755 });
  const result = await f.app.commitChanges(f.root, f.request());
  assert.equal(result.commit.completed, true); assert.equal(f.git('show', 'HEAD:same.txt'), 'to commit'); assert.equal(fs.readFileSync(path.join(f.root, 'same.txt'), 'utf8'), 'later edit\n'); assert.equal(f.git('diff', '--cached'), ''); assert.ok(f.git('diff').includes('later edit'));
});

test('configured signing is attempted and signing failures preserve prior index contents', async t => {
  const f = fixture(t); f.write('same.txt', 'base\n'); f.commit(); f.write('same.txt', 'staged\n'); f.git('add', '--', 'same.txt'); f.write('same.txt', 'working\n');
  const signer = path.join(f.base, 'signer.sh'), marker = path.join(f.base, 'signer-ran'); fs.writeFileSync(signer, '#!/bin/sh\nprintf invoked > "' + marker + '"\nexit 1\n', { mode: 0o755 }); f.git('config', 'gpg.format', 'openpgp'); f.git('config', 'gpg.program', signer); f.git('config', 'commit.gpgSign', 'true');
  const index = f.index(), head = f.git('rev-parse', 'HEAD'); const result = await f.app.commitChanges(f.root, f.request());
  assert.equal(result.commit.status, 'failed'); assert.equal(f.index(), index); assert.equal(f.git('rev-parse', 'HEAD'), head); assert.equal(fs.readFileSync(marker, 'utf8'), 'invoked');
});

test('sparse and assume-unchanged index flags reject instead of silently dropping hidden contents', t => {
  const f = fixture(t); f.write('same.txt', 'base\n'); f.commit(); f.git('update-index', '--skip-worktree', 'same.txt'); f.write('new.txt', 'new\n'); assert.throws(() => f.app.commitContext(f.root, f.input()), hasCode('code_commit_index_flags_unsupported')); f.git('update-index', '--no-skip-worktree', 'same.txt'); f.git('update-index', '--assume-unchanged', 'same.txt'); assert.throws(() => f.app.commitContext(f.root, f.input()), hasCode('code_commit_index_flags_unsupported'));
});

test('content/index/HEAD/config drift and invalid inputs reject locally without modifying the index', async t => {
  const f = fixture(t); f.write('same.txt', 'base\n'); f.commit(); f.write('same.txt', 'first\n'); let request = f.request(); f.write('same.txt', 'other\n'); let index = f.index();
  await assert.rejects(f.app.commitChanges(f.root, request), hasCode('code_source_changed')); assert.equal(f.index(), index);
  request = f.request(); f.git('add', '--', 'same.txt'); index = f.index(); await assert.rejects(f.app.commitChanges(f.root, request), hasCode('code_source_changed')); assert.equal(f.index(), index);
  request = f.request(); f.git('config', 'commit.cleanup', 'verbatim'); index = f.index(); await assert.rejects(f.app.commitChanges(f.root, request), hasCode('code_source_changed')); assert.equal(f.index(), index);
  request = f.request(); f.commit('other writer'); f.write('new.txt', 'new\n'); index = f.index(); await assert.rejects(f.app.commitChanges(f.root, request), hasCode('code_source_changed')); assert.equal(f.index(), index);
  await assert.rejects(f.app.commitChanges(f.root, { ...f.request(), message: '   ' }), hasCode('code_commit_input_invalid'));
  await assert.rejects(f.app.commitChanges(f.root, { ...f.request(), repositoryId: 'foreign' }), hasCode('code_repository_not_registered'));
});

test('index locks and in-progress operations do not damage prior staging', async t => {
  const f = fixture(t); f.write('same.txt', 'base\n'); const head = f.commit(); f.write('same.txt', 'staged\n'); f.git('add', '--', 'same.txt'); const index = f.index(), request = f.request();
  const lock = path.join(f.root, '.git', 'index.lock'); fs.writeFileSync(lock, 'other writer'); await assert.rejects(f.app.commitChanges(f.root, request), hasCode('code_commit_index_locked')); assert.equal(fs.readFileSync(lock, 'utf8'), 'other writer'); fs.unlinkSync(lock);
  fs.writeFileSync(path.join(f.root, '.git', 'MERGE_HEAD'), head + '\n'); assert.throws(() => f.app.commitContext(f.root, f.input()), hasCode('code_commit_operation_in_progress')); assert.equal(f.index(), index);
});

test('ordinary explicit push includes previous pending commits and updates only the observed upstream', async t => {
  const f = fixture(t); f.write('same.txt', 'base\n'); f.commit(); const remote = f.remote(); f.write('same.txt', 'earlier\n'); f.commit('earlier pending'); f.write('same.txt', 'current\n');
  assert.equal(f.app.commitContext(f.root, f.input()).push.ahead, 1);
  const result = await f.app.commitChanges(f.root, f.request('current pending', 'commit-push'));
  assert.equal(result.commit.completed, true); assert.equal(result.push.status, 'succeeded'); assert.equal(f.gitAt(remote, 'rev-parse', 'refs/heads/main'), result.commit.hash); assert.equal(f.app.commitContext(f.root, f.input()).push.ahead, 0); assert.equal(f.gitAt(remote, 'rev-list', '--count', 'main'), '3');
});

test('push rejection preserves the one successful commit and retry never creates another commit', async t => {
  const f = fixture(t); f.write('same.txt', 'base\n'); f.commit(); const remote = f.remote(); const hook = path.join(remote, 'hooks', 'pre-receive'); fs.writeFileSync(hook, '#!/bin/sh\necho fixture-rejection >&2\nexit 1\n', { mode: 0o755 }); f.write('same.txt', 'current\n');
  const result = await f.app.commitChanges(f.root, f.request('one pending', 'commit-push'));
  assert.equal(result.commit.completed, true); assert.equal(result.push.status, 'failed'); assert.ok(result.push.retry); assert.equal(f.git('status', '--porcelain'), ''); const count = f.git('rev-list', '--count', 'HEAD');
  fs.unlinkSync(hook); const retried = await f.app.push(f.root, { ...f.input(), ...result.push.retry! });
  assert.equal(retried.push.status, 'succeeded'); assert.equal(f.git('rev-list', '--count', 'HEAD'), count); assert.equal(retried.commit.hash, result.commit.hash);
});

test('missing upstream preserves the successful local commit and stale push targets reject', async t => {
  const f = fixture(t); f.write('same.txt', 'base\n'); f.commit(); f.write('same.txt', 'current\n'); const result = await f.app.commitChanges(f.root, f.request('local only', 'commit-push'));
  assert.equal(result.commit.completed, true); assert.equal(result.push.status, 'unavailable'); assert.equal(result.push.target, null); assert.equal(f.git('status', '--porcelain'), '');
  f.remote(); f.write('same.txt', 'next\n'); f.commit('next'); const observed = f.app.commitContext(f.root, f.input()); f.git('config', 'remote.origin.pushurl', path.join(f.base, 'other.git'));
  await assert.rejects(f.app.push(f.root, { ...f.input(), expectedHead: observed.head!, expectedPushRevision: observed.push.revision }), hasCode('code_source_changed'));
});

test('a changed advertised remote tip refuses the stale push range without undoing the local commit', async t => {
  const f = fixture(t); f.write('same.txt', 'base\n'); f.commit(); const remote = f.remote(); f.gitAt(remote, 'config', 'user.name', 'Remote Fixture'); f.gitAt(remote, 'config', 'user.email', 'remote@example.invalid');
  const remoteHash = f.gitAt(remote, '-c', 'commit.gpgSign=false', 'commit-tree', f.gitAt(remote, 'rev-parse', 'main^{tree}'), '-p', f.gitAt(remote, 'rev-parse', 'main'), '-m', 'remote writer'); f.gitAt(remote, 'update-ref', 'refs/heads/main', remoteHash); f.write('same.txt', 'local current\n');
  const result = await f.app.commitChanges(f.root, f.request('local writer', 'commit-push')); assert.equal(result.commit.completed, true); assert.equal(result.push.status, 'unavailable'); assert.equal(f.gitAt(remote, 'rev-parse', 'refs/heads/main'), remoteHash); assert.equal(f.git('status', '--porcelain'), '');
});

test('an already accepted source hash is reconciled without repeating a push or a commit', async t => {
  const f = fixture(t); f.write('same.txt', 'base\n'); f.commit(); const remote = f.remote(); f.write('same.txt', 'local current\n'); f.commit('already accepted'); const context = f.app.commitContext(f.root, f.input());
  f.git('push', remote, 'HEAD:refs/heads/main'); const count = f.git('rev-list', '--count', 'HEAD');
  const result = await f.app.push(f.root, { ...f.input(), expectedHead: context.head!, expectedPushRevision: context.push.revision }); assert.equal(result.push.status, 'succeeded'); assert.ok(result.push.message.includes('无需重复推送')); assert.equal(f.git('rev-list', '--count', 'HEAD'), count); assert.equal(f.app.commitContext(f.root, f.input()).push.ahead, 0);
});

test('unverifiable remote results stay unknown with no retry token while retaining the local commit', async t => {
  const f = fixture(t); f.write('same.txt', 'base\n'); f.commit(); const remote = f.remote(); fs.writeFileSync(path.join(remote, 'hooks', 'pre-receive'), '#!/bin/sh\nmv "$PWD" "$PWD.moved"\nexit 1\n', { mode: 0o755 }); f.write('same.txt', 'current\n');
  const result = await f.app.commitChanges(f.root, f.request('local commit with unknown push', 'commit-push')); assert.equal(result.commit.completed, true); assert.equal(result.push.status, 'unknown'); assert.equal(result.push.retry, null); assert.equal(f.git('rev-list', '--count', 'HEAD'), '2'); assert.equal(f.git('status', '--porcelain'), '');
});

test('Git mutation HTTP requires authorization, rejects unknown input and bypasses read workers', async t => {
  const f = fixture(t); f.write('same.txt', 'base\n'); f.commit(); f.write('same.txt', 'current\n'); const http = createCodeHttpContribution(f.app), request = f.request();
  const context = { request: { method: 'POST' }, root: f.root, suffix: '/code/commit-changes', searchParams: new URLSearchParams(), readJsonBody: async () => request };
  await assert.rejects(http.handle(context), hasCode('code_write_unauthorized'));
  await assert.rejects(http.handle({ ...context, authorizeWrite: () => {}, readJsonBody: async () => ({ ...request, force: true }) }), hasCode('code_commit_input_invalid'));
  let authorized = false; const response = await http.handle({ ...context, authorizeWrite: () => { authorized = true; }, submitTaskRead: async () => { throw Error('write entered read worker'); } }); assert.equal(authorized, true); assert.equal(response?.status, 200);
  const read = await http.handle({ request: { method: 'GET' }, root: f.root, suffix: '/code/commit-context', searchParams: new URLSearchParams(f.input()) }); assert.equal(read?.status, 200);
});

test('mutation process timeouts are bounded and leave hook-created worktree contents visible', async t => {
  const f = fixture(t); f.write('same.txt', 'base\n'); f.commit(); fs.writeFileSync(path.join(f.root, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\nprintf running > timeout-marker\nsleep 20\n', { mode: 0o755 }); f.write('same.txt', 'current\n'); f.git('add', '--all');
  const start = Date.now(), source = f.app.commitSnapshot(f.root, f.input()).source;
  const result = await runCodeGitMutation(source, ['commit', '-m', 'timeout'], { timeoutMs: 800 }); assert.equal(result.timedOut, true); assert.ok(Date.now() - start < 4000); assert.equal(fs.readFileSync(path.join(f.root, 'timeout-marker'), 'utf8'), 'running');
});
