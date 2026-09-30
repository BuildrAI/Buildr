import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import test from 'node:test';
import type * as Esbuild from 'esbuild';
import { createSdkRequire } from '../../tools/sdk-require.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const sdk = resolve(process.env.BUILDR_DSH_SDK_ROOT ?? join(root, 'build/dsh-0.2.0-rc.1'));
const req = createSdkRequire(sdk);

/**
 * The released and development entries are separate packages that must be installable in one DSH at
 * the same time. Verifying them one at a time cannot catch a collision between them — an earlier
 * build registered both under the same service key and only failed once both were installed.
 */
test('both plugin packages activate together in one loader without colliding', async t => {
  const bundles = ['dsh-plugin', 'dsh-plugin-dev'].map(name => join(root, 'build', name));
  for (const bundle of bundles) {
    try { await readFile(join(bundle, 'package.json')); }
    catch { return t.skip('variants are not built in this workspace'); }
  }
  const dir = join(root, 'build/dsh-plugin-coexistence');
  await mkdir(dir, { recursive: true });
  const { build: bundleWithEsbuild } = req('esbuild') as typeof Esbuild;
  const sources: string[] = [];
  const inserts: unknown[] = [];
  for (const [index, bundle] of bundles.entries()) {
    const manifest = JSON.parse(await readFile(join(bundle, 'package.json'), 'utf8')) as any;
    sources.push(`export * as plugin${index} from ${JSON.stringify(join(bundle, 'lib/index.js'))};`);
    sources.push(`export { TYPERT as TYPERT${index} } from ${JSON.stringify(join(bundle, 'lib/typert.host.js'))};`);
    // Each package contributes its own enabled row.
    const layer = (req('js-yaml') as any).load(await readFile(join(bundle, manifest.dsh.bundle.patch), 'utf8'));
    for (const row of layer) for (const entry of row.insert) inserts.push(entry);
  }
  const activeRows = inserts;
  const harnessSource = `
export { Context } from '@deepseek-ai/cordis';
export { default as Loader } from '@deepseek-ai/cordis-plugin-loader';
export { applyEntryPatches } from '@deepseek-ai/cordis-plugin-include';
export { default as Registry } from '@deepseek-ai/dsh-typert-registry';
export { default as Gateway } from '@deepseek-ai/dsh-api-gateway';
${sources.join('\n')}
`;
  await bundleWithEsbuild({
    stdin: { contents: harnessSource, resolveDir: sdk, sourcefile: 'coexistence.ts', loader: 'ts' },
    outfile: join(dir, 'harness.mjs'), bundle: true, platform: 'node', format: 'esm', target: 'es2022',
    tsconfig: join(sdk, 'tsconfig.base.json'), nodePaths: [join(sdk, 'node_modules')],
    alias: { zod: createRequire(join(sdk, 'packages/api/remotes/package.json')).resolve('zod') },
    banner: { js: "import {createRequire as __cr} from 'node:module';const require=__cr(import.meta.url);" },
  });
  const h = await import(pathToFileURL(join(dir, 'harness.mjs')).href);
  const yaml = req('js-yaml') as any;
  const configPath = join(dir, 'cordis.yml');
  await writeFile(configPath, yaml.dump(activeRows));
  const host = new h.Context();
  await host.plugin(h.Loader, { baseUrl: pathToFileURL(configPath).href });
  await host.plugin(h.Registry); await host.plugin(h.Gateway);
  const loaded: string[] = [];
  host.loader.internal = {
    version: 'v2',
    async import(name: string) {
      loaded.push(name);
      const index = ['@buildr-ai/buildr-dsh-plugin', '@buildr-ai/buildr-dsh-plugin-dev'].indexOf(name);
      if (index < 0) throw new Error(`unexpected package ${name}`);
      return { default: (h as any)[`plugin${index}`].default };
    },
  };
  await host.loader.root.update(yaml.load(await readFile(configPath, 'utf8')));
  await host.loader.await();
  // Both packages must reach activation. This loader does not surface entry services on the host
  // context, so activation is observed through the loader itself rather than through `host.get`.
  assert.deepEqual(loaded.sort(), ['@buildr-ai/buildr-dsh-plugin', '@buildr-ai/buildr-dsh-plugin-dev']);
  for (const [index, name] of ['buildr', 'buildr-dev'].entries()) {
    const entry: any = host.loader.resolve(name);
    assert.equal(entry?.disabled, false, `${name} must stay enabled`);
    assert.equal(entry?.fiber?.error ?? null, null, `${name} must activate without an error`);
  }
});
