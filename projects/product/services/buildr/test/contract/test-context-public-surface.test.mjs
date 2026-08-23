import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const serviceRoot = path.resolve(import.meta.dirname, '../..');

test('public Test Context facade declares generated ESM and matching declarations', () => {
  const metadata = JSON.parse(fs.readFileSync(path.join(serviceRoot, 'package.json'), 'utf8'));
  assert.deepEqual(metadata.exports['./test-context'], {
    types: './package/targets/test-context/index.d.ts',
    import: './test-context.mjs',
    default: './test-context.mjs',
  });
  assert.equal(fs.readFileSync(path.join(serviceRoot, 'test-context.mjs'), 'utf8').includes('./package/targets/test-context/index.js'), true);

  const generatedRoot = path.join(serviceRoot, 'package/targets/test-context');
  const files = fs.readdirSync(generatedRoot).sort();
  assert.equal(files.some((file) => file.endsWith('.ts') && !file.endsWith('.d.ts')), false);
  for (const file of files.filter((candidate) => candidate.endsWith('.js'))) {
    assert.equal(fs.readFileSync(path.join(generatedRoot, file), 'utf8').includes("from './src/"), false, file);
    assert.equal(fs.readFileSync(path.join(generatedRoot, file), 'utf8').includes('.ts\''), false, file);
  }
});
