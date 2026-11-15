export async function eventStreamResponse(response: any, subscription: { events: AsyncIterable<unknown>; close(): void }, validate: (event: unknown) => unknown) {
  response.writeHead(200, { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'x-accel-buffering': 'no' });
  response.flushHeaders?.();
  const close = () => subscription.close();
  response.once('close', close);
  const heartbeat = setInterval(() => {
    if (response.destroyed || response.writableEnded || response.writableLength > 8 * 1024 * 1024) { subscription.close(); response.destroy(); return; }
    response.write(': heartbeat\n\n');
  }, 15_000); heartbeat.unref();
  try {
    for await (const input of subscription.events) {
      if (response.destroyed || response.writableEnded) break;
      const event = validate(input) as { cursor: number; type: string };
      if (!response.write(`id: ${event.cursor}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)) {
        // A single valid snapshot may exceed the socket's high-water mark.
        // Await bounded drain instead of treating that frame as a slow client.
        if (response.writableLength > 8 * 1024 * 1024) break;
        await new Promise<void>(resolve => {
          let timer: ReturnType<typeof setTimeout>;
          const done = () => { clearTimeout(timer); response.off('drain', done); response.off('close', done); resolve(); };
          response.once('drain', done); response.once('close', done);
          timer = setTimeout(() => { subscription.close(); response.destroy(); done(); }, 10_000); timer.unref();
        });
      }
    }
  } finally {
    clearInterval(heartbeat); response.off('close', close); subscription.close();
    if (!response.destroyed && !response.writableEnded) response.end();
  }
  return true;
}
