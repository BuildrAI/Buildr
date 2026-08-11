#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { readSharedCandidatePackage } from '../release/candidate-package.mjs';

const productRoot = path.resolve(import.meta.dirname, '../../..');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-host-node-cli-'));
const prefix = path.join(root, 'prefix');
const workspace = path.join(root, 'workspace');
const appData = path.join(root, 'app-data');
const npmExecutable = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const windowsRuntimeSource = process.platform === 'win32' ? path.dirname(fs.realpathSync(process.execPath)) : null;
const runtimeEnv = {
  BUILDR_APP_DATA_DIR: appData,
  BUILDR_NODE_RUNTIME_DATA_DIR: appData,
  ...(windowsRuntimeSource ? { BUILDR_NODE_RUNTIME_SOURCE_ROOT: windowsRuntimeSource } : {}),
};

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? productRoot,
    encoding: 'utf8',
    env: { ...process.env, ...options.env },
    shell: process.platform === 'win32' && command === npmExecutable,
  });
  assert.equal(result.status, 0, `${command} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

try {
  fs.mkdirSync(workspace, { recursive: true });
  if (windowsRuntimeSource) assert.equal(fs.existsSync(path.join(windowsRuntimeSource, 'npm.cmd')), true, 'Host Node distribution must include npm.cmd');
  const shared = readSharedCandidatePackage();
  assert.ok(shared?.tarball, 'Host Node CLI smoke requires the shared candidate tarball');
  run(npmExecutable, ['install', '--offline', '--global', '--prefix', prefix, shared.tarball]);
  const modulesRoot = process.platform === 'win32' ? path.join(prefix, 'node_modules') : path.join(prefix, 'lib', 'node_modules');
  const buildrScript = path.join(modulesRoot, '@buildr-ai', 'buildr', 'bin', 'buildr.mjs');
  assert.equal(fs.existsSync(buildrScript), true);
  assert.match(run(process.execPath, [buildrScript, '--help'], { cwd: workspace }), /Buildr/);
  run(process.execPath, [buildrScript, 'init', '--agent', 'codex', '--target', workspace, '--name', 'host-node-smoke', '--description', 'Host Node compatibility smoke', '--profile', 'team'], { cwd: workspace, env: runtimeEnv });
  const doctor = JSON.parse(run(process.execPath, [buildrScript, 'doctor', '--agent', 'codex', '--target', workspace, '--json'], { cwd: workspace, env: runtimeEnv }));
  assert.equal(doctor.schemaVersion, 'buildr.doctor/v1');
  assert.equal(doctor.summary.error, 0);
  process.stdout.write(`Installed CLI smoke passed on ${process.platform} with Host Node ${process.versions.node}.\n`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
