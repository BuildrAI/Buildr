import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ensureReleaseSdk, sdkDependencyIdentity, sdkPreparationKey } from '../../tools/ensure-release-sdk.ts';
import { sha256 } from '../../tools/prepare-source-sdk.ts';

test('SDK dependency inventory detects same-lock byte drift and refuses external links', t => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-sdk-dependencies-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const modules = path.join(root, 'node_modules'); fs.mkdirSync(modules);
  const file = path.join(modules, 'tool.js'); fs.writeFileSync(file, 'first');
  const before = sdkDependencyIdentity(modules);
  fs.writeFileSync(file, 'other');
  assert.notEqual(sdkDependencyIdentity(modules), before);
  fs.symlinkSync('./optional.js', path.join(modules, 'optional-link'));
  const absent = sdkDependencyIdentity(modules);
  fs.writeFileSync(path.join(modules, 'optional.js'), 'now present');
  assert.notEqual(sdkDependencyIdentity(modules), absent);
  fs.symlinkSync(process.execPath, path.join(modules, 'external'));
  assert.throws(() => sdkDependencyIdentity(modules), /escapes/);
});

test('SDK preparation key includes tool, recipe, platform and architecture inputs', () => {
  const inputs = { manifest: 'source+patch', recipe: 'build-recipe', nodeVersion: 'v24.15.0',
    nodeSha256: 'node-bytes', pnpmVersion: '11.7.0', pnpmSha256: 'pnpm-bytes', platform: 'darwin', arch: 'arm64' };
  for (const key of Object.keys(inputs)) assert.notEqual(sdkPreparationKey(inputs),
    sdkPreparationKey({ ...inputs, [key]: 'changed' }), key);
});

test('local SDK reuse validates installed bytes and output; corruption builds a new output without replacing old SDK', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-sdk-cache-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const tools = path.join(root, 'tools'); fs.mkdirSync(tools);
  for (const file of ['ensure-release-sdk.ts', 'prepare-release-sdk.ts', 'release-sdk-downloads.ts', 'prepare-source-sdk.ts', 'sdk-baselines.ts', 'sdk-require.ts', 'dsh-host-compatibility.ts']) {
    fs.writeFileSync(path.join(tools, file), 'recipe');
  }
  const pnpm = path.join(root, 'pnpm.cjs'), manifestFile = path.join(root, 'manifest.json');
  fs.writeFileSync(pnpm, 'pnpm'); fs.writeFileSync(manifestFile, '{}');
  const source = path.join(root, 'source'), modules = path.join(source, 'node_modules');
  fs.mkdirSync(modules, { recursive: true }); fs.writeFileSync(path.join(source, 'pnpm-lock.yaml'), 'fixed-lock');
  fs.writeFileSync(path.join(modules, 'tool.js'), 'fixed dependency');
  const plan = { manifestFile, manifest: { upstream: { commit: 'fixed' }, patch: { sha256: 'patch' } } };
  let builds = 0;
  const dependencies = { serviceRoot: root, plan: () => plan, toolIdentity: () => sha256(fs.readFileSync(pnpm)),
    version: (_: string, args: string[]) => args.length === 1 ? process.version : '11.7.0',
    validate: (sdk: string) => {
      assert.equal(fs.readFileSync(path.join(sdk, 'generated.js'), 'utf8'), 'valid output');
      return { baseline: plan.manifest.upstream, sourceCheckout: source, patchSha256: 'patch',
        sourceManifest: { sha256: sha256('{}') } };
    },
    prepare: async () => {
      builds++;
      const sdk = path.join(root, 'build', `sdk-${builds}`); fs.mkdirSync(sdk, { recursive: true });
      fs.writeFileSync(path.join(sdk, 'generated.js'), 'valid output');
      return { status: 'prepared', sdk };
    } };
  const input = { node: process.execPath, pnpm };
  const first = await ensureReleaseSdk(input, dependencies);
  assert.equal(first.disposition, 'built');
  assert.equal((await ensureReleaseSdk(input, dependencies)).disposition, 'reused');
  assert.equal(builds, 1);
  fs.writeFileSync(path.join(modules, 'tool.js'), 'drift despite same lock');
  const second = await ensureReleaseSdk(input, dependencies);
  assert.equal(second.disposition, 'built'); assert.equal(builds, 2); assert.notEqual(first.sdk, second.sdk);
  fs.writeFileSync(path.join(second.sdk, 'generated.js'), 'corrupt output');
  assert.equal((await ensureReleaseSdk(input, dependencies)).disposition, 'built');
  assert.equal(builds, 3);
  assert.equal(fs.readFileSync(path.join(second.sdk, 'generated.js'), 'utf8'), 'corrupt output');
  fs.appendFileSync(path.join(tools, 'prepare-source-sdk.ts'), 'changed');
  assert.equal((await ensureReleaseSdk(input, dependencies)).disposition, 'built');
  assert.equal(builds, 4);
});
