export function jsonResponse(response: any, status: any, value: any) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  response.end(`${JSON.stringify(value)}\n`);
}

export function textResponse(response: any, status: any, content: any, contentType: any) {
  response.writeHead(status, {
    'content-type': contentType,
    'cache-control': 'no-store',
    // style-src allows 'unsafe-inline' so Ant Design 5 css-in-js / motion can apply
    // element styles; scripts and network stay same-origin (no CDN).
    'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'",
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
  });
  response.end(content);
}

export function binaryResponse(response: any, status: any, content: any, contentType: any, options?: { disposition: 'inline' | 'attachment'; filename: string }) {
  const encodedFilename = options ? encodeURIComponent(options.filename).replace(/[!'()*]/g, value => `%${value.charCodeAt(0).toString(16).toUpperCase()}`) : '';
  response.writeHead(status, {
    'content-type': contentType,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...(options ? { 'content-disposition': `${options.disposition}; filename*=UTF-8''${encodedFilename}`, 'content-security-policy': "sandbox; default-src 'none'" } : {}),
  });
  response.end(content);
}

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

function isolatedHtmlResponse(response: any, content: any, downloads = false) {
  response.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'content-security-policy': `sandbox allow-scripts${downloads ? " allow-downloads" : ""}; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'`,
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
  });
  response.end(content);
}

export function uiPrototypeHtmlResponse(response: any, content: any) { isolatedHtmlResponse(response, content); }
export function diagramHtmlResponse(response: any, content: any) { isolatedHtmlResponse(response, content, true); }

export function apiError(response: any, error: any) {
  if (response.destroyed || response.writableEnded) return;
  const status = Number.isInteger(error.status) ? error.status : 500;
  jsonResponse(response, status, {
    error: {
      code: error.code || 'internal_error',
      message: status >= 500 ? 'Buildr Web 处理请求失败。' : error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
    },
  });
}
