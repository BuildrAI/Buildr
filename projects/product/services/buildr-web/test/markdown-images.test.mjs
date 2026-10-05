import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { localMarkdownImagePath, markdownImageQuery, updateMarkdownImageFailures } from '../src/lib/markdownImages.ts';

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'react' && (context.parentURL?.endsWith('/lib/useMarkdownDocumentViewer.ts') || context.parentURL?.endsWith('/components/TaskDocumentPreviewModal.tsx'))) {
      const source = ['useState', 'useEffect', 'useRef', 'useCallback'].map(name => `export const ${name} = (...args) => globalThis.__imageReaderHooks.${name}(...args);`).join('\n');
      return { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true };
    }
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
const { createProjectClient, projectDocumentImage } = await import('../src/features/project/api/project-api.ts');
const { createTaskClient, taskMaterialImage, taskProjectDocumentImage } = await import('../src/features/task/api/task-api.ts');
const { TaskDocumentPreviewModal } = await import('../src/features/task/components/TaskDocumentPreviewModal.tsx');
const digest = character => 'sha256-' + character.repeat(64);
const context = { documentDigest: digest('a'), sourceIdentity: digest('b') };
const material = overrides => ({ id: 'solution', source: { kind: 'project', project: 'demo', path: '@project/design/solution.md' }, exists: true, content: '# 正文\n![图](../images/example.png)', actualDigest: context.documentDigest, diagnostic: null, imageContext: context, ...overrides });
const resolveImage = (workspaceId, imageContext = context) => href => {
  const url = projectDocumentImage(workspaceId, 'demo', 'design/solution.md', href, imageContext);
  return url ? { href: url } : null;
};

test('合法父相对图片在文档来源根内解析，编码文件名保留真实图片类型', () => {
  assert.equal(localMarkdownImagePath('design/solution.md', '../images/图%20表.PNG?size=1#preview'), 'images/图 表.PNG');
  assert.equal(localMarkdownImagePath('@project/design/solution.md', '../images/example.webp'), 'images/example.webp');
  assert.equal(localMarkdownImagePath('README.md', './images/example.jpeg'), 'images/example.jpeg');
  assert.equal(localMarkdownImagePath('design/solution.md', '../example.gif'), 'example.gif');
});

test('远程、绝对路径、编码越界及脚本图片不产生图片请求', () => {
  for (const href of ['https://example.org/image.png', '//example.org/image.png', '/image.png', '%2fimage.png', 'https%3a%2f%2fexample.org/image.png', 'C:/image.png', 'C%3a/image.png', '../..%2fsecret.png', '%2e%2e/%2e%2e/secret.png', 'a\\b.png', 'a%5cb.png', 'a\0b.png', 'a%00b.png', '%zz.png', '@project/images/example.png', 'image.svg', 'image.html', 'data:image/png;base64,xxx', 'blob:image.png']) {
    assert.equal(markdownImageQuery('design/solution.md', href, context), null, href);
  }
  assert.equal(localMarkdownImagePath('README.md', '../secret.png'), null);
});

test('图片请求必须携带两个已观察版本，保留原href以供后端核对正文真实引用', () => {
  const href = '../images/图%20表.png?size=1#preview';
  assert.deepEqual(Object.fromEntries(markdownImageQuery('design/solution.md', href, context)), { href, expectedDocumentDigest: context.documentDigest, expectedSourceIdentity: context.sourceIdentity });
  for (const invalid of [undefined, null, {}, { ...context, documentDigest: 'absent' }, { ...context, sourceIdentity: 'sha256-invalid' }]) assert.equal(markdownImageQuery('design/solution.md', href, invalid), null);
});

test('项目与任务材料URL显式绑定工作空间和来源，不在缺失或失效正文上取图', () => {
  const first = new URL(projectDocumentImage('workspace/A', 'demo project', 'design/solution.md', '../images/example.png', context), 'http://localhost');
  assert.equal(first.pathname, '/api/v1/workspaces/workspace%2FA/projects/demo%20project/document-image');
  assert.equal(first.searchParams.get('documentPath'), 'design/solution.md');
  assert.equal(first.searchParams.get('expectedSourceIdentity'), context.sourceIdentity);
  const task = new URL(taskMaterialImage('workspace/B', 'task/id', material({ id: 'material/id' }), '../images/example.png'), 'http://localhost');
  assert.equal(task.pathname, '/api/v1/workspaces/workspace%2FB/tasks/task%2Fid/materials/material%2Fid/image');
  assert.equal(task.searchParams.get('href'), '../images/example.png');
  assert.equal(task.searchParams.get('expectedDocumentDigest'), context.documentDigest);
  assert.equal(projectDocumentImage(null, 'demo', 'README.md', 'image.png', context), null);
  assert.equal(taskMaterialImage(null, 'one', material(), '../images/example.png'), null);
  for (const overrides of [{ exists: false }, { diagnostic: { code: 'task_worktree_unavailable' } }, { actualDigest: digest('c') }, { imageContext: undefined }, { content: '' }]) assert.equal(taskMaterialImage('workspace', 'one', material(overrides), '../images/example.png'), null);
  assert.notEqual(taskMaterialImage('workspace', 'one', material(), '../images/example.png'), taskMaterialImage('workspace', 'one', material({ imageContext: { ...context, sourceIdentity: digest('c') } }), '../images/example.png'), '正文相同但checkout变化必须得到不同请求');
  const linkedDocument = new URL(taskProjectDocumentImage('workspace/B', 'task/id', 'demo', 'design/solution.md', '../images/example.png', context), 'http://localhost');
  assert.equal(linkedDocument.pathname, '/api/v1/workspaces/workspace%2FB/tasks/task%2Fid/document-image/demo');
  assert.equal(linkedDocument.searchParams.get('documentPath'), 'design/solution.md');
});

test('项目正文GET和图片共用显式工作空间身份，保留取消信号和现有未显式调用兼容', async () => {
  const calls = [], signal = new AbortController().signal;
  const client = createProjectClient(async (path, options) => { calls.push({ path, options }); return {}; });
  await client.projectDocument('demo', 'design/solution.md', { signal }, 'workspace/A');
  assert.equal(calls[0].path, '/api/v1/workspaces/workspace%2FA/projects/demo/documents/design/solution.md');
  assert.equal(calls[0].options.signal, signal);
  assert.equal(calls[0].options.method, undefined);
  await client.projectDocument('demo', 'README.md');
  assert.equal(calls[1].path, '/api/v1/projects/demo/documents/README.md');
  await client.listProjects({}, 'workspace/A');
  assert.equal(calls[2].path, '/api/v1/workspaces/workspace%2FA/projects');
  const taskClient = createTaskClient(async (path, options) => { calls.push({ path, options }); return {}; });
  await taskClient.materials('one', { signal }, 'workspace/B');
  await taskClient.projectDocument('one', 'demo', 'design/solution.md', { signal }, 'workspace/B');
  assert.equal(calls[3].path, '/api/v1/workspaces/workspace%2FB/tasks/one/materials');
  assert.equal(calls[4].path, '/api/v1/workspaces/workspace%2FB/tasks/one/documents/demo/design/solution.md');
  assert.equal(calls[4].options.signal, signal);
});

test('其他workspace或旧候选的晚到图片失败不污染当前正文提示', () => {
  const current = { version: 'B', urls: [] };
  const oldWorkspace = resolveImage('A')('../images/example.png').href;
  assert.equal(updateMarkdownImageFailures(current, 'B', oldWorkspace, true, resolveImage('B')), current);
  const oldCandidate = resolveImage('B', { ...context, sourceIdentity: digest('c') })('../images/example.png').href;
  assert.equal(updateMarkdownImageFailures(current, 'B', oldCandidate, true, resolveImage('B')), current);
  assert.equal(updateMarkdownImageFailures(current, 'B', 'https://example.org/image.png', true, resolveImage('B')), current);
});

test('单图失败不影响其他图片，刷新后只清除已恢复图片的局部提示', () => {
  const resolver = resolveImage('A'), first = resolver('../images/first.png').href, second = resolver('../images/second.png').href;
  let state = updateMarkdownImageFailures({ version: '', urls: [] }, 'A', first, true, resolver);
  state = updateMarkdownImageFailures(state, 'A', second, true, resolver);
  state = updateMarkdownImageFailures(state, 'A', first, false, resolver);
  assert.deepEqual(state, { version: 'A', urls: [second] });
  state = updateMarkdownImageFailures(state, 'A', second, false, resolver);
  assert.deepEqual(state, { version: 'A', urls: [] });
});

// Only React scheduling and window focus are modeled; the real component and shared viewer own every read and transition.
function readerHarness() {
  const slots = [], effects = [];
  let cursor = 0;
  const same = (left, right) => left && right && left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
  const previousWindow = globalThis.window;
  globalThis.window = { document: { activeElement: null }, addEventListener() {}, removeEventListener() {} };
  globalThis.__imageReaderHooks = {
    useState(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = { value: typeof initial === 'function' ? initial() : initial };
      return [slots[index].value, value => { slots[index].value = typeof value === 'function' ? value(slots[index].value) : value; }];
    },
    useRef(initial) { const index = cursor++; return slots[index] ||= { current: initial }; },
    useCallback(fn, deps) { const index = cursor++; if (!same(slots[index]?.deps, deps)) slots[index] = { fn, deps }; return slots[index].fn; },
    useEffect(fn, deps) {
      const index = cursor++;
      if (!same(slots[index]?.deps, deps)) {
        const previous = slots[index]; slots[index] = { deps };
        effects.push(() => { previous?.cleanup?.(); slots[index].cleanup = fn(); });
      }
    },
  };
  return {
    render(props) { cursor = 0; const view = TaskDocumentPreviewModal(props); effects.splice(0).forEach(effect => effect()); return view; },
    dispose() { slots.forEach(slot => slot?.cleanup?.()); delete globalThis.__imageReaderHooks; if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow; },
  };
}
function findElement(view, predicate) {
  if (!view || typeof view !== 'object') return null;
  if (predicate(view)) return view;
  for (const child of [view.props?.children].flat(Infinity)) { const found = findElement(child, predicate); if (found) return found; }
  return null;
}
const markdownReader = view => findElement(view, element => element.type?.name === 'MarkdownReader');
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };
const previewFixture = () => {
  const requests = [];
  return {
    requests,
    props: { workspaceId: 'A', taskId: 'shared-task', reference: { projectCode: 'demo', projectName: '示例', projectSourcePath: 'projects/demo', documentPath: 'design/first.md' }, onClose() {}, loadDocument(reference, path, signal) { const request = deferred(); requests.push({ ...request, reference, path, signal }); return request.promise; } },
  };
};
const document = (path, content, imageContext = context) => ({ path, name: path.split('/').at(-1), exists: true, content, provenance: 'task-worktree-candidate', imageContext });

test('真实任务项目reader跟随链接后按当前文档取图，刷新保留当前路径并可返回', async () => {
  const harness = readerHarness(), { props, requests } = previewFixture();
  try {
    harness.render(props);
    requests[0].resolve(document('design/first.md', '# 第一篇')); await settle();
    let reader = markdownReader(harness.render(props));
    assert.equal(new URL(reader.props.options.imageResolver('../images/example.png').href, 'http://localhost').pathname, '/api/v1/workspaces/A/tasks/shared-task/document-image/demo');
    reader.props.options.onRelativeLinkClick('second.md');
    assert.equal(requests[1].path, 'design/second.md');
    requests[1].resolve(document('design/second.md', '# 第二篇')); await settle();
    reader = markdownReader(harness.render(props));
    assert.equal(new URL(reader.props.options.imageResolver('../images/example.png').href, 'http://localhost').searchParams.get('documentPath'), 'design/second.md');
    harness.render({ ...props, refreshToken: 1 });
    assert.equal(requests[2].path, 'design/second.md', '刷新不退回入口文档');
    requests[2].resolve(document('design/second.md', '# 刷新第二篇')); await settle();
    const view = harness.render({ ...props, refreshToken: 1 });
    const back = findElement(view, element => element.props?.children === '返回上一文档');
    back.props.onClick();
    assert.equal(requests[3].path, 'design/first.md');
  } finally { harness.dispose(); requests.forEach(request => request.resolve(document(request.path, '# 清理'))); await settle(); }
});

test('真实任务项目reader同名Task换workspace立即隐藏旧正文，取消和晚响应不覆盖新图片上下文', async () => {
  const harness = readerHarness(), { props, requests } = previewFixture();
  try {
    harness.render(props);
    requests[0].resolve(document('design/first.md', 'A正文')); await settle();
    assert.equal(markdownReader(harness.render(props)).props.content, 'A正文');
    harness.render({ ...props, refreshToken: 1 });
    const nextProps = { ...props, workspaceId: 'B', refreshToken: 1 };
    assert.equal(markdownReader(harness.render(nextProps)), null, '新作用域首次render不展示旧正文');
    assert.equal(requests[1].signal.aborted, true);
    const newContext = { ...context, sourceIdentity: digest('c') };
    requests[2].resolve(document('design/first.md', 'B正文', newContext)); await settle();
    requests[1].resolve(document('design/first.md', 'A迟到正文')); await settle();
    const reader = markdownReader(harness.render(nextProps));
    assert.equal(reader.props.content, 'B正文');
    const url = new URL(reader.props.options.imageResolver('../images/example.png').href, 'http://localhost');
    assert.equal(url.pathname, '/api/v1/workspaces/B/tasks/shared-task/document-image/demo');
    assert.equal(url.searchParams.get('expectedSourceIdentity'), newContext.sourceIdentity);
  } finally { harness.dispose(); requests.forEach(request => request.resolve(document(request.path, '# 清理'))); await settle(); }
});
