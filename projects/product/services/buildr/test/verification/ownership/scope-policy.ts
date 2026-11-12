const fullScopeAuthority: any = (pattern: any, code: any, explanation: any) => Object.freeze({ pattern, code, explanation });

export const VERIFICATION_FULL_SCOPE_AUTHORITIES: any = Object.freeze([
  fullScopeAuthority('.github/workflows/verify.yml', 'execution-graph-change', 'Candidate and development verification workflow topology changed.'),
  fullScopeAuthority('.node-version', 'execution-foundation-change', 'The retained Product development Node authority changed.'),
  fullScopeAuthority('preparation.yml', 'project-preparation-entry-change', 'Project preparation entry authority changed.'),
  fullScopeAuthority('verification.yml', 'verification-authority-change', 'Public verification capability authority changed.'),
  fullScopeAuthority('package.json', 'package-execution-metadata-change', 'non-version package metadata changes may affect scripts, dependencies, or execution semantics.'),
  fullScopeAuthority('package-lock.json', 'package-execution-metadata-change', 'non-version package metadata changes may affect locked dependencies or execution semantics.'),
  ...[
    'tsconfig.json', 'tsconfig.test-context.json', 'test-context.mjs',
    'src/infrastructure/testing/context-runtime/**', 'tools/build/**',
    'tools/codegen/contracts/**', 'tools/testing/test-context-build.ts', 'test/context/**',
  ].map((pattern: any) => fullScopeAuthority(pattern, 'execution-foundation-change', 'Shared TypeScript or Test Context execution foundation changed.')),
  ...[
    'test/verification/verify-buildr-product-ci', 'test/verification/candidate.ts',
    'test/verification/candidate-ci.ts', 'test/verification/candidate-ci-evidence.ts',
    'test/verification/candidate-repair.ts', 'test/verification/candidate-repair-cli.ts',
    'test/verification/verification-reuse.ts', 'test/verification/verification-inputs.ts',
    'test/verification/verification-source-inputs.ts',
    'test/verification/verification-input-discovery.ts', 'test/verification/platform-boundaries.ts',
    'test/verification/source.ts', 'test/verification/local-source-verification.ts',
    'test/verification/dag-scheduler.ts', 'test/verification/executor.ts',
    'test/verification/cli.ts', 'test/verification/development-aggregate.ts',
    'test/verification/plan-runner.ts',
    'test/verification/registry.ts', 'test/verification/resource-coordinator.ts',
    'test/verification/timing/parallel-runner.ts',
  ].map((pattern: any) => fullScopeAuthority(pattern, 'execution-graph-change', 'Verification execution graph, profile, scheduler, executor, or resource semantics changed.')),
  ...[
    'test/verification/changed-paths.ts', 'test/verification/planner.ts',
  ].map((pattern: any) => fullScopeAuthority(pattern, 'selection-authority-change', 'Affected and full selection authority changed.')),
  fullScopeAuthority('test/verification/ownership.ts', 'ownership-authority-change', 'Changed path ownership and full-scope authority changed.'),
  ...[
    'tools/development/resolve-development-node', 'tools/development/run-development-node',
    'tools/development/run-development-npm', 'tools/development/run-development-npm.ts',
  ].map((pattern: any) => fullScopeAuthority(pattern, 'runtime-authority-change', 'Development runtime invocation authority changed.')),
]);

export const VERIFICATION_FULL_SCOPE_INPUTS: any = Object.freeze(VERIFICATION_FULL_SCOPE_AUTHORITIES.map((item: any) => item.pattern));

/** Framework changes require their contract owners in ordinary related runs.
 * Explicit full/candidate requests retain the conservative full-scope policy. */
export function isVerificationFrameworkInput(file: string): boolean {
  return file.startsWith('test/verification/ownership/')
    || /^(?:services\/[^/]+\/)?tools\/testing\/verification-checks\.ts$/u.test(file)
    || ['test/verification/semantic-tags.ts', 'test/verification/source-diff.ts',
      'test/verification/browser-selector-dispatcher.ts', 'test/verification/browser-selector-catalog.ts',
      'test/verification/failed-groups.ts', 'test/verification/settle-diagnostics.mjs', 'test/verification/content-snapshot.ts'].includes(file)
    || VERIFICATION_FULL_SCOPE_AUTHORITIES.some((item: any) => item.pattern === file && item.pattern.startsWith('test/verification/'));
}
