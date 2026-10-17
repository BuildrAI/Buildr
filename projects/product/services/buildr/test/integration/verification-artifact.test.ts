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
