#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawn, spawnSync } from 'node:child_process';
import { readSharedCandidatePackage } from '../release/candidate-package.mjs';

const productRoot = path.resolve(import.meta.dirname, '../../..');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-host-node-cli-'));
const prefix = path.join(root, 'prefix');
const workspace = path.join(root, 'workspace');
const appData = path.join(root, 'app-data');
const npmCache = path.join(root, 'npm-cache');
const npmExecutable = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const windowsRuntimeSource = process.platform === 'win32' ? path.dirname(fs.realpathSync(process.execPath)) : null;
const runtimeEnv = {
  BUILDR_APP_DATA_DIR: appData,
  BUILDR_PRODUCT_DATA_DIR: appData,
  npm_config_cache: npmCache,
  npm_config_update_notifier: 'false',
};
let web = null;

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

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForInstance(file, child, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Buildr Web exited before readiness with code ${child.exitCode}.`);
    try {
      const instance = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (typeof instance.url === 'string' && typeof instance.secret === 'string' && Number.isInteger(instance.pid)) return instance;
    } catch {}
    await delay(100);
  }
  throw new Error('Buildr Web did not write a readiness instance before timeout.');
}

async function stopWeb(child) {
  if (!child || child.exitCode !== null) return;
  child.kill('SIGTERM');
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline && child.exitCode === null) await delay(50);
  if (child.exitCode === null) child.kill('SIGKILL');
}

try {
  fs.mkdirSync(workspace, { recursive: true });
  if (windowsRuntimeSource) assert.equal(fs.existsSync(path.join(windowsRuntimeSource, 'npm.cmd')), true, 'Host Node distribution must include npm.cmd');
  const shared = readSharedCandidatePackage();
  assert.ok(shared?.tarball, 'Host Node CLI smoke requires the shared candidate tarball');
  run(npmExecutable, ['install', '--offline', '--global', '--prefix', prefix, shared.tarball], { env: runtimeEnv });
  const modulesRoot = process.platform === 'win32' ? path.join(prefix, 'node_modules') : path.join(prefix, 'lib', 'node_modules');
  const buildrScript = path.join(modulesRoot, '@buildr-ai', 'buildr', 'bin', 'buildr.mjs');
  const instanceFile = path.join(appData, 'instance.json');
  assert.equal(fs.existsSync(buildrScript), true);
  assert.match(run(process.execPath, [buildrScript, '--help'], { cwd: workspace, env: runtimeEnv }), /Buildr/);
  assert.equal(fs.existsSync(instanceFile), false, 'ordinary CLI must not start HTTP');
  run(process.execPath, [buildrScript, 'init', '--agent', 'codex', '--target', workspace, '--name', 'host-node-smoke', '--description', 'Host Node compatibility smoke', '--profile', 'team'], { cwd: workspace, env: runtimeEnv });
  const doctor = JSON.parse(run(process.execPath, [buildrScript, 'doctor', '--agent', 'codex', '--target', workspace, '--json'], { cwd: workspace, env: runtimeEnv }));
  assert.equal(doctor.schemaVersion, 'buildr.doctor/v1');
  assert.equal(doctor.summary.error, 0);
  assert.equal(fs.existsSync(instanceFile), false, 'representative CLI must not start HTTP');

  const cliIdentity = JSON.parse(run(process.execPath, [buildrScript, 'version', '--json'], { cwd: workspace, env: runtimeEnv }));
  assert.equal(cliIdentity.channel, 'npm');
  assert.equal(cliIdentity.runtime?.role, 'host');
  assert.equal(cliIdentity.runtime?.version, process.versions.node);
  assert.equal(cliIdentity.applicationPayloadDigest, shared.manifest.applicationPayloadDigest);

  web = spawn(process.execPath, [buildrScript, 'web', '--no-open', '--port', '0'], {
    cwd: workspace,
    env: { ...process.env, ...runtimeEnv },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let stdout = '';
  let stderr = '';
  web.stdout.setEncoding('utf8');
  web.stderr.setEncoding('utf8');
  web.stdout.on('data', (chunk) => { stdout += chunk; });
  web.stderr.on('data', (chunk) => { stderr += chunk; });
  let instance;
  try {
    instance = await waitForInstance(instanceFile, web);
  } catch (error) {
    throw new Error(`${error.message}${stderr.trim() ? `; stderr: ${stderr.trim()}` : ''}${stdout.trim() ? `; stdout: ${stdout.trim()}` : ''}`);
  }
  const health = await fetch(`${instance.url}/api/v1/health`, {
    headers: { 'x-buildr-instance': instance.secret },
    signal: AbortSignal.timeout(2_000),
  });
  assert.equal(health.status, 200);
  const readiness = await health.json();
  assert.equal(readiness.schemaVersion, 'buildr.local-app-health/v1');
  assert.equal(readiness.status, 'ready');
  assert.equal(readiness.pid, web.pid);
  assert.equal(readiness.productIdentity?.channel, 'npm');
  assert.equal(readiness.productIdentity?.runtime?.role, 'host');
  assert.equal(readiness.productIdentity?.runtime?.version, process.versions.node);
  assert.equal(readiness.productIdentity?.applicationPayloadDigest, shared.manifest.applicationPayloadDigest);
  assert.equal(readiness.productIdentity?.installationIdentity, cliIdentity.installationIdentity);
  const shell = await fetch(instance.url, { signal: AbortSignal.timeout(2_000) });
  assert.equal(shell.status, 200);
  assert.match(await shell.text(), /<div id="root"><\/div>/);
  process.stdout.write(`Installed CLI and on-demand Buildr Web smoke passed on ${process.platform} with Host Node ${process.versions.node}; main role=host.\n`);
} finally {
  await stopWeb(web);
  fs.rmSync(root, { recursive: true, force: true });
}
