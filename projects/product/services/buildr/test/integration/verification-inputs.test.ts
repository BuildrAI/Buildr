import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { scopedVerificationInputs } from '../verification/verification-inputs.ts';

test('tracked but deleted test inputs remain absent without reading their old source', (t) => {
  const repositoryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-absent-verification-input-'));
  const productRoot = path.join(repositoryRoot, 'projects/product');
  fs.mkdirSync(productRoot, { recursive: true });
  t.after(() => fs.rmSync(repositoryRoot, { recursive: true, force: true }));

  const missingFile = 'projects/product/test/unit/deleted.test.ts';
  let attemptedRead = false;
  const result = scopedVerificationInputs([[missingFile, 'absent']], repositoryRoot, productRoot, {
    id: 'unit',
    executor: { type: 'node-test', files: ['test/unit/*.test.ts'] },
    reuse: { scope: 'repository' },
    dependsOn: [],
  }, {
    proof: true,
    readText: () => { attemptedRead = true; throw new Error('deleted source must not be read'); },
  });

  assert.equal(attemptedRead, false);
  assert.ok(result.recipe.some(([file, state]) => file === missingFile && state === 'absent'));
});
