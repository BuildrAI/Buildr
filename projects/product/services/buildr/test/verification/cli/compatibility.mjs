#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { registerCommandHelp } from '../../../src/bootstrap/cli/help.mjs';
import { COMMAND_CATALOG, COMMAND_REGISTRY } from '../../../src/bootstrap/cli/registry.mjs';

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
  [], ['init'], ['web'], ['web', 'preview', 'start'], ['task', 'environment', 'prepare'],
  ['task', 'verification', 'record'], ['task', 'delivery'], ['task', 'delivery', 'inspect'], ['task', 'finish'], ['task', 'finish', 'run'], ['rules', 'render'],
  ['openspec', 'convergence', 'inspect'],
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
assert.match(rootHelp.stdout, /^  web\s/m);
assert.doesNotMatch(rootHelp.stdout, /^  app(?:\s|$)/m);
assert.equal(COMMAND_CATALOG.some((item) => item.key === 'app' || item.key.startsWith('app ')), false);
const surfaceHeadings = {
  primary: 'Primary workspace commands:',
  'agent-machine': 'Agent machine commands:',
  maintenance: 'Product maintenance commands:',
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
  const removedCommands = [
    { key: 'openspec audit', args: ['openspec', 'audit', 'demo', '--target', removedHelpCwd, '--json'] },
    { key: 'openspec baseline create', args: ['openspec', 'baseline', 'create', 'demo', '--target', removedHelpCwd, '--json'] },
    { key: 'openspec check', args: ['openspec', 'check', 'demo', '--target', removedHelpCwd, '--json'] },
    { key: 'openspec sync-plan', args: ['openspec', 'sync-plan', 'demo', '--target', removedHelpCwd, '--json'] },
    { key: 'openspec sync-apply', args: ['openspec', 'sync-apply', 'demo', '--target', removedHelpCwd, '--json'] },
    { key: 'skills migrate-project-assets', args: ['skills', 'migrate-project-assets', '--target', removedHelpCwd, '--check', '--json'] },
    { key: 'app', args: ['app', '--json'] },
    { key: 'app preview start', args: ['app', 'preview', 'start', 'legacy', '--json'] },
  ];
  for (const command of removedCommands) {
    const result = run(command.args, { cwd: removedHelpCwd });
    assert.equal(result.status, 2);
    assert.equal(JSON.parse(result.stdout).error.code, 'cli.unknown_command');
    assert.deepEqual(fs.readdirSync(removedHelpCwd), [], `removed command wrote files: ${command.key}`);
    assert.equal(COMMAND_REGISTRY.some((item) => item.key === command.key), false);
  }
} finally {
  fs.rmSync(removedHelpCwd, { recursive: true, force: true });
}

for (const args of [['app', '--help'], ['help', 'app']]) {
  const result = run(args);
  assert.equal(result.status, 2);
  assert.match(`${result.stdout}${result.stderr}`, /Unknown (?:command|help topic): app/);
}
const removedAppJson = run(['app', '--json']);
assert.equal(removedAppJson.status, 2);
assert.equal(JSON.parse(removedAppJson.stdout).error.code, 'cli.unknown_command');
assert.equal(JSON.parse(removedAppJson.stdout).suggestions.includes('app'), false);

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
const versionIdentity = JSON.parse(versionJson.stdout);
assert.deepEqual(Object.keys(versionIdentity), [
  'schemaVersion', 'package', 'version', 'protocolIdentity', 'applicationPayloadDigest',
  'channel', 'runtime', 'installationIdentity', 'sourceCommit',
]);
assert.equal(versionIdentity.schemaVersion, 'buildr.version/v1');
assert.equal(versionIdentity.package, '@buildr-ai/buildr');
assert.equal(versionIdentity.version, packageVersion);
assert.equal(versionIdentity.protocolIdentity, 'buildr.web-protocol/v1');
assert.equal(versionIdentity.applicationPayloadDigest, null);
assert.equal(versionIdentity.channel, 'development');
assert.match(versionIdentity.installationIdentity, /^sha256-[a-f0-9]{64}$/);
assert.match(versionIdentity.sourceCommit, /^[a-f0-9]{40}$/);
assert.deepEqual(Object.keys(versionIdentity.runtime), [
  'role', 'executable', 'version', 'platform', 'architecture', 'identity',
]);
assert.equal(versionIdentity.runtime.role, 'development');
assert.equal(path.isAbsolute(versionIdentity.runtime.executable), true);
assert.equal(versionIdentity.runtime.version, process.versions.node);
assert.equal(versionIdentity.runtime.platform, process.platform);
assert.equal(versionIdentity.runtime.architecture, process.arch);
assert.match(versionIdentity.runtime.identity, /^sha256-[a-f0-9]{64}$/);
const unknownJson = run(['doctr', '--json']);
assert.equal(unknownJson.status, 2);
assert.equal(unknownJson.stderr, '');
assert.equal(JSON.parse(unknownJson.stdout).schemaVersion, 'buildr.cli-error/v1');
assert.equal(JSON.parse(unknownJson.stdout).error.code, 'cli.unknown_command');
assert.deepEqual(JSON.parse(unknownJson.stdout).suggestions, ['doctor']);
const finishStatus = run(['task', 'finish', 'status', '--json']);
assert.equal(finishStatus.status, 2);
assert.equal(JSON.parse(finishStatus.stdout).error.code, 'cli.unknown_command');
assert.deepEqual(JSON.parse(finishStatus.stdout).suggestions, ['task finish run', 'task finish inspect', 'task finish rollover']);
assert.equal(JSON.parse(finishStatus.stdout).help, 'buildr --help');

const omitPrepareAgent = run(['task', 'environment', 'prepare', 'demo', '--json']);
assert.equal(omitPrepareAgent.status, 2);
assert.equal(omitPrepareAgent.stderr, '');
assert.equal(JSON.parse(omitPrepareAgent.stdout).schemaVersion, 'buildr.cli-error/v1');
assert.equal(JSON.parse(omitPrepareAgent.stdout).error.code, 'task_environment_cli.syntax');
assert.match(JSON.parse(omitPrepareAgent.stdout).error.message, /--agent is required/);
assert.match(JSON.parse(omitPrepareAgent.stdout).help, /--agent <adapter>/);

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

const ordinaryCliRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-web-demand-start-'));
try {
  const appData = path.join(ordinaryCliRoot, 'app-data');
  const ordinary = run(['runtime', 'list', '--json'], { env: { BUILDR_APP_DATA_DIR: appData } });
  assert.equal(ordinary.status, 0, ordinary.stderr);
  assert.equal(fs.existsSync(appData), false, 'ordinary CLI must not start Buildr Web or create instance state');
} finally {
  fs.rmSync(ordinaryCliRoot, { recursive: true, force: true });
}

const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-compat-'));
try {
  let result = run(['init', '--agent', 'codex', '--target', workspace, '--name', 'compat', '--profile', 'team']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Buildr onboarding 已完成：codex/);
  result = run(['project', 'create', 'demo', '--target', workspace]);
  assert.equal(result.status, 0, result.stderr);
  result = run(['doctor', '--agent', 'codex', '--target', workspace, '--json', '--detail', 'full']);
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
