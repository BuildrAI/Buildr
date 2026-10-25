import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { inspectTaskLifecycleSystemContext } from '../helpers/task-lifecycle-system-context.ts';
import {
  assertVerificationContextDispositionCoverage,
  VERIFICATION_CONTEXT_DISPOSITIONS,
  VERIFICATION_GOLDEN_CONTEXT_AUDIT,
} from '../context/dispositions.ts';
import { verificationSteps } from '../verification/registry.ts';
import { createVerificationPlan } from '../verification/planner.ts';
import { JOURNEY_SUITES, validateJourneySuiteRegistry } from '../verification/journey-suites.ts';

const productRoot: any = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const contractRoot: any = path.join(productRoot, 'test', 'static');
const forbiddenNodeBoundaries: any = new Set([
  'child_process', 'cluster', 'dgram', 'fs', 'http', 'http2', 'https', 'net', 'tls', 'worker_threads',
]);
const taskLifecycleContextConsumers: any[] = [
  'task-review-product.test.ts',
  'task-verification-product.test.ts',
];
const taskRecordContextConsumers: any[] = [
  'task-record-product.test.ts',
  'task-record-buildr-web.test.ts',
];
const fullIsolationOwners: any[] = [
  'test/e2e/project-product.test.ts',
  'test/integration/public-json-contracts.test.ts',
  'test/e2e/service-product.test.ts',
  'test/e2e/workspace-manifest-registry.test.ts',
  'test/e2e/worktree-create.test.ts',
  'test/e2e/worktree-nested-git-isolation.test.ts',
];

function directBoundaryImports(layer: any): any  {
  const directory: any = path.join(productRoot, 'test', layer);
  const violations: any[] = [];
  for (const file of fs.readdirSync(directory).filter((entry: any) => entry.endsWith('.test.ts')).sort()) {
    const source: any = fs.readFileSync(path.join(directory, file), 'utf8');
    for (const match of source.matchAll(/(?:from\s+|import\s*\(\s*)['"]node:([^/'"]+)/g)) {
      if (forbiddenNodeBoundaries.has(match[1])) violations.push(`${layer}/${file}: node:${match[1]}`);
    }
  }
  return violations;
}

test('Windows shared-file selection retains exactly one real Git path case', () => {
  const step = verificationSteps.find((item: any) => item.id === 'integration-windows-native');
  const argument = step.executor.args.find((item: string) => item.startsWith('--test-name-pattern='));
  const pattern = new RegExp(argument.slice('--test-name-pattern='.length));
  for (const [file, expected] of [['test/e2e/worktree-create.test.ts', 1], ['test/integration/windows-boundaries.test.ts', 4]] as const) {
    const source = fs.readFileSync(path.join(productRoot, file), 'utf8');
    const names = [...source.matchAll(/\btest\('([^']+)'/gu)].map(match => match[1]!);
    assert.equal(names.filter(name => pattern.test(name)).length, expected, file);
  }
});

test('each selected check has an explicit or safe isolated context policy', () => {
  for (const step of verificationSteps) {
    assert.match(step.contextDisposition.mode, /^(?:context-runtime|hybrid|full-lifecycle)$/u);
    assert.ok(step.contextDisposition.reason.trim().length > 0, step.id);
  }
});

test('context-runtime owner的Runtime组装必须来自统一adapter', () => {
  for (const step of verificationSteps.filter((candidate: any) => candidate.contextDisposition.mode === 'context-runtime')) {
    assert.equal(step.executor.type, 'node-context-test', `${step.id} must run in persistent Context Worker Hosts`);
    const files: any = step.executor.files ?? [];
    const sources: any = files.map((file: any) => [file, fs.readFileSync(path.join(productRoot, file), 'utf8')]);
    assert.ok(sources.some(([, source]: any) => /buildr-node-test\.ts/u.test(source)), `${step.id} must contain a unified adapter consumer`);
    for (const [file, source] of sources) {
      assert.doesNotMatch(source, /\bcreateRuntime\s*\(/u, `${step.id}/${file} must lease the matching Application instead of assembling another Runtime`);
    }
  }
});

test('初始化、迁移、自举、cleanup、Candidate、tarball与Launcher保持审查后的Context边界', () => {
  assert.deepEqual(Object.keys(VERIFICATION_GOLDEN_CONTEXT_AUDIT), [
    'initialization', 'migration', 'selfBootstrap', 'cleanup', 'candidate', 'tarball', 'launcher',
  ]);
  const byId: any = new Map(verificationSteps.map((step: any) => [step.id, step]));
  for (const [journey, audit] of Object.entries(VERIFICATION_GOLDEN_CONTEXT_AUDIT as Record<string, { reason: string; reusableBoundary: string; owners: string[]; expectedMode: string }>)) {
    assert.ok(audit.reason.trim().length > 0, journey);
    assert.match(audit.reusableBoundary, /^(?:none|application|artifact-only)$/u, journey);
    for (const owner of audit.owners) {
      assert.ok(byId.has(owner), `${journey} references unknown owner ${owner}`);
      assert.equal(byId.get(owner).contextDisposition.mode, audit.expectedMode, `${journey}/${owner}`);
    }
  }
});

test('Candidate 的网络协议仅使用本机回环 fixture', () => {
  const candidate: any = verificationSteps.filter((step: any) => step.profiles.includes('candidate'));
  for (const step of candidate) {
    assert.equal(step.testing.environment.footprints.includes('network'), false, step.id);
  }
  const remoteSkill: any = verificationSteps.find((step: any) => step.id === 'remote-skill-timeout');
  assert.deepEqual(remoteSkill.testing.environment.footprints, ['loopback-network']);
  const source: any = fs.readFileSync(path.join(productRoot, remoteSkill.executor.file), 'utf8');
  assert.match(source, /http:\/\/127\.0\.0\.1:/);
});

test('Task lifecycle context 只共享不可变基线并保留全生命周期测试的独立 owner', () => {
  const helper: any = fs.readFileSync(path.join(productRoot, 'test', 'helpers', 'task-lifecycle-system-context.ts'), 'utf8');
  const contextRuntime: any = fs.readFileSync(path.join(productRoot, 'test', 'context', 'runtime.ts'), 'utf8');
  const provider: any = fs.readFileSync(path.join(productRoot, 'test', 'context', 'providers', 'task-lifecycle.ts'), 'utf8');
  const runner: any = fs.readFileSync(path.join(productRoot, 'test', 'verification', 'journeys.ts'), 'utf8');
  assert.match(helper, /TASK_LIFECYCLE_CONTEXT_ID(?:: any)? = TASK_LIFECYCLE_CONTEXT_KEY/);
  assert.match(helper, /defaultTestContextPool/, 'direct files and inherited runners must use the same Pool contract');
  assert.match(contextRuntime, /fs\.cpSync\(context\.seedRoot, sandboxRoot, \{ recursive: true \}\)/, 'test cases must receive copied sandboxes');
  assert.match(contextRuntime, /actualIdentity !== marker\.identity/, 'shared baseline must be identity checked');
  assert.match(contextRuntime, /test_context_sandbox_alias/);
  assert.match(provider, /runtime\.initBuildr/);
  assert.match(provider, /runtime\.createProject/);
  assert.match(provider, /runtime\.createService/);
  assert.doesNotMatch(helper, /spawnSync/, 'fixture-only setup must not pay public CLI cold starts');
  assert.match(runner, /createTestContextPool/);
  assert.match(runner, /selectedSuites\.flatMap\(\(suite(?:: any)?\) => suite\.contexts/);
  assert.match(runner, /\[TASK_LIFECYCLE_CONTEXT_ENV\]: taskContext\.contextRoot/);
  assert.match(runner, /finally \{[\s\S]*contextPool\.cleanup\(\)/);
  assert.match(runner, /--test-reporter=dot/, 'successful System output must stay compact while dot reporter retains failure details');
  assert.match(runner, /--test-reporter-destination=stdout/);
  assert.match(runner, /system-file-timing-reporter\.ts/);
  assert.match(runner, /--test-reporter-destination=stderr/,
    'file timing must remain transient process diagnostics instead of portable Verification Result data');
  assert.match(runner, /validateJourneySuiteRegistry\(discovered\)/,
    'each Journey validates missing or duplicate declared members');
  const inventoryOwner = verificationSteps.find((step: any) => step.id === 'test-file-ownership');
  assert.equal(inventoryOwner.testing.executionBoundary, 'Static');
  const inventoryRunner = fs.readFileSync(path.join(productRoot, inventoryOwner.executor.file), 'utf8');
  assert.match(inventoryRunner, /auditProjectTestOwnership\(productRoot\)/,
    'the single Static owner audits every Service inventory');
  for (const file of ['test/e2e/new-unregistered.test.ts', 'test/integration/new-platform-boundaries.test.ts']) {
    const related = createVerificationPlan({ paths: [file] });
    assert.ok(related.steps.some((step: any) => step.id === inventoryOwner.id),
      `${file}: every new test, including a native boundary, selects the inventory audit`);
  }
  assert.match(runner, /--owner/,
    'Candidate must be able to schedule one bounded System owner');
  for (const owner of [
    'integration-changed-paths', 'integration-verification-runtime', 'integration-public-json', 'integration-openspec-audit',
    'e2e-workspace', 'e2e-task', 'e2e-worktree', 'e2e-nested-git', 'e2e-runtime-recovery',
    'integration-web-http', 'e2e-app-process',
  ]) {
    assert.ok(JOURNEY_SUITES.some((suite: any) => suite.id === owner), `missing System owner ${owner}`);
  }
  assert.equal(JOURNEY_SUITES.find((suite: any) => suite.id === 'e2e-runtime-recovery')?.innerConcurrency, 1);
  assert.deepEqual(JOURNEY_SUITES.find((suite: any) => suite.id === 'integration-verification-runtime')?.contexts ?? [], [], 'unrelated System owners must not pay Task Context setup');
  assert.deepEqual(JOURNEY_SUITES.find((suite: any) => suite.id === 'e2e-task')?.contexts, ['task-lifecycle/v1']);
  for (const file of taskLifecycleContextConsumers) {
    const source: any = fs.readFileSync(path.join(productRoot, 'test', 'e2e', file), 'utf8');
    assert.match(source, /copyTaskLifecycleWorkspace/, `${file} must consume the shared immutable context through its helper`);
  }
  const taskRecordFixture: any = fs.readFileSync(path.join(productRoot, 'test', 'helpers', 'task-record-system-fixture.ts'), 'utf8');
  assert.match(taskRecordFixture, /copyTaskLifecycleWorkspace/, 'split Task Record owners must share one fixture helper');
  for (const file of taskRecordContextConsumers) {
    const source: any = fs.readFileSync(path.join(productRoot, 'test', 'e2e', file), 'utf8');
    assert.match(source, /task-record-system-fixture\.ts/, `${file} must not duplicate Task Record baseline setup`);
  }
  for (const file of fullIsolationOwners) {
    const source: any = fs.readFileSync(path.join(productRoot, file), 'utf8');
    assert.doesNotMatch(source, /copyTaskLifecycleWorkspace/, `${file} validates initialization or a full lifecycle and must remain isolated`);
  }

  assert.throws(
    () => inspectTaskLifecycleSystemContext(path.join(productRoot, 'test', '.missing-task-lifecycle-context')),
    (error: any) => error.code === 'test_context_root_invalid',
    'a missing suite context must fail with a stable context diagnostic',
  );
});

test('Prepared Fixture Provider只替代非主证据准备并保持独立sandbox', () => {
  const profiles: any = fs.readFileSync(path.join(productRoot, 'test', 'context', 'profiles.ts'), 'utf8');
  const provider: any = fs.readFileSync(path.join(productRoot, 'test', 'context', 'providers', 'prepared-fixtures.ts'), 'utf8');
  const helper: any = fs.readFileSync(path.join(productRoot, 'test', 'helpers', 'prepared-fixtures.ts'), 'utf8');
  const suites: any = fs.readFileSync(path.join(productRoot, 'test', 'verification', 'journey-suites.ts'), 'utf8');
  const project: any = fs.readFileSync(path.join(productRoot, 'test', 'e2e', 'project-product.test.ts'), 'utf8');
  const service: any = fs.readFileSync(path.join(productRoot, 'test', 'e2e', 'service-product.test.ts'), 'utf8');
  const workspace: any = fs.readFileSync(path.join(productRoot, 'test', 'helpers', 'workspace-product-suite.ts'), 'utf8');
  const retirement: any = fs.readFileSync(path.join(productRoot, 'test', 'e2e', 'package-capability-retirement.test.ts'), 'utf8');

  for (const key of ['workspace-foundation/v1', 'project-foundation/v1', 'git-repository/v1']) assert.match(profiles, new RegExp(key.replace('/', '\\/')));
  assert.match(provider, /runtime\.initBuildr/);
  assert.match(provider, /runtime\.createProject/);
  assert.match(provider, /git\.clone-bare/);
  assert.match(provider, /fs\.cpSync\(context\.seedRoot, sandboxRoot/);
  assert.match(helper, /defaultTestContextPool\(\)\.acquire/);
  assert.match(suites, /id: 'e2e-workspace'[\s\S]*WORKSPACE_FOUNDATION_CONTEXT_KEY[\s\S]*PROJECT_FOUNDATION_CONTEXT_KEY[\s\S]*GIT_REPOSITORY_CONTEXT_KEY/);
  assert.match(project, /copyPreparedWorkspace/);
  assert.match(project, /copyPreparedGitRepository/);
  assert.doesNotMatch(project, /runBuildr\(\['init'/);
  assert.match(service, /copyPreparedLegacyProjectWorkspace/);
  assert.match(service, /copyPreparedGitRepository/);
  assert.doesNotMatch(service, /runBuildr\(\['init'/);
  assert.match(workspace, /selectedSuite === 'manifest-registry' && !options\.freshIdentity/,
    'manifest cases may reuse a foundation, while identity evidence requests a fresh Workspace');
  assert.match(retirement, /copyPreparedWorkspace/);
  assert.match(helper, /function copyPreparedWorkspace[\s\S]*foundation\(acquire\(t, WORKSPACE_FOUNDATION_CONTEXT_KEY/);
  assert.match(helper, /function copyPreparedLegacyWorkspace/);
  assert.match(helper, /function copyPreparedLegacyProjectWorkspace/);
  assert.match(helper, /useLegacyAssetCatalog/);

});

test('公共Node Test Context Runtime与Buildr provider保持独立authority', () => {
  const packageMetadata: any = JSON.parse(fs.readFileSync(path.join(productRoot, 'package.json'), 'utf8'));
  assert.deepEqual(packageMetadata.exports['./test-context'], {
    types: './build/test-context/public.d.ts',
    import: './build/test-context/public.js',
    default: './build/test-context/public.js',
  });
  const runtimeRoot: any = path.join(productRoot, 'src/infrastructure/testing/context-runtime');
  const publicSource: any = fs.readdirSync(runtimeRoot).filter((name: any) => name.endsWith('.ts'))
    .map((name: any) => fs.readFileSync(path.join(runtimeRoot, name), 'utf8')).join('\n');
  assert.match(publicSource, /defineTestContext/);
  assert.match(publicSource, /test-isolation=none/);
  assert.doesNotMatch(publicSource, /src\/bootstrap|task-lifecycle|BUILDR_TEST_CONTEXTS|createRuntime\(/,
    'public Runtime must not depend on Buildr Workspace or Application assembly');
  const provider: any = fs.readFileSync(path.join(productRoot, 'test/context/providers/task-application.ts'), 'utf8');
  assert.match(provider, /buildrTaskApplicationContext(?:: any)? = defineTestContext/);
  assert.match(provider, /buildrTaskWorkspaceContext(?:: any)? = defineTestContext/);
  assert.match(provider, /parallelSafety: 'exclusive'/);
  assert.match(provider, /parallelSafety: 'isolated'/);
  const taskTests: any = fs.readFileSync(path.join(productRoot, 'test/integration/parent-coordination-application.test.ts'), 'utf8');
  assert.match(taskTests, /createBuildrApplicationTest/);
  assert.doesNotMatch(taskTests, /createRuntime\(/, 'registered Task Application cases must consume their Context');
});
