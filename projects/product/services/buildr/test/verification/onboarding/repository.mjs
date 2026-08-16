#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const productRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const workspaceRoot = path.resolve(productRoot, '../../../..');
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-repository-onboarding-'));
const checkout = path.join(tempRoot, 'Buildr');
const installBin = path.join(tempRoot, 'bin');
const launcherRoot = path.join(tempRoot, 'launchers');
const appDataRoot = path.join(tempRoot, 'app-data');
const remote = path.join(tempRoot, 'Buildr.git');
const developmentNode = process.env.BUILDR_NODE || process.execPath;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? checkout,
    env: options.env ?? process.env,
    encoding: 'utf8',
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    timeout: options.timeout ?? 120000,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed (${result.status ?? 'no status'}):\n${result.stderr || result.stdout || result.error?.message || 'unknown error'}`);
  }
  return result.stdout || '';
}

function runDevelopment(args, options = {}) {
  const copiedProduct = path.join(checkout, 'projects', 'product');
  const env = { ...(options.env ?? process.env), BUILDR_NODE: developmentNode };
  if (process.platform === 'win32') {
    return run('sh', ['./buildr', ...args], { ...options, cwd: copiedProduct, env });
  }
  return run(path.join(copiedProduct, 'buildr'), args, { ...options, cwd: copiedProduct, env });
}

function npmCliForNode(nodeExecutable) {
  const executableDirectory = path.dirname(nodeExecutable);
  const candidates = [
    path.resolve(executableDirectory, '../lib/node_modules/npm/bin/npm-cli.js'),
    path.resolve(executableDirectory, 'node_modules/npm/bin/npm-cli.js'),
    process.env.npm_execpath,
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      if (fs.statSync(candidate).isFile()) return fs.realpathSync(candidate);
    } catch {}
  }
  throw new Error(`npm CLI for the Product Node was not found beside ${nodeExecutable}`);
}

function copyUntrackedSourceFiles() {
  const output = run('git', ['ls-files', '--others', '--exclude-standard', '-z'], { cwd: workspaceRoot, capture: true });
  for (const relative of output.split('\0').filter(Boolean)) {
    const source = path.join(workspaceRoot, relative);
    const target = path.join(checkout, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.cpSync(source, target, { recursive: true });
  }
}

try {
  const sourceCommit = run('git', ['rev-parse', 'HEAD'], { cwd: workspaceRoot, capture: true }).trim();
  run('git', ['clone', '--shared', '--no-checkout', '-q', workspaceRoot, checkout], { cwd: tempRoot });
  run('git', ['checkout', '--detach', '-q', sourceCommit], { cwd: checkout });
  const sourceDelta = run('git', ['diff', '--binary', 'HEAD'], { cwd: workspaceRoot, capture: true });
  if (sourceDelta) {
    const applied = spawnSync('git', ['apply', '--whitespace=nowarn', '-'], { cwd: checkout, input: sourceDelta, encoding: 'utf8' });
    if (applied.status !== 0) throw new Error(`failed to apply source delta: ${applied.stderr || applied.stdout || applied.error?.message || 'unknown error'}`);
  }
  copyUntrackedSourceFiles();
  const copiedProduct = path.join(checkout, 'projects', 'product');
  const copiedService = path.join(copiedProduct, 'services', 'buildr');
  assert.equal(fs.existsSync(path.join(copiedService, 'node_modules')), false, 'fresh candidate must not contain node_modules');
  assert.equal(fs.existsSync(path.join(checkout, '.agents')), false, 'fresh candidate must not contain Agent runtime');
  assert.equal(fs.existsSync(path.join(checkout, '.buildr', 'local')), false, 'fresh candidate must not copy Workspace-local structured state');
  run('git', ['init', '--bare', '-q', remote], { cwd: tempRoot });
  run('git', ['config', 'user.email', 'buildr@example.com'], { cwd: checkout });
  run('git', ['config', 'user.name', 'Buildr Verification'], { cwd: checkout });
  run('git', ['switch', '-C', 'main', '-q'], { cwd: checkout });
  const candidateStatus = run('git', ['status', '--short'], { cwd: checkout, capture: true });
  if (candidateStatus.trim()) {
    run('git', ['add', '-A'], { cwd: checkout });
    run('git', ['commit', '-qm', 'candidate'], { cwd: checkout });
  }
  run('git', ['remote', 'set-url', 'origin', remote], { cwd: checkout });
  run('git', ['push', '-qu', 'origin', 'main'], { cwd: checkout });

  const env = {
    ...process.env,
    HOME: tempRoot,
    BUILDR_CLI_INSTALL_DIR: installBin,
    BUILDR_LAUNCHER_INSTALL_DIR: launcherRoot,
    BUILDR_APP_DATA_DIR: appDataRoot,
    PATH: `${installBin}${path.delimiter}${process.env.PATH || ''}`,
  };
  fs.mkdirSync(installBin, { recursive: true });
  const pathSentinels = [path.join(installBin, 'buildr'), path.join(installBin, 'buildr.cmd')];
  for (const sentinel of pathSentinels) fs.writeFileSync(sentinel, `npm-owned sentinel: ${path.basename(sentinel)}\n`);
  const sentinelContents = new Map(pathSentinels.map((sentinel) => [sentinel, fs.readFileSync(sentinel, 'utf8')]));
  run(developmentNode, [npmCliForNode(developmentNode), 'ci', '--omit=dev', '--no-audit', '--no-fund'], { cwd: copiedService, env });
  const developmentIdentity = JSON.parse(runDevelopment([], {
    env: { ...env, BUILDR_INTERNAL_DEVELOPMENT_CLI_IDENTITY_JSON: '1' },
    capture: true,
  }));
  assert.equal(developmentIdentity.wrapperSchema, null);
  assert.equal(fs.realpathSync(developmentIdentity.launcher), fs.realpathSync(path.join(copiedService, 'scripts', 'run-development-cli')));
  assert.equal(fs.realpathSync(developmentIdentity.nodeExecutable), fs.realpathSync(developmentNode));
  runDevelopment(['sync', 'codex', '--target', checkout], { env });
  const synchronizedStatus = run('git', ['status', '--short'], { cwd: checkout, env, capture: true }).trimEnd();
  if (synchronizedStatus.trim()) {
    const managedRoots = ['.buildr/builtin-receipts.json', 'rules/', 'skills/', 'commands/', 'components/'];
    const canonicalMigrations = ['.buildr/workspace.yml'];
    const unexpected = synchronizedStatus.split('\n')
      .map((line) => line.slice(3).split(' -> ').at(-1))
      .filter((file) => !canonicalMigrations.includes(file) && !managedRoots.some((root) => file === root || file.startsWith(root)));
    assert.deepEqual(unexpected, [], `sync must only update canonical Workspace data and Buildr-owned projections:\n${synchronizedStatus}`);
    const synchronizedWorkspace = fs.readFileSync(path.join(checkout, '.buildr', 'workspace.yml'), 'utf8');
    assert.doesNotMatch(synchronizedWorkspace, /(?:^|\n)runtime:/, 'sync must remove the legacy Workspace Node declaration');
    run('git', ['add', '-A', '--', '.buildr/workspace.yml', '.buildr/builtin-receipts.json', 'rules', 'skills', 'commands', 'components'], { cwd: checkout });
    run('git', ['commit', '-qm', 'synchronize canonical Workspace data and Buildr-owned projections'], { cwd: checkout });
    run('git', ['push', '-q'], { cwd: checkout });
  }
  const runtime = JSON.parse(runDevelopment(['runtime', 'list', '--json'], { env, capture: true }));
  assert(runtime.supportedAgents.includes('codex'));
  const launcher = JSON.parse(run(developmentNode, [fs.realpathSync(path.join(copiedService, 'package', 'launchers', 'manage.mjs')), 'install', '--channel', 'development', '--target', launcherRoot], { cwd: checkout, env, capture: true }));
  assert.equal(launcher.installed, true);
  assert.equal(launcher.identity.channel, 'development');
  assert.equal(fs.realpathSync(launcher.identity.sourceRoot), fs.realpathSync(copiedService));
  assert.equal(fs.realpathSync(launcher.identity.developmentRuntime.executable), fs.realpathSync(developmentNode));
  const doctor = JSON.parse(runDevelopment(['doctor', '--agent', 'codex', '--target', checkout, '--json'], { env, capture: true, timeout: 180000 }));
  assert.equal(doctor.health.ready, true, `explicit checkout entry must complete the real sync → Launcher → Doctor chain: ${JSON.stringify(doctor.findings || [])}`);
  const update = JSON.parse(runDevelopment(['update', 'check', '--json'], { env, capture: true }));
  assert.equal(update.mode, 'development');
  assert.equal(update.status, 'up-to-date');
  for (const sentinel of pathSentinels) {
    assert.equal(fs.readFileSync(sentinel, 'utf8'), sentinelContents.get(sentinel), `development checkout must not mutate PATH default ${path.basename(sentinel)}`);
  }

  console.log('Repository onboarding verification passed: clean checkout, explicit development entry, no PATH CLI mutation, sync, Development Launcher, Doctor ready, runtime discovery, and update source.');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
