import { PACKAGE_VERIFIERS } from '../../src/application/package-maintenance/verification-registry.mjs';

const PROJECT_OWNER = 'project:product';
const SERVICE_OWNER = 'service:product/buildr';

const testing = (ownerScope, primaryIntent, executionBoundary, orchestrationScenarios, targetDurationMs, proves) => Object.freeze({
  ownerScope,
  primaryIntent,
  executionBoundary,
  orchestrationScenarios: Object.freeze(orchestrationScenarios),
  targetDurationMs,
  proves,
});

export const VERIFICATION_STEP_TESTING = Object.freeze({
  unit: testing(SERVICE_OWNER, 'Development', 'Unit', ['Quick', 'Task-affected', 'Candidate'], 5000, 'Pure Buildr logic behaves correctly with collaborators replaced.'),
  component: testing(SERVICE_OWNER, 'Development', 'Component', ['Quick', 'Task-affected', 'Candidate'], 3000, 'A bounded Buildr application assembly behaves correctly with fake collaborators.'),
  integration: testing(SERVICE_OWNER, 'Development', 'Integration', ['Task-affected', 'Candidate'], 30000, 'Buildr modules behave correctly across real filesystem, Git, or process boundaries.'),
  'integration-fast': testing(PROJECT_OWNER, 'Development', 'System', ['Task-affected', 'Candidate'], 100000, 'Buildr public CLI and Workspace lifecycle journeys behave correctly.'),
  contract: testing(PROJECT_OWNER, 'Static Conformance', 'Integration', ['Quick', 'Task-affected', 'Candidate'], 15000, 'Product source, governance assets, and stable entrypoint contracts conform.'),
  'cli-architecture': testing(SERVICE_OWNER, 'Static Conformance', 'Static', ['Quick', 'Task-affected', 'Candidate'], 3000, 'CLI modules and wrappers preserve the declared architecture.'),
  'openspec-spec-quality': testing(PROJECT_OWNER, 'Static Conformance', 'Static', ['Quick', 'Task-affected', 'Candidate'], 3000, 'Canonical OpenSpec specifications meet Product quality rules.'),
  'openspec-strict': testing(PROJECT_OWNER, 'Static Conformance', 'Static', ['Quick', 'Task-affected', 'Candidate'], 5000, 'All OpenSpec artifacts pass upstream strict validation.'),
  'runtime-adapter-contract': testing(SERVICE_OWNER, 'Static Conformance', 'Integration', ['Quick', 'Task-affected', 'Candidate'], 5000, 'Runtime adapter declarations and lightweight projections satisfy their contract.'),
  'integration-candidate-recovery': testing(SERVICE_OWNER, 'Development', 'System', ['Task-affected', 'Candidate'], 25000, 'Builtin recovery and migration journeys preserve user-owned state.'),
  'integration-candidate-release': testing(PROJECT_OWNER, 'Delivery / Release', 'System', ['Task-affected', 'Candidate'], 15000, 'Release branch convergence behaves correctly.'),
  'concurrent-task-acceptance': testing(PROJECT_OWNER, 'Acceptance', 'System', ['Task-affected', 'Candidate'], 30000, 'Concurrent Task workflows satisfy the declared acceptance contract.'),
  'candidate-tarball': testing(SERVICE_OWNER, 'Delivery / Release', 'System', ['Task-affected', 'Candidate'], 10000, 'The Buildr npm candidate artifact can be assembled.'),
  'open-source-candidate': testing(PROJECT_OWNER, 'Delivery / Release', 'Static', ['Task-affected', 'Candidate'], 10000, 'The candidate contains the required public release materials.'),
  'openspec-candidate-audit': testing(PROJECT_OWNER, 'Static Conformance', 'Static', ['Task-affected', 'Candidate'], 5000, 'Candidate OpenSpec contracts are current and internally consistent.'),
  'managed-mutations': testing(SERVICE_OWNER, 'Static Conformance', 'Static', ['Task-affected', 'Candidate'], 5000, 'Production filesystem mutations remain behind declared owners.'),
  'browser-shell': testing(PROJECT_OWNER, 'Development', 'System', ['Task-affected', 'Candidate'], 45000, 'The Local App application shell works through the browser surface.'),
  'browser-project': testing(PROJECT_OWNER, 'Development', 'System', ['Task-affected', 'Candidate'], 45000, 'The Local App Project journey works through the browser surface.'),
  'browser-service': testing(PROJECT_OWNER, 'Development', 'System', ['Task-affected', 'Candidate'], 45000, 'The Local App Service journey works through the browser surface.'),
  'browser-task': testing(PROJECT_OWNER, 'Development', 'System', ['Task-affected', 'Candidate'], 45000, 'The Local App Task journey works through the browser surface.'),
  'browser-change': testing(PROJECT_OWNER, 'Development', 'System', ['Task-affected', 'Candidate'], 45000, 'The Local App Change journey works through the browser surface.'),
  'capability-cli-integration': testing(SERVICE_OWNER, 'Development', 'Integration', ['Task-affected', 'Candidate'], 25000, 'Capability CLI operations integrate with package and runtime assets.'),
  'commands-cli-integration': testing(SERVICE_OWNER, 'Development', 'Integration', ['Task-affected', 'Candidate'], 10000, 'Commands context CLI operations integrate with managed workspace assets.'),
  'openspec-contract-fixtures': testing(PROJECT_OWNER, 'Development', 'Integration', ['Task-affected', 'Candidate'], 20000, 'OpenSpec application contracts hold across isolated fixture repositories.'),
  'openspec-convergence-recovery': testing(PROJECT_OWNER, 'Development', 'System', ['Task-affected', 'Candidate'], 60000, 'OpenSpec convergence and recovery complete through the public lifecycle.'),
  'package-static': testing(SERVICE_OWNER, 'Delivery / Release', 'Static', ['Task-affected', 'Candidate'], 5000, 'The Buildr package structure is valid.'),
  'package-workspace': testing(SERVICE_OWNER, 'Delivery / Release', 'Integration', ['Task-affected', 'Candidate'], 6000, 'Packaged Workspace assets install and check correctly.'),
  'package-commands': testing(SERVICE_OWNER, 'Delivery / Release', 'Integration', ['Task-affected', 'Candidate'], 7000, 'Packaged Commands assets integrate correctly.'),
  'package-rules': testing(SERVICE_OWNER, 'Delivery / Release', 'Integration', ['Task-affected', 'Candidate'], 8000, 'Packaged Rules assets integrate correctly.'),
  'package-skills': testing(SERVICE_OWNER, 'Delivery / Release', 'Integration', ['Task-affected', 'Candidate'], 12000, 'Packaged Skills assets integrate correctly.'),
  'package-runtime': testing(SERVICE_OWNER, 'Delivery / Release', 'Integration', ['Task-affected', 'Candidate'], 10000, 'Packaged runtime assets integrate correctly.'),
  'runtime-adapter-parity': testing(SERVICE_OWNER, 'Development', 'System', ['Task-affected', 'Candidate'], 30000, 'All supported runtime implementation families remain behaviorally aligned.'),
  'workspace-lifecycle': testing(PROJECT_OWNER, 'Development', 'System', ['Task-affected', 'Candidate'], 20000, 'A complete Workspace lifecycle succeeds through public entrypoints.'),
  'ownership-recovery': testing(PROJECT_OWNER, 'Development', 'System', ['Task-affected', 'Candidate'], 20000, 'Workspace ownership conflicts recover without losing user state.'),
  'runtime-reconciliation': testing(PROJECT_OWNER, 'Development', 'System', ['Task-affected', 'Candidate'], 30000, 'Workspace runtime projections reconcile across supported adapters.'),
  'repository-onboarding': testing(PROJECT_OWNER, 'Delivery / Release', 'System', ['Task-affected', 'Candidate'], 15000, 'A clean repository can install and run Buildr.'),
  'init-onboarding': testing(PROJECT_OWNER, 'Development', 'System', ['Task-affected', 'Candidate'], 15000, 'A user can initialize a Workspace through the public CLI.'),
  'cli-compatibility': testing(SERVICE_OWNER, 'Development', 'System', ['Task-affected', 'Candidate'], 15000, 'Documented CLI commands remain compatible.'),
  'cli-package-parity': testing(SERVICE_OWNER, 'Delivery / Release', 'System', ['Task-affected', 'Candidate'], 10000, 'Source and packaged CLI surfaces remain equivalent.'),
  'service-branch-contract': testing(PROJECT_OWNER, 'Development', 'System', ['Task-affected', 'Candidate'], 10000, 'Service branch configuration works in an isolated repository.'),
  'remote-skill-timeout': testing(SERVICE_OWNER, 'Development', 'Integration', ['Task-affected', 'Candidate'], 5000, 'Remote Skill reads fail within the declared timeout boundary.'),
  'release-tarball-smoke': testing(SERVICE_OWNER, 'Delivery / Release', 'System', ['Task-affected', 'Candidate', 'Release'], 10000, 'The release tarball installs and serves its public CLI surface.'),
  'managed-data-integrity': testing(PROJECT_OWNER, 'Development', 'System', ['Task-affected', 'Candidate'], 15000, 'Managed mutations remain atomic and preserve nested repositories.'),
  'docs-quality': testing(PROJECT_OWNER, 'Static Conformance', 'Static', ['Task-affected', 'Candidate'], 5000, 'Product documentation links and required content remain valid.'),
});

const step = (definition) => {
  const classification = VERIFICATION_STEP_TESTING[definition.id];
  return Object.freeze({
    dependsOn: [],
    profiles: [],
    groups: [],
    inputs: [],
    concurrencyClass: 'default',
    resources: [],
    preflight: null,
    ...definition,
    budgetMs: classification?.targetDurationMs ?? definition.budgetMs,
    testing: classification ? Object.freeze({ ...classification, primaryEvidenceOwner: definition.id }) : null,
  });
};

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
    'src/**',
    'test/verification/dag-scheduler.mjs',
    'test/verification/planner.mjs',
    'test/verification/resource-coordinator.mjs',
    'test/verification/registry.mjs',
    'test/verification/unit-coverage.mjs',
  ], concurrencyClass: 'cpu-heavy' }),
  step({ id: 'component', name: 'bounded component tests', executor: { type: 'npm', args: ['run', 'test:component'] }, profiles: ['fast', 'candidate'], inputs: [
    'test/component/**',
    'src/application/service/**',
  ], concurrencyClass: 'cpu-heavy' }),
  step({ id: 'integration', name: 'technical boundary integration tests', executor: { type: 'npm', args: ['run', 'test:integration'] }, profiles: ['candidate'], inputs: [
    'test/integration/**',
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
    'src/infrastructure/filesystem/workspace-node-runtime.mjs',
    'src/infrastructure/runtime/**',
    'src/interfaces/local-app/runtime/**',
    'src/interfaces/local-app/web/api-client.js',
    'src/interfaces/local-app/web/router.js',
    'test/verification/**',
    'package/**',
    'verification.yml',
  ], concurrencyClass: 'workspace-heavy' }),
  step({ id: 'contract', name: 'repository contract tests', executor: { type: 'npm', args: ['run', 'test:contract'] }, profiles: ['fast', 'candidate'], inputs: [
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
  step({ id: 'integration-fast', name: 'legacy full-system integration tests', executor: { type: 'npm', args: ['run', 'test:integration:fast'] }, profiles: ['candidate'], inputs: [
    'test/integration-fast/**',
    'bin/buildr.mjs', 'buildr',
    'src/application/cli-update.mjs',
    'src/application/change/**',
    'src/application/project/**',
    'src/application/service/**',
    'src/application/task-record/**',
    'src/application/task-review/**',
    'src/application/task-verification/**',
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
  ], schedulingCostMs: 10000, concurrencyClass: 'workspace-heavy' }),
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
  ], schedulingCostMs: 12000, concurrencyClass: 'workspace-heavy', resources: ['workspace-saturating'] }),
  step({ id: 'integration-candidate-release', name: 'Candidate integration: release Git convergence', executor: { type: 'npm', args: ['run', 'test:integration:candidate:release'] }, profiles: ['candidate'], groups: ['release'], inputs: [
    'test/integration-candidate-release/**', 'scripts/release/bridge-main-to-dev.mjs', 'scripts/release/release-convergence.mjs',
  ], schedulingCostMs: 12000, concurrencyClass: 'workspace-heavy', resources: ['workspace-saturating'] }),
  step({ id: 'concurrent-task-acceptance', name: 'Concurrent task workflow acceptance', executor: { type: 'node', file: 'test/verification/concurrency/task-acceptance.mjs' }, profiles: ['candidate'], inputs: [
    'test/verification/concurrency/**', 'test/fixtures/verification-resource-worker.mjs', 'test/helpers/child-process-supervisor.mjs',
    'src/application/worktree/**', 'src/application/task-finish/**', 'src/application/verification/**', 'src/interfaces/local-app/runtime/preview-manager.mjs',
    'openspec/specs/concurrent-task-acceptance/**', 'openspec/specs/task-environments/**',
  ], schedulingCostMs: 20000, concurrencyClass: 'workspace-heavy', resources: ['workspace-saturating'] }),

  step({ id: 'candidate-tarball', name: 'candidate npm tarball', executor: { type: 'candidate-artifact' }, profiles: ['candidate'], inputs: ['package.json', 'package-lock.json', 'buildr', 'bin/buildr.mjs', 'scripts/install-buildr-cli', 'scripts/uninstall-buildr-cli'] }),
  step({ id: 'open-source-candidate', name: 'open-source candidate', executor: { type: 'node', file: 'test/verification/release/open-source-candidate.mjs', consumesArtifact: true }, profiles: ['candidate'], groups: ['public', 'release'], inputs: ['package.json', 'package-lock.json', 'README.md', 'LICENSE', 'CHANGELOG.md', 'CONTRIBUTING.md', 'SECURITY.md', '.github/**', 'docs/cli-reference.md', 'docs/cli-architecture.md', 'docs/known-limitations.md', 'docs/agent-runtime-adapters.md'], dependsOn: ['candidate-tarball'] }),
  step({ id: 'openspec-candidate-audit', name: 'OpenSpec contract candidate audit', executor: { type: 'node', file: 'test/verification/openspec/contract-audit.mjs' }, profiles: ['candidate'], groups: ['openspec'], inputs: ['openspec/**'] }),
  step({ id: 'managed-mutations', name: 'managed mutations', executor: { type: 'node', file: 'test/verification/integrity/managed-mutations.mjs' }, profiles: ['candidate'], groups: ['package'], inputs: ['src/application/package-maintenance/**', 'src/application/workspace-operations.mjs', 'src/infrastructure/filesystem/**', 'src/infrastructure/runtime/**', 'package.json'] }),

  step({ id: 'browser-shell', name: 'Browser integration: application shell', executor: { type: 'node', file: 'test/browser-smoke/local-app-browser.test.mjs', args: ['shell'] }, profiles: ['candidate'], groups: ['browser'], inputs: ['test/browser-smoke/**', 'src/interfaces/local-app/web/app.js', 'src/interfaces/local-app/web/router.js', 'src/interfaces/local-app/web/index.html', 'src/interfaces/local-app/web/styles.css', 'src/interfaces/local-app/web/features/workspace.js', 'src/interfaces/local-app/web/features/workspaces.js'], concurrencyClass: 'exclusive', resources: ['browser'] }),
  step({ id: 'browser-project', name: 'Browser integration: Project flow', executor: { type: 'node', file: 'test/browser-smoke/local-app-browser.test.mjs', args: ['project'] }, profiles: ['candidate'], groups: ['browser'], inputs: ['test/browser-smoke/**', 'src/interfaces/local-app/web/features/projects.js', 'src/interfaces/local-app/web/features/project-detail.js', 'src/interfaces/local-app/web/features/project-edit.js'], concurrencyClass: 'exclusive', resources: ['browser'] }),
  step({ id: 'browser-service', name: 'Browser integration: Service flow', executor: { type: 'node', file: 'test/browser-smoke/local-app-browser.test.mjs', args: ['service'] }, profiles: ['candidate'], groups: ['browser'], inputs: ['test/browser-smoke/**', 'src/interfaces/local-app/web/features/services.js', 'src/interfaces/local-app/web/features/service-detail.js', 'src/interfaces/local-app/web/features/service-edit.js'], concurrencyClass: 'exclusive', resources: ['browser'] }),
  step({ id: 'browser-task', name: 'Browser integration: Task Record flow', executor: { type: 'node', file: 'test/browser-smoke/local-app-browser.test.mjs', args: ['task'] }, profiles: ['candidate'], groups: ['browser'], inputs: ['test/browser-smoke/**', 'src/interfaces/local-app/web/features/tasks.js', 'src/interfaces/local-app/web/features/task-detail.js'], concurrencyClass: 'exclusive', resources: ['browser'] }),
  step({ id: 'browser-change', name: 'Browser integration: Change flow', executor: { type: 'node', file: 'test/browser-smoke/local-app-browser.test.mjs', args: ['change'] }, profiles: ['candidate'], groups: ['browser'], inputs: ['test/browser-smoke/**', 'src/interfaces/local-app/web/features/changes.js', 'src/interfaces/local-app/web/features/change-detail.js', 'src/interfaces/local-app/web/features/agent-actions.js', 'src/interfaces/local-app/web/markdown.js', 'src/interfaces/local-app/web/styles.css'], concurrencyClass: 'exclusive', resources: ['browser'] }),

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
  step({ id: 'openspec-contract-fixtures', name: 'OpenSpec contract fixtures', executor: { type: 'node', file: 'test/verification/openspec/contract.mjs' }, profiles: ['candidate'], groups: ['openspec'], inputs: ['src/application/domains/openspec.mjs', 'src/application/openspec/**', 'test/verification/openspec/**', 'openspec/**', 'package/targets/workspace/skills/buildr/openspec-contract-guard/**'], concurrencyClass: 'cpu-heavy' }),
  step({ id: 'openspec-convergence-recovery', name: 'OpenSpec convergence recovery journey', executor: { type: 'node', file: 'test/verification/openspec/contract.mjs', args: ['--suite', 'recovery'] }, profiles: ['candidate'], groups: ['openspec', 'recovery'], inputs: ['src/application/domains/openspec.mjs', 'src/application/openspec/**', 'src/application/task-finish/**', 'test/verification/openspec/**', 'openspec/**', 'package/targets/workspace/skills/buildr/openspec-contract-guard/**', 'package/targets/workspace/skills/buildr/task-finish/**'], schedulingCostMs: 40000, concurrencyClass: 'workspace-heavy', resources: ['workspace-saturating'] }),
  step({ id: 'package-static', ...packageVerifier('static'), profiles: ['candidate'], groups: ['package'], inputs: ['package/**', 'package.json', 'package-lock.json', 'src/application/package-maintenance/**', 'test/verification/package/**'] }),
  step({ id: 'package-workspace', ...packageVerifier('workspace'), profiles: ['candidate'], groups: ['package'], inputs: ['package/targets/workspace/manifest.yml', 'package/targets/workspace/components/**', 'src/application/domains/workspace.mjs', 'src/application/workspace-operations.mjs', 'src/application/package-maintenance/**'], concurrencyClass: 'workspace-heavy' }),
  step({ id: 'package-commands', ...packageVerifier('commands'), profiles: ['candidate'], groups: ['package'], inputs: ['package/targets/workspace/commands/**', 'src/application/domains/commands.mjs', 'src/application/package-maintenance/**'], concurrencyClass: 'workspace-heavy' }),
  step({ id: 'package-rules', ...packageVerifier('rules'), profiles: ['candidate'], groups: ['package'], inputs: ['package/targets/workspace/rules/**', 'src/application/domains/rules.mjs', 'src/infrastructure/runtime/**', 'src/application/package-maintenance/**'], concurrencyClass: 'workspace-heavy' }),
  step({ id: 'package-skills', ...packageVerifier('skills'), profiles: ['candidate'], groups: ['package'], inputs: ['package/targets/workspace/skills/**', 'package/targets/runtime/skills/**', 'src/application/domains/skills.mjs', 'src/infrastructure/runtime/skills/**', 'src/application/package-maintenance/**'], schedulingCostMs: 10000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'package-runtime', ...packageVerifier('runtime'), profiles: ['candidate'], groups: ['package', 'runtime'], inputs: ['package/targets/runtime/**', 'package/targets/workspace/rules/**', 'src/infrastructure/runtime/**', 'src/application/domains/runtime.mjs', 'src/application/package-maintenance/**'], schedulingCostMs: 7000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'runtime-adapter-parity', name: 'runtime adapter implementation-family parity', executor: { type: 'node', file: 'test/verification/runtime/adapter-parity.mjs' }, profiles: ['candidate'], groups: ['runtime'], inputs: ['src/infrastructure/runtime/**', 'src/application/domains/runtime.mjs', 'src/application/doctor/runtime-diagnostics.mjs', 'test/verification/runtime/adapter-parity.mjs', 'package/targets/runtime/**', 'package/targets/workspace/rules/**', 'package/targets/workspace/skills/**'], schedulingCostMs: 30000, concurrencyClass: 'workspace-heavy', resources: ['workspace-saturating'] }),

  step({ id: 'workspace-lifecycle', name: 'Workspace E2E: workspace lifecycle', executor: { type: 'workspace-suite', selector: 'workspace-lifecycle' }, profiles: ['candidate'], inputs: ['src/application/domains/workspace.mjs', 'src/application/domains/commands.mjs', 'src/application/domains/rules.mjs', 'src/application/domains/skills.mjs', 'test/verification/workspace/fixture.mjs', 'test/verification/workspace/workspace-lifecycle.mjs'], concurrencyClass: 'workspace-heavy' }),
  step({ id: 'ownership-recovery', name: 'Workspace E2E: ownership recovery', executor: { type: 'workspace-suite', selector: 'ownership-recovery' }, profiles: ['candidate'], inputs: ['src/application/domains/components.mjs', 'src/application/package-maintenance/**', 'test/verification/workspace/fixture.mjs', 'test/verification/workspace/ownership-recovery.mjs'], schedulingCostMs: 6000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'runtime-reconciliation', name: 'Workspace E2E: runtime reconciliation', executor: { type: 'workspace-suite', selector: 'runtime-reconciliation' }, profiles: ['candidate'], inputs: ['src/infrastructure/runtime/**', 'src/application/domains/runtime.mjs', 'test/verification/workspace/fixture.mjs', 'test/verification/workspace/runtime-reconciliation.mjs', 'package/targets/runtime/**', 'package/targets/workspace/rules/**'], schedulingCostMs: 5000, concurrencyClass: 'workspace-heavy' }),

  step({ id: 'repository-onboarding', name: 'repository onboarding from a clean checkout', executor: { type: 'node', file: 'test/verification/onboarding/repository.mjs' }, profiles: ['candidate'], inputs: ['scripts/install-buildr-cli', 'test/verification/onboarding/repository.mjs', 'services/**', 'package.json', 'package-lock.json', 'README.md'], schedulingCostMs: 6000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'init-onboarding', name: 'single-command init onboarding', executor: { type: 'node', file: 'test/verification/onboarding/init.mjs' }, profiles: ['candidate'], inputs: ['src/application/domains/workspace.mjs', 'src/application/workspace-operations.mjs', 'test/verification/onboarding/init.mjs', 'package/targets/workspace/manifest.yml', 'package/targets/workspace/components/**'], concurrencyClass: 'workspace-heavy' }),
  step({ id: 'cli-compatibility', name: 'CLI compatibility', executor: { type: 'node', file: 'test/verification/cli/compatibility.mjs' }, profiles: ['candidate'], groups: ['cli'], inputs: [
    'buildr', 'bin/buildr.mjs', 'src/interfaces/cli/**',
    'src/application/compose-runtime.mjs', 'src/application/json-contracts.mjs',
    'src/application/domains/runtime.mjs', 'src/infrastructure/runtime/adapter-contract.mjs',
    'test/verification/cli/compatibility.mjs', 'docs/cli-reference.md',
  ], schedulingCostMs: 9000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'cli-package-parity', name: 'CLI package parity', executor: { type: 'node', file: 'test/verification/cli/package-parity.mjs', consumesArtifact: true }, profiles: ['candidate'], groups: ['cli'], inputs: [
    'buildr', 'bin/buildr.mjs', 'src/interfaces/cli/**',
    'src/application/compose-runtime.mjs', 'src/application/json-contracts.mjs',
    'src/infrastructure/product-layout.mjs',
    'test/verification/cli/package-parity.mjs', 'package.json', 'package-lock.json',
  ], dependsOn: ['candidate-tarball'], schedulingCostMs: 6000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'service-branch-contract', name: 'Service branch contract', executor: { type: 'node', file: 'test/verification/onboarding/service-branch.mjs' }, profiles: ['candidate'], inputs: ['src/application/domains/workspace.mjs', 'test/verification/onboarding/service-branch.mjs', 'services/**'], concurrencyClass: 'workspace-heavy' }),
  step({ id: 'remote-skill-timeout', name: 'remote Skill timeout contract', executor: { type: 'node', file: 'test/verification/network/remote-text.mjs' }, profiles: ['candidate'], inputs: ['src/infrastructure/network/fetch-remote-text.mjs', 'src/application/domains/skills.mjs', 'test/verification/network/**'], concurrencyClass: 'network' }),
  step({ id: 'release-tarball-smoke', name: 'release tarball smoke', executor: { type: 'node', file: 'test/verification/release/release-smoke.mjs', consumesArtifact: true }, profiles: ['candidate'], groups: ['release'], inputs: [
    'buildr', 'bin/buildr.mjs', 'src/interfaces/cli/**',
    'src/application/cli-update.mjs', 'src/application/compose-runtime.mjs',
    'src/application/package-maintenance/**', 'src/application/package-maintenance.mjs',
    'src/application/workspace-operations.mjs', 'src/infrastructure/product-layout.mjs',
    'package.json', 'package-lock.json', 'package/**', 'test/verification/release/**',
  ], dependsOn: ['candidate-tarball'], concurrencyClass: 'workspace-heavy' }),
  step({ id: 'managed-data-integrity', name: 'managed data integrity', executor: { type: 'node', file: 'test/verification/integrity/managed-data-integrity.mjs' }, profiles: ['candidate'], groups: ['package'], inputs: [
    'src/application/package-maintenance/**', 'src/application/package-maintenance.mjs',
    'src/application/workspace-operations.mjs',
    'src/application/domains/commands.mjs', 'src/application/domains/components.mjs',
    'src/application/domains/rules.mjs', 'src/application/domains/skills.mjs',
    'src/application/domains/workspace.mjs', 'src/application/doctor/**',
    'src/infrastructure/filesystem/**', 'src/infrastructure/runtime/**',
    'package/**', 'test/verification/integrity/**',
  ], schedulingCostMs: 9000, concurrencyClass: 'workspace-heavy' }),

  step({ id: 'docs-quality', name: 'documentation quality', executor: { type: 'node', file: 'test/verification/docs/quality.mjs' }, profiles: ['candidate'], inputs: ['**/*.md', 'openspec/**/*.html', 'test/verification/docs/quality.mjs'], concurrencyClass: 'default' }),
]);

export const VERIFICATION_TEST_INTENTS = Object.freeze(['Development', 'Acceptance', 'Static Conformance', 'Delivery / Release']);
export const VERIFICATION_EXECUTION_BOUNDARIES = Object.freeze(['Static', 'Unit', 'Component', 'Integration', 'System']);
export const VERIFICATION_ORCHESTRATION_SCENARIOS = Object.freeze(['Quick', 'Task-affected', 'Candidate', 'Release']);
export const VERIFICATION_PROFILES = Object.freeze(['fast', 'candidate']);
export const VERIFICATION_GROUPS = Object.freeze(['public', 'cli', 'runtime', 'package', 'openspec', 'release', 'recovery', 'browser']);
export const VERIFICATION_EXECUTORS = Object.freeze(['node', 'npm', 'openspec', 'package-selector', 'workspace-suite', 'candidate-artifact']);

export function verificationStepById(id) {
  return verificationSteps.find((item) => item.id === id);
}
