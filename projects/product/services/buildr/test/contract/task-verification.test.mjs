import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const productRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relative) => fs.readFileSync(path.join(productRoot, relative), 'utf8');

const contract = read('package/targets/workspace/skills/contracts/buildr/task-verification/v2.md');
const verificationSkill = read('package/targets/workspace/skills/buildr/task-verification/SKILL.md');
const verificationReference = read('package/targets/workspace/skills/buildr/task-verification/references/project-verification-v1.md');
const verificationTemplate = read('package/targets/workspace/skills/buildr/task-verification/templates/project-verification.yml');
const worktreeSkill = read('package/targets/workspace/skills/buildr/task-worktree/SKILL.md');
const gitIntegrationContract = read('package/targets/workspace/skills/contracts/buildr/git-task-integration/v1.md');
const gitOpsSkill = read('package/targets/workspace/skills/buildr/git-ops/SKILL.md');
const finishSkill = read('package/targets/workspace/skills/buildr/task-finish/SKILL.md');
const openSpecApplySidebar = read('package/targets/workspace/components/buildr/openspec/contributions/openspec-apply-sidebar.md');
const buildrSkill = read('package/targets/runtime/skills/buildr/SKILL.md');
const packageManifest = YAML.parse(read('package/manifest.yml'));
const workspaceManifest = YAML.parse(read('package/targets/workspace/skills/manifest.yml'));
const closeoutFixtures = JSON.parse(read('test/fixtures/task-verification-closeout.json'));

test('task-verification contract 定义独立验证与耗时证据', () => {
  assert.match(contract, /id: buildr\.task-verification/);
  for (const required of [
    'minimal', 'affected', 'candidate', 'requiredAssurance', 'candidateIdentity', 'totalDurationMs',
    'timingSource', 'verifier-reported', 'wrapper-measured', 'slowestCheck',
    'failedChecks', 'skippedChecks', 'evidenceReference', 'evidenceRetention',
    'cleanupAfter', 'cleanupStatus', 'cleanupReference', 'transient', 'caller-managed',
    'inspect', 'execute', 'cleanup', 'taskVerificationExecuteCalls', 'candidateExecutorCalls',
    'policyMode', 'availableCapabilities', 'selectedCapabilities', 'blockedCapabilities',
    'candidateCompleteness', '初始化/更新测试声明',
  ]) assert.ok(contract.includes(required), `contract must include ${required}`);
  assert.match(contract, /不得相加并行检查耗时推算整体 wall-clock/);
  assert.match(contract, /不得.*要求 Git worktree/);
});

test('默认 provider 区分内部反馈与两级正式保证', () => {
  for (const required of [
    'Rules/AGENTS', '内部快速反馈', '受影响验证', '完整候选验证', 'requiredAssurance', '单调时钟',
    'wait、poll 或 resume 同一进程', 'totalDurationMs', 'timingSource',
    'slowestCheck', 'failedChecks', 'skippedChecks', 'evidenceReference',
    'evidenceRetention', 'cleanupAfter', 'cleanupStatus', 'cleanupReference',
    '用户无需主动点名本 Skill', 'task-worktree` 不负责这项清理',
    '完整候选验证尚未执行', 'inspect', 'execute', 'cleanup',
    'taskVerificationExecuteCalls', 'candidateExecutorCalls',
    'policyMode: legacy', 'mode: augment', 'mode: authoritative',
    'availableCapabilities', 'selectedCapabilities', 'blockedCapabilities',
    'candidateCompleteness', '初始化测试声明', '更新测试声明',
    'discovered → trial → stable',
  ]) assert.ok(verificationSkill.includes(required), `verification Skill must include ${required}`);
  assert.doesNotMatch(verificationSkill, /必须使用 Git worktree/);
  assert.doesNotMatch(verificationSkill, /鲜肉三层/);
  assert.match(verificationReference, /buildr\.project-verification\/v1/);
  assert.match(verificationReference, /Agent 可以自动发现和补充 discovered\/trial 草稿，但不能自动提升为 stable 或 required/);
  const template = YAML.parse(verificationTemplate);
  assert.equal(template.mode, 'augment');
  assert.equal(template.capabilities[0].maturity, 'discovered');
  assert.equal(template.capabilities[0].authorization, 'explicit');
});

test('worktree lifecycle 与任务验证职责解耦', () => {
  assert.match(worktreeSkill, /## 4\. 协作交接/);
  assert.match(worktreeSkill, /验证属于 `task-verification`/);
  assert.doesNotMatch(worktreeSkill, /实现期间采用三级验证门禁/);
  assert.doesNotMatch(worktreeSkill, /单任务最小反馈：/);
  assert.match(worktreeSkill, /不监控普通编辑/);
  assert.match(worktreeSkill, /不决定 Candidate evidence 的有效、复用或重跑/);
  assert.equal(worktreeSkill.split('实际自举 workspace 的 sync 是独立的状态变更').length - 1, 0);
  assert.equal(worktreeSkill.split('本机 `buildr` 若指向即将删除的 task worktree').length - 1, 0);
  assert.match(worktreeSkill, /迁移或停止 task-owned 本机入口与进程/);
  assert.doesNotMatch(worktreeSkill, /旧 evidence 随即失效/);
});

test('Git integration 只返回内容转换证据，不拥有 Candidate 验证决策', () => {
  assert.match(gitIntegrationContract, /version: 1/);
  assert.match(gitIntegrationContract, /输入与最终 candidate content identity/);
  assert.match(gitIntegrationContract, /tree 等价性信号只描述 Git 操作效果/);
  assert.match(gitIntegrationContract, /验证 evidence 的有效性、复用或重跑由 task-verification provider 或其 consumer 决定/);
  assert.match(gitOpsSkill, /不执行项目 Candidate 验证/);
  assert.match(gitOpsSkill, /tree 等价性信号只描述 Git 操作效果/);
  assert.doesNotMatch(gitOpsSkill, /改变已验证 tree 时，原验证结果失效/);
  assert.doesNotMatch(gitOpsSkill, /集成前重新运行受影响的验证/);
  assert.doesNotMatch(gitOpsSkill, /复用已有验证结果/);
});

test('默认收尾只推送目标分支，远端任务分支需要明确要求', () => {
  for (const required of [
    '默认只推送已集成的目标分支', '远端任务分支只有在用户当前轮次明确要求',
    '任务分支未推送状态或明确授权的远端结果',
  ]) assert.ok(gitIntegrationContract.includes(required), `git integration contract must include ${required}`);
  for (const required of [
    '默认 push 只面向已集成的目标分支', '才可推送任务分支',
  ]) assert.ok(gitOpsSkill.includes(required), `git-ops must include ${required}`);
  assert.match(finishSkill, /默认只 push 已集成目标分支/);
  assert.match(finishSkill, /不授权.*远端任务分支操作/);
});

test('随包 manifest 原子登记 contract、provider、binding 与 consumer', () => {
  const packagedContract = packageManifest.capabilityContracts.find((item) => item.id === 'buildr.task-verification');
  assert.equal(packagedContract.version, 2);
  assert.equal(packageManifest.initialSkillBindings.find((item) => item.capability === 'buildr.task-verification').provider, 'task-verification');
  const packagedSkill = packageManifest.builtins.skills.find((item) => item.id === 'task-verification');
  assert.equal(packagedSkill.provides[0].capability, 'buildr.task-verification');
  assert.match(packagedSkill.description, /Agent 准备判断或声称开发完成/);
  assert.match(packagedSkill.description, /初始化或更新测试声明/);
  assert.match(packagedSkill.description, /用户无需主动点名本 Skill/);
  const finish = packageManifest.builtins.skills.find((item) => item.id === 'task-finish');
  assert.ok(finish.requires.some((item) => item.capability === 'buildr.task-verification' && item.mode === 'required'));

  assert.equal(workspaceManifest.bindings.find((item) => item.capability === 'buildr.task-verification').provider, 'task-verification');
  const workspaceSkill = workspaceManifest.skills.find((item) => item.id === 'task-verification');
  assert.ok(workspaceSkill.runtimes.includes('workbuddy'));
  assert.equal(workspaceSkill.description, packagedSkill.description);

  const gitContract = packageManifest.capabilityContracts.find((item) => item.id === 'buildr.git-task-integration');
  const worktreeContract = packageManifest.capabilityContracts.find((item) => item.id === 'buildr.task-worktree-lifecycle');
  assert.equal(gitContract.version, 1);
  assert.equal(worktreeContract.version, 2);
  assert.equal(packageManifest.initialSkillBindings.find((item) => item.capability === 'buildr.git-task-integration').provider, 'git-ops');
  assert.equal(packageManifest.initialSkillBindings.find((item) => item.capability === 'buildr.task-worktree-lifecycle').provider, 'task-worktree');
  assert.deepEqual(packageManifest.builtins.skills.find((item) => item.id === 'git-ops').provides.map((item) => item.capability), [
    'buildr.git-single-operation',
    'buildr.git-task-integration',
    'buildr.git-workspace-update',
  ]);
  assert.deepEqual(packageManifest.builtins.skills.find((item) => item.id === 'task-worktree').provides.map((item) => item.capability), [
    'buildr.task-worktree-lifecycle',
  ]);
});

test('task-finish 保持薄入口并把证据政策交给 provider', () => {
  assert.ok(finishSkill.length >= 1500 && finishSkill.length <= 2500);
  assert.ok(finishSkill.split('\n').length >= 30 && finishSkill.split('\n').length <= 50);
  for (const required of ['inspect|advance|resume', 'selected providers', 'fingerprint', 'effects', 'evidence', 'task-verification provider']) assert.ok(finishSkill.includes(required));
  assert.doesNotMatch(finishSkill, /instance\.json|archive-rehearsal\.mjs|buildr component check/);
  assert.match(finishSkill, /非空 fingerprint/);
  assert.match(finishSkill, /expected\/observed target ref/);
  assert.match(finishSkill, /holder\/token\/expiry fencing/);
});

test('OpenSpec apply 和 Task Finish 固定 canonical sync 的 guard 时序', () => {
  for (const required of [
    '不得在当前会话的 `pre-sync` contract guard 成功前', 'delta 预写入 canonical specs',
    'pre-sync 成功后', 'post-sync guard',
  ]) assert.ok(openSpecApplySidebar.includes(required), `OpenSpec apply sidebar must preserve sync sequencing: ${required}`);

  assert.match(finishSkill, /canonical、target、runtime 收敛后执行/);
});

test('已有 Candidate 进入收尾时按 transition class 去重 executor 调用', () => {
  assert.equal(closeoutFixtures.schemaVersion, 'buildr.task-verification-closeout-fixtures/v3');
  assert.deepEqual(closeoutFixtures.cases.map((item) => item.id), [
    'existing-candidate-same-content',
    'openspec-archive-only',
    'runtime-projection-only',
    'candidate-task-checkbox-only',
    'candidate-checkbox-with-extra-edit',
    'candidate-checkbox-ambiguous-task',
    'candidate-checkbox-cross-session-without-evidence',
    'implementation-changed-affected',
    'runtime-projection-with-source-edit',
    'implementation-changed-candidate',
    'target-ref-stable-after-final-assurance',
    'target-race-after-final-assurance',
    'rebase-conflict-resolution',
  ]);

  const [sameContent, archiveOnly, runtimeProjectionOnly, checkboxOnly, ...rest] = closeoutFixtures.cases;
  const stableTarget = rest.find((item) => item.id === 'target-ref-stable-after-final-assurance');
  const implementationChanges = rest.filter((item) => item.id !== stableTarget.id);
  for (const item of [sameContent, archiveOnly, runtimeProjectionOnly, checkboxOnly, stableTarget]) {
    assert.equal(item.taskVerificationExecuteCalls, 0, `${item.id} must not execute task verification`);
    assert.equal(item.candidateExecutorCalls, 0, `${item.id} must not execute Candidate`);
    assert.equal(item.candidateReused, true, `${item.id} must reuse Candidate evidence`);
    assert.ok(item.providerOperations.includes('inspect'), `${item.id} must inspect existing evidence`);
    assert.ok(!item.providerOperations.includes('execute'), `${item.id} must not request execute`);
  }
  assert.equal(sameContent.transitionClass, 'same-content');
  assert.equal(archiveOnly.transitionClass, 'closeout-metadata-only');
  assert.deepEqual(archiveOnly.closeoutChecks, ['openspec-strict', 'contract-guard', 'git-diff-check']);

  assert.equal(runtimeProjectionOnly.transitionClass, 'closeout-metadata-only');
  assert.equal(runtimeProjectionOnly.transitionSubtype, 'runtime-projection-only');
  assert.equal(runtimeProjectionOnly.syncSourceCaptured, true);
  assert.equal(runtimeProjectionOnly.implementationSourceUnchanged, true);
  assert.deepEqual(runtimeProjectionOnly.closeoutChecks, ['runtime-component-integrity', 'doctor', 'git-diff-check']);

  assert.equal(checkboxOnly.transitionClass, 'closeout-metadata-only');
  assert.equal(checkboxOnly.transitionSubtype, 'verification-result-metadata-only');
  assert.equal(checkboxOnly.transitionEvidenceRetention, 'session-only');
  assert.equal(checkboxOnly.sourceIdentityMatchesCandidate, true);
  assert.equal(checkboxOnly.targetIdentityCaptured, true);
  assert.equal(checkboxOnly.changeIdCaptured, true);
  assert.equal(checkboxOnly.taskIdentityCaptured, true);
  assert.equal(checkboxOnly.markerTransition, '- [ ] -> - [x]');
  assert.equal(checkboxOnly.onlyContentChange, true);

  for (const item of implementationChanges) {
    assert.equal(item.transitionClass, 'implementation-changed', `${item.id} must fail closed`);
    assert.deepEqual(item.providerOperations, ['execute', 'cleanup']);
    assert.equal(item.taskVerificationExecuteCalls, 1);
    assert.equal(item.candidateExecutorCalls, item.requiredAssurance === 'candidate' ? 1 : 0);
    assert.equal(item.candidateReused, false);
  }
  assert.equal(stableTarget.targetRefStable, true);
  assert.equal(closeoutFixtures.cases.find((item) => item.id === 'target-race-after-final-assurance').invalidationReason, 'target-race');
  assert.equal(closeoutFixtures.cases.find((item) => item.id === 'rebase-conflict-resolution').invalidationReason, 'implementation-changed');
});

test('Candidate task checkbox 复用必须由 Buildr sidebar 和 provider consumer 共同约束', () => {
  for (const required of [
    '先保持该任务为 `- [ ]`', 'source/target identity', '唯一变化',
    'verification-result-metadata-only', '不得仅凭最终 `tasks.md` 状态推断可复用性',
  ]) assert.ok(openSpecApplySidebar.includes(required), `OpenSpec apply sidebar must include ${required}`);

  for (const required of [
    'Project policy', 'verification-result-metadata-only', 'session-only',
    '不得改写 `candidateIdentity`', '不得从路径、文件类型或最终 checkbox 状态反推可复用性',
  ]) assert.ok(verificationSkill.includes(required), `verification Skill must include ${required}`);
});

test('产品入口分别路由验证与 worktree lifecycle 意图', () => {
  assert.match(buildrSkill, /初始化\/更新测试声明、推进测试能力成熟度，或实现任务到达验证\/完成节点 \| `buildr\.task-verification\/v2` selected provider；用户无需主动点名该能力/);
  assert.match(buildrSkill, /清理单仓\/多仓 task environment \| `buildr\.task-worktree-lifecycle\/v2` selected provider/);
});
