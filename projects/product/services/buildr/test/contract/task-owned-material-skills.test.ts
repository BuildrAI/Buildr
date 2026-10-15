import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';
import { assetIntegrity } from '../../src/modules/agent-assets/infrastructure/component-source.ts';
import { parseCapabilityContract } from '../../src/modules/agent-assets/persistence/skill-manifest.ts';
import { validateTaskRecordSkillCommands } from '../../tools/verification/package-check/static-validation.ts';

const workspace = path.resolve(import.meta.dirname, '../../resources/workspace');
const read = (relative: string): string => fs.readFileSync(path.join(workspace, relative), 'utf8');
const skill = (id: string): string => read(`skills/buildr/${id}/SKILL.md`);
const fragment = (name: string): string => read(`components/buildr/openspec/contributions/${name}.md`);

test('task-manager 保持记录命令兼容，形成记录正文并保护过程材料与显式导入', () => {
  const manager = skill('task-manager');
  assert.deepEqual(validateTaskRecordSkillCommands(manager), []);
  assert.match(manager, /buildr\.task-record\/v4/);
  assert.match(manager, /每个新正式 `active` 任务（包括 `todo` 激活）先完成登记/);
  assert.match(manager, /正文至少说明问题或需求、目标、必要范围与非目标、完成依据/);
  assert.match(manager, /简单任务可用一个短段落/);
  assert.match(manager, /任务记录（Task Record）的 `brief` 字段保存真实任务说明/);
  assert.match(manager, /所有任务类型共用这一正文，不要求 OpenSpec/);
  assert.match(manager, /不生成或维护额外 `brief\.md`/);
  assert.match(manager, /buildr\.task-materials\/v2/);
  assert.match(manager, /solution\|implementation\|delivery/);
  assert.match(manager, /清单不保存正文、物理工作树路径、任务状态或专业检查适用性/);
  assert.match(manager, /buildr task materials inspect <id>/);
  assert.match(manager, /materials record <id> --materials <json-file> --expected-current/);
  assert.match(manager, /materials write <id> --path <task-relative-md> --content <content-file> --expected-document/);
  assert.match(manager, /task update --brief-file <utf8-file> --expected-record <recordDigest>/);
  assert.match(manager, /buildr task brief migrate <id> --expected-record <recordDigest> --expected-materials <materialsDigest> --expected-document <documentDigest>/);
  assert.match(manager, /普通材料更新内部保留该旧关联/);
  assert.match(manager, /明确迁移请求仅释放退休关联并保留当前正文/);
  assert.match(manager, /冲突后重新判断，不静默重放旧输入/);
  assert.match(manager, /材料更新不重写任务状态、记录正文或专业历史/);
  assert.doesNotMatch(manager, /验收条件交给关联变更|无关联变更时 intent 如实概括|brief\|solution\|implementation\|delivery/);
});

test('triage 不从规范路径推导材料深度或三类检查', () => {
  const triage = skill('task-triage');
  const handoff = read('skills/buildr/task-triage/references/structured-handoff.md');
  for (const label of ['材料深度', '方案审查', '实现审查', '任务验证']) {
    assert.ok(triage.includes(label));
    assert.ok(handoff.includes(label));
  }
  assert.match(triage, /不机械按 `change-flow` 默认两次审查/);
  assert.match(triage, /不因 `code-only`、`spec-maintenance`、无 Change 或无方案跳过需要的检查/);
  assert.match(triage, /目标所需检查或风险尚未解决不得报整体完成/);
  assert.doesNotMatch(triage, /`change-flow` 任务默认在规划材料齐备后做一次/);
});

test('review 两类独立，verification 保留真实 checks 与 gaps，不生成未完成占位', () => {
  const review = skill('task-review');
  assert.match(review, /`planning` 审方案选择/);
  assert.match(review, /`completion` 审实现兑现/);
  assert.match(review, /没有正式方案或未执行 `planning` 也可独立执行/);
  assert.match(review, /需要但未完成、材料缺失、未执行、确实不适用、发现问题与已接受分别如实说明/);
  assert.match(review, /专业应用只保存已形成的真实结论/);
  assert.match(review, /accepted\|changes-requested/);
  assert.doesNotMatch(review, /触发时机跟随已作出的治理路径/);
  const verification = skill('task-verification');
  assert.match(verification, /目标、必要范围、风险和完成依据/);
  assert.match(verification, /`checks` 只记录实际已执行检查的 `passed\|failed`/);
  assert.match(verification, /保留在 `gaps` 中并说明真实原因，不新增检查枚举/);
  assert.match(verification, /需要但未完成、没有报告、未执行或材料缺失不能写成不适用或已通过/);
});

test('finish 分别核对记录正文、材料交付引用与实际刷新，并在 active 保存真实专业证据', () => {
  const finish = skill('task-finish');
  assert.match(finish, /任务记录（Task Record）的当前 `brief`/);
  assert.match(finish, /分别核对说明保存、项目成果交付、其他材料引用与用户实际节点可读性/);
  assert.match(finish, /实际从任务列表打开详情并刷新/);
  assert.match(finish, /确认说明节点读取记录中的当前正文/);
  assert.match(finish, /链接可打开、代码已推送或任务已完成均不能代替这个观察/);
  assert.match(finish, /无法核对时如实报告未覆盖/);
  assert.match(finish, /任务仍为 `active` 时保存/);
  assert.match(finish, /不移动或删除记录正文/);
  assert.match(finish, /task brief migrate/);
});

test('current-knowledge v4 退役变更说明，不接管任务正文与所有过程报告', () => {
  const knowledge = skill('current-knowledge-maintenance');
  const collaboration = read('skills/buildr/current-knowledge-maintenance/references/change-collaboration.md');
  assert.match(knowledge, /buildr\.current-knowledge-maintenance\/v4/);
  assert.match(knowledge, /不再创建、刷新或要求 Buildr 增强的 `brief\.md`/);
  assert.match(knowledge, /独立任务说明（Task Brief）的形成、保存与接续由 `task-manager` 通过任务记录（Task Record）的 `brief` 字段负责/);
  assert.match(knowledge, /专业审查、验证报告不默认收纳到 `knowledge\/`/);
  assert.match(collaboration, /`assess\|reconcile\|inspect\|maintain` 均不创建、刷新或要求 Buildr 增强的 `brief\.md`/);
  assert.match(collaboration, /历史文件及已有链接保持普通阅读语义/);
  assert.match(collaboration, /@task\/<task-id>/);
  assert.doesNotMatch(collaboration, /作为任务需求或说明|没有补充内容时可以为空/);
  const contract = read('skills/contracts/buildr/current-knowledge-maintenance/v4.md');
  assert.match(contract, /`assess` 识别真实影响并将授权维护工作纳入执行清单/);
  assert.doesNotMatch(contract, /`assess` 识别真实影响并维护已授权变更说明/);
  assert.equal(assetIntegrity(path.join(workspace, 'skills/contracts/buildr/current-knowledge-maintenance/v3.md')), 'sha256-8449c6486d0db88f78d775d6e367a278b726376b84d896cbd77c568e9940b64b', '旧 v3 协作保证必须原样保留');
  for (const [id, version] of [['task-record', 4], ['task-review', 2], ['task-verification', 4], ['current-knowledge-maintenance', 4]] as const) {
    const parsed = parseCapabilityContract(path.join(workspace, `skills/contracts/buildr/${id}/v${version}.md`));
    assert.equal(parsed.id, `buildr.${id}`);
    assert.equal(parsed.version, version);
  }
});

test('Buildr-owned OpenSpec 增强指向唯一正文，归档保留正文且不默认两次审查', () => {
  for (const name of ['openspec-propose-sidebar', 'openspec-update-sidebar', 'openspec-apply-sidebar']) {
    const text = fragment(name);
    assert.match(text, /唯一任务说明（Task Brief）/);
    assert.match(text, /@task\/<task-id>/);
    assert.match(text, /多任务可共享同一 Change/);
    assert.match(text, /普通相对链接|旧文件链接/);
    assert.match(text, /历史/);
    assert.match(text, /旧(?:说明|文件链接)/);
    assert.match(text, /Buildr 不再生成、刷新或要求 `brief\.md`/);
    assert.doesNotMatch(text, /核对 Change root 内 `brief\.md` 实际存在|创建或刷新`brief\.md`|tasks 中的 Brief/);
    assert.doesNotMatch(text, /规划材料齐备后默认执行一次|此时默认执行一次实现审查|Planning Review 默认已在规划阶段执行/);
  }
  const archive = fragment('openspec-archive-converge');
  assert.match(archive, /任务说明（Task Brief）继续保存在任务记录（Task Record）的 `brief` 字段/);
  assert.match(archive, /不随归档移动、删除或复制/);
  assert.match(archive, /共享项目材料与旧说明文件保留原位置及文件语义/);
});

test('本次实现审查表现术语统一，completion 接口类型保持兼容', () => {
  for (const text of [skill('task-review'), skill('task-triage'), skill('task-verification'), fragment('openspec-propose-sidebar'), fragment('openspec-apply-sidebar')]) {
    assert.match(text, /实现审查（Implementation Review）/);
    assert.doesNotMatch(text, /Completion Review/);
  }
  assert.match(skill('task-review'), /兼容接口类型仍为 `completion`/);
  assert.match(skill('task-review'), /--type <planning\|completion>/);
});

test('OpenSpec source integrity 使用真实成员内容，增强只迁移 knowledge v4 requires', () => {
  const component = YAML.parse(read('components/buildr/openspec/component.yml'));
  for (const entry of component.integrity as string[]) {
    const [relative, expected] = entry.split('=');
    assert.equal(assetIntegrity(path.join(workspace, relative)), expected, relative);
  }
  for (const id of ['openspec-propose', 'openspec-update-change', 'openspec-apply-change']) {
    assert.ok(component.contributions.skillDependencies.some((entry: { skill: string; capability: string; version: number; mode: string }) => entry.skill === id && entry.capability === 'buildr.current-knowledge-maintenance' && entry.version === 4 && entry.mode === 'required'));
  }
});

test('变更说明退役保持 OpenSpec 1.13.0 上游来源不变', () => {
  const component = YAML.parse(read('components/buildr/openspec/component.yml'));
  assert.deepEqual(component.upstream, { name: '@fission-ai/openspec', version: '1.13.0' });
  const upstream = {
    'openspec-explore': '500fca4e0ae48c58f11af0467d0ec6adc48912e2236cbd4d7eda6d63771f7754',
    'openspec-propose': '45600f776574c2e4f653c0c483f5c4c3f2c9698a800a5b1eb01e9b745d8082d6',
    'openspec-update-change': 'ccfbfe61f4d64cafed50a6652c46a19491106dbd9d8df25a3b65b5fae24616a5',
    'openspec-apply-change': '3784f26f0ff6008e677e0262d5549e26c7b16f8856e5d32e0bf9452bee64e1ff',
    'openspec-sync-specs': 'f6bb88404830058a17feb7e261a1aeab884a6fb89bdee4cf1a9ad33000064e1e',
    'openspec-archive-change': '917e77290f5cc266f4e881cda18e527b69ed7b4d0e4cfbaf4ce710f4b763a8de',
  };
  for (const [id, digest] of Object.entries(upstream)) {
    const relative = `skills/openspec/${id}`;
    assert.equal(assetIntegrity(path.join(workspace, relative)), `sha256-${digest}`, id);
    assert.ok(component.integrity.includes(`${relative}=sha256-${digest}`), id);
  }
});
