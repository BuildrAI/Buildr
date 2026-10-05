import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

registerHooks({
  resolve(specifier, context, next) {
    const adapter = context.parentURL?.endsWith('/TaskLinkedDocument.tsx');
    if (specifier === 'react' && (adapter || context.parentURL?.endsWith('/ResourceDocumentPane.tsx'))) {
      const source = ['useState', 'useEffect', 'useCallback'].map(name => `export const ${name} = (...args) => globalThis.__linkedDocumentHooks.${name}(...args);`).join('\n');
      return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
    }
    if (adapter && specifier === 'react-router-dom') return { url: 'data:text/javascript,export const useLocation = () => globalThis.__linkedDocumentScene.location;', shortCircuit: true };
    if (adapter && specifier.endsWith('/AppShellContext')) return { url: 'data:text/javascript,export const useAppShell = () => globalThis.__linkedDocumentScene.shell;', shortCircuit: true };
    if (adapter && specifier.endsWith('/resource-preview')) return { url: 'data:text/javascript,export const useResourcePreview = () => globalThis.__linkedDocumentScene.previews;', shortCircuit: true };
    try { return next(specifier, context); } catch (cause) {
      if (!specifier.startsWith('.') || !context.parentURL?.includes('/src/')) throw cause;
      for (const suffix of ['.ts', '.tsx', '/index.ts']) {
        const url = new URL(specifier + suffix, context.parentURL);
        if (existsSync(fileURLToPath(url))) return next(url.href, context);
      }
      throw cause;
    }
  },
  load(url, context, next) {
    if (url.endsWith('.css')) return { format: 'module', source: '', shortCircuit: true };
    if (url.endsWith('.tsx')) return { format: 'module', source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText, shortCircuit: true };
    return next(url, context);
  },
});
const { TaskLinkedDocument } = await import('../src/features/task/components/TaskLinkedDocument.tsx');
const { ResourceDocumentPane } = await import('../src/components/ResourceDocumentPane.tsx');
const { getWorkspaceId, setWorkspaceId } = await import('../src/api/workspaceState.ts');
const context = { documentDigest: 'sha256-' + 'a'.repeat(64), sourceIdentity: 'sha256-' + 'b'.repeat(64) };
const document = (content = '# 实际链接正文', imageContext = context) => ({ path: 'docs/guide.md', name: 'guide.md', exists: true, content, provenance: 'task-worktree-candidate', imageContext });
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const settle = async () => { for (let index = 0; index < 8; index += 1) await Promise.resolve(); };
function find(view, predicate) {
  if (!view || typeof view !== 'object') return null;
  if (predicate(view)) return view;
  for (const child of [view.props?.children].flat(Infinity)) { const found = find(child, predicate); if (found) return found; }
  return null;
}
function harness(Component) {
  const slots = [], effects = [];
  let cursor = 0;
  const same = (left, right) => left && right && left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
  const hooks = {
    useState(initial) { const index = cursor++; if (!slots[index]) slots[index] = { value: typeof initial === 'function' ? initial() : initial }; return [slots[index].value, value => { slots[index].value = typeof value === 'function' ? value(slots[index].value) : value; }]; },
    useCallback(fn, deps) { const index = cursor++; if (!same(slots[index]?.deps, deps)) slots[index] = { fn, deps }; return slots[index].fn; },
    useEffect(fn, deps) { const index = cursor++; if (!same(slots[index]?.deps, deps)) { const previous = slots[index]; slots[index] = { deps }; effects.push(() => { previous?.cleanup?.(); slots[index].cleanup = fn(); }); } },
  };
  return { render(props) { globalThis.__linkedDocumentHooks = hooks; cursor = 0; const view = Component(props); effects.splice(0).forEach(effect => effect()); return view; }, dispose() { slots.forEach(slot => slot?.cleanup?.()); } };
}

test('真实Task linked adapter显式绑定workspace与取消信号，原对象导航和局部刷新读取当前正文', async () => {
  // Context and fetch are external collaborators; the real adapter, client, pane and body own every URL and transition.
  const priorFetch = globalThis.fetch, priorWorkspace = getWorkspaceId(), calls = [], opens = [];
  globalThis.__linkedDocumentScene = { shell: { workspaceId: 'A' }, location: { pathname: '/workspaces/A/tasks' }, previews: { open: (...args) => opens.push(args) } };
  setWorkspaceId('unrelated-global-workspace');
  globalThis.fetch = (url, options) => { const read = deferred(); calls.push({ ...read, url, options }); return read.promise; };
  const item = { kind: 'task-document', taskId: 'one', projectCode: 'demo', file: 'docs/guide.md', path: '/workspaces/A/tasks/one/document?project=demo&file=docs%2Fguide.md' };
  const adapter = harness(TaskLinkedDocument), pane = harness(ResourceDocumentPane);
  let body;
  try {
    const view = adapter.render({ item });
    const paneElement = find(view, element => element.type === ResourceDocumentPane);
    pane.render(paneElement.props);
    assert.equal(calls[0].url, '/api/v1/workspaces/A/tasks/one/documents/demo/docs/guide.md');
    assert.ok(calls[0].options.signal instanceof AbortSignal);
    calls[0].resolve(new Response(JSON.stringify(document()), { status: 200, headers: { 'content-type': 'application/json' } })); await settle();
    const bodyElement = find(pane.render(paneElement.props), element => element.type?.name === 'TaskLinkedMarkdown');
    assert.ok(bodyElement, '当前正式对象入口必须实际装配图片阅读正文');
    body = harness(bodyElement.type);
    const bodyView = body.render(bodyElement.props);
    const reader = find(bodyView, element => element.type?.name === 'MarkdownReader');
    const image = new URL(reader.props.options.imageResolver('../assets/example.png').href, 'http://localhost');
    assert.equal(image.pathname, '/api/v1/workspaces/A/tasks/one/document-image/demo');
    assert.equal(image.searchParams.get('documentPath'), 'docs/guide.md');
    reader.props.options.onRelativeLinkClick('next.md');
    assert.deepEqual(opens, [['/workspaces/A/tasks', '/workspaces/A/tasks/one/document?project=demo&file=docs%2Fnext.md']]);
    find(reader.props.toolbarStart, element => element.props?.children === '刷新资料').props.onClick();
    pane.render(paneElement.props);
    assert.equal(calls[0].options.signal.aborted, true);
    assert.equal(calls[1].url, calls[0].url, '局部刷新保留当前Task/project/doc身份');
    calls[1].resolve(new Response(JSON.stringify(document('# 新正文', { ...context, sourceIdentity: 'sha256-' + 'c'.repeat(64) })), { status: 200 })); await settle();
    assert.equal(find(pane.render(paneElement.props), element => element.type?.name === 'TaskLinkedMarkdown').props.document.content, '# 新正文');
    globalThis.__linkedDocumentScene.shell.workspaceId = 'B';
    const changed = find(adapter.render({ item }), element => element.type === ResourceDocumentPane);
    assert.notEqual(changed.key, paneElement.key, 'scope切换必须重建reader，不能先显示旧正文');
    await assert.rejects(changed.props.load(item.file), /当前任务资料来源不可确认/);
    assert.equal(calls.length, 2, '过期对象不能回退到隐式workspace请求');
  } finally { adapter.dispose(); pane.dispose(); body?.dispose(); calls.forEach(call => call.resolve(new Response('{}'))); globalThis.fetch = priorFetch; setWorkspaceId(priorWorkspace); delete globalThis.__linkedDocumentScene; delete globalThis.__linkedDocumentHooks; await settle(); }
});

test('共享对象reader默认Markdown及text分支保持原框架和导航，不消费Task专用插槽', async () => {
  const reader = harness(ResourceDocumentPane), textReader = harness(ResourceDocumentPane), opens = [], load = async () => document();
  try {
    const props = { file: 'docs/guide.md', load, onOpen: file => opens.push(file) };
    reader.render(props); await settle();
    const view = reader.render(props);
    assert.equal(view.props.className, 'resource-reader');
    const markdown = find(view, element => element.type?.name === 'MarkdownHost');
    assert.equal(markdown.props.markdown, '# 实际链接正文');
    markdown.props.options.onRelativeLinkClick('next.md'); assert.deepEqual(opens, ['docs/next.md']);
    let rendered = false;
    const textProps = { ...props, load: async () => ({ ...document('原始文件'), format: 'text' }), renderMarkdown: () => { rendered = true; return null; } };
    textReader.render(textProps); await settle();
    const source = find(textReader.render(textProps), element => element.type === 'pre');
    assert.equal(source.props.children, '原始文件'); assert.equal(rendered, false);
  } finally { reader.dispose(); textReader.dispose(); delete globalThis.__linkedDocumentHooks; }
});

test('共享对象reader替换和卸载真实abort旧读取，忽略取消的晚正文不会替代当前材料', async () => {
  const reader = harness(ResourceDocumentPane), calls = [];
  const load = (file, signal) => { const read = deferred(); calls.push({ ...read, file, signal }); return read.promise; };
  try {
    const props = { file: 'docs/first.md', load, onOpen() {} };
    reader.render(props);
    const current = { ...props, file: 'docs/second.md' };
    reader.render(current);
    assert.equal(calls[0].signal.aborted, true);
    calls[1].resolve(document('当前第二篇')); await settle();
    calls[0].resolve(document('迟到第一篇')); await settle();
    assert.equal(find(reader.render(current), element => element.type?.name === 'MarkdownHost').props.markdown, '当前第二篇');
    reader.dispose(); assert.equal(calls[1].signal.aborted, true);
  } finally { reader.dispose(); calls.forEach(call => call.resolve(document())); delete globalThis.__linkedDocumentHooks; await settle(); }
});
