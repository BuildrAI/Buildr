import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const productRoot: any = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read: any = (relative: any) => fs.readFileSync(path.join(productRoot, relative), 'utf8');

const projectTestingSkill: any = read('resources/workspace/skills/buildr/project-testing/SKILL.md');
const testingModel: any = read('resources/workspace/skills/buildr/project-testing/references/testing-model-v1.md');
const taskVerificationSkill: any = read('resources/workspace/skills/buildr/task-verification/SKILL.md');
const taskVerificationReference: any = read('resources/workspace/skills/buildr/task-verification/references/project-verification-v4.md');
const taskVerificationTemplate: any = YAML.parse(read('resources/workspace/skills/buildr/task-verification/templates/project-verification.yml'));
const taskTriage: any = read('resources/workspace/skills/buildr/task-triage/SKILL.md');
const buildrSkill: any = read('package/targets/runtime/skills/buildr/SKILL.md');
const packageManifest: any = YAML.parse(read('resources/manifest.yml'));

test('project-testing 是无状态且无 capability binding 的独立 Skill', () => {
  for (const required of [
    'references/testing-model-v1.md', '没有 Result、Receipt、Application、provider contract',
    '不写 `verification.yml`', '交给 `task-verification`',
  ]) assert.ok(projectTestingSkill.includes(required), `project-testing Skill must include ${required}`);

  const packagedSkill: any = packageManifest.builtins.skills.find((item: any) => item.id === 'project-testing');
  assert.ok(packagedSkill);
  assert.equal(packagedSkill.required, false);
  assert.equal(Object.hasOwn(packagedSkill, 'provides'), false);
  assert.equal(Object.hasOwn(packagedSkill, 'requires'), false);
  assert.equal(packageManifest.capabilityContracts.some((item: any) => item.id.includes('project-testing')), false);
  assert.equal(packageManifest.initialSkillBindings.some((item: any) => item.capability.includes('project-testing')), false);
  assert.equal(packagedSkill.required, false);
  assert.equal(Object.hasOwn(packagedSkill, 'provides'), false);
  assert.equal(Object.hasOwn(packagedSkill, 'requires'), false);
  assert.equal(packageManifest.capabilityContracts.some((item: any) => item.id.includes('project-testing')), false);
  assert.ok(packageManifest.workspaceFiles.some((entry: any) => String(entry).includes('project-testing/references/testing-model-v1.md')));
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
    'ownerScope', 'targetDuration', 'discovery/proves/evidence/usableFor',
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
    '项目现有changed-plan理由', '成本最低的既有canary',
    '按最低充分原则扩大focused regression', '开发完成后的任务验证报告',
  ]) assert.ok(projectTestingSkill.includes(required), `project-testing Skill must include ${required}`);
  assert.match(projectTestingSkill, /不能把临时canary结果冒充开发完成后的任务验证报告/);
  assert.doesNotMatch(projectTestingSkill, /固定.*分钟|自动.*Task Verification|跳过.*Task Verification/);
});

test('测试建设与 Task Verification 路由保持分离', () => {
  assert.match(taskTriage, /测试框架.*`project-testing`/s);
  assert.match(taskTriage, /selected `buildr\.task-verification\/v4` provider/);
  assert.match(buildrSkill, /开发测试 \| `project-testing` Skill；无 Result、Receipt 或 provider contract/);
  assert.match(buildrSkill, /Project测试地图.*`buildr\.task-verification\/v4` selected provider/);
  assert.match(taskVerificationSkill, /不在本技能中生成框架或测试/);
  assert.match(taskVerificationReference, /不列举每个测试文件/);
});

test('Buildr Product Workspace smoke 使用唯一隔离入口且不推断删除普通临时 Workspace', () => {
  assert.match(buildrSkill, /必须经过 `tools\/development\/run-isolated-workspace-smoke\.ts`/);
  assert.match(buildrSkill, /运行 `npm run smoke:workspace`/);
  assert.match(buildrSkill, /独立设置 Workspace、`BUILDR_APP_DATA_DIR` 与 `BUILDR_PRODUCT_DATA_DIR`/);
  assert.match(buildrSkill, /成功或失败后统一清理/);
  assert.match(buildrSkill, /不得用裸 `mktemp` 启动指向默认用户 profile 的 `buildr web`/);
  assert.match(buildrSkill, /不扩大为对普通临时 Workspace 的自动删除策略/);
});

test('声明指导只使用 project verification v4 testing map', () => {
  assert.equal(taskVerificationTemplate.schemaVersion, 'buildr.project-verification/v4');
  assert.deepEqual(Object.keys(taskVerificationTemplate).sort(), ['schemaVersion', 'testing']);
  const testingKeys: any = Object.keys(taskVerificationTemplate.testing[0]).sort();
  for (const required of ['id', 'scope', 'purpose', 'sourcePaths', 'testRoots', 'full', 'requirements']) assert.equal(testingKeys.includes(required), true, required);
  assert.match(taskVerificationReference, /不是测试文件清单、执行计划或运行结果/);
});
