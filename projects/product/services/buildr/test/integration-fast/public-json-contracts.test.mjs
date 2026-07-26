import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { describe, test } from 'node:test';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { PUBLIC_JSON_SCHEMAS, withJsonSchema } from '../../src/application/json-contracts.mjs';

const productRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const buildr = path.join(productRoot, 'bin', 'buildr.mjs');

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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-json-contracts-'));
  const env = { ...process.env, BUILDR_APP_DATA_DIR: path.join(root, 'local-app') };
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  await run(['init', '--target', root, '--name', 'json-contracts', '--description', 'JSON contracts fixture', '--profile', 'team'], { json: false, env });

  const cases = [
    [['version', '--json'], PUBLIC_JSON_SCHEMAS.version],
    [['unknown-command', '--json'], PUBLIC_JSON_SCHEMAS.cliError, 2],
    [['runtime', 'list', '--json'], PUBLIC_JSON_SCHEMAS.runtimeList],
    [['app', 'preview', 'list', '--json'], PUBLIC_JSON_SCHEMAS.localAppPreview],
    [['app', 'launcher', 'status', '--target', root, '--json'], PUBLIC_JSON_SCHEMAS.launcherStatus],
    [['doctor', '--target', root, '--json'], PUBLIC_JSON_SCHEMAS.doctor],
    [['commands', 'check', '--target', root, '--json'], PUBLIC_JSON_SCHEMAS.commandsCheck],
    [['component', 'list', '--target', root, '--json'], PUBLIC_JSON_SCHEMAS.componentList],
    [['component', 'check', 'openspec', '--target', root, '--json'], PUBLIC_JSON_SCHEMAS.componentCheck],
    [['builtin', 'list', '--target', root, '--json'], PUBLIC_JSON_SCHEMAS.builtinList],
  ];
  for (const [args, expected, expectedStatus = 0] of cases) {
    assert.equal((await run(args, { expectedStatus, env })).schemaVersion, expected, args.join(' '));
  }
});

test('schema registry 覆盖全部当前公开 JSON family', () => {
  assert.deepEqual(Object.keys(PUBLIC_JSON_SCHEMAS).sort(), [
    'builtinList',
    'cliError',
    'commandsCheck',
    'componentCheck',
    'componentList',
    'doctor',
    'launcherStatus',
    'localAppPreview',
    'openspecBaseline',
    'openspecCheck',
    'openspecConverge',
    'openspecSyncApply',
    'openspecSyncPlan',
    'runtimeList',
    'taskEnvironmentAdoption',
    'taskEnvironmentContext',
    'taskFinishCheckpoint',
    'taskFinishCompletion',
    'taskFinishObservation',
    'taskFinishRecovery',
    'update',
    'updateCheck',
    'version',
    'worktreeCreate',
  ]);
});

test('doctor 严格报告 workspace identity 与独立 readiness', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-doctor-identity-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  await run(['init', '--target', root, '--name', 'doctor-identity', '--description', 'Doctor identity fixture', '--profile', 'team'], { json: false });

  const initialized = await run(['doctor', '--target', root, '--json']);
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
  const incomplete = await run(['doctor', '--target', root, '--json'], { expectedStatus: 1 });
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
  const absent = await run(['doctor', '--target', root, '--json'], { expectedStatus: 1 });
  assert.equal(absent.workspace.identity.state, 'absent');
  assert.deepEqual(absent.workspace.identity.missing, ['AGENTS.md', '.buildr/workspace.yml', 'projects']);
  assert.ok(absent.findings.some((finding) => finding.code === 'workspace.not_initialized'));
});

test('Codex partial inventory 作为 assurance metadata 保留且不产生 doctor warning', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-doctor-partial-inventory-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  await run(['init', '--agent', 'codex', '--target', root, '--name', 'doctor-partial-inventory', '--description', 'Doctor partial inventory fixture', '--profile', 'team'], { json: false });

  const report = await run(['doctor', '--agent', 'codex', '--target', root, '--json']);
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

test('doctor 默认只盘点受管 runtime，显式 agent 才把对应 drift 变为可操作项', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-doctor-managed-runtimes-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  await run(['init', '--agent', 'codex', '--target', root, '--name', 'doctor-managed-runtimes', '--description', 'Doctor managed runtimes fixture', '--profile', 'team'], { json: false });
  await run(['sync', 'claude-code', '--target', root], { json: false });

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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-doctor-orphan-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  await run(['init', '--target', root, '--name', 'doctor-orphan', '--description', 'Doctor orphan fixture', '--profile', 'team'], { json: false });
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
