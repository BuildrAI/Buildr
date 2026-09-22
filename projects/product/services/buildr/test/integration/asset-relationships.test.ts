import { createServiceDiagnostics } from '../../src/modules/workspace/application/diagnostics/service-diagnostics.ts';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';
import { spawnSync } from 'node:child_process';
import { resolveRuleScope } from '../../src/modules/agent-assets/infrastructure/runtime/render-claude-code-rules.ts';
import { createRuntime } from '../helpers/runtime-harness.ts';
import { copyPreparedProjectWorkspace } from '../helpers/prepared-fixtures.ts';
import { createWorkspaceHttpContribution } from '../../src/modules/workspace/interfaces/http/workspace-http.ts';

function setup(t: any) {
  const { root } = copyPreparedProjectWorkspace(t, 'asset-relationships');
  const runtime: any = createRuntime();
  return { root, runtime };
}
function ready(runtime: any, root: string) {
  const before = runtime.assetCatalog(root);
  return runtime.migrateAssetCatalog(root, { revision: before.revision });
}
function addRepo(runtime: any, root: string, revision: string, code: string, branch: string) {
  return runtime.createCatalogRepository(root, { revision, code, url: 'https://example.com/freshx.git', integrationBranch: branch });
}
test('global catalog read is zero-write; explicit migration is idempotent and stale mutations fail', (t: any) => {
  const { root, runtime } = setup(t);
  const file = path.join(root, 'projects/manifest.yml');
  const bytes = fs.readFileSync(file);
  const before = runtime.assetCatalog(root);
  assert.equal(before.migrationRequired, true);
  assert.deepEqual(fs.readFileSync(file), bytes);
  assert.equal(fs.existsSync(path.join(root, 'services/manifest.yml')), false);
  const after = ready(runtime, root);
  assert.equal(after.migrationRequired, false);
  assert.deepEqual(runtime.migrateAssetCatalog(root, { revision: after.revision }), after);
  assert.throws(() => addRepo(runtime, root, before.revision, 'pigs', 'dev-pigs'), (e: any) => e.code === 'asset_revision_conflict');
});
test('distinct branches and services share repository identity without duplicate repositories', (t: any) => {
  const { root, runtime } = setup(t);
  let catalog = ready(runtime, root);
  catalog = addRepo(runtime, root, catalog.revision, 'freshx-pigs', 'dev-pigs');
  catalog = addRepo(runtime, root, catalog.revision, 'freshx-nm', 'dev-nm');
  assert.equal(catalog.repositories.length, 2);
  const repositoryId = catalog.repositories[0].id;
  for (const code of ['pig-business', 'egg-business']) catalog = runtime.createCatalogService(root, { revision: catalog.revision, service: { code, name: code, repositoryId } });
  assert.equal(catalog.services.length, 2);
  assert.equal(new Set(catalog.services.map((s: any) => s.repositoryId)).size, 1);
  assert.equal(catalog.repositories[0].available, false);
  assert.equal(fs.existsSync(path.join(root, 'repositories/freshx-pigs')), false);
  assert.ok(fs.existsSync(path.join(root, 'services/pig-business/AGENTS.md')));
});
test('project association is many-to-many; unlink keeps service, code and other project intact', (t: any) => {
  const { root, runtime } = setup(t);
  let c = ready(runtime, root);
  c = addRepo(runtime, root, c.revision, 'shared', 'dev');
  c = runtime.createCatalogService(root, { revision: c.revision, service: { code: 'shared-api', name: '共享实现', repositoryId: c.repositories[0].id } });
  const serviceId = c.services[0].id;
  c = runtime.createCatalogProject(root, { revision: c.revision, code: 'egg', name: '鸡蛋', serviceIds: [serviceId] });
  assert.ok(fs.existsSync(path.join(root, 'projects/egg/AGENTS.md')));
  const demo = c.projects.find((p: any) => p.code === 'demo');
  c = runtime.updateProjectServices(root, demo.id, { revision: c.revision, serviceIds: [serviceId] });
  c = runtime.updateProjectServices(root, demo.id, { revision: c.revision, serviceIds: [] });
  assert.equal(c.services.length, 1);
  assert.deepEqual(c.projects.find((p: any) => p.code === 'egg').serviceIds, [serviceId]);
  assert.deepEqual(runtime.listServices(root, 'demo').services, []);
  assert.equal(runtime.listServices(root, 'egg').services[0].id, serviceId);
});
test('nested creation validates references before writing any project or repository', (t: any) => {
  const { root, runtime } = setup(t);
  const c = ready(runtime, root);
  assert.throws(() => runtime.createCatalogProject(root, { revision: c.revision, code: 'bad', name: 'Bad', newServices: [{ code: 'api', name: 'API', repositoryId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa' }] }), (e: any) => e.code === 'service_repository_missing');
  assert.equal(runtime.assetCatalog(root).revision, c.revision);
  assert.equal(fs.existsSync(path.join(root, 'projects/bad')), false);
  const next = runtime.createCatalogProject(root, { revision: c.revision, code: 'good', name: 'Good', newServices: [{ code: 'api', name: 'API', repository: { code: 'api-code', url: 'https://example.com/api.git', integrationBranch: 'dev' } }] });
  assert.equal(next.projects.find((p: any) => p.code === 'good').serviceIds[0], next.services[0].id);
});
test('unsafe module and manifest symlink cannot write outside the workspace', (t: any) => {
  const { root, runtime } = setup(t);
  let c = ready(runtime, root); c = addRepo(runtime, root, c.revision, 'api', 'dev');
  assert.throws(() => runtime.createCatalogService(root, { revision: c.revision, service: { code: 'bad', name: 'Bad', repositoryId: c.repositories[0].id, modulePath: '../escape' } }), /范围内/);
  const file = path.join(root, 'repositories/manifest.yml');
  fs.renameSync(file, file + '.original'); fs.symlinkSync(file + '.original', file);
  assert.throws(() => runtime.assetCatalog(root), (e: any) => e.code === 'asset_symlink_forbidden');
});
test('HTTP catalog validates request and enforces write authorization', async (t: any) => {
  const { root, runtime } = setup(t);
  const http = createWorkspaceHttpContribution(runtime);
  const c = ready(runtime, root);
  let authorized = 0;
  const result: any = await http.handle({ request: { method: 'POST' }, suffix: '/asset-catalog/repositories', root, authorizeWrite: () => { authorized++; }, readJsonBody: async () => ({ revision: c.revision, code: 'api', url: 'https://example.com/api.git', integrationBranch: 'dev' }) });
  assert.equal(result.status, 200); assert.equal(authorized, 1); assert.equal(result.body.repositories.length, 1);
  await assert.rejects(http.handle({ request: { method: 'POST' }, suffix: '/asset-catalog/repositories', root, authorizeWrite: () => {}, readJsonBody: async () => ({ revision: result.body.revision, code: 'bad', unexpected: true }) }), (e: any) => e.code === 'workspace_http_request_invalid');
});

test('legacy service paths survive migration and unlink; compatibility HTTP accepts optional descriptions', async (t: any) => {
  const { root, runtime } = setup(t);
  let c = ready(runtime, root); c = addRepo(runtime, root, c.revision, 'api', 'dev');
  const project = c.projects[0];
  c = runtime.createCatalogService(root, { revision: c.revision, projectId: project.id, service: { code: 'business', name: 'Business', repositoryId: c.repositories[0].id } });
  const http = createWorkspaceHttpContribution(runtime);
  const response: any = await http.handle({ request: { method: 'GET' }, suffix: `/projects/${project.code}/services`, root });
  assert.equal(response.status, 200); assert.equal(response.body.services[0].description, '');
  c = runtime.updateProjectServices(root, project.id, { revision: c.revision, serviceIds: [] });
  assert.equal(runtime.listServices(root, project.code).services.length, 0);
  assert.equal(runtime.serviceDetail(root, project.code, 'business').service.id, c.services[0].id);
});

test('existing broken references do not prevent unrelated metadata editing', (t: any) => {
  const { root, runtime } = setup(t);
  let c = ready(runtime, root); c = addRepo(runtime, root, c.revision, 'api', 'dev');
  const file = path.join(root, 'projects/manifest.yml');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('serviceIds: []', 'serviceIds: [aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa]'));
  c = runtime.assetCatalog(root);
  assert.equal(c.diagnostics[0].code, 'project_service_missing');
  const next = runtime.updateCatalogAsset(root, 'repository', c.repositories[0].id, { revision: c.revision, name: 'Updated' });
  assert.equal(next.repositories[0].name, 'Updated');
  assert.deepEqual(next.projects[0].serviceIds, ['aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa']);
});


test('shared code repository yields one task worktree and module directories do not become Git roots', (t: any) => {
  const { root, runtime } = setup(t);
  const git = (cwd: string, ...args: string[]) => { const r = spawnSync('git', args, { cwd, encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
  let c = ready(runtime, root); c = addRepo(runtime, root, c.revision, 'shared', 'dev');
  const repository = c.repositories[0], codeRoot = path.join(root, repository.source.path);
  fs.mkdirSync(path.join(codeRoot, 'modules/pig'), { recursive: true });
  git(codeRoot, 'init', '--initial-branch=dev'); git(codeRoot, 'config', 'user.name', 'Test'); git(codeRoot, 'config', 'user.email', 'test@example.com');
  git(codeRoot, 'remote', 'add', 'origin', repository.source.git.url); git(codeRoot, 'commit', '--allow-empty', '-m', 'baseline');
  for (const code of ['pig-api', 'egg-api']) c = runtime.createCatalogService(root, { revision: c.revision, projectId: c.projects[0].id, service: { code, name: code, repositoryId: repository.id, modulePath: 'modules/pig' } });
  git(root, 'init', '--initial-branch=dev'); git(root, 'config', 'user.name', 'Test'); git(root, 'config', 'user.email', 'test@example.com');
  fs.appendFileSync(path.join(root, '.gitignore'), '\n/repositories/shared/\n'); git(root, 'add', '.'); git(root, 'commit', '-m', 'workspace');
  const plan = runtime.planGitWorktrees({ workspaceRoot: root, taskId: 'shared-code', branch: 'codex/shared-code', includes: ['service:demo/pig-api', 'service:demo/egg-api'] });
  assert.equal(plan.repositories.length, 2); // workspace plus one shared Git checkout
  assert.equal(plan.repositories[1].sourcePath, 'repositories/shared');
  assert.equal(resolveRuleScope(root, 'services/pig-api').projectRoot, null);
  assert.equal(resolveRuleScope(root, 'repositories/shared/modules/pig').scopeRoot, path.join(codeRoot, 'modules/pig'));
});

test('explicit migration code mappings preserve legacy identities and physical content', (t: any) => {
  const { root, runtime } = setup(t);
  runtime.createProjectAsset({ targetRoot: root, project: 'other', repoRef: null, attachRef: null, name: 'Other', description: 'Other project', remote: 'origin', remoteExplicit: false, integrationBranch: null });
  const original: Record<string, string> = {};
  for (const project of ['demo', 'other']) {
    const source = path.join(root, `incoming-${project}`); fs.mkdirSync(source); fs.writeFileSync(path.join(source, 'README.md'), project);
    original[project] = runtime.createServiceAsset({ targetRoot: root, project, service: 'api', repoRef: source, attachRef: null, name: project, description: 'Legacy', type: 'service', rulesSource: null, integrationBranch: null, remote: 'origin', remoteExplicit: false, json: false }).service.id;
  }
  const before = runtime.assetCatalog(root);
  assert.throws(() => runtime.migrateAssetCatalog(root, { revision: before.revision }), (e: any) => e.code === 'asset_duplicate');
  assert.equal(fs.existsSync(path.join(root, 'services/manifest.yml')), false);
  const after = runtime.migrateAssetCatalog(root, { revision: before.revision, codeMappings: { 'demo/api': 'demo-api', 'other/api': 'other-api' } });
  for (const project of ['demo', 'other']) {
    assert.equal(runtime.serviceDetail(root, project, 'api').service.id, original[project]);
    assert.equal(fs.readFileSync(path.join(root, 'projects', project, 'services/api/README.md'), 'utf8'), project);
  }
  assert.equal(after.repositories.length, 2);
  assert.equal(runtime.catalogServiceDocument(root, original.demo, 'README.md').content, 'demo');
});

test('global service documents preserve rule access and reject escaping symlinks', (t: any) => {
  const { root, runtime } = setup(t);
  let c = ready(runtime, root); c = addRepo(runtime, root, c.revision, 'code', 'dev');
  c = runtime.createCatalogService(root, { revision: c.revision, service: { code: 'api', name: 'API', repositoryId: c.repositories[0].id } });
  assert.match(runtime.catalogServiceDocument(root, c.services[0].id, 'AGENTS.md').content, /Repository Instance/);
  assert.throws(() => runtime.catalogServiceDocument(root, c.services[0].id, '../manifest.yml'), /范围内/);
  fs.symlinkSync(path.join(root, 'projects/demo/AGENTS.md'), path.join(root, 'services/api/README.md'));
  assert.throws(() => runtime.catalogServiceDocument(root, c.services[0].id, 'README.md'), (e: any) => e.code === 'service_document_path_forbidden');
});

test('public asset CLI reads and writes the same catalog with version protection', (t: any) => {
  const { root, runtime } = setup(t);
  const cli = path.resolve(import.meta.dirname, '../../bin/buildr.mjs');
  const invoke = (...args: string[]) => spawnSync(process.execPath, [cli, 'assets', ...args, '--target', root, '--json'], { encoding: 'utf8' });
  const observed = invoke('inspect'); assert.equal(observed.status, 0, observed.stderr);
  const before = JSON.parse(observed.stdout);
  const input = path.join(root, 'migration-input.json'); fs.writeFileSync(input, JSON.stringify({ revision: before.revision }));
  const migrated = invoke('migrate', '--input', input); assert.equal(migrated.status, 0, migrated.stderr);
  fs.writeFileSync(input, JSON.stringify({ revision: JSON.parse(migrated.stdout).revision, code: 'cli-code', url: 'https://example.com/cli.git', integrationBranch: 'dev' }));
  const created = invoke('create', 'repository', '--input', input); assert.equal(created.status, 0, created.stderr);
  assert.equal(runtime.assetCatalog(root).repositories[0].code, 'cli-code');
  assert.notEqual(invoke('create', 'repository', '--input', input).status, 0);
  const directory = path.join(root, 'projects/cli-existing'); fs.mkdirSync(directory);
  const candidates = invoke('project-candidates'); assert.equal(candidates.status, 0, candidates.stderr);
  const available = JSON.parse(candidates.stdout), candidate = available.candidates.find((item: any) => item.code === 'cli-existing');
  fs.writeFileSync(input, JSON.stringify({ revision: available.revision, code: candidate.code, name: 'CLI existing', observation: candidate.observation }));
  const registered = invoke('register', 'project', '--input', input); assert.equal(registered.status, 0, registered.stderr);
  assert.equal(runtime.assetCatalog(root).projects.some((project: any) => project.code === candidate.code), true);
  assert.deepEqual(fs.readdirSync(directory), []);
});

test('partial nested catalog write rolls back all manifests and newly created roots', (t: any) => {
  const { root, runtime } = setup(t);
  const before = ready(runtime, root);
  const names = ['projects/manifest.yml', 'services/manifest.yml', 'repositories/manifest.yml'];
  const bytes = names.map(file => fs.readFileSync(path.join(root, file)));
  const originalRename = fs.renameSync;
  let injected = false;
  fs.renameSync = (source, destination) => {
    if (!injected && String(destination) === path.join(root, 'services/manifest.yml')) { injected = true; throw new Error('injected catalog write failure'); }
    return originalRename(source, destination);
  };
  try {
    assert.throws(() => runtime.createCatalogProject(root, { revision: before.revision, code: 'rollback', name: 'Rollback', newServices: [{ code: 'rollback-service', name: 'Rollback service', repository: { code: 'rollback-code', url: 'https://example.com/rollback.git', integrationBranch: 'dev' } }] }), /injected catalog write failure/);
  } finally { fs.renameSync = originalRename; }
  assert.equal(injected, true);
  names.forEach((file, index) => assert.deepEqual(fs.readFileSync(path.join(root, file)), bytes[index]));
  assert.equal(fs.existsSync(path.join(root, 'projects/rollback')), false);
  assert.equal(fs.existsSync(path.join(root, 'services/rollback-service')), false);
  assert.equal(runtime.assetCatalog(root).revision, before.revision);
});

test('independent list HTTP contracts omit full catalog and never observe Git', async (t: any) => {
  const { root, runtime } = setup(t);
  let c = ready(runtime, root); c = addRepo(runtime, root, c.revision, 'light', 'dev');
  c = runtime.createCatalogService(root, { revision: c.revision, projectId: c.projects[0].id, service: { code: 'light-api', name: 'Light', repositoryId: c.repositories[0].id } });
  const http = createWorkspaceHttpContribution(runtime);
  const observed = runtime.observeProjectGit;
  runtime.observeProjectGit = () => { throw new Error('list must not scan Git'); };
  try {
    for (const suffix of ['/services', '/repositories', '/asset-catalog']) {
      const response: any = await http.handle({ request: { method: 'GET' }, suffix, root });
      assert.equal(response.status, 200);
      assert.equal(response.body.revision, c.revision);
      if (suffix === '/services') { assert.equal(response.body.repositories, undefined); assert.equal(response.body.services[0].repository.name, 'light'); assert.equal(response.body.services[0].projects.length, 1); }
      if (suffix === '/repositories') { assert.equal(response.body.services, undefined); assert.equal(response.body.repositories[0].serviceCount, 1); }
    }
  } finally { runtime.observeProjectGit = observed; }
});

test('delete service and project uses observed revision and preserves all physical content', async (t: any) => {
  const { root, runtime } = setup(t);
  let c = ready(runtime, root); c = addRepo(runtime, root, c.revision, 'shared-delete', 'dev');
  c = runtime.createCatalogService(root, { revision: c.revision, projectId: c.projects[0].id, service: { code: 'delete-api', name: 'Delete', repositoryId: c.repositories[0].id } });
  const serviceId = c.services[0].id;
  c = runtime.createCatalogProject(root, { revision: c.revision, code: 'other-delete', name: 'Other', serviceIds: [serviceId] });
  const stale = c.revision;
  c = runtime.updateCatalogAsset(root, 'service', serviceId, { revision: c.revision, name: 'Changed' });
  assert.throws(() => runtime.deleteCatalogAsset(root, 'service', serviceId, { revision: stale }), (e: any) => e.code === 'asset_revision_conflict');
  assert.equal(runtime.assetCatalog(root).services.length, 1);
  const file = path.join(root, 'services/delete-api/AGENTS.md'), bytes = fs.readFileSync(file);
  const http = createWorkspaceHttpContribution(runtime); let authorization = 0;
  const result: any = await http.handle({ request: { method: 'DELETE' }, suffix: `/asset-catalog/service/${serviceId}`, root, authorizeWrite: () => { authorization++; }, readJsonBody: async () => ({ revision: c.revision }) });
  assert.equal(authorization, 1); assert.equal(result.status, 200); c = result.body;
  assert.equal(c.services.length, 0); assert.equal(c.repositories.length, 1);
  assert.ok(c.projects.every((p: any) => !p.serviceIds.includes(serviceId)));
  assert.deepEqual(fs.readFileSync(file), bytes);
  c = runtime.deleteCatalogAsset(root, 'project', 'other-delete', { revision: c.revision });
  assert.equal(c.projects.length, 1); assert.ok(fs.existsSync(path.join(root, 'projects/other-delete/AGENTS.md')));
  assert.equal(c.repositories.length, 1);
});

function initRepository(location: string) {
  fs.mkdirSync(location, { recursive: true });
  const result = spawnSync('git', ['init', '--initial-branch=dev'], { cwd: location, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}

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

test('normalization merges old workspace modules by real root while retaining service identities and content', (t: any) => {
  const { root, runtime } = setup(t); initRepository(root);
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

test('repository branch edits work without a remote and do not change HEAD or service identity', (t: any) => {
  const { root, runtime } = setup(t); initRepository(root);
  let c = ready(runtime, root);
  c = runtime.createCatalogRepository(root, { revision: c.revision, code: 'branch-edit', path: '.' });
  const repository = c.repositories[0];
  c = runtime.createCatalogService(root, { revision: c.revision, service: { code: 'branch-service', name: 'Branch', repositoryId: repository.id } });
  assert.throws(() => runtime.updateCatalogAsset(root, 'repository', repository.id, { revision: c.revision, remote: 'upstream' }), (e: any) => e.code === 'repository_remote_url_required');
  const service = c.services[0], config = fs.readFileSync(path.join(root, '.git/config')), head = fs.readFileSync(path.join(root, '.git/HEAD'));
  c = runtime.updateCatalogAsset(root, 'repository', repository.id, { revision: c.revision, integrationBranch: 'release/next' });
  assert.equal(c.repositories[0].source.integrationBranch, 'release/next'); assert.equal(c.repositories[0].source.git, undefined);
  assert.equal(c.repositories[0].id, repository.id); assert.deepEqual(c.services[0], service);
  assert.deepEqual(fs.readFileSync(path.join(root, '.git/config')), config); assert.deepEqual(fs.readFileSync(path.join(root, '.git/HEAD')), head);
  assert.equal(runtime.catalogRepositoryStatus(root, repository.id).alignment, 'ready');
  assert.equal(runtime.catalogRepositoryStatus(root, repository.id).observed.currentBranch, 'dev');
  for (const integrationBranch of ['../bad', 'bad branch', '-bad', 'bad/.hidden', 'bad.lock/branch', 'bad\u0007branch']) assert.throws(() => runtime.updateCatalogAsset(root, 'repository', repository.id, { revision: c.revision, integrationBranch }), (e: any) => e.code === 'repository_branch_invalid');
  c = runtime.updateCatalogAsset(root, 'repository', repository.id, { revision: c.revision, integrationBranch: '' });
  assert.equal(c.repositories[0].source.integrationBranch, undefined);
});

test('repository HTTP edits store remote declaration, report pending alignment and reject stale writes', async (t: any) => {
  const { root, runtime } = setup(t); initRepository(root);
  assert.equal(spawnSync('git', ['remote', 'add', 'origin', 'https://example.com/actual.git'], { cwd: root }).status, 0);
  let c = ready(runtime, root); c = runtime.createCatalogRepository(root, { revision: c.revision, code: 'remote-edit', path: '.' });
  const repository = c.repositories[0], old = c.revision, config = fs.readFileSync(path.join(root, '.git/config'));
  const http = createWorkspaceHttpContribution(runtime); let authorization = 0;
  const response: any = await http.handle({ request: { method: 'PUT' }, suffix: `/asset-catalog/repository/${repository.id}`, root, authorizeWrite: () => authorization++, readJsonBody: async () => ({ revision: old, url: 'https://example.com/desired.git', remote: 'origin', integrationBranch: 'main' }) });
  assert.equal(response.status, 200); assert.equal(authorization, 1); c = response.body;
  assert.equal(c.repositories[0].source.git.integrationBranch, 'main');
  const state: any = await http.handle({ request: { method: 'GET' }, suffix: `/repositories/${repository.id}/status`, root });
  assert.equal(state.body.alignment, 'pending'); assert.equal(state.body.observed.remoteUrl, 'https://example.com/actual.git');
  assert.match(state.body.diagnostic, /远端/); assert.deepEqual(fs.readFileSync(path.join(root, '.git/config')), config);
  assert.throws(() => runtime.updateCatalogAsset(root, 'repository', repository.id, { revision: old, remote: 'upstream' }), (e: any) => e.code === 'asset_revision_conflict');
  c = runtime.updateCatalogAsset(root, 'repository', repository.id, { revision: c.revision, remote: 'upstream' });
  assert.equal(c.repositories[0].source.git.remote, 'upstream');
  assert.equal(runtime.catalogRepositoryStatus(root, repository.id).alignment, 'pending');
  c = runtime.updateCatalogAsset(root, 'repository', repository.id, { revision: c.revision, url: '' });
  assert.equal(c.repositories[0].source.git, undefined); assert.equal(c.repositories[0].source.integrationBranch, 'main');
  assert.equal(runtime.catalogRepositoryStatus(root, repository.id).alignment, 'ready');
});

test('repository location edits preserve old files, allow missing targets and reject duplicate or escaping modules', (t: any) => {
  const { root, runtime } = setup(t); let c = ready(runtime, root);
  const oldRoot = path.join(root, 'code-old'); initRepository(oldRoot); fs.mkdirSync(path.join(oldRoot, 'module')); fs.writeFileSync(path.join(oldRoot, 'module/keep.txt'), 'keep');
  c = runtime.createCatalogRepository(root, { revision: c.revision, code: 'location-edit', path: 'code-old' });
  const id = c.repositories[0].id;
  c = runtime.createCatalogService(root, { revision: c.revision, service: { code: 'module-service', name: 'Module', repositoryId: id, modulePath: 'module' } });
  c = runtime.updateCatalogAsset(root, 'repository', id, { revision: c.revision, path: 'code-new' });
  assert.equal(runtime.catalogRepositoryStatus(root, id).alignment, 'pending'); assert.equal(fs.existsSync(path.join(root, 'code-new')), false);
  assert.equal(fs.readFileSync(path.join(oldRoot, 'module/keep.txt'), 'utf8'), 'keep');
  const newRoot = path.join(root, 'code-new'); initRepository(newRoot);
  assert.match(runtime.catalogRepositoryStatus(root, id).diagnostic, /模块目录/);
  fs.symlinkSync(oldRoot, path.join(newRoot, 'module'));
  assert.throws(() => runtime.updateCatalogAsset(root, 'repository', id, { revision: c.revision, path: 'code-new' }), (e: any) => e.code === 'service_module_path_forbidden');
  assert.throws(() => runtime.updateCatalogAsset(root, 'repository', id, { revision: c.revision, path: 'code-old/module' }), (e: any) => e.code === 'repository_not_root');
  c = runtime.createCatalogRepository(root, { revision: c.revision, code: 'other-location', path: 'code-old' });
  assert.throws(() => runtime.updateCatalogAsset(root, 'repository', id, { revision: c.revision, path: 'code-old' }), (e: any) => e.code === 'repository_duplicate_path');
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-edit-outside-')); t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  fs.symlinkSync(outside, path.join(root, 'outside-link'));
  assert.throws(() => runtime.updateCatalogAsset(root, 'repository', id, { revision: c.revision, path: 'outside-link/missing' }), (e: any) => e.code === 'repository_path_invalid');
});

test('local repository integration branch is consumed by subsequent task worktree planning', (t: any) => {
  const { root, runtime } = setup(t); initRepository(root);
  const git = (cwd: string, ...args: string[]) => { const result = spawnSync('git', args, { cwd, encoding: 'utf8' }); assert.equal(result.status, 0, result.stderr); return result.stdout.trim(); };
  let c = ready(runtime, root); const code = path.join(root, 'local-code'); initRepository(code);
  git(code, 'config', 'user.name', 'Test'); git(code, 'config', 'user.email', 'test@example.com'); git(code, 'commit', '--allow-empty', '-m', 'base');
  const start = git(code, 'rev-parse', 'HEAD'); git(code, 'branch', 'integration'); git(code, 'commit', '--allow-empty', '-m', 'later');
  c = runtime.createCatalogRepository(root, { revision: c.revision, code: 'local-code', path: 'local-code' });
  c = runtime.updateCatalogAsset(root, 'repository', c.repositories[0].id, { revision: c.revision, integrationBranch: 'integration' });
  c = runtime.createCatalogService(root, { revision: c.revision, projectId: c.projects[0].id, service: { code: 'local-module', name: 'Local', repositoryId: c.repositories[0].id } });
  fs.appendFileSync(path.join(root, '.gitignore'), '\n/local-code/\n'); git(root, 'config', 'user.name', 'Test'); git(root, 'config', 'user.email', 'test@example.com'); git(root, 'add', '.'); git(root, 'commit', '-m', 'workspace');
  const plan = runtime.planGitWorktrees({ workspaceRoot: root, taskId: 'local-branch-edit', branch: 'codex/local-branch-edit', includes: ['service:demo/local-module'] });
  assert.equal(plan.repositories.length, 2); assert.equal(plan.repositories[1].startPoint, 'integration'); assert.equal(git(code, 'rev-parse', plan.repositories[1].startPoint), start);
  assert.equal(git(code, 'branch', '--show-current'), 'dev');
});

test('workspace-root integration branch is used unless the task explicitly chooses a start point', (t: any) => {
  const { root, runtime } = setup(t); initRepository(root);
  const git = (...args: string[]) => { const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' }); assert.equal(result.status, 0, result.stderr); return result.stdout.trim(); };
  let c = ready(runtime, root);
  c = runtime.createCatalogRepository(root, { revision: c.revision, code: 'root-branch', path: '.', integrationBranch: 'integration' });
  c = runtime.createCatalogService(root, { revision: c.revision, projectId: c.projects[0].id, service: { code: 'root-branch-service', name: 'Root', repositoryId: c.repositories[0].id } });
  git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.com'); git('add', '.'); git('commit', '-m', 'base'); git('branch', 'integration'); git('commit', '--allow-empty', '-m', 'later');
  const input = { workspaceRoot: root, taskId: 'root-default', branch: 'codex/root-default', includes: ['service:demo/root-branch-service'] };
  assert.equal(runtime.planGitWorktrees(input).repositories[0].startPoint, 'integration');
  assert.equal(runtime.planGitWorktrees({ ...input, startPoint: 'HEAD' }).repositories[0].startPoint, 'HEAD');
  assert.equal(git('branch', '--show-current'), 'dev');
});

test('local Git config reads real remotes without changing declarations or scanning status', async (t: any) => {
  const { root, runtime } = setup(t); initRepository(root);
  assert.equal(spawnSync('git', ['remote', 'add', 'origin', 'https://example.com/local.git'], { cwd: root }).status, 0);
  let c = ready(runtime, root); c = runtime.createCatalogRepository(root, { revision: c.revision, code: 'local-config', path: '.', integrationBranch: 'integration' });
  const before = fs.readFileSync(path.join(root, 'repositories/manifest.yml')), config = fs.readFileSync(path.join(root, '.git/config'));
  const original = runtime.observeProjectGit; runtime.observeProjectGit = () => { throw new Error('local configuration must not scan status'); };
  try {
    const http = createWorkspaceHttpContribution(runtime);
    const response: any = await http.handle({ request: { method: 'GET' }, suffix: `/repositories/${c.repositories[0].id}/local-config`, root });
    assert.equal(response.status, 200); assert.equal(response.body.selectedRemote, 'origin'); assert.equal(response.body.currentBranch, 'dev');
    assert.deepEqual(response.body.remotes, [{ name: 'origin', url: 'https://example.com/local.git' }]);
    assert.deepEqual(fs.readFileSync(path.join(root, 'repositories/manifest.yml')), before); assert.deepEqual(fs.readFileSync(path.join(root, '.git/config')), config);
    assert.equal(runtime.assetCatalog(root).repositories[0].source.integrationBranch, 'integration');
  } finally { runtime.observeProjectGit = original; }
});

test('local config resolves tracked and sole remotes but does not guess ambiguous or missing declared remotes', (t: any) => {
  const { root, runtime } = setup(t); initRepository(root);
  const git = (...args: string[]) => assert.equal(spawnSync('git', args, { cwd: root }).status, 0);
  let c = ready(runtime, root); c = runtime.createCatalogRepository(root, { revision: c.revision, code: 'multi-config', path: '.' });
  const id = c.repositories[0].id;
  git('remote', 'add', 'upstream', 'https://example.com/upstream.git');
  assert.equal(runtime.catalogRepositoryLocalConfig(root, id).selectedRemote, 'upstream');
  git('remote', 'add', 'mirror', 'https://example.com/mirror.git');
  let config = runtime.catalogRepositoryLocalConfig(root, id); assert.equal(config.selectedRemote, null); assert.match(config.diagnostic, /多个远端/);
  git('config', 'branch.dev.remote', 'mirror'); assert.equal(runtime.catalogRepositoryLocalConfig(root, id).selectedRemote, 'mirror');
  c = runtime.updateCatalogAsset(root, 'repository', id, { revision: c.revision, url: 'https://example.com/desired.git', remote: 'absent', integrationBranch: 'main' });
  config = runtime.catalogRepositoryLocalConfig(root, id); assert.equal(config.selectedRemote, null); assert.match(config.diagnostic, /absent/); assert.equal(config.remotes.length, 2);
  c = runtime.updateCatalogAsset(root, 'repository', id, { revision: c.revision, path: 'missing-local' });
  config = runtime.catalogRepositoryLocalConfig(root, id); assert.equal(config.available, false); assert.match(config.diagnostic, /不存在/);
});

test('service update creates and associates a repository atomically through the HTTP contract', async (t: any) => {
  const { root, runtime } = setup(t); let c = ready(runtime, root);
  c = addRepo(runtime, root, c.revision, 'old-service-code', 'dev');
  c = runtime.createCatalogService(root, { revision: c.revision, projectId: c.projects[0].id, service: { code: 'edit-new-code', name: 'Original', repositoryId: c.repositories[0].id } });
  const service = c.services[0], projectRefs = c.projects.map((p: any) => p.serviceIds), originalRevision = c.revision;
  const http = createWorkspaceHttpContribution(runtime); let authorized = 0;
  const response: any = await http.handle({ request: { method: 'PUT' }, suffix: `/asset-catalog/service/${service.id}`, root, authorizeWrite: () => authorized++, readJsonBody: async () => ({ revision: c.revision, name: 'Updated', repository: { code: 'new-inline-code', url: 'https://example.com/new-inline.git', integrationBranch: 'main' } }) });
  c = response.body; assert.equal(response.status, 200); assert.equal(authorized, 1);
  assert.equal(c.repositories.length, 2); assert.equal(c.services[0].id, service.id); assert.equal(c.services[0].name, 'Updated');
  assert.equal(c.services[0].repositoryId, c.repositories.find((r: any) => r.code === 'new-inline-code').id);
  assert.deepEqual(c.projects.map((p: any) => p.serviceIds), projectRefs);
  assert.equal(fs.existsSync(path.join(root, 'repositories/new-inline-code')), false);
  assert.throws(() => runtime.updateCatalogAsset(root, 'service', service.id, { revision: originalRevision, repository: { code: 'stale-inline-code', url: 'https://example.com/stale.git', integrationBranch: 'dev' } }), (e: any) => e.code === 'asset_revision_conflict');
  assert.equal(runtime.assetCatalog(root).repositories.length, 2);
});

test('invalid or ambiguous inline repository service updates leave every manifest untouched', (t: any) => {
  const { root, runtime } = setup(t); let c = ready(runtime, root); c = addRepo(runtime, root, c.revision, 'original-inline', 'dev');
  c = runtime.createCatalogService(root, { revision: c.revision, service: { code: 'inline-failure', name: 'Keep', repositoryId: c.repositories[0].id } });
  const files = ['projects/manifest.yml', 'services/manifest.yml', 'repositories/manifest.yml']; const bytes = files.map(file => fs.readFileSync(path.join(root, file)));
  const repository = { code: 'invalid-inline', url: 'https://example.com/inline.git', integrationBranch: 'dev' };
  assert.throws(() => runtime.updateCatalogAsset(root, 'service', c.services[0].id, { revision: c.revision, repositoryId: c.repositories[0].id, repository }), (e: any) => e.code === 'service_repository_ambiguous');
  assert.throws(() => runtime.updateCatalogAsset(root, 'service', c.services[0].id, { revision: c.revision, repository, modulePath: '../escape' }), (e: any) => e.code === 'asset_path_invalid');
  files.forEach((file, i) => assert.deepEqual(fs.readFileSync(path.join(root, file)), bytes[i]));
  assert.equal(runtime.assetCatalog(root).repositories.length, 1);
});
