import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fixture, assertInline, legacy } from '../helpers/inline-core-fixture.ts';

test('new workspace inlines principles and retires rule registration commands', (t: any) => {
  const { workspace, run, runFail }: any = fixture(t);
  run(['init', '--target', workspace, '--name', 'inline', '--profile', 'personal']);
  assertInline(workspace);
  assert.equal(fs.existsSync(path.join(workspace, 'rules')), false, 'init must not create a retired rules directory');

  legacy(workspace);
  const manifest: any = fs.readFileSync(path.join(workspace, 'rules/manifest.yml'));
  const file: any = fs.readFileSync(path.join(workspace, 'rules/buildr/core.md'));

  for (const args of [
    ['rules', 'add', 'specialist', '--description', 'specialist work', '--target', workspace],
    ['rules', 'remove', 'buildr-core', '--target', workspace],
  ]) {
    const result: any = runFail(args);
    assert.notEqual(result.status, 0, args.join(' '));
    assert.match(result.stderr, /退役/u);
  }
  assert.deepEqual(fs.readFileSync(path.join(workspace, 'rules/manifest.yml')), manifest);
  assert.deepEqual(fs.readFileSync(path.join(workspace, 'rules/buildr/core.md')), file);

  run(['sync', 'codex', '--target', workspace]);
  assertInline(workspace);
  assert.deepEqual(fs.readFileSync(path.join(workspace, 'rules/manifest.yml')), manifest);
  assert.deepEqual(fs.readFileSync(path.join(workspace, 'rules/buildr/core.md')), file);

  const doctor: any = JSON.parse(run(['doctor', '--target', workspace, '--json']));
  const retirement: any[] = doctor.findings.filter((finding: any) => finding.code.startsWith('rules.retired_'));
  assert.ok(retirement.length >= 2);
  assert.equal(retirement.every((finding: any) => finding.userActionRequired === false), true);

  run(['rules', 'render', 'claude-code', '--target', workspace]);
  assert.ok(fs.readFileSync(path.join(workspace, 'CLAUDE.md'), 'utf8').includes('AGENTS.md'));
});
