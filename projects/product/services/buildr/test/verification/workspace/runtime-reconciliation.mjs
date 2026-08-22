#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { assertHealthyDoctor, createSuiteFixture, parseJson, productRoot, runBuildr } from './fixture.mjs';

const fixture = createSuiteFixture('runtime-reconciliation');
let passed = false;
try {
  runBuildr(['init', '--target', fixture.workspace, '--name', 'runtime-e2e', '--profile', 'team']);
  runBuildr(['project', 'create', 'demo', '--target', fixture.workspace]);
  const moduleDirectory = path.join(fixture.workspace, 'projects', 'demo', 'modules', 'orders');
  fs.mkdirSync(moduleDirectory, { recursive: true });
  fs.writeFileSync(path.join(moduleDirectory, 'AGENTS.md'), '# Orders Rules\n\nORDERS_RUNTIME_MARKER\n');

  runBuildr(['sync', 'codex', '--scope', '.', '--target', fixture.workspace]);
  runBuildr(['sync', 'claude-code', '--scope', '.', '--target', fixture.workspace]);
  const bridge = fs.readFileSync(path.join(moduleDirectory, 'CLAUDE.md'), 'utf8');
  assert.match(bridge, /BEGIN Buildr managed Claude Code rules bridge/);
  assert.match(bridge, /@AGENTS\.md/);

  const codexDoctor = parseJson(runBuildr(['doctor', '--agent', 'codex', '--target', fixture.workspace, '--json', '--detail', 'full']), 'Codex reconciliation doctor');
  const claudeDoctor = parseJson(runBuildr(['doctor', '--agent', 'claude-code', '--target', fixture.workspace, '--json', '--detail', 'full']), 'Claude Code reconciliation doctor');
  assertHealthyDoctor(codexDoctor, 'codex');
  assertHealthyDoctor(claudeDoctor, 'claude-code');

  const componentSkill = path.join(fixture.workspace, 'skills', 'openspec', 'openspec-propose', 'SKILL.md');
  fs.appendFileSync(componentSkill, '\nworkspace source drift\n');
  const drifted = runBuildr(['sync', 'codex', '--scope', '.', '--target', fixture.workspace], { allowFailure: true });
  assert.notEqual(drifted.status, 0, 'sync must fail closed on modified Component source');
  assert.match(drifted.combined, /conflict|integrity mismatch|冲突|暂停/i);
  assert.match(fs.readFileSync(componentSkill, 'utf8'), /workspace source drift/);

  fs.copyFileSync(path.join(productRoot, 'resources', 'workspace', 'skills', 'openspec', 'openspec-propose', 'SKILL.md'), componentSkill);
  runBuildr(['sync', 'codex', '--scope', '.', '--target', fixture.workspace]);
  assert.doesNotMatch(fs.readFileSync(componentSkill, 'utf8'), /workspace source drift/);
  const recovered = parseJson(runBuildr(['doctor', '--agent', 'codex', '--target', fixture.workspace, '--json', '--detail', 'full']), 'recovered Codex doctor');
  assertHealthyDoctor(recovered, 'codex');
  passed = true;
  console.log('Runtime reconciliation E2E passed.');
} finally {
  fixture.cleanup({ failed: !passed });
}
