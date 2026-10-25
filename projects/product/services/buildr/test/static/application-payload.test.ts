import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read: any = (relative: any) => fs.readFileSync(relative, 'utf8');

test('runtime package metadata excludes development compilers', () => {
  const metadata: any = JSON.parse(read('package.json'));
  const lock: any = JSON.parse(read('package-lock.json'));
  assert.equal(metadata.dependencies.typescript, undefined);
  assert.equal(metadata.dependencies['@types/node'], undefined);
  assert.equal(lock.packages['node_modules/postject'], undefined);
});

test('npm metadata declares runtime resources and excludes checkout tools', () => {
  const metadata: any = JSON.parse(read('package.json'));
  assert.equal(metadata.files.some((entry: any) => entry === 'package/' || entry.startsWith('tools/build/launcher')), false);
  assert.ok(metadata.files.includes('resources/'));
  assert.ok(metadata.files.includes('web-dist/'));
  assert.equal(metadata.files.some((entry: any) => entry.startsWith('tools/') || entry.startsWith('test/')), false);
});
