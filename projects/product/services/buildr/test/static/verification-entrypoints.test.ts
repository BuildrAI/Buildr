import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { selectPackageVerifiers } from '../../tools/verification/package-check/verification-registry.ts';
import { createVerificationPlan } from '../verification/planner.ts';
import { CANDIDATE_CI_SHARDS, CANDIDATE_CI_HOST_NODE_TUPLES, verificationSteps } from '../verification/registry.ts';
import { VERIFICATION_FULL_SCOPE_INPUTS, VERIFICATION_STEP_OWNERSHIP, validateVerificationStepOwnership } from '../verification/ownership.ts';

const productRoot: any = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read: any = (relative: any) => fs.readFileSync(path.join(productRoot, relative), 'utf8');

test('普通发布测试无GUI副作用，真实平台Launcher仅由显式入口调用', () => {
  const releaseSmoke: any = read('test/verification/release/package-consumption.ts');
  const platformLauncher: any = read('test/verification/release/platform-launcher-invocation.ts');
  const registry: any = read('test/verification/registry.ts');
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

test('Development Launcher固定端口不改变Task Preview的端口记忆与无浏览器子进程边界', () => {
  const previewManager: any = read('src/web/application/preview-lifecycle.ts');
  assert.match(previewManager, /optionValue\(args, '--port', '0'\)/u);
  assert.match(previewManager, /'web', '--target', targetRoot, '--port', String\(desiredPort\), '--no-open'/u);
  // 端口记忆只在未显式指定 --port 时生效，且必须通过空闲探测再回退随机。
  assert.match(previewManager, /!explicitPort && port === 0/u);
  assert.match(previewManager, /desiredPort = await probeLoopbackPort\(remembered\) \? remembered : 0/u);
  // 登记播种与端口记忆只写预览实例自身数据目录。
  assert.match(previewManager, /seedPreviewWorkspaces\(root, workspaceRoots\)/u);
  assert.match(previewManager, /writePreferredPort\(instance, startedPort, dataRoot\)/u);
});

test('npm Launcher candidate is registered without a platform distribution dependency', () => {
  const direct: any = createVerificationPlan({ stepIds: ['npm-launcher-candidate'] });
  assert.deepEqual(direct.steps.map((step: any) => step.id), ['npm-launcher-candidate']);
  assert.equal(direct.steps[0].testing.environment.footprints.includes('network'), false);
  assert.ok(direct.steps[0].inputs.includes('src/modules/installation/**'));
});

test('remote text owner includes product re-entry and payload entry boundaries', () => {
  const remote: any = verificationSteps.find((step: any) => step.id === 'remote-skill-timeout');
  for (const input of [
    'src/infrastructure/network/**',
    'src/infrastructure/product-invocation/**',
    'src/bootstrap/cli/main.ts',
    'skills/buildr-release/scripts/application-payload-entry.ts',
  ]) assert.ok(remote.inputs.includes(input), `remote-skill-timeout must own ${input}`);
});

test('release tarball smoke isolates npm cache writes without a Workspace runtime', () => {
  const releaseSmoke: any = read('test/verification/release/package-consumption.ts');
  const platformLauncher: any = read('test/verification/release/platform-launcher-invocation.ts');
  assert.match(releaseSmoke, /npm_config_cache: npmCache/);
  assert.doesNotMatch(releaseSmoke, /BUILDR_NODE_RUNTIME/);
  assert.match(releaseSmoke, /\['install', '--offline', '--global'/);
  assert.match(releaseSmoke, /RELEASE_LAUNCHER_READINESS_TIMEOUT_MS(?:: any)? = 15_000/);
  assert.match(releaseSmoke, /const launcherEnvironment(?:: any)? = \{/);
  assert.match(releaseSmoke, /\.\.\.runtimeEnv/);
  assert.match(platformLauncher, /`PATH=\$\{environment\.PATH\}`/);
  assert.match(releaseSmoke, /preserveLauncherFailureEvidence/);
});

test('Host Node compatibility runs offline without a Workspace Node distribution', () => {
  const packageManifest: any = JSON.parse(read('package.json'));
  const hostNode: any = read('test/verification/host-node.ts');
  const cliSmoke: any = read('test/verification/host-node/cli-consumption.ts');
  const policy: any = read('src/infrastructure/network/verification-network-policy.ts');
  const workflow: any = read('../../../../.github/workflows/verify.yml');
  const hostJob: any = workflow.slice(workflow.indexOf('  candidate-host-node:'), workflow.indexOf('  candidate-gate:'));
  assert.deepEqual(packageManifest.bundleDependencies, ['@vscode/ripgrep-universal', 'ajv', 'mysql2', 'node-sql-parser', 'yaml', '@buildr-ai/buildr-agent']);
  assert.match(hostNode, /enforceOfflineVerification\(\)/);
  const executePlanCall: any = hostNode.slice(hostNode.indexOf('await executePlan('), hostNode.indexOf('results = execution.results'));
  assert.match(executePlanCall, /minimumNodeVersion: null/);
  assert.match(policy, /npm_config_offline = 'true'/);
  assert.match(policy, /BUILDR_VERIFICATION_NETWORK_MODE/);
  assert.match(cliSmoke, /\['install', '--offline', '--global'/);
  assert.doesNotMatch(cliSmoke, /BUILDR_NODE_RUNTIME|workspaceNode/);
  assert.match(cliSmoke, /\[buildrScript, 'web', '--no-open', '--port', '0'\]/);
  assert.match(cliSmoke, /\/api\/v1\/health/);
  assert.match(cliSmoke, /ordinary CLI must not start HTTP/);
  assert.match(cliSmoke, /readiness\.productIdentity\?\.applicationPayloadDigest/);
  assert.doesNotMatch(cliSmoke, /npm pack|createReleaseArtifact|buildApplicationPayload/);
  assert.ok(CANDIDATE_CI_HOST_NODE_TUPLES.some((tuple: any) => tuple.id === 'host-minimum-macos' && tuple.requestedNode === '24.15.0'));
  assert.ok(CANDIDATE_CI_HOST_NODE_TUPLES.some((tuple: any) => tuple.id === 'host-minimum-windows' && tuple.requestedNode === '24.15.0'));
  assert.match(hostJob, /node test\/verification\/candidate-ci\.ts host \$\{\{ matrix\.id \}\}/);
  assert.match(hostJob, /name: candidate-package/);
});

test('runtime adapter contract uses one run-unique temporary root with owner cleanup', () => {
  const source: any = read('test/verification/runtime/adapter-contract.ts');
  assert.equal((source.match(/os\.tmpdir\(\)/g) || []).length, 1);
  assert.match(source, /const temporaryRoot(?:: any)? = fs\.mkdtempSync/);
  assert.match(source, /process\.once\('exit', \(\) => fs\.rmSync\(temporaryRoot, \{ recursive: true, force: true \}\)\)/);
});

test('Candidate source work is independent and all consumers use the one immutable artifact', () => {
  const document = YAML.parse(read('../../../../.github/workflows/verify.yml'));
  assert.equal(document.jobs['candidate-source'].needs, 'candidate-plan');
  assert.deepEqual(document.jobs['candidate-bootstrap'].needs, ['candidate-plan', 'candidate-source']);
  for (const id of ['candidate-artifact-consumers', 'candidate-host-node']) {
    assert.deepEqual(document.jobs[id].needs, ['candidate-plan', 'candidate-bootstrap']);
    assert.equal(document.jobs[id].steps.filter((step: any) => step.with?.name === 'candidate-package').length, 1);
  }
  for (const id of ['candidate-source', 'candidate-artifact-consumers', 'candidate-host-node']) assert.equal(document.jobs[id].strategy['fail-fast'], false);
  assert.equal(CANDIDATE_CI_SHARDS.some((shard: any) => shard.id === 'release-infrastructure-windows'), false);
  assert.deepEqual(document.jobs['candidate-gate'].needs, ['candidate-plan', 'candidate-bootstrap', 'candidate-source', 'candidate-artifact-consumers', 'candidate-host-node', 'plugin-source-candidate']);
  assert.equal(document.jobs['candidate-bootstrap'].if, "always() && needs.candidate-plan.result == 'success' && needs.candidate-plan.outputs.buildr == 'true' && (needs.candidate-source.result == 'success' || needs.candidate-source.result == 'skipped')");
  for (const input of ['artifact_verification', 'local_runner']) assert.ok(document.on.workflow_dispatch.inputs[input]);
  assert.equal(document.env.BUILDR_ARTIFACT_VERIFICATION, "${{ github.event_name == 'workflow_dispatch' && inputs.artifact_verification || '' }}");
  for (const [id, key] of [['candidate-artifact-consumers', 'artifact'], ['candidate-host-node', 'host']]) {
    assert.equal(document.jobs[id!].if, `needs.candidate-plan.outputs.buildr == 'true' && needs.candidate-plan.outputs.${key}_required == 'true'`);
  }
  assert.equal(document.jobs['candidate-source'].if, "needs.candidate-plan.outputs.buildr == 'true' && needs.candidate-plan.outputs.source_required == 'true'");
  for (const key of ['source', 'artifact', 'host']) assert.equal(document.jobs['candidate-plan'].outputs[key + '_required'], '${{ steps.repair.outputs.' + key + '_required || steps.plan.outputs.' + key + '_required }}');
  assert.equal(document.env.BUILDR_SOURCE_VERIFICATION, "${{ github.event_name == 'workflow_dispatch' && inputs.source_verification || '' }}");
  assert.deepEqual(document.jobs['plugin-source-candidate'].needs, ['candidate-plan', 'candidate-bootstrap']);
  assert.equal(document.jobs['plugin-source-candidate'].if, "always() && needs.candidate-plan.result == 'success' && needs.candidate-plan.outputs.plugin == 'true' && (needs.candidate-plan.outputs.candidate_peer != 'true' || needs.candidate-bootstrap.result == 'success')");
  assert.match(document.jobs['candidate-gate'].if, /^always\(\)/);
  for (const [id, job] of Object.entries(document.jobs) as any[]) {
    if (!id.startsWith('candidate-')) continue;
    assert.equal(job.steps.find((step: any) => step.uses === 'actions/checkout@v7').with.ref, '${{ env.CANDIDATE_SOURCE_SHA }}');
  }
  assert.equal(document.jobs['candidate-plan'].steps.some((step: any) => step.run === 'node test/verification/candidate-ci.ts plan'), true);
  for (const input of ['.github/workflows/verify.yml', 'test/verification/verify-buildr-product-ci', 'test/verification/candidate-ci.ts', 'test/verification/candidate-ci-evidence.ts']) assert.ok(VERIFICATION_FULL_SCOPE_INPUTS.includes(input));
});

test('changed ownership authority is physically separate from the Candidate execution graph', () => {
  const registry: any = read('test/verification/registry.ts');
  const ownership: any = read('test/verification/ownership.ts');
  assert.match(registry, /verificationStepOwnership\(definition\.id, definition\.executor\)/u);
  assert.match(ownership, /VERIFICATION_STEP_OWNERSHIP/u);
  for (const step of verificationSteps) assert.ok(step.inputs.length > 0, step.id);
  assert.deepEqual(validateVerificationStepOwnership(verificationSteps), { ok: true, findings: [] });
  assert.equal(validateVerificationStepOwnership([...verificationSteps, { id: 'missing-owner' }]).ok, false);
  assert.ok(VERIFICATION_FULL_SCOPE_INPUTS.includes('test/verification/registry.ts'));
  assert.equal(VERIFICATION_FULL_SCOPE_INPUTS.includes('test/verification/ownership.ts'), true);
  assert.equal(VERIFICATION_FULL_SCOPE_INPUTS.includes('test/verification/timing/budgets.ts'), false);
  assert.ok(VERIFICATION_FULL_SCOPE_INPUTS.includes('test/verification/timing/parallel-runner.ts'));
});

test('Candidate aggregate import graph is clean-checkout Node-only', () => {
  const pending: any[] = ['test/verification/candidate-ci.ts'];
  const visited: any = new Set();
  while (pending.length > 0) {
    const relative: any = pending.pop();
    if (visited.has(relative)) continue;
    visited.add(relative);
    const source: any = read(relative);
    for (const match of source.matchAll(/from\s+['"]([^'"]+)['"]/gu)) {
      const specifier: any = match[1];
      assert.ok(specifier.startsWith('node:') || specifier.startsWith('.'), `${relative} imports external dependency ${specifier}`);
      if (!specifier.startsWith('.')) continue;
      const target: any = path.posix.normalize(path.posix.join(path.posix.dirname(relative), specifier));
      assert.ok(fs.statSync(path.join(productRoot, target), { throwIfNoEntry: false })?.isFile(), `${relative} import is missing: ${target}`);
      pending.push(target);
    }
  }
  assert.ok(visited.has('test/verification/candidate-ci-evidence.ts'));
  assert.ok(visited.has('test/verification/registry.ts'));
});

test('双任务并发验收输出完整的组合证据并执行归属清理', () => {
  const source: any = read('test/verification/concurrency/task-acceptance.ts');
  for (const phrase of [
    'buildr.concurrent-task-acceptance/v2', 'workLocations', 'verificationRuns', 'previews', 'cleanup', 'durationMs',
  ]) assert.ok(source.includes(phrase), phrase);
  assert.ok(source.includes('processesOverlap(verificationResults[0], verificationResults[1])'));
  assert.ok(source.includes("'worktree', 'create'"));
  assert.ok(source.includes('assertPreviewStopOwner'));
  assert.ok(source.includes("'task', 'complete'"));
  assert.equal(source.includes("'task', 'environment'"), false);
  const entry: any = verificationSteps.find((step: any) => step.id === 'concurrent-task-acceptance');
  assert.equal(entry.executor.file, 'test/verification/concurrency/task-acceptance.ts');
  assert.ok(entry.profiles.includes('candidate'));
  assert.ok(entry.resources.includes('workspace-saturating'));
  assert.ok(entry.timeoutMs > 0);
});

test('CLI package parity owns representative equivalence without lifecycle duplication', () => {
  const source: any = read('test/verification/cli/package-parity.ts');
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
  assert.equal(verificationSteps.find((step: any) => step.id === 'cli-package-parity').target, 'artifact');
});

test('package verifier selectors are stable, focused, and fail closed', () => {
  assert.deepEqual(selectPackageVerifiers('static,runtime').map((step: any) => step.id), ['static', 'runtime']);
  assert.throws(() => selectPackageVerifiers('unknown'), /Unknown package verifier/);

});
