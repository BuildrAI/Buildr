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

test('clean installs copy the bundled local agent using the lockfile install mode', () => {
  const metadata = JSON.parse(read('package.json'));
  const lock = JSON.parse(read('package-lock.json'));
  assert.match(read('.npmrc'), /^install-links=true$/m);
  const dependency = metadata.dependencies['@buildr-ai/buildr-agent'];
  assert.equal(dependency, 'file:../buildr-agent');
  assert.ok(metadata.bundleDependencies.includes('@buildr-ai/buildr-agent'));
  const entry = lock.packages['node_modules/@buildr-ai/buildr-agent'];
  assert.equal(entry.resolved, dependency);
  assert.notEqual(entry.link, true, 'bundled local packages use copies rather than checkout symlinks');
});
