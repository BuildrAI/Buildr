import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import YAML from 'yaml';

import { createRuntime } from '../helpers/runtime-harness.ts';
import { createLocalWorkspaceServer } from '../../src/web/http/server.ts';
import { copyPreparedGitRepository, copyPreparedWorkspace, copyPreparedLegacyWorkspace } from '../helpers/prepared-fixtures.ts';

const PRODUCT_ROOT: any = path.resolve(import.meta.dirname, '../..');
const BUILDR: any = path.join(PRODUCT_ROOT, 'bin', 'buildr.mjs');

function tempRoot(t: any): any  {
  const root: any = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-project-product-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function run(command: any, args: any, cwd: any = PRODUCT_ROOT): any  {
  return spawnSync(command, args, { cwd, encoding: 'utf8' });
}

function runBuildr(args: any): any  {
  return run(process.execPath, [BUILDR, ...args]);
}

function initWorkspace(t: any): any  {
  return copyPreparedWorkspace(t, 'project-product').root;
}

test('v1 Project registry 读取零写入，显式 migration 原子且幂等', (t: any) => {
  const root: any = initWorkspace(t);
  const manifest: any = path.join(root, 'projects', 'manifest.yml');
  fs.mkdirSync(path.join(root, 'projects', 'legacy'), { recursive: true });
  fs.writeFileSync(manifest, [
    'schemaVersion: buildr.projects/v1',
    'projects:',
    '  legacy:',
    '    title: Legacy',
    '    description: Legacy project',
    '    path: projects/legacy',
    '    repo:',
    '      kind: workspace',
    '',
  ].join('\n'));
  const before: any = fs.readFileSync(manifest, 'utf8');
  const runtime: any = createRuntime();
  const compatible: any = runtime.listProjects(root);
  assert.equal(compatible.migrationRequired, true);
  assert.equal(compatible.projects[0].id, null);
  assert.equal(fs.readFileSync(manifest, 'utf8'), before);

  process.env.BUILDR_FAULT_AFTER_MUTATION_WRITE = '1';
  try {
    assert.throws(() => runtime.migrateProjectRegistry(root), /Injected Buildr mutation failure/);
  } finally {
    delete process.env.BUILDR_FAULT_AFTER_MUTATION_WRITE;
  }
  assert.equal(fs.readFileSync(manifest, 'utf8'), before);

  const migrated: any = runtime.migrateProjectRegistry(root);
  assert.deepEqual(migrated.changed, ['projects/manifest.yml']);
  assert.equal(migrated.migrationRequired, false);
  const projectId: any = migrated.projects[0].id;
  assert.match(projectId, /^[0-9a-f-]{36}$/);
  assert.deepEqual(runtime.migrateProjectRegistry(root).changed, []);
  assert.equal(runtime.listProjects(root).projects[0].id, projectId);
});

test('Project HTTP API 复用本机安全边界、CAS 与 prompt-only 创建', async (t: any) => {
  const root: any = initWorkspace(t);
  process.env.BUILDR_APP_DATA_DIR = path.join(path.dirname(root), 'app-data');
  t.after(() => delete process.env.BUILDR_APP_DATA_DIR);
  let result: any = runBuildr(['project', 'create', 'demo', '--target', root, '--name', 'Demo', '--description', 'Demo project']);
  assert.equal(result.status, 0, result.stderr);
  const runtime: any = createRuntime();
  const instance: any = createLocalWorkspaceServer(runtime, { targetRoot: root });
  t.after(() => instance.server.close());
  const { url, sessionToken, initialWorkspaceId }: any = await instance.ready;
  const apiBase: any = `${url}/api/v1/workspaces/${initialWorkspaceId}`;
  const list: any = await fetch(`${apiBase}/projects`).then((response: any) => response.json());
  assert.equal(list.projects[0].code, 'demo');
  const detail: any = await fetch(`${apiBase}/projects/demo`).then((response: any) => response.json());
  assert.equal(detail.project.name, 'Demo');

  const agentsDoc: any = await fetch(`${apiBase}/projects/demo/documents/AGENTS.md`).then((response: any) => response.json());
  assert.equal(agentsDoc.exists, true);
  assert.match(agentsDoc.content, /AGENTS\.md|Project|项目/);
  const readmeDoc: any = await fetch(`${apiBase}/projects/demo/documents/README.md`).then((response: any) => response.json());
  assert.equal(readmeDoc.exists, false);
  assert.equal(readmeDoc.content, null);
  fs.mkdirSync(path.join(root, 'projects', 'demo', 'docs'), { recursive: true });
  fs.writeFileSync(path.join(root, 'projects', 'demo', 'docs', 'guide.md'), '# Guide\n\nNested document.\n');
  const nestedDoc: any = await fetch(`${apiBase}/projects/demo/documents/docs%2Fguide.md`).then((response: any) => response.json());
  assert.equal(nestedDoc.exists, true);
  assert.equal(nestedDoc.path, 'docs/guide.md');
  assert.match(nestedDoc.content, /Nested document/);
  let response: any = await fetch(`${apiBase}/projects/demo/documents/secrets.env`);
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'project_document_not_allowed');
  response = await fetch(`${apiBase}/projects/demo/documents/..%2F..%2Fetc%2Fpasswd.md`);
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, 'project_document_path_forbidden');

  response = await fetch(`${apiBase}/projects/demo`, {
    method: 'PUT',
    headers: { origin: url, 'content-type': 'application/json', 'x-buildr-session': sessionToken },
    body: JSON.stringify({ revision: detail.revision, name: 'From UI', description: 'Saved' }),
  });
  assert.equal(response.status, 200);
  const updated: any = await response.json();
  assert.equal(updated.project.name, 'From UI');

  response = await fetch(`${apiBase}/projects/demo`, {
    method: 'PUT',
    headers: { origin: url, 'content-type': 'application/json', 'x-buildr-session': sessionToken },
    body: JSON.stringify({ revision: detail.revision, name: 'Stale' }),
  });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error.code, 'project_revision_conflict');

  response = await fetch(`${apiBase}/projects/demo`, {
    method: 'PUT',
    headers: { origin: url, 'content-type': 'application/json', 'x-buildr-session': sessionToken },
    body: JSON.stringify({ revision: updated.revision, path: '/tmp/other' }),
  });
  assert.equal(response.status, 400);

  response = await fetch(`${apiBase}/prompts/project-create`, {
    method: 'POST',
    headers: { origin: url, 'content-type': 'application/json', 'x-buildr-session': sessionToken },
    body: JSON.stringify({ code: 'next', name: 'Next', description: 'Next project', sourceType: 'workspace' }),
  });
  assert.equal(response.status, 200);
  const prompt: any = await response.json();
  assert.match(prompt.prompt, /canonical buildr project create/);
  assert.match(prompt.prompt, /project-testing/);
  assert.equal(prompt.copiedMeansCreated, false);
  assert.equal(runtime.listProjects(root).projects.length, 1, 'prompt generation does not create Project');
  assert.equal(fs.existsSync(path.join(root, 'projects', 'demo', 'preparation.yml')), false, 'GET and prompt generation do not initialize declarations');
  assert.equal(fs.existsSync(path.join(root, 'projects', 'demo', 'verification.yml')), false, 'GET and prompt generation do not initialize declarations');
  assert.equal(fs.existsSync(path.join(root, 'projects', 'next')), false, 'prompt generation does not materialize candidate Project');
});
