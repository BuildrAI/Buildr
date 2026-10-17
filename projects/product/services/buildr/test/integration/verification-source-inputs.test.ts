import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { verificationSteps } from '../verification/registry.ts';
import { createVerificationSourceInputReader } from '../verification/verification-source-inputs.ts';
import { createVerificationReuseIdentity } from '../verification/verification-reuse.ts';

test('typecheck reuse binds compiler configs, types, executor, locks and the actual Node, npm and dependencies', t => {
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
  for (const file of files.keys()) {
    const before = files.get(file)!; files.set(file, before + '\n// changed real input');
    const reader = observe();
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
