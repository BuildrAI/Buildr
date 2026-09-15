import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { registerSystemDoctorApplication, type DoctorDependencies } from '../../src/modules/diagnostics/application/doctor-application.ts';
import { runDoctorCommand } from '../../src/modules/diagnostics/interfaces/cli/doctor.ts';
import { createInstallationCliContributions } from '../../src/modules/installation/interfaces/cli/installation.ts';
import { RUNTIME_ADAPTERS, SUPPORTED_AGENT_IDS, isSupportedAgent } from '../../src/modules/agent-assets/infrastructure/runtime/adapter-contract.ts';

function doctorFixture() {
  const noop = () => {};
  const dependencies: DoctorDependencies = {
    RUNTIME_ADAPTERS, SUPPORTED_AGENT_IDS, isSupportedAgent,
    discoverDoctorScopes: () => [], diagnoseProjectRegistry: () => null,
    diagnoseWorkspace: (result) => { result.workspace = { initialized: false }; },
    diagnoseLegacyPractices: noop, diagnoseHierarchy: noop, diagnoseServices: noop,
    diagnoseRuntime: noop, detectManagedRuntimeAgents: () => [], diagnoseCommands: noop,
    diagnoseComponents: noop, diagnoseSkillsManifestSchemas: noop, diagnoseSkillCapabilities: noop,
    diagnoseProjectVerification: noop, inspectPackageBuiltins: () => ({ findings: [] }),
    finalizeDoctorResult: (result) => { result.ok = false; },
    releaseAwareness: () => ({ notices: [] }), assertAgentId: noop, addDoctorFinding: noop,
    diagnoseRules: noop, diagnoseWorkspaceMetadata: noop, diagnoseMutations: noop,
    buildInstallationInventory: () => ({ channels: {} }), inspectWorkspaceStructuredStore: noop,
  };
  return registerSystemDoctorApplication(dependencies);
}

test('Doctor application返回完整诊断且不输出或修改退出码', (t) => {
  t.mock.method(process.stdout, 'write', () => { throw new Error('application wrote stdout'); });
  t.mock.method(console, 'log', () => { throw new Error('application printed'); });
  const before = process.exitCode;
  const result = doctorFixture().doctor({ targetRoot: path.resolve('.'), scope: '.', agent: 'codex', includeInfo: true });
  assert.equal(result.targetRoot, path.resolve('.'));
  assert.equal(result.scope, '.');
  assert.equal(result.agentRuntime.selected, 'codex');
  assert.equal(result.workspace.initialized, false);
  assert.equal(result.ok, false);
  assert.equal(process.exitCode, before);
});

test('Doctor CLI保持compact/full JSON与失败退出码，非法detail在应用调用前拒绝', (t) => {
  let output = '';
  const before = process.exitCode;
  t.after(() => { process.exitCode = before; });
  t.mock.method(process.stdout, 'write', (chunk: any) => { output += chunk; return true; });
  const application = doctorFixture();
  const args = ['--target', '.', '--agent', 'codex', '--json'];
  const compactResult = runDoctorCommand(application, args);
  const compact = JSON.parse(output);
  assert.equal(compact.schemaVersion, 'buildr.doctor/v1');
  assert.equal(compact.ok, false);
  assert.equal(process.exitCode, 1);
  assert.equal('workspace' in compact, false);
  assert.equal('workspace' in compactResult, true);
  output = '';
  runDoctorCommand(application, [...args, '--detail', 'full']);
  const full = JSON.parse(output);
  assert.equal(full.workspace.initialized, false);
  const rejectApplication = { doctor() { throw new Error('must not call application'); } };
  assert.throws(() => runDoctorCommand(rejectApplication, ['--detail', 'invalid']), /--detail must be compact or full/);
  assert.throws(() => runDoctorCommand(rejectApplication, ['--agent', '..', '--detail', 'invalid']), /Agent id/);
});

test('安装CLI将参数变为结构化输入并拥有JSON与退出状态', async (t) => {
  let output = '';
  let selected: unknown = undefined;
  const before = process.exitCode;
  t.after(() => { process.exitCode = before; });
  t.mock.method(process.stdout, 'write', (chunk: any) => { output += chunk; return true; });
  const inventory = { channels: {}, currentInstance: { status: 'absent' } };
  const application = {
    installationStatus: async (...args: unknown[]) => { assert.deepEqual(args, []); return inventory; },
    updateCheck: (...args: unknown[]) => { assert.deepEqual(args, []); return { status: 'blocked', reason: 'fixture' }; },
    updateBuildr: (input: unknown) => { selected = input; return { status: 'updated' }; },
  };
  const routes = createInstallationCliContributions(application);
  const run = (key: string, args: string[]) => routes.find((route) => route.key === key)!.run(null, { argv: ['node', 'buildr', ...args] });
  assert.equal(await run('installation status', ['installation', 'status', '--json']), inventory);
  assert.deepEqual(JSON.parse(output), { schemaVersion: 'buildr.installation-status/v1', ...inventory });
  output = '';
  run('update check', ['update', 'check', '--json']);
  assert.equal(JSON.parse(output).status, 'blocked');
  assert.equal(process.exitCode, 1);
  output = '';
  run('update', ['update', '--track', 'candidate', '--json']);
  assert.deepEqual(selected, { track: 'candidate' });
  assert.equal(JSON.parse(output).schemaVersion, 'buildr.update/v2');
  assert.throws(() => run('update', ['update', '--track', 'wrong']), /--track must be stable or candidate/);
  assert.throws(() => run('update', ['update', '--target', '.']), /不接收 workspace/);
  await assert.rejects(() => run('installation status', ['installation', 'status', '--unknown']), /Unknown argument/);
});
