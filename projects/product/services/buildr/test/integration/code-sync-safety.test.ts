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

import { fixture, hasCode, sessionApplication } from '../helpers/code-sync-application-fixture.ts';

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
