import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (relative) => fs.readFileSync(relative, 'utf8');

test('payload toolchain is exact and npm runtime bundle stays CommonJS without splitting', () => {
  const metadata = JSON.parse(read('package.json'));
  const lock = JSON.parse(read('package-lock.json'));
  assert.equal(metadata.devDependencies.esbuild, '0.28.2');
  assert.equal(metadata.devDependencies.typescript, '7.0.2');
  assert.equal(metadata.devDependencies['@types/node'], '24.13.3');
  assert.equal(metadata.dependencies.typescript, undefined);
  assert.equal(metadata.dependencies['@types/node'], undefined);
  assert.equal(lock.packages['node_modules/esbuild'].version, '0.28.2');
  assert.equal(lock.packages['node_modules/postject'], undefined);
  const builder = read('tools/release/application-payload.mjs');
  assert.doesNotMatch(builder, /^import .* from 'esbuild';$/mu);
  assert.match(builder, /await import\('esbuild'\)/);
  assert.match(builder, /format: 'cjs'/);
  assert.match(builder, /splitting: false/);
  assert.match(builder, /external: \['node:\*'\]/);
  assert.match(builder, /sourcemap: false/);
  assert.match(builder, /bundle\.warnings\.length/);
  assert.match(builder, /formatMessagesSync\(bundle\.warnings/);
  assert.match(builder, /application payload bundle emitted warnings/);
  assert.match(read('src/bootstrap/cli/registry.mjs'), /from '\.\/identity\.ts'/);
});

test('runtime resources use payload resolver and SQLite is a static Node builtin', () => {
  const sqlite = read('src/infrastructure/sqlite/workspace-sqlite.mjs');
  assert.match(sqlite, /import \{ DatabaseSync \} from 'node:sqlite'/);
  assert.doesNotMatch(sqlite, /await import\('node:sqlite'\)/);
  assert.match(sqlite, /resolveProductResource\('product\/src\/infrastructure\/sqlite\/migrations'\)/);
  assert.match(read('src/web/http/static-files.mjs'), /resolveProductResource\('product\/web-dist'\)/);
  assert.match(read('src/web/http/read-executor.mjs'), /resolveProductResource\('runtime\/read-worker\.cjs'/);
});

test('npm pack path consumes frozen payload and admits only Launcher icon resources', () => {
  const metadata = JSON.parse(read('package.json'));
  assert.equal(metadata.files.some((entry) => entry === 'package/' || entry.startsWith('package/launchers')), false);
  assert.ok(metadata.files.includes('package/targets/runtime/'));
  assert.ok(metadata.files.includes('resources/'));
  assert.ok(metadata.files.includes('web-dist/'));
  assert.equal(metadata.files.some((entry) => entry.startsWith('tools/') || entry.startsWith('test/')), false);
  const artifact = read('tools/release/release-artifact.mjs');
  assert.match(artifact, /createNpmPackStaging\(payloadRoot/);
  assert.equal((artifact.match(/\['pack', stagingRoot/g) || []).length, 1);
  assert.match(artifact, /application-payload\.json/);
  assert.match(artifact, /installation-origin\.json/);
  assert.match(artifact, /resources\/installation\/launcher\/Buildr/);
  assert.equal(artifact.includes('(?:app|pkg|msi|vbs|map)'), true);
});
