import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';

import { parseCapabilityContract } from '../../src/modules/agent-assets/persistence/skill-manifest.ts';

const SERVICE_ROOT: any = path.resolve(import.meta.dirname, '../..');
const PRODUCT_ROOT: any = path.resolve(SERVICE_ROOT, '../..');
const WORKSPACE_TARGET: any = path.join(SERVICE_ROOT, 'resources', 'workspace');
const read: any = (file: any) => fs.readFileSync(file, 'utf8');
const resolveChangeRoot: any = (change: any) => {
  const active: any = path.join(PRODUCT_ROOT, 'openspec/changes', change);
  if (fs.existsSync(active)) return active;
  const archive: any = path.join(PRODUCT_ROOT, 'openspec/changes/archive');
  const matches: any = fs.readdirSync(archive).filter((entry: any) => entry.endsWith(`-${change}`));
  assert.equal(matches.length, 1, `expected one archived Change for ${change}`);
  return path.join(archive, matches[0]);
};

test('当前知识 v3 使用可解析协作约定且默认包不再提供旧版本', () => {
  const terminology = path.join(WORKSPACE_TARGET, 'skills/contracts/buildr/terminology-governance/v1.md');
  const knowledge = path.join(WORKSPACE_TARGET, 'skills/contracts/buildr/current-knowledge-maintenance/v3.md');
  assert.equal(parseCapabilityContract(terminology).id, 'buildr.terminology-governance');
  const parsed = parseCapabilityContract(knowledge);
  assert.equal(parsed.id, 'buildr.current-knowledge-maintenance');
  assert.equal(parsed.version, 3);
  for (const version of [1, 2]) assert.equal(fs.existsSync(path.join(WORKSPACE_TARGET, `skills/contracts/buildr/current-knowledge-maintenance/v${version}.md`)), false);
});

test('默认 providers 与 bindings 可解析，当前认知与收尾只按实际需要消费已有能力', () => {
  const packageManifest: any = YAML.parse(read(path.join(SERVICE_ROOT, 'resources/manifest.yml')));
  const knowledge: any = packageManifest.builtins.skills.find((item: any) => item.id === 'current-knowledge-maintenance');
  const packagedFinish: any = packageManifest.builtins.skills.find((item: any) => item.id === 'task-finish');
  assert.deepEqual(knowledge.requires, [{ capability: 'buildr.terminology-governance', version: 1, mode: 'optional' }]);
  assert.equal(packageManifest.initialSkillBindings.find((item: any) => item.capability === 'buildr.terminology-governance').provider, 'terminology-governance');
  assert.equal(packageManifest.builtins.skills.some((item: any) => item.id === 'task-development'), false);
  assert.equal(packageManifest.capabilityContracts.some((item: any) => item.id === 'buildr.task-development'), false);
  assert.equal(packageManifest.initialSkillBindings.some((item: any) => item.capability === 'buildr.task-development'), false);
  assert.deepEqual(packagedFinish.requires, [
    { capability: 'buildr.task-record', version: 3, mode: 'optional' },
    { capability: 'buildr.git-worktree-provider', version: 1, mode: 'optional' },
    { capability: 'buildr.git-operations', version: 1, mode: 'optional' },
  ]);
  const triage: any = packageManifest.builtins.skills.find((item: any) => item.id === 'task-triage');
  assert.ok(triage.requires.some((item: any) => item.capability === 'buildr.current-knowledge-maintenance' && item.version === 3 && item.mode === 'optional'));
  assert.equal(triage.requires.some((item: any) => item.capability === 'buildr.task-board-maintenance'), false);
  assert.ok(triage.requires.some((item: any) => item.capability === 'buildr.git-worktree-provider' && item.version === 1 && item.mode === 'optional'));
  assert.equal(triage.requires.some((item: any) => item.capability === 'buildr.task-environment'), false);
  assert.equal(packageManifest.builtins.skills.some((item: any) => item.id === 'task-board'), false);
  assert.equal(packageManifest.capabilityContracts.some((item: any) => item.id === 'buildr.task-board-maintenance'), false);
  assert.equal(packageManifest.initialSkillBindings.some((item: any) => item.capability === 'buildr.task-board-maintenance'), false);
  assert.equal(packageManifest.builtins.skills.some((item: any) => item.id === 'task-metadata-publication'), false);
  assert.equal(packageManifest.capabilityContracts.some((item: any) => item.id === 'buildr.task-metadata-publication'), false);
  assert.equal(packageManifest.initialSkillBindings.some((item: any) => item.capability === 'buildr.task-metadata-publication'), false);
  assert.equal(fs.existsSync(path.join(WORKSPACE_TARGET, 'skills/buildr/task-board/SKILL.md')), false);
  assert.equal(fs.existsSync(path.join(WORKSPACE_TARGET, 'skills/contracts/buildr/task-board-maintenance/v1.md')), false);
  assert.equal(fs.existsSync(path.join(WORKSPACE_TARGET, 'skills/buildr/task-metadata-publication/SKILL.md')), false);
  assert.equal(fs.existsSync(path.join(WORKSPACE_TARGET, 'skills/contracts/buildr/task-metadata-publication/v1.md')), false);
});

test('当前知识的参考文件均在交付清单中，默认绑定只选择 v3', () => {
  const manifest = YAML.parse(read(path.join(SERVICE_ROOT, 'resources/manifest.yml')));
  const provider = manifest.builtins.skills.find((item: any) => item.id === 'current-knowledge-maintenance');
  assert.deepEqual(provider.provides, [{ capability: 'buildr.current-knowledge-maintenance', version: 3 }]);
  assert.deepEqual(manifest.initialSkillBindings.filter((item: any) => item.capability === 'buildr.current-knowledge-maintenance'), [
    { capability: 'buildr.current-knowledge-maintenance', version: 3, provider: 'current-knowledge-maintenance' },
  ]);
  const folder = path.join(WORKSPACE_TARGET, 'skills/buildr/current-knowledge-maintenance');
  const skill = read(path.join(folder, 'SKILL.md'));
  const references = [...skill.matchAll(/\]\((references\/[^)#]+\.md)(?:#[^)]*)?\)/g)].map((match: any) => match[1]);
  assert.ok(references.length >= 3);
  for (const relative of new Set(references)) {
    assert.ok(fs.statSync(path.join(folder, relative)).isFile(), relative);
    assert.ok(manifest.workspaceFiles.includes(`resources/workspace/skills/buildr/current-knowledge-maintenance/${relative} => skills/buildr/current-knowledge-maintenance/${relative} copy`), relative);
  }
});

test('OpenSpec capability dependencies 由 Component 与 fragments 原子维护', () => {
  const manifest: any = YAML.parse(read(path.join(SERVICE_ROOT, 'resources/manifest.yml')));
  const skills: any = new Map(manifest.builtins.skills.map((skill: any) => [skill.id, skill]));
  for (const id of ['openspec-explore', 'openspec-propose', 'openspec-update-change', 'openspec-apply-change', 'openspec-sync-specs', 'openspec-archive-change']) assert.equal(skills.get(id).requires, undefined, id);
  const component: any = YAML.parse(read(path.join(WORKSPACE_TARGET, 'components/buildr/openspec/component.yml')));
  const dependencies: any = component.contributions.skillDependencies;
  const has: any = (skill: any, capability: any, mode: any) => dependencies.some((item: any) => item.skill === skill && item.capability === capability && item.mode === mode && (capability !== 'buildr.current-knowledge-maintenance' || item.version === 3));
  assert.equal(has('openspec-explore', 'buildr.terminology-governance', 'optional'), true);
  for (const id of ['openspec-propose', 'openspec-apply-change']) for (const capability of ['buildr.task-record', 'buildr.current-knowledge-maintenance']) assert.equal(has(id, capability, 'required'), true, `${id}:${capability}`);
  assert.equal(dependencies.some((item: any) => item.capability === 'buildr.task-environment'), false);
  assert.equal(has('openspec-update-change', 'buildr.current-knowledge-maintenance', 'required'), true);
  assert.equal(dependencies.some((item: any) => item.capability === 'buildr.task-development'), false);
  assert.equal(dependencies.some((item: any) => ['openspec-sync-specs', 'openspec-archive-change'].includes(item.skill)), false);
  assert.equal(skills.get('task-finish').requires?.some((item: any) => item.capability === 'buildr.current-knowledge-maintenance' && item.mode === 'required') || false, false);
});

test('OpenSpec Component 通过 contributions 组合且不改写 external Skill source', () => {
  const component: any = YAML.parse(read(path.join(WORKSPACE_TARGET, 'components/buildr/openspec/component.yml')));
  const fragments: any = component.contributions.skillFragments;
  assert.ok(fragments.some((item: any) => item.startsWith('openspec-explore@prepend=')));
  assert.ok(fragments.some((item: any) => item.startsWith('openspec-sync-specs@prepend=')));
  assert.ok(fragments.some((item: any) => item.startsWith('openspec-archive-change@prepend=')));
  assert.equal(fragments.some((item: any) => item.startsWith('task-triage#change-ready=')), false);
  assert.equal(fragments.some((item: any) => item.startsWith('task-finish#')), false);
  for (const id of ['openspec-explore', 'openspec-propose', 'openspec-update-change', 'openspec-apply-change', 'openspec-sync-specs', 'openspec-archive-change']) {
    const source: any = read(path.join(WORKSPACE_TARGET, `skills/openspec/${id}/SKILL.md`));
    assert.match(source, /generatedBy: "1\.13\.0"/);
    assert.doesNotMatch(source, /current-knowledge-maintenance|terminology-governance/);
  }
});

test('自举 Brief、impact evidence 与 current knowledge 使用真实目标且无 unresolved', () => {
  const changeRoot: any = resolveChangeRoot('enhance-openspec-human-readable-knowledge');
  const brief: any = read(path.join(changeRoot, 'brief.md'));
  const impact: any = YAML.parse(read(path.join(changeRoot, '.buildr/knowledge-impact.yml')));
  assert.match(brief, /## 一句话摘要/);
  assert.match(brief, /## 核心流程/);
  assert.deepEqual(impact.unresolvedItems, []);
  assert.ok(impact.impacts.every((item: any) => item.target && item.reason && item.status !== 'pending'));
  for (const item of impact.impacts) {
    const target: any = item.type === 'brief' ? path.join(changeRoot, 'brief.md') : path.join(PRODUCT_ROOT, item.target);
    const migratedTarget: any = item.type === 'brief' || !/^(?:openspec\/)?knowledge\//.test(item.target)
      ? target
      : path.join(PRODUCT_ROOT, item.target.replace(/^openspec\/knowledge\//, 'knowledge/docs/'));
    // Archived impact evidence remains immutable; its historical knowledge path may resolve to the migrated current asset.
    if (!fs.existsSync(target)) assert.equal(fs.existsSync(migratedTarget), true, item.target);
    else assert.equal(fs.existsSync(target), true, item.target);
  }
});

test('正式 Change 可从 active 或唯一 archived identity 解析', () => {
  const activeOrArchived: any = resolveChangeRoot('optimize-task-finish-final-candidate-sequencing');
  assert.equal(fs.existsSync(path.join(activeOrArchived, 'brief.md')), true);
  const archived: any = resolveChangeRoot('enhance-openspec-human-readable-knowledge');
  assert.match(path.relative(PRODUCT_ROOT, archived).split(path.sep).join('/'), /^openspec\/changes\/archive\//);
});

test('Context 四层模型、知识导航和 Service 局部术语边界保持一致', () => {
  const glossary: any = read(path.join(PRODUCT_ROOT, 'knowledge/docs/glossary.md'));
  const productArchitecture: any = read(path.join(PRODUCT_ROOT, 'knowledge/docs/architecture/product.md'));
  const service: any = read(path.join(PRODUCT_ROOT, 'knowledge/docs/services/buildr.md'));
  for (const term of ['工作信息空间', 'Workspace', '工作资产', '共享工作环境', '上下文（Context）', '任务上下文', '上下文窗口']) {
    assert.match(glossary, new RegExp(term.replace(/[()]/g, '\\$&')));
  }
  assert.match(glossary, /位于 Workspace 不表示它已经被 Buildr 治理/);
  assert.match(productArchitecture, /Task Context[\s\S]*Context Window/);
  assert.match(service, /当前不重定义 Project glossary/);
  assert.equal(fs.existsSync(path.join(PRODUCT_ROOT, 'knowledge/docs/architecture/product.md')), true);
  assert.equal(fs.existsSync(path.join(PRODUCT_ROOT, 'knowledge/docs/architecture/technical.md')), true);
});
