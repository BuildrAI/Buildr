import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { build } from 'vite';

const root = path.resolve(import.meta.dirname, '..');
const workspace = path.resolve(root, '../../../..');
const output = process.argv[2];
if (!output) throw Error('Usage: node tools/build-article-inline-edit-prototype.mjs <output.html>');
const sourceRoot = path.join(root, 'src/prototypes/article-inline-edit');
const featureAssets = path.resolve(root, '../buildr/resources/workspace/skills/buildr/ui-prototype/assets');
const metadata = JSON.parse(await fs.readFile(path.join(sourceRoot, 'scenes.json'), 'utf8'));
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: workspace, encoding: 'utf8' }).trim();
const diffSummary = execFileSync('git', ['diff', '--stat', 'HEAD', '--',
  'projects/product/services/buildr-web/src/prototypes/article-inline-edit',
  'projects/product/services/buildr-web/tools/build-article-inline-edit-prototype.mjs',
  'projects/product/services/buildr-web/src/features/publication/publication.css',
  'projects/product/services/buildr-web/src/features/publication/pages/ArticleDetailPage.tsx',
  'projects/product/services/buildr-web/src/features/publication/components/ArticleEditorDrawer.tsx',
], { cwd: workspace, encoding: 'utf8' }).trim();
const newFiles = execFileSync('git', ['ls-files', '--others', '--exclude-standard', '--',
  'projects/product/services/buildr-web/src/prototypes/article-inline-edit',
  'projects/product/services/buildr-web/tools/build-article-inline-edit-prototype.mjs',
], { cwd: workspace, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
const json = value => JSON.stringify(value).replaceAll('<', '\\u003c');
const sources = new Set([path.join(sourceRoot, 'scenes.json'), import.meta.filename]);
const result = await build({
  root,
  configFile: false,
  plugins: [{ name: 'article-inline-edit-source-observation', transform(_code, id) { const f = id.split('?')[0]; if (f.startsWith(root + '/src/') || f.startsWith(featureAssets + '/')) sources.add(f); } }],
  build: { write: false, minify: true, assetsInlineLimit: Infinity, lib: { entry: path.join(sourceRoot, 'main.tsx'), name: 'BuildrArticleInlineEdit', formats: ['iife'] }, rollupOptions: { onwarn(w, warn) { if (w.code !== 'MODULE_LEVEL_DIRECTIVE') warn(w); }, output: { inlineDynamicImports: true } } },
  define: { 'process.env.NODE_ENV': '"production"' },
});
const chunks = (Array.isArray(result) ? result : [result]).flatMap(r => r.output);
const unexpected = chunks.filter(item => item.type === 'asset' && !item.fileName.endsWith('.css'));
if (unexpected.length) throw Error('Prototype must be self-contained; unexpected assets: ' + unexpected.map(i => i.fileName).join(', '));
const script = chunks.filter(item => item.type === 'chunk').map(item => item.code).join('\n');
const css = chunks.filter(item => item.type === 'asset' && item.fileName.endsWith('.css')).map(item => item.source).join('\n');
const observation = {
  observedAt: new Date().toISOString(),
  commit,
  lifecycle: 'active',
  uncommittedSummary: { scope: '文章页就地编辑候选：分段控件新增「编辑」，标题/摘要/正文在页面主区内编辑，元信息压成头部一行，资源与智能体写作方法移入右侧常驻栏；数据与保存仅在内存模拟，未接入真实文章接口。', trackedDiffStat: diffSummary, untrackedFiles: newFiles, entry: '复用应用壳、文章样式与统一原型阅读器；发布记录、目录与工具栏按演示数据渲染。' },
  sources: await Promise.all([...sources].sort().map(async file => ({ path: path.relative(root, file), sha256: crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex') }))),
};
const html = '<!doctype html>\n<!-- buildr:ui-prototype -->\n<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>文章页就地编辑 · 交互原型</title><script id="buildr-prototype" type="application/json">' + json(metadata) + '</script><script id="buildr-prototype-source" type="application/json">' + json(observation) + '</script><style>' + css.replaceAll('</style', '<\\/style') + '</style></head><body><div id="root"></div><script>' + script.replaceAll('</script', '<\\/script') + '</script></body></html>\n';
if (Buffer.byteLength(html) > 2 * 1024 * 1024) throw Error('Prototype exceeds existing 2 MiB limit: ' + Buffer.byteLength(html));
await fs.mkdir(path.dirname(path.resolve(output)), { recursive: true });
await fs.writeFile(output, html);
console.log(JSON.stringify({ output: path.resolve(output), bytes: Buffer.byteLength(html), sourceCount: sources.size, pages: metadata.pages.length, commit }));
