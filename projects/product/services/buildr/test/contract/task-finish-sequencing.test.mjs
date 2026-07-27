import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { FINISH_STEPS } from '../../src/application/task-finish/task-finish-run.mjs';

const serviceRoot = path.resolve(import.meta.dirname, '../..');
const productRoot = path.resolve(serviceRoot, '../..');
const read = (relative) => fs.readFileSync(path.join(serviceRoot, relative), 'utf8');
const finish = read('package/targets/workspace/skills/buildr/task-finish/SKILL.md');
const convergenceContribution = read('package/targets/workspace/components/buildr/openspec/contributions/task-finish-pre-sync.md');
const verification = read('package/targets/workspace/skills/buildr/task-verification/SKILL.md');
const verificationContract = read('package/targets/workspace/skills/contracts/buildr/task-verification/v2.md');

test('Task Finish 把完整 contract convergence 放在 final assurance 前', () => {
  const ids = FINISH_STEPS.map((item) => item.id);
  assert.ok(ids.indexOf('contract-convergence') < ids.indexOf('formal-assurance'));
  assert.equal(ids.includes('archive'), false);
  assert.ok(ids.indexOf('target-convergence') < ids.indexOf('formal-assurance'));
  assert.ok(ids.indexOf('runtime-convergence') < ids.indexOf('formal-assurance'));
  assert.ok(ids.indexOf('formal-assurance') < ids.indexOf('integration-push'));
  assert.ok(ids.indexOf('integration-push') < ids.indexOf('retained-convergence'));
  assert.match(finish, /正式保证只在 canonical、target、runtime 收敛后执行/);
  assert.match(convergenceContribution, /archive --skip-specs/);
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

test('Task Finish checkpoint 使用轻量 bootstrap，完整 domain 延迟加载', () => {
  const main = read('src/interfaces/cli/main.mjs');
  const bootstrap = read('src/interfaces/cli/task-finish-bootstrap.mjs');
  const finishRun = read('src/application/task-finish/task-finish-run.mjs');
  assert.match(main, /runLightweightTaskFinish/);
  assert.match(main, /await import\('\.\/registry\.mjs'\)/);
  assert.doesNotMatch(bootstrap, /domains\/openspec|domains\/git|domains\/runtime/);
  assert.match(bootstrap, /registerTaskFinishApplication/);
  assert.match(finishRun, /releaseOwnedLease/);
});
