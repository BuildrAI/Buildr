import assert from 'node:assert/strict';
import test from 'node:test';

import { candidateEnvironmentPlan, CANDIDATE_ENVIRONMENT_PROFILES } from '../../tools/verification/candidate-environment.ts';

const roots = { serviceRoot: '/product/buildr', webRoot: '/product/buildr-web' };

test('Candidate environment profiles are closed and select the minimum preparation recipe', () => {
  assert.deepEqual(CANDIDATE_ENVIRONMENT_PROFILES, ['base', 'artifact', 'frontend', 'browser-artifact', 'source-runtime', 'consumer', 'host', 'publisher']);
  assert.deepEqual(candidateEnvironmentPlan('host', roots).map((item) => item.id), [
    'buildr-harness-dependencies',
    'buildr-harness-build',
    'buildr-dependencies',
  ]);
  assert.deepEqual(candidateEnvironmentPlan('base', roots).map((item) => item.id), [
    'buildr-harness-dependencies',
    'buildr-harness-build',
    'buildr-dependencies',
    'harness-ui-dependencies',
    'harness-ui-build',
    'harness-web-dependencies',
    'harness-cli-dependencies',
    'buildr-web-dependencies',
    'generated-contracts-and-test-context',
  ]);
  assert.deepEqual(candidateEnvironmentPlan('artifact', roots).map((item) => item.id), [
    'buildr-harness-dependencies',
    'buildr-harness-build',
    'buildr-dependencies',
    'harness-ui-dependencies',
    'harness-ui-build',
    'harness-web-dependencies',
    'harness-cli-dependencies',
    'buildr-web-dependencies',
  ]);
  assert.deepEqual(candidateEnvironmentPlan('source-runtime', roots).map((item) => item.id), [
    'buildr-harness-dependencies',
    'buildr-harness-build',
    'buildr-dependencies',
    'harness-ui-dependencies',
    'harness-ui-build',
    'harness-web-dependencies',
    'harness-cli-dependencies',
    'buildr-web-dependencies',
    'generated-contracts-and-test-context',
    'buildr-web-source-runtime',
  ]);
  assert.throws(() => candidateEnvironmentPlan('custom', roots), /Unsupported Candidate environment profile/u);
});

test('source-runtime uses locked installs and the single development web preparation owner', () => {
  const plan = candidateEnvironmentPlan('source-runtime', roots);
  assert.deepEqual(plan, [
    { id: 'buildr-harness-dependencies', executable: 'npm', args: ['ci', '--ignore-scripts'], cwd: '/product/buildr-harness' },
    { id: 'buildr-harness-build', executable: 'node', args: ['tools/build.ts'], cwd: '/product/buildr-harness' },
    { id: 'buildr-dependencies', executable: 'npm', args: ['ci', '--install-links'], cwd: roots.serviceRoot },
    { id: 'harness-ui-dependencies', executable: 'npm', args: ['ci', '--ignore-scripts'], cwd: '/product/buildr-harness-ui' },
    { id: 'harness-ui-build', executable: 'node', args: ['tools/build.ts'], cwd: '/product/buildr-harness-ui' },
    { id: 'harness-web-dependencies', executable: 'npm', args: ['ci', '--ignore-scripts'], cwd: '/product/buildr-harness-web' },
    { id: 'harness-cli-dependencies', executable: 'npm', args: ['ci', '--ignore-scripts'], cwd: '/product/buildr-harness' },
    { id: 'buildr-web-dependencies', executable: 'npm', args: ['ci'], cwd: roots.webRoot },
    { id: 'generated-contracts-and-test-context', executable: 'npm', args: ['run', 'artifacts:prepare'], cwd: roots.serviceRoot },
    { id: 'buildr-web-source-runtime', executable: 'node', args: ['tools/development/prepare-development-web.ts'], cwd: roots.serviceRoot },
  ]);
});


test('artifact consumers install only locked production dependencies and never generate source', () => {
  // Artifact consumers still execute source verification tools that import the
  // private Agent build, so they compile it before the production install.
  for (const profile of ['consumer', 'host']) {
    const plan = candidateEnvironmentPlan(profile, roots);
    assert.equal(plan.length, 3);
    assert.deepEqual(plan[2].args, ['ci', '--omit=dev', '--ignore-scripts', '--install-links']);
  }
  const publisher = candidateEnvironmentPlan('publisher', roots);
  assert.deepEqual(publisher[2].args, ['ci', '--omit=dev', '--ignore-scripts', '--install-links']);
  assert.ok(publisher[3].args.includes('npm@11.5.1'));
  assert.ok(!publisher[3].args.includes('--global'));
});

test('frontend source shard installs its own locked toolchain and generated inputs without building Web', () => {
  assert.deepEqual(candidateEnvironmentPlan('frontend', roots), [
    { id: 'buildr-harness-dependencies', executable: 'npm', args: ['ci', '--ignore-scripts'], cwd: '/product/buildr-harness' },
    { id: 'buildr-harness-build', executable: 'node', args: ['tools/build.ts'], cwd: '/product/buildr-harness' },
    { id: 'buildr-dependencies', executable: 'npm', args: ['ci', '--install-links'], cwd: roots.serviceRoot },
    { id: 'harness-ui-dependencies', executable: 'npm', args: ['ci', '--ignore-scripts'], cwd: '/product/buildr-harness-ui' },
    { id: 'harness-ui-build', executable: 'node', args: ['tools/build.ts'], cwd: '/product/buildr-harness-ui' },
    { id: 'harness-web-dependencies', executable: 'npm', args: ['ci', '--ignore-scripts'], cwd: '/product/buildr-harness-web' },
    { id: 'harness-cli-dependencies', executable: 'npm', args: ['ci', '--ignore-scripts'], cwd: '/product/buildr-harness' },
    { id: 'buildr-web-dependencies', executable: 'npm', args: ['ci'], cwd: roots.webRoot },
    { id: 'generated-contracts-and-test-context', executable: 'npm', args: ['run', 'artifacts:prepare'], cwd: roots.serviceRoot },
  ]);
});

test('Candidate artifact Browser explicitly prepares Chromium and source harness inputs without Web build dependencies', () => {
  assert.deepEqual(candidateEnvironmentPlan('browser-artifact', roots), [
    { id: 'buildr-harness-dependencies', executable: 'npm', args: ['ci', '--ignore-scripts'], cwd: '/product/buildr-harness' },
    { id: 'buildr-harness-build', executable: 'node', args: ['tools/build.ts'], cwd: '/product/buildr-harness' },
    { id: 'buildr-dependencies', executable: 'npm', args: ['ci', '--install-links'], cwd: roots.serviceRoot },
    { id: 'harness-ui-dependencies', executable: 'npm', args: ['ci', '--ignore-scripts'], cwd: '/product/buildr-harness-ui' },
    { id: 'harness-ui-build', executable: 'node', args: ['tools/build.ts'], cwd: '/product/buildr-harness-ui' },
    { id: 'harness-web-dependencies', executable: 'npm', args: ['ci', '--ignore-scripts'], cwd: '/product/buildr-harness-web' },
    { id: 'harness-cli-dependencies', executable: 'npm', args: ['ci', '--ignore-scripts'], cwd: '/product/buildr-harness' },
    { id: 'generated-contracts-and-test-context', executable: 'npm', args: ['run', 'artifacts:prepare'], cwd: roots.serviceRoot },
    { id: 'browser-chromium', executable: 'npm', args: ['run', 'browser:prepare'], cwd: roots.serviceRoot },
  ]);
});
