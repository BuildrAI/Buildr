import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '../..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('Task Development 是唯一 Receipt/Candidate/generation/handoff Application authority', () => {
  const application = read('src/task/application/task-development-application.mjs');
  const repository = read('src/task/persistence/task-development-repository.mjs');
  const composition = read('src/task/module.mjs');
  assert.match(application, /observeTaskDevelopment/);
  assert.match(application, /freezeTaskDevelopmentCandidate/);
  assert.match(application, /createTaskDevelopmentHandoff/);
  assert.match(repository, /task_development_current/);
  assert.doesNotMatch(repository, /development\.yml|from ['"]yaml['"]|YAML\.(?:parse|stringify)/);
  assert.match(composition, /registerTaskDevelopmentApplication/);
  for (const forbidden of ['readTaskReviewResultPersistence', 'readTaskVerificationResultPersistence', 'writeTaskReviewResultPersistence', 'writeTaskVerificationResultPersistence']) assert.equal(application.includes(forbidden), false, forbidden);
  const writers = fs.readFileSync(path.join(root, 'src/task/application/task-development-application.mjs'), 'utf8').includes('writeTaskDevelopmentPersistence');
  assert.equal(writers, true);
  assert.match(application, /deriveFormalVerificationReadiness/);
  assert.match(application, /task_development_change_pending_for_content_target/);
  assert.match(application, /buildr\.current-knowledge-maintenance[\s\S]*version:\s*2/);
  const verification = read('src/verification/application/verification-application.mjs');
  assert.doesNotMatch(verification, /formalVerificationReadiness|current-knowledge-maintenance|change-disposition-pending/);
});

test('Candidate identity 不包含 Result 或 Delivery Carrier，handoff 才绑定 gates', () => {
  const domain = read('src/task/domain/task-development.mjs');
  const candidateBody = domain.slice(domain.indexOf('export function createTaskCandidate'), domain.indexOf('export function normalizeTaskCandidate'));
  for (const field of ['generation', 'contentTargetIdentity', 'taskContextIdentity', 'policyIdentity']) assert.ok(candidateBody.includes(field), field);
  for (const forbidden of ['resultDigest', 'planning', 'verification', 'completion', 'commit', 'branch', 'worktree']) assert.equal(candidateBody.includes(forbidden), false, forbidden);
  const handoffBody = domain.slice(domain.indexOf('export function createTaskFinishHandoff'), domain.indexOf('function normalizeHandoff'));
  assert.match(handoffBody, /normalizedGates/);
  assert.match(handoffBody, /normalizedDecision/);
});

test('不暴露 public Development CLI，Buildr Web 只读投影复用 Application inspect authority', () => {
  const registry = read('src/bootstrap/cli/registry.mjs');
  const help = read('src/bootstrap/cli/help.mjs');
  const server = read('src/web/http/server.mjs');
  const router = read('src/web/http/router.mjs');
  const http = read('src/task/interfaces/http/task-lifecycle-core.mjs');
  const skill = read('resources/workspace/skills/buildr/task-development/SKILL.md');
  assert.doesNotMatch(registry, /task development/);
  assert.doesNotMatch(help, /buildr task development/);
  assert.match(http, /task-development\.http/);
  assert.match(http, /'development'/);
  assert.match(router, /submitTaskRead\(request, response, operation, root, taskId/);
  assert.doesNotMatch(`${server}\n${router}`, /runtime\.(?:observe|record|freeze|decide|create)TaskDevelopment/);
  const readWorker = read('src/web/http/read-worker.mjs');
  assert.match(readWorker, /development:\s*'inspectTaskDevelopmentView'/);
  assert.match(skill, /Buildr Web只消费Application `inspect`的只读投影/);
  assert.match(skill, /--compact/);
  assert.match(skill, /formalVerificationReadiness/);
  assert.match(skill, /focused\/affected\/unit\/integration/);
  assert.match(skill, /Task外transient`verification run`和Candidate CI不读取readiness/);
  assert.match(skill, /省略顶层`planning`时Application会在任何Receipt写入前失败关闭/);
  assert.doesNotMatch(skill, /没有 Buildr Web 专业投影/);
  assert.equal(fs.existsSync(path.join(root, 'src/task/interfaces/internal/task-development-driver.mjs')), true);
  const driverRunner = read('src/task/interfaces/internal/task-development-driver-runner.mjs');
  assert.match(driverRunner, /buildr\.task-development-driver-profile\/v1/);
  assert.match(driverRunner, /compactTaskDevelopmentOperationResult|buildr\.task-development-driver-compact\/v1/);
  assert.match(driverRunner, /buildr\.task-development-driver-(?:help|schema|example)\/v1|taskDevelopmentDriverHelp/);
  assert.match(driverRunner, /args\.includes\('--profile'\)/);
  assert.match(driverRunner, /args\.includes\('--compact'\)/);
  assert.match(driverRunner, /moduleLoadMs[\s\S]*compositionMs[\s\S]*applicationMs[\s\S]*serializationMs[\s\S]*totalMs/);
  const main = read('src/bootstrap/cli/main.mjs');
  const routes = read('src/task/module.mjs');
  const routerSource = read('src/task/interfaces/internal/workflow-route-router.mjs');
  const inventory = read('src/task/contracts/internal-workflow-route-catalog.mjs');
  assert.match(main, /__internal[\s\S]*runRequiredInternalWorkflowRoute/);
  assert.match(routes, /task-development[\s\S]*runTaskDevelopmentDriver/);
  assert.match(routerSource, /REQUIRED_ROUTE_IDS[\s\S]*runners\?\.\[route\]/);
  assert.match(inventory, /id: 'task-development'/);
  const application = read('src/task/application/task-development-application.mjs');
  assert.match(application, /taskDevelopmentActionFields/);
  const operationContracts = read('src/task/application/task-development-operation-contracts.mjs');
  assert.match(operationContracts, /additionalProperties:\s*false/);
  assert.match(operationContracts, /buildr\.task-development-driver-schema\/v1/);
  const capabilityContract = read('resources/workspace/skills/contracts/buildr/task-development/v2.md');
  assert.match(capabilityContract, /buildr\.task-development-driver-compact\/v1/);
  assert.match(capabilityContract, /response-only Formal Verification readiness/);
  assert.match(capabilityContract, /current Candidate已就绪且Verification缺失报告`ready`/);
  assert.match(capabilityContract, /字段omission不得表示清空、保留、patch或推断/);
});

test('Task Development action使用有界operation scope且不直接缓存专业repository', () => {
  const application = read('src/task/application/task-development-application.mjs');
  const sqlite = read('src/infrastructure/sqlite/workspace-sqlite.mjs');
  const taskRecord = read('src/task/application/task-record-application.mjs');
  const environment = read('src/task/application/task-environment-application.mjs');
  assert.match(application, /withWorkspaceStructuredStoreOperation/);
  assert.match(sqlite, /operationScopes[\s\S]*finally[\s\S]*operationScopes\.pop/);
  assert.match(taskRecord, /memoizeWorkspaceOperation\(targetRoot, `task-record:inspect:/);
  assert.match(environment, /memoizeWorkspaceOperation\(targetRoot, `task-environment:inspect:/);
  assert.doesNotMatch(application, /readTaskReviewResultPersistence|readTaskVerificationResultPersistence|readTaskEnvironmentPersistence/);
});

test('v2 package声明精确退休v1 contract与binding', () => {
  const manifest = read('resources/manifest.yml');
  assert.match(manifest, /id: buildr\.task-development[\s\S]*version: 2[\s\S]*replaces:[\s\S]*id: buildr\.task-development[\s\S]*version: 1[\s\S]*target: skills\/contracts\/buildr\/task-development\/v1\.md[\s\S]*provider: task-development/);
});

test('Development Application 不硬编码自举 Project、Git/OpenSpec 或测试技术栈', () => {
  const application = read('src/task/application/task-development-application.mjs');
  for (const forbidden of ['project=product', "'product'", 'service=buildr', "'buildr'", 'origin/dev', "'dev'", 'node_modules', "'npm'", 'git worktree', 'OpenSpec', 'verification registry']) assert.equal(application.includes(forbidden), false, forbidden);
  const observer = read('src/task/infrastructure/content-target-observer.mjs');
  assert.match(observer, /FILESYSTEM_CONTENT_OBSERVER/);
  assert.match(observer, /GIT_CONTENT_OBSERVER/);
});

test('Task Development 不接管 Project 文本格式约定', () => {
  const skill = read('resources/workspace/skills/buildr/task-development/SKILL.md');
  const observer = read('src/task/infrastructure/content-target-observer.mjs');
  assert.doesNotMatch(skill, /EOF不变量|末尾空白行|最后一个非空字符/);
  assert.match(skill, /检查通过后，向Development Application提交完整Change dispositions并调用`observe`/);
  assert.match(observer, /'--cached', '--others', '--exclude-standard'/);
  assert.doesNotMatch(observer, /trailing-blank-line|missing-final-newline|修正.*EOF/u);
});
