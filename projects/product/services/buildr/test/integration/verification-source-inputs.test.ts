import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { pinSourceVerificationBase } from '../verification/source.ts';
import { createVerificationExecutor } from '../verification/executor.ts';
import { verificationSteps } from '../verification/registry.ts';
import { createVerificationSourceInputReader } from '../verification/verification-source-inputs.ts';
import { createVerificationReuseIdentity } from '../verification/verification-reuse.ts';

test('shared parsing keeps each check equivalent to a fresh observation, including import discovery order', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-input-analysis-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const prefix = 'projects/product/services/buildr/', productRoot = path.join(root, prefix);
  fs.mkdirSync(productRoot, { recursive: true });
  const files = new Map([
    ['test/first.test.ts', "import { a, b } from './helpers/shared.ts'; a(); b();"],
    ['test/second.test.ts', "import { b, a } from './helpers/shared.ts'; b(); a();"],
    ['test/helpers/shared.ts', "import { first } from './first.ts'; import { second } from './second.ts'; export function a() { return first; } export function b() { return second; }"],
    ['test/helpers/first.ts', 'export const first = 1;'],
    ['test/helpers/second.ts', 'export const second = 2;'],
  ].map(([file, text]) => [prefix + file, text]));
  const source = { entries: [...files].map(([file, text]) => [file!, 'file', crypto.createHash('sha256').update(text!).digest('hex')]),
    unavailable: new Set<string>(), readText: (file: string) => files.get(file)! };
  const observe = () => createVerificationSourceInputReader(root, productRoot, undefined, source);
  const step = (file: string) => ({ id: file, executor: { type: 'node-test', files: [file] }, reuse: { scope: 'backend' as const } });
  const shared = observe();
  for (const file of ['test/first.test.ts', 'test/second.test.ts', 'test/first.test.ts']) {
    assert.deepEqual(shared.inputs(step(file), true), observe().inputs(step(file), true));
  }
});

test('an observed working source retains its own module bytes while a fresh observation detects same-size drift', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-source-observation-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const productRoot = path.join(root, 'projects/product/services/buildr');
  fs.mkdirSync(path.join(productRoot, 'test'), { recursive: true });
  fs.writeFileSync(path.join(productRoot, 'test/check.ts'), "import './first.ts';");
  fs.writeFileSync(path.join(productRoot, 'test/first.ts'), 'export const first = 1;');
  fs.writeFileSync(path.join(productRoot, 'test/other.ts'), 'export const other = 2;');
  const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '-b', 'dev'); git('add', '.');
  git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgSign=false', 'commit', '-m', 'baseline');
  const step = { id: 'check', executor: { type: 'node-test', files: ['test/check.ts'] }, reuse: { scope: 'backend' as const } };
  const expected = createVerificationSourceInputReader(root, productRoot, git('rev-parse', 'HEAD')).inputs(step, true);
  const observed = createVerificationSourceInputReader(root, productRoot);
  const file = path.join(productRoot, 'test/check.ts'), stat = fs.statSync(file);
  fs.writeFileSync(file, "import './other.ts';"); fs.utimesSync(file, stat.atime, stat.mtime);
  assert.deepEqual(observed.inputs(step, true), expected);
  assert.notDeepEqual(createVerificationSourceInputReader(root, productRoot).inputs(step, true), expected);
});

test('dynamic typecheck proof conservatively binds possible compilation inputs, transport and tools', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-typecheck-inputs-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const prefix = 'projects/product/services/buildr/', productRoot = path.join(root, prefix);
  fs.mkdirSync(productRoot, { recursive: true });
  const files = new Map([
    [prefix + 'package.json', '{"scripts":{"typecheck":"tsc --project tsconfig.json"}}'],
    [prefix + 'package-lock.json', '{"lockfileVersion":3}'],
    [prefix + 'tsconfig.json', '{"compilerOptions":{"strict":true}}'],
    [prefix + 'tsconfig.test.json', '{"extends":"./tsconfig.json"}'],
    [prefix + 'src/contract.d.ts', 'export interface Contract { value: string }'],
    [prefix + 'tools/codegen/contracts/task-dto.ts', 'export {};'],
    [prefix + 'tools/testing/run-types.ts', 'export {};'],
    [prefix + 'test/verification/executor.ts', 'export {};'],
  ]);
  const sha = (value: unknown) => `sha256-${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}` as const;
  const selected = verificationSteps.find((step: any) => step.id === 'typecheck');
  assert.deepEqual(selected.reuse, { scope: 'repository', exactNode: true, tools: ['npm'] });
  const observe = () => createVerificationSourceInputReader(root, productRoot, undefined, {
    entries: [...files].map(([file, text]) => [file, 'file', sha(text)]), unavailable: new Set(), readText: file => files.get(file)!,
  });
  const snapshot: any = { productRoot, repositoryRoot: root, sourceCommit: 'a'.repeat(40), gitIdentity: sha('git'),
    contentIdentities: observe().contentIdentities,
    environment: { platform: 'darwin', arch: 'arm64', nodeVersion: '24.21.0', variablesIdentity: sha('env'),
      tools: { 'backend-dependencies': sha('backend'), 'web-dependencies': sha('web'), npm: '11.19.0' } } };
  const original = createVerificationReuseIdentity(selected, snapshot);
  assert.ok(original);
  const inputBefore = observe().inputs(selected, true);
  const executionBefore = observe().inputs(selected, false);
  for (const file of files.keys()) {
    const before = files.get(file)!; files.set(file, before + '\n// changed real input');
    const reader = observe();
    assert.notDeepEqual(reader.inputs(selected, false), executionBefore, file);
    // This fixture has no include/exclude restriction. The dynamic command is
    // not a parsed compiler input declaration, so excluding test/verification
    // would be an unproved optimization (tsconfig defaults can include it).
    assert.notDeepEqual(reader.inputs(selected, true), inputBefore, file);
    assert.notEqual(createVerificationReuseIdentity(selected, { ...snapshot, contentIdentities: reader.contentIdentities })?.key, original.key, file);
    files.set(file, before);
  }
  for (const name of ['backend-dependencies', 'web-dependencies', 'npm']) {
    const changed = { ...snapshot, environment: { ...snapshot.environment, tools: { ...snapshot.environment.tools, [name]: sha('changed tool') } } };
    assert.notEqual(createVerificationReuseIdentity(selected, changed)?.key, original.key, name);
  }
  assert.notEqual(createVerificationReuseIdentity(selected, { ...snapshot, environment: { ...snapshot.environment, nodeVersion: '24.21.1' } })?.key, original.key);
});

test('a source run pins its Git base before shared refs move and passes the exact comparison to its real child', async t => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-source-base-'));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '--initial-branch=dev');
  git('config', 'user.email', 'source-test@example.invalid');
  git('config', 'user.name', 'Source verification test');
  fs.writeFileSync(path.join(repo, 'source.txt'), 'base\n');
  git('add', '.'); git('commit', '-m', 'base');
  const base = git('rev-parse', 'HEAD');
  git('update-ref', 'refs/remotes/origin/dev', base);
  fs.writeFileSync(path.join(repo, 'source.txt'), 'candidate\n');
  git('add', '.'); git('commit', '-m', 'candidate');
  const head = git('rev-parse', 'HEAD');
  const original = { ...process.env, BUILDR_VERIFICATION_BASE: 'origin/dev' };
  const env = pinSourceVerificationBase(repo, original);
  assert.equal(env.BUILDR_VERIFICATION_BASE, base);
  assert.equal(original.BUILDR_VERIFICATION_BASE, 'origin/dev');
  git('update-ref', 'refs/remotes/origin/dev', head);
  fs.writeFileSync(path.join(repo, 'comparison.mjs'), `import { execFileSync } from 'node:child_process';
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const base = process.env.BUILDR_VERIFICATION_BASE;
console.log(JSON.stringify({ base, head: git('rev-parse', 'HEAD'), mergeBase: git('merge-base', base, 'HEAD') }));\n`);
  const execute = createVerificationExecutor({ productRoot: repo, projectRoot: repo, env: { ...env, NODE_TEST_CONTEXT: undefined },
    diagnosticsDirectory: path.join(repo, 'diagnostics') });
  const result = await execute({ id: 'comparison', name: 'Pinned comparison', timeoutMs: 10_000,
    executor: { type: 'node', file: 'comparison.mjs' } });
  assert.equal(result.status, 'passed', result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { base, head, mergeBase: base });
  const diagnostic = await execute({ id: 'comparison-diagnostic', name: 'Pinned comparison cases', timeoutMs: 10_000,
    executor: { type: 'node-test', files: ['comparison.mjs'], args: ['--test-reporter=dot'] } });
  assert.equal(diagnostic.status, 'passed', diagnostic.stderr);
  assert.match(diagnostic.stdout, /comparison\.mjs/);
  assert.match(diagnostic.stdout, /tests 1/);
  assert.equal(pinSourceVerificationBase(repo, original).BUILDR_VERIFICATION_BASE, head, 'a later ordinary run observes its own base');
  assert.equal(pinSourceVerificationBase(repo, original, base).BUILDR_VERIFICATION_BASE, base, 'candidate recovery retains the selected base');
  assert.throws(() => pinSourceVerificationBase(repo, original, 'missing-base'), /Unknown Git base/u);
});
