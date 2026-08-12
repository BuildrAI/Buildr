import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';

const SERVICE_ROOT = path.resolve(import.meta.dirname, '../..');
const PRODUCT_ROOT = path.resolve(SERVICE_ROOT, '../..');
const read = (relative) => fs.readFileSync(path.join(SERVICE_ROOT, relative), 'utf8');
const readProduct = (relative) => fs.readFileSync(path.join(PRODUCT_ROOT, relative), 'utf8');
const packageManifest = YAML.parse(read('package/manifest.yml'));
const workspaceManifest = YAML.parse(read('package/targets/workspace/skills/manifest.yml'));
const runtimeBuildr = read('package/targets/runtime/skills/buildr/SKILL.md');
const finishSkill = read('package/targets/workspace/skills/buildr/task-finish/SKILL.md');
const gitSkill = read('package/targets/workspace/skills/buildr/git-operations/SKILL.md');
const directSpec = readProduct('openspec/specs/direct-git-closeout/spec.md');
const workflowDelta = readProduct('openspec/specs/agent-task-workflows/spec.md');

test('“收尾”路由区分 Formal Task Finish 与无 Task 直接 Git 交付', () => {
  const packagedFinish = packageManifest.builtins.skills.find((item) => item.id === 'task-finish');
  const workspaceFinish = workspaceManifest.skills.find((item) => item.id === 'task-finish');
  const packagedGit = packageManifest.builtins.skills.find((item) => item.id === 'git-operations');
  const workspaceGit = workspaceManifest.skills.find((item) => item.id === 'git-operations');

  assert.equal(workspaceFinish.description, packagedFinish.description);
  assert.equal(workspaceGit.description, packagedGit.description);
  assert.match(workspaceFinish.description, /active formal Task/);
  assert.match(workspaceGit.description, /没有 active Task.*“收尾”/);
  assert.match(runtimeBuildr, /没有 active Task.*“收尾”/);
  assert.match(runtimeBuildr, /fetch → 必要时精确 commit → rebase → push/);
  assert.match(runtimeBuildr, /不创建 Task、Environment、Verification、Candidate、Finish Result/);
});

test('直接 Git 收尾保留 operation、冲突和生命周期边界', () => {
  for (const required of [
    '无 active Task 的直接 Git 收尾是产品入口选择的复合意图',
    '必要时先精确 commit dirty scope',
    'rebase 冲突',
    '已共享历史',
    '不创建或修改任何 Task lifecycle evidence',
  ]) assert.ok(gitSkill.includes(required), required);

  for (const required of [
    '历史 Task 不能被错误复用',
    '工作树含无法分离的无关内容',
    'rebase 目标不唯一',
    'rebase 将改写共享历史',
    '不得伪造正式生命周期证据',
  ]) assert.ok(directSpec.includes(required), required);

  assert.match(workflowDelta, /Agent 在无 active Task 时需要直接收尾/);
  assert.match(finishSkill, /没有 active Task 时用户说“收尾”/);
  assert.match(finishSkill, /不得创建临时 Task/);
});
