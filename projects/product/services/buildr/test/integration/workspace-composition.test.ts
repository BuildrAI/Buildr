import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';
import { createRuntime } from '../helpers/runtime-harness.ts';
import { copyPreparedProjectWorkspace } from '../helpers/prepared-fixtures.ts';
import { createWorkspaceHttpContribution } from '../../src/modules/workspace/interfaces/http/workspace-http.ts';

function setup(t: any) {
  const { root } = copyPreparedProjectWorkspace(t, 'workspace-composition');
  const runtime: any = createRuntime();
  let catalog = runtime.migrateAssetCatalog(root, { revision: runtime.assetCatalog(root).revision });
  catalog = runtime.createCatalogRepository(root, { revision: catalog.revision, code: 'shared', url: 'https://example.com/shared.git', integrationBranch: 'main' });
  for (const code of ['shared-api', 'independent']) catalog = runtime.createCatalogService(root, { revision: catalog.revision, service: { code, name: code, repositoryId: catalog.repositories[0].id } });
  const serviceId = catalog.services.find((s: any) => s.code === 'shared-api').id;
  catalog = runtime.updateProjectServices(root, catalog.projects[0].id, { revision: catalog.revision, serviceIds: [serviceId] });
  catalog = runtime.createCatalogProject(root, { revision: catalog.revision, code: 'second', name: '第二项目', serviceIds: [serviceId] });
  return { root, runtime, catalog };
}

test('composition returns unique identities and registered shared/independent references without observing Git or writing', async t => {
  const { root, runtime, catalog } = setup(t);
  const files = ['projects', 'services', 'repositories'].map(source => path.join(root, source, 'manifest.yml'));
  const before = files.map(file => fs.readFileSync(file));
  runtime.observeProjectGit = () => { throw Error('composition must not inspect Git'); };
  runtime.catalogRepositoryStatus = () => { throw Error('composition must not inspect repository status'); };
  const http = createWorkspaceHttpContribution(runtime);
  const response: any = await http.handle({ request: { method: 'GET' }, suffix: '/workspace-composition', root });
  assert.equal(response.status, 200);
  const result = response.body;
  assert.deepEqual(result.sources, { projects: 'complete', services: 'complete', repositories: 'complete' });
  assert.equal(result.services.length, 2);
  assert.equal(result.repositories.length, 1);
  assert.deepEqual(result.projects.map((p: any) => p.serviceIds), catalog.projects.map((p: any) => p.serviceIds));
  assert.equal(result.services.find((s: any) => s.code === 'independent').repositoryId, catalog.repositories[0].id);
  files.forEach((file, i) => assert.deepEqual(fs.readFileSync(file), before[i]));
});

test('damaged repository source preserves projects, services and their known references; recovery is complete', t => {
  const { root, runtime, catalog } = setup(t);
  const file = path.join(root, 'repositories/manifest.yml'), before = fs.readFileSync(file);
  fs.writeFileSync(file, 'repositories: [\n');
  const result = runtime.workspaceComposition(root);
  assert.equal(result.sources.repositories, 'unavailable');
  assert.equal(result.sources.projects, 'complete');
  assert.equal(result.sources.services, 'complete');
  assert.equal(result.projects.length, 2);
  assert.equal(result.services[0].repositoryId, catalog.repositories[0].id);
  assert.ok(result.diagnostics.some((d: any) => d.source === 'repositories'));
  fs.writeFileSync(file, before);
  assert.equal(runtime.workspaceComposition(root).sources.repositories, 'complete');
});

test('invalid service entry retains valid siblings and project references without weakening strict writes', t => {
  const { root, runtime, catalog } = setup(t);
  const file = path.join(root, 'services/manifest.yml');
  const doc = YAML.parse(fs.readFileSync(file, 'utf8'));
  doc.services['shared-api'].name = null;
  fs.writeFileSync(file, YAML.stringify(doc));
  const result = runtime.workspaceComposition(root);
  assert.equal(result.sources.services, 'partial');
  assert.deepEqual(result.services.map((s: any) => s.code), ['independent']);
  assert.deepEqual(result.projects[0].serviceIds, catalog.projects[0].serviceIds);
  assert.equal(result.repositories.length, 1);
  assert.throws(() => runtime.updateProjectServices(root, catalog.projects[0].id, { revision: catalog.revision, serviceIds: [] }));
});

test('project read failure preserves other sources and does not claim an empty complete project list', t => {
  const { root, runtime } = setup(t);
  fs.writeFileSync(path.join(root, 'projects/manifest.yml'), 'invalid: [\n');
  const result = runtime.workspaceComposition(root);
  assert.equal(result.sources.projects, 'unavailable');
  assert.equal(result.services.length, 2);
  assert.equal(result.repositories.length, 1);
  assert.ok(result.diagnostics.length);
});
