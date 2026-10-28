import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { build } from 'vite';

const root = path.resolve(import.meta.dirname, '..');
const [output, viewerOutput] = process.argv.slice(2);
if (!output) throw Error('Usage: node tools/build-conversation-live-flow-prototype.mjs <task-body.html> [offline-viewer.html]');
const featureAssets = path.resolve(root, '../buildr/resources/workspace/skills/buildr/ui-prototype/assets');
const metadata = JSON.parse(await fs.readFile(path.join(root, 'src/prototypes/conversation-live-flow/scenes.json'), 'utf8'));
const observedAt = new Date().toISOString();
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const json = value => JSON.stringify(value).replaceAll('<', '\\u003c');

async function buildDocument(entry, { viewer = false, define = {} } = {}) {
  const sources = new Set();
  const result = await build({
    root,
    configFile: false,
    plugins: [{ name: 'prototype-navigation-data', resolveId(source, importer) { if (source === './AppNavigation' && importer?.endsWith('/app/AppPrimaryNavigation.tsx')) return path.join(root, 'src/prototypes/conversation-handoff/MockNavigation.tsx'); if(source.endsWith('/optional-preferences'))return path.join(root,'src/prototypes/conversation-live-flow/memory-preferences.ts'); } }, { name: 'prototype-source-observation', transform(_code, id) { if (id.startsWith(root + '/src/') || id.startsWith(featureAssets + '/')) sources.add(id.split('?')[0]); } }],
    build: { write: false, minify: true, assetsInlineLimit: Infinity, lib: { entry: path.join(root, 'src/prototypes/conversation-live-flow', entry), name: viewer ? 'BuildrLiveFlowReader' : 'BuildrLiveFlowPrototype', formats: ['iife'] }, rollupOptions: { onwarn(warning, warn) { if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') warn(warning); }, output: { inlineDynamicImports: true } } },
    define: { 'process.env.NODE_ENV': '"production"', ...define },
  });
  const chunks = (Array.isArray(result) ? result : [result]).flatMap(item => item.output);
  const script = chunks.filter(item => item.type === 'chunk').map(item => item.code).join('\n');
  const css = chunks.filter(item => item.type === 'asset' && item.fileName.endsWith('.css')).map(item => item.source).join('\n');
  const sourceObservation = {
    observedAt, commit,
    uncommittedSummary: viewer ? '复用正式 PrototypeReaderLayout、PrototypeTab 及功能说明组件；离线模拟，不请求后端。' : '复用正式页面壳、主导航、对话历史、消息图片、输入组件、过程组件、模型选择器和主题；用户输入吸顶、智能体模型身份、呼吸计时和过程平铺与正式入口共用源码；原型全部动作注入内存实现，不发出真实业务请求。',
    sources: await Promise.all([...sources].sort().map(async file => ({ path: path.relative(root, file), sha256: crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex') }))),
  };
  const marker = viewer ? '<!-- buildr:ui-prototype-viewer -->' : '<!-- buildr:ui-prototype -->';
  const title = viewer ? '自然继续的对话 · 原型阅读器' : '自然继续的对话 · 原型';
  const sceneData = viewer ? '' : '<script id="buildr-prototype" type="application/json">' + json(metadata) + '</script>';
  const html = '<!doctype html>\n' + marker + '\n<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + title + '</title>' + sceneData + '<script id="buildr-prototype-source" type="application/json">' + json(sourceObservation) + '</script><style>' + css.replaceAll('</style', '<\\/style') + '</style></head><body><div id="root"></div><script>' + script.replaceAll('</script', '<\\/script') + '</script></body></html>\n';
  if (Buffer.byteLength(html) > 2 * 1024 * 1024) throw Error('Prototype exceeds existing 2 MiB limit');
  return { html:html.replace(/[ \t]+(?=\r?\n)/g,''), sourceCount: sources.size };
}

async function writeDocument(file, result, kind) {
  await fs.mkdir(path.dirname(path.resolve(file)), { recursive: true });
  await fs.writeFile(file, result.html);
  console.log(JSON.stringify({ output: path.resolve(file), kind, bytes: Buffer.byteLength(result.html), sourceCount: result.sourceCount, pages: metadata.pages.length, commit }));
}

const body = await buildDocument('main.tsx');
await writeDocument(output, body, 'prototype-body');
if (viewerOutput) {
  const viewer = await buildDocument('viewer.tsx', { viewer: true, define: { __PROTOTYPE_DOCUMENT__: JSON.stringify(body.html), __PROTOTYPE_OBSERVED_AT__: JSON.stringify(observedAt) } });
  await writeDocument(viewerOutput, viewer, 'offline-reader');
}
