import assert from 'node:assert/strict';
import path from 'node:path';
import test, { after } from 'node:test';

import { createRuntime } from '../../src/bootstrap/runtime.mjs';
import { createLocalWorkspaceServer } from '../../src/web/http/server.mjs';
import { cleanupLocalTaskLifecycleSystemContext } from '../helpers/task-lifecycle-system-context.mjs';
import { taskRecordFixture as fixture } from '../helpers/task-record-system-fixture.mjs';
import { TASK_PROFESSIONAL_HTTP_SCHEMAS, TASK_PROFESSIONAL_HTTP_VALIDATORS } from '../../src/task/interfaces/http/task-professional-http-contracts.ts';

after(() => cleanupLocalTaskLifecycleSystemContext());

test('Task professional HTTP routes使用严格请求契约并保持错误边界', async (t) => {
  const { base, root } = fixture(t, 'task-professional-contract');
  process.env.BUILDR_APP_DATA_DIR = path.join(base, 'app-data-professional-contract');
  t.after(() => delete process.env.BUILDR_APP_DATA_DIR);
  const runtime = createRuntime();
  runtime.createTaskRecord(root, { taskId: 'professional-task', title: '专业契约', intent: '验证专业 HTTP contract', projects: [], services: [], changes: [] });
  const instance = createLocalWorkspaceServer(runtime, { targetRoot: root });
  t.after(() => new Promise((resolve) => instance.server.close(resolve)));
  const { url, initialWorkspaceId, sessionToken } = await instance.ready;
  const endpoint = `${url}/api/v1/workspaces/${initialWorkspaceId}/tasks/professional-task`;
  let response = await fetch(`${endpoint}/overview`);
  let body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(TASK_PROFESSIONAL_HTTP_VALIDATORS.validate(TASK_PROFESSIONAL_HTTP_SCHEMAS.overviewResponse.$id, body).valid, true);

  response = await fetch(`${endpoint}/overview?unexpected=true`);
  body = await response.json();
  assert.equal(response.status, 400);
  assert.equal(body.error.code, 'task_api_query_forbidden');

  response = await fetch(`${endpoint}/retrospective`, {
    method: 'PATCH',
    headers: { origin: url, 'x-buildr-session': sessionToken, 'content-type': 'application/json' },
    body: JSON.stringify({ expectedCurrentDigest: 'sha256-current', unexpected: true }),
  });
  body = await response.json();
  assert.equal(response.status, 400);
  assert.equal(body.error.code, 'task_api_field_forbidden');

  response = await fetch(`${endpoint}/execution-records`);
  assert.equal(response.status, 404);
});
