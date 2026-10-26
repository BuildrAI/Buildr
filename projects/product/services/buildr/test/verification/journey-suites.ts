import {
  GIT_REPOSITORY_CONTEXT_KEY,
  PROJECT_FOUNDATION_CONTEXT_KEY,
  TASK_LIFECYCLE_CONTEXT_KEY,
  WORKSPACE_FOUNDATION_CONTEXT_KEY,
} from '../context/profiles.ts';

export const JOURNEY_SUITES: any = Object.freeze([
  Object.freeze({
    id: 'integration-changed-paths',
    name: 'changed-path selection regression',
    innerConcurrency: 1,
    schedulingCostMs: 5000,
    concurrencyClass: 'cpu-heavy',
    resources: Object.freeze([]),
    contexts: Object.freeze([TASK_LIFECYCLE_CONTEXT_KEY]),
    files: Object.freeze([
      'test/integration/verification-changed-paths.test.ts',
    ]),
  }),
  Object.freeze({
    id: 'integration-verification-runtime',
    name: 'verification orchestration contracts',
    innerConcurrency: 3,
    schedulingCostMs: 9000,
    concurrencyClass: 'cpu-heavy',
    resources: Object.freeze([]),
    files: Object.freeze([
      'test/integration/verification-resource-coordination.test.ts',
      'test/integration/verification-timing.test.ts',
      'test/integration/workspace-verification.test.ts',
    ]),
  }),
  Object.freeze({
    id: 'integration-public-json',
    name: 'public JSON contracts',
    innerConcurrency: 1,
    schedulingCostMs: 20000,
    concurrencyClass: 'cpu-heavy',
    resources: Object.freeze([]),
    files: Object.freeze([
      'test/integration/public-json-contracts.test.ts',
    ]),
  }),
  Object.freeze({
    id: 'integration-openspec-audit',
    name: 'OpenSpec contract audit',
    innerConcurrency: 1,
    schedulingCostMs: 4000,
    concurrencyClass: 'cpu-heavy',
    resources: Object.freeze([]),
    files: Object.freeze([
      'test/integration/openspec-contract-audit.test.ts',
    ]),
  }),
  Object.freeze({
    id: 'e2e-workspace',
    name: 'Workspace lifecycle',
    innerConcurrency: 2,
    schedulingCostMs: 145000,
    concurrencyClass: 'workspace-heavy',
    resources: Object.freeze(['workspace-saturating']),
    contexts: Object.freeze([
      WORKSPACE_FOUNDATION_CONTEXT_KEY,
      PROJECT_FOUNDATION_CONTEXT_KEY,
      GIT_REPOSITORY_CONTEXT_KEY,
    ]),
    files: Object.freeze([
      'test/e2e/package-capability-retirement.test.ts',
      'test/e2e/project-product.test.ts',
      'test/e2e/service-product.test.ts',
      'test/e2e/workspace-manifest-registry.test.ts',
    ]),
  }),
  Object.freeze({
    id: 'e2e-task',
    name: 'Task lifecycle',
    innerConcurrency: 2,
    schedulingCostMs: 16000,
    concurrencyClass: 'workspace-heavy',
    resources: Object.freeze(['workspace-saturating']),
    contexts: Object.freeze([TASK_LIFECYCLE_CONTEXT_KEY]),
    files: Object.freeze([
      'test/e2e/task-record-buildr-web.test.ts',
      'test/e2e/task-commits.test.ts',
      'test/e2e/task-record-product.test.ts',
      'test/e2e/task-review-product.test.ts',
      'test/e2e/task-verification-product.test.ts',
    ]),
  }),
  Object.freeze({
    id: 'e2e-worktree',
    name: 'Worktree lifecycle',
    innerConcurrency: 1,
    schedulingCostMs: 25000,
    concurrencyClass: 'workspace-heavy',
    resources: Object.freeze(['workspace-saturating']),
    contexts: Object.freeze([WORKSPACE_FOUNDATION_CONTEXT_KEY]),
    files: Object.freeze([
      'test/e2e/worktree-create.test.ts',
    ]),
  }),
  Object.freeze({
    id: 'e2e-nested-git',
    name: 'nested Git isolation lifecycle',
    innerConcurrency: 1,
    schedulingCostMs: 121000,
    // Its public lifecycle has a bounded nested process deadline. Do not
    // compete with other CLI-heavy owners while that deadline is running.
    concurrencyClass: 'exclusive',
    resources: Object.freeze(['workspace-saturating']),
    files: Object.freeze([
      'test/e2e/worktree-nested-git-isolation.test.ts',
    ]),
  }),
  Object.freeze({
    id: 'e2e-runtime-recovery',
    name: 'runtime recovery',
    innerConcurrency: 1,
    schedulingCostMs: 30000,
    concurrencyClass: 'workspace-heavy',
    resources: Object.freeze(['workspace-saturating']),
    files: Object.freeze([
      'test/e2e/cli-update.test.ts',
      'test/e2e/runtime-target-authority.test.ts',
      'test/e2e/web-update-flow.test.ts',
      'test/e2e/workspace-runtime-recovery.test.ts',
    ]),
  }),
  Object.freeze({
    id: 'integration-web-http',
    name: 'Buildr Web Runtime',
    innerConcurrency: 2,
    schedulingCostMs: 20000,
    concurrencyClass: 'workspace-heavy',
    resources: Object.freeze([]),
    contexts: Object.freeze([TASK_LIFECYCLE_CONTEXT_KEY]),
    files: Object.freeze([
      'test/integration/buildr-web-http.test.ts',
      'test/integration/task-professional-http-contract.test.ts',
      'test/integration/workspace-buildr-web-http.test.ts',
    ]),
  }),
  Object.freeze({
    id: 'e2e-app-process',
    name: 'Buildr Web process and preview',
    innerConcurrency: 2,
    schedulingCostMs: 25000,
    concurrencyClass: 'workspace-heavy',
    resources: Object.freeze(['workspace-saturating', 'app-runtime']),
    files: Object.freeze([
      'test/e2e/buildr-web-channel-isolation.test.ts',
      'test/e2e/buildr-web-launcher.test.ts',
      'test/e2e/buildr-web-restart.test.ts',
      'test/e2e/workspace-app-process.test.ts',
    ]),
  }),
]);

export function validateJourneySuiteRegistry(fileNames: any): any  {
  const owners: any = new Map();
  const findings: any[] = [];
  for (const suite of JOURNEY_SUITES) {
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
