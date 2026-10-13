import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DshPageObservations } from '../../src/modules/dsh-desktop/application/dsh-page-observations.ts';
import { createDshDesktopHttpContribution } from '../../src/modules/dsh-desktop/interfaces/http/dsh-desktop-http.ts';
import { createDshDesktopModule, DSH_DESKTOP_APPLICATION, DSH_PAGE_OBSERVATIONS } from '../../src/modules/dsh-desktop/module.ts';
import { AGENT_OPERATIONS_APPLICATION } from '../../src/modules/agent-operations/module.ts';
import type { DshDesktopApplication } from '../../src/modules/dsh-desktop/application/dsh-desktop-application.ts';
import { createLocalWorkspaceServer } from '../../src/web/http/server.ts';

const origin = 'http://127.0.0.1:38529';
const workspaceId = randomUUID(), taskUrl = `${origin}/workspaces/${workspaceId}/tasks/exact-task`;
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
function fixture(t: test.TestContext, timeouts = {}) {
  const pages = new DshPageObservations({ readOrigin: () => origin, ...timeouts });
  t.after(() => pages.close());
  return pages;
}

test('only the current page and challenge can acknowledge a task; no previous proof is cached', async t => {
  const pages = fixture(t, { probeMs: 20 }), pageId = randomUUID(), another = randomUUID();
  assert.equal((await Promise.all([pages.probe(pageId), delay(30)]))[0], null);
  const watch = pages.watch(pageId), probe = pages.probe(pageId), challengeId = (await watch)!;
  assert.deepEqual(pages.acknowledge({ pageId: another, challengeId, taskUrl }), { accepted: false });
  assert.deepEqual(pages.acknowledge({ pageId, challengeId: randomUUID(), taskUrl }), { accepted: false });
  for (const invalid of [taskUrl + '?buildrDshPage=' + pageId, taskUrl + '#old', taskUrl + '/document', taskUrl.replace(origin, 'http://127.0.0.1:38530'), taskUrl.replace('exact-task', '%65xact-task'), taskUrl.replace('exact-task', 'trailing-'), `${origin}/workspaces/${workspaceId}/tasks`]) {
    assert.throws(() => pages.acknowledge({ pageId, challengeId, taskUrl: invalid }), { code: 'agent_dsh_page_observation_invalid' });
  }
  assert.deepEqual(pages.acknowledge({ pageId, challengeId, taskUrl }), { accepted: true });
  assert.equal(await probe, taskUrl);
  assert.deepEqual(pages.acknowledge({ pageId, challengeId, taskUrl }), { accepted: false });
  assert.equal((await Promise.all([pages.probe(pageId), delay(30)]))[0], null);
  const nextWatch = pages.watch(pageId), nextProbe = pages.probe(pageId), nextChallenge = (await nextWatch)!;
  assert.notEqual(nextChallenge, challengeId);
  assert.deepEqual(pages.acknowledge({ pageId, challengeId, taskUrl }), { accepted: false });
  assert.deepEqual(pages.acknowledge({ pageId, challengeId: nextChallenge, taskUrl: null }), { accepted: true });
  assert.equal(await nextProbe, null);
});

test('timeouts, disconnect, duplicate watchers and close release bounded memory without affecting business state', async t => {
  const pages = fixture(t, { watchMs: 10, probeMs: 10 }), pageId = randomUUID();
  assert.equal((await Promise.all([pages.watch(pageId), delay(20)]))[0], null);
  const first = pages.watch(pageId), second = pages.watch(pageId);
  assert.equal(await first, null);
  const probe = pages.probe(pageId), challengeId = (await second)!;
  assert.equal(await pages.probe(pageId), null, 'Concurrent probes do not replace a live challenge.');
  assert.equal((await Promise.all([probe, delay(20)]))[0], null);
  assert.deepEqual(pages.acknowledge({ pageId, challengeId, taskUrl }), { accepted: false });
  const controller = new AbortController(), aborted = pages.watch(pageId, controller.signal);
  controller.abort(); assert.equal(await aborted, null);
  const pendingWatch = pages.watch(pageId), otherPage = randomUUID();
  const sentWatch = pages.watch(otherPage), pendingProbe = pages.probe(otherPage);
  await sentWatch;
  pages.close(); pages.close();
  assert.equal(await pendingWatch, null); assert.equal(await pendingProbe, null);
  assert.equal(await pages.watch(pageId), null); assert.equal(await pages.probe(pageId), null);
});

test('a probe issued before the document loads waits within its same challenge budget', async t => {
  const pages = fixture(t), pageId = randomUUID();
  const probe = pages.probe(pageId), challengeId = (await pages.watch(pageId))!;
  assert.match(challengeId, /^[a-f0-9-]{36}$/u);
  assert.equal(await pages.watch(pageId), challengeId, 'Repeated watches never create a second pending proof.');
  assert.deepEqual(pages.acknowledge({ pageId, challengeId, taskUrl }), { accepted: true });
  assert.equal(await probe, taskUrl);
});

test('128 live waits is a hard bound, but existing watchers can still transfer their slot to a probe', async t => {
  const pages = fixture(t), ids = Array.from({ length: 128 }, () => randomUUID());
  const watches = ids.map(id => pages.watch(id));
  assert.throws(() => pages.watch(randomUUID()), { status: 429 });
  const probe = pages.probe(ids[0]), challengeId = (await watches[0])!;
  assert.equal(await pages.watch(ids[0]), challengeId, 'Delivery of an existing challenge does not consume another waiter.');
  assert.throws(() => pages.probe(randomUUID()), { status: 429 });
  pages.acknowledge({ pageId: ids[0], challengeId, taskUrl: null }); await probe;
  const replacement = pages.watch(ids[1]); assert.equal(await watches[1], null);
  pages.close(); await replacement; await Promise.all(watches);
  assert.throws(() => pages.watch('not-a-page'), { status: 400 });
});

test('module lifecycle owns observation cleanup and production HTTP schemas are contributed once', async () => {
  const descriptor = createDshDesktopModule({ readProductIdentity: () => ({}), resolveWebProfile: () => ({ dataRoot: '/unused-fixture' }), readOrigin: () => origin }).create({
    [AGENT_OPERATIONS_APPLICATION]: { hasDshRegistration: () => false, bindDshDesktopConnector() {} },
  });
  const pages = descriptor.provides[DSH_PAGE_OBSERVATIONS], watch = pages.watch(randomUUID());
  assert.equal(descriptor.contributions.http[0].operations.filter(operation => operation.id.startsWith('dsh-desktop.pages.')).length, 3);
  await descriptor.lifecycle.stop(); assert.equal(await watch, null);
  await assert.rejects(descriptor.provides[DSH_DESKTOP_APPLICATION].listConnections(), { code: 'agent_operations_closed' });
  await descriptor.lifecycle.stop();
});

test('real local HTTP authenticates acknowledgements and shutdown releases active long polls', { skip: !process.env.BUILDR_SMOKE_ROOT && 'Run through tools/development/run-isolated-workspace-smoke.ts.' }, async t => {
  let url: string | null = null;
  const pages = new DshPageObservations({ readOrigin: () => url });
  const contribution = createDshDesktopHttpContribution({ async listConnections() { return { connections: [] }; } } as unknown as DshDesktopApplication, pages);
  const server = createLocalWorkspaceServer({}, {
    ensureRegisteredTarget: () => null, resolveRegisteredWorkspace: () => null,
    httpContributions: [{ id: 'task-identity-fixture', taskIdSource: '[a-z0-9]+' }, contribution],
    readExecutor: { run() { throw new Error('No workspace read is permitted in a page probe.'); } },
    beforeShutdown: () => pages.close(),
  });
  t.after(async () => { await server.shutdown(); });
  const ready = await server.ready; url = ready.url;
  const endpoint = url + '/api/v1/app/dsh/pages', pageId = randomUUID(), canonicalTask = `${url}/workspaces/${workspaceId}/tasks/exact-task`;
  const headers = { origin: url!, 'x-buildr-session': ready.sessionToken, 'content-type': 'application/json' };
  const post = (body: unknown, selectedHeaders = headers) => fetch(endpoint + '/ack', { method: 'POST', headers: selectedHeaders, body: JSON.stringify(body) });
  let watchReady: () => void = () => {};
  let started = new Promise<void>(resolve => { watchReady = resolve; });
  const originalWatch = pages.watch.bind(pages);
  t.mock.method(pages, 'watch', (id: string, signal?: AbortSignal) => { const pending = originalWatch(id, signal); watchReady(); return pending; });
  for (const query of ['', '?pageId=invalid', `?pageId=${pageId}&pageId=${pageId}`, `?pageId=${pageId}&target=outside`]) {
    assert.equal((await fetch(endpoint + '/watch' + query)).status, 400);
  }
  const watch = fetch(endpoint + `/watch?pageId=${pageId}`); await started;
  const probe = fetch(endpoint + `/probe?pageId=${pageId}`);
  const challenge = await (await watch).json() as { challengeId: string };
  const ack = { pageId, challengeId: challenge.challengeId, taskUrl: canonicalTask };
  assert.equal((await post(ack, { ...headers, 'x-buildr-session': 'invalid' })).status, 403);
  assert.equal((await post({ ...ack, tabId: 'mapping-is-not-evidence' })).status, 400);
  assert.equal((await post({ ...ack, taskUrl: canonicalTask + '?extra=forbidden' })).status, 400);
  assert.deepEqual(await (await post({ ...ack, challengeId: randomUUID() })).json(), { accepted: false });
  assert.deepEqual(await (await post(ack)).json(), { accepted: true });
  assert.deepEqual(await (await probe).json(), { taskUrl: canonicalTask });
  assert.deepEqual(await (await fetch(endpoint + `/probe?pageId=${pageId}`)).json(), { taskUrl: null });
  let probeReady: () => void = () => {};
  const probeStarted = new Promise<void>(resolve => { probeReady = resolve; }), originalProbe = pages.probe.bind(pages);
  t.mock.method(pages, 'probe', (id: string, signal?: AbortSignal) => { const pending = originalProbe(id, signal); probeReady(); return pending; });
  const latePageId = randomUUID(), earlyProbe = fetch(endpoint + `/probe?pageId=${latePageId}`); await probeStarted;
  const lateChallenge = await (await fetch(endpoint + `/watch?pageId=${latePageId}`)).json() as { challengeId: string };
  assert.deepEqual(await (await post({ pageId: latePageId, challengeId: lateChallenge.challengeId, taskUrl: canonicalTask })).json(), { accepted: true });
  assert.deepEqual(await (await earlyProbe).json(), { taskUrl: canonicalTask });
  started = new Promise<void>(resolve => { watchReady = resolve; });
  const closingWatch = fetch(endpoint + `/watch?pageId=${randomUUID()}`); await started;
  const closing = server.shutdown();
  assert.deepEqual(await (await closingWatch).json(), { challengeId: null });
  await closing;
});
