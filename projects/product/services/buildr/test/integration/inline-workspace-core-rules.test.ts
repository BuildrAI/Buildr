import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createRuntime } from '../helpers/runtime-harness.ts';
import { block, fixture, legacy } from '../helpers/inline-core-fixture.ts';



test('sync and doctor do not create or repair root rules', async (t: any) => {
  for (const before of [null, '  用户自有规则\r\n\r\n', block, '<!-- buildr:required begin -->user edited legacy content', 'pre<!-- buildr:required end -->post']) {
    await t.test(before === null ? 'absent' : before.slice(0, 40), (t: any) => {
      const { workspace }: any = fixture(t, true);
      const runtime = createRuntime();
      const file = path.join(workspace, 'AGENTS.md');
      fs.rmSync(file, { force: true });
      if (before !== null) fs.writeFileSync(file, before);
      for (let pass = 0; pass < 2; pass++) {
        runtime.syncPackageBuiltins(workspace);
        const doctor: any = runtime.doctor({ targetRoot: workspace, agent: 'codex' });
        assert.equal(doctor.findings.some((finding: any) => finding.code === 'rules.required_block_invalid'), false);
        assert.equal(Object.hasOwn(doctor.workspace, 'requiredBlock'), false);
        if (before === null) assert.equal(fs.existsSync(file), false);
        else assert.equal(fs.readFileSync(file, 'utf8'), before);
      }
    });
  }
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
        agents: fs.existsSync(path.join(workspace, 'AGENTS.md')) ? fs.readFileSync(path.join(workspace, 'AGENTS.md')) : null,
        manifest: fs.readFileSync(rulesPath),
        file: options.missing ? null : fs.readFileSync(file),
      };
      runtime.syncPackageBuiltins(workspace);
      if (before.agents === null) assert.equal(fs.existsSync(path.join(workspace, 'AGENTS.md')), false);
      else assert.deepEqual(fs.readFileSync(path.join(workspace, 'AGENTS.md')), before.agents);
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
