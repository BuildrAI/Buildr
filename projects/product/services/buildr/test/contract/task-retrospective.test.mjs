import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';

import { parseCapabilityContract } from '../../src/infrastructure/runtime/skills/manifests.mjs';

const root = path.resolve('package/targets/workspace');
const read = (relative) => fs.readFileSync(path.resolve(relative), 'utf8');

test('Task Retrospective contract/provider/binding保持terminal-only与非门禁边界', () => {
  const manifest = YAML.parse(read('package/targets/workspace/skills/manifest.yml'));
  const contract = manifest.contracts.find((item) => item.id === 'buildr.task-retrospective' && item.version === 2);
  assert.ok(contract);
  assert.equal(parseCapabilityContract(path.join(root, 'skills', contract.path), contract).id, 'buildr.task-retrospective');
  assert.deepEqual(manifest.bindings.find((item) => item.capability === 'buildr.task-retrospective'), { capability: 'buildr.task-retrospective', version: 2, provider: 'task-retrospective' });
  const provider = manifest.skills.find((item) => item.id === 'task-retrospective');
  assert.deepEqual(provider.provides, [{ capability: 'buildr.task-retrospective', version: 2 }]);
  assert.ok(provider.requires.some((item) => item.capability === 'buildr.task-record' && item.version === 2 && item.mode === 'required'));
  const development = manifest.skills.find((item) => item.id === 'task-development');
  const finish = manifest.skills.find((item) => item.id === 'task-finish');
  assert.equal(development.requires.some((item) => /retrospective|asset-review/.test(item.capability)), false);
  assert.equal(finish.requires.some((item) => /retrospective|asset-review/.test(item.capability)), false);
  const skill = read('package/targets/workspace/skills/buildr/task-retrospective/SKILL.md');
  const capabilityContract = read('package/targets/workspace/skills/contracts/buildr/task-retrospective/v2.md');
  assert.match(skill, /自由Markdown/);
  assert.match(skill, /数值、来源和覆盖范围/);
  assert.match(skill, /部分可得.*不代表完整 Task/);
  assert.match(skill, /不可得时直接标记缺失/);
  assert.match(skill, /不得为了补齐 Token 数字.*强制估算.*增加任务消耗/);
  assert.match(skill, /task-retrospective-driver\.mjs handle/);
  assert.match(skill, /`handled\|no-action` 必须提供非空完整处理意见/);
  assert.match(skill, /digest冲突，重新inspect/);
  assert.match(skill, /完整原始 `reportMarkdown`/);
  assert.match(skill, /不生成新 action item ID/);
  assert.match(skill, /create --status todo --retrospective-source/);
  assert.match(skill, /`handled`.*所有有效方向均已有承接 Task/);
  assert.match(skill, /用户只说“处理”“检查”“查看”或“分析”复盘时，只授权只读阶段/);
  assert.match(skill, /不得调用 Task Record `create\|update` 或 Task Retrospective `handle`/);
  assert.match(skill, /完整动作本身就是本次精确 mutation 的明确授权，不再机械要求第二次确认/);
  assert.match(skill, /任一事实或 effect 发生实质变化时旧授权失效/);
  assert.match(skill, /保持 current disposition.*重新展示变化后的完整方案并取得新授权/);
  assert.match(capabilityContract, /宽泛请求只授权只读阶段/);
  assert.match(capabilityContract, /不得调用 Task Record create\/update 或 Task Retrospective handle/);
  assert.match(capabilityContract, /完整动作本身已构成授权时不得要求重复确认/);
  assert.match(capabilityContract, /current digest、拟 disposition、理由、目标 Task 或关系 effects 发生实质变化时，旧授权失效/);
  assert.match(capabilityContract, /保持 current disposition，不用旧授权继续写入/);
  assert.match(skill, /不参与Task完成、Development handoff、Finish、cleanup或OpenSpec门禁/);
});

test('active package不再发布Task Asset Review', () => {
  const productManifest = read('package/manifest.yml');
  const workspaceManifest = read('package/targets/workspace/skills/manifest.yml');
  for (const content of [productManifest, workspaceManifest]) {
    const parsed = YAML.parse(content);
    const skills = parsed.builtins?.skills || parsed.skills || [];
    const contracts = parsed.capabilityContracts || parsed.contracts || [];
    const bindings = parsed.initialSkillBindings || parsed.bindings || [];
    assert.equal(skills.some((item) => item.id === 'task-asset-review'), false);
    assert.equal(contracts.some((item) => item.id === 'buildr.task-asset-review'), false);
    assert.equal(bindings.some((item) => item.capability === 'buildr.task-asset-review'), false);
    assert.equal(skills.some((item) => (item.requires || []).some((dependency) => dependency.capability === 'buildr.task-asset-review')), false);
  }
  const oldSkill = path.resolve('package/targets/workspace/skills/buildr/task-asset-review');
  const oldContracts = path.resolve('package/targets/workspace/skills/contracts/buildr/task-asset-review');
  assert.equal(fs.existsSync(oldSkill) && fs.readdirSync(oldSkill, { recursive: true }).some((entry) => fs.statSync(path.join(oldSkill, entry)).isFile()), false);
  assert.equal(fs.existsSync(oldContracts) && fs.readdirSync(oldContracts, { recursive: true }).some((entry) => fs.statSync(path.join(oldContracts, entry)).isFile()), false);
});

test('Task Retrospective Application是唯一repository writer caller', () => {
  const sourceRoot = path.resolve('src');
  const callers = [];
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (file.endsWith('static-validation.mjs')) continue;
      else if (/\.(?:mjs|js)$/.test(entry.name) && /\.writeTaskRetrospective(?:Result|Disposition)Persistence\(/.test(fs.readFileSync(file, 'utf8'))) callers.push(path.relative(sourceRoot, file).split(path.sep).join('/'));
    }
  };
  visit(sourceRoot);
  assert.deepEqual(callers, ['application/task-retrospective/task-retrospective-application.mjs']);
});
