import {
  GIT_REPOSITORY_CONTEXT_KEY,
  PROJECT_FOUNDATION_CONTEXT_KEY,
  TASK_LIFECYCLE_CONTEXT_KEY,
  WORKSPACE_FOUNDATION_CONTEXT_KEY,
} from '../context/profiles.mjs';

export const SYSTEM_SUITES = Object.freeze([
  Object.freeze({
    id: 'system-verification-admission',
    name: 'System verification admission canary',
    innerConcurrency: 2,
    schedulingCostMs: 5000,
    concurrencyClass: 'cpu-heavy',
    resources: Object.freeze([]),
    contexts: Object.freeze([TASK_LIFECYCLE_CONTEXT_KEY]),
    files: Object.freeze([
      'test/system/verification-changed-paths.test.mjs',
      'test/system/product-verification-provider-cli.test.mjs',
      'test/system/verification-run-cli.test.mjs',
    ]),
  }),
  Object.freeze({
    id: 'system-verification-contracts',
    name: 'System verification orchestration contracts',
    innerConcurrency: 3,
    schedulingCostMs: 9000,
    concurrencyClass: 'cpu-heavy',
    resources: Object.freeze([]),
    files: Object.freeze([
      'test/system/verification-resource-coordination.test.mjs',
      'test/system/verification-timing.test.mjs',
      'test/system/workspace-verification.test.mjs',
    ]),
  }),
  Object.freeze({
    id: 'system-public-json-contracts',
    name: 'System public JSON contracts',
    innerConcurrency: 1,
    schedulingCostMs: 20000,
    concurrencyClass: 'cpu-heavy',
    resources: Object.freeze([]),
    files: Object.freeze([
      'test/system/public-json-contracts.test.mjs',
    ]),
  }),
  Object.freeze({
    id: 'system-openspec-contract-audit',
    name: 'System OpenSpec contract audit',
    innerConcurrency: 1,
    schedulingCostMs: 4000,
    concurrencyClass: 'cpu-heavy',
    resources: Object.freeze([]),
    files: Object.freeze([
      'test/system/openspec-contract-audit.test.mjs',
    ]),
  }),
  Object.freeze({
    id: 'system-workspace-lifecycle',
    name: 'System Workspace lifecycle',
    innerConcurrency: 2,
    schedulingCostMs: 45000,
    concurrencyClass: 'workspace-heavy',
    resources: Object.freeze(['workspace-saturating']),
    contexts: Object.freeze([
      WORKSPACE_FOUNDATION_CONTEXT_KEY,
      PROJECT_FOUNDATION_CONTEXT_KEY,
      GIT_REPOSITORY_CONTEXT_KEY,
    ]),
    files: Object.freeze([
      'test/system/package-capability-retirement.test.mjs',
      'test/system/project-product.test.mjs',
      'test/system/service-product.test.mjs',
      'test/system/workspace-manifest-registry.test.mjs',
    ]),
  }),
  Object.freeze({
    id: 'system-task-lifecycle',
    name: 'System Task lifecycle',
    innerConcurrency: 2,
    schedulingCostMs: 16000,
    concurrencyClass: 'workspace-heavy',
    resources: Object.freeze(['workspace-saturating']),
    contexts: Object.freeze([TASK_LIFECYCLE_CONTEXT_KEY]),
    files: Object.freeze([
      'test/system/task-development-generic-journey.test.mjs',
      'test/system/task-record-change-resolver.test.mjs',
      'test/system/task-record-buildr-web.test.mjs',
      'test/system/task-record-product.test.mjs',
      'test/system/task-review-product.test.mjs',
      'test/system/task-verification-product.test.mjs',
    ]),
  }),
  Object.freeze({
    id: 'system-worktree-lifecycle',
    name: 'System Worktree lifecycle',
    innerConcurrency: 1,
    schedulingCostMs: 25000,
    concurrencyClass: 'workspace-heavy',
    resources: Object.freeze(['workspace-saturating']),
    files: Object.freeze([
      'test/system/worktree-create.test.mjs',
    ]),
  }),
  Object.freeze({
    id: 'system-runtime-recovery',
    name: 'System runtime recovery',
    innerConcurrency: 1,
    schedulingCostMs: 30000,
    concurrencyClass: 'workspace-heavy',
    resources: Object.freeze(['workspace-saturating']),
    files: Object.freeze([
      'test/system/cli-update.test.mjs',
      'test/system/runtime-target-authority.test.mjs',
      'test/system/workspace-runtime-recovery.test.mjs',
    ]),
  }),
  Object.freeze({
    id: 'system-buildr-web-http',
    name: 'System Buildr Web Runtime',
    innerConcurrency: 2,
    schedulingCostMs: 20000,
    concurrencyClass: 'workspace-heavy',
    resources: Object.freeze([]),
    contexts: Object.freeze([TASK_LIFECYCLE_CONTEXT_KEY]),
    files: Object.freeze([
      'test/system/buildr-web-http.test.mjs',
      'test/system/task-professional-http-contract.test.mjs',
      'test/system/workspace-buildr-web-http.test.mjs',
    ]),
  }),
  Object.freeze({
    id: 'system-app-process',
    name: 'System Buildr Web process and preview',
    innerConcurrency: 2,
    schedulingCostMs: 25000,
    concurrencyClass: 'workspace-heavy',
    resources: Object.freeze(['app-runtime']),
    files: Object.freeze([
      'test/system/development-workspace-smoke-isolation.test.mjs',
      'test/system/buildr-web-channel-isolation.test.mjs',
      'test/system/buildr-web-launcher.test.mjs',
      'test/system/workspace-app-process.test.mjs',
    ]),
  }),
  Object.freeze({
    id: 'system-task-finish-cli',
    name: 'System Task Finish CLI journey',
    innerConcurrency: 1,
    schedulingCostMs: 8000,
    concurrencyClass: 'workspace-heavy',
    resources: Object.freeze(['workspace-saturating', 'task-lifecycle-heavy']),
    files: Object.freeze([
      'test/system/task-finish-cli.test.mjs',
    ]),
  }),
  Object.freeze({
    id: 'system-fresh-build',
    name: 'System fresh build',
    innerConcurrency: 1,
    schedulingCostMs: 25000,
    concurrencyClass: 'workspace-heavy',
    resources: Object.freeze(['workspace-saturating', 'task-lifecycle-heavy']),
    files: Object.freeze([
      'test/system/task-environment-fresh-build-web.test.mjs',
    ]),
  }),
]);

export function validateSystemSuiteRegistry(fileNames) {
  const owners = new Map();
  const findings = [];
  for (const suite of SYSTEM_SUITES) {
    if (!Number.isInteger(suite.innerConcurrency) || suite.innerConcurrency < 1) findings.push({ code: 'invalid_inner_concurrency', owner: suite.id });
    if (suite.contexts != null && (!Array.isArray(suite.contexts) || new Set(suite.contexts).size !== suite.contexts.length)) findings.push({ code: 'invalid_contexts', owner: suite.id });
    for (const file of suite.files) {
      if (owners.has(file)) findings.push({ code: 'duplicate_owner', file, owners: [owners.get(file), suite.id] });
      else owners.set(file, suite.id);
    }
  }
  for (const file of fileNames) if (!owners.has(file)) findings.push({ code: 'missing_owner', file });
  for (const file of owners.keys()) if (!fileNames.includes(file)) findings.push({ code: 'unknown_file', file, owner: owners.get(file) });
  return Object.freeze({ ok: findings.length === 0, findings: Object.freeze(findings), owners });
}
