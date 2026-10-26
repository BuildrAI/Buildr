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

test('ordinary explicit push includes previous pending commits and updates only the observed upstream', async t => {
  const f = fixture(t); f.write('same.txt', 'base\n'); f.commit(); const remote = f.remote(); f.write('same.txt', 'earlier\n'); f.commit('earlier pending'); f.write('same.txt', 'current\n');
  assert.equal(f.app.commitContext(f.root, f.input()).push.ahead, 1);
  const result = await f.app.commitChanges(f.root, f.request('current pending', 'commit-push'));
  assert.equal(result.commit.completed, true); assert.equal(result.push.status, 'succeeded'); assert.equal(f.gitAt(remote, 'rev-parse', 'refs/heads/main'), result.commit.hash); assert.equal(f.app.commitContext(f.root, f.input()).push.ahead, 0); assert.equal(f.gitAt(remote, 'rev-list', '--count', 'main'), '3');
  assert.equal(result.sync, null);
});

test('push rejection preserves the one successful commit and retry never creates another commit', async t => {
  const f = fixture(t); f.write('same.txt', 'base\n'); f.commit(); const remote = f.remote(); const hook = path.join(remote, 'hooks', 'pre-receive'); fs.writeFileSync(hook, '#!/bin/sh\necho fixture-rejection >&2\nexit 1\n', { mode: 0o755 }); f.write('same.txt', 'current\n');
  const result = await f.app.commitChanges(f.root, f.request('one pending', 'commit-push'));
  assert.equal(result.commit.completed, true); assert.equal(result.push.status, 'failed'); assert.ok(result.push.retry); assert.equal(f.git('status', '--porcelain'), ''); const count = f.git('rev-list', '--count', 'HEAD');
  fs.unlinkSync(hook); const retried = await f.app.push(f.root, { ...f.input(), ...result.push.retry! });
  assert.equal(retried.push.status, 'succeeded'); assert.equal(f.git('rev-list', '--count', 'HEAD'), count); assert.equal(retried.commit.hash, result.commit.hash);
  assert.equal(retried.sync, null);
});

test('missing upstream preserves the successful local commit and stale push targets reject', async t => {
  const f = fixture(t); f.write('same.txt', 'base\n'); f.commit(); f.write('same.txt', 'current\n'); const result = await f.app.commitChanges(f.root, f.request('local only', 'commit-push'));
  assert.equal(result.commit.completed, true); assert.equal(result.push.status, 'unavailable'); assert.equal(result.push.target, null); assert.equal(f.git('status', '--porcelain'), '');
  f.remote(); f.write('same.txt', 'next\n'); f.commit('next'); const observed = f.app.commitContext(f.root, f.input()); f.git('config', 'remote.origin.pushurl', path.join(f.base, 'other.git'));
  await assert.rejects(f.app.push(f.root, { ...f.input(), expectedHead: observed.head!, expectedPushRevision: observed.push.revision }), hasCode('code_source_changed'));
});

test('a changed advertised remote tip refuses the stale push range without undoing the local commit', async t => {
  const f = fixture(t); f.write('same.txt', 'base\n'); f.commit(); const remote = f.remote(); f.gitAt(remote, 'config', 'user.name', 'Remote Fixture'); f.gitAt(remote, 'config', 'user.email', 'remote@example.com');
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
