import assert from 'node:assert/strict';
import test from 'node:test';
import { cp, mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createSdkRequire } from '../../tools/sdk-require.ts';
import { ownedBuildRoot } from '../../tools/prepare-source-sdk.ts';

test('native Client metadata resolver advertises exactly one gateway in both supported loader branches', async t => {
  const sdk = process.env.BUILDR_DSH_SOURCE_SDK_ROOT;
  const bundle = process.env.BUILDR_DSH_COMPOSITION_DEV_ROOT ?? process.env.BUILDR_DSH_COMPOSITION_ROOT;
  if (!sdk || !bundle) return t.skip('explicit verified source SDK and built composition required');
  const req = createSdkRequire(sdk), root = await mkdtemp(join(ownedBuildRoot(resolve('.')), 'dsh-client-metadata-test-'));
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 3 }));
  const runtime = join(root, 'runtime'); await mkdir(runtime);
  const harness = join(runtime, 'harness.mjs');
  await req('esbuild').build({ stdin: { contents: `export { Context } from '@deepseek-ai/cordis';
export { ClientModuleRegistry } from '@deepseek-ai/dsh-client-modules';`, resolveDir: resolve(sdk), loader: 'ts' },
    outfile: harness, bundle: true, format: 'esm', platform: 'node', target: 'es2022',
    tsconfig: join(sdk, 'tsconfig.base.json'), nodePaths: [join(sdk, 'node_modules')],
    banner: { js: "import {createRequire as __cr} from 'node:module';const require=__cr(import.meta.url);" } });
  const h = await import(pathToFileURL(harness).href), manifest = JSON.parse(await readFile(join(bundle, 'package.json'), 'utf8'));
  const installed = join(root, 'node_modules', manifest.name); await cp(bundle, installed, { recursive: true });
  const baseUrl = pathToFileURL(installed + '/').href;
  for (const nativeResolver of [false, true]) {
    await t.test(nativeResolver ? 'internal.resolveSync follows actual main to the inner package' : 'fallback resolves public package metadata', async () => {
      const ctx = new h.Context();
      try {
        ctx.baseUrl = baseUrl;
        const names = [manifest.name, './runtime-composition/index.js'];
        ctx.provide('loader', {
          ...(nativeResolver ? { internal: { version: 'v2', resolveSync(_base: string, request: { specifier: string }) {
            return { url: request.specifier === manifest.name ? new URL(manifest.main, baseUrl).href : new URL(request.specifier, baseUrl).href, format: 'module' };
          } } } : {}),
          *entries() { for (const name of names) yield { options: { name }, fiber: {}, disabled: false, parent: { tree: { ctx: { baseUrl } } } }; },
        });
        const registry = new h.ClientModuleRegistry(ctx), graph = registry.graph();
        assert.deepEqual(graph.entries.map((entry: { id: string }) => entry.id), [manifest.name]);
        assert.equal(registry.clientPath(manifest.name), resolve(installed, manifest.exports['./client'].default));
        assert.equal(registry.clientPath(manifest.name + '-composition-runtime'), undefined, 'Host-only composition cannot acquire a duplicate Client');
        const response = await registry.fetchBundle(new Request(new URL(graph.entries[0].url, 'http://localhost/')));
        assert.equal(response.status, 200);
        assert.ok((await response.text()).includes('plugins.row.config'), 'actual packaged Client includes the official maintenance slot');
      } finally { await ctx.fiber.dispose(); }
    });
  }
});
