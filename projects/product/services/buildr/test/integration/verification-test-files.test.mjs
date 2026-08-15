import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { resolveNodeTestFiles } from '../verification/test-files.mjs';

test('node-test selectors resolve sorted files and fail closed when empty', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-test-files-'));
  try {
    fs.mkdirSync(path.join(root, 'test'), { recursive: true });
    fs.writeFileSync(path.join(root, 'test', 'b.test.mjs'), '');
    fs.writeFileSync(path.join(root, 'test', 'a.test.mjs'), '');
    fs.mkdirSync(path.join(root, 'test', 'directory.test.mjs'));
    assert.deepEqual(resolveNodeTestFiles(root, ['test/*.test.mjs']).map((file) => path.basename(file)), ['a.test.mjs', 'b.test.mjs']);
    assert.throws(() => resolveNodeTestFiles(root, ['missing/*.test.mjs'], 'fixture-step'), /fixture-step resolved no test files/);
    assert.throws(() => resolveNodeTestFiles(root, ['test/directory.test.mjs']), /resolved no test files/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
