import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '../..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('Task Planning Identity runtime保持独立只读入口且由compose注册', () => {
  const domain = read('src/domain/task-planning-identity/task-planning-identity.mjs');
  const application = read('src/application/task-planning-identity/task-planning-identity-application.mjs');
  const driver = read('src/interfaces/internal/task-planning-identity-driver.mjs');
  const compose = read('src/application/compose-runtime.mjs');
  const cli = read('bin/buildr.mjs');
  assert.match(domain, /buildr\.task-planning-identity-result\/v1/);
  assert.match(domain, /checklist-completion/);
  assert.match(application, /resolveTaskScopedChange[\s\S]*includeContent: true/);
  assert.match(application, /effects: \[\]/);
  assert.match(driver, /inspect --task <task-id> --target <canonical-workspace>/);
  assert.match(compose, /registerTaskPlanningIdentityApplication/);
  assert.doesNotMatch(cli, /task-planning-identity/);
});

test('全部OpenSpec consumer消费resolver且拒绝手工target摘要', () => {
  const consumers = [
    'package/targets/workspace/skills/buildr/task-development/SKILL.md',
    'package/targets/workspace/skills/buildr/task-review/SKILL.md',
    'package/targets/workspace/skills/buildr/openspec-contract-guard/SKILL.md',
    'package/targets/workspace/components/buildr/openspec/contributions/openspec-propose-sidebar.md',
    'package/targets/workspace/components/buildr/openspec/contributions/openspec-update-sidebar.md',
    'package/targets/workspace/components/buildr/openspec/contributions/openspec-apply-sidebar.md',
  ];
  for (const relative of consumers) {
    const content = read(relative);
    assert.match(content, /task-planning-identity-driver\.mjs inspect/);
    assert.match(content, /blocked/);
    assert.doesNotMatch(content, /(?:shasum|sha256sum) proposal\.md/);
  }
  for (const relative of [
    'package/targets/workspace/components/buildr/openspec/contributions/openspec-sync-converge.md',
    'package/targets/workspace/components/buildr/openspec/contributions/openspec-archive-converge.md',
  ]) {
    assert.match(read(relative), /重新调用Task Planning Identity resolver/);
  }
});
