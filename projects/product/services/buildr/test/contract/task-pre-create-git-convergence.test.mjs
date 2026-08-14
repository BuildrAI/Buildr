import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';

const serviceRoot = path.resolve(import.meta.dirname, '../..');
const read = (relative) => fs.readFileSync(path.join(serviceRoot, relative), 'utf8');
const triage = read('package/targets/workspace/skills/buildr/task-triage/SKILL.md');
const gitOperations = read('package/targets/workspace/skills/buildr/git-operations/SKILL.md');
const gitContract = read('package/targets/workspace/skills/contracts/buildr/git-operations/v1.md');
const taskManager = read('package/targets/workspace/skills/buildr/task-manager/SKILL.md');
const environment = read('package/targets/workspace/skills/buildr/task-environment/SKILL.md');

test('task-triage 在新正式 Task create 前按统一 dev 顺序消费 Git Operations', () => {
  for (const required of [
    '只有即将创建 active Task 或把 todo 激活为 active 时执行本门禁',
    '当前符号分支恰为 `dev`',
    'upstream 恰为 `origin/dev`',
    '先为全部 repositories 逐一选择独立 `fetch` operation',
    '全部 fetch 成功后重新核验',
    '明确选择 `rebase` operation',
    '`rebase --abort`',
    '已经在其他 repository 成功的 fetch/rebase 不反向回滚',
    'Workspace transition check',
    '才调用 selected `buildr.task-record/v2` provider 的 active `create` 或 `activate`',
  ]) assert.ok(triage.includes(required), required);

  assert.match(triage, /不 checkout、不 stash\/autostash、不猜其他 branch\/remote/);
  assert.match(triage, /Task Record Application、Buildr Web 与 Task Environment 不获得任何Git mutation/);
  assert.match(triage, /Git 基线：converged \/ none \/ blocked/);
  assert.match(triage, /todo create.*不执行/);
});

test('Git Operations 明确提供独立 fetch、selected rebase 与可见 abort recovery', () => {
  for (const required of [
    '`fetch`：只更新 consumer 明确提供的 remote/ref',
    '`rebase`：只把 consumer 明确提供的 clean local branch rebase',
    'Fetch 与显式 rebase',
    '未 push 且未共享',
    '`rebase --abort`',
    '标记 recovered',
    '不是静默 reset/回滚',
    '普通 fetch、commit、push 不改变已检出 tree',
  ]) assert.ok(gitOperations.includes(required), required);

  for (const required of [
    '`fetch`、`rebase`、`commit` 与 `push` 保持独立 Result',
    'fetch 不隐含 rebase',
    'rebase 不隐含 push',
    '`rebase --abort`',
    'conflict/recovery',
  ]) assert.ok(gitContract.includes(required), required);
});

test('package manifests 声明 task-triage optional Git Operations dependency', () => {
  const packageManifest = YAML.parse(read('package/manifest.yml'));
  const dependency = { capability: 'buildr.git-operations', version: 1, mode: 'optional' };
  assert.ok(packageManifest.builtins.skills.find((item) => item.id === 'task-triage').requires.some((item) => JSON.stringify(item) === JSON.stringify(dependency)));
});

test('Task Record 与 Environment 继续排除创建前 Git 编排', () => {
  assert.doesNotMatch(taskManager, /git fetch|git rebase|origin\/dev/);
  assert.match(environment, /不要由Environment自动fetch\/rebase/);
  assert.doesNotMatch(environment, /rebase --abort|origin\/dev/);
});
