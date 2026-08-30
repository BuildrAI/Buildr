#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { assertHealthyDoctor, createSuiteFixture, parseJson, runBuildr } from './fixture.mjs';

const fixture = createSuiteFixture('ownership-recovery');
let passed = false;
try {
  runBuildr(['init', '--agent', 'codex', '--target', fixture.workspace, '--name', 'ownership-e2e', '--profile', 'team']);
  const componentSkill = path.join(fixture.workspace, 'skills', 'openspec', 'openspec-propose', 'SKILL.md');
  const componentBefore = fs.readFileSync(componentSkill, 'utf8');

  const componentOwnedRemoval = runBuildr(['skills', 'remove', 'openspec-propose', '--scope', '.', '--target', fixture.workspace], { allowFailure: true });
  assert.notEqual(componentOwnedRemoval.status, 0);
  assert.match(componentOwnedRemoval.combined, /managed by Component openspec/);
  assert.equal(fs.readFileSync(componentSkill, 'utf8'), componentBefore, 'ownership refusal must preserve the Component member');

  const requiredRemoval = runBuildr(['builtin', 'uninstall', 'buildr-core', '--target', fixture.workspace], { allowFailure: true });
  assert.notEqual(requiredRemoval.status, 0);
  assert.match(requiredRemoval.combined, /Buildr builtin not found/);
  assert.equal(fs.existsSync(path.join(fixture.workspace, 'rules', 'buildr', 'core.md')), false);
  assert.match(fs.readFileSync(path.join(fixture.workspace, 'AGENTS.md'), 'utf8'), /以目标驱动协作/);

  runBuildr(['builtin', 'uninstall', 'git-operations', '--target', fixture.workspace, '--reason', 'Workspace E2E recovery']);
  assert.equal(fs.existsSync(path.join(fixture.workspace, 'skills', 'buildr', 'git-operations')), false);
  runBuildr(['builtin', 'restore', 'git-operations', '--target', fixture.workspace]);
  assert.equal(fs.existsSync(path.join(fixture.workspace, 'skills', 'buildr', 'git-operations', 'SKILL.md')), true);
  runBuildr(['sync', 'codex', '--scope', '.', '--target', fixture.workspace]);

  const doctor = parseJson(runBuildr(['doctor', '--agent', 'codex', '--target', fixture.workspace, '--json', '--detail', 'full']), 'ownership recovery doctor');
  assertHealthyDoctor(doctor, 'codex');
  passed = true;
  console.log('Ownership recovery E2E passed.');
} finally {
  fixture.cleanup({ failed: !passed });
}
