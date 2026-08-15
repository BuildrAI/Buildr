export const SYSTEM_SUITES = Object.freeze([
  Object.freeze({
    id: 'system-verification-admission',
    name: 'System verification admission canary',
    innerConcurrency: 2,
    schedulingCostMs: 5000,
    concurrencyClass: 'cpu-heavy',
    resources: Object.freeze([]),
    files: Object.freeze([
      'test/system/verification-changed-paths.test.mjs',
      'test/system/verification-run-cli.test.mjs',
    ]),
  }),
  Object.freeze({
    id: 'system-verification-contracts',
    name: 'System verification contracts',
    innerConcurrency: 4,
    schedulingCostMs: 20000,
    concurrencyClass: 'cpu-heavy',
    resources: Object.freeze([]),
    files: Object.freeze([
      'test/system/openspec-contract-audit.test.mjs',
      'test/system/public-json-contracts.test.mjs',
      'test/system/verification-resource-coordination.test.mjs',
      'test/system/verification-timing.test.mjs',
      'test/system/workspace-verification.test.mjs',
    ]),
  }),
  Object.freeze({
    id: 'system-workspace-lifecycle',
    name: 'System Workspace lifecycle',
    innerConcurrency: 2,
    schedulingCostMs: 35000,
    concurrencyClass: 'workspace-heavy',
    resources: Object.freeze(['workspace-saturating']),
    files: Object.freeze([
      'test/system/package-capability-retirement.test.mjs',
      'test/system/project-product.test.mjs',
      'test/system/service-product.test.mjs',
      'test/system/task-development-generic-journey.test.mjs',
      'test/system/task-record-change-resolver.test.mjs',
      'test/system/task-record-local-app.test.mjs',
      'test/system/task-record-product.test.mjs',
      'test/system/task-review-product.test.mjs',
      'test/system/task-verification-product.test.mjs',
      'test/system/workspace-manifest-registry.test.mjs',
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
    id: 'system-local-app-http',
    name: 'System Buildr Web Runtime',
    innerConcurrency: 2,
    schedulingCostMs: 20000,
    concurrencyClass: 'workspace-heavy',
    resources: Object.freeze([]),
    files: Object.freeze([
      'test/system/local-app-http.test.mjs',
      'test/system/workspace-local-app-http.test.mjs',
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
      'test/system/local-app-launcher.test.mjs',
      'test/system/workspace-app-process.test.mjs',
    ]),
  }),
  Object.freeze({
    id: 'system-task-finish',
    name: 'System Task Finish',
    innerConcurrency: 1,
    schedulingCostMs: 30000,
    concurrencyClass: 'workspace-heavy',
    resources: Object.freeze(['workspace-saturating', 'task-lifecycle-heavy']),
    files: Object.freeze([
      'test/system/task-finish-cli.test.mjs',
      'test/system/task-finish-product-journey.test.mjs',
    ]),
  }),
  Object.freeze({
    id: 'system-fresh-build',
    name: 'System fresh build',
    innerConcurrency: 1,
    schedulingCostMs: 180000,
    concurrencyClass: 'exclusive',
    resources: Object.freeze(['workspace-saturating']),
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
    for (const file of suite.files) {
      if (owners.has(file)) findings.push({ code: 'duplicate_owner', file, owners: [owners.get(file), suite.id] });
      else owners.set(file, suite.id);
    }
  }
  for (const file of fileNames) if (!owners.has(file)) findings.push({ code: 'missing_owner', file });
  for (const file of owners.keys()) if (!fileNames.includes(file)) findings.push({ code: 'unknown_file', file, owner: owners.get(file) });
  return Object.freeze({ ok: findings.length === 0, findings: Object.freeze(findings), owners });
}
