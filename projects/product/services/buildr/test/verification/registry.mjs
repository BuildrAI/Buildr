import { PACKAGE_VERIFIERS } from '../../src/agent-assets/application/package-maintenance/verification-registry.mjs';
import { assertVerificationContextDispositionCoverage, verificationContextDisposition } from '../context/dispositions.mjs';
import { TEST_CONTEXT_KEYS, TASK_LIFECYCLE_CONTEXT_KEY, testContextProfileByKey } from '../context/profiles.mjs';
import { verificationStepOwnership } from './ownership.mjs';
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

export const VERIFICATION_SLOW_EVIDENCE_THRESHOLD_MS = 15_000;

const primaryEvidence = (counterexample, retainedBoundary, decision = 'retain-primary') => Object.freeze({
  counterexample,
  retainedBoundary,
  decision,
});

export const VERIFICATION_STEP_TESTING = Object.freeze({
  typecheck: testing(SERVICE_OWNER, 'Static Conformance', 'Static', 5000, 'Buildr TypeScript production sources satisfy the strict no-emit execution contract.', TEST_ENVIRONMENTS.sourceReadOnly),
  unit: testing(SERVICE_OWNER, 'Development', 'Unit', 5000, 'Pure Buildr logic behaves correctly with collaborators replaced.', TEST_ENVIRONMENTS.pure),
  component: testing(SERVICE_OWNER, 'Development', 'Component', 3000, 'A bounded Buildr application assembly behaves correctly with fake collaborators.', TEST_ENVIRONMENTS.pure),
  integration: testing(SERVICE_OWNER, 'Development', 'Integration', 10000, 'Small cross-domain technical boundaries behave correctly across real filesystem, Git, or process boundaries.', TEST_ENVIRONMENTS.repeatedGitCli),
  'integration-declarations': testing(SERVICE_OWNER, 'Development', 'Integration', 5000, 'Project preparation and verification declarations preserve diagnostics and package registry boundaries.', TEST_ENVIRONMENTS.repeatedFilesystem),
  'integration-openspec': testing(SERVICE_OWNER, 'Development', 'Integration', 5000, 'Change and OpenSpec convergence applications preserve real filesystem and Git boundaries.', TEST_ENVIRONMENTS.repeatedGitCli),
  'integration-verification': testing(SERVICE_OWNER, 'Development', 'Integration', 10000, 'Verification planning, evidence, runtime, resource coordination, and public entrypoints remain coherent.', TEST_ENVIRONMENTS.repeatedCli),
  'integration-runtime': testing(SERVICE_OWNER, 'Development', 'Integration', 10000, 'Runtime, capability, Buildr Web, and Web dist boundaries remain coherent.', TEST_ENVIRONMENTS.repeatedCli),
  'integration-release': testing(SERVICE_OWNER, 'Development', 'Integration', 5000, 'Release filesystem and installation identity boundaries remain coherent without publishing.', TEST_ENVIRONMENTS.repeatedFilesystem),
  'integration-data-store': testing(SERVICE_OWNER, 'Development', 'Integration', 5000, 'Workspace SQLite authority, migration, and checkout isolation remain coherent.', TEST_ENVIRONMENTS.repeatedFilesystem),
  'integration-task-environment': testing(SERVICE_OWNER, 'Development', 'Integration', 15000, 'Task Environment planning, preparation, diagnostics, and repository boundaries remain coherent.', TEST_ENVIRONMENTS.repeatedGitCli),
  'integration-self-bootstrap': testing(SERVICE_OWNER, 'Development', 'Integration', 45000, 'The single self-bootstrap closeout lifecycle preserves retained checkout and runtime synchronization boundaries.', TEST_ENVIRONMENTS.workspaceLifecycle),
  'integration-task-read-models': testing(SERVICE_OWNER, 'Development', 'Integration', 8000, 'Task entry and read-model applications preserve their SQLite and Application boundaries.', TEST_ENVIRONMENTS.repeatedFilesystem),
  'integration-task-coordination': testing(SERVICE_OWNER, 'Development', 'Integration', 8000, 'Parent coordination and publication applications preserve their real repository boundaries.', TEST_ENVIRONMENTS.repeatedGitCli),
  'integration-project-daily-progress': testing(SERVICE_OWNER, 'Development', 'Integration', 8000, 'Project daily progress Application, store, and CLI boundaries remain coherent without synthesizing Git.', TEST_ENVIRONMENTS.repeatedFilesystem),
  'integration-task-execution-records': testing(SERVICE_OWNER, 'Development', 'Integration', 20000, 'Task and Verification execution records preserve metadata, body-store, recovery, and retention boundaries.', TEST_ENVIRONMENTS.repeatedFilesystem),
  'integration-task-development': testing(SERVICE_OWNER, 'Development', 'Integration', 25000, 'Task Development, Review, and Verification lifecycle behavior remains correct across real CLI, filesystem, Git, and Application boundaries.', TEST_ENVIRONMENTS.workspaceLifecycle),
  'integration-task-finish': testing(SERVICE_OWNER, 'Development', 'Integration', 20000, 'Task Finish core bootstrap, run, diagnostics, entry, and SQLite behavior remains correct.', TEST_ENVIRONMENTS.repeatedGitCli),
  'integration-task-finish-delivery': testing(SERVICE_OWNER, 'Development', 'Integration', 75000, 'Task Finish remote delivery, retained activation, cleanup, and contribution behavior remains correct.', TEST_ENVIRONMENTS.repeatedGitCli),
  'system-windows-platform': testing(PROJECT_OWNER, 'Development', 'System', 300000, 'Windows high-risk CLI, worktree, Task Environment, Task Finish, launcher, and managed runtime journeys behave correctly.', TEST_ENVIRONMENTS.workspaceLifecycle),
  'system-buildr-web-http': testing(PROJECT_OWNER, 'Development', 'System', 15000, 'Buildr Web Runtime HTTP routes preserve read, error, session and cleanup boundaries.', TEST_ENVIRONMENTS.workspaceLifecycle),
  'system-task-finish': testing(PROJECT_OWNER, 'Development', 'System', 120000, 'The complete Task Finish product delivery journey behaves correctly.', TEST_ENVIRONMENTS.workspaceLifecycle),
  'system-task-finish-cli': testing(PROJECT_OWNER, 'Development', 'System', 15000, 'Task Finish public CLI journey and result projection behave correctly.', TEST_ENVIRONMENTS.workspaceLifecycle),
  'system-verification-admission': testing(PROJECT_OWNER, 'Static Conformance', 'System', 10000, 'Changed-path collection and Verification run entry contracts fail closed before heavy verification starts.', TEST_ENVIRONMENTS.repeatedCli),
  'system-verification-contracts': testing(PROJECT_OWNER, 'Development', 'System', 15000, 'Verification orchestration, timing, resource, and Workspace contracts hold through public entrypoints.', TEST_ENVIRONMENTS.repeatedCli),
  'system-public-json-contracts': testing(PROJECT_OWNER, 'Static Conformance', 'System', 25000, 'Public JSON outputs remain closed, versioned, and stable through real CLI entrypoints.', TEST_ENVIRONMENTS.repeatedCli),
  'system-openspec-contract-audit': testing(PROJECT_OWNER, 'Static Conformance', 'System', 8000, 'OpenSpec public audit remains complete through its real project entrypoint.', TEST_ENVIRONMENTS.repeatedCli),
  'system-workspace-lifecycle': testing(PROJECT_OWNER, 'Development', 'System', 55000, 'Project, Service, Workspace catalog, and package capability journeys behave correctly.', TEST_ENVIRONMENTS.workspaceLifecycle),
  'system-task-lifecycle': testing(PROJECT_OWNER, 'Development', 'System', 25000, 'Task Record, Change, Development, Review, and Verification journeys behave correctly.', TEST_ENVIRONMENTS.workspaceLifecycle),
  'system-worktree-lifecycle': testing(PROJECT_OWNER, 'Development', 'System', 45000, 'Real Git Worktree and Task Environment create and cleanup journeys behave correctly.', TEST_ENVIRONMENTS.workspaceLifecycle),
  'system-runtime-recovery': testing(PROJECT_OWNER, 'Development', 'System', 30000, 'Runtime installation and recovery journeys behave correctly.', TEST_ENVIRONMENTS.workspaceLifecycle),
  'system-app-process': testing(PROJECT_OWNER, 'Development', 'System', 25000, 'Buildr Web process and preview lifecycle remain isolated.', TEST_ENVIRONMENTS.workspaceLifecycle),
  'system-fresh-build': testing(PROJECT_OWNER, 'Development', 'System', 180000, 'A clean Task Environment performs real dependency installation and Web build.', TEST_ENVIRONMENTS.workspaceLifecycle),
  contract: testing(PROJECT_OWNER, 'Static Conformance', 'Static', 5000, 'Product source, governance assets, and stable entrypoint declarations conform without mutable fixtures.', TEST_ENVIRONMENTS.sourceReadOnly),
  'cli-architecture': testing(SERVICE_OWNER, 'Static Conformance', 'Static', 3000, 'CLI modules and wrappers preserve the declared architecture.', TEST_ENVIRONMENTS.sourceReadOnly),
  'openspec-spec-quality': testing(PROJECT_OWNER, 'Static Conformance', 'Static', 3000, 'Canonical OpenSpec specifications meet Product quality rules.', TEST_ENVIRONMENTS.sourceReadOnly),
  'openspec-strict': testing(PROJECT_OWNER, 'Static Conformance', 'Static', 5000, 'All OpenSpec artifacts pass upstream strict validation.', TEST_ENVIRONMENTS.cliReadOnly),
  'runtime-adapter-contract': testing(SERVICE_OWNER, 'Static Conformance', 'Integration', 5000, 'Runtime adapter declarations and isolated filesystem projections satisfy their contract.', TEST_ENVIRONMENTS.repeatedFilesystem),
  'runtime-skill-projection': testing(SERVICE_OWNER, 'Development', 'Integration', 8000, 'Changed packaged Skills bind their source identity and complete projected inventory through every supported runtime adapter.', TEST_ENVIRONMENTS.repeatedFilesystem),
  'integration-candidate-release': testing(PROJECT_OWNER, 'Delivery / Release', 'System', 15000, 'Release contract cold-start and branch convergence behave correctly.', TEST_ENVIRONMENTS.repeatedGitCli),
  'concurrent-task-acceptance': testing(PROJECT_OWNER, 'Acceptance', 'System', 40000, 'Concurrent Task workflows satisfy the declared acceptance contract.', TEST_ENVIRONMENTS.workspaceLifecycle),
  'candidate-tarball': testing(SERVICE_OWNER, 'Delivery / Release', 'System', 15000, 'One frozen application payload produces the single npm candidate tarball consumed by later verification.', TEST_ENVIRONMENTS.isolatedGitCli),
  'application-payload-release': testing(SERVICE_OWNER, 'Delivery / Release', 'System', 30000, 'The frozen application payload is deterministic, complete, host-Node compatible, and serves Buildr Web only on demand.', TEST_ENVIRONMENTS.workspaceLifecycle),
  'npm-launcher-candidate': testing(PROJECT_OWNER, 'Delivery / Release', 'Integration', 15000, 'The explicit local Launcher binds one verified npm installation without copying Node or Buildr and fails closed on identity drift.', TEST_ENVIRONMENTS.repeatedFilesystem),
  'host-node-contract': testing(SERVICE_OWNER, 'Static Conformance', 'Static', 2000, 'The active Host Node satisfies the bounded package engine contract.', TEST_ENVIRONMENTS.sourceReadOnly),
  'host-node-boundaries': testing(SERVICE_OWNER, 'Development', 'Integration', 15000, 'Node-sensitive SQLite, process, and filesystem boundaries work on the active Host Node.', TEST_ENVIRONMENTS.repeatedFilesystem),
  'host-node-cli-smoke': testing(SERVICE_OWNER, 'Delivery / Release', 'System', 15000, 'The candidate tarball installs on the active Host Node and executes CLI and Web.', TEST_ENVIRONMENTS.workspaceLifecycle),
  'open-source-candidate': testing(PROJECT_OWNER, 'Delivery / Release', 'Static', 10000, 'The candidate contains the required public release materials.', TEST_ENVIRONMENTS.sourceReadOnly),
  'openspec-candidate-audit': testing(PROJECT_OWNER, 'Static Conformance', 'Static', 5000, 'Candidate OpenSpec contracts are current and internally consistent.', TEST_ENVIRONMENTS.sourceReadOnly),
  'managed-mutations': testing(SERVICE_OWNER, 'Static Conformance', 'Static', 5000, 'Production filesystem mutations remain behind declared owners.', TEST_ENVIRONMENTS.sourceReadOnly),
  'capability-cli-integration': testing(SERVICE_OWNER, 'Development', 'Integration', 35000, 'Capability CLI operations integrate with package and runtime assets.', TEST_ENVIRONMENTS.repeatedCli),
  'commands-cli-integration': testing(SERVICE_OWNER, 'Development', 'Integration', 15000, 'Commands context CLI operations integrate with managed workspace assets.', TEST_ENVIRONMENTS.repeatedCli),
  'openspec-contract-fixtures': testing(PROJECT_OWNER, 'Development', 'Integration', 20000, 'OpenSpec application contracts hold across isolated fixture repositories.', TEST_ENVIRONMENTS.repeatedGitCli),
  'openspec-convergence-recovery': testing(PROJECT_OWNER, 'Development', 'System', 60000, 'OpenSpec convergence and recovery complete through the public lifecycle.', TEST_ENVIRONMENTS.workspaceLifecycle),
  'package-static': testing(SERVICE_OWNER, 'Delivery / Release', 'Static', 5000, 'The Buildr package structure is valid.', TEST_ENVIRONMENTS.sourceReadOnly),
  'package-workspace': testing(SERVICE_OWNER, 'Delivery / Release', 'Integration', 10000, 'Packaged Workspace assets install and check correctly.', TEST_ENVIRONMENTS.repeatedFilesystem),
  'package-commands': testing(SERVICE_OWNER, 'Delivery / Release', 'Integration', 7000, 'Packaged Commands assets integrate correctly.', TEST_ENVIRONMENTS.repeatedFilesystem),
  'package-rules': testing(SERVICE_OWNER, 'Delivery / Release', 'Integration', 8000, 'Packaged Rules assets integrate correctly.', TEST_ENVIRONMENTS.repeatedFilesystem),
  'package-skills': testing(SERVICE_OWNER, 'Delivery / Release', 'Integration', 12000, 'Packaged Skills assets integrate correctly.', TEST_ENVIRONMENTS.repeatedFilesystem),
  'package-runtime': testing(SERVICE_OWNER, 'Delivery / Release', 'Integration', 10000, 'Packaged runtime assets integrate correctly.', TEST_ENVIRONMENTS.repeatedFilesystem),
  'runtime-adapter-parity': testing(SERVICE_OWNER, 'Development', 'System', 40000, 'All supported runtime implementation families remain behaviorally aligned.', TEST_ENVIRONMENTS.workspaceLifecycle),
  'workspace-lifecycle': testing(PROJECT_OWNER, 'Development', 'System', 20000, 'A complete Workspace lifecycle succeeds through public entrypoints.', TEST_ENVIRONMENTS.workspaceLifecycle),
  'ownership-recovery': testing(PROJECT_OWNER, 'Development', 'System', 20000, 'Workspace ownership conflicts recover without losing user state.', TEST_ENVIRONMENTS.workspaceLifecycle),
  'runtime-reconciliation': testing(PROJECT_OWNER, 'Development', 'System', 30000, 'Workspace runtime projections reconcile across supported adapters.', TEST_ENVIRONMENTS.workspaceLifecycle),
  'repository-onboarding': testing(PROJECT_OWNER, 'Delivery / Release', 'System', 90000, 'A clean repository can use the explicit development entry without mutating the PATH default CLI.', TEST_ENVIRONMENTS.workspaceLifecycle),
  'init-onboarding': testing(PROJECT_OWNER, 'Development', 'System', 15000, 'A user can initialize a Workspace through the public CLI.', TEST_ENVIRONMENTS.workspaceLifecycle),
  'cli-compatibility': testing(SERVICE_OWNER, 'Development', 'System', 15000, 'Documented CLI commands remain compatible.', TEST_ENVIRONMENTS.repeatedCli),
  'cli-package-parity': testing(SERVICE_OWNER, 'Delivery / Release', 'Integration', 20000, 'Representative source and packaged CLI outputs and one init mutation remain equivalent.', TEST_ENVIRONMENTS.repeatedCli),
  'service-branch-contract': testing(PROJECT_OWNER, 'Development', 'System', 10000, 'Service branch configuration works in an isolated repository.', TEST_ENVIRONMENTS.isolatedGitCli),
  'remote-skill-timeout': testing(SERVICE_OWNER, 'Development', 'Integration', 10000, 'Remote Skill reads fail within the declared timeout boundary.', TEST_ENVIRONMENTS.loopbackNetwork),
  'release-tarball-smoke': testing(SERVICE_OWNER, 'Delivery / Release', 'System', 25000, 'The shared release tarball installs, keeps ordinary CLI HTTP-free, and serves healthy Buildr Web on demand.', TEST_ENVIRONMENTS.workspaceLifecycle),
  'managed-data-integrity': testing(PROJECT_OWNER, 'Development', 'System', 15000, 'Managed mutations remain atomic and preserve nested repositories.', TEST_ENVIRONMENTS.workspaceLifecycle),
  'docs-quality': testing(PROJECT_OWNER, 'Static Conformance', 'Static', 5000, 'Product documentation links and required content remain valid.', TEST_ENVIRONMENTS.sourceReadOnly),
});

export const VERIFICATION_STEP_EVIDENCE = Object.freeze({
  'integration-task-environment': primaryEvidence(
    'A preparation plan with a stale controller, invalid repository handoff, or leaked diagnostic must be rejected.',
    'real filesystem, Git repository, and CLI handoff',
  ),
  'integration-self-bootstrap': primaryEvidence(
    'A retained checkout whose delivered identity or runtime synchronization drifts must fail closeout.',
    'real retained checkout, Git identity, and runtime synchronization',
  ),
  'integration-task-execution-records': primaryEvidence(
    'A truncated body, mismatched metadata identity, failed recovery, or retention leak must be observable.',
    'real SQLite and filesystem-backed execution record persistence',
  ),
  'integration-task-development': primaryEvidence(
    'A stale planning, Candidate, Review, Verification, or repository identity must block the lifecycle transition.',
    'real CLI, filesystem, Git, and SQLite-backed Task Development lifecycle',
  ),
  'integration-task-finish': primaryEvidence(
    'A bootstrap, readiness, run, diagnostics, or SQLite mismatch must stop Task Finish before unsafe effects.',
    'real Task Finish CLI and SQLite boundary',
  ),
  'integration-task-finish-delivery': primaryEvidence(
    'A remote delivery mismatch, retained activation drift, occupied carrier, or cleanup ownership gap must fail closed.',
    'real Git remote, retained activation, contribution, and cleanup boundaries',
  ),
  'system-verification-contracts': primaryEvidence(
    'A public verification run that violates scheduling, timing, resource, or Workspace result contracts must fail.',
    'public verification and Workspace entrypoints',
  ),
  'system-public-json-contracts': primaryEvidence(
    'A CLI command emitting an open, unversioned, or unstable JSON result must fail the public contract.',
    'real CLI process and serialized public JSON',
  ),
  'system-workspace-lifecycle': primaryEvidence(
    'A Project, Service, catalog, or package capability journey that loses persisted state must fail.',
    'real Workspace, Project, Service, Git, and package capability journeys',
  ),
  'system-task-lifecycle': primaryEvidence(
    'A public Task Record, Change, Development, Review, or Verification journey with stale state must fail.',
    'real public Task lifecycle across CLI, Git, Workspace, and SQLite',
  ),
  'system-worktree-lifecycle': primaryEvidence(
    'A real worktree create or cleanup that targets the wrong ref, repository, or ownership must fail.',
    'real Git worktree and Task Environment lifecycle',
  ),
  'system-runtime-recovery': primaryEvidence(
    'A runtime install or recovery with mismatched target authority or incomplete projection must fail.',
    'real runtime installation, filesystem projection, and recovery process',
  ),
  'system-buildr-web-http': primaryEvidence(
    'A real Buildr Web HTTP session that leaks state, misprojects an error, or survives cleanup must fail.',
    'real loopback HTTP server, session, and cleanup lifecycle',
  ),
  'system-app-process': primaryEvidence(
    'A Buildr Web or preview process that crosses channel/profile boundaries or survives owned cleanup must fail.',
    'real child process, port, profile, and process cleanup',
  ),
  'system-task-finish': primaryEvidence(
    'A complete Product delivery journey with mismatched source, remote result, activation, or cleanup must fail.',
    'complete real Task Finish product delivery journey',
  ),
  'system-task-finish-cli': primaryEvidence(
    'The public Task Finish CLI must reject stale readiness and project the exact terminal result.',
    'real public Task Finish CLI process',
  ),
  'concurrent-task-acceptance': primaryEvidence(
    'Two concurrent Task workflows that leak state, violate isolation, or corrupt a shared authority must fail.',
    'real concurrent Workspace, Git, SQLite, and process lifecycle',
  ),
  'capability-cli-integration': primaryEvidence(
    'A capability CLI mutation with inconsistent package/runtime projection or public result must fail.',
    'real capability CLI and managed asset boundary',
  ),
  'commands-cli-integration': primaryEvidence(
    'A Commands CLI operation that writes outside managed Workspace assets or returns stale state must fail.',
    'real Commands CLI and managed Workspace filesystem',
  ),
  'openspec-contract-fixtures': primaryEvidence(
    'An isolated OpenSpec fixture with an invalid application contract or Git state must fail.',
    'real isolated fixture repository, Git, and OpenSpec process',
  ),
  'openspec-convergence-recovery': primaryEvidence(
    'An interrupted or drifting convergence transaction must recover or fail without corrupting canonical specs.',
    'complete real OpenSpec convergence and recovery lifecycle',
  ),
  'runtime-adapter-parity': primaryEvidence(
    'Two supported runtime adapter families that project different behavior or inventories must fail parity.',
    'real supported runtime adapter processes and filesystem projections',
  ),
  'workspace-lifecycle': primaryEvidence(
    'The public init-to-doctor journey must fail when Project, Service, Rule, Command, Skill, sync, or Doctor state is missing.',
    'single complete public Workspace init, registration, sync, and Doctor journey',
  ),
  'ownership-recovery': primaryEvidence(
    'A Workspace ownership conflict that overwrites or loses existing user state must fail recovery.',
    'real conflicting Workspace ownership and recovery mutation',
  ),
  'runtime-reconciliation': primaryEvidence(
    'Runtime projections that cannot reconcile to one declared adapter identity must fail.',
    'real Workspace runtime projections across supported adapters',
  ),
  'cli-compatibility': primaryEvidence(
    'A documented CLI command whose arguments, exit status, or observable result becomes incompatible must fail.',
    'real CLI process and documented command surface',
  ),
  'managed-data-integrity': primaryEvidence(
    'A managed mutation that is non-atomic or damages a nested repository must fail integrity checks.',
    'real filesystem mutation and nested Git repository preservation',
  ),
});

export const VERIFICATION_DAILY_CORE_EXCLUSIONS = Object.freeze({
  'candidate-tarball': 'Produces the unique release Candidate tarball.',
  'application-payload-release': 'Validates the packaged application payload and npm runtime.',
  'npm-launcher-candidate': 'Validates the Launcher against a verified npm Candidate installation.',
  'open-source-candidate': 'Validates public release materials in the frozen Candidate.',
  'package-static': 'Validates the publishable npm package structure.',
  'package-workspace': 'Validates packaged Workspace assets.',
  'package-commands': 'Validates packaged Commands assets.',
  'package-rules': 'Validates packaged Rules assets.',
  'package-skills': 'Validates packaged Skills assets.',
  'package-runtime': 'Validates packaged runtime assets.',
  'cli-package-parity': 'Compares source and packaged CLI behavior.',
  'release-tarball-smoke': 'Runs the installed release tarball smoke journey.',
  'system-fresh-build': 'Runs a clean dependency installation and Web build Candidate journey.',
  'init-onboarding': 'Runs the complete fresh initialization onboarding journey.',
});

const step = (definition) => {
  const classification = VERIFICATION_STEP_TESTING[definition.id];
  const evidence = VERIFICATION_STEP_EVIDENCE[definition.id] ?? null;
  const contextDisposition = verificationContextDisposition(definition.id);
  const ownership = verificationStepOwnership(definition.id);
  const declaredProfiles = definition.profiles ?? [];
  const profiles = declaredProfiles.includes('candidate') && !Object.hasOwn(VERIFICATION_DAILY_CORE_EXCLUSIONS, definition.id)
    ? [...declaredProfiles, 'core']
    : [...declaredProfiles];
  const timeoutMs = definition.timeoutMs ?? (
    classification?.environment.footprints.includes('workspace-lifecycle') ? 360_000
      : classification?.primaryIntent === 'Delivery / Release' || (classification?.targetDurationMs ?? 0) >= 25_000 ? 300_000
        : 180_000
  );
  const contexts = [...(definition.contexts ?? [])];
  const contextProfiles = contexts.map(testContextProfileByKey).filter(Boolean);
  const staticWorkerArgument = definition.executor?.args?.find((argument) => argument.startsWith('--test-concurrency='));
  const workers = definition.workerDemand ?? (staticWorkerArgument ? Number(staticWorkerArgument.split('=')[1]) : 1);
  const footprints = classification?.environment?.footprints ?? [];
  const resourceDemand = definition.resourceDemand ?? {
    workers,
    processes: workers,
    ...(footprints.includes('git') ? { git: 1 } : {}),
    ...(footprints.includes('workspace-lifecycle') || contextProfiles.some((profile) => profile.resourceDemand.workspaceIo) ? { workspaceIo: 1 } : {}),
  };
  return Object.freeze({
    dependsOn: [],
    profiles: [],
    groups: [],
    concurrencyClass: 'default',
    resources: [],
    contexts: Object.freeze([]),
    isolationMode: 'none',
    resetStrategy: 'none',
    parallelSafety: 'worker-safe',
    resourceDemand: Object.freeze({ workers: 1, processes: 1 }),
    preflight: null,
    admission: false,
    developmentRunners: [],
    ...definition,
    profiles: Object.freeze(profiles),
    contexts: Object.freeze(contexts),
    isolationMode: definition.isolationMode ?? (contexts.length > 0 ? 'sandbox' : footprints.includes('workspace-lifecycle') ? 'full-lifecycle' : classification?.environment?.isolation === 'unique-temporary-root' ? 'sandbox' : 'none'),
    resetStrategy: definition.resetStrategy ?? (contexts.length > 0 || ['single-cleanup', 'repeated-cleanup', 'lifecycle'].includes(classification?.resetBurden) ? 'recreate' : 'none'),
    parallelSafety: definition.parallelSafety ?? (definition.concurrencyClass === 'exclusive' ? 'exclusive' : definition.concurrencyClass === 'workspace-heavy' || (definition.resources?.length ?? 0) > 0 ? 'bounded' : 'worker-safe'),
    resourceDemand: Object.freeze({ ...resourceDemand }),
    inputs: ownership.inputs,
    inputExclusions: ownership.inputExclusions,
    preflight: definition.preflight ? Object.freeze({ ...definition.preflight, inputs: ownership.preflightInputs }) : null,
    timeoutMs,
    budgetMs: classification?.targetDurationMs ?? definition.budgetMs,
    testing: classification ? Object.freeze({
      ...classification,
      primaryEvidenceOwner: classification.primaryEvidenceOwner ?? definition.id,
      ...(evidence ? { evidence: Object.freeze({ ...evidence, publicOutcome: classification.proves }) } : {}),
    }) : null,
    contextDisposition,
  });
};

const packageVerifier = (selector) => {
  const verifier = PACKAGE_VERIFIERS.find((item) => item.id === selector);
  if (!verifier) throw new Error(`Missing package verifier declaration: ${selector}`);
  return { name: verifier.name, executor: { type: 'package-selector', selector } };
};

const concurrency = (global, workspaceHeavy, workspaceSaturating, innerConcurrency, capacities) => Object.freeze({
  global,
  classes: Object.freeze({ default: global, 'cpu-heavy': 2, 'workspace-heavy': workspaceHeavy, network: 2, exclusive: 1 }),
  resources: Object.freeze({ 'workspace-saturating': workspaceSaturating, 'task-lifecycle-heavy': 1, 'app-runtime': 1 }),
  innerConcurrency: Object.freeze(innerConcurrency),
  capacities: Object.freeze(capacities),
});

export const VERIFICATION_RESOURCE_CONTRACTS = Object.freeze({
  'workspace-saturating': Object.freeze({
    requiredFootprints: Object.freeze(['workspace-lifecycle']),
    isolation: 'unique-temporary-root',
    resetBurdens: Object.freeze(['lifecycle']),
  }),
  'task-lifecycle-heavy': Object.freeze({
    requiredFootprints: Object.freeze(['workspace-lifecycle']),
    isolation: 'unique-temporary-root',
    resetBurdens: Object.freeze(['lifecycle']),
  }),
  'app-runtime': Object.freeze({
    requiredFootprints: Object.freeze(['workspace-lifecycle']),
    isolation: 'unique-temporary-root',
    resetBurdens: Object.freeze(['lifecycle']),
  }),
});

export const VERIFICATION_EXECUTION_PROFILES = Object.freeze({
  local: concurrency(4, 3, 2, { integration: 4, 'integration-task-finish-delivery': 2, ...Object.fromEntries(SYSTEM_SUITES.map((suite) => [suite.id, suite.innerConcurrency])), 'openspec-contract-fixtures': 2, 'openspec-convergence-recovery': 3 }, { workers: 8, processes: 8, git: 3, workspaceIo: 3 }),
  ci: concurrency(4, 3, 2, { integration: 4, 'integration-task-finish-delivery': 2, ...Object.fromEntries(SYSTEM_SUITES.map((suite) => [suite.id, suite.innerConcurrency])), 'openspec-contract-fixtures': 2, 'openspec-convergence-recovery': 3 }, { workers: 8, processes: 8, git: 3, workspaceIo: 3 }),
  'ci-workspace-limited': concurrency(4, 2, 1, { integration: 3, 'integration-task-finish-delivery': 1, ...Object.fromEntries(SYSTEM_SUITES.map((suite) => [suite.id, Math.min(suite.innerConcurrency, 2)])), 'openspec-contract-fixtures': 2, 'openspec-convergence-recovery': 2 }, { workers: 6, processes: 6, git: 2, workspaceIo: 2 }),
});

export const VERIFICATION_CONCURRENCY = VERIFICATION_EXECUTION_PROFILES.local;

export const VERIFICATION_ENVIRONMENT_FOOTPRINTS = Object.freeze(['filesystem', 'cli', 'git', 'loopback-network', 'network', 'workspace-lifecycle']);
export const VERIFICATION_DEVELOPMENT_RUNNERS = Object.freeze(['windows']);
export const VERIFICATION_ENVIRONMENT_ISOLATIONS = Object.freeze(['none', 'read-only', 'unique-temporary-root', 'shared']);
export const VERIFICATION_RESET_BURDENS = Object.freeze(['none', 'single-cleanup', 'repeated-cleanup', 'lifecycle']);
export const VERIFICATION_CONTEXT_KEYS = TEST_CONTEXT_KEYS;
export const VERIFICATION_ISOLATION_MODES = Object.freeze(['none', 'transaction', 'sandbox', 'full-lifecycle']);
export const VERIFICATION_RESET_STRATEGIES = Object.freeze(['none', 'rollback', 'snapshot', 'recreate']);
export const VERIFICATION_PARALLEL_SAFETY = Object.freeze(['worker-safe', 'bounded', 'exclusive']);
export const VERIFICATION_RESOURCE_DEMANDS = Object.freeze(['workers', 'processes', 'git', 'workspaceIo']);

export function resolveVerificationExecutionProfile(value, env = process.env) {
  const id = value || (env.CI === 'true' ? 'ci' : 'local');
  const limits = VERIFICATION_EXECUTION_PROFILES[id];
  if (!limits) throw new Error(`Unknown verification execution profile: ${id}`);
  return { id, limits };
}

const integrationSlice = (id, files, options = {}) => Object.freeze({
  id,
  files: Object.freeze(files),
  executorType: options.executorType ?? 'node-test',
  schedulingCostMs: options.schedulingCostMs,
  ...(options.timeoutMs == null ? {} : { timeoutMs: options.timeoutMs }),
  concurrencyClass: options.concurrencyClass ?? 'workspace-heavy',
  resources: Object.freeze(options.resources ?? []),
  contexts: Object.freeze(options.contexts ?? []),
  admission: options.admission === true,
  args: Object.freeze([...(options.args ?? []), '--test-reporter=dot']),
});

export const INTEGRATION_PRIMARY_SLICES = Object.freeze([
  integrationSlice('integration-declarations', [
    'test/integration/core-diagnostics-and-package.test.mjs',
    'test/integration/internal-workflow-route-diagnostics.test.mjs',
    'test/integration/project-verification.test.mjs',
  ], { schedulingCostMs: 1000, concurrencyClass: 'cpu-heavy', args: ['--test-concurrency=2'] }),
  integrationSlice('integration-openspec', [
    'test/integration/change-application.test.mjs',
    'test/integration/openspec-convergence-preflight.test.mjs',
    'test/integration/openspec-convergence-recovery.test.mjs',
    'test/integration/openspec-convergence-transaction.test.mjs',
    'test/integration/openspec-deterministic-sync.test.mjs',
    'test/integration/openspec-domain.test.mjs',
    'test/integration/openspec-projected-validator.test.mjs',
  ], { schedulingCostMs: 2000, args: ['--test-concurrency=3'] }),
  integrationSlice('integration-verification', [
    'test/integration/verification-entrypoints-cli.test.mjs',
    'test/integration/verification-evidence-lifecycle.test.mjs',
    'test/integration/verification-planner.test.mjs',
    'test/integration/verification-resource-coordinator.test.mjs',
    'test/integration/test-context-runtime.test.mjs',
    'test/integration/node-test-context-host.test.mjs',
    'test/integration/buildr-test-context-provider.test.mjs',
    'test/integration/test-context-public-consumer.test.mjs',
    'test/integration/verification-test-files.test.mjs',
  ], { schedulingCostMs: 5000, admission: true, args: ['--test-concurrency=3'] }),
  integrationSlice('integration-runtime', [
    'test/integration/capability-contracts.test.mjs',
    'test/integration/capability-runtime.test.mjs',
    'test/integration/buildr-web-read-executor.test.mjs',
    'test/integration/buildr-web-runtime.test.mjs',
    'test/integration/buildr-web-workspace.test.mjs',
    'test/integration/preview-ownership.test.mjs',
    'test/integration/runtime-skills.test.mjs',
    'test/integration/task-record-http-contract.test.mjs',
    'test/integration/task-manager-capability-graph.test.mjs',
    'test/integration/task-pre-create-git-capability-graph.test.mjs',
    'test/integration/web-dist-verification.test.mjs',
  ], { schedulingCostMs: 4000, args: ['--test-concurrency=4'], contexts: [TASK_LIFECYCLE_CONTEXT_KEY] }),
  integrationSlice('integration-release', [
    'test/integration/open-source-release-filesystem.test.mjs',
    'test/integration/product-installation-identity.test.mjs',
    'test/integration/product-installation-registry.test.mjs',
  ], { schedulingCostMs: 2000, args: ['--test-concurrency=2'] }),
  integrationSlice('integration-data-store', [
    'test/integration/workspace-management-fence.test.mjs',
    'test/integration/workspace-sqlite.test.mjs',
  ], { schedulingCostMs: 2000, args: ['--test-concurrency=1'] }),
  integrationSlice('integration-task-environment', [
    'test/integration/project-environment-preparation-diagnostics.test.mjs',
    'test/integration/task-environment-controller-handoff.test.mjs',
    'test/integration/task-environment-preparation-plan.test.mjs',
    'test/integration/task-environment-repository.test.mjs',
  ], { schedulingCostMs: 10000, executorType: 'node-context-test', args: ['--test-concurrency=2'] }),
  integrationSlice('integration-self-bootstrap', [
    'test/integration/self-bootstrap-closeout.test.mjs',
  ], { schedulingCostMs: 50000, resources: ['workspace-saturating'], args: ['--test-concurrency=1'] }),
  integrationSlice('integration-task-read-models', [
    'test/integration/task-entry-snapshot-application.test.mjs',
    'test/integration/task-overview-repository.test.mjs',
    'test/integration/task-planning-identity-application.test.mjs',
    'test/integration/task-retrospective-repository.test.mjs',
  ], { schedulingCostMs: 4000, executorType: 'node-context-test', concurrencyClass: 'cpu-heavy', args: ['--test-concurrency=2'] }),
  integrationSlice('integration-task-coordination', [
    'test/integration/parent-coordination-application.test.mjs',
    'test/integration/parent-coordination-repository.test.mjs',
    'test/integration/publication-application.test.mjs',
  ], { schedulingCostMs: 5000, executorType: 'node-context-test', concurrencyClass: 'cpu-heavy', args: ['--test-concurrency=2'] }),
  integrationSlice('integration-project-daily-progress', [
    'test/integration/project-daily-progress-application.test.mjs',
  ], { schedulingCostMs: 5000, executorType: 'node-context-test', concurrencyClass: 'cpu-heavy', args: ['--test-concurrency=2'] }),
  integrationSlice('integration-task-execution-records', [
    'test/integration/task-execution-record-application.test.mjs',
    'test/integration/task-execution-record-body-store.test.mjs',
    'test/integration/task-finish-execution-record-recovery.test.mjs',
    'test/integration/verification-execution-record-application.test.mjs',
  ], { schedulingCostMs: 50000, executorType: 'node-context-test', args: ['--test-concurrency=2'], contexts: [TASK_LIFECYCLE_CONTEXT_KEY] }),
  integrationSlice('integration-task-development', [
    'test/integration/task-verification-repository.test.mjs',
    'test/integration/task-development-application-shard-3.test.mjs',
    'test/integration/task-development-application.test.mjs',
    'test/integration/task-development-application-shard-4.test.mjs',
    'test/integration/task-development-application-shard-2.test.mjs',
    'test/integration/task-review-repository.test.mjs',
    'test/integration/task-development-repository.test.mjs',
    'test/integration/task-development-driver-profile.test.mjs',
    'test/integration/task-development-driver-discovery.test.mjs',
  ], { schedulingCostMs: 30000, executorType: 'node-context-test', resources: ['workspace-saturating', 'task-lifecycle-heavy'], contexts: [TASK_LIFECYCLE_CONTEXT_KEY], args: ['--test-concurrency=4'] }),
  integrationSlice('integration-task-finish', [
    'test/integration/task-finish-bootstrap-application.test.mjs',
    'test/integration/task-finish-bootstrap-capsule.test.mjs',
    'test/integration/task-finish-diagnostics-evidence.test.mjs',
    'test/integration/task-finish-entry-readiness.test.mjs',
    'test/integration/task-finish-run.test.mjs',
    'test/integration/task-finish-sqlite.test.mjs',
    'test/integration/task-finish-maintenance.test.mjs',
  ], { schedulingCostMs: 11000, executorType: 'node-context-test', args: ['--test-concurrency=2'] }),
  integrationSlice('integration-task-finish-delivery', [
    'test/integration/task-finish-delivery-reconciliation.test.mjs',
    'test/integration/task-finish-delivery-remote.test.mjs',
    'test/integration/task-finish-retained-activation.test.mjs',
    'test/integration/task-finish-retained-cleanup.test.mjs',
    'test/integration/task-finish-task-contribution.test.mjs',
    'test/integration/task-finish-occupancy-release.test.mjs',
  ], { schedulingCostMs: 75_000, timeoutMs: 360_000 }),
]);

export const INTEGRATION_GENERAL_EXCLUDED_FILES = Object.freeze([...new Set([
  'test/integration/application-payload-release.test.mjs',
  'test/integration/npm-launcher.test.mjs',
  ...INTEGRATION_PRIMARY_SLICES.flatMap((slice) => slice.files),
])]);

export const verificationSteps = Object.freeze([
  step({ id: 'typecheck', name: 'TypeScript static checking', executor: { type: 'npm', args: ['run', 'typecheck'] }, profiles: ['fast', 'candidate'], }),
  step({ id: 'unit', name: 'fine-grained unit tests', executor: { type: 'npm', args: ['run', 'test:unit'] }, profiles: ['fast', 'candidate'],  concurrencyClass: 'cpu-heavy' }),
  step({ id: 'component', name: 'bounded component tests', executor: { type: 'npm', args: ['run', 'test:component'] }, profiles: ['fast', 'candidate'],  concurrencyClass: 'cpu-heavy' }),
  step({ id: 'integration', name: 'cross-domain technical boundary integration tests', executor: { type: 'node', file: 'test/verification/integration.mjs', args: ['--suite', 'general'] }, profiles: ['candidate'], workerDemand: 4, schedulingCostMs: 5000, concurrencyClass: 'workspace-heavy' }),
  ...INTEGRATION_PRIMARY_SLICES.map((slice) => step({
    id: slice.id,
    name: ({
      'integration-declarations': 'Project declaration integration slice',
      'integration-openspec': 'OpenSpec application integration slice',
      'integration-verification': 'Verification orchestration integration slice',
      'integration-runtime': 'Runtime and Buildr Web integration slice',
      'integration-release': 'Release and installation integration slice',
      'integration-data-store': 'Workspace data-store integration slice',
      'integration-task-environment': 'Task Environment integration slice',
      'integration-self-bootstrap': 'Self-bootstrap closeout integration slice',
      'integration-task-read-models': 'Task read-model integration slice',
      'integration-task-coordination': 'Task coordination integration slice',
      'integration-project-daily-progress': 'Project daily progress integration slice',
      'integration-task-execution-records': 'Task execution-record integration slice',
      'integration-task-development': 'Task Development lifecycle integration',
      'integration-task-finish': 'Task Finish core integration slice',
      'integration-task-finish-delivery': 'Task Finish delivery integration slice',
    })[slice.id],
    executor: { type: slice.executorType, files: [...slice.files], args: [...slice.args] },
    profiles: ['candidate'],
    schedulingCostMs: slice.schedulingCostMs,
    ...(slice.timeoutMs == null ? {} : { timeoutMs: slice.timeoutMs }),
    concurrencyClass: slice.concurrencyClass,
    resources: [...slice.resources],
    contexts: [...slice.contexts],
    admission: slice.admission,
  })),
  step({ id: 'contract', name: 'repository contract tests', executor: { type: 'npm', args: ['run', 'test:contract'] }, profiles: ['fast', 'candidate'],  concurrencyClass: 'cpu-heavy', preflight: {
    executor: { type: 'node', file: 'test/contract/task-development.test.mjs' },
    budgetMs: 3000,
    sideEffects: 'none',
  } }),
  ...SYSTEM_SUITES.map((suite) => step({
    id: suite.id,
    name: suite.name,
    executor: { type: 'node', file: 'test/verification/system.mjs', args: ['--owner', suite.id] },
    profiles: ['candidate'],
    schedulingCostMs: suite.schedulingCostMs,
    concurrencyClass: suite.concurrencyClass,
    resources: [...suite.resources],
    contexts: [...(suite.contexts ?? [])],
    workerDemand: suite.innerConcurrency,
    admission: suite.id === 'system-verification-admission',
  })),
  step({ id: 'system-windows-platform', name: 'Windows high-risk system journey slice', executor: { type: 'node-test', files: [
    'test/system/cli-update.test.mjs',
    'test/system/buildr-web-launcher.test.mjs',
    'test/system/task-environment-fresh-build-web.test.mjs',
    'test/system/task-finish-cli.test.mjs',
    'test/system/task-finish-product-journey.test.mjs',
    'test/system/workspace-runtime-recovery.test.mjs',
    'test/system/worktree-create.test.mjs',
  ], args: ['--test-concurrency=1', '--test-reporter=dot'] }, groups: ['windows-npm-preflight'], selection: 'explicit-only', developmentRunners: ['windows'],  schedulingCostMs: 300000, concurrencyClass: 'workspace-heavy', resources: ['workspace-saturating', 'task-lifecycle-heavy'] }),
  step({ id: 'cli-architecture', name: 'CLI modular architecture', executor: { type: 'node', file: 'test/verification/cli/architecture.mjs' }, profiles: ['fast', 'candidate'], }),
  step({ id: 'openspec-spec-quality', name: 'OpenSpec canonical spec quality', executor: { type: 'node', file: 'test/verification/openspec/spec-quality.mjs' }, profiles: ['fast', 'candidate'], }),
  step({ id: 'openspec-strict', name: 'openspec strict validation', executor: { type: 'openspec', args: ['validate', '--all', '--strict'] }, profiles: ['fast', 'candidate'], }),
  step({ id: 'runtime-adapter-contract', name: 'runtime adapter contract', executor: { type: 'node', file: 'test/verification/runtime/adapter-contract.mjs' }, profiles: ['candidate'], groups: ['runtime'], }),

  step({ id: 'integration-candidate-release', name: 'Candidate integration: release contract and Git convergence', executor: { type: 'npm', args: ['run', 'test:integration:candidate:release'] }, groups: ['release'],  schedulingCostMs: 12000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'concurrent-task-acceptance', name: 'Concurrent task workflow acceptance', executor: { type: 'node', file: 'test/verification/concurrency/task-acceptance.mjs' }, profiles: ['candidate'], groups: ['windows-npm-preflight'],  schedulingCostMs: 40000, concurrencyClass: 'workspace-heavy', resources: ['workspace-saturating'] }),

  step({ id: 'host-node-contract', name: 'Host Node engine contract', executor: { type: 'node', file: 'test/verification/host-node/contract.mjs' }, profiles: ['host-node'], }),
  step({ id: 'host-node-boundaries', name: 'Host Node sensitive boundaries', executor: { type: 'node-test', files: [
    'test/integration/process-infrastructure.test.mjs',
    'test/integration/workspace-sqlite.test.mjs',
  ], args: ['--test-concurrency=2', '--test-reporter=dot'] }, profiles: ['host-node'],  concurrencyClass: 'workspace-heavy' }),
  step({ id: 'candidate-tarball', name: 'frozen application payload and candidate npm tarball', executor: { type: 'candidate-artifact' }, profiles: ['candidate', 'host-node'], groups: ['release'],  }),
  step({ id: 'application-payload-release', name: 'application payload and npm runtime candidate', executor: { type: 'node-test', files: [
    'test/integration/application-payload-release.test.mjs',
  ], args: ['--test-concurrency=1', '--test-reporter=dot'], consumesArtifact: true }, profiles: ['candidate'], groups: ['release'],   dependsOn: ['candidate-tarball'], schedulingCostMs: 15000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'npm-launcher-candidate', name: 'verified npm installation Launcher projection', executor: { type: 'node-test', files: [
    'test/integration/npm-launcher.test.mjs',
  ], args: ['--test-concurrency=1', '--test-reporter=dot'] }, profiles: ['candidate'], groups: ['release', 'windows-npm-preflight'],  concurrencyClass: 'workspace-heavy' }),
  step({ id: 'host-node-cli-smoke', name: 'Host Node installed CLI smoke', executor: { type: 'node', file: 'test/verification/host-node/cli-smoke.mjs', consumesArtifact: true }, profiles: ['host-node'],  dependsOn: ['candidate-tarball'], concurrencyClass: 'workspace-heavy' }),
  step({ id: 'open-source-candidate', name: 'open-source candidate', executor: { type: 'node', file: 'test/verification/release/open-source-candidate.mjs', consumesArtifact: true }, profiles: ['candidate'], groups: ['public', 'release'],  dependsOn: ['candidate-tarball'] }),
  step({ id: 'openspec-candidate-audit', name: 'OpenSpec contract candidate audit', executor: { type: 'node', file: 'test/verification/openspec/contract-audit.mjs' }, profiles: ['candidate'], groups: ['openspec'], }),
  step({ id: 'managed-mutations', name: 'managed mutations', executor: { type: 'node', file: 'test/verification/integrity/managed-mutations.mjs' }, profiles: ['candidate'], groups: ['package'], }),

  step({ id: 'capability-cli-integration', name: 'capability CLI integration', executor: { type: 'node', file: 'test/capability-cli.integration.mjs' }, profiles: ['candidate'],  schedulingCostMs: 25000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'commands-cli-integration', name: 'Commands context CLI integration', executor: { type: 'node', file: 'test/commands-cli.integration.mjs' }, profiles: ['candidate'], groups: ['cli', 'package'],  schedulingCostMs: 12000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'openspec-contract-fixtures', name: 'OpenSpec contract fixtures', executor: { type: 'node', file: 'test/verification/openspec/contract.mjs', args: ['--suite', 'contract'] }, profiles: ['candidate'], groups: ['openspec'],  concurrencyClass: 'cpu-heavy' }),
  step({ id: 'openspec-convergence-recovery', name: 'OpenSpec convergence recovery journey', executor: { type: 'node', file: 'test/verification/openspec/contract.mjs', args: ['--suite', 'recovery'] }, profiles: ['candidate'], groups: ['openspec', 'recovery'],  schedulingCostMs: 40000, concurrencyClass: 'workspace-heavy', resources: ['workspace-saturating'] }),
  step({ id: 'package-static', ...packageVerifier('static'), profiles: ['candidate'], groups: ['package'], }),
  step({ id: 'package-workspace', ...packageVerifier('workspace'), profiles: ['candidate'], groups: ['package'],  schedulingCostMs: 7000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'package-commands', ...packageVerifier('commands'), profiles: ['candidate'], groups: ['package'],  schedulingCostMs: 3000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'package-rules', ...packageVerifier('rules'), profiles: ['candidate'], groups: ['package'],  schedulingCostMs: 4000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'package-skills', ...packageVerifier('skills'), profiles: ['candidate'], groups: ['package'],  schedulingCostMs: 10000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'package-runtime', ...packageVerifier('runtime'), profiles: ['candidate'], groups: ['package', 'runtime'],  schedulingCostMs: 7000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'runtime-skill-projection', name: 'runtime packaged Skill projection', executor: { type: 'node', file: 'test/verification/runtime/skill-projection.mjs' }, groups: ['runtime'],  schedulingCostMs: 5000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'runtime-adapter-parity', name: 'runtime adapter implementation-family parity', executor: { type: 'node', file: 'test/verification/runtime/adapter-parity.mjs' }, profiles: ['candidate'], groups: ['runtime', 'windows-npm-preflight'],  schedulingCostMs: 35000, concurrencyClass: 'workspace-heavy', resources: ['workspace-saturating'] }),

  step({ id: 'workspace-lifecycle', name: 'Workspace E2E: workspace lifecycle', executor: { type: 'workspace-suite', selector: 'workspace-lifecycle' }, profiles: ['candidate'], groups: ['windows-npm-preflight'],  schedulingCostMs: 5000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'ownership-recovery', name: 'Workspace E2E: ownership recovery', executor: { type: 'workspace-suite', selector: 'ownership-recovery' }, profiles: ['candidate'],  schedulingCostMs: 6000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'runtime-reconciliation', name: 'Workspace E2E: runtime reconciliation', executor: { type: 'workspace-suite', selector: 'runtime-reconciliation' }, profiles: ['candidate'],  schedulingCostMs: 10000, concurrencyClass: 'workspace-heavy' }),

  step({ id: 'repository-onboarding', name: 'repository onboarding from a clean checkout', executor: { type: 'node', file: 'test/verification/onboarding/repository.mjs' },   schedulingCostMs: 60000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'init-onboarding', name: 'single-command init onboarding', executor: { type: 'node', file: 'test/verification/onboarding/init.mjs' }, profiles: ['candidate'],  schedulingCostMs: 7000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'cli-compatibility', name: 'CLI compatibility', executor: { type: 'node', file: 'test/verification/cli/compatibility.mjs' }, profiles: ['candidate'], groups: ['cli'],  schedulingCostMs: 7000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'cli-package-parity', name: 'CLI package parity', executor: { type: 'node', file: 'test/verification/cli/package-parity.mjs', consumesArtifact: true }, profiles: ['candidate'], groups: ['cli'],  dependsOn: ['candidate-tarball'], schedulingCostMs: 15000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'service-branch-contract', name: 'Service branch contract', executor: { type: 'node', file: 'test/verification/onboarding/service-branch.mjs' }, profiles: ['candidate'],   schedulingCostMs: 3000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'remote-skill-timeout', name: 'remote Skill timeout contract', executor: { type: 'node', file: 'test/verification/network/remote-text.mjs' }, profiles: ['candidate'],  concurrencyClass: 'network' }),
  step({ id: 'release-tarball-smoke', name: 'release tarball headless smoke', executor: { type: 'node', file: 'test/verification/release/release-smoke.mjs', consumesArtifact: true }, profiles: ['candidate'], groups: ['release', 'windows-npm-preflight'],  dependsOn: ['candidate-tarball'], schedulingCostMs: 18000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'managed-data-integrity', name: 'managed data integrity', executor: { type: 'node', file: 'test/verification/integrity/managed-data-integrity.mjs' }, profiles: ['candidate'], groups: ['package'],  schedulingCostMs: 9000, concurrencyClass: 'workspace-heavy' }),

  step({ id: 'docs-quality', name: 'documentation quality', executor: { type: 'node', file: 'test/verification/docs/quality.mjs' }, profiles: ['candidate'],  concurrencyClass: 'default' }),
]);

assertVerificationContextDispositionCoverage(verificationSteps.map((item) => item.id));

const candidateShard = (id, runner, phase, stepIds, options = {}) => Object.freeze({
  id,
  runner,
  phase,
  stepIds: Object.freeze(stepIds),
  requiresArtifact: options.requiresArtifact === true,
  producesArtifact: options.producesArtifact === true,
});

export const CORE_MACOS_STEP_IDS = Object.freeze([
  'integration',
  'integration-declarations',
  'integration-openspec',
  'integration-runtime',
  'integration-release',
  'integration-data-store',
  'integration-task-environment',
  'integration-self-bootstrap',
  'integration-task-read-models',
  'integration-task-coordination',
  'integration-project-daily-progress',
  'integration-task-execution-records',
  'integration-task-finish',
  'integration-task-finish-delivery',
  'system-verification-contracts',
  'system-public-json-contracts',
  'system-openspec-contract-audit',
  'system-buildr-web-http',
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
]);

export const CORE_MACOS_SHARDS = Object.freeze([
  candidateShard('core-task-lifecycle-macos', 'macos', 'verification', [
    'integration-task-environment',
    'integration-self-bootstrap',
    'integration-task-execution-records',
    'integration-task-finish',
    'integration-task-finish-delivery',
  ], { requiresArtifact: true }),
  candidateShard('core-project-task-macos', 'macos', 'verification', [
    'integration',
    'integration-declarations',
    'integration-openspec',
    'integration-data-store',
    'integration-task-read-models',
    'integration-task-coordination',
    'integration-project-daily-progress',
    'system-verification-contracts',
    'system-public-json-contracts',
    'system-openspec-contract-audit',
    'openspec-contract-fixtures',
  ], { requiresArtifact: true }),
  candidateShard('core-package-runtime-release-macos', 'macos', 'verification', [
    'integration-runtime',
    'integration-release',
    'system-buildr-web-http',
    'application-payload-release',
    'npm-launcher-candidate',
    'open-source-candidate',
    'package-workspace',
    'package-commands',
    'package-rules',
    'package-skills',
    'package-runtime',
    'ownership-recovery',
    'runtime-reconciliation',
    'cli-package-parity',
    'remote-skill-timeout',
    'release-tarball-smoke',
    'managed-data-integrity',
  ], { requiresArtifact: true }),
  candidateShard('core-cli-contract-macos', 'macos', 'verification', [
    'capability-cli-integration',
    'commands-cli-integration',
    'init-onboarding',
    'cli-compatibility',
    'service-branch-contract',
  ], { requiresArtifact: true }),
]);

export const CANDIDATE_CI_SHARDS = Object.freeze([
  candidateShard('preflight-macos', 'macos', 'preflight', [
    'typecheck',
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
    'system-verification-admission',
    'integration-verification',
  ]),
  candidateShard('artifact-macos', 'macos', 'artifact', [
    'candidate-tarball',
  ], { producesArtifact: true }),
  ...CORE_MACOS_SHARDS,
  candidateShard('runtime-windows', 'windows', 'verification', [
    'system-runtime-recovery',
    'system-app-process',
    'npm-launcher-candidate',
    'runtime-adapter-parity',
    'release-tarball-smoke',
  ], { requiresArtifact: true }),
  candidateShard('workspace-lifecycle-windows', 'windows', 'verification', [
    'system-workspace-lifecycle',
    'workspace-lifecycle',
  ]),
  candidateShard('task-worktree-recovery-windows', 'windows', 'verification', [
    'system-task-lifecycle',
    'system-worktree-lifecycle',
    'openspec-convergence-recovery',
  ]),
  candidateShard('task-finish-windows', 'windows', 'verification', [
    'system-task-finish',
    'system-task-finish-cli',
  ]),
  candidateShard('task-development-windows', 'windows', 'verification', [
    'integration-task-development',
    'concurrent-task-acceptance',
  ]),
  candidateShard('fresh-build-windows', 'windows', 'verification', [
    'system-fresh-build',
  ]),
]);

export const CANDIDATE_CI_PLATFORM_REPEATS = Object.freeze({
  'npm-launcher-candidate': Object.freeze(['core-package-runtime-release-macos', 'runtime-windows']),
  'release-tarball-smoke': Object.freeze(['core-package-runtime-release-macos', 'runtime-windows']),
});

export const CANDIDATE_CI_HOST_NODE_TUPLES = Object.freeze([
  Object.freeze({ id: 'host-minimum-macos', runner: 'macos', requestedNode: '24.15.0', expectation: 'minimum' }),
  Object.freeze({ id: 'host-minimum-windows', runner: 'windows', requestedNode: '24.15.0', expectation: 'minimum' }),
  Object.freeze({ id: 'host-current-macos', runner: 'macos', requestedNode: '24.x', expectation: 'current' }),
  Object.freeze({ id: 'host-current-windows', runner: 'windows', requestedNode: '24.x', expectation: 'current' }),
]);

export const VERIFICATION_TEST_INTENTS = Object.freeze(['Development', 'Acceptance', 'Static Conformance', 'Delivery / Release']);
export const VERIFICATION_EXECUTION_BOUNDARIES = Object.freeze(['Static', 'Unit', 'Component', 'Integration', 'System']);
export const VERIFICATION_PROFILES = Object.freeze(['fast', 'core', 'candidate', 'host-node']);
export const VERIFICATION_GROUPS = Object.freeze(['public', 'cli', 'runtime', 'package', 'openspec', 'release', 'recovery', 'windows-npm-preflight']);
export const VERIFICATION_EXECUTORS = Object.freeze(['node', 'node-test', 'node-context-test', 'npm', 'openspec', 'package-selector', 'workspace-suite', 'candidate-artifact']);

export function verificationStepById(id) {
  return verificationSteps.find((item) => item.id === id);
}
