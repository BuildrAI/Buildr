import { released } from './channel.ts';
import { recordDesktopActivation } from './desktop-activation.ts';
import { discoverReleased } from './installation.ts';
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
  if (ctx.webServer.host !== '127.0.0.1' || req.method !== 'POST' || req.headers[DESKTOP_HEADER] !== '1'
      || req.headers.origin !== undefined || req.headers['sec-fetch-site'] !== undefined
      || req.headers.authorization !== undefined || req.headers['transfer-encoding'] !== undefined
      || (req.headers['content-length'] !== undefined && req.headers['content-length'] !== '0')) return false;
  const admission = ctx.connection.admit(req);
  return 'peer' in admission && admission.peer.id === ctx.connection.browserPeer.id;
}

export function apply(ctx: HostContext) {
  const node = process.env.BUILDR_DEVELOPMENT_DSH_NODE;
  const packageRoot = process.env.BUILDR_DEVELOPMENT_DSH_PACKAGE_ROOT;
  const dataRoot = process.env.BUILDR_DEVELOPMENT_DSH_DATA_ROOT;
  const port = process.env.BUILDR_DEVELOPMENT_DSH_PORT ?? '4458';
  const binding = Boolean(process.connected && node && isAbsolute(node) && packageRoot && isAbsolute(packageRoot) && dataRoot && isAbsolute(dataRoot));
  if (typeof ctx.connection?.admit !== 'function' || typeof ctx.webServer?.register !== 'function' || typeof ctx.effect !== 'function') return;
  ctx.effect(() => {
    const lifetime = new AbortController();
    const unregister = ctx.webServer.register({ kind: 'exact', path: OPEN_PATH, async handler(req, res) {
      if (!desktopAdmission(ctx, req)) { json(res, 403, { code: 'desktop-required' }); return; }
      const discovery = released
        ? discoverReleased()
        : binding
          ? { installation: { node: node!, packageRoot: packageRoot!, dataRoot: dataRoot!, port } }
          : { code: 'binding-missing' as const };
      if ('code' in discovery) { json(res, 409, { code: discovery.code }); return; }
      const target = discovery.installation;
      const request = new AbortController();
      const onClose = () => request.abort();
      res.once('close', onClose);
      try {
        const executable = await realpath(target.node);
        if (!(await stat(executable)).isFile()) throw Error('invalid-node');
        const env = { ...process.env };
        delete env.ELECTRON_RUN_AS_NODE; delete env.NODE_OPTIONS; delete env.NODE_PATH;
        const signal = AbortSignal.any([lifetime.signal, request.signal]);
        if (signal.aborted) return;
        const { stdout } = await run(executable, [launcher, target.packageRoot, target.dataRoot, target.port], {
          env, signal, timeout: 45_000, maxBuffer: 16 * 1024, encoding: 'utf8', windowsHide: true,
        });
        json(res, 200, handoff(JSON.parse(stdout)));
      } catch {
        if (!request.signal.aborted) json(res, 503, { code: 'development-unavailable' });
      } finally { res.off('close', onClose); }
    } });
    const releaseActivation = !released && process.platform === 'darwin' && binding
      ? recordDesktopActivation({ node: node!, packageRoot: packageRoot!, dataRoot: dataRoot!, port, entry: fileURLToPath(import.meta.url) })
      : undefined;
    return () => { lifetime.abort(); unregister(); releaseActivation?.(); };
  }, 'buildr-development: desktop opening');
}
