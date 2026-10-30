import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serviceVerificationChecks as buildrChecks, sharedCheckPreparation } from '../../tools/testing/verification-checks.ts';
import { serviceVerificationChecks as webChecks } from '../../../buildr-web/tools/testing/verification-checks.ts';
import { serviceVerificationChecks as agentChecks } from '../../../buildr-agent/tools/testing/verification-checks.ts';
import { serviceVerificationChecks as pluginChecks } from '../../../dsh-plugin/tools/testing/verification-checks.ts';
import { BROWSER_SELECTORS } from './browser-selector-catalog.ts';
import { MACOS_PLATFORM_BOUNDARIES, WINDOWS_PLATFORM_BOUNDARIES } from './platform-boundaries.ts';
import { PACKAGE_VERIFIERS } from '../../tools/verification/package-check/verification-registry.ts';
import { assertVerificationContextDispositionCoverage, verificationContextDisposition } from '../context/dispositions.ts';
import { TEST_CONTEXT_KEYS, TASK_LIFECYCLE_CONTEXT_KEY, testContextProfileByKey } from '../context/profiles.ts';
import { verificationStepOwnership } from './ownership.ts';
import { JOURNEY_SUITES } from './journey-suites.ts';

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

const testing: any = (ownerScope: any, primaryIntent: any, executionBoundary: any, proves: any, executionEnvironment: any, primaryEvidenceOwner: any = null) => Object.freeze({
  ownerScope,
  primaryIntent,
  executionBoundary,
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
  typecheck: testing(SERVICE_OWNER, 'Static Conformance', 'Static', 'Buildr TypeScript production sources satisfy the strict no-emit execution contract.', TEST_ENVIRONMENTS.sourceReadOnly),
  unit: testing(SERVICE_OWNER, 'Development', 'Unit', 'Pure Buildr logic behaves correctly with collaborators replaced.', TEST_ENVIRONMENTS.pure),
  integration: testing(SERVICE_OWNER, 'Development', 'Integration', 'Generated inputs and verification tools preserve their process, build and compatibility boundaries.', TEST_ENVIRONMENTS.repeatedGitCli),
  'integration-code': testing(SERVICE_OWNER, 'Development', 'Integration', 'Code browsing, editing, observation and Git operations preserve the actual checkout and mutation boundaries.', TEST_ENVIRONMENTS.repeatedGitCli),
  'integration-knowledge': testing(SERVICE_OWNER, 'Development', 'Integration', 'Knowledge and Agent source reading preserve current content, provenance and HTTP results.', TEST_ENVIRONMENTS.repeatedCli),
  'integration-workspace-assets': testing(SERVICE_OWNER, 'Development', 'Integration', 'Workspace assets preserve composition, registration, mutation and user content.', TEST_ENVIRONMENTS.repeatedGitCli),
  'integration-archify': testing(SERVICE_OWNER, 'Development', 'Integration', 'Retired Archify preserves old installations, offline and customized workspaces, self-use rendering and bounded diagnostics.', TEST_ENVIRONMENTS.repeatedCli),
  'integration-task-records': testing(SERVICE_OWNER, 'Development', 'Integration', 'Task records, materials and workbench views preserve filesystem, Git, SQLite and HTTP behavior.', TEST_ENVIRONMENTS.repeatedGitCli),
  'integration-connections': testing(SERVICE_OWNER, 'Development', 'Integration', 'Connection Skills preserve definitions, credential handling, Git workspaces, process and local protocol boundaries.', TEST_ENVIRONMENTS.repeatedGitCli),
  'integration-connections-cli': testing(SERVICE_OWNER, 'Development', 'Integration', 'The connection CLI verification preserves credential handling, isolated workspaces, real process boundaries and cleanup.', TEST_ENVIRONMENTS.repeatedGitCli),
  'integration-runtime-projection': testing(SERVICE_OWNER, 'Development', 'Integration', 'Runtime projections preserve declarations, ownership, executable Git modes and installed Skill content.', TEST_ENVIRONMENTS.repeatedGitCli),
  'integration-declarations': testing(SERVICE_OWNER, 'Development', 'Integration', 'Project verification declarations preserve diagnostics and package registry boundaries.', TEST_ENVIRONMENTS.repeatedFilesystem),
  'integration-openspec': testing(SERVICE_OWNER, 'Development', 'Integration', 'Change and OpenSpec convergence applications preserve real filesystem and Git boundaries.', TEST_ENVIRONMENTS.repeatedGitCli),
  'integration-verification': testing(SERVICE_OWNER, 'Development', 'Integration', 'Project testing maps and Task completion reports remain coherent.', TEST_ENVIRONMENTS.repeatedCli),
  'integration-runtime': testing(SERVICE_OWNER, 'Development', 'Integration', 'Buildr Web Runtime and local service runs preserve actual filesystem, process, Git, loopback HTTP, source identity and cleanup boundaries.', environment(['filesystem', 'cli', 'git', 'loopback-network'], 'unique-temporary-root', 'repeated-cleanup')),
  'integration-release': testing(SERVICE_OWNER, 'Development', 'Integration', 'Release filesystem and installation identity boundaries remain coherent without publishing.', TEST_ENVIRONMENTS.repeatedFilesystem),
  'integration-data-store': testing(SERVICE_OWNER, 'Development', 'Integration', 'Workspace SQLite authority, migration, and checkout isolation remain coherent.', TEST_ENVIRONMENTS.repeatedFilesystem),
  'integration-self-bootstrap': testing(SERVICE_OWNER, 'Development', 'Integration', 'The single self-bootstrap closeout lifecycle preserves retained checkout and runtime synchronization boundaries.', TEST_ENVIRONMENTS.workspaceLifecycle),
  'integration-task-read-models': testing(SERVICE_OWNER, 'Development', 'Integration', 'Task entry and read-model applications preserve their SQLite and Application boundaries.', TEST_ENVIRONMENTS.repeatedFilesystem),
  'integration-task-coordination': testing(SERVICE_OWNER, 'Development', 'Integration', 'Parent coordination and publication applications preserve their real repository boundaries.', TEST_ENVIRONMENTS.repeatedGitCli),
  'integration-macos-native': testing(PROJECT_OWNER, 'Development', 'Integration', 'Existing macOS descriptor proofs and POSIX development entries preserve their native contracts.', TEST_ENVIRONMENTS.repeatedFilesystem),
  'integration-windows-native': testing(PROJECT_OWNER, 'Development', 'Integration', 'Native Windows command shims, path aliases, locks and process cleanup preserve their OS contracts.', TEST_ENVIRONMENTS.workspaceLifecycle),
  'integration-web-http': testing(PROJECT_OWNER, 'Development', 'Integration', 'Buildr Web Runtime HTTP routes preserve read, error, session and cleanup boundaries.', TEST_ENVIRONMENTS.workspaceLifecycle),
  'integration-changed-paths': testing(PROJECT_OWNER, 'Static Conformance', 'Integration', 'Changed-path collection remains trustworthy before broad project verification.', TEST_ENVIRONMENTS.repeatedCli),
  'integration-verification-runtime': testing(PROJECT_OWNER, 'Development', 'Integration', 'Verification orchestration, timing, resource, and Workspace contracts hold through public entrypoints.', TEST_ENVIRONMENTS.repeatedCli),
  'integration-public-json': testing(PROJECT_OWNER, 'Static Conformance', 'Integration', 'Public JSON outputs remain closed, versioned, and stable through real CLI entrypoints.', TEST_ENVIRONMENTS.repeatedCli),
  'integration-openspec-audit': testing(PROJECT_OWNER, 'Static Conformance', 'Integration', 'OpenSpec public audit remains complete through its real project entrypoint.', TEST_ENVIRONMENTS.repeatedCli),
  'e2e-workspace': testing(PROJECT_OWNER, 'Development', 'E2E', 'Project, Service, Workspace catalog, and package capability journeys behave correctly.', TEST_ENVIRONMENTS.workspaceLifecycle),
  'e2e-task': testing(PROJECT_OWNER, 'Development', 'E2E', 'Task Record, Change, Development, Review, and Verification journeys behave correctly.', TEST_ENVIRONMENTS.workspaceLifecycle),
  'e2e-worktree': testing(PROJECT_OWNER, 'Development', 'E2E', 'Real Git Worktree create, inspect, and cleanup journeys behave correctly.', TEST_ENVIRONMENTS.workspaceLifecycle),
  'e2e-nested-git': testing(PROJECT_OWNER, 'Development', 'E2E', 'A non-Git Workspace isolates registered Git sources and preserves its retained materials through the public lifecycle.', TEST_ENVIRONMENTS.workspaceLifecycle),
  'e2e-runtime-recovery': testing(PROJECT_OWNER, 'Development', 'E2E', 'Runtime installation and recovery journeys behave correctly.', TEST_ENVIRONMENTS.workspaceLifecycle),
  'e2e-app-process': testing(PROJECT_OWNER, 'Development', 'E2E', 'Buildr Web process and preview lifecycle remain isolated.', TEST_ENVIRONMENTS.workspaceLifecycle),
  'source-contracts': testing(PROJECT_OWNER, 'Static Conformance', 'Static', 'Product source, governance assets, and stable entrypoint declarations conform without mutable fixtures.', TEST_ENVIRONMENTS.sourceReadOnly),
  'cli-architecture': testing(SERVICE_OWNER, 'Static Conformance', 'Static', 'CLI modules and wrappers preserve the declared architecture.', TEST_ENVIRONMENTS.sourceReadOnly),
  'openspec-strict': testing(PROJECT_OWNER, 'Static Conformance', 'Static', 'All OpenSpec artifacts pass upstream strict validation.', TEST_ENVIRONMENTS.cliReadOnly),
  'runtime-adapter-contract': testing(SERVICE_OWNER, 'Static Conformance', 'Integration', 'Runtime adapter declarations and isolated filesystem projections satisfy their contract.', TEST_ENVIRONMENTS.repeatedFilesystem),
  'runtime-skill-projection': testing(SERVICE_OWNER, 'Development', 'Integration', 'Changed packaged Skills bind their source identity and complete projected inventory through every supported runtime adapter.', TEST_ENVIRONMENTS.repeatedFilesystem),
  'integration-candidate-release': testing(PROJECT_OWNER, 'Delivery / Release', 'Integration', 'Release contract cold-start and branch convergence behave correctly.', TEST_ENVIRONMENTS.repeatedGitCli),
  'integration-candidate-release-selection': testing(PROJECT_OWNER, 'Delivery / Release', 'Integration', 'Release source selection and frozen generation identities remain isolated.', TEST_ENVIRONMENTS.repeatedGitCli),
  'integration-candidate-package-selection': testing(PROJECT_OWNER, 'Delivery / Release', 'Integration', 'Independent package selection binds its exact source, peer and preparation without repeating dispatch.', TEST_ENVIRONMENTS.repeatedGitCli),
  'integration-candidate-release-effects': testing(PROJECT_OWNER, 'Delivery / Release', 'Integration', 'Release publication effects recover external partial results without repeating publication.', TEST_ENVIRONMENTS.repeatedGitCli),
  'integration-candidate-git-convergence': testing(PROJECT_OWNER, 'Delivery / Release', 'Integration', 'Release Git convergence, closeout, and generation cleanup behave correctly.', TEST_ENVIRONMENTS.repeatedGitCli),
  'integration-candidate-git-selection': testing(PROJECT_OWNER, 'Delivery / Release', 'Integration', 'Release Git selection, main integration and recovery preserve the frozen source and independent dev history.', TEST_ENVIRONMENTS.repeatedGitCli),
  'concurrent-task-acceptance': testing(PROJECT_OWNER, 'Acceptance', 'E2E', 'Concurrent Task workflows satisfy the declared acceptance contract.', TEST_ENVIRONMENTS.workspaceLifecycle),
  'candidate-tarball': testing(SERVICE_OWNER, 'Delivery / Release', 'E2E', 'One frozen application payload produces the single npm candidate tarball consumed by later verification.', TEST_ENVIRONMENTS.isolatedGitCli),
  'integration-application-payload-source': testing(SERVICE_OWNER, 'Development', 'Integration', 'Source builders produce deterministic payloads, reject unbound generated inputs, and preserve the thin-entry process boundary.', TEST_ENVIRONMENTS.repeatedFilesystem),
  'application-payload-artifact': testing(SERVICE_OWNER, 'Delivery / Release', 'Integration', 'The exact npm package contains its declared resources and exports its executable and TypeScript Test Context protocol.', TEST_ENVIRONMENTS.repeatedFilesystem),
  'application-payload-release': testing(SERVICE_OWNER, 'Delivery / Release', 'E2E', 'The exact installed npm package validates identity, enrolls update authority, and completes public CLI and on-demand Web workflows.', TEST_ENVIRONMENTS.workspaceLifecycle),
  'npm-launcher-candidate': testing(PROJECT_OWNER, 'Delivery / Release', 'Integration', 'The explicit local Launcher binds one verified npm installation without copying Node or Buildr and fails closed on identity drift.', TEST_ENVIRONMENTS.repeatedFilesystem),
  'host-node-contract': testing(SERVICE_OWNER, 'Static Conformance', 'Static', 'The active Host Node satisfies the bounded package engine contract.', TEST_ENVIRONMENTS.sourceReadOnly),
  'host-node-boundaries': testing(SERVICE_OWNER, 'Development', 'Integration', 'Node-sensitive SQLite, process, and filesystem boundaries work on the active Host Node.', TEST_ENVIRONMENTS.repeatedFilesystem),
  'host-node-cli-consumption': testing(SERVICE_OWNER, 'Delivery / Release', 'E2E', 'The candidate tarball installs on the active Host Node and executes CLI and Web.', TEST_ENVIRONMENTS.workspaceLifecycle),
  'open-source-candidate': testing(PROJECT_OWNER, 'Delivery / Release', 'Static', 'The candidate contains the required public release materials.', TEST_ENVIRONMENTS.sourceReadOnly),
  'spec-change-consistency': testing(PROJECT_OWNER, 'Static Conformance', 'Static', 'Active or archived specification deltas reproduce the actual current source changes.', TEST_ENVIRONMENTS.sourceReadOnly),
  'managed-mutations': testing(SERVICE_OWNER, 'Static Conformance', 'Static', 'Production filesystem mutations remain behind declared owners.', TEST_ENVIRONMENTS.sourceReadOnly),
  'test-file-ownership': testing(SERVICE_OWNER, 'Static Conformance', 'Static', 'Every test file has exactly one primary verification owner.', TEST_ENVIRONMENTS.sourceReadOnly),
  'capability-cli-integration': testing(SERVICE_OWNER, 'Development', 'Integration', 'Capability CLI operations integrate with package and runtime assets.', TEST_ENVIRONMENTS.repeatedCli),
  'commands-cli-integration': testing(SERVICE_OWNER, 'Development', 'Integration', 'Commands context CLI operations integrate with managed workspace assets.', TEST_ENVIRONMENTS.repeatedCli),
  'openspec-contract-fixtures': testing(PROJECT_OWNER, 'Development', 'Integration', 'OpenSpec application contracts hold across isolated fixture repositories.', TEST_ENVIRONMENTS.repeatedGitCli),
  'openspec-convergence-recovery': testing(PROJECT_OWNER, 'Development', 'E2E', 'OpenSpec convergence and recovery complete through the public lifecycle.', TEST_ENVIRONMENTS.workspaceLifecycle),
  'package-static': testing(SERVICE_OWNER, 'Delivery / Release', 'Static', 'The Buildr package structure is valid.', TEST_ENVIRONMENTS.sourceReadOnly),
  'package-workspace': testing(SERVICE_OWNER, 'Delivery / Release', 'Integration', 'Packaged Workspace assets install and check correctly.', TEST_ENVIRONMENTS.repeatedFilesystem),
  'package-commands': testing(SERVICE_OWNER, 'Delivery / Release', 'Integration', 'Packaged Commands assets integrate correctly.', TEST_ENVIRONMENTS.repeatedFilesystem),
  'package-rules': testing(SERVICE_OWNER, 'Delivery / Release', 'Integration', 'Retired Rules registration stays retired while legacy files and guidance remain non-blocking.', TEST_ENVIRONMENTS.repeatedFilesystem),
  'package-skills': testing(SERVICE_OWNER, 'Delivery / Release', 'Integration', 'Packaged Skills assets integrate correctly.', TEST_ENVIRONMENTS.repeatedFilesystem),
  'package-runtime': testing(SERVICE_OWNER, 'Delivery / Release', 'Integration', 'Packaged runtime assets integrate correctly.', TEST_ENVIRONMENTS.repeatedFilesystem),
  'runtime-adapter-parity': testing(SERVICE_OWNER, 'Development', 'E2E', 'All supported runtime implementation families remain behaviorally aligned.', TEST_ENVIRONMENTS.workspaceLifecycle),
  'e2e-workspace-assets': testing(SERVICE_OWNER, 'Development', 'E2E', 'Public workspace and asset commands preserve upgrades, user content, no-Git workflows and actual HTTP recovery.', TEST_ENVIRONMENTS.workspaceLifecycle),
  'workspace-lifecycle': testing(PROJECT_OWNER, 'Development', 'E2E', 'A complete Workspace lifecycle succeeds through public entrypoints.', TEST_ENVIRONMENTS.workspaceLifecycle),
  'ownership-recovery': testing(PROJECT_OWNER, 'Development', 'E2E', 'Workspace ownership conflicts recover without losing user state.', TEST_ENVIRONMENTS.workspaceLifecycle),
  'runtime-reconciliation': testing(PROJECT_OWNER, 'Development', 'E2E', 'Workspace runtime projections reconcile across supported adapters.', TEST_ENVIRONMENTS.workspaceLifecycle),
  'repository-onboarding': testing(PROJECT_OWNER, 'Delivery / Release', 'E2E', 'A clean repository can use the explicit development entry without mutating the PATH default CLI.', TEST_ENVIRONMENTS.workspaceLifecycle),
  'init-onboarding': testing(PROJECT_OWNER, 'Development', 'E2E', 'A user can initialize a Workspace through the public CLI.', TEST_ENVIRONMENTS.workspaceLifecycle),
  'cli-compatibility': testing(SERVICE_OWNER, 'Development', 'E2E', 'Documented CLI commands remain compatible.', TEST_ENVIRONMENTS.repeatedCli),
  'cli-package-parity': testing(SERVICE_OWNER, 'Delivery / Release', 'Integration', 'Representative source and packaged CLI outputs and one init mutation remain equivalent.', TEST_ENVIRONMENTS.repeatedCli),
  'artifact-browser-core': testing(SERVICE_OWNER, 'Delivery / Release', 'E2E', 'The exact Candidate tarball Web payload serves the existing representative Task list and reading journey in an isolated real browser.', TEST_ENVIRONMENTS.workspaceLifecycle),
  'frontend-logic': testing('service:product/buildr-web', 'Development', 'Unit', 'The complete Buildr Web logic suite preserves state transitions, navigation, requests and input conversion.', TEST_ENVIRONMENTS.sourceReadOnly),
  'service-branch-contract': testing(PROJECT_OWNER, 'Development', 'Integration', 'Service branch configuration works in an isolated repository.', TEST_ENVIRONMENTS.isolatedGitCli),
  'remote-skill-timeout': testing(SERVICE_OWNER, 'Development', 'Integration', 'Remote Skill reads fail within the declared timeout boundary.', TEST_ENVIRONMENTS.loopbackNetwork),
  'release-tarball-consumption': testing(SERVICE_OWNER, 'Delivery / Release', 'E2E', 'The shared release tarball installs, keeps ordinary CLI HTTP-free, and serves healthy Buildr Web on demand.', TEST_ENVIRONMENTS.workspaceLifecycle),
  'managed-data-integrity': testing(PROJECT_OWNER, 'Development', 'E2E', 'Managed mutations remain atomic and preserve nested repositories.', TEST_ENVIRONMENTS.workspaceLifecycle),
  'docs-quality': testing(PROJECT_OWNER, 'Static Conformance', 'Static', 'Product documentation links and required content remain valid.', TEST_ENVIRONMENTS.sourceReadOnly),
});

export const VERIFICATION_STEP_EVIDENCE: any = Object.freeze({
  'integration-archify': primaryEvidence(
    'Archify retirement that loses installed content, re-enables disabled Skills, breaks self-use rendering or leaks diagnostic inputs must fail.',
    'real isolated workspaces, retained legacy source migration, self-use rendering and bounded CLI diagnostics',
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
  'integration-verification-runtime': primaryEvidence(
    'A public verification run that violates scheduling, timing, resource, or Workspace result contracts must fail.',
    'public verification and Workspace entrypoints',
  ),
  'integration-public-json': primaryEvidence(
    'A CLI command emitting an open, unversioned, or unstable JSON result must fail the public contract.',
    'real CLI process and serialized public JSON',
  ),
  'e2e-workspace': primaryEvidence(
    'A Project, Service, catalog, or package capability journey that loses persisted state must fail.',
    'real Workspace, Project, Service, Git, and package capability journeys',
  ),
  'e2e-task': primaryEvidence(
    'A public Task Record, Change, Development, Review, or Verification journey with stale state must fail.',
    'real public Task lifecycle across CLI, Git, Workspace, and SQLite',
  ),
  'e2e-worktree': primaryEvidence(
    'A real worktree create or cleanup that targets the wrong ref, repository, or ownership must fail.',
    'real Git worktree lifecycle',
  ),
  'e2e-nested-git': primaryEvidence(
    'A non-Git Workspace that isolates the wrong source, loses retained material, or cleans an uncertain group must fail.',
    'the isolated public CLI lifecycle over independent nested Git repositories',
  ),
  'e2e-runtime-recovery': primaryEvidence(
    'A runtime install or recovery with mismatched target authority or incomplete projection must fail.',
    'real runtime installation, filesystem projection, and recovery process',
  ),
  'integration-web-http': primaryEvidence(
    'A real Buildr Web HTTP session that leaks state, misprojects an error, or survives cleanup must fail.',
    'real loopback HTTP server, session, and cleanup lifecycle',
  ),
  'e2e-app-process': primaryEvidence(
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
  'e2e-workspace-assets': primaryEvidence(
    'A complete public workspace upgrade or no-Git document flow that loses user content or fails recovery must fail.',
    'isolated public CLI and HTTP workspace and asset lifecycles',
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
  'integration-code': primaryEvidence(
    'A Code or Git application that mutates the wrong checkout, loses mutation isolation, or crosses its declared read roots must fail.',
    'real checkout filesystem, Git read/write roots and repeated CLI boundaries',
  ),
  'integration-knowledge': primaryEvidence(
    'A Knowledge or Agent source read that returns stale content, loses provenance, or misprojects HTTP results must fail.',
    'real content sources, provenance records and HTTP read boundaries',
  ),
  'integration-workspace-assets': primaryEvidence(
    'A Workspace asset composition, registration, mutation or user-content boundary that loses or overwrites user content must fail.',
    'real Workspace assets, composition registry, mutation lifecycle and user content',
  ),
  'integration-task-records': primaryEvidence(
    'A Task Record, material or workbench view that crosses filesystem, Git, SQLite or HTTP authority boundaries must fail.',
    'real filesystem, Git, SQLite and HTTP Task Record boundaries',
  ),
  'integration-connections': primaryEvidence(
    'A Connection Skill that mishandles credentials, Git workspaces, process boundaries or local protocol contracts must fail.',
    'real connection definitions, credential handling, Git workspaces and local protocol boundaries',
  ),
  'integration-connections-cli': primaryEvidence(
    'A connection CLI chain that mishandles credentials, isolated workspaces, real process boundaries or cleanup must fail.',
    'the real isolated connection CLI chain, credential handling and cleanup',
  ),
  'integration-runtime': primaryEvidence(
    'A Buildr Web Runtime read, instance, private Git preview or generated Web boundary that leaks or misprojects state must fail.',
    'real runtime read, instance lifecycle, private Git preview and generated Web boundaries',
  ),
  'integration-openspec': primaryEvidence(
    'A Change or OpenSpec convergence application that corrupts real filesystem or Git state must fail.',
    'real filesystem and Git OpenSpec boundaries',
  ),
  'integration-verification': primaryEvidence(
    'A project testing map or Task completion report that becomes incoherent with its verification authority must fail.',
    'real testing map and Task completion report boundaries',
  ),
  'integration-release': primaryEvidence(
    'A release filesystem or installation identity boundary that drifts from its declared source must fail.',
    'real release filesystem and installation identity boundaries',
  ),
  'integration-data-store': primaryEvidence(
    'A Workspace SQLite authority, migration or checkout isolation that loses or crosses its boundary must fail.',
    'real SQLite authority, migration and checkout isolation boundaries',
  ),
  'integration-task-read-models': primaryEvidence(
    'A Task entry or read-model application that crosses SQLite or Application boundaries must fail.',
    'real Task entry and read-model SQLite/Application boundaries',
  ),
  'integration-task-coordination': primaryEvidence(
    'A parent coordination or publication application that crosses its real repository boundary must fail.',
    'real repository boundaries for coordination and publication applications',
  ),
  'service-branch-contract': primaryEvidence(
    'A Service branch configuration that misprojects its repository, ref or ownership in an isolated repository must fail.',
    'real isolated repository branch configuration and ownership',
  ),
  'remote-skill-timeout': primaryEvidence(
    'A remote Skill read that exceeds or ignores its declared timeout boundary must fail.',
    'real loopback network and declared timeout boundary',
  ),
});

const BACKEND_REUSE_CHECKS = new Set(['managed-mutations', 'cli-compatibility']);
// These bounded fixture suites read runtime/source assets, not this Product's governance records.
const RUNTIME_REUSE_CHECKS = new Set(['integration-runtime', 'integration-code', 'integration-task-records', 'integration-connections', 'integration-connections-cli', 'integration-runtime-projection', 'integration-data-store', 'integration-task-read-models', 'integration-task-coordination',
  'integration-web-http', 'e2e-task', 'e2e-worktree', 'e2e-nested-git',
  'integration-candidate-release-effects', 'integration-candidate-git-convergence', 'integration-candidate-git-selection',
  'e2e-runtime-recovery', 'e2e-app-process', 'e2e-workspace']);
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
  'integration-knowledge', 'integration-workspace-assets', 'integration-archify',
  'integration-declarations', 'integration-openspec', 'integration-public-json',
  'integration-openspec-audit', 'concurrent-task-acceptance', 'npm-launcher-candidate', 'capability-cli-integration',
  'commands-cli-integration', 'remote-skill-timeout']);
const NON_REUSABLE_CHECKS = new Set(['dsh-plugin', 'candidate-tarball', 'application-payload-artifact', 'application-payload-release', 'release-tarball-consumption', 'artifact-browser-core', 'cli-package-parity', 'host-node-contract', 'host-node-boundaries']);
// Lifecycle fixtures create and mutate their own repositories. Only checks that
// actually observe the retained checkout history bind its Git state.
const GIT_SOURCE_CHECKS = new Set(['open-source-candidate']);
const REUSE_INPUTS_BY_STEP: Readonly<Record<string, readonly string[]>> = Object.freeze({
  'docs-quality': Object.freeze(['BUILDR_CHANGED_PATHS_JSON']),
  'runtime-skill-projection': Object.freeze(['BUILDR_CHANGED_PATHS_JSON']),
  'spec-change-consistency': Object.freeze(['BUILDR_VERIFICATION_BASE']),
});
function sourceReusePolicy(definition: any): any {
  if (NON_REUSABLE_CHECKS.has(definition.id) || definition.executor?.type === 'candidate-artifact' || definition.executor?.consumesArtifact
    || definition.id.startsWith('host-')) return false;
  if (definition.id === 'typecheck') return Object.freeze({ scope: 'repository', exactNode: true, tools: ['npm'] });
  // Native boundary fixtures materialize the complete backend, not Web/plugin
  // source or this workspace's release Skill. Their Git operations use fixtures.
  if (['integration-windows-native', 'integration-macos-native'].includes(definition.id)) return Object.freeze({ scope: 'platform-backend', inputMode: 'runtime-check', tools: ['git'] });
  if (BACKEND_REUSE_CHECKS.has(definition.id)) return Object.freeze({ scope: 'backend' });
  // The backend unit entry also executes tests importing Web helpers. Architecture
  // and adapter contracts read Product knowledge and repository-root materials,
  // so they retain the complete repository scope below.
  if (definition.id === 'frontend-logic' || definition.id === 'unit') return Object.freeze({ scope: 'web' });
  // Other registered checks conservatively include all Product material;
  // checks reading source Git identities also bind the observed Git history.
  const usesGit = VERIFICATION_STEP_TESTING[definition.id]?.environment?.footprints.includes('git');
  return Object.freeze({ scope: RUNTIME_REUSE_CHECKS.has(definition.id) ? 'runtime' : 'repository',
    git: definition.id === 'spec-change-consistency' ? 'comparison' : GIT_SOURCE_CHECKS.has(definition.id),
    ...(RUNTIME_REUSE_CHECKS.has(definition.id) ? { inputMode: 'runtime-check' } : {}),
    ...(usesGit ? { tools: ['git'] } : {}), ...(RELEASE_NOTES_INDEPENDENT_CHECKS.has(definition.id) ? { releaseNotes: false } : {}),
    ...(REUSE_INPUTS_BY_STEP[definition.id] ? { inputs: REUSE_INPUTS_BY_STEP[definition.id] } : {}) });
}

const step: any = (definition: any) => {
  const classification: any = VERIFICATION_STEP_TESTING[definition.id];
  const evidence: any = VERIFICATION_STEP_EVIDENCE[definition.id] ?? null;
  const contextDisposition: any = verificationContextDisposition(definition.id);
  const ownership: any = verificationStepOwnership(definition.id, definition.executor);
  const profiles: any = definition.profiles ?? [];
  // Safety timeouts are explicit or derived from the boundary each check must survive:
  // workspace-lifecycle environments and Delivery / Release responsibilities.
  const timeoutMs: any = definition.timeoutMs ?? (
    classification?.environment.footprints.includes('workspace-lifecycle') ? 360_000
      : classification?.primaryIntent === 'Delivery / Release' ? 300_000
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
  resources: Object.freeze({ 'workspace-saturating': workspaceSaturating, 'task-lifecycle-heavy': 1, 'app-runtime': 1, 'browser-runtime': 2 }),
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
  'browser-runtime': Object.freeze({
    requiredFootprints: Object.freeze(['workspace-lifecycle']), isolation: 'unique-temporary-root', resetBurdens: Object.freeze(['lifecycle']),
  }),
  'app-runtime': Object.freeze({
    requiredFootprints: Object.freeze(['workspace-lifecycle']),
    isolation: 'unique-temporary-root',
    resetBurdens: Object.freeze(['lifecycle']),
  }),
});

export const VERIFICATION_EXECUTION_PROFILES: any = Object.freeze({
  local: concurrency(4, 3, 2, { integration: 4, 'integration-candidate-release': 2, 'runtime-adapter-parity': 2, ...Object.fromEntries(JOURNEY_SUITES.map((suite: any) => [suite.id, suite.innerConcurrency])), 'openspec-contract-fixtures': 2, 'openspec-convergence-recovery': 3 }, { workers: 8, processes: 8, git: 3, workspaceIo: 3 }),
  ci: concurrency(4, 3, 2, { integration: 4, 'integration-candidate-release': 2, 'runtime-adapter-parity': 2, ...Object.fromEntries(JOURNEY_SUITES.map((suite: any) => [suite.id, suite.innerConcurrency])), 'openspec-contract-fixtures': 2, 'openspec-convergence-recovery': 3 }, { workers: 8, processes: 8, git: 3, workspaceIo: 3 }),
  'ci-workspace-limited': concurrency(4, 2, 1, { integration: 3, unit: 3, 'source-contracts': 2, 'integration-runtime': 2, 'integration-code': 2, 'integration-knowledge': 1, 'integration-workspace-assets': 2, 'integration-archify': 1, 'integration-task-records': 2, 'integration-connections': 2, 'integration-runtime-projection': 1,  ...Object.fromEntries(JOURNEY_SUITES.map((suite: any) => [suite.id, Math.min(suite.innerConcurrency, 2)])), 'integration-candidate-release': 2, 'runtime-adapter-parity': 2, 'integration-candidate-release-selection': 1, 'integration-candidate-package-selection': 1, 'integration-candidate-release-effects': 1, 'integration-candidate-git-convergence': 2, 'integration-candidate-git-selection': 2, 'openspec-contract-fixtures': 2, 'openspec-convergence-recovery': 2 }, { workers: 3, processes: 3, git: 2, workspaceIo: 2 }),
});

export const VERIFICATION_CONCURRENCY: any = VERIFICATION_EXECUTION_PROFILES.local;

/** Only the worker grant reaches these child executors. Queue capacities and
 * unrelated steps' budgets do not change this check's execution inputs. */
export function verificationStepExecutionInputs(definition: any, profiles: any = VERIFICATION_EXECUTION_PROFILES): any {
  if (!['node', 'node-test', 'node-context-test'].includes(definition.executor?.type)) return null;
  return { innerWorkers: Object.fromEntries(Object.entries(profiles).map(([id, profile]: [string, any]) =>
    [id, profile.innerConcurrency?.[definition.parentId ?? definition.id] ?? definition.resourceDemand?.workers ?? 1])) };
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
  args: Object.freeze([...(options.args ?? []), '--test-reporter=dot']),
});

export const INTEGRATION_PRIMARY_SLICES: any = Object.freeze([
  // Explicit stable owners replace the exclusive catch-all. The tool owner
  // remains exclusive because generated-artifact-set refreshes checkout DTOs.
  integrationSlice('integration', [
    'test/integration/agent-service-delivery.test.ts',
    'test/integration/agent-service-http.test.ts',
    'test/integration/browser-launch.test.ts',
    'test/integration/browser-selector-dispatcher-runtime.test.ts',
    'test/integration/development-entry.test.ts',
    'test/integration/development-workspace-check-isolation.test.ts',
    'test/integration/dsh-payload.test.ts',
    'test/integration/generated-artifact-set.test.ts',
    'test/integration/generated-artifacts.test.ts',
    'test/integration/generated-contract-artifacts.test.ts',
    'test/integration/process-infrastructure.test.ts',
    'test/integration/typescript-execution.test.ts',
    'test/integration/verification-entrypoints-cli.test.ts',
    'test/integration/verification-process-executor.test.ts',
    'test/integration/verification-reuse-filesystem.test.ts',
    'test/integration/verification-inputs.test.ts',
    'test/integration/windows-artifact-diagnosis.test.ts',
  ], { schedulingCostMs: 5000, timeoutMs: 300_000, concurrencyClass: 'exclusive', args: ['--test-concurrency=4'] }),
  integrationSlice('integration-code', [
    'test/integration/retire-legacy-agent-data.test.ts',
    'test/integration/code-branch-application.test.ts',
    'test/integration/code-fixture-isolation.test.ts',
    'test/integration/code-commit-application.test.ts',
    'test/integration/code-commit-push.test.ts',
    'test/integration/code-commit-sync.test.ts',
    'test/integration/code-commit-guidance.test.ts',
    'test/integration/code-commit-message-http.test.ts',
    'test/integration/code-commit-message-large-http.test.ts',
    'test/integration/code-discard-application.test.ts',
    'test/integration/code-explorer-application.test.ts',
    'test/integration/code-fetch-application.test.ts',
    'test/integration/code-git-configuration.test.ts',
    'test/integration/code-sync-application.test.ts',
    'test/integration/code-sync-safety.test.ts',
    'test/integration/code-working-comparison.test.ts',
    'test/integration/file-editing-application.test.ts',
    'test/integration/git-checkout-identity.test.ts',
    'test/integration/git-worktree-evidence-reader.test.ts',
    'test/integration/git-worktree-incremental.test.ts',
    'test/integration/source-control-application.test.ts',
    'test/integration/source-control-observation-http.test.ts',
    'test/integration/source-control-observations.test.ts',
  ], { schedulingCostMs: 179000, timeoutMs: 300_000, args: ['--test-concurrency=3'], contexts: [TASK_LIFECYCLE_CONTEXT_KEY] }),
  integrationSlice('integration-knowledge', [
    'test/integration/agent-asset-source-query.test.ts',
    'test/integration/current-knowledge-capability-graph.test.ts',
    'test/integration/knowledge-document-quality.test.ts',
    'test/integration/knowledge-query.test.ts',
    'test/integration/skill-content-query.test.ts',
  ], { schedulingCostMs: 4000, args: ['--test-concurrency=2'] }),
  integrationSlice('integration-workspace-assets', [
    'test/integration/artifact-lifecycle.test.ts',
    'test/integration/asset-catalog-version.test.ts',
    'test/integration/asset-catalog-lifecycle.test.ts',
    'test/integration/asset-relationships.test.ts',
    'test/integration/repository-clone-supervisor.test.ts',
    'test/integration/asset-registration.test.ts',
    'test/integration/asset-repository-mutations.test.ts',
    'test/integration/attached-project-services.test.ts',
    'test/integration/inline-workspace-core-rules.test.ts',
    'test/integration/project-registry-boundaries.test.ts',
    'test/integration/service-registry-boundaries.test.ts',
    'test/integration/workspace-registry-boundaries.test.ts',
    'test/integration/shared-resources.test.ts',
    'test/integration/shared-resource-coexistence.test.ts',
    'test/integration/workspace-agent-assets-http-contract.test.ts',
    'test/integration/workspace-composition.test.ts',
    'test/integration/workspace-mutation-recovery.test.ts',
    'test/integration/workspace-read-reuse.test.ts',
  // Catalog transaction groups run independently; full CLI lifecycles and
  // original-package workflows have their own E2E owners.
  ], { schedulingCostMs: 5000, timeoutMs: 360_000, args: ['--test-concurrency=2'], contexts: [TASK_LIFECYCLE_CONTEXT_KEY] }),
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
    'test/integration/browser-profiles.test.ts',
    'test/integration/browser-runtime.test.ts',
    'test/integration/connection-authoring-forward.test.ts',
    'test/integration/connection-instance-filenames.test.ts',
    'test/integration/connection-skill-definitions.test.ts',
    'test/integration/connection-authorization.test.ts',
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
  ], { schedulingCostMs: 5000, timeoutMs: 300_000, args: ['--test-concurrency=3'] }),
  // This scenario spawns dozens of real CLI processes. Keep it isolated from
  // the heavier authoring scenario so one worker covers its actual runtime.
  integrationSlice('integration-connections-cli', [
    'test/integration/connection-skills-cli.test.ts',
  ], { schedulingCostMs: 5000, timeoutMs: 180_000, args: ['--test-concurrency=1'] }),
  integrationSlice('integration-runtime-projection', [
    'test/integration/verification-provider-migration.test.ts',
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
    'test/integration/development-workspace-refresh.test.ts',
    'test/integration/buildr-web-read-executor.test.ts',
    'test/integration/buildr-web-write-executor.test.ts',
    'test/integration/buildr-web-runtime.test.ts',
    'test/integration/restart-web-handoff.test.ts',
    'test/integration/buildr-web-workspace.test.ts',
    'test/integration/preview-ownership.test.ts',
    'test/integration/preview-reuse-lifecycle.test.ts',
    'test/integration/preview-reuse-agent-runtime.test.ts',
    'test/integration/runtime-system-http-contract.test.ts',
    'test/integration/service-runtime-connections.test.ts',
    'test/integration/service-runtime-http.test.ts',
    'test/integration/service-runtime-lanes.test.ts',
    'test/integration/service-runtime-lifecycle.test.ts',
    'test/integration/service-runtime-module.test.ts',
    'test/integration/service-runtime-persistence.test.ts',
    'test/integration/service-runtime-process.test.ts',
    'test/integration/service-task-runtime-http.test.ts',
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
  ], { schedulingCostMs: 5000, args: ['--test-concurrency=3'] }),
  integrationSlice('integration-release', [
    'test/integration/open-source-release-filesystem.test.ts',
    'test/integration/product-installation-identity.test.ts',
    'test/integration/development-runtime-inputs.test.ts',
    'test/integration/product-installation-registry.test.ts',
    'test/integration/update-flow-http-contract.test.ts',
    'test/integration/update-flow-recovery.test.ts',
    'test/integration/workspace-cli-routing.test.ts',
  ], { schedulingCostMs: 2000, args: ['--test-concurrency=2'] }),
  integrationSlice('integration-data-store', [
    'test/integration/workspace-management-fence.test.ts',
    'test/integration/workspace-registry-scope.test.ts',
    'test/integration/workspace-sqlite.test.ts',
    'test/integration/task-read-snapshot.test.ts',
  ], { schedulingCostMs: 2000, args: ['--test-concurrency=1'] }),
  integrationSlice('integration-self-bootstrap', [
    'test/integration/self-bootstrap-closeout.test.ts',
    'test/integration/development-web-continuity.test.ts',
  ], { schedulingCostMs: 50000, resources: ['workspace-saturating'], args: ['--test-concurrency=1'] }),
  integrationSlice('integration-task-read-models', [
    'test/integration/task-review-repository.test.ts',
  ], { schedulingCostMs: 4000, executorType: 'node-context-test', concurrencyClass: 'cpu-heavy', args: ['--test-concurrency=2'] }),
  integrationSlice('integration-task-coordination', [
    'test/integration/parent-coordination-application.test.ts',
    'test/integration/parent-coordination-repository.test.ts',
    'test/integration/publication-application.test.ts',
    'test/integration/publication-worktree.test.ts',
  ], { schedulingCostMs: 5000, executorType: 'node-context-test', concurrencyClass: 'cpu-heavy', args: ['--test-concurrency=2'] }),
]);

// The compatibility general entry aggregates every source Integration owner.
// Artifact-only files stay in their original package consumers.
export const INTEGRATION_GENERAL_EXCLUDED_FILES: any = Object.freeze([...new Set([
  'test/integration/application-payload-artifact.test.ts',
  'test/integration/npm-launcher.test.ts',
])]);

const builtInVerificationSteps: any = Object.freeze([
  step({ id: 'artifact-browser-core', name: 'Candidate tarball core Browser journey', executor: { type: 'node', file: 'test/verification/release/browser-candidate.ts', discoveredFiles: ['test/e2e/buildr-web-browser.test.ts'], supportingFiles: ['test/e2e/buildr-web-browser.test.ts'], args: ['--selector', 'core'], consumesArtifact: true }, profiles: ['candidate'], groups: ['release'], dependsOn: ['candidate-tarball'], timeoutMs: 360_000, concurrencyClass: 'workspace-heavy', resources: ['app-runtime'] }),
  step({ id: 'frontend-logic', name: 'Buildr Web complete logic suite', executor: { type: 'node', file: '../buildr-web/tools/run-logic-tests.mjs' }, profiles: ['candidate'], concurrencyClass: 'cpu-heavy' }),

  step({ id: 'typecheck', name: 'TypeScript static checking', executor: { type: 'npm', args: ['run', 'typecheck'] }, profiles: ['candidate'], }),
  step({ id: 'unit', name: 'fine-grained unit tests', executor: { type: 'node-test', files: ['test/unit/*.test.ts'], args: ['--import', './test/register-development-entry.ts', '--test-reporter=dot'] }, workerDemand: 4, profiles: ['candidate'],  concurrencyClass: 'cpu-heavy' }),

  ...INTEGRATION_PRIMARY_SLICES.map((slice: any) => step({
    id: slice.id,
    name: ({
      'integration-runtime-projection': 'Runtime projection integration slice',
      'integration-connections': 'Connection Skill integration slice',
      'integration-connections-cli': 'Connection CLI verification',
      'integration-task-records': 'Task record and material integration slice',
      'integration-workspace-assets': 'Workspace asset integration slice',
      'integration-archify': 'Archify retirement and self-use integration slice',
      'integration-knowledge': 'Knowledge and source reading integration slice',
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
    } as Record<string, string>)[slice.id],
    executor: { type: slice.executorType, files: [...slice.files], args: [...slice.args] },
    profiles: ['candidate'],
    schedulingCostMs: slice.schedulingCostMs,
    ...(slice.timeoutMs == null ? {} : { timeoutMs: slice.timeoutMs }),
    concurrencyClass: slice.concurrencyClass,
    resources: [...slice.resources],
    contexts: [...slice.contexts],
  })),
  step({ id: 'source-contracts', name: 'repository contract tests', executor: { type: 'node-test', files: ['test/static/*.test.ts'], args: ['--import', './test/register-development-entry.ts', '--test-reporter=dot'] }, workerDemand: 2, profiles: ['candidate'], concurrencyClass: 'cpu-heavy' }),
  ...JOURNEY_SUITES.map((suite: any) => step({
    id: suite.id,
    name: suite.name,
    executor: { type: 'node', file: 'test/verification/journeys.ts', args: ['--owner', suite.id], discoveredFiles: [...suite.files] },
    profiles: ['candidate'],
    schedulingCostMs: suite.schedulingCostMs,
    concurrencyClass: suite.concurrencyClass,
    resources: [...suite.resources],
    contexts: [...(suite.contexts ?? [])],
    workerDemand: suite.innerConcurrency,
  })),
  step({ id: 'integration-macos-native', name: 'Native macOS source boundaries', executor: { type: 'node-test', files: ['test/integration/macos-readonly-boundaries.test.ts', 'test/integration/macos-development-entry.test.ts', 'test/integration/macos-launcher-boundaries.test.ts'], args: ['--test-concurrency=1', '--test-reporter=dot'] }, profiles: ['candidate'], developmentRunners: ['macos'], platformScope: platformScope('macos'), platformEvidence: MACOS_PLATFORM_BOUNDARIES.filter(item => item.stepId === 'integration-macos-native'), schedulingCostMs: 8000, timeoutMs: 60_000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'integration-windows-native', name: 'Native Windows boundary checks', executor: { type: 'node-test', files: ['test/integration/windows-boundaries.test.ts', 'test/integration/windows-readonly-boundaries.test.ts', 'test/e2e/worktree-create.test.ts'], supportingFiles: ['test/e2e/worktree-create.test.ts'], args: ['--test-concurrency=1', '--test-reporter=dot', '--test-name-pattern=^(?:native |owned process |项目与服务共享实际仓库|Windows )'] }, profiles: ['candidate'], groups: ['windows-npm-preflight'], developmentRunners: ['windows'], platformScope: platformScope('windows'), platformEvidence: WINDOWS_PLATFORM_BOUNDARIES.filter(item => item.stepId === 'integration-windows-native'), schedulingCostMs: 80_000, timeoutMs: 180_000, concurrencyClass: 'workspace-heavy', resources: ['app-runtime'] }),
  step({ id: 'cli-architecture', preparations: sharedCheckPreparation.map(value => ({ ...value, cwd: path.resolve(import.meta.dirname, '../..', value.cwd) })), name: 'CLI modular architecture', executor: { type: 'node', file: 'test/verification/cli/architecture.ts' }, profiles: [], }),
  step({ id: 'openspec-strict', name: 'openspec strict validation', executor: { type: 'openspec', args: ['validate', '--all', '--strict'] }, profiles: [], }),
  step({ id: 'runtime-adapter-contract', name: 'runtime adapter contract', executor: { type: 'node', file: 'test/verification/runtime/adapter-contract.ts' }, profiles: ['candidate'], groups: ['runtime'], }),

  step({ id: 'integration-candidate-release', workerDemand: 2, name: 'Candidate integration: release contracts and recovery', executor: { type: 'node', file: 'test/verification/run-node-tests.ts', args: [
    'test/integration/candidate-source-binding.test.ts',
    'test/integration/package-publication-evidence.test.ts',
    'test/integration/package-release-operation.test.ts',
    'test/integration/plugin-hosted-release.test.ts',
    'test/integration/release-authority-cli.test.ts',
    'test/integration/release-contract-cold-start.test.ts',
    'test/integration/release-convergence.test.ts',
    'test/integration/release-node-runner.test.ts',
    'test/integration/release-skill-ownership.test.ts',
    'test/integration/release-operation.test.ts',
    'test/integration/release-recovery.test.ts',
    'test/integration/release-rehearsal.test.ts',
    'test/integration/release-source-scope.test.ts',
  ] }, profiles: ['candidate'], groups: ['release'], schedulingCostMs: 60000, timeoutMs: 300_000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'integration-candidate-release-selection', name: 'Candidate integration: frozen release selection', executor: { type: 'node', file: 'test/verification/run-node-tests.ts', args: ['test/integration/release-selection.test.ts'] }, profiles: ['candidate'], groups: ['release'], schedulingCostMs: 60000, timeoutMs: 300_000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'integration-candidate-package-selection', name: 'Candidate integration: independent package selection', executor: { type: 'node', file: 'test/verification/run-node-tests.ts', args: ['test/integration/package-release-selection-operation.test.ts'] }, profiles: ['candidate'], groups: ['release'], schedulingCostMs: 60000, timeoutMs: 300_000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'integration-candidate-release-effects', name: 'Candidate integration: release publication effects and recovery', executor: { type: 'node', file: 'test/verification/run-node-tests.ts', args: ['test/integration/publication-effects.test.ts'] }, profiles: ['candidate'], groups: ['release'], schedulingCostMs: 60000, timeoutMs: 300_000, concurrencyClass: 'exclusive' }),
  step({ id: 'integration-candidate-git-convergence', name: 'Candidate integration: release Git closeout and generations', executor: { type: 'node', file: 'test/verification/run-node-tests.ts', args: ['test/integration/git-convergence/release-git-convergence-closeout.test.ts', 'test/integration/git-convergence/release-git-convergence-generations.test.ts'] }, profiles: ['candidate'], groups: ['release'], schedulingCostMs: 60000, timeoutMs: 300_000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'integration-candidate-git-selection', name: 'Candidate integration: release Git selection and recovery', executor: { type: 'node', file: 'test/verification/run-node-tests.ts', args: ['test/integration/git-convergence/release-git-convergence-selection.test.ts', 'test/integration/git-convergence/release-git-convergence-recovery.test.ts'] }, profiles: ['candidate'], groups: ['release'], schedulingCostMs: 60000, timeoutMs: 300_000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'e2e-workspace-assets', name: 'Workspace and asset public CLI/HTTP lifecycles', executor: { type: 'node-test', files: [
    'test/e2e/asset-catalog-cli.test.ts',
    'test/e2e/inline-workspace-core-rules.test.ts',
    'test/e2e/non-git-workspace-continuity.test.ts',
    'test/e2e/workspace-lifecycle.test.ts',
  ], args: ['--test-concurrency=2'] }, profiles: ['candidate'], contexts: [TASK_LIFECYCLE_CONTEXT_KEY], concurrencyClass: 'workspace-heavy', schedulingCostMs: 237000 }),
  step({ id: 'concurrent-task-acceptance', name: 'Concurrent task workflow acceptance', executor: { type: 'node', file: 'test/verification/concurrency/task-acceptance.ts' }, profiles: ['candidate'], groups: ['windows-npm-preflight'],  schedulingCostMs: 40000, concurrencyClass: 'workspace-heavy', resources: ['workspace-saturating', 'task-lifecycle-heavy', 'app-runtime'] }),

  step({ id: 'host-node-contract', name: 'Host Node engine contract', executor: { type: 'node', file: 'test/verification/host-node/contract.ts' }, profiles: ['host-node'], }),
  step({ selection: 'explicit-only', requirements: ['Supplementary compatibility recipe for explicitly selected Host Node versions; ordinary source checks already cover these files.'], id: 'host-node-boundaries', name: 'Host Node sensitive boundaries', executor: { type: 'node-test', files: [
    'test/integration/process-infrastructure.test.ts',
    'test/integration/workspace-sqlite.test.ts',
  ], args: ['--test-concurrency=2', '--test-reporter=dot'] }, profiles: ['host-node'],  concurrencyClass: 'workspace-heavy' }),
  step({ id: 'candidate-tarball', name: 'frozen application payload and candidate npm tarball', executor: { type: 'candidate-artifact' }, profiles: ['candidate', 'host-node'], groups: ['release'],  }),
  step({ id: 'integration-application-payload-source', name: 'application payload source builders and thin-entry process boundaries',
    executor: { type: 'node-test', files: ['test/integration/application-payload-source.test.ts'], args: ['--test-concurrency=1', '--test-reporter=dot'] },
    preparations: sharedCheckPreparation.map(value => ({ ...value, cwd: path.resolve(import.meta.dirname, '../..', value.cwd) })),
    profiles: ['candidate'], groups: ['package'], concurrencyClass: 'workspace-heavy' }),
  step({ id: 'application-payload-artifact', name: 'exact npm package resources and public Test Context protocol', executor: { type: 'node-test', files: [
    'test/integration/application-payload-artifact.test.ts',
  ], args: ['--test-concurrency=1', '--test-reporter=dot'], consumesArtifact: true }, profiles: ['candidate'], groups: ['release'], dependsOn: ['candidate-tarball'], concurrencyClass: 'workspace-heavy' }),
  step({ id: 'application-payload-release', name: 'exact npm package installation and public CLI/Web workflows', executor: { type: 'node-test', files: [
    'test/e2e/application-payload-release.test.ts',
    'test/e2e/builtin-connection-skills-package.test.ts',
    'test/e2e/inline-core-package.test.ts',
  ], args: ['--test-concurrency=1', '--test-reporter=dot'], consumesArtifact: true }, profiles: ['candidate'], groups: ['release'], dependsOn: ['candidate-tarball'], schedulingCostMs: 15000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'npm-launcher-candidate', name: 'verified npm installation Launcher projection', executor: { type: 'node-test', files: [
    'test/integration/npm-launcher.test.ts',
  ], args: ['--test-concurrency=1', '--test-reporter=dot'] }, profiles: ['candidate'], groups: ['release', 'windows-npm-preflight'],  concurrencyClass: 'workspace-heavy' }),
  step({ id: 'host-node-cli-consumption', name: 'Host Node installed CLI consumption', executor: { type: 'node', file: 'test/verification/host-node/cli-consumption.ts', consumesArtifact: true }, profiles: ['host-node'],  dependsOn: ['candidate-tarball'], concurrencyClass: 'workspace-heavy' }),
  step({ id: 'open-source-candidate', name: 'open-source candidate', executor: { type: 'node', file: 'test/verification/release/open-source-candidate.ts', consumesArtifact: true }, profiles: ['candidate'], groups: ['public', 'release'],  dependsOn: ['candidate-tarball'] }),
  step({ id: 'spec-change-consistency', name: 'Active and archived specification changes match current source', executor: { type: 'node', file: 'test/verification/openspec/spec-change-consistency.ts' }, profiles: [], groups: ['openspec'], }),
  step({ id: 'managed-mutations', name: 'managed mutations', executor: { type: 'node', file: 'test/verification/integrity/managed-mutations.ts' }, profiles: ['candidate'], groups: ['package'], }),
  step({ id: 'test-file-ownership', name: 'test file primary ownership audit', executor: { type: 'node', file: 'test/verification/integrity/test-file-ownership.ts' }, profiles: ['candidate'], groups: ['package'], }),

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
  step({ id: 'runtime-adapter-parity', workerDemand: 2, name: 'runtime adapter implementation-family parity', executor: { type: 'node', file: 'test/verification/runtime/adapter-parity.ts' }, profiles: ['candidate'], groups: ['runtime', 'windows-npm-preflight'],  schedulingCostMs: 35000, concurrencyClass: 'workspace-heavy', resources: ['workspace-saturating'] }),

  step({ id: 'workspace-lifecycle', name: 'Workspace E2E: workspace lifecycle', executor: { type: 'workspace-suite', selector: 'workspace-lifecycle' }, profiles: ['candidate'], groups: ['windows-npm-preflight'],  schedulingCostMs: 5000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'ownership-recovery', name: 'Workspace E2E: ownership recovery', executor: { type: 'workspace-suite', selector: 'ownership-recovery' }, profiles: ['candidate'],  schedulingCostMs: 6000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'runtime-reconciliation', name: 'Workspace E2E: runtime reconciliation', executor: { type: 'workspace-suite', selector: 'runtime-reconciliation' }, profiles: ['candidate'],  schedulingCostMs: 10000, concurrencyClass: 'workspace-heavy' }),

  step({ id: 'repository-onboarding', name: 'repository onboarding from a clean checkout', executor: { type: 'node', file: 'test/verification/onboarding/repository.ts' },   schedulingCostMs: 60000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'init-onboarding', name: 'single-command init onboarding', executor: { type: 'node', file: 'test/verification/onboarding/init.ts' }, profiles: ['candidate'],  schedulingCostMs: 7000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'cli-compatibility', name: 'CLI compatibility', executor: { type: 'node', file: 'tools/development/run-isolated-workspace-check.ts', args: ['--script', 'test/verification/cli/compatibility.ts'] }, profiles: ['candidate'], groups: ['cli'],  schedulingCostMs: 7000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'cli-package-parity', name: 'CLI package parity', executor: { type: 'node', file: 'test/verification/cli/package-parity.ts', consumesArtifact: true }, profiles: ['candidate'], groups: ['cli'],  dependsOn: ['candidate-tarball'], schedulingCostMs: 15000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'service-branch-contract', name: 'Service branch contract', executor: { type: 'node', file: 'test/verification/onboarding/service-branch.ts' }, profiles: ['candidate'],   schedulingCostMs: 3000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'remote-skill-timeout', name: 'remote Skill timeout contract', executor: { type: 'node', file: 'test/verification/network/remote-text.ts' }, profiles: ['candidate'],  concurrencyClass: 'network' }),
  step({ id: 'release-tarball-consumption', platformScope: platformScope('macos', 'windows'), platformEvidence: [...MACOS_PLATFORM_BOUNDARIES, ...WINDOWS_PLATFORM_BOUNDARIES].filter(item => item.stepId === 'release-tarball-consumption'), name: 'release metadata and real platform Launcher consumption', executor: { type: 'node', file: 'test/verification/release/release-consumption.ts', args: ['platform'], consumesArtifact: true }, profiles: ['candidate'], groups: ['release', 'windows-npm-preflight'], dependsOn: ['candidate-tarball'], schedulingCostMs: 25000, timeoutMs: 360_000, concurrencyClass: 'workspace-heavy' }),
  step({ id: 'managed-data-integrity', name: 'managed data integrity', executor: { type: 'node', file: 'test/verification/integrity/managed-data-integrity.ts' }, profiles: ['candidate'], groups: ['package'],  schedulingCostMs: 9000, concurrencyClass: 'workspace-heavy' }),

  step({ id: 'docs-quality', name: 'documentation quality', executor: { type: 'node', file: 'test/verification/docs/quality.ts' }, profiles: [],  concurrencyClass: 'default' }),
]);

/** Each service owns its actual test membership and commands. The project
 * composes those declarations with cross-service journeys and release consumers. */
const servicesRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const serviceSets: any[] = [
  ['buildr', buildrChecks], ['buildr-web', webChecks], ['buildr-agent', agentChecks], ['dsh-plugin', pluginChecks],
];
const serviceSteps = serviceSets.flatMap(([service, checks]) => checks.map((check: any) => {
  const root = path.join(servicesRoot, service);
  const input = (value: string) => service === 'buildr' || /^(?:\.github|skills|knowledge|openspec|services)\//u.test(value) ? value : `services/${service}/${value}`;
  const command = (value: any) => ({ ...value, cwd: path.resolve(root, value.cwd ?? '.') });
  const inherited = builtInVerificationSteps.find((step: any) => step.id === check.id);
  const footprints = ['Static', 'Unit'].includes(check.type) ? [] : ['filesystem', 'cli'];
  return Object.freeze({
    dependsOn: [], groups: [], profiles: inherited?.profiles ?? (service === 'dsh-plugin' ? [] : ['candidate']),
    contexts: [], resources: [], developmentRunners: [], platformScope: COMMON_PLATFORM_SCOPE,
    isolationMode: footprints.length ? 'sandbox' : 'none', resetStrategy: footprints.length ? 'recreate' : 'none',
    parallelSafety: 'worker-safe', concurrencyClass: 'cpu-heavy', resourceDemand: inherited?.resourceDemand ?? { workers: 1, processes: 1 },
    id: check.id, name: check.name, service, serviceRoot: root, serviceOwned: true, testFiles: check.testFiles ?? [], target: 'source',
    ...(check.selection ? { selection: check.selection } : {}),
    inputs: [...new Set([...(inherited?.inputs ?? []), ...(check.sourcePaths ?? ['src/**']).map(input), ...(check.testFiles ?? []).map(input), input('tools/testing/verification-checks.ts')])],
    inputExclusions: [...new Set([...(inherited?.inputExclusions ?? []), ...(check.inputExclusions ?? []).map(input)])],
    executor: { type: 'command', ...command(check.command), discoveredFiles: (check.testFiles ?? []).map((file: string) => path.relative(path.join(servicesRoot, 'buildr'), path.join(root, file)).replaceAll('\\', '/')) },
    preparations: (check.prepare ?? []).map(command), requirements: check.requirements ?? [],
    requiredEnvironment: check.requiredEnvironment ?? [], requiresFiles: (check.requiresFiles ?? []).map((file: string) => path.resolve(root, file)),
    platforms: check.platforms, timeoutMs: check.timeoutMs ?? 300_000,
    reuse: check.requiredEnvironment?.length ? false : check.reuse ?? inherited?.reuse
      ?? { scope: service === 'dsh-plugin' ? 'plugin' : service === 'buildr-web' ? 'web' : 'repository' },
    testing: { ownerScope: `service:product/${service}`, primaryIntent: 'Development', executionBoundary: check.type,
      proves: check.proves ?? check.name, primaryEvidenceOwner: check.id,
      environment: { footprints, isolation: footprints.length ? 'unique-temporary-root' : 'none' }, resetBurden: footprints.length ? 'single-cleanup' : 'none' },
    contextDisposition: verificationContextDisposition(check.id),
  });
}));
const replacedServiceIds = new Set([...serviceSteps.map((step: any) => step.id), ...serviceSets.flatMap(([, checks]) => checks.flatMap((check: any) => check.replaces ?? []))]);
const serviceReplacements = new Map<string, string[]>(serviceSets.flatMap(([, checks]) => checks.flatMap((check: any) => (check.replaces ?? []).map((id: string) => [id, [check.id]]))));
// Successful local observations are scheduling estimates, never admission thresholds.
const browserSchedulingCostMs: Record<string, number> = {"task": 181000, "code-explorer": 175000, "code": 228000};
const browserSteps = BROWSER_SELECTORS.map((selector: string) => Object.freeze({
  id: `e2e-browser:${selector}`, name: `Browser journey: ${selector}`, browserSelector: selector, target: 'source',
  dependsOn: [], groups: [], profiles: [], contexts: [], developmentRunners: [], platformScope: COMMON_PLATFORM_SCOPE,
  inputs: ['services/buildr-web/src/**', 'src/web/**', 'test/e2e/**'], inputExclusions: [],
  executor: { type: 'node', file: 'test/verification/browser-selector-dispatcher.ts', args: ['--selector', selector, '--run'], discoveredFiles: selector === 'core' ? ['test/e2e/buildr-web-browser.test.ts'] : [] },
  ...(browserSchedulingCostMs[selector] ? { schedulingCostMs: browserSchedulingCostMs[selector] } : {}),
  timeoutMs: selector === 'code' ? 1_300_000 : 600_000, concurrencyClass: 'workspace-heavy', resources: ['browser-runtime'],
  // Conversation workers acquire browser-runtime individually in the dispatcher.
  // The parent must not hold a slot while waiting for its own child workers.
  ...(selector === 'agent-conversations' ? { resourceClaims: [] } : {}),
  isolationMode: 'full-lifecycle', resetStrategy: 'recreate', parallelSafety: 'bounded',
  resourceDemand: selector === 'agent-conversations'
    ? { workers: 2, processes: 2, workspaceIo: 2 }
    : { workers: 1, processes: 1, workspaceIo: 1 },
  reuse: false,
  testing: { ownerScope: 'project:product', primaryIntent: 'Development', executionBoundary: 'E2E', primaryEvidenceOwner: `e2e-browser:${selector}`,
    proves: `The ${selector} user journey works through the real hosted frontend and backend.`,
    environment: { footprints: ['filesystem', 'cli', 'git', 'workspace-lifecycle'], isolation: 'unique-temporary-root' }, resetBurden: 'lifecycle' },
  contextDisposition: verificationContextDisposition(`e2e-browser:${selector}`),
}));
export const verificationSteps: any = Object.freeze([
  ...builtInVerificationSteps.filter((step: any) => !replacedServiceIds.has(step.id)).map((step: any) => Object.freeze({
    ...step, ...(step.id === 'spec-change-consistency' ? { requirements: ['Compares current source against explicit --base or the observed HEAD commit.'] } : {}), target: step.executor.consumesArtifact || step.executor.type === 'candidate-artifact' ? 'artifact' : 'source',
  })),
  ...serviceSteps, ...browserSteps,
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
  'e2e-workspace-assets',
  'integration-archify',
  'integration-task-records',
  'integration-connections',
  'integration-connections-cli',
  'integration-runtime-projection',
  'integration-declarations',
  'integration-openspec',
  'integration-runtime',
  'integration-release',
  'integration-data-store',
  'integration-self-bootstrap',
  'integration-task-read-models',
  'integration-task-coordination',
  'integration-verification-runtime',
  'integration-public-json',
  'integration-openspec-audit',
  'integration-web-http',
  'integration-application-payload-source',
  'application-payload-artifact',
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
    'e2e-workspace-assets',
    'integration-archify',
    'integration-task-records',
    'integration-declarations',
    'integration-openspec',
    'integration-data-store',
    'integration-task-read-models',
    'integration-task-coordination',
    'integration-verification-runtime',
    'integration-public-json',
    'integration-openspec-audit',
  ], { preparation: 'source-runtime' }),
  candidateShard('core-runtime-source-macos', 'macos', 'verification', [
    'integration-runtime',
    'integration-connections',
    'integration-connections-cli',
    'integration-runtime-projection',
    'integration-release',
    'integration-application-payload-source',
    'integration-web-http',
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
    'application-payload-artifact',
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

const declaredCandidateShards: any = [
  candidateShard('artifact-browser-macos', 'macos', 'verification', ['artifact-browser-core'], { requiresArtifact: true, preparation: 'browser-artifact' }),
  candidateShard('agent-service-macos', 'macos', 'verification', ['agent-service']),
  candidateShard('frontend-logic-macos', 'macos', 'verification', ['frontend-logic'], { preparation: 'frontend' }),
  candidateShard('preflight-macos', 'macos', 'preflight', [
    'typecheck',
    'unit',
    'source-contracts',
    'test-syntax',
    'test-typecheck',
    'runtime-adapter-contract',
    'managed-mutations',
    'test-file-ownership',
    'package-static',
    'integration-changed-paths',
    'integration-verification',
  ]),
  candidateShard('artifact-macos', 'macos', 'artifact', [
    'candidate-tarball',
  ], { producesArtifact: true, preparation: 'artifact' }),
  ...CORE_MACOS_SHARDS,
  candidateShard('release-infrastructure-macos', 'macos', 'verification', ['integration-candidate-release', 'integration-candidate-release-selection', 'integration-candidate-package-selection', 'integration-candidate-release-effects', 'integration-candidate-git-convergence', 'integration-candidate-git-selection'], { preparation: 'source-runtime' }),
  candidateShard('platform-boundaries-macos', 'macos', 'verification', ['integration-macos-native']),
  candidateShard('platform-boundaries-windows', 'windows', 'verification', ['integration-windows-native']),
  candidateShard('runtime-macos', 'macos', 'verification', ['release-tarball-consumption'], { requiresArtifact: true, preparation: 'consumer' }),
  candidateShard('runtime-windows', 'windows', 'verification', ['release-tarball-consumption'], { requiresArtifact: true, preparation: 'consumer' }),
  candidateShard('runtime-source-macos', 'macos', 'verification', ['e2e-runtime-recovery', 'e2e-app-process', 'runtime-adapter-parity'], { preparation: 'source-runtime' }),
  candidateShard('workspace-lifecycle-macos', 'macos', 'verification', ['e2e-workspace', 'workspace-lifecycle']),
  candidateShard('task-worktree-recovery-macos', 'macos', 'verification', ['e2e-task', 'e2e-worktree', 'e2e-nested-git']),
  candidateShard('task-concurrent-macos', 'macos', 'verification', ['concurrent-task-acceptance']),
];

export const CANDIDATE_CI_SHARDS: any = Object.freeze(declaredCandidateShards.map((shard: any) => {
  const existing = new Set(declaredCandidateShards.flatMap((item: any) => item.stepIds));
  const additions = serviceSteps.filter((step: any) => step.profiles.includes('candidate') && !existing.has(step.id)
    && (step.service === 'buildr-web' ? shard.id === 'frontend-logic-macos'
      : step.service === 'buildr-agent' ? shard.id === 'agent-service-macos' : shard.id === 'preflight-macos')).map((step: any) => step.id);
  return Object.freeze({ ...shard, stepIds: Object.freeze([...new Set([...shard.stepIds.flatMap((id: string) => serviceReplacements.get(id) ?? (verificationSteps.some((step: any) => step.id === id) ? [id] : [])), ...additions])]) });
}));

export const CANDIDATE_CI_PLATFORM_REPEATS: any = Object.freeze({
  'release-tarball-consumption': Object.freeze(['runtime-macos', 'runtime-windows']),
});

export const CANDIDATE_CI_HOST_NODE_TUPLES: any = Object.freeze([
  Object.freeze({ id: 'host-minimum-macos', runner: 'macos', requestedNode: '24.15.0', expectation: 'minimum' }),
  Object.freeze({ id: 'host-minimum-windows', runner: 'windows', requestedNode: '24.15.0', expectation: 'minimum' }),
]);

export const VERIFICATION_TEST_INTENTS: any = Object.freeze(['Development', 'Acceptance', 'Static Conformance', 'Delivery / Release']);
export const VERIFICATION_EXECUTION_BOUNDARIES: any = Object.freeze(['Static', 'Unit', 'Integration', 'E2E']);
export const VERIFICATION_PROFILES: any = Object.freeze(['candidate', 'host-node']);
export const VERIFICATION_GROUPS: any = Object.freeze(['public', 'cli', 'runtime', 'package', 'openspec', 'release', 'recovery', 'windows-npm-preflight']);
export const VERIFICATION_EXECUTORS: any = Object.freeze(['node', 'node-test', 'node-context-test', 'npm', 'openspec', 'package-selector', 'workspace-suite', 'candidate-artifact', 'command']);

export function verificationStepById(id: any): any  {
  return verificationSteps.find((item: any) => item.id === id);
}
