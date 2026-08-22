import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { FINISH_PHASES } from '../../src/task/application/finish/task-finish-run.mjs';

const serviceRoot = path.resolve(import.meta.dirname, '../..');
const productRoot = path.resolve(serviceRoot, '../..');
const workspaceRoot = path.resolve(productRoot, '../..');
const read = (relative) => fs.readFileSync(path.join(serviceRoot, relative), 'utf8');
const finish = read('resources/workspace/skills/buildr/task-finish/SKILL.md');
const development = read('resources/workspace/skills/buildr/task-development/SKILL.md');
const developmentContract = read('resources/workspace/skills/contracts/buildr/task-development/v2.md');
const verification = read('resources/workspace/skills/buildr/task-verification/SKILL.md');
const verificationContract = read('resources/workspace/skills/contracts/buildr/task-verification/v3.md');
const finishContract = read('resources/workspace/skills/contracts/buildr/task-finish/v1.md');
const coreRule = read('resources/workspace/rules/buildr/core.md');
const workspaceRule = read('resources/workspace/AGENTS.md');
const packageManifest = read('resources/manifest.yml');
const productRule = fs.readFileSync(path.join(productRoot, 'AGENTS.md'), 'utf8');

test('Task Finish 保留可选五阶段自动化，同时允许Agent直接交付后对账', () => {
  assert.deepEqual(FINISH_PHASES, ['preflight', 'prepare', 'verify', 'deliver', 'cleanup']);
  assert.match(finish, /current Development handoff/);
  assert.match(finish, /--commit-message '<semantic-message>'/);
  for (const phrase of ['Agent 直接交付', 'task finish reconcile', '四个独立结果', '交付（Delivery）', '激活（Activation）', '环境清理（Environment Cleanup）', '诊断（Diagnostics）', '不得重复推送已交付 repository']) assert.ok(finish.includes(phrase), phrase);
  assert.match(finishContract, /该能力不是正式Task交付的唯一执行通道/);
  assert.match(finishContract, /真实remote target/);
  assert.match(finishContract, /状态与proof必须成对持久化/);
  assert.match(finishContract, /不得因Doctor、Activation、Execution Record、Environment Cleanup、Task登记或Buildr内部派生证据失败而改写为未交付/);
  assert.match(workspaceRule, /Git 提交信息默认使用中文/);
  assert.match(finish, /--commit-message[\s\S]*当前 workspace `AGENTS\.md`[\s\S]*不翻译或重写提交信息/);
  const executor = read('src/task/application/finish/task-finish-product-executor.mjs');
  for (const forbidden of ['recordTaskVerification', 'recordTaskReview', 'freezeTaskDevelopmentCandidate', 'openspec', 'runtime-resync', 'target-rebase']) assert.equal(executor.includes(forbidden), false, forbidden);
  assert.doesNotMatch(executor, /runtime\.cleanupTaskEnvironment\(/);
  assert.match(executor, /cleanupThroughRetainedController/);
  assert.match(executor, /createIsolatedGitCarrier/);
  assert.match(executor, /render-runtime/);
  assert.doesNotMatch(executor, /sync-workspace/);
  assert.match(executor, /finalRemoteRef/);
  assert.match(executor, /finalRemoteRef: remoteAfterRef/);
  assert.match(executor, /targetDisposition: alreadyContained \? 'already-contained' : 'carrier'/);
  assert.match(executor, /inspectGitCarrierContainment/);
  assert.match(executor, /\['doctor', '--agent', run\.identity\.agent/);
  assert.match(executor, /activation = \{ status: 'attention'/);
  assert.doesNotMatch(executor, /components\.update_available|buildr-self-bootstrap|package\/targets\/workspace/);
  assert.doesNotMatch(executor, /install-buildr-cli|launcher', 'install|deliver-cli-install|deliver-local-app-install/);
  assert.doesNotMatch(executor, /git', \['add', '-A'/);
  assert.doesNotMatch(executor, /gitNulList|changedDeliverySourcePaths/);
});

test('Task Finish activation is a closed render decision, not a Project process framework', () => {
  const activation = read('src/task/application/finish/task-finish-activation.mjs');
  assert.equal(fs.existsSync(path.join(productRoot, 'task-finish.yml')), false);
  assert.match(activation, /render-runtime/);
  assert.match(activation, /ROOT_RUNTIME_SOURCE/);
  for (const forbidden of ['sync-workspace', 'task-finish.yml', 'bindings', 'executable', 'command:', 'args:', 'env:', 'shell:']) assert.equal(activation.includes(forbidden), false, forbidden);
});

test('Buildr self-bootstrap is a Workspace Component contribution, not a package capability', () => {
  const component = fs.readFileSync(path.join(workspaceRoot, 'components/workspace/buildr-self-bootstrap/component.yml'), 'utf8');
  const skill = fs.readFileSync(path.join(workspaceRoot, 'skills/buildr-self-bootstrap-sync/SKILL.md'), 'utf8');
  const contribution = fs.readFileSync(path.join(workspaceRoot, 'components/workspace/buildr-self-bootstrap/contributions/task-finish-post-finish.md'), 'utf8');
  const packageFinish = read('resources/workspace/skills/buildr/task-finish/SKILL.md');
  for (const phrase of ['task-finish@append', 'skills/buildr-self-bootstrap-sync', 'source: workspace']) assert.ok(component.includes(phrase), phrase);
  for (const boundary of ['buildr.task-finish-self-bootstrap-input/v1', '唯一runner', 'reconciliation形成的Delivery可以没有Delivery Carrier', 'Service repository不能触发Workspace自举', 'target lease', '只允许fetch与fast-forward', '不merge commit、不rebase、不stash、不reset、不force push', '主任务已交付，自举Workspace激活未完成', 'Environment Cleanup由Task Environment独立处理']) assert.ok(skill.includes(boundary), boundary);
  for (const boundary of ['自动Finish或delivery reconciliation', 'buildr.task-finish-self-bootstrap-input/v1', '可以没有Delivery Carrier', 'Service repository不能触发Workspace自举', '只允许fast-forward', '不撤销Delivery', 'Environment Cleanup由Task Environment']) assert.ok(contribution.includes(boundary), boundary);
  assert.doesNotMatch(contribution, /resolvedContext|--detail full|task-finish-result\/v[234]/);
  assert.doesNotMatch(packageFinish, /post-Finish activation|Buildr 自举 Workspace 激活/);
  assert.equal(packageManifest.includes('buildr-self-bootstrap-sync'), false);
  const runnerPath = path.join(workspaceRoot, 'skills/buildr-self-bootstrap-sync/scripts/closeout.mjs');
  const runner = fs.readFileSync(runnerPath, 'utf8');
  for (const phrase of ['buildr.self-bootstrap-closeout-result/v1', 'buildr.self-bootstrap-recovery-plan/v1', 'foreign-carriers-require-owner-recovery', 'isolated-coexisting', 'unprovable', 'task-finish-target-lease-driver.mjs', 'target-lease-held', 'resume-owner-release-occupancy', '--release-occupancy', 'Buildr-Finish-Run', 'Buildr-Closeout-Plan', "'sync'", "'commit'", "'push'", "'install-local-app'", "'verify-development-entry'", "'finalize'", 'development-entry-launcher-mismatch', 'development-entry-cli-mismatch', 'development-entry-version-mismatch']) assert.ok(runner.includes(phrase), phrase);
  assert.doesNotMatch(runner, /install-development-cli|resolveDefaultBuildr|default-cli-/u);
  assert.match(runner, /finishResult\.selfBootstrap\?\.activationPaths/);
  assert.match(runner, /task', 'finish', 'inspect'/);
  assert.match(runner, /'--detail', 'self-bootstrap'/);
  assert.doesNotMatch(runner, /task-finish-result\/v[234]/);
  assert.match(runner, /node-identity-mismatch/);
  assert.doesNotMatch(runner, /(?:from\s+|import\s*\()['"]\.\.\//, 'workspace-only runner must not import modules outside its Skill directory');
  assert.equal(fs.existsSync(path.join(serviceRoot, 'src/application/self-bootstrap-closeout/self-bootstrap-closeout.mjs')), false);
  assert.equal(fs.existsSync(path.join(serviceRoot, 'src/interfaces/internal/buildr-self-bootstrap-closeout-driver.mjs')), false);
  assert.equal(fs.existsSync(path.join(serviceRoot, 'src/task/interfaces/internal/task-finish-target-lease-driver.mjs')), true);
  assert.equal(packageManifest.includes('task-finish-target-lease-driver'), false);
  assert.equal(packageManifest.includes('skills/buildr-self-bootstrap-sync'), false);
  assert.match(runner, /\['merge', '--ff-only', remote\]/, 'latest dev integration must remain fast-forward only');
  assert.equal(runner.match(/'merge'/g)?.length, 1, 'runner must expose exactly one bounded fast-forward merge invocation');
  for (const forbidden of ["'reset'", "'rebase'", "'stash'", "'push', '--force'"]) assert.equal(runner.includes(forbidden), false, forbidden);
});

test('宽而薄治理保留自举副作用边界，不把Activation变成Delivery门禁', () => {
  const skill = fs.readFileSync(path.join(workspaceRoot, 'skills/buildr-self-bootstrap-sync/SKILL.md'), 'utf8');
  const runner = fs.readFileSync(path.join(workspaceRoot, 'skills/buildr-self-bootstrap-sync/scripts/closeout.mjs'), 'utf8');
  const projector = read('src/task/application/finish/task-finish-self-bootstrap-projection.mjs');

  assert.match(coreRule, /Buildr 采用宽而薄的治理/);
  assert.match(coreRule, /越权、错误对象写入、未经授权的外部或不可逆副作用、证据失真或完成误报/);
  assert.match(productRule, /新增或收紧硬门禁.*保护的 authority 或结果不变量.*具体伤害/s);
  assert.match(productRule, /辅助 provenance、推荐流程、工具偏好或自动化信心/);

  for (const phrase of ['Delivery与自举Activation相互独立', '只允许fetch与fast-forward', '不merge commit、不rebase、不stash、不reset、不force push', '不撤销Delivery', '无carrier的reconciliation结果不得因此失败']) {
    assert.ok(skill.includes(phrase), phrase);
  }
  assert.match(runner, /inspectPublishedLinearDescendant/);
  assert.match(runner, /published-linear-descendant/);
  assert.doesNotMatch(runner, /Buildr-Task|successor-identity-unprovable/);
  assert.match(runner, /Buildr-Finish-Run/);
  assert.match(runner, /Buildr-Closeout-Plan/);
  assert.match(projector, /PUBLIC_JSON_SCHEMAS\.taskFinishSelfBootstrapInput/);
  for (const forbidden of ['External Successor Adoption', 'Candidate Re-freeze', 'adoption store']) assert.equal(skill.includes(forbidden), false, forbidden);
});

test('Task Finish指导Agent选择路径，不把自动化细节写成唯一workflow', () => {
  for (const phrase of ['由 Agent 选择路径', 'Buildr 自动 Finish', 'Agent 直接交付', '这些阶段不是 Agent 必须遵循的唯一工作方式']) assert.ok(finish.includes(phrase), phrase);
  assert.match(finish, /不把 Buildr 自动 Finish 变成唯一通道/);
});

test('Task Development 是 Candidate/handoff 单一 authority，Finish required 依赖它', () => {
  for (const phrase of ['Content Target', 'verification policy', 'Candidate', 'append-only', 'buildr.task-development-receipt/v3', 'Parent Plan', 'Contribution Handoff', 'planning', 'waived']) assert.ok(developmentContract.includes(phrase), phrase);
  assert.match(development, /没有公共Development CLI/);
  assert.match(finish, /buildr task finish run[\s\S]*--task <task-id>[\s\S]*--commit-message/);
  assert.match(finish, /buildr task finish reconcile[\s\S]*--task <task-id>/);
  assert.doesNotMatch(finish, /--project|--change/);
  assert.match(packageManifest, /task-development[\s\S]*provides:[\s\S]*buildr\.task-development[\s\S]*version: 2/);
  assert.match(packageManifest, /task-finish[\s\S]*requires:[\s\S]*buildr\.task-development[\s\S]*version: 2[\s\S]*mode: required/);
  assert.match(packageManifest, /task-finish[\s\S]*requires:[\s\S]*buildr\.task-environment[\s\S]*version: 1[\s\S]*mode: required/);
});

test('Task Verification 只表达 transient execution 与 current Result authority', () => {
  for (const source of [verification, verificationContract]) {
    for (const phrase of ['buildr.project-verification/v2', 'transient', 'Task Verification Application', 'coverage gap']) assert.ok(source.includes(phrase), phrase);
    for (const legacy of ['archive-sensitive', 'supersedesEvidence', 'supersessionRelationship', 'requiredAssurance', 'candidateCompleteness']) assert.equal(source.includes(legacy), false, legacy);
  }
});

test('convergence事务Receipt只保存portable executable identity', () => {
  const source = read('src/task/openspec/application/openspec-application.mjs');
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

test('新 convergence 路径只有一份事务期Receipt且成功archive后释放', () => {
  const orchestrator = read('src/task/openspec/application/openspec-converge.mjs');
  const model = read('src/task/openspec/application/convergence-model.mjs');
  for (const module of ['convergence-planner.mjs', 'projected-validator.mjs', 'canonical-applier.mjs', 'convergence-observer.mjs']) {
    assert.equal(fs.existsSync(path.join(serviceRoot, 'src/task/openspec/application', module)), true, module);
  }
  assert.match(orchestrator, /convergence-receipt\.json/);
  assert.match(orchestrator, /receipt-release/);
  assert.match(model, /retention: 'transaction'/);
  assert.doesNotMatch(orchestrator, /contract-pre-sync-receipt\.json/);
  assert.doesNotMatch(orchestrator, /writeReceipt\(recoveryFile/);
  assert.doesNotMatch(model, /pre-sync|post-sync|canonical-sync|transitions/);
  for (const disposition of ['planned-not-applied', 'applied-and-matched', 'state-unknown', 'archived']) assert.ok(model.includes(disposition));
});

test('Task Finish inspect 使用轻量 bootstrap，执行 domain 只在 run 延迟加载', () => {
  const main = read('src/bootstrap/cli/main.mjs');
  const bootstrap = read('src/bootstrap/cli/task-finish-bootstrap.mjs');
  const application = read('src/task/application/finish/task-finish-application.mjs');
  assert.match(main, /runLightweightTaskFinish/);
  assert.match(main, /await import\('\.\/registry\.mjs'\)/);
  assert.doesNotMatch(bootstrap, /domains\/openspec|domains\/git|domains\/runtime/);
  assert.match(bootstrap, /registerTaskFinishBootstrap/);
  assert.match(bootstrap, /action !== 'inspect'/);
  assert.match(application, /await import\('\.\/task-finish-product-executor\.mjs'\)/);
  assert.equal(fs.existsSync(path.join(serviceRoot, 'src/task/application/finish/task-finish-run.mjs')), true);
  assert.equal(fs.existsSync(path.join(serviceRoot, 'src/task/application/finish/task-finish-action-registry.mjs')), false);
});

test('Task Finish bootstrap recovery留在full retained Application且不开放任意candidate runtime', () => {
  const main = read('src/bootstrap/cli/main.mjs');
  const bootstrap = read('src/bootstrap/cli/task-finish-bootstrap.mjs');
  const application = read('src/task/application/finish/task-finish-application.mjs');
  const recovery = read('src/task/application/finish/task-finish-bootstrap-recovery.mjs');
  assert.doesNotMatch(main, /runTaskFinishBootstrapRecovery/);
  assert.doesNotMatch(bootstrap, /prepareTaskFinishBootstrapRecoveryContext/);
  assert.match(application, /--bootstrap-recovery/);
  assert.match(application, /--release-occupancy/);
  assert.ok(application.indexOf('openedExecutionRecord = runtime.openTaskExecutionRecord') < application.indexOf('const bootstrapContext = prepareTaskFinishBootstrapRecoveryContext'));
  assert.match(application, /readTaskFinishRunPersistence/);
  assert.match(application, /writeTaskFinishRunPersistence/);
  assert.match(application, /createTaskFinishBootstrapRecoveryRuntimeFacade/);
  assert.doesNotMatch(application, /Object\.create\(runtime\)/);
  assert.match(recovery, /inspectTaskEnvironment/);
  assert.match(recovery, /assertTaskDevelopmentCarrier/);
  assert.match(recovery, /clone.*--shared.*--no-checkout/);
  assert.match(recovery, /RUNTIME_METHODS/);
  assert.match(recovery, /retained-writer-candidate-phase-provider/);
  const executor = read('src/task/application/finish/task-finish-product-executor.mjs');
  assert.doesNotMatch(executor, /cleanupTaskFinishBootstrapRecovery/);
  for (const forbidden of ['npm pack', 'npm install', 'candidateCli', 'registerWorkspaceSqlite(runtime, { sourceRoot: context', '--source', '--module', '--manifest', '--tarball']) {
    assert.equal(bootstrap.includes(forbidden), false, forbidden);
    assert.equal(recovery.includes(forbidden), false, forbidden);
  }
});

test('current Product直接接线自动Git executor与交付对账，没有adapter registry', () => {
  const application = read('src/task/application/finish/task-finish-application.mjs');
  const bootstrap = read('src/bootstrap/cli/task-finish-bootstrap.mjs');
  assert.match(bootstrap, /registerTaskFinishBootstrap\(runtime\)/);
  assert.match(application, /createTaskFinishProductHandlers/);
  assert.match(finishContract, /自动`run`可在明确Git边界内创建Delivery Carrier/);
  assert.match(finishContract, /`reconcile`只观察远端并登记交付/);
  for (const legacy of ['worktree-lifecycle', 'git-task-integration', 'OpenSpec 归档', 'EOF 空白行处理']) {
    assert.equal(finish.includes(legacy), false, legacy);
    assert.equal(finishContract.includes(legacy), false, legacy);
  }
  assert.equal(fs.existsSync(path.join(serviceRoot, 'src/task/application/finish/task-finish-adapter-registry.mjs')), false);
  assert.doesNotMatch(application, /adapterRegistry|selectAdapter|resolveAdapter/);
});
