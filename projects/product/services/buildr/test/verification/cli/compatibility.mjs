#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { registerCommandHelp } from '../../../src/interfaces/cli/help.mjs';
import { COMMAND_CATALOG, COMMAND_REGISTRY } from '../../../src/interfaces/cli/registry.mjs';

const productRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const cli = path.join(productRoot, 'bin', 'buildr.mjs');

function run(args, options = {}) {
  return spawnSync(process.execPath, [cli, ...args], {
    cwd: options.cwd || productRoot,
    encoding: 'utf8',
    env: { ...process.env, ...(options.env || {}) },
  });
}

const helpTopics = [[], ...COMMAND_CATALOG.map((item) => item.key.split(' '))];
const helpRuntime = registerCommandHelp({}, COMMAND_CATALOG);
const originalLog = console.log;
let renderedHelp = '';
console.log = (...parts) => { renderedHelp += `${parts.join(' ')}\n`; };
try {
  for (const topic of helpTopics) {
    renderedHelp = '';
    assert.equal(helpRuntime.isHelpRequest(topic.length === 0 ? [] : [...topic, '--help']), true);
    assert.equal(helpRuntime.printHelp(topic), true, `help topic is not registered: ${topic.join(' ')}`);
    assert.match(renderedHelp, /Usage:/, `help missing Usage: buildr ${topic.join(' ')}`);
  }
} finally {
  console.log = originalLog;
}

const publicHelpTopics = [
  [], ['init'], ['app', 'preview', 'start'], ['task', 'environment', 'prepare'],
  ['task', 'verification', 'record'], ['task', 'finish'], ['task', 'finish', 'run'], ['rules', 'render'],
];
const helpCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-help-'));
try {
  for (const topic of publicHelpTopics) {
    const cwd = helpCwd;
    const result = run([...topic, '--help'], { cwd });
    assert.equal(result.status, 0, `help failed: buildr ${topic.join(' ')}`);
    assert.match(result.stdout, /Usage:/, `help missing Usage: buildr ${topic.join(' ')}`);
    assert.equal(result.stderr, '', `help wrote stderr: buildr ${topic.join(' ')}`);
    assert.deepEqual(fs.readdirSync(cwd), [], `help changed filesystem: buildr ${topic.join(' ')}`);
    if (topic.length > 0) {
      const commandHelp = run(['help', ...topic], { cwd });
      assert.equal(commandHelp.status, 0, `command help failed: buildr help ${topic.join(' ')}`);
      assert.equal(commandHelp.stdout, result.stdout, `help forms differ: ${topic.join(' ')}`);
      assert.equal(commandHelp.stderr, '');
    }
  }
} finally {
  fs.rmSync(helpCwd, { recursive: true, force: true });
}

const rootHelp = run([]);
assert.equal(rootHelp.status, 0);
const surfaceHeadings = {
  primary: 'Primary workspace commands:',
  'agent-machine': 'Agent machine commands:',
  maintenance: 'Product maintenance commands:',
  legacy: 'Legacy compatibility commands:',
};
for (const [surface, heading] of Object.entries(surfaceHeadings)) {
  const start = rootHelp.stdout.indexOf(heading);
  assert.notEqual(start, -1, `root help is missing ${surface} section`);
  const later = Object.values(surfaceHeadings)
    .map((candidate) => rootHelp.stdout.indexOf(candidate, start + heading.length))
    .filter((index) => index !== -1);
  const section = rootHelp.stdout.slice(start, later.length ? Math.min(...later) : undefined);
  for (const descriptor of COMMAND_REGISTRY.filter((item) => item.surface === surface)) {
    assert.match(section, new RegExp(`^  ${descriptor.key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s`, 'm'), `${descriptor.key} is not rendered in ${surface}`);
  }
}

const removedHelpCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-removed-help-'));
try {
  for (const action of ['sync-plan', 'sync-apply']) {
    const result = run(['openspec', action, 'demo', '--target', removedHelpCwd, '--json'], { cwd: removedHelpCwd });
    assert.equal(result.status, 2);
    assert.equal(JSON.parse(result.stdout).error.code, 'cli.unknown_command');
    assert.deepEqual(fs.readdirSync(removedHelpCwd), [], `removed command wrote files: ${action}`);
    assert.equal(COMMAND_REGISTRY.some((item) => item.key === `openspec ${action}`), false);
  }
} finally {
  fs.rmSync(removedHelpCwd, { recursive: true, force: true });
}

for (const [args, expected] of [
  [['unknown'], /Unknown command: unknown/],
  [['help', 'unknown'], /Unknown help topic: unknown/],
  [['-v'], /Unknown option: -v/],
  [['project', 'create'], /Missing project ref/],
  [['service', 'create'], /Missing service ref/],
  [['render', 'unsupported'], /Unsupported Agent runtime: unsupported/],
  [['commands', 'add', 'demo', '--unknown'], /Unknown argument: --unknown/],
]) {
  const result = run(args);
  assert.notEqual(result.status, 0, `invalid command unexpectedly passed: ${args.join(' ')}`);
  assert.match(`${result.stdout}${result.stderr}`, expected, `invalid command diagnostic drifted: ${args.join(' ')}`);
}

const packageVersion = JSON.parse(fs.readFileSync(path.join(productRoot, 'package.json'), 'utf8')).version;
for (const args of [['--version'], ['-V'], ['version']]) {
  const result = run(args);
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), packageVersion);
  assert.equal(result.stderr, '');
}
const versionJson = run(['version', '--json']);
assert.equal(versionJson.status, 0);
assert.deepEqual(JSON.parse(versionJson.stdout), {
  schemaVersion: 'buildr.version/v1',
  package: '@buildr-ai/buildr',
  version: packageVersion,
});
const unknownJson = run(['doctr', '--json']);
assert.equal(unknownJson.status, 2);
assert.equal(unknownJson.stderr, '');
assert.equal(JSON.parse(unknownJson.stdout).schemaVersion, 'buildr.cli-error/v1');
assert.equal(JSON.parse(unknownJson.stdout).error.code, 'cli.unknown_command');
assert.deepEqual(JSON.parse(unknownJson.stdout).suggestions, ['doctor']);
const finishStatus = run(['task', 'finish', 'status', '--json']);
assert.equal(finishStatus.status, 2);
assert.equal(JSON.parse(finishStatus.stdout).error.code, 'cli.unknown_command');
assert.deepEqual(JSON.parse(finishStatus.stdout).suggestions, ['task finish run', 'task finish inspect', 'task inspect']);
assert.equal(JSON.parse(finishStatus.stdout).help, 'buildr --help');

const invalidInspect = run(['worktree', 'inspect', 'demo', '--agent', 'codex']);
assert.notEqual(invalidInspect.status, 0);
assert.match(`${invalidInspect.stdout}${invalidInspect.stderr}`, /Unknown argument: --agent/);

const runtime = run(['runtime', 'list', '--json']);
assert.equal(runtime.status, 0);
const runtimeJson = JSON.parse(runtime.stdout);
assert.deepEqual(runtimeJson.supportedAgents, ['claude-code', 'codex', 'cursor', 'qoder', 'trae', 'trae-work', 'workbuddy']);
assert.deepEqual(runtimeJson.adapterTraitCatalog.rules, ['native-recursive', 'native-root', 'reference-bridge', 'vendor-rule-files']);
assert.equal(runtimeJson.agents.codex.traits.rules.kind, 'native-recursive');
assert.equal(runtimeJson.agents.codex.traits.skills.root, '.agents');
assert.equal(runtimeJson.agents['claude-code'].traits.rules.kind, 'reference-bridge');
assert.equal(runtimeJson.agents['claude-code'].traits.skills.root, '.claude');
assert.equal(runtimeJson.agents.cursor.traits.rules.format, 'cursor-mdc');
assert.equal(runtimeJson.agents.qoder.traits.rules.format, 'qoder-markdown');
assert.equal(runtimeJson.agents.trae.traits.rules.format, 'trae-markdown');
assert.equal(runtimeJson.agents['trae-work'].traits.rules.placement, 'root-index');
assert.equal(runtimeJson.agents.workbuddy.traits.rules.placement, 'root-index');

const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-compat-'));
try {
  let result = run(['init', '--agent', 'codex', '--target', workspace, '--name', 'compat', '--profile', 'team']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Buildr onboarding 已完成：codex/);
  result = run(['project', 'create', 'demo', '--target', workspace]);
  assert.equal(result.status, 0, result.stderr);
  result = run(['doctor', '--agent', 'codex', '--target', workspace, '--json']);
  assert.equal(result.status, 0, result.stderr);
  const doctor = JSON.parse(result.stdout);
  assert.equal(doctor.ok, true);
  assert.equal(doctor.projectRegistry.projects[0].name, 'demo');
  assert.equal(doctor.runtime.codex[0].environmentChecks.installation.status, 'not-checked');
  assert.equal(doctor.runtime.codex[0].activation.rules, 'path-read');
} finally {
  fs.rmSync(workspace, { recursive: true, force: true });
}

console.log(`CLI compatibility verification passed: ${helpTopics.length} in-process help contracts, ${publicHelpTopics.length} public help entrypoints, package identity, actionable failures, JSON discovery, and workspace mutation.`);
