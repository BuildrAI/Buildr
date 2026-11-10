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

  fs.writeFileSync(path.join(workspace, 'AGENTS.md'), '# User rules\n');
  run(['rules', 'render', 'claude-code', '--target', workspace]);
  assert.ok(fs.readFileSync(path.join(workspace, 'CLAUDE.md'), 'utf8').includes('AGENTS.md'));
});
