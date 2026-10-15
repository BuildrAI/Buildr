import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { ARCHIFY_COST_ROLES, archifyCostEnvironment } from '../helpers/archify-command-cost.ts';

const secret = 'archify-cost-secret-sentinel';

test('Archify cost diagnostics require explicit opt-in, an absolute output and a valid command ordinal', () => {
  const env = { NODE_OPTIONS: '--no-warnings', PRIVATE_VALUE: secret, BUILDR_DIAGNOSTICS_OUTPUT: path.resolve(os.tmpdir(), secret) };
  assert.equal(archifyCostEnvironment(env, 2), env);
  for (const ordinal of [0, 14, -1, 1.5, NaN, Infinity, '2', null]) {
    const enabled = { ...env, BUILDR_ARCHIFY_COST_DIAGNOSTICS: '1' };
    assert.equal(archifyCostEnvironment(enabled, ordinal), enabled);
  }
  for (const output of ['relative', '', null, `${os.tmpdir()}\u0000secret`]) {
    const invalid = { ...env, BUILDR_ARCHIFY_COST_DIAGNOSTICS: '1', BUILDR_DIAGNOSTICS_OUTPUT: output };
    assert.equal(archifyCostEnvironment(invalid, 2), invalid);
  }
  const enabled = { ...env, BUILDR_ARCHIFY_COST_DIAGNOSTICS: '1' };
  const observed = archifyCostEnvironment(enabled, 2);
  assert.notEqual(observed, enabled);
  assert.equal(enabled.NODE_OPTIONS, '--no-warnings');
  assert.equal(observed.PRIVATE_VALUE, secret);
  assert.match(observed.NODE_OPTIONS, /^--no-warnings --import=file:/u);
  assert.equal(observed.BUILDR_ARCHIFY_COST_ROLE, 'component-list');
  assert.equal(observed.BUILDR_ARCHIFY_COST_ORDINAL, '2');
  assert.equal(observed.BUILDR_ARCHIFY_COST_OUTPUT_ROOT, path.join(env.BUILDR_DIAGNOSTICS_OUTPUT, 'archify-cost'));
  assert.equal(ARCHIFY_COST_ROLES.length, 13);
  assert.equal(Object.isFrozen(ARCHIFY_COST_ROLES), true);
});
