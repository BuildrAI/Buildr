import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { build } from 'vite';

const root = path.resolve(import.meta.dirname, '..');
const [output, viewerOutput] = process.argv.slice(2);
if (!output || !viewerOutput) throw Error('Usage: node tools/build-source-control-prototype.mjs <body.html> <viewer.html>');
const metadata = JSON.parse(await fs.readFile(path.join(root, 'src/prototypes/source-control/scenes.json'), 'utf8'));
const observedAt = new Date().toISOString();
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const json = value => JSON.stringify(value).replaceAll('<', '\\u003c');
const featureAssets = path.resolve(root, '../buildr/resources/workspace/skills/buildr/ui-prototype/assets');
async function document(entry, viewer = false, define = {}) {
  const sources = new Set();
  const result = await build({
    root, configFile: false,
    plugins: [{
      name: 'offline-source-control-prototype', enforce: 'pre',
      resolveId(source, importer) {
        if (importer?.endsWith('/features/workbench/components/WorkbenchTaskRow.tsx') && source === '../hooks/useWorkbenchPreferences')
          return path.join(root, 'src/prototypes/source-control/mock-preferences.ts');
      },
      transform(_code, id) { if (id.startsWith(root + '/src/') || id.startsWith(featureAssets + '/')) sources.add(id.split('?')[0]); },
    }],
    build: { write: false, minify: true, assetsInlineLimit: Infinity,
      lib: { entry: path.join(root, 'src/prototypes/source-control', entry), name: viewer ? 'BuildrSourceControlReader' : 'BuildrSourceControlPrototype', formats: ['iife'] },
      rollupOptions: { onwarn(warning, warn) { if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') warn(warning); }, output: { inlineDynamicImports: true } },
    }, define: { 'process.env.NODE_ENV': '"production"', ...define },
  });
  const chunks = (Array.isArray(result) ? result : [result]).flatMap(item => item.output);
  const script = chunks.filter(item => item.type === 'chunk').map(item => item.code).join('\n');
  const css = chunks.filter(item => item.type === 'asset' && item.fileName.endsWith('.css')).map(item => item.source).join('\n');
  const observation = { observedAt, commit,
    uncommittedSummary: '独立工作树候选第三版：恢复任务内原有改动与提交列表、提交详情、差异及完整文件返回，源代码管理补充查看；上下与左右分屏共用 ResizablePanels/SplitDivider，完整提交信息与文件来源共用 SelectableHoverCard；移除固定提交信息区域、目录切换及任务正文重复按钮，工作概览复用组合任务徽标。复用 AppShellHeader、AppShellFrame、ObjectTabStrip、TaskOverview、TaskWorkPath、WorkbenchTaskRow、TaskDiffReader、RepositoryFileBrowser、PrototypeReaderLayout、PrototypeTab、功能说明与正式主题；不接真实接口和 Git 写入。',
    sources: await Promise.all([...sources].sort().map(async source => ({ path: path.relative(root, source), sha256: crypto.createHash('sha256').update(await fs.readFile(source)).digest('hex') }))),
  };
  const html = '<!doctype html>\n' + (viewer ? '<!-- buildr:ui-prototype-viewer -->' : '<!-- buildr:ui-prototype -->') + '\n<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Buildr 源代码管理 · ' + (viewer ? '原型阅读器' : '原型') + '</title>'
    + (viewer ? '' : '<script id="buildr-prototype" type="application/json">' + json(metadata) + '</script>')
    + '<script id="buildr-prototype-source" type="application/json">' + json(observation) + '</script><style>' + css.replaceAll('</style', '<\\/style') + '</style></head><body><div id="root"></div><script>' + script.replaceAll('</script', '<\\/script') + '</script></body></html>\n';
  if (Buffer.byteLength(html) > 2 * 1024 * 1024) throw Error('Prototype exceeds 2 MiB: ' + Buffer.byteLength(html));
  return html;
}
async function save(target, html) {
  await fs.mkdir(path.dirname(path.resolve(target)), { recursive: true });
  await fs.writeFile(target + '.pending', html);
  await fs.rename(target + '.pending', target);
  console.log(JSON.stringify({ output: path.resolve(target), bytes: Buffer.byteLength(html), pages: metadata.pages.length, commit }));
}
const body = await document('main.tsx');
await save(output, body);
await save(viewerOutput, await document('viewer.tsx', true, {
  __PROTOTYPE_DOCUMENT_GZIP__: JSON.stringify(gzipSync(body).toString('base64')),
  __PROTOTYPE_DOCUMENT_BYTES__: String(Buffer.byteLength(body)), __PROTOTYPE_OBSERVED_AT__: JSON.stringify(observedAt),
}));
