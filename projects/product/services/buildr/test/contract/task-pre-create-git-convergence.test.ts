import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';

const serviceRoot: any = path.resolve(import.meta.dirname, '../..');
const read: any = (relative: any) => fs.readFileSync(path.join(serviceRoot, relative), 'utf8');
const triage: any = read('resources/workspace/skills/buildr/task-triage/SKILL.md')
  + read('resources/workspace/skills/buildr/task-triage/references/structured-handoff.md')
  + read('resources/workspace/skills/buildr/task-triage/references/task-create-git-baseline.md');
const gitOperations: any = read('resources/workspace/skills/buildr/git-operations/SKILL.md');
const gitContract: any = read('resources/workspace/skills/contracts/buildr/git-operations/v1.md');
const taskManager: any = read('resources/workspace/skills/buildr/task-manager/SKILL.md');
const worktree: any = read('resources/workspace/skills/buildr/task-worktree/SKILL.md');

test('task-triage 将登记与按需代码更新分开', () => {
  assert.match(triage, /登记不要求 Git 更新/);
  assert.match(triage, /不为登记执行 fetch、rebase 或工作空间同步/);
  assert.match(triage, /仅当用户目标确实要求更新代码时/);
  assert.doesNotMatch(triage, /先为全部repositories逐一选择独立`fetch`|才调用selected.*active `create`|Git 基线：converged/);
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
    '`fetch`、`rebase`、`commit`与`push`保持独立Result',
    'fetch 不隐含 rebase',
    'rebase 不隐含 push',
    '`rebase --abort`',
    'conflict/recovery',
  ]) assert.ok(gitContract.includes(required), required);
});

test('package manifests 声明 task-triage optional Git Operations dependency', () => {
  const packageManifest: any = YAML.parse(read('resources/manifest.yml'));
  const dependency: any = { capability: 'buildr.git-operations', version: 1, mode: 'optional' };
  assert.ok(packageManifest.builtins.skills.find((item: any) => item.id === 'task-triage').requires.some((item: any) => JSON.stringify(item) === JSON.stringify(dependency)));
});

test('Task Record与Worktree继续排除创建前Git编排', () => {
  assert.doesNotMatch(taskManager, /git fetch|git rebase|origin\/dev/);
  assert.doesNotMatch(worktree, /git fetch|git rebase|rebase --abort|origin\/dev/);
});
