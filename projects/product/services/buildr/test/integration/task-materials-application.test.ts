import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawn, execFileSync } from 'node:child_process';
import test from 'node:test';
import { createTaskMaterialsApplication } from '../../src/modules/task/materials/application/task-materials-application.ts';
import { documentDigest, MAX_TASK_DOCUMENT_BYTES } from '../../src/modules/task/materials/application/task-project-document-reader.ts';
import { TASK_MATERIALS_MODULE } from '../../src/modules/task/materials/module.ts';
import { TASK_MATERIALS_SCHEMAS, TASK_MATERIALS_VALIDATORS } from '../../src/modules/task/materials/application/task-materials-contracts.ts';
import type { TaskMaterialReference } from '../../build/generated/task-dto.ts';

type Worktrees = { status: string; repositories: Array<{ selector: string; entityType: string; sourcePath: string; checkoutPath: string; state: string }>; diagnostic?: { code: string; message: string } };
function fixture(t: { after(action: () => void): void }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-materials-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const record = { taskId: 'one', scope: { projects: ['app'], services: [] as Array<{ project: string; service: string }> }, changes: [] as Array<{ project: string; change: string }> };
  let worktrees: Worktrees = { status: 'ready', repositories: [] };
  let storedSelectors: string[] | null = null;
  let reads = 0;
  const taskQuery = {
    assertCanonicalTaskWorkspace: (target: string) => path.resolve(target),
    readTask: (_root: string, id: string) => { reads += 1; if (!['one', 'two'].includes(id)) throw Object.assign(new Error('Task missing'), { code: 'task_record_not_found', status: 404 }); return { record }; },
    inspectTask: () => { throw new Error('inspectTask/OpenSpec must not be called'); },
  };
  const projectQuery = { projectDetail: (_root: string, code: string) => { assert.equal(code, 'app'); return { project: { source: { type: 'workspace', path: 'projects/app' } } }; }, resolveSourceRoot: (root: string, source: { path: string }) => path.resolve(root, source.path) };
  const application = createTaskMaterialsApplication({ taskQuery, projectQuery, worktreeQuery: { inspectGitWorktrees: () => worktrees, readGitWorktreeEvidence: () => storedSelectors === null ? null : { evidence: { repositories: storedSelectors.map(selector => ({ selector })) } } } });
  return { root, record, application, reads: () => reads, local: (relative = '', id = 'one') => path.join(root, '.buildr/local/task-materials', id, relative), setEvidence: (selectors: string[] | null) => { storedSelectors = selectors; }, setWorktrees: (value: Worktrees) => { worktrees = value; } };
}
const taskRef = (id = 'brief', relative = 'brief.md', role: TaskMaterialReference['role'] = 'solution'): TaskMaterialReference => ({ id, role, title: '真实材料', source: { kind: 'task', path: relative } });
const projectRef = (relative = 'tasks/one/brief.md', id = 'project-brief'): TaskMaterialReference => ({ id, role: 'solution', title: '项目说明', source: { kind: 'project', project: 'app', path: relative } });
function write(file: string, bytes: string | Uint8Array) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, bytes); }
const code = (value: string) => (error: unknown) => error instanceof Error && 'code' in error && error.code === value;

test('项目根别名不能绕过活跃Change brief移动保护，普通阅读及已归档引用保留', t => {
  const f = fixture(t);
  const source = 'openspec/changes/moving/brief.md';
  write(path.join(f.root, 'projects/app', source), '# 具体变更解释\n');
  assert.equal(f.application.taskProjectDocument(f.root, 'one', 'app', `@project/${source}`).content, '# 具体变更解释\n');
  for (const relative of [source, `@project/${source}`]) {
    assert.throws(() => f.application.recordTaskMaterials(f.root, 'one', { expectedCurrent: 'absent', documents: [projectRef(relative)] }), code('task_materials_moving_change_reference'));
    assert.equal(fs.existsSync(f.local()), false, '旁路拒绝不得创建材料清单或正文');
  }
  const archived = 'openspec/changes/archive/2026-10-01-moving/brief.md';
  write(path.join(f.root, 'projects/app', archived), '# 固定历史解释\n');
  const result = f.application.recordTaskMaterials(f.root, 'one', { expectedCurrent: 'absent', documents: [projectRef(`@project/${archived}`)] });
  assert.equal(result.documents[0].content, '# 固定历史解释\n');
  assert.deepEqual(f.record.changes, []);
});

test('超大损坏材料锁局部拒绝写入，不全文读取或改写正文及任务事实', t => {
  const f = fixture(t);
  const before = JSON.stringify(f.record);
  write(f.local('.materials.lock'), Buffer.alloc(64 * 1024 + 1, 65));
  assert.throws(() => f.application.writeTaskMaterialDocument(f.root, 'one', { path: 'brief.md', content: '问题、目标与完成依据。', expectedDocumentDigest: 'absent' }), code('task_materials_lock_too_large'));
  assert.equal(fs.existsSync(f.local('brief.md')), false);
  assert.equal(fs.statSync(f.local('.materials.lock')).size, 64 * 1024 + 1);
  assert.equal(f.application.inspectTaskMaterials(f.root, 'one').materialsDigest, 'absent');
  assert.equal(JSON.stringify(f.record), before);
});

test('无材料读取严格零写入，工作空间任务无需项目或 Change，模块无 OpenSpec 依赖', t => {
  const f = fixture(t); f.record.scope.projects = [];
  const before = JSON.stringify(f.record);
  const read = f.application.inspectTaskMaterials(f.root, 'one');
  assert.deepEqual(read, { schemaVersion: 'buildr.task-materials-result/v2', taskId: 'one', materialsDigest: 'absent', materials: { schemaVersion: 'buildr.task-materials/v2', documents: [] }, documents: [], diagnostics: [] });
  assert.equal(fs.existsSync(path.join(f.root, '.buildr')), false);
  assert.equal(JSON.stringify(f.record), before); assert.equal(f.reads(), 1);
  assert.equal(TASK_MATERIALS_MODULE.requires.includes('openspec.query'), false);
  assert.throws(() => f.application.inspectTaskMaterials(f.root, 'missing'), code('task_record_not_found'));
  assert.throws(() => f.application.writeTaskMaterialDocument(f.root, '../one', { path: 'brief.md', content: 'unsafe', expectedDocumentDigest: 'absent' }), code('task_record_identity_invalid'));
  assert.equal(fs.existsSync(path.join(f.root, '.buildr')), false);
});

test('本机正文和关联各自摘要，刷新观察新 bytes，Task Record 不变且拒绝陈旧写入', t => {
  const f = fixture(t); const before = JSON.stringify(f.record);
  const content = '\ufeff# 真实说明\n目标与依据。\n';
  const saved = f.application.writeTaskMaterialDocument(f.root, 'one', { path: 'brief.md', content, expectedDocumentDigest: 'absent' });
  assert.equal(saved.actualDigest, documentDigest(Buffer.from(content)));
  const recorded = f.application.recordTaskMaterials(f.root, 'one', { expectedCurrent: 'absent', documents: [taskRef()] });
  assert.equal(recorded.documents[0].content, content); assert.equal(recorded.documents[0].actualDigest, saved.actualDigest);
  assert.equal(recorded.documents[0].provenance, 'task-local');
  assert.equal(TASK_MATERIALS_VALIDATORS.validate(TASK_MATERIALS_SCHEMAS.response.$id, recorded).valid, true);
  assert.equal(TASK_MATERIALS_VALIDATORS.validate(TASK_MATERIALS_SCHEMAS.response.$id, { ...recorded, unexpected: true }).valid, false);
  assert.throws(() => f.application.recordTaskMaterials(f.root, 'one', { expectedCurrent: 'absent', documents: [] }), code('task_materials_conflict'));
  assert.throws(() => f.application.writeTaskMaterialDocument(f.root, 'one', { path: 'brief.md', content: 'old overwrite', expectedDocumentDigest: 'absent' }), code('task_materials_document_conflict'));
  const next = f.application.writeTaskMaterialDocument(f.root, 'one', { path: 'brief.md', content: '# 新正文\n', expectedDocumentDigest: saved.actualDigest });
  const refreshed = f.application.inspectTaskMaterials(f.root, 'one');
  assert.equal(refreshed.materialsDigest, recorded.materialsDigest); assert.equal(refreshed.documents[0].actualDigest, next.actualDigest); assert.equal(refreshed.documents[0].content, '# 新正文\n');
  const manifest = JSON.parse(fs.readFileSync(f.local('materials.json'), 'utf8'));
  assert.deepEqual(Object.keys(manifest).sort(), ['documents', 'schemaVersion']);
  assert.equal(JSON.stringify(manifest).includes('新正文'), false);
  assert.equal(JSON.stringify(f.record), before);
});

test('无 Change 项目材料共享同一正文，候选内容与缺失绝不回退保留副本', t => {
  const f = fixture(t);
  const retained = path.join(f.root, 'projects/app/tasks/one/brief.md'); write(retained, '# retained\n');
  const candidate = path.join(f.root, '.worktrees/one'); write(path.join(candidate, 'projects/app/tasks/one/brief.md'), '# uncommitted\n');
  f.setWorktrees({ status: 'ready', repositories: [{ selector: 'workspace', entityType: 'workspace', sourcePath: '.', checkoutPath: candidate, state: 'ready' }] });
  const read = f.application.recordTaskMaterials(f.root, 'one', { expectedCurrent: 'absent', documents: [projectRef()] });
  assert.equal(read.documents[0].content, '# uncommitted\n'); assert.equal(read.documents[0].provenance, 'task-worktree-candidate');
  const shared = f.application.recordTaskMaterials(f.root, 'two', { expectedCurrent: 'absent', documents: [projectRef()] });
  assert.equal(shared.documents[0].actualDigest, read.documents[0].actualDigest);
  fs.unlinkSync(path.join(candidate, 'projects/app/tasks/one/brief.md'));
  const missing = f.application.inspectTaskMaterials(f.root, 'one');
  assert.equal(missing.documents[0].exists, false); assert.equal(missing.documents[0].content, null); assert.equal(missing.documents[0].diagnostic?.code, 'task_materials_document_missing');
  f.setWorktrees({ status: 'blocked', repositories: [{ selector: 'workspace', entityType: 'workspace', sourcePath: '.', checkoutPath: candidate, state: 'blocked' }] });
  assert.equal(f.application.inspectTaskMaterials(f.root, 'one').documents[0].diagnostic?.code, 'task_worktree_unavailable');
  f.setWorktrees({ status: 'ready', repositories: [] });
  assert.equal(f.application.inspectTaskMaterials(f.root, 'one').documents[0].content, '# retained\n');
  assert.equal(f.application.taskProjectDocument(f.root, 'one', 'app', '@project/tasks/one/brief.md').content, '# retained\n');
  assert.throws(() => f.application.taskProjectDocument(f.root, 'one', 'app', '@project/../secret.md'), code('task_document_path_forbidden'));
});

test('服务独立工作树或身份冲突只返回局部诊断，本机材料不受影响', t => {
  const f = fixture(t); write(path.join(f.root, 'projects/app/tasks/one/brief.md'), '# project\n');
  f.application.writeTaskMaterialDocument(f.root, 'one', { path: 'notes.md', content: '# local\n', expectedDocumentDigest: 'absent' });
  f.application.recordTaskMaterials(f.root, 'one', { expectedCurrent: 'absent', documents: [projectRef(), taskRef('notes', 'notes.md', 'implementation')] });
  execFileSync('git', ['init', '--initial-branch=main', path.join(f.root, 'projects/app')], { stdio: 'ignore' });
  f.setWorktrees({ status: 'ready', repositories: [{ selector: 'service:app/backend', entityType: 'service', sourcePath: 'projects/app/services/backend', checkoutPath: '/nonexistent', state: 'ready' }] });
  const result = f.application.inspectTaskMaterials(f.root, 'one');
  assert.equal(result.documents[0].diagnostic?.code, 'task_worktree_project_root_unavailable'); assert.equal(result.documents[1].content, '# local\n');
  f.setWorktrees({ status: 'blocked', repositories: [], diagnostic: { code: 'identity_drift', message: 'drift' } });
  assert.equal(f.application.inspectTaskMaterials(f.root, 'one').documents[0].diagnostic?.code, 'task_worktree_unavailable');
});

test('失效引用可改安全元数据、保留并新增无关来源或解除，空白正文真实诊断', t => {
  const f = fixture(t);
  f.application.writeTaskMaterialDocument(f.root, 'one', { path: 'brief.md', content: '# real\n', expectedDocumentDigest: 'absent' });
  const old = f.application.recordTaskMaterials(f.root, 'one', { expectedCurrent: 'absent', documents: [taskRef()] });
  fs.unlinkSync(f.local('brief.md'));
  f.application.writeTaskMaterialDocument(f.root, 'one', { path: 'notes.md', content: '# notes\n', expectedDocumentDigest: 'absent' });
  const updated = f.application.recordTaskMaterials(f.root, 'one', { expectedCurrent: old.materialsDigest, documents: [{ ...taskRef(), title: '重命名但保留局部缺口' }, taskRef('notes', 'notes.md', 'implementation')] });
  assert.equal(updated.documents[0].diagnostic?.code, 'task_materials_document_missing'); assert.equal(updated.documents[1].content, '# notes\n');
  const removed = f.application.recordTaskMaterials(f.root, 'one', { expectedCurrent: updated.materialsDigest, documents: [taskRef('notes', 'notes.md', 'implementation')] });
  assert.equal(removed.documents.length, 1); assert.equal(fs.existsSync(f.local('notes.md')), true);
  write(f.local('notes.md'), ' \n'); assert.equal(f.application.inspectTaskMaterials(f.root, 'one').documents[0].diagnostic?.code, 'task_materials_document_empty');
  assert.throws(() => f.application.recordTaskMaterials(f.root, 'two', { expectedCurrent: 'absent', documents: [taskRef('brief', 'blank.md')] }), code('task_materials_document_missing'));
  write(f.local('blank.md', 'two'), ' \n');
  assert.throws(() => f.application.recordTaskMaterials(f.root, 'two', { expectedCurrent: 'absent', documents: [taskRef('brief', 'blank.md')] }), code('task_materials_document_empty'));
});

test('路径、未知字段、重复身份及退役brief、symlink、非法UTF8和超限文件不得突破边界', t => {
  const f = fixture(t);
  for (const relative of ['../two/brief.md', '/tmp/brief.md', 'C:/brief.md', 'a/../brief.md', 'a\\brief.md', 'bad.txt', 'a//b.md']) assert.throws(() => f.application.writeTaskMaterialDocument(f.root, 'one', { path: relative, content: 'unsafe', expectedDocumentDigest: 'absent' }), code('task_document_path_forbidden'));
  assert.equal(fs.existsSync(path.join(f.root, '.buildr')), false);
  assert.throws(() => f.application.recordTaskMaterials(f.root, 'one', { expectedCurrent: 'absent', documents: [], root: f.root } as never), code('task_materials_input_invalid'));
  assert.throws(() => f.application.recordTaskMaterials(f.root, 'one', { expectedCurrent: 'absent', documents: [taskRef(), taskRef()] }), code('task_materials_references_invalid'));
  assert.throws(() => f.application.writeTaskMaterialDocument(f.root, 'one', { path: 'brief.md', content: '\ud800', expectedDocumentDigest: 'absent' }), code('task_document_encoding_invalid'));
  assert.throws(() => f.application.writeTaskMaterialDocument(f.root, 'one', { path: 'brief.md', content: '中'.repeat(MAX_TASK_DOCUMENT_BYTES / 2), expectedDocumentDigest: 'absent' }), code('task_document_encoding_invalid'));
  write(f.local('bad.md'), new Uint8Array([0xc3, 0x28]));
  assert.throws(() => f.application.writeTaskMaterialDocument(f.root, 'one', { path: 'bad.md', content: '# cannot overwrite unreadable bytes', expectedDocumentDigest: 'absent' }), code('task_document_encoding_invalid'));
  write(f.local('large.md'), 'x'.repeat(MAX_TASK_DOCUMENT_BYTES + 1));
  assert.throws(() => f.application.recordTaskMaterials(f.root, 'one', { expectedCurrent: 'absent', documents: [taskRef('large', 'large.md')] }), code('task_document_unreadable'));
  write(path.join(f.root, 'private.md'), '# secret\n'); fs.symlinkSync(path.join(f.root, 'private.md'), f.local('link.md'));
  assert.throws(() => f.application.writeTaskMaterialDocument(f.root, 'one', { path: 'link.md', content: 'overwrite', expectedDocumentDigest: 'absent' }), code('task_document_path_forbidden'));
  assert.throws(() => f.application.recordTaskMaterials(f.root, 'one', { expectedCurrent: 'absent', documents: [taskRef('link', 'link.md')] }), code('task_document_path_forbidden'));
  fs.mkdirSync(f.local('dir.md'));
  assert.throws(() => f.application.recordTaskMaterials(f.root, 'one', { expectedCurrent: 'absent', documents: [taskRef('directory', 'dir.md')] }), code('task_document_unreadable'));
  write(path.join(f.root, 'projects/app/openspec/changes/active/brief.md'), '# moving\n');
  assert.throws(() => f.application.recordTaskMaterials(f.root, 'one', { expectedCurrent: 'absent', documents: [projectRef('openspec/changes/active/brief.md')] }), code('task_materials_moving_change_reference'));
  f.record.scope.projects = [];
  assert.throws(() => f.application.recordTaskMaterials(f.root, 'one', { expectedCurrent: 'absent', documents: [projectRef()] }), code('task_document_scope_forbidden'));
});

test('非法新增来源零副作用，祖先symlink拒绝且本机材料不读取候选同名副本', t => {
  const f = fixture(t);
  assert.throws(() => f.application.recordTaskMaterials(f.root, 'one', { expectedCurrent: 'absent', documents: [taskRef('escape', '../two/brief.md')] }), code('task_document_path_forbidden'));
  assert.throws(() => f.application.recordTaskMaterials(f.root, 'one', { expectedCurrent: 'absent', documents: [{ ...projectRef(), source: { kind: 'project', project: 'outside', path: 'brief.md' } }] }), code('task_document_scope_forbidden'));
  assert.equal(fs.existsSync(path.join(f.root, '.buildr')), false);
  const candidate = path.join(f.root, '.worktrees/one');
  write(path.join(candidate, '.buildr/local/task-materials/one/brief.md'), '# wrong candidate local\n');
  f.setWorktrees({ status: 'ready', repositories: [{ selector: 'workspace', entityType: 'workspace', sourcePath: '.', checkoutPath: candidate, state: 'ready' }] });
  const saved = f.application.writeTaskMaterialDocument(f.root, 'one', { path: 'brief.md', content: '# canonical local\n', expectedDocumentDigest: 'absent' });
  const recorded = f.application.recordTaskMaterials(f.root, 'one', { expectedCurrent: 'absent', documents: [taskRef()] });
  assert.equal(recorded.documents[0].content, '# canonical local\n'); assert.equal(recorded.documents[0].actualDigest, saved.actualDigest);
  fs.mkdirSync(path.join(f.root, 'outside-directory')); fs.symlinkSync(path.join(f.root, 'outside-directory'), f.local('linked-directory'));
  assert.throws(() => f.application.writeTaskMaterialDocument(f.root, 'one', { path: 'linked-directory/new.md', content: 'escape', expectedDocumentDigest: 'absent' }), code('task_document_path_forbidden'));
  assert.equal(fs.existsSync(path.join(f.root, 'outside-directory/new.md')), false);
  fs.symlinkSync(path.join(f.root, 'outside-directory'), path.join(candidate, 'projects'));
  assert.throws(() => f.application.taskProjectDocument(f.root, 'one', 'app', 'brief.md'), code('task_document_path_forbidden'));
});

async function race(root: string, operation: 'record' | 'write', expected: string) {
  const url = new URL('../../src/modules/task/materials/application/task-materials-application.ts', import.meta.url).href;
  const children = ['A', 'B'].map(label => {
    const source = `import {createTaskMaterialsApplication} from ${JSON.stringify(url)}; const root=${JSON.stringify(root)}; const label=${JSON.stringify(label)}; const app=createTaskMaterialsApplication({taskQuery:{assertCanonicalTaskWorkspace:r=>r,readTask:()=>({record:{scope:{projects:[],services:[]},changes:[]}})},projectQuery:{projectDetail:()=>{throw Error('no project')},resolveSourceRoot:()=>{throw Error('no project')}},worktreeQuery:{inspectGitWorktrees:()=>({status:'ready',repositories:[]})}}); process.send({ready:true}); process.on('message',()=>{try {const result=${operation === 'record' ? `app.recordTaskMaterials(root,'one',{expectedCurrent:${JSON.stringify(expected)},documents:[{id:'brief',role:'solution',title:label,source:{kind:'task',path:'brief.md'}}]})` : `app.writeTaskMaterialDocument(root,'one',{path:'brief.md',content:'# '+label+'\\n',expectedDocumentDigest:${JSON.stringify(expected)}})`}; process.send({ok:true,result});}catch(e){process.send({ok:false,code:e.code})}process.disconnect();});`;
    const child = spawn(process.execPath, ['--input-type=module', '--eval', source], { stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
    let stderr = ''; child.stderr.on('data', chunk => { stderr += chunk; });
    const ready = new Promise<void>((resolve, reject) => { child.on('message', (message: { ready?: boolean }) => { if (message.ready) resolve(); }); child.on('error', reject); child.on('exit', status => { if (status !== 0) reject(new Error(stderr)); }); });
    const result = new Promise<{ ok: boolean; code?: string; result?: unknown }>((resolve, reject) => { child.on('message', (message: { ok?: boolean; code?: string; result?: unknown }) => { if (typeof message.ok === 'boolean') resolve(message as { ok: boolean; code?: string; result?: unknown }); }); child.on('error', reject); child.on('exit', status => { if (status !== 0) reject(new Error(stderr)); }); });
    const exited = new Promise<void>((resolve, reject) => child.on('exit', status => status === 0 ? resolve() : reject(new Error(stderr))));
    return { child, ready, result, exited };
  });
  try { await Promise.all(children.map(item => item.ready)); for (const item of children) item.child.send('go'); const results = await Promise.all(children.map(item => item.result)); await Promise.all(children.map(item => item.exited)); return results; }
  finally { for (const item of children) if (item.child.exitCode === null) item.child.kill(); }
}

test('真实两个进程从同一旧版本并发CAS，record与本机write都至多一个成功', { timeout: 15000 }, async t => {
  const f = fixture(t);
  const saved = f.application.writeTaskMaterialDocument(f.root, 'one', { path: 'brief.md', content: '# baseline\n', expectedDocumentDigest: 'absent' });
  const records = await race(f.root, 'record', 'absent');
  assert.equal(records.filter(item => item.ok).length, 1); assert.deepEqual(records.filter(item => !item.ok).map(item => item.code), ['task_materials_conflict']);
  const writes = await race(f.root, 'write', saved.actualDigest);
  assert.equal(writes.filter(item => item.ok).length, 1); assert.deepEqual(writes.filter(item => !item.ok).map(item => item.code), ['task_materials_document_conflict']);
  const current = f.application.inspectTaskMaterials(f.root, 'one'); assert.ok(['# A\n', '# B\n'].includes(current.documents[0].content!));
  assert.equal(current.documents[0].actualDigest, documentDigest(Buffer.from(current.documents[0].content!)));
  assert.deepEqual(fs.readdirSync(f.local()).sort(), ['brief.md', 'materials.json']);
});


test('有效仅服务组的代码诊断不阻止已确认非 Git 项目资料，已知完整项目候选仍不回退', t => {
  const f = fixture(t), body = '# current non-Git project material\n';
  write(path.join(f.root, 'projects/app/tasks/one/brief.md'), body);
  f.application.recordTaskMaterials(f.root, 'one', { expectedCurrent: 'absent', documents: [projectRef()] });
  f.setWorktrees({ status: 'blocked', repositories: [], diagnostic: { code: 'git_worktree_identity_drift', message: 'A service checkout is unavailable.' } });
  f.setEvidence(['service:app/api']);
  const available = f.application.inspectTaskMaterials(f.root, 'one').documents[0];
  assert.equal(available.content, body); assert.equal(available.actualDigest, documentDigest(Buffer.from(body))); assert.equal(available.provenance, 'retained-project');
  for (const selectors of [['workspace', 'service:app/api'], ['project:app', 'service:app/api'], null]) {
    f.setEvidence(selectors);
    const unavailable = f.application.inspectTaskMaterials(f.root, 'one').documents[0];
    assert.equal(unavailable.content, null); assert.equal(unavailable.diagnostic?.code, 'task_worktree_unavailable');
    assert.equal(fs.readFileSync(path.join(f.root, 'projects/app/tasks/one/brief.md'), 'utf8'), body);
  }
});


test('非 Git 项目内已选服务的代码资料读取候选，候选缺失或失效不回退原文件', t => {
  const f = fixture(t), sourcePath = 'projects/app/services/api', logical = 'services/api/docs/result.md';
  write(path.join(f.root, 'projects/app', logical), '# retained service document\n');
  const checkoutPath = path.join(f.root, '.worktrees/one', sourcePath);
  write(path.join(checkoutPath, 'docs/result.md'), '# current task candidate\n');
  f.setWorktrees({ status: 'ready', repositories: [{ selector: 'service:app/api', entityType: 'service', sourcePath, checkoutPath, state: 'ready' }] });
  const read = f.application.recordTaskMaterials(f.root, 'one', { expectedCurrent: 'absent', documents: [projectRef(logical)] }).documents[0];
  assert.equal(f.application.taskProjectDocument(f.root, 'one', 'app', logical).path, logical); assert.equal(read.content, '# current task candidate\n'); assert.equal(read.provenance, 'task-worktree-candidate');
  fs.unlinkSync(path.join(checkoutPath, 'docs/result.md'));
  const missing = f.application.inspectTaskMaterials(f.root, 'one').documents[0];
  assert.equal(missing.content, null); assert.equal(missing.diagnostic?.code, 'task_materials_document_missing');
  f.setWorktrees({ status: 'blocked', repositories: [{ selector: 'service:app/api', entityType: 'service', sourcePath, checkoutPath, state: 'blocked' }] });
  const unavailable = f.application.inspectTaskMaterials(f.root, 'one').documents[0];
  assert.equal(unavailable.content, null); assert.equal(unavailable.diagnostic?.code, 'task_worktree_unavailable');
});
