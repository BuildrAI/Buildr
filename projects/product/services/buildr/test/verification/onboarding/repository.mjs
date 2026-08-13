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

const skippedNames = new Set(['.git', '.worktrees', 'node_modules', '.agents', '.claude']);
function copyFilter(source) {
  if (source === workspaceRoot) return true;
  const relative = path.relative(workspaceRoot, source);
  if (relative === path.join('.buildr', 'local') || relative.startsWith(`${path.join('.buildr', 'local')}${path.sep}`)) return false;
  return !relative.split(path.sep).some((segment) => skippedNames.has(segment));
}

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

try {
  fs.cpSync(workspaceRoot, checkout, { recursive: true, filter: copyFilter });
  const copiedProduct = path.join(checkout, 'projects', 'product');
  const copiedService = path.join(copiedProduct, 'services', 'buildr');
  assert.equal(fs.existsSync(path.join(copiedService, 'node_modules')), false, 'fresh candidate must not contain node_modules');
  assert.equal(fs.existsSync(path.join(checkout, '.agents')), false, 'fresh candidate must not contain Agent runtime');
  assert.equal(fs.existsSync(path.join(checkout, '.buildr', 'local')), false, 'fresh candidate must not copy Workspace-local structured state');
  run('git', ['init', '--bare', '-q', remote], { cwd: tempRoot });
  run('git', ['init', '-q'], { cwd: checkout });
  run('git', ['config', 'user.email', 'buildr@example.com'], { cwd: checkout });
  run('git', ['config', 'user.name', 'Buildr Verification'], { cwd: checkout });
  run('git', ['add', '.'], { cwd: checkout });
  run('git', ['commit', '-qm', 'candidate'], { cwd: checkout });
  run('git', ['branch', '-M', 'main'], { cwd: checkout });
  run('git', ['remote', 'add', 'origin', remote], { cwd: checkout });
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
  fs.symlinkSync(path.join(copiedProduct, 'bin', 'buildr.mjs'), path.join(installBin, 'buildr'));
  run(path.join(copiedService, 'scripts', 'install-buildr-cli'), ['--node-executable', process.execPath], { cwd: copiedService, env });
  const buildr = path.join(installBin, 'buildr');
  assert.equal(fs.existsSync(buildr), true, 'installer must create the buildr command');
  assert.equal(fs.lstatSync(buildr).isSymbolicLink(), false, 'installer must create an identity-bound wrapper');
  const installedIdentity = JSON.parse(run(buildr, [], {
    cwd: checkout,
    env: { ...env, BUILDR_INTERNAL_DEVELOPMENT_CLI_IDENTITY_JSON: '1' },
    capture: true,
  }));
  assert.equal(installedIdentity.wrapperSchema, 'buildr.development-cli-wrapper/v1');
  assert.equal(fs.realpathSync(installedIdentity.launcher), fs.realpathSync(path.join(copiedService, 'scripts', 'run-development-cli')));
  assert.equal(fs.realpathSync(installedIdentity.nodeExecutable), fs.realpathSync(process.execPath));
  run(buildr, ['sync', 'codex', '--target', checkout], { cwd: checkout, env });
  const synchronizedStatus = run('git', ['status', '--short'], { cwd: checkout, env, capture: true }).trimEnd();
  if (synchronizedStatus.trim()) {
    const managedRoots = ['.buildr/builtin-receipts.json', 'rules/', 'skills/', 'commands/', 'components/'];
    const unexpected = synchronizedStatus.split('\n')
      .map((line) => line.slice(3).split(' -> ').at(-1))
      .filter((file) => !managedRoots.some((root) => file === root || file.startsWith(root)));
    assert.deepEqual(unexpected, [], `sync must only update Buildr-owned projections:\n${synchronizedStatus}`);
    run('git', ['add', '-A', '--', '.buildr/builtin-receipts.json', 'rules', 'skills', 'commands', 'components'], { cwd: checkout });
    run('git', ['commit', '-qm', 'synchronize Buildr-owned projections'], { cwd: checkout });
    run('git', ['push', '-q'], { cwd: checkout });
  }
  const runtime = JSON.parse(run(buildr, ['runtime', 'list', '--json'], { cwd: checkout, env, capture: true }));
  assert(runtime.supportedAgents.includes('codex'));
  const launcher = JSON.parse(run(process.execPath, [fs.realpathSync(path.join(copiedService, 'package', 'launchers', 'manage.mjs')), 'install', '--channel', 'development', '--target', launcherRoot], { cwd: checkout, env, capture: true }));
  assert.equal(launcher.installed, true);
  assert.equal(launcher.identity.channel, 'development');
  assert.equal(fs.realpathSync(launcher.identity.sourceRoot), fs.realpathSync(copiedService));
  assert.equal(fs.realpathSync(launcher.identity.developmentRuntime.executable), fs.realpathSync(process.execPath));
  const doctor = JSON.parse(run(buildr, ['doctor', '--agent', 'codex', '--target', checkout, '--json'], { cwd: checkout, env, capture: true, timeout: 180000 }));
  assert.equal(doctor.health.ready, true, `candidate-installed default CLI must complete the real sync → Launcher → Doctor chain: ${JSON.stringify(doctor.findings || [])}`);
  const update = JSON.parse(run(buildr, ['update', 'check', '--json'], { cwd: checkout, env, capture: true }));
  assert.equal(update.mode, 'development');
  assert.equal(update.status, 'up-to-date');

  run(path.join(copiedService, 'scripts', 'uninstall-buildr-cli'), [], { cwd: copiedService, env });
  assert.equal(fs.existsSync(buildr), false, 'uninstaller must remove the symlink managed by this checkout');
  run(path.join(copiedService, 'scripts', 'uninstall-buildr-cli'), [], { cwd: copiedService, env });
  run(path.join(copiedService, 'scripts', 'install-buildr-cli'), ['--node-executable', process.execPath], { cwd: copiedService, env });
  const reinstalledIdentity = JSON.parse(run(buildr, [], {
    cwd: checkout,
    env: { ...env, BUILDR_INTERNAL_DEVELOPMENT_CLI_IDENTITY_JSON: '1' },
    capture: true,
  }));
  assert.equal(reinstalledIdentity.wrapperSchema, 'buildr.development-cli-wrapper/v1');
  assert.equal(fs.realpathSync(reinstalledIdentity.launcher), fs.realpathSync(path.join(copiedService, 'scripts', 'run-development-cli')));

  console.log('Repository onboarding verification passed: clean checkout, identity-bound development CLI, sync, Development Launcher, Doctor ready, reinstall, runtime discovery, and update source.');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
