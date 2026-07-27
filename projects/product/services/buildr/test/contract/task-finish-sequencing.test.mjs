import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { advanceConvergenceReceipt, rehearseArchive, scanDeltaCompatibility } from '../../package/targets/workspace/skills/buildr/task-finish/scripts/archive-rehearsal.mjs';
import { FINISH_STEPS } from '../../src/application/task-finish/task-finish-run.mjs';

const serviceRoot = path.resolve(import.meta.dirname, '../..');
const productRoot = path.resolve(serviceRoot, '../..');
const read = (relative) => fs.readFileSync(path.join(serviceRoot, relative), 'utf8');
const finish = read('package/targets/workspace/skills/buildr/task-finish/SKILL.md');
const verification = read('package/targets/workspace/skills/buildr/task-verification/SKILL.md');
const verificationContract = read('package/targets/workspace/skills/contracts/buildr/task-verification/v2.md');

test('Task Finish 把 delivery convergence 放在 final assurance 前', () => {
  const ids = FINISH_STEPS.map((item) => item.id);
  assert.ok(ids.indexOf('contract-convergence') < ids.indexOf('formal-assurance'));
  assert.ok(ids.indexOf('target-convergence') < ids.indexOf('formal-assurance'));
  assert.ok(ids.indexOf('runtime-convergence') < ids.indexOf('formal-assurance'));
  assert.ok(ids.indexOf('formal-assurance') < ids.indexOf('integration-push'));
  assert.match(finish, /正式保证只在 canonical、target、runtime 收敛后执行/);
});

test('verification evidence 表达 archive-sensitive 与 supersession', () => {
  for (const source of [verification, verificationContract]) {
    for (const phrase of ['archive-sensitive', 'implementation-changed', 'target-race', 'verification-failed', 'supersedesEvidence', 'invalidationReason', 'supersessionRelationship']) assert.ok(source.includes(phrase), phrase);
  }
});

test('convergence receipt writer持久化portable executable identity', () => {
  const source = read('src/application/domains/openspec.mjs');
  assert.match(source, /openspecExecutableIdentity/);
  assert.match(source, /sourceKind: executableReference\.startsWith/);
  assert.doesNotMatch(source, /advanceReceipt\('sync-apply', \{ planIdentity: applied\.identity, openspecExecutable \}\)/);
  const receiptFiles = [];
  const walk = (directory) => {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(target);
      else if (entry.name === 'convergence-receipt.json' || entry.name === 'deterministic-convergence.json') receiptFiles.push(target);
    }
  };
  walk(path.join(productRoot, 'openspec/changes'));
  for (const file of receiptFiles) {
    const content = fs.readFileSync(file, 'utf8');
    assert.doesNotMatch(content, /\/(?:Users|home)\/[^/]+\//, path.relative(productRoot, file));
  }
});

test('archive rehearsal 无 delta specs 时返回 not-applicable', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-rehearsal-test-'));
  try {
    fs.mkdirSync(path.join(root, 'openspec/changes/no-specs'), { recursive: true });
    const result = rehearseArchive({ projectRoot: root, change: 'no-specs', owner: 'test' });
    assert.equal(result.status, 'not-applicable');
    assert.equal(result.reason, 'change-has-no-delta-specs');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('archive rehearsal 使用隔离副本并清理成功', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-rehearsal-test-'));
  try {
    fs.mkdirSync(path.join(root, 'openspec/changes/demo/specs/example'), { recursive: true });
    fs.writeFileSync(path.join(root, 'openspec/changes/demo/specs/example/spec.md'), '## ADDED Requirements\n');
    const calls = [];
    const runCommand = (command, args, options) => {
      calls.push({ command, args, cwd: options.cwd });
      return args[0] === '--version' ? { status: 0, stdout: '1.6.0\n', stderr: '' } : { status: 0, stdout: 'archived\n', stderr: '' };
    };
    const result = rehearseArchive({ projectRoot: root, change: 'demo', owner: 'test-owner', openspecCommand: '/bin/echo', runCommand });
    assert.equal(result.status, 'passed');
    assert.equal(result.cleanupStatus, 'cleaned');
    assert.equal(fs.existsSync(result.temporaryRoot), false);
    assert.equal(calls[1].cwd.startsWith(result.temporaryRoot), true);
    assert.equal(fs.existsSync(path.join(root, 'openspec/changes/demo')), true);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('archive rehearsal 保留 cleanup failure 诊断', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-rehearsal-test-'));
  fs.mkdirSync(path.join(root, 'openspec/changes/demo/specs/example'), { recursive: true });
  const io = Object.create(fs);
  io.rmSync = () => { throw new Error('cleanup denied'); };
  const runCommand = (_command, args) => args[0] === '--version' ? { status: 0, stdout: '1.6.0\n', stderr: '' } : { status: 1, stdout: '', stderr: 'scenario mismatch' };
  const result = rehearseArchive({ projectRoot: root, change: 'demo', owner: 'test-owner', openspecCommand: '/bin/echo', io, runCommand });
  assert.equal(result.status, 'failed');
  assert.equal(result.cleanupStatus, 'retained');
  assert.match(result.cleanupError, /cleanup denied/);
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(result.temporaryRoot, { recursive: true, force: true });
});

test('archive rehearsal 在复制前拒绝相对 executable', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-rehearsal-test-'));
  try {
    fs.mkdirSync(path.join(root, 'openspec/changes/demo/specs/example'), { recursive: true });
    const result = rehearseArchive({ projectRoot: root, change: 'demo', openspecCommand: 'openspec' });
    assert.equal(result.status, 'failed');
    assert.equal(result.cleanupStatus, 'not-applicable');
    assert.match(result.error, /绝对路径/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('archive rehearsal 一次聚合全部 MODIFIED Scenario 遗漏', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-rehearsal-test-'));
  try {
    fs.mkdirSync(path.join(root, 'openspec/specs/example'), { recursive: true });
    fs.mkdirSync(path.join(root, 'openspec/changes/demo/specs/example'), { recursive: true });
    fs.writeFileSync(path.join(root, 'openspec/specs/example/spec.md'), '# example\n\n### Requirement: One\ntext\n\n#### Scenario: A\n- **WHEN** a\n- **THEN** a\n\n#### Scenario: B\n- **WHEN** b\n- **THEN** b\n\n### Requirement: Two\ntext\n\n#### Scenario: C\n- **WHEN** c\n- **THEN** c\n');
    fs.writeFileSync(path.join(root, 'openspec/changes/demo/specs/example/spec.md'), '## MODIFIED Requirements\n\n### Requirement: One\ntext\n\n#### Scenario: A\n- **WHEN** a\n- **THEN** a\n\n### Requirement: Two\ntext\n');
    const findings = scanDeltaCompatibility({ sourceRoot: path.join(root, 'openspec'), change: 'demo' });
    assert.equal(findings.length, 2);
    assert.deepEqual(findings.flatMap((entry) => entry.missingScenarios), ['B', 'C']);
    const result = rehearseArchive({ projectRoot: root, change: 'demo', openspecCommand: '/bin/echo' });
    assert.equal(result.status, 'failed');
    assert.equal(result.compatibilityFindings.length, 2);
    assert.equal(result.cleanupStatus, 'not-applicable');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('convergence receipt 固定 pre-sync、canonical-sync、post-sync 顺序并拒绝事后 baseline', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-convergence-test-'));
  try {
    fs.mkdirSync(path.join(root, 'openspec/specs/example'), { recursive: true });
    fs.mkdirSync(path.join(root, 'openspec/changes/demo/specs/example'), { recursive: true });
    fs.writeFileSync(path.join(root, 'openspec/specs/example/spec.md'), '# canonical\n');
    fs.writeFileSync(path.join(root, 'openspec/changes/demo/specs/example/spec.md'), '## ADDED Requirements\n');
    const rehearsal = rehearseArchive({ projectRoot: root, change: 'demo', openspecCommand: '/bin/echo', runCommand: (_command, args) => args[0] === '--version' ? { status: 0, stdout: '1.6.0\n', stderr: '' } : { status: 0, stdout: 'ok\n', stderr: '' } });
    const preSync = advanceConvergenceReceipt({ receipt: rehearsal.convergenceReceipt, sourceRoot: path.join(root, 'openspec'), stage: 'pre-sync' });
    assert.throws(() => advanceConvergenceReceipt({ receipt: preSync, sourceRoot: path.join(root, 'openspec'), stage: 'pre-sync' }), /Invalid convergence transition/);
    fs.writeFileSync(path.join(root, 'openspec/specs/example/spec.md'), '# canonical after sync\n');
    const synced = advanceConvergenceReceipt({ receipt: preSync, sourceRoot: path.join(root, 'openspec'), stage: 'canonical-sync' });
    const postSync = advanceConvergenceReceipt({ receipt: synced, sourceRoot: path.join(root, 'openspec'), stage: 'post-sync' });
    assert.equal(postSync.stage, 'post-sync');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
