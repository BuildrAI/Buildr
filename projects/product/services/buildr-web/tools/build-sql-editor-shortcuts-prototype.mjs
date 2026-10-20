import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { build } from 'vite';

const root = path.resolve(import.meta.dirname, '..');
const workspace = path.resolve(root, '../../../..');
const [bodyOutput, viewerOutput] = process.argv.slice(2);
if (!bodyOutput || !viewerOutput) throw Error('Usage: node tools/build-sql-editor-shortcuts-prototype.mjs <body.html> <viewer.html>');
if (path.resolve(bodyOutput) === path.resolve(viewerOutput)) throw Error('Body and viewer output paths must be different.');
const sourceRoot = path.join(root, 'src/prototypes/sql-editor-shortcuts');
const featureAssets = path.resolve(root, '../buildr/resources/workspace/skills/buildr/ui-prototype/assets');
const metadata = JSON.parse(await fs.readFile(path.join(sourceRoot, 'scenes.json'), 'utf8'));
const observedAt = new Date().toISOString();
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: workspace, encoding: 'utf8' }).trim();
const diffSummary = execFileSync('git', ['diff', '--stat', 'HEAD', '--',
  'projects/product/services/buildr-web/src/prototypes/sql-editor-shortcuts',
  'projects/product/services/buildr-web/tools/build-sql-editor-shortcuts-prototype.mjs',
], { cwd: workspace, encoding: 'utf8' }).trim();
const newFiles = execFileSync('git', ['ls-files', '--others', '--exclude-standard', '--',
  'projects/product/services/buildr-web/src/prototypes/sql-editor-shortcuts',
  'projects/product/services/buildr-web/tools/build-sql-editor-shortcuts-prototype.mjs',
], { cwd: workspace, encoding: 'utf8' }).trim().split('\n').filter(Boolean);
const json = value => JSON.stringify(value).replaceAll('<', '\\u003c');

async function buildDocument(entry, { viewer = false, define = {} } = {}) {
  const sources = new Set([path.join(sourceRoot, 'scenes.json'), path.join(sourceRoot, 'ARCHITECTURE.md'), import.meta.filename]);
  const result = await build({
    root,
    configFile: false,
    plugins: [{ name: 'sql-shortcuts-prototype-only-editor', enforce: 'pre', transform(code, id) {
      if (viewer && id.endsWith('/features/task/components/prototype-content.ts')) return code.replace("'任务原型'", "'临时原型'");
      if (id.endsWith('/features/mysql-query/components/SqlQueryEditor.tsx')) {
        return "import { startCompletion } from '@codemirror/autocomplete';\nimport { initialCursor } from '../../../prototypes/sql-editor-shortcuts/fixtures';\n" + code.replace('const editorView = useRef', 'const prototypeStarted = useRef(false); const editorView = useRef').replace('doc: props.value, extensions:', 'doc: props.value, selection: {anchor: initialCursor(props.value)}, extensions:').replace('editorView.current = view;', 'if (view && !prototypeStarted.current && current.current.completion?.catalog && current.current.completion.enabled) { prototypeStarted.current = true; requestAnimationFrame(() => { if (view.dom.isConnected) { view.focus(); startCompletion(view); } }); } editorView.current = view;').replace('className="buildr-mysql-editor"', 'className="buildr-mysql-editor" data-prototype-position="editor"');
      }
      if (id.endsWith('/features/mysql-query/components/MySqlQuery.tsx')) {
        return "import { ShortcutContext, initialSql } from '../../../prototypes/sql-editor-shortcuts/fixtures';\n" + code.replace('const viewActive = useContext', 'const prototypeSession = useContext(ShortcutContext); const viewActive = useContext').replace("[sql, setSql] = useState('')", '[sql, setSql] = useState(() => initialSql(prototypeSession?.scene || \"\"))').replace('className="buildr-mysql-toolbar"', 'className="buildr-mysql-toolbar" data-prototype-position="database"');
      }
      if (id.endsWith('/features/mysql-query/components/MySqlResults.tsx')) return code.replace('className="buildr-mysql-result"', 'className="buildr-mysql-result" data-prototype-position="results"');
    } }, {
      name: 'sql-editor-shortcuts-prototype-source-observation',
      transform(_code, id) {
        const filename = id.split('?')[0];
        if (filename.startsWith(root + '/src/') || filename.startsWith(featureAssets + '/')) sources.add(filename);
      },
    }],
    build: {
      write: false,
      minify: true,
      assetsInlineLimit: Infinity,
      lib: { entry: path.join(sourceRoot, entry), name: viewer ? 'BuildrSqlShortcutsReader' : 'BuildrSqlShortcutsPrototype', formats: ['iife'] },
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
      scope: '查询快捷操作原型；复用正式查询页、编辑器、数据库选择、结果、应用壳、分栏、主题与原型阅读器。直接复用正式快捷扩展，构建时仅注入初始语句、焦点与说明标记，正式源文件未修改。库表和执行均为本地内存模拟，无网络请求。',
      trackedDiffStat: diffSummary,
      untrackedFiles: newFiles,
      entry: viewer ? '复用 PrototypeReaderLayout、PrototypeTab 及当前功能说明组件，内联压缩后的原型正文。' : '复用正式应用壳、页面组件及主题，只隔离模拟数据、导航和写入副作用。',
    },
    sources: await Promise.all([...sources].sort().map(async file => ({
      path: path.relative(workspace, file),
      sha256: crypto.createHash('sha256').update(await fs.readFile(file)).digest('hex'),
    }))),
  };
  const title = viewer ? 'Buildr 查询快捷操作 · 原型阅读器' : 'Buildr 查询快捷操作 · 交互原型';
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
