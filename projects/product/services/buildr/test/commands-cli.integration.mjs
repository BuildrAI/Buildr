import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import YAML from 'yaml';

const buildr = path.resolve('bin/buildr.mjs');
const testAppDataRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-cli-appdata-'));
const testNodeRuntimeSourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-cli-node-runtime-'));
fs.cpSync(path.dirname(process.execPath), testNodeRuntimeSourceRoot, { recursive: true, dereference: true });

function run(args, expected = 0, env = {}) {
  const result = spawnSync(process.execPath, [buildr, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      BUILDR_NODE_RUNTIME_SOURCE_ROOT: testNodeRuntimeSourceRoot,
      BUILDR_APP_DATA_DIR: testAppDataRoot,
      LOCALAPPDATA: testAppDataRoot,
      APPDATA: testAppDataRoot,
      ...env,
    },
  });
  assert.equal(result.status, expected, `buildr ${args.join(' ')}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`);
  return result;
}

function writeRequirements(root, project, requirements) {
  fs.writeFileSync(path.join(root, 'projects', project, 'commands.yml'), YAML.stringify({
    schemaVersion: 'buildr.project-commands/v1',
    requirements,
  }));
}

function check(root, projects = [], expected = 0) {
  const args = ['commands', 'check', '--target', root, '--json'];
  for (const project of projects) args.push('--project', project);
  return JSON.parse(run(args, expected).stdout);
}

test('Commands CLI 分离 catalog、Project requirements 和 machine observations', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-commands-context-'));
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
  fs.rmSync(path.join(root, 'projects', 'legacy', 'commands.yml'));

  const rootCheck = check(root);
  assert.deepEqual(rootCheck.context.projects, []);
  assert.ok(rootCheck.catalog.definitions.some((item) => item.id === 'node'));
  assert.ok(rootCheck.requirements.some((item) => item.project === 'alpha' && item.applicable === false));
  assert.ok(rootCheck.findings.some((item) => item.code === 'commands.project_context_missing' && item.project === 'legacy'));
  assert.equal(rootCheck.observations.some((item) => item.id === 'optional-missing'), false, 'root context must not probe unrelated Project requirements');

  const alpha = check(root, ['alpha']);
  assert.equal(alpha.effectiveConstraints.find((item) => item.id === 'optional-missing').required, false);
  assert.equal(alpha.observations.find((item) => item.id === 'optional-missing').reason, 'command_executable_missing');
  assert.ok(alpha.requirements.find((item) => item.project === 'alpha').provenance.path.endsWith('projects/alpha/commands.yml'));
  const projectDoctor = JSON.parse(run(['doctor', '--scope', 'projects/alpha', '--target', root, '--json']).stdout);
  assert.deepEqual(projectDoctor.commandLineTools.context.projects, ['alpha']);
  assert.equal(projectDoctor.commandLineTools.observations.find((item) => item.id === 'optional-missing').reason, 'command_executable_missing');
  assert.ok(projectDoctor.findings.some((item) => item.code === 'commands.executable_missing' && item.commandId === 'optional-missing'));
  const rootDoctor = JSON.parse(run(['doctor', '--scope', '.', '--target', root, '--json']).stdout);
  assert.deepEqual(rootDoctor.commandLineTools.context.projects, []);
  assert.equal(rootDoctor.findings.some((item) => item.commandId === 'optional-missing'), false, 'unrelated Project machine warning must not pollute root doctor');

  const combined = check(root, ['alpha', 'beta']);
  assert.equal(combined.effectiveConstraints.find((item) => item.id === 'node').constraint, '>=20.0.0 <30.0.0');
  assert.equal(combined.effectiveConstraints.find((item) => item.id === 'node').required, true);

  writeRequirements(root, 'beta', [{ id: 'node', version: '<20.0.0' }]);
  const conflict = check(root, ['alpha', 'beta'], 1);
  assert.ok(conflict.findings.some((item) => item.reason === 'command_requirement_conflict'));
  assert.deepEqual(conflict.observations, [], 'context conflict must stop every machine probe');
  check(root, ['alpha', 'alpha'], 1);
  check(root, ['not-registered'], 1);

  run(['project', 'create', 'legacy', '--target', root]);
  assert.equal(fs.existsSync(path.join(root, 'projects', 'legacy', 'commands.yml')), true, 'project create must safely repair the empty baseline');
});

test('Command 与 Component removal 在 Project 反向引用存在时零写入', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-commands-references-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  run(['init', '--agent', 'codex', '--target', root, '--name', 'commands-references', '--profile', 'personal']);
  run(['project', 'create', 'demo', '--target', root]);
  run(['commands', 'add', 'plain-tool', '--purpose', 'Plain tool', '--target', root]);
  run(['commands', 'add', 'orphan-tool', '--purpose', 'Orphan tool', '--target', root]);
  writeRequirements(root, 'demo', [{ id: 'plain-tool' }, { id: 'openspec', required: false }]);

  const commandManifest = path.join(root, 'commands', 'manifest.yml');
  const commandBefore = fs.readFileSync(commandManifest, 'utf8');
  const blockedRemove = run(['commands', 'remove', 'plain-tool', '--target', root], 1);
  assert.match(blockedRemove.stderr, /Project demo/);
  assert.equal(fs.readFileSync(commandManifest, 'utf8'), commandBefore);

  const componentRegistry = path.join(root, 'components', 'manifest.yml');
  const componentBefore = fs.readFileSync(componentRegistry, 'utf8');
  const blockedComponent = run(['component', 'uninstall', 'openspec', '--agent', 'codex', '--target', root], 1);
  assert.match(blockedComponent.stderr, /Command definitions are referenced/);
  assert.equal(fs.readFileSync(componentRegistry, 'utf8'), componentBefore);

  fs.writeFileSync(path.join(root, 'projects', 'demo', 'commands.yml'), 'schemaVersion: buildr.project-commands/v1\n');
  const beforeInvalidContext = fs.readFileSync(commandManifest, 'utf8');
  const invalidContextRemove = run(['commands', 'remove', 'orphan-tool', '--target', root], 1);
  assert.match(invalidContextRemove.stderr, /引用关系不可验证|unverifiable Project context/);
  assert.equal(fs.readFileSync(commandManifest, 'utf8'), beforeInvalidContext);

  writeRequirements(root, 'demo', []);
  run(['commands', 'remove', 'plain-tool', '--target', root]);
  run(['commands', 'remove', 'orphan-tool', '--target', root]);
  assert.deepEqual(YAML.parse(fs.readFileSync(commandManifest, 'utf8')).commands, []);
});

test('Windows shim version probe can resolve .cmd wrappers', (t) => {
  if (process.platform !== 'win32') return;

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-commands-win-shim-'));
  const shimDir = path.join(root, 'bin');
  const originalPath = process.env.PATH;
  fs.mkdirSync(shimDir, { recursive: true });
  t.after(() => {
    process.env.PATH = originalPath;
    fs.rmSync(root, { recursive: true, force: true });
  });

  fs.writeFileSync(
    path.join(shimDir, 'shimtool.cmd'),
    '@echo off\r\nif "%~1"=="--version" (\r\n  echo 1.2.3\r\n  exit /b 0\r\n)\r\necho shimtool\r\n',
  );
  process.env.PATH = `${shimDir};${originalPath || ''}`;

  run(['init', '--target', root, '--name', 'commands-win-shim', '--profile', 'personal']);
  run(['commands', 'add', 'shimtool', '--purpose', 'Windows shim fixture', '--executable', 'shimtool', '--version-constraint', '=1.2.3', '--version-args', '--version', '--target', root]);

  const result = check(root);
  const observation = result.observations.find((item) => item.id === 'shimtool');
  assert.equal(observation?.version?.current, '1.2.3');
  assert.equal(result.findings.some((item) => item.commandId === 'shimtool'), false);
});
