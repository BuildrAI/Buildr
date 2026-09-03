#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { assertHealthyDoctor, createSuiteFixture, initializeGitRepository, parseJson, runBuildr } from './fixture.ts';

const fixture: any = createSuiteFixture('workspace-lifecycle');
let passed: any = false;
try {
  const serviceRepository: any = path.join(fixture.root, 'service-repository');
  const skillSource: any = path.join(fixture.root, 'review-skill');
  initializeGitRepository(serviceRepository);
  fs.mkdirSync(skillSource);
  fs.writeFileSync(path.join(skillSource, 'SKILL.md'), [
    '---',
    'name: review-skill',
    'description: Review a representative workspace change',
    '---',
    '',
    '# Review Skill',
    '',
  ].join('\n'));

  runBuildr(['init', '--target', fixture.workspace, '--name', 'workspace-e2e', '--profile', 'team']);
  initializeGitRepository(fixture.workspace);
  runBuildr(['project', 'create', 'demo', '--target', fixture.workspace]);
  runBuildr(['service', 'create', 'demo/api', serviceRepository, '--target', fixture.workspace, '--type', 'backend']);

  const rule: any = path.join(fixture.workspace, 'rules', 'review-policy.md');
  fs.writeFileSync(rule, '# Review Policy\n\nReview representative changes before delivery.\n');
  runBuildr(['rules', 'add', 'review-policy', '--description', 'Review representative changes', '--target', fixture.workspace]);
  runBuildr(['commands', 'add', 'node-runtime', '--purpose', 'Execute JavaScript verification', '--executable', 'node', '--target', fixture.workspace]);
  runBuildr(['skills', 'add', '--source', skillSource, '--scope', '.', '--target', fixture.workspace]);
  runBuildr(['sync', 'codex', '--scope', '.', '--target', fixture.workspace]);

  assert.equal(fs.existsSync(path.join(fixture.workspace, 'projects', 'demo', 'services', 'api', '.git')), true);
  assert.equal(fs.existsSync(path.join(fixture.workspace, '.agents', 'skills', 'review-skill', 'SKILL.md')), true);
  assert.match(fs.readFileSync(path.join(fixture.workspace, 'commands', 'manifest.yml'), 'utf8'), /node-runtime/);
  assert.match(fs.readFileSync(path.join(fixture.workspace, 'rules', 'manifest.yml'), 'utf8'), /review-policy/);

  const doctor: any = parseJson(runBuildr(['doctor', '--agent', 'codex', '--target', fixture.workspace, '--json', '--detail', 'full']), 'workspace lifecycle doctor');
  assertHealthyDoctor(doctor, 'codex');
  passed = true;
  console.log('Workspace lifecycle E2E passed.');
} finally {
  fixture.cleanup({ failed: !passed });
}
