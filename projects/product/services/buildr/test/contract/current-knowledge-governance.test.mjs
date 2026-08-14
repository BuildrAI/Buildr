import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';

import { parseCapabilityContract } from '../../src/infrastructure/runtime/skills/manifests.mjs';

const SERVICE_ROOT = path.resolve(import.meta.dirname, '../..');
const PRODUCT_ROOT = path.resolve(SERVICE_ROOT, '../..');
const WORKSPACE_TARGET = path.join(SERVICE_ROOT, 'package', 'targets', 'workspace');
const read = (file) => fs.readFileSync(file, 'utf8');
const resolveChangeRoot = (change) => {
  const active = path.join(PRODUCT_ROOT, 'openspec/changes', change);
  if (fs.existsSync(active)) return active;
  const archive = path.join(PRODUCT_ROOT, 'openspec/changes/archive');
  const matches = fs.readdirSync(archive).filter((entry) => entry.endsWith(`-${change}`));
  assert.equal(matches.length, 1, `expected one archived Change for ${change}`);
  return path.join(archive, matches[0]);
};

test('terminology 与 current knowledge contracts 具有稳定 identity 和固定语义章节', () => {
  const terminology = path.join(WORKSPACE_TARGET, 'skills/contracts/buildr/terminology-governance/v1.md');
  const knowledgeV1 = path.join(WORKSPACE_TARGET, 'skills/contracts/buildr/current-knowledge-maintenance/v1.md');
  const knowledgeV2 = path.join(WORKSPACE_TARGET, 'skills/contracts/buildr/current-knowledge-maintenance/v2.md');
  assert.equal(parseCapabilityContract(terminology).id, 'buildr.terminology-governance');
  assert.equal(parseCapabilityContract(knowledgeV1).id, 'buildr.current-knowledge-maintenance');
  assert.equal(parseCapabilityContract(knowledgeV2).id, 'buildr.current-knowledge-maintenance');
  assert.equal(parseCapabilityContract(knowledgeV2).version, 2);
  assert.match(read(terminology), /先调查.*只对会改变长期语义/);
  assert.match(read(knowledgeV1), /`assess`.*`reconcile`.*`inspect`/s);
  assert.match(read(knowledgeV2), /`assess`.*`reconcile`.*`inspect`.*`maintain`/s);
  assert.match(read(knowledgeV2), /`change-required`/);
  assert.match(read(knowledgeV2), /`maintain` 不得创建该 sidecar/);
});

test('默认 providers 与 bindings 可解析，Development 承接专业依赖且 Finish 只消费 handoff', () => {
  const packageManifest = YAML.parse(read(path.join(SERVICE_ROOT, 'package/manifest.yml')));
  const knowledge = packageManifest.builtins.skills.find((item) => item.id === 'current-knowledge-maintenance');
  const packagedDevelopment = packageManifest.builtins.skills.find((item) => item.id === 'task-development');
  const packagedFinish = packageManifest.builtins.skills.find((item) => item.id === 'task-finish');
  assert.deepEqual(knowledge.requires, [{ capability: 'buildr.terminology-governance', version: 1, mode: 'required' }]);
  assert.equal(packageManifest.initialSkillBindings.find((item) => item.capability === 'buildr.terminology-governance').provider, 'terminology-governance');
  assert.deepEqual(packagedDevelopment.requires, [
    { capability: 'buildr.task-record', version: 2, mode: 'required' },
    { capability: 'buildr.task-environment', version: 1, mode: 'required' },
    { capability: 'buildr.task-review', version: 1, mode: 'required' },
    { capability: 'buildr.task-verification', version: 3, mode: 'required' },
    { capability: 'buildr.current-knowledge-maintenance', version: 2, mode: 'required' },
  ]);
  assert.deepEqual(packagedFinish.requires, [
    { capability: 'buildr.task-development', version: 2, mode: 'required' },
    { capability: 'buildr.task-environment', version: 1, mode: 'required' },
    { capability: 'buildr.git-operations', version: 1, mode: 'optional' },
  ]);
  const triage = packageManifest.builtins.skills.find((item) => item.id === 'task-triage');
  assert.ok(triage.requires.some((item) => item.capability === 'buildr.current-knowledge-maintenance' && item.version === 2 && item.mode === 'optional'));
  assert.equal(triage.requires.some((item) => item.capability === 'buildr.task-board-maintenance'), false);
  assert.ok(triage.requires.some((item) => item.capability === 'buildr.task-environment' && item.version === 1 && item.mode === 'optional'));
  assert.equal(packageManifest.builtins.skills.some((item) => item.id === 'task-board'), false);
  assert.equal(packageManifest.capabilityContracts.some((item) => item.id === 'buildr.task-board-maintenance'), false);
  assert.equal(packageManifest.initialSkillBindings.some((item) => item.capability === 'buildr.task-board-maintenance'), false);
  assert.equal(packageManifest.builtins.skills.some((item) => item.id === 'task-metadata-publication'), false);
  assert.equal(packageManifest.capabilityContracts.some((item) => item.id === 'buildr.task-metadata-publication'), false);
  assert.equal(packageManifest.initialSkillBindings.some((item) => item.capability === 'buildr.task-metadata-publication'), false);
  assert.equal(fs.existsSync(path.join(WORKSPACE_TARGET, 'skills/buildr/task-board/SKILL.md')), false);
  assert.equal(fs.existsSync(path.join(WORKSPACE_TARGET, 'skills/contracts/buildr/task-board-maintenance/v1.md')), false);
  assert.equal(fs.existsSync(path.join(WORKSPACE_TARGET, 'skills/buildr/task-metadata-publication/SKILL.md')), false);
  assert.equal(fs.existsSync(path.join(WORKSPACE_TARGET, 'skills/contracts/buildr/task-metadata-publication/v1.md')), false);
});

test('current knowledge provider 同时提供 v1/v2 且 maintain 不伪造 Change', () => {
  const manifest = YAML.parse(read(path.join(SERVICE_ROOT, 'package/manifest.yml')));
  const provider = manifest.builtins.skills.find((item) => item.id === 'current-knowledge-maintenance');
  assert.deepEqual(provider.provides, [
    { capability: 'buildr.current-knowledge-maintenance', version: 1 },
    { capability: 'buildr.current-knowledge-maintenance', version: 2 },
  ]);
  const skill = read(path.join(WORKSPACE_TARGET, 'skills/buildr/current-knowledge-maintenance/SKILL.md'));
  assert.match(skill, /## 6\. Maintain/);
  assert.match(skill, /不创建或要求 OpenSpec Change/);
  assert.match(skill, /change: <id \| none>/);
});

test('OpenSpec capability dependencies 由 Component 与 fragments 原子维护', () => {
  const manifest = YAML.parse(read(path.join(SERVICE_ROOT, 'package/manifest.yml')));
  const skills = new Map(manifest.builtins.skills.map((skill) => [skill.id, skill]));
  for (const id of ['openspec-explore', 'openspec-propose', 'openspec-update-change', 'openspec-apply-change', 'openspec-sync-specs', 'openspec-archive-change']) assert.equal(skills.get(id).requires, undefined, id);
  const component = YAML.parse(read(path.join(WORKSPACE_TARGET, 'components/buildr/openspec/component.yml')));
  const dependencies = component.contributions.skillDependencies;
  const has = (skill, capability, mode) => dependencies.some((item) => item.skill === skill && item.capability === capability && item.mode === mode);
  assert.equal(has('openspec-explore', 'buildr.terminology-governance', 'optional'), true);
  for (const id of ['openspec-propose', 'openspec-apply-change']) for (const capability of ['buildr.task-record', 'buildr.task-environment', 'buildr.task-development', 'buildr.current-knowledge-maintenance']) assert.equal(has(id, capability, 'required'), true, `${id}:${capability}`);
  assert.equal(has('openspec-update-change', 'buildr.current-knowledge-maintenance', 'required'), true);
  for (const capability of ['buildr.task-environment', 'buildr.task-development']) assert.equal(has('openspec-update-change', capability, 'optional'), true, capability);
  assert.equal(dependencies.some((item) => ['openspec-sync-specs', 'openspec-archive-change'].includes(item.skill)), false);
  assert.equal(skills.get('task-finish').requires?.some((item) => item.capability === 'buildr.current-knowledge-maintenance' && item.mode === 'required') || false, false);
});

test('OpenSpec Component 通过 contributions 组合且不改写 external Skill source', () => {
  const component = YAML.parse(read(path.join(WORKSPACE_TARGET, 'components/buildr/openspec/component.yml')));
  const fragments = component.contributions.skillFragments;
  assert.ok(fragments.some((item) => item.startsWith('openspec-explore@prepend=')));
  assert.ok(fragments.some((item) => item.startsWith('openspec-sync-specs@prepend=')));
  assert.ok(fragments.some((item) => item.startsWith('openspec-archive-change@prepend=')));
  assert.equal(fragments.some((item) => item.startsWith('task-triage#change-ready=')), false);
  assert.equal(fragments.some((item) => item.startsWith('task-finish#')), false);
  for (const id of ['openspec-explore', 'openspec-propose', 'openspec-update-change', 'openspec-apply-change', 'openspec-sync-specs', 'openspec-archive-change']) {
    const source = read(path.join(WORKSPACE_TARGET, `skills/openspec/${id}/SKILL.md`));
    assert.match(source, /generatedBy: "1\.6\.0"/);
    assert.doesNotMatch(source, /current-knowledge-maintenance|terminology-governance/);
  }
});

test('自举 Brief、impact evidence 与 current knowledge 使用真实目标且无 unresolved', () => {
  const changeRoot = resolveChangeRoot('enhance-openspec-human-readable-knowledge');
  const brief = read(path.join(changeRoot, 'brief.md'));
  const impact = YAML.parse(read(path.join(changeRoot, '.buildr/knowledge-impact.yml')));
  assert.match(brief, /## 一句话摘要/);
  assert.match(brief, /## 核心流程/);
  assert.deepEqual(impact.unresolvedItems, []);
  assert.ok(impact.impacts.every((item) => item.target && item.reason && item.status !== 'pending'));
  for (const item of impact.impacts) {
    const target = item.type === 'brief' ? path.join(changeRoot, 'brief.md') : path.join(PRODUCT_ROOT, item.target);
    assert.equal(fs.existsSync(target), true, item.target);
  }
});

test('正式 Change 可从 active 或唯一 archived identity 解析', () => {
  const activeOrArchived = resolveChangeRoot('optimize-task-finish-final-candidate-sequencing');
  assert.equal(fs.existsSync(path.join(activeOrArchived, 'brief.md')), true);
  const archived = resolveChangeRoot('enhance-openspec-human-readable-knowledge');
  assert.match(path.relative(PRODUCT_ROOT, archived).split(path.sep).join('/'), /^openspec\/changes\/archive\//);
});

test('Context 四层模型、知识导航和 Service 局部术语边界保持一致', () => {
  const glossary = read(path.join(PRODUCT_ROOT, 'openspec/knowledge/glossary.md'));
  const productArchitecture = read(path.join(PRODUCT_ROOT, 'openspec/knowledge/architecture/product.md'));
  const service = read(path.join(PRODUCT_ROOT, 'openspec/knowledge/services/buildr.md'));
  for (const term of ['工作信息空间', 'Workspace', '工作资产', '共享工作环境', '上下文（Context）', '任务上下文', '上下文窗口']) {
    assert.match(glossary, new RegExp(term.replace(/[()]/g, '\\$&')));
  }
  assert.match(glossary, /位于 Workspace 不表示它已经被 Buildr 治理/);
  assert.match(productArchitecture, /Task Context[\s\S]*Context Window/);
  assert.match(service, /当前不重定义 Project glossary/);
  assert.equal(fs.existsSync(path.join(PRODUCT_ROOT, 'openspec/knowledge/architecture/product.md')), true);
  assert.equal(fs.existsSync(path.join(PRODUCT_ROOT, 'openspec/knowledge/architecture/technical.md')), true);
});
