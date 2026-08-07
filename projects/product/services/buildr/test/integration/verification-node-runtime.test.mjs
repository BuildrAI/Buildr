import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { createVerificationExecutor } from '../verification/executor.mjs';

const productRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const nodeBin = path.dirname(process.execPath);

function executable(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content, { mode: 0o755 });
}

function fakeLowVersionPath(root) {
  const bin = path.join(root, 'fake-low-version-bin');
  for (const command of ['node', 'npm']) {
    executable(path.join(bin, command), `#!/bin/sh\necho "fake-low-version-${command}" >&2\nexit 97\n`);
  }
  return bin;
}

function runtimeProbeSource() {
  return `
import { spawnSync } from 'node:child_process';
import process from 'node:process';
const run = (command, args) => spawnSync(command, args, { encoding: 'utf8', env: process.env });
const node = run('node', ['-p', 'process.execPath']);
const npm = run('npm', ['--version']);
process.stdout.write(JSON.stringify({
  execPath: process.execPath,
  path: process.env.PATH,
  nestedNode: node.stdout.trim(),
  nestedNodeStatus: node.status,
  nestedNpmStatus: npm.status,
}));
if (node.status !== 0 || npm.status !== 0) process.exitCode = 1;
`;
}

test('verification executor preserves upstream PATH while pinning Node and npm to the current distribution', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-verification-node-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const fakeBin = fakeLowVersionPath(root);
  const fixture = path.join(root, 'runtime-probe.mjs');
  fs.writeFileSync(fixture, runtimeProbeSource());
  fs.mkdirSync(path.join(root, 'node_modules', '.bin'), { recursive: true });

  const execute = createVerificationExecutor({
    productRoot: root,
    env: { PATH: [fakeBin, '/usr/bin', '/bin'].join(path.delimiter) },
  });
  const nodeResult = await execute({
    id: 'workspace-node-probe',
    name: 'workspace node probe',
    executor: { type: 'node', file: path.basename(fixture) },
  });
  assert.equal(nodeResult.status, 'passed', nodeResult.stderr);
  const probe = JSON.parse(nodeResult.stdout);
  const childPath = probe.path.split(path.delimiter);
  assert.equal(probe.execPath, process.execPath);
  assert.equal(probe.nestedNode, process.execPath);
  assert.equal(probe.nestedNodeStatus, 0);
  assert.equal(probe.nestedNpmStatus, 0);
  assert.equal(childPath[0], nodeBin);
  assert.equal(childPath[1], path.join(root, 'node_modules', '.bin'));
  assert.ok(childPath.includes(fakeBin), 'options.env.PATH must remain in the child environment');

  const npmResult = await execute({
    id: 'workspace-npm-probe',
    name: 'workspace npm probe',
    executor: { type: 'npm', args: ['--version'] },
  });
  assert.equal(npmResult.status, 'passed', npmResult.stderr);
  assert.doesNotMatch(`${npmResult.stdout}\n${npmResult.stderr}`, /fake-low-version-npm/);
});

test('verification shell wrappers use the declared Workspace Node with a hostile PATH', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-verification-wrapper-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const fakeBin = fakeLowVersionPath(root);
  const scripts = path.join(root, 'scripts');
  const verification = path.join(root, 'test', 'verification');
  const appData = path.join(root, 'app-data');
  const managedBin = path.join(appData, 'runtimes', 'node', '24.15.0', 'darwin-arm64', 'bin');
  fs.mkdirSync(scripts, { recursive: true });
  fs.mkdirSync(verification, { recursive: true });
  fs.mkdirSync(path.join(root, 'node_modules', '.bin'), { recursive: true });
  fs.symlinkSync(path.join(productRoot, 'src'), path.join(root, 'src'), 'junction');
  fs.symlinkSync(path.join(productRoot, 'node_modules', 'yaml'), path.join(root, 'node_modules', 'yaml'), 'junction');
  fs.mkdirSync(path.join(root, '.buildr'), { recursive: true });
  fs.writeFileSync(path.join(root, '.buildr', 'workspace.yml'), [
    'schemaVersion: buildr.workspace/v1',
    'id: f2f40b71-2382-5906-82bd-76a7927b59f3',
    'name: Wrapper test',
    'description: Wrapper test',
    'runtime:',
    '  node:',
    '    version: 24.15.0',
    '',
  ].join('\n'));
  executable(path.join(managedBin, 'node'), '#!/bin/sh\nif [ "$1" = "-p" ] && [ "$2" = "process.versions.node" ]; then echo 24.15.0; exit 0; fi\nexport BUILDR_TEST_SELECTED_RUNTIME=workspace-node\nexec "$BUILDR_TEST_REAL_NODE" "$@"\n');
  executable(path.join(managedBin, 'npm'), '#!/bin/sh\necho 11.12.1\n');
  fs.copyFileSync(path.join(productRoot, 'scripts', 'verify-buildr-product-fast'), path.join(scripts, 'verify-buildr-product-fast'));
  fs.copyFileSync(path.join(productRoot, 'scripts', 'verify-buildr-product'), path.join(scripts, 'verify-buildr-product'));
  fs.copyFileSync(path.join(productRoot, 'scripts', 'run-workspace-node.mjs'), path.join(scripts, 'run-workspace-node.mjs'));
  fs.writeFileSync(path.join(verification, 'profile.mjs'), 'process.stdout.write(process.env.BUILDR_TEST_SELECTED_RUNTIME || "missing");\n');
  fs.writeFileSync(path.join(verification, 'candidate.mjs'), 'process.stdout.write(process.env.BUILDR_TEST_SELECTED_RUNTIME || "missing");\n');
  executable(path.join(root, 'node_modules', '.bin', 'openspec'), '#!/bin/sh\nexit 0\n');
  const env = {
    ...process.env,
    PATH: [fakeBin, '/usr/bin', '/bin'].join(path.delimiter),
    npm_node_execpath: process.execPath,
    BUILDR_NODE_RUNTIME_DATA_DIR: appData,
    BUILDR_TEST_REAL_NODE: process.execPath,
  };

  for (const wrapper of ['verify-buildr-product-fast', 'verify-buildr-product']) {
    const result = spawnSync('/bin/bash', [path.join(scripts, wrapper)], { encoding: 'utf8', env });
    assert.equal(result.status, 0, `${wrapper}\n${result.stdout}\n${result.stderr}`);
    assert.equal(result.stdout, 'workspace-node');
    assert.doesNotMatch(result.stderr, /fake-low-version-node/);
  }
});
