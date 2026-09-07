import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { verificationSteps } from '../verification/registry.ts';
import { resolveNodeTestFiles } from '../verification/test-files.ts';

const serviceRoot: any = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('node-test selectors resolve sorted files and fail closed when empty', () => {
  const root: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-test-files-'));
  try {
    fs.mkdirSync(path.join(root, 'test'), { recursive: true });
    fs.writeFileSync(path.join(root, 'test', 'b.test.mjs'), '');
    fs.writeFileSync(path.join(root, 'test', 'a.test.mjs'), '');
    fs.mkdirSync(path.join(root, 'test', 'directory.test.mjs'));
    assert.deepEqual(resolveNodeTestFiles(root, ['test/*.test.mjs']).map((file: any) => path.basename(file)), ['a.test.mjs', 'b.test.mjs']);
    assert.throws(() => resolveNodeTestFiles(root, ['missing/*.test.mjs'], 'fixture-step'), /fixture-step resolved no test files/);
    assert.throws(() => resolveNodeTestFiles(root, ['test/directory.test.mjs']), /resolved no test files/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('registry 中每个显式 node-test 文件都必须真实存在', () => {
  for (const step of verificationSteps.filter((candidate: any) => ['node-test', 'node-context-test'].includes(candidate.executor.type))) {
    for (const selector of step.executor.files) {
      assert.doesNotThrow(
        () => resolveNodeTestFiles(serviceRoot, [selector], step.id),
        `${step.id} 声明了不存在的测试文件 ${selector}`,
      );
    }
  }
});
