import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createCodeApplication } from '../../src/modules/code/application/code-application.ts';
import { createCodeHttpContribution } from '../../src/modules/code/interfaces/http/code-http.ts';
import { createCodeCliContributions } from '../../src/modules/code/interfaces/cli/code-cli.ts';
import { CODE_HTTP_REQUESTS, CODE_HTTP_SCHEMAS, CODE_HTTP_VALIDATORS } from '../../src/modules/code/interfaces/http/code-http-contracts.ts';
import { createBoundedBuildrWebReadExecutor } from '../../src/web/http/read-executor.ts';
import { assertWriteRequest } from '../../src/web/http/session.ts';

function fixture(t: test.TestContext, format = 'sha1') {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-branch-operation-')), root = path.join(base, 'repository');
  fs.mkdirSync(root); t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const gitAt = (location: string, ...args: string[]) => execFileSync('git', ['--no-optional-locks', '-C', location, ...args], { encoding: 'utf8', env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const git = (...args: string[]) => gitAt(root, ...args);
  git('init', '--initial-branch=main', '--object-format=' + format); git('config', 'user.name', 'Same Name'); git('config', 'user.email', 'first@example.com'); git('config', 'commit.gpgSign', 'false');
  const write = (file: string, value: string, location = root) => fs.writeFileSync(path.join(location, file), value);
  const commit = (message: string, email = 'first@example.com') => { git('add', '--', '.'); git('commit', '--author=Same Name <' + email + '>', '-m', message); return git('rev-parse', 'HEAD'); };
  const app = createCodeApplication({ assetCatalog: () => ({ repositories: [{ id: 'repo-one', code: 'repo', name: 'Fixture', source: { type: 'workspace', path: root } }], services: [], projects: [] }), resolveSourceRoot: (_root, source) => source.path, readTaskScope: () => ({ projects: [], services: [] }), readGitWorktreeEvidence: () => null });
  const source = () => app.sourceControl(root).repositories[0].worktrees.find(item => item.isRegistered)!;
  const input = () => ({ repositoryId: 'repo-one', worktreeId: source().worktreeId });
  const catalog = () => app.branches(root, input());
  const request = (ref: string, locationInput = input()) => { const list = app.branches(root, locationInput), target = list.branches.find(entry => entry.ref === ref)!; assert.ok(target, ref); return { ...locationInput, targetRef: ref, expectedTargetHash: target.hash, expectedRevision: list.observedRevision }; };
  const snapshot = (location = root) => {
    const index = gitAt(location, 'rev-parse', '--path-format=absolute', '--git-path', 'index');
    return { branch: gitAt(location, 'symbolic-ref', '--short', 'HEAD'), head: gitAt(location, 'rev-parse', 'HEAD'), status: gitAt(location, 'status', '--porcelain=v2', '-z'), index: fs.existsSync(index) ? crypto.createHash('sha256').update(fs.readFileSync(index)).digest('hex') : '', files: Object.fromEntries(fs.readdirSync(location).filter(file => file !== '.git' && fs.statSync(path.join(location, file)).isFile()).map(file => [file, fs.readFileSync(path.join(location, file), 'utf8')])) };
  };
  const remote = (name: string, branch: string, hash: string) => { if (!git('remote').split('\n').includes(name)) git('remote', 'add', name, path.join(base, name + '.git')); git('update-ref', 'refs/remotes/' + name + '/' + branch, hash); };
  return { root, base, app, git, gitAt, write, commit, source, input, catalog, request, snapshot, remote };
}
const code = (expected: string) => (error: unknown) => (error as { code?: string }).code === expected;

test('branch catalog distinguishes full refs and tracking/occupation, excludes remote HEAD, and is read-only', t => {
  const f = fixture(t); f.write('one.ts', 'base\n'); const hash = f.commit('base'); f.remote('origin', 'main', hash); f.remote('upstream', 'main', hash);
  f.git('branch', '--set-upstream-to=origin/main', 'main'); f.git('symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main');
  const linked = path.join(f.base, 'linked'); f.git('worktree', 'add', '-b', 'topic', linked); f.remote('origin', 'topic', hash); f.git('branch', '--set-upstream-to=origin/topic', 'topic');
  const before = f.snapshot(), linkedBefore = f.snapshot(linked), refsBefore = f.git('for-each-ref', '--format=%(refname) %(objectname)');
  const list = f.catalog(); assert.equal(CODE_HTTP_VALIDATORS.validate(CODE_HTTP_SCHEMAS.branches.$id, list).valid, true);
  assert.deepEqual(list.branches.map(item => item.ref), ['refs/heads/main', 'refs/heads/topic', 'refs/remotes/origin/main', 'refs/remotes/origin/topic', 'refs/remotes/upstream/main']);
  const origin = list.branches.find(item => item.ref === 'refs/remotes/origin/main')!; assert.equal(origin.localBranch?.name, 'main'); assert.equal(origin.current, true);
  assert.equal(list.branches.find(item => item.ref === 'refs/remotes/upstream/main')?.localBranch, null);
  const topic = list.branches.find(item => item.ref === 'refs/remotes/origin/topic')!; assert.equal(topic.localBranch?.worktreeLocation, fs.realpathSync(linked)); assert.notEqual(topic.localBranch?.worktreeId, list.source.worktreeId);
  assert.deepEqual(f.snapshot(), before); assert.deepEqual(f.snapshot(linked), linkedBefore); assert.equal(f.git('for-each-ref', '--format=%(refname) %(objectname)'), refsBefore);
});

test('local switch affects exactly the requested checkout and preserves safe staged/unstaged edits', t => {
  const f = fixture(t); f.write('same.ts', 'base\n'); f.write('safe.ts', 'base\n'); f.commit('base');
  f.git('switch', '-c', 'target'); f.write('same.ts', 'target\n'); const targetHash = f.commit('target'); f.git('switch', 'main');
  const linked = path.join(f.base, 'linked'); f.git('worktree', 'add', '-b', 'linked', linked); f.write('safe.ts', 'index\n', linked); f.gitAt(linked, 'add', '--', 'safe.ts'); f.write('safe.ts', 'working\n', linked);
  const sourceBefore = f.snapshot(), safeIndex = f.gitAt(linked, 'show', ':safe.ts'), wt = f.app.sourceControl(f.root).repositories[0].worktrees.find(item => !item.isMain)!;
  const switched = f.app.switchBranch(f.root, f.request('refs/heads/target', { repositoryId: 'repo-one', worktreeId: wt.worktreeId }));
  assert.equal(switched.source.worktreeId, wt.worktreeId); assert.equal(switched.branch, 'target'); assert.equal(switched.head, targetHash); assert.equal(switched.effects.switched, true); assert.equal(switched.effects.createdLocalBranch, null);
  assert.equal(fs.readFileSync(path.join(linked, 'safe.ts'), 'utf8'), 'working\n'); assert.equal(f.gitAt(linked, 'show', ':safe.ts'), safeIndex); assert.equal(fs.readFileSync(path.join(linked, 'same.ts'), 'utf8'), 'target\n'); assert.deepEqual(f.snapshot(), sourceBefore);
});

test('remote-only checkout creates tracking branch in one operation without fetching or running hooks', t => {
  const f = fixture(t); f.write('same.ts', 'base\n'); f.commit('base'); f.git('switch', '-c', 'remote-source'); f.write('same.ts', 'remote\n'); const tip = f.commit('remote tip'); f.git('switch', 'main'); f.git('branch', '-D', 'remote-source'); f.remote('origin', 'feature/review', tip);
  const hooks = path.join(f.root, '.git', 'hooks'); fs.writeFileSync(path.join(hooks, 'post-checkout'), '#!/bin/sh\ntouch "' + path.join(f.base, 'hook-ran') + '"\n', { mode: 0o755 });
  const monitor = path.join(f.base, 'monitor.sh'); fs.writeFileSync(monitor, '#!/bin/sh\ntouch "' + path.join(f.base, 'monitor-ran') + '"\n', { mode: 0o755 }); f.git('config', 'core.fsmonitor', monitor);
  const beforeRemote = f.git('rev-parse', 'refs/remotes/origin/feature/review'), switched = f.app.switchBranch(f.root, f.request('refs/remotes/origin/feature/review'));
  assert.equal(switched.branch, 'feature/review'); assert.equal(switched.head, tip); assert.equal(switched.upstream, 'origin/feature/review'); assert.equal(switched.effects.createdLocalBranch, 'feature/review'); assert.equal(fs.existsSync(path.join(f.base, 'hook-ran')), false);
  assert.equal(fs.existsSync(path.join(f.base, 'monitor-ran')), false);
  assert.equal(f.git('rev-parse', 'refs/remotes/origin/feature/review'), beforeRemote); assert.equal(CODE_HTTP_VALIDATORS.validate(CODE_HTTP_SCHEMAS.branchSwitch.$id, switched).valid, true);
});

test('existing local tracking branch keeps its own tip instead of being reset to the remote tip', t => {
  const f = fixture(t); f.write('same.ts', 'base\n'); const base = f.commit('base'); f.remote('origin', 'topic', base); f.git('switch', '-c', 'topic', '--track', 'origin/topic'); f.write('same.ts', 'local\n'); const local = f.commit('local work'); f.git('switch', 'main');
  const switched = f.app.switchBranch(f.root, f.request('refs/remotes/origin/topic')); assert.equal(switched.branch, 'topic'); assert.equal(switched.head, local); assert.equal(switched.effects.createdLocalBranch, null); assert.equal(f.git('rev-parse', 'refs/remotes/origin/topic'), base);
});

test('occupied branches and conflicting local names preserve both checkouts and allow explicit new remote name', t => {
  const f = fixture(t); f.write('same.ts', 'base\n'); const base = f.commit('base'); f.git('branch', 'topic'); f.remote('origin', 'topic', base);
  const before = f.snapshot(); assert.throws(() => f.app.switchBranch(f.root, f.request('refs/remotes/origin/topic')), code('code_branch_local_name_conflict')); assert.deepEqual(f.snapshot(), before);
  const linked = path.join(f.base, 'linked'); f.git('worktree', 'add', linked, 'topic'); const linkedBefore = f.snapshot(linked);
  assert.throws(() => f.app.switchBranch(f.root, f.request('refs/heads/topic')), (error: unknown) => { const value = error as { code?: string; details?: { worktreeId?: string; effects?: { switched?: boolean } } }; assert.ok(value.details?.worktreeId); assert.equal(value.details?.effects?.switched, false); return value.code === 'code_branch_occupied'; });
  assert.deepEqual(f.snapshot(), before); assert.deepEqual(f.snapshot(linked), linkedBefore);
  const renamed = f.app.switchBranch(f.root, { ...f.request('refs/remotes/origin/topic'), localName: 'remote-topic' }); assert.equal(renamed.branch, 'remote-topic'); assert.equal(renamed.upstream, 'origin/topic'); assert.deepEqual(f.snapshot(linked), linkedBefore);
});

test('tracked remote occupation is protected and invalid remote-derived local names cannot create refs', t => {
  const f = fixture(t); f.write('same.ts', 'base\n'); const base = f.commit('base'); f.remote('origin', 'topic', base); f.git('branch', 'topic'); f.git('branch', '--set-upstream-to=origin/topic', 'topic');
  const linked = path.join(f.base, 'linked'); f.git('worktree', 'add', linked, 'topic'); const before = f.snapshot();
  assert.throws(() => f.app.switchBranch(f.root, f.request('refs/remotes/origin/topic')), code('code_branch_occupied')); assert.deepEqual(f.snapshot(), before);
  for (const localName of ['--force', 'bad..name', 'name\nother', '@{-1}']) assert.throws(() => f.app.switchBranch(f.root, { ...f.request('refs/remotes/origin/topic'), localName }), code('code_branch_local_name_invalid'));
  assert.deepEqual(f.snapshot(), before);
});

test('a low-level branch named dash cannot trigger the previous-checkout alias', t => {
  const f = fixture(t); f.write('same.ts', 'base\n'); const base = f.commit('base'); f.git('switch', '-c', 'previous'); f.write('same.ts', 'previous\n'); f.commit('previous'); f.git('switch', 'main'); f.git('update-ref', 'refs/heads/-', base); const before = f.snapshot();
  assert.throws(() => f.app.switchBranch(f.root, f.request('refs/heads/-')), code('code_branch_local_name_invalid')); assert.deepEqual(f.snapshot(), before);
});

test('overlapping and untracked conflicts fail without creating remote local refs or discarding contents', t => {
  const f = fixture(t); f.write('same.ts', 'base\n'); f.commit('base'); f.git('switch', '-c', 'remote-source'); f.write('same.ts', 'remote\n'); f.write('new.ts', 'remote\n'); const tip = f.commit('remote tip'); f.git('switch', 'main'); f.git('branch', '-D', 'remote-source'); f.remote('origin', 'topic', tip);
  f.write('same.ts', 'my edit\n'); f.write('new.ts', 'my untracked\n'); const before = f.snapshot();
  assert.throws(() => f.app.switchBranch(f.root, f.request('refs/remotes/origin/topic')), (error: unknown) => { const value = error as { code?: string; details?: { effects?: { switched: boolean; createdLocalBranch: string | null }; current?: { branch: string }; affectedFiles?: string[] } }; assert.equal(value.details?.current?.branch, 'main'); assert.deepEqual(value.details?.effects, { switched: false, createdLocalBranch: null }); assert.ok(value.details?.affectedFiles?.includes('same.ts')); assert.ok(value.details?.affectedFiles?.includes('new.ts')); return value.code === 'code_branch_switch_blocked'; });
  assert.deepEqual(f.snapshot(), before); assert.equal(f.catalog().branches.some(item => item.ref === 'refs/heads/topic'), false);
});

test('conflict paths remain exact for Chinese, spaces, quotes and newlines, excluding safe dirty files', t => {
  const f = fixture(t), names = ['中文 空格.ts', 'quote"name.ts', '换行\n文件.ts'];
  for (const name of [...names, 'safe.ts']) f.write(name, 'base\n'); f.commit('base'); f.git('switch', '-c', 'target'); for (const name of names) f.write(name, 'target\n'); f.commit('target'); f.git('switch', 'main');
  for (const name of [...names, 'safe.ts']) f.write(name, 'my edit\n'); const before = f.snapshot();
  assert.throws(() => f.app.switchBranch(f.root, f.request('refs/heads/target')), (error: unknown) => {
    const value = error as { code?: string; details?: { affectedFiles?: string[]; gitMessage?: string } }; assert.deepEqual(new Set(value.details?.affectedFiles), new Set(names)); assert.ok(value.details?.gitMessage?.includes('would be overwritten by checkout:')); return value.code === 'code_branch_switch_blocked';
  }); assert.deepEqual(f.snapshot(), before);
});

test('ignored untracked files are protected instead of overwritten by the ordinary checkout default', t => {
  const f = fixture(t); f.write('.gitignore', '.env\n'); f.commit('ignore local environment'); f.git('switch', '-c', 'target'); f.write('.env', 'target environment\n'); f.git('add', '--force', '--', '.env'); f.git('commit', '-m', 'tracked environment'); f.git('switch', 'main'); f.write('.env', 'user local environment\n');
  const before = f.snapshot(); assert.equal(f.source().fileCount, 0);
  assert.throws(() => f.app.switchBranch(f.root, f.request('refs/heads/target')), (error: unknown) => { const value = error as { code?: string; details?: { affectedFiles?: string[] } }; assert.deepEqual(value.details?.affectedFiles, ['.env']); return value.code === 'code_branch_switch_blocked'; }); assert.deepEqual(f.snapshot(), before);
});

test('configured external filters only block checkout paths that require conversion and never run the filter', t => {
  const f = fixture(t); f.write('filtered.txt', 'base\n'); f.commit('base'); f.git('switch', '-c', 'converted'); f.write('.gitattributes', 'filtered.txt filter=review\n'); f.write('filtered.txt', 'converted\n'); f.commit('converted'); f.git('switch', 'main'); f.git('switch', '-c', 'plain'); f.write('plain.ts', 'plain\n'); f.commit('plain'); f.git('switch', 'main');
  const marker = path.join(f.base, 'filter-ran'); f.git('config', 'filter.review.smudge', 'touch "' + marker + '"; cat');
  const before = f.snapshot(); assert.throws(() => f.app.switchBranch(f.root, f.request('refs/heads/converted')), code('code_branch_external_filter')); assert.equal(fs.existsSync(marker), false); assert.deepEqual(f.snapshot(), before);
  const plain = f.app.switchBranch(f.root, f.request('refs/heads/plain')); assert.equal(plain.branch, 'plain'); assert.equal(fs.existsSync(marker), false);
  f.git('config', 'filter.review.process', 'touch "' + marker + '"; cat'); assert.throws(() => f.app.switchBranch(f.root, f.request('refs/heads/converted')), code('code_branch_external_filter')); assert.equal(fs.existsSync(marker), false);
});

test('branch catalog uses raw metadata and dirty filter paths block switching even with identical target trees', t => {
  const f = fixture(t); f.write('.gitattributes', 'filtered.txt filter=review\n'); f.write('filtered.txt', 'base\n'); f.commit('base'); f.git('branch', 'target'); const input = f.input(), marker = path.join(f.base, 'dirty-filter-ran');
  f.git('config', 'filter.review.clean', 'touch "' + marker + '"; cat'); f.write('filtered.txt', 'my dirty work\n');
  const unchanged = () => ({ head: f.git('rev-parse', 'HEAD'), branch: f.git('branch', '--show-current'), index: fs.readFileSync(path.join(f.root, '.git', 'index')).toString('base64'), content: fs.readFileSync(path.join(f.root, 'filtered.txt'), 'utf8') });
  const before = unchanged();
  for (const kind of ['clean', 'process']) {
    if (kind === 'process') f.git('config', 'filter.review.process', 'touch "' + marker + '"; cat');
    const catalog = f.app.branches(f.root, input), target = catalog.branches.find(item => item.ref === 'refs/heads/target')!; assert.equal(fs.existsSync(marker), false);
    assert.throws(() => f.app.switchBranch(f.root, { ...input, targetRef: target.ref, expectedTargetHash: target.hash, expectedRevision: catalog.observedRevision }), code('code_branch_external_filter'));
    assert.equal(fs.existsSync(marker), false); assert.deepEqual(unchanged(), before);
  }
});

test('large branch inventory truncates output while retaining exact tracking relationships in linear maps', t => {
  const f = fixture(t); f.write('same.ts', 'base\n'); const base = f.commit('base'); f.remote('origin', 'seed', base);
  const updates = Array.from({ length: 1200 }, (_, index) => 'create refs/heads/local-' + String(index).padStart(4, '0') + ' ' + base + '\ncreate refs/remotes/origin/remote-' + String(index).padStart(4, '0') + ' ' + base + '\n').join('');
  execFileSync('git', ['-C', f.root, 'update-ref', '--stdin'], { input: updates, stdio: ['pipe', 'pipe', 'pipe'] });
  const refsBefore = f.git('for-each-ref', '--format=%(refname) %(objectname)'), observed = f.catalog(); assert.equal(observed.coverage.truncated, true); assert.equal(observed.branches.length, 1000); assert.ok(observed.diagnostics.some(item => item.code === 'code_branches_truncated')); assert.equal(f.git('for-each-ref', '--format=%(refname) %(objectname)'), refsBefore);
});

test('failed upstream registration reports the real created branch rather than claiming zero effects', t => {
  const f = fixture(t); f.write('same.ts', 'base\n'); const base = f.commit('base'); f.remote('origin', 'topic', base);
  const request = f.request('refs/remotes/origin/topic'), before = f.snapshot(); fs.writeFileSync(path.join(f.root, '.git', 'config.lock'), 'another writer\n');
  assert.throws(() => f.app.switchBranch(f.root, request), (error: unknown) => {
    const value = error as { code?: string; details?: { current?: { branch: string; head: string }; effects?: { switched: boolean; createdLocalBranch: string | null } } };
    assert.equal(value.details?.current?.branch, f.git('branch', '--show-current')); assert.equal(value.details?.current?.head, f.git('rev-parse', 'HEAD'));
    const actualCreated = f.catalog().branches.some(item => item.ref === 'refs/heads/topic'); assert.equal(value.details?.effects?.createdLocalBranch, actualCreated ? 'topic' : null); assert.equal(actualCreated, true);
    assert.equal(value.details?.effects?.switched, false); assert.equal((value.details as { affectedFiles?: string[] }).affectedFiles, undefined); return value.code === 'code_branch_switch_blocked';
  });
  assert.deepEqual(f.snapshot(), before); assert.equal(f.git('rev-parse', 'refs/heads/topic'), base);
});

test('HEAD/target/worktree file drift and reused local tip/upstream drift reject stale switch observations', t => {
  const f = fixture(t); f.write('same.ts', 'base\n'); const base = f.commit('base'); f.remote('origin', 'topic', base); f.git('branch', 'topic'); f.git('branch', '--set-upstream-to=origin/topic', 'topic');
  let request = f.request('refs/remotes/origin/topic'); f.write('same.ts', 'updated\n'); const current = f.commit('changed HEAD'); let before = f.snapshot(); assert.throws(() => f.app.switchBranch(f.root, request), code('code_source_changed')); assert.deepEqual(f.snapshot(), before);
  request = f.request('refs/remotes/origin/topic'); f.git('update-ref', 'refs/heads/topic', current); before = f.snapshot(); assert.throws(() => f.app.switchBranch(f.root, request), code('code_source_changed')); assert.deepEqual(f.snapshot(), before); assert.equal(f.git('rev-parse', 'refs/remotes/origin/topic'), base);
  request = f.request('refs/remotes/origin/topic'); f.git('branch', '--unset-upstream', 'topic'); before = f.snapshot(); assert.throws(() => f.app.switchBranch(f.root, request), code('code_source_changed')); assert.deepEqual(f.snapshot(), before);
  request = f.request('refs/remotes/origin/topic'); f.write('same.ts', 'dirty\n'); before = f.snapshot(); assert.throws(() => f.app.switchBranch(f.root, request), code('code_source_changed')); assert.deepEqual(f.snapshot(), before);
  request = f.request('refs/remotes/origin/topic'); f.git('update-ref', 'refs/remotes/origin/topic', current); before = f.snapshot(); assert.throws(() => f.app.switchBranch(f.root, request), code('code_branch_target_changed')); assert.deepEqual(f.snapshot(), before);
});

test('removed and same-path rebuilt worktree identities reject old observations instead of selecting replacements', t => {
  const f = fixture(t); f.write('same.ts', 'base\n'); f.commit('base'); f.git('branch', 'target'); const linked = path.join(f.base, 'linked'); f.git('worktree', 'add', '-b', 'linked', linked);
  const wt = f.app.sourceControl(f.root).repositories[0].worktrees.find(item => !item.isMain)!, request = f.request('refs/heads/target', { repositoryId: 'repo-one', worktreeId: wt.worktreeId }); const before = f.snapshot();
  f.git('worktree', 'remove', linked); assert.throws(() => f.app.switchBranch(f.root, request), code('code_worktree_not_registered')); f.git('worktree', 'add', linked, 'linked');
  assert.throws(() => f.app.switchBranch(f.root, request), code('code_worktree_not_registered')); assert.notEqual(f.app.sourceControl(f.root).repositories[0].worktrees.find(item => !item.isMain)?.worktreeId, wt.worktreeId); assert.deepEqual(f.snapshot(), before);
  assert.throws(() => f.app.switchBranch(f.root, { ...f.request('refs/heads/target'), repositoryId: 'foreign' }), code('code_repository_not_registered')); assert.deepEqual(f.snapshot(), before);
});

test('in-progress operations and conflicted index stay local failures with no branch or file writes', t => {
  const f = fixture(t); f.write('same.ts', 'base\n'); const base = f.commit('base'); f.git('branch', 'target'); fs.writeFileSync(path.join(f.root, '.git', 'MERGE_HEAD'), base + '\n'); const before = f.snapshot();
  assert.throws(() => f.app.switchBranch(f.root, f.request('refs/heads/target')), code('code_branch_operation_in_progress')); assert.deepEqual(f.snapshot(), before); fs.unlinkSync(path.join(f.root, '.git', 'MERGE_HEAD'));
  f.git('switch', 'target'); f.write('same.ts', 'target\n'); f.commit('target'); f.git('switch', 'main'); f.write('same.ts', 'main\n'); f.commit('main'); assert.throws(() => f.git('merge', 'target'));
  const conflict = f.snapshot(); assert.throws(() => f.app.switchBranch(f.root, f.request('refs/heads/target')), code('code_branch_operation_in_progress')); assert.deepEqual(f.snapshot(), conflict);
});

test('current author uses explicit author configuration before user configuration, independently of history candidates', t => {
  const f = fixture(t); f.git('config', 'author.name', ''); f.git('config', 'author.email', ''); f.write('same.ts', 'base\n'); f.commit('base'); const input = f.input();
  const initial = f.app.authors(f.root, input); assert.deepEqual(initial.currentAuthor, { name: 'Same Name', email: 'first@example.com' });
  f.git('config', 'author.name', 'Configured Author'); f.git('config', 'author.email', 'mine@example.com');
  const before = f.snapshot(), configBefore = fs.readFileSync(path.join(f.root, '.git', 'config'), 'utf8');
  const observed = f.app.authors(f.root, input); assert.deepEqual(observed.currentAuthor, { name: 'Configured Author', email: 'mine@example.com' });
  assert.equal(observed.authors.some(author => author.email === 'mine@example.com'), false); assert.deepEqual(f.app.history(f.root, { ...input, authorEmail: observed.currentAuthor!.email }).commits, []);
  assert.notEqual(observed.observedRevision, initial.observedRevision); assert.throws(() => f.app.authors(f.root, { ...input, expectedRevision: initial.observedRevision }), code('code_source_changed'));
  assert.equal(CODE_HTTP_VALIDATORS.validate(CODE_HTTP_SCHEMAS.authors.$id, observed).valid, true); assert.deepEqual(f.snapshot(), before); assert.equal(fs.readFileSync(path.join(f.root, '.git', 'config'), 'utf8'), configBefore);
  f.git('config', 'author.name', ''); f.git('config', 'author.email', '');
  assert.deepEqual(f.app.authors(f.root, input).currentAuthor, { name: 'Same Name', email: 'first@example.com' });
});

test('current author follows the selected worktree effective configuration without changing either checkout', t => {
  const f = fixture(t); f.git('config', 'author.name', ''); f.git('config', 'author.email', ''); f.write('same.ts', 'base\n'); f.commit('base'); f.git('config', 'extensions.worktreeConfig', 'true');
  const linked = path.join(f.base, 'linked'); f.git('worktree', 'add', '-b', 'linked', linked); f.gitAt(linked, 'config', '--worktree', 'user.name', 'Worktree Author'); f.gitAt(linked, 'config', '--worktree', 'user.email', 'worktree@example.com');
  const worktree = f.app.sourceControl(f.root).repositories[0].worktrees.find(item => !item.isMain)!, mainBefore = f.snapshot(), linkedBefore = f.snapshot(linked);
  assert.deepEqual(f.app.authors(f.root, f.input()).currentAuthor, { name: 'Same Name', email: 'first@example.com' });
  const authors = f.app.authors(f.root, { repositoryId: 'repo-one', worktreeId: worktree.worktreeId }); assert.deepEqual(authors.currentAuthor, { name: 'Worktree Author', email: 'worktree@example.com' });
  assert.deepEqual(authors.authors, [{ name: 'Same Name', email: 'first@example.com' }]); assert.deepEqual(f.snapshot(), mainBefore); assert.deepEqual(f.snapshot(linked), linkedBefore);
});

test('missing configured email disables current author without guessing environment identity or blocking candidates', t => {
  const f = fixture(t); f.write('same.ts', 'base\n'); f.commit('base'); const input = f.input();
  f.git('config', 'user.email', ''); f.git('config', 'author.email', '');
  const before = f.snapshot(), previousEmail = process.env.EMAIL, previousGitAuthor = process.env.GIT_AUTHOR_EMAIL;
  try {
    process.env.EMAIL = 'environment@example.com'; process.env.GIT_AUTHOR_EMAIL = 'git-environment@example.com';
    const missing = f.app.authors(f.root, input); assert.equal(missing.currentAuthor, null); assert.deepEqual(missing.authors, [{ name: 'Same Name', email: 'first@example.com' }]);
    assert.equal(CODE_HTTP_VALIDATORS.validate(CODE_HTTP_SCHEMAS.authors.$id, missing).valid, true); assert.deepEqual(f.snapshot(), before);
    f.git('config', 'user.name', ''); f.git('config', 'author.name', ''); f.git('config', '--unset', 'author.email'); f.git('config', 'user.email', 'configured@example.com');
    assert.deepEqual(f.app.authors(f.root, input).currentAuthor, { name: '', email: 'configured@example.com' });
  } finally {
    if (previousEmail === undefined) delete process.env.EMAIL; else process.env.EMAIL = previousEmail;
    if (previousGitAuthor === undefined) delete process.env.GIT_AUTHOR_EMAIL; else process.env.GIT_AUTHOR_EMAIL = previousGitAuthor;
  }
});

test('authors are independently observed by reachable range; exact email and keyword apply before pagination', t => {
  const f = fixture(t); f.write('same.ts', 'base\n'); const base = f.commit('shared match', 'first@example.com'); f.write('same.ts', 'two\n'); const second = f.commit('second match', 'second@example.com'); f.write('same.ts', 'three\n'); const third = f.commit('third match', 'second@example.com');
  f.git('switch', '-c', 'other', base); f.write('other.ts', 'other\n'); const other = f.commit('other match', 'other@example.com'); f.git('switch', 'main'); f.remote('origin', 'other', other);
  const before = f.snapshot(), input = f.input(); const authors = f.app.authors(f.root, { ...input, branch: 'refs/heads/main' }); assert.deepEqual(authors.authors, [{ name: 'Same Name', email: 'first@example.com' }, { name: 'Same Name', email: 'second@example.com' }]); assert.equal(CODE_HTTP_VALIDATORS.validate(CODE_HTTP_SCHEMAS.authors.$id, authors).valid, true);
  const first = f.app.history(f.root, { ...input, branch: 'refs/heads/main', authorEmail: 'second@example.com', query: 'match', limit: 1 }); assert.equal(first.commits[0].hash, third); const next = f.app.history(f.root, { ...input, branch: 'refs/heads/main', authorEmail: 'second@example.com', query: 'match', limit: 1, cursor: first.coverage.nextCursor! }); assert.equal(next.commits[0].hash, second); assert.equal(next.coverage.nextCursor, null);
  assert.throws(() => f.app.history(f.root, { ...input, authorEmail: 'first@example.com', query: 'match', cursor: first.coverage.nextCursor! }), code('code_history_cursor_changed'));
  const remote = f.app.history(f.root, { ...input, branch: 'refs/remotes/origin/other' }); assert.deepEqual(remote.commits.map(commit => commit.hash), [other, base]); assert.deepEqual(f.app.authors(f.root, { ...input, branch: 'refs/remotes/origin/other' }).authors.map(author => author.email), ['first@example.com', 'other@example.com']);
  assert.deepEqual(f.app.history(f.root, { ...input, branch: 'main', query: 's' }).commits.map(commit => commit.hash), [third, second, base]); assert.throws(() => f.app.history(f.root, { ...input, branch: 'refs/tags/main' }), code('code_branch_missing')); assert.deepEqual(f.snapshot(), before);
});

test('author candidates and history honestly report the bounded scan and skipped oversized objects', t => {
  const f = fixture(t); f.write('same.ts', 'base\n'); const base = f.commit('base');
  const stream = Array.from({ length: 2002 }, (_, index) => {
    const message = 'bounded ' + index, email = index === 0 ? 'ancient@example.com' : 'recent@example.com';
    return 'commit refs/heads/main\nauthor Same Name <' + email + '> 1700000000 +0000\ncommitter Same Name <' + email + '> 1700000000 +0000\ndata ' + Buffer.byteLength(message) + '\n' + message + '\n' + (index === 0 ? 'from ' + base + '\n' : '') + '\n';
  }).join('');
  execFileSync('git', ['-C', f.root, 'fast-import', '--quiet'], { input: stream, stdio: ['pipe', 'pipe', 'pipe'] });
  const before = f.snapshot(), authors = f.app.authors(f.root, f.input()); assert.equal(authors.coverage.truncated, true); assert.equal(authors.coverage.limit, 2000); assert.deepEqual(authors.authors, [{ name: 'Same Name', email: 'recent@example.com' }]); assert.ok(authors.diagnostics.some(item => item.code === 'code_authors_truncated')); assert.deepEqual(f.snapshot(), before);
  const tree = f.git('rev-parse', 'HEAD^{tree}'), parent = f.git('rev-parse', 'HEAD');
  const big = execFileSync('git', ['-C', f.root, 'commit-tree', tree, '-p', parent], { input: 'large object\n' + 'x'.repeat(8 * 1024 * 1024), encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 'Oversized Author', GIT_AUTHOR_EMAIL: 'oversized@example.com' }, stdio: ['pipe', 'pipe', 'pipe'] }).trim(); f.git('update-ref', 'refs/heads/main', big);
  const oversized = f.app.authors(f.root, f.input()); assert.equal(oversized.coverage.truncated, true); assert.equal(oversized.authors.some(item => item.email === 'oversized@example.com'), false); const history = f.app.history(f.root, f.input()); assert.ok(history.diagnostics.some(item => item.code === 'code_history_bytes_truncated'));
});

test('full long ref scopes use one bounded contract consistently and unknown commit expressions are rejected', async t => {
  const f = fixture(t); f.write('same.ts', 'base\n'); const base = f.commit('base'); const longName = ['x'.repeat(120), 'y'.repeat(120), 'topic'].join('/'); f.remote('origin', longName, base);
  const scope = 'refs/remotes/origin/' + longName, http = createCodeHttpContribution(f.app), input = f.input();
  for (const operation of ['history', 'authors']) {
    const result = await http.handle({ request: { method: 'GET' }, suffix: '/code/' + operation, searchParams: new URLSearchParams({ ...input, branch: scope }), root: f.root }); assert.equal(result?.status, 200);
  }
  const switched = f.app.switchBranch(f.root, f.request(scope)); assert.equal(switched.branch, longName); assert.equal(switched.upstream, 'origin/' + longName); assert.throws(() => f.app.history(f.root, { ...input, branch: 'main~1' }), code('code_branch_missing'));
});

test('read-only CLI and read-worker cannot route branch-switch; POST requires write authorization and closed body', async t => {
  const f = fixture(t); f.write('same.ts', 'base\n'); f.commit('base'); f.git('branch', 'target'); const http = createCodeHttpContribution(f.app), request = f.request('refs/heads/target'); const before = f.snapshot();
  const cli = createCodeCliContributions(f.app); assert.ok(cli.some(item => item.key === 'code branches')); assert.ok(cli.some(item => item.key === 'code authors')); assert.equal(cli.some(item => item.key === 'code branch-switch'), false);
  const executor = createBoundedBuildrWebReadExecutor(); t.after(() => executor.close()); assert.throws(() => executor.run('code-branch-switch', { targetRoot: f.root, taskId: 'code-files', input: JSON.stringify(request) }), code('local_app_read_operation_forbidden'));
  const context = { request: { method: 'POST' }, suffix: '/code/branch-switch', searchParams: new URLSearchParams(), root: f.root, readJsonBody: async () => request };
  await assert.rejects(http.handle(context), code('code_branch_write_unauthorized'));
  await assert.rejects(http.handle({ ...context, authorizeWrite: () => assertWriteRequest({ headers: { origin: 'http://other', 'x-buildr-session': 'session', 'content-type': 'application/json' } }, 'http://127.0.0.1:1', 'session') }), code('origin_forbidden'));
  await assert.rejects(http.handle({ ...context, authorizeWrite: () => assertWriteRequest({ headers: { origin: 'http://127.0.0.1:1', 'x-buildr-session': 'wrong', 'content-type': 'application/json' } }, 'http://127.0.0.1:1', 'session') }), code('session_forbidden'));
  let authorized = 0; const authorizeWrite = () => { authorized++; };
  await assert.rejects(http.handle({ ...context, authorizeWrite, readJsonBody: async () => ({ ...request, root: '/wrong' }) }), code('code_branch_switch_invalid')); await assert.rejects(http.handle({ ...context, authorizeWrite, searchParams: new URLSearchParams('force=true') }), code('code_query_invalid')); assert.deepEqual(f.snapshot(), before);
  let workerCalls = 0; const switched = await http.handle({ ...context, authorizeWrite, submitTaskRead: async () => { workerCalls++; throw Error('write entered read worker'); } }); assert.equal(switched?.status, 200); assert.equal(workerCalls, 0); assert.ok(authorized >= 3); assert.equal(f.git('branch', '--show-current'), 'target');
  assert.equal(CODE_HTTP_VALIDATORS.validate(CODE_HTTP_REQUESTS.branchSwitch.$id, request).valid, true);
});

test('SHA-256 refs work for remote checkout and history', t => {
  const f = fixture(t, 'sha256'); f.write('same.ts', 'base\n'); const base = f.commit('base'); f.remote('origin', 'topic', base); const switched = f.app.switchBranch(f.root, f.request('refs/remotes/origin/topic')); assert.equal(switched.head?.length, 64); assert.equal(f.app.history(f.root, { ...f.input(), branch: 'refs/remotes/origin/topic' }).commits[0].hash, base);
});
