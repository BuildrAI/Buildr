import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createTaskMaterialsLoader, resolveTaskMaterialLink } from '../src/features/task/task-materials.ts';
import { taskDocuments, taskDocumentTarget } from '../src/features/task/components/taskWorkContent.ts';
import { resolveProjectMarkdownHref } from '../src/lib/workspaceMarkdownReferences.ts';

// Execute the real TSX containers without a browser or a second implementation.
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'react' && context.parentURL?.endsWith('/hooks/useTaskArtifacts.ts')) {
      const source = ['useCallback', 'useEffect', 'useRef', 'useState'].map(name => `export const ${name} = (...args) => globalThis.__taskArtifactHookHarness.${name}(...args);`).join('\n');
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
const { MarkdownReader } = await import('../src/components/MarkdownReader.tsx');
const { TaskNodeContent } = await import('../src/features/task/components/TaskNodeContent.tsx');
const { CompositeTaskPlan } = await import('../src/features/task/components/CompositeTaskPlan.tsx');
const { TaskReadingPane } = await import('../src/features/task/components/TaskReadingPane.tsx');
const { TaskChecklist } = await import('../src/features/task/components/TaskChecklist.tsx');
const { TaskArtifactReader } = await import('../src/features/task/components/TaskArtifactReader.tsx');
const { createTaskClient } = await import('../src/features/task/api/task-api.ts');
const material = (id = 'solution', role = 'solution', source = { kind: 'task', path: 'solution.md' }) => ({ id, role, title: `${role}正文`, source, exists: true, content: '真实独立材料正文', actualDigest: 'sha256-new', provenance: source.kind === 'task' ? 'task-local' : 'task-worktree-candidate', diagnostic: null });
const result = (documents = [], taskId = 'one') => ({ schemaVersion: 'buildr.task-materials-result/v2', taskId, materialsDigest: documents.length ? 'sha256-manifest' : 'absent', materials: { schemaVersion: 'buildr.task-materials/v2', documents: documents.map(({ id, role, title, source }) => ({ id, role, title, source })) }, documents, diagnostics: [] });
const change = (key = 'demo/active', archived = false) => {
  const dir = archived ? 'openspec/changes/archive/2026-01-01-active/' : 'openspec/changes/active/';
  const artifact = name => ({ path: dir + name, exists: true, content: '历史正文' });
  return { kind: 'ready', key, provenance: archived ? 'retained-archive' : 'task-worktree-candidate', change: { name: key, brief: artifact('brief.md'), artifacts: { proposal: artifact('proposal.md'), design: artifact('design.md'), tasks: artifact('tasks.md'), specs: [] } } };
};
const nodeProps = (documents, selected = 'requirements') => ({ selected, record: { taskId: 'one', status: 'active', brief: '# 记录正文', intent: '短目标不得作为正文', changes: [] }, documents, briefs: [], reviews: null, verification: null, reviewError: null, verificationError: null, reviewLoading: false, verificationLoading: false, prototypeData: null, prototypeError: null, choices: {}, onChoose() {}, hasRetrospective: false, hasCoordination: false, renderContent: target => React.createElement('p', { 'data-reading-kind': target.kind, 'data-reading-id': target.id }, '已进入材料阅读器') });
const markup = (Component, props) => renderToStaticMarkup(React.createElement(Component, props));
const readingContent = (materials, record = { taskId: 'one' }) => target => React.createElement(TaskReadingPane, { task: { record }, target, artifacts: { materials }, onRead() {}, onClose() {} });
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const settle = async () => { await Promise.resolve(); await Promise.resolve(); };
function artifactHookHarness() {
  const slots = [], pending = [];
  let cursor = 0;
  const same = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const harness = {
    useState(initial) { const index = cursor++; if (!slots[index]) slots[index] = { value: initial }; return [slots[index].value, value => { slots[index].value = typeof value === 'function' ? value(slots[index].value) : value; }]; },
    useRef(initial) { const index = cursor++; return slots[index] ||= { current: initial }; },
    useCallback(fn, deps) { const index = cursor++; if (!same(slots[index]?.deps, deps)) slots[index] = { fn, deps }; return slots[index].fn; },
    useEffect(fn, deps) { const index = cursor++; if (!same(slots[index]?.deps, deps)) { const previous = slots[index]; slots[index] = { deps }; pending.push(() => { previous?.cleanup?.(); slots[index].cleanup = fn(); }); } },
  };
  globalThis.__taskArtifactHookHarness = harness;
  return {
    render(hook, taskId, recordDigest, lifecycle, workspaceId = null) {
      cursor = 0;
      const output = hook(taskId, { recordDigest, record: { taskId, changes: [], scope: { projects: [], services: [] } } }, lifecycle, workspaceId);
      pending.splice(0).forEach(effect => effect());
      return output;
    },
    dispose() { slots.forEach(slot => slot?.cleanup?.()); delete globalThis.__taskArtifactHookHarness; },
  };
}

test('Markdown toolbar supports an explicit empty label and Task Record brief has no filename', () => {
  const props = { path: 'docs/example.md', content: '# Reader' };
  assert.match(markup(MarkdownReader, props), /<span>example.md<\/span>/);
  const empty = markup(MarkdownReader, { ...props, toolbarStart: null });
  assert.doesNotMatch(empty, /example.md/); assert.match(empty, /markdown-reader-toolbar.*<span><\/span>/);
  const html = markup(TaskReadingPane, { task: { record: { taskId: 'one', brief: '# 记录正文' }, recordDigest: 'record-v1' }, target: { kind: 'brief' }, artifacts: { materials: { data: null, loading: true, error: '材料失败' } }, onRead() {}, onClose() {} });
  assert.match(html, /data-task-brief="one"/); assert.match(html, /data-task-brief-version="record-v1"/);
  assert.match(html, /markdown-reader-toolbar.*<span><\/span>/); assert.doesNotMatch(html, /材料失败|正在读取材料|brief.md/);
});

test('任务记录说明独立读取，solution/implementation/delivery材料有各自阅读入口', () => {
  const documents = taskDocuments([], result([material(), material('impl', 'implementation'), material('delivery', 'delivery')]));
  assert.deepEqual(documents.map(item => item.stage), ['design', 'implementation', 'closeout']);
  assert.deepEqual(documents.map(taskDocumentTarget).map(target => target.kind), ['material', 'material', 'material']);
  const briefNode = markup(TaskNodeContent, { ...nodeProps(documents), materialsLoading: true, materialsError: '材料失败', briefsLoading: true });
  assert.match(briefNode, /data-reading-kind="brief"/); assert.doesNotMatch(briefNode, /材料失败|正在读取|节点内容目录/);
  for (const [stage, id] of [['design', 'solution'], ['implementation', 'impl'], ['closeout', 'delivery']]) {
    const html = markup(TaskNodeContent, nodeProps(documents, stage));
    assert.match(html, new RegExp(`data-reading-id="${id}"`));
    assert.doesNotMatch(html, /短目标不得作为正文/);
    if (stage === 'closeout') assert.match(html, /交付结果/);
  }
});

test('记录说明为空时显示真实缺失，多个历史及归档Change只保留辅助来源', () => {
  const old = [change(), change('demo/archived', true)];
  for (const data of [null, result(), result([{ ...material('legacy-brief', 'brief'), exists: true, content: '旧说明文件' }])]) {
    const documents = taskDocuments(old, data);
    assert.equal(documents.filter(item => item.stage === 'requirements').length, 0);
    assert.equal(documents.filter(item => item.purpose === 'change-brief').length, 2);
    const record = { taskId: 'one', brief: null, intent: '短目标不得作为正文' };
    const html = markup(TaskNodeContent, { ...nodeProps(documents), record, materialsError: '材料失败', renderContent: readingContent({ data, loading: false, error: null }, record) });
    assert.match(html, /尚未填写任务说明/); assert.doesNotMatch(html, /旧说明文件|历史正文|短目标不得作为正文|材料失败/);
  }
});

test('变更实施清单只在独立清单入口显示，旧开发实现选择不会重复打开tasks.md', () => {
  const briefs = [change(), change('demo/archived', true)];
  const data = result([material()]);
  const documents = taskDocuments(briefs, data);
  const renderContent = target => React.createElement('p', { 'data-reading-path': target.path }, target.title);
  const implementation = markup(TaskNodeContent, { ...nodeProps(documents, 'implementation'), choices: { implementation: documents.find(item => item.purpose === 'checklist').key }, renderContent });
  assert.doesNotMatch(implementation, /tasks\.md|实施清单/);
  assert.match(implementation, /实现审查/); assert.match(implementation, /开发验证/);
  const checklist = markup(TaskChecklist, { open: true, pinned: false, canPin: true, onTogglePin() {}, onClose() {}, briefs, materials: { data, loading: false, error: null }, documents, renderContent });
  for (const source of briefs) assert.ok(checklist.includes(`data-reading-path="${source.change.artifacts.tasks.path}"`));
});

test('方案默认阅读真实方案，变更说明作为带身份的末尾辅助入口保留', () => {
  const source = change();
  const documents = taskDocuments([source], result());
  const renderContent = target => React.createElement('p', { 'data-reading-path': target.path }, target.title);
  const design = markup(TaskNodeContent, { ...nodeProps(documents, 'design'), renderContent });
  assert.ok(design.includes(`data-reading-path="${source.change.artifacts.proposal.path}"`));
  assert.match(design, /关联变更说明/);
  assert.ok(design.indexOf('方案审查') < design.indexOf('关联变更说明'));
  const briefItem = documents.find(item => item.purpose === 'change-brief');
  const chosen = markup(TaskNodeContent, { ...nodeProps(documents, 'design'), choices: { design: briefItem.key }, renderContent });
  assert.ok(chosen.includes(`data-reading-path="${source.change.brief.path}"`));
  const reader = markup(TaskArtifactReader, { change: source.change, artifactPath: source.change.brief.path, embedded: true, onClose() {}, onSelect() {} });
  assert.match(reader, /变更说明 · demo\/active/);
  assert.doesNotMatch(reader, /<span[^>]*>brief\.md<\/span>/);
});

test('组合任务默认直接阅读记录说明，材料读取等待或失败不阻断说明', () => {
  const data = result([material()]);
  const record = { taskId: 'one', brief: '# 组合任务正文', intent: '短目标不得作为正文', scope: { projects: [], services: [] } };
  for (const state of [{ data: null, loading: true, error: null }, { data, loading: false, error: '材料重核失败' }]) {
    const props = { record, briefs: [], documents: taskDocuments([], data), materials: state, onDocument() {}, renderContent: readingContent(state, record) };
    const html = markup(CompositeTaskPlan, props);
    assert.match(html, /data-task-brief="one"/); assert.doesNotMatch(html, /材料重核失败|正在读取任务材料|上次读取的正文/);
    assert.match(markup(CompositeTaskPlan, { ...props, record: { ...record, brief: null }, renderContent: readingContent(state, { ...record, brief: null }) }), /尚未填写任务说明/);
  }
});

test('active和archive的限定项目根链接指向相同正文，普通relative语义不变且拒绝解码后越界', () => {
  for (const source of [change(), change('demo/archive', true)]) {
    assert.equal(resolveProjectMarkdownHref(source.change.brief.path, '@project/tasks/one/brief.md#目标'), 'tasks/one/brief.md');
    assert.equal(resolveProjectMarkdownHref(source.change.brief.path, 'design.md'), source.change.artifacts.design.path);
  }
  for (const href of ['@project/../secret.md', '@project/%2e%2e/secret.md', '@project/a/%2e%2e/secret.md', '@project/%2fsecret.md', '@project/C%3A/secret.md', '@project/a%5csecret.md', '@project/a%00.md', '@project/https://host/secret.md', '@project/%ZZ.md', '@projects/tasks/one/brief.md', '@other/tasks/one/brief.md']) assert.equal(resolveProjectMarkdownHref('openspec/changes/archive/x/brief.md', href), null, href);
});

test('项目材料按source项目/path解析；本机链接只访问同task关联文档而非任意workspace', () => {
  const local = material('solution', 'solution', { kind: 'task', path: 'docs/brief.md' });
  const localSolution = material('solution', 'solution', { kind: 'task', path: 'solution.md' });
  const project = material('project', 'solution', { kind: 'project', project: 'demo', path: 'tasks/one/brief.md' });
  const docs = [local, localSolution, project];
  assert.deepEqual(resolveTaskMaterialLink(local, '../solution.md', docs), { kind: 'material', id: 'solution' });
  for (const href of ['../../solution.md', '../missing.md', '@project/tasks/one/brief.md', '../other-task/brief.md', '/solution.md', '%2fsolution.md', '..%5csolution.md', 'file:///secret.md', '%00.md']) assert.equal(resolveTaskMaterialLink(local, href, docs), null, href);
  assert.deepEqual(resolveTaskMaterialLink(project, '../shared.md', docs), { kind: 'project', project: 'demo', path: 'tasks/shared.md' });
  assert.deepEqual(resolveTaskMaterialLink(project, '@project/tasks/one/brief.md', docs), { kind: 'material', id: 'project' });
  assert.equal(resolveTaskMaterialLink(project, '../../../outside.md', docs), null);
});

test('材料刷新读取新版本并取消旧请求，即使旧响应晚到也不覆盖', async () => {
  const calls = [], states = [];
  const loader = createTaskMaterialsLoader('one', signal => { const pending = deferred(); calls.push({ ...pending, signal }); return pending.promise; }, state => states.push(state));
  const first = loader.refresh(), second = loader.refresh();
  assert.equal(calls[0].signal.aborted, true);
  calls[1].resolve(result([{ ...material(), content: '新正文', actualDigest: 'sha256-v2' }])); await second;
  calls[0].resolve(result([{ ...material(), content: '旧正文', actualDigest: 'sha256-v1' }])); await first;
  assert.equal(states.at(-1).data.documents[0].content, '新正文');
  assert.equal(states.at(-1).data.documents[0].actualDigest, 'sha256-v2');
});

test('项目根别名与普通路径互相引用保持关联材料身份，别名不增加可越界层级', () => {
  for (const briefPath of ['tasks/one/brief.md', '@project/tasks/one/brief.md']) {
    for (const implPath of ['tasks/one/implementation.md', '@project/tasks/one/implementation.md']) {
      const brief = material('solution', 'solution', { kind: 'project', project: 'demo', path: briefPath });
      const impl = material('impl', 'implementation', { kind: 'project', project: 'demo', path: implPath });
      for (const href of ['implementation.md', '@project/tasks/one/implementation.md']) {
        assert.deepEqual(resolveTaskMaterialLink(brief, href, [brief, impl]), { kind: 'material', id: 'impl' });
      }
      assert.deepEqual(resolveTaskMaterialLink(brief, '../shared.md', [brief, impl]), { kind: 'project', project: 'demo', path: 'tasks/shared.md' });
      assert.equal(resolveTaskMaterialLink(brief, '../../../outside.md', [brief, impl]), null);
    }
  }
});

test('任务切换/卸载取消材料响应；局部错误、身份不符和真实missing各自表达，可重试', async () => {
  const pending = deferred(), states = [];
  const loader = createTaskMaterialsLoader('one', () => pending.promise, state => states.push(state));
  const read = loader.refresh(); loader.dispose(); const count = states.length;
  pending.resolve(result([material()])); await read; assert.equal(states.length, count);
  let next = Promise.reject(new Error('材料读取失败')); const current = [];
  const retry = createTaskMaterialsLoader('two', () => next, state => current.push(state));
  await retry.refresh(); assert.equal(current.at(-1).error, '材料读取失败'); assert.equal(current.at(-1).data, null);
  next = Promise.resolve(result([], 'one')); await retry.refresh(); assert.match(current.at(-1).error, /身份不一致/);
  next = Promise.resolve(result([{ ...material(), exists: false, content: null, diagnostic: { code: 'missing', message: '缺失' } }], 'two')); await retry.refresh();
  assert.equal(current.at(-1).error, null); assert.equal(current.at(-1).data.documents[0].exists, false);
});

test('方案材料loading、局部错误与真实missing各自表达，不影响记录说明', () => {
  const loading = markup(TaskNodeContent, { ...nodeProps([], 'design'), materialsLoading: true });
  assert.match(loading, /正在读取内容/);
  const error = markup(TaskNodeContent, { ...nodeProps([], 'design'), materialsError: '网络读取异常' });
  assert.match(error, /任务材料读取失败：网络读取异常/);
  const data = result([{ ...material(), exists: false, content: null, diagnostic: { code: 'missing', message: '候选方案真实缺失' } }]);
  const html = markup(TaskReadingPane, { task: { record: { taskId: 'one' } }, target: { kind: 'material', id: 'solution' }, artifacts: { materials: { data, loading: false } }, onRead() {}, onClose() {} });
  assert.match(html, /候选方案真实缺失/); assert.doesNotMatch(html, /历史正文|真实独立材料正文/);
});

test('Drawer与普通ReadingPane保留材料时都由共享reader显示重核及失败状态，成功新版本清除旧反馈', () => {
  const data = result([{ ...material(), actualDigest: 'sha256-retained' }]);
  const base = { task: { record: { taskId: 'one' } }, target: { kind: 'material', id: 'solution' }, onRead() {}, onClose() {} };
  for (const inDrawer of [false, true]) {
    const loading = markup(TaskReadingPane, { ...base, inDrawer, artifacts: { materials: { data, loading: true, error: null } } });
    assert.match(loading, /data-task-material="solution"/); assert.match(loading, /sha256-retained/); assert.match(loading, /已读正文正在核对/);
    assert.doesNotMatch(loading, /正在读取任务材料/);
    const failed = markup(TaskReadingPane, { ...base, inDrawer, artifacts: { materials: { data, loading: false, error: '材料服务暂不可用' } } });
    assert.match(failed, /任务材料读取失败：材料服务暂不可用/); assert.match(failed, /上次读取的正文，尚未确认新版本/); assert.match(failed, /sha256-retained/);
    const fresh = markup(TaskReadingPane, { ...base, inDrawer, artifacts: { materials: { data: result([{ ...material(), actualDigest: 'sha256-fresh' }]), loading: false, error: null } } });
    assert.match(fresh, /sha256-fresh/); assert.doesNotMatch(fresh, /sha256-retained|正在核对|任务材料读取失败/);
  }
  const unavailable = markup(TaskReadingPane, { ...base, inDrawer: true, artifacts: { materials: { data: null, loading: false, error: '材料关联不可读取' } } });
  assert.match(unavailable, /材料关联不可读取/); assert.doesNotMatch(unavailable, /data-task-material=/);
});

test('实施清单复用同一ReadingPane和TaskMaterialReader，缓存正文的loading/error不会遗漏或重复', () => {
  const data = result([material('impl', 'implementation')]);
  const documents = taskDocuments([], data);
  const props = { open: true, pinned: false, canPin: true, onTogglePin() {}, onClose() {}, briefs: [], documents };
  for (const state of [{ data, loading: true, error: null }, { data, loading: false, error: '清单材料读取异常' }]) {
    const html = markup(TaskChecklist, { ...props, materials: state, renderContent: readingContent(state) });
    assert.match(html, /id="task-checklist-panel"/); assert.match(html, /data-task-material="impl"/); assert.match(html, /data-task-material-role="implementation"/);
    const feedback = state.loading ? '已读正文正在核对' : '任务材料读取失败：清单材料读取异常';
    assert.equal(html.split(feedback).length - 1, 1);
    if (state.error) assert.match(html, /上次读取的正文，尚未确认新版本/);
  }
});

test('没有已读实施材料时，首次等待、读取失败及空清单重核不能误报暂无', () => {
  const props = { open: true, pinned: false, canPin: true, onTogglePin() {}, onClose() {}, briefs: [{ kind: 'empty' }], documents: [], renderContent() { throw new Error('没有条目不应调用阅读器'); } };
  for (const data of [null, result()]) {
    const waiting = markup(TaskChecklist, { ...props, materials: { data, loading: true, error: null } });
    assert.match(waiting, /正在读取实施清单/); assert.doesNotMatch(waiting, /暂无实施清单/);
    const failed = markup(TaskChecklist, { ...props, materials: { data, loading: false, error: '材料读取异常' } });
    assert.match(failed, /任务材料读取失败：材料读取异常/); assert.doesNotMatch(failed, /暂无实施清单/);
  }
  const ready = { data: result(), loading: false, error: null };
  assert.match(markup(TaskChecklist, { ...props, materials: ready }), /暂无实施清单/);
  assert.doesNotMatch(markup(TaskChecklist, { ...props, briefsLoading: true, materials: ready }), /暂无实施清单/);
  const diagnostic = { ...ready, data: { ...result(), diagnostics: [{ code: 'unreadable', message: '关联状态无法确认' }] } };
  const unknown = markup(TaskChecklist, { ...props, materials: diagnostic });
  assert.match(unknown, /关联状态无法确认/); assert.doesNotMatch(unknown, /暂无实施清单/);
});

test('同名任务跨工作空间的原型读取相互隔离，旧请求晚到不覆盖新工作空间', async () => {
  const harness = artifactHookHarness();
  const { useTaskArtifacts } = await import('../src/features/task/hooks/useTaskArtifacts.ts');
  const reads = [];
  const lifecycle = { run(taskId, operation) {
    if (operation.startsWith('materials:')) return Promise.resolve(result([], taskId));
    const pending = deferred(); reads.push({ ...pending, operation }); return pending.promise;
  } };
  const render = workspace => harness.render(useTaskArtifacts, 'shared-prototype-task', 'same-record', lifecycle, workspace);
  try {
    const first = render('prototype-A').refreshPrototype();
    const second = render('prototype-B').refreshPrototype();
    assert.notEqual(reads[0].operation, reads[1].operation, '同名任务请求去重不能跨工作空间');
    const current = { prototypes: [{ id: 'B' }] };
    reads[1].resolve(current); await second;
    reads[0].resolve({ prototypes: [{ id: 'A' }] }); await first;
    assert.deepEqual(render('prototype-B').prototypeData, current);
  } finally { harness.dispose(); }
});

test('真实artifacts hook在Task recordDigest变化后重读材料，普通render复用，显式refresh仍读取正文', async () => {
  // This only models hook scheduling; requests, dependency declarations, and
  // material state transitions execute the real useTaskArtifacts implementation.
  const harness = artifactHookHarness();
  const { useTaskArtifacts } = await import('../src/features/task/hooks/useTaskArtifacts.ts');
  const operations = [];
  const lifecycle = { run(taskId, operation) { operations.push(operation); return Promise.resolve(result([material()], taskId)); } };
  const render = async recordDigest => {
    const output = harness.render(useTaskArtifacts, 'one', recordDigest, lifecycle);
    await settle();
    return output;
  };
  try {
    await render('record-v1'); assert.equal(operations.filter(item => item.startsWith('materials:')).length, 1);
    await render('record-v1'); assert.equal(operations.filter(item => item.startsWith('materials:')).length, 1, '普通render不重读材料');
    const output = await render('record-v2'); assert.equal(operations.filter(item => item.startsWith('materials:')).length, 2, '同Task修改scope/changes后必须重读');
    await output.refreshMaterials(); assert.equal(operations.filter(item => item.startsWith('materials:')).length, 3, '正文更新无需Task record变化');
  } finally { harness.dispose(); }
});

test('同workspace返回已读材料不中断正文，后台重核和失败明确标上次读取，显式refresh接受新正文及真实missing', async () => {
  const harness = artifactHookHarness();
  const { useTaskArtifacts } = await import('../src/features/task/hooks/useTaskArtifacts.ts');
  const reads = [];
  const lifecycle = { run(taskId, operation) { const read = deferred(); reads.push({ ...read, taskId, operation }); return read.promise; } };
  const render = (taskId = 'cache-return') => harness.render(useTaskArtifacts, taskId, 'cache-record-v1', lifecycle, 'cache-return-workspace');
  const observed = (content, digest) => result([{ ...material(), content, actualDigest: digest }], 'cache-return');
  try {
    assert.equal(render().materials.data, null);
    reads[0].resolve(observed('上次读取正文', 'sha256-old')); await settle();
    assert.equal(render().materials.data.documents[0].content, '上次读取正文');
    render('cache-other'); render();
    let output = render();
    assert.equal(output.materials.data.documents[0].content, '上次读取正文');
    assert.equal(output.materials.loading, true);
    const docs = taskDocuments([], output.materials.data);
    const cachedNode = markup(TaskNodeContent, { ...nodeProps(docs, 'design'), materialsLoading: true, renderContent: readingContent(output.materials) });
    assert.match(cachedNode, /已读正文正在核对/); assert.match(cachedNode, /data-task-material="solution"/);
    assert.equal(cachedNode.split('已读正文正在核对').length - 1, 1, 'Node不重复reader状态提示');
    const cachedReader = markup(TaskReadingPane, { task: { record: { taskId: 'cache-return' } }, target: { kind: 'material', id: 'solution' }, artifacts: { materials: output.materials }, onRead() {} });
    assert.match(cachedReader, /data-task-material="solution"/); assert.doesNotMatch(cachedReader, /正在读取任务材料/);
    reads[2].resolve(observed('后台读到新正文', 'sha256-new')); await settle();
    output = render(); assert.equal(output.materials.data.documents[0].actualDigest, 'sha256-new');
    const failed = output.refreshMaterials(); reads.at(-1).reject(new Error('重核暂时失败')); await failed;
    output = render();
    assert.equal(output.materials.data.documents[0].content, '后台读到新正文'); assert.equal(output.materials.error, '重核暂时失败');
    const failedNode = markup(TaskNodeContent, { ...nodeProps(taskDocuments([], output.materials.data), 'design'), materialsError: output.materials.error, renderContent: readingContent(output.materials) });
    assert.match(failedNode, /上次读取的正文，尚未确认新版本/);
    assert.equal(failedNode.split('任务材料读取失败：重核暂时失败').length - 1, 1);
    const refresh = output.refreshMaterials();
    reads.at(-1).resolve(result([{ ...material(), exists: false, content: null, actualDigest: null, diagnostic: { code: 'missing', message: '新读取确认正文缺失' } }], 'cache-return')); await refresh;
    output = render(); assert.equal(output.materials.data.documents[0].exists, false); assert.equal(output.materials.data.documents[0].content, null); assert.equal(output.materials.error, null);
  } finally { harness.dispose(); reads.forEach(read => read.resolve(result([], read.taskId))); await settle(); }
});

test('材料cache及晚响应不混入同名Task的其他workspace，record版本改变不展示旧版', async () => {
  const harness = artifactHookHarness();
  const { useTaskArtifacts } = await import('../src/features/task/hooks/useTaskArtifacts.ts');
  const reads = [];
  const lifecycle = { run(taskId, operation) { const read = deferred(); reads.push({ ...read, taskId, operation }); return read.promise; } };
  const render = (workspaceId, recordDigest = 'shared-record') => harness.render(useTaskArtifacts, 'shared-task', recordDigest, lifecycle, workspaceId);
  try {
    render('workspace-A'); reads[0].resolve(result([{ ...material(), content: 'A的正文' }], 'shared-task')); await settle();
    let output = render('workspace-A'); assert.equal(output.materials.data.documents[0].content, 'A的正文');
    const stale = output.refreshMaterials();
    output = render('workspace-B'); assert.equal(output.materials.data, null);
    assert.notEqual(reads[1].operation, reads[2].operation, '请求去重身份必须包含workspace');
    reads[1].resolve(result([{ ...material(), content: 'A的迟到正文' }], 'shared-task')); await stale;
    assert.equal(render('workspace-B').materials.data, null);
    reads[2].resolve(result([{ ...material(), content: 'B的正文' }], 'shared-task')); await settle();
    assert.equal(render('workspace-B').materials.data.documents[0].content, 'B的正文');
    output = render('workspace-B', 'changed-scope-record'); assert.equal(output.materials.data, null, 'Task scope/changes版本改变后旧cache不冒充新对象');
    reads.at(-1).resolve(result([{ ...material(), content: 'B新范围的正文' }], 'shared-task')); await settle();
    assert.equal(render('workspace-B', 'changed-scope-record').materials.data.documents[0].content, 'B新范围的正文');
  } finally { harness.dispose(); reads.forEach(read => read.resolve(result([], read.taskId))); await settle(); }
});

test('独立材料session cache最多保留32个Task，淘汰项返回时真实重读而不是无限保留', async () => {
  const harness = artifactHookHarness();
  const { useTaskArtifacts } = await import('../src/features/task/hooks/useTaskArtifacts.ts');
  let reads = 0;
  const lifecycle = { run(taskId) { reads += 1; return Promise.resolve(result([{ ...material(), content: `观察-${reads}` }], taskId)); } };
  const render = index => harness.render(useTaskArtifacts, `bounded-${index}`, `bounded-record-${index}`, lifecycle, 'bounded-material-workspace');
  try {
    for (let index = 0; index <= 32; index += 1) { render(index); await settle(); }
    assert.equal(render(0).materials.data, null, '最早材料已被有界cache淘汰');
    await settle();
    assert.equal(render(0).materials.data.documents[0].content, '观察-34'); assert.equal(reads, 34);
  } finally { harness.dispose(); }
});

test('材料HTTP客户端携带任务身份和cancellation，读取不触发写session', async () => {
  const signal = new AbortController().signal, calls = [];
  const client = createTaskClient(async (path, options) => { calls.push({ path, options }); return result(); });
  await client.materials('task/id', { signal });
  assert.equal(calls[0].path, '/api/v1/tasks/task%2Fid/materials');
  assert.equal(calls[0].options.signal, signal);
  assert.equal(calls[0].options.method, undefined);
});

test('审查与验证独立于changes：保存对象/依据可读，missing不标不适用，failed与gaps分离', () => {
  const base = { task: { record: { taskId: 'one', changes: [], scope: { projects: ['demo'] } } }, artifacts: { briefs: [] }, evidence: {}, onClose() {}, onRead() {}, href: path => path };
  const review = { taskId: 'one', subjectIdentity: 'reviewed-v1', completedAt: '2026-01-01T00:00:00Z', method: 'self', reviewed: ['任务目标与候选方案'], findings: [], uncovered: [{ subject: '窄屏', reason: '未执行浏览器验收' }], conclusion: { outcome: 'accepted', summary: '已保存审查' } };
  const reviewed = markup(TaskReadingPane, { ...base, target: { kind: 'review', reviewType: 'planning', title: '方案审查', digest: '' }, evidence: { reviewData: { slots: { planning: { result: review, resultDigest: 'sha256-one' } } } } });
  for (const text of ['reviewed-v1', '任务目标与候选方案', '未执行浏览器验收', '保存结论：通过', '不代表当前材料版本']) assert.ok(reviewed.includes(text));
  const check = outcome => ({ id: outcome, outcome, testing: 'front-tests', selection: 'focus', source: 'command', summary: outcome, targets: ['材料断点'], project: 'demo' });
  const report = { content: { identity: 'tested-v1', summary: '候选前端' }, declarations: [{ project: 'demo', path: 'verification.yml', identity: 'map-v1', status: 'ready' }], completedAt: '2026-01-01T00:00:00Z', checks: [check('passed'), check('failed')], gaps: [{ testing: 'browser', reason: '环境不可用，未执行' }], conclusion: { outcome: 'incomplete', summary: '尚有缺口' } };
  const html = markup(TaskReadingPane, { ...base, target: { kind: 'verification' }, evidence: { verificationData: { slot: { report, applicability: { status: 'unknown' } } } } });
  for (const text of ['tested-v1', 'map-v1', '保存结论：未完成', '通过', '失败', '环境不可用，未执行']) assert.ok(html.includes(text), text);
  const singleFailed = markup(TaskReadingPane, { ...base, target: { kind: 'verification' }, evidence: { verificationData: { slot: { report: { ...report, checks: [check('failed')], conclusion: { outcome: 'not-passed', summary: '执行失败' } } } } } });
  assert.match(singleFailed, /task-check-outcome failed/);
  for (const kind of ['review', 'verification']) assert.doesNotMatch(markup(TaskReadingPane, { ...base, target: { kind, reviewType: 'planning', digest: '' } }), /不适用|通过|失败/);
});
