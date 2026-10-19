import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';
import { assertInitializedBuildrWorkspace } from '../../src/infrastructure/filesystem/workspace-identity.ts';
import { createWorkspaceManifestRepository } from '../../src/modules/workspace/persistence/workspace-manifest-repository.ts';

function fixture(t: { after(action: () => void): void }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-workspace-read-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const directory of ['.buildr', 'projects', 'skills']) fs.mkdirSync(path.join(root, directory));
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '# Test workspace\n');
  const metadataPath = path.join(root, '.buildr/workspace.yml'), skillsPath = path.join(root, 'skills/manifest.yml');
  fs.writeFileSync(metadataPath, 'schemaVersion: buildr.workspace/v1\nid: f2f40b71-2382-5906-82bd-76a7927b59f3\nname: First\ndescription: Workspace\n');
  fs.writeFileSync(skillsPath, 'schemaVersion: buildr.skills/v3\nworkspaceId: f2f40b71-2382-5906-82bd-76a7927b59f3\nskills:\n  - id: first\n    enabled: true\n');
  let parses = 0;
  const repository = createWorkspaceManifestRepository({
    assertInitializedBuildrWorkspace,
    existsFile: file => fs.existsSync(file),
    parseYamlDocument: content => { parses++; return YAML.parse(content); },
    atomicWriteFile: (file, content) => fs.writeFileSync(file, content),
  });
  return { root, metadataPath, skillsPath, repository, parses: () => parses };
}

test('unchanged current bytes reuse parsing without sharing mutable records', t => {
  const f = fixture(t), first = f.repository.readWorkspacePersistence(f.root);
  first.metadata.workspace.name = 'Changed by caller';
  first.metadata.document.name = 'Changed document';
  first.skills.skills[0].enabled = false;
  const next = f.repository.readWorkspacePersistence(f.root);
  assert.equal(next.metadata.workspace.name, 'First');
  assert.equal(next.metadata.document.name, 'First');
  assert.equal(next.skills.skills[0].enabled, true);
  assert.equal(f.parses(), 1, 'repeated reads must avoid reparsing unchanged skills');
  assert.equal(next.revision, first.revision);
});

test('same-size replacements, identity changes, invalid bytes and removal are observed immediately', t => {
  const f = fixture(t), first = f.repository.readWorkspacePersistence(f.root);
  const before = fs.statSync(f.metadataPath);
  const replacement = f.metadataPath + '.next';
  fs.writeFileSync(replacement, first.metadataContent.replace('name: First', 'name: Other'));
  fs.utimesSync(replacement, before.atime, before.mtime);
  fs.renameSync(replacement, f.metadataPath);
  const renamed = f.repository.readWorkspacePersistence(f.root);
  assert.equal(renamed.metadata.workspace.name, 'Other');
  assert.notEqual(renamed.revision, first.revision);
  fs.writeFileSync(f.skillsPath, first.skillsContent!.replace('76a7927b59f3', '76a7927b59f4'));
  assert.equal(f.repository.readWorkspacePersistence(f.root).skills.workspaceId, 'f2f40b71-2382-5906-82bd-76a7927b59f4');
  fs.writeFileSync(f.metadataPath, 'schemaVersion: [broken');
  assert.throws(() => f.repository.readWorkspacePersistence(f.root), /invalid YAML/);
  fs.writeFileSync(f.metadataPath, first.metadataContent);
  fs.rmSync(f.skillsPath);
  assert.equal(f.repository.readWorkspacePersistence(f.root).skills.workspaceId, null);
  fs.rmSync(f.metadataPath);
  assert.throws(() => f.repository.readWorkspacePersistence(f.root), /not an initialized/);
});
