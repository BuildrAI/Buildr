import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
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
