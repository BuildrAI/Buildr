import {
  GIT_REPOSITORY_CONTEXT_KEY,
  PROJECT_FOUNDATION_CONTEXT_KEY,
  TASK_LIFECYCLE_CONTEXT_KEY,
  WORKSPACE_FOUNDATION_CONTEXT_KEY,
} from '../context/profiles.ts';

export const SYSTEM_SUITES: any = Object.freeze([
  Object.freeze({
    id: 'system-verification-admission',
    name: 'System verification admission canary',
    innerConcurrency: 1,
    schedulingCostMs: 5000,
    concurrencyClass: 'cpu-heavy',
    resources: Object.freeze([]),
    contexts: Object.freeze([TASK_LIFECYCLE_CONTEXT_KEY]),
    files: Object.freeze([
      'test/system/verification-changed-paths.test.ts',
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
      'test/system/verification-resource-coordination.test.ts',
      'test/system/verification-timing.test.ts',
      'test/system/workspace-verification.test.ts',
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
      'test/system/public-json-contracts.test.ts',
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
      'test/system/openspec-contract-audit.test.ts',
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
      'test/system/package-capability-retirement.test.ts',
      'test/system/project-product.test.ts',
      'test/system/service-product.test.ts',
      'test/system/workspace-manifest-registry.test.ts',
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
      'test/system/task-record-buildr-web.test.ts',
      'test/system/task-record-product.test.ts',
      'test/system/task-review-product.test.ts',
      'test/system/task-verification-product.test.ts',
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
      'test/system/worktree-create.test.ts',
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
      'test/system/cli-update.test.ts',
      'test/system/runtime-target-authority.test.ts',
      'test/system/workspace-runtime-recovery.test.ts',
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
      'test/system/buildr-web-http.test.ts',
      'test/system/task-professional-http-contract.test.ts',
      'test/system/workspace-buildr-web-http.test.ts',
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
      'test/system/development-workspace-smoke-isolation.test.ts',
      'test/system/buildr-web-channel-isolation.test.ts',
      'test/system/buildr-web-launcher.test.ts',
      'test/system/workspace-app-process.test.ts',
    ]),
  }),
]);

export function validateSystemSuiteRegistry(fileNames: any): any  {
  const owners: any = new Map();
  const findings: any[] = [];
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
