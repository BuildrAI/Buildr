import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { isVersionRequest, readCliIdentity } from '../../src/bootstrap/cli/identity.ts';

test('Node 24 loads the real mjs to ts to mjs CLI identity chain', () => {
  assert.equal(process.versions.node, '24.15.0');
  assert.equal(isVersionRequest(['--version']), true);
  assert.equal(isVersionRequest(['version', '--json']), true);
  assert.equal(isVersionRequest(['--help']), false);
  assert.equal(readCliIdentity().version, '0.1.0-rc.21');

  const result = spawnSync(process.execPath, ['bin/buildr.mjs', 'version', '--json'], {
    encoding: 'utf8',
    env: { ...process.env, BUILDR_NODE: process.execPath },
  });
  assert.equal(result.status, 0, result.stderr);
  const identity = JSON.parse(result.stdout);
  assert.equal(identity.schemaVersion, 'buildr.version/v1');
  assert.equal(identity.version, '0.1.0-rc.21');
  assert.equal(identity.channel, 'development');
  assert.equal(identity.runtime.executable, process.execPath);
});
