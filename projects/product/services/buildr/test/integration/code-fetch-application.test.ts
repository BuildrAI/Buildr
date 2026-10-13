import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createCodeApplication } from '../../src/modules/code/application/code-application.ts';
import { createCodeFetchApplication, type CodeFetchTarget } from '../../src/modules/code/application/code-fetch-application.ts';
import { createCodeHttpContribution } from '../../src/modules/code/interfaces/http/code-http.ts';
import { CODE_HTTP_PATHS, CODE_HTTP_SCHEMAS, CODE_HTTP_VALIDATORS } from '../../src/modules/code/interfaces/http/code-http-contracts.ts';
import { runCodeGitMutation, type GitMutationProcessResult } from '../../src/modules/code/infrastructure/code-git-mutation-runner.ts';

const success: GitMutationProcessResult = { ok: true, timedOut: false, stdout: '', stderr: '', code: 0 };
const hasCode = (code: string) => (error: unknown) => error instanceof Error && Reflect.get(error, 'code') === code;

function fixture(t: test.TestContext) {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-code-fetch-')));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const hooks = path.join(base, 'empty-hooks'); fs.mkdirSync(hooks);
  const inherited = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('GIT_')));
  const git = (directory: string, ...args: string[]) => execFileSync('git', ['--no-optional-locks', '-c', 'core.hooksPath=' + hooks, '-c', 'core.fsmonitor=false', '-C', directory, ...args], {
    encoding: 'utf8', env: { ...inherited, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: os.devNull, GIT_TERMINAL_PROMPT: '0' }, stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  const configure = (directory: string) => {
    git(directory, 'config', 'user.name', 'Fetch Fixture'); git(directory, 'config', 'user.email', 'fetch-fixture@example.com');
    git(directory, 'config', 'commit.gpgSign', 'false'); git(directory, 'config', 'core.hooksPath', hooks); git(directory, 'config', 'core.fsmonitor', 'false');
  };
  const roots = new Map<string, string>();
  const remote = (name: string) => { const directory = path.join(base, name); fs.mkdirSync(directory); git(directory, 'init', '--bare', '--initial-branch=main'); return directory; };
  const origin = remote('origin.git'), seed = path.join(base, 'seed'), local = path.join(base, 'local'); fs.mkdirSync(seed);
  git(seed, 'init', '--initial-branch=main'); configure(seed);
  fs.writeFileSync(path.join(seed, 'tracked.txt'), 'base\n'); git(seed, 'add', '--', '.'); git(seed, 'commit', '-m', 'initial');
  git(seed, 'remote', 'add', 'origin', origin); git(seed, 'push', 'origin', 'main');
  git(base, 'clone', '--no-local', '--', origin, local); configure(local); roots.set('local', local);
  const app = createCodeApplication({
    assetCatalog: () => ({ repositories: [...roots].map(([id, location]) => ({ id, code: id, name: id, source: { type: 'workspace', path: location } })), projects: [], services: [] }),
    resolveSourceRoot: (_root, source) => source.path, readTaskScope: () => ({ projects: [], services: [] }), readGitWorktreeEvidence: () => null,
  });
  const target = (repositoryId = 'local'): CodeFetchTarget => {
    const observed = app.sourceControl(base, { repositoryId }).repositories.find(item => item.id === repositoryId)!;
    assert.ok(observed?.gitId && observed.source?.checkoutId, 'the fetch target comes from a real source-control observation');
    return { repositoryId, expectedGitId: observed.gitId, expectedCheckoutId: observed.source.checkoutId };
  };
  const isolated = (run: typeof runCodeGitMutation) => createCodeFetchApplication({ registeredLocation: (_root, id) => {
    const location = roots.get(id); if (!location) throw Error('not registered'); return location;
  }, run });
  const advance = () => {
    git(seed, 'switch', '-c', 'dev'); fs.writeFileSync(path.join(seed, 'dev.txt'), 'new remote branch\n'); git(seed, 'add', '--', '.'); git(seed, 'commit', '-m', 'remote dev');
    git(seed, 'tag', 'remote-release'); git(seed, 'push', 'origin', 'dev', 'refs/tags/remote-release'); return git(seed, 'rev-parse', 'HEAD');
  };
  const clone = (id: string) => { const directory = path.join(base, id); git(base, 'clone', '--no-local', '--', origin, directory); configure(directory); roots.set(id, directory); return directory; };
  const linked = () => { const directory = path.join(base, 'linked'); git(local, 'worktree', 'add', '-b', 'linked-position', directory); roots.set('linked', directory); return directory; };
  const snapshot = () => ({
    branch: git(local, 'symbolic-ref', 'HEAD'), head: git(local, 'rev-parse', 'HEAD'), status: git(local, 'status', '--porcelain=v2', '-z', '--untracked-files=all'),
    index: crypto.createHash('sha256').update(fs.readFileSync(git(local, 'rev-parse', '--path-format=absolute', '--git-path', 'index'))).digest('hex'),
    localRefs: git(local, 'for-each-ref', '--format=%(refname) %(objectname)', 'refs/heads/', 'refs/tags/'),
    tracked: fs.readFileSync(path.join(local, 'tracked.txt'), 'utf8'), untracked: fs.existsSync(path.join(local, 'untracked.txt')) ? fs.readFileSync(path.join(local, 'untracked.txt'), 'utf8') : null,
  });
  return { base, origin, local, seed, roots, git, app, remote, target, isolated, advance, clone, linked, snapshot };
}

test('authorized HTTP fetch discovers remote dev without changing local work, tags, stale refs or FETCH_HEAD', async t => {
  const f = fixture(t), expected = f.advance();
  f.git(f.local, 'tag', 'local-only'); f.git(f.local, 'update-ref', 'refs/remotes/origin/retired', f.git(f.local, 'rev-parse', 'HEAD'));
  f.git(f.local, 'config', 'fetch.prune', 'true'); f.git(f.local, 'config', 'fetch.pruneTags', 'true'); f.git(f.local, 'config', 'remote.origin.tagOpt', '--tags');
  fs.writeFileSync(path.join(f.local, 'tracked.txt'), 'staged\n'); f.git(f.local, 'add', '--', 'tracked.txt');
  fs.writeFileSync(path.join(f.local, 'tracked.txt'), 'unstaged\n'); fs.writeFileSync(path.join(f.local, 'untracked.txt'), 'preserve me\n');
  const fetchHead = path.join(f.local, '.git', 'FETCH_HEAD'); fs.writeFileSync(fetchHead, 'fetch-head-sentinel\n');
  const before = f.snapshot(), input = { repositories: [f.target()] }, http = createCodeHttpContribution(f.app); let authorized = 0;
  const response = await http.handle({ request: { method: 'POST' }, suffix: '/code/fetch', searchParams: new URLSearchParams(), root: f.base,
    authorizeWrite: () => { authorized++; }, readJsonBody: async () => input });
  assert.equal(authorized, 1); assert.equal(response?.status, 200);
  const body = response!.body as Awaited<ReturnType<typeof f.app.fetch>>;
  assert.equal(body.repositories[0].status, 'succeeded'); assert.equal(body.repositories[0].remotes[0].status, 'succeeded');
  assert.equal(CODE_HTTP_VALIDATORS.validate(CODE_HTTP_SCHEMAS.fetch.$id, body).valid, true);
  assert.equal(f.git(f.local, 'rev-parse', 'refs/remotes/origin/dev'), expected);
  assert.ok(f.app.branches(f.base, { repositoryId: 'local', worktreeId: input.repositories[0].expectedCheckoutId! }).branches.some(entry => entry.name === 'origin/dev'));
  assert.deepEqual(f.snapshot(), before); assert.equal(fs.readFileSync(fetchHead, 'utf8'), 'fetch-head-sentinel\n');
  assert.equal(f.git(f.local, 'rev-parse', 'refs/remotes/origin/retired'), before.head);
  assert.throws(() => f.git(f.local, 'show-ref', '--verify', 'refs/tags/remote-release'));
  assert.throws(() => f.git(f.local, 'show-ref', '--verify', 'refs/heads/dev'));
});

test('fetch HTTP remains write-authorized and rejects query/path injection without entering a read worker', async t => {
  const f = fixture(t), http = createCodeHttpContribution(f.app), input = { repositories: [f.target()] }; let reads = 0;
  const context = { request: { method: 'POST' }, suffix: '/code/fetch', searchParams: new URLSearchParams(), root: f.base,
    readJsonBody: async () => input, submitTaskRead: async () => { reads++; return {}; } };
  await assert.rejects(http.handle(context), hasCode('code_write_unauthorized'));
  await assert.rejects(http.handle({ ...context, authorizeWrite: () => {}, searchParams: new URLSearchParams('path=/tmp/arbitrary') }), hasCode('code_query_invalid'));
  await assert.rejects(http.handle({ ...context, authorizeWrite: () => {}, readJsonBody: async () => ({ ...input, path: '/tmp/arbitrary' }) }), hasCode('code_fetch_input_invalid'));
  assert.equal(reads, 0); assert.ok(!Object.keys(CODE_HTTP_PATHS).includes('fetch'));
});

test('same common directory and configuration fetch once and map the real result to each registered instance', async t => {
  const f = fixture(t); f.linked(); const expected = f.advance(), targets = [f.target(), f.target('linked')]; let calls = 0;
  const app = f.isolated(async (...args) => { if (args[1].includes('fetch')) calls++; return runCodeGitMutation(...args); });
  const response = await app.fetch(f.base, { repositories: targets });
  assert.equal(calls, 1); assert.deepEqual(response.repositories.map(item => [item.repositoryId, item.status]), [['local', 'succeeded'], ['linked', 'succeeded']]);
  assert.equal(f.git(f.local, 'rev-parse', 'refs/remotes/origin/dev'), expected);
});

test('fetch preserves the configured remote destination when URL rewrites could otherwise apply twice', async t => {
  const f = fixture(t), expected = f.advance(), unrelated = f.remote('unrelated.git');
  f.git(f.local, 'config', 'remote.origin.url', 'fixture:origin');
  f.git(f.local, 'config', 'url.' + f.origin + '.insteadOf', 'fixture:origin');
  f.git(f.local, 'config', 'url.' + unrelated + '.insteadOf', f.origin);
  assert.equal(f.git(f.local, 'remote', 'get-url', 'origin'), f.origin, 'normal remote resolution applies the configured alias once');
  const response = await f.app.fetch(f.base, { repositories: [f.target()] });
  assert.equal(response.repositories[0].status, 'succeeded');
  assert.equal(f.git(f.local, 'rev-parse', 'refs/remotes/origin/dev'), expected, 'fetch must reach the observed origin rather than rewriting its expanded URL into another repository');
});

test('same common directory with different worktree remote configuration refuses the group instead of selecting a location', async t => {
  const f = fixture(t), linked = f.linked();
  f.git(f.local, 'config', 'extensions.worktreeConfig', 'true');
  f.git(linked, 'config', '--worktree', 'remote.extra.url', f.origin);
  f.git(linked, 'config', '--worktree', 'remote.extra.fetch', '+refs/heads/*:refs/remotes/extra/*');
  let calls = 0; const app = f.isolated(async () => { calls++; return success; });
  const response = await app.fetch(f.base, { repositories: [f.target(), f.target('linked')] });
  assert.equal(calls, 0); assert.deepEqual(response.repositories.map(item => item.status), ['unavailable', 'unavailable']);
  assert.ok(response.repositories.every(item => /不同远程配置/.test(item.message)));
});

test('a replacement .git at the same path cannot reuse the previously observed path-based Git id', async t => {
  const f = fixture(t), target = f.target(); fs.renameSync(path.join(f.local, '.git'), path.join(f.base, 'held.git'));
  f.git(f.local, 'init', '--initial-branch=replacement'); let calls = 0;
  const app = f.isolated(async () => { calls++; return success; });
  const response = await app.fetch(f.base, { repositories: [target] });
  assert.equal(calls, 0); assert.equal(response.repositories[0].status, 'unavailable');
  assert.equal(fs.readFileSync(path.join(f.local, 'tracked.txt'), 'utf8'), 'base\n');
});

test('unsafe fetch destinations refuse only that remote and preserve all local branches', async t => {
  const f = fixture(t), expected = f.advance();
  f.git(f.local, 'config', '--replace-all', 'remote.origin.fetch', '+refs/heads/*:refs/heads/*');
  f.git(f.local, 'remote', 'add', 'safe', f.origin);
  const before = f.snapshot(), response = await f.app.fetch(f.base, { repositories: [f.target()] });
  assert.equal(response.repositories[0].status, 'unavailable');
  assert.deepEqual(response.repositories[0].remotes.map(item => [item.name, item.status]), [['origin', 'unavailable'], ['safe', 'succeeded']]);
  assert.equal(f.git(f.local, 'rev-parse', 'refs/remotes/safe/dev'), expected); assert.deepEqual(f.snapshot(), before);
});

test('remote-looking symbolic destinations cannot redirect fetch updates into a local branch', async t => {
  const f = fixture(t); f.advance(); f.git(f.local, 'branch', 'protected', 'main');
  f.git(f.local, 'symbolic-ref', 'refs/remotes/origin/dev', 'refs/heads/protected');
  const before = f.snapshot(), response = await f.app.fetch(f.base, { repositories: [f.target()] });
  assert.equal(response.repositories[0].status, 'unavailable'); assert.equal(response.repositories[0].remotes[0].status, 'unavailable');
  assert.deepEqual(f.snapshot(), before); assert.equal(f.git(f.local, 'symbolic-ref', 'refs/remotes/origin/dev'), 'refs/heads/protected');
});

test('a symbolic destination introduced after observation is rejected at the pre-write verification', async t => {
  const f = fixture(t), target = f.target(); f.git(f.local, 'branch', 'protected', 'main'); let observations = 0, calls = 0;
  const app = createCodeFetchApplication({ registeredLocation: () => {
    if (++observations === 2) f.git(f.local, 'symbolic-ref', 'refs/remotes/origin/dev', 'refs/heads/protected');
    return f.local;
  }, run: async () => { calls++; return success; } });
  const response = await app.fetch(f.base, { repositories: [target] });
  assert.equal(calls, 0, 'current destination safety must be verified even when configuration bytes did not change');
  assert.equal(response.repositories[0].status, 'unavailable');
});

test('a dangling remote symbolic destination never creates its out-of-scope local branch target', async t => {
  const f = fixture(t), expected = f.advance();
  f.git(f.local, 'symbolic-ref', 'refs/remotes/origin/dev', 'refs/heads/injected');
  assert.ok(!f.git(f.local, 'for-each-ref', '--format=%(refname)', 'refs/remotes/').split('\n').includes('refs/remotes/origin/dev'), 'dangling symbolic refs are absent from ordinary ref enumeration');
  const before = f.snapshot(), response = await f.app.fetch(f.base, { repositories: [f.target()] });
  assert.throws(() => f.git(f.local, 'show-ref', '--verify', 'refs/heads/injected'), 'fetch must not follow the dangling remote ref into a local branch');
  assert.deepEqual(f.snapshot(), before);
  if (response.repositories[0].status === 'succeeded') assert.equal(f.git(f.local, 'rev-parse', 'refs/remotes/origin/dev'), expected);
});

test('fetch and reference publication disable content-writing hooks without altering the stored configuration', async t => {
  const f = fixture(t); f.advance(); const target = f.target(), before = f.snapshot();
  const hooks = path.join(f.base, 'writing-hooks'); fs.mkdirSync(hooks);
  const script = '#!/bin/sh\nprintf "hook changed work\\n" > tracked.txt\nprintf "hook ran\\n" > hook-ran.txt\n';
  fs.writeFileSync(path.join(hooks, 'reference-transaction'), script, { mode: 0o755 });
  const fsmonitor = path.join(hooks, 'fsmonitor'); fs.writeFileSync(fsmonitor, script, { mode: 0o755 });
  f.git(f.local, 'config', 'core.hooksPath', hooks); f.git(f.local, 'config', 'core.fsmonitor', fsmonitor);
  const response = await f.app.fetch(f.base, { repositories: [target] });
  assert.equal(response.repositories[0].status, 'succeeded'); assert.deepEqual(f.snapshot(), before);
  assert.equal(fs.existsSync(path.join(f.local, 'hook-ran.txt')), false);
  assert.equal(f.git(f.local, 'config', '--local', '--get', 'core.hooksPath'), hooks); assert.equal(f.git(f.local, 'config', '--local', '--get', 'core.fsmonitor'), fsmonitor);
});

test('an unavailable local remote cannot hide completed updates from another configured remote', async t => {
  const f = fixture(t), expected = f.advance(); f.git(f.local, 'remote', 'add', 'missing', path.join(f.base, 'missing.git'));
  const before = f.snapshot(), response = await f.app.fetch(f.base, { repositories: [f.target()] });
  assert.equal(response.repositories[0].status, 'failed');
  assert.deepEqual(response.repositories[0].remotes.map(item => [item.name, item.status]), [['origin', 'succeeded'], ['missing', 'failed']]);
  assert.equal(f.git(f.local, 'rev-parse', 'refs/remotes/origin/dev'), expected); assert.deepEqual(f.snapshot(), before);
});

test('a concurrent remote-ref update prevents stale publication and temporary fetched refs are cleaned', async t => {
  const f = fixture(t); f.advance(); const before = f.snapshot(); let fetched = 0;
  const app = f.isolated(async (...args) => {
    const value = await runCodeGitMutation(...args);
    if (args[1].includes('fetch')) { fetched++; f.git(f.local, 'update-ref', 'refs/remotes/origin/dev', before.head); }
    return value;
  });
  const response = await app.fetch(f.base, { repositories: [f.target()] });
  assert.equal(fetched, 1); assert.equal(response.repositories[0].status, 'failed');
  assert.equal(f.git(f.local, 'rev-parse', 'refs/remotes/origin/dev'), before.head, 'the concurrently written destination cannot be overwritten by the earlier fetch observation');
  assert.deepEqual(f.snapshot(), before);
  assert.ok(!f.git(f.local, 'for-each-ref', '--format=%(refname)').split('\n').some(name => name.includes('buildr-fetch')), 'owned temporary refs are removed after publication conflict');
});

test('configuration drift before the write refuses execution while drift after a real fetch preserves effects as unknown', async t => {
  const f = fixture(t), target = f.target(); let observations = 0, calls = 0;
  const before = createCodeFetchApplication({ registeredLocation: () => {
    if (++observations === 2) f.git(f.local, 'config', 'remote.origin.url', path.join(f.base, 'changed.git'));
    return f.local;
  }, run: async () => { calls++; return success; } });
  assert.equal((await before.fetch(f.base, { repositories: [target] })).repositories[0].status, 'unavailable'); assert.equal(calls, 0);
  f.git(f.local, 'config', 'remote.origin.url', f.origin); const expected = f.advance();
  const after = f.isolated(async (...args) => {
    if (args[1].includes('fetch')) calls++;
    const value = await runCodeGitMutation(...args);
    if (args[1].includes('update-ref') && args[2]?.input?.includes('update refs/remotes/origin/dev ')) f.git(f.local, 'config', 'remote.origin.url', path.join(f.base, 'changed.git'));
    return value;
  });
  const response = await after.fetch(f.base, { repositories: [f.target()] });
  assert.equal(calls, 1); assert.equal(response.repositories[0].status, 'unknown');
  assert.equal(f.git(f.local, 'rev-parse', 'refs/remotes/origin/dev'), expected, 'post-write drift cannot erase the successful remote-ref update');
});

test('timeout and partial remote failure stay local, do not leak transport secrets and never retry', async t => {
  const f = fixture(t); f.clone('healthy'); f.git(f.local, 'remote', 'add', 'backup', f.origin);
  const calls: string[] = [], secret = 'https://user:secret-token@example.invalid/repo?access_token=private';
  const app = f.isolated(async (source, args, options) => {
    if (!args.includes('fetch')) return runCodeGitMutation(source, args, options);
    calls.push(source.repositoryId);
    if (source.repositoryId === 'healthy') return success;
    return calls.filter(id => id === 'local').length === 1 ? { ...success, ok: false, timedOut: true, code: null, stderr: secret } : { ...success, ok: false, code: 1, stderr: secret };
  });
  const response = await app.fetch(f.base, { repositories: [f.target(), f.target('healthy')] });
  assert.equal(response.repositories[0].status, 'unknown'); assert.deepEqual(response.repositories[0].remotes.map(item => item.status), ['unknown', 'failed']);
  assert.equal(response.repositories[1].status, 'succeeded'); assert.equal(calls.length, 3); assert.ok(!JSON.stringify(response).includes('secret-token')); assert.ok(!JSON.stringify(response).includes('access_token'));
});

test('batch concurrency is bounded to two repositories and overlapping requests never fetch the same repository twice', async t => {
  const f = fixture(t); f.clone('second'); f.clone('third'); const targets = [f.target(), f.target('second'), f.target('third')];
  let release = () => {}; const gate = new Promise<void>(resolve => { release = resolve; }); let active = 0, maximum = 0, calls = 0;
  const app = f.isolated(async (source, args, options) => {
    if (!args.includes('fetch')) return runCodeGitMutation(source, args, options);
    calls++; active++; maximum = Math.max(maximum, active); await gate; active--; return success;
  });
  const pending = app.fetch(f.base, { repositories: targets });
  try {
    await new Promise<void>(resolve => setImmediate(resolve)); assert.equal(calls, 2); assert.equal(active, 2);
    const overlapping = await app.fetch(f.base, { repositories: [targets[0]] });
    assert.equal(overlapping.repositories[0].status, 'unavailable'); assert.match(overlapping.repositories[0].message, /正在获取/); assert.equal(calls, 2);
  } finally { release(); }
  const response = await pending; assert.equal(calls, 3); assert.equal(maximum, 2); assert.ok(response.repositories.every(item => item.status === 'succeeded'));
});

test('unconfirmed, removed and duplicate targets cannot expand or substitute the requested fetch range', async t => {
  const f = fixture(t), confirmed = f.target(); let calls = 0; const app = f.isolated(async () => { calls++; return success; });
  const response = await app.fetch(f.base, { repositories: [{ ...confirmed, repositoryId: 'missing' }, { ...confirmed, expectedCheckoutId: null }] });
  assert.equal(calls, 0); assert.ok(response.repositories.every(item => item.status === 'unavailable'));
  await assert.rejects(app.fetch(f.base, { repositories: [confirmed, confirmed] }), hasCode('code_fetch_input_invalid'));
  await assert.rejects(app.fetch(f.base, { repositories: [] }), hasCode('code_fetch_input_invalid'));
});
