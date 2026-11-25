import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pluginIconSvg, pluginLocales, pluginPackageName } from '../src/metadata.ts';

const root = path.resolve(import.meta.dirname, '..');
const buildRoot = path.join(root, 'build');
const require = createRequire(path.join(root, '../buildr/package.json'));
const { build } = require('esbuild') as { build: (options: object) => Promise<unknown> };

const released = process.argv.includes('--release');
const { version: devVersion } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as { version: string };
const name = pluginPackageName(released);
const version = released ? process.argv[3] : devVersion;
if (!version || !/^\d+\.\d+\.\d+(?:-rc\.[1-9]\d*)?$/.test(version) || (released && !process.argv[4])) {
  throw Error('Usage: build-dev.ts [<output> | --release <version> <output>]');
}
const out = path.resolve((released ? process.argv[4] : process.argv[2]) ?? buildRoot);
const define = { __BUILDR_DEVELOPMENT_DSH_RELEASED__: JSON.stringify(released) };

fs.mkdirSync(buildRoot, { recursive: true });
fs.mkdirSync(out, { recursive: true });
const stage = fs.mkdtempSync(path.join(buildRoot, 'pack-'));
try {
  const common = { define, bundle: true, format: 'esm', target: 'es2024', outdir: path.join(stage, 'lib'), absWorkingDir: root, logLevel: 'warning' };
  await build({ ...common, entryPoints: ['src/index.ts', 'src/launcher.ts'], platform: 'node' });
  await build({
    ...common,
    entryPoints: ['src/client.tsx'],
    platform: 'browser',
    format: 'cjs',
    jsx: 'automatic',
    external: ['react', 'react/jsx-runtime'],
    banner: { js: `window.__ModuleLoader__.load({id:${JSON.stringify(name)},factory:(require)=>{var module={exports:{}};var exports=module.exports;` },
    footer: { js: 'return module.exports;}});' },
  });
  const locales = pluginLocales(released);
  fs.mkdirSync(path.join(stage, 'locale'), { recursive: true });
  fs.writeFileSync(path.join(stage, 'locale', 'en.json'), JSON.stringify(locales.en, null, 2) + '\n');
  fs.writeFileSync(path.join(stage, 'locale', 'zh.json'), JSON.stringify(locales.zh, null, 2) + '\n');
  fs.writeFileSync(path.join(stage, 'icon.svg'), pluginIconSvg);
  fs.writeFileSync(path.join(stage, 'package.json'), JSON.stringify({
    name,
    version,
    license: 'MIT',
    ...(released ? { publishConfig: { access: 'public' } } : { private: true }),
    type: 'module',
    description: released ? 'DSH Buildr' : 'Buildr Dev',
    icon: './icon.svg',
    repository: {
      type: 'git',
      url: 'git+https://github.com/BuildrAI/Buildr.git',
      directory: 'projects/product/services/buildr-development-dsh-plugin',
    },
    ...(released ? {
      buildrCompatibility: {
        schemaVersion: 'buildr.package-compatibility/v1',
        provides: [],
        requires: [{
          packageName: '@buildr-ai/buildr',
          feature: 'desktop-entry',
          required: true,
          versions: { minInclusive: '0.1.0-rc.67', maxExclusive: '0.2.0-0', includePrerelease: true },
          contracts: ['buildr.web-protocol/v1'],
        }],
      },
    } : {}),
    main: './lib/index.js',
    exports: {
      '.': './lib/index.js',
      './client': './lib/client.js',
      './icon': './icon.svg',
      './locale/*.json': './locale/*.json',
      './package.json': './package.json',
    },
    files: ['lib', 'locale', 'icon.svg', 'cordis.patch.yml', 'LICENSE', 'README.md'],
    engines: { dsh: '>=0.2.0-0 <0.3.0-0' },
    dsh: {
      manifestVersion: 1,
      bundle: { patch: './cordis.patch.yml' },
      client: {
        platform: 'web',
        inject: [
          '@deepseek-ai/dsh-client-ui-layout',
          '@deepseek-ai/dsh-client-ui-sidebar',
          '@deepseek-ai/dsh-api-session-controller',
          '@deepseek-ai/dsh-api-workspace-controller',
          '@deepseek-ai/dsh-client-ui-session',
          '@deepseek-ai/dsh-client-ui-workspace',
          '@deepseek-ai/dsh-client-ui-sidebar-right',
          '@deepseek-ai/dsh-client-ui-settings',
        ],
      },
    },
  }, null, 2) + '\n');
  for (const file of ['README.md', 'LICENSE']) fs.copyFileSync(path.join(root, file), path.join(stage, file));
  const patch = fs.readFileSync(path.join(root, 'cordis.patch.yml'), 'utf8');
  fs.writeFileSync(path.join(stage, 'cordis.patch.yml'), released
    ? patch.replace('@buildr-ai/dsh-buildr-dev', name).replace('id: buildr-dev', 'id: dsh-buildr')
    : patch);
  const packed = spawnSync('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', out], { cwd: stage, encoding: 'utf8', timeout: 120_000 });
  if (packed.error || packed.status !== 0) throw packed.error ?? Error(packed.stderr);
  const [record] = JSON.parse(packed.stdout) as [{ filename: string; integrity: string; name: string; version: string }];
  console.log(JSON.stringify({ path: path.join(out, record.filename), integrity: record.integrity, name: record.name, version: record.version }));
} finally {
  fs.rmSync(stage, { recursive: true, force: true });
}
