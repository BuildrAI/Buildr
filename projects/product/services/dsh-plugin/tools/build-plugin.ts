/** Build a closed DSH package using the pinned SDK's real Typert compiler. No install hooks or servers. */
import { cp, mkdir, readFile, writeFile, symlink, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createSdkRequire } from './sdk-require.ts';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import type * as Esbuild from 'esbuild';
import { DSH_SDK_BASELINES, DSH_SDK_COMMIT_MARKER } from './sdk-baselines.ts';

/** SDK TypeScript 6 compiler API used at this isolated build boundary; Buildr uses TypeScript 7. */
interface CompilerProgram { emit(): { emitSkipped: boolean } }
interface SdkCompiler {
  sys: { readFile(path: string): string | undefined; fileExists(path: string): boolean };
  readConfigFile(path: string, read: (path: string) => string | undefined): { config: unknown };
  parseJsonConfigFileContent(config: unknown, system: SdkCompiler['sys'], base: string): { fileNames: string[]; options: unknown };
  createProgram(files: string[], options: unknown): CompilerProgram;
  getPreEmitDiagnostics(program: CompilerProgram): unknown[];
  formatDiagnosticsWithColorAndContext(diagnostics: unknown[], host: { getCanonicalFileName(path: string): string; getCurrentDirectory(): string; getNewLine(): string }): string;
}
interface Artifact { js: string; dts: string; remote?: { js: string; dts: string } }
interface TypertCompiler { WorkspaceTypertGenerator: new (root: string) => { generate(packages: string[], faces: string[]): Artifact[] } }
interface CssCompiler { transform(options: { filename: string; code: Buffer; cssModules: { pattern: string }; minify: boolean }): { code: Buffer; exports?: Record<string, { name: string }> } }
interface Manifest {
  name: string;
  exports: Record<string, string | { types?: string; default?: string }>;
  peerDependencies: Record<string, string>;
  dsh: Record<string, unknown>;
  [key: string]: unknown;
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/**
 * Two variants, one code base. The released package serves the npm installation; the development
 * package serves a Buildr source checkout and is never shipped with a release. Each package declares
 * its own identity, so neither has to decide between installations at runtime.
 */
const dev = process.argv.includes('--dev');
const VARIANT = dev
  ? { name: '@buildr-ai/dsh-plugin-dev', entryId: 'buildr-dev', service: 'buildr-dev', titleKey: 'titleDev', locale: 'buildr-dev', remote: 'buildr-dev', out: 'build/dsh-plugin-dev' }
  : { name: '@buildr-ai/dsh-plugin', entryId: 'buildr', service: 'buildr', titleKey: 'title', locale: 'buildr', remote: 'buildr', out: 'build/dsh-plugin' };
const sdkArg = process.argv.slice(2).find(argument => !argument.startsWith('--'));
const sdk = resolve(sdkArg ?? process.env.BUILDR_DSH_SDK_ROOT ?? join(root, 'build/dsh-0.2.0-rc.1'));
const req = createSdkRequire(sdk);
/**
 * Which baseline this input is. A fetched baseline records its commit beside the source; a git
 * checkout records it in history. Either way the build refuses an input it cannot identify.
 */
const marker = join(sdk, DSH_SDK_COMMIT_MARKER);
const sdkCommit = existsSync(marker)
  ? readFileSync(marker, 'utf8').trim()
  : execFileSync('git', ['rev-parse', 'HEAD'], { cwd: sdk, encoding: 'utf8' }).trim();
const sdkVersion = String(req('./package.json').version);
const baseline = DSH_SDK_BASELINES.find(candidate => candidate.commit === sdkCommit && candidate.version === sdkVersion);
if (baseline === undefined) {
  throw new Error(`Buildr DSH plugin requires a verified SDK baseline; got ${sdkCommit} / ${sdkVersion}. Known: ${DSH_SDK_BASELINES.map(candidate => `${candidate.commit.slice(0, 8)} / ${candidate.version}`).join(', ')}`);
}
// Build the SDK's own client artifacts only when a baseline does not already ship them. Compiling
// them unconditionally would surface the SDK's own type errors instead of ours, which is not this
// plugin's build to fix.
if (!['packages/client/ui-sidebar', 'packages/client/ui-sidebar-browser', 'packages/api/remotes']
  .every(relative => existsSync(join(sdk, relative, 'lib')))) {
  execFileSync(process.execPath, [req.resolve('typescript/bin/tsc'), '-b', 'packages/client/ui-sidebar/tsconfig.json', 'packages/client/ui-sidebar-browser/tsconfig.client.json', 'packages/api/remotes/tsconfig.client.json'], { cwd: sdk, stdio: 'inherit' });
}
const { tsImport } = req('tsx/esm/api') as { tsImport(url: string, parent: string): Promise<unknown> };
const ts = req('typescript') as SdkCompiler;
const { build } = req('esbuild') as typeof Esbuild;
const { transform } = req('lightningcss') as CssCompiler;
const { WorkspaceTypertGenerator } = await tsImport(pathToFileURL(join(sdk, 'packages/typert/generator/src/index.ts')).href, import.meta.url) as TypertCompiler;
const { PLATFORM_MODULES } = await tsImport(pathToFileURL(join(sdk, 'packages/client/web/src/platform.ts')).href, import.meta.url) as { PLATFORM_MODULES: string[] };
const stage = join(root, 'build/dsh-plugin-compile');
const pkg = join(stage, 'packages/plugin');
const out = join(root, VARIANT.out);
const source = join(root, 'plugin');
await rm(stage, { recursive: true, force: true });
await mkdir(pkg, { recursive: true });
await symlink(join(sdk, 'node_modules'), join(stage, 'node_modules'), 'dir');
await cp(source, pkg, { recursive: true });
// Cordis and the Remote generator both require the service key to be a literal, so the development
// variant takes its own key here rather than at runtime. This is the whole difference between the
// two packages' Host halves: they must be able to coexist in one DSH profile.
if (dev) {
  const hostFile = join(pkg, 'src/index.ts');
  await writeFile(hostFile, (await readFile(hostFile, 'utf8')).replace("super(ctx, 'buildr')", "super(ctx, 'buildr-dev')"));
  const clientFile = join(pkg, 'src/client.tsx');
  await writeFile(clientFile, (await readFile(clientFile, 'utf8')).replaceAll("'remote.buildr'", "'remote.buildr-dev'"));
}
const template = JSON.parse(await readFile(join(source, 'package.template.json'), 'utf8')) as Manifest;
const manifest = {
  ...template,
  version: JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).version,
  name: VARIANT.name,
  // Declare the baseline this build actually used. A mismatch must be refusable by the runtime, so
  // these versions may never stay pinned to a baseline the plugin was not compiled against.
  peerDependencies: {
    ...template.peerDependencies,
    '@deepseek-ai/dsh': baseline.version,
    '@deepseek-ai/dsh-typert-protocol': baseline.version,
  },
  description: dev
    ? 'Buildr 开发版入口，面向 Buildr 源码开发者；不随正式发布提供'
    : template.description,
  files: (template.files as string[]).map(file => dev && file === 'cordis.patch.yml' ? 'cordis.dev.patch.yml' : file),
  dsh: { ...template.dsh, bundle: { patch: dev ? 'cordis.dev.patch.yml' : 'cordis.patch.yml' } },
} as Manifest;
// Typert's source mapper uses lib/types/<leaf> -> src/<leaf>; final tsc output also includes parent bridge modules.
const reflectionManifest = { ...manifest, exports: Object.fromEntries(Object.entries(manifest.exports).map(([key, value]) => [key, typeof value === 'object' && value.types ? { ...value, types: value.types.replace('/types/src/', '/types/') } : value])) };
await writeFile(join(pkg, 'package.json'), JSON.stringify(reflectionManifest, null, 2) + '\n');
const rawBase = ts.readConfigFile(join(sdk, 'tsconfig.base.json'), ts.sys.readFile).config as { compilerOptions: { paths: Record<string, string[]> } };
const paths = Object.fromEntries(Object.entries(rawBase.compilerOptions.paths).map(([key, paths]) => [key, paths.map(p => {
  const full = resolve(sdk, p);
  const declaration = full.replace('/src', '/lib/types').replace(/\.tsx?$/, '.d.ts');
  if (p.includes('*')) return declaration;
  if (ts.sys.fileExists(declaration)) return declaration;
  if (ts.sys.fileExists(join(declaration, 'index.d.ts'))) return join(declaration, 'index.d.ts');
  return full;
})]));
// The compiler recognizes decorators by the registered protocol package, not their spelling.
const protocol = join(stage, 'packages/protocol');
await mkdir(protocol, { recursive: true });
for (const name of ['package.json', 'src', 'lib/types']) await cp(join(sdk, 'packages/typert/protocol', name), join(protocol, name), { recursive: true });
paths['@deepseek-ai/dsh-typert-protocol'] = [join(protocol, 'lib/types/index.d.ts')];
paths['@buildr-ai/dsh-plugin'] = [join(pkg, 'src/index.ts')];
paths['@buildr-ai/dsh-plugin/types'] = [join(pkg, 'src/types.ts')];
const uiRequire = createRequire(join(sdk, 'packages/client/ui-sidebar/package.json'));
const remotesRequire = createRequire(join(sdk, 'packages/api/remotes/package.json'));
const zodEntry = remotesRequire.resolve('zod');
const reactTypes = dirname(uiRequire.resolve('@types/react/package.json'));
paths.react = [join(reactTypes, 'index.d.ts')];
paths['react/jsx-runtime'] = [join(reactTypes, 'jsx-runtime.d.ts')];
const options = { target: 'ES2024', module: 'ESNext', moduleResolution: 'Bundler', strict: true, skipLibCheck: true,
  allowImportingTsExtensions: true, rewriteRelativeImportExtensions: true, declaration: true, emitDeclarationOnly: true, jsx: 'react-jsx',
  types: ['node'], typeRoots: [join(sdk, 'node_modules/@types')], paths, rootDir: '.', outDir: 'lib/types' };
await writeFile(join(pkg, 'tsconfig.json'), JSON.stringify({ compilerOptions: options, files: ['src/index.ts', 'src/types.ts'] }));
await writeFile(join(protocol, 'tsconfig.json'), JSON.stringify({ compilerOptions: options, files: ['src/index.ts'] }));
await writeFile(join(stage, 'tsconfig.host.json'), JSON.stringify({ compilerOptions: { ...options, paths: { ...paths, '@deepseek-ai/dsh-typert-protocol': [join(protocol, 'src/index.ts')] } }, files: [], references: [{ path: './packages/plugin' }, { path: './packages/protocol' }] }));
function compile(configFile: string): void {
  const config = ts.readConfigFile(configFile, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, dirname(configFile));
  const program = ts.createProgram(parsed.fileNames, parsed.options);
  const diagnostics = [...ts.getPreEmitDiagnostics(program)];
  if (diagnostics.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, { getCanonicalFileName: p => p, getCurrentDirectory: () => pkg, getNewLine: () => '\n' }));
  const emitted = program.emit();
  if (emitted.emitSkipped) throw new Error('DSH plugin TypeScript emit failed');
}
compile(join(pkg, 'tsconfig.json'));
await mkdir(join(pkg, 'lib'), { recursive: true });
const [artifact] = new WorkspaceTypertGenerator(stage).generate([manifest.name], ['host']);
if (!artifact?.remote) throw new Error('Typert did not emit the Buildr Remote contribution');
for (const [name, contents] of Object.entries({ 'typert.host.js': artifact.js, 'typert.host.d.ts': artifact.dts,
  'typert.remote-client.js': artifact.remote.js, 'typert.remote-client.d.ts': artifact.remote.dts })) await writeFile(join(pkg, 'lib', name), contents);
await writeFile(join(pkg, 'tsconfig.client.json'), JSON.stringify({ compilerOptions: options, files: ['src/client.tsx', 'src/css-modules.d.ts'] }));
compile(join(pkg, 'tsconfig.client.json'));
// A profile-installed bundle resolves only from the profile, while the DSH built-ins live inside the app
// archive. Bundle the verified protocol from the pinned SDK source so the host half keeps only
// resolvable runtime imports; the protocol module is stateless (well-known symbols, no registry).
await build({ entryPoints: [join(pkg, 'src/index.ts')], outfile: join(pkg, 'lib/index.js'), bundle: true, platform: 'node', format: 'esm', target: 'es2022',
  external: ['@deepseek-ai/schemastery', '@deepseek-ai/cordis'], alias: { '@deepseek-ai/dsh-typert-protocol': join(sdk, 'packages/typert/protocol/src/index.ts'), zod: zodEntry },
  tsconfig: join(pkg, 'tsconfig.json') });
await build({ entryPoints: [join(pkg, 'src/client.tsx')], outfile: join(pkg, 'lib/client.js'), bundle: true, platform: 'browser', format: 'cjs', target: 'es2022',
  tsconfig: join(pkg, 'tsconfig.client.json'), external: [...PLATFORM_MODULES], nodePaths: [join(sdk, 'node_modules')], alias: { zod: zodEntry },
  define: {
    __BUILDR_ENTRY_ID__: JSON.stringify(VARIANT.entryId),
    __BUILDR_TITLE_KEY__: JSON.stringify(VARIANT.titleKey),
    // A locale namespace is a registration key: two packages claiming the same one collide, and the
    // rejected registration is what previously stopped the development entry from reaching its slot.
    __BUILDR_LOCALE__: JSON.stringify(VARIANT.locale),
    __BUILDR_REMOTE__: JSON.stringify(VARIANT.remote),
  },
  banner: { js: `window.__ModuleLoader__.load({id:${JSON.stringify(manifest.name)},factory:(require)=>{var module={exports:{}};var exports=module.exports;` },
  footer: { js: 'return module.exports;}});' },
  plugins: [{ name: 'dsh-css-modules', setup(plugin) {
    plugin.onLoad({ filter: /\.module\.css$/ }, async ({ path }) => {
      const css = transform({ filename: path, code: await readFile(path), cssModules: { pattern: '[hash]_[local]' }, minify: true });
      const classes = Object.fromEntries(Object.entries(css.exports ?? {}).map(([k, v]) => [k, v.name]));
      return { loader: 'js', contents: `const tag=document.createElement('style');tag.dataset.plugin=${JSON.stringify(manifest.name)};tag.textContent=${JSON.stringify(css.code.toString())};document.head.appendChild(tag);export default ${JSON.stringify(classes)};` };
    });
  } }],
});
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await cp(join(pkg, 'lib'), join(out, 'lib'), { recursive: true });
if (!dev) await cp(join(source, 'cordis.patch.yml'), join(out, 'cordis.patch.yml'));
await cp(join(source, 'README.md'), join(out, 'lib/README.md'));
await cp(join(root, 'LICENSE'), join(out, 'lib/LICENSE.Buildr.txt'));
await cp(join(dirname(remotesRequire.resolve('zod/package.json')), 'LICENSE'), join(out, 'lib/LICENSE.zod.txt'));
if (dev) await cp(join(source, 'cordis.dev.patch.yml'), join(out, 'cordis.dev.patch.yml'));
await writeFile(join(out, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ package: manifest.name, variant: dev ? 'development' : 'released', output: out, hostRemote: artifact.remote !== undefined, desktopValidated: false }));
