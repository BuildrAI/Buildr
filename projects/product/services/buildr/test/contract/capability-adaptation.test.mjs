import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import YAML from 'yaml';

// These tests own the static contract between packaged assets, manifests, and public guidance.
const read = (path) => fs.readFileSync(path, 'utf8');
const packageManifest = YAML.parse(read('resources/manifest.yml'));
const core = read('resources/workspace/rules/buildr/core.md');
const buildrSkill = read('package/targets/runtime/skills/buildr/SKILL.md');
const adaptation = read('resources/workspace/skills/buildr/capability-adaptation/SKILL.md');
const capabilityDocs = read('docs/skill-capability-contracts.md');

test('工作能力适配从自然语言意图进入且不要求用户维护 capability 原语', () => {
  assert.match(buildrSkill, /采用内部流程、调整工作方式、修改或替换 Skill 行为/);
  assert.match(buildrSkill, /先加载 `capability-adaptation` 判断是否触达或产生跨 Skill 稳定依赖边界/);
  assert.match(buildrSkill, /Agent runtime 先根据 Skill description 和用户目标发现入口 Skill/);
  assert.match(buildrSkill, /不是所有用户意图之前的全局 dispatcher/);
  assert.match(adaptation, /用户无需知道这些资产名称/);
  assert.match(adaptation, /判断的是稳定协作边界，不是用户是否说出 capability 名字/);
  assert.match(adaptation, /不要因为 Agent 执行时会同时读取多个 Skills，就把它们建模为方法调用依赖/);
  assert.match(adaptation, /不要要求用户手改 manifest/);
});

test('能力说明区分入口发现、目录、consumer graph、产品入口内部路由和 Agent 执行协作', () => {
  assert.match(capabilityDocs, /interface \+ dependency injection，而不是 Skill-to-Skill 方法调用/);
  assert.match(capabilityDocs, /能力目录/);
  assert.match(capabilityDocs, /Consumer dependency graph/);
  assert.match(capabilityDocs, /Agent Skill 意图发现/);
  assert.match(capabilityDocs, /产品入口内部路由/);
  assert.match(capabilityDocs, /Agent 执行协作/);
  assert.match(capabilityDocs, /只有 manifest `requires` 才形成静态 consumer dependency edge/);
});

test('Git Operations 实例区分 Agent capability 与产品 Task Finish executor', () => {
  assert.match(capabilityDocs, /完整实例：`buildr\.git-operations\/v1`/);
  assert.match(capabilityDocs, /Contract/);
  assert.match(capabilityDocs, /Manifest 注册、provider、consumer 与 binding/);
  assert.match(capabilityDocs, /Resolver 与 readiness/);
  assert.match(capabilityDocs, /Runtime evidence/);
  assert.match(capabilityDocs, /用户替换实现/);
  assert.match(capabilityDocs, /独立已选Git Operation由同一个`git-operations` provider处理/);
  assert.match(capabilityDocs, /它不决定 `task-finish\/v1` 产品执行器是否可运行/);
});

test('capability-adaptation 拥有跨 Skill 影响检查，Core 不复制专项流程', () => {
  assert.match(adaptation, /读取目标 Skill 源、`skills\/manifest\.yml`、相关 contracts、当前 bindings 和 doctor `capabilities` graph/);
  assert.match(adaptation, /列出目标 Skill 提供的 capabilities、直接\/递归 consumers/);
  assert.match(adaptation, /在新 binding ready 之前不卸载旧 provider/);
  assert.doesNotMatch(core, /创建、修改、替换或卸载 Skill 前必须判断跨 Skill 依赖/);
});

test('capability-adaptation 作为 optional 管理 Skill 发布且不声明空洞 capability', () => {
  const packaged = packageManifest.builtins.skills.find((skill) => skill.id === 'capability-adaptation');
  assert.ok(packaged);
  assert.equal(packaged.required, false);
  assert.deepEqual(packaged.provides, undefined);
  assert.deepEqual(packaged.requires, undefined);
  assert.equal(packaged.runtimes.length, 7);
});

test('能力适配先验证候选并保留可恢复的当前实现', () => {
  assert.match(adaptation, /先开发候选，再改变当前实现/);
  assert.match(adaptation, /不得先卸载或覆盖当前有效实现/);
  assert.match(adaptation, /在新 binding ready 之前不卸载旧 provider/);
  assert.match(adaptation, /使用记录的旧 binding 恢复选择/);
  assert.match(adaptation, /验证 Task Finish 后激活/);
  assert.match(adaptation, /binding ready 不能替代这项验证/);
  assert.match(adaptation, /不把产品入口 Buildr Skill 当成全局前置 dispatcher/);
});
