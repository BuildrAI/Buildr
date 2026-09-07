import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const SERVICE_ROOT: any = path.resolve(import.meta.dirname, '../..');
const PRODUCT_ROOT: any = path.resolve(SERVICE_ROOT, '../..');
const WORKSPACE_ROOT: any = path.resolve(PRODUCT_ROOT, '../..');
const CHANGE_ROOTS: any[] = [
  path.join(PRODUCT_ROOT, 'openspec/changes/simplify-release-infrastructure'),
  path.join(PRODUCT_ROOT, 'openspec/changes/add-release-rehearsal-gate'),
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
    '发布演练必须在正式选择前构造精确预期发布源',
    '精确候选结果必须可直接作为最终验证',
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

test('release owners consume the current Task v3 inspection port', () => {
  const releaseTools: any = [
    'release-execution-binding.ts',
    'release-task-evidence-correlation.ts',
    'release-transaction-runner.ts',
    'release-orchestration-runner.ts',
  ].map((file: any) => read(path.join(SERVICE_ROOT, 'tools/release', file))).join('\n');

  assert.match(releaseTools, /inspectTask/);
  assert.doesNotMatch(releaseTools, /inspectTaskRecord/);
});

test('release documentation entry points resolve within the checkout', () => {
  const documents = [
    path.join(PRODUCT_ROOT, 'knowledge/flows/open-source-release.md'),
    path.join(PRODUCT_ROOT, 'knowledge/architecture/verification-framework.md'),
    path.join(PRODUCT_ROOT, 'knowledge/services/buildr.md'),
    path.join(WORKSPACE_ROOT, 'skills/buildr-release/SKILL.md'),
  ];
  for (const file of documents) {
    for (const match of read(file).matchAll(/\]\(([^)\s]+)\)/gu)) {
      const target = match[1];
      if (/^(?:https?:|mailto:|#)/u.test(target)) continue;
      assert.ok(fs.existsSync(path.resolve(path.dirname(file), target.split('#')[0])), `${file} -> ${target}`);
    }
  }
  assert.ok(!fs.existsSync(path.join(SERVICE_ROOT, 'docs/release-checklist.md')));
  assert.ok(!fs.existsSync(path.join(SERVICE_ROOT, 'docs/verification-framework.md')));
});
