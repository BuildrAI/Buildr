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
const remote = path.join(tempRoot, 'Buildr.git');

const skippedNames = new Set(['.git', '.worktrees', 'node_modules', '.agents', '.claude']);
function copyFilter(source) {
  if (source === workspaceRoot) return true;
  const relative = path.relative(workspaceRoot, source);
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
    PATH: `${installBin}${path.delimiter}${process.env.PATH || ''}`,
  };
  fs.mkdirSync(installBin, { recursive: true });
  fs.symlinkSync(path.join(copiedProduct, 'bin', 'buildr.mjs'), path.join(installBin, 'buildr'));
  run(path.join(copiedService, 'scripts', 'install-buildr-cli'), [], { cwd: copiedService, env });
  const buildr = path.join(installBin, 'buildr');
  assert.equal(fs.existsSync(buildr), true, 'installer must create the buildr command');
  assert.equal(fs.realpathSync(buildr), fs.realpathSync(path.join(copiedService, 'scripts', 'run-development-cli')), 'installer must target the Node-aware Service launcher');
  run(buildr, ['sync', 'codex', '--target', checkout], { cwd: checkout, env });
  const runtime = JSON.parse(run(buildr, ['runtime', 'list', '--json'], { cwd: checkout, env, capture: true }));
  assert(runtime.supportedAgents.includes('codex'));
  const update = JSON.parse(run(buildr, ['update', 'check', '--json'], { cwd: checkout, env, capture: true }));
  assert.equal(update.mode, 'development-checkout');
  assert.equal(update.status, 'up-to-date');

  run(path.join(copiedService, 'scripts', 'uninstall-buildr-cli'), [], { cwd: copiedService, env });
  assert.equal(fs.existsSync(buildr), false, 'uninstaller must remove the symlink managed by this checkout');
  run(path.join(copiedService, 'scripts', 'uninstall-buildr-cli'), [], { cwd: copiedService, env });
  run(path.join(copiedService, 'scripts', 'install-buildr-cli'), [], { cwd: copiedService, env });
  assert.equal(fs.realpathSync(buildr), fs.realpathSync(path.join(copiedService, 'scripts', 'run-development-cli')), 'reinstall must target the candidate Node-aware launcher');

  console.log('Repository onboarding verification passed: clean checkout, development CLI install/uninstall/reinstall, runtime discovery, and update source.');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
