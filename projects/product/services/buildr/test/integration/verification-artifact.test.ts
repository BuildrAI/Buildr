import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runLocalArtifactVerification } from '../verification/artifact.ts';

test('local package execution preserves local identity and stops at a failed node without invoking a producer', t => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-local-package-test-'));
  t.after(() => fs.rmSync(output, { recursive: true, force: true }));
  const calls: any[] = [];
  const result = runLocalArtifactVerification({ scope: 'platform', artifactDirectory: '/original', output }, {
    platform: 'darwin', nodeVersion: '24.21.0', readArtifact: () => ({ identity: { sha256: 'original' } }),
    assertCheckout: () => {}, prepare: () => {},
    execute: (_command: string, args: string[], options: any) => {
      calls.push(args);
      assert.equal(options.env.GITHUB_RUN_ID, undefined);
      assert.equal(options.env.BUILDR_CANDIDATE_CI_ARTIFACT_DIR, '/original');
      assert.equal(args.at(-1), 'runtime-macos');
      return { status: 1, stdout: '', stderr: '' };
    },
  });
  assert.equal(result.status, 'failed'); assert.equal(calls.length, 1);
});

test('a dirty checkout stops local verification before preparing or executing anything', () => {
  assert.throws(() => runLocalArtifactVerification({ scope: 'platform', artifactDirectory: '/original', output: '/unwritten' }, {
    platform: 'darwin', nodeVersion: '24.21.0', readArtifact: () => ({ identity: {} }),
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
    platform: 'darwin', nodeVersion: '24.21.0', readArtifact: () => ({ identity: { sha256: 'original' } }),
    assertCheckout: () => {},
    reusableEvidence: (node: any) => { observations.push(`${node.id}:${activePreparation}`); return node.preparation === activePreparation; },
    prepare: ({ profile }: any) => { preparations.push(profile); activePreparation = profile; },
    execute: () => assert.fail('restored valid proof must not execute again'),
  });
  assert.equal(result.status, 'passed');
  assert.deepEqual(preparations, ['browser-artifact', 'base', 'consumer', 'host']);
  assert.ok(result.results.every((node: any) => node.disposition === 'reused'));
  assert.ok(observations.includes('host-current-macos:host'));
  assert.equal(activePreparation, 'host');
});

test('an invalid package proof remains a miss after preparation and still executes', t => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-local-package-invalid-'));
  t.after(() => fs.rmSync(output, { recursive: true, force: true }));
  let observations = 0, executions = 0;
  const result = runLocalArtifactVerification({ scope: 'platform', artifactDirectory: '/original', output }, {
    platform: 'darwin', nodeVersion: '24.21.0', readArtifact: () => ({ identity: { sha256: 'original' } }),
    assertCheckout: () => {}, reusableEvidence: () => { observations++; return false; }, prepare: () => {},
    execute: () => { executions++; return { status: 1 }; },
  });
  assert.equal(result.status, 'failed');
  assert.equal(observations, 2);
  assert.equal(executions, 1);
});
