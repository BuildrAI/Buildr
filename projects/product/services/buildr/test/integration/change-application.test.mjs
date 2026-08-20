import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { registerChangeApplication } from '../../src/application/change/change-application.mjs';

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-change-'));
  const project = {
    id: 'd15bde2c-9aab-4ed8-bf43-28a5372ca407',
    code: 'product',
    name: 'Buildr Product',
    source: { type: 'workspace', path: 'projects/product' },
  };
  const runtime = {
    listProjects: () => ({ projects: [project] }),
    projectDetail: (_targetRoot, code) => {
      if (code !== project.code) {
        const error = new Error(`Project 不存在：${code}。`);
        error.code = 'project_not_found';
        error.status = 404;
        throw error;
      }
      return { project };
    },
  };
  registerChangeApplication(runtime);
  return { root, runtime, projectRoot: path.join(root, project.source.path) };
}

function writeChange(projectRoot, relative, files = {}) {
  const root = path.join(projectRoot, 'openspec', 'changes', relative);
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, '.openspec.yaml'), 'schema: spec-driven\n');
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(root, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
  }
  return root;
}

test('Change read model 分开索引进行中与已归档，并按 checkbox 计算进度', (t) => {
  const { root, runtime, projectRoot } = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  writeChange(projectRoot, 'ship-ui', {
    'proposal.md': '# Ship Change UI\n',
    'tasks.md': '- [x] model\n- [ ] ui\ntext [x] ignored\n',
    'specs/change-ui/spec.md': '# Change UI Specification\n',
  });
  writeChange(projectRoot, 'archive/2026-07-22-old-flow', { 'proposal.md': '# Old Flow\n' });
  fs.mkdirSync(path.join(projectRoot, 'openspec', 'changes', 'not-a-change'));

  const result = runtime.listChanges(root);
  assert.deepEqual(result.changes.map(({ code, lifecycle }) => [code, lifecycle]).sort(), [
    ['old-flow', 'archived'],
    ['ship-ui', 'active'],
  ].sort());
  assert.deepEqual(result.changes.find(({ code }) => code === 'ship-ui').progress, { exists: true, completed: 1, total: 2, remaining: 1 });
  assert.deepEqual(result.changes.find(({ code }) => code === 'old-flow').progress, { exists: false, completed: null, total: null, remaining: null });
});

test('Change detail 读取 Buildr Brief 与标准 artifacts 并拒绝路径逃逸', (t) => {
  const { root, runtime, projectRoot } = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  writeChange(projectRoot, 'safe-change', {
    'brief.md': '# Safe Change Brief\n\n## Summary\nHuman readable.\n',
    'proposal.md': '# Safe Change\nProposal body.\n',
    'design.md': '# Design\n',
    'tasks.md': '- [ ] work\n',
    'specs/capability/spec.md': '# Capability Specification\n',
    'secret.txt': 'must not be exposed',
  });

  const { change } = runtime.changeDetail(root, 'product', 'active~safe-change');
  assert.deepEqual(change.brief, {
    kind: 'buildr-companion',
    exists: true,
    path: 'projects/product/openspec/changes/safe-change/brief.md',
    content: '# Safe Change Brief\n\n## Summary\nHuman readable.\n',
  });
  assert.equal(change.artifacts.proposal.content, '# Safe Change\nProposal body.\n');
  assert.equal(change.artifacts.specs[0].capability, 'capability');
  assert.equal(JSON.stringify(change).includes('must not be exposed'), false);
  assert.throws(() => runtime.changeDetail(root, 'product', 'active~..'), /不合法/);
  assert.throws(() => runtime.changeDetail(root, 'product', 'active~missing'), /不存在/);
});

test('Change detail 对缺失或不安全 Brief 保持兼容且零写入', (t) => {
  const { root, runtime, projectRoot } = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const legacyRoot = writeChange(projectRoot, 'legacy-change', { 'proposal.md': '# Legacy\n' });
  const before = fs.readdirSync(legacyRoot).sort();
  const legacy = runtime.changeDetail(root, 'product', 'active~legacy-change').change;
  assert.equal(legacy.brief.exists, false);
  assert.equal('content' in legacy.brief, false);
  assert.deepEqual(fs.readdirSync(legacyRoot).sort(), before);

  const outside = path.join(root, 'outside-brief.md');
  fs.writeFileSync(outside, '# Outside\n');
  const unsafeRoot = writeChange(projectRoot, 'unsafe-brief', { 'proposal.md': '# Unsafe\n' });
  fs.symlinkSync(outside, path.join(unsafeRoot, 'brief.md'));
  const unsafe = runtime.changeDetail(root, 'product', 'active~unsafe-brief').change;
  assert.equal(unsafe.brief.exists, false);
  assert.equal(JSON.stringify(unsafe).includes('Outside'), false);
});

test('Archived Change 随目录投影 Brief', (t) => {
  const { root, runtime, projectRoot } = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  writeChange(projectRoot, 'archive/2026-07-25-readable', {
    'brief.md': '# Archived Brief\n',
    'proposal.md': '# Readable\n',
  });
  const change = runtime.changeDetail(root, 'product', 'archived~2026-07-25-readable').change;
  assert.equal(change.lifecycle, 'archived');
  assert.equal(change.brief.content, '# Archived Brief\n');
});

test('Change prompt-only 操作解析真实 Change 且保护归档历史', (t) => {
  const { root, runtime, projectRoot } = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  writeChange(projectRoot, 'archive/2026-07-22-finished', { 'proposal.md': '# Finished\n' });

  const created = runtime.generateChangeCreatePrompt(root, { projectCode: 'product', goal: '建立变更管理' });
  assert.match(created.prompt, /建立变更管理/);
  assert.equal(created.copiedMeansCreated, false);

  const reviewed = runtime.generateChangeActionPrompt(root, { projectCode: 'product', ref: 'archived~2026-07-22-finished', action: 'review' });
  assert.match(reviewed.prompt, /默认只读/);
  assert.match(reviewed.prompt, /不要直接修改/);
  assert.throws(() => runtime.generateChangeActionPrompt(root, { projectCode: 'product', ref: 'archived~2026-07-22-finished', action: 'archive' }), /仅支持/);
});

test('Task-scoped Change 使用 saved Environment current，并让 ready 与 blocked 共享只读 locator', (t) => {
  const { root, runtime } = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const validationRoot = path.join(root, 'task-root');
  const candidateProjectRoot = path.join(validationRoot, 'projects', 'product');
  writeChange(candidateProjectRoot, 'candidate-only', { 'proposal.md': '# Candidate only\n' });
  runtime.readTaskRecordPersistence = () => ({ record: { taskId: 'reader-task' } });
  runtime.inspectTaskEnvironment = () => { throw new Error('Task-scoped Change 不得运行 live Environment inspect。'); };

  for (const status of ['ready', 'blocked']) {
    runtime.readTaskEnvironmentCurrent = () => ({
      status,
      environment: {
        scopes: [{
          selector: 'project:product',
          kind: 'project',
          project: 'product',
          sourcePath: 'projects/product',
          executionRoot: candidateProjectRoot,
          validationRoot,
        }],
      },
    });
    const resolved = runtime.resolveTaskScopedChange(root, 'reader-task', { project: 'product', change: 'candidate-only' }, { includeContent: true });
    assert.equal(resolved.availability, 'available');
    assert.equal(resolved.workingCopy.provenance, 'task-environment-candidate');
    assert.equal(resolved.workingCopy.change.artifacts.proposal.content, '# Candidate only\n');
  }
});

test('Task-scoped Change 对失效路径和无法证明的 Project scope 保持 fail closed', (t) => {
  const { root, runtime } = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const validationRoot = path.join(root, 'task-root');
  const candidateProjectRoot = path.join(validationRoot, 'projects', 'product');
  writeChange(candidateProjectRoot, 'candidate-only', { 'proposal.md': '# Candidate only\n' });
  runtime.readTaskRecordPersistence = () => ({ record: { taskId: 'reader-task' } });

  const scope = {
    selector: 'project:product',
    kind: 'project',
    project: 'product',
    sourcePath: 'projects/product',
    executionRoot: candidateProjectRoot,
    validationRoot,
  };
  const resolveWith = (candidateScope) => {
    runtime.readTaskEnvironmentCurrent = () => ({ status: 'blocked', environment: { scopes: [candidateScope] } });
    return runtime.resolveTaskScopedChange(root, 'reader-task', { project: 'product', change: 'candidate-only' });
  };

  assert.equal(resolveWith({ ...scope, executionRoot: path.join(validationRoot, 'missing') }).availability, 'unavailable');
  assert.equal(resolveWith({ ...scope, sourcePath: 'projects/renamed-product' }).availability, 'unavailable');
  assert.equal(resolveWith({ ...scope, validationRoot: path.join(root, 'different-task-root') }).availability, 'unavailable');
});

test('Task UI Prototype 从候选 working Change 发现带标记完整 HTML 并报告安全跳过', (t) => {
  const { root, runtime, projectRoot } = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const validationRoot = path.join(root, 'task-root');
  const candidateProjectRoot = path.join(validationRoot, 'projects', 'product');
  writeChange(projectRoot, 'previewed', {
    'prototype.html': '<!doctype html><html><head><title>Retained Prototype</title></head><body><!-- buildr:ui-prototype --></body></html>',
  });
  const candidateChangeRoot = writeChange(candidateProjectRoot, 'previewed', {
    'screens/task.html': '<!doctype html><html><head><title>Candidate Task Prototype</title><style>body{color:#123}</style></head><body><!-- buildr:ui-prototype --><button>切换</button></body></html>',
    'screens/detail.html': '<!doctype html><html><head><title>Candidate Detail Prototype</title></head><body><!-- buildr:ui-prototype --><a href="task.html">返回</a></body></html>',
    'screens/legacy.html': '<!doctype html><html><head><title>Legacy Preview</title></head><body><!-- buildr:ui-preview --></body></html>',
    'screens/unmarked.html': '<!doctype html><html><head><title>Ignored</title></head><body>not a prototype</body></html>',
    'screens/incomplete.html': '<!-- buildr:ui-prototype --><title>Incomplete</title>',
    'screens/large.html': `<!doctype html><html><head><title>Large</title></head><body><!-- buildr:ui-prototype -->${'x'.repeat((2 * 1024 * 1024) + 1)}</body></html>`,
  });
  const outside = path.join(root, 'outside.html');
  fs.writeFileSync(outside, '<!doctype html><html><head><title>Outside</title></head><body><!-- buildr:ui-prototype --></body></html>');
  fs.symlinkSync(outside, path.join(candidateChangeRoot, 'screens', 'linked.html'));

  runtime.readTaskRecordPersistence = () => ({ record: { taskId: 'prototype-task' } });
  runtime.inspectTaskRecord = () => ({ record: { taskId: 'prototype-task', changes: [{ project: 'product', change: 'previewed' }] } });
  runtime.readTaskEnvironmentCurrent = () => ({
    status: 'ready',
    environment: {
      scopes: [{
        selector: 'project:product',
        kind: 'project',
        project: 'product',
        sourcePath: 'projects/product',
        executionRoot: candidateProjectRoot,
        validationRoot,
      }],
    },
  });

  const result = runtime.taskUiPrototypes(root, 'prototype-task');
  assert.equal(result.taskId, 'prototype-task');
  assert.equal(result.prototypes.length, 2);
  const taskPrototype = result.prototypes.find((item) => item.path === 'screens/task.html');
  assert.ok(taskPrototype);
  assert.deepEqual({
    id: taskPrototype.id,
    title: taskPrototype.title,
    path: taskPrototype.path,
    lifecycle: taskPrototype.lifecycle,
    provenance: taskPrototype.provenance,
  }, {
    id: taskPrototype.id,
    title: 'Candidate Task Prototype',
    path: 'screens/task.html',
    lifecycle: 'active',
    provenance: 'task-environment-candidate',
  });
  assert.match(taskPrototype.id, /^[a-f0-9]{32}$/);
  assert.equal(Object.hasOwn(taskPrototype, 'html'), false);
  const page = runtime.taskUiPrototype(root, 'prototype-task', taskPrototype.id);
  assert.equal(page.html.includes('Candidate Task Prototype'), true);
  assert.equal(page.html.includes('Retained Prototype'), false);
  assert.equal(page.html.includes('not a prototype'), false);
  assert.equal(result.prototypes.some((item) => item.title === 'Candidate Detail Prototype'), true);
  assert.equal(result.prototypes.some((item) => item.title === 'Legacy Preview'), false);
  assert.throws(() => runtime.taskUiPrototype(root, 'prototype-task', 'not-an-id'), (error) => error.code === 'ui_prototype_reference_invalid');
  assert.throws(() => runtime.taskUiPrototype(root, 'prototype-task', '0'.repeat(32)), (error) => error.code === 'ui_prototype_not_found');
  assert.deepEqual(new Set(result.diagnostics.map(({ code }) => code)), new Set([
    'ui_prototype_document_incomplete',
    'ui_prototype_file_too_large',
    'ui_prototype_symlink_ignored',
  ]));
  assert.equal(JSON.stringify(result).includes(root), false);
});

test('Task UI Prototype 从 archived retained Change 继续读取且无 Change 时返回空态', (t) => {
  const { root, runtime, projectRoot } = fixture();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  writeChange(projectRoot, 'archive/2026-08-18-previewed', {
    'anywhere/archived.html': '<!doctype html><html><head><title>Archived Prototype</title></head><body><!-- buildr:ui-prototype --></body></html>',
  });
  runtime.readTaskRecordPersistence = () => ({ record: { taskId: 'archived-task' } });
  runtime.readTaskEnvironmentCurrent = () => ({ status: 'unavailable', environment: null });
  runtime.inspectTaskRecord = (_targetRoot, taskId) => ({
    record: {
      taskId,
      changes: taskId === 'empty-task' ? [] : [{ project: 'product', change: 'previewed' }],
    },
  });

  const archived = runtime.taskUiPrototypes(root, 'archived-task');
  assert.equal(archived.prototypes.length, 1);
  assert.equal(archived.prototypes[0].lifecycle, 'archived');
  assert.equal(archived.prototypes[0].provenance, 'retained-archive');
  assert.equal(archived.prototypes[0].path, 'anywhere/archived.html');
  assert.equal(runtime.taskUiPrototype(root, 'archived-task', archived.prototypes[0].id).html.includes('Archived Prototype'), true);
  assert.deepEqual(runtime.taskUiPrototypes(root, 'empty-task'), { taskId: 'empty-task', prototypes: [], diagnostics: [] });
});
