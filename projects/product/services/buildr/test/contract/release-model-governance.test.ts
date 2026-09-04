import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const SERVICE_ROOT: any = path.resolve(import.meta.dirname, '../..');
const PRODUCT_ROOT: any = path.resolve(SERVICE_ROOT, '../..');
const WORKSPACE_ROOT: any = path.resolve(PRODUCT_ROOT, '../..');
const CHANGE_ROOTS: any[] = [
  path.join(PRODUCT_ROOT, 'openspec/changes/remove-task-development-and-legacy-finish-history'),
  path.join(PRODUCT_ROOT, 'openspec/changes/streamline-release-dispatch-and-closeout'),
  path.join(PRODUCT_ROOT, 'openspec/changes/replace-main-dev-merge-with-dev-provenance-reconciliation'),
  path.join(PRODUCT_ROOT, 'openspec/changes/unify-release-task-lifecycle-and-closeout'),
  path.join(PRODUCT_ROOT, 'openspec/changes/correct-release-preparation-lifecycle'),
  path.join(PRODUCT_ROOT, 'openspec/changes/define-release-model-contract'),
];
const read: any = (file: any) => fs.readFileSync(file, 'utf8');
const capabilityContract: any = (capability: any) => {
  const active: any = CHANGE_ROOTS.map((root: any) => path.join(root, 'specs', capability, 'spec.md')).find((candidate: any) => fs.existsSync(candidate));
  const canonical: any = read(path.join(PRODUCT_ROOT, 'openspec/specs', capability, 'spec.md'));
  return active ? `${canonical}\n${read(active)}` : canonical;
};

test('release collection contract freezes one manual selection chain and fails closed', () => {
  const contract: any = capabilityContract('release-collection-model');
  for (const marker of [
    '唯一人工选择集合',
    'release-<version>',
    'cherry-pick -x',
    'dev baseline → ordered selection chain → release HEAD/tree',
    'Release生命周期动作必须独立授权且幂等',
    'reopen',
    'freezes/<generation>',
    '发布模块必须保持唯一owner与窄consumer边界',
  ]) assert.match(contract, new RegExp(marker.replace(/[<>/]/g, '\\$&')), marker);
  assert.match(contract, /MUST NOT自动解决、直接编辑、rebase、reset、force push/);
  assert.match(contract, /不得写入Task Record新状态字段或建立旁路workflow store/);
  assert.match(contract, /Release lifecycle 必须维持唯一协调Task与稳定恢复身份/);
  assert.match(contract, /codex\/release-main-<version>-g<generation>/);
});

test('release integrations retain Product Candidate authority without retired task workflow evidence', () => {
  const release: any = capabilityContract('open-source-release-governance');
  const verification: any = capabilityContract('product-verification-quality');

  assert.match(release, /公开发布必须绑定release集合并分离两次Git收敛/);
  assert.match(release, /published-but-dev-reconciliation-blocked/);
  assert.match(release, /零中间资源和正式release ref核验/);
  assert.match(release, /只读.*幂等|只读dev provenance reconciliation/s);
  assert.match(verification, /Release模型适配不得重复建设既有验证能力/);
  assert.match(verification, /同一release source SHA\/tree MUST只有一个matching Candidate generation和一个不可变tarball/);
  assert.match(release, /Release transaction MUST只要求release\/support Task Record关系/);
  assert.match(release, /source、generation、CI aggregate与唯一tarball MUST继续按现有发布owner校验/);
  assert.match(release, /MUST不降低或替换任何发布候选门禁/);
});

test('source release Skill blocks incomplete migration and does not retain the old dev-main recipe', () => {
  const skill: any = read(path.join(WORKSPACE_ROOT, 'skills/buildr-release/SKILL.md'));
  assert.match(skill, /发布模型实现就绪门禁/);
  assert.match(skill, /release-model-implementation-incomplete/);
  assert.match(skill, /精确`<dev-baseline>`和有序待选择dev commits/);
  assert.match(skill, /只允许`cherry-pick -x`/);
  assert.match(skill, /reopen --confirm --reason/);
  assert.match(skill, /support Task terminal或交付结果都不使release协调Task completed/);
  assert.match(skill, /aggregate失败、缺失或source不匹配时，release协调Task保持active/);
  assert.match(skill, /candidate-failed-shard-retry\.ts inspect/);
  assert.match(skill, /rerun --failed/);
  assert.match(skill, /不得dispatch新的完整run或跨run拼接evidence/);
  assert.match(skill, /这些事实全部成立前Task保持active，不调用complete/);
  assert.match(skill, /调用`release-orchestration-runner\.ts closeout`/);
  assert.match(skill, /`release-git-convergence\.ts reconcile-dev`/);
  assert.match(skill, /基于current `dev`的release support Task worktree/);
  assert.match(skill, /awaiting-publication-authorization|等待matching frozen context/);
  assert.match(skill, /codex\/release-main-<version>-g<generation>/);
  assert.match(skill, /lifecycle `closed`成立/);
  assert.match(skill, /release-orchestration-runner\.ts/);
  assert.match(skill, /prepare-dispatch/);
  assert.match(skill, /Release Phase Timeline/);
  assert.doesNotMatch(skill, /创建明确标识的active recovery Task承载剩余准备/);
  assert.doesNotMatch(skill, /bridge-main-to-dev\.mjs/);
  assert.doesNotMatch(skill, /冻结最新`origin\/dev`/);
  assert.doesNotMatch(skill, /创建 `dev -> main` PR/);
});

test('current knowledge, checklist and architecture use the same release identity and owners', () => {
  const flow: any = read(path.join(PRODUCT_ROOT, 'knowledge/flows/open-source-release.md'));
  const service: any = read(path.join(PRODUCT_ROOT, 'knowledge/services/buildr.md'));
  const glossary: any = read(path.join(PRODUCT_ROOT, 'knowledge/glossary.md'));
  const checklist: any = read(path.join(SERVICE_ROOT, 'docs/release-checklist.md'));
  const architecture: any = read(path.join(PRODUCT_ROOT, 'docs/architecture/service-architecture.md'));

  for (const document of [flow, service, checklist]) {
    assert.match(document, /dev baseline → (ordered )?selection chain → release HEAD\/tree/);
    assert.match(document, /release-model-implementation-incomplete|P2.*交付.*P1.*P3/s);
    assert.match(document, /published-but-dev-reconciliation-blocked/);
  }
  for (const term of ['发布集合（Release Collection）', '发布选择链（Release Selection Chain）', '发布源身份（Release Source Identity）', '发布生命周期（Release Lifecycle）', '发布后 dev 来源核验（Post-publication Dev Provenance Reconciliation）', '发布中间载体（Release Intermediate Carrier）']) assert.match(glossary, new RegExp(term.replace(/[()]/g, '\\$&')));
  assert.match(glossary, /发布阶段时间线（Release Phase Timeline）/);
  assert.match(checklist, /release-orchestration-runner\.ts/);
  for (const owner of ['`tools/release`', '`src/system/installation`', '`src/verification`', '`src/task`', 'self-bootstrap runner', 'protected `publish.yml`']) assert.match(architecture, new RegExp(owner.replace(/[/.]/g, '\\$&')));
  assert.match(architecture, /不得直接写对方Persistence、复制专业Result或建立release旁路SQLite store/);
});
