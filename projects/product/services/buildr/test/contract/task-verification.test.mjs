import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const productRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relative) => fs.readFileSync(path.join(productRoot, relative), 'utf8');

const contract = read('package/targets/workspace/skills/contracts/buildr/task-verification/v3.md');
const verificationSkill = read('package/targets/workspace/skills/buildr/task-verification/SKILL.md');
const verificationReference = read('package/targets/workspace/skills/buildr/task-verification/references/project-verification-v2.md');
const verificationTemplate = read('package/targets/workspace/skills/buildr/task-verification/templates/project-verification.yml');
const worktreeSkill = read('package/targets/workspace/skills/buildr/task-worktree/SKILL.md');
const environmentSkill = read('package/targets/workspace/skills/buildr/task-environment/SKILL.md');
const gitIntegrationContract = read('package/targets/workspace/skills/contracts/buildr/git-task-integration/v1.md');
const gitOpsSkill = read('package/targets/workspace/skills/buildr/git-ops/SKILL.md');
const finishSkill = read('package/targets/workspace/skills/buildr/task-finish/SKILL.md');
const finishContract = read('package/targets/workspace/skills/contracts/buildr/task-finish/v1.md');
const finishExecutor = read('src/application/task-finish/task-finish-product-executor.mjs');
const openSpecApplySidebar = read('package/targets/workspace/components/buildr/openspec/contributions/openspec-apply-sidebar.md');
const buildrSkill = read('package/targets/runtime/skills/buildr/SKILL.md');
const packageManifest = YAML.parse(read('package/manifest.yml'));
const workspaceManifest = YAML.parse(read('package/targets/workspace/skills/manifest.yml'));

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(target);
    return /\.(?:mjs|js)$/.test(entry.name) ? [target] : [];
  });
}

function runtimeCallSites(call) {
  return sourceFiles(path.join(productRoot, 'src'))
    .filter((file) => fs.readFileSync(file, 'utf8').includes(`runtime.${call}(`))
    .map((file) => path.relative(productRoot, file).split(path.sep).join('/'))
    .sort();
}

test('task-verification v3 contract 只定义 Declaration 与 current Result authority', () => {
  assert.match(contract, /id: buildr\.task-verification/);
  assert.match(contract, /version: 3/);
  for (const required of [
    'buildr.project-verification/v2', 'buildr.task-verification-result/v1',
    'buildr.task-verification-operation-result/v1', 'transient Execution Evidence',
    '`current`', '`stale`', '`unknown`', 'atomic rename', 'coverage gap',
    'requiredForDelivery', 'Task Verification Application', '完整替换 current',
    '不得提交 declaration identity', '不得保存 stdout/stderr',
    'Task progression', '测试命令完整失败可以形成 `not-passed` Result',
  ]) assert.ok(contract.includes(required), `contract must include ${required}`);
  for (const forbidden of ['buildr.task-verification/v2', 'buildr.project-verification/v1', 'buildr.verification-run/v1', 'requiredAssurance', 'candidateCompleteness', 'mode: augment', 'mode: authoritative']) {
    assert.equal(contract.includes(forbidden), false, `contract must remove ${forbidden}`);
  }
});

test('默认 provider 使用 v2 declaration、transient execution 与 Application record', () => {
  for (const required of [
    '本 Skill 是 `buildr.task-verification/v3` 的默认 provider',
    'references/project-verification-v2.md', 'buildr.project-verification/v2',
    'buildr task verification inspect <task-id>', 'buildr verification run --project <code>',
    'buildr task verification record <task-id>', 'buildr.verification-execution/v1',
    '--declaration-root <task-environment-root>',
    '不自动创建测试、脚本、CI 或框架', '原子替换', '不得覆盖原 current',
    'portable current Result', 'buildr verification cleanup --summary <file>',
    '用户无需主动点名本 Skill',
  ]) assert.ok(verificationSkill.includes(required), `verification Skill must include ${required}`);
  for (const forbidden of ['buildr.task-verification/v2', 'buildr.project-verification/v1', 'buildr.verification-run/v1', 'requiredAssurance:', 'mode: augment', 'mode: authoritative']) {
    assert.equal(verificationSkill.includes(forbidden), false, `verification Skill must remove ${forbidden}`);
  }
  assert.match(verificationReference, /buildr\.project-verification\/v2/);
  assert.match(verificationReference, /没有能力时保留空 capabilities 或缺省文件/);
  const template = YAML.parse(verificationTemplate);
  assert.equal(template.schemaVersion, 'buildr.project-verification/v2');
  assert.deepEqual(Object.keys(template).sort(), ['capabilities', 'schemaVersion']);
  assert.equal(template.capabilities[0].requiredForDelivery, false);
  assert.equal(template.capabilities[0].invocation.kind, 'command');
  assert.equal(template.capabilities[0].scope.project, 'replace-with-project-code');
  assert.equal(Object.hasOwn(template.capabilities[0], 'resourceClaims'), false);
});

test('Application 是 current Result persistence 的唯一 writer/reader', () => {
  assert.deepEqual(runtimeCallSites('writeTaskVerificationResultPersistence'), ['src/application/task-verification/task-verification-application.mjs']);
  assert.deepEqual(runtimeCallSites('readTaskVerificationResultPersistence'), ['src/application/task-verification/task-verification-application.mjs']);
  const cli = read('src/interfaces/cli/task-verification.mjs');
  const server = read('src/interfaces/local-app/http/server.mjs');
  const taskDetail = read('src/interfaces/local-app/web/features/task-detail.js');
  assert.match(cli, /runtime\.inspectTaskVerification/);
  assert.match(cli, /runtime\.recordTaskVerification/);
  assert.match(cli, /--declaration-root/);
  assert.doesNotMatch(cli, /node:fs|YAML|writeTaskVerificationResultPersistence/);
  assert.match(server, /runtime\.inspectTaskVerification/);
  assert.doesNotMatch(server, /recordTaskVerification/);
  assert.doesNotMatch(taskDetail, /node:fs|YAML|recordTaskVerification|writeFileSync/);
  assert.match(finishExecutor, /runtime\.inspectTaskVerification/);
  assert.match(finishExecutor, /runtime\.recordTaskVerification/);
  assert.doesNotMatch(finishExecutor, /verificationSummary|requiredAssurance|candidate-fingerprint|--level/);
});

test('Task Environment、Git provider 与 Task Verification 权限保持解耦', () => {
  assert.match(worktreeSkill, /`buildr\.git-worktree-provider\/v1` 的默认 provider/);
  assert.match(worktreeSkill, /只管理 Git checkout 和窄 Git evidence/);
  assert.match(worktreeSkill, /不判断 Task 是否 ready/);
  assert.match(worktreeSkill, /验证交给 `task-verification`/);
  assert.match(environmentSkill, /候选不能写 retained Workspace、其他 Task worktree 或共享 user runtime/);
  assert.match(verificationSkill, /不拥有 Task Environment/);
  assert.match(verificationSkill, /不要复制 stdout\/stderr、耗时、临时 evidence path、Environment Receipt/);
});

test('Git integration 只返回内容转换证据，不拥有 Verification Result 决策', () => {
  assert.match(gitIntegrationContract, /输入与最终 candidate content identity/);
  assert.match(gitIntegrationContract, /tree 等价性信号只描述 Git 操作效果/);
  assert.match(gitIntegrationContract, /验证 evidence 的有效性、复用或重跑由 task-verification provider 或其 consumer 决定/);
  assert.match(gitOpsSkill, /不执行项目 Candidate 验证/);
  assert.doesNotMatch(gitOpsSkill, /改变已验证 tree 时，原验证结果失效/);
  assert.doesNotMatch(gitOpsSkill, /集成前重新运行受影响的验证/);
});

test('随包 manifest 原子切换 v3 contract、provider、binding 与 reference', () => {
  const packagedContract = packageManifest.capabilityContracts.find((item) => item.id === 'buildr.task-verification');
  assert.equal(packagedContract.version, 3);
  assert.match(packagedContract.path, /task-verification\/v3\.md$/);
  assert.deepEqual(packagedContract.replaces, [{
    id: 'buildr.task-verification',
    version: 2,
    target: 'skills/contracts/buildr/task-verification/v2.md',
    integrity: 'sha256-030f4599e84bc24823fe95d93d3a8847335bcb6fa518fd229d8d15b364c9158e',
    provider: 'task-verification',
    description: '编排项目声明或既有政策定义的分层验证，并返回能力选择、候选身份、结果与真实耗时证据。',
  }]);
  assert.equal(packageManifest.initialSkillBindings.find((item) => item.capability === 'buildr.task-verification').version, 3);
  const packagedSkill = packageManifest.builtins.skills.find((item) => item.id === 'task-verification');
  assert.deepEqual(packagedSkill.provides, [{ capability: 'buildr.task-verification', version: 3 }]);
  assert.match(packagedSkill.description, /current 验证结果/);
  assert.match(packagedSkill.description, /正式 Task Verification Result/);
  assert.equal(packageManifest.workspaceFiles.some((entry) => String(entry).includes('task-verification/v2.md')), false);
  assert.equal(packageManifest.workspaceFiles.some((entry) => String(entry).includes('project-verification-v1.md')), false);
  assert.ok(packageManifest.workspaceFiles.some((entry) => String(entry).includes('task-verification/v3.md')));
  assert.ok(packageManifest.workspaceFiles.some((entry) => String(entry).includes('project-verification-v2.md')));

  assert.equal(workspaceManifest.contracts.find((item) => item.id === 'buildr.task-verification').version, 3);
  assert.equal(workspaceManifest.bindings.find((item) => item.capability === 'buildr.task-verification').version, 3);
  assert.deepEqual(workspaceManifest.skills.find((item) => item.id === 'task-verification').provides, [{ capability: 'buildr.task-verification', version: 3 }]);
});

test('Task Finish 保持五阶段薄 consumer 并复用唯一 Result authority', () => {
  assert.ok(finishSkill.length >= 1500 && finishSkill.length <= 5000);
  assert.ok(finishSkill.split('\n').length >= 30 && finishSkill.split('\n').length <= 90);
  for (const required of [
    'buildr.task-finish/v1', 'preflight → prepare → verify → deliver → cleanup',
    'current Verification Result digest/applicability', 'requiredForDelivery',
    '多 Project、Agent capability', 'formalVerificationExecutions <= 1',
  ]) assert.ok(finishSkill.includes(required), `Finish Skill must include ${required}`);
  assert.match(finishContract, /buildr\.task-verification\/v3/);
  assert.match(finishContract, /同一 Application inspect/);
  assert.match(finishContract, /原子 record Result/);
  assert.doesNotMatch(finishSkill, /--required-assurance|--verification-summary/);
  assert.doesNotMatch(finishContract, /affected.*candidate.*assurance/);
});

test('OpenSpec apply 和 Task Finish 保持单一 convergence 事务边界', () => {
  for (const required of ['不把 delta 预写入 canonical specs', 'buildr openspec converge', '不得手工恢复 canonical', '选择内部 stage']) {
    assert.ok(openSpecApplySidebar.includes(required), `OpenSpec apply sidebar must preserve convergence boundary: ${required}`);
  }
  assert.match(finishExecutor, /'openspec', 'converge'/);
  assert.match(finishSkill, /preflight → prepare → verify → deliver → cleanup/);
});

test('产品入口分别路由 Task Verification、Environment 与 Git provider 意图', () => {
  assert.match(buildrSkill, /查看 current 验证结果.*`buildr\.task-verification\/v3` selected provider；用户无需主动点名该能力/);
  assert.match(buildrSkill, /正式 Task 准备、检查、恢复或清理实际执行环境 \| `buildr\.task-environment\/v1` selected provider/);
  assert.match(buildrSkill, /Git worktree\/provider evidence \| `buildr\.git-worktree-provider\/v1` selected provider/);
  assert.doesNotMatch(buildrSkill, /buildr\.task-worktree-lifecycle/);
});
