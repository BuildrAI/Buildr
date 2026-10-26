import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createCodeApplication } from '../../src/modules/code/application/code-application.ts';
import { createCodeCommitApplication } from '../../src/modules/code/application/code-commit-application.ts';
import { createCodeHttpContribution } from '../../src/modules/code/interfaces/http/code-http.ts';
import { CODE_HTTP_SCHEMAS, CODE_HTTP_VALIDATORS } from '../../src/modules/code/interfaces/http/code-http-contracts.ts';
import { runCodeGitMutation } from '../../src/modules/code/infrastructure/code-git-mutation-runner.ts';

import { fixture, hasCode, advanceRemote, shellQuote, waitForFile } from '../helpers/code-commit-application-fixture.ts';

test('commit and sync rebases the successful local commit then pushes the final head in one authorized request', async t => {
  const f = fixture(t); f.write('same.txt', 'base\n'); f.commit(); const remote = f.remote(), remoteHead = advanceRemote(f, remote);
  f.write('same.txt', 'current\n'); const http = createCodeHttpContribution(f.app), input = f.request('local current', 'commit-sync');
  let authorized = 0;
  const response = await http.handle({ request: { method: 'POST' }, root: f.root, suffix: '/code/commit-changes', searchParams: new URLSearchParams(), readJsonBody: async () => input, authorizeWrite: () => { authorized++; }, submitTaskRead: async () => { throw Error('write entered read worker'); } });
  assert.equal(response?.status, 200); assert.equal(authorized, 1);
  const result = response!.body as Awaited<ReturnType<typeof f.app.commitChanges>>;
  assert.equal(result.commit.completed, true); assert.equal(result.commit.status, 'succeeded'); assert.equal(result.sync?.status, 'succeeded');
  assert.equal(result.sync?.fetch.status, 'succeeded'); assert.equal(result.sync?.rebase.status, 'succeeded'); assert.equal(result.sync?.push.status, 'succeeded');
  assert.notEqual(result.commit.hash, result.sync?.head); assert.equal(f.git('show', '-s', '--format=%P', result.sync!.head!), remoteHead);
  assert.equal(f.git('show', result.commit.hash + ':same.txt'), 'current'); assert.equal(f.git('show', 'HEAD:remote.txt'), 'remote'); assert.equal(f.git('show', 'HEAD:same.txt'), 'current');
  assert.equal(f.gitAt(remote, 'rev-parse', 'refs/heads/main'), result.sync?.head); assert.equal(f.git('status', '--porcelain'), '');
  assert.equal(result.push.status, 'not-requested'); assert.equal(result.push.retry, null); assert.equal(CODE_HTTP_VALIDATORS.validate(CODE_HTTP_SCHEMAS.commitChanges.$id, result).valid, true);
});

test('commit and sync without an upstream preserves the successful local commit and reports sync unavailable', async t => {
  const f = fixture(t); f.write('same.txt', 'base\n'); f.commit(); f.write('same.txt', 'current\n');
  const result = await f.app.commitChanges(f.root, f.request('local only', 'commit-sync'));
  assert.equal(result.commit.completed, true); assert.equal(result.sync?.status, 'unavailable'); assert.equal(result.sync?.fetch.status, 'not-requested');
  assert.equal(f.git('rev-list', '--count', 'HEAD'), '2'); assert.equal(f.git('rev-parse', 'HEAD'), result.commit.hash); assert.equal(f.git('status', '--porcelain'), '');
  assert.equal(result.push.retry, null);
});

test('sync preparation failures do not suppress valid commits or swallow commit input and version refusals', async t => {
  for (const failure of ['prepare', 'execute']) {
    const f = fixture(t); f.write('same.txt', 'base\n'); f.commit(); f.write('same.txt', 'current\n');
    const current = f.app.commitSnapshot(f.root, f.input(), { includeDiff: false }).source;
    const app = createCodeCommitApplication({ source: () => current, prepareCommitSync: () => { if (failure === 'prepare') throw Error('fixture sync preparation unavailable'); return async () => { throw Error('fixture sync observation unavailable'); }; } });
    const stale = f.request('one local commit', 'commit-sync'); f.write('same.txt', 'later\n');
    await assert.rejects(app.commitChanges(f.root, stale), hasCode('code_source_changed'));
    await assert.rejects(app.commitChanges(f.root, { ...f.request('one local commit', 'commit-sync'), message: '' }), hasCode('code_commit_input_invalid'));
    assert.equal(f.git('rev-list', '--count', 'HEAD'), '1');
    const result = await app.commitChanges(f.root, f.request('one local commit', 'commit-sync'));
    assert.equal(result.commit.completed, true); assert.equal(result.sync?.status, failure === 'prepare' ? 'unavailable' : 'unknown'); assert.equal(result.sync?.fetch.status, failure === 'prepare' ? 'not-requested' : 'unknown'); assert.equal(f.git('rev-list', '--count', 'HEAD'), '2'); assert.equal(f.git('rev-parse', 'HEAD'), result.commit.hash); assert.equal(f.git('status', '--porcelain'), '');
  }
});

test('commit and sync never starts sync after a rejected commit hook', async t => {
  const f = fixture(t); f.write('same.txt', 'base\n'); const original = f.commit(), remote = f.remote(); advanceRemote(f, remote); f.write('same.txt', 'current\n');
  fs.writeFileSync(path.join(f.root, '.git', 'hooks', 'pre-commit'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  const result = await f.app.commitChanges(f.root, f.request('rejected commit', 'commit-sync'));
  assert.equal(result.commit.completed, false); assert.equal(result.commit.status, 'failed'); assert.equal(result.sync, null); assert.equal(f.git('rev-parse', 'HEAD'), original); assert.equal(f.git('rev-parse', 'refs/remotes/origin/main'), original); assert.match(f.git('status', '--porcelain'), /M same\.txt/);
});

test('commit and sync retains the one established commit and real conflict state without pushing', async t => {
  const f = fixture(t); f.write('same.txt', 'base\n'); f.commit(); const remote = f.remote(), remoteHead = advanceRemote(f, remote, 'same.txt', 'remote conflict\n');
  f.write('same.txt', 'local conflict\n'); const result = await f.app.commitChanges(f.root, f.request('local conflict', 'commit-sync'));
  assert.equal(result.commit.completed, true); assert.equal(result.sync?.status, 'failed'); assert.equal(result.sync?.fetch.status, 'succeeded'); assert.equal(result.sync?.rebase.status, 'failed'); assert.equal(result.sync?.push.status, 'not-requested');
  assert.equal(f.git('show', result.commit.hash + ':same.txt'), 'local conflict'); assert.match(f.git('status', '--porcelain'), /UU same\.txt/); assert.equal(fs.existsSync(path.join(f.root, '.git', 'rebase-merge')), true);
  assert.equal(f.gitAt(remote, 'rev-parse', 'refs/heads/main'), remoteHead); assert.equal(result.push.retry, null);
});

test('commit and sync push rejection preserves integration and explicit sync retry does not create a second commit', async t => {
  const f = fixture(t); f.write('same.txt', 'base\n'); f.commit(); const remote = f.remote(); advanceRemote(f, remote);
  const hook = path.join(remote, 'hooks', 'pre-receive'); fs.writeFileSync(hook, '#!/bin/sh\necho fixture-rejection >&2\nexit 1\n', { mode: 0o755 }); f.write('same.txt', 'current\n');
  const result = await f.app.commitChanges(f.root, f.request('local current', 'commit-sync'));
  assert.equal(result.commit.completed, true); assert.equal(result.sync?.status, 'failed'); assert.equal(result.sync?.fetch.status, 'succeeded'); assert.equal(result.sync?.rebase.status, 'succeeded'); assert.equal(result.sync?.push.status, 'failed');
  assert.equal(result.push.status, 'not-requested'); assert.equal(result.push.retry, null); assert.notEqual(result.commit.hash, result.sync?.head); assert.equal(f.git('status', '--porcelain'), '');
  const count = f.git('rev-list', '--count', 'HEAD'), hash = f.git('rev-parse', 'HEAD'); fs.unlinkSync(hook);
  const retried = await f.app.sync(f.root, { ...f.input(), expectedRevision: f.app.syncContext(f.root, f.input()).revision });
  assert.equal(retried.status, 'succeeded'); assert.equal(f.git('rev-list', '--count', 'HEAD'), count); assert.equal(f.git('rev-parse', 'HEAD'), hash); assert.equal(f.gitAt(remote, 'rev-parse', 'refs/heads/main'), hash);
});

test('commit hooks changing the observed target, branch, head or upstream stop only sync after preserving the commit', async t => {
  for (const drift of ['target', 'branch', 'head', 'upstream']) {
    const f = fixture(t); f.write('same.txt', 'base\n'); const original = f.commit(), remote = f.remote();
    const script = drift === 'target' ? 'git config remote.origin.pushurl ' + shellQuote(path.join(f.base, 'other.git'))
      : drift === 'branch' ? 'git symbolic-ref HEAD refs/heads/changed'
      : drift === 'head' ? 'git update-ref HEAD ' + original
      : 'git update-ref refs/remotes/origin/main HEAD';
    fs.writeFileSync(path.join(f.root, '.git', 'hooks', 'post-commit'), '#!/bin/sh\n' + script + '\n', { mode: 0o755 }); f.write('same.txt', 'current\n');
    const result = await f.app.commitChanges(f.root, f.request('committed before drift', 'commit-sync'));
    assert.equal(result.commit.completed, true, drift); assert.equal(result.sync?.status, 'unavailable', drift); assert.equal(result.sync?.fetch.status, 'not-requested', drift);
    assert.equal(f.git('show', result.commit.hash + ':same.txt'), 'current', drift); assert.equal(f.gitAt(remote, 'rev-parse', 'refs/heads/main'), original, drift); assert.equal(result.push.retry, null, drift);
  }
});

test('post-commit dirty contents remain visible and only block sync when integration is required', async t => {
  for (const needsIntegration of [false, true]) {
    const f = fixture(t); f.write('same.txt', 'base\n'); f.commit(); const remote = f.remote(); if (needsIntegration) advanceRemote(f, remote);
    fs.writeFileSync(path.join(f.root, '.git', 'hooks', 'post-commit'), '#!/bin/sh\nprintf hook-dirty > hook.txt\n', { mode: 0o755 }); f.write('same.txt', 'current\n');
    const result = await f.app.commitChanges(f.root, f.request('committed before hook edits', 'commit-sync'));
    assert.equal(result.commit.completed, true); assert.equal(result.sync?.fetch.status, 'succeeded'); assert.equal(fs.readFileSync(path.join(f.root, 'hook.txt'), 'utf8'), 'hook-dirty'); assert.match(f.git('status', '--porcelain'), /\?\? hook\.txt/);
    assert.equal(result.sync?.status, needsIntegration ? 'unavailable' : 'succeeded'); assert.equal(result.sync?.push.status, needsIntegration ? 'not-requested' : 'succeeded'); assert.equal(f.git('rev-parse', 'HEAD'), result.commit.hash);
  }
});

test('commit and sync holds the common repository write lock across commit and later push', async t => {
  const f = fixture(t); f.write('same.txt', 'base\n'); f.commit(); const remote = f.remote();
  const linked = path.join(f.base, 'linked'); f.git('worktree', 'add', '-b', 'linked', linked);
  const selected = f.app.sourceControl(f.root).repositories[0].worktrees.find(item => item.location === fs.realpathSync(linked))!;
  const location = { repositoryId: 'repo-one', worktreeId: selected.worktreeId };
  const committing = path.join(f.base, 'committing'), allowCommit = path.join(f.base, 'allow-commit'), pushing = path.join(f.base, 'pushing'), allowPush = path.join(f.base, 'allow-push');
  const block = (marker: string, release: string) => '#!/bin/sh\nprintf reached > ' + shellQuote(marker) + '\nwhile [ ! -f ' + shellQuote(release) + ' ]; do sleep 0.02; done\n';
  fs.writeFileSync(path.join(f.root, '.git', 'hooks', 'pre-commit'), block(committing, allowCommit), { mode: 0o755 }); fs.writeFileSync(path.join(remote, 'hooks', 'pre-receive'), block(pushing, allowPush), { mode: 0o755 }); f.write('same.txt', 'current\n');
  const pending = f.app.commitChanges(f.root, f.request('single locked operation', 'commit-sync'));
  try {
    await waitForFile(committing);
    await assert.rejects(f.app.sync(f.root, { ...location, expectedRevision: f.app.syncContext(f.root, location).revision }), hasCode('code_git_operation_in_progress'));
    fs.writeFileSync(allowCommit, 'go'); await waitForFile(pushing);
    await assert.rejects(f.app.sync(f.root, { ...location, expectedRevision: f.app.syncContext(f.root, location).revision }), hasCode('code_git_operation_in_progress'));
    const context = f.app.commitContext(f.root, location);
    await assert.rejects(f.app.push(f.root, { ...location, expectedHead: context.head!, expectedPushRevision: context.push.revision }), hasCode('code_git_operation_in_progress'));
  } finally { fs.writeFileSync(allowCommit, 'go'); fs.writeFileSync(allowPush, 'go'); }
  const result = await pending; assert.equal(result.sync?.status, 'succeeded');
  const subsequent = await f.app.sync(f.root, { ...f.input(), expectedRevision: f.app.syncContext(f.root, f.input()).revision }); assert.equal(subsequent.status, 'succeeded');
});
