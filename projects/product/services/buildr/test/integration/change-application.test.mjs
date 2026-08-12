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
