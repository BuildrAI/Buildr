import { EventEmitter } from 'node:events';

/** Public bridge: connection code receives only its own page capability over IPC. */
export function createBrowserClient(context, { channel = process } = {}) {
  if (context?.browser?.protocolVersion !== 'buildr.browser-authorization/v1' || !context.callId || !channel.connected || typeof channel.send !== 'function') throw new Error('buildr_browser_context_required');
  const pipe = new EventEmitter(), pending = new Map(), targets = new Set();
  let sequence = 0, closed = false, polling = false;
  function rejectAll() { for (const entry of pending.values()) { entry.dispose(); entry.reject(new Error('buildr_browser_closed')); } pending.clear(); }
  const receive = message => {
    if (message?.type !== 'buildr.browser-result' || message.callId !== context.callId) return;
    const entry = pending.get(message.requestId); if (!entry) return;
    pending.delete(message.requestId); entry.dispose();
    if (message.error) entry.reject(Object.assign(new Error('buildr_browser_request_failed'), { code: message.error })); else entry.resolve(message.result);
  };
  const disconnect = () => { if (!closed) { closed = true; clearInterval(timer); rejectAll(); pipe.emit('closed'); } };
  channel.on('message', receive); channel.on('disconnect', disconnect);
  pipe.request = (method, params = {}, sessionId, signal, timeoutMs = 30_000) => {
    if (closed || signal?.aborted) return Promise.reject(new Error('buildr_browser_cancelled'));
    return new Promise((resolve, reject) => {
      const requestId = String(++sequence);
      const finish = (error, value) => { if (!pending.has(requestId)) return; pending.delete(requestId); dispose(); error ? reject(error) : resolve(value); };
      const abort = () => finish(new Error('buildr_browser_cancelled'));
      const timeout = setTimeout(() => finish(new Error('buildr_browser_timeout')), Math.min(timeoutMs, 30_000));
      const dispose = () => { clearTimeout(timeout); signal?.removeEventListener('abort', abort); };
      pending.set(requestId, { dispose, reject, resolve(value) { if (method === 'Target.createTarget') targets.add(value.targetId); if (method === 'Target.closeTarget') targets.delete(params.targetId); resolve(value); } });
      signal?.addEventListener('abort', abort, { once: true });
      channel.send({ type: 'buildr.browser-request', callId: context.callId, requestId, method, params, ...(sessionId ? { sessionId } : {}) }, error => { if (error) finish(new Error('buildr_browser_channel_failed')); });
    });
  };
  const timer = setInterval(async () => {
    if (closed || polling || !pipe.listenerCount('event')) return;
    polling = true;
    try { for (const event of await pipe.request('Events.poll')) pipe.emit('event', event); } catch { if (!closed) pipe.emit('closed'); } finally { polling = false; }
  }, 200);
  timer.unref();
  return { pipe, async close() {
    if (closed) return;
    // Close only targets created through this client; never close the browser.
    await Promise.all([...targets].map(targetId => pipe.request('Target.closeTarget', { targetId }).catch(() => {})));
    closed = true; clearInterval(timer); rejectAll(); channel.off('message', receive); channel.off('disconnect', disconnect);
  } };
}
