import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { after, before, describe, test } from 'node:test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { createRuntime } from '../../src/bootstrap/runtime.mjs';
import { PUBLIC_JSON_SCHEMAS, withJsonSchema } from '../../src/infrastructure/contracts/public-json.mjs';

const productRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const buildr = path.join(productRoot, 'bin', 'buildr.mjs');
const fixtureRuntime = createRuntime();
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-json-contract-context-'));
const fixtureEnv = { ...process.env, BUILDR_APP_DATA_DIR: path.join(fixtureRoot, 'local-app') };
const fixtureContexts = {
  plain: path.join(fixtureRoot, 'plain'),
  codex: path.join(fixtureRoot, 'codex'),
  managed: path.join(fixtureRoot, 'managed'),
};

function run(args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [buildr, ...args], { cwd: productRoot, env: options.env || process.env });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (status) => {
      try {
        assert.equal(status, options.expectedStatus ?? 0, `${args.join(' ')}: ${stderr || stdout}`);
        resolve(options.json === false || !stdout.trim() ? stdout : JSON.parse(stdout));
      } catch (error) {
        reject(error);
      }
    });
  });
}

function fixtureWorkspace(t, context) {
  const root = fs.mkdtempSync(path.join(fixtureRoot, `${context}-case-`));
  fs.cpSync(fixtureContexts[context], root, { recursive: true });
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

before(async () => {
  await run(['init', '--target', fixtureContexts.plain, '--name', 'json-contracts', '--description', 'JSON contracts fixture', '--profile', 'team'], { json: false, env: fixtureEnv });
  fs.cpSync(fixtureContexts.plain, fixtureContexts.codex, { recursive: true });
  fixtureRuntime.renderRuntime('codex', ['--target', fixtureContexts.codex], { productSkill: true });
  fs.cpSync(fixtureContexts.codex, fixtureContexts.managed, { recursive: true });
  fixtureRuntime.renderRuntime('claude-code', ['--target', fixtureContexts.managed], { productSkill: true });
});

after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }));

describe('public JSON contracts', { concurrency: 2 }, () => {

test('JSON helper 只接受登记 schema 和对象 payload', () => {
  assert.deepEqual(withJsonSchema(PUBLIC_JSON_SCHEMAS.doctor, { ok: true }), {
    schemaVersion: 'buildr.doctor/v1',
    ok: true,
  });
  assert.throws(() => withJsonSchema('buildr.unknown/v1', {}), /Unknown public JSON schema/);
  assert.throws(() => withJsonSchema(PUBLIC_JSON_SCHEMAS.doctor, []), /must be an object/);
});

test('全部 workspace JSON command family 输出登记的 schemaVersion', async (t) => {
  const root = fixtureWorkspace(t, 'plain');
  const env = { ...process.env, BUILDR_APP_DATA_DIR: path.join(root, 'local-app') };

  const cases = [
    [['version', '--json'], PUBLIC_JSON_SCHEMAS.version],
    [['unknown-command', '--json'], PUBLIC_JSON_SCHEMAS.cliError, 2],
    [['runtime', 'list', '--json'], PUBLIC_JSON_SCHEMAS.runtimeList],
    [['installation', 'status', '--json'], PUBLIC_JSON_SCHEMAS.installationStatus],
    [['web', 'preview', 'list', '--json'], PUBLIC_JSON_SCHEMAS.localAppPreview],
    [['web', 'launcher', 'status', '--target', root, '--json'], PUBLIC_JSON_SCHEMAS.launcherStatus],
    [['doctor', '--target', root, '--json'], PUBLIC_JSON_SCHEMAS.doctor],
    [['commands', 'check', '--target', root, '--json'], PUBLIC_JSON_SCHEMAS.commandsCheck],
    [['component', 'list', '--target', root, '--json'], PUBLIC_JSON_SCHEMAS.componentList],
    [['component', 'check', 'openspec', '--target', root, '--json'], PUBLIC_JSON_SCHEMAS.componentCheck],
    [['builtin', 'list', '--target', root, '--json'], PUBLIC_JSON_SCHEMAS.builtinList],
    [['task', 'create', 'json-task', '--title', 'JSON Task', '--intent', '验证公开 JSON family', '--target', root, '--json'], PUBLIC_JSON_SCHEMAS.taskRecordResult],
    [['task', 'next', 'json-task', '--target', root, '--json'], PUBLIC_JSON_SCHEMAS.taskEntrySnapshot],
    [['task', 'delivery', 'inspect', 'json-task', '--target', root, '--json'], PUBLIC_JSON_SCHEMAS.taskTerminalDelivery],
    [['task', 'environment', 'plan', 'inspect', 'json-task', '--target', root, '--json'], PUBLIC_JSON_SCHEMAS.taskEnvironmentPlanResult],
    [['task', 'environment', 'inspect', 'json-task', '--target', root, '--json'], PUBLIC_JSON_SCHEMAS.taskEnvironmentResult],
    [['task', 'review', 'inspect', 'json-task', '--target', root, '--json'], PUBLIC_JSON_SCHEMAS.taskReviewOperationResult],
    [['task', 'verification', 'inspect', 'json-task', '--target', root, '--json'], PUBLIC_JSON_SCHEMAS.taskVerificationOperationResult],
  ];
  for (const [args, expected, expectedStatus = 0] of cases) {
    assert.equal((await run(args, { expectedStatus, env })).schemaVersion, expected, args.join(' '));
  }
  const before = await run(['task', 'inspect', 'json-task', '--target', root, '--json'], { env });
  await run(['task', 'delivery', 'inspect', 'json-task', '--target', root, '--json'], { env });
  const after = await run(['task', 'inspect', 'json-task', '--target', root, '--json'], { env });
  assert.equal(after.recordDigest, before.recordDigest);
  assert.deepEqual(after.record, before.record);
});

test('schema registry 覆盖全部当前公开 JSON family', () => {
  assert.equal(PUBLIC_JSON_SCHEMAS.localAppPreview, 'buildr.local-app-preview/v1');
  assert.equal(PUBLIC_JSON_SCHEMAS.launcherStatus, 'buildr.launcher-status/v1');
  assert.deepEqual(Object.keys(PUBLIC_JSON_SCHEMAS).sort(), [
    'builtinList',
    'cliError',
    'commandsCheck',
    'componentCheck',
    'componentList',
    'contributionHandoff',
    'dailyProgressInputExample',
    'dailyProgressInputSchema',
    'dailyProgressInspectResult',
    'dailyProgressListResult',
    'dailyProgressRecordResult',
    'dailyProgressTaskView',
    'doctor',
    'gitWorktreeResult',
    'installationStatus',
    'launcherStatus',
    'localAppPreview',
    'openspecConverge',
    'openspecConvergenceInspect',
    'openspecConvergencePreflight',
    'parentCoordinationResult',
    'parentPlan',
    'parentPlanInputExample',
    'parentPlanInputSchema',
    'parentStartupReadiness',
    'releaseAwareness',
    'runtimeList',
    'taskEntrySnapshot',
    'taskEnvironmentPlanResult',
    'taskEnvironmentResult',
    'taskExecutionRecordBodyFile',
    'taskExecutionRecordDetailView',
    'taskExecutionRecordGcResult',
    'taskExecutionRecordInspectResult',
    'taskExecutionRecordListView',
    'taskExecutionRecordRecoverResult',
    'taskFinishCompactResult',
    'taskFinishResult',
    'taskFinishRun',
    'taskFinishSelfBootstrapInput',
    'taskRecordList',
    'taskRecordResult',
    'taskRecordView',
    'taskRetrospectiveListResult',
    'taskRetrospectiveOperationResult',
    'taskReviewOperationResult',
    'taskTerminalDelivery',
    'taskVerificationOperationResult',
    'update',
    'updateCheck',
    'verificationEvidenceCleanup',
    'verificationExecution',
    'verificationPlan',
    'version',
  ]);
});

test('doctor JSON默认compact且full必须显式请求', async (t) => {
  const root = fixtureWorkspace(t, 'codex');
  const compact = await run(['doctor', '--agent', 'codex', '--target', root, '--json']);
  const explicitCompact = await run(['doctor', '--agent', 'codex', '--target', root, '--json', '--detail', 'compact']);
  assert.deepEqual(compact, explicitCompact);
  assert.deepEqual(Object.keys(compact), [
    'schemaVersion', 'targetRoot', 'scope', 'agentRuntime', 'productInstallation', 'releaseAwareness', 'notices', 'ok', 'summary', 'health', 'domainHealth', 'findings', 'repairPlan', 'nextSteps',
  ]);
  assert.equal(compact.releaseAwareness.schemaVersion, PUBLIC_JSON_SCHEMAS.releaseAwareness);
  assert.equal(compact.releaseAwareness.freshness.status, 'unavailable');
  assert.deepEqual(compact.notices, []);
  assert.equal(compact.health.ready, true, 'Release Awareness unavailable must not block Doctor readiness');
  assert.ok(Array.isArray(compact.domainHealth));
  for (const field of ['workspace', 'capabilities', 'components', 'builtins', 'commandLineTools', 'runtime']) assert.equal(field in compact, false, field);

  const full = await run(['doctor', '--agent', 'codex', '--target', root, '--json', '--detail', 'full']);
  for (const field of ['workspace', 'capabilities', 'components', 'builtins', 'commandLineTools', 'runtime']) assert.equal(field in full, true, field);
  for (const field of ['releaseAwareness', 'notices', 'ok', 'summary', 'health', 'domainHealth', 'findings', 'repairPlan', 'nextSteps']) assert.deepEqual(full[field], compact[field], field);
  const contracts = full.capabilities.graphs.flatMap((graph) => graph.contracts);
  assert.ok(contracts.length > 0);
  assert.ok(contracts.every((contract) => /^[a-f0-9]{64}$/.test(contract.digest)));
});

test('human Doctor separates npm, development, Launcher and Host identities', async (t) => {
  const root = fixtureWorkspace(t, 'codex');
  const appData = path.join(root, 'human-installation-status');
  fs.mkdirSync(appData, { recursive: true });
  const instance = {
    schemaVersion: 'buildr.local-app-instance/v1',
    url: 'http://127.0.0.1:4317',
    secret: 'must-not-be-reported',
    pid: 2147483647,
    launcherIdentity: null,
    productIdentity: {
      channel: 'npm',
      version: '1.2.3',
      protocolIdentity: 'buildr.web-protocol/v1',
      applicationPayloadDigest: `sha256-${'a'.repeat(64)}`,
      installationIdentity: `sha256-${'b'.repeat(64)}`,
      runtime: {
        role: 'host',
        version: '24.15.0',
        executable: '/usr/local/bin/node',
        identity: `sha256-${'c'.repeat(64)}`,
      },
    },
  };
  fs.writeFileSync(path.join(appData, 'instance.json'), `${JSON.stringify(instance, null, 2)}\n`);
  const env = { ...process.env, BUILDR_APP_DATA_DIR: appData };
  const output = await run(['doctor', '--agent', 'codex', '--target', root], { json: false, env });
  for (const expected of [
    'Product installations:',
    'npm: channel=npm',
    'development: channel=development',
    'npm launcher: status=',
    'current instance: status=',
    'Runtime identities:',
    'Host Node:',
    'Development Node:',
    'Current main process:',
    'current instance: status=stale',
    'identity: Buildr=1.2.3 protocol=buildr.web-protocol/v1',
    `payload=sha256-${'a'.repeat(64)} ownership=sha256-${'b'.repeat(64)}`,
    'runtime: role=host Node=24.15.0 executable=/usr/local/bin/node',
  ]) assert.equal(output.includes(expected), true, expected);
  assert.equal(output.includes(instance.secret), false);

  const status = await run(['installation', 'status'], { json: false, env });
  for (const expected of [
    'npm: channel=npm status=',
    'development: channel=development status=',
    'npm launcher: status=',
    'current installation: channel=development status=current',
    'current instance: status=stale readiness=not-probed',
    'identity: channel=npm Buildr=1.2.3 protocol=buildr.web-protocol/v1',
    `payload=sha256-${'a'.repeat(64)} ownership=sha256-${'b'.repeat(64)}`,
    'runtime: role=host Node=24.15.0 executable=/usr/local/bin/node',
  ]) assert.equal(status.includes(expected), true, expected);
  assert.equal(status.includes(instance.secret), false);
});

test('doctor 严格报告 workspace identity 与独立 readiness', async (t) => {
  const root = fixtureWorkspace(t, 'plain');

  const initialized = await run(['doctor', '--target', root, '--json', '--detail', 'full']);
  assert.equal(initialized.workspace.identity.state, 'valid');
  assert.equal(initialized.workspace.initialized, true);
  assert.equal(initialized.health.workspaceValid, true);
  assert.equal(typeof initialized.health.ready, 'boolean');
  assert.deepEqual(Object.keys(initialized.diagnosticProfile).sort(), ['conditional', 'core', 'id', 'specialty']);
  assert.deepEqual(initialized.agentRuntime.detectedAgents, []);
  assert.deepEqual(initialized.agentRuntime.checkedAgents, []);
  assert.equal(initialized.agentRuntime.diagnosticMode, 'managed-runtime-inventory');
  assert.equal(Object.values(initialized.runtime).every((items) => items.length === 0), true);
  assert.equal(initialized.findings.some((finding) => finding.code.startsWith('runtime.')), false);

  fs.rmSync(path.join(root, '.buildr', 'workspace.yml'));
  const incomplete = await run(['doctor', '--target', root, '--json', '--detail', 'full'], { expectedStatus: 1 });
  assert.equal(incomplete.ok, false);
  assert.equal(incomplete.workspace.initialized, false);
  assert.equal(incomplete.workspace.identity.state, 'incomplete');
  assert.deepEqual(incomplete.workspace.identity.missing, ['.buildr/workspace.yml']);
  assert.equal(incomplete.health.workspaceValid, false);
  assert.equal(incomplete.health.ready, false);
  assert.equal(incomplete.health.actionRequired, true);
  assert.ok(incomplete.findings.some((finding) => finding.code === 'workspace.identity_incomplete'));

  fs.rmSync(path.join(root, 'AGENTS.md'));
  fs.rmSync(path.join(root, 'projects'), { recursive: true, force: true });
  const absent = await run(['doctor', '--target', root, '--json', '--detail', 'full'], { expectedStatus: 1 });
  assert.equal(absent.workspace.identity.state, 'absent');
  assert.deepEqual(absent.workspace.identity.missing, ['AGENTS.md', '.buildr/workspace.yml', 'projects']);
  assert.ok(absent.findings.some((finding) => finding.code === 'workspace.not_initialized'));
});

test('Codex partial inventory 作为 assurance metadata 保留且不产生 doctor warning', async (t) => {
  const root = fixtureWorkspace(t, 'codex');

  const report = await run(['doctor', '--agent', 'codex', '--target', root, '--json', '--detail', 'full']);
  assert.equal(report.findings.some((finding) => finding.code === 'runtime.codex_warning'), false);
  assert.equal(report.summary.warning, 0);
  assert.deepEqual(report.runtime.codex[0].skillInventoryEvidence, {
    evidence: 'partial',
    roots: [
      { source: 'workspace', destination: 'workspace' },
      { source: 'user', destination: 'user' },
    ],
    opaqueSources: ['admin', 'system', 'plugin'],
    precedence: 'not-guaranteed',
  });
  assert.equal(report.health.ready, true);
  assert.equal(report.health.actionRequired, false);
  assert.equal(report.health.actionableCount, 0);
  assert.deepEqual(report.repairPlan, []);
  assert.deepEqual(report.nextSteps, []);
});

test('doctor 从 canonical 所有权回执发现 runtime，并明确报告旧路径迁移与 dual conflict', async (t) => {
  const root = fixtureWorkspace(t, 'codex');
  const canonicalRoot = path.join(root, '.buildr', 'agent-runtime', 'workspace', 'codex', 'skill-projection-ownership-receipts');
  const legacyRoot = path.join(root, '.agents', 'buildr', 'skill-projection-receipts', 'codex');
  fs.mkdirSync(path.dirname(legacyRoot), { recursive: true });
  fs.renameSync(canonicalRoot, legacyRoot);

  const legacyOnly = await run(['doctor', '--agent', 'codex', '--target', root, '--json', '--detail', 'full']);
  assert.deepEqual(legacyOnly.agentRuntime.detectedAgents, ['codex']);
  const runtimeFindings = legacyOnly.runtime.codex.flatMap((scope) => scope.findings);
  assert.ok(runtimeFindings.some((finding) => finding.code === 'runtime.skill_projection_ownership_receipt_missing'));
  assert.ok(runtimeFindings.some((finding) => finding.code === 'runtime.skill_projection_ownership_receipt_legacy'));

  const legacyFile = fs.readdirSync(legacyRoot, { recursive: true })
    .map((relative) => path.join(legacyRoot, relative))
    .find((file) => fs.existsSync(file) && fs.lstatSync(file).isFile() && file.endsWith('.json'));
  const relative = path.relative(legacyRoot, legacyFile);
  const canonicalFile = path.join(canonicalRoot, relative);
  const conflicting = JSON.parse(fs.readFileSync(legacyFile, 'utf8'));
  conflicting.sourceIdentity = 'conflicting-owner';
  fs.mkdirSync(path.dirname(canonicalFile), { recursive: true });
  fs.writeFileSync(canonicalFile, `${JSON.stringify(conflicting, null, 2)}\n`);

  const conflict = await run(['doctor', '--agent', 'codex', '--target', root, '--json', '--detail', 'full'], { expectedStatus: 1 });
  assert.match(JSON.stringify(conflict), /canonical and legacy receipts differ/);
});

test('doctor 默认只盘点受管 runtime，显式 agent 才把对应 drift 变为可操作项', async (t) => {
  const root = fixtureWorkspace(t, 'managed');

  const healthy = await run(['doctor', '--target', root, '--json']);
  assert.deepEqual(healthy.agentRuntime.detectedAgents, ['claude-code', 'codex']);
  assert.deepEqual(healthy.agentRuntime.checkedAgents, ['claude-code', 'codex']);
  assert.equal(healthy.agentRuntime.diagnosticMode, 'managed-runtime-inventory');

  const claudeBridge = path.join(root, 'CLAUDE.md');
  fs.writeFileSync(claudeBridge, fs.readFileSync(claudeBridge, 'utf8').replace('@AGENTS.md', '@BROKEN.md'));

  const inventory = await run(['doctor', '--target', root, '--json']);
  const inventoryDrift = inventory.findings.find((finding) => finding.code === 'runtime.claude_code_stale');
  assert.ok(inventoryDrift);
  assert.equal(inventoryDrift.userActionRequired, false);
  assert.equal(inventory.health.ready, true);
  assert.equal(inventory.health.actionRequired, false);
  assert.equal(inventory.health.actionableCount, 0);
  assert.deepEqual(inventory.repairPlan, []);
  assert.deepEqual(inventory.nextSteps, []);

  const selected = await run(['doctor', '--agent', 'claude-code', '--target', root, '--json']);
  const selectedDrift = selected.findings.find((finding) => finding.code === 'runtime.claude_code_stale');
  assert.deepEqual(selected.agentRuntime.detectedAgents, ['claude-code', 'codex']);
  assert.deepEqual(selected.agentRuntime.checkedAgents, ['claude-code']);
  assert.equal(selected.agentRuntime.diagnosticMode, 'selected-runtime');
  assert.ok(selectedDrift);
  assert.equal(selectedDrift.userActionRequired, true);
  assert.equal(selected.health.ready, false);
  assert.equal(selected.health.actionRequired, true);
  assert.equal(selected.health.actionableCount, 1);
  assert.equal(selected.repairPlan.length, 1);
  assert.equal(selected.nextSteps.length, 1);
});

test('doctor 对未登记 Project 只报告登记根因并输出去重 repair plan', async (t) => {
  const root = fixtureWorkspace(t, 'plain');
  fs.mkdirSync(path.join(root, 'projects', 'orphan'), { recursive: true });

  const report = await run(['doctor', '--target', root, '--json']);
  const orphanCodes = report.findings
    .filter((finding) => finding.path === 'projects/orphan')
    .map((finding) => finding.code);
  assert.deepEqual(orphanCodes, ['projects.unregistered']);
  assert.equal(report.health.workspaceValid, true);
  assert.equal(report.health.ready, false);
  assert.equal(report.health.actionRequired, true);
  assert.equal(report.repairPlan.filter((step) => step.codes.includes('projects.unregistered')).length, 1);
  assert.equal(report.nextSteps.filter((step) => step.codes.includes('projects.unregistered')).length, 1);

  const textReport = await run(['doctor', '--target', root], { json: false });
  assert.match(textReport, /Health: workspaceValid=true ready=false actionRequired=true/);
  assert.match(textReport, /Repair plan:/);
});

});
