import { readSharedCandidatePackage } from '../../../../../../skills/buildr-release/scripts/candidate-package.ts';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import YAML from 'yaml';
import { registerWorkspaceInfrastructure } from '../../src/infrastructure/filesystem/index.ts';
import { copyPreparedWorkspace } from '../helpers/prepared-fixtures.ts';
import { createRuntime } from '../helpers/runtime-harness.ts';
import { service, source, block, principles, hash, fixture, assertInline, legacy } from '../helpers/inline-core-fixture.ts';



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
  legacy(workspace);
  run(['sync', 'codex', '--target', workspace], cli);
  assert.equal(assertInline(workspace), `USER PREFIX\n${block}\nUSER SUFFIX`);
  assert.equal(fs.existsSync(path.join(workspace, 'rules/buildr/core.md')), false);
});
