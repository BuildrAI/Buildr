#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnCommandSync } from '../../../src/infrastructure/process.mjs';
import { readSharedCandidatePackage } from '../release/candidate-package.mjs';

const productRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const checkoutCli = path.join(productRoot, 'bin', 'buildr.mjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-cli-parity-'));

function spawn(command, args, options = {}) {
  return spawnCommandSync(command, args, { cwd: options.cwd || productRoot, encoding: 'utf8', env: process.env });
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
  assert.equal(skillsWorkspaceId, workspaceId, 'Workspace and Skills manifests must share one UUID');
  return Object.fromEntries(Object.entries(value).map(([file, content]) => [file, content.replaceAll(workspaceId, '<workspace-id>')]));
}

try {
  const packDir = path.join(root, 'pack');
  const prefix = path.join(root, 'prefix');
  fs.mkdirSync(packDir, { recursive: true });
  const shared = readSharedCandidatePackage();
  let tarball = shared?.tarball;
  if (!tarball) {
    const packed = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['pack', '--json', '--pack-destination', packDir]);
    assert.equal(packed.status, 0, packed.stderr);
    tarball = path.join(packDir, JSON.parse(packed.stdout)[0].filename);
  }
  const installed = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['install', '--prefix', prefix, tarball]);
  assert.equal(installed.status, 0, installed.stderr);
  const packagedCli = path.join(prefix, 'node_modules', '.bin', process.platform === 'win32' ? 'buildr.cmd' : 'buildr');
  for (const relative of ['index.html', 'assets']) {
    assert.ok(fs.existsSync(path.join(prefix, 'node_modules', '@buildr-ai', 'buildr', 'src', 'interfaces', 'local-app', 'web-dist', relative)), `packaged local app dist asset is missing: ${relative}`);
  }
  assert.ok(fs.existsSync(path.join(prefix, 'node_modules', '@buildr-ai', 'buildr', 'src', 'interfaces', 'local-app', 'web-dist', 'index.html')), 'packaged local app web-dist index.html is missing');
  const distAssets = fs.readdirSync(path.join(prefix, 'node_modules', '@buildr-ai', 'buildr', 'src', 'interfaces', 'local-app', 'web-dist', 'assets'));
  assert.ok(distAssets.some((name) => name.endsWith('.js')), 'packaged local app web-dist must include built JS assets');
  assert.ok(distAssets.some((name) => name.endsWith('.css')), 'packaged local app web-dist must include built CSS assets');

  const runCheckout = (args) => spawn(process.execPath, [checkoutCli, ...args]);
  const runPackaged = (args) => spawn(packagedCli, args);
  const representativeOutputs = [
    [],
    ['--version'],
    ['version', '--json'],
    ['help', 'doctor'],
    ['help', 'task', 'verification'],
    ['task', 'create', '--json'],
    ['runtime', 'list', '--json'],
    ['doctr', '--json'],
  ];
  for (const args of representativeOutputs) {
    const checkout = runCheckout(args);
    const packaged = runPackaged(args);
    assert.equal(packaged.status, checkout.status, `exit status differs: ${args.join(' ')}`);
    assert.equal(packaged.stdout, checkout.stdout, `stdout differs: ${args.join(' ')}`);
    assert.equal(packaged.stderr, checkout.stderr, `stderr differs: ${args.join(' ')}`);
  }

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
