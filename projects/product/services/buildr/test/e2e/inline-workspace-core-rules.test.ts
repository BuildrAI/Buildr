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



test('new workspace and receipt-owned upgrade deliver all principles without a Core file', (t: any) => {
  const { workspace, run }: any = fixture(t);
  const readRules: any = () => YAML.parse(fs.readFileSync(path.join(workspace, 'rules/manifest.yml'), 'utf8'));
  run(['init', '--target', workspace, '--name', 'inline', '--profile', 'personal']);
  assertInline(workspace);
  assert.equal(fs.existsSync(path.join(workspace, 'rules/buildr/core.md')), false);
  legacy(workspace);
  fs.writeFileSync(path.join(workspace, 'rules/specialist.md'), '# Specialist\nOnly for relevant work.\n');
  run(['rules', 'add', 'specialist', '--description', 'specialist work', '--target', workspace]);
  run(['sync', 'codex', '--target', workspace]);
  assert.equal(assertInline(workspace), `USER PREFIX\n${block}\nUSER SUFFIX`);
  const disabled: any = readRules();
  disabled.rules.find((r: any) => r.id === 'specialist').enabled = false;
  fs.writeFileSync(path.join(workspace, 'rules/manifest.yml'), YAML.stringify(disabled));
  run(['sync', 'codex', '--target', workspace]);
  assert.equal(readRules().rules.find((r: any) => r.id === 'specialist').enabled, false);
  disabled.rules.find((r: any) => r.id === 'specialist').enabled = true;
  fs.writeFileSync(path.join(workspace, 'rules/manifest.yml'), YAML.stringify(disabled));
  assert.equal(fs.existsSync(path.join(workspace, 'rules/buildr/core.md')), false);
  assert.equal(readRules().rules.some((r: any) => r.id === 'buildr-core'), false);
  assert.ok(readRules().rules.some((r: any) => r.id === 'specialist'));
  assert.equal(JSON.parse(fs.readFileSync(path.join(workspace, '.buildr/builtin-receipts.json'), 'utf8')).builtins.some((r: any) => r.id === 'buildr-core'), false);
  run(['sync', 'codex', '--target', workspace]);
  assert.equal(assertInline(workspace), `USER PREFIX\n${block}\nUSER SUFFIX`);
  run(['rules', 'render', 'claude-code', '--target', workspace]);
  assert.ok(fs.readFileSync(path.join(workspace, 'CLAUDE.md'), 'utf8').includes('AGENTS.md'));
  run(['rules', 'remove', 'specialist', '--keep-file', '--target', workspace]);
  assert.equal(readRules().rules.some((r: any) => r.id === 'specialist'), false);
  assert.ok(fs.existsSync(path.join(workspace, 'rules/specialist.md')));
});


test('failed migration restores the old entry, registration, receipt and file together', (t: any) => {
  const { workspace, run, env }: any = fixture(t);
  run(['init', '--target', workspace, '--name', 'rollback', '--profile', 'personal']);
  legacy(workspace);
  const paths: any[] = ['AGENTS.md', 'rules/manifest.yml', 'rules/buildr/core.md', '.buildr/builtin-receipts.json'];
  const before: any = paths.map((p: any) => fs.readFileSync(path.join(workspace, p)));
  for (const failAfter of ['1', '2', '3', '4']) {
    const result: any = spawnSync(process.execPath, [path.join(service, 'bin/buildr.mjs'), 'sync', 'codex', '--target', workspace], {
      cwd: service, env: { ...env, BUILDR_FAULT_AFTER_MUTATION_WRITE: failAfter }, encoding: 'utf8', timeout: 60000,
    });
    assert.notEqual(result.status, 0, 'fault must interrupt migration');
    for (const [i, p] of paths.entries()) assert.deepEqual(fs.readFileSync(path.join(workspace, p)), before[i], p);
  }
  run(['sync', 'codex', '--target', workspace]);
  assertInline(workspace);
  assert.equal(fs.existsSync(path.join(workspace, 'rules/buildr/core.md')), false);
});
