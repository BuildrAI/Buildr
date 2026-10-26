import { readSharedCandidatePackage } from '../../../../../../skills/buildr-release/scripts/candidate-package.ts';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { source, fixture, assertInline, legacy } from '../helpers/inline-core-fixture.ts';



test('packed artifact contains the sole inline source and initializes and upgrades workspaces', async (t: any) => {
  const { root, workspace, run }: any = fixture(t);
  const shared = readSharedCandidatePackage();
  assert.ok(shared?.manifest, 'The original frozen package is required; this consumer never builds another package.');
  const artifact = { tarball: shared.tarball };
  assert.equal(shared.manifest.inventory.some((file: {path: string}) => file.path.endsWith('/rules/buildr/core.md')), false);
  assert.equal(shared.manifest.inventory.some((file: {path: string}) => file.path.endsWith('/workspace/AGENTS.md')), true);
  const extracted: any = spawnSync('tar', ['-xzf', artifact.tarball, '-C', root], { encoding: 'utf8', timeout: 60000 });
  assert.equal(extracted.status, 0, extracted.stderr);
  assert.equal(fs.readFileSync(path.join(root, 'package/payload/product/resources/workspace/AGENTS.md'), 'utf8'), source);
  const cli: any = path.join(root, 'package/bin/buildr.mjs');
  run(['init', '--target', workspace, '--name', 'packed', '--profile', 'personal'], cli);
  assertInline(workspace);
  assert.equal(fs.existsSync(path.join(workspace, 'rules')), false, 'init must not create a retired rules directory');
  legacy(workspace);
  const manifest: any = fs.readFileSync(path.join(workspace, 'rules/manifest.yml'));
  const file: any = fs.readFileSync(path.join(workspace, 'rules/buildr/core.md'));
  run(['sync', 'codex', '--target', workspace], cli);
  assertInline(workspace);
  assert.deepEqual(fs.readFileSync(path.join(workspace, 'rules/manifest.yml')), manifest);
  assert.deepEqual(fs.readFileSync(path.join(workspace, 'rules/buildr/core.md')), file);
});
