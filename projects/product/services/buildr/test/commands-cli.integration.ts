import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import YAML from 'yaml';

const buildr: any = path.resolve('bin/buildr.mjs');

function run(args: any, expected: any = 0): any  {
  const result: any = spawnSync(process.execPath, [buildr, ...args], { encoding: 'utf8' });
  assert.equal(result.status, expected, `buildr ${args.join(' ')}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  return result;
}

function writeRequirements(root: any, project: any, requirements: any): any  {
  fs.writeFileSync(path.join(root, 'projects', project, 'commands.yml'), YAML.stringify({
    schemaVersion: 'buildr.project-commands/v1',
    requirements,
  }));
}

function check(root: any, projects: any = [], expected: any = 0): any  {
  const args: any[] = ['commands', 'check', '--target', root, '--json'];
  for (const project of projects) args.push('--project', project);
  return JSON.parse(run(args, expected).stdout);
}

test('Commands CLI 分离 catalog、Project requirements 和 machine observations', (t: any) => {
  const root: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-commands-context-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  run(['init', '--target', root, '--name', 'commands-context', '--profile', 'personal']);
  for (const project of ['alpha', 'beta', 'legacy']) run(['project', 'create', project, '--target', root]);
  assert.deepEqual(YAML.parse(fs.readFileSync(path.join(root, 'projects', 'alpha', 'commands.yml'), 'utf8')), {
    schemaVersion: 'buildr.project-commands/v1', requirements: [],
  });

  run(['commands', 'add', 'node', '--purpose', 'Node runtime', '--executable', 'node', '--version-constraint', '>=20.0.0', '--version-args', '--version', '--target', root]);
  run(['commands', 'add', 'optional-missing', '--purpose', 'Optional fixture', '--executable', 'definitely-not-installed-buildr-fixture', '--target', root]);
  writeRequirements(root, 'alpha', [
    { id: 'node', required: true, version: '>=20.0.0', purpose: 'Build alpha' },
    { id: 'optional-missing', required: false },
  ]);
  writeRequirements(root, 'beta', [{ id: 'node', required: false, version: '<30.0.0' }]);
  for (const relative of ['capabilities.yml', 'commands.yml', 'services/manifest.yml']) {
    fs.rmSync(path.join(root, 'projects', 'legacy', relative));
  }

  const rootCheck: any = check(root);
  assert.deepEqual(rootCheck.context.projects, []);
  assert.ok(rootCheck.catalog.definitions.some((item: any) => item.id === 'node'));
  assert.ok(rootCheck.requirements.some((item: any) => item.project === 'alpha' && item.applicable === false));
  assert.ok(rootCheck.findings.some((item: any) => item.code === 'commands.project_context_missing' && item.project === 'legacy'));
  assert.equal(rootCheck.observations.some((item: any) => item.id === 'optional-missing'), false, 'root context must not probe unrelated Project requirements');

  const alpha: any = check(root, ['alpha']);
  assert.equal(alpha.effectiveConstraints.find((item: any) => item.id === 'optional-missing').required, false);
  assert.equal(alpha.observations.find((item: any) => item.id === 'optional-missing').reason, 'command_executable_missing');
  assert.ok(alpha.requirements.find((item: any) => item.project === 'alpha').provenance.path.endsWith('projects/alpha/commands.yml'));
  const projectDoctor: any = JSON.parse(run(['doctor', '--scope', 'projects/alpha', '--target', root, '--json', '--detail', 'full']).stdout);
  assert.deepEqual(projectDoctor.commandLineTools.context.projects, ['alpha']);
  assert.equal(projectDoctor.commandLineTools.observations.find((item: any) => item.id === 'optional-missing').reason, 'command_executable_missing');
  assert.ok(projectDoctor.findings.some((item: any) => item.code === 'commands.executable_missing' && item.commandId === 'optional-missing'));
  const rootDoctor: any = JSON.parse(run(['doctor', '--scope', '.', '--target', root, '--json', '--detail', 'full']).stdout);
  assert.deepEqual(rootDoctor.commandLineTools.context.projects, []);
  assert.equal(rootDoctor.findings.some((item: any) => item.commandId === 'optional-missing'), false, 'unrelated Project machine warning must not pollute root doctor');

  const combined: any = check(root, ['alpha', 'beta']);
  assert.equal(combined.effectiveConstraints.find((item: any) => item.id === 'node').constraint, '>=20.0.0 <30.0.0');
  assert.equal(combined.effectiveConstraints.find((item: any) => item.id === 'node').required, true);

  writeRequirements(root, 'beta', [{ id: 'node', version: '<20.0.0' }]);
  const conflict: any = check(root, ['alpha', 'beta'], 1);
  assert.ok(conflict.findings.some((item: any) => item.reason === 'command_requirement_conflict'));
  assert.deepEqual(conflict.observations, [], 'context conflict must stop every machine probe');
  check(root, ['alpha', 'alpha'], 1);
  check(root, ['not-registered'], 1);

  run(['project', 'create', 'legacy', '--target', root]);
  assert.equal(fs.existsSync(path.join(root, 'projects', 'legacy', 'commands.yml')), true, 'project create must safely repair the empty baseline');
  assert.equal(fs.existsSync(path.join(root, 'projects', 'legacy', 'capabilities.yml')), true, 'project create must repair the capability registry through its domain renderer');
  assert.equal(fs.existsSync(path.join(root, 'projects', 'legacy', 'services', 'manifest.yml')), true, 'project create must repair the service registry through its domain writer');
});

test('Command 与 Component removal 在 Project 反向引用存在时零写入', (t: any) => {
  const root: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-commands-references-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  run(['init', '--agent', 'codex', '--target', root, '--name', 'commands-references', '--profile', 'personal']);
  run(['project', 'create', 'demo', '--target', root]);
  run(['commands', 'add', 'plain-tool', '--purpose', 'Plain tool', '--target', root]);
  run(['commands', 'add', 'orphan-tool', '--purpose', 'Orphan tool', '--target', root]);
  writeRequirements(root, 'demo', [{ id: 'plain-tool' }, { id: 'openspec', required: false }]);

  const commandManifest: any = path.join(root, 'commands', 'manifest.yml');
  const commandBefore: any = fs.readFileSync(commandManifest, 'utf8');
  const blockedRemove: any = run(['commands', 'remove', 'plain-tool', '--target', root], 1);
  assert.match(blockedRemove.stderr, /Project demo/);
  assert.equal(fs.readFileSync(commandManifest, 'utf8'), commandBefore);

  const componentRegistry: any = path.join(root, 'components', 'manifest.yml');
  const componentBefore: any = fs.readFileSync(componentRegistry, 'utf8');
  const blockedComponent: any = run(['component', 'uninstall', 'openspec', '--agent', 'codex', '--target', root], 1);
  assert.match(blockedComponent.stderr, /Command definitions are referenced/);
  assert.equal(fs.readFileSync(componentRegistry, 'utf8'), componentBefore);

  fs.writeFileSync(path.join(root, 'projects', 'demo', 'commands.yml'), 'schemaVersion: buildr.project-commands/v1\n');
  const beforeInvalidContext: any = fs.readFileSync(commandManifest, 'utf8');
  const invalidContextRemove: any = run(['commands', 'remove', 'orphan-tool', '--target', root], 1);
  assert.match(invalidContextRemove.stderr, /引用关系不可验证|unverifiable Project context/);
  assert.equal(fs.readFileSync(commandManifest, 'utf8'), beforeInvalidContext);

  writeRequirements(root, 'demo', []);
  run(['commands', 'remove', 'plain-tool', '--target', root]);
  run(['commands', 'remove', 'orphan-tool', '--target', root]);
  assert.deepEqual(YAML.parse(fs.readFileSync(commandManifest, 'utf8')).commands, []);
});
