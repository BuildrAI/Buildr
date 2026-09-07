import assert from 'node:assert/strict';
import test from 'node:test';

import { candidateEnvironmentPlan, CANDIDATE_ENVIRONMENT_PROFILES } from '../../tools/verification/candidate-environment.ts';

const roots = { serviceRoot: '/product/buildr', webRoot: '/product/buildr-web' };

test('Candidate environment profiles are closed and select the minimum preparation recipe', () => {
  assert.deepEqual(CANDIDATE_ENVIRONMENT_PROFILES, ['base', 'artifact', 'source-runtime', 'host']);
  assert.deepEqual(candidateEnvironmentPlan('host', roots).map((item) => item.id), ['buildr-dependencies']);
  assert.deepEqual(candidateEnvironmentPlan('base', roots).map((item) => item.id), [
    'buildr-dependencies',
    'generated-contracts-and-test-context',
  ]);
  assert.deepEqual(candidateEnvironmentPlan('artifact', roots).map((item) => item.id), [
    'buildr-dependencies',
    'buildr-web-dependencies',
    'generated-contracts-and-test-context',
  ]);
  assert.deepEqual(candidateEnvironmentPlan('source-runtime', roots).map((item) => item.id), [
    'buildr-dependencies',
    'buildr-web-dependencies',
    'generated-contracts-and-test-context',
    'buildr-web-source-runtime',
  ]);
  assert.throws(() => candidateEnvironmentPlan('custom', roots), /Unsupported Candidate environment profile/u);
});

test('source-runtime uses locked installs and the single development web preparation owner', () => {
  const plan = candidateEnvironmentPlan('source-runtime', roots);
  assert.deepEqual(plan, [
    { id: 'buildr-dependencies', executable: 'npm', args: ['ci'], cwd: roots.serviceRoot },
    { id: 'buildr-web-dependencies', executable: 'npm', args: ['ci'], cwd: roots.webRoot },
    { id: 'generated-contracts-and-test-context', executable: 'npm', args: ['run', 'artifacts:prepare'], cwd: roots.serviceRoot },
    { id: 'buildr-web-source-runtime', executable: 'node', args: ['tools/development/prepare-development-web.ts'], cwd: roots.serviceRoot },
  ]);
});
