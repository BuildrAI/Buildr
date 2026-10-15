import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { build } from 'vite';

const root = path.resolve(import.meta.dirname, '..');
const workspace = path.resolve(root, '../../../..');
const [bodyOutput, viewerOutput] = process.argv.slice(2);
if (!bodyOutput || !viewerOutput) throw Error('Usage: node tools/build-right-pane-collapse-prototype.mjs <body.html> <viewer.html>');
if (path.resolve(bodyOutput) === path.resolve(viewerOutput)) throw Error('Body and viewer output paths must be different.');
const sourceRoot = path.join(root, 'src/prototypes/right-pane-collapse');
const featureAssets = path.resolve(root, '../buildr/resources/workspace/skills/buildr/ui-prototype/assets');
const metadata = JSON.parse(await fs.readFile(path.join(sourceRoot, 'scenes.json'), 'utf8'));
const observedAt = new Date().toISOString();
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: workspace, encoding: 'utf8' }).trim();
const diffSummary = execFileSync('git', ['diff', '--stat', 'HEAD', '--',
  'projects/product/services/buildr-web/src/prototypes/right-pane-collapse',
  'projects/product/services/buildr-web/tools/build-right-pane-collapse-prototype.mjs',
  'projects/product/services/buildr-web/src/components/WorkspaceStage.tsx',
  'projects/product/services/buildr-web/src/components/workspace-stage.css',
  'projects/product/services/buildr-web/src/components/PaneToggleButton.tsx',
  'projects/product/services/buildr-web/src/components/CollapsedPaneTabs.tsx',
  'projects/product/services/buildr-web/src/components/collapsed-pane-tabs.css',
  'projects/product/services/buildr-web/src/components/usePanePeek.ts',
  'projects/product/services/buildr-web/src/components/ObjectTabStrip.tsx',
  'projects/product/services/buildr-web/src/components/pane-toggle.css',
  'projects/product/services/buildr-web/src/app/AppShellView.tsx',
  'projects/product/services/buildr-web/src/features/task/components/PrototypeTab.tsx',
  'projects/product/services/buildr-web/src/features/task/components/prototype-reader.css',
  'projects/product/services/buildr/resources/workspace/skills/buildr/ui-prototype/SKILL.md',
  'projects/product/services/buildr/resources/workspace/skills/buildr/ui-prototype/references/feature-notes.md',
], { cwd: workspace, encoding: 'utf8' }).trim();
const newFiles = execFileSync('git', ['ls-files', '--others', '--exclude-standard', '--',
  'projects/product/services/buildr-web/src/prototypes/right-pane-collapse',
  'projects/product/services/buildr-web/tools/build-right-pane-collapse-prototype.mjs',
  'projects/product/services/buildr-web/src/components/WorkspaceStage.tsx',
  'projects/product/services/buildr-web/src/components/workspace-stage.css',
  'projects/product/services/buildr-web/src/components/PaneToggleButton.tsx',
  'projects/product/services/buildr-web/src/components/CollapsedPaneTabs.tsx',
  'projects/product/services/buildr-web/src/components/collapsed-pane-tabs.css',
  'projects/product/services/buildr-web/src/components/usePanePeek.ts',
  'projects/product/services/buildr-web/src/components/ObjectTabStrip.tsx',
  'projects/product/services/buildr-web/src/components/pane-toggle.css',
  'projects/product/services/buildr-web/src/app/AppShellView.tsx',
  'projects/product/services/buildr-web/src/features/task/components/PrototypeTab.tsx',
  'projects/product/services/buildr-web/src/features/task/components/prototype-reader.css',
  'projects/product/services/buildr/resources/workspace/skills/buildr/ui-prototype/SKILL.md',
  'projects/product/services/buildr/resources/workspace/skills/buildr/ui-prototype/references/feature-notes.md',
], { cwd: workspace, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
const json = value => JSON.stringify(value).replaceAll('<', '\\u003c');

async function buildDocument(entry, { viewer = false, define = {} } = {}) {
  const sources = new Set([path.join(sourceRoot, 'scenes.json'), import.meta.filename, path.join(featureAssets, '../SKILL.md'), path.join(featureAssets, '../references/feature-notes.md')]);
  const result = await build({
    root,
    configFile: false,
    plugins: [{
      name: 'right-pane-collapse-prototype-source-observation',
      transform(_code, id) {
        const filename = id.split('?')[0];
        if (filename.startsWith(root + '/src/') || filename.startsWith(featureAssets + '/')) sources.add(filename);
      },
    }],
    build: {
      write: false,
      minify: true,
      assetsInlineLimit: Infinity,
      lib: { entry: path.join(sourceRoot, entry), name: viewer ? 'BuildrRightPaneCollapseReader' : 'BuildrRightPaneCollapsePrototype', formats: ['iife'] },
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
      scope: '讨论评审用菜单独立、中右竖向标签及视觉细化候选（第七版）：顶部恢复整栏，单标签用不同图标就地展开，轻量分组、选中提示及浮窗过渡，复用原型阅读器首行切换和默认说明浮窗：共用应用壳、项目页面、阅读布局、文件编辑及统一原型阅读器；数据与延迟保存仅在内存模拟。未修改主线、未接入真实文件或外部系统，尚待用户确认。',
      trackedDiffStat: diffSummary,
      untrackedFiles: newFiles,
      entry: viewer ? '复用 PrototypeReaderLayout、PrototypeTab 及当前功能说明组件，内联压缩后的原型正文。' : '复用正式应用壳、页面组件及主题，只隔离模拟数据、导航和写入副作用。',
    },
    sources: await Promise.all([...sources].sort().map(async file => ({
      path: path.relative(workspace, file),
      sha256: crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex'),
    }))),
  };
  const title = viewer ? 'Buildr 竖向标签与展开层级 · 第七版 · 原型阅读器' : 'Buildr 竖向标签与展开层级 · 第七版 · 交互原型';
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
