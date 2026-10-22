import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createCodeApplication } from '../../src/modules/code/application/code-application.ts';
import { createCodeHttpContribution } from '../../src/modules/code/interfaces/http/code-http.ts';
import { CODE_HTTP_REQUESTS, CODE_HTTP_SCHEMAS, CODE_HTTP_VALIDATORS } from '../../src/modules/code/interfaces/http/code-http-contracts.ts';
function fixture(t: test.TestContext, format = 'sha1') {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-discard-operation-')), root = path.join(base, 'repository');
  fs.mkdirSync(root); t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const gitAt = (location: string, ...args: string[]) => execFileSync('git', ['-C', location, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const git = (...args: string[]) => gitAt(root, ...args);
  git('init', '--initial-branch=main', '--object-format=' + format); git('config', 'user.name', 'Commit Fixture'); git('config', 'user.email', 'fixture@example.com'); git('config', 'commit.gpgSign', 'false');
  const write = (file: string, value: string, directory = root) => fs.writeFileSync(path.join(directory, file), value);
  const commit = (message = 'base') => { git('add', '--all'); git('commit', '-qm', message); return git('rev-parse', 'HEAD'); };
  const app = createCodeApplication({ assetCatalog: () => ({ repositories: [{ id: 'repo-one', code: 'repo', name: 'Fixture', source: { type: 'workspace', path: root } }], services: [], projects: [] }), resolveSourceRoot: (_root, source) => source.path, readTaskScope: () => ({ projects: [], services: [] }), readGitWorktreeEvidence: () => null });
  const input = () => ({ repositoryId: 'repo-one', worktreeId: app.sourceControl(root).repositories[0].worktrees.find(item => item.isRegistered)!.worktreeId });
  const request = (message = 'all current changes', mode: 'commit' | 'commit-push' | 'commit-sync' = 'commit', location = input()) => ({ ...location, expectedRevision: app.commitContext(root, location).revision, message, mode });
  const index = () => { const file = git('rev-parse', '--path-format=absolute', '--git-path', 'index'); return fs.existsSync(file) ? crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') : null; };
  const remote = () => { const target = path.join(base, 'remote.git'); gitAt(base, 'init', '--bare', '--object-format=' + format, target); git('remote', 'add', 'origin', target); git('push', '-u', 'origin', 'main'); return target; };
  return { base, root, app, git, gitAt, write, commit, input, request, index, remote };
}

const discard = (f: ReturnType<typeof fixture>, file?: string) => { const input = {...f.input(), ...(file === undefined ? {} : {path: file})}; const context = f.app.discardContext(f.root, input); return f.app.discardChanges(f.root, {...input, expectedRevision: context.revision}); };

test('single-file discard clears both layers while keeping unrelated staged and untracked files', t => {
  const f = fixture(t); f.write('one', 'base'); f.write('other', 'other'); f.commit();
  f.write('one', 'staged'); f.git('add', 'one'); f.write('one', 'unstaged'); f.write('other', 'keep staged'); f.git('add', 'other'); f.write('new', 'keep untracked');
  const head = f.git('rev-parse', 'HEAD'); const result = discard(f, 'one');
  assert.equal(result.status, 'succeeded'); assert.equal(fs.readFileSync(path.join(f.root, 'one'), 'utf8'), 'base'); assert.equal(f.git('show', ':one'), 'base');
  assert.equal(f.git('show', ':other'), 'keep staged'); assert.equal(fs.readFileSync(path.join(f.root, 'new'), 'utf8'), 'keep untracked'); assert.equal(f.git('rev-parse', 'HEAD'), head);
  assert.equal(CODE_HTTP_VALIDATORS.validate(CODE_HTTP_SCHEMAS.discardChanges.$id, result).valid, true);
});

test('all discard restores deletions and staged renames, removes new files, preserves ignored files and linked worktree', t => {
  const f = fixture(t); f.write('old', 'old'); f.write('deleted', 'deleted'); f.write('.gitignore', '*.ignored\n'); f.commit();
  const linked = path.join(f.base, 'linked'); f.git('worktree', 'add', '-b', 'linked', linked); f.write('old', 'keep linked', linked);
  f.git('mv', 'old', 'renamed'); fs.unlinkSync(path.join(f.root, 'deleted')); f.write('staged-new', 'new'); f.git('add', 'staged-new'); f.write('untracked', 'new'); f.write('keep.ignored', 'keep');
  const result = discard(f); assert.equal(result.status, 'succeeded'); assert.equal(f.git('status', '--porcelain'), '');
  for (const name of ['renamed', 'staged-new', 'untracked']) assert.equal(fs.existsSync(path.join(f.root, name)), false);
  assert.equal(fs.readFileSync(path.join(f.root, 'old'), 'utf8'), 'old'); assert.equal(fs.readFileSync(path.join(f.root, 'deleted'), 'utf8'), 'deleted');
  assert.equal(fs.readFileSync(path.join(f.root, 'keep.ignored'), 'utf8'), 'keep'); assert.equal(fs.readFileSync(path.join(linked, 'old'), 'utf8'), 'keep linked');
});

test('single renamed file restores both names and leaves another change', t => {
  const f = fixture(t); f.write('old', 'old'); f.write('other', 'base'); f.commit(); f.git('mv', 'old', 'new'); f.write('other', 'keep');
  assert.deepEqual(f.app.discardContext(f.root, {...f.input(), path: 'new'}).paths, ['new', 'old']);
  assert.equal(discard(f, 'new').status, 'succeeded'); assert.equal(fs.existsSync(path.join(f.root, 'new')), false); assert.equal(fs.readFileSync(path.join(f.root, 'old'), 'utf8'), 'old'); assert.equal(fs.readFileSync(path.join(f.root, 'other'), 'utf8'), 'keep');
});

test('new repositories can discard staged and untracked additions for both object formats', t => {
  for (const format of ['sha1', 'sha256']) { const f = fixture(t, format); f.write('staged', 'new'); f.git('add', 'staged'); f.write('untracked', 'new'); assert.equal(discard(f).status, 'succeeded'); assert.equal(f.git('status', '--porcelain'), ''); assert.equal(fs.existsSync(path.join(f.root, 'staged')), false); }
});

test('stale same-size contents, index changes and branch changes reject before any discard', t => {
  for (const change of ['contents', 'index', 'branch']) {
    const f = fixture(t); f.write('one', 'base'); f.commit(); f.write('one', 'aaaa'); const input = f.input(), context = f.app.discardContext(f.root, input), before = f.index();
    if (change === 'contents') f.write('one', 'bbbb'); else if (change === 'index') f.git('add', 'one'); else f.git('checkout', '-b', 'another');
    assert.throws(() => f.app.discardChanges(f.root, {...input, expectedRevision: context.revision}), error => (error as {status: number}).status === 409);
    assert.equal(fs.readFileSync(path.join(f.root, 'one'), 'utf8'), change === 'contents' ? 'bbbb' : 'aaaa'); if (change !== 'index') assert.equal(f.index(), before);
  }
});

test('literal special paths are isolated, symlink leaves unlink without following their targets', t => {
  const f = fixture(t); f.write('a[1]', 'base'); f.write('a1', 'base'); f.commit(); f.write('a[1]', 'changed'); f.write('a1', 'keep');
  assert.equal(discard(f, 'a[1]').status, 'succeeded'); assert.equal(fs.readFileSync(path.join(f.root, 'a1'), 'utf8'), 'keep');
  const outside = path.join(f.base, 'outside'); fs.writeFileSync(outside, 'keep'); fs.symlinkSync(outside, path.join(f.root, 'link'));
  assert.equal(discard(f, 'link').status, 'succeeded'); assert.equal(fs.readFileSync(outside, 'utf8'), 'keep'); assert.equal(fs.existsSync(path.join(f.root, 'link')), false);
});

test('index locks, in-progress operations and external filters refuse safely', t => {
  const f = fixture(t); f.write('one', 'base'); f.commit(); f.write('one', 'changed');
  const index = f.git('rev-parse', '--path-format=absolute', '--git-path', 'index'); fs.writeFileSync(index + '.lock', 'other lock');
  assert.throws(() => discard(f), /索引/); assert.equal(fs.readFileSync(index + '.lock', 'utf8'), 'other lock'); fs.unlinkSync(index + '.lock');
  const merge = path.join(f.root, '.git/MERGE_HEAD'); fs.writeFileSync(merge, f.git('rev-parse', 'HEAD')); assert.throws(() => discard(f), /Git/); fs.unlinkSync(merge);
  f.git('config', 'filter.custom.smudge', 'false'); f.write('.gitattributes', 'one filter=custom\n'); assert.throws(() => discard(f, 'one'), /过滤器/); assert.equal(fs.readFileSync(path.join(f.root, 'one'), 'utf8'), 'changed');
});

test('HTTP authorization and contracts protect writes; context GET does not mutate', async t => {
  const f = fixture(t); f.write('one', 'base'); f.commit(); f.write('one', 'changed'); const http = createCodeHttpContribution(f.app);
  const location = f.input(), input = {...location, expectedRevision: f.app.discardContext(f.root, location).revision};
  assert.equal(CODE_HTTP_VALIDATORS.validate(CODE_HTTP_REQUESTS.discardChanges.$id, {...input, path: '../outside'}).valid, true);
  assert.throws(() => f.app.discardContext(f.root, {...location, path: '../outside'}));
  assert.equal(CODE_HTTP_VALIDATORS.validate(CODE_HTTP_REQUESTS.discardChanges.$id, {...input, location: '/tmp'}).valid, false);
  const call = {request: {method: 'POST'}, suffix: '/code/discard-changes', searchParams: new URLSearchParams(), root: f.root, readJsonBody: async () => input};
  await assert.rejects(http.handle(call), error => (error as {status: number}).status === 403);
  assert.equal(fs.readFileSync(path.join(f.root, 'one'), 'utf8'), 'changed');
  const context = await http.handle({request: {method:'GET'}, suffix:'/code/discard-context', searchParams:new URLSearchParams(location), root:f.root});
  assert.equal(CODE_HTTP_VALIDATORS.validate(CODE_HTTP_SCHEMAS.discardContext.$id, context!.body).valid, true);
  const response = await http.handle({...call, authorizeWrite: () => {}}); assert.equal((response!.body as {status: string}).status, 'succeeded');
});

test('partial failure preserves known filesystem effects and does not overwrite the original index', t => {
  const f = fixture(t); f.write('one', 'base'); f.commit(); f.write('one', 'changed'); f.write('new', 'new');
  const input = f.input(), context = f.app.discardContext(f.root, input), index = f.index();
  const unlink = fs.unlinkSync;
  t.mock.method(fs, 'unlinkSync', (file: fs.PathLike) => { if (path.basename(String(file)) === 'new') throw Object.assign(new Error('fixture permission refusal'), {code:'EACCES'}); return unlink(file); });
  const result = f.app.discardChanges(f.root, {...input, expectedRevision:context.revision});
  assert.equal(result.status, 'partial'); assert.deepEqual(result.paths, ['one']); assert.equal(f.index(), index);
  assert.equal(fs.readFileSync(path.join(f.root, 'one'), 'utf8'), 'base'); assert.equal(fs.readFileSync(path.join(f.root, 'new'), 'utf8'), 'new');
  assert.equal(fs.existsSync(f.git('rev-parse', '--git-path', 'index') + '.lock'), false);
});

test('parent symlink replacements and deleted submodule paths cannot expand the discard range', t => {
  const f = fixture(t); fs.mkdirSync(path.join(f.root, 'dir')); f.write('dir/file', 'base'); f.commit();
  fs.rmSync(path.join(f.root, 'dir'), {recursive:true}); fs.mkdirSync(path.join(f.root, 'other')); f.write('other/file', 'keep'); fs.symlinkSync('other', path.join(f.root, 'dir'));
  assert.throws(() => discard(f, 'dir/file')); assert.equal(fs.readFileSync(path.join(f.root, 'other/file'), 'utf8'), 'keep');
  const sub = fixture(t); sub.write('one', 'base'); const head = sub.commit(); sub.git('update-index', '--add', '--cacheinfo', '160000,' + head + ',module'); sub.git('commit', '-qm', 'module');
  assert.throws(() => discard(sub), /子模块/); assert.equal(sub.git('rev-parse', 'HEAD:module'), head);
});

test('deleted attributes cannot enable a HEAD checkout filter, and filter commands never execute during inspection', t => {
  const f = fixture(t); f.write('.gitattributes', 'one filter=custom\n'); f.write('one', 'base'); f.commit();
  const marker = path.join(f.base, 'filter-ran'); f.git('config', 'filter.custom.smudge', 'touch ' + marker); f.git('config', 'filter.custom.clean', 'touch ' + marker);
  fs.unlinkSync(path.join(f.root, '.gitattributes')); f.write('one', 'changed');
  assert.throws(() => discard(f), /过滤器/); assert.equal(fs.existsSync(marker), false); assert.equal(fs.readFileSync(path.join(f.root, 'one'), 'utf8'), 'changed');
});

test('a branch change during filesystem mutation preserves the original index and reports partial effects', t => {
  const f = fixture(t); f.write('one', 'base'); f.commit(); f.git('branch', 'other'); f.write('new', 'new');
  const input = f.input(), context = f.app.discardContext(f.root, input), index = f.index(), unlink = fs.unlinkSync;
  t.mock.method(fs, 'unlinkSync', (file: fs.PathLike) => { const result = unlink(file); if (path.basename(String(file)) === 'new') f.git('symbolic-ref', 'HEAD', 'refs/heads/other'); return result; });
  const result = f.app.discardChanges(f.root, {...input, expectedRevision:context.revision});
  assert.equal(result.status, 'partial'); assert.equal(f.index(), index); assert.match(result.message, /分支/); assert.equal(f.git('branch', '--show-current'), 'other');
});
