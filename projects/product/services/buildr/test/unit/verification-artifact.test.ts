import assert from 'node:assert/strict';
import test from 'node:test';
import { createLocalArtifactPlan, parseArtifactArgs, runLocalArtifactVerification } from '../verification/artifact.ts';
import { candidateEnvironmentPlan } from '../../tools/verification/candidate-environment.ts';

test('package selection keeps common checks once and native package checks separate on either machine', () => {
  const ids = (platform: string, scope: string) => createLocalArtifactPlan(platform, { scope }).nodes.map((node: any) => node.id);
  assert.deepEqual(ids('darwin', 'common'), ids('win32', 'common'));
  assert.deepEqual(ids('darwin', 'platform'), ['runtime-macos', 'host-current-macos']);
  assert.deepEqual(ids('win32', 'platform'), ['runtime-windows', 'host-current-windows']);
  assert.deepEqual(createLocalArtifactPlan('darwin', { scope: 'platform', nodeTuple: 'minimum' }).nodes.map((node: any) => node.id), ['host-minimum-macos']);
  assert.deepEqual(createLocalArtifactPlan('win32', { scope: 'platform', nodeTuple: 'minimum' }).nodes.map((node: any) => node.id), ['host-minimum-windows']);
  for (const platform of ['darwin', 'win32']) {
    const plan = createLocalArtifactPlan(platform);
    assert.ok(plan.nodes.every((node: any) => !node.stepIds.includes('candidate-tarball')));
    assert.ok(plan.nodes.some((node: any) => node.stepIds.includes('artifact-browser-core')));
    assert.ok(plan.nodes.some((node: any) => node.stepIds.includes('release-tarball-smoke')));
    assert.equal(new Set(plan.nodes.map((node: any) => node.id)).size, plan.nodes.length);
    const modes = plan.nodes.map((node: any) => candidateEnvironmentPlan(node.preparation)
      .find(operation => operation.id === 'buildr-dependencies')!.args.includes('--omit=dev') ? 'production' : 'development');
    assert.deepEqual(modes.filter((mode: string, index: number) => mode !== modes[index - 1]), ['production', 'development'],
      'source-runtime and browser controllers share full dependencies without an intervening production install');
  }
  assert.throws(() => createLocalArtifactPlan('linux'), /No package platform/u);
});

test('package entry requires explicit original bytes and rejects pretending the current Node is the minimum', () => {
  assert.throws(() => parseArtifactArgs([]), /Explicit/u);
  for (const args of [['--help', '--json'], ['--scope', 'source'], ['--unknown'], ['--output', '--json'], ['--json', '--json']]) assert.throws(() => parseArtifactArgs(args));
  assert.throws(() => runLocalArtifactVerification({ scope: 'platform', nodeTuple: 'minimum' }, {
    platform: 'darwin', nodeVersion: '24.21.0', readArtifact: () => assert.fail('must reject before reading or preparing'),
  }), /actual Node 24.15.0/u);
  assert.throws(() => runLocalArtifactVerification({ scope: 'platform' }, { platform: 'darwin', nodeVersion: '26.0.0', readArtifact: () => assert.fail('before any package test') }), /tuple requests stable Node 24.x/u);
});

test('package plan-only inspection neither prepares dependencies nor executes checks', () => {
  const result = runLocalArtifactVerification({ json: true, scope: 'common', artifactDirectory: '/original', output: '/results' }, {
    platform: 'win32', nodeVersion: '24.21.0', readArtifact: () => ({ identity: { sha256: 'original' } }),
    prepare: () => assert.fail('plan must not prepare'), execute: () => assert.fail('plan must not execute'),
  });
  assert.equal(result.artifact.sha256, 'original');
  assert.ok(result.nodes.length > 0);
});
