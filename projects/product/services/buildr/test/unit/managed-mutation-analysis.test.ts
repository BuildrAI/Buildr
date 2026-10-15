import assert from 'node:assert/strict';
import test from 'node:test';
import { findManagedMutationViolations } from '../verification/integrity/managed-mutation-analysis.ts';
import { createVerificationPlan } from '../verification/planner.ts';

test('managed mutations recognize async functions and class methods rather than the preceding reader', () => {
  const source = `function read() { return ''; }
export async function publish() { fs.writeFileSync(file, content); }
class Store {
  private write(): void { fs.renameSync(temporary, file); }
  async clear(): Promise<void> { fs.rmSync(file); }
}`;
  assert.deepEqual(findManagedMutationViolations(source, 'src/owned.ts', new Set(['publish', 'write', 'clear'])), []);
  assert.deepEqual(findManagedMutationViolations(source, 'src/owned.ts', new Set(['read'])), [
    'src/owned.ts:2: direct mutation in publish',
    'src/owned.ts:4: direct mutation in write',
    'src/owned.ts:5: direct mutation in clear',
  ]);
});

test('reviewed names do not authorize another file, another method, a sibling scope or top-level writes', () => {
  const source = `function publish() { fs.writeFileSync(file, content); }
async function unrelated() { fs.copyFileSync(source, file); }
class Store { unsafe() { fs.rmSync(file); } }
fs.appendFileSync(file, content);`;
  assert.deepEqual(findManagedMutationViolations(source, 'src/owned.ts', new Set(['publish'])), [
    'src/owned.ts:2: direct mutation in unrelated',
    'src/owned.ts:3: direct mutation in unsafe',
    'src/owned.ts:4: direct mutation in <top-level>',
  ]);
  assert.equal(findManagedMutationViolations(source, 'src/other.ts').length, 4);
});

test('nested function ownership returns to its caller while anonymous callbacks stay inside their owner', () => {
  const source = `function publish() {
  function read() { return file; }
  fs.writeFileSync(file, content);
  entries.forEach(() => { fs.cpSync(source, file); });
  function unsafe() { fs.rmSync(file); }
}`;
  assert.deepEqual(findManagedMutationViolations(source, 'src/owned.ts', new Set(['publish'])), ['src/owned.ts:5: direct mutation in unsafe']);
});

test('literal prose and braces cannot invent mutations or extend a reviewed owner past its end', () => {
  const source = "function publish() { const text = 'fs.writeFileSync(file, content) }'; const pattern = /[{}]/; }\n"
    + '// fs.rmSync(file)\n'
    + 'fs.rmSync(file);\n'
    + 'const text = `fs.writeFileSync(file, content) ${fs.renameSync(source, file)}`;';
  assert.deepEqual(findManagedMutationViolations(source, 'src/owned.ts', new Set(['publish'])), [
    'src/owned.ts:3: direct mutation in <top-level>',
    'src/owned.ts:4: direct mutation in <top-level>',
  ]);
});

test('optional and literal indexed filesystem writes cannot bypass the same owner boundary', () => {
  const calls = ['fs?.writeFileSync(file, content)', "fs['rmSync'](file)", 'fs?.["rmSync"](file)',
    'fs.writeFileSync?.(file, content)', 'fs["writeFileSync"]?.(file, content)', 'fs?.["rmSync"]?.(file)'];
  const source = `async function unsafe() { ${calls.join('; ')}; }`;
  assert.deepEqual(findManagedMutationViolations(source, 'src/unsafe.ts'), calls.map(() => 'src/unsafe.ts:1: direct mutation in unsafe'));
  assert.deepEqual(findManagedMutationViolations(source, 'src/unsafe.ts', new Set(['unsafe'])), []);
  assert.deepEqual(findManagedMutationViolations('fs.readFileSync?.(file); fs?.["readFileSync"](file);', 'src/reader.ts'), []);
});

test('division after object expressions cannot swallow an unowned filesystem call', () => {
  const source = 'function publish() {}\nconst first = {} / fs.rmSync(file);\n'
    + 'const second = { valueOf() { return 1; } } / fs.writeFileSync(file, content);\n'
    + 'const third = function expression() {} / fs.copyFileSync(source, file);';
  assert.deepEqual(findManagedMutationViolations(source, 'src/unsafe.ts', new Set(['publish'])), [
    'src/unsafe.ts:2: direct mutation in <top-level>',
    'src/unsafe.ts:3: direct mutation in <top-level>',
    'src/unsafe.ts:4: direct mutation in <top-level>',
  ]);
});

test('known statement-block regex literals and quoted call text remain non-executable', () => {
  const source = 'function publish() {} /fs.writeFileSync(file, content)/.test(text);\n'
    + 'if (ready) {} /fs.rmSync(file)/.test(text);\n'
    + 'if (ready) /fs.copyFileSync(source, file)/.test(text);\n'
    + 'try {} finally {} /fs.cpSync(source, file)/.test(text);\n'
    + 'const quoted = "fs.writeFileSync(file, content)"; const template = `fs.rmSync(file)`;\n'
    + 'fs.renameSync(source, file);';
  assert.deepEqual(findManagedMutationViolations(source, 'src/unsafe.ts'), [
    'src/unsafe.ts:6: direct mutation in <top-level>',
  ]);
});

test('new filesystem owners and the analyzer select the managed-mutation package check', () => {
  for (const source of [
    'src/modules/code/application/code-commit-application.ts',
    'src/modules/code/infrastructure/code-fetch-refs.ts',
    'src/modules/code/infrastructure/editable-file.ts',
    'src/modules/connection-skills/persistence/files.ts',
    'test/verification/integrity/managed-mutation-analysis.ts',
  ]) {
    const plan = createVerificationPlan({ paths: [source], groups: ['package'] });
    assert.ok(plan.steps.some((step: { id: string }) => step.id === 'managed-mutations'), source);
  }
});
