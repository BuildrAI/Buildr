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
import { verificationSteps } from '../../test/verification/registry.mjs';

const productRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ids = (plan) => plan.steps.map((step) => step.id);

test('统一 registry 固化 fast 与 Candidate required gates', () => {
  const validation = validateVerificationRegistry();
  assert.deepEqual(validation, { ok: true, findings: [] });
  assert.equal(new Set(verificationSteps.map((step) => step.id)).size, verificationSteps.length);
  assert.deepEqual(ids(createVerificationPlan({ profiles: ['fast'] })), [
    'unit', 'contract', 'integration-fast', 'cli-architecture', 'openspec-spec-quality', 'openspec-strict', 'runtime-adapter-contract',
  ]);
  assert.deepEqual(ids(createVerificationPlan({ profiles: ['candidate'] })), [
    'unit', 'contract', 'integration-fast', 'cli-architecture', 'openspec-spec-quality', 'openspec-strict', 'runtime-adapter-contract',
    'integration-candidate-recovery', 'integration-candidate-release', 'candidate-tarball', 'open-source-candidate',
    'openspec-candidate-audit', 'managed-mutations', 'browser-shell', 'browser-project', 'browser-service', 'browser-change', 'capability-cli-integration', 'commands-cli-integration',
    'openspec-contract-fixtures', 'package-static', 'package-workspace', 'package-commands', 'package-rules', 'package-skills',
    'package-runtime', 'runtime-adapter-parity', 'workspace-lifecycle', 'ownership-recovery', 'runtime-reconciliation',
    'repository-onboarding', 'init-onboarding', 'cli-compatibility', 'cli-package-parity', 'service-branch-contract',
    'remote-skill-timeout', 'release-tarball-smoke', 'managed-data-integrity', 'docs-quality',
  ]);
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

test('candidate-aware preflight只选择登记的低成本直接契约', () => {
  const skill = createVerificationPreflightPlan({ paths: ['package/targets/workspace/skills/buildr/task-finish/SKILL.md'] });
  assert.deepEqual(ids(skill), ['preflight-contract']);
  assert.equal(skill.steps[0].executor.file, 'test/contract/task-finish-sequencing.test.mjs');
  assert.deepEqual(ids(createVerificationPreflightPlan({ paths: ['docs/buildr-product.md'] })), []);
});

test('代表源码路径只选择真实 Changed owner 并排除无关重型 owner', () => {
  const cases = [
    {
      path: 'src/infrastructure/network/fetch-remote-text.mjs',
      required: ['integration-fast', 'remote-skill-timeout'],
      excluded: ['contract', 'cli-architecture', 'managed-mutations', 'capability-cli-integration', 'managed-data-integrity'],
    },
    {
      path: 'src/infrastructure/product-layout.mjs',
      required: ['integration-fast', 'cli-package-parity', 'release-tarball-smoke'],
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

test('local app Changed 路由只选择对应 integration 边界', () => {
  assert.deepEqual(ids(createVerificationPlan({ paths: ['src/interfaces/local-app/web/api-client.js'] })), ['unit', 'integration-fast']);
  assert.deepEqual(ids(createVerificationPlan({ paths: ['src/interfaces/local-app/web/router.js'] })), ['unit', 'browser-shell']);
  assert.deepEqual(ids(createVerificationPlan({ paths: ['src/interfaces/local-app/web/features/projects.js'] })), ['browser-project']);
  assert.deepEqual(ids(createVerificationPlan({ paths: ['src/interfaces/local-app/web/features/services.js'] })), ['browser-service']);
  assert.deepEqual(ids(createVerificationPlan({ paths: ['src/interfaces/local-app/web/features/changes.js'] })), ['browser-change']);
  assert.deepEqual(ids(createVerificationPlan({ paths: ['src/interfaces/local-app/web/app.js'] })), ['browser-shell']);
  assert.deepEqual(ids(createVerificationPlan({ paths: ['src/interfaces/local-app/web/features/workspaces.js'] })), ['browser-shell']);
  assert.deepEqual(ids(createVerificationPlan({ paths: ['src/interfaces/local-app/runtime/instance-manager.mjs'] })), ['integration-fast']);
});

test('OpenSpec 路径只选择真实 owner', () => {
  const openspec = ids(createVerificationPlan({ paths: ['openspec/specs/product-verification-quality/spec.md'] }));
  for (const required of ['openspec-spec-quality', 'openspec-strict', 'openspec-candidate-audit', 'openspec-contract-fixtures', 'docs-quality']) {
    assert.ok(openspec.includes(required), `OpenSpec plan must include ${required}`);
  }
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
  const base = {
    name: 'step', executor: { type: 'node', file: 'x.mjs' }, profiles: [], groups: [], inputs: [], concurrencyClass: 'default', dependsOn: [],
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

test('registry validation拒绝有副作用或无预算的preflight', () => {
  const invalid = [{
    id: 'unsafe', name: 'unsafe', executor: { type: 'node', file: 'x.mjs' }, profiles: [], groups: [], inputs: ['x.mjs'],
    concurrencyClass: 'default', dependsOn: [], preflight: { inputs: ['x.mjs'], executor: { type: 'node', file: 'x.mjs' }, sideEffects: 'shared', budgetMs: 0 },
  }];
  const result = validateVerificationRegistry(invalid);
  assert.ok(result.findings.some((finding) => finding.code === 'preflight_side_effects_unsafe'));
  assert.ok(result.findings.some((finding) => finding.code === 'preflight_budget_invalid'));
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
  assert.equal(audit.ok, true);
});
