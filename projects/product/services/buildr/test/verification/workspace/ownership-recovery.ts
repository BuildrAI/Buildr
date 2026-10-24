#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { assertHealthyDoctor, createSuiteFixture, parseJson, runBuildr } from './fixture.ts';

const fixture: any = createSuiteFixture('ownership-recovery');
const readSkillEntry = (id: string): any => {
  const document: any = YAML.parse(fs.readFileSync(path.join(fixture.workspace, 'skills', 'manifest.yml'), 'utf8'));
  return document.skills.find((item: any) => item.id === id);
};
let passed: any = false;
try {
  runBuildr(['init', '--agent', 'codex', '--target', fixture.workspace, '--name', 'ownership-e2e', '--profile', 'team']);
  // Component skill members are projected from the shared resource store; ownership is
  // observed through the manifest entry rather than workspace-local bytes.
  const componentBefore: any = JSON.stringify(readSkillEntry('openspec-propose'));

  const componentOwnedRemoval: any = runBuildr(['skills', 'remove', 'openspec-propose', '--scope', '.', '--target', fixture.workspace], { allowFailure: true });
  assert.notEqual(componentOwnedRemoval.status, 0);
  assert.match(componentOwnedRemoval.combined, /managed by Component openspec/);
  assert.equal(JSON.stringify(readSkillEntry('openspec-propose')), componentBefore, 'ownership refusal must preserve the Component member');

  const requiredRemoval: any = runBuildr(['builtin', 'uninstall', 'buildr-core', '--target', fixture.workspace], { allowFailure: true });
  assert.notEqual(requiredRemoval.status, 0);
  assert.match(requiredRemoval.combined, /Buildr builtin not found/);
  assert.equal(fs.existsSync(path.join(fixture.workspace, 'rules', 'buildr', 'core.md')), false);
  assert.match(fs.readFileSync(path.join(fixture.workspace, 'AGENTS.md'), 'utf8'), /以目标驱动协作/);

  runBuildr(['builtin', 'uninstall', 'git-operations', '--target', fixture.workspace, '--reason', 'Workspace E2E recovery']);
  assert.equal(readSkillEntry('git-operations')?.state, 'uninstalled');
  runBuildr(['builtin', 'restore', 'git-operations', '--target', fixture.workspace]);
  const restored: any = readSkillEntry('git-operations');
  assert.equal(restored?.state, 'installed');
  assert.ok(restored?.resource, 'restore must re-project the builtin from the shared resource store');
  runBuildr(['sync', 'codex', '--scope', '.', '--target', fixture.workspace]);

  const doctor: any = parseJson(runBuildr(['doctor', '--agent', 'codex', '--target', fixture.workspace, '--json', '--detail', 'full']), 'ownership recovery doctor');
  assertHealthyDoctor(doctor, 'codex');
  passed = true;
  console.log('Ownership recovery E2E passed.');
} finally {
  fixture.cleanup({ failed: !passed });
}
