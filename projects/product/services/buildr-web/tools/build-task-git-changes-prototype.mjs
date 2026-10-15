import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { build } from 'vite';

const root = path.resolve(import.meta.dirname, '..');
const [output, viewerOutput] = process.argv.slice(2);
if (!output) throw Error('Usage: node tools/build-task-git-changes-prototype.mjs <task-body.html> [offline-viewer.html]');
const featureAssets = path.resolve(root, '../buildr/resources/workspace/skills/buildr/ui-prototype/assets');
const metadata = JSON.parse(await fs.readFile(path.join(root, 'src/prototypes/task-git-changes/scenes.json'), 'utf8'));
const observedAt = new Date().toISOString();
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const json = value => JSON.stringify(value).replaceAll('<', '\\u003c');

async function buildDocument(entry, { viewer = false, define = {} } = {}) {
  const sources = new Set();
  const result = await build({
    root,
    configFile: false,
    plugins: [{ name: 'prototype-source-observation', transform(_code, id) { if (id.startsWith(root + '/src/') || id.startsWith(featureAssets + '/')) sources.add(id.split('?')[0]); } }],
    build: { write: false, minify: true, assetsInlineLimit: Infinity, lib: { entry: path.join(root, 'src/prototypes/task-git-changes', entry), name: viewer ? 'BuildrTaskChangesReader' : 'BuildrTaskChangesPrototype', formats: ['iife'] }, rollupOptions: { onwarn(warning, warn) { if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') warn(warning); }, output: { inlineDynamicImports: true } } },
    define: { 'process.env.NODE_ENV': '"production"', ...define },
  });
  const chunks = (Array.isArray(result) ? result : [result]).flatMap(item => item.output);
  const script = chunks.filter(item => item.type === 'chunk').map(item => item.code).join('\n');
  const css = chunks.filter(item => item.type === 'asset' && item.fileName.endsWith('.css')).map(item => item.source).join('\n');
  const sourceObservation = {
    observedAt, commit,
    uncommittedSummary: viewer
      ? '独立离线阅读器复用 PrototypeReaderLayout、PrototypeTab、SideReadingPanel、功能说明组件和既有阅读协议；只以 srcDoc 注入本次模拟正文，不调用真实接口。任务内归入的文件仅含正文，不叠加阅读器。'
      : '复用真实工作台壳、导航、任务标题、工作路径与提交记录组件；新增候选 TaskChangedFiles 组件渲染模拟工作区变更。TaskWorkPath 以可选内容标签在“任务收尾”之后并列展示“变更文件”与“提交记录”。任务 HTML 仅保留原型正文及既有 bridge，由宿主提供统一阅读交互。此演示入口仅使用模拟数据；正式实施另经真实客户端读取。',
    sources: await Promise.all([...sources].sort().map(async file => ({ path: path.relative(root, file), sha256: crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex') }))),
  };
  const marker = viewer ? '<!-- buildr:ui-prototype-viewer -->' : '<!-- buildr:ui-prototype -->';
  const title = viewer ? '任务中查看 Git 变更文件 · 原型阅读器' : '任务中查看 Git 变更文件 · 原型';
  const sceneData = viewer ? '' : '<script id="buildr-prototype" type="application/json">' + json(metadata) + '</script>';
  const html = '<!doctype html>\n' + marker + '\n<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + title + '</title>' + sceneData + '<script id="buildr-prototype-source" type="application/json">' + json(sourceObservation) + '</script><style>' + css.replaceAll('</style', '<\\/style') + '</style></head><body><div id="root"></div><script>' + script.replaceAll('</script', '<\\/script') + '</script></body></html>\n';
  if (Buffer.byteLength(html) > 2 * 1024 * 1024) throw Error('Prototype exceeds existing 2 MiB limit');
  return { html, sourceCount: sources.size };
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
