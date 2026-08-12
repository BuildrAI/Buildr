#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const productRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const cli = path.join(productRoot, 'bin', 'buildr.mjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-init-onboarding-'));

function run(args) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: productRoot,
    encoding: 'utf8',
  });
}

function output(result) {
  return `${result.stdout || ''}${result.stderr || ''}`;
}

try {
  const unsupported = path.join(root, 'unsupported');
  let result = run(['init', '--agent', 'unsupported', '--target', unsupported, '--name', 'unsupported']);
  assert.notEqual(result.status, 0, 'unsupported Agent must fail');
  assert.equal(fs.existsSync(unsupported), false, 'unsupported Agent must fail before workspace writes');
  assert.match(output(result), /Supported Agent runtime adapters: claude-code, codex, cursor, qoder, trae, trae-work, workbuddy/);
  assert.match(output(result), /请联系 Buildr 作者反馈该 Agent/);

  const sourceOnly = path.join(root, 'source-only');
  result = run(['init', '--target', sourceOnly, '--name', 'source-only', '--profile', 'personal']);
  assert.equal(result.status, 0, output(result));
  assert.equal(fs.existsSync(path.join(sourceOnly, 'projects', 'manifest.yml')), true);
  assert.equal(fs.existsSync(path.join(sourceOnly, '.agents')), false, 'source-only init must not render Agent runtime');
  assert.match(result.stdout, /仅初始化源资产的后续步骤/);
  assert.match(result.stdout, /buildr sync <agent>/);

  const onboarded = path.join(root, 'onboarded');
  result = run(['init', '--agent', 'codex', '--target', onboarded, '--name', 'onboarded', '--profile', 'team']);
  assert.equal(result.status, 0, output(result));
  assert.match(result.stdout, /Buildr onboarding 已完成：codex/);
  assert.match(result.stdout, /doctor 通过/);
  assert.match(result.stdout, /首次使用交接/);
  assert.match(result.stdout, /第一项真实工作/);
  assert.doesNotMatch(result.stdout, /下一步可按需创建 Project/);
  assert.equal(fs.existsSync(path.join(onboarded, '.agents', 'skills', 'buildr', 'SKILL.md')), true);

  result = run(['init', '--agent', 'codex', '--target', onboarded, '--name', 'onboarded', '--profile', 'team']);
  assert.equal(result.status, 0, `idempotent init --agent failed:\n${output(result)}`);
  const doctorResult = run(['doctor', '--agent', 'codex', '--target', onboarded, '--json', '--detail', 'full']);
  assert.equal(doctorResult.status, 0, output(doctorResult));
  const doctor = JSON.parse(doctorResult.stdout);
  assert.equal(doctor.ok, true);
  assert.equal(doctor.summary.error, 0);
  assert.equal(doctor.runtime.codex.some((scope) => scope.counts.missing || scope.counts.stale || scope.counts.conflict), false);

  const conflicted = path.join(root, 'conflicted');
  const conflictSkill = path.join(conflicted, '.agents', 'skills', 'buildr', 'SKILL.md');
  fs.mkdirSync(path.dirname(conflictSkill), { recursive: true });
  fs.writeFileSync(conflictSkill, '# User-owned Buildr\n');
  result = run(['init', '--agent', 'codex', '--target', conflicted, '--name', 'conflicted', '--profile', 'team']);
  assert.notEqual(result.status, 0, 'runtime conflict must leave onboarding incomplete');
  assert.equal(fs.existsSync(path.join(conflicted, 'projects', 'manifest.yml')), true, 'source initialization must remain available');
  assert.equal(fs.readFileSync(conflictSkill, 'utf8'), '# User-owned Buildr\n', 'runtime conflict must preserve user-owned file');
  assert.match(output(result), /Workspace 源资产已初始化，但 codex onboarding 未完成/);
  assert.match(output(result), new RegExp(`buildr sync codex --target ${conflicted.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));

  console.log('Init onboarding verification passed: preflight, source-only compatibility, full runtime, idempotency, and recovery guidance.');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
