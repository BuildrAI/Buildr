import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const productRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relative) => fs.readFileSync(path.join(productRoot, relative), 'utf8');

const projectTestingSkill = read('resources/workspace/skills/buildr/project-testing/SKILL.md');
const testingModel = read('resources/workspace/skills/buildr/project-testing/references/testing-model-v1.md');
const taskVerificationSkill = read('resources/workspace/skills/buildr/task-verification/SKILL.md');
const taskVerificationReference = read('resources/workspace/skills/buildr/task-verification/references/project-verification-v2.md');
const taskVerificationTemplate = YAML.parse(read('resources/workspace/skills/buildr/task-verification/templates/project-verification.yml'));
const taskTriage = read('resources/workspace/skills/buildr/task-triage/SKILL.md');
const buildrSkill = read('package/targets/runtime/skills/buildr/SKILL.md');
const packageManifest = YAML.parse(read('resources/manifest.yml'));

test('project-testing 是无状态且无 capability binding 的独立 Skill', () => {
  for (const required of [
    'references/testing-model-v1.md', '没有 Result、Receipt、Application、provider contract',
    '不写 `verification.yml`', '交给 `task-verification`',
  ]) assert.ok(projectTestingSkill.includes(required), `project-testing Skill must include ${required}`);

  const packagedSkill = packageManifest.builtins.skills.find((item) => item.id === 'project-testing');
  assert.ok(packagedSkill);
  assert.equal(packagedSkill.required, false);
  assert.equal(Object.hasOwn(packagedSkill, 'provides'), false);
  assert.equal(Object.hasOwn(packagedSkill, 'requires'), false);
  assert.equal(packageManifest.capabilityContracts.some((item) => item.id.includes('project-testing')), false);
  assert.equal(packageManifest.initialSkillBindings.some((item) => item.capability.includes('project-testing')), false);
  assert.equal(packagedSkill.required, false);
  assert.equal(Object.hasOwn(packagedSkill, 'provides'), false);
  assert.equal(Object.hasOwn(packagedSkill, 'requires'), false);
  assert.equal(packageManifest.capabilityContracts.some((item) => item.id.includes('project-testing')), false);
  assert.ok(packageManifest.workspaceFiles.some((entry) => String(entry).includes('project-testing/references/testing-model-v1.md')));
});

test('project-testing 分离测试边界、成本、范围与验证目标', () => {
  for (const required of [
    'Development、Acceptance、Static Conformance、Delivery / Release',
    'Static、Unit、Component、Integration、System',
    'Quick', 'affected', 'full', 'Candidate', 'Release',
    '成本约束', '选择范围', '验证目标',
    '`System` 不等于 Acceptance', '`focus` 只用于失败诊断',
    'primaryEvidenceOwner', '最低充分边界',
  ]) assert.ok(projectTestingSkill.includes(required), `project-testing Skill must include ${required}`);

  assert.equal(projectTestingSkill.includes('编排场景：Quick、Task-affected、Candidate、Release'), false);

  for (const required of [
    'Node.js 示例', 'Java / Spring 示例', 'Spring context', 'Testcontainers',
    'Browser / Playwright 只是执行手段', '`mixed` 只作为',
    'ownerScope', 'targetDuration', 'applicability/proves',
  ]) assert.ok(testingModel.includes(required), `testing model must include ${required}`);
});

test('project-testing 指导 Agent 建立可证伪的最小测试质量闭环', () => {
  for (const required of [
    '公共行为', '正常、失败、边界和必要状态转换案例',
    '目标错误存在时失败', '不复制被测算法后验证自身',
    '必要幂等、失败后清理和重复运行', '替代证据并报告 gap',
  ]) assert.ok(projectTestingSkill.includes(required), `project-testing Skill must include ${required}`);

  for (const required of [
    '测试质量闭环', '公共可观察结果', '最小关键案例',
    '反例证据或明确 gap', 'Bug 修复', '有状态行为',
  ]) assert.ok(testingModel.includes(required), `testing model must include ${required}`);

  assert.match(projectTestingSkill, /mock、fake 或内存实现只隔离外部协作者/);
  assert.match(testingModel, /不要 mock 幂等判断后只验证数据库方法被调用/);
});

test('共享helper改动先检查调用面并运行最低成本兼容canary', () => {
  for (const required of [
    '多个action、状态或公共入口复用的validation/helper',
    '枚举真实调用面', '既有错误类型、诊断顺序与公共结果',
    '`plan-only`/`dry-run` changed-plan reasons', '成本最低的既有canary',
    '按最低充分原则扩大focused regression', '最终affected Formal Verification',
  ]) assert.ok(projectTestingSkill.includes(required), `project-testing Skill must include ${required}`);
  assert.match(projectTestingSkill, /不能把plan preview或canary结果冒充Task Verification Result/);
  assert.doesNotMatch(projectTestingSkill, /固定.*分钟|自动.*Formal Verification|跳过.*Formal Verification/);
});

test('测试建设与 Task Verification 路由保持分离', () => {
  assert.match(taskTriage, /测试框架.*`project-testing`/s);
  assert.match(taskTriage, /selected `buildr\.task-verification\/v3` provider/);
  assert.match(buildrSkill, /开发测试 \| `project-testing` Skill；无 Result、Receipt 或 provider contract/);
  assert.match(buildrSkill, /运行已有测试.*`buildr\.task-verification\/v3` selected provider；不开发测试/);
  assert.match(taskVerificationSkill, /不用于设计测试框架[、或]开发测试[\s\S]*project-testing/);
  assert.match(taskVerificationSkill, /入口命名、成本或分层不合理时报告测试建设 gap/);
  assert.match(taskVerificationReference, /一个 Project 入口内部可以拥有多个 Project-specific step/);
});

test('声明指导不扩展 project verification v2 schema', () => {
  assert.equal(taskVerificationTemplate.schemaVersion, 'buildr.project-verification/v2');
  assert.deepEqual(Object.keys(taskVerificationTemplate).sort(), ['capabilities', 'schemaVersion']);
  const capabilityKeys = Object.keys(taskVerificationTemplate.capabilities[0]).sort();
  for (const forbidden of ['primaryIntent', 'executionBoundary', 'orchestrationScenarios', 'targetDuration', 'primaryEvidenceOwner']) {
    assert.equal(capabilityKeys.includes(forbidden), false, `verification template must not add ${forbidden}`);
  }
  assert.match(taskVerificationReference, /不要把每个测试文件、step、测试意图、执行边界、Quick 成本约束、affected\/full 范围、Candidate\/Release 验证目标或目标耗时复制进本 schema/);
});
