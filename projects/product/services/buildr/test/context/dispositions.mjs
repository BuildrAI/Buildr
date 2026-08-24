const disposition = (mode, reasonCode, reason, owners) => owners.map((owner) => Object.freeze({
  owner,
  mode,
  reasonCode,
  reason,
}));

const entries = [
  ...disposition('context-runtime', 'runtime-owns-application-and-sandbox', 'The public Runtime owns reusable Application state and per-case sandbox isolation.', [
    'integration-task-development',
  ]),
  ...disposition('hybrid', 'immutable-seed-with-real-boundary', 'The owner reuses an immutable seed while retaining its real CLI, process, or Workspace boundary.', [
    'integration-runtime',
    'system-verification-admission',
    'system-task-lifecycle',
    'system-buildr-web-http',
  ]),
  ...disposition('hybrid', 'shared-application-with-real-sandbox', 'The owner reuses one Application assembly per Worker Host while retaining its real per-case filesystem, SQLite, CLI, or process sandbox.', [
    'integration-task-read-models',
    'integration-task-coordination',
    'integration-project-daily-progress',
    'integration-task-execution-records',
    'integration-task-environment',
    'integration-task-finish',
  ]),
  ...disposition('full-lifecycle', 'stateless-direct-evidence', 'The owner is a bounded static or stateless check and has no reusable mutable Context.', [
    'typecheck',
    'unit',
    'component',
    'contract',
    'cli-architecture',
    'openspec-spec-quality',
    'openspec-strict',
    'host-node-contract',
    'open-source-candidate',
    'openspec-candidate-audit',
    'managed-mutations',
    'package-static',
    'docs-quality',
  ]),
  ...disposition('full-lifecycle', 'isolated-boundary-owned-by-test', 'The owner intentionally creates isolated filesystem, Git, SQLite, network, or process state as its primary boundary.', [
    'integration',
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
    'service-branch-contract',
    'cli-compatibility',
  ]),
  ...disposition('full-lifecycle', 'lifecycle-is-primary-evidence', 'Initialization, mutation, recovery, Finish, cleanup, or concurrency is the primary evidence and cannot be replaced by a cached Context.', [
    'integration-self-bootstrap',
    'integration-task-finish-delivery',
    'system-verification-contracts',
    'system-public-json-contracts',
    'system-openspec-contract-audit',
    'system-workspace-lifecycle',
    'system-worktree-lifecycle',
    'system-runtime-recovery',
    'system-app-process',
    'system-task-finish',
    'system-task-finish-cli',
    'system-fresh-build',
    'system-windows-platform',
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
    'candidate-tarball',
    'application-payload-release',
    'npm-launcher-candidate',
    'host-node-cli-smoke',
    'package-workspace',
    'package-commands',
    'package-rules',
    'package-skills',
    'package-runtime',
    'runtime-skill-projection',
    'repository-onboarding',
    'cli-package-parity',
    'release-tarball-smoke',
  ]),
];

const duplicateOwners = entries.map((entry) => entry.owner).filter((owner, index, owners) => owners.indexOf(owner) !== index);
if (duplicateOwners.length > 0) throw new Error(`verification_context_disposition_duplicate: ${[...new Set(duplicateOwners)].join(', ')}`);

export const VERIFICATION_CONTEXT_DISPOSITIONS = Object.freeze(Object.fromEntries(entries.map((entry) => [entry.owner, entry])));

const goldenJourney = (owners, expectedMode, reusableBoundary, reason) => Object.freeze({
  owners: Object.freeze(owners),
  expectedMode,
  reusableBoundary,
  reason,
});

export const VERIFICATION_GOLDEN_CONTEXT_AUDIT = Object.freeze({
  initialization: goldenJourney(
    ['init-onboarding', 'system-workspace-lifecycle'],
    'full-lifecycle',
    'none',
    'Fresh initialization and registry creation are the observed behavior, so a prepared mutable Workspace would replace the evidence.',
  ),
  migration: goldenJourney(
    ['integration-data-store', 'system-runtime-recovery'],
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
  finishApplication: goldenJourney(
    ['integration-task-finish'],
    'hybrid',
    'application',
    'Finish Application core reuses the Application assembly while every case retains its own SQLite, filesystem, CLI, and failure sandbox.',
  ),
  finishDelivery: goldenJourney(
    ['integration-task-finish-delivery', 'system-task-finish', 'system-task-finish-cli'],
    'full-lifecycle',
    'none',
    'Delivery carrier construction, target transition, retained activation, public CLI, and cleanup are the primary evidence.',
  ),
  cleanup: goldenJourney(
    ['integration-task-finish-delivery', 'workspace-lifecycle', 'ownership-recovery'],
    'full-lifecycle',
    'none',
    'Cleanup must prove removal, retention, ownership, rollback, and repeatability against state created by the same case.',
  ),
  candidate: goldenJourney(
    ['integration-candidate-release', 'candidate-tarball'],
    'full-lifecycle',
    'artifact-only',
    'Candidate generation and the unique artifact are the observed outputs; an in-source Application Context cannot replace artifact construction.',
  ),
  tarball: goldenJourney(
    ['candidate-tarball', 'application-payload-release', 'release-tarball-smoke'],
    'full-lifecycle',
    'artifact-only',
    'Packing, offline installation, inventory, and execution from the unique tarball must operate on the real artifact.',
  ),
  launcher: goldenJourney(
    ['npm-launcher-candidate', 'host-node-cli-smoke'],
    'full-lifecycle',
    'none',
    'Launcher evidence requires independent processes, exact Host Node and package binding, ownership conflict, handoff, and shutdown behavior.',
  ),
});

export function verificationContextDisposition(owner) {
  const result = VERIFICATION_CONTEXT_DISPOSITIONS[owner];
  if (!result) throw new Error(`verification_context_disposition_missing: ${owner}`);
  return result;
}

export function assertVerificationContextDispositionCoverage(ownerIds) {
  const expected = [...new Set(ownerIds)].sort();
  const actual = Object.keys(VERIFICATION_CONTEXT_DISPOSITIONS).sort();
  const missing = expected.filter((owner) => !actual.includes(owner));
  const unknown = actual.filter((owner) => !expected.includes(owner));
  if (missing.length > 0 || unknown.length > 0) {
    throw new Error(`verification_context_disposition_coverage_invalid: missing=[${missing.join(', ')}] unknown=[${unknown.join(', ')}]`);
  }
  return Object.freeze({ status: 'covered', owners: expected.length });
}
