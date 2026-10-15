import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test, { after } from 'node:test';
import { runtimeProvide } from '../helpers/runtime-harness.ts';
import { createBuildrApplicationTest } from '../context/buildr-node-test.ts';
import { taskRecordFixture, runBuildrJson } from '../helpers/task-record-system-fixture.ts';
import { cleanupLocalTaskLifecycleSystemContext } from '../helpers/task-lifecycle-system-context.ts';
import { TASK_BRIEF_MIGRATION_APPLICATION, TASK_MATERIALS_APPLICATION } from '../../src/modules/task/materials/module.ts';
import { createTaskBriefMigrationApplication } from '../../src/modules/task/materials/application/task-brief-migration.ts';
import { normalizeTaskBriefLinks } from '../../src/modules/task/materials/application/task-brief-links.ts';

after(() => cleanupLocalTaskLifecycleSystemContext());
const applicationTest = createBuildrApplicationTest('integration-task-brief-migration');
const create = (runtime: any, root: string, taskId: string) => runtime.createTask(root, { taskId, title: '迁移说明', intent: '导入真实旧正文', projects: [], services: [], changes: [] });
const local = (id: string, role: string, file: string) => ({ id, role, title: id, source: { kind: 'task', path: file } });
function legacy(root: string, taskId: string, body: string, documents = [local('brief', 'brief', 'brief.md')]) {
  const directory = path.join(root, '.buildr/local/task-materials', taskId);
  fs.mkdirSync(path.join(directory, path.dirname(documents.find(item => item.role === 'brief')!.source.path)), { recursive: true });
  const file = path.join(directory, documents.find(item => item.role === 'brief')!.source.path);
  fs.writeFileSync(file, body);
  fs.writeFileSync(path.join(directory, 'materials.json'), `${JSON.stringify({ schemaVersion: 'buildr.task-materials/v1', documents })}\n`);
  return { directory, file };
}
const observed = (read: any) => ({ expectedRecordDigest: read.observation.recordDigest, expectedMaterialsDigest: read.observation.materialsDigest, expectedDocumentDigest: read.observation.documentDigest || 'absent' });

applicationTest('普通方案更新保留遗留说明关联；公开v2不再提供brief文件正文', t => {
  const { root } = taskRecordFixture(t, 'legacy-brief-preserve');
  const runtime = t.buildrContexts.application; create(runtime, root, 'legacy-preserve');
  const owner = legacy(root, 'legacy-preserve', '# 唯一旧说明\n');
  const materials: any = runtimeProvide(runtime, TASK_MATERIALS_APPLICATION);
  const before = runtime.readTask(root, 'legacy-preserve');
  const read = materials.inspectTaskMaterials(root, 'legacy-preserve');
  assert.equal(read.schemaVersion, 'buildr.task-materials-result/v2'); assert.deepEqual(read.documents, []);
  assert.equal(read.diagnostics[0].code, 'task_materials_legacy_brief');
  materials.writeTaskMaterialDocument(root, 'legacy-preserve', { path: 'solution.md', content: '# 方案\n', expectedDocumentDigest: 'absent' });
  const recorded = materials.recordTaskMaterials(root, 'legacy-preserve', { expectedCurrent: read.materialsDigest, documents: [local('solution', 'solution', 'solution.md')] });
  assert.deepEqual(recorded.materials.documents.map((item: any) => item.role), ['solution']);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(owner.directory, 'materials.json'), 'utf8')).documents.map((item: any) => item.role), ['brief', 'solution']);
  assert.equal(materials.inspectLegacyTaskBrief(root, 'legacy-preserve').document.content, '# 唯一旧说明\n');
  assert.deepEqual(runtime.readTask(root, 'legacy-preserve'), before);
  assert.throws(() => materials.recordTaskMaterials(root, 'legacy-preserve', { expectedCurrent: recorded.materialsDigest, documents: [local('new', 'brief', 'brief.md')] }), { code: 'task_materials_input_invalid' });
  assert.throws(() => materials.recordTaskMaterials(root, 'legacy-preserve', { expectedCurrent: recorded.materialsDigest, documents: [local('brief', 'solution', 'solution.md')] }), { code: 'task_materials_legacy_id_conflict' });
  const manifestFile = path.join(owner.directory, 'materials.json');
  const manifestBefore = fs.readFileSync(manifestFile);
  assert.throws(() => materials.recordTaskMaterials(root, 'legacy-preserve', { expectedCurrent: recorded.materialsDigest, documents: Array.from({ length: 100 }, (_, index) => local(`solution-${index}`, 'solution', 'solution.md')) }), { code: 'task_materials_input_invalid' });
  assert.deepEqual(fs.readFileSync(manifestFile), manifestBefore);
  assert.equal(materials.inspectLegacyTaskBrief(root, 'legacy-preserve').document.content, '# 唯一旧说明\n');
});

applicationTest('单任务导入原样保全源文件及其他材料，来源链接规范化且幂等', t => {
  const { root } = taskRecordFixture(t, 'brief-import-local');
  const runtime = t.buildrContexts.application; create(runtime, root, 'import-local');
  const original = '\ufeff# 旧任务说明\r\n\r\n[实施](../implementation.md)  \r\n';
  const owner = legacy(root, 'import-local', original, [local('brief', 'brief', 'docs/brief.md'), local('implementation', 'implementation', 'implementation.md')]);
  fs.writeFileSync(path.join(owner.directory, 'implementation.md'), '# 实施过程\n');
  const migration: any = runtimeProvide(runtime, TASK_BRIEF_MIGRATION_APPLICATION);
  const read = migration.migrateTaskBrief(root, 'import-local', { dryRun: true });
  assert.equal(read.status, 'ready'); assert.equal(read.rewrittenLinks, 1);
  assert.equal(runtime.readTask(root, 'import-local').record.brief, null);
  const imported = migration.migrateTaskBrief(root, 'import-local', observed(read));
  assert.equal(imported.status, 'migrated');
  assert.equal(runtime.readTask(root, 'import-local').record.brief, original.replace('../implementation.md', 'implementation.md'));
  assert.equal(fs.readFileSync(owner.file, 'utf8'), original);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(owner.directory, 'materials.json'), 'utf8')), { schemaVersion: 'buildr.task-materials/v2', documents: [local('implementation', 'implementation', 'implementation.md')] });
  const prior = runtime.readTask(root, 'import-local');
  assert.equal(migration.migrateTaskBrief(root, 'import-local').status, 'already-present');
  assert.deepEqual(runtime.readTask(root, 'import-local'), prior);
});

applicationTest('记录、关联或正文漂移均拒绝；坏来源不被intent或变更说明替代', t => {
  const { root } = taskRecordFixture(t, 'brief-import-conflicts');
  const runtime = t.buildrContexts.application; create(runtime, root, 'import-conflicts');
  const owner = legacy(root, 'import-conflicts', '# 旧正文\n');
  const migration: any = runtimeProvide(runtime, TASK_BRIEF_MIGRATION_APPLICATION);
  const read = migration.migrateTaskBrief(root, 'import-conflicts', { dryRun: true });
  fs.writeFileSync(owner.file, '# 文件已修改\n');
  assert.throws(() => migration.migrateTaskBrief(root, 'import-conflicts', observed(read)), { code: 'task_materials_document_conflict' });
  const current = migration.migrateTaskBrief(root, 'import-conflicts', { dryRun: true });
  const manifest = path.join(owner.directory, 'materials.json'); fs.appendFileSync(manifest, ' ');
  assert.throws(() => migration.migrateTaskBrief(root, 'import-conflicts', observed(current)), { code: 'task_materials_conflict' });
  const record = runtime.readTask(root, 'import-conflicts');
  runtime.updateTask(root, 'import-conflicts', { expectedRecordDigest: record.recordDigest, intent: '最新短目标' });
  assert.throws(() => migration.migrateTaskBrief(root, 'import-conflicts', observed(current)), { code: 'task_record_conflict' });
  fs.unlinkSync(owner.file); fs.symlinkSync(manifest, owner.file);
  const failed = migration.migrateTaskBrief(root, 'import-conflicts', { dryRun: true });
  assert.equal(failed.status, 'source-unavailable'); assert.equal(failed.diagnostics[0].code, 'task_document_path_forbidden');
  assert.equal(runtime.readTask(root, 'import-conflicts').record.brief, null);
  create(runtime, root, 'no-source');
  assert.equal(migration.migrateTaskBrief(root, 'no-source').status, 'no-legacy-brief');
});

applicationTest('关联释放失败保留已导入正文；后续编辑和重试不会丢失内容', t => {
  const { root } = taskRecordFixture(t, 'brief-import-partial');
  const runtime = t.buildrContexts.application; create(runtime, root, 'import-partial');
  const owner = legacy(root, 'import-partial', '# 观察的旧正文\n');
  const materials: any = runtimeProvide(runtime, TASK_MATERIALS_APPLICATION);
  const migration = createTaskBriefMigrationApplication(runtime, { importTaskBrief(...args: any[]) {
    const result = runtime.importTaskBrief(...args); fs.writeFileSync(owner.file, '# 导入后文件又有新内容\n'); return result;
  } } as any, materials);
  const read = migration.migrateTaskBrief(root, 'import-partial', { dryRun: true });
  const partial = migration.migrateTaskBrief(root, 'import-partial', observed(read));
  assert.equal(partial.status, 'partial'); assert.equal(partial.diagnostics[0].code, 'task_materials_document_conflict');
  assert.equal(runtime.readTask(root, 'import-partial').record.brief, '# 观察的旧正文\n');
  assert.equal(materials.inspectLegacyTaskBrief(root, 'import-partial').reference.role, 'brief');
  const written = runtime.readTask(root, 'import-partial');
  runtime.updateTask(root, 'import-partial', { expectedRecordDigest: written.recordDigest, brief: '# 用户明确编辑后的新正文\n' });
  const before = runtime.readTask(root, 'import-partial');
  const retry = migration.migrateTaskBrief(root, 'import-partial');
  assert.equal(retry.status, 'association-released'); assert.deepEqual(runtime.readTask(root, 'import-partial'), before);
  assert.equal(fs.readFileSync(owner.file, 'utf8'), '# 导入后文件又有新内容\n');
  assert.equal(materials.inspectLegacyTaskBrief(root, 'import-partial').reference, null);
});

applicationTest('批次先遍历分页再导入；CLI dry-run零写入并覆盖超过100项', { timeout: 60000 }, t => {
  const { root } = taskRecordFixture(t, 'brief-import-batch');
  const runtime = t.buildrContexts.application;
  const ids = Array.from({ length: 105 }, (_, index) => `legacy-${String(index).padStart(3, '0')}`);
  for (const id of ids) { create(runtime, root, id); legacy(root, id, `# ${id}\n`); }
  const dry = runBuildrJson(['task', 'brief', 'migrate', '--all', '--dry-run', '--target', root]);
  assert.equal(dry.counts.ready, ids.length);
  assert.equal(runtime.readTask(root, ids[0]).record.brief, null);
  const result = runBuildrJson(['task', 'brief', 'migrate', '--all', '--target', root]);
  assert.equal(result.counts.migrated, ids.length);
  for (const id of ids) assert.equal(runtime.readTask(root, id).record.brief, `# ${id}\n`);
  const repeated = runBuildrJson(['task', 'brief', 'migrate', '--all', '--target', root]);
  assert.equal(repeated.counts['already-present'], ids.length);
});

test('项目与本机链接保留编码和fragment，不改代码、转义和非链接文本', () => {
  const origin: any = { id: 'brief', role: 'brief', title: '旧说明', source: { kind: 'project', project: 'demo', path: 'tasks/one/brief.md' } };
  const code = '> ```markdown\n> const marker = "```";\n> [代码](guide.md)\n> ```\n';
  const nested = '- ```markdown\n  const marker = "```";\n  [代码](guide.md)\n  ```\n';
  const plain = '普通文本 ](guide.md) 与 `未匹配\n[真实](guide.md)\n';
  const span = '`` `literal` [代码](guide.md) ``\n`[代码](guide.md)`\n';
  const content = `[空格](design%20notes.md#目标)\n[井号](a%23b.md)\n[百分号](a%25b.md)\n${code}${nested}${span}${plain}\\[转义](guide.md)\n[外部](https://example.com/x.md)\n`;
  const result = normalizeTaskBriefLinks(content, origin, []);
  assert.match(result.content, /projects\/demo\/tasks\/one\/design%20notes\.md#目标/);
  assert.match(result.content, /projects\/demo\/tasks\/one\/a%23b\.md/);
  assert.match(result.content, /projects\/demo\/tasks\/one\/a%25b\.md/);
  assert.ok(result.content.includes(code)); assert.ok(result.content.includes(nested)); assert.ok(result.content.includes(span));
  assert.ok(result.content.includes('普通文本 ](guide.md) 与 `未匹配'));
  assert.match(result.content, /\[真实\]\(projects\/demo\/tasks\/one\/guide\.md\)/);
  assert.ok(result.content.includes('\\[转义](guide.md)')); assert.ok(result.content.includes('https://example.com/x.md'));
  const localResult = normalizeTaskBriefLinks('[方案](design%20notes.md)', { ...origin, source: { kind: 'task', path: 'brief.md' } }, [local('solution', 'solution', 'design notes.md')] as any);
  assert.equal(localResult.content, '[方案](design%20notes.md)');
  const rejected = normalizeTaskBriefLinks('[越界](../../../secret.md)\n![图片](asset.png)', origin, []);
  assert.equal(rejected.rewrittenLinks, 0); assert.equal(rejected.diagnostics.length, 2);
});
