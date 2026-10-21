import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { registerWorkspaceInfrastructure } from '../../src/infrastructure/filesystem/index.ts';
import { registerPublicationApplication } from '../../src/modules/publication/application/publication-application.ts';
import { createPublicationHttpContribution } from '../../src/modules/publication/interfaces/http/publication-http.ts';
import { PUBLICATION_HTTP_SCHEMAS, validatePublicationHttp } from '../../src/modules/publication/interfaces/http/publication-http-contracts.ts';
import { createTaskProjectDocumentReader } from '../../src/modules/task/materials/application/task-project-document-reader.ts';

function fixture(t: { after(action: () => void): void }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-publication-tree-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const evidence = path.join(root, 'evidence'); fs.mkdirSync(evidence);
  const tasks = ['finished', 'other'];
  for (const id of tasks) fs.writeFileSync(path.join(evidence, `${id}.json`), '{}');
  const project = { name: '项目', source: { type: 'workspace', path: 'projects/app' } };
  const projectQuery = { readProjectRegistryRecord: () => ({ root, projects: { app: project } }), projectDetail: () => ({ project }), resolveSourceRoot: (base: string, source: { path: string }) => path.resolve(base, source.path) };
  const taskQuery = { readTask: (_root: string, id: string) => {
    if (!tasks.includes(id)) throw Object.assign(new Error('task missing'), { code: 'task_record_not_found' });
    return { record: { taskId: id, title: `来源 ${id}`, status: 'completed', scope: { projects: ['app'], services: [] }, changes: [] } };
  } };
  let available = true, checkoutRoot = path.join(root, 'trees'), inspectCalls = 0;
  const worktreeQuery = {
    inspectGitWorktrees: ({ taskId }: { taskId: string }) => { inspectCalls += 1; return { status: 'ready', repositories: [{ selector: 'workspace', entityType: 'workspace', sourcePath: '.', checkoutPath: path.join(checkoutRoot, taskId), state: available ? 'ready' : 'missing' }] }; },
    listGitWorktreeEvidence: () => (fs.existsSync(evidence) ? fs.readdirSync(evidence) : []).filter(name => name.endsWith('.json')).map(name => ({
      file: path.join(evidence, name),
      evidence: { taskId: name.slice(0, -5), repositories: [{ selector: 'workspace', entityType: 'workspace', sourcePath: '.', sourceRepository: root, checkoutPath: path.join(checkoutRoot, name.slice(0, -5)), branch: `task/${name.slice(0, -5)}`, state: 'ready' }] },
    })),
    probeGitWorktreeCheckoutFs: () => available,
  };
  const materialsQuery = createTaskProjectDocumentReader(taskQuery, projectQuery, worktreeQuery);
  const runtime: any = {};
  registerWorkspaceInfrastructure(runtime);
  registerPublicationApplication(runtime, { projectQuery, taskQuery, worktreeQuery, materialsQuery });
  const folder = (task?: string) => path.join(task ? path.join(root, 'trees', task) : root, 'projects/app/docs/publications');
  const write = (id: string, content: string, task?: string) => {
    const directory = folder(task); fs.mkdirSync(path.join(directory, 'assets'), { recursive: true });
    fs.writeFileSync(path.join(directory, `${id}.md`), `---\nid: ${id}\ntitle: ${id}\nstatus: published\ntargets:\n  - platform: buildr-web\n    status: published\n---\n${content}\n`);
  };
  return { root, runtime, folder, write, inspectCalls: () => inspectCalls, setAvailable: (next: boolean) => { available = next; }, setCheckoutRoot: (next: string) => { checkoutRoot = next; } };
}

test('文章聚合完成任务的新稿、多来源修改，排除正文与图片均相同的副本', t => {
  const f = fixture(t);
  for (const id of ['same', 'unchanged']) {
    f.write(id, '主目录'); f.write(id, '主目录', 'finished');
  }
  f.write('same', '第一任务', 'finished'); f.write('same', '第二任务', 'other'); f.write('new', '新文章', 'finished');
  const list = f.runtime.listPublications(f.root);
  assert.equal(list.publications.length, 5);
  assert.equal(f.inspectCalls(), 0);
  const drafts = list.publications.filter((article: any) => article.sourceTask);
  assert.equal(drafts.length, 3);
  assert.deepEqual(new Set(drafts.map((article: any) => article.sourceTask.id)), new Set(['finished', 'other']));
  for (const draft of drafts) { assert.equal(draft.status, 'draft'); assert.deepEqual(draft.targets, []); assert.equal(draft.publishedAt, null); }
  assert.equal(f.runtime.worktreePublicationDetail(f.root, 'finished', 'app', 'same').content.trim(), '第一任务');
  assert.equal(f.runtime.worktreePublicationDetail(f.root, 'other', 'app', 'same').content.trim(), '第二任务');
  assert.equal(f.runtime.publicationDetail(f.root, 'same', 'app').content.trim(), '主目录');
  validatePublicationHttp(PUBLICATION_HTTP_SCHEMAS.listResponse.$id, list, 'test', 'response');
});

test('图片单独修改仍能发现，正文与资源仅从对应工作树读取且无写入', t => {
  const f = fixture(t);
  for (const task of [undefined, 'finished']) f.write('image', '![配图](assets/图.png)', task);
  fs.writeFileSync(path.join(f.folder(), 'assets/图.png'), 'main image');
  fs.writeFileSync(path.join(f.folder('finished'), 'assets/图.png'), 'draft image');
  const before = fs.readFileSync(path.join(f.folder('finished'), 'image.md'), 'utf8');
  assert.equal(f.runtime.listPublications(f.root).publications.filter((article: any) => article.sourceTask).length, 1);
  const asset = f.runtime.readWorktreePublicationAsset(f.root, 'finished', 'app', 'image', 'assets/图.png');
  assert.equal(fs.readFileSync(asset.file, 'utf8'), 'draft image');
  assert.equal(f.runtime.worktreePublicationDetail(f.root, 'finished', 'app', 'image').publication.sourceTask.title, '来源 finished');
  assert.equal(fs.readFileSync(path.join(f.folder('finished'), 'image.md'), 'utf8'), before);
});

test('来源失效、缺失、任务范围和符号链接均不退回主目录', t => {
  const f = fixture(t); f.write('same', '主目录'); f.write('same', '工作树', 'finished');
  assert.throws(() => f.runtime.worktreePublicationDetail(f.root, 'finished', 'app', 'missing'), (error: any) => error.code === 'publication_not_found');
  assert.throws(() => f.runtime.worktreePublicationDetail(f.root, 'unknown', 'app', 'same'));
  fs.symlinkSync(path.join(f.folder(), 'same.md'), path.join(f.folder('finished'), 'assets/leak.png'));
  assert.throws(() => f.runtime.readWorktreePublicationAsset(f.root, 'finished', 'app', 'same', 'assets/leak.png'), (error: any) => error.code === 'publication_asset_forbidden');
  assert.throws(() => f.runtime.readWorktreePublicationAsset(f.root, 'finished', 'app', 'same', '../same.md'));
  f.setAvailable(false);
  assert.throws(() => f.runtime.worktreePublicationDetail(f.root, 'finished', 'app', 'same'), (error: any) => error.code === 'task_worktree_unavailable');
  assert.equal(f.runtime.publicationDetail(f.root, 'same', 'app').content.trim(), '主目录');
  assert.ok(f.runtime.listPublications(f.root).diagnostics.length > 0);
});

test('工作树文章接口按本机会话授权保存文字，不开放删除、上传或发布状态修改', async t => {
  const f = fixture(t); f.write('same', '只读预览', 'finished');
  const http = createPublicationHttpContribution(f.runtime);
  const input = { request: { method: 'GET' }, suffix: '/tasks/finished/projects/app/publications/same', root: f.root };
  const detail: any = await http.handle(input);
  assert.equal(detail.status, 200); assert.equal(detail.body.publication.sourceTask.id, 'finished');
  const body = { revision: detail.body.revision, title: '人工校准', summary: '', content: '用户修改措辞' };
  await assert.rejects(() => http.handle({ ...input, request: { method: 'PUT' }, authorizeWrite() { throw Error('denied'); } }), /denied/);
  let authorized = 0;
  const saved: any = await http.handle({ ...input, request: { method: 'PUT' }, authorizeWrite() { authorized++; }, readJsonBody: async () => body });
  assert.equal(authorized, 1); assert.equal(saved.body.content.trim(), body.content); assert.equal(saved.body.publication.sourceTask.id, 'finished');
  await assert.rejects(() => http.handle({ ...input, request: { method: 'PUT' }, authorizeWrite() {}, readJsonBody: async () => ({ ...body, status: 'published' }) }), (error: any) => error.code === 'publication_http_request_invalid');
  for (const method of ['DELETE', 'POST']) await assert.rejects(() => http.handle({ ...input, request: { method } }), (error: any) => error.code === 'publication_worktree_operation_forbidden');
  await assert.rejects(() => http.handle({ ...input, suffix: `${input.suffix}/assets/file.png`, request: { method: 'PUT' } }), (error: any) => error.code === 'publication_worktree_operation_forbidden');
});

test('工作树校准只保存原稿，保留元数据、主目录及其他来源，并拒绝过期观察', t => {
  const f = fixture(t);
  for (const task of [undefined, 'finished', 'other']) f.write('same', task || '主目录', task);
  const main = fs.readFileSync(path.join(f.folder(), 'same.md'), 'utf8');
  const other = fs.readFileSync(path.join(f.folder('other'), 'same.md'), 'utf8');
  const before = f.runtime.worktreePublicationDetail(f.root, 'finished', 'app', 'same');
  const update = { revision: before.revision, title: '校准标题', summary: '校准摘要', content: '校准正文\n![保留引用](assets/图.png)' };
  const saved = f.runtime.updateWorktreePublication(f.root, 'finished', 'app', 'same', update);
  assert.equal(saved.publication.title, update.title); assert.equal(saved.publication.summary, update.summary);
  assert.equal(saved.publication.status, 'draft'); assert.equal(saved.publication.sourceTask.id, 'finished');
  assert.match(saved.source, /status: published/); assert.match(saved.source, /platform: buildr-web/);
  assert.match(saved.source, /id: same/); assert.equal(saved.content.trim(), update.content);
  assert.notEqual(saved.revision, before.revision);
  assert.equal(fs.readFileSync(path.join(f.folder(), 'same.md'), 'utf8'), main);
  assert.equal(fs.readFileSync(path.join(f.folder('other'), 'same.md'), 'utf8'), other);
  assert.throws(() => f.runtime.updateWorktreePublication(f.root, 'finished', 'app', 'same', update), (error: any) => error.code === 'publication_revision_conflict');
  assert.equal(f.runtime.worktreePublicationDetail(f.root, 'finished', 'app', 'same').source, saved.source);
});

test('工作树来源迁移或失效不能沿用旧观察，锁内外部变化不会被回滚覆盖', t => {
  const f = fixture(t); f.write('same', '原稿', 'finished');
  const before = f.runtime.worktreePublicationDetail(f.root, 'finished', 'app', 'same');
  const input = { revision: before.revision, title: '校准', summary: '', content: '旧输入' };
  const moved = path.join(f.root, 'relocated');
  fs.cpSync(path.join(f.root, 'trees'), moved, { recursive: true });
  f.setCheckoutRoot(moved);
  assert.throws(() => f.runtime.updateWorktreePublication(f.root, 'finished', 'app', 'same', input), (error: any) => error.code === 'publication_revision_conflict');
  f.setAvailable(false);
  assert.throws(() => f.runtime.updateWorktreePublication(f.root, 'finished', 'app', 'same', input));
  f.setAvailable(true); f.setCheckoutRoot(path.join(f.root, 'trees'));
  const mutate = f.runtime.withWorkspaceMutation;
  const file = path.join(f.folder('finished'), 'same.md');
  let external = '';
  f.runtime.withWorkspaceMutation = (root: string, operation: string, paths: string[], action: () => any, options: any) => mutate(root, operation, paths, () => {
    fs.appendFileSync(file, '\n智能体刚刚添加的内容\n'); external = fs.readFileSync(file, 'utf8');
    return action();
  }, options);
  assert.throws(() => f.runtime.updateWorktreePublication(f.root, 'finished', 'app', 'same', input), (error: any) => error.code === 'publication_revision_conflict');
  assert.equal(fs.readFileSync(file, 'utf8'), external);
});

test('原文可直接校准文字并保留注释格式，错误格式和元数据变化零写入', t => {
  const f = fixture(t); f.write('source', '原有正文', 'finished');
  const before = f.runtime.worktreePublicationDetail(f.root, 'finished', 'app', 'source');
  const source = before.source.replace('title: source', 'title: 用户校准的标题\n# 用户补充的说明').replace('原有正文', '用户校准的正文');
  const saved = f.runtime.updateWorktreePublication(f.root, 'finished', 'app', 'source', { revision: before.revision, source });
  assert.equal(saved.publication.title, '用户校准的标题'); assert.match(saved.source, /# 用户补充的说明/);
  assert.match(saved.content, /用户校准的正文/); assert.match(saved.source, /status: published/);
  for (const invalid of ['没有文章信息的原文', saved.source.replace('id: source', 'id: other'), saved.source.replace('status: published', 'status: draft'), saved.source.replace('platform: buildr-web', 'platform: another')]) {
    assert.throws(() => f.runtime.updateWorktreePublication(f.root, 'finished', 'app', 'source', { revision: saved.revision, source: invalid }), (error: any) => ['publication_source_invalid', 'publication_metadata_readonly'].includes(error.code));
    assert.equal(f.runtime.worktreePublicationDetail(f.root, 'finished', 'app', 'source').source, saved.source);
  }
});
