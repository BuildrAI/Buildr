import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { registerWorkspaceInfrastructure } from '../../src/infrastructure/filesystem/index.ts';
import { createRuntime } from '../helpers/runtime-harness.ts';
import { block, principles, fixture, assertInline, legacy } from '../helpers/inline-core-fixture.ts';



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

test('legacy rule assets survive sync and doctor reports non-blocking retirement warnings', async (t: any) => {
  for (const options of [{ modified: true }, { missing: true }, { invalid: true }, { symlink: true }]) {
    await t.test(JSON.stringify(options), (t: any) => {
      // Initialization has its own real CLI and installed-package cases below.
      // Each variant uses the real builtin-sync and Doctor application on its own
      // filesystem; the surrounding cases retain process, full-sync, installed-package
      // and rollback coverage.
      const { root, workspace }: any = fixture(t, true);
      const runtime = createRuntime();
      legacy(workspace, options);
      const rulesPath: any = path.join(workspace, 'rules/manifest.yml');
      const file: any = path.join(workspace, 'rules/buildr/core.md');
      if (options.symlink) {
        fs.unlinkSync(file);
        fs.writeFileSync(path.join(root, 'outside.md'), 'outside user content');
        fs.symlinkSync(path.join(root, 'outside.md'), file);
      }
      const before: any = {
        agents: fs.readFileSync(path.join(workspace, 'AGENTS.md')),
        manifest: fs.readFileSync(rulesPath),
        file: options.missing ? null : fs.readFileSync(file),
      };
      runtime.syncPackageBuiltins(workspace);
      assertInline(workspace);
      assert.deepEqual(fs.readFileSync(rulesPath), before.manifest);
      if (options.missing) assert.equal(fs.existsSync(file), false);
      else assert.deepEqual(fs.readFileSync(file), before.file);
      if (options.symlink) assert.equal(fs.lstatSync(file).isSymbolicLink(), true);

      const doctor: any = runtime.doctor({ targetRoot: workspace, agent: 'codex' });
      const retirementFindings: any[] = doctor.findings.filter((f: any) => f.code.startsWith('rules.retired_'));
      assert.ok(retirementFindings.length > 0);
      assert.equal(retirementFindings.every((f: any) => f.status === 'warning' && f.userActionRequired === false), true);
      assert.equal(doctor.findings.some((f: any) => f.code === 'rules.retired_manifest_invalid'), options.invalid === true);
      assert.equal(doctor.findings.some((f: any) => f.code === 'rules.retired_manifest_entries'), options.invalid !== true);
      assert.equal(doctor.findings.some((f: any) => f.code === 'rules.retired_files'), options.missing !== true);
      assert.equal(doctor.findings.some((f: any) => f.code === 'rules.legacy_core'), false);

      runtime.syncPackageBuiltins(workspace);
      assert.deepEqual(fs.readFileSync(rulesPath), before.manifest);
      if (!options.missing) assert.deepEqual(fs.readFileSync(file), before.file);
    });
  }
});
