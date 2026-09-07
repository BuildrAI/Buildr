import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { createRuntime } from '../../src/bootstrap/runtime.ts';
import { createLocalWorkspaceServer } from '../../src/web/http/server.ts';

const serviceRoot: any = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const buildrEntry: any = path.join(serviceRoot, 'bin/buildr.mjs');
const smokeRoot: any = process.env.BUILDR_SMOKE_ROOT;
const workspaceRoot: any = process.env.BUILDR_SMOKE_WORKSPACE_ROOT;

assert.ok(smokeRoot, 'BUILDR_SMOKE_ROOT is required. Use run-isolated-workspace-smoke.ts.');
assert.ok(workspaceRoot, 'BUILDR_SMOKE_WORKSPACE_ROOT is required. Use run-isolated-workspace-smoke.ts.');
assert.equal(process.env.BUILDR_APP_DATA_DIR, path.join(smokeRoot, 'app-data'));
assert.equal(process.env.BUILDR_PRODUCT_DATA_DIR, path.join(smokeRoot, 'product-data'));

function runBuildr(args: any): any  {
  const result: any = spawnSync(process.execPath, [buildrEntry, ...args], {
    cwd: serviceRoot,
    encoding: 'utf8',
    env: process.env,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

const sourceRoot: any = path.join(smokeRoot, 'service-source');
fs.mkdirSync(sourceRoot, { recursive: true });
fs.writeFileSync(path.join(sourceRoot, 'README.md'), '# Workspace smoke service\n');

runBuildr(['init', '--target', workspaceRoot, '--name', 'smoke', '--description', 'Isolated Buildr Workspace smoke.', '--profile', 'team']);
runBuildr(['project', 'create', 'smoke', '--target', workspaceRoot, '--name', 'Smoke', '--description', 'Workspace smoke project.']);
runBuildr(['service', 'create', 'smoke/app', sourceRoot, '--target', workspaceRoot, '--name', 'Smoke App', '--description', 'Workspace smoke service.', '--type', 'application']);

const runtime: any = createRuntime();
const instance: any = createLocalWorkspaceServer(runtime, { targetRoot: workspaceRoot });
try {
  const { url, initialWorkspaceId }: any = await instance.ready;
  const response: any = await fetch(`${url}/api/v1/workspaces`);
  assert.equal(response.status, 200);
  const registry: any = await response.json();
  assert.equal(registry.workspaces.length, 1);
  assert.equal(registry.workspaces[0].workspace.id, initialWorkspaceId);
  assert.equal(registry.workspaces[0].rootPath, workspaceRoot);
  assert.equal(runtime.listProjects(workspaceRoot).projects[0].code, 'smoke');
  assert.equal(runtime.listServices(workspaceRoot, 'smoke').services[0].code, 'app');
  process.stdout.write(`${JSON.stringify({
    schemaVersion: 'buildr.workspace-smoke-scenario/v1',
    status: 'passed',
    workspaceId: initialWorkspaceId,
  })}\n`);
} finally {
  await new Promise((resolve: any, reject: any) => instance.server.close((error: any) => error ? reject(error) : resolve()));
}
