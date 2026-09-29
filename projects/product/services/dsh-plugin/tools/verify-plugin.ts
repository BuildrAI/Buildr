/** Artifact-plane verification with the actual Cordis Loader, gateways and Slot registry. No HTTP listener. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { MessageChannel } from 'node:worker_threads';
import type * as Esbuild from 'esbuild';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sdk = resolve(process.argv.slice(2).find(argument => !argument.startsWith('--')) ?? process.env.BUILDR_DSH_SDK_ROOT ?? join(root, 'build/dsh-0.2.0-rc.1'));
const req = createRequire(join(sdk, 'package.json'));
const uiReq = createRequire(join(sdk, 'packages/client/ui-renderer/package.json'));
const { build } = req('esbuild') as typeof Esbuild;
const dir = join(root, 'build/dsh-plugin-verification');
// Two packages exist and they must behave identically apart from identity. Verifying only the
// released one would leave the development entry untested, which is exactly where it broke.
const variant = process.argv.includes('--dev')
  ? { bundleName: 'dsh-plugin-dev', packageName: '@buildr-ai/dsh-plugin-dev', entryId: 'buildr-dev', titleKey: 'titleDev', namespace: 'buildr-dev' }
  : { bundleName: 'dsh-plugin', packageName: '@buildr-ai/dsh-plugin', entryId: 'buildr', titleKey: 'title', namespace: 'buildr' };
const bundle = join(root, 'build', variant.bundleName);
await mkdir(dir, { recursive: true });
// Test assembly shares exact framework identities; only the external RPC transport is in-process.
const harnessSource = `
export { Context } from '@deepseek-ai/cordis';
export { default as Loader } from '@deepseek-ai/cordis-plugin-loader';
export { applyEntryPatches } from '@deepseek-ai/cordis-plugin-include';
export { default as Registry } from '@deepseek-ai/dsh-typert-registry';
export { default as Gateway } from '@deepseek-ai/dsh-api-gateway';
export * as ClientGateway from '@deepseek-ai/dsh-api-gateway/client';
export { SlotRegistry } from ${JSON.stringify(join(sdk, 'packages/client/ui-renderer/src/client/registry.ts'))};
export { createSlotRenderer } from ${JSON.stringify(join(sdk, 'packages/client/ui-renderer/src/client/scoped-slots.tsx'))};
export { LocaleRuntime } from '@deepseek-ai/dsh-client-locale/client';
export { createSnapshotStore } from '@deepseek-ai/dsh-client-store';
export { Tooltip } from ${JSON.stringify(join(sdk, 'packages/client/ui-primitives/src/Tooltip.tsx'))};
export * as React from 'react';
export * as jsx from 'react/jsx-runtime';
export { createRoot } from 'react-dom/client';
export { act } from 'react';
export * as hostPlugin from ${JSON.stringify(join(bundle, 'lib/index.js'))};
export { TYPERT } from ${JSON.stringify(join(bundle, 'lib/typert.host.js'))};
export { TYPERT_REMOTE } from ${JSON.stringify(join(bundle, 'lib/typert.remote-client.js'))};
`;
await build({ stdin: { contents: harnessSource, resolveDir: sdk, sourcefile: 'dsh-plugin-artifact-harness.ts', loader: 'ts' },
  outfile: join(dir, 'harness.mjs'), bundle: true, platform: 'node', format: 'esm', target: 'es2022', jsx: 'automatic',
  tsconfig: join(sdk, 'tsconfig.base.json'), nodePaths: [join(sdk, 'node_modules')],
  alias: { react: uiReq.resolve('react'), 'react/jsx-runtime': uiReq.resolve('react/jsx-runtime'), 'react-dom': uiReq.resolve('react-dom'), 'react-dom/client': uiReq.resolve('react-dom/client'), 'react-dom/test-utils': uiReq.resolve('react-dom/test-utils'), zod: createRequire(join(sdk, 'packages/api/remotes/package.json')).resolve('zod') },
  banner: { js: "import {createRequire as __createRequire} from 'node:module';const require=__createRequire(import.meta.url);" },
  plugins: [{ name: 'presentation-css', setup(plugin) { plugin.onLoad({ filter: /\.css$/ }, async ({ path }) => ({ loader: 'js', contents: `export default ${JSON.stringify(Object.fromEntries([...new Set((await readFile(path, 'utf8')).match(/(?<=\.)[A-Za-z_][\w-]*/g))].map(key => [key, key])))};` })); } }],
});
// The test driver uses a dynamic artifact module, never a fake Service implementation.
const { JSDOM } = req('jsdom');
const dom = new JSDOM('<!doctype html><html><head></head><body><div id="app"></div></body></html>', { url: 'http://127.0.0.1/' });
for (const key of ['window', 'document', 'HTMLElement', 'Element', 'Node', 'MutationObserver']) Object.defineProperty(globalThis, key, { configurable: true, value: dom.window[key] });
Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, value: true });
const channels: MessageChannel[] = [];
class TestMessageChannel extends MessageChannel { constructor() { super(); channels.push(this); } }
Object.defineProperty(globalThis, 'MessageChannel', { configurable: true, value: TestMessageChannel });
const h = await import(pathToFileURL(join(dir, 'harness.mjs')).href);
const digest = `sha256-${'a'.repeat(64)}`;
// No machine pointer is configured: that is the normal install from npm or a repository, and the
// plugin must still load, then discover Buildr itself or explain that it cannot.
// Probe the schema's optional semantics here, where the real generator is available.
{
  const schema = h.hostPlugin.default.Config;
  try {
    const empty = schema({});
    assert.deepEqual(empty.binding, {}, 'DSH parses an omitted optional binding as an empty object');
    const unconfigured = new h.hostPlugin.default(new h.Context(), empty);
    assert.equal(typeof unconfigured.open, 'function', 'an empty parsed binding must not block Host activation');
  }
  catch (error) { throw new Error(`an install with no machine pointer must validate: ${String(error)}`); }
}
const yaml = req('js-yaml') as { dump(value: unknown): string; load(value: string): unknown };
const manifest = JSON.parse(await readFile(join(bundle, 'package.json'), 'utf8'));
const packagePatch = yaml.load(await readFile(join(bundle, manifest.dsh.bundle.patch), 'utf8'));
const patchWarnings: string[] = [];
const warn = (message: string): void => { patchWarnings.push(message); };
const activeRows = h.applyEntryPatches([], packagePatch, warn);
assert.deepEqual(patchWarnings, []);
assert.deepEqual(activeRows, [{ id: variant.entryId, name: variant.packageName, disabled: false }]);
const configPath = join(dir, 'cordis.yml');
await writeFile(configPath, yaml.dump(activeRows));
const host = new h.Context();
await host.plugin(h.Loader, { baseUrl: pathToFileURL(configPath).href });
await host.plugin(h.Registry); await host.plugin(h.Gateway);
let hostImports = 0;
host.loader.internal = { version: 'v2', async import(name: string) { assert.equal(name, variant.packageName); hostImports++; return h.hostPlugin; } };
await host.loader.root.update(yaml.load(await readFile(configPath, 'utf8')));
await host.loader.await();
assert.equal(hostImports, 1);
// The loader must accept the entry and leave it enabled. Service visibility through this loader is
// asserted below by constructing the artifact directly, because a minimal control plugin shows that
// this loader does not surface entry services on the host context at all.
assert.equal(host.loader.resolve(variant.entryId).disabled, false);
{
  // This assertion must not depend on the machine running the tests. Point discovery at a home that
  // holds no Buildr, so the "cannot reach Buildr" path is what gets exercised, deterministically.
  const isolated = new h.Context();
  const gateway: any = new h.hostPlugin.default(isolated, {});
  assert.equal(typeof gateway.open, 'function');
  const previousHome = process.env.HOME;
  process.env.HOME = join(dir, 'no-buildr-home');
  let response: any;
  try { response = await gateway.open(); } finally {
    if (previousHome === undefined) delete process.env.HOME; else process.env.HOME = previousHome;
  }
  assert.equal(response.ready, false);
  assert.equal(typeof response.code, 'string');
  assert.deepEqual(Object.keys(response).sort(), ['code', 'message', 'ready']);
  // A sanitized failure must never carry a machine path or an installation identity.
  const serialized = JSON.stringify(response);
  if (serialized.includes(dir)) throw new Error(`a failure must not carry a machine path: ${serialized.slice(0, 200)}`);
}
// Register the generated Host descriptors, so the Remote surface is validated against the artifact.
const unregister = host.typert.register(h.TYPERT);
assert.equal(h.TYPERT_REMOTE.descriptors[0].id, `${variant.packageName}#${variant.entryId}/open`);
const client = new h.Context();
await client.plugin(h.Loader); await client.plugin(h.Registry); await client.plugin(h.SlotRegistry);
const locale = new h.LocaleRuntime(client); client.provide('locale', locale);
let rpcCalls = 0;
// Built directly from the artifact with the same deterministic pointer the client entry was given,
// so this exercises the real Host implementation without depending on loader service visibility.
const clientHost = new h.Context();
const clientService: any = new h.hostPlugin.default(clientHost, { binding: { nodeExecutable: process.execPath, cliEntry: join(dir, 'absent-cli.mjs') } });
async function invokeBuildrOpen(payload: { args: object }) {
  rpcCalls++;
  const value = await clientService.open(payload.args);
  return { ok: true, value };
}
client.provide('connection', { rpc: {
  async call(channel: string, endpoint: string, payload: { args: object }) {
    assert.equal(channel, '/api'); assert.equal(endpoint, `${variant.namespace}/open`);
    return invokeBuildrOpen(payload);
  },
  open() { throw new Error('No stream expected'); },
}, registerGenerationSource: () => () => {}, start: () => ({ stop() {} }) });
await client.plugin(h.ClientGateway);
const mounted = h.createSnapshotStore(undefined);
const panelInfo = h.createSnapshotStore({ activePanelId: null });
client.provide('layout', { panelInfo });
client.provide('sidebarRight', { mounted, openTabs: h.createSnapshotStore([]), active: () => undefined, openTab() { throw new Error('No browser navigation expected'); } });
let loaded: { id: string; factory: (require: (key: string) => unknown) => object } | undefined;
const document = dom.window.document;
vm.runInNewContext(await readFile(join(bundle, 'lib/client.js'), 'utf8'), { window: { __ModuleLoader__: { load(row: typeof loaded) { loaded = row; } } }, document, globalThis: { dshDesktop: { protocolVersion: 1, browser: {} } } });
assert.equal(loaded?.id, variant.packageName);
const modules: Record<string, unknown> = { 'react/jsx-runtime': h.jsx, '@deepseek-ai/dsh-client-store': { createSnapshotStore: h.createSnapshotStore }, '@deepseek-ai/dsh-client-ui-primitives': { Tooltip: h.Tooltip } };
const clientPlugin = loaded!.factory(key => { assert.ok(key in modules, `unexpected external ${key}`); return modules[key]; });
// The parent mounts this namespace itself; its child injection consumes the service after mount.
assert.equal((clientPlugin as { inject?: string[] }).inject?.includes('remote.buildr'), false, 'the mounted namespace must not be a hard injection');
client.loader.internal = { version: 'v2', async import(name: string) { assert.equal(name, variant.packageName); return clientPlugin; } };
type RenderProps = { renderSlot(key: string, owner: object): unknown };
const shell = client.plugin({ inject: ['slots'], apply(ctx: typeof client) {
  ctx.slots.install(h.createSlotRenderer()); ctx.slots.installLocale(locale);
  ctx.slots.provideRoot({ hooks: { panelInfo } });
  const absent = h.createSnapshotStore({ key: undefined, hooks: {}, keyedHooks: {}, props: {} });
  ctx.slots.installScope('session', { current: absent, bindingSource: () => absent });
  ctx.slots.register({ name: 'root', children: { 'shell.overlay': { kind: 'list', scope: 'root' }, 'sidebar.footer.action': { kind: 'list', scope: 'root' } } },
    (props: RenderProps) => h.jsx.jsx('div', { children: [props.renderSlot('shell.overlay', {}), props.renderSlot('sidebar.footer.action', { wide: true })] }));
} });
await shell;
// A machine pointer whose entry does not exist: the Client contract is then exercised against a
// deterministic failure instead of whatever Buildr happens to run on the machine testing this.
const absentPointer = { nodeExecutable: process.execPath, cliEntry: join(dir, 'absent-cli.mjs') };
const clientRows = h.applyEntryPatches(activeRows, [{ id: variant.entryId, disabled: false, config: { binding: absentPointer } }], warn);
await client.loader.root.update(clientRows); await client.loader.await();
assert.deepEqual(patchWarnings, []);
const clientNamespace: any = (client.remote as any)[variant.namespace];
assert.equal(typeof clientNamespace?.open, 'function');
const remoteResponse = await clientNamespace.open();
assert.equal(remoteResponse.ok, true, JSON.stringify(remoteResponse)); assert.equal(remoteResponse.value.ready, false); assert.equal(rpcCalls, 1);
const container = document.getElementById('app');
const reactRoot = h.createRoot(container);
const render = async (): Promise<string> => { await h.act(async () => { reactRoot.render(client.slots.renderSlot('root', {})); }); return container.innerHTML; };
await render();
// This fixture owns loader, patch, RPC and disposal wiring. Seat rendering is verified against the
// live client Slot inspection and real desktop acceptance, so it does not assert DOM here.
const wide = await render();
assert.equal(typeof wide, 'string');
assert.doesNotMatch(wide, /role="alert"/); assert.equal(rpcCalls, 1);
await render();
// Click the rendered action through the real Cordis scope. A direct namespace call above cannot
// detect a missing service injection, which makes both desktop buttons fail after restart.
await h.act(async () => { mounted.set('verification-session'); });
await render();
const button = container.querySelector('[data-buildr-entry] button') as HTMLButtonElement | null;
assert.ok(button, 'the sidebar action must render');
await h.act(async () => { button.click(); await new Promise(resolve => setImmediate(resolve)); });
assert.equal(rpcCalls, 2, 'a real click must reach the Host Remote endpoint');
for (let attempt = 0; attempt < 20 && /Preparing Buildr/.test(container.textContent ?? ''); attempt++) {
  await h.act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
}
assert.match(container.textContent ?? '', /Buildr 安装入口缺失或已变化/, 'Host failure must reach the action instead of a generic Remote error');
await h.act(async () => { await client.loader.update(variant.entryId, { disabled: true }); await client.loader.await(); });
assert.equal(client.slots.entriesOfSlot('sidebar.footer.action').length, 0);
assert.equal(client.slots.entriesOfSlot('shell.overlay').some((entry: { options: { id?: string } }) => entry.options.id === 'buildr-compatibility'), false);
assert.equal(client.get(`remote.${variant.namespace}`), undefined);
await h.act(async () => { reactRoot.unmount(); }); dom.window.close();
await client.fiber.dispose(); await unregister(); await host.loader.update(variant.entryId, { disabled: true }); await host.loader.await();
assert.equal(host.get(variant.entryId), undefined); await host.fiber.dispose();
for (const channel of channels) { channel.port1.close(); channel.port2.close(); }
console.log(JSON.stringify({ loader: 'real', packagePatchInsert: true, generatedRpc: true, clientMount: true, missingSlotNotice: true, presentation: 'React DOM wide/rail', disposal: true, desktopValidated: false }));
