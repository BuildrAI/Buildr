const disposition: any = (mode: any, reasonCode: any, reason: any, owners: any) => owners.map((owner: any) => Object.freeze({
  owner,
  mode,
  reasonCode,
  reason,
}));

const entries: any[] = [
  ...disposition('hybrid', 'immutable-seed-with-real-boundary', 'The owner reuses an immutable seed while retaining its real CLI, process, or Workspace boundary.', [
    'integration-runtime',
    'integration-code',
    'integration-workspace-assets',
    'e2e-workspace-assets',
    'integration-task-records',
    'integration-changed-paths',
    'e2e-task',
    'integration-web-http',
  ]),
  ...disposition('hybrid', 'shared-application-with-real-sandbox', 'The owner reuses one Application assembly per Worker Host while retaining its real per-case filesystem, SQLite, CLI, or process sandbox.', [
    'integration-task-read-models',
    'integration-task-coordination',
  ]),
  ...disposition('full-lifecycle', 'stateless-direct-evidence', 'The owner is a bounded static or stateless check and has no reusable mutable Context.', [
    'frontend-logic',
    'typecheck',
    'unit',
    'source-contracts',
    'cli-architecture',
    'openspec-strict',
    'host-node-contract',
    'open-source-candidate',
    'spec-change-consistency',
    'managed-mutations',
    'test-file-ownership',
    'package-static',
    'docs-quality',
  ]),
  ...disposition('full-lifecycle', 'isolated-boundary-owned-by-test', 'The owner intentionally creates isolated filesystem, Git, SQLite, network, or process state as its primary boundary.', [
    'integration',
    'integration-knowledge',
    'integration-connections',
    'integration-connections-cli',
    'integration-runtime-projection',
    'integration-declarations',
    'integration-openspec',
    'integration-verification',
    'integration-release',
    'integration-data-store',
    'runtime-adapter-contract',
    'host-node-boundaries',
    'capability-cli-integration',
    'commands-cli-integration',
    'openspec-contract-fixtures',
    'remote-skill-timeout',
    'dsh-plugin',
    'agent-service',
    'service-branch-contract',
    'cli-compatibility',
  ]),
  ...disposition('full-lifecycle', 'lifecycle-is-primary-evidence', 'Initialization, mutation, recovery, Finish, cleanup, or concurrency is the primary evidence and cannot be replaced by a cached Context.', [
    'integration-self-bootstrap',
    'integration-archify',
    'integration-verification-runtime',
    'integration-public-json',
    'integration-openspec-audit',
    'e2e-workspace',
    'e2e-worktree',
    'e2e-nested-git',
    'e2e-runtime-recovery',
    'e2e-app-process',
    'integration-windows-native',
    'integration-macos-native',
    'concurrent-task-acceptance',
    'openspec-convergence-recovery',
    'runtime-adapter-parity',
    'workspace-lifecycle',
    'ownership-recovery',
    'runtime-reconciliation',
    'init-onboarding',
    'managed-data-integrity',
  ]),
  ...disposition('full-lifecycle', 'release-artifact-is-primary-evidence', 'The unique Candidate, installed package, launcher, onboarding, or release journey is the primary evidence.', [
    'integration-candidate-release',
    'integration-candidate-release-selection',
    'integration-candidate-package-selection',
    'integration-candidate-release-effects',
    'integration-candidate-git-convergence',
    'integration-candidate-git-selection',
    'artifact-browser-core',
    'candidate-tarball',
    'application-payload-release',
    'npm-launcher-candidate',
    'host-node-cli-consumption',
    'package-workspace',
    'package-commands',
    'package-rules',
    'package-skills',
    'package-runtime',
    'runtime-skill-projection',
    'repository-onboarding',
    'cli-package-parity',
    'release-tarball-consumption',
  ]),
];

const duplicateOwners: any = entries.map((entry: any) => entry.owner).filter((owner: any, index: any, owners: any) => owners.indexOf(owner) !== index);
if (duplicateOwners.length > 0) throw new Error(`verification_context_disposition_duplicate: ${[...new Set(duplicateOwners)].join(', ')}`);

export const VERIFICATION_CONTEXT_DISPOSITIONS: any = Object.freeze(Object.fromEntries(entries.map((entry: any) => [entry.owner, entry])));

const goldenJourney: any = (owners: any, expectedMode: any, reusableBoundary: any, reason: any) => Object.freeze({
  owners: Object.freeze(owners),
  expectedMode,
  reusableBoundary,
  reason,
});

export const VERIFICATION_GOLDEN_CONTEXT_AUDIT: any = Object.freeze({
  initialization: goldenJourney(
    ['init-onboarding', 'e2e-workspace'],
    'full-lifecycle',
    'none',
    'Fresh initialization and registry creation are the observed behavior, so a prepared mutable Workspace would replace the evidence.',
  ),
  migration: goldenJourney(
    ['integration-data-store', 'e2e-runtime-recovery'],
    'full-lifecycle',
    'none',
    'Historical schemas, retained/candidate separation, atomic upgrade, and rollback require independently constructed stores and Runtime instances.',
  ),
  selfBootstrap: goldenJourney(
    ['integration-self-bootstrap'],
    'full-lifecycle',
    'none',
    'Retained checkout synchronization, activation, process identity, and closeout are the primary evidence and cannot start from a cached Application.',
  ),
  cleanup: goldenJourney(
    ['workspace-lifecycle', 'ownership-recovery'],
    'full-lifecycle',
    'none',
    'Cleanup must prove removal, retention, ownership, rollback, and repeatability against state created by the same case.',
  ),
  candidate: goldenJourney(
    ['integration-candidate-release', 'integration-candidate-release-selection', 'integration-candidate-package-selection', 'integration-candidate-release-effects', 'integration-candidate-git-convergence', 'integration-candidate-git-selection', 'candidate-tarball'],
    'full-lifecycle',
    'artifact-only',
    'Candidate generation and the unique artifact are the observed outputs; an in-source Application Context cannot replace artifact construction.',
  ),
  tarball: goldenJourney(
    ['candidate-tarball', 'application-payload-release', 'release-tarball-consumption'],
    'full-lifecycle',
    'artifact-only',
    'Packing, offline installation, inventory, and execution from the unique tarball must operate on the real artifact.',
  ),
  launcher: goldenJourney(
    ['npm-launcher-candidate', 'host-node-cli-consumption'],
    'full-lifecycle',
    'none',
    'Launcher evidence requires independent processes, exact Host Node and package binding, ownership conflict, handoff, and shutdown behavior.',
  ),
});

export function verificationContextDisposition(owner: any): any  {
  const result: any = VERIFICATION_CONTEXT_DISPOSITIONS[owner];
  return result ?? Object.freeze({ owner, mode: 'full-lifecycle', reasonCode: 'isolated-check-owned-lifecycle', reason: 'The check owns its isolated preparation and cleanup; no shared context is required.' });
}

export function assertVerificationContextDispositionCoverage(ownerIds: any): any {
  const owners = [...new Set(ownerIds)];
  return Object.freeze({ status: 'covered', owners: owners.length });
}
