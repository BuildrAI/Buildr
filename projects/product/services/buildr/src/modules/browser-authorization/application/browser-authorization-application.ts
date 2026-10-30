import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import crypto from 'node:crypto';
import { resolveProductResource } from '../../../infrastructure/product-resources/index.ts';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { BrowserProfiles, browserError, readPrivate, processAlive } from '../persistence/profiles.ts';

type Runtime = { pid: number; secret: string; endpoint: string; revision: string; startedAt: number; root: string; profileId: string };
function rpc(runtime: Runtime, value: unknown): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = http.request({ socketPath: runtime.endpoint, method: 'POST', path: '/', headers: { authorization: 'Bearer ' + runtime.secret, 'content-type': 'application/json' }, timeout: 28_000 }, res => {
      const chunks: Buffer[] = []; let bytes = 0;
      res.on('data', (chunk: Buffer) => { bytes += chunk.length; if (bytes > 8 * 1024 * 1024) req.destroy(browserError('response_large', '浏览器结果超过限制。')); else chunks.push(chunk); });
      res.on('end', () => { try { const response = JSON.parse(Buffer.concat(chunks).toString('utf8')); if (response.error) reject(Object.assign(new Error(response.error.message), { code: response.error.code })); else resolve(response.result); } catch { reject(browserError('protocol', '浏览器私有响应无效。')); } });
    });
    req.on('timeout', () => req.destroy(browserError('timeout', '浏览器资源请求超时。'))); req.on('error', reject); req.end(JSON.stringify(value));
  });
}
export class BrowserAuthorization {
  readonly profiles: BrowserProfiles;
  constructor(root: string) { this.profiles = new BrowserProfiles(root); }
  async inspect(id: string) {
    const observed = this.profiles.get(id);
    if (!observed.profile) return { ...observed, runtime: { status: 'absent' } };
    const runtime = readPrivate(this.profiles.runtimeFile(id));
    if (!runtime || !processAlive(runtime.pid)) return { ...observed, runtime: { status: 'stopped' } };
    if (runtime.root !== this.profiles.root || runtime.profileId !== id || runtime.revision !== observed.revision) throw browserError('runtime_changed', '运行实例归属或版本不符。');
    try { return { ...observed, runtime: await rpc(runtime, { op: 'status' }) }; }
    catch { return { ...observed, runtime: { status: 'unconfirmed' } }; }
  }
  async acquire(id: string, signal?: AbortSignal) {
    if (signal?.aborted) throw browserError('cancelled', '授权已取消。');
    const runtime = this.profiles.lock(() => {
      const observed = this.profiles.get(id);
      if (!observed.profile) throw browserError('profile_missing', '共享配置尚未登记，请先显式创建或接管。');
      const file = this.profiles.runtimeFile(id), current = readPrivate(file) as Runtime | null;
      if (current && (current.root !== this.profiles.root || current.profileId !== id || !/^[a-f0-9]{64}$/.test(current.secret))) throw browserError('runtime_changed', '运行实例不属于当前工作空间和配置。');
      if (current && processAlive(current.pid)) { if (current.revision !== observed.revision) throw browserError('runtime_changed', '运行实例与配置版本不符。'); return current; }
      if (current) fs.unlinkSync(file); // A dead managed owner is not a live browser; profile locks are still checked by the driver.
      const secret = crypto.randomBytes(32).toString('hex');
      const endpoint = process.platform === 'win32' ? `\\\\.\\pipe\\buildr-browser-${secret}` : path.join(fs.realpathSync(os.tmpdir()).length < 50 ? fs.realpathSync(os.tmpdir()) : fs.realpathSync('/tmp'), `buildr-browser-${secret.slice(0, 24)}.sock`);
      const value: Runtime = { pid: 0, secret, endpoint, revision: observed.revision, startedAt: Date.now(), root: this.profiles.root, profileId: id };
      // Spawn cannot read the state until the parent has recorded its exact pid.
      const child = spawn(process.execPath, [resolveProductResource('runtime/browser-authorization-worker.cjs', { developmentFallback: 'src/modules/browser-authorization/infrastructure/worker.ts' }), this.profiles.root, id], { detached: true, stdio: 'ignore', env: { ...process.env, NODE_OPTIONS: '' } });
      if (!child.pid) throw browserError('start_failed', '浏览器资源进程未启动。');
      value.pid = child.pid; child.on('error', () => {}); child.unref();
      const temporary = file + '.' + crypto.randomUUID();
      fs.writeFileSync(temporary, JSON.stringify(value), { mode: 0o600, flag: 'wx' }); fs.renameSync(temporary, file);
      return value;
    }, id);
    let selected: { lease: string } | undefined;
    for (let attempt = 0; attempt < 80; attempt++) {
      if (signal?.aborted) throw browserError('cancelled', '授权已取消。');
      try { selected = await rpc(runtime, { op: 'acquire' }); break; } catch (error: any) {
        if (!['ENOENT', 'ECONNREFUSED'].includes(error.code)) throw error;
        if (!processAlive(runtime.pid)) throw browserError('start_failed', '浏览器未就绪，请核对依赖和外部占用；配置未清理。');
        await delay(100);
      }
    }
    if (!selected) throw browserError('start_timeout', '等待共享浏览器超时；不终止不明占用。');
    const lease = selected.lease;
    let released = false;
    const heartbeat = setInterval(() => { void rpc(runtime, { op: 'request', lease, method: 'Lease.heartbeat' }).catch(() => {}); }, 10_000);
    heartbeat.unref();
    return {
      async request(method: string, params: unknown = {}, sessionId?: string) { if (released) throw browserError('lease_invalid', '授权资源使用权已释放。'); return rpc(runtime, { op: 'request', lease, method, params, sessionId }); },
      async close() { if (released) return; released = true; clearInterval(heartbeat); await rpc(runtime, { op: 'release', lease }); },
    };
  }
}
