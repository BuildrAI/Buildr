import assert from 'node:assert/strict';
import test from 'node:test';
import { LocalSessionAdapter, readSessionTokenFromDocument } from '../src/api/LocalSessionAdapter.ts';

const injectedPage = token => `<!doctype html><html><head><meta name="buildr-session" content="${token}" /></head><body></body></html>`;

function metaStub() {
  const meta = { content: '__BUILDR_SESSION_TOKEN__', getAttribute(name) { return name === 'content' ? this.content : null; }, setAttribute(name, value) { if (name === 'content') this.content = value; } };
  const doc = { meta, querySelector(selector) { return selector === 'meta[name="buildr-session"]' ? this.meta : null; } };
  return { meta, doc };
}

test('readSessionTokenFromDocument reads the injected meta token', () => {
  const { doc } = metaStub();
  doc.meta.content = 'token-abc';
  assert.equal(readSessionTokenFromDocument(doc), 'token-abc');
  assert.equal(readSessionTokenFromDocument({ querySelector: () => null }), null);
});

test('refreshSession parses the served page, caches the new token and updates the document meta', async t => {
  const { meta, doc } = metaStub();
  const fetches = [];
  t.mock.method(globalThis, 'fetch', async url => {
    fetches.push(url);
    return new Response(injectedPage('fresh-token'), { status: 200 });
  });
  globalThis.window = { location: { href: 'http://127.0.0.1:1234/workspaces/w/tasks/t' } };
  const adapter = new LocalSessionAdapter(() => 'stale-token', doc);
  assert.equal(await adapter.refreshSession(), true);
  assert.deepEqual(fetches, ['http://127.0.0.1:1234/workspaces/w/tasks/t']);
  assert.equal(meta.content, 'fresh-token');
  assert.equal(adapter.writeHeaders()['x-buildr-session'], 'fresh-token');
  delete globalThis.window;
});

test('concurrent refreshSession calls share one fetch and failures leave headers untouched', async t => {
  const { doc } = metaStub();
  let fetches = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    fetches++;
    await new Promise(resolve => setTimeout(resolve, 5));
    return new Response(injectedPage('shared-token'), { status: 200 });
  });
  globalThis.window = { location: { href: 'http://127.0.0.1:1234/' } };
  const adapter = new LocalSessionAdapter(() => null, doc);
  assert.deepEqual(await Promise.all([adapter.refreshSession(), adapter.refreshSession()]), [true, true]);
  assert.equal(fetches, 1);

  t.mock.method(globalThis, 'fetch', async () => { throw new Error('server down'); });
  assert.equal(await adapter.refreshSession(), false, 'a dead service reports failure instead of throwing');
  assert.equal(adapter.writeHeaders()['x-buildr-session'], 'shared-token');
  delete globalThis.window;
});

test('refreshSession fails cleanly without a served token or a fetch implementation', async t => {
  globalThis.window = { location: { href: 'http://127.0.0.1:1234/' } };
  t.mock.method(globalThis, 'fetch', async () => new Response('<html><head></head></html>', { status: 200 }));
  const adapter = new LocalSessionAdapter(() => null, null);
  assert.equal(await adapter.refreshSession(), false, 'pages without an injected token are not accepted');
  delete globalThis.window;
});

test('cancelled bounded refresh aborts its body without occupying another session refresh', async t => {
  const previousWindow = globalThis.window;
  t.after(() => { if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow; });
  globalThis.window = { location: { href: 'http://127.0.0.1:1234/' } };
  const controller = new AbortController();
  let requests = 0;
  let bodyStarted;
  const started = new Promise(resolve => { bodyStarted = resolve; });
  t.mock.method(globalThis, 'fetch', async (_url, init) => {
    requests++;
    if (requests > 1) return new Response(injectedPage('fresh-token'));
    assert.equal(init.signal, controller.signal);
    return { ok: true, text: () => new Promise((_resolve, reject) => {
      bodyStarted();
      init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true });
    }) };
  });
  const adapter = new LocalSessionAdapter(() => 'old-token', null);
  const pending = adapter.refreshSession(controller.signal);
  await started;
  assert.equal(await adapter.refreshSession(), true, 'another caller is not held by the bounded request');
  controller.abort();
  assert.equal(await pending, false);
  assert.equal(adapter.writeHeaders()['x-buildr-session'], 'fresh-token');
  assert.equal(await adapter.refreshSession(), true);
});

test('a late body from an aborted observer cannot replace the recovered session', async t => {
  const previousWindow = globalThis.window;
  t.after(() => { if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow; });
  globalThis.window = { location: { href: 'http://127.0.0.1:1234/' } };
  let releaseBody;
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, text: () => new Promise(resolve => { releaseBody = resolve; }) }));
  const adapter = new LocalSessionAdapter(() => 'old-token', null);
  const controller = new AbortController();
  const pending = adapter.refreshSession(controller.signal);
  await new Promise(resolve => setImmediate(resolve));
  controller.abort();
  releaseBody(injectedPage('late-token'));
  assert.equal(await pending, false);
  assert.equal(adapter.writeHeaders()['x-buildr-session'], 'old-token');
});
