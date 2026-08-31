import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  auditDailyCoreReleaseEvidence,
  auditProductionOwnerCoverage,
  auditVerificationInputCoverage,
  admitVerificationPlanBudget,
  createVerificationAdmissionPlan,
  createVerificationEvidenceMap,
  createVerificationPreflightPlan,
  createVerificationPlan,
  createVerificationSelectionAudit,
  estimateVerificationPlan,
  globToRegExp,
  matchesInput,
  normalizeProductPath,
  validateVerificationRegistry,
} from '../../test/verification/planner.mjs';
import {
  INTEGRATION_GENERAL_EXCLUDED_FILES,
  INTEGRATION_PRIMARY_SLICES,
  VERIFICATION_DAILY_CORE_EXCLUSIONS,
  VERIFICATION_EXECUTION_PROFILES,
  VERIFICATION_CONCURRENCY,
  VERIFICATION_RESOURCE_CONTRACTS,
  VERIFICATION_STEP_TESTING,
  verificationSteps,
} from '../../test/verification/registry.mjs';
import { VERIFICATION_PRODUCTION_OWNER_ALLOWLIST } from '../../test/verification/ownership.mjs';
import { executePlan } from '../../test/verification/plan-runner.mjs';
import { CANDIDATE_TOTAL_BUDGET_MS, CORE_TOTAL_BUDGET_MS } from '../../test/verification/timing/budgets.mjs';

const productRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ids = (plan) => plan.steps.map((step) => step.id);

test('统一 registry 固化 fast、daily-full兼容core与Candidate required gates', () => {
  const validation = validateVerificationRegistry();
  assert.deepEqual(validation, { ok: true, findings: [] });
  assert.equal(new Set(verificationSteps.map((step) => step.id)).size, verificationSteps.length);
  assert.deepEqual(Object.keys(VERIFICATION_STEP_TESTING).sort(), verificationSteps.map((step) => step.id).sort());
  assert.deepEqual(Object.keys(VERIFICATION_RESOURCE_CONTRACTS).sort(), Object.keys(VERIFICATION_EXECUTION_PROFILES.local.resources).sort());
  assert.deepEqual(ids(createVerificationPlan({ profiles: ['fast'] })), [
    'typecheck', 'unit', 'component', 'contract', 'cli-architecture', 'openspec-spec-quality', 'openspec-strict',
  ]);
  assert.deepEqual(ids(createVerificationPlan({ profiles: ['candidate'] })), [
    'typecheck', 'unit', 'component', 'integration', 'integration-declarations', 'integration-openspec', 'integration-verification', 'integration-runtime', 'integration-release', 'integration-data-store', 'integration-task-environment', 'integration-self-bootstrap',
    'integration-task-read-models', 'integration-task-coordination', 'integration-project-daily-progress', 'integration-task-execution-records', 'integration-task-development', 'integration-task-finish', 'integration-task-finish-delivery', 'contract',
    'system-verification-admission', 'system-verification-contracts', 'system-public-json-contracts', 'system-openspec-contract-audit', 'system-workspace-lifecycle', 'system-task-lifecycle', 'system-worktree-lifecycle', 'system-runtime-recovery', 'system-buildr-web-http', 'system-app-process', 'system-task-finish-cli', 'system-fresh-build',
    'cli-architecture', 'openspec-spec-quality', 'openspec-strict', 'runtime-adapter-contract',
    'concurrent-task-acceptance', 'candidate-tarball',
    'application-payload-release', 'npm-launcher-candidate', 'open-source-candidate',
    'openspec-candidate-audit', 'managed-mutations', 'capability-cli-integration', 'commands-cli-integration',
    'openspec-contract-fixtures', 'openspec-convergence-recovery', 'package-static', 'package-workspace', 'package-commands', 'package-rules', 'package-skills',
    'package-runtime', 'runtime-adapter-parity', 'workspace-lifecycle', 'ownership-recovery', 'runtime-reconciliation',
    'init-onboarding', 'cli-compatibility', 'cli-package-parity', 'service-branch-contract',
    'remote-skill-timeout', 'release-tarball-smoke', 'managed-data-integrity', 'docs-quality',
  ]);
  const coreIds = ids(createVerificationPlan({ profiles: ['core'] }));
  const candidateIds = ids(createVerificationPlan({ profiles: ['candidate'] }));
  assert.deepEqual(candidateIds.filter((id) => !coreIds.includes(id)).sort(), Object.keys(VERIFICATION_DAILY_CORE_EXCLUSIONS).sort());
  assert.ok(coreIds.every((id) => candidateIds.includes(id)));
});

test('三轴选择反例保持affected默认、authority Full与Release-only隔离', () => {
  const local = createVerificationPlan({ paths: ['src/task/domain/task-record.mjs'] });
  assert.equal(local.status, 'ready');
  assert.equal(local.scope.mode, 'affected');
  assert.ok(local.scope.reasons.every((reason) => reason.code === 'affected-owner'));
  const executionAuthority = createVerificationPlan({ paths: ['test/verification/planner.mjs'] });
  assert.equal(executionAuthority.scope.mode, 'full');
  assert.equal(executionAuthority.scope.reasons[0].code, 'selection-authority-change');
  assert.equal(executionAuthority.scope.reasons[0].path, 'test/verification/planner.mjs');
  const dailyIds = ids(createVerificationPlan({ profiles: ['core'] }));
  const candidateIds = ids(createVerificationPlan({ profiles: ['candidate'] }));
  for (const releaseOnlyId of Object.keys(VERIFICATION_DAILY_CORE_EXCLUSIONS)) {
    assert.equal(dailyIds.includes(releaseOnlyId), false, releaseOnlyId);
    assert.equal(candidateIds.includes(releaseOnlyId), true, releaseOnlyId);
  }
});

test('日常Core慢owner形成闭合primary evidence map', () => {
  const evidence = createVerificationEvidenceMap();
  assert.equal(evidence.ok, true);
  assert.equal(evidence.findings.length, 0);
  assert.ok(evidence.entries.length > 20);
  for (const entry of evidence.entries) {
    assert.equal(entry.evidenceRole, 'primary');
    assert.equal(entry.primaryEvidenceOwner, entry.id);
    assert.ok(entry.publicOutcome.length > 20, entry.id);
    assert.ok(entry.counterexample.length > 20, entry.id);
    assert.ok(entry.retainedBoundary.length > 10, entry.id);
    assert.equal(entry.decision, 'retain-primary');
  }

  const owner = verificationSteps.find((step) => step.id === 'system-task-lifecycle');
  const invalid = { ...owner, testing: { ...owner.testing, evidence: { ...owner.testing.evidence, counterexample: '' } } };
  const validation = validateVerificationRegistry([invalid]);
  assert.ok(validation.findings.some((finding) => finding.step === owner.id && finding.code === 'slow_evidence_counterexample_missing'));
});

test('Release-only evidence不属于日常Core并与Candidate core shard命名分离', () => {
  const audit = auditDailyCoreReleaseEvidence();
  assert.equal(audit.ok, true);
  assert.equal(audit.dailyProfile, 'core');
  assert.equal(audit.candidateShardPrefixIsDailyProfile, false);
  assert.ok(audit.releaseOnlyStepIds.includes('candidate-tarball'));
  assert.ok(audit.releaseOnlyStepIds.includes('release-tarball-smoke'));

  const candidateTarball = verificationSteps.find((step) => step.id === 'candidate-tarball');
  const invalid = { ...candidateTarball, profiles: [...candidateTarball.profiles, 'core'] };
  assert.ok(auditDailyCoreReleaseEvidence([invalid]).findings.some((finding) => finding.code === 'release_only_step_in_daily_core'));
});

test('selection audit分离直接owner、依赖扩张与Full reason', () => {
  const affected = createVerificationPlan({ paths: ['docs/buildr-product.md'] });
  const affectedAudit = createVerificationSelectionAudit(affected);
  assert.deepEqual(affectedAudit.counts, {
    directOwners: 1, directHeavyOwners: 0, dependencies: 0, selectedSteps: 1, selectedHeavySteps: 0,
  });
  assert.equal(affectedAudit.selectionAmplification, 1);

  const full = createVerificationPlan({ paths: ['test/verification/registry.mjs'] });
  const fullAudit = createVerificationSelectionAudit(full);
  assert.equal(fullAudit.scope.mode, 'full');
  assert.ok(fullAudit.scope.reasons.some((reason) => reason.code === 'execution-graph-change'));
  assert.ok(fullAudit.counts.directOwners > 0);
  assert.ok(fullAudit.selectionAmplification > 1);
  assert.equal(fullAudit.selectedStepIds.length, createVerificationPlan({ profiles: ['core'] }).steps.length);
  assert.ok(fullAudit.stepSelections.every((step) => step.selectionKinds.includes('full-scope')));
  assert.ok(fullAudit.stepSelections.every((step) => typeof step.publicOutcome === 'string' && step.publicOutcome.length > 0));
  assert.equal(fullAudit.stepSelections[0].triggers.find((trigger) => trigger.kind === 'full-scope').reasons[0].pattern, 'test/verification/registry.mjs');
  assert.deepEqual(Object.keys(fullAudit.layerCounts), ['Static', 'Unit', 'Component', 'Integration', 'System']);
});

test('Candidate profile与changed development owner正交并按step identity去重', () => {
  const plan = createVerificationPlan({ profiles: ['candidate'], paths: ['test/integration-candidate-release/release.test.mjs', 'test/system/public-json-contracts.test.mjs'] });
  const selected = ids(plan);
  assert.equal(new Set(selected).size, selected.length);
  assert.equal(selected.filter((id) => id === 'system-verification-contracts').length, 1);
  assert.equal(selected.filter((id) => id === 'integration-candidate-release').length, 0);
  assert.equal(ids(createVerificationPlan({ groups: ['release'] })).filter((id) => id === 'integration-candidate-release').length, 1);
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
    assert.ok(step.testing.environment);
    assert.ok(Array.isArray(step.testing.environment.footprints));
    assert.ok(step.testing.environment.isolation);
    assert.ok(step.testing.resetBurden);
  }
  const quick = createVerificationPlan({ profiles: ['fast'] }).steps;
  assert.ok(quick.some((step) => step.testing.executionBoundary === 'Component'));
  assert.equal(quick.some((step) => step.testing.executionBoundary === 'System'), false);
  assert.equal(quick.some((step) => ['repeated-cleanup', 'lifecycle'].includes(step.testing.resetBurden)), false);
  assert.equal(quick.some((step) => step.testing.targetDurationMs > 15000), false);
  assert.deepEqual(verificationSteps.find((step) => step.id === 'contract').testing, {
    ownerScope: 'project:product', primaryIntent: 'Static Conformance', executionBoundary: 'Static',
    targetDurationMs: 5000,
    proves: 'Product source, governance assets, and stable entrypoint declarations conform without mutable fixtures.',
    environment: { footprints: ['filesystem'], isolation: 'read-only' }, resetBurden: 'none', primaryEvidenceOwner: 'contract',
  });
  assert.deepEqual(verificationSteps.find((step) => step.id === 'integration-candidate-release').profiles, []);
  assert.deepEqual(verificationSteps.find((step) => step.id === 'repository-onboarding').profiles, []);
  for (const slice of INTEGRATION_PRIMARY_SLICES) {
    assert.equal(verificationSteps.find((step) => step.id === slice.id).testing.primaryEvidenceOwner, slice.id);
  }
  for (const id of ['integration-task-environment', 'integration-task-finish-delivery', 'integration-candidate-release']) {
    const owner = verificationSteps.find((step) => step.id === id);
    assert.deepEqual(owner.resources, [], id);
    assert.equal(owner.testing.environment.isolation, 'unique-temporary-root', id);
    assert.equal(owner.testing.environment.footprints.includes('workspace-lifecycle'), false, id);
  }
  assert.equal(verificationSteps.some((step) => step.id === 'system-task-finish'), false);
  assert.equal(verificationSteps.some((step) => step.id.startsWith('browser-')), false);
});

test('Product path 和 glob matcher 在 Node 20 语义下稳定工作', () => {
  assert.equal(normalizeProductPath('./docs/guide.md'), 'docs/guide.md');
  assert.throws(() => normalizeProductPath('../outside'), /escapes root/);
  assert.throws(() => normalizeProductPath('/tmp/file'), /Invalid Product path/);
  assert.match('docs/nested/guide.md', globToRegExp('**/*.md'));
  assert.equal(matchesInput('src/agent-assets/application/rules.mjs', 'src/**/*.mjs'), true);
  assert.equal(matchesInput('bin/buildr.mjs', 'src/**/*.mjs'), false);
});

test('docs-only changed plan 只选择轻量文档 owner', () => {
  const plan = createVerificationPlan({ paths: ['docs/buildr-product.md'] });
  assert.deepEqual(ids(plan), ['docs-quality']);
  assert.match(plan.steps[0].reasons[0], /docs\/buildr-product\.md matches/);
});

test('migration变更选择读取全局migration集合的契约owner', () => {
  const plan = createVerificationPlan({ paths: ['src/infrastructure/sqlite/migrations/0015_add_task_execution_unknown_outcome.sql'] });
  assert.ok(ids(plan).includes('contract'));
});

test('受治理 publish workflow的开发反馈与Candidate Release evidence保持正交', () => {
  const workflow = '.github/workflows/publish.yml';
  const plan = createVerificationPlan({ paths: [workflow] });
  assert.deepEqual(ids(plan), ['contract']);
  const audit = auditVerificationInputCoverage([workflow]);
  assert.deepEqual(audit.mapped, [{
    path: workflow,
    owners: ['contract', 'candidate-tarball', 'application-payload-release', 'npm-launcher-candidate', 'open-source-candidate', 'release-tarball-smoke'],
  }]);
  const releaseFixture = createVerificationPlan({ paths: ['test/integration-candidate-release/release.test.mjs'] });
  assert.deepEqual(ids(releaseFixture), []);
  assert.deepEqual(releaseFixture.delegated, [{
    path: 'test/integration-candidate-release/release.test.mjs', owners: ['product.candidate-release'],
  }]);
  assert.throws(() => createVerificationPlan({ paths: ['.github/workflows/unowned.yml'] }), /Ungoverned repository path/);
});

test('selection、execution与ownership authority均以稳定reason扩展Full', () => {
  const coreIds = ids(createVerificationPlan({ profiles: ['core'] }));
  for (const path of ['verification.yml', 'test/verification/registry.mjs', 'test/verification/planner.mjs']) {
    const plan = createVerificationPlan({ paths: [path] });
    assert.deepEqual(ids(plan), coreIds, `${path} must select the daily core regression`);
    assert.ok(plan.steps.every((step) => step.reasons.some((reason) => reason.includes('full-scope owner'))));
  }
  const ownerOnly = createVerificationPlan({ paths: ['test/verification/ownership.mjs'] });
  assert.equal(ownerOnly.status, 'ready');
  assert.equal(ownerOnly.scope.mode, 'full');
  assert.deepEqual(ids(ownerOnly), coreIds);
  assert.deepEqual(ownerOnly.scope.reasons.map((reason) => reason.code), ['ownership-authority-change']);
  assert.deepEqual(createVerificationPlan({ paths: ['test/verification/registry.mjs'] }).scope.reasons.map((reason) => reason.code), ['execution-graph-change']);
  assert.deepEqual(createVerificationPlan({ paths: ['test/verification/planner.mjs'] }).scope.reasons.map((reason) => reason.code), ['selection-authority-change']);
  const timingOnly = createVerificationPlan({ paths: ['test/verification/timing/budgets.mjs'] });
  assert.equal(timingOnly.scope.mode, 'affected');
  assert.deepEqual(ids(timingOnly), ['system-verification-contracts']);
  const declarationMetadata = createVerificationPlan({
    paths: ['verification.yml'],
    selectionOnlyPaths: ['verification.yml'],
    selectionReasons: [{ path: 'verification.yml', code: 'verification-presentation-metadata-change' }],
  });
  assert.equal(declarationMetadata.scope.mode, 'affected');
  assert.deepEqual(declarationMetadata.scope.reasons.map((reason) => reason.code), ['verification-presentation-metadata-change']);
  assert.deepEqual(ids(declarationMetadata), ['contract']);
});

test('未知高风险production application path不会由通用Unit或架构owner静默兜底', () => {
  const plan = createVerificationPlan({ paths: ['src/task/application/unknown/unowned-high-risk.mjs'] });
  assert.equal(plan.status, 'blocked');
  assert.equal(plan.diagnostic.code, 'verification-owner-gap');
  assert.deepEqual(plan.productionOwnerGaps, [{
    path: 'src/task/application/unknown/unowned-high-risk.mjs',
    broadOwners: ['unit', 'cli-architecture'],
  }]);
});

test('生产源码必须命中直接领域 owner 或闭合 allowlist', () => {
  const productionFiles = ['src/infrastructure', 'src/task/application', 'src/task/persistence'].flatMap((root) => {
    const pending = [path.join(productRoot, root)];
    const files = [];
    while (pending.length > 0) {
      const current = pending.pop();
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const absolute = path.join(current, entry.name);
        if (entry.isDirectory()) pending.push(absolute);
        else if (entry.name.endsWith('.mjs')) files.push(path.relative(productRoot, absolute).replaceAll(path.sep, '/'));
      }
    }
    return files;
  }).sort();
  const audit = auditProductionOwnerCoverage(productionFiles);
  assert.equal(audit.ok, true, JSON.stringify(audit.gaps, null, 2));
  assert.deepEqual(VERIFICATION_PRODUCTION_OWNER_ALLOWLIST.map((item) => item.path).sort(), [
    'src/infrastructure/contracts/declaration-intake.mjs',
    'src/infrastructure/product-resources/index.mjs',
  ]);
  const unitAndComponentOnly = verificationSteps.filter((item) => ['unit', 'component', 'candidate-tarball', 'application-payload-release'].includes(item.id));
  assert.equal(auditProductionOwnerCoverage(['src/workspace/application/new-component-only.mjs'], unitAndComponentOnly).ok, false);
  assert.equal(auditProductionOwnerCoverage(['src/task/application/new-component-only.mjs'], unitAndComponentOnly).ok, false);
  assert.equal(auditProductionOwnerCoverage(['src/task/persistence/new-component-only.mjs'], unitAndComponentOnly).ok, false);
  const unknownProduction = createVerificationPlan({ paths: ['src/new-module/application/new-unowned-module.mjs'] });
  assert.equal(unknownProduction.status, 'blocked');
  assert.equal(unknownProduction.scope.mode, 'blocked');
  assert.equal(unknownProduction.diagnostic.code, 'verification-owner-gap');
  assert.deepEqual(ids(unknownProduction), []);
  assert.deepEqual(unknownProduction.productionOwnerGaps.map((item) => item.path), ['src/new-module/application/new-unowned-module.mjs']);
  assert.ok(ids(createVerificationPlan({ paths: ['src/task/application/task-record-new-use-case.mjs'] })).includes('system-task-lifecycle'));
});

test('Task Entry 与 Retrospective changed paths选择真实有界 Integration slice', () => {
  for (const source of [
    'src/task/application/task-entry-snapshot-application.mjs',
    'src/task/application/task-retrospective-application.mjs',
  ]) {
    const selected = ids(createVerificationPlan({ paths: [source] }));
    assert.ok(selected.includes('integration-task-read-models'), source);
    assert.equal(selected.includes('integration'), false, source);
  }
});

test('Integration primary slices 与 general exclusions来自同一唯一文件集合', () => {
  const sliceFiles = INTEGRATION_PRIMARY_SLICES.flatMap((slice) => slice.files);
  assert.equal(new Set(sliceFiles).size, sliceFiles.length);
  assert.deepEqual([...INTEGRATION_GENERAL_EXCLUDED_FILES].sort(), [...new Set([
    'test/integration/application-payload-release.test.mjs',
    'test/integration/npm-launcher.test.mjs',
    ...sliceFiles,
  ])].sort());
  const allFiles = fs.readdirSync(path.join(productRoot, 'test', 'integration'))
    .filter((name) => name.endsWith('.test.mjs'))
    .map((name) => `test/integration/${name}`)
    .sort();
  const generalFiles = allFiles.filter((file) => !INTEGRATION_GENERAL_EXCLUDED_FILES.includes(file));
  assert.ok(VERIFICATION_EXECUTION_PROFILES.local.innerConcurrency.integration <= generalFiles.length);
  assert.ok(VERIFICATION_EXECUTION_PROFILES.ci.innerConcurrency.integration <= generalFiles.length);
  for (const slice of INTEGRATION_PRIMARY_SLICES) assert.ok(slice.args.includes('--test-reporter=dot'), slice.id);
  const candidateOwners = new Map(allFiles.map((file) => [file, []]));
  for (const candidateStep of verificationSteps.filter((step) => step.profiles.includes('candidate'))) {
    const files = candidateStep.id === 'integration'
      ? generalFiles
      : (candidateStep.executor?.files ?? []).filter((file) => file.startsWith('test/integration/'));
    for (const file of files) candidateOwners.get(file)?.push(candidateStep.id);
  }
  for (const [file, owners] of candidateOwners) assert.equal(owners.length, 1, `${file}: ${owners.join(', ') || 'unowned'}`);
});

test('本地 changed/full plan 使用单一去重 admission DAG', () => {
  const docsPlan = createVerificationAdmissionPlan(createVerificationPlan({ paths: ['docs/buildr-product.md'] }));
  assert.deepEqual(docsPlan.admissionStepIds, ['typecheck', 'unit', 'component', 'contract', 'cli-architecture', 'openspec-spec-quality', 'openspec-strict']);
  assert.equal(new Set(ids(docsPlan)).size, docsPlan.steps.length);
  assert.deepEqual(docsPlan.steps.find((step) => step.id === 'docs-quality').dependsOn, docsPlan.admissionStepIds);
  assert.equal(ids(docsPlan).includes('system-verification-admission'), false);

  const candidate = createVerificationAdmissionPlan(createVerificationPlan({ profiles: ['candidate'] }));
  assert.ok(candidate.admissionStepIds.includes('system-verification-admission'));
  assert.ok(candidate.admissionStepIds.includes('integration-verification'));
  assert.ok(candidate.admissionStepIds.indexOf('integration-verification') < candidate.admissionStepIds.indexOf('system-verification-admission'));
  assert.equal(new Set(ids(candidate)).size, candidate.steps.length);
  for (const step of candidate.steps.filter((item) => !candidate.admissionStepIds.includes(item.id))) {
    for (const admission of candidate.admissionStepIds) assert.ok(step.dependsOn.includes(admission), `${step.id} waits for ${admission}`);
  }
});

test('candidate-aware preflight只选择登记的低成本直接契约', () => {
  const skill = createVerificationPreflightPlan({ paths: ['resources/workspace/skills/buildr/task-development/SKILL.md'] });
  assert.deepEqual(ids(skill), ['preflight-contract']);
  assert.equal(skill.steps[0].executor.file, 'test/contract/task-development.test.mjs');
  assert.deepEqual(ids(createVerificationPreflightPlan({ paths: ['docs/buildr-product.md'] })), []);
});

test('代表源码路径只选择真实 Changed owner 并排除无关重型 owner', () => {
  const cases = [
    {
      path: 'src/infrastructure/network/fetch-remote-text.mjs',
      required: ['system-runtime-recovery', 'remote-skill-timeout'],
      excluded: ['contract', 'cli-architecture', 'managed-mutations', 'capability-cli-integration', 'managed-data-integrity'],
    },
    {
      path: 'src/infrastructure/product-layout.mjs',
      required: ['system-workspace-lifecycle'],
      excluded: ['contract', 'cli-architecture', 'managed-mutations', 'capability-cli-integration', 'managed-data-integrity'],
    },
    {
      path: 'src/bootstrap/cli/help.mjs',
      required: ['cli-architecture', 'commands-cli-integration', 'cli-compatibility'],
      excluded: ['contract', 'managed-mutations', 'capability-cli-integration', 'managed-data-integrity'],
    },
    {
      path: 'src/workspace/interfaces/cli/workspace.mjs',
      required: ['managed-mutations', 'commands-cli-integration', 'workspace-lifecycle', 'init-onboarding', 'cli-compatibility', 'service-branch-contract', 'managed-data-integrity'],
      excluded: ['contract', 'cli-architecture', 'capability-cli-integration'],
    },
    {
      path: 'src/agent-assets/application/package-maintenance/builtin-replacement.mjs',
      required: ['unit', 'managed-mutations', 'ownership-recovery', 'managed-data-integrity'],
      excluded: ['contract', 'cli-architecture', 'capability-cli-integration', 'cli-compatibility', 'cli-package-parity'],
    },
    {
      path: 'src/agent-assets/infrastructure/runtime/skills/publication.mjs',
      required: ['runtime-adapter-contract', 'managed-mutations', 'capability-cli-integration', 'runtime-adapter-parity', 'runtime-reconciliation', 'managed-data-integrity'],
      excluded: ['contract', 'cli-architecture', 'cli-compatibility', 'cli-package-parity', 'release-tarball-smoke'],
    },
  ];
  for (const sample of cases) {
    const planIds = ids(createVerificationPlan({ paths: [sample.path] }));
    for (const required of sample.required) assert.ok(planIds.includes(required), `${sample.path} must include ${required}`);
    for (const excluded of sample.excluded) assert.equal(planIds.includes(excluded), false, `${sample.path} must exclude ${excluded}`);
  }
});

test('领域拆分后的 affected plan 只选择直接重型 owner', () => {
  const cases = [
    {
      path: 'src/verification/application/project-verification-diagnostics.mjs',
      required: ['integration-declarations'],
      excluded: ['integration', 'integration-openspec', 'integration-verification', 'integration-runtime', 'integration-release', 'integration-data-store'],
    },
    {
      path: 'src/task/openspec/application/projected-validator.mjs',
      required: ['integration-openspec', 'system-openspec-contract-audit'],
      excluded: ['integration', 'integration-declarations', 'integration-verification', 'system-verification-contracts', 'system-public-json-contracts'],
    },
    {
      path: 'src/agent-assets/infrastructure/runtime/skills/render-plan.mjs',
      required: ['integration-runtime'],
      excluded: ['integration', 'integration-declarations', 'integration-openspec', 'integration-verification', 'integration-release', 'integration-data-store'],
    },
    {
      path: 'src/infrastructure/sqlite/workspace-sqlite.mjs',
      required: ['integration-data-store'],
      excluded: ['integration', 'integration-runtime', 'integration-release', 'integration-task-development'],
    },
    {
      path: 'src/task/application/task-environment-application.mjs',
      required: ['integration-task-environment', 'system-worktree-lifecycle'],
      excluded: ['integration', 'integration-task-development', 'system-workspace-lifecycle', 'system-task-lifecycle'],
    },
    {
      path: 'src/task/infrastructure/git-worktree-provider.mjs',
      required: ['system-worktree-lifecycle'],
      excluded: ['system-workspace-lifecycle', 'system-task-lifecycle'],
    },
    {
      path: 'src/task/application/finish/task-finish-run.mjs',
      required: ['integration-task-finish', 'system-task-finish-cli'],
      excluded: ['integration-task-finish-delivery'],
    },
    {
      path: 'src/infrastructure/contracts/public-json.mjs',
      required: ['system-public-json-contracts', 'system-task-finish-cli'],
      excluded: ['system-verification-contracts', 'system-openspec-contract-audit'],
    },
    {
      path: 'src/workspace/application/project-daily-progress-application.mjs',
      required: ['integration-project-daily-progress'],
      excluded: ['integration', 'integration-task-coordination', 'integration-task-development'],
    },
  ];
  for (const sample of cases) {
    const planIds = ids(createVerificationPlan({ paths: [sample.path] }));
    for (const required of sample.required) assert.ok(planIds.includes(required), `${sample.path} must include ${required}`);
    for (const excluded of sample.excluded) assert.equal(planIds.includes(excluded), false, `${sample.path} must exclude ${excluded}`);
  }
});

test('Buildr Web Changed 路由只选择内部 owner，Browser 由独立 capability 拥有', () => {
  assert.deepEqual(ids(createVerificationPlan({ paths: ['services/buildr-web/src/api/client.ts'] })), ['unit', 'integration-runtime', 'system-buildr-web-http']);
  assert.deepEqual(ids(createVerificationPlan({ paths: ['services/buildr-web/src/App.tsx'] })), ['unit', 'integration-runtime']);
  assert.deepEqual(ids(createVerificationPlan({ paths: ['services/buildr-web/src/pages/ProjectsPage.tsx'] })), ['unit']);
  assert.deepEqual(ids(createVerificationPlan({ paths: ['services/buildr-web/src/pages/ServicesPage.tsx'] })), ['unit']);
  assert.deepEqual(ids(createVerificationPlan({ paths: ['services/buildr-web/src/pages/TasksPage.tsx'] })), ['unit', 'integration-runtime']);
  assert.deepEqual(ids(createVerificationPlan({ paths: ['services/buildr-web/src/pages/TaskDetailPage.tsx'] })), ['unit', 'integration-runtime']);
  assert.deepEqual(ids(createVerificationPlan({ paths: ['services/buildr-web/src/pages/TaskChangeDetailPage.tsx'] })), ['unit']);
  assert.deepEqual(ids(createVerificationPlan({ paths: ['services/buildr-web/src/main.tsx'] })), ['unit']);
  assert.deepEqual(ids(createVerificationPlan({ paths: ['services/buildr-web/src/pages/WorkspacesPage.tsx'] })), ['unit']);
  assert.deepEqual(ids(createVerificationPlan({ paths: ['src/web/infrastructure/instance-runtime.mjs'] })), [
    'unit', 'integration-runtime', 'system-app-process', 'cli-architecture',
  ]);
  const browserTest = createVerificationPlan({ paths: ['test/browser-smoke/buildr-web-browser.test.mjs'] });
  assert.deepEqual(ids(browserTest), []);
  assert.deepEqual(browserTest.delegated, [{ path: 'test/browser-smoke/buildr-web-browser.test.mjs', owners: ['product.browser-smoke'] }]);
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
  assert.deepEqual(ids(createVerificationPlan({ paths: ['src/task/application/finish/task-finish-application.mjs'] })), [
    'unit', 'integration-task-finish', 'system-task-finish-cli', 'cli-architecture',
  ]);
  assert.deepEqual(ids(createVerificationPlan({ paths: ['test/integration/task-finish-sqlite.test.mjs'] })), [
    'integration-task-finish',
  ]);
  assert.deepEqual(ids(createVerificationPlan({ paths: ['src/task/persistence/task-finish-repository.mjs'] })), [
    'unit', 'integration-task-finish', 'system-task-finish-cli', 'cli-architecture',
  ], 'Finish SQLite repository由直接Integration owner主证，不扩张到通用Task System或Release artifact');
  assert.deepEqual(ids(createVerificationPlan({ paths: ['test/system/task-finish-cli.test.mjs'] })), [
    'system-task-finish-cli',
  ]);
  const skillPlan = ids(createVerificationPlan({ paths: ['resources/workspace/skills/buildr/task-finish/SKILL.md'] }));
  assert.deepEqual(skillPlan, [
    'contract', 'cli-architecture', 'capability-cli-integration', 'runtime-skill-projection', 'docs-quality',
  ]);
  assert.equal(skillPlan.includes('runtime-adapter-parity'), false);
  assert.deepEqual(ids(createVerificationPlan({ paths: ['resources/workspace/skills/contracts/buildr/task-finish/v1.md'] })), [
    'contract', 'cli-architecture', 'capability-cli-integration', 'docs-quality',
  ]);
  assert.deepEqual(ids(createVerificationPlan({ paths: ['docs/cli-reference.md'] })), [
    'cli-compatibility', 'docs-quality',
  ]);
});

test('Task Development lifecycle 路径使用独立重型 Integration owner', () => {
  const sourcePlan = ids(createVerificationPlan({ paths: ['src/task/application/task-development-application.mjs'] }));
  assert.deepEqual(sourcePlan, [
    'unit', 'integration-task-development', 'system-task-lifecycle', 'cli-architecture',
  ]);
  assert.equal(sourcePlan.includes('integration'), false);
  assert.deepEqual(ids(createVerificationPlan({ paths: ['test/integration/task-development-application.test.mjs'] })), [
    'integration-task-development',
  ]);
  const owner = verificationSteps.find((step) => step.id === 'integration-task-development');
  assert.deepEqual(owner.resources, ['workspace-saturating', 'task-lifecycle-heavy']);
  assert.equal(owner.testing.executionBoundary, 'Integration');
});

test('Task Finish 交付组合不会重新扩散到无关重型 owner', () => {
  const plan = createVerificationPlan({ paths: [
    'openspec/changes/archive/example/proposal.md',
    'openspec/specs/task-finish-execution/spec.md',
    'docs/cli-architecture.md',
    'docs/cli-reference.md',
    'docs/skill-capability-contracts.md',
    'resources/workspace/skills/buildr/task-finish/SKILL.md',
    'resources/workspace/skills/contracts/buildr/task-finish/v1.md',
    'src/task/application/finish/task-finish-application.mjs',
    'test/integration/task-finish-retained-cleanup.test.mjs',
    'test/system/task-finish-cli.test.mjs',
  ] });
  assert.deepEqual(ids(plan), [
    'unit', 'integration-task-finish', 'integration-task-finish-delivery', 'contract', 'system-task-finish-cli',
    'cli-architecture', 'openspec-spec-quality', 'openspec-strict', 'openspec-candidate-audit',
    'capability-cli-integration',
    'runtime-skill-projection', 'cli-compatibility', 'docs-quality',
  ]);
});

test('focus step 与 group 去重且只展开真实 artifact 依赖', () => {
  const plan = createVerificationPlan({ stepIds: ['release-tarball-smoke', 'release-tarball-smoke'], groups: ['release'] });
  assert.deepEqual(plan.stepIds, ['release-tarball-smoke']);
  assert.deepEqual(plan.groups, ['release']);
  assert.deepEqual(ids(plan), [
    'integration-candidate-release', 'candidate-tarball', 'application-payload-release',
    'npm-launcher-candidate', 'open-source-candidate', 'release-tarball-smoke',
  ]);
  assert.equal(ids(plan).includes('unit'), false);
  assert.throws(() => createVerificationPlan({ stepIds: ['unknown'] }), /Unknown verification step/);
});

test('未知 Product path 在 admission 前阻断并保留 coverage gap', () => {
  const plan = createVerificationPlan({ paths: ['new-area/contract.bin'] });
  assert.equal(plan.status, 'blocked');
  assert.deepEqual(ids(plan), []);
  assert.equal(plan.scope.mode, 'blocked');
  assert.equal(plan.diagnostic.code, 'verification-owner-gap');
  assert.deepEqual(plan.diagnostic.unmapped, ['new-area/contract.bin']);
  assert.deepEqual(plan.unmapped, ['new-area/contract.bin']);
  const admitted = createVerificationAdmissionPlan(plan);
  assert.deepEqual(admitted.admissionStepIds, []);
  assert.deepEqual(ids(admitted), []);
});

test('verification plan estimator reports global, dependency, resource and budget admission constraints', () => {
  const plan = {
    status: 'ready',
    steps: [
      { id: 'prepare', budgetMs: 40, dependsOn: [], resources: ['workspace'] },
      { id: 'first', budgetMs: 80, dependsOn: ['prepare'], resources: ['workspace'] },
      { id: 'second', budgetMs: 60, dependsOn: ['prepare'], resources: [] },
    ],
  };
  const concurrency = { global: 2, resources: { workspace: 1 } };
  const estimate = estimateVerificationPlan(plan, { concurrency, declaredBudgetMs: 100 });
  assert.equal(estimate.totalTargetDurationMs, 180);
  assert.deepEqual(estimate.globalCapacity, { capacity: 2, lowerBoundMs: 90 });
  assert.deepEqual(estimate.dependencyCriticalPath, { durationMs: 120, stepIds: ['prepare', 'first'] });
  assert.deepEqual(estimate.resourceCapacityLowerBounds[0], {
    resource: 'workspace', capacity: 1, stepIds: ['prepare', 'first'], targetDurationMs: 120, lowerBoundMs: 120,
  });
  assert.equal(estimate.minimumFeasibleDurationMs, 120);
  assert.equal(estimate.feasible, false);
  const blocked = admitVerificationPlanBudget(plan, { concurrency, declaredBudgetMs: 100 });
  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.diagnostic.code, 'verification-budget-infeasible');
  const ready = admitVerificationPlanBudget(plan, { concurrency, declaredBudgetMs: 120 });
  assert.equal(ready.status, 'ready');
  assert.equal(ready.estimate.feasible, true);
  const missing = admitVerificationPlanBudget({ status: 'ready', steps: [{ id: 'missing', dependsOn: [], resources: [] }] }, { concurrency, declaredBudgetMs: 120 });
  assert.equal(missing.status, 'blocked');
  assert.equal(missing.diagnostic.code, 'verification-step-budget-missing');
  assert.deepEqual(missing.estimate.missingStepBudgets, ['missing']);
});

test('current Candidate budget is honest against the declared execution graph lower bound', () => {
  const candidate = createVerificationAdmissionPlan(createVerificationPlan({ profiles: ['candidate'] }));
  const oldAdmission = admitVerificationPlanBudget(candidate, { concurrency: VERIFICATION_CONCURRENCY, declaredBudgetMs: 120_000 });
  assert.equal(oldAdmission.status, 'blocked');
  assert.equal(oldAdmission.diagnostic.code, 'verification-budget-infeasible');
  assert.ok(oldAdmission.estimate.minimumFeasibleDurationMs > 120_000);
  const currentAdmission = admitVerificationPlanBudget(candidate, { concurrency: VERIFICATION_CONCURRENCY, declaredBudgetMs: CANDIDATE_TOTAL_BUDGET_MS });
  assert.equal(CANDIDATE_TOTAL_BUDGET_MS, 600_000);
  assert.equal(currentAdmission.status, 'ready');
  assert.equal(currentAdmission.estimate.feasible, true);
  assert.equal(currentAdmission.estimate.stepCount, candidate.steps.length);
  const core = createVerificationAdmissionPlan(createVerificationPlan({ profiles: ['core'] }));
  const coreAdmission = admitVerificationPlanBudget(core, { concurrency: VERIFICATION_CONCURRENCY, declaredBudgetMs: CORE_TOTAL_BUDGET_MS });
  assert.equal(CORE_TOTAL_BUDGET_MS, 360_000);
  assert.equal(coreAdmission.status, 'ready');
  assert.equal(coreAdmission.estimate.feasible, true);
  assert.ok(coreAdmission.estimate.minimumFeasibleDurationMs < currentAdmission.estimate.minimumFeasibleDurationMs);
});

test('blocked plan cannot construct or start an executor', async () => {
  const plan = createVerificationAdmissionPlan(createVerificationPlan({ paths: ['new-area/contract.bin'] }));
  let executorConstructed = false;
  await assert.rejects(
    executePlan(plan, {
      executorFactory() {
        executorConstructed = true;
        return async () => ({ status: 'passed' });
      },
    }),
    /explicit verification ownership/,
  );
  assert.equal(executorConstructed, false);
});

test('changed path scope matrix closes affected, full, delegated and ignored outcomes', () => {
  const affected = createVerificationPlan({ paths: ['src/domain/task-record/task-record.mjs'] });
  assert.equal(affected.scope.mode, 'affected');
  assert.deepEqual(affected.scope.reasons, [{ code: 'affected-owner', path: 'src/domain/task-record/task-record.mjs', owners: ['unit'] }]);
  assert.equal(ids(affected).includes('system-buildr-web-http'), false);

  const full = createVerificationPlan({ paths: ['test/verification/registry.mjs'] });
  assert.equal(full.scope.mode, 'full');
  assert.equal(new Set(ids(full)).size, ids(full).length);

  const delegated = createVerificationPlan({ paths: ['test/browser-smoke/buildr-web-browser.test.mjs'] });
  assert.equal(delegated.scope.mode, 'not-applicable');
  assert.deepEqual(delegated.delegated, [{ path: 'test/browser-smoke/buildr-web-browser.test.mjs', owners: ['product.browser-smoke'] }]);
  assert.deepEqual(ids(delegated), []);

  const ignored = createVerificationPlan({ paths: ['node_modules/example/index.mjs'] });
  assert.equal(ignored.scope.mode, 'not-applicable');
  assert.deepEqual(ignored.ignored, ['node_modules/example/index.mjs']);
  assert.deepEqual(ids(ignored), []);
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

test('registry validation 限制 admission 为低成本、隔离且无稀缺资源的失败前置门', () => {
  const invalid = [{
    id: 'heavy-admission', name: 'heavy admission', executor: { type: 'node', file: 'x.mjs' }, profiles: [], groups: [], inputs: ['x.mjs'],
    concurrencyClass: 'workspace-heavy', resources: ['workspace-saturating'], dependsOn: [], admission: true,
    testing: {
      ownerScope: 'project:product', primaryIntent: 'Development', executionBoundary: 'System',
      targetDurationMs: 20000, proves: 'fixture', primaryEvidenceOwner: 'heavy-admission',
      environment: { footprints: ['workspace-lifecycle'], isolation: 'unique-temporary-root' }, resetBurden: 'lifecycle',
    },
  }];
  const result = validateVerificationRegistry(invalid);
  for (const code of ['admission_target_too_slow', 'admission_workspace_lifecycle', 'admission_resource_claim']) {
    assert.ok(result.findings.some((finding) => finding.code === code), `missing ${code}`);
  }
});

test('资源claim必须匹配已声明的footprint、隔离与cleanup契约', () => {
  const owner = verificationSteps.find((step) => step.id === 'system-task-lifecycle');
  const invalid = {
    ...owner,
    testing: {
      ...owner.testing,
      environment: { footprints: ['filesystem'], isolation: 'read-only' },
      resetBurden: 'none',
    },
  };
  const result = validateVerificationRegistry([invalid]);
  for (const code of ['resource_footprint_mismatch', 'resource_isolation_mismatch', 'resource_cleanup_mismatch']) {
    assert.ok(result.findings.some((finding) => finding.code === code), `missing ${code}`);
  }
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
      inputExclusions: [], selection: 'implicit', concurrencyClass: 'default', dependsOn: [], testing: { ...testing, primaryEvidenceOwner: 'invalid-file' },
    },
  ]);
  assert.ok(result.findings.some((finding) => finding.code === 'invalid_input_exclusions'));
  assert.ok(result.findings.some((finding) => finding.code === 'node_test_files_missing'));
  assert.ok(result.findings.some((finding) => finding.code === 'node_test_file_invalid'));
  assert.ok(result.findings.some((finding) => finding.code === 'invalid_selection'));
});

test('执行真实Node测试文件的step必须自己持有primary evidence', () => {
  const owner = verificationSteps.find((step) => step.id === 'integration-task-development');
  const invalid = {
    ...owner,
    testing: { ...owner.testing, primaryEvidenceOwner: 'integration' },
  };
  const result = validateVerificationRegistry([invalid]);
  assert.ok(result.findings.some((finding) => (
    finding.step === invalid.id
    && finding.code === 'node_test_primary_evidence_owner_mismatch'
    && finding.value === 'integration'
  )));
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
  assert.ok(audit.delegated.some((item) => item.path === 'test/browser-smoke/buildr-web-browser.test.mjs' && item.owners.includes('product.browser-smoke')));
  assert.equal(audit.ok, true);
});
