import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createRuntime } from '../../src/bootstrap/runtime.mjs';
import { createLocalWorkspaceServer } from '../../src/web/http/server.ts';
import { AGENT_ASSETS_HTTP_OPERATIONS, AGENT_ASSETS_HTTP_VALIDATORS } from '../../src/agent-assets/interfaces/http/agent-assets-http-contracts.mjs';
import { WORKSPACE_HTTP_OPERATIONS, WORKSPACE_HTTP_VALIDATORS } from '../../src/workspace/interfaces/http/workspace-http-contracts.ts';

function validate(catalog, operations, id, kind, value) {
  const operation = operations.find((item) => item.id === id);
  const schemaId = kind === 'success' ? operation.successSchemaId : operation.errorSchemaId;
  const result = catalog.validate(schemaId, value);
  assert.equal(result.valid, true, `${id} ${kind}: ${JSON.stringify(result.errors)}`);
}

test('Workspace 与 Agent Assets HTTP 契约覆盖成功、非法请求和零写入', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-http-contract-'));
  const appData = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-http-contract-app-'));
  t.after(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(appData, { recursive: true, force: true });
  });
  const previousData = process.env.BUILDR_APP_DATA_DIR;
  process.env.BUILDR_APP_DATA_DIR = appData;
  t.after(() => { if (previousData === undefined) delete process.env.BUILDR_APP_DATA_DIR; else process.env.BUILDR_APP_DATA_DIR = previousData; });
  const runtime = createRuntime();
  const oldLog = console.log;
  console.log = () => {};
  try {
    runtime.initBuildr(['--target', root, '--name', 'Contract-Workspace', '--description', 'HTTP contract fixture', '--profile', 'team']);
  } finally {
    console.log = oldLog;
  }
  fs.mkdirSync(path.join(root, 'rules'), { recursive: true });
  fs.writeFileSync(path.join(root, 'rules', 'http.md'), '# HTTP\n');
  const instance = createLocalWorkspaceServer(runtime, { targetRoot: root });
  t.after(() => new Promise((resolve) => instance.server.close(resolve)));
  const { url, initialWorkspaceId, sessionToken } = await instance.ready;
  const endpoint = `${url}/api/v1/workspaces/${initialWorkspaceId}`;
  const headers = { origin: url, 'x-buildr-session': sessionToken, 'content-type': 'application/json' };
  const request = async (resource, options = {}) => {
    const response = await fetch(resource, options);
    return { status: response.status, body: await response.json() };
  };

  let response = await request(`${url}/api/v1/workspaces`);
  assert.equal(response.status, 200);
  validate(WORKSPACE_HTTP_VALIDATORS, WORKSPACE_HTTP_OPERATIONS, 'workspace.registry.list', 'success', response.body);

  response = await request(`${endpoint}/projects`);
  assert.equal(response.status, 200);
  validate(WORKSPACE_HTTP_VALIDATORS, WORKSPACE_HTTP_OPERATIONS, 'project.list', 'success', response.body);

  response = await request(`${endpoint}/agent-assets`);
  assert.equal(response.status, 200);
  validate(AGENT_ASSETS_HTTP_VALIDATORS, AGENT_ASSETS_HTTP_OPERATIONS, 'agent-assets.inventory', 'success', response.body);

  const workspaceBefore = await request(`${endpoint}`);
  const workspaceUpdate = await request(`${endpoint}`, { method: 'PUT', headers, body: JSON.stringify({ revision: workspaceBefore.body.revision, unknown: true }) });
  assert.equal(workspaceUpdate.status, 400);
  assert.equal(workspaceUpdate.body.error.code, 'workspace_http_request_invalid');
  validate(WORKSPACE_HTTP_VALIDATORS, WORKSPACE_HTTP_OPERATIONS, 'workspace.update', 'error', workspaceUpdate.body);

  const before = fs.readFileSync(path.join(root, 'rules', 'manifest.yml'), 'utf8');
  response = await request(`${endpoint}/agent-assets/rules`, { method: 'POST', headers, body: JSON.stringify({ id: 'http', description: 42, unknown: true }) });
  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, 'agent_assets_http_request_invalid');
  validate(AGENT_ASSETS_HTTP_VALIDATORS, AGENT_ASSETS_HTTP_OPERATIONS, 'agent-assets.rules.add', 'error', response.body);
  assert.equal(fs.readFileSync(path.join(root, 'rules', 'manifest.yml'), 'utf8'), before);

  response = await request(`${endpoint}/agent-assets/rules`, { method: 'POST', headers, body: JSON.stringify({ id: 'http', path: 'rules/http.md', description: 'HTTP rule' }) });
  assert.equal(response.status, 200);
  validate(AGENT_ASSETS_HTTP_VALIDATORS, AGENT_ASSETS_HTTP_OPERATIONS, 'agent-assets.rules.add', 'success', response.body);
});

test('Workspace 与 Agent Assets schema 默认不转换输入', () => {
  const value = { revision: 42, extra: true };
  const before = structuredClone(value);
  const operation = WORKSPACE_HTTP_OPERATIONS.find((item) => item.id === 'workspace.update');
  const result = WORKSPACE_HTTP_VALIDATORS.validate(operation.requestSchemaId, value);
  assert.equal(result.valid, false);
  assert.deepEqual(value, before);
});
