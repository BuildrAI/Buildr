#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { parseWorkspaceManifest } from '../src/infrastructure/filesystem/workspace-manifest-repository.mjs';
import { probeWorkspaceNodeRuntime } from '../src/infrastructure/filesystem/workspace-node-runtime.mjs';

const productRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function findWorkspaceRoot(start) {
  let current = path.resolve(start);
  while (true) {
    if (fs.existsSync(path.join(current, '.buildr', 'workspace.yml'))) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const [script, ...args] = process.argv.slice(2);
if (!script) fail('Usage: run-workspace-node.mjs <script> [args...]');

const workspaceRoot = findWorkspaceRoot(productRoot);
if (!workspaceRoot) fail('Workspace manifest is missing. Run this command from an initialized Workspace.');

const metadataPath = path.join(workspaceRoot, '.buildr', 'workspace.yml');
let metadata;
try {
  metadata = parseWorkspaceManifest(fs.readFileSync(metadataPath, 'utf8'), metadataPath);
} catch (error) {
  fail(`Workspace manifest is invalid: ${error.message}`);
}

const probe = probeWorkspaceNodeRuntime(metadata.workspace);
if (probe.status !== 'ready') {
  fail(`Workspace Node runtime ${metadata.workspace.runtime?.node?.version || '(undeclared)'} is not ready (${probe.status}). Run projects/product/buildr sync codex --target ${workspaceRoot}.`);
}

const environment = {
  ...process.env,
  PATH: [probe.paths.bin, process.env.PATH].filter(Boolean).join(path.delimiter),
  BUILDR_WORKSPACE_NODE_IDENTITY: probe.identity.digest,
  BUILDR_WORKSPACE_NODE_VERSION: probe.identity.version,
  npm_node_execpath: probe.paths.node,
  npm_execpath: probe.paths.npm,
};
const result = spawnSync(probe.paths.node, [path.resolve(productRoot, script), ...args], {
  cwd: productRoot,
  env: environment,
  stdio: 'inherit',
  windowsHide: false,
});

if (result.error) fail(`Workspace Node execution failed: ${result.error.message}`);
if (result.signal) {
  process.kill(process.pid, result.signal);
} else {
  process.exitCode = result.status ?? 1;
}
