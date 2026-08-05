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
const development = read('package/targets/workspace/skills/buildr/task-development/SKILL.md');
const developmentContract = read('package/targets/workspace/skills/contracts/buildr/task-development/v2.md');
const verification = read('package/targets/workspace/skills/buildr/task-verification/SKILL.md');
const verificationContract = read('package/targets/workspace/skills/contracts/buildr/task-verification/v3.md');
const finishContract = read('package/targets/workspace/skills/contracts/buildr/task-finish/v1.md');
const packageManifest = read('package/manifest.yml');
const workspaceSkills = read('package/targets/workspace/skills/manifest.yml');

test('Task Finish 保留五阶段 shell，但只消费 Development handoff 与 carrier equivalence', () => {
  assert.deepEqual(FINISH_PHASES, ['preflight', 'prepare', 'verify', 'deliver', 'cleanup']);
  assert.match(finish, /current formal Development handoff/);
  assert.match(finish, /formalVerificationExecutions.*0/);
  assert.match(finish, /nextWorkflow: task-development/);
  for (const phrase of ['任务贡献（Task Contribution）', '交付基线（Delivery Baseline）', '不增加 Candidate generation', '路径不重叠都不等于语义安全']) assert.ok(finish.includes(phrase), phrase);
  const executor = read('src/application/task-finish/task-finish-product-executor.mjs');
  for (const forbidden of ['recordTaskVerification', 'recordTaskReview', 'freezeTaskDevelopmentCandidate', 'openspec', 'runtime-resync', 'target-rebase']) assert.equal(executor.includes(forbidden), false, forbidden);
  assert.doesNotMatch(executor, /runtime\.cleanupTaskEnvironment\(/);
  assert.match(executor, /cleanupThroughRetainedController/);
  assert.match(executor, /createIsolatedGitCarrier/);
  assert.match(executor, /render-runtime/);
  assert.match(executor, /sync-workspace/);
  assert.match(executor, /finalRemoteRef/);
  assert.doesNotMatch(executor, /git', \['add', '-A'/);
  assert.doesNotMatch(executor, /gitNulList|changedDeliverySourcePaths/);
});

test('Task Finish activation is a closed retained declaration, not a process framework', () => {
  const activation = read('src/application/task-finish/task-finish-activation.mjs');
  const declaration = fs.readFileSync(path.join(productRoot, 'task-finish.yml'), 'utf8');
  for (const phrase of ['buildr.task-finish-activation/v1', 'buildr-self-bootstrap', 'sync-workspace', 'services/buildr/package/targets/workspace/**']) assert.match(declaration, new RegExp(phrase.replaceAll('*', '\\*')));
  for (const forbidden of ['executable', 'command:', 'args:', 'env:', 'shell:']) assert.equal(declaration.includes(forbidden), false, forbidden);
  assert.match(activation, /TASK_FINISH_ACTIVATION_MODES/);
  assert.match(activation, /render-runtime/);
  assert.match(activation, /activation-binding-ambiguous/);
});

test('Task Development 是 Candidate/handoff 单一 authority，Finish required 依赖它', () => {
  for (const phrase of ['Content Target', 'verification policy', 'Candidate', 'append-only', 'buildr.task-development-receipt/v2', 'planning', 'waived']) assert.ok(developmentContract.includes(phrase), phrase);
  assert.match(development, /没有公共Development CLI/);
  assert.match(finish, /buildr task finish run --task <task-id> --target/);
  assert.doesNotMatch(finish, /--project|--change/);
  for (const manifest of [packageManifest, workspaceSkills]) {
    assert.match(manifest, /task-development[\s\S]*provides:[\s\S]*buildr\.task-development[\s\S]*version: 2/);
    assert.match(manifest, /task-finish[\s\S]*requires:[\s\S]*buildr\.task-development[\s\S]*version: 2[\s\S]*mode: required/);
    assert.match(manifest, /task-finish[\s\S]*requires:[\s\S]*buildr\.task-environment[\s\S]*version: 1[\s\S]*mode: required/);
  }
});

test('Task Verification 只表达 transient execution 与 current Result authority', () => {
  for (const source of [verification, verificationContract]) {
    for (const phrase of ['buildr.project-verification/v2', 'transient', 'Task Verification Application', 'coverage gap']) assert.ok(source.includes(phrase), phrase);
    for (const legacy of ['archive-sensitive', 'supersedesEvidence', 'supersessionRelationship', 'requiredAssurance', 'candidateCompleteness']) assert.equal(source.includes(legacy), false, legacy);
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

test('current Product/Git adapter 直接接线且没有未来 adapter registry', () => {
  const application = read('src/application/task-finish/task-finish-application.mjs');
  const bootstrap = read('src/interfaces/cli/task-finish-bootstrap.mjs');
  assert.match(bootstrap, /registerTaskFinishApplication\(runtime\)/);
  assert.match(application, /createTaskFinishProductHandlers/);
  assert.match(finishContract, /current Product 只提供一个直接接线的 Git carrier adapter/);
  for (const legacy of ['worktree-lifecycle', 'git-task-integration', 'OpenSpec 归档', 'EOF 空白行处理']) {
    assert.equal(finish.includes(legacy), false, legacy);
    assert.equal(finishContract.includes(legacy), false, legacy);
  }
  assert.equal(fs.existsSync(path.join(serviceRoot, 'src/application/task-finish/task-finish-adapter-registry.mjs')), false);
  assert.doesNotMatch(application, /adapterRegistry|selectAdapter|resolveAdapter/);
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
