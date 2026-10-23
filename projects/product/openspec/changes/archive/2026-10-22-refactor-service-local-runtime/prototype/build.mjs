import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

const prototypeRoot = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = '/Users/chenjun/workspaces/BuildrAI/Buildr';
const productRoot = path.join(workspaceRoot, 'projects/product/services/buildr-web');
const outputRoot = path.resolve(process.argv[2] || prototypeRoot);
const productRequire = createRequire(path.join(productRoot, 'package.json'));
const { build } = await import(pathToFileURL(productRequire.resolve('vite')).href);
const packageData = JSON.parse(await fs.readFile(path.join(productRoot, 'package.json'), 'utf8'));
const aliases = [
  { find: '@product', replacement: path.join(productRoot, 'src') },
  ...Object.keys(packageData.dependencies).map(name => ({
    find: new RegExp('^' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=/|$)'),
    replacement: path.join(productRoot, 'node_modules', name),
  })),
];
const metadataPath = path.join(prototypeRoot, 'scenes.json');
const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'));
if (metadata.version !== 1 || !metadata.pages?.some(page => page.id === 'directory')) {
  throw Error('scenes.json must declare version 1 and the directory page.');
}
const observedAt = new Date().toISOString();
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: workspaceRoot, encoding: 'utf8' }).trim();
const productDiffStat = execFileSync('git', ['diff', '--stat', 'HEAD', '--', 'projects/product/services/buildr-web/src'], { cwd: workspaceRoot, encoding: 'utf8' }).trim();
const lockfileSha256 = crypto.createHash('sha256').update(await fs.readFile(path.join(productRoot, 'package-lock.json'))).digest('hex');
const featureAssets = path.resolve(productRoot, '../buildr/resources/workspace/skills/buildr/ui-prototype/assets');
const json = value => JSON.stringify(value).replaceAll('<', '\\u003c');

function sourceLabel(source) {
  if (source.startsWith(prototypeRoot + '/')) return 'prototype/' + path.relative(prototypeRoot, source);
  if (source.startsWith(workspaceRoot + '/')) return 'workspace/' + path.relative(workspaceRoot, source);
  return source;
}

async function buildDocument(entry, { viewer = false, define = {} } = {}) {
  const sources = new Set([
    fileURLToPath(import.meta.url), metadataPath,
    path.join(productRoot, 'package.json'), path.join(productRoot, 'package-lock.json'),
  ]);
  const result = await build({
    root: prototypeRoot,
    configFile: false, esbuild: { jsx: 'automatic', jsxImportSource: 'react' },
    resolve: { alias: aliases },
    plugins: [{
      name: 'local-runtime-prototype-source-observation', enforce: 'pre',
      transform(_code, id) {
        const source = id.split('?')[0];
        if (source.startsWith(prototypeRoot + '/') || source.startsWith(path.join(productRoot, 'src') + '/') || source.startsWith(featureAssets + '/')) sources.add(source);
        if (source.endsWith('/features/workspace/components/AssetHomeView.tsx')) {
          let proposal = _code.replace("runtimeContent?:ReactNode;", "runtimeContent?:ReactNode;view?:string;onViewChange?(next:string):void;runtimeLabel?:string;");
          proposal = proposal.replace('runtimeContent,documents,repositoryContent}:Props)', 'runtimeContent,documents,repositoryContent,view:controlledView,onViewChange,runtimeLabel}:Props)');
          proposal = proposal.replace("const [view, setView] = useState('detail');", "const [internalView, setInternalView] = useState('detail'); const view=controlledView??internalView; const setView=(next:string)=>{setInternalView(next);onViewChange?.(next);};");
          proposal = proposal.replace("label: '运行与部署'", "label: runtimeLabel || '运行与部署'");
          return { code: proposal, map: null };
        }

      },
    }],
    build: {
      write: false,
      minify: true,
      assetsInlineLimit: Infinity,
      lib: {
        entry: path.join(prototypeRoot, entry),
        name: viewer ? 'BuildrLocalRuntimeReader' : 'BuildrLocalRuntimePrototype',
        formats: ['iife'], cssFileName: 'prototype',
      },
      rollupOptions: {
        onwarn(warning, warn) { if (warning.code !== 'MODULE_LEVEL_DIRECTIVE') warn(warning); },
        output: { inlineDynamicImports: true },
      },
    },
    define: { 'process.env.NODE_ENV': '"production"', ...define },
  });
  const chunks = (Array.isArray(result) ? result : [result]).flatMap(item => item.output);
  const unexpectedAssets = chunks.filter(item => item.type === 'asset' && !item.fileName.endsWith('.css'));
  if (unexpectedAssets.length) throw Error('Prototype must be self-contained; unexpected assets: ' + unexpectedAssets.map(item => item.fileName).join(', '));
  const script = chunks.filter(item => item.type === 'chunk').map(item => item.code).join('\n');
  const css = chunks.filter(item => item.type === 'asset' && item.fileName.endsWith('.css')).map(item => item.source).join('\n');
  const observation = {
    observedAt,
    commit,
    sourceCommit: commit,
    lifecycle: 'temporary-discussion',
    dependencySource: 'current-product-checkout-installation',
    lockfileSha256,
    uncommittedSummary: {
      scope: '本地服务运行交互原型。复用当前产品应用壳、导航、页签、资源目录、可拖拽双栏、服务详情、任务标题与工作路径、抽屉、主题和原型阅读器；服务详情仅通过本构建的临时候选覆盖增加受控页签及本地运行标签参数，不修改源文件；候选内容与模拟状态仅存在于本次临时原型目录，不修改产品源码。所有启动、停止、连接切换与日志交互均为本地内存模拟，无真实接口、进程、部署或持久写入。',
      productTrackedDiffStat: productDiffStat,
      entry: viewer ? '复用 PrototypeReaderLayout、PrototypeTab 及统一功能说明组件，内联压缩后的原型正文。' : '临时原型入口直接导入当前产品组件和主题，仅隔离数据、路由与副作用。',
    },
    sources: await Promise.all([...sources].sort().map(async source => ({
      path: sourceLabel(source),
      sha256: crypto.createHash('sha256').update(await fs.readFile(source)).digest('hex'),
    }))),
  };
  const policy = "default-src 'none'; base-uri 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; frame-src 'self' about: blob:;";
  const title = metadata.title + (viewer ? ' · 原型阅读器' : ' · 交互原型');
  const sceneData = viewer ? '' : '<script id="buildr-prototype" type="application/json">' + json(metadata) + '</script>';
  const html = '<!doctype html>\n<!-- buildr:ui-prototype -->\n' + (viewer ? '<!-- buildr:ui-prototype-viewer -->\n' : '')
    + '<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="' + policy + '"><title>' + title + '</title>'
    + sceneData + '<script id="buildr-prototype-source" type="application/json">' + json(observation) + '</script><style>' + css.replaceAll('</style', '<\\/style')
    + '</style></head><body><div id="root"></div><script>' + script.replaceAll('</script', '<\\/script') + '</script></body></html>\n';
  if (Buffer.byteLength(html) > 2 * 1024 * 1024) throw Error('Prototype exceeds existing 2 MiB limit: ' + Buffer.byteLength(html));
  return { html, sourceCount: sources.size };
}

async function save(name, document) {
  await fs.mkdir(outputRoot, { recursive: true });
  const target = path.join(outputRoot, name);
  await fs.writeFile(target + '.pending', document.html);
  await fs.rename(target + '.pending', target);
  console.log(JSON.stringify({ output: target, bytes: Buffer.byteLength(document.html), pages: metadata.pages.length, sourceCount: document.sourceCount, commit, lockfileSha256 }));
}

const body = await buildDocument('main.tsx');
await save('local-runtime.html', body);
await save('index.html', await buildDocument('viewer.tsx', { viewer: true, define: {
  __PROTOTYPE_DOCUMENT_GZIP__: JSON.stringify(gzipSync(body.html).toString('base64')),
  __PROTOTYPE_DOCUMENT_BYTES__: String(Buffer.byteLength(body.html)),
  __PROTOTYPE_OBSERVED_AT__: JSON.stringify(observedAt),
} }));
