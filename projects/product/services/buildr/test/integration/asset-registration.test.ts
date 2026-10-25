import { createServiceDiagnostics } from '../../src/modules/workspace/application/diagnostics/service-diagnostics.ts';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';
import { spawnSync } from 'node:child_process';
import { resolveRuleScope } from '../../src/modules/agent-assets/infrastructure/runtime/rule-projection.ts';
import { createRuntime } from '../helpers/runtime-harness.ts';
import { copyPreparedProjectWorkspace, copyPreparedLegacyProjectWorkspace } from '../helpers/prepared-fixtures.ts';
import { createWorkspaceHttpContribution } from '../../src/modules/workspace/interfaces/http/workspace-http.ts';
import { setup, setupLegacy, ready, addRepo, waitFor, makeOriginRepository, initRepository } from '../helpers/asset-relationships.ts';



test('removed project can be registered through HTTP without changing its files or restoring old relationships', async (t: any) => {
  const { root, runtime } = setup(t);
  let catalog = ready(runtime, root);
  catalog = addRepo(runtime, root, catalog.revision, 'registration-code', 'dev');
  catalog = runtime.createCatalogService(root, { revision: catalog.revision, service: { code: 'registration-api', name: '保留服务', repositoryId: catalog.repositories[0].id } });
  const serviceId = catalog.services[0].id;
  catalog = runtime.createCatalogProject(root, { revision: catalog.revision, code: 'register-again', name: '原项目', serviceIds: [serviceId] });
  const previous = catalog.projects.find((project: any) => project.code === 'register-again');
  const directory = path.join(root, 'projects/register-again');
  fs.writeFileSync(path.join(directory, 'README.md'), '保留的用户内容\n');
  fs.rmSync(path.join(directory, 'commands.yml'));
  const snapshot = () => fs.readdirSync(directory, { recursive: true }).map(String).sort().map(relative => {
    const file = path.join(directory, relative);
    return [relative, fs.statSync(file).isFile() ? fs.readFileSync(file).toString('base64') : null];
  });
  const files = snapshot();
  catalog = runtime.deleteCatalogAsset(root, 'project', previous.id, { revision: catalog.revision });
  assert.throws(() => runtime.createCatalogProject(root, { revision: catalog.revision, code: previous.code, name: '错误创建' }), (error: any) => error.code === 'asset_directory_occupied');
  const http = createWorkspaceHttpContribution(runtime);
  const candidates: any = await http.handle({ request: { method: 'GET' }, suffix: '/asset-catalog/project-candidates', root });
  const selected = candidates.body.candidates.find((candidate: any) => candidate.code === previous.code);
  assert.equal(candidates.body.revision, catalog.revision);
  assert.deepEqual(snapshot(), files);
  let authorized = 0;
  const request = { revision: catalog.revision, code: previous.code, name: '重新登记', description: '新的业务说明', serviceIds: [serviceId], observation: selected.observation };
  const registered: any = await http.handle({ request: { method: 'POST' }, suffix: '/asset-catalog/projects/register', root, authorizeWrite: () => { authorized++; }, readJsonBody: async () => request });
  assert.equal(authorized, 1);
  const project = registered.body.projects.find((item: any) => item.code === previous.code);
  assert.notEqual(project.id, previous.id);
  assert.equal(project.name, '重新登记');
  assert.deepEqual(project.serviceIds, [serviceId]);
  assert.deepEqual(snapshot(), files);
  assert.equal(runtime.listProjectRegistrationCandidates(root).candidates.some((item: any) => item.code === previous.code), false);
  assert.throws(() => runtime.registerCatalogProject(root, { ...request, revision: registered.body.revision }), (error: any) => error.code === 'project_directory_registered');
  catalog = runtime.deleteCatalogAsset(root, 'project', project.id, { revision: registered.body.revision });
  const withoutServices = runtime.registerCatalogProject(root, { ...request, revision: catalog.revision, serviceIds: [] });
  assert.deepEqual(withoutServices.projects.find((item: any) => item.code === previous.code).serviceIds, []);
  assert.deepEqual(snapshot(), files);
});


test('project registration rejects stale catalogs, replaced directories and unsafe paths without altering the catalog', (t: any) => {
  const { root, runtime } = setup(t);
  let catalog = ready(runtime, root);
  const directory = path.join(root, 'projects/existing');
  fs.mkdirSync(directory);
  fs.writeFileSync(path.join(directory, 'keep.txt'), 'original');
  const candidate = runtime.listProjectRegistrationCandidates(root).candidates.find((item: any) => item.code === 'existing');
  const input = { revision: catalog.revision, code: 'existing', name: 'Existing', observation: candidate.observation };
  catalog = runtime.updateCatalogAsset(root, 'project', catalog.projects[0].id, { revision: catalog.revision, name: 'Changed' });
  assert.throws(() => runtime.registerCatalogProject(root, input), (error: any) => error.code === 'asset_revision_conflict');
  assert.throws(() => runtime.registerCatalogProject(root, { ...input, revision: catalog.revision, serviceIds: ['aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'] }), (error: any) => error.code === 'project_service_missing');
  fs.renameSync(directory, directory + '-original'); fs.mkdirSync(directory);
  assert.throws(() => runtime.registerCatalogProject(root, { ...input, revision: catalog.revision }), (error: any) => error.code === 'project_directory_changed');
  fs.rmdirSync(directory);
  assert.throws(() => runtime.registerCatalogProject(root, { ...input, revision: catalog.revision }), (error: any) => error.code === 'project_directory_changed');
  fs.symlinkSync(directory + '-original', directory);
  assert.equal(runtime.listProjectRegistrationCandidates(root).candidates.some((item: any) => item.code === 'existing'), false);
  assert.throws(() => runtime.registerCatalogProject(root, { ...input, revision: catalog.revision }), (error: any) => error.code === 'asset_symlink_forbidden');
  assert.throws(() => runtime.registerCatalogProject(root, { ...input, revision: catalog.revision, code: '../escape' }), (error: any) => error.code === 'project_directory_invalid');
  assert.equal(runtime.assetCatalog(root).revision, catalog.revision);
  assert.equal(fs.readFileSync(path.join(directory + '-original', 'keep.txt'), 'utf8'), 'original');
});


test('project candidates preserve independent Git sources and report incomplete sources locally', (t: any) => {
  const { root, runtime } = setup(t);
  const catalog = ready(runtime, root);
  const directory = path.join(root, 'projects/git-existing');
  initRepository(directory);
  let result = runtime.listProjectRegistrationCandidates(root);
  assert.equal(result.candidates.some((item: any) => item.code === 'git-existing'), false);
  assert.match(result.diagnostics.find((item: any) => item.code === 'git-existing').message, /origin/);
  assert.equal(spawnSync('git', ['remote', 'add', 'origin', 'https://example.com/project.git'], { cwd: directory }).status, 0);
  result = runtime.listProjectRegistrationCandidates(root);
  const candidate = result.candidates.find((item: any) => item.code === 'git-existing');
  assert.deepEqual(candidate.source, { type: 'git', path: 'projects/git-existing', git: { url: 'https://example.com/project.git', remote: 'origin', integrationBranch: 'dev' } });
  const input = { revision: catalog.revision, code: candidate.code, name: 'Existing Git project', observation: candidate.observation };
  assert.equal(spawnSync('git', ['remote', 'set-url', 'origin', 'https://example.com/changed.git'], { cwd: directory }).status, 0);
  assert.throws(() => runtime.registerCatalogProject(root, input), (error: any) => error.code === 'project_directory_changed');
  const refreshed = runtime.listProjectRegistrationCandidates(root).candidates.find((item: any) => item.code === candidate.code);
  const registered = runtime.registerCatalogProject(root, { ...input, observation: refreshed.observation });
  assert.deepEqual(registered.projects.find((item: any) => item.code === candidate.code).source, refreshed.source);
  assert.deepEqual(fs.readdirSync(directory), ['.git']);
});


test('project registration rechecks directory identity inside the write transaction', (t: any) => {
  const { root, runtime } = setup(t);
  const catalog = ready(runtime, root), directory = path.join(root, 'projects/racing');
  fs.mkdirSync(directory);
  const candidate = runtime.listProjectRegistrationCandidates(root).candidates.find((item: any) => item.code === 'racing');
  const mutate = runtime.withWorkspaceMutation;
  runtime.withWorkspaceMutation = (...args: any[]) => {
    fs.renameSync(directory, directory + '-original'); fs.mkdirSync(directory);
    return mutate(...args);
  };
  try {
    assert.throws(() => runtime.registerCatalogProject(root, { revision: catalog.revision, code: candidate.code, name: 'Racing', observation: candidate.observation }), (error: any) => error.code === 'project_directory_changed');
  } finally { runtime.withWorkspaceMutation = mutate; }
  assert.equal(runtime.assetCatalog(root).revision, catalog.revision);
  assert.ok(fs.existsSync(directory + '-original'));
  assert.deepEqual(fs.readdirSync(directory), []);
});


test('project candidate lookup is bounded and excludes a directory already registered under another identity', (t: any) => {
  const { root, runtime } = setup(t);
  const catalog = ready(runtime, root), location = path.join(root, 'projects/existing-alias');
  fs.mkdirSync(location);
  const candidate = runtime.listProjectRegistrationCandidates(root).candidates.find((item: any) => item.code === 'existing-alias');
  const manifestPath = path.join(root, 'projects/manifest.yml');
  const manifest = YAML.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.projects[catalog.projects[0].code].source = { type: 'git', root: 'attached', path: location, git: { url: 'https://example.com/existing.git', remote: 'origin', integrationBranch: 'dev' } };
  fs.writeFileSync(manifestPath, YAML.stringify(manifest));
  const current = runtime.assetCatalog(root);
  assert.equal(runtime.listProjectRegistrationCandidates(root).candidates.some((item: any) => item.code === 'existing-alias'), false);
  assert.throws(() => runtime.registerCatalogProject(root, { revision: current.revision, code: candidate.code, name: 'Alias', observation: candidate.observation }), (error: any) => error.code === 'project_directory_registered');
  for (let index = 0; index < 202; index++) fs.mkdirSync(path.join(root, 'projects', `candidate-${index}`));
  const result = runtime.listProjectRegistrationCandidates(root);
  assert.ok(result.candidates.length <= 200);
  assert.ok(result.diagnostics.some((item: any) => item.code === 'project_candidates_limited'));
  assert.equal(runtime.assetCatalog(root).revision, current.revision);
});


test('register actual workspace root and attached Git roots; reject child and ordinary directories', async (t: any) => {
  const { root, runtime } = setup(t); let c = ready(runtime, root);
  const ordinary = path.join(root, 'ordinary'); fs.mkdirSync(ordinary);
  assert.throws(() => runtime.createCatalogRepository(root, { revision: c.revision, code: 'bad', path: 'ordinary' }), /Git/);
  initRepository(root);
  c = runtime.createCatalogRepository(root, { revision: c.revision, code: 'workspace-code', path: '.' });
  assert.equal(c.repositories[0].source.path, '.'); assert.equal(c.repositories[0].source.type, 'git');
  assert.throws(() => runtime.createCatalogRepository(root, { revision: c.revision, code: 'child', path: 'ordinary' }), (e: any) => e.code === 'repository_not_root');
  assert.throws(() => runtime.createCatalogRepository(root, { revision: c.revision, code: 'duplicate', path: '.' }), (e: any) => e.code === 'repository_duplicate_path');
  const attached = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-attached-git-'));
  t.after(() => fs.rmSync(attached, { recursive: true, force: true })); initRepository(attached);
  c = runtime.createCatalogRepository(root, { revision: c.revision, code: 'attached', path: attached });
  assert.equal(c.repositories[1].source.root, 'attached');
  const http = createWorkspaceHttpContribution(runtime);
  const status: any = await http.handle({ request: { method: 'GET' }, suffix: `/repositories/${c.repositories[0].id}/status`, root });
  assert.equal(status.status, 200); assert.equal(status.body.available, true); assert.equal(status.body.observed.currentBranch, 'dev');
});


test('repository root registration and status use filesystem identity for valid path aliases', (t: any) => {
  const { root, runtime } = setup(t);
  let catalog = ready(runtime, root);
  const actual = path.join(root, 'MixedCaseRepository'), alias = path.join(root, 'mixedcaserepository');
  initRepository(actual);
  if (!fs.existsSync(alias)) fs.symlinkSync(actual, alias, 'junction');
  const actualStat = fs.statSync(actual, { bigint: true }), aliasStat = fs.statSync(alias, { bigint: true });
  assert.equal(aliasStat.dev, actualStat.dev); assert.equal(aliasStat.ino, actualStat.ino);
  fs.mkdirSync(path.join(actual, 'ordinary-child'));
  catalog = runtime.createCatalogRepository(root, { revision: catalog.revision, code: 'aliased-root', path: 'mixedcaserepository' });
  const registered = catalog.repositories.find((repository: any) => repository.code === 'aliased-root');
  assert.equal(registered.source.path, 'mixedcaserepository');
  catalog = runtime.createCatalogService(root, { revision: catalog.revision, service: { code: 'aliased-module', name: 'Alias module', repositoryId: registered.id, modulePath: 'ordinary-child' } });
  assert.equal(runtime.catalogRepositoryStatus(root, registered.id).available, true);
  const revision = catalog.revision;
  assert.throws(() => runtime.createCatalogRepository(root, { revision, code: 'aliased-child', path: 'mixedcaserepository/ordinary-child' }), (error: any) => error.code === 'repository_not_root');
  assert.throws(() => runtime.createCatalogRepository(root, { revision, code: 'duplicate-alias', path: 'MixedCaseRepository' }), (error: any) => error.code === 'repository_duplicate_path');
  assert.equal(runtime.assetCatalog(root).revision, revision);
});


test('normalization merges old workspace modules by real root while retaining service identities and content', (t: any) => {
  const { root, runtime } = setupLegacy(t); initRepository(root);
  for (const code of ['api', 'web']) {
    const source = path.join(root, `incoming-${code}`); fs.mkdirSync(source); fs.writeFileSync(path.join(source, 'README.md'), code);
    runtime.createServiceAsset({ targetRoot: root, project: 'demo', service: code, repoRef: source, attachRef: null, name: code, description: 'Legacy', type: 'service', rulesSource: null, integrationBranch: null, remote: 'origin', remoteExplicit: false, json: false });
  }
  let c = ready(runtime, root); const identities = c.services.map((s: any) => s.id);
  assert.equal(c.repositories.length, 2);
  c = runtime.normalizeCatalogRepositories(root, { revision: c.revision });
  assert.equal(c.repositories.length, 1); assert.equal(c.repositories[0].source.path, '.'); assert.equal(c.repositories[0].source.type, 'git');
  assert.deepEqual(c.services.map((s: any) => s.id), identities);
  for (const s of c.services) { assert.equal(s.repositoryId, c.repositories[0].id); assert.equal(s.modulePath, `projects/demo/services/${s.code}`); assert.equal(runtime.catalogServiceDocument(root, s.id, 'README.md').content, s.code); }
  assert.equal(runtime.normalizeCatalogRepositories(root, { revision: c.revision }).revision, c.revision);
});



test('services sharing the workspace Git root reuse its task worktree', (t: any) => {
  const { root, runtime } = setup(t); initRepository(root);
  let c = ready(runtime, root);
  c = runtime.createCatalogRepository(root, { revision: c.revision, code: 'root', path: '.' });
  c = runtime.createCatalogService(root, { revision: c.revision, projectId: c.projects[0].id, service: { code: 'root-module', name: 'Module', repositoryId: c.repositories[0].id, modulePath: 'projects/demo' } });
  for (const args of [['config', 'user.name', 'Test'], ['config', 'user.email', 'test@example.com'], ['add', '.'], ['commit', '-m', 'root']]) assert.equal(spawnSync('git', args, { cwd: root }).status, 0);
  const plan = runtime.planGitWorktrees({ workspaceRoot: root, taskId: 'root-modules', branch: 'codex/root-modules', includes: ['service:demo/root-module'] });
  assert.equal(plan.repositories.length, 1);
  assert.equal(plan.repositories[0].sourcePath, '.');
});



test('Doctor explicitly checks repository state once for shared services', (t: any) => {
  const { root, runtime } = setup(t); initRepository(root);
  let c = ready(runtime, root);
  c = runtime.createCatalogRepository(root, { revision: c.revision, code: 'root-doctor', path: '.' });
  for (const code of ['doctor-one', 'doctor-two']) c = runtime.createCatalogService(root, { revision: c.revision, service: { code, name: code, repositoryId: c.repositories[0].id } });
  let checks = 0;
  const diagnostics = createServiceDiagnostics({ path, existsFile: fs.existsSync, assetCatalog: runtime.assetCatalog,
    catalogRepositoryStatus: (...args: any[]) => { checks++; return runtime.catalogRepositoryStatus(...args); },
    addDoctorFinding: (result: any, _severity: string, code: string) => result.findings.push(code),
  });
  const result: any = { findings: [] }; diagnostics.diagnoseServices(result, root, []);
  assert.equal(checks, 1); assert.equal(result.services.length, 2);
  assert.ok(result.services.every((s: any) => s.exists && s.isGitRepository)); assert.deepEqual(result.findings, []);
});


test('service directories register existing code, remove without writes and register again', (t: any) => {
  const { root, runtime } = setup(t); let c = ready(runtime, root);
  c = runtime.createCatalogProject(root, { revision: c.revision, code: 'directory-project', name: '目录项目' });
  const directoryPath = 'projects/directory-project/services/existing';
  const directory = path.join(root, directoryPath); fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'README.md'), 'original bytes\n');
  const candidate = runtime.listCatalogDirectoryCandidates(root, 'service').candidates.find((c: any) => c.path === directoryPath);
  assert.ok(candidate);
  const service = { code: 'existing', name: '已有服务', directoryMode: 'existing', directoryPath, directoryObservation: candidate.observation };
  c = runtime.createCatalogService(root, { revision: c.revision, service });
  assert.equal(c.projects.find((p: any) => p.code === 'directory-project').serviceIds.length, 1);
  const created = c.services.find((s: any) => s.code === 'existing');
  assert.ok(created.repositoryId); assert.equal(fs.existsSync(path.join(directory, 'AGENTS.md')), false);
  assert.equal(fs.existsSync(path.join(root, 'services/existing')), false);
  assert.ok(!runtime.listCatalogDirectoryCandidates(root, 'service').candidates.some((d: any) => d.path === directoryPath));
  c = runtime.deleteCatalogAsset(root, 'service', created.id, { revision: c.revision });
  assert.equal(fs.readFileSync(path.join(directory, 'README.md'), 'utf8'), 'original bytes\n');
  c = runtime.createCatalogService(root, { revision: c.revision, service });
  assert.notEqual(c.services.find((s: any) => s.code === 'existing').id, created.id);
  assert.equal(fs.readdirSync(directory).join(), 'README.md');
});


test('new nested services create in project and transaction failure leaves no directory', (t: any) => {
  const { root, runtime } = setup(t); let c = ready(runtime, root);
  c = runtime.createCatalogProject(root, { revision: c.revision, code: 'new-directory-project', name: '新项目', newServices: [{ code: 'api', name: 'API', directoryMode: 'create' }] });
  assert.ok(fs.statSync(path.join(root, 'projects/new-directory-project/services/api')).isDirectory());
  assert.equal(fs.existsSync(path.join(root, 'projects/new-directory-project/services/api/AGENTS.md')), false);
  const project = c.projects.find((p: any) => p.code === 'new-directory-project');
  assert.equal(project.serviceIds.length, 1);
  assert.throws(() => runtime.createCatalogService(root, { revision: c.revision, service: { code: 'api', name: '重复', directoryMode: 'create', projectCode: project.code } }), /已存在|重复/);
  const original = runtime.atomicWriteFile;
  runtime.atomicWriteFile = (file: string, content: string) => { if (file.endsWith('services/manifest.yml')) throw new Error('injected-directory-failure'); return original(file, content); };
  try { assert.throws(() => runtime.createCatalogService(root, { revision: c.revision, service: { code: 'rollback', name: '回滚', directoryMode: 'create', projectCode: project.code } }), /injected-directory-failure/); }
  finally { runtime.atomicWriteFile = original; }
  assert.equal(fs.existsSync(path.join(root, 'projects/new-directory-project/services/rollback')), false);
  assert.equal(runtime.assetCatalog(root).revision, c.revision);
});


test('service registration rejects replaced directories and unsafe links with zero writes', (t: any) => {
  const { root, runtime } = setup(t); let c = ready(runtime, root);
  c = runtime.createCatalogProject(root, { revision: c.revision, code: 'observe', name: '观察' });
  const relative = 'projects/observe/services/api', directory = path.join(root, relative); fs.mkdirSync(directory, { recursive: true });
  const old = runtime.listCatalogDirectoryCandidates(root, 'service').candidates.find((d: any) => d.path === relative);
  fs.renameSync(directory, directory + '-old'); fs.mkdirSync(directory);
  assert.throws(() => runtime.createCatalogService(root, { revision: c.revision, service: { code: 'api', name: 'API', directoryMode: 'existing', directoryPath: relative, directoryObservation: old.observation } }), (e: any) => e.code === 'asset_directory_changed');
  assert.equal(runtime.assetCatalog(root).revision, c.revision);
  fs.symlinkSync(directory + '-old', path.join(root, 'projects/observe/services/link'));
  assert.ok(!runtime.listCatalogDirectoryCandidates(root, 'service').candidates.some((d: any) => d.path.endsWith('/link')));
});


test('repository candidates are real roots; removal protects references and preserves Git files', (t: any) => {
  const { root, runtime } = setup(t); let c = ready(runtime, root);
  const directory = path.join(root, 'repositories/retained'); fs.mkdirSync(directory, { recursive: true });
  assert.equal(spawnSync('git', ['init', '-b', 'main'], { cwd: directory }).status, 0);
  fs.writeFileSync(path.join(directory, 'keep.txt'), 'keep');
  const candidate = runtime.listCatalogDirectoryCandidates(root, 'repository').candidates.find((d: any) => d.path === 'repositories/retained'); assert.ok(candidate);
  c = runtime.createCatalogRepository(root, { revision: c.revision, code: 'retained', path: candidate.path, observation: candidate.observation });
  const repositoryId = c.repositories.find((r: any) => r.code === 'retained').id;
  c = runtime.createCatalogService(root, { revision: c.revision, service: { code: 'ref', name: '引用服务', repositoryId } });
  assert.throws(() => runtime.deleteCatalogAsset(root, 'repository', repositoryId, { revision: c.revision }), (e: any) => e.code === 'repository_in_use');
  c = runtime.deleteCatalogAsset(root, 'service', c.services.find((s: any) => s.code === 'ref').id, { revision: c.revision });
  c = runtime.deleteCatalogAsset(root, 'repository', repositoryId, { revision: c.revision });
  assert.equal(fs.readFileSync(path.join(directory, 'keep.txt'), 'utf8'), 'keep'); assert.ok(fs.existsSync(path.join(directory, '.git')));
  c = runtime.createCatalogRepository(root, { revision: c.revision, code: 'retained', path: candidate.path, observation: candidate.observation });
  assert.notEqual(c.repositories.find((r: any) => r.code === 'retained').id, repositoryId);
});


test('skill register, remove and re-register preserve source bytes and reject stale observations', (t: any) => {
  const { root, runtime } = setup(t);
  let candidates = runtime.skillRegistrationCandidates(root);
  runtime.registerLocalSkill(root, { revision: candidates.revision, id: 'local-example', description: '示例', content: '# 示例\n\n保留正文。' });
  const file = path.join(root, 'skills/local-example/SKILL.md'), bytes = fs.readFileSync(file);
  fs.mkdirSync(path.join(root, 'skills/local-example/assets')); fs.writeFileSync(path.join(root, 'skills/local-example/assets/data.txt'), 'asset');
  const removal = runtime.skillRemoval(root, 'local-example');
  assert.equal(removal.removable, true);
  runtime.removeRegisteredSkill(root, 'local-example', { revision: removal.revision });
  assert.deepEqual(fs.readFileSync(file), bytes);
  candidates = runtime.skillRegistrationCandidates(root);
  const candidate = candidates.candidates.find((c: any) => c.id === 'local-example'); assert.ok(candidate);
  fs.appendFileSync(file, '\n变化');
  assert.throws(() => runtime.registerLocalSkill(root, { revision: candidates.revision, path: candidate.path, observation: candidate.observation }), (e: any) => e.code === 'skill_directory_changed');
  candidates = runtime.skillRegistrationCandidates(root);
  runtime.registerLocalSkill(root, { revision: candidates.revision, ...candidates.candidates.find((c: any) => c.id === 'local-example') });
  assert.equal(fs.readFileSync(path.join(root, 'skills/local-example/assets/data.txt'), 'utf8'), 'asset');
  assert.throws(() => runtime.removeRegisteredSkill(root, 'local-example', { revision: candidates.revision }), (e: any) => e.code === 'skill_revision_conflict');
  runtime.skillsRemove({ targetRoot: root, id: 'local-example' });
  assert.ok(fs.existsSync(file));
});
