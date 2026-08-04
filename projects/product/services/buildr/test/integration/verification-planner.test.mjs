import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  auditVerificationInputCoverage,
  createVerificationPreflightPlan,
  createVerificationPlan,
  globToRegExp,
  matchesInput,
  normalizeProductPath,
  validateVerificationRegistry,
} from '../../test/verification/planner.mjs';
import { VERIFICATION_STEP_TESTING, verificationSteps } from '../../test/verification/registry.mjs';

const productRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ids = (plan) => plan.steps.map((step) => step.id);

test('统一 registry 固化 fast 与 Candidate required gates', () => {
  const validation = validateVerificationRegistry();
  assert.deepEqual(validation, { ok: true, findings: [] });
  assert.equal(new Set(verificationSteps.map((step) => step.id)).size, verificationSteps.length);
  assert.deepEqual(Object.keys(VERIFICATION_STEP_TESTING).sort(), verificationSteps.map((step) => step.id).sort());
  assert.deepEqual(ids(createVerificationPlan({ profiles: ['fast'] })), [
    'unit', 'component', 'contract', 'cli-architecture', 'openspec-spec-quality', 'openspec-strict', 'runtime-adapter-contract',
  ]);
  assert.deepEqual(ids(createVerificationPlan({ profiles: ['candidate'] })), [
    'unit', 'component', 'integration', 'contract', 'system', 'cli-architecture', 'openspec-spec-quality', 'openspec-strict', 'runtime-adapter-contract',
    'integration-candidate-recovery', 'concurrent-task-acceptance', 'candidate-tarball', 'open-source-candidate',
    'openspec-candidate-audit', 'managed-mutations', 'capability-cli-integration', 'commands-cli-integration',
    'openspec-contract-fixtures', 'openspec-convergence-recovery', 'package-static', 'package-workspace', 'package-commands', 'package-rules', 'package-skills',
    'package-runtime', 'runtime-adapter-parity', 'workspace-lifecycle', 'ownership-recovery', 'runtime-reconciliation',
    'init-onboarding', 'cli-compatibility', 'cli-package-parity', 'service-branch-contract',
    'remote-skill-timeout', 'release-tarball-smoke', 'managed-data-integrity', 'docs-quality',
  ]);
});

test('Project Testing 分类完整且 Quick 只包含低成本非 System step', () => {
  for (const step of verificationSteps) {
    assert.ok(step.testing.ownerScope);
    assert.ok(step.testing.primaryIntent);
    assert.ok(step.testing.executionBoundary);
    assert.equal(Object.hasOwn(step.testing, 'orchestrationScenarios'), false);
    assert.ok(step.testing.targetDurationMs > 0);
    assert.ok(step.testing.proves);
    assert.ok(step.testing.primaryEvidenceOwner);
  }
  const quick = createVerificationPlan({ profiles: ['fast'] }).steps;
  assert.ok(quick.some((step) => step.testing.executionBoundary === 'Component'));
  assert.ok(quick.some((step) => step.testing.executionBoundary === 'Integration'));
  assert.equal(quick.some((step) => step.testing.executionBoundary === 'System'), false);
  assert.equal(quick.some((step) => step.testing.targetDurationMs > 15000), false);
  assert.deepEqual(verificationSteps.find((step) => step.id === 'contract').testing, {
    ownerScope: 'project:product', primaryIntent: 'Static Conformance', executionBoundary: 'Integration',
    targetDurationMs: 15000,
    proves: 'Product source, governance assets, and stable entrypoint contracts conform.', primaryEvidenceOwner: 'contract',
  });
  assert.deepEqual(verificationSteps.find((step) => step.id === 'integration-candidate-release').profiles, []);
  assert.deepEqual(verificationSteps.find((step) => step.id === 'repository-onboarding').profiles, []);
  assert.equal(verificationSteps.find((step) => step.id === 'integration-task-finish').testing.primaryEvidenceOwner, 'integration');
  assert.equal(verificationSteps.find((step) => step.id === 'system-task-finish').testing.primaryEvidenceOwner, 'system');
  assert.equal(verificationSteps.some((step) => step.id.startsWith('browser-')), false);
});

test('Product path 和 glob matcher 在 Node 20 语义下稳定工作', () => {
  assert.equal(normalizeProductPath('./docs/guide.md'), 'docs/guide.md');
  assert.throws(() => normalizeProductPath('../outside'), /escapes root/);
  assert.throws(() => normalizeProductPath('/tmp/file'), /Invalid Product path/);
  assert.match('docs/nested/guide.md', globToRegExp('**/*.md'));
  assert.equal(matchesInput('src/application/domains/rules.mjs', 'src/**/*.mjs'), true);
  assert.equal(matchesInput('bin/buildr.mjs', 'src/**/*.mjs'), false);
});

test('docs-only changed plan 只选择轻量文档 owner', () => {
  const plan = createVerificationPlan({ paths: ['docs/buildr-product.md'] });
  assert.deepEqual(ids(plan), ['docs-quality']);
  assert.match(plan.steps[0].reasons[0], /docs\/buildr-product\.md matches/);
});

test('验证选择基础路径由同一 changed plan 扩展为完整回归', () => {
  const candidateIds = ids(createVerificationPlan({ profiles: ['candidate'] }));
  for (const path of ['verification.yml', 'test/verification/registry.mjs', 'test/verification/planner.mjs']) {
    const plan = createVerificationPlan({ paths: [path] });
    assert.deepEqual(ids(plan), candidateIds, `${path} must select the full registered regression`);
    assert.ok(plan.steps.every((step) => step.reasons.some((reason) => reason.includes('full-scope owner'))));
  }
});

test('candidate-aware preflight只选择登记的低成本直接契约', () => {
  const skill = createVerificationPreflightPlan({ paths: ['package/targets/workspace/skills/buildr/task-development/SKILL.md'] });
  assert.deepEqual(ids(skill), ['preflight-contract']);
  assert.equal(skill.steps[0].executor.file, 'test/contract/task-development.test.mjs');
  assert.deepEqual(ids(createVerificationPreflightPlan({ paths: ['docs/buildr-product.md'] })), []);
});

test('代表源码路径只选择真实 Changed owner 并排除无关重型 owner', () => {
  const cases = [
    {
      path: 'src/infrastructure/network/fetch-remote-text.mjs',
      required: ['system', 'remote-skill-timeout'],
      excluded: ['contract', 'cli-architecture', 'managed-mutations', 'capability-cli-integration', 'managed-data-integrity'],
    },
    {
      path: 'src/infrastructure/product-layout.mjs',
      required: ['system', 'cli-package-parity', 'release-tarball-smoke'],
      excluded: ['contract', 'cli-architecture', 'managed-mutations', 'capability-cli-integration', 'managed-data-integrity'],
    },
    {
      path: 'src/interfaces/cli/help.mjs',
      required: ['cli-architecture', 'commands-cli-integration', 'cli-compatibility', 'cli-package-parity', 'release-tarball-smoke'],
      excluded: ['contract', 'managed-mutations', 'capability-cli-integration', 'managed-data-integrity'],
    },
    {
      path: 'src/application/domains/workspace.mjs',
      required: ['commands-cli-integration', 'package-workspace', 'workspace-lifecycle', 'init-onboarding', 'service-branch-contract', 'managed-data-integrity'],
      excluded: ['contract', 'cli-architecture', 'managed-mutations', 'capability-cli-integration', 'cli-compatibility', 'cli-package-parity'],
    },
    {
      path: 'src/application/package-maintenance/builtin-replacement.mjs',
      required: ['unit', 'integration-candidate-recovery', 'managed-mutations', 'package-static', 'ownership-recovery', 'release-tarball-smoke', 'managed-data-integrity'],
      excluded: ['contract', 'cli-architecture', 'capability-cli-integration', 'cli-compatibility', 'cli-package-parity'],
    },
    {
      path: 'src/infrastructure/runtime/skills/publication.mjs',
      required: ['runtime-adapter-contract', 'managed-mutations', 'capability-cli-integration', 'package-skills', 'package-runtime', 'runtime-adapter-parity', 'runtime-reconciliation', 'managed-data-integrity'],
      excluded: ['contract', 'cli-architecture', 'integration-candidate-recovery', 'cli-compatibility', 'cli-package-parity', 'release-tarball-smoke'],
    },
  ];
  for (const sample of cases) {
    const planIds = ids(createVerificationPlan({ paths: [sample.path] }));
    for (const required of sample.required) assert.ok(planIds.includes(required), `${sample.path} must include ${required}`);
    for (const excluded of sample.excluded) assert.equal(planIds.includes(excluded), false, `${sample.path} must exclude ${excluded}`);
  }
});

test('local app Changed 路由只选择内部 owner，Browser 由独立 capability 拥有', () => {
  assert.deepEqual(ids(createVerificationPlan({ paths: ['src/interfaces/local-app/web/api-client.js'] })), ['unit', 'integration', 'system']);
  assert.deepEqual(ids(createVerificationPlan({ paths: ['src/interfaces/local-app/web/router.js'] })), ['unit', 'integration']);
  assert.deepEqual(ids(createVerificationPlan({ paths: ['src/interfaces/local-app/web/features/projects.js'] })), ['unit']);
  assert.deepEqual(ids(createVerificationPlan({ paths: ['src/interfaces/local-app/web/features/services.js'] })), ['unit']);
  assert.deepEqual(ids(createVerificationPlan({ paths: ['src/interfaces/local-app/web/features/tasks.js'] })), ['unit']);
  assert.deepEqual(ids(createVerificationPlan({ paths: ['src/interfaces/local-app/web/features/changes.js'] })), ['unit']);
  assert.deepEqual(ids(createVerificationPlan({ paths: ['src/interfaces/local-app/web/app.js'] })), ['unit']);
  assert.deepEqual(ids(createVerificationPlan({ paths: ['src/interfaces/local-app/web/features/workspaces.js'] })), ['unit']);
  assert.deepEqual(ids(createVerificationPlan({ paths: ['src/interfaces/local-app/runtime/instance-manager.mjs'] })), ['unit', 'integration', 'system']);
  const browserTest = createVerificationPlan({ paths: ['test/browser-smoke/local-app-browser.test.mjs'] });
  assert.deepEqual(ids(browserTest), []);
  assert.deepEqual(browserTest.delegated, [{ path: 'test/browser-smoke/local-app-browser.test.mjs', owners: ['product.browser-smoke'] }]);
});

test('OpenSpec 路径只选择真实 owner', () => {
  const openspec = ids(createVerificationPlan({ paths: ['openspec/specs/product-verification-quality/spec.md'] }));
  for (const required of ['openspec-spec-quality', 'openspec-strict', 'openspec-candidate-audit', 'docs-quality']) {
    assert.ok(openspec.includes(required), `OpenSpec plan must include ${required}`);
  }
  for (const excluded of ['openspec-contract-fixtures', 'openspec-convergence-recovery']) {
    assert.equal(openspec.includes(excluded), false, `canonical OpenSpec content must not select ${excluded}`);
  }
  assert.deepEqual(ids(createVerificationPlan({ paths: ['test/verification/openspec/spec-quality.mjs'] })), ['openspec-spec-quality']);
  assert.deepEqual(ids(createVerificationPlan({ paths: ['test/verification/openspec/contract-audit.mjs'] })), ['openspec-candidate-audit']);
  assert.deepEqual(ids(createVerificationPlan({ paths: ['test/verification/openspec/contract.mjs'] })), [
    'openspec-contract-fixtures', 'openspec-convergence-recovery',
  ]);
});

test('Task Finish affected 路径使用有界 Integration/System slice', () => {
  assert.deepEqual(ids(createVerificationPlan({ paths: ['src/application/task-finish/task-finish-application.mjs'] })), [
    'unit', 'integration-task-finish', 'system-task-finish',
  ]);
  assert.deepEqual(ids(createVerificationPlan({ paths: ['test/integration/task-finish-run.test.mjs'] })), [
    'integration-task-finish',
  ]);
  assert.deepEqual(ids(createVerificationPlan({ paths: ['test/system/task-finish-cli.test.mjs'] })), [
    'system-task-finish',
  ]);
  const skillPlan = ids(createVerificationPlan({ paths: ['package/targets/workspace/skills/buildr/task-finish/SKILL.md'] }));
  assert.deepEqual(skillPlan, [
    'contract', 'capability-cli-integration', 'package-static', 'package-skills', 'runtime-skill-projection', 'docs-quality',
  ]);
  assert.equal(skillPlan.includes('runtime-adapter-parity'), false);
  assert.deepEqual(ids(createVerificationPlan({ paths: ['package/targets/workspace/skills/contracts/buildr/task-finish/v1.md'] })), [
    'contract', 'capability-cli-integration', 'package-static', 'package-skills', 'docs-quality',
  ]);
  assert.deepEqual(ids(createVerificationPlan({ paths: ['docs/cli-reference.md'] })), [
    'candidate-tarball', 'open-source-candidate', 'cli-compatibility', 'docs-quality',
  ]);
});

test('Task Finish 交付组合不会重新扩散到无关重型 owner', () => {
  const plan = createVerificationPlan({ paths: [
    'openspec/changes/archive/example/proposal.md',
    'openspec/specs/task-finish-execution/spec.md',
    'docs/cli-architecture.md',
    'docs/cli-reference.md',
    'docs/skill-capability-contracts.md',
    'package/targets/workspace/skills/buildr/task-finish/SKILL.md',
    'package/targets/workspace/skills/contracts/buildr/task-finish/v1.md',
    'src/application/task-finish/task-finish-application.mjs',
    'test/integration/task-finish-delivery-remote.test.mjs',
    'test/system/task-finish-product-journey.test.mjs',
  ] });
  assert.deepEqual(ids(plan), [
    'unit', 'integration-task-finish', 'contract', 'system-task-finish',
    'openspec-spec-quality', 'openspec-strict', 'candidate-tarball', 'open-source-candidate', 'openspec-candidate-audit',
    'capability-cli-integration', 'package-static', 'package-skills',
    'runtime-skill-projection', 'cli-compatibility', 'docs-quality',
  ]);
});

test('focus step 与 group 去重且只展开真实 artifact 依赖', () => {
  const plan = createVerificationPlan({ stepIds: ['release-tarball-smoke', 'release-tarball-smoke'], groups: ['release'] });
  assert.deepEqual(plan.stepIds, ['release-tarball-smoke']);
  assert.deepEqual(plan.groups, ['release']);
  assert.deepEqual(ids(plan), ['integration-candidate-release', 'candidate-tarball', 'open-source-candidate', 'release-tarball-smoke']);
  assert.equal(ids(plan).includes('unit'), false);
  assert.throws(() => createVerificationPlan({ stepIds: ['unknown'] }), /Unknown verification step/);
});

test('未映射 Product path fail closed', () => {
  assert.throws(() => createVerificationPlan({ paths: ['new-area/contract.bin'] }), /Unmapped Product paths/);
});

test('registry validation 在启动前拒绝重复、未知依赖、未知 executor 和 cycle', () => {
  const testing = {
    ownerScope: 'service:product/buildr', primaryIntent: 'Development', executionBoundary: 'Unit',
    targetDurationMs: 1000, proves: 'fixture', primaryEvidenceOwner: 'a',
  };
  const base = {
    name: 'step', executor: { type: 'node', file: 'x.mjs' }, profiles: [], groups: [], inputs: [], concurrencyClass: 'default', dependsOn: [], testing,
  };
  const invalid = [
    { ...base, id: 'a' },
    { ...base, id: 'c', dependsOn: ['d'] },
    { ...base, id: 'd', dependsOn: ['c'] },
    { ...base, id: 'a', executor: { type: 'mystery' }, schedulingCostMs: 0 },
  ];
  const result = validateVerificationRegistry(invalid);
  assert.equal(result.ok, false);
  for (const code of ['duplicate_or_missing_id', 'missing_inputs', 'unknown_executor', 'invalid_scheduling_cost', 'dependency_cycle']) {
    assert.ok(result.findings.some((finding) => finding.code === code), `missing ${code}`);
  }
});

test('registry validation 对缺失或非法 Project Testing 分类 fail closed', () => {
  const invalid = [{
    id: 'invalid-testing', name: 'invalid testing', executor: { type: 'node', file: 'x.mjs' }, profiles: ['fast'], groups: [], inputs: ['x.mjs'],
    concurrencyClass: 'default', dependsOn: [], testing: {
      ownerScope: 'unknown', primaryIntent: 'Unknown', executionBoundary: 'System',
      targetDurationMs: 20000, proves: '', primaryEvidenceOwner: 'missing',
    },
  }];
  const result = validateVerificationRegistry(invalid);
  for (const code of [
    'invalid_testing_owner', 'invalid_testing_intent', 'quick_system_boundary', 'quick_target_too_slow',
    'missing_testing_proves', 'unknown_primary_evidence_owner',
  ]) assert.ok(result.findings.some((finding) => finding.code === code), `missing ${code}`);
});

test('registry validation拒绝有副作用或无预算的preflight', () => {
  const invalid = [{
    id: 'unsafe', name: 'unsafe', executor: { type: 'node', file: 'x.mjs' }, profiles: [], groups: [], inputs: ['x.mjs'],
    concurrencyClass: 'default', dependsOn: [], preflight: { inputs: ['x.mjs'], executor: { type: 'node', file: 'x.mjs' }, sideEffects: 'shared', budgetMs: 0 },
  }];
  const result = validateVerificationRegistry(invalid);
  assert.ok(result.findings.some((finding) => finding.code === 'preflight_side_effects_unsafe'));
  assert.ok(result.findings.some((finding) => finding.code === 'preflight_budget_invalid'));
});

test('registry validation 拒绝非法 input exclusion 与 node-test files', () => {
  const testing = {
    ownerScope: 'service:product/buildr', primaryIntent: 'Development', executionBoundary: 'Integration',
    targetDurationMs: 1000, proves: 'fixture', primaryEvidenceOwner: 'invalid-slice',
  };
  const result = validateVerificationRegistry([
    {
      id: 'invalid-slice', name: 'invalid slice', executor: { type: 'node-test', files: [] }, profiles: [], groups: [], inputs: ['src/**'],
      inputExclusions: '../outside', concurrencyClass: 'default', dependsOn: [], testing,
    },
    {
      id: 'invalid-file', name: 'invalid file', executor: { type: 'node-test', files: ['../outside.test.mjs'] }, profiles: [], groups: [], inputs: ['test/**'],
      inputExclusions: [], concurrencyClass: 'default', dependsOn: [], testing: { ...testing, primaryEvidenceOwner: 'invalid-file' },
    },
  ]);
  assert.ok(result.findings.some((finding) => finding.code === 'invalid_input_exclusions'));
  assert.ok(result.findings.some((finding) => finding.code === 'node_test_files_missing'));
  assert.ok(result.findings.some((finding) => finding.code === 'node_test_file_invalid'));
});

test('registry validation 拒绝缺少 producer 依赖的 artifact consumer', () => {
  const definitions = [
    { id: 'artifact', name: 'artifact', executor: { type: 'candidate-artifact' }, profiles: [], groups: [], inputs: ['package.json'], concurrencyClass: 'default', dependsOn: [] },
    { id: 'consumer', name: 'consumer', executor: { type: 'node', file: 'x.mjs', consumesArtifact: true }, profiles: [], groups: [], inputs: ['x.mjs'], concurrencyClass: 'default', dependsOn: [] },
  ];
  const result = validateVerificationRegistry(definitions);
  assert.ok(result.findings.some((finding) => finding.code === 'missing_artifact_dependency' && finding.step === 'consumer'));
});

test('当前 Product inventory 每条路径都有 verifier owner 或显式 ignore', () => {
  const inventory = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: productRoot, encoding: 'utf8' })
    .split('\0')
    .filter((relative) => relative && fs.existsSync(path.join(productRoot, relative)));
  const audit = auditVerificationInputCoverage(inventory);
  assert.deepEqual(audit.unmapped, []);
  assert.ok(audit.delegated.some((item) => item.path === 'test/browser-smoke/local-app-browser.test.mjs' && item.owners.includes('product.browser-smoke')));
  assert.equal(audit.ok, true);
});
