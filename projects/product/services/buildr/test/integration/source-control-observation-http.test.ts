import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { SourceControlObservations, type SourceControlWatchResult } from '../../src/modules/code/application/source-control-observations.ts';
import type { CodeApplication } from '../../src/modules/code/application/code-application.ts';
import { createCodeHttpContribution } from '../../src/modules/code/interfaces/http/code-http.ts';
import { CODE_HTTP_PATHS, CODE_HTTP_OPERATIONS } from '../../src/modules/code/interfaces/http/code-http-contracts.ts';
import { createLocalWorkspaceServer } from '../../src/web/http/server.ts';

function deadline<T>(promise: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('HTTP observation did not settle.')), 5000);
    promise.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
  });
}

test('real HTTP watch bypasses read Workers, removes an aborted wait and shutdown finishes outstanding requests', async t => {
  if (!process.env.BUILDR_SMOKE_ROOT) {
    const output = execFileSync(process.execPath, [path.resolve(import.meta.dirname, '../../tools/development/run-isolated-workspace-smoke.ts'), '--script', import.meta.filename], { encoding: 'utf8', timeout: 20_000 });
    assert.match(output, /"status":"passed"/); assert.match(output, /"cleanup":"cleaned"/); return;
  }
  const observations = new SourceControlObservations(), workspaceId = randomUUID(), root = process.env.BUILDR_SMOKE_WORKSPACE_ROOT!;
  t.after(() => observations.close());
  const contribution = createCodeHttpContribution({} as CodeApplication, observations);
  let readCalls = 0;
  const instance = createLocalWorkspaceServer({}, {
    ensureRegisteredTarget: () => workspaceId,
    resolveRegisteredWorkspace: (id: string) => { if (id !== workspaceId) throw Object.assign(Error('unknown workspace'), { status: 404 }); return { rootPath: root }; },
    httpContributions: [{ taskIdSource: '[a-z0-9]+' }, contribution],
    readExecutor: { run() { readCalls++; throw Error('Watch must bypass read Workers.'); } },
    beforeShutdown: () => observations.close(),
  });
  t.after(() => instance.shutdown());
  const { url } = await instance.ready, endpoint = `${url}/api/v1/workspaces/${workspaceId}/code/source-control-watch`;
  assert.equal((CODE_HTTP_PATHS as Record<string, string>).sourceControlWatch, undefined);
  assert.equal(CODE_HTTP_OPERATIONS.filter(operation => operation.id === 'code.sourceControlWatch').length, 1);
  for (const query of ['?cursor=invalid', '?cursor=' + randomUUID() + ':0&cursor=' + randomUUID() + ':0', '?target=outside']) assert.equal((await fetch(endpoint + query)).status, 400);
  assert.equal((await fetch(endpoint.replace(workspaceId, randomUUID()))).status, 404);
  const initial = await (await fetch(endpoint)).json() as SourceControlWatchResult;
  let entered!: () => void, finished!: () => void;
  const began = new Promise<void>(resolve => { entered = resolve; }), ended = new Promise<void>(resolve => { finished = resolve; });
  const original = observations.watch.bind(observations);
  t.mock.method(observations, 'watch', (workspace: string, cursor?: string, signal?: AbortSignal) => {
    const pending = original(workspace, cursor, signal); entered(); return pending.finally(finished);
  });
  const controller = new AbortController(), canceled = fetch(endpoint + '?cursor=' + initial.cursor, { signal: controller.signal });
  await began; controller.abort(); await assert.rejects(canceled); await deadline(ended);
  // The real application wait settled after fetch cancellation, rather than surviving until its timeout.
  const active = fetch(endpoint + '?cursor=' + initial.cursor);
  await new Promise(resolve => setTimeout(resolve, 20)); const closing = instance.shutdown();
  assert.equal((await active).status, 200); await closing;
  assert.equal(readCalls, 0);
});
