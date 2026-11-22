import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const buildRoot = path.join(root, 'build');
const require = createRequire(path.join(root, '../buildr/package.json'));
const { build } = require('esbuild') as { build: (options: object) => Promise<unknown> };
const { version } = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const name = '@buildr-ai/buildr-harness-dsh-plugin-dev';
const out = path.resolve(process.argv[2] ?? buildRoot);
fs.mkdirSync(out, { recursive: true });
fs.mkdirSync(buildRoot, { recursive: true });
const stage = fs.mkdtempSync(path.join(buildRoot, 'pack-'));
try {
  const common = { bundle: true, format: 'esm', target: 'es2024', outdir: path.join(stage, 'lib'), absWorkingDir: root, logLevel: 'warning' };
  await build({ ...common, entryPoints: ['src/index.ts', 'src/launcher.ts'], platform: 'node' });
  await build({ ...common, entryPoints: ['src/client.tsx'], platform: 'browser', format: 'cjs', jsx: 'automatic', external: ['react', 'react/jsx-runtime'],
    banner: { js: `window.__ModuleLoader__.load({id:${JSON.stringify(name)},factory:(require)=>{var module={exports:{}};var exports=module.exports;` },
    footer: { js: 'return module.exports;}});' },
  });
  fs.writeFileSync(path.join(stage, 'package.json'), JSON.stringify({
    name, version, license: 'MIT', private: true, type: 'module',
    description: 'Buildr Harness Web for DeepSeek Harness Desktop (local development).',
    main: './lib/index.js', exports: { '.': './lib/index.js', './client': './lib/client.js', './package.json': './package.json' },
    files: ['lib', 'cordis.patch.yml', 'LICENSE', 'README.md'], engines: { dsh: '0.2.2-rc.5' },
    dsh: { manifestVersion: 1, bundle: { patch: './cordis.patch.yml' }, client: { platform: 'web', inject: ['@deepseek-ai/dsh-client-ui-layout', '@deepseek-ai/dsh-client-ui-sidebar'] } },
  }, null, 2) + '\n');
  for (const file of ['cordis.patch.yml', 'README.md', 'LICENSE']) fs.copyFileSync(path.join(root, file), path.join(stage, file));
  const packed = spawnSync('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', out], { cwd: stage, encoding: 'utf8', timeout: 120_000 });
  if (packed.error || packed.status !== 0) throw packed.error ?? Error(packed.stderr);
  const [record] = JSON.parse(packed.stdout);
  console.log(JSON.stringify({ path: path.join(out, record.filename), integrity: record.integrity, name: record.name, version: record.version }));
} finally { fs.rmSync(stage, { recursive: true, force: true }); }
