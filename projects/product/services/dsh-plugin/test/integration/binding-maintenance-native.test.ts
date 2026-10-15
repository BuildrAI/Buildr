import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createSdkRequire } from '../../tools/sdk-require.ts';
import { createBindingMaintenance } from '../../plugin/binding-maintenance.ts';

test('official ConfigEditor saves and restores only the declared binding through ordinary plugin reload', async t => {
  const sdk = process.env.BUILDR_DSH_SOURCE_SDK_ROOT;
  if (!sdk) return t.skip('explicit verified source SDK required');
  const req = createSdkRequire(sdk), yaml = req('js-yaml'), root = await mkdtemp(join(tmpdir(), 'buildr-binding-editor-'));
  let host: any;
  t.after(async () => { await host?.fiber.dispose(); await rm(root, { recursive: true, force: true, maxRetries: 3 }); });
  const runtime = join(root, 'runtime'); await mkdir(runtime);
  const harness = join(runtime, 'harness.mjs');
  await req('esbuild').build({ stdin: { contents: `export { Context } from '@deepseek-ai/cordis';
export { default as Loader } from '@deepseek-ai/cordis-plugin-loader';
export { default as ConfigEditor } from '@deepseek-ai/dsh-config-editor';
export { default as z } from '@deepseek-ai/schemastery';
export { readProfilePatches, mountRootInclude, loadProfileDirectory } from '@deepseek-ai/dsh-app-boot';`, resolveDir: resolve(sdk), loader: 'ts' },
    outfile: harness, bundle: true, format: 'esm', platform: 'node', target: 'es2022', tsconfig: join(sdk, 'tsconfig.base.json'), nodePaths: [join(sdk, 'node_modules')],
    banner: { js: "import {createRequire as __cr} from 'node:module';const require=__cr(import.meta.url);" } });
  const h = await import(pathToFileURL(harness).href), profileDir = join(root, 'profile'), official = join(profileDir, 'node_modules/fixture-official');
  await mkdir(official, { recursive: true }); const home = join(root, 'home'); await mkdir(home);
  const anchor = join(root, 'package.json'), patch = join(profileDir, 'cordis.patch.yml');
  await writeFile(anchor, '{"version":"0.2.0-rc.2"}');
  await writeFile(join(profileDir, 'package.json'), JSON.stringify({ name: 'fixture', dependencies: { '@buildr-ai/buildr-dsh-plugin-dev': '0.1.0-rc.1' }, dsh: { profile: { bundles: ['fixture-official'] } } }));
  const ownPackage = join(profileDir, 'node_modules/@buildr-ai/buildr-dsh-plugin-dev'); await mkdir(ownPackage, { recursive: true });
  await writeFile(join(ownPackage, 'package.json'), JSON.stringify({ name: '@buildr-ai/buildr-dsh-plugin-dev', version: '0.1.0-rc.1', type: 'module', main: 'index.js' }));
  await writeFile(join(ownPackage, 'index.js'), 'export default class {}\n');
  await writeFile(join(official, 'package.json'), JSON.stringify({ name: 'fixture-official', dsh: { bundle: { patch: 'cordis.patch.yml' } } }));
  await writeFile(join(official, 'cordis.patch.yml'), yaml.dump([{ insert: [{ id: 'buildr-dev', name: '@buildr-ai/buildr-dsh-plugin-dev', config: { keep: 'original' } }] }]));
  await writeFile(patch, '[]\n');
  const profile = { name: 'fixture', dir: profileDir, patchPath: patch, installAnchor: anchor, cwd: root, home, startedBundles: [], overlays: [], telemetryDisabledEnv: undefined };
  host = new h.Context(); await host.plugin(h.Loader, { baseUrl: pathToFileURL(root + '/').href }); host.provide('profileContext', profile); await host.plugin(h.ConfigEditor);
  let starts = 0;
  class OwnPlugin { static Config = h.z.object({ binding: h.z.any(), keep: h.z.string() }); constructor() { starts++; } }
  host.loader.internal = { version: 'v2', async import(name: string) { assert.equal(name, '@buildr-ai/buildr-dsh-plugin-dev'); return { default: OwnPlugin }; } };
  const configFile = join(root, 'cordis.yml'); await writeFile(configFile, '[]\n');
  const patches = h.readProfilePatches('fixture', profile);
  assert.ok(JSON.stringify(patches).includes('buildr-dev'), JSON.stringify(h.loadProfileDirectory('fixture', profile.dir, profile.installAnchor).skippedBundles));
  await h.mountRootInclude(host, configFile, patches); await host.loader.await();
  assert.ok(starts > 0, JSON.stringify([...host.loader.entries()].map((entry: any) => ({ id: entry.id, options: entry.options, parent: entry.parent.tree.ctx.fiber.entry?.id }))));
  assert.ok(host.configEditor.entries().length > 0, 'native editable entry inventory is empty');
  const maintenance = createBindingMaintenance(host.configEditor, 'buildr-dev', '@buildr-ai/buildr-dsh-plugin-dev'), original = maintenance.read();
  const binding = { nodeExecutable: '/verified/node', cliEntry: '/verified/cli.mjs', nodeSha256: 'sha256-' + 'a'.repeat(64), cliSha256: 'sha256-' + 'b'.repeat(64) };
  const saved = await maintenance.update({ expectedRevision: original.revision, binding });
  assert.deepEqual(saved.binding, binding); assert.ok(starts >= 2, 'ordinary config uses native reconciliation');
  let document = yaml.load(await readFile(patch, 'utf8')); assert.equal(document[0].id, 'buildr-dev'); assert.equal(document[0].config.keep, 'original');
  await maintenance.update({ expectedRevision: saved.revision, binding: original.binding });
  document = yaml.load(await readFile(patch, 'utf8')); assert.deepEqual(document, [], 'native editor removes the redundant own override after restore');
});
