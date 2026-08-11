#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readSharedCandidatePackage } from './candidate-package.mjs';

const productRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-release-smoke-'));
const packDirectory = path.join(root, 'pack');
const prefix = path.join(root, 'prefix');
const workspace = path.join(root, 'workspace');
const appData = path.join(root, 'app-data');
const npmExecutable = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? productRoot,
    encoding: 'utf8',
    env: { ...process.env, ...options.env },
    shell: process.platform === 'win32' && command === npmExecutable,
  });
  if (result.status !== (options.expectedStatus ?? 0)) {
    throw new Error(`${command} ${args.join(' ')} exited ${result.status}:\n${result.stdout}\n${result.stderr}`);
  }
  return result.stdout;
}

function runBuildr(buildrScript, args) {
  return run(process.execPath, [buildrScript, ...args], {
    cwd: workspace,
    env: { BUILDR_APP_DATA_DIR: appData, BUILDR_NODE_RUNTIME_DATA_DIR: appData },
  });
}

function parseJson(label, output, schemaVersion) {
  const payload = JSON.parse(output);
  assert.equal(payload.schemaVersion, schemaVersion, `${label} schemaVersion`);
  return payload;
}

try {
  fs.mkdirSync(packDirectory, { recursive: true });
  fs.mkdirSync(workspace, { recursive: true });

  const shared = readSharedCandidatePackage();
  let tarball = shared?.tarball;
  if (!tarball) {
    const pack = JSON.parse(run(npmExecutable, ['pack', productRoot, '--pack-destination', packDirectory, '--json']));
    assert.equal(pack.length, 1, 'release smoke must produce one tarball');
    tarball = path.join(packDirectory, pack[0].filename);
  }
  run(npmExecutable, ['install', '--global', '--prefix', prefix, tarball]);

  const modulesRoot = process.platform === 'win32' ? path.join(prefix, 'node_modules') : path.join(prefix, 'lib', 'node_modules');
  const buildrScript = path.join(modulesRoot, '@buildr-ai', 'buildr', 'bin', 'buildr.mjs');
  assert.equal(fs.existsSync(buildrScript), true, 'installed Buildr executable source must exist');

  const updateCheck = parseJson('registry update check', run(process.execPath, [buildrScript, 'update', 'check', '--json'], {
    cwd: workspace,
    expectedStatus: 1,
    env: {
      BUILDR_APP_DATA_DIR: appData,
      BUILDR_NODE_RUNTIME_DATA_DIR: appData,
      npm_config_registry: 'http://127.0.0.1:9',
      npm_config_fetch_retries: '0',
      npm_config_fetch_timeout: '1000',
    },
  }), 'buildr.update-check/v1');
  assert.equal(updateCheck.mode, 'registry-package');
  assert.equal(updateCheck.status, 'blocked');

  runBuildr(buildrScript, ['init', '--agent', 'codex', '--target', workspace, '--name', 'release-smoke', '--profile', 'team']);
  runBuildr(buildrScript, ['sync', 'codex', '--target', workspace]);
  const doctorBefore = parseJson('doctor before uninstall', runBuildr(buildrScript, ['doctor', '--agent', 'codex', '--target', workspace, '--json']), 'buildr.doctor/v1');
  assert.equal(doctorBefore.summary.error, 0);

  runBuildr(buildrScript, ['component', 'uninstall', 'openspec', '--agent', 'codex', '--target', workspace, '--reason', 'release-smoke']);
  const doctorAfter = parseJson('doctor after uninstall', runBuildr(buildrScript, ['doctor', '--agent', 'codex', '--target', workspace, '--json']), 'buildr.doctor/v1');
  assert.equal(doctorAfter.summary.error, 0);
  assert.equal(fs.existsSync(path.join(workspace, '.agents', 'skills', 'openspec-explore')), false);

  console.log(`Buildr release smoke passed on ${process.platform} with Node ${process.versions.node}.`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
