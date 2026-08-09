import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { FINISH_PHASES } from '../../src/application/task-finish/task-finish-run.mjs';

const serviceRoot = path.resolve(import.meta.dirname, '../..');
const productRoot = path.resolve(serviceRoot, '../..');
const workspaceRoot = path.resolve(productRoot, '../..');
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
  assert.match(finish, /complete 后.*任务复盘.*Token 不可得可缺失.*用户同意后路由 `task-retrospective`/s);
  assert.match(finishContract, /complete result.*`nextAction`.*任务复盘.*blocked result继续优先提供确定性恢复动作/s);
  for (const phrase of ['任务贡献（Task Contribution）', '交付基线（Delivery Baseline）', '不增加 Candidate generation', '路径不重叠都不等于语义安全']) assert.ok(finish.includes(phrase), phrase);
  const executor = read('src/application/task-finish/task-finish-product-executor.mjs');
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
  assert.doesNotMatch(executor, /components\.update_available|buildr-self-bootstrap|package\/targets\/workspace/);
  assert.doesNotMatch(executor, /install-buildr-cli|launcher', 'install|deliver-cli-install|deliver-local-app-install/);
  assert.doesNotMatch(executor, /git', \['add', '-A'/);
  assert.doesNotMatch(executor, /gitNulList|changedDeliverySourcePaths/);
});

test('Task Finish activation is a closed render decision, not a Project process framework', () => {
  const activation = read('src/application/task-finish/task-finish-activation.mjs');
  assert.equal(fs.existsSync(path.join(productRoot, 'task-finish.yml')), false);
  assert.match(activation, /render-runtime/);
  assert.match(activation, /ROOT_RUNTIME_SOURCE/);
  for (const forbidden of ['sync-workspace', 'task-finish.yml', 'bindings', 'executable', 'command:', 'args:', 'env:', 'shell:']) assert.equal(activation.includes(forbidden), false, forbidden);
});

test('Buildr self-bootstrap is a Workspace Component contribution, not a package capability', () => {
  const component = fs.readFileSync(path.join(workspaceRoot, 'components/workspace/buildr-self-bootstrap/component.yml'), 'utf8');
  const skill = fs.readFileSync(path.join(workspaceRoot, 'skills/buildr-self-bootstrap-sync/SKILL.md'), 'utf8');
  const runtimeFinish = fs.readFileSync(path.join(workspaceRoot, '.agents/skills/task-finish/SKILL.md'), 'utf8');
  const packageFinish = read('package/targets/workspace/skills/buildr/task-finish/SKILL.md');
  for (const phrase of ['task-finish@append', 'skills/buildr-self-bootstrap-sync', 'source: workspace']) assert.ok(component.includes(phrase), phrase);
  for (const input of [
    'projects/product/services/buildr/package/manifest.yml',
    'projects/product/services/buildr/package/targets/workspace/**',
    'projects/product/services/buildr/src/**/*.mjs',
    'projects/product/services/buildr/src/interfaces/local-app/**',
    'projects/product/services/buildr/src/interfaces/cli/launcher.mjs',
    'projects/product/services/buildr/package/launchers/**',
  ]) assert.ok(skill.includes(input), input);
  for (const boundary of ['Formal Finish已经成功', '冻结Task Contribution', 'install-development-cli', 'install-development-local-app', '同一动作即使被多条路径命中也只执行一次', '最后执行一次', '不创建receipt、数据库记录、事件或状态机', '自举Workspace激活未完成']) assert.ok(skill.includes(boundary), boundary);
  assert.match(runtimeFinish, /Buildr 自举 Workspace 激活/);
  assert.ok(runtimeFinish.indexOf('Buildr 自举 Workspace 激活') > runtimeFinish.indexOf('## 完成标准'));
  assert.doesNotMatch(packageFinish, /post-Finish activation|Buildr 自举 Workspace 激活/);
  assert.equal(packageManifest.includes('buildr-self-bootstrap-sync'), false);
});

test('Task Development 是 Candidate/handoff 单一 authority，Finish required 依赖它', () => {
  for (const phrase of ['Content Target', 'verification policy', 'Candidate', 'append-only', 'buildr.task-development-receipt/v3', 'Parent Plan', 'Contribution Handoff', 'planning', 'waived']) assert.ok(developmentContract.includes(phrase), phrase);
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
