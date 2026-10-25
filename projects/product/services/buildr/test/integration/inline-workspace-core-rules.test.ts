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



test('managed block upgrades, detects drift, repairs markers and preserves outside bytes', (t: any) => {
  const { workspace }: any = fixture(t);
  const runtime: any = {};
  registerWorkspaceInfrastructure(runtime);
  const start: any = '<!-- buildr:required begin -->';
  const end: any = '<!-- buildr:required end -->';
  for (const [before, after] of [
    ['  user\n\n', block + '\n  user\n\n'],
    [`pre\n${start}old${end}\npost`, `pre\n${block}\npost`],
    [`pre${start}one${end}mid${start}two${end}post`, `pre${block}midpost`],
    [`pre${start}unknown\npost`, block + '\npreunknown\npost'],
    [`pre${end}post`, block + '\nprepost'],
  ]) {
    fs.writeFileSync(path.join(workspace, 'AGENTS.md'), before);
    assert.equal(runtime.rootRequiredBlockStatus(workspace).valid, false);
    assert.equal(runtime.ensureRootRequiredBlock(workspace), true);
    assert.equal(fs.readFileSync(path.join(workspace, 'AGENTS.md'), 'utf8'), after);
    assert.equal(runtime.rootRequiredBlockStatus(workspace).valid, true);
    assert.equal(runtime.ensureRootRequiredBlock(workspace), false);
  }
  fs.writeFileSync(path.join(workspace, 'AGENTS.md'), block.replace(principles[0], 'drift'));
  assert.equal(runtime.rootRequiredBlockStatus(workspace).valid, false);
});

test('modified, unreceipted, foreign and symlink legacy files survive sync without global failure', async (t: any) => {
  for (const options of [{ modified: true }, { receipt: false }, { foreign: true }, { symlink: true }, { missing: true }, { unregistered: true, receipt: false }]) {
    await t.test(JSON.stringify(options), (t: any) => {
      // Initialization has its own real CLI and installed-package cases below.
      // Each ownership variant uses the real builtin-sync and Doctor application
      // on its own filesystem; the surrounding cases retain process, full-sync,
      // installed-package and rollback coverage.
      const { root, workspace }: any = fixture(t, true);
      const runtime = createRuntime();
      legacy(workspace, options);
      if (options.unregistered) {
        const rulesPath: any = path.join(workspace, 'rules/manifest.yml');
        const manifest: any = YAML.parse(fs.readFileSync(rulesPath, 'utf8'));
        manifest.rules = manifest.rules.filter((r: any) => r.id !== 'buildr-core');
        fs.writeFileSync(rulesPath, YAML.stringify(manifest));
      }
      const file: any = path.join(workspace, 'rules/buildr/core.md');
      if (options.symlink) {
        fs.unlinkSync(file);
        fs.writeFileSync(path.join(root, 'outside.md'), 'outside user content');
        fs.symlinkSync(path.join(root, 'outside.md'), file);
      }
      const before: any = options.missing ? null : fs.readFileSync(file, 'utf8');
      runtime.syncPackageBuiltins(workspace);
      assertInline(workspace);
      const entry: any = YAML.parse(fs.readFileSync(path.join(workspace, 'rules/manifest.yml'), 'utf8')).rules.find((r: any) => r.id === 'buildr-core');
      if (options.missing) {
        assert.equal(entry, undefined);
        return;
      }
      assert.equal(fs.readFileSync(file, 'utf8'), before);
      if (options.symlink) assert.equal(fs.lstatSync(file).isSymbolicLink(), true);
      if (options.unregistered) assert.equal(entry, undefined);
      else if (options.foreign) assert.equal(entry.source, 'workspace');
      else {
        assert.equal(entry.required, false);
        assert.equal(entry.enabled, false);
      }
      const doctor: any = runtime.doctor({ targetRoot: workspace, agent: 'codex' });
      assert.ok(doctor.findings.some((f: any) => f.code === 'rules.legacy_core'));
      assert.equal(doctor.findings.some((f: any) => f.code === 'rules.buildr_unregistered' && f.path === 'rules/buildr/core.md'), false);
      assert.equal(doctor.findings.some((f: any) => f.code === 'rules.required_block_invalid'), false);
      runtime.syncPackageBuiltins(workspace);
      assert.equal(fs.readFileSync(file, 'utf8'), before);
    });
  }
});
