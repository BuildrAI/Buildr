import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { build } from 'vite';
import { gzipSync } from 'node:zlib';

const root = path.resolve(import.meta.dirname, '..');
const workspace = path.resolve(root, '../../../..');
const [output, viewerOutput] = process.argv.slice(2);
if (!output || !viewerOutput) throw Error('Usage: node tools/build-repository-explorer-prototype.mjs <body.html> <viewer.html>');
const featureAssets = path.resolve(root, '../buildr/resources/workspace/skills/buildr/ui-prototype/assets');
const metadata = JSON.parse(await fs.readFile(path.join(root, 'src/prototypes/repository-explorer/scenes.json'), 'utf8'));
const observedAt = new Date().toISOString();
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const selected = [
  'AGENTS.md', 'README.md', 'README.en.md',
  'projects/product/AGENTS.md', 'projects/product/services/manifest.yml',
  'projects/product/knowledge/docs/overview.md',
  'projects/product/knowledge/docs/architecture/task-system.md',
  'projects/product/services/buildr/package.json',
  'projects/product/services/buildr-web/package.json',
  'projects/product/services/buildr-web/src/App.tsx',
  'projects/product/services/buildr-web/src/theme.ts',
  'projects/product/services/buildr-web/src/features/task/components/TaskDiffReader.tsx',
  'projects/product/services/buildr-web/src/features/task/components/TaskChangesPane.tsx',
  'projects/product/services/buildr-web/src/features/task/components/TaskWorkPath.tsx',
  'projects/product/services/buildr-web/src/features/task/pages/TaskDetailPage.tsx',
  'projects/product/services/buildr-web/src/features/workspace/components/RepositoryFileBrowser.tsx',
  'projects/product/services/buildr-web/src/features/workspace/components/repository-file-browser.css',
  'projects/product/services/buildr-web/src/features/knowledge/components/KnowledgeSource.tsx',
  'projects/product/services/dsh-plugin/package.json',
  'docs/images/workspace-overview.png',
];
const changed = new Set([
  'projects/product/services/buildr-web/src/features/task/components/TaskDiffReader.tsx',
  'projects/product/services/buildr-web/src/features/task/pages/TaskDetailPage.tsx',
  'projects/product/services/buildr-web/src/features/workspace/components/RepositoryFileBrowser.tsx',
]);
const files = await Promise.all(selected.map(async file => {
  const bytes = await fs.readFile(path.join(workspace, file));
  let previousContent;
  try { previousContent = execFileSync('git', ['show', commit + ':' + file], { cwd: workspace, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { /* new candidate file */ }
  return {
    path: file, content: file.endsWith('.png') ? '' : bytes.toString('utf8'),
    kind: file.endsWith('.png') ? 'image' : file.endsWith('.md') ? 'markdown' : 'text',
    ...(file.endsWith('.png') ? { image: 'data:image/png;base64,' + bytes.toString('base64') } : {}),
    ...(changed.has(file) ? { status: file.includes('RepositoryFileBrowser') ? 'U' : 'M' } : {}),
    previousContent,
  };
}));
files.push(
  { path: 'projects/product/services/buildr-web/node_modules/antd/package.json', kind: 'text', ignored: true, content: '{\n  "name": "antd",\n  "version": "5.29.3"\n}\n' },
  { path: 'projects/product/services/buildr/web-dist/index.html', kind: 'text', ignored: true, content: '<!doctype html>\n<html lang="zh-CN"><head><title>Buildr Web</title></head><body><div id="root"></div></body></html>\n' },
);
const json = value => JSON.stringify(value).replaceAll('<', '\\u003c');
async function buildDocument(entry, { viewer = false, define = {} } = {}) {
  const sources = new Set();
  const result = await build({
    root, configFile: false,
    plugins: [{ name: 'prototype-source-observation', transform(_code, id) { if (id.startsWith(root + '/src/') || id.startsWith(featureAssets + '/')) sources.add(id.split('?')[0]); } }],
    build: {
      write: false, minify: true, assetsInlineLimit: Infinity,
      lib: { entry: path.join(root, 'src/prototypes/repository-explorer', entry), name: viewer ? 'BuildrRepositoryExplorerReader' : 'BuildrRepositoryExplorerPrototype', formats: ['iife'] },
      rollupOptions: { onwarn(warning, warn) { if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') warn(warning); }, output: { inlineDynamicImports: true } },
    },
    define: { 'process.env.NODE_ENV': '"production"', __SOURCE_FILES__: JSON.stringify(files), ...define },
  });
  const chunks = (Array.isArray(result) ? result : [result]).flatMap(item => item.output);
  const script = chunks.filter(item => item.type === 'chunk').map(item => item.code).join('\n');
  const css = chunks.filter(item => item.type === 'asset' && item.fileName.endsWith('.css')).map(item => item.source).join('\n');
  const sourceObservation = {
    observedAt, commit,
    uncommittedSummary: viewer
      ? '独立原型阅读器复用 PrototypeReaderLayout、PrototypeTab、SideReadingPanel 与功能说明组件；以自包含正文提供五个关键页面，不调用真实接口。'
      : '在独立工作树中新增候选 RepositoryFileBrowser，复用 AppShellHeader、AppShellFrame、PageTabStrip、AssetHomeView、TaskOverview、TaskWorkPath、TaskDiffReader、MarkdownHost 与正式主题。候选 AppShellHeader 增加可选代码区域入口，TaskDiffReader 增加可选完整文件定位；代码区域内使用窄栏目录和文件标签，任务往返保留原审阅。文件、任务、工作目录和提交均为离线演示数据，未接入正式产品入口。',
    sources: await Promise.all([...sources].sort().map(async file => ({ path: path.relative(root, file), sha256: crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex') }))),
    sampleFilePaths: selected,
  };
  const marker = viewer ? '<!-- buildr:ui-prototype-viewer -->' : '<!-- buildr:ui-prototype -->';
  const title = viewer ? 'Buildr 代码板块 · 原型阅读器' : 'Buildr 代码板块与资源管理器 · 原型';
  const sceneData = viewer ? '' : '<script id="buildr-prototype" type="application/json">' + json(metadata) + '</script>';
  const html = '<!doctype html>\n' + marker + '\n<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + title + '</title>' + sceneData + '<script id="buildr-prototype-source" type="application/json">' + json(sourceObservation) + '</script><style>' + css.replaceAll('</style', '<\\/style') + '</style></head><body><div id="root"></div><script>' + script.replaceAll('</script', '<\\/script') + '</script></body></html>\n';
  if (Buffer.byteLength(html) > 2 * 1024 * 1024) throw Error('Prototype exceeds existing 2 MiB limit: ' + Buffer.byteLength(html));
  return { html, sourceCount: sources.size };
}
async function save(file, document, kind) {
  await fs.mkdir(path.dirname(path.resolve(file)), { recursive: true });
  const target = path.resolve(file);
  const pending = target + '.pending';
  await fs.writeFile(pending, document.html);
  await fs.rename(pending, target);
  console.log(JSON.stringify({ output: path.resolve(file), kind, bytes: Buffer.byteLength(document.html), sourceCount: document.sourceCount, pages: metadata.pages.length, commit }));
}
const body = await buildDocument('main.tsx');
await save(output, body, 'prototype-body');
const viewer = await buildDocument('viewer.tsx', { viewer: true, define: { __PROTOTYPE_DOCUMENT_GZIP__: JSON.stringify(gzipSync(body.html).toString('base64')), __PROTOTYPE_DOCUMENT_BYTES__: String(Buffer.byteLength(body.html)), __PROTOTYPE_OBSERVED_AT__: JSON.stringify(observedAt) } });
await save(viewerOutput, viewer, 'offline-reader');
