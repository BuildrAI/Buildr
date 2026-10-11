import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { build } from 'vite';

const root = path.resolve(import.meta.dirname, '..');
const workspace = path.resolve(root, '../../../..');
const [bodyOutput, viewerOutput] = process.argv.slice(2);
if (!bodyOutput || !viewerOutput) throw Error('Usage: node tools/build-file-editing-prototype.mjs <body.html> <viewer.html>');
if (path.resolve(bodyOutput) === path.resolve(viewerOutput)) throw Error('Body and viewer output paths must be different.');
const sourceRoot = path.join(root, 'src/prototypes/file-editing');
const featureAssets = path.resolve(root, '../buildr/resources/workspace/skills/buildr/ui-prototype/assets');
const metadata = JSON.parse(await fs.readFile(path.join(sourceRoot, 'scenes.json'), 'utf8'));
const observedAt = new Date().toISOString();
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: workspace, encoding: 'utf8' }).trim();
const diffSummary = execFileSync('git', ['diff', '--stat', 'HEAD', '--',
  'projects/product/services/buildr-web/src/prototypes/file-editing',
  'projects/product/services/buildr-web/tools/build-file-editing-prototype.mjs',
], { cwd: workspace, encoding: 'utf8' }).trim();
const newFiles = execFileSync('git', ['ls-files', '--others', '--exclude-standard', '--',
  'projects/product/services/buildr-web/src/prototypes/file-editing',
  'projects/product/services/buildr-web/tools/build-file-editing-prototype.mjs',
], { cwd: workspace, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
const json = value => JSON.stringify(value).replaceAll('<', '\\u003c');

async function buildDocument(entry, { viewer = false, define = {} } = {}) {
  const sources = new Set([path.join(sourceRoot, 'scenes.json'), import.meta.filename]);
  const result = await build({
    root,
    configFile: false,
    plugins: [{
      name: 'file-editing-prototype-source-observation',
      transform(_code, id) {
        const filename = id.split('?')[0];
        if (filename.startsWith(root + '/src/') || filename.startsWith(featureAssets + '/')) sources.add(filename);
      },
    }],
    build: {
      write: false,
      minify: true,
      assetsInlineLimit: Infinity,
      lib: { entry: path.join(sourceRoot, entry), name: viewer ? 'BuildrFileEditingReader' : 'BuildrFileEditingPrototype', formats: ['iife'] },
      rollupOptions: {
        onwarn(warning, warn) { if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') warn(warning); },
        output: { inlineDynamicImports: true },
      },
    },
    define: { 'process.env.NODE_ENV': '"production"', ...define },
  });
  const chunks = (Array.isArray(result) ? result : [result]).flatMap(item => item.output);
  const unexpected = chunks.filter(item => item.type === 'asset' && !item.fileName.endsWith('.css'));
  if (unexpected.length) throw Error('Prototype must be self-contained; unexpected assets: ' + unexpected.map(item => item.fileName).join(', '));
  const script = chunks.filter(item => item.type === 'chunk').map(item => item.code).join('\n');
  const css = chunks.filter(item => item.type === 'asset' && item.fileName.endsWith('.css')).map(item => item.source).join('\n');
  const observation = {
    observedAt,
    commit,
    lifecycle: 'active',
    uncommittedSummary: {
      scope: '按已确认原型实现文件编辑；两个入口共用正式 CodeMirror 编辑组件与会话行为。此原型仅通过内存适配模拟读取、保存、外部变化、失败和历史来源，没有真实文件写入；正式能力由 add-file-editing 变更维护。',
      trackedDiffStat: diffSummary,
      untrackedFiles: newFiles,
      entry: viewer ? '复用 PrototypeReaderLayout、PrototypeTab 及当前功能说明组件，内联压缩后的原型正文。' : '复用正式应用壳、页面组件及主题，只隔离模拟数据、导航和写入副作用。',
    },
    sources: await Promise.all([...sources].sort().map(async file => ({
      path: path.relative(workspace, file),
      sha256: crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex'),
    }))),
  };
  const title = viewer ? 'Buildr 文件编辑 · 原型阅读器' : 'Buildr 文件编辑 · 交互原型';
  const sceneData = viewer ? '' : '<script id="buildr-prototype" type="application/json">' + json(metadata) + '</script>';
  const extraMarker = viewer ? '\n<!-- buildr:ui-prototype-viewer -->' : '';
  const html = '<!doctype html>\n<!-- buildr:ui-prototype -->' + extraMarker + '\n<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + title + '</title>' + sceneData + '<script id="buildr-prototype-source" type="application/json">' + json(observation) + '</script><style>' + css.replaceAll('</style', '<\\/style') + '</style></head><body><div id="root"></div><script>' + script.replaceAll('</script', '<\\/script') + '</script></body></html>\n';
  if (Buffer.byteLength(html) > 2 * 1024 * 1024) throw Error('Prototype exceeds existing 2 MiB limit: ' + Buffer.byteLength(html));
  return { html, sourceCount: sources.size };
}

async function save(file, document, kind) {
  const target = path.resolve(file);
  await fs.mkdir(path.dirname(target), { recursive: true });
  const pending = target + '.pending';
  await fs.writeFile(pending, document.html);
  await fs.rename(pending, target);
  console.log(JSON.stringify({ output: target, kind, bytes: Buffer.byteLength(document.html), sourceCount: document.sourceCount, pages: metadata.pages.length, commit }));
}

const body = await buildDocument('main.tsx');
await save(bodyOutput, body, 'prototype-body');
const viewer = await buildDocument('viewer.tsx', { viewer: true, define: {
  __PROTOTYPE_DOCUMENT_GZIP__: JSON.stringify(gzipSync(body.html).toString('base64')),
  __PROTOTYPE_DOCUMENT_BYTES__: String(Buffer.byteLength(body.html)),
  __PROTOTYPE_OBSERVED_AT__: JSON.stringify(observedAt),
} });
await save(viewerOutput, viewer, 'offline-reader');
