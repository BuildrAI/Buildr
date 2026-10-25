#!/usr/bin/env node

import '../../register-development-entry.ts';

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { registerCommandHelp } from '../../../src/bootstrap/cli/help.ts';
import { COMMAND_CATALOG, COMMAND_REGISTRY } from '../../../src/bootstrap/cli/registry.ts';
import { createVerificationPhaseRecorder, VERIFICATION_PHASE_TIMING_PREFIX } from '../timing/phases.ts';

const productRoot: any = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const cli: any = path.join(productRoot, 'bin', 'buildr.mjs');
const diagnosticCommands: string[] = COMMAND_CATALOG.map((item: any) => item.key).sort((left: string, right: string) => right.length - left.length);
let commandSequence = 0;

function diagnosticCommand(args: string[]): string {
  if (args.length === 0) return 'help:root';
  if (args[0] === '--version' || args[0] === '-V') return 'version';
  const help = args[0] === 'help' || args.includes('--help');
  const words = args[0] === 'help' ? args.slice(1) : args;
  // Emit only a fixed catalog name or fallback, never arbitrary arguments or paths.
  const command = diagnosticCommands.find(name => name.split(' ').every((word, index) => words[index] === word)) ?? 'unknown-command';
  return help ? `help:${command}` : command;
}

function run(args: any, options: any = {}): any  {
  const sequence = ++commandSequence, command = diagnosticCommand(args), id = `${sequence}:${command}`;
  const scope = 'cli-compatibility', startedAt = Date.now();
  const recorder = createVerificationPhaseRecorder(scope);
  process.stderr.write(`${VERIFICATION_PHASE_TIMING_PREFIX} ${JSON.stringify({ scope, id, sequence, command, status: 'started', startedAt: new Date(startedAt).toISOString() })}\n`);
  let result: ReturnType<typeof spawnSync> | undefined;
  try {
    return result = spawnSync(process.execPath, [cli, ...args], {
      cwd: options.cwd || productRoot,
      encoding: 'utf8',
      env: { ...process.env, ...(options.env || {}) },
    });
  } finally {
    // Completion is distinct from compatibility: assertions below own expected nonzero exits.
    const phase = recorder.record(id, startedAt, Date.now(), Number.isInteger(result?.status) ? 'passed' : 'failed');
    Object.assign(phase, { sequence, command, exitCode: result?.status ?? null, signal: result?.signal ?? null });
    recorder.emit(process.stderr);
  }
}

function runAsync(args: any, options: any = {}): Promise<any> {
  const sequence = ++commandSequence, command = diagnosticCommand(args), id = `${sequence}:${command}`;
  const scope = 'cli-compatibility', startedAt = Date.now();
  const recorder = createVerificationPhaseRecorder(scope);
  process.stderr.write(`${VERIFICATION_PHASE_TIMING_PREFIX} ${JSON.stringify({ scope, id, sequence, command, status: 'started', startedAt: new Date(startedAt).toISOString() })}\n`);
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [cli, ...args], {
      cwd: options.cwd || productRoot,
      env: { ...process.env, ...(options.env || {}) },
    });
    let stdout = '', stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk: string) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk: string) => { stderr += chunk; });
    const finish = (result: any) => {
      const phase = recorder.record(id, startedAt, Date.now(), Number.isInteger(result.status) ? 'passed' : 'failed');
      Object.assign(phase, { sequence, command, exitCode: result.status ?? null, signal: result.signal ?? null });
      recorder.emit(process.stderr);
      resolve(result);
    };
    child.on('error', (error: any) => finish({ status: null, stdout, stderr, error }));
    child.on('close', (status: number | null, signal: string | null) => finish({ status, stdout, stderr, signal }));
  });
}

/** Read-only probes share no state; bounded workers replace one cold CLI
 * process at a time while the mutating workspace journey stays serial. */
const RUN_BATCH_WORKERS = 6;

async function runBatch(tasks: { args: string[]; options?: any }[]): Promise<any[]> {
  const results: any[] = new Array(tasks.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(RUN_BATCH_WORKERS, tasks.length) }, async () => {
    while (next < tasks.length) {
      const index = next++;
      results[index] = await runAsync(tasks[index]!.args, tasks[index]!.options ?? {});
    }
  }));
  return results;
}

const helpTopics: any[] = [[], ...COMMAND_CATALOG.map((item: any) => item.key.split(' '))];
const helpRuntime: any = registerCommandHelp({}, COMMAND_CATALOG);
const originalLog: any = console.log;
let renderedHelp: any = '';
console.log = (...parts: any[]) => { renderedHelp += `${parts.join(' ')}\n`; };
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

const publicHelpTopics: any[] = [
  [], ['init'], ['assets'], ['web'], ['web', 'preview', 'start'], ['task', 'environment', 'prepare'],
  ['task', 'verification', 'record'], ['task', 'delivery'], ['task', 'delivery', 'inspect'], ['task', 'finish'], ['task', 'finish', 'run'], ['rules', 'render'],
  ['openspec', 'convergence', 'inspect'],
];
const helpCwd: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-help-'));
try {
  const helpRuns: any = await runBatch(publicHelpTopics.flatMap((topic: any) => topic.length === 0
    ? [{ args: [...topic, '--help'], options: { cwd: helpCwd } }]
    : [{ args: [...topic, '--help'], options: { cwd: helpCwd } }, { args: ['help', ...topic], options: { cwd: helpCwd } }]));
  let helpIndex = 0;
  for (const topic of publicHelpTopics) {
    const result: any = helpRuns[helpIndex++];
    assert.equal(result.status, 0, `help failed: buildr ${topic.join(' ')}`);
    assert.match(result.stdout, /Usage:/, `help missing Usage: buildr ${topic.join(' ')}`);
    assert.equal(result.stderr, '', `help wrote stderr: buildr ${topic.join(' ')}`);
    if (topic.length > 0) {
      const commandHelp: any = helpRuns[helpIndex++];
      assert.equal(commandHelp.status, 0, `command help failed: buildr help ${topic.join(' ')}`);
      assert.equal(commandHelp.stdout, result.stdout, `help forms differ: ${topic.join(' ')}`);
      assert.equal(commandHelp.stderr, '');
    }
  }
  assert.deepEqual(fs.readdirSync(helpCwd), [], 'help changed filesystem');
} finally {
  fs.rmSync(helpCwd, { recursive: true, force: true });
}

const removedHelpCwd: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-removed-help-'));
const ordinaryCliRoot: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-web-demand-start-'));
const ordinaryAppData: any = path.join(ordinaryCliRoot, 'app-data');
const removedCommands: any[] = [
  { key: 'bootstrap guide', args: ['bootstrap', 'guide', '--target', removedHelpCwd, '--json'] },
  { key: 'openspec audit', args: ['openspec', 'audit', 'demo', '--target', removedHelpCwd, '--json'] },
  { key: 'openspec baseline create', args: ['openspec', 'baseline', 'create', 'demo', '--target', removedHelpCwd, '--json'] },
  { key: 'openspec check', args: ['openspec', 'check', 'demo', '--target', removedHelpCwd, '--json'] },
  { key: 'openspec sync-plan', args: ['openspec', 'sync-plan', 'demo', '--target', removedHelpCwd, '--json'] },
  { key: 'openspec sync-apply', args: ['openspec', 'sync-apply', 'demo', '--target', removedHelpCwd, '--json'] },
  { key: 'skills migrate-project-assets', args: ['skills', 'migrate-project-assets', '--target', removedHelpCwd, '--check', '--json'] },
  { key: 'app', args: ['app', '--json'] },
  { key: 'app preview start', args: ['app', 'preview', 'start', 'legacy', '--json'] },
];
const removedHelpProbes: any[] = [
  { args: ['bootstrap', 'guide', '--help'], expected: /Unknown (?:command|help topic): bootstrap guide/ },
  { args: ['help', 'bootstrap', 'guide'], expected: /Unknown (?:command|help topic): bootstrap guide/ },
  { args: ['app', '--help'], expected: /Unknown (?:command|help topic): app/ },
  { args: ['help', 'app'], expected: /Unknown (?:command|help topic): app/ },
];
const invalidCases: any[] = [
  [['unknown'], /Unknown command: unknown/],
  [['help', 'unknown'], /Unknown help topic: unknown/],
  [['-v'], /Unknown option: -v/],
  [['project', 'create'], /Missing project ref/],
  [['service', 'create'], /Missing service ref/],
  [['render', 'codex', '--adapter', 'unsupported'], /Unsupported runtime adapter: unsupported\. Supported adapters: claude-code, agents-standard\./],
  [['render', 'codex', '--adapter', 'cursor'], /Unsupported runtime adapter: cursor\. Supported adapters: claude-code, agents-standard\./],
  [['render', '--adapter', 'unsupported'], /Unsupported runtime adapter: unsupported\. Supported adapters: claude-code, agents-standard\./],
  [['commands', 'add', 'demo', '--unknown'], /Unknown argument: --unknown/],
];
const contractTasks: any[] = [
  { key: 'rootHelp', args: [] },
  { key: 'taskHelp', args: ['help', 'task'] },
  { key: 'taskCreateHelp', args: ['help', 'task', 'create'] },
  { key: 'taskUpdateHelp', args: ['help', 'task', 'update'] },
  { key: 'taskAbandonHelp', args: ['help', 'task', 'abandon'] },
  { key: 'verificationRecordHelp', args: ['help', 'task', 'verification', 'record'] },
  { key: 'removedAppJson', args: ['app', '--json'] },
  { key: 'unknownJson', args: ['doctr', '--json'] },
  { key: 'finishStatus', args: ['task', 'finish', 'status', '--json'] },
  { key: 'omitPrepareAgent', args: ['task', 'environment', 'prepare', 'demo', '--json'] },
  { key: 'invalidInspect', args: ['worktree', 'inspect', 'demo', '--agent', 'codex'] },
  { key: 'versionDashDash', args: ['--version'] },
  { key: 'versionDashV', args: ['-V'] },
  { key: 'versionCommand', args: ['version'] },
  { key: 'versionJson', args: ['version', '--json'] },
  { key: 'runtime', args: ['runtime', 'list', '--json'] },
  { key: 'ordinary', args: ['runtime', 'list', '--json'], options: { env: { BUILDR_APP_DATA_DIR: ordinaryAppData } } },
  ...removedCommands.map((command: any) => ({ key: `removed:${command.key}`, args: command.args, options: { cwd: removedHelpCwd } })),
  ...removedHelpProbes.map((probe: any) => ({ key: `probe:${probe.args.join(' ')}`, args: probe.args })),
  ...invalidCases.map(([args]: any) => ({ key: `invalid:${args.join(' ')}`, args })),
];
const packageVersion: any = JSON.parse(fs.readFileSync(path.join(productRoot, 'package.json'), 'utf8')).version;
try {
  const contractResults: any[] = await runBatch(contractTasks);
  const contract: any = Object.fromEntries(contractTasks.map((task: any, index: number) => [task.key, contractResults[index]]));

  const rootHelp: any = contract.rootHelp;
  assert.equal(rootHelp.status, 0);
  assert.match(rootHelp.stdout, /^  web\s/m);
  assert.doesNotMatch(rootHelp.stdout, /^  app(?:\s|$)/m);
  assert.equal(COMMAND_CATALOG.some((item: any) => item.key === 'app' || item.key.startsWith('app ')), false);
  const taskHelp: any = contract.taskHelp;
  assert.equal(taskHelp.status, 0, taskHelp.stderr);
  assert.match(taskHelp.stdout, /create\|inspect\|update\|activate\|complete\|abandon/);
  assert.doesNotMatch(taskHelp.stdout, /复盘来源可重复|终态不可重开或继续修改/);
  const taskCreateHelp: any = contract.taskCreateHelp;
  assert.doesNotMatch(taskCreateHelp.stdout, /复盘来源可重复/);
  assert.match(taskCreateHelp.stdout, /不创建Change、branch、commit或专业记录/);
  const taskUpdateHelp: any = contract.taskUpdateHelp;
  assert.match(taskUpdateHelp.stdout, /终态事实更正必须提供--reason和当前--expected-record/);
  assert.match(taskUpdateHelp.stdout, /不执行Git、验证、交付或清理/);
  const taskAbandonHelp: any = contract.taskAbandonHelp;
  assert.match(taskAbandonHelp.stdout, /终态事实仍可通过带原因的统一update显式更正/);
  const verificationRecordHelp: any = contract.verificationRecordHelp;
  assert.match(verificationRecordHelp.stdout, /--expected-report <absent\|sha256-digest>/);
  assert.match(verificationRecordHelp.stdout, /只保存报告，不执行测试、Git、交付、Task完成或清理/);
  const surfaceHeadings: Record<string, string> = {
    primary: 'Primary workspace commands:',
    'agent-machine': 'Agent machine commands:',
    maintenance: 'Product maintenance commands:',
  };
  for (const [surface, heading] of Object.entries(surfaceHeadings)) {
    const start: any = rootHelp.stdout.indexOf(heading);
    assert.notEqual(start, -1, `root help is missing ${surface} section`);
    const later: any = Object.values(surfaceHeadings)
      .map((candidate: any) => rootHelp.stdout.indexOf(candidate, start + heading.length))
      .filter((index: any) => index !== -1);
    const section: any = rootHelp.stdout.slice(start, later.length ? Math.min(...later) : undefined);
    for (const descriptor of COMMAND_REGISTRY.filter((item: any) => item.surface === surface)) {
      assert.match(section, new RegExp(`^  ${descriptor.key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s`, 'm'), `${descriptor.key} is not rendered in ${surface}`);
    }
  }

  for (const command of removedCommands) {
    const result: any = contract[`removed:${command.key}`];
    assert.equal(result.status, 2);
    assert.equal(JSON.parse(result.stdout).error.code, 'cli.unknown_command');
    assert.equal(COMMAND_REGISTRY.some((item: any) => item.key === command.key), false);
  }
  assert.deepEqual(fs.readdirSync(removedHelpCwd), [], 'removed commands wrote files');

  for (const probe of removedHelpProbes) {
    const result: any = contract[`probe:${probe.args.join(' ')}`];
    assert.equal(result.status, 2);
    assert.match(`${result.stdout}${result.stderr}`, probe.expected);
  }
  const removedAppJson: any = contract.removedAppJson;
  assert.equal(removedAppJson.status, 2);
  assert.equal(JSON.parse(removedAppJson.stdout).error.code, 'cli.unknown_command');
  assert.equal(JSON.parse(removedAppJson.stdout).suggestions.includes('app'), false);

  for (const [args, expected] of invalidCases) {
    const result: any = contract[`invalid:${args.join(' ')}`];
    assert.notEqual(result.status, 0, `invalid command unexpectedly passed: ${args.join(' ')}`);
    assert.match(`${result.stdout}${result.stderr}`, expected, `invalid command diagnostic drifted: ${args.join(' ')}`);
  }

  for (const key of ['versionDashDash', 'versionDashV', 'versionCommand']) {
    const result: any = contract[key];
    assert.equal(result.status, 0);
    assert.equal(result.stdout.trim(), packageVersion);
    assert.equal(result.stderr, '');
  }
  const versionJson: any = contract.versionJson;
  assert.equal(versionJson.status, 0);
  const versionIdentity: any = JSON.parse(versionJson.stdout);
  assert.deepEqual(Object.keys(versionIdentity), [
    'schemaVersion', 'package', 'version', 'protocolIdentity', 'applicationPayloadDigest',
    'channel', 'runtime', 'installationIdentity', 'sourceCommit', 'developmentRuntimeIdentity', 'sourceRoot',
  ]);
  assert.equal(versionIdentity.schemaVersion, 'buildr.version/v1');
  assert.equal(versionIdentity.package, '@buildr-ai/buildr');
  assert.equal(versionIdentity.version, packageVersion);
  assert.equal(versionIdentity.protocolIdentity, 'buildr.web-protocol/v1');
  assert.equal(versionIdentity.applicationPayloadDigest, null);
  assert.equal(versionIdentity.channel, 'development');
  assert.equal(versionIdentity.sourceRoot, fs.realpathSync(productRoot));
  assert.match(versionIdentity.installationIdentity, /^sha256-[a-f0-9]{64}$/);
  assert.match(versionIdentity.sourceCommit, /^[a-f0-9]{40}$/);
  assert.match(versionIdentity.developmentRuntimeIdentity, /^sha256-[a-f0-9]{64}$/);
  assert.deepEqual(Object.keys(versionIdentity.runtime), [
    'role', 'executable', 'version', 'platform', 'architecture', 'identity',
  ]);
  assert.equal(versionIdentity.runtime.role, 'development');
  assert.equal(path.isAbsolute(versionIdentity.runtime.executable), true);
  assert.equal(versionIdentity.runtime.version, process.versions.node);
  assert.equal(versionIdentity.runtime.platform, process.platform);
  assert.equal(versionIdentity.runtime.architecture, process.arch);
  assert.match(versionIdentity.runtime.identity, /^sha256-[a-f0-9]{64}$/);
  const unknownJson: any = contract.unknownJson;
  assert.equal(unknownJson.status, 2);
  assert.equal(unknownJson.stderr, '');
  assert.equal(JSON.parse(unknownJson.stdout).schemaVersion, 'buildr.cli-error/v1');
  assert.equal(JSON.parse(unknownJson.stdout).error.code, 'cli.unknown_command');
  assert.deepEqual(JSON.parse(unknownJson.stdout).suggestions, ['doctor']);
  const finishStatus: any = contract.finishStatus;
  assert.equal(finishStatus.status, 2);
  assert.equal(JSON.parse(finishStatus.stdout).error.code, 'cli.unknown_command');
  assert.equal(JSON.parse(finishStatus.stdout).suggestions.some((item: any) => item.startsWith('task finish')), false, '提示不得推荐已退役的收尾入口');
  assert.equal(JSON.parse(finishStatus.stdout).help, 'buildr --help');

  const omitPrepareAgent: any = contract.omitPrepareAgent;
  assert.equal(omitPrepareAgent.status, 2);
  assert.equal(omitPrepareAgent.stderr, '');
  assert.equal(JSON.parse(omitPrepareAgent.stdout).schemaVersion, 'buildr.cli-error/v1');
  assert.equal(JSON.parse(omitPrepareAgent.stdout).error.code, 'cli.unknown_command');
  assert.equal(JSON.parse(omitPrepareAgent.stdout).suggestions.some((item: any) => item.includes('task environment')), false);

  const invalidInspect: any = contract.invalidInspect;
  assert.notEqual(invalidInspect.status, 0);
  assert.match(`${invalidInspect.stdout}${invalidInspect.stderr}`, /Unknown argument: --agent/);

  const runtime: any = contract.runtime;
  assert.equal(runtime.status, 0);
  const runtimeJson: any = JSON.parse(runtime.stdout);
  assert.equal(runtimeJson.schemaVersion, 'buildr.runtime-list/v3');
  assert.equal(runtimeJson.defaultAdapter, 'agents-standard');
  assert.equal(runtimeJson.runtimeMappings.dsh, 'agents-standard');
  assert.deepEqual(runtimeJson.supportedAgents, ['claude-code', 'agents-standard']);
  assert.deepEqual(runtimeJson.adapterTraitCatalog.rules, ['native-recursive', 'native-root', 'reference-bridge']);
  assert.equal(runtimeJson.agents['agents-standard'].traits.rules.kind, 'native-recursive');
  assert.equal(runtimeJson.agents['agents-standard'].traits.skills.root, '.agents');
  assert.equal(runtimeJson.agents['claude-code'].traits.rules.kind, 'reference-bridge');
  assert.equal(runtimeJson.agents['claude-code'].traits.skills.root, '.claude');
  for (const retired of ['cursor', 'qoder', 'trae', 'trae-work', 'workbuddy']) {
    assert.equal(Object.hasOwn(runtimeJson.agents, retired), false, `${retired} must not remain in the runtime list`);
  }

  const ordinary: any = contract.ordinary;
  assert.equal(ordinary.status, 0, ordinary.stderr);
  assert.equal(fs.existsSync(ordinaryAppData), false, 'ordinary CLI must not start Buildr Web or create instance state');
} finally {
  fs.rmSync(removedHelpCwd, { recursive: true, force: true });
  fs.rmSync(ordinaryCliRoot, { recursive: true, force: true });
}

const workspace: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-compat-'));
try {
  let result: any = run(['init', '--agent', 'codex', '--target', workspace, '--name', 'compat', '--profile', 'team']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Buildr onboarding 已完成：codex/);
  result = run(['project', 'create', 'demo', '--target', workspace]);
  assert.equal(result.status, 0, result.stderr);
  result = run(['doctor', '--agent', 'codex', '--target', workspace, '--json', '--detail', 'full']);
  assert.equal(result.status, 0, result.stderr);
  const doctor: any = JSON.parse(result.stdout);
  assert.equal(doctor.ok, true);
  assert.equal(doctor.projectRegistry.projects[0].name, 'demo');
  assert.equal('environmentChecks' in doctor.runtime.agentsStandard[0], false, 'retired install and version probes must not reappear in doctor output');
  assert.equal(doctor.runtime.agentsStandard[0].activation.rules, 'path-read');
} finally {
  fs.rmSync(workspace, { recursive: true, force: true });
}

console.log(`CLI compatibility verification passed: ${helpTopics.length} in-process help contracts, ${publicHelpTopics.length} public help entrypoints, package identity, actionable failures, JSON discovery, and workspace mutation.`);
