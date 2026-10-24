#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { assertHealthyDoctor, createSuiteFixture, parseJson, runBuildr } from './fixture.ts';

const fixture: any = createSuiteFixture('runtime-reconciliation');
let passed: any = false;
try {
  runBuildr(['init', '--target', fixture.workspace, '--name', 'runtime-e2e', '--profile', 'team']);
  runBuildr(['project', 'create', 'demo', '--target', fixture.workspace]);
  const moduleDirectory: any = path.join(fixture.workspace, 'projects', 'demo', 'modules', 'orders');
  fs.mkdirSync(moduleDirectory, { recursive: true });
  fs.writeFileSync(path.join(moduleDirectory, 'AGENTS.md'), '# Orders Rules\n\nORDERS_RUNTIME_MARKER\n');

  runBuildr(['sync', 'codex', '--scope', '.', '--target', fixture.workspace]);
  runBuildr(['sync', 'claude-code', '--scope', '.', '--target', fixture.workspace]);
  const bridge: any = fs.readFileSync(path.join(moduleDirectory, 'CLAUDE.md'), 'utf8');
  assert.match(bridge, /BEGIN Buildr managed Claude Code rules bridge/);
  assert.match(bridge, /@AGENTS\.md/);

  const codexDoctor: any = parseJson(runBuildr(['doctor', '--agent', 'codex', '--target', fixture.workspace, '--json', '--detail', 'full']), 'Codex reconciliation doctor');
  const claudeDoctor: any = parseJson(runBuildr(['doctor', '--agent', 'claude-code', '--target', fixture.workspace, '--json', '--detail', 'full']), 'Claude Code reconciliation doctor');
  assertHealthyDoctor(codexDoctor, 'codex');
  assertHealthyDoctor(claudeDoctor, 'claude-code');

  // Component skill members are projected from the shared resource store; source drift is
  // declared by dropping the resource projection and materializing local drifted bytes.
  const manifestFile: any = path.join(fixture.workspace, 'skills', 'manifest.yml');
  const componentSkill: any = path.join(fixture.workspace, 'skills', 'openspec', 'openspec-propose', 'SKILL.md');
  const document: any = YAML.parse(fs.readFileSync(manifestFile, 'utf8'));
  const entryIndex: any = document.skills.findIndex((item: any) => item.id === 'openspec-propose');
  const officialEntry: any = JSON.stringify(document.skills[entryIndex]);
  delete document.skills[entryIndex].resource;
  fs.mkdirSync(path.dirname(componentSkill), { recursive: true });
  fs.writeFileSync(componentSkill, '---\nname: openspec-propose\ndescription: drift\n---\n\nworkspace source drift\n');
  fs.writeFileSync(manifestFile, YAML.stringify(document));
  const drifted: any = runBuildr(['sync', 'codex', '--scope', '.', '--target', fixture.workspace], { allowFailure: true });
  assert.notEqual(drifted.status, 0, 'sync must fail closed on modified Component source');
  assert.match(drifted.combined, /conflict|integrity mismatch|冲突|暂停/i);
  assert.match(fs.readFileSync(componentSkill, 'utf8'), /workspace source drift/);

  // Recovery retires the drifted local copy and restores the official resource projection.
  fs.rmSync(path.dirname(componentSkill), { recursive: true, force: true });
  const recoveredDocument: any = YAML.parse(fs.readFileSync(manifestFile, 'utf8'));
  recoveredDocument.skills[recoveredDocument.skills.findIndex((item: any) => item.id === 'openspec-propose')] = JSON.parse(officialEntry);
  fs.writeFileSync(manifestFile, YAML.stringify(recoveredDocument));
  runBuildr(['sync', 'codex', '--scope', '.', '--target', fixture.workspace]);
  assert.equal(fs.existsSync(componentSkill), false, 'the official projection owns the member again');
  const recovered: any = parseJson(runBuildr(['doctor', '--agent', 'codex', '--target', fixture.workspace, '--json', '--detail', 'full']), 'recovered Codex doctor');
  assertHealthyDoctor(recovered, 'codex');
  passed = true;
  console.log('Runtime reconciliation E2E passed.');
} finally {
  fixture.cleanup({ failed: !passed });
}
