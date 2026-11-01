import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { BrowserLeases } from '../../src/modules/browser-authorization/infrastructure/runtime.ts';
class FakePipe extends EventEmitter {
  calls: any[] = []; next = 0;
  async request(method: string, params: any = {}, sessionId?: string): Promise<any> {
    this.calls.push({ method, params, sessionId });
    if (method === 'Target.createTarget') return { targetId: 'page-' + ++this.next };
    if (method === 'Target.attachToTarget') return { sessionId: 'session-' + params.targetId };
    if (method === 'Target.getTargets') return { targetInfos: [{ targetId: 'page-1' }, { targetId: 'page-2' }, { targetId: 'foreign' }] };
    return {};
  }
}
test('shared browser keeps page and event ownership separate, releasing one leaves the other usable', async () => {
  const pipe = new FakePipe(), broker = new BrowserLeases(pipe), a = broker.acquire(), b = broker.acquire();
  const first = await broker.request(a, 'Target.createTarget', { url: 'https://a.example.invalid' });
  assert.equal(pipe.calls.at(-1).params.newWindow, true); // The managed browser starts with no existing window.
  const second = await broker.request(b, 'Target.createTarget', { url: 'https://b.example.invalid' });
  const sa = await broker.request(a, 'Target.attachToTarget', first), sb = await broker.request(b, 'Target.attachToTarget', second);
  assert.deepEqual(await broker.request(a, 'Target.getTargets'), { targetInfos: [{ targetId: first.targetId }] });
  await assert.rejects(broker.request(a, 'Target.closeTarget', second), { code: 'browser_authorization_page_not_owned' });
  await assert.rejects(broker.request(a, 'Runtime.evaluate', { expression: '1' }, sb.sessionId), { code: 'browser_authorization_request_forbidden' });
  pipe.emit('event', { sessionId: sa.sessionId, method: 'Network.requestWillBeSent', params: { request: { headers: { Authorization: 'private-fixture' } } } });
  assert.equal((await broker.request(a, 'Events.poll')).length, 1);
  assert.deepEqual(await broker.request(b, 'Events.poll'), []);
  await broker.release(a);
  assert.equal(broker.leases.has(b), true);
  assert.deepEqual(await broker.request(b, 'Runtime.evaluate', { expression: '1' }, sb.sessionId), {});
  assert.deepEqual(pipe.calls.filter(x => x.method === 'Target.closeTarget').map(x => x.params.targetId), [first.targetId]);
  await assert.rejects(broker.request(a, 'Target.getTargets'), { code: 'browser_authorization_lease_invalid' });
});
test('reject global protocol operations, non-web targets and excess pages', async () => {
  const broker = new BrowserLeases(new FakePipe()), id = broker.acquire();
  for (const method of ['Browser.close', 'Target.attachToBrowserTarget', 'Storage.getCookies', 'Target.disposeBrowserContext']) await assert.rejects(broker.request(id, method), { code: 'browser_authorization_request_forbidden' });
  for (const url of ['file:///etc/passwd', 'javascript:alert(1)', 'https://user:secret@example.invalid']) await assert.rejects(broker.request(id, 'Target.createTarget', { url }), { code: 'browser_authorization_url_invalid' });
  for (let i = 0; i < 8; i++) await broker.request(id, 'Target.createTarget', { url: 'about:blank' });
  await assert.rejects(broker.request(id, 'Target.createTarget', { url: 'about:blank' }), { code: 'browser_authorization_page_limit' });
});
test('cancellation during page creation closes the late page instead of orphaning it', async () => {
  const pipe = new FakePipe(), original = pipe.request.bind(pipe);
  let finish!: (value: any) => void;
  pipe.request = (method, params, sessionId) => method === 'Target.createTarget' ? new Promise(resolve => { finish = resolve; }) : original(method, params, sessionId);
  const broker = new BrowserLeases(pipe), id = broker.acquire();
  const creating = broker.request(id, 'Target.createTarget', { url: 'about:blank' });
  await assert.rejects(broker.release(id), { code: 'browser_authorization_cleanup_unconfirmed' }); finish({ targetId: 'late' });
  await assert.rejects(creating, { code: 'browser_authorization_lease_invalid' });
  assert.equal(pipe.calls.at(-1).params.targetId, 'late');
});
test('parallel page creation reserves quota before the browser responds', async () => {
  const pipe = new FakePipe(), finish: Array<(value: any) => void> = [];
  const original = pipe.request.bind(pipe);
  pipe.request = (method, params, sessionId) => method === 'Target.createTarget' ? new Promise(resolve => finish.push(resolve)) : original(method, params, sessionId);
  const broker = new BrowserLeases(pipe), id = broker.acquire();
  const first = Array.from({ length: 8 }, () => broker.request(id, 'Target.createTarget', { url: 'about:blank' }));
  await assert.rejects(broker.request(id, 'Target.createTarget', { url: 'about:blank' }), { code: 'browser_authorization_page_limit' });
  finish.forEach((resolve, i) => resolve({ targetId: 'reserved-' + i })); await Promise.all(first);
  await broker.release(id);
});
test('derived popups belong to the opener lease and failed cleanup is retained for retry', async () => {
  const pipe = new FakePipe(), original = pipe.request.bind(pipe), broker = new BrowserLeases(pipe), a = broker.acquire(), b = broker.acquire();
  const page = await broker.request(a, 'Target.createTarget', { url: 'about:blank' });
  pipe.emit('event', { method: 'Target.targetCreated', params: { targetInfo: { targetId: 'popup', openerId: page.targetId } } });
  assert.equal((await broker.request(a, 'Events.poll')).length, 1);
  assert.deepEqual(await broker.request(b, 'Events.poll'), []);
  let fail = true;
  pipe.request = async (method, params, sessionId) => {
    if (method === 'Target.closeTarget' && params.targetId === 'popup' && fail) throw new Error('fixture close failed');
    if (method === 'Target.getTargets') return { targetInfos: [{ targetId: 'popup' }] };
    return original(method, params, sessionId);
  };
  await assert.rejects(broker.release(a), { code: 'browser_authorization_cleanup_unconfirmed' });
  assert.equal(broker.leases.get(a)!.closing, true); assert.equal(broker.leases.has(b), true);
  fail = false; await broker.release(a); assert.equal(broker.leases.has(a), false);
});
test('a popup created during release retains its lease until its own cleanup is confirmed', async () => {
  const pipe = new FakePipe(), original = pipe.request.bind(pipe), broker = new BrowserLeases(pipe), a = broker.acquire(), b = broker.acquire();
  const page = await broker.request(a, 'Target.createTarget', { url: 'about:blank' });
  let rejectPopup!: (error: Error) => void;
  pipe.request = async (method, params, sessionId) => {
    if (method === 'Target.closeTarget' && params.targetId === page.targetId) {
      pipe.emit('event', { method: 'Target.targetCreated', params: { targetInfo: { targetId: 'racing-popup', openerId: page.targetId } } });
      return { success: true };
    }
    if (method === 'Target.closeTarget' && params.targetId === 'racing-popup') return new Promise((_, reject) => { rejectPopup = reject; });
    if (method === 'Target.getTargets') return { targetInfos: [{ targetId: 'racing-popup' }] };
    return original(method, params, sessionId);
  };
  await assert.rejects(broker.release(a), { code: 'browser_authorization_cleanup_unconfirmed' });
  assert.equal(broker.leases.get(a)!.targets.has('racing-popup'), true);
  rejectPopup(new Error('fixture close failed'));
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(broker.leases.get(a)!.closing, true);
  assert.equal(broker.leases.has(b), true);
  pipe.request = original;
  await broker.release(a);
  assert.equal(broker.leases.has(a), false);
});
test('a late attach response cannot recreate a session after target destruction or lease release', async () => {
  for (const action of ['destroy', 'release']) {
    const pipe = new FakePipe(), original = pipe.request.bind(pipe), broker = new BrowserLeases(pipe), id = broker.acquire();
    const page = await broker.request(id, 'Target.createTarget', { url: 'about:blank' });
    let attach!: (value: any) => void;
    pipe.request = (method, params, sessionId) => method === 'Target.attachToTarget' ? new Promise(resolve => { attach = resolve; }) : original(method, params, sessionId);
    const pending = broker.request(id, 'Target.attachToTarget', page);
    if (action === 'destroy') pipe.emit('event', { method: 'Target.targetDestroyed', params: page });
    else await broker.release(id);
    attach({ sessionId: 'stale-session' });
    await assert.rejects(pending, { code: 'browser_authorization_lease_invalid' });
    await assert.rejects(broker.request(id, 'Runtime.evaluate', { expression: '1' }, 'stale-session'));
    assert.equal(pipe.calls.some(call => call.method === 'Runtime.evaluate'), false);
  }
});
