import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '../..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('每日演进 Application 不扫描 Git、不写 Task Record、不暴露路径', () => {
  const application = read('src/workspace/application/project-daily-progress-application.mjs');
  for (const required of ['recordProjectDailyProgress', 'inspectProjectDailyProgress', 'listProjectDailyProgress', 'inspectTaskDailyProgress', 'inspectTaskRecord', 'readProjectRegistryRecord']) {
    assert.ok(application.includes(required), required);
  }
  for (const forbidden of ['node:fs', 'createTaskRecord', 'updateTaskRecord', 'observeProjectGit', 'git log', 'commit author']) {
    assert.equal(application.includes(forbidden), false, forbidden);
  }
});

test('CLI、HTTP 与 Skill 共用 Daily Progress Application 和稳定 JSON identity', () => {
  const workspaceModule = read('src/workspace/module.mjs');
  const cli = read('src/workspace/interfaces/cli/project-daily-progress.mjs');
  const http = read('src/workspace/interfaces/http/workspace-http.mjs');
  const json = read('src/application/json-contracts.mjs');
  const skill = read('resources/workspace/skills/buildr/project-daily-progress/SKILL.md');
  const gitignore = read('resources/workspace/gitignore');
  for (const command of ['project daily-progress record', 'project daily-progress inspect', 'project daily-progress list']) {
    assert.ok(workspaceModule.includes(command), command);
  }
  assert.match(workspaceModule, /surface: 'agent-machine'/);
  for (const method of ['recordProjectDailyProgress', 'inspectProjectDailyProgress', 'listProjectDailyProgress', 'inspectTaskDailyProgress']) {
    assert.ok(cli.includes(method) || http.includes(method), method);
  }
  assert.equal(read('src/bootstrap/legacy-runtime-module.mjs').includes('ProjectDailyProgress'), false);
  assert.equal(read('src/interfaces/local-app/http/server.mjs').includes('inspectProjectDailyProgress'), false);
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
