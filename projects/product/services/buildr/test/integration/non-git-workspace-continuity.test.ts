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
import { sameFilesystemPath } from '../../src/infrastructure/filesystem/filesystem-path-identity.ts';

const serviceRoot = path.resolve(import.meta.dirname, '../..');
const file = path.join(import.meta.dirname, 'non-git-workspace-continuity.test.ts');
const digest = (content: string) => `sha256-${crypto.createHash('sha256').update(content).digest('hex')}`;
function sameExistingDirectory(left: string, right: string): boolean {
  try { return fs.statSync(left).isDirectory() && fs.statSync(right).isDirectory() && sameFilesystemPath(left, right); }
  catch { return false; }
}
function assertSameDirectories(actual: string[], expected: string[]): void {
  assert.equal(actual.length, expected.length);
  for (const reference of expected) assert.equal(actual.filter(observed => sameExistingDirectory(observed, reference)).length, 1);
  for (const observed of actual) assert.equal(expected.filter(reference => sameExistingDirectory(observed, reference)).length, 1);
}
const sidebars = [
  ['openspec-propose', 'openspec-propose-sidebar.md'],
  ['openspec-apply-change', 'openspec-apply-sidebar.md'],
  ['openspec-update-change', 'openspec-update-sidebar.md'],
  ['openspec-sync-specs', 'openspec-sync-converge.md'],
  ['openspec-archive-change', 'openspec-archive-converge.md'],
];

async function scenario({ nestedGit = false } = {}) {
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
  let nestedRepository: { root: string; head: string; refs: string } | null = null;
  const assertNoGit = () => {
    const observed = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: workspace, env, encoding: 'utf8' });
    assert.equal(observed.status, 128, observed.stdout || observed.stderr);
    for (const name of fs.readdirSync(workspace, { recursive: true })) {
      if (nestedRepository && String(name) === path.join('repositories', 'unchanged', '.git')) continue;
      assert.notEqual(path.basename(String(name)), '.git', `Unexpected Git object: ${name}`);
      assert.notEqual(path.basename(String(name)), '.worktrees', `Unexpected task checkout: ${name}`);
    }
    if (nestedRepository) {
      const git = (args: string[]) => {
        const result = spawnSync('git', args, { cwd: nestedRepository!.root, env, encoding: 'utf8' });
        assert.equal(result.status, 0, result.stderr || result.stdout);
        return result.stdout.trim();
      };
      assert.equal(git(['rev-parse', 'HEAD']), nestedRepository.head);
      assert.equal(git(['show-ref']), nestedRepository.refs);
      assert.equal(git(['status', '--porcelain']), '');
      assert.equal(fs.readFileSync(path.join(nestedRepository.root, 'base.txt'), 'utf8'), 'Existing code must remain unchanged.\n');
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

  let catalog = json(['assets', 'inspect', ...target]);
  if (nestedGit) {
    const codeRoot = path.join(workspace, 'repositories/unchanged');
    fs.mkdirSync(codeRoot, { recursive: true });
    const git = (args: string[]) => {
      const result = spawnSync('git', args, { cwd: codeRoot, env, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr || result.stdout);
      return result.stdout.trim();
    };
    git(['init', '--initial-branch=main']);
    git(['config', 'user.name', 'Buildr Test']); git(['config', 'user.email', 'buildr-test@example.com']);
    fs.writeFileSync(path.join(codeRoot, 'base.txt'), 'Existing code must remain unchanged.\n');
    git(['add', '--', 'base.txt']); git(['-c', 'commit.gpgSign=false', 'commit', '-m', 'existing code']);
    const repositoryInput = input('repository.json', JSON.stringify({ revision: catalog.revision, code: 'unchanged', path: 'repositories/unchanged', integrationBranch: 'main' }));
    catalog = json(['assets', 'create', 'repository', ...target, '--input', repositoryInput]);
    assert.equal(catalog.repositories[0].source.type, 'git');
    assert.equal(catalog.repositories[0].source.git, undefined, 'A local repository must not acquire a fictional remote.');
    nestedRepository = { root: codeRoot, head: git(['rev-parse', 'HEAD']), refs: git(['show-ref']) };
    assertNoGit();
  }
  const projectInput = input('project.json', JSON.stringify({ revision: catalog.revision, code: 'documents', name: '纯资料项目' }));
  const createdProject = json(['assets', 'create', 'project', ...target, '--input', projectInput]);
  assert.equal(createdProject.projects[0].source.type, 'workspace');
  if (nestedGit) {
    const serviceInput = input('service.json', JSON.stringify({ revision: createdProject.revision, projectId: createdProject.projects[0].id, service: { code: 'unchanged-api', name: '已有实现', repositoryId: createdProject.repositories[0].id } }));
    const withCode = json(['assets', 'create', 'service', ...target, '--input', serviceInput]);
    assert.deepEqual(withCode.projects[0].serviceIds, [withCode.services[0].id]);
  }
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
    process.stdout.write(`${nestedGit ? 'Mixed-root document' : 'Non-Git public Task'} lifecycle, projected policies, shared document reads and scoped material version guards passed.\n`);
  } finally {
    await new Promise<void>(resolve => instance.server.close(() => resolve()));
  }
}

async function nestedGitIsolationScenario() {
  const smokeRoot = process.env.BUILDR_SMOKE_ROOT;
  const workspace = process.env.BUILDR_SMOKE_WORKSPACE_ROOT;
  assert.ok(smokeRoot && workspace, 'Use the existing isolated Workspace smoke runner.');
  assert.ok(fs.existsSync(path.join(smokeRoot, '.buildr-smoke-owner')));
  assert.equal(process.env.BUILDR_APP_DATA_DIR, path.join(smokeRoot, 'app-data'));
  assert.equal(process.env.BUILDR_PRODUCT_DATA_DIR, path.join(smokeRoot, 'product-data'));
  const env = { ...process.env };
  delete env.GIT_DIR; delete env.GIT_WORK_TREE;
  const run = (args: string[], expected = 0, json = true) => {
    const result = spawnSync(process.execPath, [path.join(serviceRoot, 'bin/buildr.mjs'), ...args, '--target', workspace, ...(json ? ['--json'] : [])], { cwd: smokeRoot, env, encoding: 'utf8', timeout: 30_000, maxBuffer: 8 * 1024 * 1024 });
    assert.equal(result.status, expected, `${args.join(' ')}\n${result.error?.message || ''}\n${result.stdout}\n${result.stderr}`);
    return json ? JSON.parse(result.stdout) : result;
  };
  const input = path.join(smokeRoot, 'asset-input.json');
  const write = (args: string[], value: unknown) => { fs.writeFileSync(input, JSON.stringify(value)); return run([...args, '--input', input]); };
  const git = (cwd: string, args: string[], expected = 0) => {
    const result = spawnSync('git', args, { cwd, env, encoding: 'utf8' });
    assert.equal(result.status, expected, `${cwd}: git ${args.join(' ')}\n${result.stderr || result.stdout}`);
    return result.stdout.trim();
  };
  run(['init', '--name', 'mixed-workspace', '--description', 'Nested Git isolation fixture', '--profile', 'personal'], 0, false);
  const assertRootHasNoGit = () => {
    git(workspace, ['rev-parse', '--show-toplevel'], 128);
    assert.equal(fs.existsSync(path.join(workspace, '.git')), false);
  };
  assertRootHasNoGit();
  const retainedDocument = path.join(workspace, 'notes.md');
  fs.writeFileSync(retainedDocument, '# 当前资料\n\n普通资料保留在非 Git 位置。\n');
  const originalDocument = fs.readFileSync(retainedDocument, 'utf8');
  const createSource = (code: string) => {
    const root = path.join(workspace, 'repositories', code);
    fs.mkdirSync(path.join(root, 'modules/shared'), { recursive: true });
    git(root, ['init', '--initial-branch=main']);
    git(root, ['config', 'user.name', 'Buildr Test']);
    git(root, ['config', 'user.email', 'buildr-test@example.com']);
    fs.writeFileSync(path.join(root, 'base.txt'), `${code} baseline\n`);
    fs.writeFileSync(path.join(root, 'modules/shared/source.ts'), 'export const initial = true;\n');
    git(root, ['add', '--', 'base.txt', 'modules/shared/source.ts']);
    git(root, ['-c', 'commit.gpgSign=false', 'commit', '-m', `${code} baseline`]);
    return root;
  };
  const apiRoot = createSource('api'), workerRoot = createSource('worker');
  let catalog = run(['assets', 'inspect']);
  catalog = write(['assets', 'create', 'project'], { revision: catalog.revision, code: 'demo', name: 'Mixed project' });
  const projectId = catalog.projects[0].id;
  for (const code of ['api', 'worker']) catalog = write(['assets', 'create', 'repository'], { revision: catalog.revision, code, path: `repositories/${code}`, integrationBranch: 'main' });
  for (const repository of catalog.repositories) {
    assert.equal(repository.source.type, 'git');
    assert.equal(repository.source.git, undefined);
    assert.equal(repository.source.integrationBranch, 'main');
  }
  for (const [code, repositoryCode, modulePath] of [['api', 'api', ''], ['api-view', 'api', 'modules/shared'], ['worker', 'worker', '']]) {
    catalog = write(['assets', 'create', 'service'], { revision: catalog.revision, projectId, service: { code, name: code, repositoryId: catalog.repositories.find((item: { code: string }) => item.code === repositoryCode).id, modulePath } });
  }
  const taskId = 'nested-code', branch = `codex/${taskId}`;
  const task = run(['task', 'create', taskId, '--title', '隔离嵌套代码', '--intent', '修改两个实际 Git 来源并保留普通资料', '--project', 'demo', '--service', 'demo/api', '--service', 'demo/api-view', '--service', 'demo/worker']);
  const create = ['worktree', 'create', taskId, '--branch', branch, '--include', 'service:demo/api', '--include', 'service:demo/api-view', '--include', 'service:demo/worker'];
  const created = run(create);
  assert.equal(created.status, 'ready');
  assert.deepEqual(created.repositories.map((item: { selector: string }) => item.selector), ['service:demo/api', 'service:demo/worker']);
  assertRootHasNoGit();
  assert.equal(fs.existsSync(path.join(apiRoot, 'modules/shared/.git')), false);
  assert.ok(fs.existsSync(created.evidencePath));
  const retry = run(create);
  assert.equal(retry.status, 'ready');
  assert.deepEqual(retry.repositories.map((item: { checkoutPath: string }) => item.checkoutPath), created.repositories.map((item: { checkoutPath: string }) => item.checkoutPath));
  assert.ok(retry.repositories.every((item: { state: string }) => item.state === 'reused'));
  const inspected = run(['worktree', 'inspect', taskId]);
  assert.equal(inspected.status, 'ready');
  assert.equal(inspected.repositories.length, 2);
  const preview = run(['web', 'preview', 'start', 'nested-preview', '--task', taskId, '--no-open'], 1, false);
  assert.match(`${preview.stdout}${preview.stderr}`, /preview_worktree_scope_missing/);
  const projectRelative = 'knowledge/docs/current.md';
  const projectDocument = path.join(workspace, 'projects/demo', projectRelative);
  fs.mkdirSync(path.dirname(projectDocument), { recursive: true });
  fs.writeFileSync(projectDocument, '# 当前项目资料\n\n这份资料属于实际非 Git 项目目录。\n');
  const materialsInput = path.join(smokeRoot, 'mixed-materials.json');
  fs.writeFileSync(materialsInput, JSON.stringify({ schemaVersion: 'buildr.task-materials/v2', documents: [{ id: 'project', role: 'implementation', title: '项目当前资料', source: { kind: 'project', project: 'demo', path: projectRelative } }] }));
  const materials = run(['task', 'materials', 'record', taskId, '--materials', materialsInput, '--expected-current', 'absent']);
  assert.equal(materials.documents[0].provenance, 'retained-project');
  assert.equal(materials.documents[0].content, fs.readFileSync(projectDocument, 'utf8'));
  assert.equal(materials.documents[0].actualDigest, digest(materials.documents[0].content));
  fs.appendFileSync(projectDocument, '\n其他入口刚更新的资料。\n');
  const currentMaterials = run(['task', 'materials', 'inspect', taskId]);
  assert.equal(currentMaterials.documents[0].content, fs.readFileSync(projectDocument, 'utf8'));
  assert.equal(currentMaterials.documents[0].actualDigest, digest(currentMaterials.documents[0].content));
  assert.notEqual(currentMaterials.documents[0].actualDigest, materials.documents[0].actualDigest);
  const projectRoot = path.join(workspace, 'projects/demo');
  git(projectRoot, ['init', '--initial-branch=main']);
  const gitProjectMaterials = run(['task', 'materials', 'inspect', taskId]);
  assert.equal(gitProjectMaterials.documents[0].diagnostic.code, 'task_worktree_project_root_unavailable');
  assert.equal(gitProjectMaterials.documents[0].content, null);
  assert.equal(gitProjectMaterials.documents[0].actualDigest, null);
  assert.equal(fs.readFileSync(projectDocument, 'utf8'), currentMaterials.documents[0].content);
  fs.rmSync(path.join(projectRoot, '.git'), { recursive: true });
  assert.equal(run(['task', 'materials', 'inspect', taskId]).documents[0].actualDigest, currentMaterials.documents[0].actualDigest);

  // The second Git source must not hold another authority for the same group.
  const sourceRecords = created.repositories as Array<{ selector: string; sourceRepository: string; checkoutPath: string; branch: string }>;
  const originalEvidence = fs.readFileSync(created.evidencePath, 'utf8');
  const otherDirectory = path.join(path.resolve(workerRoot, git(workerRoot, ['rev-parse', '--git-common-dir'])), 'buildr/task-worktrees');
  fs.mkdirSync(otherDirectory, { recursive: true });
  const duplicateEvidence = path.join(otherDirectory, `${taskId}.json`);
  assert.notEqual(fs.realpathSync(path.dirname(created.evidencePath)), fs.realpathSync(otherDirectory));
  fs.writeFileSync(duplicateEvidence, originalEvidence, { flag: 'wx' });
  const ambiguous = run(['worktree', 'inspect', taskId], 1);
  assert.equal(ambiguous.status, 'blocked');
  assert.deepEqual(ambiguous.effects, []);
  assert.equal(fs.readFileSync(created.evidencePath, 'utf8'), originalEvidence);
  assert.equal(fs.readFileSync(duplicateEvidence, 'utf8'), originalEvidence);
  sourceRecords.forEach(item => assert.equal(fs.existsSync(item.checkoutPath), true));
  fs.unlinkSync(duplicateEvidence);
  assert.equal(run(['worktree', 'inspect', taskId]).status, 'ready');

  // Another group's unreadable/duplicate association may also claim these members.
  const otherTaskId = 'conflicted-other';
  run(['task', 'create', otherTaskId, '--title', '需要核对的关联', '--intent', '不能把重复来源吞掉后断言另一个关联唯一', '--project', 'demo']);
  const uncertainEvidence = JSON.stringify({ ...JSON.parse(originalEvidence), taskId: otherTaskId });
  const conflictingFiles = [path.join(path.dirname(created.evidencePath), `${otherTaskId}.json`), path.join(otherDirectory, `${otherTaskId}.json`)];
  conflictingFiles.forEach(location => fs.writeFileSync(location, uncertainEvidence, { flag: 'wx' }));
  const uncertainCatalog = run(['code', 'repositories', '--task', taskId]);
  const currentPaths = sourceRecords.map(item => {
    const alias = path.join(path.dirname(item.checkoutPath), path.basename(item.checkoutPath).toUpperCase());
    if (!fs.existsSync(alias)) return item.checkoutPath;
    const actualStat = fs.statSync(item.checkoutPath, { bigint: true }), aliasStat = fs.statSync(alias, { bigint: true });
    assert.equal(actualStat.dev, aliasStat.dev); assert.equal(actualStat.ino, aliasStat.ino);
    assert.notEqual(actualStat.ino, 0n);
    return alias;
  });
  assertSameDirectories(currentPaths, sourceRecords.map(item => item.checkoutPath));
  const missingCheckout = path.join(workspace, '.worktrees/missing-checkout');
  assert.equal(fs.existsSync(missingCheckout), false);
  assert.equal(sameExistingDirectory(missingCheckout, missingCheckout), false);
  assert.throws(() => assertSameDirectories([currentPaths[0], missingCheckout], currentPaths), { code: 'ERR_ASSERTION' });
  assert.throws(() => assertSameDirectories([sourceRecords[0].sourceRepository, currentPaths[1]], currentPaths), { code: 'ERR_ASSERTION' });
  assert.throws(() => assertSameDirectories([currentPaths[0], currentPaths[0]], currentPaths), { code: 'ERR_ASSERTION' });
  const uncertainMembers = uncertainCatalog.worktrees.filter((item: { path: string }) => currentPaths.some(reference => sameExistingDirectory(item.path, reference)));
  assert.equal(uncertainMembers.length, 2);
  assertSameDirectories(uncertainMembers.map((item: { path: string }) => item.path), currentPaths);
  assert.ok(uncertainMembers.every((item: { taskId: string | null; available: boolean }) => item.available && item.taskId === null));
  assert.ok(uncertainCatalog.diagnostics.some((item: { code: string }) => item.code === 'code_worktree_task_unconfirmed'));
  const uncertainControl = run(['code', 'source-control', '--task', taskId]);
  const controlMembers = uncertainControl.repositories.flatMap((item: { worktrees: Array<{ location: string; taskId: string | null; taskDiagnostic: string | null; available: boolean }> }) => item.worktrees).filter((item: { location: string }) => currentPaths.some(reference => sameExistingDirectory(item.location, reference)));
  assert.equal(controlMembers.length, 2);
  assertSameDirectories(controlMembers.map((item: { location: string }) => item.location), currentPaths);
  assert.ok(controlMembers.every((item: { taskId: string | null; taskDiagnostic: string | null; available: boolean }) => item.available && item.taskId === null && item.taskDiagnostic));
  const ambiguousCleanup = run(['worktree', 'cleanup', otherTaskId, ...sourceRecords.flatMap(item => {
    const head = git(item.checkoutPath, ['rev-parse', 'HEAD']);
    return ['--expected-source', `${item.selector}=${head}`, '--delivered-ref', `${item.selector}=${head}`];
  })], 1);
  assert.equal(ambiguousCleanup.status, 'blocked');
  assert.deepEqual(ambiguousCleanup.effects, []);
  sourceRecords.forEach(item => assert.equal(fs.existsSync(item.checkoutPath), true));
  conflictingFiles.forEach(location => { assert.equal(fs.readFileSync(location, 'utf8'), uncertainEvidence); fs.unlinkSync(location); });

  const codeCatalog = run(['code', 'repositories', '--task', taskId]);
  assert.deepEqual(codeCatalog.selectedWorktreeGroupIds, [`task:${taskId}`]);
  assert.deepEqual(new Set(codeCatalog.selectedRepositoryIds), new Set(catalog.repositories.map((item: { id: string }) => item.id)));
  const taskMembers = codeCatalog.worktrees.filter((item: { kind: string }) => item.kind === 'task');
  assert.equal(taskMembers.length, 2);
  assert.ok(taskMembers.every((item: { taskId: string; available: boolean }) => item.taskId === taskId && item.available));
  assertSameDirectories(taskMembers.map((item: { path: string }) => item.path), currentPaths);
  const groupRoot = path.join(workspace, '.worktrees', taskId);
  const groupDocument = path.join(groupRoot, 'implementation.md');
  fs.writeFileSync(groupDocument, '# 组内资料\n\n清理 Git 对象必须保留本文件。\n');
  const groupContent = fs.readFileSync(groupDocument, 'utf8');
  const sourceHeads: Record<string, string> = {}, deliveredHeads: Record<string, string> = {};
  for (const item of sourceRecords) {
    fs.writeFileSync(path.join(item.checkoutPath, 'result.txt'), `${item.selector} result\n`);
    git(item.checkoutPath, ['add', '--', 'result.txt']);
    git(item.checkoutPath, ['-c', 'commit.gpgSign=false', 'commit', '-m', `feat: ${item.selector}`, '-m', `Buildr-Task: ${taskId}`]);
    sourceHeads[item.selector] = git(item.checkoutPath, ['rev-parse', 'HEAD']);
  }
  const beforeTask = run(['task', 'inspect', taskId]);
  const commits = run(['task', 'commits', taskId]);
  assert.equal(commits.status, 'complete', JSON.stringify(commits.diagnostics));
  assert.deepEqual(new Set(commits.commits.map((item: { hash: string }) => item.hash)), new Set(Object.values(sourceHeads)));
  assert.equal(commits.repositories.length, 2);
  assert.equal(run(['task', 'inspect', taskId]).recordDigest, beforeTask.recordDigest);
  assert.equal(beforeTask.recordDigest, task.recordDigest);
  for (const item of sourceRecords) {
    git(item.sourceRepository, ['merge', '--ff-only', branch]);
    deliveredHeads[item.selector] = git(item.sourceRepository, ['rev-parse', 'HEAD']);
    assert.equal(deliveredHeads[item.selector], sourceHeads[item.selector]);
  }
  const cleanup = (records = sourceRecords) => ['worktree', 'cleanup', taskId, ...records.flatMap(item => ['--expected-source', `${item.selector}=${sourceHeads[item.selector]}`, '--delivered-ref', `${item.selector}=${deliveredHeads[item.selector]}`])];
  const partialDelivery = run(cleanup(sourceRecords.slice(0, 1)), 1);
  assert.equal(partialDelivery.status, 'blocked');
  assert.deepEqual(partialDelivery.effects, []);
  sourceRecords.forEach(item => assert.equal(fs.existsSync(item.checkoutPath), true));
  const cleaned = run(cleanup());
  assert.equal(cleaned.status, 'cleaned');
  assert.equal(fs.existsSync(created.evidencePath), false);
  sourceRecords.forEach(item => {
    assert.equal(fs.existsSync(item.checkoutPath), false);
    git(item.sourceRepository, ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`], 1);
    assert.equal(fs.readFileSync(path.join(item.sourceRepository, 'result.txt'), 'utf8'), `${item.selector} result\n`);
  });
  assert.equal(fs.readFileSync(groupDocument, 'utf8'), groupContent);
  assert.equal(fs.readFileSync(retainedDocument, 'utf8'), originalDocument);
  assert.match(fs.readFileSync(projectDocument, 'utf8'), /其他入口刚更新的资料/);

  // Only current child objects are available after losing this case's evidence.
  const recreated = run(create);
  assert.equal(recreated.status, 'ready');
  fs.unlinkSync(recreated.evidencePath);
  const observed = path.join(smokeRoot, 'observed-checkouts.json');
  const currentRecords = recreated.repositories.map((item: { selector: string; sourceRepository: string; checkoutPath: string; branch: string }) => ({ selector: item.selector, sourceRepository: item.sourceRepository, checkoutPath: item.checkoutPath, branch: item.branch }));
  fs.writeFileSync(observed, JSON.stringify(currentRecords.slice(0, 1)));
  const omitted = run([...cleanup(sourceRecords.slice(0, 1)), '--observed-checkouts', observed], 1);
  assert.equal(omitted.status, 'blocked');
  assert.deepEqual(omitted.effects, []);
  currentRecords.forEach((item: { checkoutPath: string }) => assert.equal(fs.existsSync(item.checkoutPath), true));
  fs.writeFileSync(observed, JSON.stringify(currentRecords));
  const observedInspection = run(['worktree', 'inspect', taskId, '--observed-checkouts', observed]);
  assert.equal(observedInspection.status, 'ready');
  assert.equal(observedInspection.evidenceSource, 'observed');
  assert.equal(fs.existsSync(recreated.evidencePath), false);
  const recovered = run([...cleanup(), '--observed-checkouts', observed]);
  assert.equal(recovered.status, 'cleaned');
  assert.equal(recovered.evidenceSource, 'observed');
  assert.equal(fs.existsSync(recreated.evidencePath), false);
  assert.equal(fs.readFileSync(groupDocument, 'utf8'), groupContent);
  currentRecords.forEach((item: { checkoutPath: string }) => assert.equal(fs.existsSync(item.checkoutPath), false));

  // A damaged, unrelated declaration cannot stop healthy selected work or data.
  const badRoot = createSource('broken');
  catalog = write(['assets', 'create', 'project'], { revision: catalog.revision, code: 'other', name: 'Other project' });
  catalog = write(['assets', 'create', 'repository'], { revision: catalog.revision, code: 'broken', path: 'repositories/broken', integrationBranch: 'main' });
  catalog = write(['assets', 'create', 'service'], { revision: catalog.revision, projectId: catalog.projects.find((item: { code: string }) => item.code === 'other').id, service: { code: 'broken-api', name: 'Broken API', repositoryId: catalog.repositories.find((item: { code: string }) => item.code === 'broken').id } });
  const badGit = path.join(badRoot, '.git');
  fs.renameSync(badGit, path.join(smokeRoot, 'broken-git-preserved'));
  fs.writeFileSync(badGit, 'gitdir: unavailable-git-directory\n');
  const goodRefs = [apiRoot, workerRoot].map(root => git(root, ['show-ref']));
  const rejected = run(['worktree', 'create', 'bad-selection', '--branch', 'codex/bad-selection', '--include', 'service:demo/api', '--include', 'service:other/broken-api'], 1);
  assert.equal(rejected.status, 'blocked');
  assert.deepEqual(rejected.effects, []);
  [apiRoot, workerRoot].forEach((root, index) => assert.equal(git(root, ['show-ref']), goodRefs[index]));
  assert.equal(fs.existsSync(path.join(workspace, '.worktrees/bad-selection')), false);
  fs.appendFileSync(retainedDocument, '\n坏代码库不阻止已确认的资料维护。\n');
  const docsTask = run(['task', 'create', 'mixed-documents', '--title', '资料接续', '--intent', '维护实际资料', '--project', 'demo']);
  const docsCompleted = run(['task', 'complete', 'mixed-documents', '--summary', '普通资料继续维护，未写损坏来源。', '--expected-record', docsTask.recordDigest]);
  assert.equal(docsCompleted.record.status, 'completed');
  const healthy = run(create);
  assert.equal(healthy.status, 'ready');
  assert.equal(run(['worktree', 'inspect', taskId]).status, 'ready');
  const uncertainHealthyCatalog = run(['code', 'repositories', '--task', taskId]);
  const healthyPaths = healthy.repositories.map((item: { checkoutPath: string }) => item.checkoutPath);
  const healthyCatalogMembers = uncertainHealthyCatalog.worktrees.filter((item: { path: string }) => healthyPaths.some((reference: string) => sameExistingDirectory(item.path, reference)));
  assert.equal(healthyCatalogMembers.length, 2);
  assertSameDirectories(healthyCatalogMembers.map((item: { path: string }) => item.path), healthyPaths);
  assert.ok(healthyCatalogMembers.every((item: { available: boolean; taskId: string | null }) => item.available && item.taskId === null));
  const uncertainHealthyControl = run(['code', 'source-control', '--task', taskId]);
  const healthyControlMembers = uncertainHealthyControl.repositories.flatMap((item: { worktrees: Array<{ location: string; available: boolean; taskId: string | null; taskDiagnostic: string | null }> }) => item.worktrees).filter((item: { location: string }) => healthyPaths.some((reference: string) => sameExistingDirectory(item.location, reference)));
  assert.equal(healthyControlMembers.length, 2);
  assertSameDirectories(healthyControlMembers.map((item: { location: string }) => item.location), healthyPaths);
  assert.ok(healthyControlMembers.every((item: { available: boolean; taskId: string | null; taskDiagnostic: string | null }) => item.available && item.taskId === null && item.taskDiagnostic));
  assert.equal(fs.readFileSync(badGit, 'utf8'), 'gitdir: unavailable-git-directory\n');
  fs.unlinkSync(badGit); fs.renameSync(path.join(smokeRoot, 'broken-git-preserved'), badGit);
  const confirmedHealthyCatalog = run(['code', 'repositories', '--task', taskId]);
  assert.equal(confirmedHealthyCatalog.worktrees.filter((item: { kind: string; taskId: string }) => item.kind === 'task' && item.taskId === taskId).length, 2);
  const confirmedHealthyControl = run(['code', 'source-control', '--task', taskId]);
  assert.equal(confirmedHealthyControl.repositories.flatMap((item: { worktrees: Array<{ taskId: string | null }> }) => item.worktrees).filter((item: { taskId: string | null }) => item.taskId === taskId).length, 2);
  assert.equal(run(cleanup()).status, 'cleaned');
  assert.equal(fs.readFileSync(groupDocument, 'utf8'), groupContent);
  assert.match(fs.readFileSync(retainedDocument, 'utf8'), /坏代码库不阻止已确认的资料维护/);
  assert.equal(git(badRoot, ['status', '--porcelain']), '');

  // A missing leaf does not authorize writing through a symlinked group parent.
  const unsafeTask = 'escaped-group', unsafeRoot = path.join(workspace, '.worktrees', unsafeTask);
  const external = path.join(smokeRoot, 'external-group');
  fs.mkdirSync(unsafeRoot, { recursive: true }); fs.mkdirSync(external);
  fs.writeFileSync(path.join(external, 'owner.txt'), 'external content must remain unchanged\n');
  fs.symlinkSync(external, path.join(unsafeRoot, 'repositories'), 'dir');
  const externalNames = fs.readdirSync(external, { recursive: true });
  const beforeUnsafeRefs = git(apiRoot, ['show-ref']);
  const escaped = run(['worktree', 'create', unsafeTask, '--branch', `codex/${unsafeTask}`, '--include', 'service:demo/api'], 1);
  assert.equal(escaped.status, 'blocked'); assert.deepEqual(escaped.effects, []);
  assert.deepEqual(fs.readdirSync(external, { recursive: true }), externalNames);
  assert.equal(fs.readFileSync(path.join(external, 'owner.txt'), 'utf8'), 'external content must remain unchanged\n');
  assert.equal(git(apiRoot, ['show-ref']), beforeUnsafeRefs);
  assert.equal(fs.lstatSync(path.join(unsafeRoot, 'repositories')).isSymbolicLink(), true);
  assertRootHasNoGit();
  process.stdout.write('Nested Git public Worktree lifecycle passed.\n');
}

if (process.argv.includes('--nested-git-isolation-scenario')) {
  await nestedGitIsolationScenario();
} else if (process.argv.includes('--mixed-document-scenario')) {
  await scenario({ nestedGit: true });
} else if (process.argv.includes('--non-git-scenario')) {
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
  test('非 Git 根内有已登记 Git 代码库时，纯资料任务保留原地读取且不隔离无关代码', { timeout: 90_000 }, () => {
    const result = spawnSync(process.execPath, [path.join(serviceRoot, 'tools/development/run-isolated-workspace-smoke.ts'), '--script', file, '--', '--mixed-document-scenario'], { cwd: serviceRoot, encoding: 'utf8', timeout: 85_000, maxBuffer: 8 * 1024 * 1024 });
    assert.equal(result.status, 0, `${result.error?.message || ''}\n${result.stdout}\n${result.stderr}`);
    assert.match(result.stdout, /Mixed-root document lifecycle/);
    assert.match(result.stdout, /"cleanup":"cleaned"/);
    process.stdout.write(result.stdout);
    const receipt = JSON.parse(result.stdout.trim().split('\n').at(-1)!);
    assert.equal(fs.existsSync(receipt.temporaryRoot), false);
  });
}
