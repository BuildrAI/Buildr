import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { isVersionRequest, readCliIdentity } from '../../src/bootstrap/cli/identity.ts';
import { assertMinimumNodeVersion } from '../../src/infrastructure/process.ts';

test('Supported Node loads the stable mjs entry and real TypeScript CLI graph', () => {
  const minimumNodeVersion = readFileSync(new URL('../../../../.node-version', import.meta.url), 'utf8').trim();
  assertMinimumNodeVersion(process.versions.node, minimumNodeVersion);
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
