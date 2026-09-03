import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { createRuntime } from '../../src/bootstrap/runtime.ts';
import { createExactNodeExecutionEnvironment } from '../../src/infrastructure/process.ts';
import { sameFilesystemPath } from '../../src/infrastructure/filesystem/filesystem-path-identity.ts';

export const releasePreparationBindingSchema = 'buildr.release-preparation-binding/v1';

type ReleaseTask = { taskId: string; status: string };
type NodeAudit = { version: string; identity: string };
type CommandResult = { status: number | null; stdout?: string; stderr?: string };
type Execute = (command: string, args: string[], options: { cwd: string; env?: NodeJS.ProcessEnv }) => CommandResult;
type ReadSourceFile = (commit: string, file: string) => string | Buffer;
type PreparationBinding = {
  schemaVersion: typeof releasePreparationBindingSchema;
  taskId: string;
  sourceCommit: string;
  service: 'product/buildr';
  serviceRoot: 'projects/product/services/buildr';
  command: { executable: 'npm'; args: ['ci']; cwd: 'projects/product/services/buildr' };
  inputs: { 'package.json': string; 'package-lock.json': string };
  node: { authority: 'projects/product/.node-version'; version: string; executionIdentity: string };
  outcome: { status: 'passed' };
  identity: string;
};

const digest = (value: string | Buffer): string => `sha256-${crypto.createHash('sha256').update(value).digest('hex')}`;
const identity = (value: unknown): string => `sha256-${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;

function requiredDigest(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^sha256-[a-f0-9]{64}$/u.test(value)) throw new Error(`${field} must be a sha256 identity.`);
  return value;
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return Object.fromEntries(Object.entries(value));
}

function closed(value: unknown, fields: string[], label: string): Record<string, unknown> {
  const item = record(value, label);
  for (const field of Object.keys(item)) if (!fields.includes(field)) throw new Error(`${label}.${field} is not supported.`);
  return item;
}

export function validateReleasePreparationBinding(value: unknown, options: { repo?: string } = {}): PreparationBinding {
  const item = closed(value, ['schemaVersion', 'taskId', 'sourceCommit', 'service', 'serviceRoot', 'command', 'inputs', 'node', 'outcome', 'identity'], 'release preparation binding');
  if (item.schemaVersion !== releasePreparationBindingSchema) throw new Error('Release preparation binding schema is invalid.');
  if (typeof item.taskId !== 'string' || !item.taskId || typeof item.sourceCommit !== 'string' || !/^[a-f0-9]{40}$/u.test(item.sourceCommit)) throw new Error('Release preparation Task/source identity is invalid.');
  if (item.service !== 'product/buildr' || item.serviceRoot !== 'projects/product/services/buildr') throw new Error('Release preparation must bind product/buildr Service root.');
  const command = closed(item.command, ['executable', 'args', 'cwd'], 'release preparation command');
  if (command.executable !== 'npm' || !Array.isArray(command.args) || command.args.length !== 1 || command.args[0] !== 'ci' || command.cwd !== item.serviceRoot) throw new Error('Release preparation command must be npm ci in the Buildr Service root.');
  const inputs = closed(item.inputs, ['package.json', 'package-lock.json'], 'release preparation inputs');
  const packageIdentity = requiredDigest(inputs['package.json'], 'Release preparation package.json identity');
  const lockIdentity = requiredDigest(inputs['package-lock.json'], 'Release preparation package-lock.json identity');
  const node = closed(item.node, ['authority', 'version', 'executionIdentity'], 'release preparation Node');
  if (node.authority !== 'projects/product/.node-version' || typeof node.version !== 'string' || !/^\d+\.\d+\.\d+$/u.test(node.version)) throw new Error('Release preparation Node authority/version is invalid.');
  const nodeIdentity = requiredDigest(node.executionIdentity, 'Release preparation Node execution identity');
  const outcome = closed(item.outcome, ['status'], 'release preparation outcome');
  if (outcome.status !== 'passed') throw new Error('Release preparation outcome must be passed.');
  const unsigned: Omit<PreparationBinding, 'identity'> = {
    schemaVersion: releasePreparationBindingSchema,
    taskId: item.taskId,
    sourceCommit: item.sourceCommit,
    service: 'product/buildr',
    serviceRoot: 'projects/product/services/buildr',
    command: { executable: 'npm', args: ['ci'], cwd: 'projects/product/services/buildr' },
    inputs: { 'package.json': packageIdentity, 'package-lock.json': lockIdentity },
    node: { authority: 'projects/product/.node-version', version: node.version, executionIdentity: nodeIdentity },
    outcome: { status: 'passed' },
  };
  if (item.identity !== identity(unsigned)) throw new Error('Release preparation binding identity mismatch.');
  if (options.repo) {
    const repo = path.resolve(options.repo);
    for (const [name, expected] of Object.entries(unsigned.inputs)) {
      const file = path.join(repo, unsigned.serviceRoot, name);
      if (!fs.statSync(file, { throwIfNoEntry: false })?.isFile() || digest(fs.readFileSync(file)) !== expected) throw new Error(`Release preparation source drift for ${name}.`);
    }
    const nodeFile = path.join(repo, unsigned.node.authority);
    if (!fs.statSync(nodeFile, { throwIfNoEntry: false })?.isFile() || fs.readFileSync(nodeFile, 'utf8').trim() !== unsigned.node.version) throw new Error('Release preparation source Node version drifted.');
  }
  return { ...unsigned, identity: String(item.identity) };
}

export function prepareReleaseDependencies(input: {
  task: ReleaseTask;
  taskStatus?: 'active' | 'completed';
  repo: string;
  sourceCommit: string;
  readSourceFile: ReadSourceFile;
  nodeAudit: NodeAudit;
  execute: Execute;
  env?: NodeJS.ProcessEnv;
}): PreparationBinding {
  const taskStatus = input.taskStatus || 'active';
  if (input.task?.status !== taskStatus) throw new Error(`Release Task must be ${taskStatus}: ${input.task?.taskId || '<missing>'}.`);
  if (!/^[a-f0-9]{40}$/u.test(input.sourceCommit)) throw new Error('Release preparation sourceCommit must be a full Git SHA.');
  const serviceRoot: 'projects/product/services/buildr' = 'projects/product/services/buildr';
  const cwd = path.join(path.resolve(input.repo), serviceRoot);
  if (!fs.statSync(path.join(cwd, 'package-lock.json'), { throwIfNoEntry: false })?.isFile()) throw new Error('Release preparation requires the Buildr Service package-lock.json.');
  const sourceInputs = {
    'package.json': digest(input.readSourceFile(input.sourceCommit, `${serviceRoot}/package.json`)),
    'package-lock.json': digest(input.readSourceFile(input.sourceCommit, `${serviceRoot}/package-lock.json`)),
  };
  for (const [name, expected] of Object.entries(sourceInputs)) {
    if (digest(fs.readFileSync(path.join(cwd, name))) !== expected) throw new Error(`Release preparation source drift for ${name}.`);
  }
  const nodeVersion = String(input.readSourceFile(input.sourceCommit, 'projects/product/.node-version')).trim();
  if (input.nodeAudit.version !== nodeVersion) throw new Error(`Release runner Node ${input.nodeAudit.version} does not match Product exact Node ${nodeVersion}.`);
  requiredDigest(input.nodeAudit.identity, 'Release Node execution identity');
  const result = input.execute('npm', ['ci'], { cwd, env: input.env });
  if (result.status !== 0) throw new Error(`Release preparation npm ci failed: ${String(result.stderr || result.stdout || '').trim()}`);
  const unsigned: Omit<PreparationBinding, 'identity'> = {
    schemaVersion: releasePreparationBindingSchema,
    taskId: input.task.taskId,
    sourceCommit: input.sourceCommit,
    service: 'product/buildr',
    serviceRoot,
    command: { executable: 'npm', args: ['ci'], cwd: serviceRoot },
    inputs: sourceInputs,
    node: { authority: 'projects/product/.node-version', version: nodeVersion, executionIdentity: input.nodeAudit.identity },
    outcome: { status: 'passed' },
  };
  return validateReleasePreparationBinding({ ...unsigned, identity: identity(unsigned) }, { repo: input.repo });
}

function option(argv: string[], name: string): string {
  const index = argv.indexOf(name);
  if (index < 0 || !argv[index + 1]) throw new Error(`Missing required ${name}.`);
  return argv[index + 1];
}

function run(command: string, args: string[], options: { cwd: string; env?: NodeJS.ProcessEnv }): CommandResult {
  return spawnSync(command, args, { cwd: options.cwd, env: options.env, encoding: 'utf8' });
}

function gitShow(repo: string, commit: string, file: string): string {
  const result = spawnSync('git', ['show', `${commit}:${file}`], { cwd: repo, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`Unable to read ${file} from ${commit}: ${(result.stderr || result.stdout).trim()}`);
  return result.stdout;
}

if (process.argv[1] && sameFilesystemPath(process.argv[1], fileURLToPath(import.meta.url))) {
  try {
    const argv = process.argv.slice(2);
    if (argv[0] !== 'prepare') throw new Error('Usage: release-preparation-binding.ts prepare --task <task-id> --workspace <canonical-workspace> --repo <release-worktree> --source-commit <full-sha> [--output <json>]');
    const taskId = option(argv, '--task');
    const workspace = fs.realpathSync(path.resolve(option(argv, '--workspace')));
    const repo = fs.realpathSync(path.resolve(option(argv, '--repo')));
    const sourceCommit = option(argv, '--source-commit');
    const runtime = Object.fromEntries(Object.entries(createRuntime()));
    if (typeof runtime.inspectTaskRecord !== 'function') throw new Error('Task Record runtime port is unavailable.');
    const taskResult = record(Reflect.apply(runtime.inspectTaskRecord, runtime, [workspace, taskId]), 'Task result');
    const taskValue = record(taskResult.record, 'Task record');
    if (typeof taskValue.taskId !== 'string' || typeof taskValue.status !== 'string') throw new Error('Release Task record is invalid.');
    const exactNode = createExactNodeExecutionEnvironment({ nodeExecutable: process.execPath, env: process.env, requireNpm: true });
    const auditValue = record(exactNode.audit, 'Exact Node audit');
    if (typeof auditValue.version !== 'string' || typeof auditValue.identity !== 'string') throw new Error('Exact Node audit identity is invalid.');
    const nodeAudit: NodeAudit = { version: auditValue.version, identity: auditValue.identity };
    const prepared = prepareReleaseDependencies({
      task: { taskId: taskValue.taskId, status: taskValue.status },
      taskStatus: 'active',
      repo,
      sourceCommit,
      readSourceFile: (commit, file) => gitShow(repo, commit, file),
      nodeAudit,
      execute: run,
      env: exactNode.env,
    });
    const output = argv.includes('--output') ? path.resolve(option(argv, '--output')) : null;
    if (output) fs.writeFileSync(output, `${JSON.stringify(prepared, null, 2)}\n`, { mode: 0o600 });
    process.stdout.write(`${JSON.stringify(prepared, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
