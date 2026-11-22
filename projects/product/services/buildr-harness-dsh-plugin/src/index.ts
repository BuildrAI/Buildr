import { execFile } from 'node:child_process';
import { realpath, stat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { DESKTOP_HEADER, handoff, OPEN_PATH, type Handoff, type OpenCode } from './handoff.ts';

interface Peer { id: string }
interface HostContext {
  connection: {
    readonly browserPeer: Peer;
    admit(request: IncomingMessage): { peer: Peer } | { rejection: 401 | 403 };
  };
  webServer: {
    host: string;
    register(route: { kind: 'exact'; path: string; handler(req: IncomingMessage, res: ServerResponse): Promise<void> }): () => void;
  };
  effect(mount: () => () => void, name?: string): void;
}

export const inject = ['connection', 'webServer'];
const run = promisify(execFile);
const launcher = fileURLToPath(new URL('./launcher.js', import.meta.url));

function json(res: ServerResponse, status: number, value: Handoff | { code: OpenCode }) {
  if (res.destroyed || res.writableEnded) return;
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(value));
}

export function desktopAdmission(ctx: Pick<HostContext, 'connection' | 'webServer'>, req: IncomingMessage): boolean {
  // rc.5's native proxy removes Origin/Sec-Fetch-Site and supplies the authenticated
  // browser cookie; ordinary browser POSTs have Origin / Sec-Fetch-Site. The marker
  // also requires preflight cross-origin. It is not a credential by itself.
  if (ctx.webServer.host !== '127.0.0.1' || req.method !== 'POST' || req.headers[DESKTOP_HEADER] !== '1'
      || req.headers.origin !== undefined || req.headers['sec-fetch-site'] !== undefined
      || req.headers.authorization !== undefined || req.headers['transfer-encoding'] !== undefined
      || (req.headers['content-length'] !== undefined && req.headers['content-length'] !== '0')) return false;
  const admission = ctx.connection.admit(req);
  return 'peer' in admission && admission.peer.id === ctx.connection.browserPeer.id;
}

export function apply(ctx: HostContext) {
  // Only the developer's native launch environment can choose the installation
  // and the data domain. This route accepts no paths, program arguments or body.
  const node = process.env.BUILDR_HARNESS_DSH_NODE;
  const packageRoot = process.env.BUILDR_HARNESS_DSH_PACKAGE_ROOT;
  const dataRoot = process.env.BUILDR_HARNESS_DSH_DATA_ROOT;
  const port = process.env.BUILDR_HARNESS_DSH_PORT ?? '9519';
  const binding = Boolean(process.connected && node && isAbsolute(node) && packageRoot && isAbsolute(packageRoot) && dataRoot && isAbsolute(dataRoot));
  ctx.effect(() => {
    const lifetime = new AbortController();
    const unregister = ctx.webServer.register({ kind: 'exact', path: OPEN_PATH, async handler(req, res) {
      if (!desktopAdmission(ctx, req)) { json(res, 403, { code: 'desktop-required' }); return; }
      if (!binding) { json(res, 409, { code: 'binding-missing' }); return; }
      const request = new AbortController();
      const onClose = () => request.abort();
      res.once('close', onClose);
      try {
        const executable = await realpath(node!);
        if (!(await stat(executable)).isFile()) throw Error('invalid-node');
        const env = { ...process.env };
        delete env.ELECTRON_RUN_AS_NODE; delete env.NODE_OPTIONS; delete env.NODE_PATH;
        const signal = AbortSignal.any([lifetime.signal, request.signal]);
        if (signal.aborted) return;
        const { stdout } = await run(executable, [launcher, packageRoot!, dataRoot!, port], {
          env, signal, timeout: 45_000, maxBuffer: 16 * 1024, encoding: 'utf8', windowsHide: true,
        });
        json(res, 200, handoff(JSON.parse(stdout)));
      } catch {
        // Child output may include runtime data or a ticket; never return or log it.
        if (!request.signal.aborted) json(res, 503, { code: 'harness-unavailable' });
      } finally { res.off('close', onClose); }
    } });
    return () => { lifetime.abort(); unregister(); };
  }, 'buildr-harness: desktop opening');
}
