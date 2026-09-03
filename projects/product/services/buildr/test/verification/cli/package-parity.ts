#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnCommandSync } from '../../../src/infrastructure/process.ts';
import { createCandidatePackage, readSharedCandidatePackage } from '../release/candidate-package.ts';

const productRoot: any = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const checkoutCli: any = path.join(productRoot, 'bin', 'buildr.mjs');
const root: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-cli-parity-'));

function spawn(command: any, args: any, options: any = {}): any  {
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

function snapshot(directory: any): any  {
  const result: any = {};
  const visit: any = (current: any) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute: any = path.join(current, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else result[path.relative(directory, absolute).split(path.sep).join('/')] = fs.readFileSync(absolute, 'utf8');
    }
  };
  visit(directory);
  return result;
}

function normalizeWorkspaceSnapshot(value: any): any  {
  const workspaceId: any = value['.buildr/workspace.yml']?.match(/^id:\s*([0-9a-f-]{36})$/m)?.[1];
  const skillsWorkspaceId: any = value['skills/manifest.yml']?.match(/^workspaceId:\s*([0-9a-f-]{36})$/m)?.[1];
  assert.ok(workspaceId, 'Workspace metadata must contain a UUID');
  assert.doesNotMatch(value['.buildr/workspace.yml'], /^runtime:/m, 'Workspace metadata must not contain a runtime declaration');
  assert.equal(skillsWorkspaceId, workspaceId, 'Workspace and Skills manifests must share one UUID');
  return Object.fromEntries(Object.entries(value).map(([file, content]: any) => [file, content
    .replaceAll(workspaceId, '<workspace-id>')]));
}

try {
  const packDir: any = path.join(root, 'pack');
  const prefix: any = path.join(root, 'prefix');
  fs.mkdirSync(packDir, { recursive: true });
  const shared: any = readSharedCandidatePackage();
  let tarball: any = shared?.tarball;
  if (!tarball) tarball = (await createCandidatePackage(productRoot, packDir)).tarball;
  const installed: any = spawn(process.platform === 'win32' ? 'npm.cmd' : 'npm', [
    'install', '--offline', '--ignore-scripts', '--prefix', prefix, tarball,
  ], { env: { npm_config_cache: path.join(root, 'npm-cache'), npm_config_update_notifier: 'false' } });
  assert.equal(installed.status, 0, installed.stderr);
  const packagedCli: any = path.join(prefix, 'node_modules', '.bin', process.platform === 'win32' ? 'buildr.cmd' : 'buildr');
  const packagedRoot: any = path.join(prefix, 'node_modules', '@buildr-ai', 'buildr');
  assert.equal(fs.existsSync(path.join(packagedRoot, 'src')), false, 'npm artifact must not republish private product source');
  assert.equal(fs.existsSync(path.join(packagedRoot, 'runtime', 'buildr.cjs')), true, 'npm artifact must contain the bundled public runtime');
  const webDist: any = path.join(packagedRoot, 'payload', 'product', 'web-dist');
  for (const relative of ['index.html', 'assets']) assert.ok(fs.existsSync(path.join(webDist, relative)), `packaged Buildr Web dist asset is missing: ${relative}`);
  const distAssets: any = fs.readdirSync(path.join(webDist, 'assets'));
  assert.ok(distAssets.some((name: any) => name.endsWith('.js')), 'packaged Buildr Web web-dist must include built JS assets');
  assert.ok(distAssets.some((name: any) => name.endsWith('.css')), 'packaged Buildr Web web-dist must include built CSS assets');

  const runCheckout: any = (args: any) => spawn(process.execPath, [checkoutCli, ...args]);
  const runPackaged: any = (args: any) => spawn(packagedCli, args);
  const representativeOutputs: any[] = [
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
    const checkout: any = runCheckout(args);
    const packaged: any = runPackaged(args);
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

  const checkoutIdentity: any = JSON.parse(runCheckout(['version', '--json']).stdout);
  const packagedIdentity: any = JSON.parse(runPackaged(['version', '--json']).stdout);
  for (const field of ['schemaVersion', 'package', 'version', 'protocolIdentity', 'sourceCommit']) {
    assert.equal(packagedIdentity[field], checkoutIdentity[field], `version identity differs: ${field}`);
  }
  for (const field of ['platform', 'architecture']) {
    assert.equal(packagedIdentity.runtime[field], checkoutIdentity.runtime[field], `runtime identity differs: ${field}`);
  }
  for (const identity of [checkoutIdentity, packagedIdentity]) {
    const [major, minor]: any = identity.runtime.version.split('.').map(Number);
    assert.equal(major, 24);
    assert.ok(minor >= 15);
  }
  assert.equal(checkoutIdentity.channel, 'development');
  assert.equal(checkoutIdentity.runtime.role, 'development');
  assert.equal(checkoutIdentity.applicationPayloadDigest, null);
  assert.equal(packagedIdentity.channel, 'npm');
  assert.equal(packagedIdentity.runtime.role, 'host');
  assert.match(packagedIdentity.applicationPayloadDigest, /^sha256-[a-f0-9]{64}$/);

  const checkoutWorkspace: any = path.join(root, 'checkout-workspace');
  const packagedWorkspace: any = path.join(root, 'packaged-workspace');
  for (const [runner, workspace] of [[runCheckout, checkoutWorkspace], [runPackaged, packagedWorkspace]]) {
    const result: any = runner(['init', '--agent', 'codex', '--target', workspace, '--name', 'parity', '--description', 'Package parity workspace', '--profile', 'team']);
    assert.equal(result.status, 0, result.stderr);
  }
  assert.deepEqual(normalizeWorkspaceSnapshot(snapshot(packagedWorkspace)), normalizeWorkspaceSnapshot(snapshot(checkoutWorkspace)));

  console.log('CLI package parity verification passed: representative output and init mutation match checkout and npm tarball entrypoints.');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
