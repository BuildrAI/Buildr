#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';

const productRoot: any = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const cli: any = path.join(productRoot, 'bin', 'buildr.mjs');
const root: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-init-onboarding-'));

function run(args: any): any  {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: productRoot,
    encoding: 'utf8',
  });
}

function output(result: any): any  {
  return `${result.stdout || ''}${result.stderr || ''}`;
}

try {
  const unsupported: any = path.join(root, 'unsupported');
  let result: any = run(['init', '--agent', 'unsupported', '--target', unsupported, '--name', 'unsupported']);
  assert.notEqual(result.status, 0, 'unsupported Agent must fail');
  assert.equal(fs.existsSync(unsupported), false, 'unsupported Agent must fail before workspace writes');
  assert.match(output(result), /Supported Agent runtime adapters: claude-code, codex, cursor, qoder, trae, trae-work, workbuddy/);
  assert.match(output(result), /请联系 Buildr 作者反馈该 Agent/);

  const sourceOnly: any = path.join(root, 'source-only');
  result = run(['init', '--target', sourceOnly, '--name', 'source-only', '--profile', 'personal']);
  assert.equal(result.status, 0, output(result));
  assert.equal(fs.existsSync(path.join(sourceOnly, 'projects', 'manifest.yml')), true);
  const workspace: any = YAML.parse(fs.readFileSync(path.join(sourceOnly, '.buildr', 'workspace.yml'), 'utf8'));
  const projects: any = YAML.parse(fs.readFileSync(path.join(sourceOnly, 'projects', 'manifest.yml'), 'utf8'));
  const rules: any = YAML.parse(fs.readFileSync(path.join(sourceOnly, 'rules', 'manifest.yml'), 'utf8'));
  const skills: any = YAML.parse(fs.readFileSync(path.join(sourceOnly, 'skills', 'manifest.yml'), 'utf8'));
  const commands: any = YAML.parse(fs.readFileSync(path.join(sourceOnly, 'commands', 'manifest.yml'), 'utf8'));
  const components: any = YAML.parse(fs.readFileSync(path.join(sourceOnly, 'components', 'manifest.yml'), 'utf8'));
  assert.match(workspace.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu);
  assert.deepEqual(projects, { schemaVersion: 'buildr.projects/v2', projects: {} });
  assert.equal(rules.rules.some((item: any) => item.id === 'buildr-core'), false);
  assert.equal(fs.existsSync(path.join(sourceOnly, 'rules/buildr/core.md')), false);
  assert.match(fs.readFileSync(path.join(sourceOnly, 'AGENTS.md'), 'utf8'), /以可信完成目标的效率衡量性能/);
  assert.equal(skills.workspaceId, workspace.id);
  assert.equal(skills.skills.some((item: any) => item.id === 'task-triage' && item.state === 'installed'), true);
  assert.deepEqual(commands, { schemaVersion: 'buildr.commands/v1', commands: [] });
  assert.equal(components.components.some((item: any) => item.id === 'openspec' && item.state === 'installed'), true);
  assert.equal(fs.existsSync(path.join(sourceOnly, '.agents')), false, 'source-only init must not render Agent runtime');
  assert.match(result.stdout, /仅初始化源资产的后续步骤/);
  assert.match(result.stdout, /buildr sync <agent>/);

  result = run(['project', 'create', 'demo', '--target', sourceOnly]);
  assert.equal(result.status, 0, output(result));
  assert.deepEqual(YAML.parse(fs.readFileSync(path.join(sourceOnly, 'projects', 'demo', 'capabilities.yml'), 'utf8')), {
    schemaVersion: 'buildr.project-capabilities/v1', requires: [], bindings: [], skills: [],
  });
  assert.deepEqual(YAML.parse(fs.readFileSync(path.join(sourceOnly, 'projects', 'demo', 'commands.yml'), 'utf8')), {
    schemaVersion: 'buildr.project-commands/v1', requirements: [],
  });
  const services: any = YAML.parse(fs.readFileSync(path.join(sourceOnly, 'projects', 'demo', 'services', 'manifest.yml'), 'utf8'));
  assert.equal(services.schemaVersion, 'buildr.services/v2');
  assert.match(services.projectId, /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu);
  assert.deepEqual(services.services, {});

  const onboarded: any = path.join(root, 'onboarded');
  result = run(['init', '--agent', 'codex', '--target', onboarded, '--name', 'onboarded', '--profile', 'team']);
  assert.equal(result.status, 0, output(result));
  assert.match(result.stdout, /Buildr onboarding 已完成：codex/);
  assert.match(result.stdout, /doctor 通过/);
  assert.match(result.stdout, /首次使用交接/);
  assert.match(result.stdout, /第一项真实工作/);
  assert.doesNotMatch(result.stdout, /下一步可按需创建 Project/);
  const onboardedAgents: any = fs.readFileSync(path.join(onboarded, 'AGENTS.md'), 'utf8');
  assert.match(onboardedAgents, /Git 提交信息默认使用中文/);
  assert.match(onboardedAgents, /更具体作用域的约定优先于本默认规则/);
  assert.equal(fs.existsSync(path.join(onboarded, '.agents', 'skills', 'buildr', 'SKILL.md')), true);

  result = run(['project', 'create', 'synced', '--target', onboarded]);
  assert.equal(result.status, 0, output(result));
  for (const relative of ['capabilities.yml', 'commands.yml', 'services/manifest.yml']) {
    fs.rmSync(path.join(onboarded, 'projects', 'synced', relative));
  }
  result = run(['sync', 'codex', '--target', onboarded]);
  assert.equal(result.status, 0, output(result));
  for (const relative of ['capabilities.yml', 'commands.yml', 'services/manifest.yml']) {
    assert.equal(fs.existsSync(path.join(onboarded, 'projects', 'synced', relative)), true, `sync must generate missing ${relative}`);
  }

  result = run(['init', '--agent', 'codex', '--target', onboarded, '--name', 'onboarded', '--profile', 'team']);
  assert.equal(result.status, 0, `idempotent init --agent failed:\n${output(result)}`);
  const doctorResult: any = run(['doctor', '--agent', 'codex', '--target', onboarded, '--json', '--detail', 'full']);
  assert.equal(doctorResult.status, 0, output(doctorResult));
  const doctor: any = JSON.parse(doctorResult.stdout);
  assert.equal(doctor.ok, true);
  assert.equal(doctor.summary.error, 0);
  assert.equal(doctor.runtime.codex.some((scope: any) => scope.counts.missing || scope.counts.stale || scope.counts.conflict), false);

  const conflicted: any = path.join(root, 'conflicted');
  const conflictSkill: any = path.join(conflicted, '.agents', 'skills', 'buildr', 'SKILL.md');
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
