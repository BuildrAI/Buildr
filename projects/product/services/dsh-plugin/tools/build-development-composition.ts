/** Compose a local development trial from verified artifacts; never install or patch the current profile. */
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, lstat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { newBuildOutput, validatePreparedSourceSdk, SOURCE_CLIENT_PLUGINS, type SourceHostArtifacts } from './prepare-source-sdk.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function object(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}
async function manifest(file: string): Promise<Record<string, unknown>> { return object(JSON.parse(await readFile(file, 'utf8')), file); }
const hash = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
async function digest(file: string): Promise<string> {
  const info = await lstat(file);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error(`Expected a regular artifact file: ${file}`);
  return hash(await readFile(file));
}
async function treeDigests(base: string, directory = base): Promise<Array<{ path: string; sha256: string }>> {
  const result: Array<{ path: string; sha256: string }> = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await treeDigests(base, file));
    else result.push({ path: path.relative(base, file).split(path.sep).join('/'), sha256: await digest(file) });
  }
  return result.sort((a, b) => a.path.localeCompare(b.path));
}
export interface HostConfiguration {
  id: string;
  /** Observed raw declaration. Omission requires observed.configPresent=false, never a parsed default. */
  config?: Record<string, unknown>;
  disabled?: boolean | { __jsExpr: string };
  inject?: unknown;
  observed: { entryId: string; moduleName: string; parentTreeEntryId: 'include'; parentContextEntryId: 'include'; enabled: boolean; phase: 'active'; parsedConfig: Record<string, unknown>; configPresent?: boolean };
}
const ROOT_PRODUCERS = new Set(['tools', 'agent-loop', 'skill']);
export function stageHostCompositionPatch(stage: 'graph-only' | 'root-replacement', host: SourceHostArtifacts, configurations: HostConfiguration[] | undefined, directory: string): string[] {
  if (stage === 'graph-only') return [];
  if (configurations === undefined) throw new Error('Root replacement requires observed root declarations');
  return hostCompositionPatch(host, configurations, directory);
}
export function trajectoryCompositionDirectory(capture: boolean, files: Array<{ path: string; sha256: string }>): string {
  return capture ? `runtime-trajectory-${hash(Buffer.from(JSON.stringify(files))).slice(0, 16)}` : 'runtime-trajectory';
}
export function rootHostEntries(entries: SourceHostArtifacts['entries']): SourceHostArtifacts['entries'] {
  return entries.filter(entry => ROOT_PRODUCERS.has(entry.entryId));
}
/** Only observed active Host declarations enter this patch; preset producers retain their own owner. */
export function parseHostConfigurations(value: unknown, entries: SourceHostArtifacts['entries']): HostConfiguration[] {
  const roots = rootHostEntries(entries);
  if (!Array.isArray(value) || value.length !== roots.length) throw new Error('Host configuration must enumerate every selected active root producer exactly once');
  const ids = new Set(roots.map(entry => entry.entryId)), seen = new Set<string>();
  const validate = (value: unknown): void => {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
    if (typeof value === 'number' && Number.isFinite(value) && !Object.is(value, -0)) return;
    if (Array.isArray(value)) { value.forEach(validate); return; }
    const item = object(value, 'Host configuration value');
    for (const [key, child] of Object.entries(item)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key) || /^(?:password|secret|credential|credentials|api[-_]?key|access[-_]?token|refresh[-_]?token|authorization|cookie|bearer|private[-_]?key)$/i.test(key)) throw new Error('Host configuration snapshot cannot contain prototypes or credentials');
      validate(child);
    }
  };
  return value.map((value, index) => {
    const row = object(value, `Host configuration[${index}]`);
    if (!Object.keys(row).every(key => ['id', 'config', 'disabled', 'inject', 'observed'].includes(key)) || typeof row.id !== 'string' || !ids.has(row.id) || seen.has(row.id)) throw new Error('Host configuration must contain only selected root id/raw declaration/observed facts');
    seen.add(row.id);
    const selected = roots.find(entry => entry.entryId === row.id)!;
    const facts = object(row.observed, 'Host observed facts');
    if (Object.keys(facts).length !== (Object.hasOwn(facts, 'configPresent') ? 8 : 7) || !Object.keys(facts).every(key => ['entryId','moduleName','parentTreeEntryId','parentContextEntryId','enabled','phase','parsedConfig','configPresent'].includes(key))
      || facts.entryId !== `include:${row.id}` || facts.moduleName !== selected.name || facts.parentTreeEntryId !== 'include' || facts.parentContextEntryId !== 'include' || facts.enabled !== true || facts.phase !== 'active') throw new Error('Host declaration must be uniquely observed in the active root Include; do not flatten preset conditions');
    const hasConfig = Object.hasOwn(row, 'config');
    if ((!hasConfig && facts.configPresent !== false) || (Object.hasOwn(facts, 'configPresent') && (typeof facts.configPresent !== 'boolean' || facts.configPresent !== hasConfig))) throw new Error('Host config presence must match the explicitly observed raw declaration');
    const config = hasConfig ? object(row.config, `Host configuration ${row.id}`) : undefined;
    if (config !== undefined) validate(config);
    const parsedConfig = object(facts.parsedConfig, 'Host parsed observation'); validate(parsedConfig);
    if (Object.hasOwn(row, 'disabled')) {
      const disabled = row.disabled;
      if (typeof disabled !== 'boolean') {
        const expression = object(disabled, 'Host raw disabled condition');
        if (Object.keys(expression).length !== 1 || typeof expression.__jsExpr !== 'string' || !expression.__jsExpr.length || expression.__jsExpr.length > 4096) throw new Error('Host disabled must preserve an observed boolean or Loader expression');
      }
      validate(disabled);
    }
    if (Object.hasOwn(row, 'inject')) validate(row.inject);
    return { id: row.id, ...(config !== undefined ? { config } : {}), ...(Object.hasOwn(row, 'disabled') ? { disabled: row.disabled as NonNullable<HostConfiguration['disabled']> } : {}),
      ...(Object.hasOwn(row, 'inject') ? { inject: row.inject } : {}), observed: facts as unknown as HostConfiguration['observed'] };
  });
}
/** Replace only active Host owners. Preset-scoped five modules are edited through their official ConfigEditor. */
export function hostCompositionPatch(host: SourceHostArtifacts, configurations: HostConfiguration[], directory: string): string[] {
  if (!/^runtime-host-[a-f0-9]{16}$/.test(directory)) throw new Error('Host closure needs an immutable content address');
  const checked = parseHostConfigurations(configurations, host.entries), roots = rootHostEntries(host.entries);
  return [
    ...roots.flatMap(entry => [`- id: ${entry.entryId}`, `  name: '${entry.name}'`, '  disabled: true']),
    ...(roots.length ? ['- insert:'] : []),
    ...roots.flatMap(entry => {
      const config = checked.find(config => config.id === entry.entryId)!;
      return [`    - id: buildr-dev-host-${entry.entryId}`, `      name: './${directory}/${entry.entry.slice(host.directory.length + 1)}'`,
        ...(Object.hasOwn(config, 'disabled') ? [`      disabled: ${JSON.stringify(config.disabled)}`] : []),
        ...(Object.hasOwn(config, 'inject') ? [`      inject: ${JSON.stringify(config.inject)}`] : []),
        ...(Object.hasOwn(config, 'config') ? [`      config: ${JSON.stringify(config.config)}`] : [])];
    }),
  ];
}
/** An additional Client contribution changes only its own Loader row. */
export function clientCompositionPatch(entry: { entryId: string; name: string; directory: string }): string[] {
  const selected = SOURCE_CLIENT_PLUGINS.find(plugin => plugin.entryId === entry.entryId && plugin.name === entry.name);
  if (selected === undefined || !/^runtime-client-[a-f0-9]{16}$/.test(entry.directory)) throw new Error('Client substitution needs an explicit selected identity and immutable content address');
  return [`- id: ${entry.entryId}`, `  name: '${entry.name}'`, '  disabled: true', '- insert:',
    `    - id: buildr-dev-${entry.entryId}`, `      name: './${entry.directory}/lib/index.js'`, '      disabled: false'];
}

export async function buildDevelopmentComposition(args: string[]): Promise<void> {
const allowed = ['--source-sdk', '--entry', '--source-cli', '--node', '--output', '--host-config', '--host-stage'];
for (let index = 0; index < args.length; index += 2) if (!allowed.includes(args[index]!) || !args[index + 1] || args[index + 1]!.startsWith('--')) throw new Error('Expected --source-sdk, --entry, --source-cli, --node and --output');
function option(name: string): string {
  const index = args.indexOf(name);
  if (index < 0 || args.indexOf(name, index + 1) >= 0) throw new Error(`One explicit ${name} is required`);
  return path.resolve(root, args[index + 1]!);
}
const sdk = option('--source-sdk'), entry = option('--entry'), sourceCli = option('--source-cli'), node = option('--node');
const receipt = validatePreparedSourceSdk(sdk, root);
const host = receipt.hostArtifacts;
const stageOption = args.indexOf('--host-stage');
if (stageOption >= 0 && args.indexOf('--host-stage', stageOption + 1) >= 0) throw new Error('One explicit --host-stage is required');
const hostStage = stageOption < 0 ? 'root-replacement' : args[stageOption + 1];
if (!['root-replacement', 'graph-only'].includes(hostStage!)) throw new Error('Host stage must be graph-only or root-replacement');
if (hostStage === 'graph-only' && host === undefined) throw new Error('Graph-only staging requires the explicit capture Host graph');
const configOption = args.indexOf('--host-config');
if (host !== undefined && hostStage === 'root-replacement' && configOption < 0) throw new Error('Capture composition requires explicit --host-config observed active root declarations; defaults cannot preserve desktop behavior');
if (host === undefined && configOption >= 0) throw new Error('A legacy trajectory-only SDK has no Host replacement configuration');
let configurations: HostConfiguration[] | undefined;
let configurationSha256: string | undefined;
if (host !== undefined && configOption >= 0) {
  const file = option('--host-config'), info = await lstat(file);
  if (!info.isFile() || info.isSymbolicLink() || info.size > 512 * 1024) throw new Error('Host configuration snapshot must be a bounded regular UTF-8 JSON file');
  const bytes = await readFile(file);
  configurations = parseHostConfigurations(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)), host.entries);
  configurationSha256 = hash(bytes);
}
const entryManifest = await manifest(path.join(entry, 'package.json'));
if (entryManifest.name !== '@buildr-ai/buildr-dsh-plugin-dev') throw new Error('Only the development entry may enter this local composition');
const attestation = object(entryManifest.buildrDshSourceSdk, 'entry SDK attestation');
if (attestation.sourcePatchSha256 !== receipt.patchSha256 || attestation.sourceManifestSha256 !== receipt.sourceManifest.sha256) throw new Error('Development entry and trajectory must consume the same exact SDK');
const trajectory = path.join(sdk, 'packages/client/ui-trajectory');
const trajectoryManifest = await manifest(path.join(trajectory, 'package.json'));
if (trajectoryManifest.name !== '@deepseek-ai/dsh-client-ui-trajectory' || trajectoryManifest.version !== receipt.baseline.version) throw new Error('Unexpected trajectory artifact identity');
const sourceBinding = { nodeExecutable: node, cliEntry: sourceCli, nodeSha256: `sha256-${await digest(node)}`, cliSha256: `sha256-${await digest(sourceCli)}` };
// Changed compiled code gets a new file URL while the real package and factory identities stay fixed.
const entryDirectory = `runtime-entry-${hash(Buffer.from(`${await digest(path.join(entry, 'lib/index.js'))}:${await digest(path.join(entry, 'lib/client.js'))}`)).slice(0, 16)}`;
const trajectoryDirectory = trajectoryCompositionDirectory(host !== undefined, await treeDigests(path.join(trajectory, 'lib')));
const out = newBuildOutput(root, option('--output'));
await mkdir(out, { recursive: true });
await cp(entry, path.join(out, entryDirectory), { recursive: true });
const hostDirectory = host === undefined ? undefined : `runtime-host-${hash(Buffer.from(JSON.stringify(host.files))).slice(0, 16)}`;
if (host !== undefined) await cp(path.join(sdk, host.directory), path.join(out, hostDirectory!), { recursive: true });
await mkdir(path.join(out, trajectoryDirectory), { recursive: true });
await cp(path.join(trajectory, 'lib'), path.join(out, trajectoryDirectory, 'lib'), { recursive: true });
// Normalize workspace-only dependency ranges in the packaged copy, not the immutable SDK.
const packagedTrajectory: Record<string, unknown> = { ...trajectoryManifest, peerDependencies: { '@deepseek-ai/cordis': '4.0.4', '@deepseek-ai/dsh': receipt.baseline.version } };
delete packagedTrajectory.devDependencies;
delete packagedTrajectory.scripts;
await writeFile(path.join(out, trajectoryDirectory, 'package.json'), JSON.stringify(packagedTrajectory, null, 2) + '\n');
await cp(path.join(sdk, 'LICENSE'), path.join(out, trajectoryDirectory, 'LICENSE'));
const clientEntries: Array<{ packagePath: string; name: string; entryId: string; directory: string; sourceFiles: Array<{ path: string; sha256: string }> }> = [];
for (const packagePath of receipt.clientPackages ?? []) {
  const selected = SOURCE_CLIENT_PLUGINS.find(plugin => plugin.path === packagePath)!;
  const source = path.join(sdk, packagePath), metadata = await manifest(path.join(source, 'package.json'));
  if (metadata.name !== selected.name || metadata.version !== receipt.baseline.version) throw new Error('Unexpected Client contribution identity');
  const sourceFiles = await treeDigests(path.join(source, 'lib'));
  const directory = `runtime-client-${hash(Buffer.from(JSON.stringify(sourceFiles))).slice(0, 16)}`;
  await mkdir(path.join(out, directory));
  await cp(path.join(source, 'lib'), path.join(out, directory, 'lib'), { recursive: true });
  const packaged: Record<string, unknown> = { ...metadata, peerDependencies: { '@deepseek-ai/cordis': '4.0.4', '@deepseek-ai/dsh': receipt.baseline.version } };
  delete packaged.devDependencies; delete packaged.scripts;
  await writeFile(path.join(out, directory, 'package.json'), JSON.stringify(packaged, null, 2) + '\n');
  await cp(path.join(sdk, 'LICENSE'), path.join(out, directory, 'LICENSE'));
  clientEntries.push({ ...selected, packagePath, directory, sourceFiles });
}
await cp(path.join(root, 'LICENSE'), path.join(out, 'LICENSE'));
const patch = [
  ...(host === undefined ? [] : stageHostCompositionPatch(hostStage as 'graph-only' | 'root-replacement', host, configurations, hostDirectory!)),
  ...clientEntries.flatMap(clientCompositionPatch),
  '- id: buildr-dev', "  name: '@buildr-ai/dsh-plugin-dev'", '  disabled: true',
  '- id: ui-trajectory', "  name: '@deepseek-ai/dsh-client-ui-trajectory'", '  disabled: true',
  '- insert:', '    - id: buildr-dev-entry', `      name: './${entryDirectory}/lib/index.js'`, '      disabled: false',
  '      config:', `        sourceBinding: ${JSON.stringify(sourceBinding)}`,
  '    - id: buildr-dev-trajectory', `      name: './${trajectoryDirectory}/lib/index.js'`, '      disabled: false',
].join('\n') + '\n';
await writeFile(path.join(out, 'cordis.patch.yml'), patch);
await writeFile(path.join(out, 'package.json'), JSON.stringify({
  // A composition is not the nested development entry. Keep its install root independent of prior entry links.
  name: '@buildr-ai/buildr-dsh-development-composition', version: entryManifest.version, private: true, type: 'module',
  description: 'Buildr 本地开发试用组合：既有入口、原轨迹来源与内容增强、并列 Buildr 页；未发布',
  files: [entryDirectory, ...(hostDirectory === undefined ? [] : [hostDirectory]), ...clientEntries.map(entry => entry.directory), trajectoryDirectory, 'locale', 'cordis.patch.yml', 'composition.json', 'README.md', 'LICENSE'],
  exports: { './package.json': './package.json', './locale/*.json': './locale/*.json' },
  dsh: { bundle: { patch: 'cordis.patch.yml' } },
  peerDependencies: { '@deepseek-ai/dsh': receipt.baseline.version, '@deepseek-ai/cordis': '4.0.4' },
  peerDependenciesMeta: { '@deepseek-ai/dsh': { optional: true } },
  dependencies: { '@deepseek-ai/cordis': '4.0.4', '@deepseek-ai/schemastery': '3.18.4', zod: '4.4.3' },
}, null, 2) + '\n');
await writeFile(path.join(out, 'README.md'), '# Buildr 开发候选试用组合\n\n此本地组合未经发布，一次安装加载增强后的原轨迹界面与 Buildr 开发入口。原入口继续发现当前开发网页服务；当次采集明确绑定候选的公开元数据命令；查看只读取 DSH 原事件。三项根服务按已观察原始声明替换，五项预设模块须另由官方 ConfigEditor 仅更新真实声明的模块引用，保留其余规则、条件及隔离，不复制完整预设或凭证到本包。仅预设叶编辑且原AgentLoop未卸载时，既有智能体保留已绑定版本；根AgentLoop停换会释放liveAgents，原会话须先通过公开持久元数据核对，再经受支持入口恢复。新现场须另验保存重载。\n\n只通过 DSH 插件管理器安装和撤回，不手改应用归档或配置档。禁用本组合层会恢复旧开发入口与原轨迹；直接覆盖已安装的同名包需要完整重启，不能用网页刷新冒充新宿主代码已生效。本地修复也可先通过管理器移除旧组合，再安装实体新压缩包；改变的代码使用内容摘要命名的内层目录，避免复用旧宿主文件地址。必须以管理器实际应用结果、新宿主地址和真实来源读取确认换代，失败时从保留的旧压缩包回退。安装返回成功不代替三处界面的实际检查。\n');
await mkdir(path.join(out, 'locale'));
for (const locale of ['en', 'zh']) await writeFile(path.join(out, 'locale', `${locale}.json`), JSON.stringify({ meta: { title: locale === 'zh' ? 'Buildr 开发版' : 'Buildr Development', description: locale === 'zh' ? '开发入口、增强的 DSH 原轨迹与并列 Buildr 页；本地试用，未发布' : 'Local development entry, enhanced DSH trajectory, and parallel Buildr view; unpublished' } }, null, 2) + '\n');
const files = await treeDigests(out);
const proof = { schemaVersion: 'buildr.dsh-development-composition/v1', published: false, installed: false,
  sourceSdk: { baseline: receipt.baseline, patchSha256: receipt.patchSha256, manifestSha256: receipt.sourceManifest.sha256, ...(host === undefined ? {} : { contracts: receipt.contracts }) },
  trajectory: { directory: trajectoryDirectory, sourceIndexSha256: await digest(path.join(trajectory, 'lib/index.js')), sourceClientSha256: await digest(path.join(trajectory, 'lib/client.js')) },
  ...(clientEntries.length === 0 ? {} : { clientComposition: { entries: clientEntries, runtimeValidation: 'pending' } }),
  ...(host === undefined ? {} : { hostComposition: {
    directory: hostDirectory, stage: hostStage, configurationSha256, sourceArtifacts: host,
    entries: hostStage === 'graph-only' ? [] : rootHostEntries(host.entries).map(entry => ({ name: entry.name, originalEntryId: entry.entryId, entryId: `buildr-dev-host-${entry.entryId}`, entry: `${hostDirectory}/${entry.entry.slice(host.directory.length + 1)}`, ...configurations!.find(config => config.id === entry.entryId) })),
    presetModules: host.entries.filter(entry => !ROOT_PRODUCERS.has(entry.entryId)).map(entry => ({ name: entry.name, sourceEntryId: entry.entryId, entry: `${hostDirectory}/${entry.entry.slice(host.directory.length + 1)}` })),
    presetValidation: 'pending-official-selected-leaf-edit',
    runtimeValidation: 'pending', activationObligations: ['old producer services disposed before new providers', 'raw declarations and original conditions preserved; active effective values compared', 'public service dependencies and original settings contributions restored', 'AgentLoop replacement disposes live Agents; persisted sessions checked and supported recovery verified', 'actual preset owners use selected five immutable module URLs; preset-only edits retain generations while their AgentLoop factory remains active', 'preset leaf rollback through ConfigEditor completed before graph removal', 'new event sources survive native save/reload/query'],
  } }),
  sourceBinding, files, contentIdentity: `sha256-${hash(Buffer.from(JSON.stringify(files)))}` };
await writeFile(path.join(out, 'composition.json'), JSON.stringify(proof, null, 2) + '\n');
console.log(JSON.stringify({ output: out, contentIdentity: proof.contentIdentity, published: false, installed: false }));
}
if (import.meta.main) await buildDevelopmentComposition(process.argv.slice(2));
