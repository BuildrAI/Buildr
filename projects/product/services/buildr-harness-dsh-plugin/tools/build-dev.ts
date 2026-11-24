import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const buildRoot = path.join(root, 'build');
const require = createRequire(path.join(root, '../buildr/package.json'));
const { build } = require('esbuild') as { build: (options: object) => Promise<unknown> };
const released = process.argv.includes('--release');
const { version: devVersion } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const name = released ? '@buildr-ai/dsh-buildr-harness' : '@buildr-ai/buildr-harness-dsh-plugin-dev';
const version = released ? process.argv[3] : devVersion;
if (!version || !/^\d+\.\d+\.\d+(?:-rc\.[1-9]\d*)?$/.test(version) || (released && !process.argv[4])) throw Error('Usage: build-dev.ts [<output> | --release <version> <output>]');
const out = path.resolve((released ? process.argv[4] : process.argv[2]) ?? buildRoot);
const define = { __BUILDR_HARNESS_DSH_RELEASED__: JSON.stringify(released) };
fs.mkdirSync(out, { recursive: true });
fs.mkdirSync(buildRoot, { recursive: true });
const stage = fs.mkdtempSync(path.join(buildRoot, 'pack-'));
try {
  const common = { define, bundle: true, format: 'esm', target: 'es2024', outdir: path.join(stage, 'lib'), absWorkingDir: root, logLevel: 'warning' };
  await build({ ...common, entryPoints: ['src/index.ts', 'src/launcher.ts'], platform: 'node' });
  await build({ ...common, entryPoints: ['src/client.tsx'], platform: 'browser', format: 'cjs', jsx: 'automatic', external: ['react', 'react/jsx-runtime'],
    banner: { js: `window.__ModuleLoader__.load({id:${JSON.stringify(name)},factory:(require)=>{var module={exports:{}};var exports=module.exports;` },
    footer: { js: 'return module.exports;}});' },
  });
  fs.writeFileSync(path.join(stage, 'package.json'), JSON.stringify({
    name, version, license: 'MIT', ...(released ? { publishConfig: { access: 'public' } } : { private: true }), type: 'module',
    description: released ? 'DSH Buildr Harness' : 'Buildr Harness Dev',
    repository: { type: 'git', url: 'git+https://github.com/BuildrAI/Buildr.git', directory: 'projects/product/services/buildr-harness-dsh-plugin' },
    ...(released ? { buildrCompatibility: { schemaVersion: 'buildr.package-compatibility/v1', provides: [], requires: [{ packageName: '@buildr-ai/buildr-harness', feature: 'desktop-entry', required: true, versions: { minInclusive: '0.1.0-rc.1', maxExclusive: '0.2.0-0', includePrerelease: true }, contracts: ['buildr.harness-desktop-web/v1'] }] } } : {}),
    main: './lib/index.js', exports: { '.': './lib/index.js', './client': './lib/client.js', './package.json': './package.json' },
    files: ['lib', 'cordis.patch.yml', 'LICENSE', 'README.md'], engines: { dsh: '>=0.2.0-0 <0.3.0-0' },
    dsh: { manifestVersion: 1, bundle: { patch: './cordis.patch.yml' }, client: { platform: 'web', inject: ['@deepseek-ai/dsh-client-ui-layout', '@deepseek-ai/dsh-client-ui-sidebar', '@deepseek-ai/dsh-api-session-controller', '@deepseek-ai/dsh-api-workspace-controller', '@deepseek-ai/dsh-client-ui-session', '@deepseek-ai/dsh-client-ui-workspace', '@deepseek-ai/dsh-client-ui-sidebar-right', '@deepseek-ai/dsh-client-ui-settings'] } },
  }, null, 2) + '\n');
  for (const file of ['README.md', 'LICENSE']) fs.copyFileSync(path.join(root, file), path.join(stage, file));
  const patch = fs.readFileSync(path.join(root, 'cordis.patch.yml'), 'utf8');
  fs.writeFileSync(path.join(stage, 'cordis.patch.yml'), released ? patch.replaceAll('buildr-harness-dev', 'dsh-buildr-harness').replace('@buildr-ai/buildr-harness-dsh-plugin-dev', name) : patch);
  const packed = spawnSync('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', out], { cwd: stage, encoding: 'utf8', timeout: 120_000 });
  if (packed.error || packed.status !== 0) throw packed.error ?? Error(packed.stderr);
  const [record] = JSON.parse(packed.stdout);
  console.log(JSON.stringify({ path: path.join(out, record.filename), integrity: record.integrity, name: record.name, version: record.version }));
} finally { fs.rmSync(stage, { recursive: true, force: true }); }
