import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { createRuntime, runtimeProvide } from '../../src/bootstrap/runtime.ts';
import { WORKSPACE_APPLICATION } from '../../src/modules/workspace/module.ts';
import { createLocalWorkspaceServer } from '../../src/web/http/server.ts';

const serviceRoot = path.resolve(import.meta.dirname, '../..');
const file = path.join(import.meta.dirname, 'non-git-workspace-continuity.test.ts');
const digest = (content: string) => `sha256-${crypto.createHash('sha256').update(content).digest('hex')}`;
const sidebars = [
  ['openspec-propose', 'openspec-propose-sidebar.md'],
  ['openspec-apply-change', 'openspec-apply-sidebar.md'],
  ['openspec-update-change', 'openspec-update-sidebar.md'],
  ['openspec-sync-specs', 'openspec-sync-converge.md'],
  ['openspec-archive-change', 'openspec-archive-converge.md'],
];

async function scenario() {
  const smokeRoot = process.env.BUILDR_SMOKE_ROOT;
  const workspace = process.env.BUILDR_SMOKE_WORKSPACE_ROOT;
  assert.ok(smokeRoot && workspace, 'Use the existing isolated Workspace smoke runner.');
  assert.ok(fs.existsSync(path.join(smokeRoot, '.buildr-smoke-owner')));
  assert.equal(process.env.BUILDR_APP_DATA_DIR, path.join(smokeRoot, 'app-data'));
  assert.equal(process.env.BUILDR_PRODUCT_DATA_DIR, path.join(smokeRoot, 'product-data'));
  const env = { ...process.env };
  delete env.GIT_DIR; delete env.GIT_WORK_TREE;
  const cli = path.join(serviceRoot, 'bin/buildr.mjs');
  const target = ['--target', workspace];
  const run = (args: string[], expected = 0) => {
    const result = spawnSync(process.execPath, [cli, ...args], { cwd: smokeRoot, env, encoding: 'utf8', timeout: 30_000, maxBuffer: 8 * 1024 * 1024 });
    assert.equal(result.status, expected, `${args.join(' ')}\n${result.error?.message || ''}\n${result.stdout}\n${result.stderr}`);
    return result;
  };
  const json = (args: string[], expected = 0) => JSON.parse(run([...args, '--json'], expected).stdout);
  const input = (name: string, content: string) => {
    const location = path.join(smokeRoot, name);
    fs.writeFileSync(location, content);
    return location;
  };
  const assertNoGit = () => {
    const observed = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: workspace, env, encoding: 'utf8' });
    assert.equal(observed.status, 128, observed.stdout || observed.stderr);
    for (const name of fs.readdirSync(workspace, { recursive: true })) {
      assert.notEqual(path.basename(String(name)), '.git', `Unexpected Git object: ${name}`);
      assert.notEqual(path.basename(String(name)), '.worktrees', `Unexpected task checkout: ${name}`);
    }
  };

  run(['init', ...target, '--name', 'non-git-documents', '--description', 'Pure document workspace continuity fixture', '--profile', 'personal']);
  assertNoGit();
  const projected = (id: string) => fs.readFileSync(path.join(workspace, '.agents/skills', id, 'SKILL.md'), 'utf8');
  const triage = projected('task-triage');
  assert.match(triage, /已确认的非 Git 资料[^\n]*在已授权、已核对的实际位置使用所属专业工具维护/);
  assert.match(triage, /代码库集合（Repository Set）为 `none`/);
  assert.match(triage, /Git 观察失败、仓库损坏或已登记仓库缺失属于身份未明/);
  assert.match(triage, /重读和普通补丁不承诺对任意外部编辑器的原子并发保护/);
  for (const [id, sidebar] of sidebars) {
    const fragment = fs.readFileSync(path.join(serviceRoot, 'resources/workspace/components/buildr/openspec/contributions', sidebar), 'utf8').trim();
    const effective = projected(id);
    assert.ok(effective.includes(fragment), `${id} must consume its actual delivered sidebar`);
    assert.match(effective, /Git 文件默认复用当前任务工作树/);
    assert.match(effective, /已确认的非 Git 资料在已授权实际位置维护，不要求工作树或初始化仓库/);
    assert.match(effective, /身份未明只停止依赖该身份的写入/);
  }

  const catalog = json(['assets', 'inspect', ...target]);
  const projectInput = input('project.json', JSON.stringify({ revision: catalog.revision, code: 'documents', name: '纯资料项目' }));
  const createdProject = json(['assets', 'create', 'project', ...target, '--input', projectInput]);
  assert.equal(createdProject.projects[0].source.type, 'workspace');
  const projectRoot = path.join(workspace, 'projects/documents');
  const brief = input('brief.md', '# 资料维护目标\n\n核对当前正文、外部变化和完成结果。\n');
  const created = json(['task', 'create', 'document-work', '--title', '资料接续', '--intent', '维护真实非 Git 资料', '--project', 'documents', '--brief-file', brief, ...target]);
  assert.equal(created.record.status, 'active');
  assert.deepEqual(created.record.changes, []);
  const updatedBrief = input('brief-update.md', '# 资料维护目标\n\n已明确实际文件与验收范围。\n');
  const updated = json(['task', 'update', 'document-work', '--brief-file', updatedBrief, '--expected-record', created.recordDigest, ...target]);
  const stale = json(['task', 'update', 'document-work', '--title', '不得覆盖当前任务', '--expected-record', created.recordDigest, ...target], 1);
  assert.equal(stale.status, 'blocked');
  assert.equal(stale.diagnostic.code, 'task_record_conflict');
  assert.equal(json(['task', 'inspect', 'document-work', ...target]).recordDigest, updated.recordDigest);

  // This fixture represents a professional editor's ordinary file result. It is
  // deliberately not a product writer or a claimed atomic concurrency guard.
  const relativeDocument = 'knowledge/docs/continuity.md';
  const projectDocument = path.join(projectRoot, relativeDocument);
  fs.mkdirSync(path.dirname(projectDocument), { recursive: true });
  const initial = '# 项目当前说明\n\n这是唯一实际正文。\n';
  fs.writeFileSync(projectDocument, initial, { flag: 'wx' });
  const localInput = input('implementation.md', '# 本机实施材料\n\n实际说明位置已核对。\n');
  const local = json(['task', 'materials', 'write', 'document-work', '--path', 'implementation.md', '--content', localInput, '--expected-document', 'absent', ...target]);
  const references = input('materials.json', JSON.stringify({ schemaVersion: 'buildr.task-materials/v2', documents: [
    { id: 'project', role: 'implementation', title: '当前项目资料', source: { kind: 'project', project: 'documents', path: relativeDocument } },
    { id: 'local', role: 'implementation', title: '本机实施材料', source: { kind: 'task', path: 'implementation.md' } },
  ] }));
  const materials = json(['task', 'materials', 'record', 'document-work', '--materials', references, '--expected-current', 'absent', ...target]);
  assert.equal(materials.documents[0].content, initial);
  assert.equal(materials.documents[0].actualDigest, digest(initial));
  assert.equal(materials.documents[0].provenance, 'retained-project');

  const runtime = createRuntime();
  const workspaceApplication = runtimeProvide(runtime, WORKSPACE_APPLICATION);
  const instance = createLocalWorkspaceServer(runtime, {
    targetRoot: workspace,
    ensureRegisteredTarget: workspaceApplication.ensureRegisteredTarget,
    resolveRegisteredWorkspace: workspaceApplication.resolveRegisteredWorkspace,
  });
  try {
    const { url, initialWorkspaceId } = await instance.ready;
    const api = `${url}/api/v1/workspaces/${initialWorkspaceId}`;
    const get = async (suffix: string) => {
      const response = await fetch(api + suffix);
      assert.equal(response.status, 200, await response.clone().text());
      return response.json();
    };
    const readProject = () => get(`/projects/documents/documents/${encodeURIComponent(relativeDocument)}`);
    const readTask = () => get('/tasks/document-work/materials');
    const firstProject = await readProject();
    assert.equal(firstProject.path, relativeDocument); assert.equal(firstProject.content, initial);
    assert.deepEqual(await readTask(), materials);
    const knowledge = await get('/knowledge/project/documents/documents');
    const discovered = knowledge.documents.find((document: { path: string }) => document.path === relativeDocument);
    assert.ok(discovered, 'The existing knowledge reader must discover the real ordinary Markdown file.');
    const knowledgeBody = await get(`/knowledge/project/documents/documents/${discovered.id}`);
    assert.equal(knowledgeBody.content, initial);
    assert.match(knowledgeBody.digest, /^[a-f0-9]{64}$/);
    assert.equal(`sha256-${knowledgeBody.digest}`, materials.documents[0].actualDigest);

    fs.appendFileSync(projectDocument, '\n其他入口补充的当前内容。\n');
    const external = fs.readFileSync(projectDocument, 'utf8');
    const refreshed = json(['task', 'materials', 'inspect', 'document-work', ...target]);
    assert.equal(refreshed.documents[0].content, external); assert.equal(refreshed.documents[0].actualDigest, digest(external));
    assert.notEqual(refreshed.documents[0].actualDigest, materials.documents[0].actualDigest);
    assert.equal((await readProject()).content, external);
    assert.equal((await readTask()).documents[0].actualDigest, refreshed.documents[0].actualDigest);

    const localFile = path.join(workspace, '.buildr/local/task-materials/document-work/implementation.md');
    fs.appendFileSync(localFile, '\n外部编辑必须保留。\n');
    const externalLocal = fs.readFileSync(localFile, 'utf8');
    const conflict = run(['task', 'materials', 'write', 'document-work', '--path', 'implementation.md', '--content', localInput, '--expected-document', local.actualDigest, ...target, '--json'], 1);
    assert.match(`${conflict.stdout}${conflict.stderr}`, /task_materials_document_conflict/);
    assert.equal(fs.readFileSync(localFile, 'utf8'), externalLocal);
    const latest = json(['task', 'materials', 'inspect', 'document-work', ...target]);
    assert.equal(latest.documents[1].content, externalLocal); assert.equal(latest.documents[1].actualDigest, digest(externalLocal));
    assert.equal(json(['task', 'inspect', 'document-work', ...target]).recordDigest, updated.recordDigest, 'Material work must not rewrite Task Record.');
    const completed = json(['task', 'complete', 'document-work', '--summary', '项目正文和本机材料已回读，外部内容保留。', '--expected-record', updated.recordDigest, ...target]);
    assert.equal(completed.record.status, 'completed');
    assert.equal(fs.readFileSync(projectDocument, 'utf8'), external);
    assert.equal(fs.readFileSync(localFile, 'utf8'), externalLocal);
    assertNoGit();
    process.stdout.write('Non-Git public Task lifecycle, projected policies, shared document reads and scoped material version guards passed.\n');
  } finally {
    await new Promise<void>(resolve => instance.server.close(() => resolve()));
  }
}

if (process.argv.includes('--non-git-scenario')) {
  await scenario();
} else {
  test('纯非 Git 资料工作消费真实投射指引，通过公共任务与读取入口完成并保留外部材料', { timeout: 90_000 }, () => {
    const result = spawnSync(process.execPath, [path.join(serviceRoot, 'tools/development/run-isolated-workspace-smoke.ts'), '--script', file, '--', '--non-git-scenario'], { cwd: serviceRoot, encoding: 'utf8', timeout: 85_000, maxBuffer: 8 * 1024 * 1024 });
    assert.equal(result.status, 0, `${result.error?.message || ''}\n${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /Non-Git public Task lifecycle/);
    assert.match(result.stdout, /"cleanup":"cleaned"/);
    process.stdout.write(result.stdout);
    const receipt = JSON.parse(result.stdout.trim().split('\n').at(-1)!);
    assert.equal(fs.existsSync(receipt.temporaryRoot), false);
  });
}
