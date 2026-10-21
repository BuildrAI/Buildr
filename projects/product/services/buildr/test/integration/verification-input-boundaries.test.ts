import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { scopedVerificationInputs } from '../verification/verification-inputs.ts';
import { candidateCheckInputIdentity } from '../../../../../../skills/buildr-release/scripts/candidate-source-binding.ts';
import { discoveredVerificationFiles, executableModuleInputs, verificationModuleSlice } from '../verification/verification-input-discovery.ts';
import { createVerificationSourceInputReader } from '../verification/verification-source-inputs.ts';
import { INTEGRATION_GENERAL_EXCLUDED_FILES, verificationSteps } from '../verification/registry.ts';

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

test('registered unit and contract proofs bind the Web, knowledge and root files their checks actually read', t => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-declared-inputs-'));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  const prefix = 'projects/product/services/buildr/';
  const productRoot = path.join(repo, prefix);
  const write = (file: string, text: string) => {
    const target = path.join(repo, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, text);
  };
  write(prefix + 'package.json', '{}');
  write(prefix + 'test/unit/task-document-links.test.ts', "import '../../../buildr-web/src/lib/taskDocumentLinks.ts';");
  write(prefix + 'test/verification/cli/architecture.ts', "readFileSync(projectRoot + '/knowledge/docs/architecture/technical.md');");
  write(prefix + 'test/verification/runtime/adapter-contract.ts', "readFileSync(repositoryRoot + '/README.md'); readFileSync(repositoryRoot + '/README.en.md');");
  write(prefix + 'test/verification/integrity/managed-mutations.ts', 'export {};');
  const cases = [
    ['unit', 'projects/product/services/buildr-web/src/lib/taskDocumentLinks.ts'],
    ['cli-architecture', 'projects/product/knowledge/docs/architecture/technical.md'],
    ['runtime-adapter-contract', 'README.md'],
    ['runtime-adapter-contract', 'README.en.md'],
  ];
  for (const [, file] of cases) write(file!, '// original input');
  const git = (...args: string[]) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const commit = () => {
    git('add', '.');
    git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.com', '-c', 'commit.gpgSign=false', 'commit', '-m', 'fixture');
    return git('rev-parse', 'HEAD');
  };
  git('init', '--initial-branch=main');
  let source = commit();
  const observe = (id: string) => {
    const step = verificationSteps.find((item: any) => item.id === id);
    const working = createVerificationSourceInputReader(repo, productRoot).inputs(step, true);
    const immutable = createVerificationSourceInputReader(repo, productRoot, source).inputs(step, true);
    assert.deepEqual(working, immutable, `${id}: local and immutable source must agree`);
    return { inputs: working, candidate: candidateCheckInputIdentity(repo, source, step) };
  };
  for (const [id, file] of cases) {
    const before = observe(id!), backendBefore = observe('managed-mutations');
    write(file!, '// changed real input'); source = commit();
    const after = observe(id!);
    assert.notEqual(after.inputs.contentIdentity, before.inputs.contentIdentity, `${id}: ${file}`);
    assert.notEqual(after.candidate, before.candidate, `${id}: formal repair must also reject the previous input`);
    assert.deepEqual(observe('managed-mutations'), backendBefore, 'an independent backend-only proof stays applicable');
  }
});

test('verification map edits affect its readers and unknown inputs rather than every source check', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-map-inputs-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const prefix = 'projects/product/services/buildr/', productRoot = path.join(root, prefix);
  fs.mkdirSync(productRoot, { recursive: true });
  const files = new Map([
    [prefix + 'src/main.ts', 'export const value=1;'],
    [prefix + 'test/check.test.ts', "import '../src/main.ts';"],
    ['projects/product/verification.yml', 'testing: []'],
    ['.github/workflows/verify.yml', 'jobs: {}'],
  ]);
  const step = { id: 'check', executor: { type: 'node-test', files: ['test/check.test.ts'] }, reuse: { scope: 'backend' as const } };
  const observe = () => createVerificationSourceInputReader(root, productRoot, undefined, {
    entries: [...files].map(([file, text]) => [file, text]), unavailable: new Set(), readText: file => files.get(file)!,
  }).inputs(step, true);
  const original = observe(); files.set('projects/product/verification.yml', 'testing: [changed]');
  files.set('.github/workflows/verify.yml', 'jobs: {changed: {}}');
  assert.deepEqual(observe(), original);
  for (const [reader, file] of [["readFileSync('projects/product/verification.yml');", 'projects/product/verification.yml'],
    ["readFileSync('.github/workflows/verify.yml');", '.github/workflows/verify.yml'],
    ['await import(process.env.UNKNOWN_MODULE);', 'projects/product/verification.yml']] as const) {
    files.set(prefix + 'test/check.test.ts', reader);
    const before = observe(); files.set(file, files.get(file) + '\nchanged');
    assert.notDeepEqual(observe(), before, reader);
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
  const helper = 'const dependency=1; export function used(){return dependency;} export function unrelated(){return 2;}';
  const before = verificationModuleSlice(helper, new Set(['used']));
  assert.deepEqual(verificationModuleSlice(helper.replace('return 2', 'return 3'), new Set(['used'])), before);
  assert.notDeepEqual(verificationModuleSlice(helper.replace('dependency=1', 'dependency=2'), new Set(['used'])), before);
  assert.match(verificationModuleSlice(helper + '\nmutateGlobal();', new Set(['used'])).text, /mutateGlobal/);
  assert.equal(executableModuleInputs("const root=new URL('../assets/', import.meta.url); await import(new URL('entry.mjs', root).href)").computed, false);
  assert.equal(executableModuleInputs("const root=process.env.UNKNOWN; await import(new URL('entry.mjs', root).href)").computed, true);
  assert.deepEqual(executableModuleInputs('await import(`../renderer.ts?test=${Date.now()}-${Math.random()}`)').imports, ['../renderer.ts']);
});

test('reviewed release-note independence preserves real readers, unknown roots and local/Git agreement', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-release-note-inputs-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const prefix = 'projects/product/services/buildr/', productRoot = path.join(root, prefix);
  fs.mkdirSync(productRoot, { recursive: true });
  const files = new Map<string, string>([
    ['CHANGELOG.md', '# Changelog\n'], [prefix + 'package.json', '{}'],
    [prefix + 'src/product.ts', 'export const value=1;'],
    [prefix + 'test/verification/fixture.ts', 'export const assertion=1;'],
    ['projects/product/knowledge/current.md', '# Current knowledge\n'],
    ['projects/product/openspec/specs/current/spec.md', '# Current specification\n'],
  ]);
  const registered = verificationSteps.find((item: any) => item.id === 'package-static');
  assert.equal(registered.reuse.scope, 'repository', 'package checks still bind actual Product knowledge and OpenSpec');
  assert.equal(registered.reuse.releaseNotes, false);
  const step = { ...registered, executor: { type: 'node', file: 'test/verification/fixture.ts' } };
  const observe = (selected = step) => {
    const inventory = [...files].map(([file, text]) => ({ path: file, mode: '100644', kind: 'blob', object: text }));
    const source = { entries: inventory.map(item => [item.path, item.object]), unavailable: new Set<string>(), readText: (file: string) => files.get(file)! };
    const local = createVerificationSourceInputReader(root, productRoot, undefined, source).inputs(selected, true);
    const immutable = candidateCheckInputIdentity(root, 'a'.repeat(40), selected, { inventory: () => inventory, blob: (_commit, file) => files.get(file)! });
    return { local, immutable };
  };
  const original = observe();
  files.set('CHANGELOG.md', '# Changelog\n- Release note repair\n');
  assert.deepEqual(observe(), original, 'only the reviewed independent material is excluded');
  for (const file of [prefix + 'package.json', prefix + 'src/product.ts']) {
    const before = files.get(file)!; files.set(file, before + '\nchanged actual input');
    const changed = observe();
    assert.notEqual(changed.local.contentIdentity, original.local.contentIdentity, file);
    assert.notEqual(changed.immutable, original.immutable, file);
    files.set(file, before);
  }
  const conservative = { ...step, reuse: { ...step.reuse, releaseNotes: undefined } };
  const unreviewed = observe(conservative);
  files.set('CHANGELOG.md', '# Changed again\n');
  assert.notDeepEqual(observe(conservative), unreviewed, 'unreviewed checks retain the original complete scope');
  for (const source of [
    "fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');",
    'for (const file of fs.readdirSync(repositoryRoot)) fs.readFileSync(path.join(repositoryRoot, file));',
    'const files = fs.readdirSync(\n  repositoryRoot,\n);',
    'fs.readFileSync(\n  path.join(repositoryRoot, file),\n  "utf8",\n);',
    'await import(process.env.UNKNOWN_MODULE);',
  ]) {
    files.set(prefix + 'test/verification/fixture.ts', source);
    const before = observe();
    files.set('CHANGELOG.md', files.get('CHANGELOG.md') + '\nchanged');
    const after = observe();
    assert.notEqual(after.local.contentIdentity, before.local.contentIdentity, source);
    assert.notEqual(after.immutable, before.immutable, source);
  }
});

test('reviewed source checks keep results for a notes-only repair while binding their actual source and execution inputs', () => {
  const productRoot = path.resolve(import.meta.dirname, '../..'), repositoryRoot = path.resolve(productRoot, '../../../..');
  const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd: repositoryRoot, encoding: 'utf8' }).split('\0').filter(Boolean);
  const content = new Map<string, string>(), entries: string[][] = [];
  const hash = (value: string | Buffer) => crypto.createHash('sha256').update(value).digest('hex');
  for (const file of [...new Set(files)].sort()) {
    const absolute = path.join(repositoryRoot, file), stat = fs.lstatSync(absolute, { throwIfNoEntry: false });
    if (!stat) { entries.push([file, 'absent']); continue; }
    if (!stat.isFile() && !stat.isSymbolicLink()) { entries.push([file, 'other']); continue; }
    const bytes = fs.readFileSync(absolute); content.set(file, bytes.toString('utf8'));
    entries.push(stat.isSymbolicLink() ? [file, 'link', fs.readlinkSync(absolute), hash(bytes)] : [file, stat.mode & 0o111 ? 'executable' : 'file', hash(bytes)]);
  }
  assert.ok(content.has('CHANGELOG.md'));
  const observe = (changed?: string) => createVerificationSourceInputReader(repositoryRoot, productRoot, undefined, {
    entries: entries.map(entry => entry[0] === changed ? [entry[0]!, 'file', hash(content.get(changed)! + '\ninput perturbation')] : entry),
    unavailable: new Set(), readText: file => content.get(file)!,
  });
  const original = observe(), notes = observe('CHANGELOG.md');
  const ids = ['integration-knowledge', 'integration-workspace-assets', 'integration-archify',
    'integration-declarations', 'integration-openspec', 'system-public-json-contracts',
    'system-openspec-contract-audit', 'concurrent-task-acceptance', 'npm-launcher-candidate', 'capability-cli-integration',
    'commands-cli-integration', 'remote-skill-timeout'];
  const actualInputs = ['projects/product/services/buildr/package-lock.json', 'projects/product/services/buildr/src/bootstrap/cli/main.ts',
    'projects/product/services/buildr/resources/workspace/AGENTS.md'];
  const readers = actualInputs.map(file => { assert.ok(content.has(file), file); return [file, observe(file)] as const; });
  for (const id of ids) {
    const step = verificationSteps.find((item: any) => item.id === id), before = original.inputs(step, true);
    assert.deepEqual(notes.inputs(step, true), before, id + ': release-note content is independent');
    for (const [file, reader] of readers) assert.notDeepEqual(reader.inputs(step, true), before, id + ': ' + file);
  }
  const projected = verificationSteps.find((item: any) => item.id === 'integration-self-bootstrap');
  assert.deepEqual(notes.inputs(projected, true), original.inputs(projected, true),
    'the copied module binds its original source, not unrelated release notes');
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
  for (const file of ['test/verification/executor.ts', 'test/verification/plan-runner.ts', 'test/verification/dag-scheduler.ts', 'test/verification/resource-coordinator.ts']) {
    files.set(file, '// shared execution behavior changed');
    const changed = observe();
    assert.equal(changed.local, original.local, file); assert.equal(changed.git, original.git, file);
    files.delete(file);
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

test('compatibility general input discovery follows all source members and retains imported artifact-only inputs', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-general-input-boundaries-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const prefix = 'projects/product/services/buildr/';
  fs.mkdirSync(path.join(root, prefix), { recursive: true });
  const delegated = 'test/integration/application-payload-release.test.ts';
  const addedDelegated = 'test/integration/npm-launcher.test.ts';
  const general = 'test/integration/general.test.ts';
  const files = new Map<string, string>([
    ['package.json', '{}'], ['src/product.ts', 'export const value=1'],
    ['test/verification/integration.ts', 'export {}'],
    [general, 'export const assertion=1'], [delegated, 'export const delegated=1'],
    ['test/integration/nested/ignored.test.ts', '// not a top-level member'],
    ['test/integration/ignored.test.mjs', '// not selected by the actual *.test.ts runner'],
  ]);
  const step = { ...verificationSteps.find((item: any) => item.id === 'integration'), executor: { type: 'node', file: 'test/verification/integration.ts', args: ['--suite', 'general'], excludedFiles: [...INTEGRATION_GENERAL_EXCLUDED_FILES] } };
  const observe = () => {
    const inventory = [...files].map(([file, value]) => ({ path: prefix + file, mode: '100644', kind: 'blob', object: value }));
    const inputs = scopedVerificationInputs(inventory.map(entry => [entry.path, entry.object]), root, path.join(root, prefix), step, {
      proof: true, readText: file => files.get(file.slice(prefix.length))!,
    });
    const immutable = candidateCheckInputIdentity(root, 'a'.repeat(40), step, { inventory: () => inventory, blob: (_commit, file) => files.get(file.slice(prefix.length))! });
    return { local: JSON.stringify([inputs.content, inputs.recipe]), immutable, fallback: inputs.fallback };
  };
  assert.deepEqual(discoveredVerificationFiles(step, [...files.keys()]), { selected: [general], inventory: [general] });
  const original = observe();
  assert.equal(original.fallback, false);
  for (const file of [delegated, 'test/integration/nested/ignored.test.ts', 'test/integration/ignored.test.mjs']) {
    files.set(file, '// unrelated content changed');
    assert.deepEqual(observe(), original, `${file}: unexecuted content is not an input`);
  }
  files.set(addedDelegated, '// another delegated owner appeared');
  assert.deepEqual(observe(), original, 'new delegated members are still outside general execution');
  files.delete(delegated);
  assert.deepEqual(observe(), original, 'a removed delegated member is checked by its own owner');
  files.set('test/integration/new-general.test.ts', '// new general assertion');
  assert.notEqual(observe().local, original.local);
  assert.notEqual(observe().immutable, original.immutable);
  files.delete('test/integration/new-general.test.ts');
  files.set(general, 'export const assertion=2');
  assert.notEqual(observe().local, original.local);
  assert.notEqual(observe().immutable, original.immutable);
  files.set(general, "import './application-payload-release.test.ts';");
  files.set(delegated, 'export const delegated=1');
  const imported = observe();
  assert.equal(imported.fallback, false);
  files.set(delegated, 'export const delegated=2');
  assert.notEqual(observe().local, imported.local, 'a real import must not be hidden by discovery exclusions');
  assert.notEqual(observe().immutable, imported.immutable);
  files.set(general, 'await import(process.env.UNKNOWN_MODULE)');
  const opaque = observe();
  assert.equal(opaque.fallback, true);
  files.set(delegated, 'export const delegated=3');
  assert.notEqual(observe().local, opaque.local, 'an unknown reader retains the conservative fallback');
  assert.notEqual(observe().immutable, opaque.immutable);
});

test('stable Integration slices bind their own explicit tests and preserve local and immutable input agreement', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-integration-slice-inputs-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const prefix = 'projects/product/services/buildr/';
  fs.mkdirSync(path.join(root, prefix), { recursive: true });
  const files = new Map<string, string>([['package.json', '{}'], ['src/product.ts', 'export const product=1;']]);
  const ids = ['integration', 'integration-code', 'integration-desktop', 'integration-knowledge', 'integration-workspace-assets', 'integration-archify',
    'integration-task-records', 'integration-connections', 'integration-connections-cli', 'integration-runtime-projection', 'integration-runtime'];
  const steps = ids.map(id => verificationSteps.find((item: any) => item.id === id));
  for (const step of steps) {
    for (const file of step.executor.files) files.set(file, 'export const assertion=1;');
    files.set(`test/helpers/${step.id}.ts`, 'export const helper=1;');
    files.set(step.executor.files[0], `import '../helpers/${step.id}.ts'; export const assertion=1;`);
  }
  const observe = (step: any) => {
    const inventory = [...files].map(([file, text]) => ({ path: prefix + file, mode: '100644', kind: 'blob', object: text }));
    const options = { proof: true, readText: (file: string) => files.get(file.slice(prefix.length))! };
    const inputs = scopedVerificationInputs(inventory.map(entry => [entry.path, entry.object]), root, path.join(root, prefix), step, options);
    const immutable = candidateCheckInputIdentity(root, 'a'.repeat(40), step, { inventory: () => inventory, blob: (_commit, file) => files.get(file.slice(prefix.length))! });
    return { local: JSON.stringify([inputs.content, inputs.recipe]), immutable, fallback: inputs.fallback };
  };
  for (const step of steps) {
    const original = observe(step);
    assert.equal(original.fallback, false, step.id);
    const selected = step.executor.files[0], unrelated = steps.find(other => other.id !== step.id).executor.files[0];
    const before = files.get(unrelated)!; files.set(unrelated, '// repaired another owner');
    assert.deepEqual(observe(step), original, `${step.id}: another slice does not invalidate a result`);
    files.set(unrelated, before);
    const helper = `test/helpers/${step.id}.ts`;
    const unrelatedHelper = `test/helpers/${steps.find(other => other.id !== step.id).id}.ts`;
    files.set(unrelatedHelper, 'export const helper=2;');
    assert.deepEqual(observe(step), original, `${step.id}: an unrelated helper repair preserves this result`);
    files.set(unrelatedHelper, 'export const helper=1;');
    files.set(helper, 'export const helper=2;');
    assert.notEqual(observe(step).local, original.local, 'its imported helper remains an actual input');
    assert.notEqual(observe(step).immutable, original.immutable);
    files.set(helper, 'export const helper=1;');
    const selectedBefore = files.get(selected)!;
    files.set(selected, '// changed own assertion');
    assert.notEqual(observe(step).local, original.local, step.id);
    assert.notEqual(observe(step).immutable, original.immutable, step.id);
    files.set(selected, selectedBefore);
    const extended = { ...step, executor: { ...step.executor, files: [...step.executor.files, 'test/integration/new-member.test.ts'] } };
    files.set('test/integration/new-member.test.ts', 'export {};');
    assert.notEqual(observe(extended).local, original.local, `${step.id}: adding an executing member invalidates the prior recipe`);
    assert.notEqual(observe(extended).immutable, original.immutable, step.id);
    files.delete('test/integration/new-member.test.ts');
  }
  const directoryReader = steps[0];
  files.set(directoryReader.executor.files[0], "readdirSync(path.resolve(root, 'test/helpers'));");
  const beforeDirectoryChange = observe(directoryReader);
  files.set(`test/helpers/${steps[1].id}.ts`, 'export const helper=3;');
  assert.notEqual(observe(directoryReader).local, beforeDirectoryChange.local, 'directory discovery still binds every helper');
  assert.notEqual(observe(directoryReader).immutable, beforeDirectoryChange.immutable);
});
