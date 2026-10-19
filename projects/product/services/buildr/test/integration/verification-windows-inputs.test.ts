import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { verificationSteps } from '../verification/registry.ts';
import { createVerificationSourceInputReader } from '../verification/verification-source-inputs.ts';
import { createVerificationReuseIdentity, type VerificationReuseSnapshot } from '../verification/verification-reuse.ts';

const windows = verificationSteps.find((step: any) => step.id === 'system-windows-platform');

test('native Windows proof shares complete backend inputs across working and immutable Git sources without unrelated assets', t => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-windows-inputs-'));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  const prefix = 'projects/product/services/buildr/', productRoot = path.join(repo, prefix);
  const files = new Map<string, string>([
    [prefix + 'package.json', '{"name":"buildr-fixture"}'],
    [prefix + 'package-lock.json', '{"lockfileVersion":3}'],
    [prefix + 'src/platform.ts', 'export const platform = 1;'],
    [prefix + 'resources/runtime.yml', 'runtime: original'],
    [prefix + 'tools/development/prepare.ts', 'export const prepare = 1;'],
    [prefix + 'test/platform/windows-boundaries.test.ts', "import '../../src/platform.ts'; import './actual-dependency.ts';"],
    [prefix + 'test/platform/actual-dependency.ts', 'export const dependency = 1;'],
    [prefix + 'test/system/worktree-create.test.ts', "import '../../src/platform.ts';"],
    ['projects/product/.node-version', '24.15.0'],
    ['projects/product/buildr', '#!/bin/sh\n'],
    ['projects/product/preparation.yml', 'schemaVersion: fixture'],
    ['projects/product/verification.yml', 'schemaVersion: fixture'],
    ['projects/product/services/buildr-web/src/style.css', '.original {}'],
    ['projects/product/services/dsh-plugin/src/main.ts', 'export const plugin = 1;'],
    ['AGENTS.md', 'workspace rules'],
    ['skills/buildr-release/SKILL.md', 'release instructions'],
    ['skills/buildr-release/scripts/release-readiness.ts', 'export const readiness = 1;'],
    ['tools/native-platform.ts', 'export const nativePlatform = 1;'],
  ]);
  const write = (file: string, text: string) => {
    const target = path.join(repo, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, text);
  };
  for (const [file, text] of files) write(file, text);
  const git = (...args: string[]) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const commit = () => {
    git('add', '.');
    git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.com', '-c', 'commit.gpgSign=false', 'commit', '-m', 'fixture');
    return git('rev-parse', 'HEAD');
  };
  git('init', '--initial-branch=main');
  let source = commit();
  assert.deepEqual(windows.reuse, { scope: 'platform-backend', inputMode: 'runtime-check', tools: ['git'] });
  const observe = (fallback = false) => {
    const working = createVerificationSourceInputReader(repo, productRoot);
    const immutable = createVerificationSourceInputReader(repo, productRoot, source);
    return [false, true].map(proof => {
      const local = working.inputs(windows, proof);
      assert.deepEqual(local, immutable.inputs(windows, proof), `proof=${proof}: both execution locations use the same source inputs`);
      assert.equal(local.fallback, fallback, `proof=${proof}: fallback reflects the reviewed input boundary`);
      return local;
    });
  };
  const original = observe();
  // These changes previously invalidated the Windows proof through runtime's
  // repository-wide content scope, despite no native fixture reading them.
  for (const file of [
    'projects/product/services/buildr-web/src/style.css', 'projects/product/services/dsh-plugin/src/main.ts',
    'AGENTS.md', 'skills/buildr-release/SKILL.md', 'skills/buildr-release/scripts/release-readiness.ts', 'tools/native-platform.ts',
    'projects/product/verification.yml',
  ]) {
    write(file, files.get(file)! + '\n// unrelated change'); source = commit();
    assert.deepEqual(observe(), original, file);
  }
  for (const file of [
    prefix + 'src/platform.ts', prefix + 'package.json', prefix + 'package-lock.json',
    prefix + 'resources/runtime.yml', prefix + 'tools/development/prepare.ts',
    'projects/product/.node-version', 'projects/product/buildr',
    'projects/product/preparation.yml',
    prefix + 'test/platform/actual-dependency.ts',
  ]) {
    const before = observe();
    write(file, files.get(file)! + '\n// relevant change'); source = commit();
    const after = observe();
    for (const [index, value] of after.entries()) {
      assert.notDeepEqual(value, before[index], `${file}: proof=${index === 1}`);
      if (file.endsWith('/actual-dependency.ts')) {
        assert.equal(value.contentIdentity, before[index]!.contentIdentity, 'a real test dependency is selected through its import');
        assert.notEqual(value.recipeIdentity, before[index]!.recipeIdentity, 'changing an imported assertion helper invalidates the proof');
      }
    }
  }
  write(prefix + 'test/platform/windows-boundaries.test.ts', files.get(prefix + 'test/platform/windows-boundaries.test.ts')!
    + "\nimport '../../../../../../tools/native-platform.ts';");
  source = commit();
  const external = observe(true);
  for (const value of external) assert.ok(value.unresolved.includes('platform-backend:module-outside-scope:tools/native-platform.ts'));
  write('tools/native-platform.ts', 'export const nativePlatform = 2;'); source = commit();
  const changedExternal = observe(true);
  for (const [index, value] of changedExternal.entries()) {
    assert.notEqual(value.contentIdentity, external[index]!.contentIdentity, 'an actual import outside the reviewed scope cannot remain an absent-only proof');
  }
});

test('native Windows reuse binds actual backend dependencies and Git tool without requiring Web installation', () => {
  const sha = `sha256-${'a'.repeat(64)}` as const, changed = `sha256-${'b'.repeat(64)}` as const;
  const snapshot: VerificationReuseSnapshot = {
    repositoryRoot: '/fixture', productRoot: '/fixture/projects/product/services/buildr', sourceCommit: 'a'.repeat(40), gitIdentity: sha,
    contentIdentities: { backend: sha, 'platform-backend': sha, web: sha, plugin: sha, product: sha, repository: sha, runtime: sha },
    stepInputs: { [windows.id]: { contentIdentity: sha, recipeIdentity: sha, fallback: false, unavailable: false } },
    environment: { platform: 'win32', arch: 'x64', nodeVersion: '24.21.0', variablesIdentity: sha,
      tools: { 'backend-dependencies': sha, git: '2.50.1' } },
  };
  const original = createVerificationReuseIdentity(windows, snapshot);
  assert.ok(original, 'native proof does not require an unrelated Web dependency installation');
  assert.deepEqual(createVerificationReuseIdentity(windows, { ...snapshot, environment: { ...snapshot.environment,
    tools: { ...snapshot.environment.tools, 'web-dependencies': changed } } }), original);
  assert.deepEqual(createVerificationReuseIdentity(windows, { ...snapshot, gitIdentity: changed }), original, 'the fixtures do not read retained branch history');
  for (const key of ['backend-dependencies', 'git']) {
    assert.notDeepEqual(createVerificationReuseIdentity(windows, { ...snapshot, environment: { ...snapshot.environment,
      tools: { ...snapshot.environment.tools, [key]: changed } } }), original, key);
    const tools = { ...snapshot.environment.tools };
    delete tools[key];
    assert.equal(createVerificationReuseIdentity(windows, { ...snapshot, environment: { ...snapshot.environment, tools } }), null, key);
  }
});
