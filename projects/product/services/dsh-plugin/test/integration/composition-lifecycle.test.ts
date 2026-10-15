import assert from 'node:assert/strict';
import test from 'node:test';
import { cp, mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createSdkRequire } from '../../tools/sdk-require.ts';
import { compositionPatch } from '../../tools/build-composition.ts';
import { PRESET_MODULES, ROOT_MODULES, CLIENT_MODULES, COMPOSITION_SCHEMA } from '../../plugin/composition/definition.ts';

test('real Loader and preset registry activate, withdraw, reinstall and share a composition without persistent private refs', async t => {
  const sdk = process.env.BUILDR_DSH_SOURCE_SDK_ROOT;
  if (!sdk) return t.skip('explicit verified source SDK required');
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const dir = await mkdtemp(join(tmpdir(), 'buildr-composition-lifecycle-'));
  let host: any;
  t.after(async () => { await host?.fiber.dispose(); await rm(dir, { recursive: true, force: true, maxRetries: 3 }); });
  const req = createSdkRequire(sdk), yaml = req('js-yaml');
  const runtime = join(dir, 'runtime'); await mkdir(runtime);
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'composition-test-runtime', version: '0.2.0-rc.2' }));
  await req('esbuild').build({ stdin: { contents: `
export { Context } from '@deepseek-ai/cordis';
export { default as Loader } from '@deepseek-ai/cordis-plugin-loader';
export { Include, applyEntryPatches } from '@deepseek-ai/cordis-plugin-include';
export { readProfilePatches, loadProfileDirectory, mountRootInclude, reconcileProfilePatches } from '@deepseek-ai/dsh-app-boot';
export { default as Hmr } from '@deepseek-ai/dsh-hmr';
export { default as ConfigEditor } from '@deepseek-ai/dsh-config-editor';
export { default as Settings } from '@deepseek-ai/dsh-settings';
export { default as z } from '@deepseek-ai/schemastery';
export { default as AgentPresets } from '@deepseek-ai/dsh-agent-preset-registry';
export { default as OfficialPreset } from '@deepseek-ai/dsh-agent-preset';
export { default as EnhancedPreset } from ${JSON.stringify(join(root, 'plugin/composition/preset-owner.ts'))};
export { default as Composition } from ${JSON.stringify(join(root, 'plugin/composition/index.ts'))};
`, resolveDir: sdk, loader: 'ts' }, outfile: join(runtime, 'harness.mjs'), bundle: true, format: 'esm', platform: 'node', target: 'es2022',
    tsconfig: join(sdk, 'tsconfig.base.json'), nodePaths: [join(sdk, 'node_modules')],
    banner: { js: "import {createRequire as __cr} from 'node:module';const require=__cr(import.meta.url);" } });
  const h = await import(pathToFileURL(join(runtime, 'harness.mjs')).href);
  const profileDir = join(dir, 'profile'), home = join(dir, 'home'), installation = join(dir, 'installation');
  await Promise.all([mkdir(profileDir), mkdir(home), mkdir(installation)]);
  const anchor = join(installation, 'package.json'); await writeFile(anchor, JSON.stringify({ name: 'dsh', version: '0.2.0-rc.2' }));
  const baseRows = [
    ...Object.entries(ROOT_MODULES).map(([id, name]) => ({ id, name, ...(id === 'tools' ? { config: { custom: 'original' } } : {}) })),
    { id: 'preset-standard', name: '@deepseek-ai/dsh-agent-preset', config: { id: 'standard', plugins: PRESET_MODULES.map(name => ({ name, disabled: false, config: { original: true } })) } },
    { id: 'ui-trajectory', name: CLIENT_MODULES['ui-trajectory'], disabled: true, config: { userLayout: 'keep' } },
    { id: 'ui-settings-agent-loop', name: CLIENT_MODULES['ui-settings-agent-loop'], config: { userSetting: 'keep' } },
    { id: 'fixture-llm-provider', name: 'fixture:llm-provider', config: { selected: 'original' } },
  ];
  const names = ['fixture-official', '@buildr-ai/buildr-dsh-plugin', '@buildr-ai/buildr-dsh-plugin-dev'];
  const graphs: Array<Record<string, string>> = [];
  const presetOwners: string[] = [];
  for (const [index, name] of names.entries()) {
    const packageDir = join(profileDir, 'node_modules', name); await mkdir(packageDir, { recursive: true });
    await writeFile(join(packageDir, 'package.json'), JSON.stringify({ name, version: '0.0.0', dsh: { bundle: { patch: 'cordis.patch.yml' } },
      ...(index ? { buildrComposition: { schemaVersion: COMPOSITION_SCHEMA } } : {}) }));
    if (index) {
      await mkdir(join(packageDir, 'runtime-composition'));
      const graph = Object.fromEntries([...Object.values(ROOT_MODULES), ...PRESET_MODULES, ...Object.values(CLIENT_MODULES)].map((name, moduleIndex) =>
        [name, pathToFileURL(join(packageDir, `enhanced-${moduleIndex}.mjs`)).href]));
      graphs.push(graph);
      for (const file of Object.values(graph)) await writeFile(fileURLToPath(file), `export const variant=${index};export default {apply(){}};`);
      for (const [id, name] of Object.entries({ ...ROOT_MODULES, ...CLIENT_MODULES })) {
        const schema = id === 'agent-loop' ? `import {z} from ${JSON.stringify(pathToFileURL(join(runtime, 'harness.mjs')).href)};const Config=z.object({maxParallelToolCalls:z.natural().min(1).default(10).volatile(),agents:z.array(z.any()).default([])});` : '';
        await writeFile(fileURLToPath(graph[name]), `${schema}export const variant=${JSON.stringify(name + ':' + index)};export default {${schema ? "Config,inject:['fixtureTools']," : ''}async apply(ctx,config){
await new Promise(resolve=>setImmediate(resolve));if(ctx.get('fixtureMutation').depth!==1)throw Error('composition activation escaped its HMR transaction');
const roots=ctx.get('fixtureRoots');if(roots.has(${JSON.stringify(id)}))throw Error('duplicate fixture root');
const value={enhanced:true,variant,config};roots.set(${JSON.stringify(id)},value);${id === 'tools' ? "ctx.provide('fixtureTools',value);" : ''}return()=>{if(roots.get(${JSON.stringify(id)})===value)roots.delete(${JSON.stringify(id)});}}};`);
      }
      const presetOwner = pathToFileURL(join(packageDir, 'preset-owner.mjs')).href;
      presetOwners.push(presetOwner);
      await writeFile(fileURLToPath(presetOwner), `import {EnhancedPreset} from ${JSON.stringify(pathToFileURL(join(runtime, 'harness.mjs')).href)};export const variant=${index};export default class extends EnhancedPreset {}`);
      await writeFile(join(packageDir, 'runtime-composition/definition.json'), JSON.stringify({ schemaVersion: COMPOSITION_SCHEMA, modules: graph, presetOwner }));
    }
    await writeFile(join(packageDir, 'cordis.patch.yml'), index ? compositionPatch(index === 1 ? 'buildr' : 'buildr-dev', name, 'runtime-composition', 'trajectory', [])
      : yaml.dump([{ insert: baseRows }]));
  }
  const profileFile = join(profileDir, 'package.json'), userFile = join(profileDir, 'cordis.patch.yml');
  const configuredGateway = { binding: { nodeExecutable: '/fixture/retained-node', cliEntry: '/fixture/canonical-cli', nodeSha256: 'sha256-' + 'a'.repeat(64), cliSha256: 'sha256-' + 'b'.repeat(64) },
    sourceBinding: { nodeExecutable: '/fixture/source-node', cliEntry: '/fixture/source-cli' } };
  await writeFile(userFile, yaml.dump([
    { id: 'tools', name: ROOT_MODULES.tools, disabled: false },
    { id: 'preset-standard', name: '@deepseek-ai/dsh-agent-preset', disabled: false },
    { id: 'ui-trajectory', name: CLIENT_MODULES['ui-trajectory'], disabled: false },
    { id: 'buildr-dev', name: names[2], config: configuredGateway },
  ]));
  async function select(selected: string[]) { await writeFile(profileFile, JSON.stringify({ name: 'fixture-profile', dsh: { profile: { bundles: selected } } })); }
  await select([names[0]]);
  host = new h.Context();
  await host.plugin(h.Loader, { baseUrl: pathToFileURL(dir + '/').href });
  host.provide('sessionProjections', { register() { return () => {}; } });
  await host.plugin(h.AgentPresets, { default: 'standard' });
  host.loader.builtins.include = h.Include;
  const profile = { name: 'fixture', dir: profileDir, patchPath: userFile, installAnchor: anchor, cwd: dir, home, startedBundles: [], overlays: [], telemetryDisabledEnv: undefined };
  host.provide('profileContext', profile);
  const mutation = { depth: 0 }; host.provide('fixtureMutation', mutation);
  await host.plugin(h.ConfigEditor); await host.plugin(h.Settings);
  const activeRoots = new Map<string, { enhanced: boolean; config: unknown }>();
  host.provide('fixtureRoots', activeRoots);
  const rootPlugin = (id: string, enhanced: boolean) => ({ ...(id === 'agent-loop' ? { inject: ['fixtureTools'], Config: h.z.object({ maxParallelToolCalls: h.z.natural().min(1).default(10).volatile(), agents: h.z.array(h.z.any()).default([]) }) } : {}), apply(ctx: any, config: unknown) {
    assert.equal(activeRoots.has(id), false, `duplicate root ${id}`);
    const value = { enhanced, config }; activeRoots.set(id, value);
    if (id === 'tools') ctx.provide('fixtureTools', value);
    return () => { if (activeRoots.get(id) === value) activeRoots.delete(id); };
  } });
  const officialRoots = Object.fromEntries(Object.entries({ ...ROOT_MODULES, ...CLIENT_MODULES }).map(([id, name]) => [name, rootPlugin(id, false)]));
  const gatewayConfigs = new Map<string, unknown>();
  host.loader.internal = { version: 'v2', async import(name: string) {
    if (name in officialRoots) return officialRoots[name];
    if (name.startsWith(pathToFileURL(join(profileDir, 'node_modules')).href) && name.endsWith('.mjs')) return import(name);
    if (name === '@deepseek-ai/dsh-agent-preset') return h.OfficialPreset;
    if (name === 'file:///fixture/preset-owner.js') return h.EnhancedPreset;
    if (name.endsWith('/runtime-composition/index.js')) return h.Composition;
    if (names.slice(1).includes(name)) return { apply(_ctx: unknown, config: unknown) { gatewayConfigs.set(name, config); } };
    return { apply() {} };
  } };
  const hmr = new h.Hmr(host.extend({ baseUrl: pathToFileURL(dir + '/').href }), { root: [], ignored: [], debounce: 1 });
  const configFile = join(dir, 'cordis.yml'); await writeFile(configFile, '[]\n');
  await h.mountRootInclude(host, configFile, h.readProfilePatches('fixture', profile));
  await host.loader.await();
  async function reload(selected: string[], enabledPreset = true) {
    await hmr.runExclusive(async () => {
    mutation.depth++; assert.equal(mutation.depth, 1);
    try {
    await select(selected); await h.reconcileProfilePatches(host, h.readProfilePatches('fixture', profile), 'fixture');
    const failures = [...host.loader.entries()].filter((entry: any) => !entry.disabled && entry.fiber?.state !== 2);
    for (const entry of failures) await (entry as any).fiber?.await();
    assert.deepEqual(failures.map((entry: any) => [entry.id, entry.fiber?.state, entry.fiber?.error?.message]), []);
    if (enabledPreset) assert.equal((await host.agentPresets.resolve('standard')).broken, undefined);
    } finally { mutation.depth--; }
    });
  }
  assert.equal(activeRoots.get('tools')?.enhanced, false, JSON.stringify({ loaded: h.loadProfileDirectory('fixture', profileDir, anchor), entries: [...host.loader.entries()].map((entry: any) => [entry.id, entry.options.name, entry.disabled, entry.fiber?.state]) }));
  await reload([names[0], names[1]]);
  assert.equal(activeRoots.get('tools')?.enhanced, true);
  assert.equal(activeRoots.get('ui-trajectory')?.enhanced, true, 'higher explicit false enables only the enhanced owner');
  assert.deepEqual(activeRoots.get('ui-trajectory')?.config, { userLayout: 'keep' });
  const agentLoopEntry = host.loader.resolve('include:agent-loop');
  const settings = host.settings.describe({ redactSecrets: true }).find((row: any) => row.ns === 'agent-loop');
  assert.ok(settings, 'real source configuration owner stays addressable');
  const nativeFiberBeforeSave = agentLoopEntry.fiber;
  await host.settings.update('agent-loop', { maxParallelToolCalls: 4 }, settings.revision);
  assert.equal(agentLoopEntry.fiber, nativeFiberBeforeSave, 'a volatile first save retains the actual enhanced fiber identity');
  assert.equal(agentLoopEntry.fiber.config.maxParallelToolCalls.get(), 4);
  assert.equal((activeRoots.get('agent-loop') as any).variant, ROOT_MODULES['agent-loop'] + ':1');
  const savedSettings = yaml.load(await readFile(userFile, 'utf8')).find((row: any) => row.id === 'agent-loop');
  assert.equal(savedSettings.name, ROOT_MODULES['agent-loop']);
  assert.equal(savedSettings.config.maxParallelToolCalls, 4);
  assert.equal((await readFile(userFile, 'utf8')).includes('file:///'), false);
  const sameRoot = activeRoots.get('tools');
  await reload([names[0], names[1]]);
  assert.equal(activeRoots.get('tools'), sameRoot, 'unrelated reload must not replace the running root');
  const beforeUnrelatedFibers = new Map([...host.loader.entries()]
    .filter((entry: any) => entry.id.startsWith('include:buildr-composition') || entry.id === 'include:agent-loop')
    .map((entry: any) => [entry.id, entry.fiber]));
  const beforeUnrelatedRoots = new Map(activeRoots);
  const beforeUnrelatedSetting = host.settings.describe({ redactSecrets: true }).find((row: any) => row.ns === 'agent-loop');
  const unchangedUserPatches = yaml.load(await readFile(userFile, 'utf8'));
  await writeFile(userFile, yaml.dump([...unchangedUserPatches,
    { id: 'fixture-llm-provider', name: 'fixture:llm-provider', config: { selected: 'changed-outside-composition' } }]));
  await reload([names[0], names[1]]);
  assert.equal(host.loader.resolve('include:fixture-llm-provider').options.config.selected, 'changed-outside-composition');
  for (const [id, fiber] of beforeUnrelatedFibers) assert.equal(host.loader.resolve(id).fiber, fiber, `unrelated provider update must preserve enhanced fiber ${id}`);
  for (const [id, value] of beforeUnrelatedRoots) assert.equal(activeRoots.get(id), value, `unrelated provider update must preserve running instance ${id}`);
  assert.equal(host.settings.describe({ redactSecrets: true }).find((row: any) => row.ns === 'agent-loop').revision, beforeUnrelatedSetting.revision,
    'unrelated provider update must preserve the official settings revision');
  await writeFile(userFile, yaml.dump(unchangedUserPatches));
  await reload([names[0], names[1]]);
  for (const [id, fiber] of beforeUnrelatedFibers) assert.equal(host.loader.resolve(id).fiber, fiber, `unrelated provider reset must preserve enhanced fiber ${id}`);
  let inventory = await host.agentPresets.compositionInventory();
  assert.ok(inventory[0].rows.some((row: any) => row.moduleName === graphs[0][PRESET_MODULES[0]]));
  // Two cooperating layers produce exactly one common owner and one set of registered presets.
  await reload(names);
  assert.equal(host.loader.resolve('include:buildr-dev').options.name, names[2], 'the original name assertion remains the actual Loader declaration');
  assert.deepEqual(gatewayConfigs.get(names[2]), configuredGateway, 'existing binding and sourceBinding must reach the loaded gateway unchanged');
  assert.equal([...host.loader.entries()].filter((entry: any) => entry.options.id === 'buildr-composition').length, 1);
  for (const [id, name] of Object.entries({ ...ROOT_MODULES, ...CLIENT_MODULES })) assert.equal((activeRoots.get(id) as any)?.variant, name + ':2');
  assert.equal(host.loader.resolve('include:buildr-composition:preset-standard').fiber.runtime.callback, (await import(presetOwners[1])).default);
  assert.equal(host.buildrCompositionRuntime.inspect().implementation, graphs[1][ROOT_MODULES['agent-loop']]);
  const previousPackage = join(profileDir, 'node_modules', names[1]), backupPackage = join(dir, 'previous-package-backup');
  await cp(previousPackage, backupPackage, { recursive: true });
  await rm(previousPackage, { recursive: true });
  await reload([names[0], names[2]]);
  assert.equal(activeRoots.get('tools')?.enhanced, true);
  assert.equal((activeRoots.get('agent-loop') as any).variant, ROOT_MODULES['agent-loop'] + ':2');
  await Promise.all([reload([names[0], names[2]]), reload([names[0], names[2]])]);
  await cp(backupPackage, previousPackage, { recursive: true });
  await reload(names);
  await reload([names[0], names[1]]);
  assert.equal((activeRoots.get('agent-loop') as any).variant, ROOT_MODULES['agent-loop'] + ':1');
  assert.equal(host.loader.resolve('include:buildr-composition:preset-standard').fiber.runtime.callback, (await import(presetOwners[0])).default);
  const update = [{ id: 'tools', name: ROOT_MODULES.tools, config: { custom: 'user-edited-while-active' } }];
  await writeFile(userFile, yaml.dump(update));
  await reload([names[0], names[1]]);
  assert.equal((activeRoots.get('tools')!.config as any).custom, 'user-edited-while-active');
  assert.equal(activeRoots.get('tools')?.enhanced, true);
  assert.equal(activeRoots.has('ui-trajectory'), false, 'a disabled source client must stay disabled');
  await reload([names[0]]);
  assert.equal(activeRoots.get('tools')?.enhanced, false);
  assert.equal(activeRoots.get('tools')?.config && (activeRoots.get('tools')!.config as any).custom, 'user-edited-while-active');
  assert.deepEqual(yaml.load(await readFile(userFile, 'utf8')), update);
  assert.equal((await readFile(userFile, 'utf8')).includes('file:///fixture'), false);
  inventory = await host.agentPresets.compositionInventory();
  assert.ok(inventory[0].rows.some((row: any) => row.moduleName === PRESET_MODULES[0]));
  await reload([names[0], names[2]]);
  assert.equal(activeRoots.get('tools')?.enhanced, true);
  await writeFile(userFile, yaml.dump([...update, { id: 'skill', name: ROOT_MODULES.skill, disabled: true }, { id: 'agent-loop', name: ROOT_MODULES['agent-loop'], disabled: true },
    { id: 'preset-standard', name: '@deepseek-ai/dsh-agent-preset', disabled: true }]));
  await reload([names[0], names[2]], false);
  assert.equal(activeRoots.has('skill'), false, 'a user-disabled root must remain disabled');
  assert.equal(activeRoots.has('agent-loop'), false, 'an intentionally disabled source configuration owner stays stopped');
  assert.equal((await host.agentPresets.list()).length, 0, 'a user-disabled preset must remain disabled');
  await reload([names[0]], false);
  assert.equal(activeRoots.get('tools')?.enhanced, false);
  assert.equal(activeRoots.has('skill'), false);
});
