import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import { exactNodeCandidatePaths, probeNodeVersion, resolveExactNodeExecutable } from '../verification/required-node.ts';
import { reexecUnderRequiredNode } from '../verification/artifact.ts';

test('exact Node candidates prefer BUILDR_NODE then declared manager locations then PATH', () => {
  const candidates = exactNodeCandidatePaths('24.15.0',
    { BUILDR_NODE: '/custom/node', NVM_DIR: '/nvm', PATH: `/first${path.delimiter}/second` }, '/home/dev', 'darwin');
  assert.equal(candidates[0], '/custom/node');
  assert.equal(candidates[1], path.join('/nvm/versions/node/v24.15.0/bin', 'node'));
  assert.ok(candidates.includes(path.join('/home/dev/.local/opt/node-v24.15.0/bin', 'node')));
  assert.ok(candidates.includes(path.join('/home/dev/.volta/tools/image/node/24.15.0/bin', 'node')));
  assert.deepEqual(candidates.slice(-2), [path.join('/first', 'node'), path.join('/second', 'node')]);
});

test('exact Node candidates default to ~/.nvm and deduplicate PATH entries', () => {
  const candidates = exactNodeCandidatePaths('24.15.0', { PATH: `/same${path.delimiter}/same` }, '/home/dev', 'darwin');
  assert.ok(candidates.includes(path.join('/home/dev/.nvm/versions/node/v24.15.0/bin', 'node')));
  assert.equal(candidates.filter(entry => entry === path.join('/same', 'node')).length, 1);
});

test('exact Node resolution probes existing candidates and requires the real version', () => {
  const existing = new Set(['/nvm/versions/node/v24.15.0/bin/node', '/usr/bin/node']);
  const versions = new Map([['/nvm/versions/node/v24.15.0/bin/node', '24.15.0'], ['/usr/bin/node', '24.21.0']]);
  const resolved = resolveExactNodeExecutable('24.15.0', {
    exists: (file: string) => existing.has(file),
    probe: (file: string) => versions.get(file) ?? null,
    realpath: (file: string) => file,
    candidates: ['/missing/node', '/nvm/versions/node/v24.15.0/bin/node', '/usr/bin/node'],
  });
  assert.equal(resolved, '/nvm/versions/node/v24.15.0/bin/node');
  assert.equal(resolveExactNodeExecutable('24.15.0', {
    exists: (file: string) => existing.has(file),
    probe: (file: string) => versions.get(file) ?? null,
    candidates: ['/usr/bin/node'],
  }), null);
});

test('version probe only accepts a successful real version report', () => {
  const version = probeNodeVersion(process.execPath);
  assert.equal(version, process.versions.node);
  assert.equal(probeNodeVersion('/definitely/missing/node'), null);
});

test('re-execution is skipped when active Node matches, the plan has no minimum, or the guard env is set', () => {
  const options = { scope: 'all', nodeTuple: 'minimum' };
  assert.equal(reexecUnderRequiredNode(options, { requiredNode: '24.15.0', nodeVersion: '24.15.0' }), null);
  assert.equal(reexecUnderRequiredNode(options, { requiredNode: null, nodeVersion: '24.21.0' }), null);
  assert.equal(reexecUnderRequiredNode(options, { requiredNode: '24.15.0', nodeVersion: '24.21.0', env: { BUILDR_ARTIFACT_NODE_REEXEC: '1' } }), null);
  assert.equal(reexecUnderRequiredNode({ scope: 'all', nodeTuple: 'minimum', json: true }, { requiredNode: '24.15.0', nodeVersion: '24.21.0' }), null);
});

test('re-execution propagates the exact executable through BUILDR_NODE and PATH', () => {
  const spawned: any[] = [];
  const status = reexecUnderRequiredNode({ scope: 'all', nodeTuple: 'minimum' }, {
    requiredNode: '24.15.0',
    nodeVersion: '24.21.0',
    env: { PATH: '/bin' },
    resolve: () => '/opt/node-v24.15.0/bin/node',
    spawn: (...args: any[]) => { spawned.push(args); return { status: 0 }; },
  });
  assert.equal(status, 0);
  const [executable, argv, spawnOptions] = spawned[0]!;
  assert.equal(executable, '/opt/node-v24.15.0/bin/node');
  assert.equal(argv.length >= 1 && argv[0].endsWith(path.join('test', 'verification', 'artifact.ts')), true);
  assert.equal(spawnOptions.env.BUILDR_NODE, '/opt/node-v24.15.0/bin/node');
  assert.equal(spawnOptions.env.BUILDR_ARTIFACT_NODE_REEXEC, '1');
  assert.equal(spawnOptions.env.PATH.split(path.delimiter)[0], '/opt/node-v24.15.0/bin');
});

test('an unresolved exact Node reports -1 so the entry can fail with guidance', () => {
  const status = reexecUnderRequiredNode({ scope: 'all', nodeTuple: 'minimum' }, {
    requiredNode: '24.15.0',
    nodeVersion: '24.21.0',
    env: {},
    resolve: () => null,
  });
  assert.equal(status, -1);
});
