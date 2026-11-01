import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fixture, legacy } from '../helpers/inline-core-fixture.ts';

test('new workspace leaves root rules absent and retires rule registration commands', (t: any) => {
  const { workspace, run, runFail }: any = fixture(t);
  run(['init', '--target', workspace, '--name', 'inline', '--profile', 'personal']);
  assert.equal(fs.existsSync(path.join(workspace, 'AGENTS.md')), false);
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
  assert.equal(fs.existsSync(path.join(workspace, 'AGENTS.md')), false);
  assert.deepEqual(fs.readFileSync(path.join(workspace, 'rules/manifest.yml')), manifest);
  assert.deepEqual(fs.readFileSync(path.join(workspace, 'rules/buildr/core.md')), file);

  const doctor: any = JSON.parse(run(['doctor', '--target', workspace, '--json']));
  const retirement: any[] = doctor.findings.filter((finding: any) => finding.code.startsWith('rules.retired_'));
  assert.ok(retirement.length >= 2);
  assert.equal(retirement.every((finding: any) => finding.userActionRequired === false), true);
  assert.equal(doctor.findings.some((finding: any) => finding.code === 'runtime.standard_rules_missing' || finding.code === 'rules.required_block_invalid'), false);

  fs.writeFileSync(path.join(workspace, 'AGENTS.md'), '# User rules\n');
  run(['rules', 'render', 'claude-code', '--target', workspace]);
  assert.ok(fs.readFileSync(path.join(workspace, 'CLAUDE.md'), 'utf8').includes('AGENTS.md'));
});

test('init and repeated sync preserve complete existing root rules', (t: any) => {
  const { workspace, run }: any = fixture(t);
  const file = path.join(workspace, 'AGENTS.md');
  const before = '# 自有规则\r\n<!-- buildr:required begin -->已修改旧段<!-- buildr:required end -->\r\n尾部\n';
  fs.writeFileSync(file, before);
  for (const args of [
    ['init', '--target', workspace, '--name', 'existing', '--profile', 'personal'],
    ['sync', 'codex', '--target', workspace],
    ['sync', 'codex', '--target', workspace],
  ]) {
    run(args);
    assert.equal(fs.readFileSync(file, 'utf8'), before);
  }
  const doctor = JSON.parse(run(['doctor', '--target', workspace, '--json']));
  assert.equal(doctor.findings.some((finding: any) => finding.code === 'rules.required_block_invalid'), false);
});
