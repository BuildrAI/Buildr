import { MACOS_PLATFORM_BOUNDARIES, WINDOWS_PLATFORM_BOUNDARIES } from './platform-boundaries.ts';
import { PACKAGE_VERIFIERS } from '../../tools/verification/package-check/verification-registry.ts';
import { assertVerificationContextDispositionCoverage, verificationContextDisposition } from '../context/dispositions.ts';
import { TEST_CONTEXT_KEYS, TASK_LIFECYCLE_CONTEXT_KEY, testContextProfileByKey } from '../context/profiles.ts';
import { verificationStepOwnership } from './ownership.ts';
import { SYSTEM_SUITES } from './system-suites.ts';

export const VERIFICATION_PLATFORMS = Object.freeze(['macos', 'windows']);
export const COMMON_PLATFORM_SCOPE = Object.freeze({ kind: 'common', runners: Object.freeze([]) });
const platformScope = (...runners: string[]) => Object.freeze({ kind: 'platform', runners: Object.freeze(runners) });

const PROJECT_OWNER: any = 'project:product';
const SERVICE_OWNER: any = 'service:product/buildr';

const environment: any = (footprints: any, isolation: any, resetBurden: any) => Object.freeze({
  environment: Object.freeze({ footprints: Object.freeze(footprints), isolation }),
  resetBurden,
});

const TEST_ENVIRONMENTS: any = Object.freeze({
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

const testing: any = (ownerScope: any, primaryIntent: any, executionBoundary: any, targetDurationMs: any, proves: any, executionEnvironment: any, primaryEvidenceOwner: any = null) => Object.freeze({
  ownerScope,
  primaryIntent,
  executionBoundary,
  targetDurationMs,
  proves,
  ...executionEnvironment,
  ...(primaryEvidenceOwner ? { primaryEvidenceOwner } : {}),
});

export const VERIFICATION_SLOW_EVIDENCE_THRESHOLD_MS: any = 15_000;

const primaryEvidence: any = (counterexample: any, retainedBoundary: any, decision: any = 'retain-primary') => Object.freeze({
  counterexample,
  retainedBoundary,
  decision,
});

export const VERIFICATION_STEP_TESTING: any = Object.freeze({
  typecheck: testing(SERVICE_OWNER, 'Static Conformance', 'Static', 5000, 'Buildr TypeScript production sources satisfy the strict no-emit execution contract.', TEST_ENVIRONMENTS.sourceReadOnly),
  unit: testing(SERVICE_OWNER, 'Development', 'Unit', 5000, 'Pure Buildr logic behaves correctly with collaborators replaced.', TEST_ENVIRONMENTS.pure),
  component: testing(SERVICE_OWNER, 'Development', 'Component', 3000, 'A bounded Buildr application assembly behaves correctly with fake collaborators.', TEST_ENVIRONMENTS.pure),
  integration: testing(SERVICE_OWNER, 'Development', 'Integration', 10000, 'Generated inputs and verification tools preserve their process, build and compatibility boundaries.', TEST_ENVIRONMENTS.repeatedGitCli),
  'integration-code': testing(SERVICE_OWNER, 'Development', 'Integration', 10000, 'Code browsing, editing, observation and Git operations preserve the actual checkout and mutation boundaries.', TEST_ENVIRONMENTS.repeatedGitCli),
  'integration-desktop': testing(SERVICE_OWNER, 'Development', 'Integration', 10000, 'Desktop and Agent connections preserve their isolated registration, lifecycle, Git read roots and HTTP boundaries.', TEST_ENVIRONMENTS.repeatedGitCli),
  'integration-knowledge': testing(SERVICE_OWNER, 'Development', 'Integration', 10000, 'Knowledge and Agent source reading preserve current content, provenance and HTTP results.', TEST_ENVIRONMENTS.repeatedCli),
  'integration-workspace-assets': testing(SERVICE_OWNER, 'Development', 'Integration', 10000, 'Workspace assets preserve composition, registration, mutation and user content.', TEST_ENVIRONMENTS.repeatedGitCli),
  'integration-archify': testing(SERVICE_OWNER, 'Development', 'Integration', 60000, 'Archify installation, rendering, upgrade, user content protection, removal and bounded diagnostics retain their real isolated lifecycle.', TEST_ENVIRONMENTS.repeatedCli),
  'integration-task-records': testing(SERVICE_OWNER, 'Development', 'Integration', 10000, 'Task records, materials and workbench views preserve filesystem, Git, SQLite and HTTP behavior.', TEST_ENVIRONMENTS.repeatedGitCli),
  'integration-connections': testing(SERVICE_OWNER, 'Development', 'Integration', 10000, 'Connection Skills preserve definitions, credential handling, Git workspaces, process and local protocol boundaries.', TEST_ENVIRONMENTS.repeatedGitCli),
  'integration-runtime-projection': testing(SERVICE_OWNER, 'Development', 'Integration', 10000, 'Runtime projections preserve declarations, ownership, executable Git modes and installed Skill content.', TEST_ENVIRONMENTS.repeatedGitCli),
  'integration-declarations': testing(SERVICE_OWNER, 'Development', 'Integration', 5000, 'Project verification declarations preserve diagnostics and package registry boundaries.', TEST_ENVIRONMENTS.repeatedFilesystem),
  'integration-openspec': testing(SERVICE_OWNER, 'Development', 'Integration', 5000, 'Change and OpenSpec convergence applications preserve real filesystem and Git boundaries.', TEST_ENVIRONMENTS.repeatedGitCli),
  'integration-verification': testing(SERVICE_OWNER, 'Development', 'Integration', 10000, 'Project testing maps and Task completion reports remain coherent.', TEST_ENVIRONMENTS.repeatedCli),
  'integration-runtime': testing(SERVICE_OWNER, 'Development', 'Integration', 10000, 'Buildr Web Runtime preserves read, instance, private Git preview and generated Web boundaries.', TEST_ENVIRONMENTS.repeatedGitCli),
  'integration-release': testing(SERVICE_OWNER, 'Development', 'Integration', 5000, 'Release filesystem and installation identity boundaries remain coherent without publishing.', TEST_ENVIRONMENTS.repeatedFilesystem),
  'integration-data-store': testing(SERVICE_OWNER, 'Development', 'Integration', 5000, 'Workspace SQLite authority, migration, and checkout isolation remain coherent.', TEST_ENVIRONMENTS.repeatedFilesystem),
  'integration-self-bootstrap': testing(SERVICE_OWNER, 'Development', 'Integration', 45000, 'The single self-bootstrap closeout lifecycle preserves retained checkout and runtime synchronization boundaries.', TEST_ENVIRONMENTS.workspaceLifecycle),
  'integration-task-read-models': testing(SERVICE_OWNER, 'Development', 'Integration', 8000, 'Task entry and read-model applications preserve their SQLite and Application boundaries.', TEST_ENVIRONMENTS.repeatedFilesystem),
  'integration-task-coordination': testing(SERVICE_OWNER, 'Development', 'Integration', 8000, 'Parent coordination and publication applications preserve their real repository boundaries.', TEST_ENVIRONMENTS.repeatedGitCli),
  'integration-project-daily-progress': testing(SERVICE_OWNER, 'Development', 'Integration', 8000, 'Project daily progress Application, store, and CLI boundaries remain coherent without synthesizing Git.', TEST_ENVIRONMENTS.repeatedFilesystem),
  'system-macos-platform': testing(PROJECT_OWNER, 'Development', 'Integration', 8000, 'Existing macOS descriptor proofs and POSIX development entries preserve their native contracts.', TEST_ENVIRONMENTS.repeatedFilesystem),
  'system-windows-platform': testing(PROJECT_OWNER, 'Development', 'Integration', 80_000, 'Native Windows command shims, path aliases, locks and process cleanup preserve their OS contracts.', TEST_ENVIRONMENTS.workspaceLifecycle),
  'system-buildr-web-http': testing(PROJECT_OWNER, 'Development', 'System', 15000, 'Buildr Web Runtime HTTP routes preserve read, error, session and cleanup boundaries.', TEST_ENVIRONMENTS.workspaceLifecycle),
  'system-verification-admission': testing(PROJECT_OWNER, 'Static Conformance', 'System', 10000, 'Changed-path collection remains trustworthy before broad project verification.', TEST_ENVIRONMENTS.repeatedCli),
  'system-verification-contracts': testing(PROJECT_OWNER, 'Development', 'System', 15000, 'Verification orchestration, timing, resource, and Workspace contracts hold through public entrypoints.', TEST_ENVIRONMENTS.repeatedCli),
  'system-public-json-contracts': testing(PROJECT_OWNER, 'Static Conformance', 'System', 25000, 'Public JSON outputs remain closed, versioned, and stable through real CLI entrypoints.', TEST_ENVIRONMENTS.repeatedCli),
  'system-openspec-contract-audit': testing(PROJECT_OWNER, 'Static Conformance', 'System', 8000, 'OpenSpec public audit remains complete through its real project entrypoint.', TEST_ENVIRONMENTS.repeatedCli),
  'system-workspace-lifecycle': testing(PROJECT_OWNER, 'Development', 'System', 55000, 'Project, Service, Workspace catalog, and package capability journeys behave correctly.', TEST_ENVIRONMENTS.workspaceLifecycle),
  'system-task-lifecycle': testing(PROJECT_OWNER, 'Development', 'System', 25000, 'Task Record, Change, Development, Review, and Verification journeys behave correctly.', TEST_ENVIRONMENTS.workspaceLifecycle),
  'system-worktree-lifecycle': testing(PROJECT_OWNER, 'Development', 'System', 45000, 'Real Git Worktree create, inspect, and cleanup journeys behave correctly.', TEST_ENVIRONMENTS.workspaceLifecycle),
  'system-nested-git-isolation': testing(PROJECT_OWNER, 'Development', 'System', 45000, 'A non-Git Workspace isolates registered Git sources and preserves its retained materials through the public lifecycle.', TEST_ENVIRONMENTS.workspaceLifecycle),
  'system-runtime-recovery': testing(PROJECT_OWNER, 'Development', 'System', 30000, 'Runtime installation and recovery journeys behave correctly.', TEST_ENVIRONMENTS.workspaceLifecycle),
  'system-app-process': testing(PROJECT_OWNER, 'Development', 'System', 25000, 'Buildr Web process and preview lifecycle remain isolated.', TEST_ENVIRONMENTS.workspaceLifecycle),
  contract: testing(PROJECT_OWNER, 'Static Conformance', 'Static', 5000, 'Product source, governance assets, and stable entrypoint declarations conform without mutable fixtures.', TEST_ENVIRONMENTS.sourceReadOnly),
  'cli-architecture': testing(SERVICE_OWNER, 'Static Conformance', 'Static', 3000, 'CLI modules and wrappers preserve the declared architecture.', TEST_ENVIRONMENTS.sourceReadOnly),
  'openspec-spec-quality': testing(PROJECT_OWNER, 'Static Conformance', 'Static', 3000, 'Canonical OpenSpec specifications meet Product quality rules.', TEST_ENVIRONMENTS.sourceReadOnly),
  'openspec-strict': testing(PROJECT_OWNER, 'Static Conformance', 'Static', 5000, 'All OpenSpec artifacts pass upstream strict validation.', TEST_ENVIRONMENTS.cliReadOnly),
  'runtime-adapter-contract': testing(SERVICE_OWNER, 'Static Conformance', 'Integration', 5000, 'Runtime adapter declarations and isolated filesystem projections satisfy their contract.', TEST_ENVIRONMENTS.repeatedFilesystem),
  'runtime-skill-projection': testing(SERVICE_OWNER, 'Development', 'Integration', 8000, 'Changed packaged Skills bind their source identity and complete projected inventory through every supported runtime adapter.', TEST_ENVIRONMENTS.repeatedFilesystem),
  'integration-candidate-release': testing(PROJECT_OWNER, 'Delivery / Release', 'System', 15000, 'Release contract cold-start and branch convergence behave correctly.', TEST_ENVIRONMENTS.repeatedGitCli),
  'integration-candidate-release-selection': testing(PROJECT_OWNER, 'Delivery / Release', 'System', 15000, 'Release source selection and frozen generation identities remain isolated.', TEST_ENVIRONMENTS.repeatedGitCli),
  'integration-candidate-package-selection': testing(PROJECT_OWNER, 'Delivery / Release', 'System', 15000, 'Independent package selection binds its exact source, peer and preparation without repeating dispatch.', TEST_ENVIRONMENTS.repeatedGitCli),
  'integration-candidate-release-effects': testing(PROJECT_OWNER, 'Delivery / Release', 'System', 150000, 'Release publication effects recover external partial results without repeating publication.', TEST_ENVIRONMENTS.repeatedGitCli),
  'integration-candidate-git-convergence': testing(PROJECT_OWNER, 'Delivery / Release', 'System', 60000, 'Release Git convergence, closeout, and generation cleanup behave correctly.', TEST_ENVIRONMENTS.repeatedGitCli),
  'integration-candidate-git-selection': testing(PROJECT_OWNER, 'Delivery / Release', 'System', 60000, 'Release Git selection, main integration and recovery preserve the frozen source and independent dev history.', TEST_ENVIRONMENTS.repeatedGitCli),
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
  'artifact-browser-core': testing(SERVICE_OWNER, 'Delivery / Release', 'System', 20000, 'The exact Candidate tarball Web payload serves the existing representative Task list and reading journey in an isolated real browser.', TEST_ENVIRONMENTS.workspaceLifecycle),
  'frontend-logic': testing('service:product/buildr-web', 'Development', 'Unit', 10000, 'The complete Buildr Web logic suite preserves state transitions, navigation, requests and input conversion.', TEST_ENVIRONMENTS.sourceReadOnly),
  'dsh-plugin': testing('service:product/dsh-plugin', 'Development', 'System', 60000, 'Both plugin variants build against the pinned SDK and pass logic, coexistence and real DSH loader checks.', environment(['filesystem', 'cli'], 'shared', 'none')),
  'service-branch-contract': testing(PROJECT_OWNER, 'Development', 'System', 10000, 'Service branch configuration works in an isolated repository.', TEST_ENVIRONMENTS.isolatedGitCli),
  'remote-skill-timeout': testing(SERVICE_OWNER, 'Development', 'Integration', 10000, 'Remote Skill reads fail within the declared timeout boundary.', TEST_ENVIRONMENTS.loopbackNetwork),
  'release-tarball-smoke': testing(SERVICE_OWNER, 'Delivery / Release', 'System', 25000, 'The shared release tarball installs, keeps ordinary CLI HTTP-free, and serves healthy Buildr Web on demand.', TEST_ENVIRONMENTS.workspaceLifecycle),
  'managed-data-integrity': testing(PROJECT_OWNER, 'Development', 'System', 15000, 'Managed mutations remain atomic and preserve nested repositories.', TEST_ENVIRONMENTS.workspaceLifecycle),
  'docs-quality': testing(PROJECT_OWNER, 'Static Conformance', 'Static', 5000, 'Product documentation links and required content remain valid.', TEST_ENVIRONMENTS.sourceReadOnly),
});

export const VERIFICATION_STEP_EVIDENCE: any = Object.freeze({
  'integration-archify': primaryEvidence(
    'An Archify install, render, upgrade, removal or diagnostic command that loses user content, changes CLI behavior or leaks private inputs must fail.',
    'real isolated Workspace and user home, component lifecycle, rendering and bounded CLI diagnostics',
  ),
  'integration-candidate-release': primaryEvidence(
    'A release contract, selection, rehearsal, recovery, or Git convergence boundary that drifts from the frozen Candidate source must fail.',
    'real temporary Git repositories, release runner entrypoints, and branch convergence',
  ),
  'integration-candidate-release-selection': primaryEvidence(
    'A release selection that changes an unbound branch, loses a frozen generation, or bypasses target identity must fail.',
    'real isolated Git repositories, source selection, frozen refs and main reconciliation',
  ),
  'integration-candidate-package-selection': primaryEvidence(
    'An independent package selection with the wrong peer, source proof or repeated dispatch must fail before publication.',
    'real isolated Git repositories and the independent package release operation',
  ),
  'integration-candidate-release-effects': primaryEvidence(
    'A partial Git or Registry write whose retry repeats publication or erases known effects must fail recovery.',
    'real temporary Git repositories, HTTP services, immutable artifacts and release recovery',
  ),
  'integration-candidate-git-convergence': primaryEvidence(
    'A release Git convergence, closeout, or generation cleanup boundary that drifts from the frozen Candidate source must fail.',
    'real temporary Git repositories, release carriers, pull request observation, and generation cleanup',
  ),
  'integration-candidate-git-selection': primaryEvidence(
    'Release main integration or recovery that loses selected source or rewrites independent dev history must fail.',
    'real isolated Git repositories, release main selection and recovery',
  ),
  'integration-self-bootstrap': primaryEvidence(
    'A retained checkout whose delivered identity or runtime synchronization drifts must fail closeout.',
    'real retained checkout, Git identity, and runtime synchronization',
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
    'real Git worktree lifecycle',
  ),
  'system-nested-git-isolation': primaryEvidence(
    'A non-Git Workspace that isolates the wrong source, loses retained material, or cleans an uncertain group must fail.',
    'the isolated public CLI lifecycle over independent nested Git repositories',
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

export const VERIFICATION_DAILY_CORE_EXCLUSIONS: any = Object.freeze({
  'system-macos-platform': 'Actual macOS descriptor and development-entry proof; selected independently from common source checks.',
  'system-windows-platform': 'Actual Windows boundary proof; daily affected selection uses the same explicit platform owner.',
  'artifact-browser-core': 'Consumes the unique Candidate tarball through the representative core Browser journey; it does not replace affected or full source Browser checks.',
  'frontend-logic': 'The independent frontend logic suite runs for frontend changes and full Candidate; backend Core does not imply frontend coverage.',
  'integration-candidate-release': 'Exercises release infrastructure lifecycle and recovery; selected only for release-related changes or full Candidate.',
  'integration-candidate-release-selection': 'Exercises release selection and frozen generations; selected only for release-related changes or full Candidate.',
  'integration-candidate-package-selection': 'Exercises independent package selection; selected only for release-related changes or full Candidate.',
  'integration-candidate-release-effects': 'Exercises release publication effects and recovery; selected only for release-related changes or full Candidate.',
  'integration-candidate-git-convergence': 'Exercises release Git convergence and cleanup; selected only for release-related changes or full Candidate.',
  'integration-candidate-git-selection': 'Exercises release Git selection and recovery; selected only for release-related changes or full Candidate.',
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
  'init-onboarding': 'Runs the complete fresh initialization onboarding journey.',
});

// Reuse scopes describe complete check inputs, independently of changed-path ownership.
const BACKEND_REUSE_CHECKS = new Set(['component', 'managed-mutations', 'cli-compatibility']);
// These bounded fixture suites read runtime/source assets, not this Product's governance records.
const RUNTIME_REUSE_CHECKS = new Set(['integration-runtime', 'integration-code', 'integration-desktop', 'integration-task-records', 'integration-connections', 'integration-runtime-projection', 'integration-data-store', 'integration-task-read-models', 'integration-task-coordination',
  'integration-project-daily-progress', 'system-buildr-web-http', 'system-task-lifecycle', 'system-worktree-lifecycle', 'system-nested-git-isolation',
  'integration-candidate-release-effects', 'integration-candidate-git-convergence', 'integration-candidate-git-selection',
  'system-runtime-recovery', 'system-app-process', 'system-workspace-lifecycle']);
// These reviewed entries do not consume this checkout's release notes. Package
// static checks still read Product knowledge and OpenSpec: keep their complete
// repository scope, excluding only this one independent material.
const RELEASE_NOTES_INDEPENDENT_CHECKS = new Set([...RUNTIME_REUSE_CHECKS,
  'package-static', 'package-workspace', 'package-commands', 'package-rules', 'package-skills', 'package-runtime',
  'workspace-lifecycle', 'ownership-recovery', 'runtime-reconciliation', 'init-onboarding', 'service-branch-contract',
  'managed-data-integrity', 'runtime-adapter-parity',
  // These source checks read repository materials, packaged resources or owned
  // fixture repositories. Their real entrypoints do not read root release notes.
  // Keep every other repository input and the shared reader's conservative guard.
  'openspec-spec-quality', 'integration-knowledge', 'integration-workspace-assets', 'integration-archify',
  'integration-declarations', 'integration-openspec', 'system-public-json-contracts',
  'system-openspec-contract-audit', 'concurrent-task-acceptance', 'npm-launcher-candidate', 'capability-cli-integration',
  'commands-cli-integration', 'remote-skill-timeout']);
const NON_REUSABLE_CHECKS = new Set(['dsh-plugin', 'candidate-tarball', 'application-payload-release', 'release-tarball-smoke', 'artifact-browser-core', 'cli-package-parity', 'host-node-contract', 'host-node-boundaries']);
// Lifecycle fixtures create and mutate their own repositories. Only checks that
// actually observe the retained checkout history bind its Git state.
const GIT_SOURCE_CHECKS = new Set(['open-source-candidate']);
const REUSE_INPUTS_BY_STEP: Readonly<Record<string, readonly string[]>> = Object.freeze({
  'docs-quality': Object.freeze(['BUILDR_CHANGED_PATHS_JSON']),
  'runtime-skill-projection': Object.freeze(['BUILDR_CHANGED_PATHS_JSON']),
  'openspec-candidate-audit': Object.freeze(['BUILDR_VERIFICATION_BASE']),
});
function sourceReusePolicy(definition: any): any {
  if (NON_REUSABLE_CHECKS.has(definition.id) || definition.executor?.type === 'candidate-artifact' || definition.executor?.consumesArtifact
    || definition.id.startsWith('host-')) return false;
  if (definition.id === 'typecheck') return Object.freeze({ scope: 'repository', exactNode: true, tools: ['npm'] });
  // Native boundary fixtures materialize the complete backend, not Web/plugin
  // source or this workspace's release Skill. Their Git operations use fixtures.
  if (['system-windows-platform', 'system-macos-platform'].includes(definition.id)) return Object.freeze({ scope: 'platform-backend', inputMode: 'runtime-check', tools: ['git'] });
  if (BACKEND_REUSE_CHECKS.has(definition.id)) return Object.freeze({ scope: 'backend' });
  // The backend unit entry also executes tests importing Web helpers. Architecture
  // and adapter contracts read Product knowledge and repository-root materials,
  // so they retain the complete repository scope below.
  if (definition.id === 'frontend-logic' || definition.id === 'unit') return Object.freeze({ scope: 'web' });
  // Other registered checks conservatively include all Product material;
  // checks reading source Git identities also bind the observed Git history.
  const usesGit = VERIFICATION_STEP_TESTING[definition.id]?.environment?.footprints.includes('git');
  return Object.freeze({ scope: RUNTIME_REUSE_CHECKS.has(definition.id) ? 'runtime' : 'repository',
    git: definition.id === 'openspec-candidate-audit' ? 'comparison' : GIT_SOURCE_CHECKS.has(definition.id),
    ...(RUNTIME_REUSE_CHECKS.has(definition.id) ? { inputMode: 'runtime-check' } : {}),
    ...(usesGit ? { tools: ['git'] } : {}), ...(RELEASE_NOTES_INDEPENDENT_CHECKS.has(definition.id) ? { releaseNotes: false } : {}),
    ...(REUSE_INPUTS_BY_STEP[definition.id] ? { inputs: REUSE_INPUTS_BY_STEP[definition.id] } : {}) });
}

const step: any = (definition: any) => {
  const classification: any = VERIFICATION_STEP_TESTING[definition.id];
  const evidence: any = VERIFICATION_STEP_EVIDENCE[definition.id] ?? null;
  const contextDisposition: any = verificationContextDisposition(definition.id);
  const ownership: any = verificationStepOwnership(definition.id, definition.executor);
  const declaredProfiles: any = definition.profiles ?? [];
  const profiles: any = declaredProfiles.includes('candidate') && !Object.hasOwn(VERIFICATION_DAILY_CORE_EXCLUSIONS, definition.id)
    ? [...declaredProfiles, 'core']
    : [...declaredProfiles];
  const timeoutMs: any = definition.timeoutMs ?? (
    classification?.environment.footprints.includes('workspace-lifecycle') ? 360_000
      : classification?.primaryIntent === 'Delivery / Release' || (classification?.targetDurationMs ?? 0) >= 25_000 ? 300_000
        : 180_000
  );
  const contexts: any[] = [...(definition.contexts ?? [])];
  const contextProfiles: any = contexts.map(testContextProfileByKey).filter(Boolean);
  const staticWorkerArgument: any = definition.executor?.args?.find((argument: any) => argument.startsWith('--test-concurrency='));
  const workers: any = definition.workerDemand ?? (staticWorkerArgument ? Number(staticWorkerArgument.split('=')[1]) : 1);
  const footprints: any = classification?.environment?.footprints ?? [];
  const resourceDemand: any = definition.resourceDemand ?? {
    workers,
    processes: workers,
    ...(footprints.includes('git') ? { git: 1 } : {}),
    ...(footprints.includes('workspace-lifecycle') || contextProfiles.some((profile: any) => profile.resourceDemand.workspaceIo) ? { workspaceIo: 1 } : {}),
  };
  return Object.freeze({
    dependsOn: [],
    groups: [],
    concurrencyClass: 'default',
    resources: [],
    admission: false,
    developmentRunners: [],
    platformScope: COMMON_PLATFORM_SCOPE,
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
    reuse: sourceReusePolicy(definition),
    budgetMs: classification?.targetDurationMs ?? definition.budgetMs,
    testing: classification ? Object.freeze({
      ...classification,
      primaryEvidenceOwner: classification.primaryEvidenceOwner ?? definition.id,
      ...(evidence ? { evidence: Object.freeze({ ...evidence, publicOutcome: classification.proves }) } : {}),
    }) : null,
    contextDisposition,
  });
};

const packageVerifier: any = (selector: any) => {
  const verifier: any = PACKAGE_VERIFIERS.find((item: any) => item.id === selector);
  if (!verifier) throw new Error(`Missing package verifier declaration: ${selector}`);
  return { name: verifier.name, executor: { type: 'package-selector', selector } };
};

const concurrency: any = (global: any, workspaceHeavy: any, workspaceSaturating: any, innerConcurrency: any, capacities: any) => Object.freeze({
  global,
  classes: Object.freeze({ default: global, 'cpu-heavy': 2, 'workspace-heavy': workspaceHeavy, network: 2, exclusive: 1 }),
  resources: Object.freeze({ 'workspace-saturating': workspaceSaturating, 'task-lifecycle-heavy': 1, 'app-runtime': 1 }),
  innerConcurrency: Object.freeze(innerConcurrency),
  capacities: Object.freeze(capacities),
});

export const VERIFICATION_RESOURCE_CONTRACTS: any = Object.freeze({
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

export const VERIFICATION_EXECUTION_PROFILES: any = Object.freeze({
  local: concurrency(4, 3, 2, { integration: 4, ...Object.fromEntries(SYSTEM_SUITES.map((suite: any) => [suite.id, suite.innerConcurrency])), 'openspec-contract-fixtures': 2, 'openspec-convergence-recovery': 3 }, { workers: 8, processes: 8, git: 3, workspaceIo: 3 }),
  ci: concurrency(4, 3, 2, { integration: 4, ...Object.fromEntries(SYSTEM_SUITES.map((suite: any) => [suite.id, suite.innerConcurrency])), 'openspec-contract-fixtures': 2, 'openspec-convergence-recovery': 3 }, { workers: 8, processes: 8, git: 3, workspaceIo: 3 }),
  'ci-workspace-limited': concurrency(4, 2, 1, { integration: 3, unit: 3, component: 1, contract: 2, 'integration-runtime': 2, 'integration-code': 2, 'integration-desktop': 2, 'integration-knowledge': 1, 'integration-workspace-assets': 2, 'integration-archify': 1, 'integration-task-records': 2, 'integration-connections': 2, 'integration-runtime-projection': 1,  ...Object.fromEntries(SYSTEM_SUITES.map((suite: any) => [suite.id, Math.min(suite.innerConcurrency, 2)])), 'integration-candidate-release': 2, 'integration-candidate-release-selection': 1, 'integration-candidate-package-selection': 1, 'integration-candidate-release-effects': 1, 'integration-candidate-git-convergence': 2, 'integration-candidate-git-selection': 2, 'openspec-contract-fixtures': 2, 'openspec-convergence-recovery': 2 }, { workers: 3, processes: 3, git: 2, workspaceIo: 2 }),
});

export const VERIFICATION_CONCURRENCY: any = VERIFICATION_EXECUTION_PROFILES.local;

/** Only the worker grant reaches these child executors. Queue capacities and
 * unrelated steps' budgets do not change this check's execution inputs. */
export function verificationStepExecutionInputs(definition: any, profiles: any = VERIFICATION_EXECUTION_PROFILES): any {
  if (!['node', 'node-test', 'node-context-test'].includes(definition.executor?.type)) return null;
  return { innerWorkers: Object.fromEntries(Object.entries(profiles).map(([id, profile]: [string, any]) =>
    [id, profile.innerConcurrency?.[definition.id] ?? definition.resourceDemand?.workers ?? 1])) };
}

export const VERIFICATION_ENVIRONMENT_FOOTPRINTS: any = Object.freeze(['filesystem', 'cli', 'git', 'loopback-network', 'network', 'workspace-lifecycle']);
export const VERIFICATION_DEVELOPMENT_RUNNERS: any = VERIFICATION_PLATFORMS;
export const VERIFICATION_ENVIRONMENT_ISOLATIONS: any = Object.freeze(['none', 'read-only', 'unique-temporary-root', 'shared']);
export const VERIFICATION_RESET_BURDENS: any = Object.freeze(['none', 'single-cleanup', 'repeated-cleanup', 'lifecycle']);
export const VERIFICATION_CONTEXT_KEYS: any = TEST_CONTEXT_KEYS;
export const VERIFICATION_ISOLATION_MODES: any = Object.freeze(['none', 'transaction', 'sandbox', 'full-lifecycle']);
export const VERIFICATION_RESET_STRATEGIES: any = Object.freeze(['none', 'rollback', 'snapshot', 'recreate']);
export const VERIFICATION_PARALLEL_SAFETY: any = Object.freeze(['worker-safe', 'bounded', 'exclusive']);
export const VERIFICATION_RESOURCE_DEMANDS: any = Object.freeze(['workers', 'processes', 'git', 'workspaceIo']);

export function resolveVerificationExecutionProfile(value: any, env: any = process.env): any  {
  const id: any = value || (env.CI === 'true' ? 'ci' : 'local');
  const limits: any = VERIFICATION_EXECUTION_PROFILES[id];
  if (!limits) throw new Error(`Unknown verification execution profile: ${id}`);
  return { id, limits };
}

const integrationSlice: any = (id: any, files: any, options: any = {}) => Object.freeze({
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

export const INTEGRATION_PRIMARY_SLICES: any = Object.freeze([
  // Explicit stable owners replace the exclusive catch-all. The tool owner
  // remains exclusive because generated-artifact-set refreshes checkout DTOs.
  integrationSlice('integration', [
    'test/integration/browser-launch.test.ts',
    'test/integration/browser-selector-dispatcher-runtime.test.ts',
    'test/integration/development-entry.test.ts',
    'test/integration/dsh-payload.test.ts',
    'test/integration/generated-artifact-set.test.ts',
    'test/integration/generated-artifacts.test.ts',
    'test/integration/generated-contract-artifacts.test.ts',
    'test/integration/process-infrastructure.test.ts',
    'test/integration/typescript-execution.test.ts',
    'test/integration/verification-entrypoints-cli.test.ts',
    'test/integration/verification-process-executor.test.ts',
    'test/integration/verification-reuse-filesystem.test.ts',
    'test/integration/windows-artifact-diagnosis.test.ts',
  ], { schedulingCostMs: 5000, timeoutMs: 300_000, concurrencyClass: 'exclusive', args: ['--test-concurrency=4'] }),
  integrationSlice('integration-code', [
    'test/integration/code-branch-application.test.ts',
    'test/integration/code-commit-application.test.ts',
    'test/integration/code-commit-guidance.test.ts',
    'test/integration/code-commit-message-http.test.ts',
    'test/integration/code-commit-message-large-http.test.ts',
    'test/integration/code-explorer-application.test.ts',
    'test/integration/code-fetch-application.test.ts',
    'test/integration/code-git-configuration.test.ts',
    'test/integration/code-sync-application.test.ts',
    'test/integration/file-editing-application.test.ts',
    'test/integration/git-checkout-identity.test.ts',
    'test/integration/git-worktree-evidence-reader.test.ts',
    'test/integration/source-control-application.test.ts',
    'test/integration/source-control-observation-http.test.ts',
    'test/integration/source-control-observations.test.ts',
  ], { schedulingCostMs: 5000, args: ['--test-concurrency=3'], contexts: [TASK_LIFECYCLE_CONTEXT_KEY] }),
  integrationSlice('integration-desktop', [
    'test/integration/agent-codex-discovery.test.ts',
    'test/integration/agent-codex-remove.test.ts',
    'test/integration/agent-operations.test.ts',
    'test/integration/codex-desktop-application.test.ts',
    'test/integration/codex-desktop-concurrency.test.ts',
    'test/integration/codex-desktop-disconnect.test.ts',
    'test/integration/codex-desktop-module-http.test.ts',
    'test/integration/codex-desktop-plugin.test.ts',
    'test/integration/codex-desktop-recovery.test.ts',
    'test/integration/dsh-desktop-backend.test.ts',
    'test/integration/dsh-page-observations.test.ts',
    'test/integration/native-session-links.test.ts',
  ], { schedulingCostMs: 5000, args: ['--test-concurrency=3'] }),
  integrationSlice('integration-knowledge', [
    'test/integration/agent-asset-source-query.test.ts',
    'test/integration/current-knowledge-capability-graph.test.ts',
    'test/integration/knowledge-document-quality.test.ts',
    'test/integration/knowledge-query.test.ts',
    'test/integration/skill-content-query.test.ts',
  ], { schedulingCostMs: 4000, args: ['--test-concurrency=2'] }),
  integrationSlice('integration-workspace-assets', [
    'test/integration/asset-catalog-version.test.ts',
    'test/integration/asset-relationships.test.ts',
    'test/integration/attached-project-services.test.ts',
    'test/integration/inline-workspace-core-rules.test.ts',
    'test/integration/non-git-workspace-continuity.test.ts',
    'test/integration/workspace-agent-assets-http-contract.test.ts',
    'test/integration/workspace-composition.test.ts',
    'test/integration/workspace-mutation-recovery.test.ts',
  ], { schedulingCostMs: 5000, args: ['--test-concurrency=2'], contexts: [TASK_LIFECYCLE_CONTEXT_KEY] }),
  integrationSlice('integration-archify', [
    'test/integration/archify-command-cost.test.ts',
    'test/integration/archify-component.test.ts',
  // Existing child limits are 175s + 35s; retain bounded startup and cleanup
  // room when the limited profile grants this lifecycle only one worker.
  ], { schedulingCostMs: 60000, timeoutMs: 300_000, args: ['--test-concurrency=2'] }),
  integrationSlice('integration-task-records', [
    'test/integration/document-images.test.ts',
    'test/integration/markdown-image-files.test.ts',
    'test/integration/task-brief-migration.test.ts',
    'test/integration/task-brief-record.test.ts',
    'test/integration/task-changed-files-application.test.ts',
    'test/integration/task-commits-application.test.ts',
    'test/integration/task-manager-capability-graph.test.ts',
    'test/integration/task-materials-application.test.ts',
    'test/integration/task-materials-http-cli.test.ts',
    'test/integration/task-parent-history-migration.test.ts',
    'test/integration/task-pre-create-git-capability-graph.test.ts',
    'test/integration/task-record-http-contract.test.ts',
    'test/integration/workbench-application.test.ts',
    'test/integration/workbench-http-contract.test.ts',
  ], { schedulingCostMs: 5000, args: ['--test-concurrency=3'], contexts: [TASK_LIFECYCLE_CONTEXT_KEY] }),
  integrationSlice('integration-connections', [
    'test/integration/builtin-connection-skills-package.test.ts',
    'test/integration/connection-authoring-forward.test.ts',
    'test/integration/connection-instance-filenames.test.ts',
    'test/integration/connection-skill-definitions.test.ts',
    'test/integration/connection-authorization.test.ts',
    'test/integration/connection-skills-cli.test.ts',
    'test/integration/connection-skills-package.test.ts',
    'test/integration/connection-skills-runtime.test.ts',
    'test/integration/connection-skills-safety.test.ts',
    'test/integration/connection-skills-workspace.test.ts',
    'test/integration/connection-source-batch.test.ts',
    'test/integration/kibana-connection-skill.test.ts',
    'test/integration/mysql-client-live.test.ts',
    'test/integration/mysql-connection-program.test.ts',
    'test/integration/mysql-query-skills.test.ts',
    'test/integration/nacos-connection-declaration.test.ts',
    'test/integration/nacos-connection-skill.test.ts',
    'test/integration/retired-connections.test.ts',
    'test/integration/xxl-job-connection-skill.test.ts',
  ], { schedulingCostMs: 5000, timeoutMs: 240_000, args: ['--test-concurrency=3'] }),
  integrationSlice('integration-runtime-projection', [
    'test/integration/capability-contracts.test.ts',
    'test/integration/capability-runtime.test.ts',
    'test/integration/package-generic-skills.test.ts',
    'test/integration/retired-adapter-teardown.test.ts',
    'test/integration/runtime-command-selection.test.ts',
    'test/integration/runtime-skills.test.ts',
    'test/integration/shared-skill-ownership.test.ts',
    'test/integration/standard-runtime-projection.test.ts',
  ], { schedulingCostMs: 4000, args: ['--test-concurrency=2'] }),
  integrationSlice('integration-runtime', [
    'test/integration/buildr-web-read-executor.test.ts',
    'test/integration/buildr-web-runtime.test.ts',
    'test/integration/buildr-web-workspace.test.ts',
    'test/integration/preview-ownership.test.ts',
    'test/integration/runtime-system-http-contract.test.ts',
    'test/integration/web-dist-verification.test.ts',
    'test/integration/web-resource-shutdown.test.ts',
  ], { schedulingCostMs: 4000, args: ['--test-concurrency=2'], contexts: [TASK_LIFECYCLE_CONTEXT_KEY] }),

  integrationSlice('integration-declarations', [
    'test/integration/core-diagnostics-and-package.test.ts',
    'test/integration/project-verification-map.test.ts',
  ], { schedulingCostMs: 1000, concurrencyClass: 'cpu-heavy', args: ['--test-concurrency=2'] }),
  integrationSlice('integration-openspec', [
    'test/integration/change-application.test.ts',
    'test/integration/openspec-convergence-preflight.test.ts',
    'test/integration/openspec-convergence-recovery.test.ts',
    'test/integration/openspec-convergence-transaction.test.ts',
    'test/integration/openspec-deterministic-sync.test.ts',
    'test/integration/openspec-domain.test.ts',
    'test/integration/openspec-projected-validator.test.ts',
  ], { schedulingCostMs: 2000, args: ['--test-concurrency=3'] }),
  integrationSlice('integration-verification', [
    'test/integration/candidate-artifact-reuse.test.ts',
    'test/integration/verification-reuse.test.ts',
    'test/integration/verification-source-inputs.test.ts',
    'test/integration/verification-artifact.test.ts',
    'test/integration/verification-input-boundaries.test.ts',
    'test/integration/development-state-isolation.test.ts',
    'test/integration/verification-windows-inputs.test.ts',
    'test/integration/task-verification-report.test.ts',
    'test/integration/verification-resource-coordinator.test.ts',
    'test/integration/test-context-runtime.test.ts',
    'test/integration/node-test-context-host.test.ts',
    'test/integration/buildr-test-context-provider.test.ts',
    'test/integration/test-context-public-consumer.test.ts',
    'test/integration/verification-test-files.test.ts',
    'test/integration/frontend-logic-worker-budget.test.ts',
    'test/integration/browser-candidate.test.ts',
    'test/integration/docs-quality.test.ts',
  ], { schedulingCostMs: 5000, admission: true, args: ['--test-concurrency=3'] }),
  integrationSlice('integration-release', [
    'test/integration/open-source-release-filesystem.test.ts',
    'test/integration/product-installation-identity.test.ts',
    'test/integration/development-runtime-inputs.test.ts',
    'test/integration/product-installation-registry.test.ts',
    'test/integration/workspace-cli-routing.test.ts',
  ], { schedulingCostMs: 2000, args: ['--test-concurrency=2'] }),
  integrationSlice('integration-data-store', [
    'test/integration/workspace-management-fence.test.ts',
    'test/integration/workspace-sqlite.test.ts',
    'test/integration/task-read-snapshot.test.ts',
  ], { schedulingCostMs: 2000, args: ['--test-concurrency=1'] }),
  integrationSlice('integration-self-bootstrap', [
    'test/integration/self-bootstrap-closeout.test.ts',
  ], { schedulingCostMs: 50000, resources: ['workspace-saturating'], args: ['--test-concurrency=1'] }),
  integrationSlice('integration-task-read-models', [
    'test/integration/task-review-repository.test.ts',
  ], { schedulingCostMs: 4000, executorType: 'node-context-test', concurrencyClass: 'cpu-heavy', args: ['--test-concurrency=2'] }),
  integrationSlice('integration-task-coordination', [
    'test/integration/parent-coordination-application.test.ts',
    'test/integration/parent-coordination-repository.test.ts',
    'test/integration/publication-application.test.ts',
  ], { schedulingCostMs: 5000, executorType: 'node-context-test', concurrencyClass: 'cpu-heavy', args: ['--test-concurrency=2'] }),
  integrationSlice('integration-project-daily-progress', [
    'test/integration/project-daily-progress-application.test.ts',
  ], { schedulingCostMs: 5000, executorType: 'node-context-test', concurrencyClass: 'cpu-heavy', args: ['--test-concurrency=2'] }),
]);

// The compatibility general entry aggregates every source Integration owner.
// Artifact-only files stay in their original package consumers.
export const INTEGRATION_GENERAL_EXCLUDED_FILES: any = Object.freeze([...new Set([
  'test/integration/application-payload-release.test.ts',
  'test/integration/npm-launcher.test.ts',
])]);

export const verificationSteps: any = Object.freeze([
  step({ id: 'artifact-browser-core', name: 'Candidate tarball core Browser journey', executor: { type: 'node', file: 'test/verification/release/browser-candidate.ts', discoveredFiles: ['test/browser-smoke/buildr-web-browser.test.ts'], args: ['--selector', 'core'], consumesArtifact: true }, profiles: ['candidate'], groups: ['release'], dependsOn: ['candidate-tarball'], timeoutMs: 360_000, concurrencyClass: 'workspace-heavy', resources: ['app-runtime'] }),
  step({ id: 'frontend-logic', name: 'Buildr Web complete logic suite', executor: { type: 'node', file: '../buildr-web/tools/run-logic-tests.mjs' }, profiles: ['candidate'], concurrencyClass: 'cpu-heavy' }),
  step({ id: 'dsh-plugin', name: 'DSH plugin complete build and loader verification', executor: { type: 'node', file: '../dsh-plugin/tools/verify-all.ts' }, timeoutMs: 360_000, concurrencyClass: 'exclusive' }),
  step({ id: 'typecheck', name: 'TypeScript static checking', executor: { type: 'npm', args: ['run', 'typecheck'] }, profiles: ['fast', 'candidate'], }),
  step({ id: 'unit', name: 'fine-grained unit tests', executor: { type: 'node-test', files: ['test/unit/*.test.ts'], args: ['--import', './test/register-development-entry.ts', '--test-reporter=dot'] }, workerDemand: 4, profiles: ['fast', 'candidate'],  concurrencyClass: 'cpu-heavy' }),
  step({ id: 'component', name: 'bounded component tests', executor: { type: 'node-test', files: ['test/component/*.test.ts'], args: ['--import', './test/register-development-entry.ts', '--test-reporter=dot'] }, workerDemand: 1, profiles: ['fast', 'candidate'],  concurrencyClass: 'cpu-heavy' }),
  ...INTEGRATION_PRIMARY_SLICES.map((slice: any) => step({
    id: slice.id,
    name: ({
      'integration-runtime-projection': 'Runtime projection integration slice',
      'integration-connections': 'Connection Skill integration slice',
      'integration-task-records': 'Task record and material integration slice',
      'integration-workspace-assets': 'Workspace asset integration slice',
      'integration-archify': 'Archify component lifecycle integration slice',
      'integration-knowledge': 'Knowledge and source reading integration slice',
      'integration-desktop': 'Desktop and Agent connection integration slice',
      'integration-code': 'Code and Git application integration slice',
      'integration': 'Build and verification tool boundaries',
      'integration-declarations': 'Project declaration integration slice',
      'integration-openspec': 'OpenSpec application integration slice',
      'integration-verification': 'Verification orchestration integration slice',
      'integration-runtime': 'Buildr Web Runtime integration slice',
      'integration-release': 'Release and installation integration slice',
      'integration-data-store': 'Workspace data-store integration slice',
      'integration-self-bootstrap': 'Self-bootstrap closeout integration slice',
      'integration-task-read-models': 'Task read-model integration slice',
      'integration-task-coordination': 'Task coordination integration slice',
      'integration-project-daily-progress': 'Project daily progress integration slice',
    } as Record<string, string>)[slice.id],
    executor: { type: slice.executorType, files: [...slice.files], args: [...slice.args] },
    profiles: ['candidate'],
    schedulingCostMs: slice.schedulingCostMs,
    ...(slice.timeoutMs == null ? {} : { timeoutMs: slice.timeoutMs }),
    concurrencyClass: slice.concurrencyClass,
    resources: [...slice.resources],
    contexts: [...slice.contexts],
    admission: slice.admission,
  })),
  step({ id: 'contract', name: 'repository contract tests', executor: { type: 'node-test', files: ['test/contract/*.test.ts'], args: ['--import', './test/register-development-entry.ts', '--test-reporter=dot'] }, workerDemand: 2, profiles: ['fast', 'candidate'], concurrencyClass: 'cpu-heavy' }),
  ...SYSTEM_SUITES.map((suite: any) => step({
    id: suite.id,
    name: suite.name,
    executor: { type: 'node', file: 'test/verification/system.ts', args: ['--owner', suite.id], discoveredFiles: [...suite.files] },
    profiles: ['candidate'],
    schedulingCostMs: suite.schedulingCostMs,
    concurrencyClass: suite.concurrencyClass,
    resources: [...suite.resources],
    contexts: [...(suite.contexts ?? [])],
    workerDemand: suite.innerConcurrency,
    admission: suite.id === 'system-verification-admission',
  })),
  step({ id: 'system-macos-platform', name: 'Native macOS source boundaries', executor: { type: 'node-test', files: ['test/platform/macos-readonly-boundaries.test.ts', 'test/platform/macos-development-entry.test.ts', 'test/platform/macos-launcher-boundaries.test.ts'], args: ['--test-concurrency=1', '--test-reporter=dot'] }, profiles: ['candidate'], selection: 'explicit-only', developmentRunners: ['macos'], platformScope: platformScope('macos'), platformEvidence: MACOS_PLATFORM_BOUNDARIES.filter(item => item.stepId === 'system-macos-platform'), schedulingCostMs: 8000, timeoutMs: 60_000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'system-windows-platform', name: 'Native Windows boundary checks', executor: { type: 'node-test', files: ['test/platform/windows-boundaries.test.ts', 'test/platform/windows-readonly-boundaries.test.ts', 'test/system/worktree-create.test.ts'], supportingFiles: ['test/system/worktree-create.test.ts'], args: ['--test-concurrency=1', '--test-reporter=dot', '--test-name-pattern=^(?:native |owned process |项目与服务共享实际仓库|Windows )'] }, profiles: ['candidate'], groups: ['windows-npm-preflight'], selection: 'explicit-only', developmentRunners: ['windows'], platformScope: platformScope('windows'), platformEvidence: WINDOWS_PLATFORM_BOUNDARIES.filter(item => item.stepId === 'system-windows-platform'), schedulingCostMs: 80_000, timeoutMs: 90_000, concurrencyClass: 'workspace-heavy', resources: ['app-runtime'] }),
  step({ id: 'cli-architecture', name: 'CLI modular architecture', executor: { type: 'node', file: 'test/verification/cli/architecture.ts' }, profiles: ['fast', 'candidate'], }),
  step({ id: 'openspec-spec-quality', name: 'OpenSpec canonical spec quality', executor: { type: 'node', file: 'test/verification/openspec/spec-quality.ts' }, profiles: ['fast', 'candidate'], }),
  step({ id: 'openspec-strict', name: 'openspec strict validation', executor: { type: 'openspec', args: ['validate', '--all', '--strict'] }, profiles: ['fast', 'candidate'], }),
  step({ id: 'runtime-adapter-contract', name: 'runtime adapter contract', executor: { type: 'node', file: 'test/verification/runtime/adapter-contract.ts' }, profiles: ['candidate'], groups: ['runtime'], }),

  step({ id: 'integration-candidate-release', name: 'Candidate integration: release contracts and recovery', executor: { type: 'node', file: 'test/verification/run-node-tests.ts', args: [
    'test/integration-candidate-release/candidate-source-binding.test.ts',
    'test/integration-candidate-release/package-artifact-observation.test.ts',
    'test/integration-candidate-release/package-publication-evidence.test.ts',
    'test/integration-candidate-release/package-release-operation.test.ts',
    'test/integration-candidate-release/plugin-hosted-release.test.ts',
    'test/integration-candidate-release/release-authority-cli.test.ts',
    'test/integration-candidate-release/release-contract-cold-start.test.ts',
    'test/integration-candidate-release/release-convergence.test.ts',
    'test/integration-candidate-release/release-node-runner.test.ts',
    'test/integration-candidate-release/release-skill-ownership.test.ts',
    'test/integration-candidate-release/release-operation.test.ts',
    'test/integration-candidate-release/release-orchestration-runner.test.ts',
    'test/integration-candidate-release/release-recovery.test.ts',
    'test/integration-candidate-release/release-rehearsal.test.ts',
    'test/integration-candidate-release/release-source-scope.test.ts',
  ] }, profiles: ['candidate'], groups: ['release'], schedulingCostMs: 60000, timeoutMs: 300_000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'integration-candidate-release-selection', name: 'Candidate integration: frozen release selection', executor: { type: 'node', file: 'test/verification/run-node-tests.ts', args: ['test/integration-candidate-release/release-selection.test.ts'] }, profiles: ['candidate'], groups: ['release'], schedulingCostMs: 60000, timeoutMs: 300_000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'integration-candidate-package-selection', name: 'Candidate integration: independent package selection', executor: { type: 'node', file: 'test/verification/run-node-tests.ts', args: ['test/integration-candidate-release/package-release-selection-operation.test.ts'] }, profiles: ['candidate'], groups: ['release'], schedulingCostMs: 60000, timeoutMs: 300_000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'integration-candidate-release-effects', name: 'Candidate integration: release publication effects and recovery', executor: { type: 'node', file: 'test/verification/run-node-tests.ts', args: ['test/integration-candidate-release/publication-effects.test.ts'] }, profiles: ['candidate'], groups: ['release'], schedulingCostMs: 60000, timeoutMs: 300_000, concurrencyClass: 'exclusive' }),
  step({ id: 'integration-candidate-git-convergence', name: 'Candidate integration: release Git closeout and generations', executor: { type: 'node', file: 'test/verification/run-node-tests.ts', args: ['test/integration-candidate-release/git-convergence/release-git-convergence-closeout.test.ts', 'test/integration-candidate-release/git-convergence/release-git-convergence-generations.test.ts'] }, profiles: ['candidate'], groups: ['release'], schedulingCostMs: 60000, timeoutMs: 300_000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'integration-candidate-git-selection', name: 'Candidate integration: release Git selection and recovery', executor: { type: 'node', file: 'test/verification/run-node-tests.ts', args: ['test/integration-candidate-release/git-convergence/release-git-convergence-selection.test.ts', 'test/integration-candidate-release/git-convergence/release-git-convergence-recovery.test.ts'] }, profiles: ['candidate'], groups: ['release'], schedulingCostMs: 60000, timeoutMs: 300_000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'concurrent-task-acceptance', name: 'Concurrent task workflow acceptance', executor: { type: 'node', file: 'test/verification/concurrency/task-acceptance.ts' }, profiles: ['candidate'], groups: ['windows-npm-preflight'],  schedulingCostMs: 40000, concurrencyClass: 'workspace-heavy', resources: ['workspace-saturating', 'task-lifecycle-heavy', 'app-runtime'] }),

  step({ id: 'host-node-contract', name: 'Host Node engine contract', executor: { type: 'node', file: 'test/verification/host-node/contract.ts' }, profiles: ['host-node'], }),
  step({ id: 'host-node-boundaries', name: 'Host Node sensitive boundaries', executor: { type: 'node-test', files: [
    'test/integration/process-infrastructure.test.ts',
    'test/integration/workspace-sqlite.test.ts',
  ], args: ['--test-concurrency=2', '--test-reporter=dot'] }, profiles: ['host-node'],  concurrencyClass: 'workspace-heavy' }),
  step({ id: 'candidate-tarball', name: 'frozen application payload and candidate npm tarball', executor: { type: 'candidate-artifact' }, profiles: ['candidate', 'host-node'], groups: ['release'],  }),
  step({ id: 'application-payload-release', name: 'application payload and npm runtime candidate', executor: { type: 'node-test', files: [
    'test/integration/application-payload-release.test.ts',
  ], args: ['--test-concurrency=1', '--test-reporter=dot'], consumesArtifact: true }, profiles: ['candidate'], groups: ['release'],   dependsOn: ['candidate-tarball'], schedulingCostMs: 15000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'npm-launcher-candidate', name: 'verified npm installation Launcher projection', executor: { type: 'node-test', files: [
    'test/integration/npm-launcher.test.ts',
  ], args: ['--test-concurrency=1', '--test-reporter=dot'] }, profiles: ['candidate'], groups: ['release', 'windows-npm-preflight'],  concurrencyClass: 'workspace-heavy' }),
  step({ id: 'host-node-cli-smoke', name: 'Host Node installed CLI smoke', executor: { type: 'node', file: 'test/verification/host-node/cli-smoke.ts', consumesArtifact: true }, profiles: ['host-node'],  dependsOn: ['candidate-tarball'], concurrencyClass: 'workspace-heavy' }),
  step({ id: 'open-source-candidate', name: 'open-source candidate', executor: { type: 'node', file: 'test/verification/release/open-source-candidate.ts', consumesArtifact: true }, profiles: ['candidate'], groups: ['public', 'release'],  dependsOn: ['candidate-tarball'] }),
  step({ id: 'openspec-candidate-audit', name: 'OpenSpec contract candidate audit', executor: { type: 'node', file: 'test/verification/openspec/contract-audit.ts' }, profiles: ['candidate'], groups: ['openspec'], }),
  step({ id: 'managed-mutations', name: 'managed mutations', executor: { type: 'node', file: 'test/verification/integrity/managed-mutations.ts' }, profiles: ['candidate'], groups: ['package'], }),

  step({ id: 'capability-cli-integration', name: 'capability CLI integration', executor: { type: 'node', file: 'test/capability-cli.integration.ts' }, profiles: ['candidate'],  schedulingCostMs: 25000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'commands-cli-integration', name: 'Commands context CLI integration', executor: { type: 'node', file: 'test/commands-cli.integration.ts' }, profiles: ['candidate'], groups: ['cli', 'package'],  schedulingCostMs: 12000, concurrencyClass: 'workspace-heavy' }),
  // Explicit diagnostic entries retain their suites; integration-openspec owns
  // these same six files in the complete source and Candidate selections.
  step({ id: 'openspec-contract-fixtures', name: 'OpenSpec contract fixtures', executor: { type: 'node', file: 'test/verification/openspec/contract.ts', args: ['--suite', 'contract'] }, groups: ['openspec'],  concurrencyClass: 'cpu-heavy' }),
  step({ id: 'openspec-convergence-recovery', name: 'OpenSpec convergence recovery journey', executor: { type: 'node', file: 'test/verification/openspec/contract.ts', args: ['--suite', 'recovery'] }, groups: ['openspec', 'recovery'],  schedulingCostMs: 40000, concurrencyClass: 'workspace-heavy', resources: ['workspace-saturating'] }),
  step({ id: 'package-static', ...packageVerifier('static'), profiles: ['candidate'], groups: ['package'], }),
  step({ id: 'package-workspace', ...packageVerifier('workspace'), profiles: ['candidate'], groups: ['package'],  schedulingCostMs: 7000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'package-commands', ...packageVerifier('commands'), profiles: ['candidate'], groups: ['package'],  schedulingCostMs: 3000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'package-rules', ...packageVerifier('rules'), profiles: ['candidate'], groups: ['package'],  schedulingCostMs: 4000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'package-skills', ...packageVerifier('skills'), profiles: ['candidate'], groups: ['package'],  schedulingCostMs: 10000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'package-runtime', ...packageVerifier('runtime'), profiles: ['candidate'], groups: ['package', 'runtime'],  schedulingCostMs: 7000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'runtime-skill-projection', name: 'runtime packaged Skill projection', executor: { type: 'node', file: 'test/verification/runtime/skill-projection.ts' }, groups: ['runtime'],  schedulingCostMs: 5000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'runtime-adapter-parity', name: 'runtime adapter implementation-family parity', executor: { type: 'node', file: 'test/verification/runtime/adapter-parity.ts' }, profiles: ['candidate'], groups: ['runtime', 'windows-npm-preflight'],  schedulingCostMs: 35000, concurrencyClass: 'workspace-heavy', resources: ['workspace-saturating'] }),

  step({ id: 'workspace-lifecycle', name: 'Workspace E2E: workspace lifecycle', executor: { type: 'workspace-suite', selector: 'workspace-lifecycle' }, profiles: ['candidate'], groups: ['windows-npm-preflight'],  schedulingCostMs: 5000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'ownership-recovery', name: 'Workspace E2E: ownership recovery', executor: { type: 'workspace-suite', selector: 'ownership-recovery' }, profiles: ['candidate'],  schedulingCostMs: 6000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'runtime-reconciliation', name: 'Workspace E2E: runtime reconciliation', executor: { type: 'workspace-suite', selector: 'runtime-reconciliation' }, profiles: ['candidate'],  schedulingCostMs: 10000, concurrencyClass: 'workspace-heavy' }),

  step({ id: 'repository-onboarding', name: 'repository onboarding from a clean checkout', executor: { type: 'node', file: 'test/verification/onboarding/repository.ts' },   schedulingCostMs: 60000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'init-onboarding', name: 'single-command init onboarding', executor: { type: 'node', file: 'test/verification/onboarding/init.ts' }, profiles: ['candidate'],  schedulingCostMs: 7000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'cli-compatibility', name: 'CLI compatibility', executor: { type: 'node', file: 'tools/development/run-isolated-workspace-smoke.ts', args: ['--script', 'test/verification/cli/compatibility.ts'] }, profiles: ['candidate'], groups: ['cli'],  schedulingCostMs: 7000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'cli-package-parity', name: 'CLI package parity', executor: { type: 'node', file: 'test/verification/cli/package-parity.ts', consumesArtifact: true }, profiles: ['candidate'], groups: ['cli'],  dependsOn: ['candidate-tarball'], schedulingCostMs: 15000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'service-branch-contract', name: 'Service branch contract', executor: { type: 'node', file: 'test/verification/onboarding/service-branch.ts' }, profiles: ['candidate'],   schedulingCostMs: 3000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'remote-skill-timeout', name: 'remote Skill timeout contract', executor: { type: 'node', file: 'test/verification/network/remote-text.ts' }, profiles: ['candidate'],  concurrencyClass: 'network' }),
  step({ id: 'release-tarball-smoke', platformScope: platformScope('macos', 'windows'), platformEvidence: [...MACOS_PLATFORM_BOUNDARIES, ...WINDOWS_PLATFORM_BOUNDARIES].filter(item => item.stepId === 'release-tarball-smoke'), name: 'release metadata and real platform Launcher consumption', executor: { type: 'node', file: 'test/verification/release/release-consumption.ts', args: ['platform'], consumesArtifact: true }, profiles: ['candidate'], groups: ['release', 'windows-npm-preflight'], dependsOn: ['candidate-tarball'], schedulingCostMs: 25000, timeoutMs: 300_000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'managed-data-integrity', name: 'managed data integrity', executor: { type: 'node', file: 'test/verification/integrity/managed-data-integrity.ts' }, profiles: ['candidate'], groups: ['package'],  schedulingCostMs: 9000, concurrencyClass: 'workspace-heavy' }),

  step({ id: 'docs-quality', name: 'documentation quality', executor: { type: 'node', file: 'test/verification/docs/quality.ts' }, profiles: ['candidate'],  concurrencyClass: 'default' }),
]);

assertVerificationContextDispositionCoverage(verificationSteps.map((item: any) => item.id));

const candidateShard: any = (id: any, runner: any, phase: any, stepIds: any, options: any = {}) => Object.freeze({
  platformScope: stepIds.every((stepId: string) => verificationSteps.find((step: any) => step.id === stepId)?.platformScope.kind === 'platform') ? platformScope(runner) : COMMON_PLATFORM_SCOPE,
  id,
  runner,
  phase,
  stepIds: Object.freeze(stepIds),
  preparation: options.preparation ?? 'base',
  requiresArtifact: options.requiresArtifact === true,
  producesArtifact: options.producesArtifact === true,
});

export const CORE_MACOS_STEP_IDS: any = Object.freeze([
  'integration',
  'integration-code',
  'integration-knowledge',
  'integration-workspace-assets',
  'integration-archify',
  'integration-task-records',
  'integration-desktop',
  'integration-connections',
  'integration-runtime-projection',
  'integration-declarations',
  'integration-openspec',
  'integration-runtime',
  'integration-release',
  'integration-data-store',
  'integration-self-bootstrap',
  'integration-task-read-models',
  'integration-task-coordination',
  'integration-project-daily-progress',
  'system-verification-contracts',
  'system-public-json-contracts',
  'system-openspec-contract-audit',
  'system-buildr-web-http',
  'application-payload-release',
  'npm-launcher-candidate',
  'open-source-candidate',
  'capability-cli-integration',
  'commands-cli-integration',
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
  'managed-data-integrity',
]);

export const CORE_MACOS_SHARDS: any = Object.freeze([
  candidateShard('core-task-lifecycle-macos', 'macos', 'verification', [
    'integration-self-bootstrap',
  ]),
  candidateShard('core-project-task-macos', 'macos', 'verification', [
    'integration',
    'integration-code',
    'integration-knowledge',
    'integration-workspace-assets',
    'integration-archify',
    'integration-task-records',
    'integration-declarations',
    'integration-openspec',
    'integration-data-store',
    'integration-task-read-models',
    'integration-task-coordination',
    'integration-project-daily-progress',
    'system-verification-contracts',
    'system-public-json-contracts',
    'system-openspec-contract-audit',
  ], { preparation: 'source-runtime' }),
  candidateShard('core-runtime-source-macos', 'macos', 'verification', [
    'integration-runtime',
    'integration-desktop',
    'integration-connections',
    'integration-runtime-projection',
    'integration-release',
    'system-buildr-web-http',
    'npm-launcher-candidate',
    'package-workspace',
    'package-commands',
    'package-rules',
    'package-skills',
    'package-runtime',
    'ownership-recovery',
    'runtime-reconciliation',
    'remote-skill-timeout',
    'managed-data-integrity',
  ], { preparation: 'source-runtime' }),
  candidateShard('core-package-runtime-release-macos', 'macos', 'verification', [
    'application-payload-release',
    'open-source-candidate',
    'cli-package-parity',
  // These consumers use the original package Web payload or explicit generated
  // fixtures. Only the backend harness is needed; never rebuild source Web here.
  ], { requiresArtifact: true, preparation: 'base' }),
  candidateShard('core-cli-contract-macos', 'macos', 'verification', [
    'capability-cli-integration',
    'commands-cli-integration',
    'init-onboarding',
    'cli-compatibility',
    'service-branch-contract',
  ]),
]);

export const CANDIDATE_CI_SHARDS: any = Object.freeze([
  candidateShard('artifact-browser-macos', 'macos', 'verification', ['artifact-browser-core'], { requiresArtifact: true, preparation: 'browser-artifact' }),
  candidateShard('frontend-logic-macos', 'macos', 'verification', ['frontend-logic'], { preparation: 'frontend' }),
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
  candidateShard('release-infrastructure-macos', 'macos', 'verification', ['integration-candidate-release', 'integration-candidate-release-selection', 'integration-candidate-package-selection', 'integration-candidate-release-effects', 'integration-candidate-git-convergence', 'integration-candidate-git-selection'], { preparation: 'source-runtime' }),
  candidateShard('platform-boundaries-macos', 'macos', 'verification', ['system-macos-platform']),
  candidateShard('platform-boundaries-windows', 'windows', 'verification', ['system-windows-platform']),
  candidateShard('runtime-macos', 'macos', 'verification', ['release-tarball-smoke'], { requiresArtifact: true, preparation: 'consumer' }),
  candidateShard('runtime-windows', 'windows', 'verification', ['release-tarball-smoke'], { requiresArtifact: true, preparation: 'consumer' }),
  candidateShard('runtime-source-macos', 'macos', 'verification', ['system-runtime-recovery', 'system-app-process', 'runtime-adapter-parity'], { preparation: 'source-runtime' }),
  candidateShard('workspace-lifecycle-macos', 'macos', 'verification', ['system-workspace-lifecycle', 'workspace-lifecycle']),
  candidateShard('task-worktree-recovery-macos', 'macos', 'verification', ['system-task-lifecycle', 'system-worktree-lifecycle', 'system-nested-git-isolation']),
  candidateShard('task-concurrent-macos', 'macos', 'verification', ['concurrent-task-acceptance']),
]);

export const CANDIDATE_CI_PLATFORM_REPEATS: any = Object.freeze({
  'release-tarball-smoke': Object.freeze(['runtime-macos', 'runtime-windows']),
});

export const CANDIDATE_CI_HOST_NODE_TUPLES: any = Object.freeze([
  Object.freeze({ id: 'host-minimum-macos', runner: 'macos', requestedNode: '24.15.0', expectation: 'minimum' }),
  Object.freeze({ id: 'host-minimum-windows', runner: 'windows', requestedNode: '24.15.0', expectation: 'minimum' }),
  Object.freeze({ id: 'host-current-macos', runner: 'macos', requestedNode: '24.x', expectation: 'current' }),
  Object.freeze({ id: 'host-current-windows', runner: 'windows', requestedNode: '24.x', expectation: 'current' }),
]);

export const VERIFICATION_TEST_INTENTS: any = Object.freeze(['Development', 'Acceptance', 'Static Conformance', 'Delivery / Release']);
export const VERIFICATION_EXECUTION_BOUNDARIES: any = Object.freeze(['Static', 'Unit', 'Component', 'Integration', 'System']);
export const VERIFICATION_PROFILES: any = Object.freeze(['fast', 'core', 'candidate', 'host-node']);
export const VERIFICATION_GROUPS: any = Object.freeze(['public', 'cli', 'runtime', 'package', 'openspec', 'release', 'recovery', 'windows-npm-preflight']);
export const VERIFICATION_EXECUTORS: any = Object.freeze(['node', 'node-test', 'node-context-test', 'npm', 'openspec', 'package-selector', 'workspace-suite', 'candidate-artifact']);

export function verificationStepById(id: any): any  {
  return verificationSteps.find((item: any) => item.id === id);
}
