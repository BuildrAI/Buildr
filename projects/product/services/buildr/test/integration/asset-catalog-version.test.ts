import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { registerAssetRelationshipsApplication } from '../../src/modules/workspace/application/asset-relationships-application.ts';
import { renderProjectsManifest } from '../../src/modules/workspace/persistence/project-manifest-repository.ts';
import { renderServicesDomainManifest } from '../../src/modules/workspace/persistence/service-manifest-repository.ts';

function fixture(t: test.TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-catalog-version-'));
  t.after(() => fs.rmSync(root, {recursive:true, force:true}));
  for (const [file, content] of Object.entries({'.buildr/workspace.yml':'workspace: one\n', 'projects/manifest.yml':'projects: {}\n', 'services/manifest.yml':'services: {}\n', 'repositories/manifest.yml':'repositories: {}\n'})) {
    fs.mkdirSync(path.dirname(path.join(root, file)), {recursive:true});
    fs.writeFileSync(path.join(root, file), content);
  }
  const runtime: Record<string, any> = {};
  registerAssetRelationshipsApplication(runtime);
  return {root, version:() => runtime.assetCatalogVersion(root) as string};
}

test('catalog source versions compare current bytes without reparsing registrations or running Git', t => {
  const f = fixture(t), before = f.version(), file = path.join(f.root, 'repositories/manifest.yml'), observed = fs.statSync(file);
  assert.equal(f.version(), before);
  fs.writeFileSync(file, 'repositories: []\n');
  fs.utimesSync(file, observed.atime, observed.mtime);
  assert.notEqual(f.version(), before, 'equal timestamps cannot hide changed registrations');
  fs.writeFileSync(file, 'repositories: {}\n');
  assert.equal(f.version(), before, 'an identical current source has the same content version');
});

test('workspace identity and optional skills registration participate in the catalog source version', t => {
  const f = fixture(t), before = f.version();
  fs.writeFileSync(path.join(f.root, '.buildr/workspace.yml'), 'workspace: two\n');
  assert.notEqual(f.version(), before);
  const next = f.version();
  fs.mkdirSync(path.join(f.root, 'skills'));
  fs.writeFileSync(path.join(f.root, 'skills/manifest.yml'), 'skills: []\n');
  assert.notEqual(f.version(), next);
});

test('a registration replaced with a symbolic link cannot reuse the old catalog observation', t => {
  const f = fixture(t), file = path.join(f.root, 'repositories/manifest.yml');
  f.version();
  fs.renameSync(file, path.join(f.root, 'repositories/original.yml'));
  fs.symlinkSync('original.yml', file);
  assert.throws(f.version, error => (error as {code?:string}).code === 'asset_symlink_forbidden');
});

test('legacy project service registrations remain part of the current source version', t => {
  const f = fixture(t), workspaceId='c1cdb836-063d-4a47-9c24-c4bca1c72c1f', projectId='0b549beb-988b-43b1-ac51-e953b4c2c434';
  fs.unlinkSync(path.join(f.root, 'services/manifest.yml'));
  fs.unlinkSync(path.join(f.root, 'repositories/manifest.yml'));
  fs.writeFileSync(path.join(f.root, 'projects/manifest.yml'), renderProjectsManifest([{id:projectId, workspaceId, code:'example', name:'Example', description:'Legacy example project', source:{type:'workspace', path:'projects/example'}}]));
  const file=path.join(f.root, 'projects/example/services/manifest.yml');
  fs.mkdirSync(path.dirname(file), {recursive:true});
  fs.writeFileSync(file, renderServicesDomainManifest(projectId, []));
  const runtime:Record<string,any>={readWorkspaceRecord:() => ({workspace:{id:workspaceId}})};
  registerAssetRelationshipsApplication(runtime);
  const before=runtime.assetCatalogVersion(f.root);
  fs.appendFileSync(file, '# changed project registration source\n');
  assert.notEqual(runtime.assetCatalogVersion(f.root), before);
});
