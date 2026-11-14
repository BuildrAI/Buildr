import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { parseArtifactArgs, runLocalArtifactVerification, createLocalArtifactPlan } from '../verification/artifact.ts';
import { candidateProofDescriptors } from '../verification/candidate-repair.ts';

test('local package execution preserves local identity and continues independent nodes after a failed node', t => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-local-package-test-'));
  t.after(() => fs.rmSync(output, { recursive: true, force: true }));
  const calls: any[] = [];
  const result = runLocalArtifactVerification({ scope: 'platform', artifactDirectory: '/original', output }, {
    platform: 'darwin', nodeVersion: '24.15.0', readArtifact: () => ({ identity: { sha256: 'original' } }),
    assertCheckout: () => {}, prepare: () => {},
    execute: (_command: string, args: string[], options: any) => {
      calls.push(args);
      assert.equal(options.env.GITHUB_RUN_ID, undefined);
      assert.equal(options.env.BUILDR_CANDIDATE_CI_ARTIFACT_DIR, '/original');
      return { status: 1, stdout: '', stderr: '' };
    },
  });
  assert.equal(result.status, 'failed');
  assert.deepEqual(calls.map(args => args.at(-1)), createLocalArtifactPlan('darwin', { scope: 'platform' }).nodes.map((node: { id: string }) => node.id));
  assert.ok(result.results.every((node: any) => node.status === 'failed' && node.disposition === 'executed'));
});

test('a dirty checkout stops local verification before preparing or executing anything', () => {
  assert.throws(() => runLocalArtifactVerification({ scope: 'platform', artifactDirectory: '/original', output: '/unwritten' }, {
    platform: 'darwin', nodeVersion: '24.15.0', readArtifact: () => ({ identity: {} }),
    assertCheckout: () => { throw new Error('dirty source'); },
    prepare: () => assert.fail('dirty source must not prepare'), execute: () => assert.fail('dirty source must not execute'),
  }), /dirty source/u);
});

test('restoring controller dependencies rechecks prior package proof before executing it again', t => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-local-package-resume-'));
  t.after(() => fs.rmSync(output, { recursive: true, force: true }));
  const preparations: string[] = [], observations: string[] = [];
  let activePreparation = 'source-runtime';
  const result = runLocalArtifactVerification({ artifactDirectory: '/original', output }, {
    platform: 'darwin', nodeVersion: '24.15.0', readArtifact: () => ({ identity: { sha256: 'original' } }),
    assertCheckout: () => {},
    reusableEvidence: (node: any) => { observations.push(`${node.id}:${activePreparation}`); return node.preparation === activePreparation; },
    prepare: ({ profile }: any) => { preparations.push(profile); activePreparation = profile; },
    execute: () => assert.fail('restored valid proof must not execute again'),
  });
  assert.equal(result.status, 'passed');
  assert.deepEqual(preparations, ['browser-artifact', 'base', 'consumer', 'publisher']);
  assert.ok(result.results.every((node: any) => node.disposition === 'reused'));
  assert.ok(observations.includes('host-minimum-macos:publisher'));
  assert.equal(activePreparation, 'publisher');
});

test('an invalid package proof remains a miss after preparation and still executes', t => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-local-package-invalid-'));
  t.after(() => fs.rmSync(output, { recursive: true, force: true }));
  let observations = 0, executions = 0;
  const result = runLocalArtifactVerification({ scope: 'platform', artifactDirectory: '/original', output }, {
    platform: 'darwin', nodeVersion: '24.15.0', readArtifact: () => ({ identity: { sha256: 'original' } }),
    assertCheckout: () => {}, reusableEvidence: () => { observations++; return false; }, prepare: () => {},
    execute: () => { executions++; return { status: 1 }; },
  });
  assert.equal(result.status, 'failed');
  const nodes = createLocalArtifactPlan('darwin', { scope: 'platform' }).nodes;
  assert.equal(observations, nodes.length * 2);
  assert.equal(executions, nodes.length);
});

test('local package continuation retains passed groups without comparing environment fingerprints', async t => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-artifact-retained-'));
  t.after(() => fs.rmSync(output, { recursive: true, force: true }));
  const productRoot = path.resolve(import.meta.dirname, '../..');
  const git = (ref: string) => execFileSync('git', ['rev-parse', ref], { cwd: productRoot, encoding: 'utf8' }).trim();
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

test('consumerDirectory isolates --omit=dev preparations and executes cleanup even when a node fails', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-artifact-consumer-dir-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const consumerDirectory = path.join(root, 'consumer-env');
  const output = path.join(root, 'output');
  const parsed = parseArtifactArgs(['--artifact-dir', '/original', '--output', output, '--consumer-dir', consumerDirectory]);
  assert.equal(parsed.consumerDirectory, consumerDirectory);

  const consumerRoots = {
    projectRoot: path.join(consumerDirectory, 'projects/product'),
    serviceRoot: path.join(consumerDirectory, 'projects/product/services/buildr'),
    webRoot: path.join(consumerDirectory, 'projects/product/services/buildr-web'),
  };
  const consumerEntry = path.join(consumerRoots.serviceRoot, 'test/verification/candidate-ci.ts');
  let checkoutCount = 0;
  let cleanedUp = 0;
  const preparedProfiles: Array<{ profile: string; roots: any }> = [];
  const executions: Array<{ entry: string; cwd: string; id: string }> = [];

  const result = runLocalArtifactVerification(parsed, {
    platform: 'darwin',
    nodeVersion: '24.15.0',
    readArtifact: () => ({ identity: { sha256: 'original' } }),
    assertCheckout: () => {},
    reusableEvidence: () => false,
    prepareConsumerCheckout: (_productRoot: string, targetDir: string) => {
      checkoutCount++;
      assert.equal(targetDir, path.resolve(consumerDirectory));
      return {
        roots: consumerRoots,
        entry: consumerEntry,
        cleanup: () => { cleanedUp++; },
      };
    },
    prepare: ({ profile, roots }: any) => { preparedProfiles.push({ profile, roots }); },
    execute: (_command: string, args: string[], execOptions: any) => {
      executions.push({ entry: args[0]!, cwd: execOptions.cwd, id: args[2]! });
      return { status: args[2] === 'host-minimum-macos' ? 1 : 0, stdout: '', stderr: '' };
    },
  });

  assert.equal(result.status, 'failed');
  assert.equal(checkoutCount, 1);
  assert.equal(cleanedUp, 1);
  for (const entry of preparedProfiles) {
    if (['consumer', 'publisher', 'host'].includes(entry.profile)) {
      assert.deepEqual(entry.roots, consumerRoots);
    } else {
      assert.equal(entry.roots, undefined);
    }
  }
  const sourceProductRoot = path.resolve(import.meta.dirname, '../..');
  for (const run of executions) {
    const node = createLocalArtifactPlan('darwin').nodes.find((item: any) => item.id === run.id);
    if (['consumer', 'publisher', 'host'].includes(node.preparation)) {
      assert.equal(run.entry, consumerEntry);
      assert.equal(run.cwd, consumerRoots.serviceRoot);
    } else {
      assert.equal(run.cwd, sourceProductRoot);
    }
  }
});
