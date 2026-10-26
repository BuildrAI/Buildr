import { createServiceDiagnostics } from '../../src/modules/workspace/application/diagnostics/service-diagnostics.ts';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import YAML from 'yaml';
import { spawnSync } from 'node:child_process';
import { resolveRuleScope } from '../../src/modules/agent-assets/infrastructure/runtime/rule-projection.ts';
import { createRuntime } from '../helpers/runtime-harness.ts';
import { copyPreparedProjectWorkspace, copyPreparedLegacyProjectWorkspace } from '../helpers/prepared-fixtures.ts';
import { createWorkspaceHttpContribution } from '../../src/modules/workspace/interfaces/http/workspace-http.ts';

function setup(t: any) {
  const { root } = copyPreparedProjectWorkspace(t, 'asset-relationships');
  const runtime: any = createRuntime();
  // Async clones may still run when the test finishes; drain before the sandbox is removed.
  t.after(async () => { if (runtime.repositoryCloneIdle) await runtime.repositoryCloneIdle(); });
  return { root, runtime };
}

function setupLegacy(t: any) {
  const { root } = copyPreparedLegacyProjectWorkspace(t, 'legacy-asset-relationships');
  const runtime: any = createRuntime();
  t.after(async () => { if (runtime.repositoryCloneIdle) await runtime.repositoryCloneIdle(); });
  return { root, runtime };
}

function ready(runtime: any, root: string) {
  const before = runtime.assetCatalog(root);
  return runtime.migrateAssetCatalog(root, { revision: before.revision });
}

function addRepo(runtime: any, root: string, revision: string, code: string, branch: string) {
  return runtime.createCatalogRepository(root, { revision, code, url: 'https://example.com/freshx.git', integrationBranch: branch });
}

async function waitFor(predicate: () => boolean, message: string, attempts = 200, intervalMs = 50) {
  for (let index = 0; index < attempts; index += 1) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
  throw new Error(message);
}

function makeOriginRepository(t: any, name: string): string {
  const origin = fs.mkdtempSync(path.join(os.tmpdir(), `buildr-${name}-`));
  t.after(() => fs.rmSync(origin, { recursive: true, force: true }));
  const run = (args: string[]) => spawnSync('git', args, { cwd: origin, encoding: 'utf8' });
  assert.equal(run(['init', '-b', 'main']).status, 0);
  assert.equal(run(['config', 'user.email', 'test@example.com']).status, 0);
  assert.equal(run(['config', 'user.name', 'Test']).status, 0);
  fs.writeFileSync(path.join(origin, 'README.md'), '# demo\n');
  assert.equal(run(['add', 'README.md']).status, 0);
  assert.equal(run(['commit', '-m', 'init']).status, 0);
  return origin;
}

function initRepository(location: string) {
  fs.mkdirSync(location, { recursive: true });
  const result = spawnSync('git', ['init', '--initial-branch=dev'], { cwd: location, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}

export { setup, setupLegacy, ready, addRepo, waitFor, makeOriginRepository, initRepository };
