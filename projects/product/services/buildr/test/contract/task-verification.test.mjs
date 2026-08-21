import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const productRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relative) => fs.readFileSync(path.join(productRoot, relative), 'utf8');

const contract = read('resources/workspace/skills/contracts/buildr/task-verification/v3.md');
const verificationSkill = read('resources/workspace/skills/buildr/task-verification/SKILL.md');
const verificationReference = read('resources/workspace/skills/buildr/task-verification/references/project-verification-v2.md');
const verificationTemplate = read('resources/workspace/skills/buildr/task-verification/templates/project-verification.yml');
const cliRegistry = read('src/bootstrap/cli/registry.mjs');
const cliReference = read('docs/cli-reference.md');
const jsonContracts = read('docs/json-contracts.md');
const worktreeSkill = read('resources/workspace/skills/buildr/task-worktree/SKILL.md');
const environmentSkill = read('resources/workspace/skills/buildr/task-environment/SKILL.md');
const gitOperationsContract = read('resources/workspace/skills/contracts/buildr/git-operations/v1.md');
const gitOperationsSkill = read('resources/workspace/skills/buildr/git-operations/SKILL.md');
const finishSkill = read('resources/workspace/skills/buildr/task-finish/SKILL.md');
const finishContract = read('resources/workspace/skills/contracts/buildr/task-finish/v1.md');
const finishExecutor = read('src/task/application/finish/task-finish-product-executor.mjs');
const developmentSkill = read('resources/workspace/skills/buildr/task-development/SKILL.md');
const developmentApplication = read('src/task/application/task-development-application.mjs');
const openSpecProposeSidebar = read('resources/workspace/components/buildr/openspec/contributions/openspec-propose-sidebar.md');
const openSpecUpdateSidebar = read('resources/workspace/components/buildr/openspec/contributions/openspec-update-sidebar.md');
const openSpecApplySidebar = read('resources/workspace/components/buildr/openspec/contributions/openspec-apply-sidebar.md');
const buildrSkill = read('package/targets/runtime/skills/buildr/SKILL.md');
const packageManifest = YAML.parse(read('resources/manifest.yml'));

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
    '`current`', '`stale`', '`unknown`', '单一SQLite transaction', 'coverage gap',
    'requiredForDelivery', 'Task Verification Application', '完整替换 current',
    '不得提交 declaration identity', '不得保存 stdout/stderr',
    'Task progression', '测试命令完整失败可以形成 `not-passed` Result',
    'exact invocation identity', '`opened_at DESC, record_id DESC`', '`not-started-existing-terminal`',
    '只有显式`--retry`', 'Execution Record readback不得创建、替换或充当current Verification Result',
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
    'Workspace本地current Result', 'buildr verification cleanup --summary <file>',
    '不用于设计测试框架、开发测试、生成 Candidate 或 Finish',
    'active优先', '`opened_at DESC, record_id DESC`', '`not-started-existing-terminal`', '显式追加`--retry`',
    '同一exact invocation独立新执行', '按新identity正常创建首次执行', '不重复播报“未传`--retry`”',
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
  for (const surface of [cliRegistry, cliReference]) {
    assert.match(surface, /active或terminal|active优先/);
    assert.match(surface, /--retry/);
  }
  assert.match(jsonContracts, /not-started-existing-terminal/);
  assert.match(jsonContracts, /executionIdentity: null/);
});

test('Application 是 current Result persistence 的唯一 writer/reader', () => {
  assert.deepEqual(runtimeCallSites('writeTaskVerificationResultPersistence'), ['src/task/application/task-verification-application.mjs']);
  assert.deepEqual(runtimeCallSites('readTaskVerificationResultPersistence'), ['src/task/application/task-verification-application.mjs']);
  const cli = read('src/task/interfaces/cli/task-verification.mjs');
  const server = read('src/interfaces/local-app/http/server.mjs');
  const http = read('src/task/interfaces/http/task-lifecycle-core.mjs');
  const taskDetail = read('../buildr-web/src/pages/TaskDetailPage.tsx');
  const evidenceTab = read('../buildr-web/src/pages/task-detail/EvidenceTab.tsx');
  assert.match(cli, /runtime\.inspectTaskVerification/);
  assert.match(cli, /runtime\.recordTaskVerification/);
  assert.match(cli, /--declaration-root/);
  assert.doesNotMatch(cli, /inspect: [^\n]*--declaration-root/);
  assert.match(cli, /operation === 'inspect'\s*\? new Set\(\['--target-identity', '--target', '--json'\]\)/);
  assert.doesNotMatch(cli, /node:fs|YAML|writeTaskVerificationResultPersistence/);
  assert.match(http, /task-verification\.http/);
  assert.match(http, /'verification'/);
  assert.match(server, /submitTaskRead: \(operation, taskId/);
  assert.doesNotMatch(server, /recordTaskVerification/);
  const readWorker = read('src/interfaces/local-app/http/read-worker.mjs');
  assert.match(readWorker, /verification:\s*'inspectTaskVerificationView'/);
  assert.doesNotMatch(taskDetail, /node:fs|YAML|recordTaskVerification|writeFileSync/);
  assert.doesNotMatch(evidenceTab, /node:fs|YAML|recordTaskVerification|writeFileSync/);
  assert.match(developmentApplication, /runtime\.inspectTaskVerification/);
  assert.doesNotMatch(developmentApplication, /runtime\.recordTaskVerification/);
  assert.doesNotMatch(finishExecutor, /inspectTaskVerification|recordTaskVerification/);
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

test('Git Operations 只返回操作 facts，不拥有 Verification Result 决策', () => {
  assert.match(gitOperationsContract, /操作前后 identity 与最小结果/);
  assert.match(gitOperationsContract, /不选择动作、目标或顺序/);
  assert.match(gitOperationsContract, /完整 commit range/);
  assert.match(gitOperationsSkill, /不判断 Review 或 Verification 是否仍有效/);
  assert.doesNotMatch(gitOperationsSkill, /改变已验证 tree 时，原验证结果失效/);
  assert.doesNotMatch(gitOperationsSkill, /集成前重新运行受影响的验证/);
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
  assert.match(packagedSkill.description, /稳定 Content Target/);
  assert.equal(packageManifest.workspaceFiles.some((entry) => String(entry).includes('task-verification/v2.md')), false);
  assert.equal(packageManifest.workspaceFiles.some((entry) => String(entry).includes('project-verification-v1.md')), false);
  assert.ok(packageManifest.workspaceFiles.some((entry) => String(entry).includes('task-verification/v3.md')));
  assert.ok(packageManifest.workspaceFiles.some((entry) => String(entry).includes('project-verification-v2.md')));

  assert.equal(packageManifest.capabilityContracts.find((item) => item.id === 'buildr.task-verification').version, 3);
  assert.equal(packageManifest.initialSkillBindings.find((item) => item.capability === 'buildr.task-verification').version, 3);
  assert.deepEqual(packageManifest.builtins.skills.find((item) => item.id === 'task-verification').provides, [{ capability: 'buildr.task-verification', version: 3 }]);
});

test('Task Finish 保持可选五阶段 handoff consumer 且不接管 Verification authority', () => {
  assert.ok(finishSkill.length >= 1500 && finishSkill.length <= 6000);
  assert.ok(finishSkill.split('\n').length >= 30 && finishSkill.split('\n').length <= 110);
  for (const required of [
    'preflight → prepare → verify → deliver → cleanup',
    'current Development handoff', '交付载体（Delivery Carrier）',
    'Task Contribution', '不运行或记录 Task Verification',
  ]) assert.ok(finishSkill.includes(required), `Finish Skill must include ${required}`);
  assert.match(finishContract, /只消费Development handoff/);
  assert.match(finishContract, /不得运行或记录Task Verification\/Task Review/);
  assert.doesNotMatch(finishContract, /task-verification\/v3|requiredForDelivery/);
  assert.doesNotMatch(finishSkill, /--required-assurance|--verification-summary/);
  assert.doesNotMatch(finishSkill, /current Verification Result|requiredForDelivery|formalVerificationExecutions <= 1/);
});

test('OpenSpec convergence 由 Development 前置收敛，Task Finish 不再调用', () => {
  for (const required of ['不把 delta 预写入 canonical specs', 'buildr openspec converge', '不得手工恢复canonical', '选择内部stage']) {
    assert.ok(openSpecApplySidebar.includes(required), `OpenSpec apply sidebar must preserve convergence boundary: ${required}`);
  }
  for (const sidebar of [openSpecProposeSidebar, openSpecUpdateSidebar, openSpecApplySidebar]) {
    for (const required of ['Change disposition', 'Formal Development', 'Task Finish', 'Environment cleanup', 'Task terminal state']) {
      assert.ok(sidebar.includes(required), `OpenSpec sidebar must preserve checklist boundary: ${required}`);
    }
    assert.equal(sidebar.includes('Metadata Publication'), false, 'retired Metadata Publication must not remain in current OpenSpec sidebars');
  }
  assert.match(openSpecApplySidebar, /Convergence\/archive在Task Development观察stable Content Target/);
  assert.match(openSpecApplySidebar, /change-checklist-incomplete/);
  assert.doesNotMatch(openSpecApplySidebar, /Canonical sync\/archive 只由 Task Finish|完整 Candidate|current Task Verification Result/);
  assert.match(developmentSkill, /current knowledge 维护，以及每个关联 Change 的 deterministic convergence\/archive/);
  assert.doesNotMatch(finishExecutor, /openspec|archiveChange|legacyConvergence|openspecConverge/);
  assert.match(finishSkill, /preflight → prepare → verify → deliver → cleanup/);
});

test('产品入口分别路由 Task Verification、Environment 与 Git provider 意图', () => {
  assert.match(buildrSkill, /查看 current 验证结果.*`buildr\.task-verification\/v3` selected provider；不开发测试/);
  assert.match(buildrSkill, /正式 Task 准备、检查、恢复或清理实际执行环境 \| `buildr\.task-environment\/v1` selected provider/);
  assert.match(buildrSkill, /Git worktree\/provider evidence \| `buildr\.git-worktree-provider\/v1` selected provider/);
  assert.match(buildrSkill, /commit、push、commit\+push 或其他已选 Git Operation \| `buildr\.git-operations\/v1` selected provider/);
  assert.doesNotMatch(buildrSkill, /buildr\.task-worktree-lifecycle/);
});
