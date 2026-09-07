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
import { VERIFICATION_DAILY_CORE_EXCLUSIONS, verificationSteps } from '../verification/registry.ts';
import { SYSTEM_SUITES, validateSystemSuiteRegistry } from '../verification/system-suites.ts';

const productRoot: any = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const contractRoot: any = path.join(productRoot, 'test', 'contract');
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
  'project-product.test.ts',
  'public-json-contracts.test.ts',
  'service-product.test.ts',
  'workspace-manifest-registry.test.ts',
  'worktree-create.test.ts',
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

test('Unit 与 Component 不直接穿过真实进程、网络或文件系统边界', () => {
  assert.deepEqual(directBoundaryImports('unit'), []);
  assert.deepEqual(directBoundaryImports('component'), []);
});

test('每个Verification owner都有唯一且有理由的Context disposition', () => {
  assert.deepEqual(
    assertVerificationContextDispositionCoverage(verificationSteps.map((step: any) => step.id)),
    { status: 'covered', owners: verificationSteps.length },
  );
  assert.equal(Object.keys(VERIFICATION_CONTEXT_DISPOSITIONS).length, verificationSteps.length);
  for (const step of verificationSteps) {
    assert.equal(step.contextDisposition, VERIFICATION_CONTEXT_DISPOSITIONS[step.id]);
    assert.match(step.contextDisposition.mode, /^(?:context-runtime|hybrid|full-lifecycle)$/u);
    assert.match(step.contextDisposition.reasonCode, /^[a-z][a-z0-9-]+$/u);
    assert.ok(step.contextDisposition.reason.length >= 20, step.id);
  }
  assert.throws(
    () => assertVerificationContextDispositionCoverage(verificationSteps.slice(1).map((step: any) => step.id)),
    /verification_context_disposition_coverage_invalid/,
  );
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
  for (const [journey, audit] of Object.entries(VERIFICATION_GOLDEN_CONTEXT_AUDIT)) {
    assert.ok(audit.reason.length >= 40, journey);
    assert.match(audit.reusableBoundary, /^(?:none|application|artifact-only)$/u, journey);
    for (const owner of audit.owners) {
      assert.ok(byId.has(owner), `${journey} references unknown owner ${owner}`);
      assert.equal(byId.get(owner).contextDisposition.mode, audit.expectedMode, `${journey}/${owner}`);
    }
  }
});

test('Context采用不会削弱Core、Candidate与平台黄金生命周期', () => {
  const byId: any = new Map(verificationSteps.map((step: any) => [step.id, step]));
  const assertGolden: any = (id: any, reasonCode: any) => {
    const step: any = byId.get(id);
    assert.ok(step, `missing golden owner ${id}`);
    assert.equal(step.testing.primaryEvidenceOwner, id, `${id} must remain its own primary evidence owner`);
    assert.equal(step.contextDisposition.mode, 'full-lifecycle', `${id} must retain the real lifecycle`);
    assert.equal(step.contextDisposition.reasonCode, reasonCode, id);
  };

  for (const id of [
    'integration-self-bootstrap',
    'system-workspace-lifecycle',
    'system-worktree-lifecycle',
    'concurrent-task-acceptance',
  ]) {
    assertGolden(id, 'lifecycle-is-primary-evidence');
    assert.equal(byId.get(id).profiles.includes('core'), true, `${id} must remain in daily Core`);
  }

  for (const id of [
    'candidate-tarball',
    'application-payload-release',
    'npm-launcher-candidate',
    'release-tarball-smoke',
  ]) {
    assertGolden(id, 'release-artifact-is-primary-evidence');
    assert.equal(byId.get(id).profiles.includes('candidate'), true, `${id} must remain in Candidate`);
    assert.equal(byId.get(id).profiles.includes('core'), false, `${id} must stay out of daily Core`);
    assert.ok(VERIFICATION_DAILY_CORE_EXCLUSIONS[id], `${id} needs a closed Core exclusion reason`);
  }

  assertGolden('init-onboarding', 'lifecycle-is-primary-evidence');
  assert.equal(byId.get('init-onboarding').profiles.includes('candidate'), true);
  assert.equal(byId.get('init-onboarding').profiles.includes('core'), false);
  assert.ok(VERIFICATION_DAILY_CORE_EXCLUSIONS['init-onboarding']);

  assertGolden('repository-onboarding', 'release-artifact-is-primary-evidence');
  assert.deepEqual(byId.get('repository-onboarding').profiles, [], 'development checkout onboarding remains affected-only');

  assertGolden('host-node-cli-smoke', 'release-artifact-is-primary-evidence');
  assert.deepEqual(byId.get('host-node-cli-smoke').profiles, ['host-node']);

  assertGolden('system-windows-platform', 'lifecycle-is-primary-evidence');
  assert.equal(byId.get('system-windows-platform').selection, 'explicit-only');
  assert.deepEqual(byId.get('system-windows-platform').developmentRunners, ['windows']);
});

test('Quick Contract 只保留只读静态契约并拒绝可变环境测试', () => {
  const forbiddenImports: any = /from\s+['"]node:(?:child_process|cluster|dgram|http|http2|https|net|tls|worker_threads)['"]/u;
  const mutatingFilesystem: any = /\bfs\.(?:appendFileSync|cpSync|mkdirSync|mkdtempSync|renameSync|rmSync|unlinkSync|writeFileSync)\s*\(/u;
  for (const file of fs.readdirSync(contractRoot).filter((name: any) => name.endsWith('.test.ts') && name !== 'testing-boundaries.test.ts')) {
    const source: any = fs.readFileSync(path.join(contractRoot, file), 'utf8');
    assert.doesNotMatch(source, forbiddenImports, `${file} must move real process/network boundaries to Integration`);
    assert.doesNotMatch(source, mutatingFilesystem, `${file} must move mutable filesystem fixtures to Integration`);
  }

  const contract: any = verificationSteps.find((step: any) => step.id === 'contract');
  assert.equal(contract.testing.executionBoundary, 'Static');
  assert.deepEqual(contract.testing.environment, { footprints: ['filesystem'], isolation: 'read-only' });
  assert.equal(contract.testing.resetBurden, 'none');
});

test('Quick registry membership 由环境足迹与重置负担约束', () => {
  const quick: any = verificationSteps.filter((step: any) => step.profiles.includes('fast'));
  for (const step of quick) {
    assert.notEqual(step.testing.environment.isolation, 'shared', step.id);
    assert.equal(['repeated-cleanup', 'lifecycle'].includes(step.testing.resetBurden), false, step.id);
  }
  const runtimeAdapter: any = verificationSteps.find((step: any) => step.id === 'runtime-adapter-contract');
  assert.equal(runtimeAdapter.profiles.includes('fast'), false);
  assert.deepEqual(runtimeAdapter.testing.environment.footprints, ['filesystem']);
  assert.equal(runtimeAdapter.testing.resetBurden, 'repeated-cleanup');
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

test('Task lifecycle System context 只共享不可变基线并保留全生命周期测试的独立 owner', () => {
  const helper: any = fs.readFileSync(path.join(productRoot, 'test', 'helpers', 'task-lifecycle-system-context.ts'), 'utf8');
  const contextRuntime: any = fs.readFileSync(path.join(productRoot, 'test', 'context', 'runtime.ts'), 'utf8');
  const provider: any = fs.readFileSync(path.join(productRoot, 'test', 'context', 'providers', 'task-lifecycle.ts'), 'utf8');
  const runner: any = fs.readFileSync(path.join(productRoot, 'test', 'verification', 'system.ts'), 'utf8');
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
  assert.match(runner, /validateSystemSuiteRegistry\(discovered\)/,
    'the System runner must fail closed when a file has no primary owner');
  assert.match(runner, /--owner/,
    'Candidate must be able to schedule one bounded System owner');
  const systemFiles: any = fs.readdirSync(path.join(productRoot, 'test', 'system'))
    .filter((name: any) => /\.test\.ts$/.test(name))
    .map((name: any) => `test/system/${name}`).sort();
  const registry: any = validateSystemSuiteRegistry(systemFiles);
  assert.equal(registry.ok, true, JSON.stringify(registry.findings));
  assert.equal(new Set(SYSTEM_SUITES.flatMap((suite: any) => suite.files)).size, systemFiles.length);
  assert.equal(fs.existsSync(path.join(productRoot, 'test', 'system', 'workspace-product.test.mjs')), false);
  for (const owner of [
    'system-verification-admission', 'system-verification-contracts', 'system-public-json-contracts', 'system-openspec-contract-audit',
    'system-workspace-lifecycle', 'system-task-lifecycle', 'system-worktree-lifecycle', 'system-runtime-recovery',
    'system-buildr-web-http', 'system-app-process',
  ]) {
    assert.ok(SYSTEM_SUITES.some((suite: any) => suite.id === owner), `missing System owner ${owner}`);
  }
  assert.equal(SYSTEM_SUITES.find((suite: any) => suite.id === 'system-runtime-recovery')?.innerConcurrency, 1);
  assert.deepEqual(SYSTEM_SUITES.find((suite: any) => suite.id === 'system-verification-contracts')?.contexts ?? [], [], 'unrelated System owners must not pay Task Context setup');
  assert.deepEqual(SYSTEM_SUITES.find((suite: any) => suite.id === 'system-task-lifecycle')?.contexts, ['task-lifecycle/v1']);
  for (const file of taskLifecycleContextConsumers) {
    const source: any = fs.readFileSync(path.join(productRoot, 'test', 'system', file), 'utf8');
    assert.match(source, /copyTaskLifecycleWorkspace/, `${file} must consume the shared immutable context through its helper`);
  }
  const taskRecordFixture: any = fs.readFileSync(path.join(productRoot, 'test', 'helpers', 'task-record-system-fixture.ts'), 'utf8');
  assert.match(taskRecordFixture, /copyTaskLifecycleWorkspace/, 'split Task Record owners must share one fixture helper');
  for (const file of taskRecordContextConsumers) {
    const source: any = fs.readFileSync(path.join(productRoot, 'test', 'system', file), 'utf8');
    assert.match(source, /task-record-system-fixture\.ts/, `${file} must not duplicate Task Record baseline setup`);
  }
  for (const file of fullIsolationOwners) {
    const source: any = fs.readFileSync(path.join(productRoot, 'test', 'system', file), 'utf8');
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
  const suites: any = fs.readFileSync(path.join(productRoot, 'test', 'verification', 'system-suites.ts'), 'utf8');
  const project: any = fs.readFileSync(path.join(productRoot, 'test', 'system', 'project-product.test.ts'), 'utf8');
  const service: any = fs.readFileSync(path.join(productRoot, 'test', 'system', 'service-product.test.ts'), 'utf8');
  const workspace: any = fs.readFileSync(path.join(productRoot, 'test', 'helpers', 'workspace-product-suite.ts'), 'utf8');
  const retirement: any = fs.readFileSync(path.join(productRoot, 'test', 'system', 'package-capability-retirement.test.ts'), 'utf8');

  for (const key of ['workspace-foundation/v1', 'project-foundation/v1', 'git-repository/v1']) assert.match(profiles, new RegExp(key.replace('/', '\\/')));
  assert.match(provider, /runtime\.initBuildr/);
  assert.match(provider, /runtime\.createProject/);
  assert.match(provider, /git\.clone-bare/);
  assert.match(provider, /fs\.cpSync\(context\.seedRoot, sandboxRoot/);
  assert.match(helper, /defaultTestContextPool\(\)\.acquire/);
  assert.match(suites, /id: 'system-workspace-lifecycle'[\s\S]*WORKSPACE_FOUNDATION_CONTEXT_KEY[\s\S]*PROJECT_FOUNDATION_CONTEXT_KEY[\s\S]*GIT_REPOSITORY_CONTEXT_KEY/);
  assert.match(project, /copyPreparedWorkspace/);
  assert.match(project, /copyPreparedGitRepository/);
  assert.doesNotMatch(project, /runBuildr\(\['init'/);
  assert.match(service, /copyPreparedProjectWorkspace/);
  assert.match(service, /copyPreparedGitRepository/);
  assert.doesNotMatch(service, /runBuildr\(\['init'/);
  assert.match(workspace, /selectedSuite === 'manifest-registry' && !options\.freshIdentity/,
    'manifest cases may reuse a foundation, while identity evidence requests a fresh Workspace');
  assert.match(retirement, /copyPreparedWorkspace/);

});

test('公共Node Test Context Runtime与Buildr provider保持独立authority', () => {
  const packageMetadata: any = JSON.parse(fs.readFileSync(path.join(productRoot, 'package.json'), 'utf8'));
  assert.deepEqual(packageMetadata.exports['./test-context'], {
    types: './package/targets/test-context/index.d.ts',
    import: './test-context.mjs',
    default: './test-context.mjs',
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
  const framework: any = fs.readFileSync(path.join(productRoot, 'docs/verification-framework.md'), 'utf8');
  for (const term of ['@buildr-ai/buildr/test-context', 'Worker Host', 'Cache Identity', 'Dirty', 'node-context-test']) assert.match(framework, new RegExp(term));
});
