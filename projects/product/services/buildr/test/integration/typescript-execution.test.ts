import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { isVersionRequest, readCliIdentity } from '../../src/bootstrap/cli/identity.ts';

test('Node 24 loads the stable mjs entry and real TypeScript CLI graph', () => {
  assert.equal(process.versions.node, '24.15.0');
  assert.equal(isVersionRequest(['--version']), true);
  assert.equal(isVersionRequest(['version', '--json']), true);
  assert.equal(isVersionRequest(['--help']), false);
  const expectedVersion: any = readCliIdentity().version;

  const result: any = spawnSync(process.execPath, ['bin/buildr.mjs', 'version', '--json'], {
    encoding: 'utf8',
    env: { ...process.env, BUILDR_NODE: process.execPath },
  });
  assert.equal(result.status, 0, result.stderr);
  const identity: any = JSON.parse(result.stdout);
  assert.equal(identity.schemaVersion, 'buildr.version/v1');
  assert.equal(identity.version, expectedVersion);
  assert.equal(identity.channel, 'development');
  assert.equal(identity.runtime.executable, process.execPath);
});
