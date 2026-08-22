import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { PACKAGE_VERIFIERS, selectPackageVerifiers } from '../../src/agent-assets/application/package-maintenance/verification-registry.mjs';
import { createVerificationPlan } from '../../test/verification/planner.mjs';
import { VERIFICATION_DELEGATED_INPUTS, VERIFICATION_EXECUTION_PROFILES, VERIFICATION_FULL_SCOPE_INPUTS, verificationSteps } from '../../test/verification/registry.mjs';
import { workspaceSuites } from '../../test/verification/workspace/suites.mjs';

const productRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relative) => fs.readFileSync(path.join(productRoot, relative), 'utf8');

test('product verification exposes three gates, direct layers, and one focus entry', () => {
  const scripts = JSON.parse(read('package.json')).scripts;
  assert.equal(scripts.test, './test/verification/verify-buildr-product-fast');
  assert.equal(scripts['test:fast'], './test/verification/verify-buildr-product-fast');
  assert.equal(scripts['test:unit'], 'node --test test/unit/*.test.mjs');
  assert.equal(scripts['test:component'], 'node --test test/component/*.test.mjs');
  assert.equal(scripts['test:contract'], 'node --test test/contract/*.test.mjs');
  assert.equal(scripts['test:integration'], 'node --test test/integration/*.test.mjs');
  assert.equal(scripts.typecheck, 'tsc --project tsconfig.json');
  assert.equal(scripts['test:system'], 'node test/verification/system.mjs');
  assert.equal(scripts['test:integration:fast'], undefined);
  assert.equal(scripts['test:web-dist'], 'node test/verification/web-dist.mjs');
  assert.equal(scripts['test:browser:smoke'], 'npm run test:web-dist && node --test test/browser-smoke/*.test.mjs');
  assert.equal(scripts['test:browser:changed'], 'node test/verification/browser-selector-dispatcher.mjs --run');
  for (const selector of ['core', 'shell', 'project', 'service', 'change', 'task', 'articles']) {
    assert.match(scripts[`test:browser:${selector}`], /^npm run test:web-dist && /);
  }
  assert.equal(scripts['test:integration:candidate:recovery'], undefined);
  assert.equal(scripts['test:integration:candidate:release'], 'node test/verification/run-node-tests.mjs test/integration-candidate-release/*.test.mjs');
  assert.equal(scripts['coverage:unit'], 'node test/verification/unit-coverage.mjs');
  assert.equal(scripts['test:changed'], 'node test/verification/changed.mjs');
  assert.equal(scripts['test:focus'], 'node test/verification/focus.mjs');
  assert.equal(scripts['test:host-node'], 'node test/verification/host-node.mjs');
  assert.equal(scripts['test:candidate'], 'bash test/verification/verify-buildr-product');
  assert.equal(scripts['test:candidate:ci'], 'bash test/verification/verify-buildr-product-ci');
  assert.equal(scripts['test:candidate:host'], 'node test/verification/candidate-ci.mjs host');
  assert.equal(scripts['test:candidate:aggregate'], 'node test/verification/candidate-ci.mjs aggregate');
  assert.equal(scripts['test:release'], 'node test/verification/release/release-smoke.mjs');
  assert.equal(scripts['test:launcher-platform'], 'node test/verification/release/release-smoke.mjs --platform-launcher');
  assert.doesNotMatch(scripts['test:host-node'], /run-workspace-node/, 'Host Node compatibility must run on the caller-selected Node');
  for (const removed of ['test:affected', 'test:package', 'test:workspace', 'test:coverage:unit']) assert.equal(scripts[removed], undefined);

  const fast = read('test/verification/verify-buildr-product-fast');
  assert.match(fast, /run-development-node" test\/verification\/profile\.mjs fast/);
  const fastIds = createVerificationPlan({ profiles: ['fast'] }).steps.map((step) => step.id);
  assert.deepEqual(fastIds, ['typecheck', 'unit', 'component', 'contract', 'cli-architecture', 'openspec-spec-quality', 'openspec-strict']);
  assert.equal(fastIds.includes('system'), false);
  for (const forbidden of ['npm pack', 'npm install', 'verification/workspace/run.mjs', 'release-smoke.mjs']) {
    assert.equal(fast.includes(forbidden), false, `fast verifier must exclude ${forbidden}`);
  }
});

test('普通发布测试无GUI副作用，真实平台Launcher仅由显式入口调用', () => {
  const releaseSmoke = read('test/verification/release/release-smoke.mjs');
  const platformLauncher = read('test/verification/release/platform-launcher-invocation.mjs');
  const registry = read('test/verification/registry.mjs');
  assert.doesNotMatch(releaseSmoke, /spawnSync\('\/usr\/bin\/open'|Start-Process -FilePath/u);
  assert.match(releaseSmoke, /BUILDR_LAUNCHER_NO_OPEN/);
  assert.match(releaseSmoke, /BUILDR_LAUNCHER_NO_NOTIFY/);
  assert.match(releaseSmoke, /platformLauncherIntegration/);
  assert.match(platformLauncher, /spawnSync\('\/usr\/bin\/open'/u);
  assert.match(platformLauncher, /Start-Process -FilePath/u);
  assert.match(platformLauncher, /BUILDR_LAUNCHER_NO_OPEN=1/u);
  assert.match(platformLauncher, /BUILDR_LAUNCHER_NO_NOTIFY=1/u);
  assert.doesNotMatch(registry, /--platform-launcher/u);
});

test('Development Launcher固定端口不改变Task Preview的随机端口与无浏览器子进程边界', () => {
  const previewManager = read('src/web/application/preview-lifecycle.mjs');
  assert.match(previewManager, /optionValue\(args, '--port', '0'\)/u);
  assert.match(previewManager, /'web', '--target', targetRoot, '--port', String\(port\), '--no-open'/u);
});

test('Product 声明唯一 delivery、显式完整回归与单一 Browser 交付能力', () => {
  const declaration = YAML.parse(fs.readFileSync(path.resolve(productRoot, '../..', 'verification.yml'), 'utf8'));
  const fast = declaration.capabilities.find((capability) => capability.id === 'product.fast');
  const delivery = declaration.capabilities.find((capability) => capability.id === 'product.delivery');
  const fullRegression = declaration.capabilities.find((capability) => capability.id === 'product.full-regression');
  const browser = declaration.capabilities.find((capability) => capability.id === 'product.browser-smoke');
  const releaseSet = declaration.capabilities.find((capability) => capability.id === 'product.release-artifact-set');
  assert.equal(declaration.schemaVersion, 'buildr.project-verification/v2');
  const fastPlan = createVerificationPlan({ profiles: ['fast'] });
  assert.deepEqual([...new Set(fastPlan.steps.map((step) => step.testing.executionBoundary))].sort(), ['Component', 'Static', 'Unit']);
  assert.deepEqual(fast.proves, ['低成本 Unit、Component 与 Static Conformance 通过']);
  assert.deepEqual(delivery.invocation, { kind: 'command', argv: ['tools/development/run-development-npm', 'run', 'test:changed', '--', '--base', 'origin/dev'], cwd: 'services/buildr' });
  assert.equal(delivery.requiredForDelivery, true);
  assert.deepEqual(delivery.environment.requires, ['node', 'npm', 'git']);
  assert.deepEqual(delivery.applicability.paths, ['**']);
  assert.deepEqual(fullRegression.invocation, { kind: 'command', argv: ['tools/development/run-development-npm', 'run', 'test:candidate'], cwd: 'services/buildr' });
  assert.equal(fullRegression.requiredForDelivery, false);
  assert.deepEqual(fullRegression.environment.requires, ['node', 'npm', 'git']);
  assert.deepEqual(fullRegression.applicability.paths, ['**']);
  assert.equal(declaration.capabilities.some((capability) => ['product.task-affected', 'product.candidate'].includes(capability.id)), false);
  assert.deepEqual(browser.scope, { project: 'product', services: ['buildr', 'buildr-web'] });
  assert.deepEqual(browser.invocation, { kind: 'command', argv: ['tools/development/run-development-npm', 'run', 'test:browser:changed'], cwd: 'services/buildr' });
  assert.equal(browser.requiredForDelivery, true);
  assert.deepEqual(browser.applicability.paths, [
    'services/buildr-web/**',
    'services/buildr/web-dist/**',
    'services/buildr/src/web/**',
    'services/buildr/test/browser-smoke/**',
    'services/buildr/test/verification/browser-selector-dispatcher.mjs',
    'services/buildr/test/verification/web-dist.mjs',
  ]);
  assert.deepEqual(browser.applicability.conditions, [
    'Buildr Web 路由、DOM 交互、Agent Action、package、lockfile、Vite 或 TypeScript 配置发生变化',
    '未显式提供 BUILDR_CHANGED_PATHS_JSON 时，dispatcher 从 execution root 的 Git verification base 推导 changed paths',
    '适用输入至少选择一个 Browser selector；非适用输入明确返回 not-applicable，Browser-owned 0 selector 阻塞',
    'selected Browser 在启动 Chrome 前，将 Buildr Web 构建到系统临时 staging 并与 tracked web-dist 精确比较',
  ]);
  assert.deepEqual(browser.proves, [
    '适用的 changed paths 已执行至少一个稳定 Browser selector，或被明确判定为 not-applicable',
    '临时 staging build 与 tracked web-dist 精确一致，冻结目标未被改写',
    'Project、Service、Change 与 Task 页面关键浏览器交互和错误反馈可用',
  ]);
  assert.deepEqual(browser.environment.requires, ['node', 'npm', 'chrome']);
  assert.deepEqual(browser.effects.externalSystems, []);
  assert.equal(browser.effects.authorization, 'implicit');
  assert.deepEqual(browser.resourceClaims, ['browser']);
  const browserDelegation = VERIFICATION_DELEGATED_INPUTS.find((item) => item.owner === 'product.browser-smoke');
  assert.ok(browserDelegation);
  for (const input of browserDelegation.inputs) assert.ok(browser.applicability.paths.includes(`services/buildr/${input}`));
  assert.deepEqual(declaration.resources.find((resource) => resource.id === 'browser'), { id: 'browser', title: 'Local browser capacity', strategy: 'coordinated', capacity: 1, authorization: 'implicit' });
  assert.deepEqual(releaseSet.invocation, { kind: 'command', argv: ['tools/development/run-development-npm', 'run', 'test:focus', '--', 'group:release'], cwd: 'services/buildr' });
  assert.equal(releaseSet.requiredForDelivery, false);
  assert.ok(releaseSet.applicability.paths.includes('.github/workflows/publish.yml'));
  assert.equal(releaseSet.applicability.paths.some((value) => value === '.github/**' || value === '.github/workflows/**'), false);
  assert.equal(declaration.capabilities.some((capability) => capability.id.startsWith('product.platform-')), false);
  assert.equal(declaration.resources.some((resource) => resource.id === 'nodejs-release'), false);
  for (const owner of ['contract', 'candidate-tarball', 'application-payload-release', 'npm-launcher-candidate', 'open-source-candidate', 'release-tarball-smoke']) {
    assert.ok(verificationSteps.find((step) => step.id === owner).inputs.includes('.github/workflows/publish.yml'), `${owner} must own the governed release workflow`);
  }
});

test('focus verification de-duplicates groups without attaching fast', () => {
  const plan = createVerificationPlan({ groups: ['public', 'release', 'public'] });
  assert.equal(plan.steps.filter((step) => step.id === 'unit').length, 0);
  assert.equal(plan.steps.filter((step) => step.id === 'open-source-candidate').length, 1);
  assert.equal(plan.steps.filter((step) => step.id === 'candidate-tarball').length, 1);
});

test('npm Launcher candidate is registered without a platform distribution dependency', () => {
  const direct = createVerificationPlan({ stepIds: ['npm-launcher-candidate'] });
  assert.deepEqual(direct.steps.map((step) => step.id), ['npm-launcher-candidate']);
  assert.equal(direct.steps[0].testing.environment.footprints.includes('network'), false);
  assert.ok(direct.steps[0].inputs.includes('src/system/installation/**'));
});

test('remote text owner includes product re-entry and payload entry boundaries', () => {
  const remote = verificationSteps.find((step) => step.id === 'remote-skill-timeout');
  for (const input of [
    'src/infrastructure/network/**',
    'src/infrastructure/product-invocation/**',
    'src/bootstrap/cli/main.mjs',
    'tools/release/application-payload-entry.mjs',
  ]) assert.ok(remote.inputs.includes(input), `remote-skill-timeout must own ${input}`);
});

test('Windows npm preflight keeps the bounded high-risk owners and tarball dependency', () => {
  const plan = createVerificationPlan({ groups: ['windows-npm-preflight'] });
  assert.deepEqual(plan.steps.map((step) => step.id), [
    'system-windows-platform',
    'concurrent-task-acceptance',
    'candidate-tarball',
    'npm-launcher-candidate',
    'runtime-adapter-parity',
    'workspace-lifecycle',
    'release-tarball-smoke',
  ]);
  assert.equal(plan.steps.some((step) => step.id === 'unit'), false);
  assert.equal(plan.steps.some((step) => step.id === 'open-source-candidate'), false);
});

test('candidate verification retains necessary Candidate facts without Browser and Release-only owners', () => {
  const wrapper = read('test/verification/verify-buildr-product');
  const candidate = read('test/verification/candidate.mjs');
  const changed = read('test/verification/changed.mjs');
  assert.ok(wrapper.includes('test/verification/candidate.mjs'));
  assert.ok(wrapper.includes('"$@"'));
  assert.ok(candidate.includes("profiles: ['candidate']"));
  assert.doesNotMatch(candidate, /collectChangedProductPaths|createVerificationPreflightPlan|--base/);
  assert.doesNotMatch(changed, /createVerificationPreflightPlan/);
  assert.equal((candidate.match(/await executePlan\(/g) ?? []).length, 1);
  assert.equal((changed.match(/await executePlan\(/g) ?? []).length, 1);
  assert.ok(candidate.includes('BUILDR_VERIFICATION_SCHEDULING'));
  assert.ok(candidate.includes('schedulingMode'));
  assert.match(candidate, /BUILDR_VERIFICATION_SCHEDULING \?\? 'cost'/);
  assert.match(candidate, /process\.versions\.node !== developmentNodeVersion/);
  assert.match(candidate, /Buildr Product development Node mismatch/);
  assert.match(candidate, /enforceOfflineVerification\(\)/);
  const candidatePlan = createVerificationPlan({ profiles: ['candidate'] });
  for (const step of candidatePlan.steps) {
    assert.equal(step.testing.environment.footprints.includes('network'), false, `${step.id} must not depend on external network`);
  }
  for (const stage of [
    'fine-grained unit tests',
    'bounded component tests',
    'cross-domain technical boundary integration tests',
    'Project declaration integration slice',
    'OpenSpec application integration slice',
    'Verification orchestration integration slice',
    'Runtime and Local App integration slice',
    'Release and installation integration slice',
    'Workspace data-store integration slice',
    'Task Environment integration slice',
    'Self-bootstrap closeout integration slice',
    'Task read-model integration slice',
    'Task coordination integration slice',
    'Task execution-record integration slice',
    'Task Development lifecycle integration',
    'Task Finish core integration slice',
    'Task Finish delivery integration slice',
    'repository contract tests',
    'System verification admission canary',
    'System verification orchestration contracts',
    'System public JSON contracts',
    'System OpenSpec contract audit',
    'System Workspace lifecycle',
    'System Task lifecycle',
    'System Worktree lifecycle',
    'System runtime recovery',
    'System Buildr Web Runtime',
    'System Buildr Web process and preview',
    'System Task Finish product journey',
    'System Task Finish CLI journey',
    'System fresh build',
    'Concurrent task workflow acceptance',
    'CLI modular architecture',
    'OpenSpec canonical spec quality',
    'openspec strict validation',
    'frozen application payload and candidate npm tarball',
    'application payload and npm runtime candidate',
    'verified npm installation Launcher projection',
    'open-source candidate',
    'OpenSpec contract candidate audit',
    'managed mutations',
    'single-command init onboarding',
    'CLI compatibility',
    'CLI package parity',
    'runtime adapter contract',
    'runtime adapter implementation-family parity',
    'capability CLI integration',
    'Service branch contract',
    'remote Skill timeout contract',
    'release tarball headless smoke',
    'managed data integrity',
    'OpenSpec contract fixtures',
    'documentation quality',
  ]) assert.ok(candidatePlan.steps.some((step) => step.name === stage), `candidate verifier must retain ${stage}`);
  for (const excluded of [
    'integration-candidate-release', 'repository-onboarding',
    'browser-shell', 'browser-project', 'browser-service', 'browser-task', 'browser-change',
  ]) assert.equal(candidatePlan.steps.some((step) => step.id === excluded), false, `candidate verifier must exclude ${excluded}`);
  assert.equal(verificationSteps.some((step) => step.id.startsWith('browser-')), false);
  assert.equal(candidatePlan.steps.some((step) => step.id === 'runtime-adapter-smoke-workspace'), false);
  assert.equal(candidatePlan.steps.some((step) => step.name === 'runtime adapter smoke workspace generator'), false);
  assert.equal(fs.existsSync(path.join(productRoot, 'test/verification/runtime/adapter-smoke-workspace.mjs')), false);
  assert.equal(fs.existsSync(path.join(productRoot, 'test/verification/runtime/adapter-smoke-workspace.test.mjs')), false);
  assert.deepEqual(PACKAGE_VERIFIERS.map((step) => step.id), ['static', 'workspace', 'commands', 'rules', 'skills', 'runtime']);
  assert.equal(verificationSteps.filter((step) => step.executor.type === 'candidate-artifact').length, 1);
  assert.equal(candidate.includes('createCandidatePackage'), false);
  for (const suite of ['workspace-lifecycle', 'ownership-recovery', 'runtime-reconciliation']) {
    assert.ok(workspaceSuites.some((step) => step.id === suite), `Workspace E2E registry must retain ${suite}`);
  }
  assert.ok(candidatePlan.steps.some((step) => step.executor.file === 'test/capability-cli.integration.mjs'));
  const systemOwners = candidatePlan.steps.filter((step) => step.id.startsWith('system-'));
  assert.equal(systemOwners.length, 13);
  for (const owner of systemOwners) {
    assert.equal(owner.executor.file, 'test/verification/system.mjs');
    assert.ok(owner.inputs.includes('test/helpers/task-lifecycle-system-context.mjs'));
  }
  assert.equal(candidatePlan.steps.some((step) => step.id === 'system'), false);
  assert.equal(VERIFICATION_EXECUTION_PROFILES.local.resources['workspace-saturating'], 2);
  assert.equal(VERIFICATION_EXECUTION_PROFILES.ci.resources['workspace-saturating'], 2);
  assert.equal(VERIFICATION_EXECUTION_PROFILES['ci-workspace-limited'].resources['workspace-saturating'], 1);
  assert.equal(VERIFICATION_EXECUTION_PROFILES.local.resources['task-lifecycle-heavy'], 1);
  assert.equal(VERIFICATION_EXECUTION_PROFILES.ci.resources['task-lifecycle-heavy'], 1);
  assert.equal(VERIFICATION_EXECUTION_PROFILES['ci-workspace-limited'].resources['task-lifecycle-heavy'], 1);
  assert.equal(VERIFICATION_EXECUTION_PROFILES.local.innerConcurrency['system-verification-contracts'], 3);
  assert.equal(VERIFICATION_EXECUTION_PROFILES.local.innerConcurrency['integration-task-finish-delivery'], 2);
  assert.equal(VERIFICATION_EXECUTION_PROFILES.ci.innerConcurrency['integration-task-finish-delivery'], 2);
  assert.equal(VERIFICATION_EXECUTION_PROFILES['ci-workspace-limited'].innerConcurrency['integration-task-finish-delivery'], 1);
  assert.equal(VERIFICATION_EXECUTION_PROFILES.local.innerConcurrency['system-verification-admission'], 2);
  assert.equal(VERIFICATION_EXECUTION_PROFILES.local.innerConcurrency['system-fresh-build'], 1);
  assert.equal(VERIFICATION_EXECUTION_PROFILES['ci-workspace-limited'].innerConcurrency['system-workspace-lifecycle'], 2);
  assert.equal(VERIFICATION_EXECUTION_PROFILES['ci-workspace-limited'].innerConcurrency['system-task-finish'], 1);
  const freshBuild = verificationSteps.find((step) => step.id === 'system-fresh-build');
  assert.equal(freshBuild.schedulingCostMs, 25_000);
  assert.equal(freshBuild.concurrencyClass, 'workspace-heavy');
  assert.deepEqual(freshBuild.resources, ['workspace-saturating', 'task-lifecycle-heavy']);
  assert.deepEqual(Object.fromEntries([
    'integration-task-finish-delivery',
    'system-task-finish',
    'integration-task-development',
    'integration-task-execution-records',
    'integration-self-bootstrap',
  ].map((id) => [id, verificationSteps.find((step) => step.id === id).schedulingCostMs])), {
    'integration-task-finish-delivery': 75_000,
    'system-task-finish': 120_000,
    'integration-task-development': 60_000,
    'integration-task-execution-records': 50_000,
    'integration-self-bootstrap': 50_000,
  });
});

test('release tarball smoke isolates npm cache writes without a Workspace runtime', () => {
  const releaseSmoke = read('test/verification/release/release-smoke.mjs');
  const platformLauncher = read('test/verification/release/platform-launcher-invocation.mjs');
  assert.match(releaseSmoke, /npm_config_cache: npmCache/);
  assert.doesNotMatch(releaseSmoke, /BUILDR_NODE_RUNTIME/);
  assert.match(releaseSmoke, /\['install', '--offline', '--global'/);
  assert.match(releaseSmoke, /RELEASE_LAUNCHER_READINESS_TIMEOUT_MS = 15_000/);
  assert.match(releaseSmoke, /const launcherEnvironment = \{/);
  assert.match(releaseSmoke, /\.\.\.runtimeEnv/);
  assert.match(platformLauncher, /`PATH=\$\{environment\.PATH\}`/);
  assert.match(releaseSmoke, /preserveLauncherFailureEvidence/);
});

test('Host Node compatibility runs offline without a Workspace Node distribution', () => {
  const packageManifest = JSON.parse(read('package.json'));
  const hostNode = read('test/verification/host-node.mjs');
  const cliSmoke = read('test/verification/host-node/cli-smoke.mjs');
  const policy = read('src/infrastructure/network/verification-network-policy.mjs');
  const workflow = read('../../../../.github/workflows/verify.yml');
  const hostJob = workflow.slice(workflow.indexOf('  candidate-host-node:'), workflow.indexOf('  candidate-gate:'));
  assert.deepEqual(packageManifest.bundleDependencies, ['yaml']);
  assert.match(hostNode, /enforceOfflineVerification\(\)/);
  const executePlanCall = hostNode.slice(hostNode.indexOf('await executePlan('), hostNode.indexOf('results = execution.results'));
  assert.match(executePlanCall, /expectedNodeVersion: null/);
  assert.match(policy, /npm_config_offline = 'true'/);
  assert.match(policy, /BUILDR_VERIFICATION_NETWORK_MODE/);
  assert.match(cliSmoke, /\['install', '--offline', '--global'/);
  assert.doesNotMatch(cliSmoke, /BUILDR_NODE_RUNTIME|workspaceNode/);
  assert.match(cliSmoke, /\[buildrScript, 'web', '--no-open', '--port', '0'\]/);
  assert.match(cliSmoke, /\/api\/v1\/health/);
  assert.match(cliSmoke, /ordinary CLI must not start HTTP/);
  assert.match(cliSmoke, /readiness\.productIdentity\?\.applicationPayloadDigest/);
  assert.doesNotMatch(cliSmoke, /npm pack|createReleaseArtifact|buildApplicationPayload/);
  assert.match(hostJob, /host-minimum-macos[\s\S]*node: 24\.15\.0/);
  assert.match(hostJob, /host-current-windows[\s\S]*node: 24\.x/);
  assert.match(hostJob, /npm run test:candidate:host -- \$\{\{ matrix\.id \}\}/);
  assert.match(hostJob, /name: candidate-package/);
});

test('runtime adapter contract uses one run-unique temporary root with owner cleanup', () => {
  const source = read('test/verification/runtime/adapter-contract.mjs');
  assert.equal((source.match(/os\.tmpdir\(\)/g) || []).length, 1);
  assert.match(source, /const temporaryRoot = fs\.mkdtempSync/);
  assert.match(source, /process\.once\('exit', \(\) => fs\.rmSync\(temporaryRoot, \{ recursive: true, force: true \}\)\)/);
});

test('distributed Candidate creates one artifact and fans out independent consumers', () => {
  const workflow = read('../../../../.github/workflows/verify.yml');
  const document = YAML.parse(workflow);
  assert.deepEqual(Object.keys(document.jobs), [
    'dev-feedback-macos', 'dev-feedback-windows', 'candidate-bootstrap', 'candidate-core-macos', 'candidate-runtime-windows',
    'candidate-windows', 'candidate-host-node', 'candidate-gate',
  ]);
  assert.equal(document.jobs['candidate-core-macos'].needs, 'candidate-bootstrap');
  assert.equal(document.jobs['candidate-core-macos']['timeout-minutes'], 20);
  assert.equal(document.jobs['candidate-core-macos'].strategy['fail-fast'], false);
  assert.deepEqual(document.jobs['candidate-core-macos'].strategy.matrix.shard, [
    'core-task-lifecycle-macos',
    'core-project-task-macos',
    'core-package-runtime-release-macos',
    'core-cli-contract-macos',
  ]);
  const candidateTimeouts = verificationSteps.filter((step) => step.profiles.includes('candidate')).map((step) => step.timeoutMs);
  assert.ok(candidateTimeouts.every((timeoutMs) => Number.isInteger(timeoutMs) && timeoutMs > 0));
  assert.ok(Math.max(...candidateTimeouts) + 3_000 < document.jobs['candidate-core-macos']['timeout-minutes'] * 60_000);
  assert.ok(document.jobs['candidate-core-macos']['timeout-minutes'] < 35);
  const selfBootstrap = verificationSteps.find((step) => step.id === 'integration-self-bootstrap');
  assert.ok(selfBootstrap.resources.includes('workspace-saturating'));
  assert.equal(selfBootstrap.timeoutMs, 360_000);
  const finishDelivery = verificationSteps.find((step) => step.id === 'integration-task-finish-delivery');
  assert.deepEqual(finishDelivery.resources, []);
  assert.equal(finishDelivery.testing.environment.isolation, 'unique-temporary-root');
  assert.equal(finishDelivery.timeoutMs, 360_000);
  assert.equal(document.jobs['candidate-runtime-windows'].needs, 'candidate-bootstrap');
  const runtimeWindowsStep = document.jobs['candidate-runtime-windows'].steps.find((step) => step.name === 'Run Windows runtime shard');
  assert.equal(runtimeWindowsStep.shell, 'pwsh', 'Windows runtime Candidate must preserve native PowerShell environment semantics');
  assert.equal(document.jobs['candidate-windows'].needs, 'candidate-bootstrap');
  assert.equal(document.jobs['candidate-host-node'].needs, 'candidate-bootstrap');
  assert.deepEqual(document.jobs['candidate-windows'].strategy.matrix.shard, [
    'workspace-lifecycle-windows',
    'task-worktree-recovery-windows',
    'task-finish-windows',
    'task-development-windows',
    'fresh-build-windows',
  ]);
  const windowsJob = workflow.slice(workflow.indexOf('  candidate-windows:'), workflow.indexOf('  candidate-host-node:'));
  assert.match(windowsJob, /projects\/product\/services\/buildr-web\/package-lock\.json/);
  assert.match(windowsJob, /if: matrix\.shard == 'fresh-build-windows'[\s\S]*npm ci --ignore-scripts/);
  assert.equal((workflow.match(/name: candidate-package/g) || []).length, 4, 'one upload and three consumer downloads');
  assert.equal((workflow.match(/Build the single Candidate artifact/g) || []).length, 1);
  assert.doesNotMatch(windowsJob, /candidate-package|BUILDR_CANDIDATE_CI_ARTIFACT_DIR/);
});

test('Candidate workflow checks out one exact source SHA and always aggregates closed evidence', () => {
  const workflow = read('../../../../.github/workflows/verify.yml');
  const document = YAML.parse(workflow);
  assert.equal(document.env.CANDIDATE_SOURCE_SHA, '${{ github.event.pull_request.head.sha || github.sha }}');
  assert.equal(document.jobs['candidate-gate'].name, 'Candidate gate');
  assert.match(document.jobs['candidate-gate'].if, /^always\(\)/);
  assert.deepEqual(document.jobs['candidate-gate'].needs, [
    'candidate-bootstrap', 'candidate-core-macos', 'candidate-runtime-windows', 'candidate-windows', 'candidate-host-node',
  ]);
  assert.match(workflow, /pattern: candidate-evidence-\*/);
  assert.match(workflow, /merge-multiple: true/);
  const candidateWorkflow = workflow.slice(workflow.indexOf('  candidate-bootstrap:'));
  const gate = workflow.slice(workflow.indexOf('  candidate-gate:'));
  assert.match(gate, /runs-on: macos-latest/);
  assert.match(gate, /node test\/verification\/candidate-ci\.mjs aggregate/);
  assert.doesNotMatch(gate, /npm ci|cache: npm/);
  assert.equal((candidateWorkflow.match(/overwrite: true/g) || []).length, 8, 'Candidate reruns replace one logical artifact per shard or aggregate');
  assert.equal((candidateWorkflow.match(/ref: \$\{\{ env\.CANDIDATE_SOURCE_SHA \}\}/g) || []).length, 6);
  assert.doesNotMatch(workflow, /git log --first-parent origin\/dev/);
  for (const input of [
    '.github/workflows/verify.yml', 'test/verification/verify-buildr-product-ci',
    'test/verification/candidate-ci.mjs', 'test/verification/candidate-ci-evidence.mjs',
  ]) assert.ok(VERIFICATION_FULL_SCOPE_INPUTS.includes(input), `${input} must force full changed verification`);
});

test('Candidate aggregate import graph is clean-checkout Node-only', () => {
  const pending = ['test/verification/candidate-ci.mjs'];
  const visited = new Set();
  while (pending.length > 0) {
    const relative = pending.pop();
    if (visited.has(relative)) continue;
    visited.add(relative);
    const source = read(relative);
    for (const match of source.matchAll(/from\s+['"]([^'"]+)['"]/gu)) {
      const specifier = match[1];
      assert.ok(specifier.startsWith('node:') || specifier.startsWith('.'), `${relative} imports external dependency ${specifier}`);
      if (!specifier.startsWith('.')) continue;
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(relative), specifier));
      assert.ok(fs.statSync(path.join(productRoot, target), { throwIfNoEntry: false })?.isFile(), `${relative} import is missing: ${target}`);
      pending.push(target);
    }
  }
  assert.ok(visited.has('test/verification/candidate-ci-evidence.mjs'));
  assert.ok(visited.has('test/verification/registry.mjs'));
});

test('fresh build reuses prepared controller dependencies without weakening tested installs', () => {
  const source = read('test/system/task-environment-fresh-build-web.test.mjs');
  assert.doesNotMatch(source, /\[npmCli, 'ci'\]/);
  assert.match(source, /reuse prepared dependencies without another npm ci/);
  assert.match(source, /preparationSteps\.map\(\(step\) => step\.executed\), \[true, true\]/);
  assert.match(source, /managedNpm, \['run', 'build:web'\]/);
});

test('双任务并发验收输出完整的组合证据并执行归属清理', () => {
  const source = read('test/verification/concurrency/task-acceptance.mjs');
  for (const phrase of [
    'buildr.concurrent-task-acceptance/v1', 'cliInvocation', 'web', 'preview',
    'previewRegistrationFailure', 'resourceCoordination', 'environmentPreparation', 'portableResults', 'phases',
    'target-race', 'cleanup', 'retainedDoctor', 'durationMs',
  ]) assert.ok(source.includes(phrase), phrase);
  assert.ok(source.includes('processesOverlap(prepareResults[0], prepareResults[1])'));
  assert.ok(source.includes("'task', 'verification', 'reconcile'"));
  assert.equal(source.includes("'task', 'verification', 'inspect'"), false);
  assert.equal(source.includes('taskChangeResolution'), false);
  assert.equal(source.includes('candidate-only'), false);
  assert.equal(source.includes('RESOURCE_WORKER'), false);
  assert.ok(source.includes("profiles: ['candidate']") === false);
  const entry = verificationSteps.find((step) => step.id === 'concurrent-task-acceptance');
  assert.equal(entry.executor.file, 'test/verification/concurrency/task-acceptance.mjs');
  assert.deepEqual(entry.profiles, ['candidate']);
  assert.ok(entry.resources.includes('workspace-saturating'));
  assert.ok(entry.budgetMs > 0);
});

test('OpenSpec fixture Candidate owners use disjoint complete suites', () => {
  const owners = Object.fromEntries(verificationSteps
    .filter((step) => ['openspec-contract-fixtures', 'openspec-convergence-recovery'].includes(step.id))
    .map((step) => [step.id, step.executor.args]));
  assert.deepEqual(owners, {
    'openspec-contract-fixtures': ['--suite', 'contract'],
    'openspec-convergence-recovery': ['--suite', 'recovery'],
  });
});

test('CLI package parity owns representative equivalence without lifecycle duplication', () => {
  const source = read('test/verification/cli/package-parity.mjs');
  assert.match(source, /representative output and init mutation/);
  for (const forbidden of [
    'spawnAsync',
    'verification.yml',
    'taskParity',
    'taskIds',
    "'project', 'create'",
    "'sync', 'codex'",
    "'doctor', '--agent'",
  ]) assert.equal(source.includes(forbidden), false, `package parity must not duplicate ${forbidden}`);
  assert.equal(verificationSteps.find((step) => step.id === 'cli-package-parity').testing.executionBoundary, 'Integration');
});

test('package verifier selectors are stable, focused, and fail closed', () => {
  assert.deepEqual(selectPackageVerifiers('static,runtime').map((step) => step.id), ['static', 'runtime']);
  assert.throws(() => selectPackageVerifiers('unknown'), /Unknown package verifier/);

});
