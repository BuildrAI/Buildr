import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createSdkRequire } from '../../tools/sdk-require.ts';

test('real ConfigEditor first save retains original entry identity and updates the actual enhanced fiber', async t => {
  const sdk = process.env.BUILDR_DSH_SOURCE_SDK_ROOT;
  if (!sdk) return t.skip('explicit verified source SDK required');
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..'), req = createSdkRequire(sdk), yaml = req('js-yaml');
  const dir = await mkdtemp(join(tmpdir(), 'buildr-config-owner-')); let host: any;
  t.after(async () => { await host?.fiber.dispose(); await rm(dir, { recursive: true, force: true, maxRetries: 3 }); });
  const runtime = join(dir, 'runtime'); await mkdir(runtime); await writeFile(join(dir, 'package.json'), '{"version":"0.2.0-rc.2"}');
  await req('esbuild').build({ stdin: { contents: `
export { Context, Service } from '@deepseek-ai/cordis';
export { default as Loader } from '@deepseek-ai/cordis-plugin-loader';
export { Include } from '@deepseek-ai/cordis-plugin-include';
export { default as ConfigEditor } from '@deepseek-ai/dsh-config-editor';
export { default as Settings } from '@deepseek-ai/dsh-settings';
export { default as Hmr } from '@deepseek-ai/dsh-hmr';
export { default as z } from '@deepseek-ai/schemastery';
export { readProfilePatches, mountRootInclude } from '@deepseek-ai/dsh-app-boot';
export { NativeConfigurationOwner, withinReload } from ${JSON.stringify(join(root, 'plugin/composition/configuration-owner.ts'))};
`, resolveDir: sdk, loader: 'ts' }, outfile: join(runtime, 'harness.mjs'), bundle: true, format: 'esm', platform: 'node', target: 'es2022',
    tsconfig: join(sdk, 'tsconfig.base.json'), nodePaths: [join(sdk, 'node_modules')],
    banner: { js: "import {createRequire as __cr} from 'node:module';const require=__cr(import.meta.url);" } });
  const h = await import(pathToFileURL(join(runtime, 'harness.mjs')).href);
  const profileDir = join(dir, 'profile'), home = join(dir, 'home'), official = join(profileDir, 'node_modules/fixture-official');
  await mkdir(official, { recursive: true }); await mkdir(home);
  const anchor = join(dir, 'package.json'), profileFile = join(profileDir, 'package.json'), userFile = join(profileDir, 'cordis.patch.yml');
  await writeFile(profileFile, JSON.stringify({ name: 'fixture', dsh: { profile: { bundles: ['fixture-official'] } } }));
  await writeFile(official + '/package.json', JSON.stringify({ name: 'fixture-official', dsh: { bundle: { patch: 'cordis.patch.yml' } } }));
  await writeFile(official + '/cordis.patch.yml', yaml.dump([{ insert: [{ id: 'agent-loop', name: '@deepseek-ai/dsh-agent-loop', config: { agents: [] } }] }]));
  await writeFile(userFile, '[]\n');
  const profile = { name: 'fixture', dir: profileDir, patchPath: userFile, installAnchor: anchor, cwd: dir, home, startedBundles: [], overlays: [], telemetryDisabledEnv: undefined };
  host = new h.Context(); await host.plugin(h.Loader, { baseUrl: pathToFileURL(dir + '/').href }); host.provide('profileContext', profile);
  await host.plugin(h.ConfigEditor); await host.plugin(h.Settings);
  const seen: Array<{ implementation: string; maximum: unknown }> = [];
  function callback(implementation: string) { return class {
    static Config = h.z.object({ maxParallelToolCalls: h.z.natural().min(1).default(10).volatile(), agents: h.z.array(h.z.any()).default([]) });
    constructor(ctx: any, config: any) { seen.push({ implementation, maximum: config.maxParallelToolCalls }); ctx.effect(() => () => {}); }
  }; }
  const stock = callback('stock'), enhanced = callback('enhanced'), next = callback('next');
  const broken = class { constructor() { throw Error('fixture enhanced start failed'); } };
  host.loader.builtins.include = h.Include;
  host.loader.internal = { version: 'v2', async import(name: string) {
    if (name === '@deepseek-ai/dsh-agent-loop') return stock;
    if (name === 'file:///fixture/enhanced-loop.js') return enhanced;
    if (name === 'file:///fixture/next-loop.js') return next;
    if (name === 'file:///fixture/broken-loop.js') return broken;
    throw Error('unexpected fixture module');
  } };
  // Construct the real HMR service without starting filesystem watchers; its public queue implementation is unchanged.
  const hmr = new h.Hmr(host.extend({ baseUrl: pathToFileURL(dir + '/').href }), { root: [], ignored: [], debounce: 1 });
  const configFile = join(dir, 'cordis.yml'); await writeFile(configFile, '[]\n');
  await h.mountRootInclude(host, configFile, h.readProfilePatches('fixture', profile));
  await host.loader.await();
  const entry = host.loader.resolve('include:agent-loop'), owner = new h.NativeConfigurationOwner(host);
  assert.equal(entry.fiber.runtime.callback, stock);
  await hmr.runExclusive(() => owner.serialized(() => owner.enhance(entry, 'file:///fixture/enhanced-loop.js')));
  assert.equal(entry.options.name, '@deepseek-ai/dsh-agent-loop'); assert.equal(entry.fiber.runtime.callback, enhanced);
  assert.equal(owner.inspect().implementation, 'file:///fixture/enhanced-loop.js');
  const before = host.settings.describe({ redactSecrets: true }).find((row: any) => row.ns === 'agent-loop');
  assert.ok(before, 'actual official settings descriptor must remain available');
  await host.settings.update('agent-loop', { maxParallelToolCalls: 4 }, before.revision);
  assert.equal(entry.fiber.runtime.callback, enhanced); assert.equal(entry.fiber.config.maxParallelToolCalls.get(), 4);
  const saved = yaml.load(await readFile(userFile, 'utf8'));
  assert.equal(saved[0].name, '@deepseek-ai/dsh-agent-loop'); assert.equal(saved[0].config.maxParallelToolCalls, 4);
  assert.equal(JSON.stringify(saved).includes('file:///fixture'), false);
  await owner.serialized(() => owner.release());
  assert.equal(entry.fiber.runtime.callback, stock); assert.equal(entry.fiber.config.maxParallelToolCalls.get(), 4);
  await owner.serialized(() => owner.enhance(entry, 'file:///fixture/enhanced-loop.js'));
  assert.equal(entry.fiber.runtime.callback, enhanced); assert.equal(entry.fiber.config.maxParallelToolCalls.get(), 4);
  await owner.serialized(() => owner.enhance(entry, 'file:///fixture/next-loop.js'));
  assert.equal(entry.fiber.runtime.callback, next); assert.equal(entry.fiber.config.maxParallelToolCalls.get(), 4);
  await assert.rejects(owner.serialized(() => owner.enhance(entry, 'file:///fixture/broken-loop.js')), /fixture enhanced start failed/);
  assert.equal(entry.fiber.runtime.callback, stock, 'a failed replacement restores the real stock callback');
  assert.equal(entry.options.name, '@deepseek-ai/dsh-agent-loop');
  assert.equal(entry.fiber.config.maxParallelToolCalls.get(), 4);
  await Promise.all([owner.serialized(() => owner.enhance(entry, 'file:///fixture/enhanced-loop.js')), owner.serialized(() => owner.release())]);
  assert.equal(entry.fiber.runtime.callback, stock, 'concurrent external operations use the real HMR queue');
  await owner.serialized(() => owner.release());
  await entry.update({ disabled: true });
  const count = seen.length;
  await owner.serialized(() => owner.enhance(entry, 'file:///fixture/enhanced-loop.js'));
  assert.equal(seen.length, count, 'an intentionally disabled source never starts');
});
