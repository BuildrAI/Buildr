import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { scopedVerificationInputs } from '../verification/verification-inputs.ts';
import { candidateCheckInputIdentity } from '../../tools/release/candidate-source-binding.ts';
import { executableModuleInputs } from '../verification/verification-input-discovery.ts';
import { createVerificationSourceInputReader } from '../verification/verification-source-inputs.ts';

test('working-tree and immutable Git readers give the same inputs across scopes and preserve modes and links', t => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-input-reader-'));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  const prefix = 'projects/product/services/buildr/';
  const write = (file: string, text: string) => { const target = path.join(repo, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, text); };
  write(prefix + 'package.json', '{}'); write(prefix + 'src/main.ts', 'export const value=1;');
  write(prefix + 'test/check.test.ts', "import '../src/main.ts';");
  write('projects/product/services/buildr-web/src/main.ts', '// web');
  write('projects/product/services/dsh-plugin/src/main.ts', '// plugin');
  write('projects/product/knowledge/example.md', 'description');
  write(prefix + 'run', '#!/bin/sh\n'); fs.chmodSync(path.join(repo, prefix, 'run'), 0o755);
  if (process.platform !== 'win32') fs.symlinkSync('main.ts', path.join(repo, prefix, 'src/link.ts'));
  const git = (...args: string[]) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' }).trim();
  git('init', '--initial-branch=main'); git('add', '.');
  git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.com', '-c', 'commit.gpgSign=false', 'commit', '-m', 'fixture');
  const working = createVerificationSourceInputReader(repo, path.join(repo, prefix));
  const committed = createVerificationSourceInputReader(repo, path.join(repo, prefix), git('rev-parse', 'HEAD'));
  assert.deepEqual(working.contentIdentities, committed.contentIdentities);
  for (const scope of ['backend', 'web', 'plugin', 'product', 'repository', 'runtime'] as const) {
    const step = { id: 'check', executor: { type: 'node-test', files: ['test/check.test.ts'] }, reuse: { scope } };
    assert.deepEqual(working.inputs(step, true), committed.inputs(step, true), scope);
  }
});

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
    ['test/verification/verification-reuse.ts', '// result adoption only'],
    ['test/verification/verification-inputs.ts', '// input validation only'],
    ['test/verification/verification-input-discovery.ts', '// input discovery only'],
  ]);
  const step = { id: 'system-selected', executor: { type: 'node', file: 'test/verification/system.ts', discoveredFiles: ['test/system/selected.test.ts'] } };
  const observe = () => {
    const inventory = [...files].map(([file, value]) => ({ path: prefix + file, mode: '100644', kind: 'blob', object: value }));
    for (const [file, value] of files) {
      const absolute = path.join(root, prefix, file); fs.mkdirSync(path.dirname(absolute), { recursive: true }); fs.writeFileSync(absolute, value);
    }
    const local = scopedVerificationInputs(inventory.map(entry => [entry.path, entry.object]), root, path.join(root, prefix), step, { proof: true });
    const git = candidateCheckInputIdentity(root, 'a'.repeat(40), step, { inventory: () => inventory, blob: (_commit, file) => files.get(file.slice(prefix.length))! });
    return { local: JSON.stringify([local.content, local.recipe]), git, fallback: local.fallback };
  };
  const original = observe(); assert.equal(original.fallback, false);
  files.set('test/system/other.test.ts', '// repaired unrelated assertion');
  assert.deepEqual(observe(), original, 'the other owner content must not invalidate this proof');
  files.set('test/verification/verification-reuse.ts', '// repaired result adoption only');
  assert.deepEqual(observe(), original, 'adoption code does not execute this check');
  files.set('test/system/selected.test.ts', files.get('test/system/selected.test.ts') + '\nconst fixture = "await import(process.env.FIXTURE_MODULE)";');
  const generated = observe(); assert.equal(generated.fallback, false);
  files.set('test/system/other.test.ts', '// unrelated change after generated source');
  assert.deepEqual(observe(), generated, 'generated source cannot become a runtime dependency');
  files.set('test/system/selected.test.ts', "await import(new URL('../verification/selected.ts', import.meta.url).href)");
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
