import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import test, { after, type TestContext } from 'node:test';
import { createRuntime, runtimeProvide } from '../helpers/runtime-harness.ts';
import { taskRecordFixture } from '../helpers/task-record-system-fixture.ts';
import { copyPreparedWorkspace } from '../helpers/prepared-fixtures.ts';
import { cleanupLocalTaskLifecycleSystemContext } from '../helpers/task-lifecycle-system-context.ts';
import { createLocalWorkspaceServer } from '../../src/web/http/server.ts';
import { TASK_MATERIALS_APPLICATION } from '../../src/modules/task/materials/module.ts';
import { createTaskMaterialsApplication, type TaskMaterialsApplication } from '../../src/modules/task/materials/application/task-materials-application.ts';
import type { TaskMaterialReference } from '../../build/generated/task-dto.ts';
import type { MarkdownImageContext } from '../../src/infrastructure/filesystem/markdown-images.ts';

after(() => cleanupLocalTaskLifecycleSystemContext());
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9ZkAAAAASUVORK5CYII=', 'base64');
const write = (file: string, bytes: string | Buffer) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, bytes); };
const request = (context: MarkdownImageContext, href = '../assets/example.png') => ({ ...context, href });
const query = (context: MarkdownImageContext, href: string, documentPath?: string) => new URLSearchParams({ href, expectedDocumentDigest: context.documentDigest, expectedSourceIdentity: context.sourceIdentity, ...(documentPath ? { documentPath } : {}) }).toString();
const code = (expected: string) => (error: unknown) => error instanceof Error && 'code' in error && error.code === expected;
const projectRef = (relative = 'docs/guide.md'): TaskMaterialReference => ({ id: 'solution', role: 'solution', title: '项目材料', source: { kind: 'project', project: 'app', path: relative } });
const localRef = (relative = 'docs/guide.md'): TaskMaterialReference => ({ id: 'solution', role: 'solution', title: '本机材料', source: { kind: 'task', path: relative } });

test('公开三类图片HTTP返回同源受控字节，拒绝错误主体、未知/重复参数及陈旧正文', { timeout: 30000 }, async t => {
  const { base, root } = taskRecordFixture(t, 'document-images-http');
  const priorApp = process.env.BUILDR_APP_DATA_DIR, priorProduct = process.env.BUILDR_PRODUCT_DATA_DIR;
  process.env.BUILDR_APP_DATA_DIR = path.join(base, 'app-data');
  process.env.BUILDR_PRODUCT_DATA_DIR = path.join(base, 'product-data');
  t.after(() => {
    if (priorApp === undefined) delete process.env.BUILDR_APP_DATA_DIR; else process.env.BUILDR_APP_DATA_DIR = priorApp;
    if (priorProduct === undefined) delete process.env.BUILDR_PRODUCT_DATA_DIR; else process.env.BUILDR_PRODUCT_DATA_DIR = priorProduct;
  });
  const runtime = createRuntime();
  runtime.createTask(root, { taskId: 'images-one', title: '图片阅读', intent: '核对公开图片边界', projects: ['demo'], services: [], changes: [] });
  runtime.createTask(root, { taskId: 'images-two', title: '另一个任务', intent: '核对任务身份隔离', projects: ['demo'], services: [], changes: [] });
  const application = runtimeProvide(runtime, TASK_MATERIALS_APPLICATION) as TaskMaterialsApplication;
  const body = '# 正文\n![图片](../assets/图%20表.png)\n';
  const projectRoot = path.join(root, 'projects/demo');
  write(path.join(projectRoot, 'docs/guide.md'), body);
  write(path.join(projectRoot, 'assets/图 表.png'), png);
  for (const taskId of ['images-one', 'images-two']) {
    application.writeTaskMaterialDocument(root, taskId, { path: 'docs/guide.md', content: body, expectedDocumentDigest: 'absent' });
    write(path.join(root, '.buildr/local/task-materials', taskId, 'assets/图 表.png'), png);
    application.recordTaskMaterials(root, taskId, { expectedCurrent: 'absent', documents: [localRef()] });
  }
  const instance = createLocalWorkspaceServer(runtime, { targetRoot: root });
  t.after(() => new Promise<void>(resolve => instance.server.close(() => resolve())));
  const { url, initialWorkspaceId } = await instance.ready;
  const prefix = `${url}/api/v1/workspaces/${initialWorkspaceId}`;
  const json = async (suffix: string) => { const response = await fetch(prefix + suffix); assert.equal(response.status, 200, await response.clone().text()); return response.json() as Promise<any>; };
  const href = '../assets/图%20表.png';
  const project = await json('/projects/demo/documents/docs/guide.md');
  const materials = await json('/tasks/images-one/materials');
  const linked = await json('/tasks/images-one/documents/demo/docs/guide.md');
  assert.ok(project.imageContext); assert.ok(materials.documents[0].imageContext); assert.ok(linked.imageContext);
  const endpoints = [
    `/projects/demo/document-image?${query(project.imageContext, href, 'docs/guide.md')}`,
    `/tasks/images-one/materials/solution/image?${query(materials.documents[0].imageContext, href)}`,
    `/tasks/images-one/document-image/demo?${query(linked.imageContext, href, 'docs/guide.md')}`,
  ];
  for (const endpoint of endpoints) {
    const response = await fetch(prefix + endpoint);
    assert.equal(response.status, 200, await response.clone().text());
    assert.equal(response.headers.get('content-type'), 'image/png');
    assert.match(response.headers.get('cache-control') || '', /no-store/);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.match(response.headers.get('content-disposition') || '', /^inline;/);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), png);
    for (const invalid of [`${endpoint}&unexpected=true`, `${endpoint}&href=${encodeURIComponent(href)}`]) {
      const denied = await fetch(prefix + invalid);
      assert.equal(denied.status, 400); assert.equal((await denied.json() as any).error.code, 'document_image_input_invalid');
    }
    for (const field of ['path', 'root', 'target']) {
      const denied = await fetch(prefix + `${endpoint}&${field}=${encodeURIComponent(base)}`);
      assert.equal(denied.status, 400, '不得通过query选择任意本机路径或目标');
      assert.equal((await denied.json() as any).error.code, 'target_forbidden');
    }
  }
  assert.equal((await fetch(prefix + endpoints[1].replace('images-one', 'images-two'))).status, 409, '相同正文不能跨Task复用来源观察');
  assert.equal((await fetch(prefix + endpoints[1].replace('images-one', 'missing-task'))).status, 404);
  assert.equal((await fetch(prefix + endpoints[2].replace('/demo?', '/other?'))).status, 403, '项目不在Task scope中');
  assert.equal((await fetch(`${url}/api/v1/workspaces/unknown-workspace${endpoints[0]}`)).status, 404);
  fs.appendFileSync(path.join(projectRoot, 'docs/guide.md'), '\n其他入口刚修改正文。\n');
  assert.equal((await fetch(prefix + endpoints[0])).status, 409);
  assert.equal((await fetch(prefix + endpoints[2])).status, 409);
  const fresh = await json('/projects/demo/documents/docs/guide.md');
  assert.equal((await fetch(prefix + `/projects/demo/document-image?${query(fresh.imageContext, href, 'docs/guide.md')}`)).status, 200);
  const record = runtime.readTask(root, 'images-one');
  runtime.updateTask(root, 'images-one', { expectedRecordDigest: record.recordDigest, removeProjects: ['demo'] });
  assert.equal((await fetch(prefix + endpoints[2])).status, 403, 'Task范围移除后旧图片观察不能放行');
  assert.equal((await fetch(prefix + endpoints[1])).status, 200, '范围变化不阻止同Task本机材料');
  const observed = fresh.imageContext;
  const savedRoot = path.join(root, 'projects/demo-before-replacement');
  fs.renameSync(projectRoot, savedRoot); fs.cpSync(savedRoot, projectRoot, { recursive: true });
  assert.equal(fs.readFileSync(path.join(projectRoot, 'docs/guide.md'), 'utf8'), fresh.content);
  assert.equal((await fetch(prefix + `/projects/demo/document-image?${query(observed, href, 'docs/guide.md')}`)).status, 409, '同路径同字节的新物理root不接受旧观察');
});

type Worktrees = { status: string; repositories: Array<{ selector: string; entityType: string; sourcePath: string; checkoutPath: string; state: string }>; diagnostic?: { code: string; message: string } };
function applicationFixture(t: TestContext, name: string) {
  const { root } = copyPreparedWorkspace(t, name);
  const record = { scope: { projects: ['app'], services: [] as Array<{ project: string; service: string }> }, changes: [] as Array<{ project: string; change: string }> };
  let worktrees: Worktrees = { status: 'ready', repositories: [] };
  let evidence: Array<{ selector: string; sourcePath?: string }> | null = null;
  // Only Task/Project and Git evidence collaborators are controlled. All material, source-root, relative-path and image readers are production code.
  const application = createTaskMaterialsApplication({
    taskQuery: { assertCanonicalTaskWorkspace: target => path.resolve(target), readTask: () => ({ record }) },
    projectQuery: { projectDetail: () => ({ project: { source: { type: 'workspace', path: 'projects/app' } } }), resolveSourceRoot: (target, source) => path.resolve(target, source.path) },
    worktreeQuery: { inspectGitWorktrees: () => worktrees, readGitWorktreeEvidence: () => evidence ? { evidence: { repositories: evidence } } : null },
  });
  const projectRoot = path.join(root, 'projects/app');
  const body = '# 实际正文\n![图片](../assets/example.png)\n';
  write(path.join(projectRoot, 'docs/guide.md'), body);
  write(path.join(projectRoot, 'assets/example.png'), Buffer.concat([png, Buffer.from('retained')]));
  return { root, projectRoot, body, record, application, setWorktrees: (value: Worktrees) => { worktrees = value; }, setEvidence: (value: typeof evidence) => { evidence = value; } };
}

test('严格材料与任务项目正文持有授权根描述符，单次读取且不补读图片上下文', t => {
  const f = applicationFixture(t, 'document-images-strict-read');
  const root = fs.realpathSync(f.root), projectRoot = fs.realpathSync(f.projectRoot);
  const localFile = path.join(root, '.buildr/local/task-materials/one/docs/guide.md');
  const projectFile = path.join(projectRoot, 'docs/guide.md');
  f.application.writeTaskMaterialDocument(root, 'one', { path: 'docs/guide.md', content: f.body, expectedDocumentDigest: 'absent' });
  f.application.recordTaskMaterials(root, 'one', { expectedCurrent: 'absent', documents: [{ ...localRef(), id: 'local' }, { ...projectRef(), id: 'project' }] });

  // Observe the real filesystem protocol: a body cannot be reopened through
  // ordinary paths after its strict read, and its root must remain held when opened.
  const originalOpen = fs.openSync, originalClose = fs.closeSync;
  const activeRoots = new Map<number, string>();
  const bodyFiles = new Set([localFile, projectFile]);
  const openedBodies: Array<{ file: string; roots: string[] }> = [];
  t.mock.method(fs, 'openSync', (...args: Parameters<typeof fs.openSync>) => {
    const fd = originalOpen(...args);
    const file = path.resolve(String(args[0]));
    if (typeof args[1] === 'number' && (args[1] & fs.constants.O_DIRECTORY)) activeRoots.set(fd, file);
    if (bodyFiles.has(file)) openedBodies.push({ file, roots: [...activeRoots.values()] });
    return fd;
  });
  t.mock.method(fs, 'closeSync', (fd: number) => {
    try { return originalClose(fd); } finally { activeRoots.delete(fd); }
  });
  try {
    for (const selected of [
      { label: '本机材料', file: localFile, root, read: () => f.application.inspectTaskMaterial(root, 'one', 'local') },
      { label: '项目关联材料', file: projectFile, root: projectRoot, read: () => f.application.inspectTaskMaterial(root, 'one', 'project') },
      { label: '直接任务项目正文', file: projectFile, root: projectRoot, read: () => f.application.taskProjectDocument(root, 'one', 'app', 'docs/guide.md', { requireRootProof: true }) },
    ]) {
      const previous = openedBodies.length;
      const document = selected.read();
      assert.ok(document, selected.label);
      assert.equal(document.content, f.body, selected.label);
      assert.ok(document.actualDigest, selected.label);
      assert.equal('imageContext' in document, false, `${selected.label}不增加可选图片读取`);
      const opens = openedBodies.slice(previous);
      assert.equal(opens.length, 1, `${selected.label}正文仅打开一次`);
      assert.equal(opens[0].file, selected.file);
      assert.ok(opens[0].roots.includes(selected.root), `${selected.label}必须传播严格读取并持有授权根描述符`);
    }
    const ordinary = f.application.inspectTaskMaterials(root, 'one');
    assert.equal(ordinary.documents.length, 2);
    for (const document of ordinary.documents) {
      assert.equal(document.content, f.body);
      assert.equal(document.imageContext?.documentDigest, document.actualDigest, '普通材料继续提供同一正文的图片观察');
      assert.ok(document.imageContext?.sourceIdentity);
    }
    assert.ok(f.application.taskProjectDocument(root, 'one', 'app', 'docs/guide.md').imageContext, '普通任务项目正文继续提供图片观察');
  } finally { t.mock.restoreAll(); }
});

test('Task本机图片固定在本机材料目录，同id同正文换source拒绝旧观察且局部保留正文', t => {
  const f = applicationFixture(t, 'document-images-local-source');
  f.application.writeTaskMaterialDocument(f.root, 'one', { path: 'docs/guide.md', content: f.body, expectedDocumentDigest: 'absent' });
  const local = path.join(f.root, '.buildr/local/task-materials/one');
  const localBytes = Buffer.concat([png, Buffer.from('task-local')]);
  write(path.join(local, 'assets/example.png'), localBytes);
  const first = f.application.recordTaskMaterials(f.root, 'one', { expectedCurrent: 'absent', documents: [localRef()] });
  const observed = first.documents[0].imageContext!;
  const checkout = path.join(f.root, '.worktrees/one');
  write(path.join(checkout, '.buildr/local/task-materials/one/assets/example.png'), Buffer.concat([png, Buffer.from('candidate-must-not-be-used')]));
  f.setWorktrees({ status: 'ready', repositories: [{ selector: 'workspace', entityType: 'workspace', sourcePath: '.', checkoutPath: checkout, state: 'ready' }] });
  assert.deepEqual(f.application.taskMaterialImage(f.root, 'one', 'solution', request(observed)).bytes, localBytes);
  f.setWorktrees({ status: 'ready', repositories: [] });
  const changed = f.application.recordTaskMaterials(f.root, 'one', { expectedCurrent: first.materialsDigest, documents: [projectRef()] });
  assert.equal(changed.documents[0].actualDigest, first.documents[0].actualDigest);
  assert.notEqual(changed.documents[0].imageContext!.sourceIdentity, observed.sourceIdentity);
  assert.throws(() => f.application.taskMaterialImage(f.root, 'one', 'solution', request(observed)), code('document_image_context_changed'));
  assert.deepEqual(f.application.taskMaterialImage(f.root, 'one', 'solution', request(changed.documents[0].imageContext!)).bytes, fs.readFileSync(path.join(f.projectRoot, 'assets/example.png')));
  f.record.scope.projects = [];
  assert.throws(() => f.application.taskMaterialImage(f.root, 'one', 'solution', request(changed.documents[0].imageContext!)), code('task_document_scope_forbidden'));
  assert.equal(fs.readFileSync(path.join(local, 'docs/guide.md'), 'utf8'), f.body);
});

test('已选项目候选图片删除、候选失效或证据缺口时禁止用保留图片替代', t => {
  const f = applicationFixture(t, 'document-images-project-candidate');
  const checkout = path.join(f.root, '.worktrees/one/app');
  const candidateBytes = Buffer.concat([png, Buffer.from('candidate')]);
  write(path.join(checkout, 'docs/guide.md'), f.body); write(path.join(checkout, 'assets/example.png'), candidateBytes);
  const repository = { selector: 'project:app', entityType: 'project', sourcePath: 'projects/app', checkoutPath: checkout, state: 'ready' };
  f.setWorktrees({ status: 'ready', repositories: [repository] });
  const document = f.application.taskProjectDocument(f.root, 'one', 'app', 'docs/guide.md');
  assert.equal(document.provenance, 'task-worktree-candidate');
  assert.deepEqual(f.application.taskProjectDocumentImage(f.root, 'one', 'app', 'docs/guide.md', request(document.imageContext!)).bytes, candidateBytes);
  fs.unlinkSync(path.join(checkout, 'assets/example.png'));
  assert.throws(() => f.application.taskProjectDocumentImage(f.root, 'one', 'app', 'docs/guide.md', request(document.imageContext!)), '候选缺图不能偷读保留图');
  fs.rmSync(checkout, { recursive: true });
  assert.throws(() => f.application.taskProjectDocumentImage(f.root, 'one', 'app', 'docs/guide.md', request(document.imageContext!)), '候选目录不存在仍不能回退');
  f.setWorktrees({ status: 'blocked', repositories: [{ ...repository, state: 'blocked' }] });
  assert.throws(() => f.application.taskProjectDocumentImage(f.root, 'one', 'app', 'docs/guide.md', request(document.imageContext!)), code('task_worktree_unavailable'));
  f.setWorktrees({ status: 'blocked', repositories: [], diagnostic: { code: 'git_worktree_identity_drift', message: '当前证据不完整' } });
  f.setEvidence([{ selector: 'project:app', sourcePath: 'projects/app' }]);
  assert.throws(() => f.application.taskProjectDocumentImage(f.root, 'one', 'app', 'docs/guide.md', request(document.imageContext!)), code('task_worktree_unavailable'));
  assert.deepEqual(fs.readFileSync(path.join(f.projectRoot, 'assets/example.png')), Buffer.concat([png, Buffer.from('retained')]));
});

test('仅服务候选把逻辑project路径映射到真实sourceRoot/readPath，图片跟随同一代码资料来源', t => {
  const f = applicationFixture(t, 'document-images-service-candidate');
  const logical = 'services/api/docs/guide.md', sourcePath = 'projects/app/services/api';
  write(path.join(f.projectRoot, logical), f.body);
  write(path.join(f.projectRoot, 'services/api/assets/example.png'), Buffer.concat([png, Buffer.from('retained-service')]));
  const checkout = path.join(f.root, '.worktrees/one/api');
  const candidateBytes = Buffer.concat([png, Buffer.from('service-candidate')]);
  write(path.join(checkout, 'docs/guide.md'), f.body); write(path.join(checkout, 'assets/example.png'), candidateBytes);
  f.setWorktrees({ status: 'ready', repositories: [{ selector: 'service:app/api', entityType: 'service', sourcePath, checkoutPath: checkout, state: 'ready' }] });
  const document = f.application.taskProjectDocument(f.root, 'one', 'app', logical);
  assert.equal(document.path, logical); assert.equal(document.provenance, 'task-worktree-candidate');
  assert.deepEqual(f.application.taskProjectDocumentImage(f.root, 'one', 'app', logical, request(document.imageContext!)).bytes, candidateBytes);
  const material = f.application.recordTaskMaterials(f.root, 'one', { expectedCurrent: 'absent', documents: [projectRef(logical)] }).documents[0];
  assert.equal(material.content, f.body);
  assert.deepEqual(f.application.taskMaterialImage(f.root, 'one', 'solution', request(material.imageContext!)).bytes, candidateBytes);
  fs.unlinkSync(path.join(checkout, 'assets/example.png'));
  assert.throws(() => f.application.taskMaterialImage(f.root, 'one', 'solution', request(material.imageContext!)));
  assert.equal(f.application.inspectTaskMaterials(f.root, 'one').documents[0].content, f.body, '单图缺失不撤销已成立的正文可读事实');
});
