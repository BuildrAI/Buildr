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

test('typecheck proof binds compilation inputs and tools while execution also binds its transport', t => {
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
    if (file === prefix + 'test/verification/executor.ts') {
      assert.deepEqual(reader.inputs(selected, true), inputBefore, 'transport repairs do not erase an earlier clean compilation proof');
    } else {
      assert.notDeepEqual(reader.inputs(selected, true), inputBefore, file);
      assert.notEqual(createVerificationReuseIdentity(selected, { ...snapshot, contentIdentities: reader.contentIdentities })?.key, original.key, file);
    }
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
