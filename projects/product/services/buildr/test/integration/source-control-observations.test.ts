import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createCodeApplication } from '../../src/modules/code/application/code-application.ts';
import { SourceControlObservations, type SourceControlWatchResult } from '../../src/modules/code/application/source-control-observations.ts';
import { CODE_HTTP_SCHEMAS, CODE_HTTP_VALIDATORS } from '../../src/modules/code/interfaces/http/code-http-contracts.ts';
import { createCodeHttpContribution } from '../../src/modules/code/interfaces/http/code-http.ts';

function deadline<T>(promise: Promise<T>, ms = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Observation did not settle.')), ms);
    promise.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
  });
}
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function fixture(t: test.TestContext, options: { waitMs?: number; idleMs?: number } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-code-watch-'));
  const git = (location: string, ...args: string[]) => execFileSync('git', ['--no-optional-locks', '-C', location, ...args], { encoding: 'utf8', env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const locations = ['one', 'two'].map(name => {
    const location = path.join(root, name); fs.mkdirSync(location);
    git(location, 'init', '--initial-branch=main'); git(location, 'config', 'user.name', 'Watch Fixture'); git(location, 'config', 'user.email', 'watch@example.com'); git(location, 'config', 'commit.gpgSign', 'false');
    fs.writeFileSync(path.join(location, 'file.txt'), 'base\n'); git(location, 'add', '.'); git(location, 'commit', '-m', 'initial');
    return location;
  });
  const catalog = { repositories: locations.map((location, index) => ({ id: 'repo-' + index, code: 'r' + index, name: 'Repository ' + index, source: { type: 'workspace', path: location } })), services: [], projects: [] };
  const application = createCodeApplication({ assetCatalog: () => catalog, resolveSourceRoot: (_root, source) => source.path, readTaskScope() { return { projects: [], services: [] }; }, readGitWorktreeEvidence() { return null; } });
  const observations = new SourceControlObservations({ waitMs: 120, batchMs: 35, ...options });
  t.after(() => { observations.close(); fs.rmSync(root, { recursive: true, force: true }); });
  const write = (index: number, content: string, relative = 'file.txt') => { const target = path.join(locations[index], relative); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, content); };
  const quiet = async (cursor: string) => {
    for (let attempt = 0; attempt < 10; attempt++) {
      const current = await deadline(observations.watch(root, cursor));
      if (!current.repositoryIds.length && !current.refreshAll) return current;
      cursor = current.cursor;
    }
    throw Error('Observation never became quiet.');
  };
  const nextInvalidation = async (cursor: string, timeoutMs = 5000, accepts: (value: SourceControlWatchResult) => boolean = value => Boolean(value.repositoryIds.length || value.refsRepositoryIds?.length || value.refreshAll || value.diagnostics?.length)) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      // An empty long-poll response is a heartbeat, not evidence that an expected
      // filesystem notification is missing. Keep one bounded wait across polls.
      while (!controller.signal.aborted) {
        const current = await observations.watch(root, cursor, controller.signal);
        if (controller.signal.aborted) break;
        if (accepts(current)) return current;
        cursor = current.cursor;
      }
      throw Error(`Observation did not invalidate within ${timeoutMs} ms.`);
    } finally {
      clearTimeout(timer); controller.abort();
    }
  };
  const register = async () => { await observations.observe(root, application.sourceControl(root)); return quiet((await observations.watch(root)).cursor); };
  return { root, locations, git, write, catalog, application, observations, quiet, nextInvalidation, register };
}

test('external and atomic saves invalidate only their Repository, including edits of an already modified file', async t => {
  const f = fixture(t); let state = await f.register();
  f.write(0, 'first change\n'); state = await deadline(f.observations.watch(f.root, state.cursor));
  assert.deepEqual(state.repositoryIds, ['repo-0']);
  const first = f.application.sourceControl(f.root, { repositoryId: 'repo-0' });
  f.write(0, 'second change\n'); state = await deadline(f.observations.watch(f.root, state.cursor));
  assert.deepEqual(state.repositoryIds, ['repo-0']);
  const second = f.application.sourceControl(f.root, { repositoryId: 'repo-0' });
  assert.equal(first.repositories[0].fileCount, second.repositories[0].fileCount);
  assert.notEqual(first.observedRevision, second.observedRevision);
  state = await f.quiet(state.cursor);
  const replacement = path.join(f.locations[1], 'replacement.tmp'); fs.writeFileSync(replacement, 'atomic\n'); fs.renameSync(replacement, path.join(f.locations[1], 'file.txt'));
  const atomic = await deadline(f.observations.watch(f.root, state.cursor));
  assert.deepEqual(atomic.repositoryIds, ['repo-1']);
});

test('continuous writes deliver a bounded batch while writing is still active', async t => {
  const f = fixture(t, { waitMs: 1000 }); const state = await f.register();
  let writes = 0;
  const interval = setInterval(() => { f.write(0, 'batch-' + ++writes); }, 10);
  t.after(() => clearInterval(interval));
  const update = await deadline(f.observations.watch(f.root, state.cursor));
  clearInterval(interval);
  assert.deepEqual(update.repositoryIds, ['repo-0']);
  assert.ok(writes >= 1 && writes < 30, `batch arrived after ${writes} ongoing writes`);
  t.diagnostic(`one invalidation batch arrived after ${writes} writes while the 10 ms writer was still running`);
  const subsequent = await deadline(f.observations.watch(f.root, update.cursor));
  assert.equal(subsequent.refreshAll, false);
});

test('shared Git metadata notifies every registered owner and watches independent worktree files', async t => {
  const f = fixture(t);
  f.catalog.repositories[1].source.path = f.locations[0];
  const checkout = path.join(f.root, 'linked'); f.git(f.locations[0], 'worktree', 'add', '-b', 'linked', checkout);
  let state = await f.register();
  fs.writeFileSync(path.join(checkout, 'file.txt'), 'worktree edit\n');
  state = await deadline(f.observations.watch(f.root, state.cursor));
  assert.deepEqual(state.repositoryIds.sort(), ['repo-0', 'repo-1']);
  state = await f.quiet(state.cursor);
  f.git(checkout, 'add', 'file.txt');
  state = await deadline(f.observations.watch(f.root, state.cursor));
  assert.deepEqual(state.repositoryIds.sort(), ['repo-0', 'repo-1']);
  state = await f.quiet(state.cursor);
  f.git(checkout, 'commit', '-m', 'outside commit');
  state = await deadline(f.observations.watch(f.root, state.cursor));
  assert.deepEqual(state.repositoryIds.sort(), ['repo-0', 'repo-1']);
  state = await f.quiet(state.cursor);
  f.git(f.locations[0], 'hash-object', '-w', '--stdin');
  const objectsOnly = await deadline(f.observations.watch(f.root, state.cursor));
  assert.deepEqual(objectsOnly.repositoryIds, [], 'writing an unreachable object is not a status change');
});

test('only complete lightweight inventory retires removed repositories and preserves remaining worktree observations', async t => {
  const f = fixture(t);
  const linked = path.join(f.root, 'linked'); f.git(f.locations[0], 'worktree', 'add', '-b', 'linked', linked);
  let state = await f.register();
  await f.observations.observe(f.root, f.application.sourceControl(f.root, { repositoryId: 'repo-0' }), true);
  f.write(1, 'still registered after a scoped read\n');
  state = await deadline(f.observations.watch(f.root, state.cursor));
  assert.deepEqual(state.repositoryIds, ['repo-1'], 'a scoped status read cannot retire another repository');
  state = await f.quiet(state.cursor);
  f.catalog.repositories.pop();
  const inventory = f.application.sourceControlInventory(f.root);
  const truncated = { ...inventory, coverage: { ...inventory.coverage, truncated: true } };
  const readInventory = (application = f.application) => createCodeHttpContribution(application, f.observations).handle({ request: { method: 'GET' }, suffix: '/code/source-control-inventory', searchParams: new URLSearchParams(), root: f.root });
  await readInventory({ ...f.application, sourceControlInventory: () => truncated });
  f.write(1, 'retained after incomplete inventory\n');
  state = await deadline(f.observations.watch(f.root, state.cursor));
  assert.deepEqual(state.repositoryIds, ['repo-1'], 'truncated inventory cannot prove a registration was removed');
  state = await f.quiet(state.cursor);
  const response = await readInventory();
  assert.equal(response?.status, 200);
  assert.deepEqual((response?.body as typeof inventory).repositories.map(repository => repository.id), ['repo-0']);
  state = await f.quiet(state.cursor);
  f.write(1, 'retired source is silent\n');
  const retired = await deadline(f.observations.watch(f.root, state.cursor));
  assert.deepEqual(retired.repositoryIds, [], 'complete registration inventory releases the removed source watcher');
  fs.writeFileSync(path.join(linked, 'file.txt'), 'remaining independent worktree edit\n');
  assert.deepEqual((await deadline(f.observations.watch(f.root, retired.cursor))).repositoryIds, ['repo-0'], 'pending inventory cannot replace the remaining verified worktree watch facts');
});

test('an older in-flight partial status cannot restore a watcher retired by newer inventory, while a new request can observe a re-registered source', async t => {
  const f = fixture(t); let state = await f.register();
  const http = createCodeHttpContribution(f.application, f.observations);
  const snapshot = f.application.sourceControl(f.root, { repositoryId: 'repo-1' });
  let release!: (body: typeof snapshot) => void;
  const delayed = http.handle({ request: { method: 'GET' }, suffix: '/code/source-control', searchParams: new URLSearchParams({ repositoryId: 'repo-1' }), root: f.root, submitTaskRead: () => new Promise(resolve => { release = resolve; }) });
  const removed = f.catalog.repositories.pop()!;
  await http.handle({ request: { method: 'GET' }, suffix: '/code/source-control-inventory', searchParams: new URLSearchParams(), root: f.root });
  state = await f.quiet(state.cursor);
  release(snapshot); assert.equal((await delayed)?.status, 200, 'a completed read remains a successful response');
  state = await f.quiet(state.cursor);
  f.write(1, 'retired source remains silent after late response\n');
  const retired = await deadline(f.observations.watch(f.root, state.cursor));
  assert.deepEqual(retired.repositoryIds, [], 'the older response cannot recreate the retired watcher');
  f.write(0, 'other registered source is still observed\n');
  state = await deadline(f.observations.watch(f.root, retired.cursor));
  assert.deepEqual(state.repositoryIds, ['repo-0']);
  state = await f.quiet(state.cursor);
  f.catalog.repositories.push(removed);
  await http.handle({ request: { method: 'GET' }, suffix: '/code/source-control', searchParams: new URLSearchParams({ repositoryId: 'repo-1' }), root: f.root });
  state = await f.quiet(state.cursor);
  f.write(1, 're-registered source is live after a new request\n');
  assert.deepEqual((await deadline(f.observations.watch(f.root, state.cursor))).repositoryIds, ['repo-1'], 'a new authoritative request may discover registrations newer than the last inventory');
});

test('a cold first status request retains the inventory retirement boundary without attaching filesystem watchers before its response', async t => {
  const f = fixture(t);
  const snapshot = f.application.sourceControl(f.root, { repositoryId: 'repo-1' });
  const filesystem = t.mock.method(fs, 'watch');
  const http = createCodeHttpContribution(f.application, f.observations);
  let release!: (body: typeof snapshot) => void;
  const delayed = http.handle({ request: { method: 'GET' }, suffix: '/code/source-control', searchParams: new URLSearchParams({ repositoryId: 'repo-1' }), root: f.root, submitTaskRead: () => new Promise(resolve => { release = resolve; }) });
  assert.equal(filesystem.mock.callCount(), 0, 'starting a read ticket cannot attach filesystem watchers');
  f.catalog.repositories.pop();
  await http.handle({ request: { method: 'GET' }, suffix: '/code/source-control-inventory', searchParams: new URLSearchParams(), root: f.root });
  assert.equal(filesystem.mock.callCount(), 0, 'registration inventory cannot attach filesystem watchers');
  release(snapshot); assert.equal((await delayed)?.status, 200);
  const state = await f.quiet((await f.observations.watch(f.root)).cursor);
  f.write(1, 'cold retired source stays silent\n');
  assert.deepEqual((await deadline(f.observations.watch(f.root, state.cursor))).repositoryIds, [], 'the first delayed status response cannot attach a retired source');
  assert.equal(filesystem.mock.callCount(), 0);
});

test('closed or capacity-limited observation tickets cannot block a successful authoritative status read', async t => {
  for (const failure of ['closed', 'capacity']) {
    const f = fixture(t, { waitMs: 5000 });
    const controllers: AbortController[] = [], pending: Array<Promise<SourceControlWatchResult>> = [];
    if (failure === 'closed') f.observations.close();
    else for (let index = 0; index < 8; index++) {
      const busy = path.join(f.root, 'busy-' + index), initial = await f.observations.watch(busy);
      const controller = new AbortController(); controllers.push(controller);
      pending.push(f.observations.watch(busy, initial.cursor, controller.signal));
    }
    const filesystem = t.mock.method(fs, 'watch');
    try {
      assert.equal(f.observations.beginRead(f.root), undefined, failure + ' observations return an unavailable ticket');
      const response = await createCodeHttpContribution(f.application, f.observations).handle({ request: { method: 'GET' }, suffix: '/code/source-control', searchParams: new URLSearchParams(), root: f.root });
      assert.equal(response?.status, 200, failure + ' observation availability cannot reject the read');
      assert.equal((response?.body as ReturnType<typeof f.application.sourceControl>).repositories.every(repository => repository.status === 'complete'), true);
      assert.equal(filesystem.mock.callCount(), 0);
    } finally {
      filesystem.mock.restore(); controllers.forEach(controller => controller.abort()); await Promise.all(pending);
    }
  }
});

test('ignored build output and nested repositories do not invalidate the parent, but tracked ignored files still do', async t => {
  const f = fixture(t);
  f.write(0, '**/node_modules/\n**/target/\n**/.gradle/\n**/.next/\n**/coverage/\n', '.gitignore'); f.git(f.locations[0], 'add', '.gitignore'); f.git(f.locations[0], 'commit', '-m', 'ignore output');
  fs.mkdirSync(path.join(f.locations[0], 'projects/product/services/example'), { recursive: true });
  const nested = path.join(f.locations[0], 'nested'); fs.renameSync(f.locations[1], nested); f.locations[1] = nested; f.catalog.repositories[1].source.path = nested;
  let state = await f.register();
  f.write(0, 'generated', 'node_modules/package/output.js');
  for (const directory of ['node_modules', 'target', '.gradle', '.next', 'coverage']) {
    for (let index = 0; index < 10; index++) f.write(0, 'generated-' + index, 'projects/product/services/example/' + directory + '/package/output-' + index + '.js');
  }
  const ignored = await deadline(f.observations.watch(f.root, state.cursor));
  assert.deepEqual(ignored.repositoryIds, []);
  f.write(1, 'nested edit'); state = await deadline(f.observations.watch(f.root, ignored.cursor));
  assert.deepEqual(state.repositoryIds, ['repo-1']);
  const tracked = 'projects/product/services/example/target/tracked.js';
  f.write(0, 'tracked output', tracked); f.git(f.locations[0], 'add', '-f', tracked); f.git(f.locations[0], 'commit', '-m', 'tracked generated file');
  state = await f.quiet(state.cursor);
  await f.observations.observe(f.root, f.application.sourceControl(f.root)); state = await f.quiet(state.cursor);
  f.write(0, 'tracked output changed', tracked);
  assert.deepEqual((await deadline(f.observations.watch(f.root, state.cursor))).repositoryIds, ['repo-0']);
});

test('common output names remain observable when Git does not ignore them or when the name is a regular file', async t => {
  const f = fixture(t);
  f.write(0, '**/target/\n', '.gitignore'); f.git(f.locations[0], 'add', '.gitignore'); f.git(f.locations[0], 'commit', '-m', 'ignore directories only');
  fs.mkdirSync(path.join(f.locations[0], 'projects/plain'), { recursive: true });
  let state = await f.register();
  f.write(0, 'ordinary source', 'projects/plain/target');
  state = await deadline(f.observations.watch(f.root, state.cursor));
  assert.deepEqual(state.repositoryIds, ['repo-0'], 'a file named target is not an ignored directory');
  state = await f.quiet(state.cursor);
  f.write(0, 'unignored build content', 'projects/plain/build/output.js');
  assert.deepEqual((await deadline(f.observations.watch(f.root, state.cursor))).repositoryIds, ['repo-0'], 'a conventional output name alone cannot suppress changes');
});

test('ignored local SQLite writes remain quiet beneath tracked .buildr assets without hiding their tracked descendants', async t => {
  const f = fixture(t, { waitMs: 350 });
  f.write(0, '.buildr/local/\nprivate-notes/\n', '.gitignore');
  f.write(0, 'workspace: fixture\n', '.buildr/workspace.yml');
  f.write(0, 'retained asset\n', '.buildr/local/retained.yml');
  f.write(0, 'initial SQLite shared memory', '.buildr/local/workspace.sqlite-shm');
  f.git(f.locations[0], 'add', '.gitignore', '.buildr/workspace.yml');
  f.git(f.locations[0], 'add', '-f', '.buildr/local/retained.yml');
  f.git(f.locations[0], 'commit', '-m', 'track workspace assets beside local runtime output');
  let state = await f.register();
  const waiting = f.observations.watch(f.root, state.cursor);
  for (let index = 0; index < 25; index++) {
    f.write(0, 'SQLite shared memory update ' + index, '.buildr/local/workspace.sqlite-shm');
    await pause(8);
  }
  const ignored = await deadline(waiting);
  assert.deepEqual(ignored.repositoryIds, [], 'ignored SQLite writes cannot drive source-control reads');
  assert.equal(ignored.cursor, state.cursor);
  state = await deadline(f.observations.watch(f.root, ignored.cursor));
  assert.deepEqual(state.repositoryIds, [], 'deferred ignore classification cannot emit a later invalidation');
  assert.equal(state.cursor, ignored.cursor);
  t.diagnostic('25 real SQLite shared-memory writes produced zero invalidation batches');
  f.write(0, 'workspace: updated\n', '.buildr/workspace.yml');
  state = await deadline(f.observations.watch(f.root, state.cursor));
  assert.deepEqual(state.repositoryIds, ['repo-0'], 'tracked workspace assets remain observable');
  state = await f.quiet(state.cursor);
  f.write(0, 'retained asset changed\n', '.buildr/local/retained.yml');
  state = await deadline(f.observations.watch(f.root, state.cursor));
  assert.deepEqual(state.repositoryIds, ['repo-0'], 'tracked ignored descendants remain observable');
  state = await f.quiet(state.cursor);
  f.write(0, 'readable ignored user content\n', 'private-notes/readme.txt');
  assert.deepEqual((await deadline(f.observations.watch(f.root, state.cursor))).repositoryIds, ['repo-0'], 'ordinary ignored user directories retain their existing notifications');
});

test('unselected branch and packed refs changes are distinguished from index changes', async t => {
  const f = fixture(t); let state = await f.register();
  const referencesChanged = (value: SourceControlWatchResult) => Boolean(value.refsRepositoryIds?.includes('repo-0'));
  const watch = f.observations.watch.bind(f.observations);
  let statusOnlyFirst = true;
  t.mock.method(f.observations, 'watch', (...args: Parameters<typeof watch>) => {
    if (statusOnlyFirst) {
      statusOnlyFirst = false;
      return Promise.resolve({ cursor: args[1]!, repositoryIds: ['repo-0'], refsRepositoryIds: [], refreshAll: false });
    }
    return watch(...args);
  });
  const before = f.application.sourceControl(f.root, { repositoryId: 'repo-0' }).observedRevision;
  f.git(f.locations[0], 'branch', 'not-checked-out');
  state = await f.nextInvalidation(state.cursor, 5000, referencesChanged);
  assert.deepEqual(state.refsRepositoryIds, ['repo-0']);
  assert.equal(f.application.sourceControl(f.root, { repositoryId: 'repo-0' }).observedRevision, before, 'status alone cannot detect an unselected branch');
  state = await f.quiet(state.cursor);
  f.git(f.locations[0], 'pack-refs', '--all');
  state = await f.nextInvalidation(state.cursor, 5000, referencesChanged);
  assert.deepEqual(state.refsRepositoryIds, ['repo-0']);
  state = await f.quiet(state.cursor);
  f.write(0, 'staged change'); state = await f.nextInvalidation(state.cursor); state = await f.quiet(state.cursor);
  f.git(f.locations[0], 'add', 'file.txt');
  state = await f.nextInvalidation(state.cursor);
  assert.deepEqual(state.repositoryIds, ['repo-0']);
  assert.deepEqual(state.refsRepositoryIds, []);
});

test('a refs observation arriving after an empty heartbeat is still awaited', async t => {
  const f = fixture(t); const state = await f.register();
  const watch = f.observations.watch.bind(f.observations);
  let emptyHeartbeats = 0;
  t.mock.method(f.observations, 'watch', async (...args: Parameters<typeof watch>) => {
    const current = await watch(...args);
    if (!current.repositoryIds.length && !current.refreshAll && ++emptyHeartbeats === 1) {
      f.git(f.locations[0], 'branch', 'after-first-heartbeat');
    }
    return current;
  });
  const update = await f.nextInvalidation(state.cursor);
  assert.ok(emptyHeartbeats >= 1, 'the Git change is deliberately made after the first empty heartbeat');
  assert.deepEqual(update.repositoryIds, ['repo-0']);
  assert.deepEqual(update.refsRepositoryIds, ['repo-0']);
});

test('waiting for an invalidation preserves unrelated events and cancels the active poll at its deadline', async t => {
  const f = fixture(t); const state = await f.register();
  f.write(0, 'worktree-only change');
  const changed = await f.nextInvalidation(state.cursor);
  assert.deepEqual(changed.repositoryIds, ['repo-0']);
  assert.deepEqual(changed.refsRepositoryIds, [], 'the helper cannot swallow a non-refs event while waiting for refs');
  const quiet = await f.quiet(changed.cursor);
  const watch = f.observations.watch.bind(f.observations);
  let activePolls = 0; let activeSignal: AbortSignal | undefined;
  t.mock.method(f.observations, 'watch', async (...args: Parameters<typeof watch>) => {
    activePolls++; activeSignal = args[2];
    try { return await watch(...args); } finally { activePolls--; }
  });
  await assert.rejects(f.nextInvalidation(quiet.cursor, 30), /Observation did not invalidate within 30 ms\./);
  assert.equal(activeSignal?.aborted, true);
  assert.equal(activePolls, 0, 'a missing notification cannot leave a background watch or retry loop');
});

test('replacing a checkout at the same path rebinds filesystem identity rather than retaining the old inode', async t => {
  const f = fixture(t); let state = await f.register();
  const retained = path.join(f.root, 'old-one'); fs.renameSync(f.locations[0], retained);
  fs.cpSync(f.locations[1], f.locations[0], { recursive: true });
  await f.observations.observe(f.root, f.application.sourceControl(f.root)); state = await f.quiet(state.cursor);
  f.write(0, 'new checkout edit');
  assert.deepEqual((await deadline(f.observations.watch(f.root, state.cursor))).repositoryIds, ['repo-0']);
  state = await f.quiet((await f.observations.watch(f.root)).cursor);
  fs.writeFileSync(path.join(retained, 'file.txt'), 'retired inode edit');
  assert.deepEqual((await deadline(f.observations.watch(f.root, state.cursor))).repositoryIds, [], 'retired directory watchers were released');
});

test('observation is shared, cancellable, bounded, restartable after idle and closes active waits', async t => {
  const f = fixture(t, { idleMs: 60 });
  const first = await f.observations.watch(f.root);
  assert.equal(first.refreshAll, true);
  const oldEpoch = await f.observations.watch(f.root, randomUUID() + ':1'); assert.equal(oldEpoch.refreshAll, true);
  const ahead = await f.observations.watch(f.root, first.cursor.split(':')[0] + ':999'); assert.equal(ahead.refreshAll, true);
  const controller = new AbortController(); const canceled = f.observations.watch(f.root, first.cursor, controller.signal); controller.abort();
  assert.deepEqual((await deadline(canceled)).repositoryIds, []);
  const controllers = Array.from({ length: 128 }, () => new AbortController());
  const waiting = controllers.map(value => f.observations.watch(f.root, first.cursor, value.signal));
  await assert.rejects(f.observations.watch(f.root, first.cursor), { code: 'code_watch_capacity' });
  controllers.forEach(value => value.abort()); await Promise.all(waiting);
  await pause(150);
  const restarted = await f.observations.watch(f.root, first.cursor); assert.equal(restarted.refreshAll, true); assert.notEqual(restarted.cursor, first.cursor);
  const active = f.observations.watch(f.root, restarted.cursor); f.observations.close(); await deadline(active);
  await assert.rejects(f.observations.watch(f.root), { code: 'code_watch_closed' });
});

test('watch failures retain readable Git facts and return diagnostics instead of reporting clean state', async t => {
  const f = fixture(t);
  t.mock.method(fs, 'watch', () => { throw Object.assign(Error('watch unavailable'), { code: 'ENOSPC' }); });
  const current = f.application.sourceControl(f.root); await f.observations.observe(f.root, current);
  assert.equal(current.repositories.every(repository => repository.status === 'complete'), true);
  const state = await f.observations.watch(f.root);
  assert.ok(state.diagnostics?.some(message => message.includes('低频核对')));
  assert.equal(CODE_HTTP_VALIDATORS.validate(CODE_HTTP_SCHEMAS.sourceControlWatch.$id, state).valid, true);
});

test('persistent watch failure does not self-invalidate repeated reads, and a successful recovery catches up once', async t => {
  const f = fixture(t);
  const unavailable = t.mock.method(fs, 'watch', () => { throw Object.assign(Error('watch unavailable'), { code: 'ENOSPC' }); });
  const snapshot = f.application.sourceControl(f.root);
  await f.observations.observe(f.root, snapshot);
  const baseline = await f.quiet((await f.observations.watch(f.root)).cursor);
  for (let attempt = 0; attempt < 3; attempt++) {
    await f.observations.observe(f.root, snapshot);
    const unchanged = await deadline(f.observations.watch(f.root, baseline.cursor));
    assert.equal(unchanged.cursor, baseline.cursor, 'an unchanged ENOSPC result cannot drive another read');
    assert.deepEqual(unchanged.repositoryIds, []);
    assert.ok(unchanged.diagnostics?.length);
  }
  unavailable.mock.restore();
  await f.observations.observe(f.root, snapshot);
  const recovered = await deadline(f.observations.watch(f.root, baseline.cursor));
  assert.deepEqual(recovered.repositoryIds.sort(), ['repo-0', 'repo-1']);
  assert.deepEqual(recovered.diagnostics, []);
  await f.observations.observe(f.root, snapshot);
  assert.equal((await deadline(f.observations.watch(f.root, recovered.cursor))).cursor, recovered.cursor);
});

test('shared background requests coalesce in flight and reuse observations; explicit reads and source changes remain fresh', async t => {
  const f = fixture(t); await f.register();
  const contribution = createCodeHttpContribution(f.application, f.observations);
  let scans = 0;
  const read = (id = 'repo-0', shared = true) => contribution.handle({request:{method:'GET'},suffix:'/code/source-control',root:f.root,
    searchParams:new URLSearchParams({repositoryId:id,...(shared ? {observation:'shared'} : {})}),
    submitTaskRead:async (_operation,_task,input,signal) => {
      scans++; assert.equal(Boolean(signal),shared);
      await pause(25); return f.application.sourceControl(f.root,JSON.parse(input.input));
    }});
  const first = await Promise.all([read(),read(),read()]);
  assert.equal(scans,1); assert.deepEqual(first[0],first[2]);
  await read(); assert.equal(scans,1);
  await read('repo-1'); assert.equal(scans,2);
  await read('repo-0',false); assert.equal(scans,3);
  await read(); assert.equal(scans,4);
  f.observations.invalidateReads(f.root,['repo-0']);
  await read('repo-1'); assert.equal(scans,4,'unrelated repository keeps its observation');
  await read(); assert.equal(scans,5);
  f.catalog.repositories[0].name = 'Renamed';
  const renamed = await read(); assert.equal(scans,6); assert.equal(renamed!.body.repositories[0].name,'Renamed');
  const replaced = f.locations[0] + '-retired';
  fs.renameSync(f.locations[0],replaced); fs.cpSync(replaced,f.locations[0],{recursive:true});
  await read(); assert.equal(scans,7,'directory identity replacement invalidates before notification delivery');
  const before = await f.quiet((await f.observations.watch(f.root)).cursor);
  f.write(0,'external shared change\n'); await f.nextInvalidation(before.cursor);
  const changed = await read(); assert.equal(scans,8); assert.equal(changed!.body.repositories[0].fileCount,1);
});

test('shared reads fence changes during execution, isolate scopes, expire and cancel on owner shutdown', async () => {
  const {SourceControlSharedReads} = await import('../../src/modules/code/application/source-control-shared-reads.ts');
  const reads = new SourceControlSharedReads(10);
  const value = {diagnostics:[],readAt:new Date().toISOString()} as any;
  let calls = 0, finish!: (value:any) => void;
  const first = reads.read('scope/a','a','v1',async () => { calls++; return new Promise(resolve => { finish=resolve; }); });
  const same = reads.read('scope/a','a','v1',async () => { throw Error('duplicate'); });
  await pause(0); assert.equal(calls,1);
  reads.invalidate(['a']);
  const next = reads.read('scope/a','a','v1',async () => { calls++; return value; });
  finish(value); await Promise.all([first,same,next]); assert.equal(calls,2);
  await reads.read('scope/a','a','v1',async () => { throw Error('not expired'); });
  await reads.read('other/a','a','v1',async () => { calls++; return value; }); assert.equal(calls,3);
  await pause(15);
  await reads.read('scope/a','a','v1',async () => { calls++; return value; }); assert.equal(calls,4);
  await assert.rejects(reads.read('bad','b','v1',async () => { throw Error('failed'); }));
  await reads.read('bad','b','v1',async () => { calls++; return value; }); assert.equal(calls,5,'failed reads never poison later reads');
  let signal!: AbortSignal;
  const pending = reads.read('pending','c','v1',async current => { signal=current; return new Promise((_resolve,reject) => current.addEventListener('abort',() => reject(Error('owner closed')),{once:true})); });
  await pause(0); reads.close(); assert.equal(signal.aborted,true); await assert.rejects(pending,/owner closed/);
});

test('shared observations bound completed entries and bytes rather than retaining every status forever', async () => {
  const {SourceControlSharedReads} = await import('../../src/modules/code/application/source-control-shared-reads.ts');
  const reads = new SourceControlSharedReads();
  const value = {diagnostics:[],readAt:'observed'} as any;
  for(let i=0;i<129;i++) await reads.read(String(i),String(i),'v1',async()=>value);
  let repeated=0; await reads.read('0','0','v1',async()=>{repeated++;return value;}); assert.equal(repeated,1);
  const large={...value,payload:'x'.repeat(3*1024*1024)};
  await reads.read('large-a','a','v1',async()=>large); await reads.read('large-b','b','v1',async()=>large);
  await reads.read('large-a','a','v1',async()=>{repeated++;return large;}); assert.equal(repeated,2);
  const concurrent = new SourceControlSharedReads();
  await Promise.all(['x','y'].map(key=>concurrent.read(key,key,'v1',async()=>large)));
  await concurrent.read('x','x','v1',async()=>{repeated++;return large;}); assert.equal(repeated,3,'simultaneously completing reads also respect the byte budget');
  concurrent.close();
  reads.close();
});
