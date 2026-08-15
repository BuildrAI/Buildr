import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '../..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('Task Development 是唯一 Receipt/Candidate/generation/handoff Application authority', () => {
  const application = read('src/application/task-development/task-development-application.mjs');
  const repository = read('src/infrastructure/sqlite/task-development-repository.mjs');
  const composition = read('src/application/compose-runtime.mjs');
  assert.match(application, /observeTaskDevelopment/);
  assert.match(application, /freezeTaskDevelopmentCandidate/);
  assert.match(application, /createTaskDevelopmentHandoff/);
  assert.match(repository, /task_development_current/);
  assert.doesNotMatch(repository, /development\.yml|from ['"]yaml['"]|YAML\.(?:parse|stringify)/);
  assert.match(composition, /registerTaskDevelopmentApplication/);
  for (const forbidden of ['readTaskReviewResultPersistence', 'readTaskVerificationResultPersistence', 'writeTaskReviewResultPersistence', 'writeTaskVerificationResultPersistence']) assert.equal(application.includes(forbidden), false, forbidden);
  const writers = fs.readFileSync(path.join(root, 'src/application/task-development/task-development-application.mjs'), 'utf8').includes('writeTaskDevelopmentPersistence');
  assert.equal(writers, true);
  assert.match(application, /deriveFormalVerificationReadiness/);
  assert.match(application, /task_development_change_pending_for_content_target/);
  assert.match(application, /buildr\.current-knowledge-maintenance[\s\S]*version:\s*2/);
  const verification = read('src/application/verification/verification-application.mjs');
  assert.doesNotMatch(verification, /formalVerificationReadiness|current-knowledge-maintenance|change-disposition-pending/);
});

test('Candidate identity 不包含 Result 或 Delivery Carrier，handoff 才绑定 gates', () => {
  const domain = read('src/domain/task-development/task-development.mjs');
  const candidateBody = domain.slice(domain.indexOf('export function createTaskCandidate'), domain.indexOf('export function normalizeTaskCandidate'));
  for (const field of ['generation', 'contentTargetIdentity', 'taskContextIdentity', 'policyIdentity']) assert.ok(candidateBody.includes(field), field);
  for (const forbidden of ['resultDigest', 'planning', 'verification', 'completion', 'commit', 'branch', 'worktree']) assert.equal(candidateBody.includes(forbidden), false, forbidden);
  const handoffBody = domain.slice(domain.indexOf('export function createTaskFinishHandoff'), domain.indexOf('function normalizeHandoff'));
  assert.match(handoffBody, /normalizedGates/);
  assert.match(handoffBody, /normalizedDecision/);
});

test('不暴露 public Development CLI，Buildr Web 只读投影复用 Application inspect authority', () => {
  const registry = read('src/interfaces/cli/registry.mjs');
  const help = read('src/interfaces/cli/help.mjs');
  const server = read('src/interfaces/local-app/http/server.mjs');
  const skill = read('package/targets/workspace/skills/buildr/task-development/SKILL.md');
  assert.doesNotMatch(registry, /task development/);
  assert.doesNotMatch(help, /buildr task development/);
  assert.match(server, /\/tasks\/\(\$\{TASK_ID\}\)\/development/);
  assert.match(server, /submitTaskRead\(request, response, 'development', root, taskDevelopmentMatch\[1\]\)/);
  assert.doesNotMatch(server, /runtime\.(?:observe|record|freeze|decide|create)TaskDevelopment/);
  const readWorker = read('src/interfaces/local-app/http/read-worker.mjs');
  assert.match(readWorker, /development:\s*'inspectTaskDevelopmentView'/);
  assert.match(skill, /Buildr Web只消费Application `inspect`的只读投影/);
  assert.match(skill, /--compact/);
  assert.match(skill, /formalVerificationReadiness/);
  assert.match(skill, /focused\/affected\/unit\/integration/);
  assert.match(skill, /Task外transient `verification run`和Candidate CI不读取readiness/);
  assert.match(skill, /省略顶层`planning`时Application会在任何Receipt写入前失败关闭/);
  assert.doesNotMatch(skill, /没有 Buildr Web 专业投影/);
  assert.equal(fs.existsSync(path.join(root, 'src/interfaces/internal/task-development-driver.mjs')), true);
  const driver = read('src/interfaces/internal/task-development-driver.mjs');
  assert.match(driver, /buildr\.task-development-driver-profile\/v1/);
  assert.match(driver, /compactTaskDevelopmentOperationResult|buildr\.task-development-driver-compact\/v1/);
  assert.match(driver, /buildr\.task-development-driver-(?:help|schema|example)\/v1|taskDevelopmentDriverHelp/);
  assert.match(driver, /args\.includes\('--profile'\)/);
  assert.match(driver, /args\.includes\('--compact'\)/);
  assert.match(driver, /moduleLoadMs[\s\S]*compositionMs[\s\S]*applicationMs[\s\S]*serializationMs[\s\S]*totalMs/);
  const application = read('src/application/task-development/task-development-application.mjs');
  assert.match(application, /taskDevelopmentActionFields/);
  const operationContracts = read('src/application/task-development/task-development-operation-contracts.mjs');
  assert.match(operationContracts, /additionalProperties:\s*false/);
  assert.match(operationContracts, /buildr\.task-development-driver-schema\/v1/);
  const capabilityContract = read('package/targets/workspace/skills/contracts/buildr/task-development/v2.md');
  assert.match(capabilityContract, /buildr\.task-development-driver-compact\/v1/);
  assert.match(capabilityContract, /response-only Formal Verification readiness/);
  assert.match(capabilityContract, /不构成通用Verification executor硬门禁/);
  assert.match(capabilityContract, /字段omission不得表示清空、保留、patch或推断/);
});

test('Task Development action使用有界operation scope且不直接缓存专业repository', () => {
  const application = read('src/application/task-development/task-development-application.mjs');
  const sqlite = read('src/infrastructure/sqlite/workspace-sqlite.mjs');
  const taskRecord = read('src/application/task-record/task-record-application.mjs');
  const environment = read('src/application/task-environment/task-environment-application.mjs');
  assert.match(application, /withWorkspaceStructuredStoreOperation/);
  assert.match(sqlite, /operationScopes[\s\S]*finally[\s\S]*operationScopes\.pop/);
  assert.match(taskRecord, /memoizeWorkspaceOperation\(targetRoot, `task-record:inspect:/);
  assert.match(environment, /memoizeWorkspaceOperation\(targetRoot, `task-environment:inspect:/);
  assert.doesNotMatch(application, /readTaskReviewResultPersistence|readTaskVerificationResultPersistence|readTaskEnvironmentPersistence/);
});

test('v2 package声明精确退休v1 contract与binding', () => {
  const manifest = read('package/manifest.yml');
  assert.match(manifest, /id: buildr\.task-development[\s\S]*version: 2[\s\S]*replaces:[\s\S]*id: buildr\.task-development[\s\S]*version: 1[\s\S]*target: skills\/contracts\/buildr\/task-development\/v1\.md[\s\S]*provider: task-development/);
});

test('Development Application 不硬编码自举 Project、Git/OpenSpec 或测试技术栈', () => {
  const application = read('src/application/task-development/task-development-application.mjs');
  for (const forbidden of ['project=product', "'product'", 'service=buildr', "'buildr'", 'origin/dev', "'dev'", 'node_modules', "'npm'", 'git worktree', 'OpenSpec', 'verification registry']) assert.equal(application.includes(forbidden), false, forbidden);
  const observer = read('src/infrastructure/content/content-target-observer.mjs');
  assert.match(observer, /FILESYSTEM_CONTENT_OBSERVER/);
  assert.match(observer, /GIT_CONTENT_OBSERVER/);
});
