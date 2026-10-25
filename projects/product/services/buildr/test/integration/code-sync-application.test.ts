import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createCodeApplication } from '../../src/modules/code/application/code-application.ts';
import { createCodeSyncApplication } from '../../src/modules/code/application/code-sync-application.ts';
import { createCodeHttpContribution } from '../../src/modules/code/interfaces/http/code-http.ts';
import { CODE_HTTP_SCHEMAS, CODE_HTTP_VALIDATORS, CODE_HTTP_PATHS } from '../../src/modules/code/interfaces/http/code-http-contracts.ts';
import { runCodeGitMutation } from '../../src/modules/code/infrastructure/code-git-mutation-runner.ts';
import { acquireCodeGitOperation } from '../../src/modules/code/infrastructure/code-git-operation-lock.ts';
import { observeGitCheckoutReadIdentity } from '../../src/infrastructure/git/checkout-read-identity.ts';
import { codeGitConfigurationFixture } from '../helpers/code-git-configuration-fixture.ts';

function fixture(t: test.TestContext, format = 'sha1') {
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-code-sync-'))), root = path.join(base, 'repository'), remote = path.join(base, 'remote.git'), peer = path.join(base, 'peer');
  fs.mkdirSync(root); t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const gitAt = (location: string, ...args: string[]) => execFileSync('git', ['-C', location, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const git = (...args: string[]) => gitAt(root, ...args);
  git('init', '--initial-branch=main', '--object-format=' + format); git('config', 'user.name', 'Sync Fixture'); git('config', 'user.email', 'sync@example.com'); git('config', 'commit.gpgSign', 'false');
  const write = (file: string, content: string, location = root) => fs.writeFileSync(path.join(location, file), content);
  const commitAt = (location: string, message: string) => { gitAt(location, 'add', '--all'); gitAt(location, 'commit', '-qm', message); return gitAt(location, 'rev-parse', 'HEAD'); };
  const commit = (message = 'local') => commitAt(root, message);
  write('base.txt', 'base\n'); const initial = commit('base');
  gitAt(base, 'init', '--bare', '--initial-branch=main', '--object-format=' + format, remote); git('remote', 'add', 'origin', remote); git('push', '-u', 'origin', 'main');
  gitAt(base, 'clone', '--branch=main', remote, peer); gitAt(peer, 'config', 'user.name', 'Peer Fixture'); gitAt(peer, 'config', 'user.email', 'peer@example.com'); gitAt(peer, 'config', 'commit.gpgSign', 'false');
  let registered = root;
  const app = createCodeApplication({ assetCatalog: () => ({ repositories: [{ id: 'repo', code: 'repo', name: 'Sync Fixture', source: { type: 'workspace', path: registered } }], services: [], projects: [] }), resolveSourceRoot: (_root, source) => source.path, readTaskScope: () => ({ projects: [], services: [] }), readGitWorktreeEvidence: () => null });
  const input = () => ({ repositoryId: 'repo', worktreeId: app.sourceControl(root).repositories[0].worktrees.find(item => item.isRegistered)!.worktreeId });
  const request = () => ({ ...input(), expectedRevision: app.syncContext(root, input()).revision });
  const peerCommit = (file = 'remote.txt', content = 'remote\n') => { write(file, content, peer); const head = commitAt(peer, 'remote change'); gitAt(peer, 'push', 'origin', 'main'); return head; };
  const isolated = (run: typeof runCodeGitMutation) => createCodeSyncApplication({ source: (_root, location) => {
    const identity = observeGitCheckoutReadIdentity(registered);
    if (location.repositoryId !== 'repo' || identity.id !== location.worktreeId) throw Object.assign(Error('identity changed'), { code: 'code_worktree_identity_changed' });
    return { repositoryId: 'repo', worktreeId: identity.id, checkoutId: identity.id, taskId: null, commitHash: null, worktreeGroupId: 'main', location: identity.root, version: '当前文件', kind: 'default' };
  }, run });
  const index = () => fs.readFileSync(git('rev-parse', '--path-format=absolute', '--git-path', 'index'));
  return { base, root, remote, peer, git, gitAt, write, commit, commitAt, initial, app, input, request, peerCommit, isolated, index, replaceRegistration: (location: string) => { registered = location; } };
}
const hasCode = (code: string) => (error: unknown) => (error as { code?: string }).code === code;
function sessionApplication(f: ReturnType<typeof fixture>, onResolve: (count: number) => void) {
  let resolutions = 0;
  return createCodeApplication({
    assetCatalog: () => ({ repositories: [{ id: 'repo', code: 'repo', name: 'Sync Fixture', source: { type: 'workspace', path: f.root } }], services: [], projects: [] }),
    resolveSourceRoot: (_root, source) => { onResolve(++resolutions); return source.path; },
    readTaskScope: () => ({ projects: [], services: [] }), readGitWorktreeEvidence: () => null,
  });
}

test('sync context rejects a selected worktree removed during either identity verification', t => {
  for (const boundary of [2, 3]) {
    const f = fixture(t), linked = path.join(f.base, 'selected'); f.git('worktree', 'add', '-b', 'selected', linked);
    const input = { repositoryId: 'repo', worktreeId: observeGitCheckoutReadIdentity(linked).id };
    const app = sessionApplication(f, count => { if (count === boundary) f.git('worktree', 'remove', '--force', linked); });
    assert.throws(() => app.syncContext(f.root, input), hasCode('code_worktree_not_registered'));
    assert.equal(f.gitAt(f.remote, 'rev-parse', 'main'), f.initial);
  }
});

test('sync context rejects a same-path replacement checkout during either identity verification', t => {
  for (const boundary of [2, 3]) {
    const f = fixture(t), linked = path.join(f.base, 'selected'); f.git('worktree', 'add', '-b', 'selected', linked);
    const input = { repositoryId: 'repo', worktreeId: observeGitCheckoutReadIdentity(linked).id };
    const app = sessionApplication(f, count => {
      if (count === boundary) { const saved = path.join(f.base, 'saved-checkout'); fs.renameSync(linked, saved); fs.cpSync(saved, linked, { recursive: true }); }
    });
    assert.throws(() => app.syncContext(f.root, input), hasCode('code_worktree_identity_changed'));
    assert.equal(f.gitAt(f.remote, 'rev-parse', 'main'), f.initial);
  }
});

test('sync context rejects effective configuration and filter-definition drift without running filters', t => {
  for (const changed of ['fixture.changed', 'filter.review.smudge']) {
    const f = fixture(t); f.write('.gitattributes', '*.txt filter=review\n'); f.commit('attributes');
    const config = codeGitConfigurationFixture(t, f.base), marker = path.join(f.base, 'filter-ran'), filter = path.join(f.base, 'filter.mjs');
    fs.writeFileSync(filter, "import fs from 'node:fs';\nfs.writeFileSync(" + JSON.stringify(marker) + ", 'ran'); process.stdin.pipe(process.stdout);\n");
    config.setSystem('filter.review.smudge', config.command(filter));
    const input = { repositoryId: 'repo', worktreeId: observeGitCheckoutReadIdentity(f.root).id };
    const app = sessionApplication(f, count => { if (count === 2) config.setSystem(changed, 'changed-after-observation'); });
    assert.throws(() => app.syncContext(f.root, input), hasCode('code_source_changed'));
    assert.equal(fs.existsSync(marker), false);
  }
});

test('sync uses system URL rewriting for the observed upstream and rejects later effective configuration drift', async t => {
  const f = fixture(t), remoteHead = f.peerCommit(), config = codeGitConfigurationFixture(t, f.base);
  f.git('config', 'remote.origin.url', 'system-sync:origin');
  config.setSystem('url.' + f.remote + '.insteadOf', 'system-sync:origin');
  const context = f.app.syncContext(f.root, f.input()); assert.equal(context.available, true); assert.equal(context.target, 'origin/main');
  const result = await f.app.sync(f.root, f.request());
  assert.equal(result.status, 'succeeded'); assert.equal(result.fetch.status, 'succeeded'); assert.equal(result.head, remoteHead);
  const observed = f.request(); config.setSystem('fixture.changed', 'after-observation');
  await assert.rejects(f.app.sync(f.root, observed), hasCode('code_source_changed'));
  assert.equal(f.git('rev-parse', 'HEAD'), remoteHead);
});

test('system checkout filters are observed and refuse only integration without invoking the filter', async t => {
  const f = fixture(t); f.write('.gitattributes', '*.txt filter=review\n'); f.commit('attributes'); f.git('push', 'origin', 'main'); f.gitAt(f.peer, 'pull', '--ff-only');
  const remoteHead = f.peerCommit(), location = f.input(), config = codeGitConfigurationFixture(t, f.base), marker = path.join(f.base, 'system-filter-ran'), filter = path.join(f.base, 'filter.mjs');
  fs.writeFileSync(filter, "import fs from 'node:fs';\nfs.writeFileSync(" + JSON.stringify(marker) + ", 'ran'); process.stdin.pipe(process.stdout);\n");
  config.setSystem('filter.review.clean', config.command(filter)); config.setSystem('filter.review.smudge', config.command(filter));
  const head = f.git('rev-parse', 'HEAD'), context = f.app.syncContext(f.root, location);
  const result = await f.app.sync(f.root, { ...location, expectedRevision: context.revision });
  assert.equal(result.fetch.status, 'succeeded'); assert.equal(result.rebase.status, 'unavailable'); assert.equal(result.push.status, 'not-requested');
  assert.match(result.rebase.message, /外部文件转换/); assert.equal(fs.existsSync(marker), false);
  assert.equal(f.git('rev-parse', 'HEAD'), head); assert.equal(f.git('rev-parse', 'refs/remotes/origin/main'), remoteHead);
});

test('sync observes a fixed upstream, fetches only its ref and skips already equal work', async t => {
  const f = fixture(t); f.gitAt(f.peer, 'branch', 'unrelated'); f.gitAt(f.peer, 'push', 'origin', 'unrelated');
  f.git('remote', 'add', 'unavailable', path.join(f.base, 'missing.git'));
  const context = f.app.syncContext(f.root, f.input()); assert.equal(context.available, true); assert.equal(context.target, 'origin/main'); assert.equal(context.ahead, 0); assert.equal(context.behind, 0);
  const result = await f.app.sync(f.root, f.request());
  assert.equal(result.status, 'succeeded'); assert.equal(result.fetch.status, 'succeeded'); assert.equal(result.rebase.status, 'not-requested'); assert.equal(result.push.status, 'not-requested');
  assert.equal(f.git('rev-parse', 'HEAD'), f.initial); assert.throws(() => f.git('rev-parse', '--verify', 'refs/remotes/origin/unrelated')); assert.equal(f.git('for-each-ref', '--format=%(refname)', 'refs/buildr-fetch/'), '');
  assert.equal(CODE_HTTP_VALIDATORS.validate(CODE_HTTP_SCHEMAS.sync.$id, result).valid, true);
});

test('ahead-only sync pushes all pending commits while preserving staged, unstaged and untracked work', async t => {
  const f = fixture(t); f.write('local-one.txt', 'one\n'); f.commit('one'); f.write('local-two.txt', 'two\n'); const head = f.commit('two');
  f.write('base.txt', 'staged\n'); f.git('add', 'base.txt'); f.write('base.txt', 'working\n'); f.write('untracked.txt', 'keep\n'); const index = f.index();
  const result = await f.app.sync(f.root, f.request());
  assert.equal(result.status, 'succeeded'); assert.equal(result.rebase.status, 'not-requested'); assert.equal(result.push.status, 'succeeded'); assert.equal(f.gitAt(f.remote, 'rev-parse', 'main'), head); assert.deepEqual(f.index(), index); assert.equal(fs.readFileSync(path.join(f.root, 'base.txt'), 'utf8'), 'working\n'); assert.equal(fs.readFileSync(path.join(f.root, 'untracked.txt'), 'utf8'), 'keep\n');
});

test('behind-only sync fast-forwards exactly to fetched upstream without a merge or linked checkout effects', async t => {
  for (const format of ['sha1', 'sha256']) {
    const f = fixture(t, format), linked = path.join(f.base, 'linked'); f.git('worktree', 'add', '-b', 'linked', linked); f.write('base.txt', 'linked dirty\n', linked);
    const remoteHead = f.peerCommit(), result = await f.app.sync(f.root, f.request());
    assert.equal(result.status, 'succeeded'); assert.equal(result.rebase.status, 'succeeded'); assert.equal(result.head, remoteHead); assert.equal(result.push.status, 'not-requested'); assert.equal(f.git('rev-list', '--count', 'HEAD'), '2'); assert.equal(f.gitAt(linked, 'rev-parse', 'HEAD'), f.initial); assert.equal(fs.readFileSync(path.join(linked, 'base.txt'), 'utf8'), 'linked dirty\n');
  }
});

test('diverged sync rebases only local pending commits and then ordinarily pushes the new head', async t => {
  const f = fixture(t); f.write('local.txt', 'local\n'); const oldLocal = f.commit('local pending'), remoteHead = f.peerCommit();
  const result = await f.app.sync(f.root, f.request());
  assert.equal(result.status, 'succeeded'); assert.equal(result.rebase.status, 'succeeded'); assert.equal(result.push.status, 'succeeded'); assert.notEqual(result.head, oldLocal); assert.equal(f.git('rev-parse', 'HEAD^'), remoteHead); assert.equal(f.gitAt(f.remote, 'rev-parse', 'main'), result.head); assert.equal(f.git('show', 'HEAD:local.txt'), 'local'); assert.equal(f.git('show', 'HEAD:remote.txt'), 'remote'); assert.equal(f.git('status', '--porcelain'), '');
});

test('dirty work blocks only needed integration after preserving successful fetch', async t => {
  const f = fixture(t); const remoteHead = f.peerCommit(); f.write('base.txt', 'staged\n'); f.git('add', 'base.txt'); f.write('base.txt', 'working\n'); const index = f.index();
  const result = await f.app.sync(f.root, f.request());
  assert.equal(result.status, 'unavailable'); assert.equal(result.fetch.status, 'succeeded'); assert.equal(result.rebase.status, 'unavailable'); assert.equal(result.push.status, 'not-requested'); assert.equal(f.git('rev-parse', 'refs/remotes/origin/main'), remoteHead); assert.equal(f.git('rev-parse', 'HEAD'), f.initial); assert.deepEqual(f.index(), index); assert.equal(fs.readFileSync(path.join(f.root, 'base.txt'), 'utf8'), 'working\n');
});

test('rebase conflicts preserve actual conflict state and stop before pushing', async t => {
  const f = fixture(t); f.write('base.txt', 'local conflicting\n'); const localHead = f.commit('local conflict'), remoteHead = f.peerCommit('base.txt', 'remote conflicting\n');
  const result = await f.app.sync(f.root, f.request());
  assert.equal(result.status, 'failed'); assert.equal(result.fetch.status, 'succeeded'); assert.equal(result.rebase.status, 'failed'); assert.equal(result.push.status, 'not-requested'); assert.equal(f.gitAt(f.remote, 'rev-parse', 'main'), remoteHead); assert.equal(f.git('rev-parse', 'refs/heads/main'), localHead); assert.ok(f.git('status', '--porcelain').includes('UU base.txt')); assert.ok(fs.existsSync(path.join(f.root, '.git', 'rebase-merge'))); assert.ok(fs.readFileSync(path.join(f.root, 'base.txt'), 'utf8').includes('<<<<<<<'));
  assert.equal(f.app.syncContext(f.root, f.input()).available, false);
});

test('integration success remains confirmed when a remote hook rejects the following push', async t => {
  const f = fixture(t); f.write('local.txt', 'local\n'); f.commit('local pending'); const remoteHead = f.peerCommit();
  fs.writeFileSync(path.join(f.remote, 'hooks', 'pre-receive'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  const result = await f.app.sync(f.root, f.request());
  assert.equal(result.status, 'failed'); assert.equal(result.fetch.status, 'succeeded'); assert.equal(result.rebase.status, 'succeeded'); assert.equal(result.push.status, 'failed'); assert.equal(f.git('rev-parse', 'HEAD^'), remoteHead); assert.equal(f.gitAt(f.remote, 'rev-parse', 'main'), remoteHead); assert.equal(f.git('status', '--porcelain'), '');
});

test('stale HEAD, configuration and same-path replaced checkout observations reject before remote writes', async t => {
  const f = fixture(t), request = f.request(); f.write('local.txt', 'local\n'); f.commit('later');
  await assert.rejects(f.app.sync(f.root, request), hasCode('code_source_changed'));
  const current = f.request(); f.git('config', 'remote.origin.pushurl', path.join(f.base, 'other.git')); await assert.rejects(f.app.sync(f.root, current), hasCode('code_source_changed'));
  f.git('config', '--unset', 'remote.origin.pushurl'); const replaced = f.request(); fs.renameSync(path.join(f.root, '.git'), path.join(f.base, 'saved-git')); f.git('init', '--initial-branch=main');
  await assert.rejects(f.app.sync(f.root, replaced)); assert.equal(f.gitAt(f.remote, 'rev-parse', 'main'), f.initial);
});

test('untracked ignored content, external filters, rewritten upstream and local merges remain safe local refusals', async t => {
  {
    const f = fixture(t); f.write('.gitignore', 'collision.txt\n'); f.commit('ignore'); f.git('push', 'origin', 'main'); f.gitAt(f.peer, 'pull', '--ff-only'); f.write('collision.txt', 'remote tracked\n', f.peer); f.gitAt(f.peer, 'add', '--force', 'collision.txt'); f.commitAt(f.peer, 'track ignored path'); f.gitAt(f.peer, 'push', 'origin', 'main'); f.write('collision.txt', 'ignored local\n');
    const result = await f.app.sync(f.root, f.request()); assert.equal(result.rebase.status, 'unavailable'); assert.equal(fs.readFileSync(path.join(f.root, 'collision.txt'), 'utf8'), 'ignored local\n');
  }
  {
    const f = fixture(t), marker = path.join(f.base, 'filter-ran'); f.git('config', 'filter.external.smudge', 'touch ' + marker); f.write('.gitattributes', '*.txt filter=external\n'); f.commit('attributes'); f.git('push', 'origin', 'main'); f.gitAt(f.peer, 'pull', '--ff-only'); f.peerCommit();
    const result = await f.app.sync(f.root, f.request()); assert.equal(result.rebase.status, 'unavailable'); assert.equal(fs.existsSync(marker), false);
  }
  {
    const f = fixture(t); f.peerCommit(); f.git('fetch', 'origin'); f.gitAt(f.peer, 'reset', '--hard', f.initial); f.write('rewrite.txt', 'rewrite\n', f.peer); f.commitAt(f.peer, 'rewritten'); f.gitAt(f.peer, 'push', '--force', 'origin', 'main');
    const result = await f.app.sync(f.root, f.request()); assert.equal(result.fetch.status, 'succeeded'); assert.equal(result.rebase.status, 'unavailable'); assert.ok(result.rebase.message.includes('改写')); assert.equal(result.push.status, 'not-requested');
  }
  {
    const f = fixture(t); f.git('switch', '-c', 'topic'); f.write('topic.txt', 'topic\n'); f.commit('topic'); f.git('switch', 'main'); f.write('main.txt', 'main\n'); f.commit('main'); f.git('merge', '--no-ff', '-m', 'local merge', 'topic'); const localHead = f.git('rev-parse', 'HEAD'); f.peerCommit();
    const result = await f.app.sync(f.root, f.request()); assert.equal(result.rebase.status, 'unavailable'); assert.ok(result.rebase.message.includes('合并提交')); assert.equal(f.git('rev-parse', 'HEAD'), localHead);
  }
});

test('fetch-time index, dirty-content and configuration drift cannot slip into integration or push', async t => {
  for (const drift of ['index', 'file', 'configuration']) {
    const f = fixture(t); f.peerCommit(); f.write('dirty.txt', 'before\n');
    const app = f.isolated(async (source, args, options) => {
      const result = await runCodeGitMutation(source, args, options);
      if (args.includes('fetch')) {
        if (drift === 'index') f.git('add', 'dirty.txt');
        if (drift === 'file') f.write('dirty.txt', 'after drift\n');
        if (drift === 'configuration') f.git('config', 'branch.main.merge', 'refs/heads/other');
      }
      return result;
    });
    const result = await app.sync(f.root, { ...f.input(), expectedRevision: app.syncContext(f.root, f.input()).revision });
    assert.notEqual(result.status, 'succeeded'); assert.equal(result.push.status, 'not-requested'); assert.equal(f.git('rev-parse', 'HEAD'), f.initial);
  }
});

test('all application Git writes share the real repository lock across linked worktrees', async t => {
  const f = fixture(t), linked = path.join(f.base, 'linked'); f.git('worktree', 'add', '-b', 'linked', linked);
  const selected = f.app.sourceControl(f.root).repositories[0].worktrees.find(item => item.location === linked)!;
  const request = f.request(), release = acquireCodeGitOperation(f.app.syncContext(f.root, { repositoryId: 'repo', worktreeId: selected.worktreeId }).source);
  try {
    await assert.rejects(f.app.sync(f.root, request), hasCode('code_git_operation_in_progress'));
    f.write('dirty.txt', 'dirty\n'); await assert.rejects(f.app.commitChanges(f.root, { ...f.input(), expectedRevision: f.app.commitContext(f.root, f.input()).revision, message: 'dirty', mode: 'commit' }), hasCode('code_git_operation_in_progress'));
    const context = f.app.commitContext(f.root, f.input()); await assert.rejects(f.app.push(f.root, { ...f.input(), expectedHead: context.head!, expectedPushRevision: context.push.revision }), hasCode('code_git_operation_in_progress'));
    const branch = f.app.branches(f.root, f.input()), target = branch.branches.find(item => item.kind === 'local' && item.name === 'main')!; assert.throws(() => f.app.switchBranch(f.root, { ...f.input(), expectedRevision: branch.observedRevision, targetRef: target.ref, expectedTargetHash: target.hash }), hasCode('code_git_operation_in_progress'));
    const repository = f.app.sourceControl(f.root).repositories[0], result = await f.app.fetch(f.root, { repositories: [{ repositoryId: 'repo', expectedGitId: repository.gitId, expectedCheckoutId: repository.source!.checkoutId }] }); assert.equal(result.repositories[0].status, 'unavailable');
  } finally { release(); }
  assert.equal((await f.app.sync(f.root, f.request())).status, 'succeeded');
});

test('sync HTTP requires write authorization and rejects unknown fields while observation stays read-only', async t => {
  const f = fixture(t), http = createCodeHttpContribution(f.app), request = f.request();
  const context = { request: { method: 'POST' }, root: f.root, suffix: '/code/sync', searchParams: new URLSearchParams(), readJsonBody: async () => request };
  await assert.rejects(http.handle(context), hasCode('code_write_unauthorized'));
  await assert.rejects(http.handle({ ...context, authorizeWrite: () => {}, readJsonBody: async () => ({ ...request, force: true }) }), hasCode('code_sync_input_invalid'));
  await assert.rejects(http.handle({ ...context, authorizeWrite: () => {}, searchParams: new URLSearchParams({ path: '/tmp/other' }) }), hasCode('code_query_invalid'));
  const read = await http.handle({ request: { method: 'GET' }, root: f.root, suffix: '/code/sync-context', searchParams: new URLSearchParams(f.input()) }); assert.equal(read?.status, 200); assert.equal((CODE_HTTP_PATHS as Record<string, string>).sync, undefined);
  let authorized = false; const result = await http.handle({ ...context, authorizeWrite: () => { authorized = true; }, submitTaskRead: async () => { throw Error('write entered read worker'); } }); assert.equal(authorized, true); assert.equal(result?.status, 200);
});

test('expanded push URLs are pinned once instead of being rewritten to another repository', async t => {
  const f = fixture(t), other = path.join(f.base, 'other.git'); f.gitAt(f.base, 'clone', '--bare', f.remote, other);
  f.git('remote', 'set-url', '--push', 'origin', 'fixture-original:'); f.git('config', 'url.' + f.remote + '.insteadOf', 'fixture-original:'); f.git('config', 'url.' + other + '.insteadOf', f.remote);
  assert.equal(f.git('remote', 'get-url', '--push', 'origin'), f.remote);
  f.write('local.txt', 'local\n'); const head = f.commit('pending'); const context = f.app.commitContext(f.root, f.input());
  const result = await f.app.push(f.root, { ...f.input(), expectedHead: context.head!, expectedPushRevision: context.push.revision });
  assert.equal(result.push.status, 'succeeded'); assert.equal(f.gitAt(f.remote, 'rev-parse', 'main'), head); assert.equal(f.gitAt(other, 'rev-parse', 'main'), f.initial);
});

test('integration timeout and post-write observation drift preserve known stages without retrying', async t => {
  {
    const f = fixture(t); f.write('local.txt', 'local\n'); const localHead = f.commit('pending'); f.peerCommit(); let attempts = 0;
    const app = f.isolated(async (source, args, options) => {
      if (args.includes('rebase')) { attempts += 1; return { ok: false, timedOut: true, stdout: '', stderr: 'timeout', code: null }; }
      return runCodeGitMutation(source, args, options);
    });
    const result = await app.sync(f.root, { ...f.input(), expectedRevision: app.syncContext(f.root, f.input()).revision });
    assert.equal(result.status, 'unknown'); assert.equal(result.fetch.status, 'succeeded'); assert.equal(result.rebase.status, 'unknown'); assert.equal(result.push.status, 'not-requested'); assert.equal(attempts, 1); assert.equal(f.git('rev-parse', 'HEAD'), localHead);
  }
  {
    const f = fixture(t); f.write('local.txt', 'local\n'); f.commit('pending'); const remoteHead = f.peerCommit();
    const app = f.isolated(async (source, args, options) => {
      const result = await runCodeGitMutation(source, args, options);
      if (args.includes('rebase') && result.ok) f.git('config', 'branch.main.merge', 'refs/heads/later');
      return result;
    });
    const result = await app.sync(f.root, { ...f.input(), expectedRevision: app.syncContext(f.root, f.input()).revision });
    assert.equal(result.status, 'unknown'); assert.equal(result.fetch.status, 'succeeded'); assert.equal(result.rebase.status, 'unknown'); assert.equal(result.push.status, 'not-requested'); assert.equal(f.git('rev-parse', 'HEAD^'), remoteHead);
  }
  {
    const f = fixture(t); f.write('local.txt', 'local\n'); const localHead = f.commit('pending');
    const app = f.isolated(async (source, args, options) => {
      const result = await runCodeGitMutation(source, args, options);
      if (args.includes('push') && result.ok) f.git('switch', '-c', 'later');
      return result;
    });
    const result = await app.sync(f.root, { ...f.input(), expectedRevision: app.syncContext(f.root, f.input()).revision });
    assert.equal(result.status, 'unknown'); assert.equal(result.push.status, 'succeeded'); assert.equal(result.branch, 'later'); assert.equal(f.gitAt(f.remote, 'rev-parse', 'main'), localHead);
  }
  {
    const f = fixture(t); f.write('local.txt', 'local\n'); const localHead = f.commit('pending');
    const app = f.isolated(async (source, args, options) => {
      const result = await runCodeGitMutation(source, args, options);
      if (args.includes('update-ref') && args.includes('refs/remotes/origin/main') && !options?.input && result.ok) f.git('update-ref', 'refs/remotes/origin/main', f.initial, localHead);
      return result;
    });
    const result = await app.sync(f.root, { ...f.input(), expectedRevision: app.syncContext(f.root, f.input()).revision });
    assert.equal(result.status, 'unknown'); assert.equal(result.push.status, 'succeeded'); assert.equal(f.gitAt(f.remote, 'rev-parse', 'main'), localHead); assert.equal(f.git('rev-parse', 'refs/remotes/origin/main'), f.initial);
  }
});
