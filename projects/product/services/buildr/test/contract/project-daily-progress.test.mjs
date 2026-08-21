import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '../..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('每日演进 Application 不扫描 Git、不写 Task Record、不暴露路径', () => {
  const application = read('src/application/project-daily-progress/project-daily-progress-application.mjs');
  for (const required of ['recordProjectDailyProgress', 'inspectProjectDailyProgress', 'listProjectDailyProgress', 'inspectTaskDailyProgress', 'inspectTaskRecord', 'readProjectRegistryRecord']) {
    assert.ok(application.includes(required), required);
  }
  for (const forbidden of ['node:fs', 'createTaskRecord', 'updateTaskRecord', 'observeProjectGit', 'git log', 'commit author']) {
    assert.equal(application.includes(forbidden), false, forbidden);
  }
});

test('CLI、HTTP 与 Skill 共用 Daily Progress Application 和稳定 JSON identity', () => {
  const registry = read('src/bootstrap/cli/registry.mjs');
  const cli = read('src/interfaces/cli/project-daily-progress.mjs');
  const server = read('src/interfaces/local-app/http/server.mjs');
  const json = read('src/application/json-contracts.mjs');
  const skill = read('package/targets/workspace/skills/buildr/project-daily-progress/SKILL.md');
  const gitignore = read('package/targets/workspace/gitignore');
  for (const command of ['project daily-progress record', 'project daily-progress inspect', 'project daily-progress list']) {
    assert.ok(registry.includes(command), command);
  }
  assert.match(registry, /surface: "agent-machine"/);
  for (const method of ['recordProjectDailyProgress', 'inspectProjectDailyProgress', 'listProjectDailyProgress', 'inspectTaskDailyProgress']) {
    assert.ok(cli.includes(method) || server.includes(method), method);
  }
  for (const schema of [
    'buildr.project-daily-progress-record-result/v1',
    'buildr.project-daily-progress-inspect-result/v1',
    'buildr.project-daily-progress-list-result/v1',
    'buildr.project-daily-progress-task-view/v1',
  ]) assert.ok(json.includes(schema), schema);
  assert.ok(gitignore.includes('/.buildr/daily-progress/'));
  assert.equal(gitignore.includes('/.buildr/\n'), false);
  for (const phrase of ['更新 workspace', 'buildr sync <agent>', '不要调用 record', 'Agent 宿主', '不要手写 YAML', '不要写入 Task SQLite', 'git config user.email']) {
    assert.ok(skill.includes(phrase), phrase);
  }
});
