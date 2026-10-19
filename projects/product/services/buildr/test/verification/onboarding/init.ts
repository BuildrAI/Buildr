#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { useLegacyAssetCatalog } from '../../helpers/legacy-asset-catalog.ts';

const productRoot: any = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const cli: any = path.join(productRoot, 'bin', 'buildr.mjs');
const root: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-init-onboarding-'));
const appData = path.join(root, 'app-data');
const registryFile = path.join(appData, 'workspace-registry.json');

function run(args: any, environment: Record<string, string> = {}): any  {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: productRoot,
    encoding: 'utf8',
    env: { ...process.env, BUILDR_APP_DATA_DIR: appData, BUILDR_PRODUCT_DATA_DIR: path.join(root, 'product-data'), ...environment },
  });
}

function output(result: any): any  {
  return `${result.stdout || ''}${result.stderr || ''}`;
}

function registry() {
  return JSON.parse(fs.readFileSync(registryFile, 'utf8'));
}

function assertRegistered(target: string) {
  const actual = registry();
  assert.equal(actual.roots.filter((entry: string) => entry === target).length, 1, 'ordinary init must register the actual directory exactly once');
  const workspace = YAML.parse(fs.readFileSync(path.join(target, '.buildr', 'workspace.yml'), 'utf8'));
  const claim = JSON.parse(fs.readFileSync(path.join(target, '.buildr', 'local', 'web-management.json'), 'utf8'));
  assert.equal(claim.workspaceId, workspace.id);
  assert.equal(claim.canonicalRoot, fs.realpathSync(target));
  assert.equal(fs.existsSync(path.join(appData, 'instance.json')), false, 'registration must not start Buildr Web');
  return { actual, workspace, claim };
}

function freshCatalog(target: string): any {
  for (const [file, schemaVersion, key] of [
    ['projects/manifest.yml', 'buildr.projects/v2', 'projects'],
    ['services/manifest.yml', 'buildr.services/v3', 'services'],
    ['repositories/manifest.yml', 'buildr.repositories/v1', 'repositories'],
  ]) {
    assert.deepEqual(YAML.parse(fs.readFileSync(path.join(target, file), 'utf8')), { schemaVersion, [key]: {} });
  }
  const result = run(['assets', 'inspect', '--target', target, '--json']);
  assert.equal(result.status, 0, output(result));
  const catalog = JSON.parse(result.stdout);
  assert.equal(catalog.migrationRequired, false);
  assert.deepEqual([catalog.projects, catalog.services, catalog.repositories], [[], [], []]);
  return catalog;
}

function createFirstProject(target: string, catalog: any): void {
  const input = path.join(root, `${path.basename(target)}-first-project.json`);
  fs.writeFileSync(input, JSON.stringify({ revision: catalog.revision, code: 'first', name: 'First project' }));
  const result = run(['assets', 'create', 'project', '--target', target, '--input', input, '--json']);
  assert.equal(result.status, 0, output(result));
  const created = JSON.parse(result.stdout);
  assert.equal(created.migrationRequired, false);
  assert.equal(created.projects[0].code, 'first');
  assert.ok(fs.existsSync(path.join(target, 'projects/first/AGENTS.md')));
}

try {
  const unsupported: any = path.join(root, 'unsupported-adapter');
  let result: any = run(['init', '--adapter', 'unsupported', '--target', unsupported, '--name', 'unsupported']);
  assert.notEqual(result.status, 0, 'explicit unknown adapter must fail');
  assert.equal(fs.existsSync(unsupported), false, 'unknown adapter must fail before workspace writes');
  assert.match(output(result), /Unsupported runtime adapter: unsupported/);
  result = run(['init', '--agent', 'invalid runtime', '--target', unsupported]);
  assert.notEqual(result.status, 0, 'invalid Agent identity must fail');
  assert.equal(fs.existsSync(unsupported), false, 'invalid Agent identity must fail before workspace writes');
  result = run(['init', '--source-only', '--agent', 'dsh', '--target', unsupported]);
  assert.notEqual(result.status, 0);
  assert.equal(fs.existsSync(unsupported), false, 'mutually exclusive inputs must fail before writes');
  assert.match(output(result), /--source-only cannot be combined/);
  assert.equal(fs.existsSync(registryFile), false, 'invalid initialization must not create a local registry');

  for (const identity of [null, 'dsh', 'new-host']) {
    const standardRoot = path.join(root, identity ?? 'default');
    result = run(['init', ...(identity === null ? [] : ['--agent', identity]), '--target', standardRoot, '--name', 'standard', '--description', 'Standard onboarding fixture']);
    assert.equal(result.status, 0, output(result));
    assertRegistered(standardRoot);
    freshCatalog(standardRoot);
    assert.ok(fs.existsSync(path.join(standardRoot, '.agents', 'skills', 'buildr', 'SKILL.md')));
    assert.ok(fs.existsSync(path.join(standardRoot, '.agents', 'skills', 'task-triage', 'SKILL.md')));
    const checked = run(['doctor', ...(identity === null ? [] : ['--agent', identity]), '--target', standardRoot, '--json']);
    assert.equal(checked.status, 0, output(checked));
    const report = JSON.parse(checked.stdout);
    assert.equal(report.agentRuntime.runtimeId, identity);
    assert.equal(report.agentRuntime.adapterId, 'agents-standard');
    assert.equal(report.health.ready, true, JSON.stringify(report.findings));
  }

  const sourceOnly: any = path.join(root, 'source-only');
  const beforeSourceOnly = fs.readFileSync(registryFile, 'utf8');
  result = run(['init', '--source-only', '--target', sourceOnly, '--name', 'source-only', '--profile', 'personal']);
  assert.equal(result.status, 0, output(result));
  assert.equal(fs.readFileSync(registryFile, 'utf8'), beforeSourceOnly, 'source-only init must leave the existing local registry unchanged');
  assert.equal(fs.existsSync(path.join(sourceOnly, '.buildr', 'local', 'web-management.json')), false, 'source-only init must not claim Web management');
  const sourceOnlyCatalog = freshCatalog(sourceOnly);
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

  createFirstProject(sourceOnly, sourceOnlyCatalog);

  const legacySourceOnly = path.join(root, 'legacy-source-only');
  result = run(['init', '--source-only', '--target', legacySourceOnly, '--name', 'legacy', '--profile', 'personal']);
  assert.equal(result.status, 0, output(result));
  useLegacyAssetCatalog(legacySourceOnly);
  result = run(['project', 'create', 'demo', '--target', legacySourceOnly]);
  assert.equal(result.status, 0, output(result));
  assert.deepEqual(YAML.parse(fs.readFileSync(path.join(legacySourceOnly, 'projects', 'demo', 'capabilities.yml'), 'utf8')), {
    schemaVersion: 'buildr.project-capabilities/v1', requires: [], bindings: [], skills: [],
  });
  assert.deepEqual(YAML.parse(fs.readFileSync(path.join(legacySourceOnly, 'projects', 'demo', 'commands.yml'), 'utf8')), {
    schemaVersion: 'buildr.project-commands/v1', requirements: [],
  });
  const services: any = YAML.parse(fs.readFileSync(path.join(legacySourceOnly, 'projects', 'demo', 'services', 'manifest.yml'), 'utf8'));
  assert.equal(services.schemaVersion, 'buildr.services/v2');
  assert.match(services.projectId, /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu);
  assert.deepEqual(services.services, {});

  const onboarded: any = path.join(root, 'onboarded');
  result = run(['init', '--agent', 'codex', '--target', onboarded, '--name', 'onboarded', '--profile', 'team']);
  assert.equal(result.status, 0, output(result));
  const onboardedRegistration = assertRegistered(onboarded);
  const beforeInvalidInput = fs.readFileSync(registryFile, 'utf8');
  const beforeInvalidClaim = fs.readFileSync(path.join(onboarded, '.buildr', 'local', 'web-management.json'), 'utf8');
  const invalidInputResult = run(['init', '--adapter', 'unsupported', '--target', onboarded]);
  assert.notEqual(invalidInputResult.status, 0);
  assert.equal(fs.readFileSync(registryFile, 'utf8'), beforeInvalidInput, 'invalid inputs must preserve existing registration');
  assert.equal(fs.readFileSync(path.join(onboarded, '.buildr', 'local', 'web-management.json'), 'utf8'), beforeInvalidClaim);
  const onboardedCatalog = freshCatalog(onboarded);
  assert.match(result.stdout, /Buildr onboarding 已完成：codex/);
  assert.match(result.stdout, /已登记到本机 Buildr Web/);
  assert.match(result.stdout, /doctor 通过/);
  assert.match(result.stdout, /首次使用交接/);
  assert.match(result.stdout, /第一项真实工作/);
  assert.doesNotMatch(result.stdout, /下一步可按需创建 Project/);
  const onboardedAgents: any = fs.readFileSync(path.join(onboarded, 'AGENTS.md'), 'utf8');
  assert.match(onboardedAgents, /Git 提交信息默认使用中文/);
  assert.match(onboardedAgents, /更具体作用域的约定优先于本默认规则/);
  assert.equal(fs.existsSync(path.join(onboarded, '.agents', 'skills', 'buildr', 'SKILL.md')), true);

  createFirstProject(onboarded, onboardedCatalog);

  result = run(['sync', 'codex', '--target', legacySourceOnly]);
  assert.equal(result.status, 0, output(result));
  result = run(['project', 'create', 'synced', '--target', legacySourceOnly]);
  assert.equal(result.status, 0, output(result));
  for (const relative of ['capabilities.yml', 'commands.yml', 'services/manifest.yml']) {
    fs.rmSync(path.join(legacySourceOnly, 'projects', 'synced', relative));
  }
  result = run(['sync', 'codex', '--target', legacySourceOnly]);
  assert.equal(result.status, 0, output(result));
  for (const relative of ['capabilities.yml', 'commands.yml', 'services/manifest.yml']) {
    assert.equal(fs.existsSync(path.join(legacySourceOnly, 'projects', 'synced', relative)), true, `sync must generate missing ${relative}`);
  }

  const beforeRepeatedInit = fs.readFileSync(registryFile, 'utf8');
  const beforeRepeatedInitMtime = fs.statSync(registryFile).mtimeMs;
  const beforeRepeatedClaim = fs.readFileSync(path.join(onboarded, '.buildr', 'local', 'web-management.json'), 'utf8');
  result = run(['init', '--agent', 'codex', '--target', onboarded, '--name', 'onboarded', '--profile', 'team']);
  assert.equal(result.status, 0, `idempotent init --agent failed:\n${output(result)}`);
  assert.equal(fs.readFileSync(registryFile, 'utf8'), beforeRepeatedInit, 'repeated init must preserve the existing registry');
  assert.equal(fs.statSync(registryFile).mtimeMs, beforeRepeatedInitMtime, 'repeated init must not rewrite the registry');
  assert.equal(fs.readFileSync(path.join(onboarded, '.buildr', 'local', 'web-management.json'), 'utf8'), beforeRepeatedClaim);
  assert.equal(assertRegistered(onboarded).workspace.id, onboardedRegistration.workspace.id);
  const doctorResult: any = run(['doctor', '--agent', 'codex', '--target', onboarded, '--json', '--detail', 'full']);
  assert.equal(doctorResult.status, 0, output(doctorResult));
  const doctor: any = JSON.parse(doctorResult.stdout);
  assert.equal(doctor.ok, true);
  assert.equal(doctor.summary.error, 0);
  assert.equal(doctor.runtime.agentsStandard.some((scope: any) => scope.counts.missing || scope.counts.stale || scope.counts.conflict), false);

  const conflicted: any = path.join(root, 'conflicted');
  const conflictSkill: any = path.join(conflicted, '.agents', 'skills', 'buildr', 'SKILL.md');
  fs.mkdirSync(path.dirname(conflictSkill), { recursive: true });
  fs.writeFileSync(conflictSkill, '# User-owned Buildr\n');
  result = run(['init', '--agent', 'codex', '--target', conflicted, '--name', 'conflicted', '--profile', 'team']);
  assert.notEqual(result.status, 0, 'runtime conflict must leave onboarding incomplete');
  assert.equal(fs.existsSync(path.join(conflicted, 'projects', 'manifest.yml')), true, 'source initialization must remain available');
  assert.equal(fs.readFileSync(conflictSkill, 'utf8'), '# User-owned Buildr\n', 'runtime conflict must preserve user-owned file');
  assertRegistered(conflicted);
  assert.match(output(result), /Workspace 源资产已初始化，但 codex onboarding 未完成/);
  assert.match(output(result), /本机 Buildr Web 登记已完成/);
  assert.doesNotMatch(output(result), /Buildr onboarding 已完成/);
  assert.match(output(result), new RegExp(`buildr sync codex --adapter agents-standard --target ${conflicted.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));

  const duplicate = path.join(root, 'duplicate-identity');
  fs.cpSync(onboarded, duplicate, {
    recursive: true,
    filter(source) {
      const relative = path.relative(onboarded, source);
      return ![path.join('.buildr', 'local'), '.agents'].some((excluded) => relative === excluded || relative.startsWith(`${excluded}${path.sep}`));
    },
  });
  const beforeDuplicate = fs.readFileSync(registryFile, 'utf8');
  result = run(['init', '--agent', 'codex', '--target', duplicate]);
  assert.notEqual(result.status, 0, 'duplicate identity must leave registration incomplete');
  assert.equal(fs.existsSync(path.join(duplicate, 'projects', 'manifest.yml')), true, 'registration failure must preserve initialized source assets');
  assert.equal(fs.readFileSync(registryFile, 'utf8'), beforeDuplicate, 'registration conflict must not change existing entries');
  assert.equal(fs.existsSync(path.join(duplicate, '.buildr', 'local', 'web-management.json')), false, 'failed registration must not retain a management claim');
  assert.equal(fs.existsSync(path.join(duplicate, '.agents')), false, 'runtime preparation must not run after registration failure');
  assert.match(output(result), /源资产已初始化，但本机 Buildr Web 登记未完成/);
  assert.match(output(result), /同一 Workspace identity 已登记在另一个目录/);
  assert.doesNotMatch(output(result), /Buildr onboarding 已完成/);

  const invalidRegistryData = path.join(root, 'invalid-registry-data');
  const invalidRegistryFile = path.join(invalidRegistryData, 'workspace-registry.json');
  fs.mkdirSync(invalidRegistryData);
  fs.writeFileSync(invalidRegistryFile, '{broken\n');
  const registrationFailure = path.join(root, 'registration-failure');
  result = run(['init', '--agent', 'codex', '--target', registrationFailure], { BUILDR_APP_DATA_DIR: invalidRegistryData });
  assert.notEqual(result.status, 0, 'unreadable registry must leave initialization incomplete');
  assert.equal(fs.existsSync(path.join(registrationFailure, 'projects', 'manifest.yml')), true);
  assert.equal(fs.existsSync(path.join(registrationFailure, '.agents')), false);
  assert.equal(fs.readFileSync(invalidRegistryFile, 'utf8'), '{broken\n', 'registration failure must not overwrite corrupt local state');
  assert.match(output(result), /源资产已初始化，但本机 Buildr Web 登记未完成/);
  assert.match(output(result), /workspace-registry.json is invalid JSON/);
  assert.doesNotMatch(output(result), /Buildr onboarding 已完成/);
  assert.equal(fs.existsSync(path.join(appData, '.peer')), false, 'init must not create another channel registry');

  console.log('Init onboarding verification passed: preflight, source-only compatibility, local registration, idempotency, identity protection, staged failures, and full runtime recovery guidance.');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
