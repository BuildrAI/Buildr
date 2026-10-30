import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { BrowserProfiles, browserError, privateDirectory, readPrivate } from '../persistence/profiles.ts';
import { startBrowser } from './browser.ts';

type Pipe = { request(method: string, params?: any, sessionId?: string): Promise<any>; on(event: string, listener: (event: any) => void): any };
type Lease = { targets: Set<string>; sessions: Map<string, string>; events: any[]; expires: number; creating: number; closing: boolean };
const sessionMethods = new Set(['Runtime.evaluate', 'Runtime.enable', 'Page.navigate', 'Page.bringToFront', 'Page.reload', 'Page.captureScreenshot', 'Input.dispatchMouseEvent', 'Input.dispatchKeyEvent', 'Input.insertText', 'Network.enable', 'Network.getResponseBody']);
function webUrl(value: unknown) {
  if (value === 'about:blank') return;
  try { const u = new URL(String(value)); if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) throw new Error(); } catch { throw browserError('url_invalid', '仅允许HTTP/HTTPS授权页面。'); }
}
/** Runtime owns the browser; each professional caller only owns its pages. */
export class BrowserLeases {
  readonly leases = new Map<string, Lease>();
  private pipe: Pipe;
  constructor(pipe: Pipe) {
    this.pipe = pipe;
    pipe.on('event', event => {
      for (const [id, lease] of this.leases) {
        if (event.method === 'Target.targetCreated' && lease.targets.has(event.params?.targetInfo?.openerId)) {
          const targetId = event.params.targetInfo.targetId;
          lease.targets.add(targetId);
          if (lease.closing || lease.targets.size + lease.creating > 8) {
            void this.closeTarget(lease, targetId).catch(() => { lease.closing = true; lease.expires = Date.now(); });
          }
        }
        if (event.sessionId && lease.sessions.has(event.sessionId) || event.method.startsWith('Target.') && (lease.targets.has(event.params?.targetId) || lease.targets.has(event.params?.targetInfo?.targetId))) {
          if (Buffer.byteLength(JSON.stringify(event)) <= 128 * 1024) { lease.events.push(event); if (lease.events.length > 64) lease.events.shift(); }
        }
        if (event.method === 'Target.targetDestroyed' && lease.targets.delete(event.params?.targetId)) {
          for (const [session, target] of lease.sessions) if (target === event.params.targetId) lease.sessions.delete(session);
          if (lease.closing && !lease.targets.size && !lease.creating) this.leases.delete(id);
        }
      }
    });
  }
  acquire() { const id = crypto.randomUUID(); this.leases.set(id, { targets: new Set(), sessions: new Map(), events: [], expires: Date.now() + 30_000, creating: 0, closing: false }); return id; }
  private selected(id: string) { const lease = this.leases.get(id); if (!lease || lease.closing) throw browserError('lease_invalid', '浏览器使用权已结束或正在清理。'); lease.expires = Date.now() + 30_000; return lease; }
  private async closeTarget(lease: Lease, targetId: string) {
    try {
      const result = await this.pipe.request('Target.closeTarget', { targetId });
      if (result?.success === false) throw new Error();
    } catch {
      const result = await this.pipe.request('Target.getTargets').catch(() => null);
      if (!result || result.targetInfos.some((target: any) => target.targetId === targetId)) throw browserError('cleanup_unconfirmed', '页面关闭尚未确认，保留占用并继续回查。');
    }
    lease.targets.delete(targetId);
    for (const [session, target] of lease.sessions) if (target === targetId) lease.sessions.delete(session);
  }
  async release(id: string) {
    const lease = this.leases.get(id); if (!lease) return;
    lease.closing = true; lease.expires = Date.now();
    let failed = false;
    for (const targetId of [...lease.targets]) try { await this.closeTarget(lease, targetId); } catch { failed = true; }
    if (!failed && !lease.creating && !lease.targets.size) this.leases.delete(id);
    else throw browserError('cleanup_unconfirmed', '仍有页面关闭或创建结果未确认，保留清理状态。');
  }
  async expire() { for (const [id, lease] of this.leases) if (lease.expires < Date.now()) await this.release(id).catch(() => {}); }
  async request(id: string, method: string, params: any = {}, sessionId?: string) {
    const lease = this.selected(id);
    if (!params || typeof params !== 'object' || Array.isArray(params)) throw browserError('request_invalid', '浏览器参数必须是对象。');
    if (method === 'Lease.heartbeat') return {};
    if (method === 'Events.poll') { const events = lease.events; lease.events = []; return events; }
    if (method === 'Browser.getVersion') return this.pipe.request(method);
    if (method === 'Target.setDiscoverTargets') return {};
    if (method === 'Target.getTargets') { const result = await this.pipe.request(method); return { targetInfos: result.targetInfos.filter((target: any) => lease.targets.has(target.targetId)) }; }
    if (method === 'Target.createTarget') {
      if (lease.targets.size + lease.creating >= 8) throw browserError('page_limit', '本次授权页面超过上限。');
      webUrl(params.url); lease.creating++;
      try {
        const result = await this.pipe.request(method, { url: params.url, newWindow: params.newWindow !== false, background: params.background === true });
        lease.targets.add(result.targetId);
        if (lease.closing) { await this.closeTarget(lease, result.targetId); throw browserError('lease_invalid', '页面创建期间使用权已释放。'); }
        return result;
      } finally { lease.creating--; if (lease.closing && !lease.creating && !lease.targets.size) this.leases.delete(id); }
    }
    if (method === 'Target.closeTarget') {
      if (!lease.targets.has(params.targetId)) throw browserError('page_not_owned', '不能控制其他使用方的授权页面。');
      await this.closeTarget(lease, params.targetId); return { success: true };
    }
    if (['Target.attachToTarget', 'Target.activateTarget'].includes(method)) {
      if (!lease.targets.has(params.targetId)) throw browserError('page_not_owned', '不能控制其他使用方的授权页面。');
      const result = await this.pipe.request(method, { targetId: params.targetId, ...(method === 'Target.attachToTarget' ? { flatten: true } : {}) });
      if (lease.closing || this.leases.get(id) !== lease || !lease.targets.has(params.targetId)) throw browserError('lease_invalid', '页面附着期间页面归属或使用权已结束。');
      if (method === 'Target.attachToTarget') lease.sessions.set(result.sessionId, params.targetId);
      return result;
    }
    if (!sessionId || !lease.sessions.has(sessionId) || !sessionMethods.has(method)) throw browserError('request_forbidden', '不允许全局浏览器操作或跨使用方会话请求。');
    if (method === 'Page.navigate') webUrl(params.url);
    return this.pipe.request(method, params, sessionId);
  }
}

export async function serveBrowser(root: string, id: string, start = startBrowser) {
  const profiles = new BrowserProfiles(root), runtimeFile = profiles.runtimeFile(id), runtime = readPrivate(runtimeFile);
  if (!runtime || runtime.pid !== process.pid) throw browserError('runtime_changed', '浏览器运行身份已变化。');
  const observed = profiles.get(id);
  if (!observed.profile || observed.revision !== runtime.revision) throw browserError('revision_conflict', '浏览器配置已变化。');
  const directory = path.resolve(profiles.root, observed.profile.directory); privateDirectory(profiles.root, directory);
  const browser = start(directory);
  try {
    await browser.pipe.request('Browser.getVersion');
    await browser.pipe.request('Target.setDiscoverTargets', { discover: true });
  } catch (error) { await browser.close(); throw error; }
  const leases = new BrowserLeases(browser.pipe);
  let closing = false, everLeased = false;
  const server = http.createServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== '/' || req.headers.authorization !== 'Bearer ' + runtime.secret) { res.writeHead(403); res.end(); return; }
    try {
      const chunks: Buffer[] = []; let bytes = 0;
      for await (const chunk of req) { bytes += chunk.length; if (bytes > 256 * 1024) throw browserError('request_large', '浏览器请求超过限制。'); chunks.push(chunk); }
      const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      let result;
      if (input.op === 'status') result = { status: closing ? 'closing' : 'running', active: [...leases.leases.values()].filter(lease => !lease.closing).length, cleanupPending: [...leases.leases.values()].filter(lease => lease.closing).length };
      else if (closing) throw browserError('closing', '共享浏览器正在释放，请重新观察。');
      else if (input.op === 'acquire') { everLeased = true; result = { lease: leases.acquire() }; }
      else if (input.op === 'release') { await leases.release(input.lease); result = {}; }
      else if (input.op === 'request') result = await leases.request(input.lease, input.method, input.params, input.sessionId);
      else throw browserError('request_invalid', '未知浏览器资源动作。');
      res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ result }));
    } catch (error: any) { res.statusCode = 409; res.end(JSON.stringify({ error: { code: String(error.code || 'browser_authorization_failed'), message: '浏览器资源请求未完成，请检查配置身份、页面归属与占用。' } })); }
  });
  let stopping: Promise<void> | undefined, stopped = false;
  const stop = (): Promise<void> => {
    if (stopped) return Promise.resolve();
    if (stopping) return stopping;
    closing = true;
    stopping = (async () => {
      for (const lease of [...leases.leases.keys()]) await leases.release(lease);
      await browser.close();
      await new Promise<void>(resolve => server.close(() => resolve()));
      const current = readPrivate(runtimeFile);
      if (current?.secret === runtime.secret) fs.unlinkSync(runtimeFile);
      if (process.platform !== 'win32' && fs.existsSync(runtime.endpoint)) fs.unlinkSync(runtime.endpoint);
      stopped = true; clearInterval(timer);
      process.removeListener('SIGTERM', onSignal); process.removeListener('SIGINT', onSignal);
    })().finally(() => { stopping = undefined; });
    return stopping;
  };
  const timer = setInterval(() => { void leases.expire().then(() => { if (closing || !leases.leases.size && (everLeased || Date.now() - runtime.startedAt > 15_000)) return stop(); }).catch(() => {}); }, 1000);
  const onSignal = () => { void stop().catch(() => {}); };
  process.once('SIGTERM', onSignal); process.once('SIGINT', onSignal);
  try {
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(runtime.endpoint, () => { if (process.platform !== 'win32') fs.chmodSync(runtime.endpoint, 0o600); resolve(); }); });
  } catch (error) { clearInterval(timer); process.removeListener('SIGTERM', onSignal); process.removeListener('SIGINT', onSignal); await browser.close(); throw error; }
  browser.pipe.once('closed', onSignal);
  return { close: stop, endpoint: runtime.endpoint };
}
