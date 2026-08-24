#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnCommandSync } from '../../../src/infrastructure/process.mjs';
import { createCandidatePackage, readSharedCandidatePackage } from '../release/candidate-package.mjs';

const productRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const checkoutCli = path.join(productRoot, 'bin', 'buildr.mjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-cli-parity-'));

function spawn(command, args, options = {}) {
  return spawnCommandSync(command, args, {
    cwd: options.cwd || productRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      BUILDR_APP_DATA_DIR: path.join(root, 'app-data'),
      BUILDR_PRODUCT_DATA_DIR: path.join(root, 'app-data'),
      ...options.env,
    },
  });
}

function snapshot(directory) {
  const result = {};
  const visit = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else result[path.relative(directory, absolute).split(path.sep).join('/')] = fs.readFileSync(absolute, 'utf8');
    }
  };
  visit(directory);
  return result;
}

function normalizeWorkspaceSnapshot(value) {
  const workspaceId = value['.buildr/workspace.yml']?.match(/^id:\s*([0-9a-f-]{36})$/m)?.[1];
  const skillsWorkspaceId = value['skills/manifest.yml']?.match(/^workspaceId:\s*([0-9a-f-]{36})$/m)?.[1];
  assert.ok(workspaceId, 'Workspace metadata must contain a UUID');
  assert.doesNotMatch(value['.buildr/workspace.yml'], /^runtime:/m, 'Workspace metadata must not contain a runtime declaration');
  assert.equal(skillsWorkspaceId, workspaceId, 'Workspace and Skills manifests must share one UUID');
  return Object.fromEntries(Object.entries(value).map(([file, content]) => [file, content
    .replaceAll(workspaceId, '<workspace-id>')]));
}

try {
  const packDir = path.join(root, 'pack');
  const prefix = path.join(root, 'prefix');
  fs.mkdirSync(packDir, { recursive: true });
  const shared = readSharedCandidatePackage();
  let tarball = shared?.tarball;
  if (!tarball) tarball = (await createCandidatePackage(productRoot, packDir)).tarball;
  const installed = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', [
    'install', '--offline', '--ignore-scripts', '--prefix', prefix, tarball,
  ], { env: { npm_config_cache: path.join(root, 'npm-cache'), npm_config_update_notifier: 'false' } });
  assert.equal(installed.status, 0, installed.stderr);
  const packagedCli = path.join(prefix, 'node_modules', '.bin', process.platform === 'win32' ? 'buildr.cmd' : 'buildr');
  const packagedRoot = path.join(prefix, 'node_modules', '@buildr-ai', 'buildr');
  assert.equal(fs.existsSync(path.join(packagedRoot, 'src')), false, 'npm artifact must not republish private product source');
  assert.equal(fs.existsSync(path.join(packagedRoot, 'runtime', 'buildr.cjs')), true, 'npm artifact must contain the bundled public runtime');
  const webDist = path.join(packagedRoot, 'payload', 'product', 'web-dist');
  for (const relative of ['index.html', 'assets']) assert.ok(fs.existsSync(path.join(webDist, relative)), `packaged Buildr Web dist asset is missing: ${relative}`);
  const distAssets = fs.readdirSync(path.join(webDist, 'assets'));
  assert.ok(distAssets.some((name) => name.endsWith('.js')), 'packaged Buildr Web web-dist must include built JS assets');
  assert.ok(distAssets.some((name) => name.endsWith('.css')), 'packaged Buildr Web web-dist must include built CSS assets');

  const runCheckout = (args) => spawn(process.execPath, [checkoutCli, ...args]);
  const runPackaged = (args) => spawn(packagedCli, args);
  const representativeOutputs = [
    [],
    ['--version'],
    ['help', 'doctor'],
    ['help', 'update'],
    ['help', 'update', 'check'],
    ['help', 'task', 'verification'],
    ['help', 'task', 'finish', 'run'],
    ['help', 'task', 'finish', 'inspect'],
    ['task', 'create', '--json'],
    ['runtime', 'list', '--json'],
    ['doctr', '--json'],
  ];
  for (const args of representativeOutputs) {
    const checkout = runCheckout(args);
    const packaged = runPackaged(args);
    assert.equal(packaged.status, checkout.status, [
      `exit status differs: ${args.join(' ')}`,
      `checkout stdout: ${checkout.stdout}`,
      `checkout stderr: ${checkout.stderr}`,
      `packaged stdout: ${packaged.stdout}`,
      `packaged stderr: ${packaged.stderr}`,
    ].join('\n'));
    assert.equal(packaged.stdout, checkout.stdout, `stdout differs: ${args.join(' ')}`);
    assert.equal(packaged.stderr, checkout.stderr, `stderr differs: ${args.join(' ')}`);
  }

  const checkoutIdentity = JSON.parse(runCheckout(['version', '--json']).stdout);
  const packagedIdentity = JSON.parse(runPackaged(['version', '--json']).stdout);
  for (const field of ['schemaVersion', 'package', 'version', 'protocolIdentity', 'sourceCommit']) {
    assert.equal(packagedIdentity[field], checkoutIdentity[field], `version identity differs: ${field}`);
  }
  for (const field of ['platform', 'architecture']) {
    assert.equal(packagedIdentity.runtime[field], checkoutIdentity.runtime[field], `runtime identity differs: ${field}`);
  }
  for (const identity of [checkoutIdentity, packagedIdentity]) {
    const [major, minor] = identity.runtime.version.split('.').map(Number);
    assert.equal(major, 24);
    assert.ok(minor >= 15);
  }
  assert.equal(checkoutIdentity.channel, 'development');
  assert.equal(checkoutIdentity.runtime.role, 'development');
  assert.equal(checkoutIdentity.applicationPayloadDigest, null);
  assert.equal(packagedIdentity.channel, 'npm');
  assert.equal(packagedIdentity.runtime.role, 'host');
  assert.match(packagedIdentity.applicationPayloadDigest, /^sha256-[a-f0-9]{64}$/);

  const checkoutWorkspace = path.join(root, 'checkout-workspace');
  const packagedWorkspace = path.join(root, 'packaged-workspace');
  for (const [runner, workspace] of [[runCheckout, checkoutWorkspace], [runPackaged, packagedWorkspace]]) {
    const result = runner(['init', '--agent', 'codex', '--target', workspace, '--name', 'parity', '--description', 'Package parity workspace', '--profile', 'team']);
    assert.equal(result.status, 0, result.stderr);
  }
  assert.deepEqual(normalizeWorkspaceSnapshot(snapshot(packagedWorkspace)), normalizeWorkspaceSnapshot(snapshot(checkoutWorkspace)));

  console.log('CLI package parity verification passed: representative output and init mutation match checkout and npm tarball entrypoints.');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
