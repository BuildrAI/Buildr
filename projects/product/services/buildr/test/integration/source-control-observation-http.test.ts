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

test('one HTTP client disconnect cannot cancel the shared Git read awaited by another tab', async t => {
  if (!process.env.BUILDR_SMOKE_ROOT) {
    const output = execFileSync(process.execPath,[path.resolve(import.meta.dirname,'../../tools/development/run-isolated-workspace-smoke.ts'),'--script',import.meta.filename],{encoding:'utf8',timeout:30_000});
    assert.match(output,/"status":"passed"/); assert.match(output,/"cleanup":"cleaned"/); return;
  }
  const fs = await import('node:fs');
  const {createCodeApplication} = await import('../../src/modules/code/application/code-application.ts');
  const root = process.env.BUILDR_SMOKE_WORKSPACE_ROOT!, location = path.join(root,'repo'), workspaceId = randomUUID();
  fs.mkdirSync(location,{recursive:true}); execFileSync('git',['-C',location,'init','--initial-branch=main'],{stdio:'ignore'});
  const app = createCodeApplication({assetCatalog:() => ({repositories:[{id:'repo',code:'repo',name:'Repository',source:{type:'workspace',path:location}}],services:[],projects:[]}),resolveSourceRoot:(_root,source) => source.path,readTaskScope:() => ({projects:[],services:[]}),readGitWorktreeEvidence:() => null});
  const observations = new SourceControlObservations(); let scans = 0, signal!: AbortSignal, finish!: () => void;
  const instance = createLocalWorkspaceServer({}, {ensureRegisteredTarget:() => workspaceId,resolveRegisteredWorkspace:() => ({rootPath:root}),httpContributions:[{taskIdSource:'[a-z0-9]+'},createCodeHttpContribution(app,observations)],
    readExecutor:{run(_operation:string,input:any) { scans++; signal=input.signal; return new Promise(resolve => { finish = () => resolve(app.sourceControl(root,{repositoryId:'repo'})); }); }},beforeShutdown:() => observations.close()});
  t.after(() => instance.shutdown());
  const {url} = await instance.ready, endpoint = `${url}/api/v1/workspaces/${workspaceId}/code/source-control?repositoryId=repo&observation=shared`;
  const cancel = new AbortController(), first = fetch(endpoint,{signal:cancel.signal});
  while (!finish) await new Promise(resolve => setTimeout(resolve,5));
  const second = fetch(endpoint); await new Promise(resolve => setTimeout(resolve,30));
  cancel.abort(); await assert.rejects(first); assert.equal(signal.aborted,false); assert.equal(scans,1);
  finish(); assert.equal((await deadline(second)).status,200); assert.equal(scans,1);
});

test('connection directory HTTP shares proof across disconnects and shutdown cancels the owned read', async t => {
  if (!process.env.BUILDR_SMOKE_ROOT) {
    const output = execFileSync(process.execPath, [path.resolve(import.meta.dirname, '../../tools/development/run-isolated-workspace-smoke.ts'), '--script', import.meta.filename], { encoding: 'utf8', timeout: 30_000 });
    assert.match(output, /"status":"passed"/); assert.match(output, /"cleanup":"cleaned"/); return;
  }
  const fs = await import('node:fs');
  const { ConnectionSkillsApplication } = await import('../../src/modules/connection-skills/application/connection-skills-application.ts');
  const { createConnectionSkillsHttp } = await import('../../src/modules/connection-skills/interfaces/http/connection-skills-http.ts');
  const root = fs.realpathSync(process.env.BUILDR_SMOKE_WORKSPACE_ROOT!), workspaceId = randomUUID();
  const app = new ConnectionSkillsApplication({ dataRoot: path.join(root, 'private-app'), resolveScope: () => ({ rootPath: root, workspaceId }), catalog: { list: () => ({ definitions: [], diagnostics: [] }), resolve() { throw Error('No instances'); } } });
  let calls = 0, signal!: AbortSignal, finish!: () => void;
  const instance = createLocalWorkspaceServer({}, { ensureRegisteredTarget: () => workspaceId, resolveRegisteredWorkspace: () => ({ rootPath: root }), httpContributions: [{ taskIdSource: '[a-z0-9]+' }, createConnectionSkillsHttp(app)],
    readExecutor: { run(operation: string, input: any) {
      assert.equal(operation, 'connection-catalog'); calls++; signal = input.signal;
      return new Promise((resolve, reject) => {
        finish = () => resolve({ definitions: [], diagnostics: [] });
        signal.addEventListener('abort', () => reject(Object.assign(Error('closed'), { code: 'local_app_read_cancelled', status: 499 })), { once: true });
      });
    } }, beforeShutdown: () => app.close() });
  t.after(() => instance.shutdown());
  const { url } = await instance.ready, endpoint = `${url}/api/v1/workspaces/${workspaceId}/connection-skills/directory`;
  const cancel = new AbortController(), first = fetch(endpoint, { signal: cancel.signal });
  while (!finish) await new Promise(resolve => setTimeout(resolve, 5));
  const second = fetch(endpoint); await new Promise(resolve => setTimeout(resolve, 25));
  cancel.abort(); await assert.rejects(first); assert.equal(signal.aborted, false); assert.equal(calls, 1);
  finish(); assert.equal((await deadline(second)).status, 200);
  const pending = fetch(endpoint); while (calls < 2) await new Promise(resolve => setTimeout(resolve, 5));
  const closing = instance.shutdown(); assert.equal((await deadline(pending)).status, 499); await closing; assert.equal(signal.aborted, true);
});
