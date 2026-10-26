import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fixture } from '../helpers/code-sync-application-fixture.ts';

test('copied Git baselines retain independent refs, indexes, configuration and local remotes', t => {
  const first = fixture(t), second = fixture(t);
  assert.equal(first.initial, second.initial);
  assert.notEqual(first.root, second.root);
  for (const current of [first, second]) {
    assert.equal(current.git('remote', 'get-url', 'origin'), current.remote);
    assert.equal(current.gitAt(current.peer, 'remote', 'get-url', 'origin'), current.remote);
    assert.equal(fs.statSync(path.join(current.root, '.git', 'config')).nlink, 1);
  }
  first.write('private.txt', 'first checkout only\n'); first.commit('private change'); first.git('push', 'origin', 'main');
  assert.equal(second.git('rev-parse', 'HEAD'), second.initial);
  assert.equal(second.gitAt(second.remote, 'rev-parse', 'refs/heads/main'), second.initial);
  assert.equal(second.git('status', '--porcelain'), '');
  assert.equal(fs.existsSync(path.join(second.root, 'private.txt')), false);
  assert.equal(first.gitAt(first.remote, 'rev-parse', 'refs/heads/main'), first.git('rev-parse', 'HEAD'));
});
