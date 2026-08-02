import { PACKAGE_VERIFIERS } from '../../src/application/package-maintenance/verification-registry.mjs';

const step = (definition) => Object.freeze({
  dependsOn: [],
  profiles: [],
  groups: [],
  inputs: [],
  concurrencyClass: 'default',
  resources: [],
  preflight: null,
  ...definition,
});

const packageVerifier = (selector) => {
  const verifier = PACKAGE_VERIFIERS.find((item) => item.id === selector);
  if (!verifier) throw new Error(`Missing package verifier declaration: ${selector}`);
  return { name: verifier.name, executor: { type: 'package-selector', selector } };
};

const concurrency = (global, workspaceHeavy, workspaceSaturating) => Object.freeze({
  global,
  classes: Object.freeze({ default: global, 'cpu-heavy': 2, 'workspace-heavy': workspaceHeavy, network: 2, exclusive: 1 }),
  resources: Object.freeze({ 'workspace-saturating': workspaceSaturating, browser: 1 }),
});

export const VERIFICATION_EXECUTION_PROFILES = Object.freeze({
  local: concurrency(4, 3, 1),
  ci: concurrency(4, 3, 1),
  'ci-workspace-limited': concurrency(4, 2, 2),
});

export const VERIFICATION_CONCURRENCY = VERIFICATION_EXECUTION_PROFILES.local;

export function resolveVerificationExecutionProfile(value, env = process.env) {
  const id = value || (env.CI === 'true' ? 'ci' : 'local');
  const limits = VERIFICATION_EXECUTION_PROFILES[id];
  if (!limits) throw new Error(`Unknown verification execution profile: ${id}`);
  return { id, limits };
}

export const VERIFICATION_IGNORED_INPUTS = Object.freeze([
  'node_modules/**',
  '.buildr/**',
  '.gitignore',
]);

export const verificationSteps = Object.freeze([
  step({ id: 'unit', name: 'fine-grained unit tests', executor: { type: 'npm', args: ['run', 'test:unit'] }, profiles: ['fast', 'candidate'], inputs: [
    'test/unit/**',
    'src/application/domains/commands.mjs',
    'src/application/doctor/runtime-diagnostics.mjs',
    'src/application/doctor/scope-diagnostics.mjs',
    'src/application/package-maintenance/verification-registry.mjs',
    'src/application/package-maintenance/builtin-replacement.mjs',
    'src/application/task-finish/**',
    'src/application/task-environment/**',
    'src/application/openspec/**',
    'src/application/verification/**',
    'src/infrastructure/runtime/adapter-contract.mjs',
    'src/infrastructure/runtime/skills/arguments.mjs',
    'src/infrastructure/runtime/skills/capabilities.mjs',
    'src/infrastructure/runtime/skills/manifests.mjs',
    'src/infrastructure/runtime/skills/primitives.mjs',
    'src/infrastructure/runtime/skills/render-plan.mjs',
    'src/interfaces/local-app/web/api-client.js',
    'src/interfaces/local-app/web/router.js',
    'test/verification/dag-scheduler.mjs',
    'test/verification/planner.mjs',
    'test/verification/resource-coordinator.mjs',
    'test/verification/registry.mjs',
    'test/verification/unit-coverage.mjs',
  ], concurrencyClass: 'cpu-heavy' }),
  step({ id: 'contract', name: 'static contract tests', executor: { type: 'npm', args: ['run', 'test:contract'] }, profiles: ['fast', 'candidate'], inputs: [
    'test/contract/**', 'test/fixtures/**', 'verification.yml',
    'src/infrastructure/runtime/render-claude-code.mjs',
    'test/verification/candidate.mjs',
    'test/verification/changed.mjs',
    'test/verification/affected.mjs',
    'test/verification/focus.mjs',
    'test/verification/executor.mjs',
    'test/verification/package/run.mjs',
    'test/verification/plan-runner.mjs',
    'test/verification/planner.mjs',
    'test/verification/profile.mjs',
    'test/verification/registry.mjs',
    'test/verification/release/**',
    'test/verification/workspace/run.mjs',
    'test/verification/workspace/suites.mjs',
    'test/verification/runtime/adapter-smoke-workspace.mjs',
    'test/verification/runtime/adapter-smoke-workspace.test.mjs',
    'scripts/verify-buildr-product', 'scripts/verify-buildr-product-fast',
    'package/manifest.yml', 'package/targets/workspace/rules/buildr/core.md',
    'package/targets/workspace/skills/**', 'package/targets/runtime/skills/**',
    'skills/buildr-release/**', 'docs/skill-capability-contracts.md',
    'package.json', 'package-lock.json',
  ], concurrencyClass: 'cpu-heavy', preflight: {
    inputs: ['package/targets/workspace/skills/buildr/task-finish/**', 'test/contract/task-finish-sequencing.test.mjs'],
    executor: { type: 'node', file: 'test/contract/task-finish-sequencing.test.mjs' },
    budgetMs: 2000,
    sideEffects: 'none',
  } }),
  step({ id: 'integration-fast', name: 'fast integration tests', executor: { type: 'npm', args: ['run', 'test:integration:fast'] }, profiles: ['fast', 'candidate'], inputs: [
    'test/integration-fast/**',
    'bin/buildr.mjs', 'buildr',
    'src/application/cli-update.mjs',
    'src/application/change/**',
    'src/application/project/**',
    'src/application/service/**',
    'src/application/task-record/**',
    'src/application/worktree/**',
    'src/application/task-finish/**',
    'src/application/verification/**',
    'src/application/workspace/**',
    'src/application/doctor.mjs',
    'src/application/runtime.mjs',
    'src/domain/**',
    'src/infrastructure/git/**',
    'src/infrastructure/network/**',
    'src/infrastructure/platform.mjs',
    'src/infrastructure/process.mjs',
    'src/infrastructure/product-layout.mjs',
    'src/interfaces/local-app/http/**',
    'src/interfaces/local-app/runtime/**',
    'src/interfaces/local-app/web/api-client.js',
    'scripts/release/bridge-main-to-dev.mjs',
    'src/application/json-contracts.mjs',
    'test/verification/changed-paths.mjs',
    'scripts/release/release-convergence.mjs',
    'test/verification/timing/**',
    'test/verification/workspace/fixture.mjs',
    'test/verification/workspace/suites.mjs',
  ], budgetMs: 15000, schedulingCostMs: 10000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'cli-architecture', name: 'CLI modular architecture', executor: { type: 'node', file: 'test/verification/cli/architecture.mjs' }, profiles: ['fast', 'candidate'], inputs: ['bin/**', 'src/interfaces/cli/**', 'src/application/compose-runtime.mjs', 'src/application/json-contracts.mjs', 'scripts/**', 'test/verification/cli/**', 'package.json'] }),
  step({ id: 'openspec-spec-quality', name: 'OpenSpec canonical spec quality', executor: { type: 'node', file: 'test/verification/openspec/spec-quality.mjs' }, profiles: ['fast', 'candidate'], inputs: ['openspec/**/*.md', 'openspec/**/*.yaml'] }),
  step({ id: 'openspec-strict', name: 'openspec strict validation', executor: { type: 'openspec', args: ['validate', '--all', '--strict'] }, profiles: ['fast', 'candidate'], inputs: ['openspec/**'] }),
  step({ id: 'runtime-adapter-contract', name: 'runtime adapter contract', executor: { type: 'node', file: 'test/verification/runtime/adapter-contract.mjs' }, profiles: ['fast', 'candidate'], groups: ['runtime'], inputs: ['src/infrastructure/runtime/**', 'src/application/domains/runtime.mjs', 'src/application/doctor/runtime-diagnostics.mjs', 'test/verification/runtime/adapter-contract.mjs', 'package/targets/runtime/**', 'docs/agent-runtime-adapters.md'] }),

  step({ id: 'integration-candidate-recovery', name: 'Candidate integration: builtin recovery and migration', executor: { type: 'npm', args: ['run', 'test:integration:candidate:recovery'] }, profiles: ['candidate'], groups: ['recovery'], inputs: [
    'test/integration-candidate-recovery/**', 'bin/buildr.mjs', 'buildr',
    'src/application/package-maintenance.mjs',
    'src/application/package-maintenance/builtin-lifecycle.mjs',
    'src/application/package-maintenance/builtin-receipts.mjs',
    'src/application/package-maintenance/builtin-replacement.mjs',
    'src/application/package-maintenance/sync-plan.mjs',
    'src/application/workspace-operations.mjs',
    'src/infrastructure/filesystem/**',
    'skills/task-board/**',
    'package/manifest.yml',
    'package/targets/workspace/manifest.yml',
    'package/targets/workspace/skills/buildr/task-board/**',
  ], budgetMs: 25000, schedulingCostMs: 12000, concurrencyClass: 'workspace-heavy', resources: ['workspace-saturating'] }),
  step({ id: 'integration-candidate-release', name: 'Candidate integration: release Git convergence', executor: { type: 'npm', args: ['run', 'test:integration:candidate:release'] }, profiles: ['candidate'], groups: ['release'], inputs: [
    'test/integration-candidate-release/**', 'scripts/release/bridge-main-to-dev.mjs', 'scripts/release/release-convergence.mjs',
  ], budgetMs: 15000, schedulingCostMs: 12000, concurrencyClass: 'workspace-heavy', resources: ['workspace-saturating'] }),
  step({ id: 'concurrent-task-acceptance', name: 'Concurrent task workflow acceptance', executor: { type: 'node', file: 'test/verification/concurrency/task-acceptance.mjs' }, profiles: ['candidate'], inputs: [
    'test/verification/concurrency/**', 'test/fixtures/verification-resource-worker.mjs', 'test/helpers/child-process-supervisor.mjs',
    'src/application/worktree/**', 'src/application/task-finish/**', 'src/application/verification/**', 'src/interfaces/local-app/runtime/preview-manager.mjs',
    'openspec/specs/concurrent-task-acceptance/**', 'openspec/specs/task-environments/**',
  ], budgetMs: 30000, schedulingCostMs: 20000, concurrencyClass: 'workspace-heavy', resources: ['workspace-saturating'] }),

  step({ id: 'candidate-tarball', name: 'candidate npm tarball', executor: { type: 'candidate-artifact' }, profiles: ['candidate'], inputs: ['package.json', 'package-lock.json', 'buildr', 'bin/buildr.mjs', 'scripts/install-buildr-cli', 'scripts/uninstall-buildr-cli'] }),
  step({ id: 'open-source-candidate', name: 'open-source candidate', executor: { type: 'node', file: 'test/verification/release/open-source-candidate.mjs', consumesArtifact: true }, profiles: ['candidate'], groups: ['public', 'release'], inputs: ['package.json', 'package-lock.json', 'README.md', 'LICENSE', 'CHANGELOG.md', 'CONTRIBUTING.md', 'SECURITY.md', '.github/**', 'docs/cli-reference.md', 'docs/cli-architecture.md', 'docs/known-limitations.md', 'docs/agent-runtime-adapters.md'], dependsOn: ['candidate-tarball'] }),
  step({ id: 'openspec-candidate-audit', name: 'OpenSpec contract candidate audit', executor: { type: 'node', file: 'test/verification/openspec/contract-audit.mjs' }, profiles: ['candidate'], groups: ['openspec'], inputs: ['openspec/**'] }),
  step({ id: 'managed-mutations', name: 'managed mutations', executor: { type: 'node', file: 'test/verification/integrity/managed-mutations.mjs' }, profiles: ['candidate'], groups: ['package'], inputs: ['src/application/package-maintenance/**', 'src/application/workspace-operations.mjs', 'src/infrastructure/filesystem/**', 'src/infrastructure/runtime/**', 'package.json'] }),

  step({ id: 'browser-shell', name: 'Browser integration: application shell', executor: { type: 'node', file: 'test/browser-smoke/local-app-browser.test.mjs', args: ['shell'] }, profiles: ['candidate'], groups: ['browser'], inputs: ['test/browser-smoke/**', 'src/interfaces/local-app/web/app.js', 'src/interfaces/local-app/web/router.js', 'src/interfaces/local-app/web/index.html', 'src/interfaces/local-app/web/styles.css', 'src/interfaces/local-app/web/features/workspace.js', 'src/interfaces/local-app/web/features/workspaces.js'], budgetMs: 45000, concurrencyClass: 'exclusive', resources: ['browser'] }),
  step({ id: 'browser-project', name: 'Browser integration: Project flow', executor: { type: 'node', file: 'test/browser-smoke/local-app-browser.test.mjs', args: ['project'] }, profiles: ['candidate'], groups: ['browser'], inputs: ['test/browser-smoke/**', 'src/interfaces/local-app/web/features/projects.js', 'src/interfaces/local-app/web/features/project-detail.js', 'src/interfaces/local-app/web/features/project-edit.js'], budgetMs: 45000, concurrencyClass: 'exclusive', resources: ['browser'] }),
  step({ id: 'browser-service', name: 'Browser integration: Service flow', executor: { type: 'node', file: 'test/browser-smoke/local-app-browser.test.mjs', args: ['service'] }, profiles: ['candidate'], groups: ['browser'], inputs: ['test/browser-smoke/**', 'src/interfaces/local-app/web/features/services.js', 'src/interfaces/local-app/web/features/service-detail.js', 'src/interfaces/local-app/web/features/service-edit.js'], budgetMs: 45000, concurrencyClass: 'exclusive', resources: ['browser'] }),
  step({ id: 'browser-task', name: 'Browser integration: Task Record flow', executor: { type: 'node', file: 'test/browser-smoke/local-app-browser.test.mjs', args: ['task'] }, profiles: ['candidate'], groups: ['browser'], inputs: ['test/browser-smoke/**', 'src/interfaces/local-app/web/features/tasks.js', 'src/interfaces/local-app/web/features/task-detail.js'], budgetMs: 45000, concurrencyClass: 'exclusive', resources: ['browser'] }),
  step({ id: 'browser-change', name: 'Browser integration: Change flow', executor: { type: 'node', file: 'test/browser-smoke/local-app-browser.test.mjs', args: ['change'] }, profiles: ['candidate'], groups: ['browser'], inputs: ['test/browser-smoke/**', 'src/interfaces/local-app/web/features/changes.js', 'src/interfaces/local-app/web/features/change-detail.js', 'src/interfaces/local-app/web/features/agent-actions.js', 'src/interfaces/local-app/web/markdown.js', 'src/interfaces/local-app/web/styles.css'], budgetMs: 45000, concurrencyClass: 'exclusive', resources: ['browser'] }),

  step({ id: 'capability-cli-integration', name: 'capability CLI integration', executor: { type: 'node', file: 'test/capability-cli.integration.mjs' }, profiles: ['candidate'], inputs: [
    'test/capability-cli.integration.mjs',
    'src/application/domains/package-assets.mjs',
    'src/application/domains/skills.mjs',
    'src/application/doctor/capability-diagnostics.mjs',
    'src/application/package-maintenance/builtin-lifecycle.mjs',
    'src/application/package-maintenance/static-validation.mjs',
    'src/infrastructure/runtime/skills/**',
    'package/targets/workspace/skills/**', 'package/targets/runtime/skills/**', 'skills/**', 'capabilities.yml',
  ], budgetMs: 25000, schedulingCostMs: 19000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'commands-cli-integration', name: 'Commands context CLI integration', executor: { type: 'node', file: 'test/commands-cli.integration.mjs' }, profiles: ['candidate'], groups: ['cli', 'package'], inputs: ['commands.yml', 'test/commands-cli.integration.mjs', 'src/application/domains/commands.mjs', 'src/application/domains/components.mjs', 'src/application/domains/workspace.mjs', 'src/application/doctor/**', 'src/interfaces/cli/help.mjs', 'package/targets/workspace/commands/**', 'package/targets/workspace/projects/commands.yml'], budgetMs: 10000, schedulingCostMs: 10000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'openspec-contract-fixtures', name: 'OpenSpec contract fixtures', executor: { type: 'node', file: 'test/verification/openspec/contract.mjs' }, profiles: ['candidate'], groups: ['openspec'], inputs: ['src/application/domains/openspec.mjs', 'src/application/openspec/**', 'test/verification/openspec/**', 'openspec/**', 'package/targets/workspace/skills/buildr/openspec-contract-guard/**'], budgetMs: 20000, concurrencyClass: 'cpu-heavy' }),
  step({ id: 'openspec-convergence-recovery', name: 'OpenSpec convergence recovery journey', executor: { type: 'node', file: 'test/verification/openspec/contract.mjs', args: ['--suite', 'recovery'] }, profiles: ['candidate'], groups: ['openspec', 'recovery'], inputs: ['src/application/domains/openspec.mjs', 'src/application/openspec/**', 'src/application/task-finish/**', 'test/verification/openspec/**', 'openspec/**', 'package/targets/workspace/skills/buildr/openspec-contract-guard/**', 'package/targets/workspace/skills/buildr/task-finish/**'], budgetMs: 60000, schedulingCostMs: 40000, concurrencyClass: 'workspace-heavy', resources: ['workspace-saturating'] }),
  step({ id: 'package-static', ...packageVerifier('static'), profiles: ['candidate'], groups: ['package'], inputs: ['package/**', 'package.json', 'package-lock.json', 'src/application/package-maintenance/**', 'test/verification/package/**'], budgetMs: 5000 }),
  step({ id: 'package-workspace', ...packageVerifier('workspace'), profiles: ['candidate'], groups: ['package'], inputs: ['package/targets/workspace/manifest.yml', 'package/targets/workspace/components/**', 'src/application/domains/workspace.mjs', 'src/application/workspace-operations.mjs', 'src/application/package-maintenance/**'], budgetMs: 6000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'package-commands', ...packageVerifier('commands'), profiles: ['candidate'], groups: ['package'], inputs: ['package/targets/workspace/commands/**', 'src/application/domains/commands.mjs', 'src/application/package-maintenance/**'], budgetMs: 7000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'package-rules', ...packageVerifier('rules'), profiles: ['candidate'], groups: ['package'], inputs: ['package/targets/workspace/rules/**', 'src/application/domains/rules.mjs', 'src/infrastructure/runtime/**', 'src/application/package-maintenance/**'], budgetMs: 8000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'package-skills', ...packageVerifier('skills'), profiles: ['candidate'], groups: ['package'], inputs: ['package/targets/workspace/skills/**', 'package/targets/runtime/skills/**', 'src/application/domains/skills.mjs', 'src/infrastructure/runtime/skills/**', 'src/application/package-maintenance/**'], budgetMs: 12000, schedulingCostMs: 10000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'package-runtime', ...packageVerifier('runtime'), profiles: ['candidate'], groups: ['package', 'runtime'], inputs: ['package/targets/runtime/**', 'package/targets/workspace/rules/**', 'src/infrastructure/runtime/**', 'src/application/domains/runtime.mjs', 'src/application/package-maintenance/**'], budgetMs: 10000, schedulingCostMs: 7000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'runtime-adapter-parity', name: 'runtime adapter implementation-family parity', executor: { type: 'node', file: 'test/verification/runtime/adapter-parity.mjs' }, profiles: ['candidate'], groups: ['runtime'], inputs: ['src/infrastructure/runtime/**', 'src/application/domains/runtime.mjs', 'src/application/doctor/runtime-diagnostics.mjs', 'test/verification/runtime/adapter-parity.mjs', 'package/targets/runtime/**', 'package/targets/workspace/rules/**', 'package/targets/workspace/skills/**'], budgetMs: 30000, schedulingCostMs: 30000, concurrencyClass: 'workspace-heavy', resources: ['workspace-saturating'] }),

  step({ id: 'workspace-lifecycle', name: 'Workspace E2E: workspace lifecycle', executor: { type: 'workspace-suite', selector: 'workspace-lifecycle' }, profiles: ['candidate'], inputs: ['src/application/domains/workspace.mjs', 'src/application/domains/commands.mjs', 'src/application/domains/rules.mjs', 'src/application/domains/skills.mjs', 'test/verification/workspace/fixture.mjs', 'test/verification/workspace/workspace-lifecycle.mjs'], budgetMs: 20000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'ownership-recovery', name: 'Workspace E2E: ownership recovery', executor: { type: 'workspace-suite', selector: 'ownership-recovery' }, profiles: ['candidate'], inputs: ['src/application/domains/components.mjs', 'src/application/package-maintenance/**', 'test/verification/workspace/fixture.mjs', 'test/verification/workspace/ownership-recovery.mjs'], budgetMs: 20000, schedulingCostMs: 6000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'runtime-reconciliation', name: 'Workspace E2E: runtime reconciliation', executor: { type: 'workspace-suite', selector: 'runtime-reconciliation' }, profiles: ['candidate'], inputs: ['src/infrastructure/runtime/**', 'src/application/domains/runtime.mjs', 'test/verification/workspace/fixture.mjs', 'test/verification/workspace/runtime-reconciliation.mjs', 'package/targets/runtime/**', 'package/targets/workspace/rules/**'], budgetMs: 30000, schedulingCostMs: 5000, concurrencyClass: 'workspace-heavy' }),

  step({ id: 'repository-onboarding', name: 'repository onboarding from a clean checkout', executor: { type: 'node', file: 'test/verification/onboarding/repository.mjs' }, profiles: ['candidate'], inputs: ['scripts/install-buildr-cli', 'test/verification/onboarding/repository.mjs', 'services/**', 'package.json', 'package-lock.json', 'README.md'], budgetMs: 15000, schedulingCostMs: 6000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'init-onboarding', name: 'single-command init onboarding', executor: { type: 'node', file: 'test/verification/onboarding/init.mjs' }, profiles: ['candidate'], inputs: ['src/application/domains/workspace.mjs', 'src/application/workspace-operations.mjs', 'test/verification/onboarding/init.mjs', 'package/targets/workspace/manifest.yml', 'package/targets/workspace/components/**'], budgetMs: 15000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'cli-compatibility', name: 'CLI compatibility', executor: { type: 'node', file: 'test/verification/cli/compatibility.mjs' }, profiles: ['candidate'], groups: ['cli'], inputs: [
    'buildr', 'bin/buildr.mjs', 'src/interfaces/cli/**',
    'src/application/compose-runtime.mjs', 'src/application/json-contracts.mjs',
    'src/application/domains/runtime.mjs', 'src/infrastructure/runtime/adapter-contract.mjs',
    'test/verification/cli/compatibility.mjs', 'docs/cli-reference.md',
  ], budgetMs: 15000, schedulingCostMs: 9000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'cli-package-parity', name: 'CLI package parity', executor: { type: 'node', file: 'test/verification/cli/package-parity.mjs', consumesArtifact: true }, profiles: ['candidate'], groups: ['cli'], inputs: [
    'buildr', 'bin/buildr.mjs', 'src/interfaces/cli/**',
    'src/application/compose-runtime.mjs', 'src/application/json-contracts.mjs',
    'src/infrastructure/product-layout.mjs',
    'test/verification/cli/package-parity.mjs', 'package.json', 'package-lock.json',
  ], dependsOn: ['candidate-tarball'], budgetMs: 10000, schedulingCostMs: 6000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'service-branch-contract', name: 'Service branch contract', executor: { type: 'node', file: 'test/verification/onboarding/service-branch.mjs' }, profiles: ['candidate'], inputs: ['src/application/domains/workspace.mjs', 'test/verification/onboarding/service-branch.mjs', 'services/**'], concurrencyClass: 'workspace-heavy' }),
  step({ id: 'remote-skill-timeout', name: 'remote Skill timeout contract', executor: { type: 'node', file: 'test/verification/network/remote-text.mjs' }, profiles: ['candidate'], inputs: ['src/infrastructure/network/fetch-remote-text.mjs', 'src/application/domains/skills.mjs', 'test/verification/network/**'], concurrencyClass: 'network' }),
  step({ id: 'release-tarball-smoke', name: 'release tarball smoke', executor: { type: 'node', file: 'test/verification/release/release-smoke.mjs', consumesArtifact: true }, profiles: ['candidate'], groups: ['release'], inputs: [
    'buildr', 'bin/buildr.mjs', 'src/interfaces/cli/**',
    'src/application/cli-update.mjs', 'src/application/compose-runtime.mjs',
    'src/application/package-maintenance/**', 'src/application/package-maintenance.mjs',
    'src/application/workspace-operations.mjs', 'src/infrastructure/product-layout.mjs',
    'package.json', 'package-lock.json', 'package/**', 'test/verification/release/**',
  ], dependsOn: ['candidate-tarball'], budgetMs: 10000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'managed-data-integrity', name: 'managed data integrity', executor: { type: 'node', file: 'test/verification/integrity/managed-data-integrity.mjs' }, profiles: ['candidate'], groups: ['package'], inputs: [
    'src/application/package-maintenance/**', 'src/application/package-maintenance.mjs',
    'src/application/workspace-operations.mjs',
    'src/application/domains/commands.mjs', 'src/application/domains/components.mjs',
    'src/application/domains/rules.mjs', 'src/application/domains/skills.mjs',
    'src/application/domains/workspace.mjs', 'src/application/doctor/**',
    'src/infrastructure/filesystem/**', 'src/infrastructure/runtime/**',
    'package/**', 'test/verification/integrity/**',
  ], budgetMs: 15000, schedulingCostMs: 9000, concurrencyClass: 'workspace-heavy' }),

  step({ id: 'docs-quality', name: 'documentation quality', executor: { type: 'node', file: 'test/verification/docs/quality.mjs' }, profiles: ['candidate'], inputs: ['**/*.md', 'openspec/**/*.html', 'test/verification/docs/quality.mjs'], concurrencyClass: 'default' }),
]);

export const VERIFICATION_PROFILES = Object.freeze(['fast', 'candidate']);
export const VERIFICATION_GROUPS = Object.freeze(['public', 'cli', 'runtime', 'package', 'openspec', 'release', 'recovery', 'browser']);
export const VERIFICATION_EXECUTORS = Object.freeze(['node', 'npm', 'openspec', 'package-selector', 'workspace-suite', 'candidate-artifact']);

export function verificationStepById(id) {
  return verificationSteps.find((item) => item.id === id);
}
