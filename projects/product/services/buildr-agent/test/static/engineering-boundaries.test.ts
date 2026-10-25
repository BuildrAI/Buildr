import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '../..');

test('production dependencies remain in the service and consume the host only through injected ports', () => {
  const files = fs.globSync('src/**/*.ts', { cwd: root }).map(file => path.join(root, file));
  assert.ok(files.length > 0, `No service production sources found under ${root}`);
  const issues: string[] = [];
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8');
    const imports = source.matchAll(/(?:\bfrom\s+|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)["']([^"']+)["']/gu);
    for (const match of imports) {
        const name = match[1]!;
        if (name.startsWith('.') && !path.resolve(path.dirname(file), name).startsWith(path.join(root, 'src') + path.sep)) issues.push(`${path.relative(root, file)} -> ${name}`);
        if (name === '@buildr-ai/buildr' || name.startsWith('@buildr-ai/buildr/')) issues.push(`${path.relative(root, file)} -> ${name}`);
    }
  }
  assert.deepEqual(issues, [], 'service production code cannot import the Buildr host or neighbouring source');
});

test('the package exposes one compiled public runtime entry and has no separately publishable surface', () => {
  const metadata = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(metadata.private, true);
  assert.equal(metadata.exports['.'].import, './build/index.js');
  assert.equal(metadata.exports['.'].types, './build/index.d.ts');
  assert.deepEqual(Object.keys(metadata.exports).sort(), ['.', './package.json']);
  assert.ok(!metadata.files.includes('src/'));
  assert.ok(!metadata.scripts.publish);
});
