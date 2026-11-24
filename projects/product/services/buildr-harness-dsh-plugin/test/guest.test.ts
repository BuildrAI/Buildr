import assert from 'node:assert/strict';
import { test } from 'node:test';
import { attachHarnessGuest } from '../src/guest.ts';
import { CHANNEL } from '../src/workspace.ts';

test('a new tool carries its target through login and keeps feedback until the trusted tool is ready', async t => {
  const origin = 'http://127.0.0.1:9519';
  const toolHash = '#dsh=explorer&workspace=workspace%3Aid';
  const ticket = 'a'.repeat(43);
  const navigations: string[] = [];
  const scripts: string[] = [];
  let currentUrl = 'about:blank';
  const view = Object.assign(new EventTarget(), {
    style: {},
    setAttribute() {},
    remove() {},
    clearHistory() {},
    getURL: () => currentUrl,
    loadURL: async (url: string) => { navigations.push(url); },
    executeJavaScript: async (script: string) => { scripts.push(script); },
  });
  const document = globalThis.document;
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement: () => view } });
  t.after(() => {
    if (document === undefined) Reflect.deleteProperty(globalThis, 'document');
    else Object.defineProperty(globalThis, 'document', { configurable: true, value: document });
  });
  t.mock.method(globalThis, 'fetch', async () => Response.json({
    origin, url: origin + '/#ticket=' + ticket, endpointId: 'endpoint', expiresAt: Date.now() + 10_000,
  }));
  const states: Array<string | undefined> = [];
  const messages: string[] = [];
  let mounted!: () => void;
  const attached = new Promise<void>(resolve => { mounted = resolve; });
  const mount = { replaceChildren: mounted } as unknown as HTMLElement;
  const stop = attachHarnessGuest(mount, {
    acquire: async () => ({ lease: 'lease', partition: 'partition' }),
    release: async () => {},
  }, error => states.push(error), {
    tool: { kind: 'explorer', workspaceId: 'workspace:id' },
    onMessage: message => messages.push(message.kind),
  });
  t.after(stop);
  await attached;
  view.dispatchEvent(new Event('dom-ready'));
  assert.deepEqual(navigations, [origin + '/#ticket=' + ticket + '&' + toolHash.slice(1)]);

  // Older guests arrive at the default document after ticket redemption.
  currentUrl = origin + '/';
  view.dispatchEvent(new Event('did-finish-load'));
  assert.ok(scripts.some(script => script.includes(toolHash)));
  assert.deepEqual(states, []);

  currentUrl = origin + '/' + toolHash;
  view.dispatchEvent(new Event('did-navigate-in-page'));
  assert.deepEqual(states, []);
  const readyMessage = CHANNEL + JSON.stringify({ kind: 'tool-ready' });
  const sendReady = (sourceId: string) => view.dispatchEvent(Object.assign(new Event('console-message'), { sourceId, message: readyMessage }));
  sendReady('https://example.invalid/bundles/bundle/assets/main.js');
  assert.deepEqual(states, []);
  sendReady(origin + '/bundles/bundle/assets/main.js');
  assert.deepEqual(states, [undefined]);
  assert.deepEqual(messages, ['tool-ready']);
});
