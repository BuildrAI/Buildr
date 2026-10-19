import assert from 'node:assert/strict';
import test from 'node:test';
import { createLocalArtifactPlan, parseArtifactArgs, runLocalArtifactVerification } from '../verification/artifact.ts';
import { candidateEnvironmentPlan } from '../../tools/verification/candidate-environment.ts';

test('package selection keeps common checks once and native package checks separate on either machine', () => {
  const ids = (platform: string, scope: string) => createLocalArtifactPlan(platform, { scope }).nodes.map((node: any) => node.id);
  assert.deepEqual(ids('darwin', 'common'), ids('win32', 'common'));
  assert.deepEqual(ids('darwin', 'platform'), ['runtime-macos', 'host-minimum-macos']);
  assert.deepEqual(ids('win32', 'platform'), ['runtime-windows', 'host-minimum-windows']);
  for (const platform of ['darwin', 'win32']) {
    const plan = createLocalArtifactPlan(platform);
    assert.ok(plan.nodes.every((node: any) => !node.stepIds.includes('candidate-tarball')));
    assert.ok(plan.nodes.some((node: any) => node.stepIds.includes('artifact-browser-core')));
    assert.ok(plan.nodes.some((node: any) => node.stepIds.includes('release-tarball-smoke')));
    assert.equal(new Set(plan.nodes.map((node: any) => node.id)).size, plan.nodes.length);
    const modes = plan.nodes.map((node: any) => candidateEnvironmentPlan(node.preparation)
      .find(operation => operation.id === 'buildr-dependencies')!.args.includes('--omit=dev') ? 'production' : 'development');
    assert.deepEqual(modes.filter((mode: string, index: number) => mode !== modes[index - 1]), ['development', 'production'],
      'source and browser controllers finish before the single move to production-only consumers');
    assert.ok(plan.nodes.every((node: any) => !candidateEnvironmentPlan(node.preparation)
      .some(operation => ['buildr-web-dependencies', 'buildr-web-source-runtime'].includes(operation.id))),
      'package verification consumes original Web bytes and never prepares source Web');
  }
  assert.throws(() => createLocalArtifactPlan('linux'), /No package platform/u);
});

test('package entry requires explicit original bytes and rejects pretending the current Node is the minimum', () => {
  assert.throws(() => parseArtifactArgs([]), /Explicit/u);
  for (const args of [['--help', '--json'], ['--scope', 'source'], ['--unknown'], ['--output', '--json'], ['--json', '--json']]) assert.throws(() => parseArtifactArgs(args));
  assert.throws(() => runLocalArtifactVerification({ scope: 'platform', nodeTuple: 'minimum' }, {
    platform: 'darwin', nodeVersion: '24.21.0', readArtifact: () => assert.fail('must reject before reading or preparing'),
  }), /actual Node 24.15.0/u);
  assert.throws(() => runLocalArtifactVerification({ scope: 'platform' }, { platform: 'darwin', nodeVersion: '26.0.0', readArtifact: () => assert.fail('before any package test') }), /actual Node 24.15.0/u);
});

test('package plan-only inspection neither prepares dependencies nor executes checks', () => {
  const result = runLocalArtifactVerification({ json: true, scope: 'common', artifactDirectory: '/original', output: '/results' }, {
    platform: 'win32', nodeVersion: '24.21.0', readArtifact: () => ({ identity: { sha256: 'original' } }),
    prepare: () => assert.fail('plan must not prepare'), execute: () => assert.fail('plan must not execute'),
  });
  assert.equal(result.artifact.sha256, 'original');
  assert.ok(result.nodes.length > 0);
});

test('local package continuation retains passed groups without comparing environment fingerprints', async t => {
  const fs = await import('node:fs'); const path = await import('node:path'); const os = await import('node:os');
  const { execFileSync } = await import('node:child_process');
  const { candidateProofDescriptors } = await import('../verification/candidate-repair.ts');
  const productRoot = path.resolve(import.meta.dirname, '../..');
  const git = (ref: string) => execFileSync('git', ['rev-parse', ref], { cwd: productRoot, encoding: 'utf8' }).trim();
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-artifact-retained-'));
  t.after(() => fs.rmSync(output, { recursive: true, force: true }));
  const artifact = { sourceCommit: git('HEAD'), filename: 'original.tgz', size: 1, sha256: 'a'.repeat(64), integrity: 'sha512-YQ==', applicationPayloadDigest: `sha256-${'b'.repeat(64)}` };
  const plan = createLocalArtifactPlan('darwin', { scope: 'common' });
  for (const node of plan.nodes) {
    const descriptor = candidateProofDescriptors().find(item => item.id === node.id);
    fs.writeFileSync(path.join(output, `candidate-ci-evidence-${node.id}.json`), JSON.stringify({
      schemaVersion: 'buildr.candidate-ci-evidence/v2', id: node.id, kind: descriptor.kind, sourceCommit: artifact.sourceCommit,
      sourceTree: git('HEAD^{tree}'), purpose: 'candidate', rehearsalIdentity: null, status: 'passed', cleanupClean: true,
      runner: { os: 'macos', platform: 'darwin', arch: 'arm64', nodeVersion: '24.15.0' }, artifact,
      checkInputs: Object.fromEntries(descriptor.steps.map((step: any) => [step.id, 'original-check-input'])),
      results: descriptor.steps.map((step: any) => ({ id: step.id, status: 'passed', exitCode: 0, durationMs: 10 })),
    }));
  }
  const result = runLocalArtifactVerification({ scope: 'common', artifactDirectory: '/original', output }, {
    platform: 'darwin', readArtifact: () => ({ identity: artifact }), assertCheckout() {},
    prepare: () => assert.fail('retained success must not prepare'), execute: () => assert.fail('retained success must not execute'),
  });
  assert.equal(result.status, 'passed'); assert.ok(result.results.every((item: any) => item.disposition === 'reused'));
});

test('local package continuation collects every independent group after a failed group', async t => {
  const fs = await import('node:fs'); const path = await import('node:path'); const os = await import('node:os');
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-artifact-failures-'));
  t.after(() => fs.rmSync(output, { recursive: true, force: true }));
  const calls: string[] = [];
  const result = runLocalArtifactVerification({ scope: 'common', artifactDirectory: '/original', output }, {
    platform: 'darwin', readArtifact: () => ({ identity: {} }), assertCheckout() {}, reusableEvidence: () => false, prepare() {},
    execute(_command: string, args: string[]) { calls.push(args[2]!); return { status: calls.length === 1 ? 1 : 0 }; },
  });
  assert.equal(result.status, 'failed'); assert.equal(result.results.length, result.nodes.length);
  assert.equal(calls.length, result.nodes.length); assert.ok(result.results.some((item: any) => item.status === 'passed'));
});
