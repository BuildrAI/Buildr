import assert from 'node:assert/strict';
import test from 'node:test';
import { activateDesktopWindow } from '../../plugin/desktop-window.ts';

test('native activation targets the verified application and fixed URL with bounded no-shell arguments', async () => {
  const appPath = '/Applications/DeepSeek Harness $(untrusted).app';
  let calls = 0;
  await activateDesktopWindow(appPath, new AbortController().signal, { platform: 'darwin', run: async (command, args, options) => {
    calls++; assert.equal(command, '/usr/bin/open'); assert.deepEqual(args, ['-a', appPath, 'dsh://open']);
    assert.equal(options.shell, false); assert.equal(options.timeout, 3000); assert.equal(options.maxBuffer, 64 * 1024);
    assert.equal(options.signal.aborted, false);
  } });
  assert.equal(calls, 1);
});
test('unsupported systems, invalid installation and pre-cancelled activation have no native effect', async () => {
  let calls = 0;
  const run = async () => { calls++; };
  for (const [appPath, platform] of [['/Applications/DSH.app', 'win32'], ['DSH.app', 'darwin'],
    ['/Applications/DSH', 'darwin'], ['/Applications/DSH\n.app', 'darwin']] as const)
    await assert.rejects(activateDesktopWindow(appPath, new AbortController().signal, { platform, run }),
      (error: any) => /^agent_dsh_window_activation_(unsupported|invalid)$/.test(error.code));
  const cancelled = new AbortController(); cancelled.abort(new Error('cancelled'));
  await assert.rejects(activateDesktopWindow('/Applications/DSH.app', cancelled.signal, { platform: 'darwin', run }), /cancelled/);
  assert.equal(calls, 0);
});
test('native launcher failure is sanitized and cannot become successful activation', async () => {
  await assert.rejects(activateDesktopWindow('/Applications/DSH.app', new AbortController().signal, { platform: 'darwin',
    run: async () => { throw new Error('private-shell-diagnostic'); } }), (error: any) => {
      assert.equal(error.message.includes('private-shell-diagnostic'), false);
      return error.code === 'agent_dsh_window_activation_failed';
    });
});
test('activation cancellation and timeout settle even when the native runner completes late', async () => {
  for (const cancelled of [true, false]) {
    const request = new AbortController(); let release!: () => void, signal!: AbortSignal;
    const keepAlive = setTimeout(() => {}, 100);
    try {
      const pending = activateDesktopWindow('/Applications/DSH.app', request.signal, { platform: 'darwin', timeoutMs: 5,
        run: (_command, _args, options) => { signal = options.signal; return new Promise<void>(resolve => { release = resolve; }); } });
      const rejected = assert.rejects(pending, (error: any) => cancelled ? error.message === 'cancelled' : error.code === 'agent_dsh_window_activation_failed');
      if (cancelled) request.abort(new Error('cancelled'));
      await rejected; assert.equal(signal.aborted, true); release(); await Promise.resolve();
    } finally { clearTimeout(keepAlive); }
  }
});
