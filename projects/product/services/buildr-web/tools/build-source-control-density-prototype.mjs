import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {gzipSync} from 'node:zlib';
import {build} from 'vite';

const root = path.resolve(import.meta.dirname, '..');
const [output, viewerOutput] = process.argv.slice(2);
if (!output || !viewerOutput) throw Error('Usage: build-source-control-density-prototype.mjs <body.html> <viewer.html>');
const prototypeRoot = path.join(root, 'src/prototypes/source-control-density');
const metadata = JSON.parse(await fs.readFile(path.join(prototypeRoot, 'scenes.json'), 'utf8'));
const observedAt = new Date().toISOString(), commit = execFileSync('git', ['rev-parse', 'HEAD'], {cwd:root,encoding:'utf8'}).trim();
const json = value => JSON.stringify(value).replaceAll('<', '\\u003c');
const featureAssets = path.resolve(root, '../buildr/resources/workspace/skills/buildr/ui-prototype/assets');
async function document(entry, viewer = false, define = {}) {
  const sources = new Set([path.join(prototypeRoot, 'scenes.json'), import.meta.filename]);
  const result = await build({root,configFile:false,
    plugins:[{name:'offline-source-control-density',transform(_code,id) {if (id.startsWith(root + '/src/') || id.startsWith(featureAssets + '/')) sources.add(id.split('?')[0]);}}],
    build:{write:false,minify:true,assetsInlineLimit:Infinity,lib:{entry:path.join(prototypeRoot, entry),name:viewer ? 'SourceControlDensityReader' : 'SourceControlDensity',formats:['iife']},rollupOptions:{onwarn(warning,warn) {if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') warn(warning);},output:{inlineDynamicImports:true}}},
    define:{'process.env.NODE_ENV':'"production"',...define},
  });
  const chunks = (Array.isArray(result) ? result : [result]).flatMap(item => item.output);
  const code = chunks.filter(item => item.type === 'chunk').map(item => item.code).join('\n');
  const css = chunks.filter(item => item.type === 'asset' && item.fileName.endsWith('.css')).map(item => item.source).join('\n');
  const observation = {observedAt,commit,uncommittedSummary:'已采用名称优先、分支入口固定64/24像素的紧凑目录。推荐页直接复用正式 AppShellHeader/AppShellFrame、SourceControlWorkbench、SourceControlWorktreeStatus、BranchManagementPopover 与主题；内存读写隔离真实业务操作。改造前对照仅保留原型专用历史布局与状态。阅读器沿用 PrototypeReaderLayout/PrototypeTab 和统一说明联动。',
    sources:await Promise.all([...sources].sort().map(async source => ({path:path.relative(root,source),sha256:crypto.createHash('sha256').update(await fs.readFile(source)).digest('hex')}))),};
  // Native inline decompression keeps the existing 2 MiB limit without removing shared components.
  const packed = gzipSync(code).toString('base64');
  const bootstrap = `(async()=>{const bytes=Uint8Array.from(atob(${JSON.stringify(packed)}),c=>c.charCodeAt(0));const source=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();const script=document.createElement('script');script.textContent=source;document.body.append(script)})().catch(error=>{document.getElementById('root').textContent='原型加载失败：'+error.message})`;
  const html = '<!doctype html>\n<!-- buildr:ui-prototype -->\n' + (viewer ? '<!-- buildr:ui-prototype-viewer -->\n' : '') + '<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>源代码管理 · 名称优先布局' + (viewer ? '阅读器' : '对照') + '</title>'
    + (viewer ? '' : '<script id="buildr-prototype" type="application/json">' + json(metadata) + '</script>') + '<script id="buildr-prototype-source" type="application/json">' + json(observation) + '</script><style>' + css.replaceAll('</style','<\\/style') + '</style></head><body><div id="root"></div><script>' + bootstrap.replaceAll('</script','<\\/script') + '</script></body></html>\n';
  if (Buffer.byteLength(html) > 2 * 1024 * 1024) throw Error('Prototype exceeds existing 2 MiB limit');
  return html;
}
async function save(target, html) {
  await fs.mkdir(path.dirname(path.resolve(target)), {recursive:true}); await fs.writeFile(target + '.pending', html); await fs.rename(target + '.pending', target);
  console.log(JSON.stringify({output:path.resolve(target),bytes:Buffer.byteLength(html),pages:metadata.pages.length,commit}));
}
const body = await document('main.tsx');
await save(output, body);
await save(viewerOutput, await document('viewer.tsx', true, {__PROTOTYPE_DOCUMENT_GZIP__:JSON.stringify(gzipSync(body).toString('base64')),__PROTOTYPE_DOCUMENT_BYTES__:String(Buffer.byteLength(body)),__PROTOTYPE_OBSERVED_AT__:JSON.stringify(observedAt)}));
