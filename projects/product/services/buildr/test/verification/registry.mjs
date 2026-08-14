import { PACKAGE_VERIFIERS } from '../../src/application/package-maintenance/verification-registry.mjs';
import { SYSTEM_SUITES } from './system-suites.mjs';

const PROJECT_OWNER = 'project:product';
const SERVICE_OWNER = 'service:product/buildr';

const environment = (footprints, isolation, resetBurden) => Object.freeze({
  environment: Object.freeze({ footprints: Object.freeze(footprints), isolation }),
  resetBurden,
});

const TEST_ENVIRONMENTS = Object.freeze({
  pure: environment([], 'none', 'none'),
  sourceReadOnly: environment(['filesystem'], 'read-only', 'none'),
  cliReadOnly: environment(['filesystem', 'cli'], 'read-only', 'none'),
  isolatedFilesystem: environment(['filesystem'], 'unique-temporary-root', 'single-cleanup'),
  repeatedFilesystem: environment(['filesystem'], 'unique-temporary-root', 'repeated-cleanup'),
  isolatedCli: environment(['filesystem', 'cli'], 'unique-temporary-root', 'single-cleanup'),
  repeatedCli: environment(['filesystem', 'cli'], 'unique-temporary-root', 'repeated-cleanup'),
  isolatedGitCli: environment(['filesystem', 'cli', 'git'], 'unique-temporary-root', 'single-cleanup'),
  repeatedGitCli: environment(['filesystem', 'cli', 'git'], 'unique-temporary-root', 'repeated-cleanup'),
  workspaceLifecycle: environment(['filesystem', 'cli', 'git', 'workspace-lifecycle'], 'unique-temporary-root', 'lifecycle'),
  loopbackNetwork: environment(['loopback-network'], 'unique-temporary-root', 'single-cleanup'),
});

const testing = (ownerScope, primaryIntent, executionBoundary, targetDurationMs, proves, executionEnvironment, primaryEvidenceOwner = null) => Object.freeze({
  ownerScope,
  primaryIntent,
  executionBoundary,
  targetDurationMs,
  proves,
  ...executionEnvironment,
  ...(primaryEvidenceOwner ? { primaryEvidenceOwner } : {}),
});

export const VERIFICATION_STEP_TESTING = Object.freeze({
  unit: testing(SERVICE_OWNER, 'Development', 'Unit', 5000, 'Pure Buildr logic behaves correctly with collaborators replaced.', TEST_ENVIRONMENTS.pure),
  component: testing(SERVICE_OWNER, 'Development', 'Component', 3000, 'A bounded Buildr application assembly behaves correctly with fake collaborators.', TEST_ENVIRONMENTS.pure),
  integration: testing(SERVICE_OWNER, 'Development', 'Integration', 30000, 'Buildr modules behave correctly across real filesystem, Git, or process boundaries.', TEST_ENVIRONMENTS.repeatedGitCli),
  'integration-task-development': testing(SERVICE_OWNER, 'Development', 'Integration', 60000, 'Task Development lifecycle behavior remains correct across real CLI, filesystem, Git, and Application boundaries.', TEST_ENVIRONMENTS.workspaceLifecycle, 'integration'),
  'integration-task-finish': testing(SERVICE_OWNER, 'Development', 'Integration', 20000, 'Task Finish behaves correctly across its real filesystem, Git, and process boundaries.', TEST_ENVIRONMENTS.repeatedGitCli, 'integration'),
  'system-windows-platform': testing(PROJECT_OWNER, 'Development', 'System', 300000, 'Windows high-risk CLI, worktree, Task Environment, Task Finish, launcher, and managed runtime journeys behave correctly.', TEST_ENVIRONMENTS.workspaceLifecycle),
  'system-local-app-http': testing(PROJECT_OWNER, 'Development', 'System', 15000, 'Buildr Web Runtime HTTP routes preserve read, error, session and cleanup boundaries.', TEST_ENVIRONMENTS.workspaceLifecycle),
  'system-task-finish': testing(PROJECT_OWNER, 'Development', 'System', 30000, 'Task Finish public CLI and delivery journeys behave correctly.', TEST_ENVIRONMENTS.workspaceLifecycle),
  'system-verification-contracts': testing(PROJECT_OWNER, 'Development', 'System', 20000, 'Verification contracts hold through public entrypoints.', TEST_ENVIRONMENTS.repeatedCli),
  'system-workspace-lifecycle': testing(PROJECT_OWNER, 'Development', 'System', 35000, 'Workspace and Task lifecycle journeys behave correctly.', TEST_ENVIRONMENTS.workspaceLifecycle),
  'system-runtime-recovery': testing(PROJECT_OWNER, 'Development', 'System', 30000, 'Runtime installation and recovery journeys behave correctly.', TEST_ENVIRONMENTS.workspaceLifecycle),
  'system-app-process': testing(PROJECT_OWNER, 'Development', 'System', 25000, 'Buildr Web process and preview lifecycle remain isolated.', TEST_ENVIRONMENTS.workspaceLifecycle),
  'system-fresh-build': testing(PROJECT_OWNER, 'Development', 'System', 180000, 'A clean Task Environment performs real dependency installation and Web build.', TEST_ENVIRONMENTS.workspaceLifecycle),
  contract: testing(PROJECT_OWNER, 'Static Conformance', 'Static', 5000, 'Product source, governance assets, and stable entrypoint declarations conform without mutable fixtures.', TEST_ENVIRONMENTS.sourceReadOnly),
  'cli-architecture': testing(SERVICE_OWNER, 'Static Conformance', 'Static', 3000, 'CLI modules and wrappers preserve the declared architecture.', TEST_ENVIRONMENTS.sourceReadOnly),
  'openspec-spec-quality': testing(PROJECT_OWNER, 'Static Conformance', 'Static', 3000, 'Canonical OpenSpec specifications meet Product quality rules.', TEST_ENVIRONMENTS.sourceReadOnly),
  'openspec-strict': testing(PROJECT_OWNER, 'Static Conformance', 'Static', 5000, 'All OpenSpec artifacts pass upstream strict validation.', TEST_ENVIRONMENTS.cliReadOnly),
  'runtime-adapter-contract': testing(SERVICE_OWNER, 'Static Conformance', 'Integration', 5000, 'Runtime adapter declarations and isolated filesystem projections satisfy their contract.', TEST_ENVIRONMENTS.repeatedFilesystem),
  'runtime-skill-projection': testing(SERVICE_OWNER, 'Development', 'Integration', 8000, 'Changed packaged Skills bind their source identity and complete projected inventory through every supported runtime adapter.', TEST_ENVIRONMENTS.repeatedFilesystem),
  'integration-candidate-recovery': testing(SERVICE_OWNER, 'Development', 'System', 25000, 'Builtin recovery and migration journeys preserve user-owned state.', TEST_ENVIRONMENTS.workspaceLifecycle),
  'integration-candidate-release': testing(PROJECT_OWNER, 'Delivery / Release', 'System', 15000, 'Release branch convergence behaves correctly.', TEST_ENVIRONMENTS.repeatedGitCli),
  'concurrent-task-acceptance': testing(PROJECT_OWNER, 'Acceptance', 'System', 30000, 'Concurrent Task workflows satisfy the declared acceptance contract.', TEST_ENVIRONMENTS.workspaceLifecycle),
  'candidate-tarball': testing(SERVICE_OWNER, 'Delivery / Release', 'System', 15000, 'One frozen application payload produces the single npm candidate tarball consumed by later verification.', TEST_ENVIRONMENTS.isolatedGitCli),
  'application-payload-release': testing(SERVICE_OWNER, 'Delivery / Release', 'System', 30000, 'The frozen application payload is deterministic, complete, host-Node compatible, and serves Buildr Web only on demand.', TEST_ENVIRONMENTS.workspaceLifecycle),
  'npm-launcher-candidate': testing(PROJECT_OWNER, 'Delivery / Release', 'Integration', 15000, 'The explicit local Launcher binds one verified npm installation without copying Node or Buildr and fails closed on identity drift.', TEST_ENVIRONMENTS.repeatedFilesystem),
  'host-node-contract': testing(SERVICE_OWNER, 'Static Conformance', 'Static', 2000, 'The active Host Node satisfies the bounded package engine contract.', TEST_ENVIRONMENTS.sourceReadOnly),
  'host-node-boundaries': testing(SERVICE_OWNER, 'Development', 'Integration', 15000, 'Node-sensitive SQLite, process, and filesystem boundaries work on the active Host Node.', TEST_ENVIRONMENTS.repeatedFilesystem),
  'host-node-cli-smoke': testing(SERVICE_OWNER, 'Delivery / Release', 'System', 15000, 'The candidate tarball installs on the active Host Node and executes CLI, Web, and Workspace-owned verification with an independent exact Workspace Node.', TEST_ENVIRONMENTS.workspaceLifecycle),
  'open-source-candidate': testing(PROJECT_OWNER, 'Delivery / Release', 'Static', 10000, 'The candidate contains the required public release materials.', TEST_ENVIRONMENTS.sourceReadOnly),
  'openspec-candidate-audit': testing(PROJECT_OWNER, 'Static Conformance', 'Static', 5000, 'Candidate OpenSpec contracts are current and internally consistent.', TEST_ENVIRONMENTS.sourceReadOnly),
  'managed-mutations': testing(SERVICE_OWNER, 'Static Conformance', 'Static', 5000, 'Production filesystem mutations remain behind declared owners.', TEST_ENVIRONMENTS.sourceReadOnly),
  'capability-cli-integration': testing(SERVICE_OWNER, 'Development', 'Integration', 25000, 'Capability CLI operations integrate with package and runtime assets.', TEST_ENVIRONMENTS.repeatedCli),
  'commands-cli-integration': testing(SERVICE_OWNER, 'Development', 'Integration', 10000, 'Commands context CLI operations integrate with managed workspace assets.', TEST_ENVIRONMENTS.repeatedCli),
  'openspec-contract-fixtures': testing(PROJECT_OWNER, 'Development', 'Integration', 20000, 'OpenSpec application contracts hold across isolated fixture repositories.', TEST_ENVIRONMENTS.repeatedGitCli),
  'openspec-convergence-recovery': testing(PROJECT_OWNER, 'Development', 'System', 60000, 'OpenSpec convergence and recovery complete through the public lifecycle.', TEST_ENVIRONMENTS.workspaceLifecycle),
  'package-static': testing(SERVICE_OWNER, 'Delivery / Release', 'Static', 5000, 'The Buildr package structure is valid.', TEST_ENVIRONMENTS.sourceReadOnly),
  'package-workspace': testing(SERVICE_OWNER, 'Delivery / Release', 'Integration', 6000, 'Packaged Workspace assets install and check correctly.', TEST_ENVIRONMENTS.repeatedFilesystem),
  'package-commands': testing(SERVICE_OWNER, 'Delivery / Release', 'Integration', 7000, 'Packaged Commands assets integrate correctly.', TEST_ENVIRONMENTS.repeatedFilesystem),
  'package-rules': testing(SERVICE_OWNER, 'Delivery / Release', 'Integration', 8000, 'Packaged Rules assets integrate correctly.', TEST_ENVIRONMENTS.repeatedFilesystem),
  'package-skills': testing(SERVICE_OWNER, 'Delivery / Release', 'Integration', 12000, 'Packaged Skills assets integrate correctly.', TEST_ENVIRONMENTS.repeatedFilesystem),
  'package-runtime': testing(SERVICE_OWNER, 'Delivery / Release', 'Integration', 10000, 'Packaged runtime assets integrate correctly.', TEST_ENVIRONMENTS.repeatedFilesystem),
  'runtime-adapter-parity': testing(SERVICE_OWNER, 'Development', 'System', 30000, 'All supported runtime implementation families remain behaviorally aligned.', TEST_ENVIRONMENTS.workspaceLifecycle),
  'workspace-lifecycle': testing(PROJECT_OWNER, 'Development', 'System', 20000, 'A complete Workspace lifecycle succeeds through public entrypoints.', TEST_ENVIRONMENTS.workspaceLifecycle),
  'ownership-recovery': testing(PROJECT_OWNER, 'Development', 'System', 20000, 'Workspace ownership conflicts recover without losing user state.', TEST_ENVIRONMENTS.workspaceLifecycle),
  'runtime-reconciliation': testing(PROJECT_OWNER, 'Development', 'System', 30000, 'Workspace runtime projections reconcile across supported adapters.', TEST_ENVIRONMENTS.workspaceLifecycle),
  'repository-onboarding': testing(PROJECT_OWNER, 'Delivery / Release', 'System', 60000, 'A clean repository can use the explicit development entry without mutating the PATH default CLI.', TEST_ENVIRONMENTS.workspaceLifecycle),
  'init-onboarding': testing(PROJECT_OWNER, 'Development', 'System', 15000, 'A user can initialize a Workspace through the public CLI.', TEST_ENVIRONMENTS.workspaceLifecycle),
  'cli-compatibility': testing(SERVICE_OWNER, 'Development', 'System', 15000, 'Documented CLI commands remain compatible.', TEST_ENVIRONMENTS.repeatedCli),
  'cli-package-parity': testing(SERVICE_OWNER, 'Delivery / Release', 'Integration', 15000, 'Representative source and packaged CLI outputs and one init mutation remain equivalent.', TEST_ENVIRONMENTS.repeatedCli),
  'service-branch-contract': testing(PROJECT_OWNER, 'Development', 'System', 10000, 'Service branch configuration works in an isolated repository.', TEST_ENVIRONMENTS.isolatedGitCli),
  'remote-skill-timeout': testing(SERVICE_OWNER, 'Development', 'Integration', 5000, 'Remote Skill reads fail within the declared timeout boundary.', TEST_ENVIRONMENTS.loopbackNetwork),
  'release-tarball-smoke': testing(SERVICE_OWNER, 'Delivery / Release', 'System', 15000, 'The shared release tarball installs, keeps ordinary CLI HTTP-free, and serves healthy Buildr Web on demand.', TEST_ENVIRONMENTS.workspaceLifecycle),
  'managed-data-integrity': testing(PROJECT_OWNER, 'Development', 'System', 15000, 'Managed mutations remain atomic and preserve nested repositories.', TEST_ENVIRONMENTS.workspaceLifecycle),
  'docs-quality': testing(PROJECT_OWNER, 'Static Conformance', 'Static', 5000, 'Product documentation links and required content remain valid.', TEST_ENVIRONMENTS.sourceReadOnly),
});

const step = (definition) => {
  const classification = VERIFICATION_STEP_TESTING[definition.id];
  return Object.freeze({
    dependsOn: [],
    profiles: [],
    groups: [],
    inputs: [],
    inputExclusions: [],
    concurrencyClass: 'default',
    resources: [],
    preflight: null,
    ...definition,
    budgetMs: classification?.targetDurationMs ?? definition.budgetMs,
    testing: classification ? Object.freeze({ ...classification, primaryEvidenceOwner: classification.primaryEvidenceOwner ?? definition.id }) : null,
  });
};

const packageVerifier = (selector) => {
  const verifier = PACKAGE_VERIFIERS.find((item) => item.id === selector);
  if (!verifier) throw new Error(`Missing package verifier declaration: ${selector}`);
  return { name: verifier.name, executor: { type: 'package-selector', selector } };
};

const concurrency = (global, workspaceHeavy, workspaceSaturating, innerConcurrency) => Object.freeze({
  global,
  classes: Object.freeze({ default: global, 'cpu-heavy': 2, 'workspace-heavy': workspaceHeavy, network: 2, exclusive: 1 }),
  resources: Object.freeze({ 'workspace-saturating': workspaceSaturating, 'task-lifecycle-heavy': 1, 'app-runtime': 1 }),
  innerConcurrency: Object.freeze(innerConcurrency),
});

export const VERIFICATION_EXECUTION_PROFILES = Object.freeze({
  local: concurrency(4, 3, 2, { integration: 6, ...Object.fromEntries(SYSTEM_SUITES.map((suite) => [suite.id, suite.innerConcurrency])), 'openspec-contract-fixtures': 2, 'openspec-convergence-recovery': 3 }),
  ci: concurrency(4, 3, 2, { integration: 6, ...Object.fromEntries(SYSTEM_SUITES.map((suite) => [suite.id, suite.innerConcurrency])), 'openspec-contract-fixtures': 2, 'openspec-convergence-recovery': 3 }),
  'ci-workspace-limited': concurrency(4, 2, 1, { integration: 3, ...Object.fromEntries(SYSTEM_SUITES.map((suite) => [suite.id, Math.min(suite.innerConcurrency, 2)])), 'openspec-contract-fixtures': 2, 'openspec-convergence-recovery': 2 }),
});

export const VERIFICATION_CONCURRENCY = VERIFICATION_EXECUTION_PROFILES.local;

export const VERIFICATION_ENVIRONMENT_FOOTPRINTS = Object.freeze(['filesystem', 'cli', 'git', 'loopback-network', 'network', 'workspace-lifecycle']);
export const VERIFICATION_ENVIRONMENT_ISOLATIONS = Object.freeze(['none', 'read-only', 'unique-temporary-root', 'shared']);
export const VERIFICATION_RESET_BURDENS = Object.freeze(['none', 'single-cleanup', 'repeated-cleanup', 'lifecycle']);

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

export const VERIFICATION_GOVERNED_REPOSITORY_INPUTS = Object.freeze([
  '.github/workflows/publish.yml',
  '.github/workflows/verify.yml',
]);

export const VERIFICATION_FULL_SCOPE_INPUTS = Object.freeze([
  '.github/workflows/verify.yml',
  'preparation.yml',
  'verification.yml',
  'package.json',
  'package-lock.json',
  'scripts/verify-buildr-product',
  'scripts/verify-buildr-product-fast',
  'scripts/verify-buildr-product-ci',
  'scripts/run-workspace-node.mjs',
  'test/verification/candidate.mjs',
  'test/verification/candidate-ci.mjs',
  'test/verification/candidate-ci-evidence.mjs',
  'test/verification/changed.mjs',
  'test/verification/changed-paths.mjs',
  'test/verification/dag-scheduler.mjs',
  'test/verification/executor.mjs',
  'test/verification/plan-runner.mjs',
  'test/verification/planner.mjs',
  'test/verification/profile.mjs',
  'test/verification/registry.mjs',
  'test/verification/resource-coordinator.mjs',
  'test/verification/timing/**',
]);

export const VERIFICATION_DELEGATED_INPUTS = Object.freeze([
  Object.freeze({ owner: 'product.browser-smoke', inputs: Object.freeze(['test/browser-smoke/**']) }),
]);

const SYSTEM_OWNER_INPUTS = Object.freeze({
  'system-verification-contracts': Object.freeze(['test/verification/changed*.mjs', 'test/verification/focus.mjs', 'test/verification/executor.mjs', 'test/verification/plan-runner.mjs', 'test/verification/planner.mjs', 'test/verification/registry.mjs', 'test/verification/resource-coordinator.mjs', 'test/verification/system*.mjs', 'test/verification/timing/**', 'test/verification/workspace/**', 'src/application/verification/**', 'src/application/json-contracts.mjs', 'src/application/openspec/**']),
  'system-workspace-lifecycle': Object.freeze(['src/application/project/**', 'src/application/service/**', 'src/application/task-record/**', 'src/application/task-development/**', 'src/application/task-review/**', 'src/application/task-verification/**', 'src/application/worktree/**', 'src/application/workspace/**', 'src/domain/**', 'src/infrastructure/git/**', 'src/infrastructure/platform.mjs', 'src/infrastructure/product-layout.mjs', 'test/helpers/task-record-system-fixture.mjs', 'test/helpers/workspace-product-suite.mjs']),
  'system-runtime-recovery': Object.freeze(['src/application/cli-update.mjs', 'src/application/runtime.mjs', 'src/infrastructure/filesystem/**', 'src/infrastructure/network/**', 'src/infrastructure/runtime/**']),
  'system-local-app-http': Object.freeze(['src/interfaces/local-app/http/**', 'src/infrastructure/sqlite/**', 'services/buildr-web/src/api/client.ts', 'test/helpers/workspace-product-suite.mjs']),
  'system-app-process': Object.freeze(['src/interfaces/local-app/runtime/**', 'src/infrastructure/process.mjs', 'package/launchers/**', 'test/helpers/workspace-product-suite.mjs']),
  'system-task-finish': Object.freeze(['src/application/task-finish/**', 'test/helpers/task-finish-sqlite-fixture.mjs']),
  'system-fresh-build': Object.freeze(['src/application/task-environment/**', 'src/domain/task-environment/**', 'preparation.yml', 'services/buildr-web/package.json', 'services/buildr-web/package-lock.json', 'services/buildr-web/vite.config.*', 'services/buildr-web/tsconfig*.json', 'test/helpers/clean-product-source.mjs']),
});

export const verificationSteps = Object.freeze([
  step({ id: 'unit', name: 'fine-grained unit tests', executor: { type: 'npm', args: ['run', 'test:unit'] }, profiles: ['fast', 'candidate'], inputs: [
    'test/unit/**',
    'src/**',
    'services/buildr-web/**',
    'test/verification/dag-scheduler.mjs',
    'test/verification/planner.mjs',
    'test/verification/resource-coordinator.mjs',
    'test/verification/registry.mjs',
    'test/verification/browser-selector-dispatcher.mjs',
    'test/verification/unit-coverage.mjs',
  ], concurrencyClass: 'cpu-heavy' }),
  step({ id: 'component', name: 'bounded component tests', executor: { type: 'npm', args: ['run', 'test:component'] }, profiles: ['fast', 'candidate'], inputs: [
    'test/component/**',
    'src/application/service/**',
  ], concurrencyClass: 'cpu-heavy' }),
  step({ id: 'integration', name: 'technical boundary integration tests', executor: { type: 'node', file: 'test/verification/integration.mjs', args: ['--suite', 'general'] }, profiles: ['candidate'], inputs: [
    'test/integration/**',
    'test/verification/integration.mjs',
    'test/verification/worker-budget.mjs',
    'src/application/change/**',
    'src/application/compose-runtime.mjs',
    'src/application/doctor/**',
    'src/application/openspec/**',
    'src/application/package-maintenance/**',
    'src/application/task-environment/**',
    'src/application/task-finish/**',
    'src/application/task-review/**',
    'src/application/task-verification/**',
    'src/application/verification/**',
    'src/domain/task-environment/**',
    'src/infrastructure/content/**',
    'src/infrastructure/product-identity/**',
    'src/infrastructure/product-invocation/**',
    'src/interfaces/internal/**',
    'src/infrastructure/filesystem/workspace-node-runtime.mjs',
    'src/infrastructure/runtime/**',
    'src/application/product-installation-status.mjs',
    'src/application/npm-installation-enrollment.mjs',
    'src/interfaces/local-app/runtime/**',
    'services/buildr-web/src/api/client.ts',
    'services/buildr-web/src/App.tsx',
  ], inputExclusions: [
    'test/integration/task-development-application.test.mjs',
    'test/integration/task-finish-*.test.mjs',
    'src/application/task-development/**',
    'src/domain/task-development/**',
    'src/infrastructure/sqlite/task-development-repository.mjs',
    'src/application/task-finish/**',
  ], schedulingCostMs: 15000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'integration-task-development', name: 'Task Development lifecycle integration', executor: { type: 'node-test', files: [
    'test/integration/task-development-application.test.mjs',
  ], args: ['--test-concurrency=1'] }, profiles: ['candidate'], inputs: [
    'test/integration/task-development-application.test.mjs',
    'src/application/task-development/**',
    'src/domain/task-development/**',
    'src/infrastructure/sqlite/task-development-repository.mjs',
    'src/infrastructure/sqlite/task-review-repository.mjs',
    'src/infrastructure/sqlite/task-verification-repository.mjs',
    'src/application/task-review/**',
    'src/application/task-verification/**',
    'src/application/verification/**',
    'src/application/task-environment/**',
  ], schedulingCostMs: 50000, concurrencyClass: 'workspace-heavy', resources: ['workspace-saturating', 'task-lifecycle-heavy'] }),
  step({ id: 'integration-task-finish', name: 'Task Finish integration slice', executor: { type: 'node-test', files: [
    'test/integration/task-finish-delivery-remote.test.mjs',
    'test/integration/task-finish-retained-activation.test.mjs',
    'test/integration/task-finish-retained-cleanup.test.mjs',
    'test/integration/task-finish-run.test.mjs',
    'test/integration/task-finish-task-contribution.test.mjs',
  ] }, inputs: [
    'test/integration/task-finish-*.test.mjs',
    'test/helpers/task-finish-sqlite-fixture.mjs',
    'src/application/task-finish/**',
  ], schedulingCostMs: 15000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'contract', name: 'repository contract tests', executor: { type: 'npm', args: ['run', 'test:contract'] }, profiles: ['fast', 'candidate'], inputs: [
    'test/contract/**', 'test/fixtures/**', 'preparation.yml', 'verification.yml', 'task-finish.yml',
    '.github/workflows/publish.yml', '.github/workflows/verify.yml',
    'scripts/release/release-authority.mjs',
    'scripts/release/release-authority-oidc-probe.mjs',
    'scripts/release/release-authority-preflight.mjs',
    'scripts/release/release-authority-probe-runner.mjs',
    'scripts/release/release-contract.mjs',
    'scripts/release/trusted-publish.mjs',
    'src/infrastructure/runtime/render-claude-code.mjs',
    'test/verification/candidate.mjs',
    'test/verification/candidate-ci.mjs',
    'test/verification/candidate-ci-evidence.mjs',
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
    'scripts/verify-buildr-product', 'scripts/verify-buildr-product-fast', 'scripts/verify-buildr-product-ci', 'scripts/run-workspace-node.mjs',
    'package/manifest.yml', 'package/targets/workspace/rules/buildr/core.md',
    'package/targets/workspace/skills/**', 'package/targets/runtime/skills/**',
    'skills/buildr-release/**', 'docs/skill-capability-contracts.md',
    'package.json', 'package-lock.json',
  ], concurrencyClass: 'cpu-heavy', preflight: {
    inputs: ['package/targets/workspace/skills/buildr/task-development/**', 'test/contract/task-development.test.mjs'],
    executor: { type: 'node', file: 'test/contract/task-development.test.mjs' },
    budgetMs: 3000,
    sideEffects: 'none',
  } }),
  ...SYSTEM_SUITES.map((suite) => step({
    id: suite.id,
    name: suite.name,
    executor: { type: 'node', file: 'test/verification/system.mjs', args: ['--owner', suite.id] },
    profiles: ['candidate'],
    inputs: [...suite.files, ...(SYSTEM_OWNER_INPUTS[suite.id] ?? []), 'test/verification/system-suites.mjs', 'test/verification/system.mjs', 'test/helpers/task-lifecycle-system-context.mjs', 'test/verification/system-file-timing-reporter.mjs'],
    schedulingCostMs: suite.schedulingCostMs,
    concurrencyClass: suite.concurrencyClass,
    resources: [...suite.resources],
  })),
  step({ id: 'system-windows-platform', name: 'Windows high-risk system journey slice', executor: { type: 'node-test', files: [
    'test/system/cli-update.test.mjs',
    'test/system/local-app-launcher.test.mjs',
    'test/system/task-environment-fresh-build-web.test.mjs',
    'test/system/task-finish-cli.test.mjs',
    'test/system/task-finish-product-journey.test.mjs',
    'test/system/workspace-runtime-recovery.test.mjs',
    'test/system/worktree-create.test.mjs',
  ], args: ['--test-concurrency=1', '--test-reporter=dot'] }, groups: ['windows-npm-preflight'], selection: 'explicit-only', inputs: [
    'test/system/cli-update.test.mjs',
    'test/system/local-app-launcher.test.mjs',
    'test/system/task-environment-fresh-build-web.test.mjs',
    'test/system/task-finish-*.test.mjs',
    'test/system/workspace-runtime-recovery.test.mjs',
    'test/system/worktree-create.test.mjs',
    'test/helpers/task-finish-sqlite-fixture.mjs',
    'src/application/cli-update.mjs',
    'src/application/task-finish/**',
    'src/application/task-environment/**',
    'src/application/worktree/**',
    'src/infrastructure/filesystem/**',
    'src/infrastructure/git/**',
    'src/infrastructure/runtime/**',
    'src/interfaces/local-app/runtime/**',
    'package/targets/workspace/**',
  ], schedulingCostMs: 300000, concurrencyClass: 'workspace-heavy', resources: ['workspace-saturating', 'task-lifecycle-heavy'] }),
  step({ id: 'cli-architecture', name: 'CLI modular architecture', executor: { type: 'node', file: 'test/verification/cli/architecture.mjs' }, profiles: ['fast', 'candidate'], inputs: ['bin/**', 'src/interfaces/cli/**', 'src/application/compose-runtime.mjs', 'src/application/json-contracts.mjs', 'scripts/**', 'test/verification/cli/**', 'package.json'] }),
  step({ id: 'openspec-spec-quality', name: 'OpenSpec canonical spec quality', executor: { type: 'node', file: 'test/verification/openspec/spec-quality.mjs' }, profiles: ['fast', 'candidate'], inputs: ['openspec/**/*.md', 'openspec/**/*.yaml', 'test/verification/openspec/spec-quality.mjs'] }),
  step({ id: 'openspec-strict', name: 'openspec strict validation', executor: { type: 'openspec', args: ['validate', '--all', '--strict'] }, profiles: ['fast', 'candidate'], inputs: ['openspec/**'] }),
  step({ id: 'runtime-adapter-contract', name: 'runtime adapter contract', executor: { type: 'node', file: 'test/verification/runtime/adapter-contract.mjs' }, profiles: ['candidate'], groups: ['runtime'], inputs: ['src/infrastructure/runtime/**', 'src/application/domains/runtime.mjs', 'src/application/doctor/runtime-diagnostics.mjs', 'test/verification/runtime/adapter-contract.mjs', 'package/targets/runtime/**', 'docs/agent-runtime-adapters.md'] }),

  step({ id: 'integration-candidate-recovery', name: 'Candidate integration: builtin recovery and migration', executor: { type: 'npm', args: ['run', 'test:integration:candidate:recovery'] }, profiles: ['candidate'], groups: ['recovery'], inputs: [
    'test/integration-candidate-recovery/**', 'bin/buildr.mjs', 'buildr',
    'src/application/package-maintenance.mjs',
    'src/application/package-maintenance/builtin-lifecycle.mjs',
    'src/application/package-maintenance/builtin-receipts.mjs',
    'src/application/package-maintenance/builtin-replacement.mjs',
    'src/application/package-maintenance/sync-plan.mjs',
    'src/application/workspace-operations.mjs',
    'src/infrastructure/filesystem/**',
    'package/manifest.yml',
    'package/targets/workspace/manifest.yml',
  ], schedulingCostMs: 12000, concurrencyClass: 'workspace-heavy', resources: ['workspace-saturating'] }),
  step({ id: 'integration-candidate-release', name: 'Candidate integration: release Git convergence', executor: { type: 'npm', args: ['run', 'test:integration:candidate:release'] }, groups: ['release'], inputs: [
    'test/integration-candidate-release/**', 'scripts/release/bridge-main-to-dev.mjs', 'scripts/release/release-authority.mjs', 'scripts/release/release-convergence.mjs',
  ], schedulingCostMs: 12000, concurrencyClass: 'workspace-heavy', resources: ['workspace-saturating'] }),
  step({ id: 'concurrent-task-acceptance', name: 'Concurrent task workflow acceptance', executor: { type: 'node', file: 'test/verification/concurrency/task-acceptance.mjs' }, profiles: ['candidate'], groups: ['windows-npm-preflight'], inputs: [
    'test/verification/concurrency/**', 'test/helpers/child-process-supervisor.mjs', 'test/helpers/clean-product-source.mjs',
    'src/application/worktree/**', 'src/application/task-verification/**', 'src/application/verification/**', 'src/interfaces/local-app/runtime/preview-manager.mjs',
    'openspec/specs/concurrent-task-acceptance/**', 'openspec/specs/task-environments/**',
  ], schedulingCostMs: 20000, concurrencyClass: 'workspace-heavy', resources: ['workspace-saturating'] }),

  step({ id: 'host-node-contract', name: 'Host Node engine contract', executor: { type: 'node', file: 'test/verification/host-node/contract.mjs' }, profiles: ['host-node'], inputs: ['package.json', 'test/verification/host-node/**', 'test/verification/host-node.mjs'] }),
  step({ id: 'host-node-boundaries', name: 'Host Node sensitive boundaries', executor: { type: 'node-test', files: [
    'test/integration/process-infrastructure.test.mjs',
    'test/integration/workspace-node-runtime.test.mjs',
    'test/integration/workspace-sqlite.test.mjs',
  ], args: ['--test-concurrency=2', '--test-reporter=dot'] }, profiles: ['host-node'], inputs: [
    'test/integration/process-infrastructure.test.mjs',
    'test/integration/workspace-node-runtime.test.mjs',
    'test/integration/workspace-sqlite.test.mjs',
    'src/infrastructure/process.mjs',
    'src/infrastructure/filesystem/**',
    'src/infrastructure/sqlite/**',
    'test/verification/host-node.mjs',
    'test/verification/host-node/**',
  ], concurrencyClass: 'workspace-heavy' }),
  step({ id: 'candidate-tarball', name: 'frozen application payload and candidate npm tarball', executor: { type: 'candidate-artifact' }, profiles: ['candidate', 'host-node'], groups: ['release'], inputs: [
    'package.json', 'package-lock.json', 'LICENSE', 'README.md',
    'scripts/release/application-payload.mjs', 'scripts/release/application-payload-entry.mjs', 'scripts/release/release-artifact.mjs',
    'src/**', 'package/**', 'test/verification/release/candidate-package.mjs', 'test/verification/executor.mjs', '.github/workflows/publish.yml',
  ], inputExclusions: ['package/launchers/**'] }),
  step({ id: 'application-payload-release', name: 'application payload and npm runtime candidate', executor: { type: 'node-test', files: [
    'test/integration/application-payload-release.test.mjs',
  ], args: ['--test-concurrency=1', '--test-reporter=dot'], consumesArtifact: true }, profiles: ['candidate'], groups: ['release'], inputs: [
    'scripts/release/application-payload.mjs', 'scripts/release/application-payload-entry.mjs', 'scripts/release/release-artifact.mjs',
    'src/**', 'package/**', 'test/integration/application-payload-release.test.mjs',
    'test/verification/release/candidate-package.mjs', 'test/verification/executor.mjs', '.github/workflows/publish.yml',
  ], inputExclusions: ['package/launchers/**'], dependsOn: ['candidate-tarball'], schedulingCostMs: 15000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'npm-launcher-candidate', name: 'verified npm installation Launcher projection', executor: { type: 'node-test', files: [
    'test/integration/npm-launcher.test.mjs',
  ], args: ['--test-concurrency=1', '--test-reporter=dot'] }, profiles: ['candidate'], groups: ['release', 'windows-npm-preflight'], inputs: [
    'src/infrastructure/product-launcher/**', 'src/infrastructure/product-identity/**',
    'src/interfaces/cli/launcher.mjs', 'src/interfaces/local-app/http/server.mjs',
    'scripts/release/application-payload.mjs', 'scripts/release/application-payload-entry.mjs',
    'test/integration/npm-launcher.test.mjs', 'test/verification/release/release-smoke.mjs',
    '.github/workflows/publish.yml',
  ], concurrencyClass: 'workspace-heavy' }),
  step({ id: 'host-node-cli-smoke', name: 'Host Node installed CLI smoke', executor: { type: 'node', file: 'test/verification/host-node/cli-smoke.mjs', consumesArtifact: true }, profiles: ['host-node'], inputs: [
    'buildr', 'bin/buildr.mjs', 'src/interfaces/cli/**', 'src/application/doctor/**',
    'src/application/workspace-operations.mjs', 'scripts/release/runtime-role-verification.mjs', 'package.json', 'package-lock.json',
    'test/verification/host-node.mjs', 'test/verification/host-node/**', 'test/verification/release/candidate-package.mjs',
  ], dependsOn: ['candidate-tarball'], concurrencyClass: 'workspace-heavy' }),
  step({ id: 'open-source-candidate', name: 'open-source candidate', executor: { type: 'node', file: 'test/verification/release/open-source-candidate.mjs', consumesArtifact: true }, profiles: ['candidate'], groups: ['public', 'release'], inputs: ['package.json', 'package-lock.json', '.npmignore', 'README.md', 'LICENSE', 'CHANGELOG.md', 'CONTRIBUTING.md', 'SECURITY.md', '.github/workflows/publish.yml', 'docs/cli-reference.md', 'docs/cli-architecture.md', 'docs/known-limitations.md', 'docs/agent-runtime-adapters.md'], dependsOn: ['candidate-tarball'] }),
  step({ id: 'openspec-candidate-audit', name: 'OpenSpec contract candidate audit', executor: { type: 'node', file: 'test/verification/openspec/contract-audit.mjs' }, profiles: ['candidate'], groups: ['openspec'], inputs: ['openspec/**', 'test/verification/openspec/contract-audit.mjs'] }),
  step({ id: 'managed-mutations', name: 'managed mutations', executor: { type: 'node', file: 'test/verification/integrity/managed-mutations.mjs' }, profiles: ['candidate'], groups: ['package'], inputs: ['src/application/package-maintenance/**', 'src/application/workspace-operations.mjs', 'src/infrastructure/filesystem/**', 'src/infrastructure/runtime/**', 'package.json'] }),

  step({ id: 'capability-cli-integration', name: 'capability CLI integration', executor: { type: 'node', file: 'test/capability-cli.integration.mjs' }, profiles: ['candidate'], inputs: [
    'test/capability-cli.integration.mjs',
    'src/application/domains/package-assets.mjs',
    'src/application/domains/skills.mjs',
    'src/application/doctor/capability-diagnostics.mjs',
    'src/application/package-maintenance/builtin-lifecycle.mjs',
    'src/application/package-maintenance/static-validation.mjs',
    'src/infrastructure/runtime/skills/**',
    'package/targets/workspace/skills/**', 'package/targets/runtime/skills/**', 'skills/**', 'capabilities.yml',
  ], schedulingCostMs: 19000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'commands-cli-integration', name: 'Commands context CLI integration', executor: { type: 'node', file: 'test/commands-cli.integration.mjs' }, profiles: ['candidate'], groups: ['cli', 'package'], inputs: ['commands.yml', 'test/commands-cli.integration.mjs', 'src/application/domains/commands.mjs', 'src/application/domains/components.mjs', 'src/application/domains/workspace.mjs', 'src/application/doctor/**', 'src/interfaces/cli/help.mjs', 'package/targets/workspace/commands/**', 'package/targets/workspace/projects/commands.yml'], schedulingCostMs: 10000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'openspec-contract-fixtures', name: 'OpenSpec contract fixtures', executor: { type: 'node', file: 'test/verification/openspec/contract.mjs', args: ['--suite', 'contract'] }, profiles: ['candidate'], groups: ['openspec'], inputs: ['src/application/domains/openspec.mjs', 'src/application/openspec/**', 'test/verification/openspec/contract.mjs', 'package/targets/workspace/skills/buildr/openspec-contract-guard/**'], concurrencyClass: 'cpu-heavy' }),
  step({ id: 'openspec-convergence-recovery', name: 'OpenSpec convergence recovery journey', executor: { type: 'node', file: 'test/verification/openspec/contract.mjs', args: ['--suite', 'recovery'] }, profiles: ['candidate'], groups: ['openspec', 'recovery'], inputs: ['src/application/domains/openspec.mjs', 'src/application/openspec/**', 'test/verification/openspec/contract.mjs', 'package/targets/workspace/skills/buildr/openspec-contract-guard/**', 'package/targets/workspace/skills/buildr/task-development/**', 'package/targets/workspace/skills/buildr/current-knowledge-maintenance/**'], schedulingCostMs: 40000, concurrencyClass: 'workspace-heavy', resources: ['workspace-saturating'] }),
  step({ id: 'package-static', ...packageVerifier('static'), profiles: ['candidate'], groups: ['package'], inputs: ['package/**', 'package.json', 'package-lock.json', 'src/application/package-maintenance/**', 'test/verification/package/**'] }),
  step({ id: 'package-workspace', ...packageVerifier('workspace'), profiles: ['candidate'], groups: ['package'], inputs: ['package/targets/workspace/manifest.yml', 'package/targets/workspace/components/**', 'src/application/domains/workspace.mjs', 'src/application/workspace-operations.mjs', 'src/application/package-maintenance/**'], schedulingCostMs: 5000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'package-commands', ...packageVerifier('commands'), profiles: ['candidate'], groups: ['package'], inputs: ['package/targets/workspace/commands/**', 'src/application/domains/commands.mjs', 'src/application/package-maintenance/**'], schedulingCostMs: 3000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'package-rules', ...packageVerifier('rules'), profiles: ['candidate'], groups: ['package'], inputs: ['package/targets/workspace/rules/**', 'src/application/domains/rules.mjs', 'src/infrastructure/runtime/**', 'src/application/package-maintenance/**'], schedulingCostMs: 4000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'package-skills', ...packageVerifier('skills'), profiles: ['candidate'], groups: ['package'], inputs: ['package/targets/workspace/skills/**', 'package/targets/runtime/skills/**', 'src/application/domains/skills.mjs', 'src/infrastructure/runtime/skills/**', 'src/application/package-maintenance/**'], schedulingCostMs: 10000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'package-runtime', ...packageVerifier('runtime'), profiles: ['candidate'], groups: ['package', 'runtime'], inputs: ['package/targets/runtime/**', 'package/targets/workspace/rules/**', 'src/infrastructure/runtime/**', 'src/application/domains/runtime.mjs', 'src/application/package-maintenance/**'], schedulingCostMs: 7000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'runtime-skill-projection', name: 'runtime packaged Skill projection', executor: { type: 'node', file: 'test/verification/runtime/skill-projection.mjs' }, groups: ['runtime'], inputs: ['test/verification/runtime/skill-projection.mjs', 'test/verification/runtime/fixture.mjs', 'package/targets/workspace/skills/manifest.yml', 'package/targets/workspace/skills/buildr/**', 'package/targets/workspace/skills/openspec/**'], schedulingCostMs: 5000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'runtime-adapter-parity', name: 'runtime adapter implementation-family parity', executor: { type: 'node', file: 'test/verification/runtime/adapter-parity.mjs' }, profiles: ['candidate'], groups: ['runtime', 'windows-npm-preflight'], inputs: ['src/infrastructure/runtime/**', 'src/application/domains/runtime.mjs', 'src/application/doctor/runtime-diagnostics.mjs', 'test/verification/runtime/adapter-parity.mjs', 'test/verification/runtime/fixture.mjs', 'package/targets/runtime/**', 'package/targets/workspace/rules/**'], schedulingCostMs: 30000, concurrencyClass: 'workspace-heavy', resources: ['workspace-saturating'] }),

  step({ id: 'workspace-lifecycle', name: 'Workspace E2E: workspace lifecycle', executor: { type: 'workspace-suite', selector: 'workspace-lifecycle' }, profiles: ['candidate'], groups: ['windows-npm-preflight'], inputs: ['src/application/domains/workspace.mjs', 'src/application/domains/commands.mjs', 'src/application/domains/rules.mjs', 'src/application/domains/skills.mjs', 'test/verification/workspace/fixture.mjs', 'test/verification/workspace/workspace-lifecycle.mjs'], schedulingCostMs: 5000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'ownership-recovery', name: 'Workspace E2E: ownership recovery', executor: { type: 'workspace-suite', selector: 'ownership-recovery' }, profiles: ['candidate'], inputs: ['src/application/domains/components.mjs', 'src/application/package-maintenance/**', 'test/verification/workspace/fixture.mjs', 'test/verification/workspace/ownership-recovery.mjs'], schedulingCostMs: 6000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'runtime-reconciliation', name: 'Workspace E2E: runtime reconciliation', executor: { type: 'workspace-suite', selector: 'runtime-reconciliation' }, profiles: ['candidate'], inputs: ['src/infrastructure/runtime/**', 'src/application/domains/runtime.mjs', 'test/verification/workspace/fixture.mjs', 'test/verification/workspace/runtime-reconciliation.mjs', 'package/targets/runtime/**', 'package/targets/workspace/rules/**'], schedulingCostMs: 10000, concurrencyClass: 'workspace-heavy' }),

  step({ id: 'repository-onboarding', name: 'repository onboarding from a clean checkout', executor: { type: 'node', file: 'test/verification/onboarding/repository.mjs' }, inputs: ['buildr', 'scripts/run-development-cli', 'test/system/install-buildr-cli-runtime.test.mjs', 'test/verification/onboarding/repository.mjs', 'services/**', 'package.json', 'package-lock.json', 'README.md'], inputExclusions: ['services/buildr-web/**'], schedulingCostMs: 45000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'init-onboarding', name: 'single-command init onboarding', executor: { type: 'node', file: 'test/verification/onboarding/init.mjs' }, profiles: ['candidate'], inputs: ['src/application/domains/workspace.mjs', 'src/application/workspace-operations.mjs', 'test/verification/onboarding/init.mjs', 'package/targets/workspace/manifest.yml', 'package/targets/workspace/components/**'], schedulingCostMs: 7000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'cli-compatibility', name: 'CLI compatibility', executor: { type: 'node', file: 'test/verification/cli/compatibility.mjs' }, profiles: ['candidate'], groups: ['cli'], inputs: [
    'buildr', 'bin/buildr.mjs', 'src/interfaces/cli/**',
    'src/application/compose-runtime.mjs', 'src/application/json-contracts.mjs',
    'src/application/domains/runtime.mjs', 'src/infrastructure/runtime/adapter-contract.mjs',
    'test/verification/cli/compatibility.mjs', 'docs/cli-reference.md',
  ], schedulingCostMs: 7000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'cli-package-parity', name: 'CLI package parity', executor: { type: 'node', file: 'test/verification/cli/package-parity.mjs', consumesArtifact: true }, profiles: ['candidate'], groups: ['cli'], inputs: [
    'buildr', 'bin/buildr.mjs', 'src/interfaces/cli/**',
    'src/application/compose-runtime.mjs', 'src/application/json-contracts.mjs',
    'src/application/task-finish/task-finish-result-projection.mjs',
    'src/infrastructure/product-layout.mjs',
    'test/verification/cli/package-parity.mjs', 'package.json', 'package-lock.json',
  ], dependsOn: ['candidate-tarball'], schedulingCostMs: 6000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'service-branch-contract', name: 'Service branch contract', executor: { type: 'node', file: 'test/verification/onboarding/service-branch.mjs' }, profiles: ['candidate'], inputs: ['src/application/domains/workspace.mjs', 'test/verification/onboarding/service-branch.mjs', 'services/**'], inputExclusions: ['services/buildr-web/**'], schedulingCostMs: 3000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'remote-skill-timeout', name: 'remote Skill timeout contract', executor: { type: 'node', file: 'test/verification/network/remote-text.mjs' }, profiles: ['candidate'], inputs: [
    'src/infrastructure/network/**', 'src/infrastructure/product-invocation/**',
    'src/interfaces/cli/main.mjs', 'scripts/release/application-payload-entry.mjs',
    'src/application/domains/skills.mjs', 'test/verification/network/**',
  ], concurrencyClass: 'network' }),
  step({ id: 'release-tarball-smoke', name: 'release tarball smoke', executor: { type: 'node', file: 'test/verification/release/release-smoke.mjs', consumesArtifact: true }, profiles: ['candidate'], groups: ['release', 'windows-npm-preflight'], inputs: [
    'buildr', 'bin/buildr.mjs', 'src/interfaces/cli/**',
    'src/application/cli-update.mjs', 'src/application/compose-runtime.mjs',
    'src/application/package-maintenance/**', 'src/application/package-maintenance.mjs',
    'src/application/workspace-operations.mjs', 'src/infrastructure/product-layout.mjs',
    'package.json', 'package-lock.json', 'test/verification/release/**', '.github/workflows/publish.yml',
  ], dependsOn: ['candidate-tarball'], schedulingCostMs: 7000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'managed-data-integrity', name: 'managed data integrity', executor: { type: 'node', file: 'test/verification/integrity/managed-data-integrity.mjs' }, profiles: ['candidate'], groups: ['package'], inputs: [
    'src/application/package-maintenance/**', 'src/application/package-maintenance.mjs',
    'src/application/workspace-operations.mjs',
    'src/application/domains/commands.mjs', 'src/application/domains/components.mjs',
    'src/application/domains/rules.mjs', 'src/application/domains/skills.mjs',
    'src/application/domains/workspace.mjs', 'src/application/doctor/**',
    'src/infrastructure/filesystem/**', 'src/infrastructure/runtime/**',
    'package/manifest.yml', 'package/targets/workspace/manifest.yml',
    'package/targets/workspace/components/**',
    'package/targets/workspace/skills/buildr/task-retrospective/**',
    'test/verification/integrity/**',
  ], schedulingCostMs: 9000, concurrencyClass: 'workspace-heavy' }),

  step({ id: 'docs-quality', name: 'documentation quality', executor: { type: 'node', file: 'test/verification/docs/quality.mjs' }, profiles: ['candidate'], inputs: ['**/*.md', 'openspec/**/*.html', 'docs/publications/assets/**', 'test/verification/docs/quality.mjs'], concurrencyClass: 'default' }),
]);

const candidateShard = (id, runner, phase, stepIds, options = {}) => Object.freeze({
  id,
  runner,
  phase,
  stepIds: Object.freeze(stepIds),
  requiresArtifact: options.requiresArtifact === true,
  producesArtifact: options.producesArtifact === true,
});

export const CANDIDATE_CI_SHARDS = Object.freeze([
  candidateShard('preflight-macos', 'macos', 'preflight', [
    'unit',
    'component',
    'contract',
    'cli-architecture',
    'openspec-spec-quality',
    'openspec-strict',
    'runtime-adapter-contract',
    'openspec-candidate-audit',
    'managed-mutations',
    'package-static',
    'docs-quality',
  ]),
  candidateShard('artifact-macos', 'macos', 'artifact', [
    'candidate-tarball',
  ], { producesArtifact: true }),
  candidateShard('core-macos', 'macos', 'verification', [
    'integration',
    'system-verification-contracts',
    'system-local-app-http',
    'application-payload-release',
    'npm-launcher-candidate',
    'open-source-candidate',
    'capability-cli-integration',
    'commands-cli-integration',
    'openspec-contract-fixtures',
    'package-workspace',
    'package-commands',
    'package-rules',
    'package-skills',
    'package-runtime',
    'ownership-recovery',
    'runtime-reconciliation',
    'init-onboarding',
    'cli-compatibility',
    'cli-package-parity',
    'service-branch-contract',
    'remote-skill-timeout',
    'release-tarball-smoke',
    'managed-data-integrity',
  ], { requiresArtifact: true }),
  candidateShard('runtime-windows', 'windows', 'verification', [
    'system-runtime-recovery',
    'system-app-process',
    'npm-launcher-candidate',
    'runtime-adapter-parity',
    'release-tarball-smoke',
  ], { requiresArtifact: true }),
  candidateShard('workspace-windows', 'windows', 'verification', [
    'integration-task-development',
    'system-workspace-lifecycle',
    'system-task-finish',
    'integration-candidate-recovery',
    'concurrent-task-acceptance',
    'openspec-convergence-recovery',
    'workspace-lifecycle',
  ]),
  candidateShard('fresh-build-windows', 'windows', 'verification', [
    'system-fresh-build',
  ]),
]);

export const CANDIDATE_CI_PLATFORM_REPEATS = Object.freeze({
  'npm-launcher-candidate': Object.freeze(['core-macos', 'runtime-windows']),
  'release-tarball-smoke': Object.freeze(['core-macos', 'runtime-windows']),
});

export const CANDIDATE_CI_HOST_NODE_TUPLES = Object.freeze([
  Object.freeze({ id: 'host-minimum-macos', runner: 'macos', requestedNode: '24.15.0', expectation: 'minimum' }),
  Object.freeze({ id: 'host-minimum-windows', runner: 'windows', requestedNode: '24.15.0', expectation: 'minimum' }),
  Object.freeze({ id: 'host-current-macos', runner: 'macos', requestedNode: '24.x', expectation: 'current' }),
  Object.freeze({ id: 'host-current-windows', runner: 'windows', requestedNode: '24.x', expectation: 'current' }),
]);

export const VERIFICATION_TEST_INTENTS = Object.freeze(['Development', 'Acceptance', 'Static Conformance', 'Delivery / Release']);
export const VERIFICATION_EXECUTION_BOUNDARIES = Object.freeze(['Static', 'Unit', 'Component', 'Integration', 'System']);
export const VERIFICATION_PROFILES = Object.freeze(['fast', 'candidate', 'host-node']);
export const VERIFICATION_GROUPS = Object.freeze(['public', 'cli', 'runtime', 'package', 'openspec', 'release', 'recovery', 'windows-npm-preflight']);
export const VERIFICATION_EXECUTORS = Object.freeze(['node', 'node-test', 'npm', 'openspec', 'package-selector', 'workspace-suite', 'candidate-artifact']);

export function verificationStepById(id) {
  return verificationSteps.find((item) => item.id === id);
}
