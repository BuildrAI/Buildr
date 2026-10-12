import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

const root = path.resolve(import.meta.dirname, '..');
const [output, viewerOutput, dependencyRootArgument] = process.argv.slice(2);
if (!output || !viewerOutput) throw Error('Usage: node tools/build-external-environments-prototype.mjs <body.html> <viewer.html> [matching-dependency-root]');
const dependencyRoot = dependencyRootArgument ? path.resolve(dependencyRootArgument) : root;
for (const file of ['package.json', 'package-lock.json']) {
  const [source, dependency] = await Promise.all([fs.readFile(path.join(root, file)), fs.readFile(path.join(dependencyRoot, file))]);
  if (!source.equals(dependency)) throw Error(`Dependency root has a different ${file}; prepare matching dependencies instead.`);
}
const dependencyRequire = createRequire(path.join(dependencyRoot, 'package.json'));
const { build } = await import(pathToFileURL(dependencyRequire.resolve('vite')).href);
const packageData = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
const aliases = Object.keys(packageData.dependencies).map(name => ({
  find: new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=/|$)'),
  replacement: path.join(dependencyRoot, 'node_modules', name),
}));
const metadata = JSON.parse(await fs.readFile(path.join(root, 'src/prototypes/external-environments/scenes.json'), 'utf8'));
const observedAt = new Date().toISOString();
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const json = value => JSON.stringify(value).replaceAll('<', '\\u003c');
const featureAssets = path.resolve(root, '../buildr/resources/workspace/skills/buildr/ui-prototype/assets');
const lockfileSha256 = crypto.createHash('sha256').update(await fs.readFile(path.join(root, 'package-lock.json'))).digest('hex');
const sourceSummary = '首例交互原型：环境位于工作空间左侧；qa/prod 独立连接、本机身份与固定目标查询页签。复用 AppShellHeader、AppShellFrame、AppNavigationItem、ResizablePanels、PrototypeReaderLayout、PrototypeTab、usePrototypeBridge 和正式主题。所有数据、身份绑定、检查与查询均为离线模拟，不修改正式导航、接口或页面，不写浏览器持久存储。';
async function document(entry, viewer = false, define = {}) {
  const sources = new Set([path.join(root, 'package.json'), path.join(root, 'package-lock.json'), path.join(root, 'tools/build-external-environments-prototype.mjs')]);
  const result = await build({
    root, configFile: false, resolve: { alias: aliases },
    plugins: [{ name: 'offline-external-environments-prototype', transform(_code, id) { if (id.startsWith(root + '/src/') || id.startsWith(featureAssets + '/')) sources.add(id.split('?')[0]); } }],
    build: { write: false, minify: true, assetsInlineLimit: Infinity, lib: { entry: path.join(root, 'src/prototypes/external-environments', entry), name: viewer ? 'BuildrEnvironmentsReader' : 'BuildrEnvironmentsPrototype', formats: ['iife'] }, rollupOptions: { onwarn(warning, warn) { if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') warn(warning); }, output: { inlineDynamicImports: true } } },
    define: { 'process.env.NODE_ENV': '"production"', ...define },
  });
  const chunks = (Array.isArray(result) ? result : [result]).flatMap(item => item.output);
  const script = chunks.filter(item => item.type === 'chunk').map(item => item.code).join('\n');
  const css = chunks.filter(item => item.type === 'asset' && item.fileName.endsWith('.css')).map(item => item.source).join('\n');
  const observation = { observedAt, commit, uncommittedSummary: sourceSummary, dependencySource: dependencyRoot === root ? 'current-checkout-installation' : 'explicit-matching-lockfile-installation', lockfileSha256, sources: await Promise.all([...sources].sort().map(async source => ({ path: path.relative(root, source), sha256: crypto.createHash('sha256').update(await fs.readFile(source)).digest('hex') }))) };
  const policy = "default-src 'none'; base-uri 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; frame-src 'self' about: blob:;";
  const html = '<!doctype html>\n' + (viewer ? '<!-- buildr:ui-prototype-viewer -->' : '<!-- buildr:ui-prototype -->') + '\n<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="' + policy + '"><title>环境与 MySQL 查询 · ' + (viewer ? '原型阅读器' : '交互原型') + '</title>' + (viewer ? '' : '<script id="buildr-prototype" type="application/json">' + json(metadata) + '</script>') + '<script id="buildr-prototype-source" type="application/json">' + json(observation) + '</script><style>' + css.replaceAll('</style', '<\\/style') + '</style></head><body><div id="root"></div><script>' + script.replaceAll('</script', '<\\/script') + '</script></body></html>\n';
  if (Buffer.byteLength(html) > 2 * 1024 * 1024) throw Error('Prototype exceeds 2 MiB: ' + Buffer.byteLength(html));
  return html.replace(/[\t ]+$/gm, '');
}
async function save(target, html) {
  await fs.mkdir(path.dirname(path.resolve(target)), { recursive: true });
  await fs.writeFile(target + '.pending', html); await fs.rename(target + '.pending', target);
  console.log(JSON.stringify({ output: path.resolve(target), bytes: Buffer.byteLength(html), pages: metadata.pages.length, commit, lockfileSha256 }));
}
const body = await document('main.tsx');
await save(output, body);
await save(viewerOutput, await document('viewer.tsx', true, { __PROTOTYPE_DOCUMENT_GZIP__: JSON.stringify(gzipSync(body).toString('base64')), __PROTOTYPE_DOCUMENT_BYTES__: String(Buffer.byteLength(body)), __PROTOTYPE_OBSERVED_AT__: JSON.stringify(observedAt) }));
