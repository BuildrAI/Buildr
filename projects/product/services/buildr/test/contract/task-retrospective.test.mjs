import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';

import { parseCapabilityContract } from '../../src/agent-assets/infrastructure/runtime/skills/manifests.mjs';

const read = (relative) => fs.readFileSync(path.resolve(relative), 'utf8');

test('Task Retrospective contract/provider/binding保持terminal-only与非门禁边界', () => {
  const manifest = YAML.parse(read('resources/manifest.yml'));
  const contract = manifest.capabilityContracts.find((item) => item.id === 'buildr.task-retrospective' && item.version === 2);
  assert.ok(contract);
  assert.equal(parseCapabilityContract(path.resolve(contract.path), contract).id, 'buildr.task-retrospective');
  assert.deepEqual(manifest.initialSkillBindings.find((item) => item.capability === 'buildr.task-retrospective'), { capability: 'buildr.task-retrospective', version: 2, provider: 'task-retrospective' });
  const provider = manifest.builtins.skills.find((item) => item.id === 'task-retrospective');
  assert.deepEqual(provider.provides, [{ capability: 'buildr.task-retrospective', version: 2 }]);
  assert.ok(provider.requires.some((item) => item.capability === 'buildr.task-record' && item.version === 2 && item.mode === 'required'));
  const finish = manifest.builtins.skills.find((item) => item.id === 'task-finish');
  assert.equal(manifest.builtins.skills.some((item) => item.id === 'task-development'), false);
  assert.equal(finish.requires.some((item) => /retrospective|asset-review/.test(item.capability)), false);
  const skill = read('resources/workspace/skills/buildr/task-retrospective/SKILL.md');
  const capabilityContract = read('resources/workspace/skills/contracts/buildr/task-retrospective/v2.md');
  assert.match(skill, /自由Markdown/);
  assert.match(skill, /数值、来源和覆盖范围/);
  assert.match(skill, /部分可得.*不代表完整 Task/);
  assert.match(skill, /不可得时直接标记缺失/);
  assert.match(skill, /不得为了补齐 Token 数字.*强制估算.*增加任务消耗/);
  assert.match(skill, /__internal task-retrospective handle/);
  assert.match(skill, /__internal task-retrospective list/);
  assert.match(skill, /默认.*pending.*摘要/);
  assert.match(skill, /--include-report/);
  assert.match(skill, /--max-bytes <1\.\.1048576>/);
  assert.match(skill, /262144 UTF-8字节预算/);
  assert.match(skill, /`handled\|no-action` 必须提供非空完整处理意见/);
  assert.match(skill, /digest冲突，重新inspect/);
  assert.match(skill, /完整原始 `reportMarkdown`/);
  assert.match(skill, /有界执行事实图/);
  assert.match(skill, /Task Record时点与终态.*Review、Verification与Environment摘要/);
  assert.match(skill, /已有复盘是本次重新思考的证据之一，不是必须保留的结论/);
  assert.match(skill, /每次生成或重做复盘都主动判断是否存在确定性流程候选/);
  assert.match(skill, /closed输入、唯一Owner、明确停止条件、可验证结果与幂等\/有界恢复/);
  assert.match(skill, /Buildr应该约束Agent不要做错事，而不是要求Agent必须通过Buildr才能做事/);
  assert.match(skill, /普通动作必须经过Buildr.*唯一合法路径.*通用许可层\/生命周期gate/);
  assert.match(skill, /Rule.*Skill.*Application\/CLI workflow.*checker\/test/);
  assert.match(skill, /按实际目标、closed边界和当前实现聚类、合并或丢弃，不按关键词自动聚类/);
  assert.match(skill, /一人或多人明确接受/);
  assert.match(skill, /不建立reviewer、票数或approval状态/);
  assert.match(skill, /候选只授权创建或关联承接Task，不授权直接修改/);
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
  assert.match(capabilityContract, /有界批量只读/);
  assert.match(capabilityContract, /不得自动分析、评分或处置/);
  assert.match(capabilityContract, /主动探索确定性流程候选/);
  assert.match(capabilityContract, /closed输入、Owner、停止条件、结果证据、可恢复性、预期收益/);
  assert.match(capabilityContract, /不得把推荐路径变成唯一合法路径、通用许可层或lifecycle gate/);
  assert.match(capabilityContract, /有界摘要收窄对象.*必要来源逐项inspect/);
  assert.match(capabilityContract, /不建立approval状态/);
  assert.match(capabilityContract, /候选确认只授权承接Task effects，不授权直接修改其建议落点/);
  assert.match(capabilityContract, /不得强制固定候选列表或评分/);
  assert.match(skill, /不参与Task完成、交付、cleanup或OpenSpec门禁/);
});

test('active package不再发布Task Asset Review', () => {
  const productManifest = read('resources/manifest.yml');
  for (const content of [productManifest]) {
    const parsed = YAML.parse(content);
    const skills = parsed.builtins?.skills || parsed.skills || [];
    const contracts = parsed.capabilityContracts || parsed.contracts || [];
    const bindings = parsed.initialSkillBindings || parsed.bindings || [];
    assert.equal(skills.some((item) => item.id === 'task-asset-review'), false);
    assert.equal(contracts.some((item) => item.id === 'buildr.task-asset-review'), false);
    assert.equal(bindings.some((item) => item.capability === 'buildr.task-asset-review'), false);
    assert.equal(skills.some((item) => (item.requires || []).some((dependency) => dependency.capability === 'buildr.task-asset-review')), false);
  }
  const oldSkill = path.resolve('resources/workspace/skills/buildr/task-asset-review');
  const oldContracts = path.resolve('resources/workspace/skills/contracts/buildr/task-asset-review');
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
  assert.deepEqual(callers, ['task/application/task-retrospective-application.mjs']);
});
