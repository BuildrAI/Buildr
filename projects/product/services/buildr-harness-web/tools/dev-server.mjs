import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash, randomBytes} from 'node:crypto';
import {createServer} from 'vite';

const noncePlaceholder = '__BUILDR_DEVELOPMENT_NONCE__';

/** Development-only source renderer. The listener, API and authentication stay
 * with the host; this object never starts or stops an execution backend. */
export async function createDevelopmentWeb({root, base = '/', server, authorize, inject = html => html}) {
  root = await fs.realpath(root);
  const metadata = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
  if (!['@buildr-ai/buildr-web', '@buildr-ai/buildr-harness-web'].includes(metadata.name)) {
    throw new Error('development_web_source_invalid');
  }
  if (!base.startsWith('/') || !base.endsWith('/')) throw new Error('development_web_base_invalid');
  const upgrades = new Map();
  const errors = new WeakMap();
  const hmrPath = `${base}__hmr`;
  // Vite owns only its exact upgrade path. Authenticate before invoking its WS
  // handler, including reconnection probes; never consume another host's WS.
  const hmrServer = new Proxy(server, {get(target, key) {
    if (key === 'on') return (event, listener) => {
      if (event !== 'upgrade') { target.on(event, listener); return hmrServer; }
      const guarded = (request, socket, head) => {
        if (new URL(request.url || '/', 'http://localhost').pathname !== hmrPath) return;
        try { authorize(request); } catch { socket.destroy(); return; }
        listener(request, socket, head);
      };
      upgrades.set(listener, guarded);
      target.on(event, guarded);
      return hmrServer;
    };
    if (key === 'off' || key === 'removeListener') return (event, listener) => {
      target.off(event, upgrades.get(listener) || listener);
      upgrades.delete(listener);
      return hmrServer;
    };
    const value = Reflect.get(target, key, target);
    return typeof value === 'function' ? value.bind(target) : value;
  }});
  const vite = await createServer({
    root, base, appType: 'custom',
    configFile: path.join(root, 'vite.config.ts'),
    // A standalone and embedded page can develop the same source concurrently.
    cacheDir: path.join(root, 'node_modules', '.vite-buildr-' + createHash('sha256').update(base).digest('hex').slice(0, 12)),
    html: {cspNonce: noncePlaceholder},
    plugins: [{
      name: 'buildr-development-errors',
      configureServer(value) {
        // Vite's middleware-mode error logger calls next() without the error.
        // Retain the failure for our host boundary instead of returning a 404.
        return () => value.middlewares.use((error, request, _response, next) => {
          errors.set(request, error); next(error);
        });
      },
    }],
    server: {
      middlewareMode: true, hmr: {server: hmrServer, path: '__hmr'},
      fs: {strict: true, allow: [root]},
      cors: false,
    },
  });
  return {
    async handle(request, response, {document = false, entry = 'index.html', frame = false} = {}) {
      authorize(request);
      if (document) {
        const nonce = randomBytes(18).toString('base64');
        const html = await vite.transformIndexHtml(request.url || base, await fs.readFile(path.join(root, entry), 'utf8'));
        const output = inject(html, request).replaceAll(noncePlaceholder, nonce);
        response.writeHead(200, {
          'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store',
          'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer',
          'content-security-policy': `default-src 'self'; script-src 'self' 'nonce-${nonce}'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self' data:; connect-src 'self' ws://127.0.0.1:${new URL('http://' + request.headers.host).port}; object-src 'none'; base-uri 'none'; frame-src 'self'; frame-ancestors ${frame ? "'self'" : "'none'"}`,
          'x-frame-options': frame ? 'SAMEORIGIN' : 'DENY',
        });
        response.end(output);
        return;
      }
      await new Promise((resolve, reject) => {
        const cleanup = () => { response.off('finish', done); response.off('close', done); };
        const done = () => { cleanup(); resolve(); };
        response.once('finish', done); response.once('close', done);
        vite.middlewares(request, response, error => {
          const failure = error || errors.get(request);
          if (failure) { cleanup(); reject(failure); return; }
          response.writeHead(404, {'content-type': 'text/plain'}); response.end('Development asset not found.');
        });
      });
    },
    async close() { await vite.close(); },
  };
}
