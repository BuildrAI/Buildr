import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import { BrowserPipe } from '../../src/modules/browser-authorization/infrastructure/browser.ts';
test('oversized frame fails only its own request and the next frame remains usable', async () => {
  const write = new PassThrough(), read = new PassThrough(), pipe = new BrowserPipe(write, read);
  const a = pipe.request('Runtime.evaluate'), b = pipe.request('Browser.getVersion');
  const failed = assert.rejects(a, { code: 'browser_authorization_response_large' });
  read.write(Buffer.from('{"id":1,"result":{"value":"'));
  for (let i = 0; i < 130; i++) read.write(Buffer.alloc(65536, 120));
  read.write(Buffer.from('"}}\0{"id":2,"result":{"product":"fixture"}}\0'));
  await failed; assert.deepEqual(await b, { product: 'fixture' }); pipe.close();
});
test('resource-level creation stays routed after caller timeout, so late cancellation can clean it', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const write = new PassThrough(), read = new PassThrough(), pipe = new BrowserPipe(write, read);
  const creating = pipe.request('Target.createTarget', { url: 'about:blank' });
  let resolved = false; void creating.then(() => { resolved = true; });
  t.mock.timers.tick(25001); await Promise.resolve(); assert.equal(resolved, false);
  read.write(Buffer.from('{"id":1,"result":{"targetId":"late"}}\0'));
  assert.deepEqual(await creating, { targetId: 'late' });
  // The lease layer's cancellation test verifies closing this returned page.
  pipe.close();
});
