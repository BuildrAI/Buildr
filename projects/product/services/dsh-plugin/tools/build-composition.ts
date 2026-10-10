/** Build a portable, reversible official-Host composition from one verified SDK and thin entry. */
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, lstat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSdkRequire } from './sdk-require.ts';
import { newBuildOutput, validatePreparedSourceSdk, SOURCE_CLIENT_PLUGINS, sdkDeclarationPaths } from './prepare-source-sdk.ts';
import { COMPOSITION_SCHEMA, COMPOSITION_OWNER_ID, PRESET_IDS, PRESET_MODULE, ROOT_MODULES } from '../plugin/composition/definition.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hash = (bytes: Buffer | string): string => createHash('sha256').update(bytes).digest('hex');
async function treeFiles(base: string, directory = base): Promise<Array<{ path: string; sha256: string }>> {
  const result: Array<{ path: string; sha256: string }> = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await treeFiles(base, file));
    else {
      const info = await lstat(file);
      if (!info.isFile() || info.isSymbolicLink()) throw Error('Composition requires physical regular files');
      result.push({ path: path.relative(base, file).split(path.sep).join('/'), sha256: hash(await readFile(file)) });
    }
  }
  return result.sort((a, b) => a.path.localeCompare(b.path));
}
export function compositionPatch(entryId: string, entryName: string, host: string, _trajectory: string, clients: readonly { entryId: string; name: string; directory: string }[]): string {
  const rows = [
    ...Object.entries(ROOT_MODULES).filter(([id]) => id !== 'agent-loop').flatMap(([id, name]) => [`- id: ${id}`, `  name: '${name}'`, '  disabled: true']),
    ...PRESET_IDS.flatMap(id => [`- id: ${id}`, `  name: '${PRESET_MODULE}'`, '  disabled: true']),
    '- id: ui-trajectory', "  name: '@deepseek-ai/dsh-client-ui-trajectory'", '  disabled: true',
    ...clients.flatMap(client => [`- id: ${client.entryId}`, `  name: '${client.name}'`, '  disabled: true']),
    '- insert:',
    `    - id: ${COMPOSITION_OWNER_ID}`, `      name: './${host}/index.js'`, '      disabled: false',
    // The public declaration is also the identity targeted by existing user configuration patches.
    // The outer package's main/exports resolve it to the exact packaged thin implementation.
    `    - id: ${entryId}`, `      name: '${entryName}'`, '      disabled: false',
  ];
  return rows.join('\n') + '\n';
}
export async function buildComposition(args: string[]): Promise<{ output: string; package: string }> {
  const options = new Map<string, string>();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index]!, value = args[index + 1];
    if (!['--source-sdk', '--entry', '--output'].includes(key) || !value || value.startsWith('--') || options.has(key)) throw Error('Expected one --source-sdk, --entry and --output');
    options.set(key, path.resolve(root, value));
  }
  const sdk = options.get('--source-sdk'), entry = options.get('--entry'), target = options.get('--output');
  if (!sdk || !entry || !target) throw Error('Explicit --source-sdk, --entry and --output are required');
  const receipt = validatePreparedSourceSdk(sdk, root), host = receipt.hostArtifacts;
  if (!host) throw Error('Composition requires the verified source-capture Host graph');
  const metadata = JSON.parse(await readFile(path.join(entry, 'package.json'), 'utf8'));
  if (!['@buildr-ai/buildr-dsh-plugin', '@buildr-ai/buildr-dsh-plugin-dev'].includes(metadata.name)
    || metadata.buildrDshSourceSdk?.sourcePatchSha256 !== receipt.patchSha256
    || metadata.buildrDshSourceSdk?.sourceManifestSha256 !== receipt.sourceManifest.sha256) throw Error('Thin entry and composition must use the same verified SDK');
  if (metadata.scripts || metadata.binding || metadata.sourceBinding) throw Error('Portable thin entry cannot contain installation scripts or machine bindings');
  const output = newBuildOutput(root, target);
  await mkdir(path.dirname(output), { recursive: true });
  await mkdir(output);
  const entryDirectory = `runtime-entry-${hash(JSON.stringify(await treeFiles(entry))).slice(0, 16)}`;
  const hostDirectory = `runtime-host-${hash(JSON.stringify(host.files)).slice(0, 16)}`;
  const compositionDirectory = 'runtime-composition';
  await cp(entry, path.join(output, entryDirectory), { recursive: true });
  await cp(path.join(sdk, host.directory), path.join(output, hostDirectory), { recursive: true });
  const trajectorySource = path.join(sdk, 'packages/client/ui-trajectory');
  const trajectoryDirectory = `runtime-trajectory-${hash(JSON.stringify(await treeFiles(path.join(trajectorySource, 'lib')))).slice(0, 16)}`;
  async function copyClient(source: string, directory: string): Promise<void> {
    await mkdir(path.join(output, directory));
    await cp(path.join(source, 'lib'), path.join(output, directory, 'lib'), { recursive: true });
    const original = JSON.parse(await readFile(path.join(source, 'package.json'), 'utf8'));
    delete original.scripts; delete original.devDependencies; delete original.dependencies;
    original.peerDependencies = { '@deepseek-ai/cordis': '4.0.4', '@deepseek-ai/dsh': receipt.baseline.version };
    await writeFile(path.join(output, directory, 'package.json'), JSON.stringify(original, null, 2) + '\n');
    await cp(path.join(sdk, 'LICENSE'), path.join(output, directory, 'LICENSE'));
  }
  await copyClient(trajectorySource, trajectoryDirectory);
  const clients: Array<{ entryId: string; name: string; directory: string }> = [];
  for (const packagePath of receipt.clientPackages ?? []) {
    const selected = SOURCE_CLIENT_PLUGINS.find(row => row.path === packagePath)!;
    const source = path.join(sdk, packagePath);
    const directory = `runtime-client-${hash(JSON.stringify(await treeFiles(path.join(source, 'lib')))).slice(0, 16)}`;
    await copyClient(source, directory); clients.push({ ...selected, directory });
  }
  await mkdir(path.join(output, compositionDirectory));
  const req = createSdkRequire(sdk);
  const ts = req('typescript');
  const program = ts.createProgram(['index.ts', 'preset-owner.ts', 'definition.ts', 'configuration-owner.ts'].map(file => path.join(root, 'plugin/composition', file)), {
    target: ts.ScriptTarget.ES2024, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true, skipLibCheck: true, noUncheckedIndexedAccess: true, exactOptionalPropertyTypes: true,
    noUnusedLocals: true, noUnusedParameters: true, allowImportingTsExtensions: true, noEmit: true,
    types: ['node'], typeRoots: [path.join(sdk, 'node_modules/@types')], paths: sdkDeclarationPaths(sdk),
  });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  if (diagnostics.length) throw Error(ts.formatDiagnosticsWithColorAndContext(diagnostics,
    { getCanonicalFileName: (file: string) => file, getCurrentDirectory: () => root, getNewLine: () => '\n' }));
  await req('esbuild').build({ entryPoints: { index: path.join(root, 'plugin/composition/index.ts'), 'preset-owner': path.join(root, 'plugin/composition/preset-owner.ts') },
    outdir: path.join(output, compositionDirectory), bundle: true, format: 'esm', platform: 'node', target: 'es2022', external: ['@deepseek-ai/*'] });
  await writeFile(path.join(output, compositionDirectory, 'definition.json'), JSON.stringify({ schemaVersion: COMPOSITION_SCHEMA,
    modules: { ...Object.fromEntries(host.entries.map(item => [item.name, `../${hostDirectory}/${item.entry.slice(host.directory.length + 1)}`])),
      '@deepseek-ai/dsh-client-ui-trajectory': `../${trajectoryDirectory}/lib/index.js`,
      ...Object.fromEntries(clients.map(item => [item.name, `../${item.directory}/lib/index.js`])) }, presetOwner: './preset-owner.js' }, null, 2) + '\n');
  const isDev = metadata.name.endsWith('-dev');
  await writeFile(path.join(output, 'cordis.patch.yml'), compositionPatch(isDev ? 'buildr-dev' : 'buildr', metadata.name, compositionDirectory, trajectoryDirectory, clients));
  const nestedPath = (value: string): string => `./${entryDirectory}/${value.replace(/^\.\//, '')}`;
  const exports = Object.fromEntries(Object.entries(metadata.exports as Record<string, string | Record<string, string>>).map(([key, value]) =>
    [key, key === './package.json' ? './package.json' : typeof value === 'string' ? nestedPath(value)
      : Object.fromEntries(Object.entries(value).map(([condition, file]) => [condition, nestedPath(file)]))]));
  const manifest = { name: metadata.name, version: metadata.version, type: 'module', description: metadata.description,
    main: nestedPath(metadata.main), ...(metadata.types === undefined ? {} : { types: nestedPath(metadata.types) }),
    license: metadata.license, repository: metadata.repository, buildrCompatibility: metadata.buildrCompatibility,
    buildrDshSourceSdk: metadata.buildrDshSourceSdk,
    buildrComposition: { schemaVersion: COMPOSITION_SCHEMA, entryDirectory, upstream: receipt.baseline, patchSha256: receipt.patchSha256 },
    files: [entryDirectory, hostDirectory, compositionDirectory, trajectoryDirectory, ...clients.map(row => row.directory), 'cordis.patch.yml', 'composition.json', 'LICENSE', 'README.md'],
    exports, dsh: { bundle: { patch: 'cordis.patch.yml' } },
    peerDependencies: { '@deepseek-ai/dsh': receipt.baseline.version, '@deepseek-ai/cordis': '4.0.4' },
    peerDependenciesMeta: { '@deepseek-ai/dsh': { optional: true } }, dependencies: metadata.dependencies };
  await writeFile(path.join(output, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
  await cp(path.join(root, 'LICENSE'), path.join(output, 'LICENSE'));
  await writeFile(path.join(output, 'README.md'), '# Buildr DSH 增强插件\n\n通过官方插件管理器正常安装、停用和卸载。增强组件只在本组合层启用；根配置及预设从当前官方与用户声明在内存派生，不持久写入私有模块引用。停用恢复官方组件，已有会话和事件保持。DSH版本需要精确兼容验证。\n');
  await writeFile(path.join(output, 'composition.json'), JSON.stringify({ schemaVersion: COMPOSITION_SCHEMA, upstream: receipt.baseline,
    patchSha256: receipt.patchSha256, files: await treeFiles(output), runtimeValidated: false }, null, 2) + '\n');
  return { output, package: metadata.name };
}
if (import.meta.main) console.log(JSON.stringify(await buildComposition(process.argv.slice(2))));
