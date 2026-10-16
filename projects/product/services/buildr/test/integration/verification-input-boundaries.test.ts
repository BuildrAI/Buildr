import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { scopedVerificationInputs } from '../verification/verification-inputs.ts';
import { candidateCheckInputIdentity } from '../../tools/release/candidate-source-binding.ts';
import { executableModuleInputs } from '../verification/verification-input-discovery.ts';

test('module discovery distinguishes generated source and comments from actual imports and template expressions', () => {
  const source = [
    "import actual from '../actual.ts';",
    "const fixture = \"import '../../fixture.ts'; await import(variable)\";",
    'function generated() { return `await import(process.env.GENERATED)`; }',
    '// await import(commented)',
    '/* require(alsoCommented) */',
    'const pattern = /import\\(notCode\\)/u;',
    "await import(new URL('../url.ts', import.meta.url).href);",
    "require('../required.ts');",
  ].join('\n');
  const inputs = executableModuleInputs(source);
  assert.deepEqual(inputs.imports, ['../actual.ts', '../url.ts', '../required.ts']);
  assert.equal(inputs.computed, false);
  for (const statement of ['await import(modulePath)', 'require(modulePath)', '`value ${await import(modulePath)}`', '`outer ${`inner ${require(modulePath)}`}`']) {
    assert.equal(executableModuleInputs(statement).computed, true, statement);
  }
  assert.deepEqual(executableModuleInputs("await import(/* comment */ '../literal.ts')").imports, ['../literal.ts']);
});

test('local and Git proofs isolate selected system contents while binding discovery membership and literal URL dependencies', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-input-boundaries-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const prefix = 'projects/product/services/buildr/';
  const files = new Map<string, string>([
    ['package.json', '{}'], ['src/product.ts', 'export const value=1'],
    ['test/verification/system.ts', 'export {}'],
    ['test/system/selected.test.ts', "await import(new URL('../verification/selected.ts', import.meta.url).href)"],
    ['test/verification/selected.ts', 'export const value=1'],
    ['test/system/other.test.ts', '// unrelated'],
  ]);
  const step = { id: 'system-selected', executor: { type: 'node', file: 'test/verification/system.ts', discoveredFiles: ['test/system/selected.test.ts'] } };
  const observe = () => {
    const inventory = [...files].map(([file, value]) => ({ path: prefix + file, mode: '100644', kind: 'blob', object: value }));
    for (const [file, value] of files) {
      const absolute = path.join(root, prefix, file); fs.mkdirSync(path.dirname(absolute), { recursive: true }); fs.writeFileSync(absolute, value);
    }
    const local = scopedVerificationInputs(inventory.map(entry => [entry.path, entry.object]), root, path.join(root, prefix), step);
    const git = candidateCheckInputIdentity(root, 'a'.repeat(40), step, { inventory: () => inventory, blob: (_commit, file) => files.get(file.slice(prefix.length))! });
    return { local: JSON.stringify([local.content, local.recipe]), git, fallback: local.fallback };
  };
  const original = observe(); assert.equal(original.fallback, false);
  files.set('test/system/other.test.ts', '// repaired unrelated assertion');
  assert.deepEqual(observe(), original, 'the other owner content must not invalidate this proof');
  for (const file of ['test/system/selected.test.ts', 'test/verification/selected.ts', 'src/product.ts']) {
    const before = files.get(file)!; files.set(file, before + '\n// changed');
    const changed = observe(); assert.notEqual(changed.local, original.local, file); assert.notEqual(changed.git, original.git, file);
    files.set(file, before);
  }
  files.set('test/system/new.test.ts', '// new member');
  assert.notEqual(observe().local, original.local); assert.notEqual(observe().git, original.git);
  files.delete('test/system/new.test.ts'); files.delete('test/system/other.test.ts');
  assert.notEqual(observe().local, original.local); assert.notEqual(observe().git, original.git);
  files.set('test/system/other.test.ts', '// repaired unrelated assertion');
  files.set('test/system/selected.test.ts', 'await import(process.env.UNKNOWN_MODULE)');
  const opaque = observe(); assert.equal(opaque.fallback, true);
  files.set('test/system/other.test.ts', '// unknown dependency changed');
  assert.notEqual(observe().local, opaque.local); assert.notEqual(observe().git, opaque.git);
});
