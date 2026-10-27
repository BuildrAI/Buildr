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
  assert.ok(['cloning', 'failed'].includes(runtime.repositoryCloneStatus(root, repositoryId).state));
  const status = runtime.catalogRepositoryStatus(root, repositoryId);
  assert.equal(status.available, false);
  assert.ok(status.observed && typeof status.observed === 'object', 'pending status preserves the HTTP object contract');
  assert.equal(fs.existsSync(path.join(root, 'services/pig-business')), false);
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

test('service creation and editing carry project affiliation, service code and repository membership', (t: any) => {
  const { root, runtime } = setup(t);
  let c = ready(runtime, root);
  c = runtime.createCatalogProject(root, { revision: c.revision, code: 'shared', name: '共享' });
  c = addRepo(runtime, root, c.revision, 'core', 'dev');
  const repoId = c.repositories[0].id, demo = c.projects.find((p: any) => p.code === 'demo'), shared = c.projects.find((p: any) => p.code === 'shared');
  c = runtime.createCatalogService(root, { revision: c.revision, service: { code: 'api', name: 'API', repositoryId: repoId, projectIds: ['shared', demo.id] } });
  assert.deepEqual(shared.serviceIds ?? [], []);
  const serviceId = c.services[0].id;
  assert.deepEqual(c.projects.find((p: any) => p.code === 'shared').serviceIds, [serviceId]);
  assert.ok(c.projects.find((p: any) => p.code === 'demo').serviceIds.includes(serviceId));
  assert.throws(() => runtime.createCatalogService(root, { revision: c.revision, service: { code: 'gone', name: 'Gone', repositoryId: repoId, projectIds: ['missing'] } }), (e: any) => e.code === 'project_not_found');
  c = runtime.updateCatalogAsset(root, 'service', serviceId, { revision: c.revision, code: 'api-v2', projectIds: ['shared'] });
  assert.equal(c.services[0].code, 'api-v2');
  assert.deepEqual(c.projects.find((p: any) => p.code === 'shared').serviceIds, [serviceId]);
  assert.ok(!c.projects.find((p: any) => p.code === 'demo').serviceIds.includes(serviceId));
  assert.throws(() => runtime.updateCatalogAsset(root, 'service', serviceId, { revision: c.revision, code: 'bad code' }), (e: any) => e.code === 'asset_code_invalid');
  assert.throws(() => runtime.updateCatalogAsset(root, 'service', serviceId, { revision: c.revision, code: 'api-v2', projectIds: ['missing'] }), (e: any) => e.code === 'project_not_found');
  fs.mkdirSync(path.join(root, 'services/api-v2'), { recursive: true });
  fs.writeFileSync(path.join(root, 'services/api-v2/notes.md'), 'doc\n');
  c = runtime.updateCatalogAsset(root, 'service', serviceId, { revision: c.revision, code: 'api-v3' });
  assert.equal(fs.existsSync(path.join(root, 'services/api-v3/notes.md')), true);
  assert.equal(fs.existsSync(path.join(root, 'services/api-v2')), false);
});

test('explicit service projectIds override directory inference while fixed parent projectId remains linked', (t: any) => {
  const { root, runtime } = setup(t);
  let c = ready(runtime, root);
  c = runtime.createCatalogProject(root, { revision: c.revision, code: 'explicit-choice', name: 'Explicit choice' });
  c = runtime.createCatalogProject(root, { revision: c.revision, code: 'fixed-parent', name: 'Fixed parent' });
  const directoryPath = 'projects/demo/services/explicit-choice';
  fs.mkdirSync(path.join(root, directoryPath), { recursive: true });
  const candidate = runtime.listCatalogDirectoryCandidates(root, 'service').candidates.find((item: any) => item.path === directoryPath);
  assert.ok(candidate, 'fixture directory must be observed as a real service candidate');
  const explicit = c.projects.find((project: any) => project.code === 'explicit-choice'), parent = c.projects.find((project: any) => project.code === 'fixed-parent');
  c = runtime.createCatalogService(root, { revision: c.revision, projectId: parent.id, service: { code: 'explicit-api', name: 'Explicit API', directoryMode: 'existing', directoryPath: candidate.path, directoryObservation: candidate.observation, projectIds: [explicit.id] } });
  const serviceId = c.services.find((service: any) => service.code === 'explicit-api').id;
  assert.ok(c.projects.find((project: any) => project.id === explicit.id).serviceIds.includes(serviceId));
  assert.ok(c.projects.find((project: any) => project.id === parent.id).serviceIds.includes(serviceId));
  assert.equal(c.projects.find((project: any) => project.code === 'demo').serviceIds.includes(serviceId), false);
});

test('nested service drafts apply projectIds in create, edit and associate transactions', (t: any) => {
  const { root, runtime } = setup(t);
  let c = ready(runtime, root);
  c = runtime.createCatalogProject(root, { revision: c.revision, code: 'shared-draft', name: 'Shared draft' });
  c = addRepo(runtime, root, c.revision, 'draft-repository', 'dev');
  const shared = c.projects.find((project: any) => project.code === 'shared-draft'), repositoryId = c.repositories[0].id;
  c = runtime.createCatalogProject(root, { revision: c.revision, code: 'draft-parent', name: 'Draft parent', newServices: [{ code: 'create-inline', name: 'Create inline', repositoryId, projectIds: [shared.id] }] });
  let parent = c.projects.find((project: any) => project.code === 'draft-parent');
  let service = c.services.find((item: any) => item.code === 'create-inline');
  assert.ok(parent.serviceIds.includes(service.id));
  assert.ok(c.projects.find((project: any) => project.id === shared.id).serviceIds.includes(service.id));

  c = runtime.updateCatalogAsset(root, 'project', parent.id, { revision: c.revision, newServices: [{ code: 'update-inline', name: 'Update inline', repositoryId, projectIds: [shared.code] }] });
  parent = c.projects.find((project: any) => project.id === parent.id);
  service = c.services.find((item: any) => item.code === 'update-inline');
  assert.ok(parent.serviceIds.includes(service.id));
  assert.ok(c.projects.find((project: any) => project.id === shared.id).serviceIds.includes(service.id));

  c = runtime.updateProjectServices(root, parent.id, { revision: c.revision, serviceIds: parent.serviceIds, newServices: [{ code: 'associate-inline', name: 'Associate inline', repositoryId, projectIds: [shared.id] }] });
  parent = c.projects.find((project: any) => project.id === parent.id);
  service = c.services.find((item: any) => item.code === 'associate-inline');
  assert.ok(parent.serviceIds.includes(service.id));
  assert.ok(c.projects.find((project: any) => project.id === shared.id).serviceIds.includes(service.id));

  const beforeInvalid = c.revision;
  assert.throws(() => runtime.createCatalogProject(root, { revision: beforeInvalid, code: 'invalid-draft-parent', name: 'Invalid draft parent', newServices: [{ code: 'invalid-create-inline', name: 'Invalid create', repositoryId, projectIds: ['missing-project'] }] }), (error: any) => error.code === 'project_not_found');
  assert.equal(fs.existsSync(path.join(root, 'projects/invalid-draft-parent')), false);
  assert.throws(() => runtime.updateCatalogAsset(root, 'project', parent.id, { revision: beforeInvalid, newServices: [{ code: 'invalid-update-inline', name: 'Invalid update', repositoryId, projectIds: ['missing-project'] }] }), (error: any) => error.code === 'project_not_found');
  assert.throws(() => runtime.updateProjectServices(root, parent.id, { revision: beforeInvalid, serviceIds: parent.serviceIds, newServices: [{ code: 'invalid-associate-inline', name: 'Invalid associate', repositoryId, projectIds: ['missing-project'] }] }), (error: any) => error.code === 'project_not_found');
  assert.equal(runtime.assetCatalog(root).revision, beforeInvalid);
  assert.equal(runtime.assetCatalog(root).services.some((item: any) => item.code.startsWith('invalid-')), false);
});

test('repository create and update move services in while keeping current members', (t: any) => {
  const { root, runtime } = setup(t);
  let c = ready(runtime, root);
  c = addRepo(runtime, root, c.revision, 'first', 'dev');
  c = runtime.createCatalogService(root, { revision: c.revision, service: { code: 'api', name: 'API', repositoryId: c.repositories[0].id, modulePath: 'services/api' } });
  const serviceId = c.services[0].id;
  c = runtime.createCatalogRepository(root, { revision: c.revision, code: 'second', url: 'https://example.com/second.git', integrationBranch: 'dev', serviceIds: [serviceId] });
  assert.equal(c.services[0].repositoryId, c.repositories[1].id);
  assert.equal(c.services[0].modulePath, 'services/api');
  assert.throws(() => runtime.updateCatalogAsset(root, 'repository', c.repositories[1].id, { revision: c.revision, serviceIds: [] }), (e: any) => e.code === 'repository_service_required');
  c = runtime.createCatalogRepository(root, { revision: c.revision, code: 'third', url: 'https://example.com/third.git', integrationBranch: 'dev' });
  c = runtime.updateCatalogAsset(root, 'repository', c.repositories[2].id, { revision: c.revision, serviceIds: [serviceId] });
  assert.equal(c.services[0].repositoryId, c.repositories[2].id);
  assert.throws(() => runtime.updateCatalogAsset(root, 'repository', c.repositories[2].id, { revision: c.revision, serviceIds: ['missing'] }), (e: any) => e.code === 'service_not_found');
});

test('project editing rewrites code, legacy refs and service membership', (t: any) => {
  const { root, runtime } = setup(t);
  let c = ready(runtime, root);
  c = addRepo(runtime, root, c.revision, 'core', 'dev');
  c = runtime.createCatalogService(root, { revision: c.revision, projectId: c.projects[0].id, service: { code: 'api', name: 'API', repositoryId: c.repositories[0].id } });
  const serviceId = c.services[0].id, projectId = c.projects[0].id;
  assert.deepEqual(c.services[0].legacyRefs, ['demo/api']);
  c = runtime.updateCatalogAsset(root, 'project', projectId, { revision: c.revision, code: 'renamed', serviceIds: [serviceId] });
  const project = c.projects.find((p: any) => p.id === projectId);
  assert.equal(project.code, 'renamed');
  assert.deepEqual(project.serviceIds, [serviceId]);
  assert.deepEqual(c.services[0].legacyRefs, ['renamed/api']);
  assert.throws(() => runtime.updateCatalogAsset(root, 'project', projectId, { revision: c.revision, serviceIds: ['missing'] }), (e: any) => e.code === 'service_not_found');
  c = runtime.updateCatalogAsset(root, 'project', projectId, { revision: c.revision, serviceIds: [] });
  assert.deepEqual(c.projects.find((p: any) => p.id === projectId).serviceIds, []);
  const repoId = c.repositories[0].id;
  c = runtime.updateCatalogAsset(root, 'project', projectId, { revision: c.revision, serviceIds: [serviceId], newServices: [{ code: 'inline', name: '内联服务', repositoryId: repoId }] });
  const member = c.projects.find((p: any) => p.id === projectId);
  const inline = c.services.find((s: any) => s.code === 'inline');
  assert.ok(inline && member.serviceIds.includes(inline.id) && member.serviceIds.includes(serviceId));
  assert.deepEqual(inline.legacyRefs, ['renamed/inline']);
  assert.throws(() => runtime.updateCatalogAsset(root, 'service', serviceId, { revision: c.revision, newServices: [] }), (e: any) => e.code === 'asset_field_forbidden');
});

test('project code rename updates nested repository roots and creates inline service directories under the new code', (t: any) => {
  const { root, runtime } = setup(t);
  let c = ready(runtime, root);
  const project = c.projects.find((item: any) => item.code === 'demo'), sourceDirectory = 'projects/demo/services/existing-root';
  const workspaceGitInit = spawnSync('git', ['init', '-q', root], { encoding: 'utf8' });
  assert.equal(workspaceGitInit.status, 0, workspaceGitInit.stderr);
  const gitInit = spawnSync('git', ['init', '-q', path.join(root, 'projects/demo')], { encoding: 'utf8' });
  assert.equal(gitInit.status, 0, gitInit.stderr);
  fs.mkdirSync(path.join(root, sourceDirectory), { recursive: true });
  const candidate = runtime.listCatalogDirectoryCandidates(root, 'service').candidates.find((item: any) => item.path === sourceDirectory);
  assert.ok(candidate);
  c = runtime.createCatalogService(root, { revision: c.revision, projectId: project.id, service: { code: 'existing-root-api', name: 'Existing root API', directoryMode: 'existing', directoryPath: candidate.path, directoryObservation: candidate.observation } });
  const service = c.services.find((item: any) => item.code === 'existing-root-api'), repositoryId = service.repositoryId, modulePath = service.modulePath;
  assert.equal(c.repositories.find((item: any) => item.id === repositoryId).source.path, 'projects/demo');
  c = runtime.createCatalogRepository(root, { revision: c.revision, code: 'workspace-root', path: '.' });
  const workspaceRepositoryId = c.repositories.find((item: any) => item.code === 'workspace-root').id;
  const workspaceModulePath = 'projects/demo/services/workspace-module';
  fs.mkdirSync(path.join(root, workspaceModulePath), { recursive: true });
  c = runtime.createCatalogService(root, { revision: c.revision, projectId: project.id, service: { code: 'workspace-root-api', name: 'Workspace root API', repositoryId: workspaceRepositoryId, modulePath: workspaceModulePath } });
  const workspaceService = c.services.find((item: any) => item.code === 'workspace-root-api');
  const occupiedNestedPath = path.join(root, 'projects/demo/services/inline-directory');
  fs.mkdirSync(occupiedNestedPath, { recursive: true }); fs.writeFileSync(path.join(occupiedNestedPath, 'keep.txt'), 'unregistered service directory\n');
  const beforeOccupiedUpdate = c.revision;
  assert.throws(() => runtime.updateCatalogAsset(root, 'project', project.id, { revision: beforeOccupiedUpdate, code: 'renamed-with-repository', serviceIds: [service.id, workspaceService.id], newServices: [{ code: 'inline-directory', name: 'Inline directory', directoryMode: 'create', projectCode: 'renamed-with-repository', projectIds: ['renamed-with-repository'] }] }), (error: any) => error.code === 'asset_directory_occupied');
  assert.equal(runtime.assetCatalog(root).revision, beforeOccupiedUpdate);
  assert.equal(runtime.assetCatalog(root).projects.find((item: any) => item.id === project.id).code, 'demo');
  assert.equal(runtime.assetCatalog(root).repositories.find((item: any) => item.id === repositoryId).source.path, 'projects/demo');
  assert.equal(runtime.assetCatalog(root).services.find((item: any) => item.id === workspaceService.id).modulePath, workspaceModulePath);
  assert.equal(runtime.assetCatalog(root).services.some((item: any) => item.code === 'inline-directory'), false);
  assert.equal(fs.readFileSync(path.join(occupiedNestedPath, 'keep.txt'), 'utf8'), 'unregistered service directory\n');
  assert.equal(fs.existsSync(path.join(root, 'projects/renamed-with-repository')), false);
  fs.rmSync(occupiedNestedPath, { recursive: true, force: true });
  c = runtime.updateCatalogAsset(root, 'project', project.id, { revision: c.revision, code: 'renamed-with-repository', serviceIds: [service.id, workspaceService.id], newServices: [{ code: 'inline-directory', name: 'Inline directory', directoryMode: 'create', projectCode: 'renamed-with-repository', projectIds: ['renamed-with-repository'] }] });
  const updatedProject = c.projects.find((item: any) => item.id === project.id), updatedService = c.services.find((item: any) => item.id === service.id);
  assert.equal(updatedProject.code, 'renamed-with-repository');
  assert.equal(updatedService.repositoryId, repositoryId);
  assert.equal(updatedService.modulePath, modulePath);
  assert.equal(c.repositories.find((item: any) => item.id === repositoryId).source.path, 'projects/renamed-with-repository');
  const updatedWorkspaceService = c.services.find((item: any) => item.id === workspaceService.id);
  assert.equal(updatedWorkspaceService.modulePath, 'projects/renamed-with-repository/services/workspace-module');
  assert.ok(fs.statSync(path.join(root, 'projects/renamed-with-repository/services/inline-directory')).isDirectory());
  assert.equal(fs.existsSync(path.join(root, 'projects/demo')), false);
  const inline = c.services.find((item: any) => item.code === 'inline-directory');
  assert.equal(inline.repositoryId, repositoryId);
  assert.equal(inline.modulePath, 'services/inline-directory');
  assert.ok(updatedProject.serviceIds.includes(inline.id));
  assert.deepEqual(inline.legacyRefs, ['renamed-with-repository/inline-directory']);
});

test('project and service code renames reject occupied directories and roll back moves with manifests', (t: any) => {
  const { root, runtime } = setup(t);
  let c = ready(runtime, root);
  c = addRepo(runtime, root, c.revision, 'core', 'dev');
  c = runtime.createCatalogService(root, { revision: c.revision, projectId: c.projects[0].id, service: { code: 'asset-api', name: 'Asset API', repositoryId: c.repositories[0].id } });
  const projectId = c.projects[0].id, projectManifest = path.join(root, 'projects/manifest.yml');
  const projectSource = path.join(root, 'projects/demo'), retainedProjectFile = path.join(projectSource, 'asset-rename-retained.txt');
  fs.mkdirSync(projectSource, { recursive: true }); fs.writeFileSync(retainedProjectFile, 'project bytes\n');
  const projectManifestBytes = fs.readFileSync(projectManifest);
  const occupiedProject = path.join(root, 'projects/occupied-project');
  fs.mkdirSync(occupiedProject); fs.writeFileSync(path.join(occupiedProject, 'keep.txt'), 'do not adopt\n');
  assert.throws(() => runtime.updateCatalogAsset(root, 'project', projectId, { revision: c.revision, code: 'occupied-project' }), (error: any) => error.code === 'asset_directory_occupied');
  assert.equal(runtime.assetCatalog(root).revision, c.revision);
  assert.equal(runtime.assetCatalog(root).projects[0].code, 'demo');
  assert.deepEqual(fs.readFileSync(projectManifest), projectManifestBytes);
  assert.equal(fs.readFileSync(retainedProjectFile, 'utf8'), 'project bytes\n');
  assert.equal(fs.readFileSync(path.join(occupiedProject, 'keep.txt'), 'utf8'), 'do not adopt\n');
  fs.rmSync(occupiedProject, { recursive: true, force: true });

  const originalAtomicWriteFile = runtime.atomicWriteFile.bind(runtime);
  runtime.atomicWriteFile = (file: string, ...args: any[]) => {
    if (path.resolve(file) === path.resolve(projectManifest)) throw new Error('injected project manifest failure');
    return originalAtomicWriteFile(file, ...args);
  };
  try {
    assert.throws(() => runtime.updateCatalogAsset(root, 'project', projectId, { revision: c.revision, code: 'rolled-back-project' }), /injected project manifest failure/u);
  } finally { runtime.atomicWriteFile = originalAtomicWriteFile; }
  assert.equal(runtime.assetCatalog(root).revision, c.revision);
  assert.equal(fs.readFileSync(retainedProjectFile, 'utf8'), 'project bytes\n');
  assert.equal(fs.existsSync(path.join(root, 'projects/rolled-back-project')), false);
  assert.deepEqual(fs.readFileSync(projectManifest), projectManifestBytes);

  c = runtime.updateCatalogAsset(root, 'project', projectId, { revision: c.revision, code: 'renamed-project' });
  assert.equal(fs.existsSync(path.join(root, 'projects/demo')), false);
  assert.equal(fs.readFileSync(path.join(root, 'projects/renamed-project/asset-rename-retained.txt'), 'utf8'), 'project bytes\n');
  const serviceId = c.services.find((service: any) => service.code === 'asset-api').id;
  const oldDocs = path.join(root, 'services/asset-api'), occupiedDocs = path.join(root, 'services/occupied-api');
  fs.mkdirSync(oldDocs, { recursive: true }); fs.writeFileSync(path.join(oldDocs, 'notes.md'), 'service docs\n');
  fs.mkdirSync(occupiedDocs); fs.writeFileSync(path.join(occupiedDocs, 'notes.md'), 'unrelated docs\n');
  const serviceManifestBytes = fs.readFileSync(path.join(root, 'services/manifest.yml'));
  assert.throws(() => runtime.updateCatalogAsset(root, 'service', serviceId, { revision: c.revision, code: 'occupied-api' }), (error: any) => error.code === 'asset_directory_occupied');
  assert.equal(runtime.assetCatalog(root).revision, c.revision);
  assert.equal(runtime.assetCatalog(root).services.find((service: any) => service.id === serviceId).code, 'asset-api');
  assert.deepEqual(fs.readFileSync(path.join(root, 'services/manifest.yml')), serviceManifestBytes);
  assert.equal(fs.readFileSync(path.join(oldDocs, 'notes.md'), 'utf8'), 'service docs\n');
  assert.equal(fs.readFileSync(path.join(occupiedDocs, 'notes.md'), 'utf8'), 'unrelated docs\n');
  fs.rmSync(occupiedDocs, { recursive: true, force: true });
  c = runtime.updateCatalogAsset(root, 'service', serviceId, { revision: c.revision, code: 'asset-api-v2' });
  assert.equal(fs.existsSync(oldDocs), false);
  assert.equal(fs.readFileSync(path.join(root, 'services/asset-api-v2/notes.md'), 'utf8'), 'service docs\n');
});

test('attached project code rename keeps external source and never adopts workspace path', (t: any) => {
  const { root, runtime } = setup(t);
  const projectManifest = path.join(root, 'projects/manifest.yml'), external = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-attached-project-'));
  t.after(() => fs.rmSync(external, { recursive: true, force: true }));
  fs.writeFileSync(path.join(external, 'keep.txt'), 'external project bytes\n');
  const document: any = YAML.parse(fs.readFileSync(projectManifest, 'utf8'));
  const demoRecord = Object.values(document.projects).find((entry: any) => entry.code === 'demo') as any;
  assert.ok(demoRecord);
  demoRecord.source = { type: 'git', root: 'attached', path: external, git: { url: 'https://example.com/demo.git', remote: 'origin', integrationBranch: 'main' } };
  fs.writeFileSync(projectManifest, YAML.stringify(document));
  let c = runtime.assetCatalog(root);
  const project = c.projects.find((item: any) => item.code === 'demo'), target = path.join(root, 'projects/attached-renamed');
  fs.mkdirSync(target); fs.writeFileSync(path.join(target, 'keep.txt'), 'unrelated workspace path\n');
  c = runtime.updateCatalogAsset(root, 'project', project.id, { revision: c.revision, code: 'attached-renamed' });
  const updated = c.projects.find((item: any) => item.id === project.id);
  assert.equal(updated.code, 'attached-renamed');
  assert.equal(updated.source.root, 'attached');
  assert.equal(updated.source.path, external);
  assert.equal(fs.readFileSync(path.join(external, 'keep.txt'), 'utf8'), 'external project bytes\n');
  assert.equal(fs.readFileSync(path.join(target, 'keep.txt'), 'utf8'), 'unrelated workspace path\n');
  assert.equal(fs.existsSync(path.join(root, 'projects/demo')), true);
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
  const result: any = await http.handle({ request: { method: 'POST' }, suffix: '/asset-catalog/repositories', root, authorizeWrite: () => { authorized++; }, readJsonBody: async () => ({ revision: c.revision, code: 'api', url: 'https://example.com/api.git', integrationBranch: 'dev', serviceIds: [] }) });
  assert.equal(result.status, 200); assert.equal(authorized, 1); assert.equal(result.body.repositories.length, 1);
  await assert.rejects(http.handle({ request: { method: 'POST' }, suffix: '/asset-catalog/repositories', root, authorizeWrite: () => {}, readJsonBody: async () => ({ revision: result.body.revision, code: 'bad', unexpected: true }) }), (e: any) => e.code === 'workspace_http_request_invalid');
});



test('shared code repository yields one task worktree and module directories do not become Git roots', async (t: any) => {
  const { root, runtime } = setup(t);
  const git = (cwd: string, ...args: string[]) => { const r = spawnSync('git', args, { cwd, encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); return r.stdout.trim(); };
  let c = ready(runtime, root); c = addRepo(runtime, root, c.revision, 'shared', 'dev');
  const repository = c.repositories[0], codeRoot = path.join(root, repository.source.path);
  await runtime.repositoryCloneIdle();
  assert.equal(runtime.repositoryCloneStatus(root, repository.id).state, 'failed', 'unreachable origin clone must surface failed state');
  fs.mkdirSync(path.join(codeRoot, 'modules/pig'), { recursive: true });
  git(codeRoot, 'init', '--initial-branch=dev'); git(codeRoot, 'config', 'user.name', 'Test'); git(codeRoot, 'config', 'user.email', 'test@example.com');
  git(codeRoot, 'remote', 'add', 'origin', repository.source.git.url); git(codeRoot, 'commit', '--allow-empty', '-m', 'baseline');
  for (const code of ['pig-api', 'egg-api']) c = runtime.createCatalogService(root, { revision: c.revision, projectId: c.projects[0].id, service: { code, name: code, repositoryId: repository.id, modulePath: 'modules/pig' } });
  git(root, 'init', '--initial-branch=dev'); git(root, 'config', 'user.name', 'Test'); git(root, 'config', 'user.email', 'test@example.com');
  fs.appendFileSync(path.join(root, '.gitignore'), '\n/repositories/shared/\n'); git(root, 'add', '.'); git(root, 'commit', '-m', 'workspace');
  const plan = runtime.planGitWorktrees({ workspaceRoot: root, taskId: 'shared-code', branch: 'codex/shared-code', includes: ['service:demo/pig-api', 'service:demo/egg-api'] });
  assert.equal(plan.repositories.length, 2); // workspace plus one shared Git checkout
  assert.equal(plan.repositories[1].sourcePath, 'repositories/shared');
  fs.mkdirSync(path.join(root, 'services/pig-api'), { recursive: true });
  assert.equal(resolveRuleScope(root, 'services/pig-api').projectRoot, null);
  assert.equal(resolveRuleScope(root, 'repositories/shared/modules/pig').scopeRoot, path.join(codeRoot, 'modules/pig'));
});


test('git repository registration clones asynchronously; explicit request retries after failure', async (t: any) => {
  const { root, runtime } = setup(t);
  let catalog = ready(runtime, root);
  const origin = makeOriginRepository(t, 'clone-origin');
  catalog = runtime.createCatalogRepository(root, { revision: catalog.revision, code: 'cloned-code', url: `file://${origin}`, integrationBranch: 'main' });
  const repositoryId = catalog.repositories.find((r: any) => r.code === 'cloned-code').id;
  await waitFor(() => runtime.repositoryCloneStatus(root, repositoryId).state === null, 'registration clone must complete before becoming ready');
  assert.equal(fs.readFileSync(path.join(root, 'repositories/cloned-code/README.md'), 'utf8'), '# demo\n');
  assert.equal(runtime.repositoryCloneStatus(root, repositoryId).state, null, 'successful clone clears transient state');
  assert.equal(runtime.repositoryCloneRequest(root, repositoryId).status, 'ready', 'cloning an existing directory is a no-op');
  // A clone that cannot reach its remote keeps the registration and stays retryable.
  catalog = runtime.createCatalogRepository(root, { revision: catalog.revision, code: 'missing-code', url: 'file:///nonexistent-origin-path', integrationBranch: 'main' });
  const missingId = catalog.repositories.find((r: any) => r.code === 'missing-code').id;
  await waitFor(() => runtime.repositoryCloneStatus(root, missingId).state === 'failed', 'failed clone must surface failed state');
  assert.ok(fs.existsSync(path.join(root, 'repositories/manifest.yml')), 'registration survives clone failure');
  const retry = runtime.repositoryCloneRequest(root, missingId);
  assert.ok(['started', 'already-running'].includes(retry.status), `retry must start a new clone, got ${retry.status}`);
  await waitFor(() => runtime.repositoryCloneStatus(root, missingId).state === 'failed', 'retried clone reports its own outcome');
  assert.equal(runtime.repositoryCloneRequest(root, 'unknown-id').status, 'unavailable');
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
