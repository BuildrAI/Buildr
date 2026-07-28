import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { FINISH_PHASES } from '../../src/application/task-finish/task-finish-run.mjs';
import { LEGACY_CONVERGENCE_REGISTRY, legacyConvergenceRetirementStatus } from '../../src/application/openspec/legacy-convergence.mjs';

const serviceRoot = path.resolve(import.meta.dirname, '../..');
const productRoot = path.resolve(serviceRoot, '../..');
const read = (relative) => fs.readFileSync(path.join(serviceRoot, relative), 'utf8');
const finish = read('package/targets/workspace/skills/buildr/task-finish/SKILL.md');
const verification = read('package/targets/workspace/skills/buildr/task-verification/SKILL.md');
const verificationContract = read('package/targets/workspace/skills/contracts/buildr/task-verification/v2.md');

test('Task Finish 新协议只有五阶段且产品缺陷退出收尾', () => {
  assert.deepEqual(FINISH_PHASES, ['preflight', 'prepare', 'verify', 'deliver', 'cleanup']);
  assert.match(finish, /“修复产品缺陷”不是收尾动作/);
  assert.match(finish, /不得在当前 run 修改实现.*重新验证/);
  assert.match(finish, /nextWorkflow: task-development/);
});

test('verification evidence 表达 archive-sensitive 与 supersession', () => {
  for (const source of [verification, verificationContract]) {
    for (const phrase of ['archive-sensitive', 'implementation-changed', 'target-race', 'verification-failed', 'supersedesEvidence', 'invalidationReason', 'supersessionRelationship']) assert.ok(source.includes(phrase), phrase);
  }
});

test('convergence receipt writer持久化portable executable identity', () => {
  const source = read('src/application/domains/openspec.mjs');
  assert.match(source, /portableExecutableIdentity/);
  assert.doesNotMatch(source, /openspecExecutable:\s*executable/);
  const receiptFiles = [];
  const walk = (directory) => {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(target);
      else if (entry.name === 'convergence-receipt.json' || entry.name === 'deterministic-convergence.json') receiptFiles.push(target);
    }
  };
  walk(path.join(productRoot, 'openspec/changes'));
  for (const file of receiptFiles) assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /\/(?:Users|home)\/[^/]+\//, path.relative(productRoot, file));
});

test('新 convergence 路径只有一份长期 receipt 且恢复不依赖 stage', () => {
  const orchestrator = read('src/application/openspec/openspec-converge.mjs');
  const model = read('src/application/openspec/convergence-model.mjs');
  for (const module of ['convergence-planner.mjs', 'projected-validator.mjs', 'canonical-applier.mjs', 'convergence-observer.mjs']) {
    assert.equal(fs.existsSync(path.join(serviceRoot, 'src/application/openspec', module)), true, module);
  }
  assert.match(orchestrator, /convergence-receipt\.json/);
  assert.doesNotMatch(orchestrator, /contract-pre-sync-receipt\.json/);
  assert.doesNotMatch(orchestrator, /writeReceipt\(recoveryFile/);
  assert.doesNotMatch(model, /pre-sync|post-sync|canonical-sync|transitions/);
  for (const disposition of ['planned-not-applied', 'applied-and-matched', 'state-unknown', 'archived']) assert.ok(model.includes(disposition));
});

test('Task Finish inspect 使用轻量 bootstrap，执行 domain 只在 run 延迟加载', () => {
  const main = read('src/interfaces/cli/main.mjs');
  const bootstrap = read('src/interfaces/cli/task-finish-bootstrap.mjs');
  const application = read('src/application/task-finish/task-finish-application.mjs');
  assert.match(main, /runLightweightTaskFinish/);
  assert.match(main, /await import\('\.\/registry\.mjs'\)/);
  assert.doesNotMatch(bootstrap, /domains\/openspec|domains\/git|domains\/runtime/);
  assert.match(bootstrap, /registerTaskFinishApplication/);
  assert.match(bootstrap, /action !== 'inspect'/);
  assert.match(application, /await import\('\.\/task-finish-product-executor\.mjs'\)/);
  assert.equal(fs.existsSync(path.join(serviceRoot, 'src/application/task-finish/task-finish-run.mjs')), true);
  assert.equal(fs.existsSync(path.join(serviceRoot, 'src/application/task-finish/task-finish-action-registry.mjs')), false);
});

test('旧 OpenSpec 阶段接口受显式消费者和兼容窗口门禁约束', () => {
  assert.deepEqual(Object.keys(LEGACY_CONVERGENCE_REGISTRY), ['baseline', 'check', 'sync-plan', 'sync-apply']);
  const roots = [
    path.join(serviceRoot, 'package/targets/workspace'),
    path.join(productRoot, 'openspec/knowledge'),
    path.join(productRoot, 'docs'),
    path.join(serviceRoot, 'docs'),
  ];
  const consumers = [];
  const walk = (directory) => {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(target);
      else if (/\.(?:md|ya?ml)$/.test(entry.name) && /buildr openspec (?:baseline|check|sync-plan|sync-apply)\b/.test(fs.readFileSync(target, 'utf8'))) consumers.push(path.relative(productRoot, target).split(path.sep).join('/'));
    }
  };
  roots.forEach(walk);
  assert.deepEqual(consumers.sort(), [
    'services/buildr/package/targets/workspace/components/buildr/openspec/contributions/task-triage-change-ready.md',
    'services/buildr/package/targets/workspace/skills/buildr/openspec-contract-guard/SKILL.md',
  ]);
  assert.equal(legacyConvergenceRetirementStatus({ consumers, compatibilityWindowComplete: false }).removalEligible, false);
  assert.equal(legacyConvergenceRetirementStatus({ consumers: [], compatibilityWindowComplete: true }).removalEligible, true);
});
