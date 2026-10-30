import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { browserError, processAlive } from '../persistence/profiles.ts';

/** Only a private inherited pipe is used; never expose a remote-debugging port. */
export class BrowserPipe extends EventEmitter {
  private sequence = 0;
  private closed = false;
  private dropping = false;
  private buffer = Buffer.alloc(0);
  private pending = new Map<number, { resolve(value: any): void; reject(error: Error): void; method: string; timer: ReturnType<typeof setTimeout> }>();
  private write: NodeJS.WritableStream;
  constructor(write: NodeJS.WritableStream, read: NodeJS.ReadableStream) {
    super(); this.write = write; read.on('data', (chunk: Buffer) => {
      let offset = 0;
      while (offset < chunk.length) {
        const end = chunk.indexOf(0, offset), stop = end < 0 ? chunk.length : end;
        const part = chunk.subarray(offset, stop);
        if (!this.dropping) {
          if (this.buffer.length + part.length > 8 * 1024 * 1024) {
            const prefix = Buffer.concat([this.buffer.subarray(0, 512), part.subarray(0, 512)]).toString('utf8');
            const match = prefix.match(/^\s*\{\s*"id"\s*:\s*(\d+)\s*[,}]/);
            const id = match ? Number(match[1]) : undefined;
            if (id !== undefined) this.failRequest(id, browserError('response_large', '本次浏览器响应超过限制。'));
            this.buffer = Buffer.alloc(0); this.dropping = true;
          } else this.buffer = Buffer.concat([this.buffer, part]);
        }
        if (end >= 0) {
          if (!this.dropping) this.receiveFrame(this.buffer);
          this.buffer = Buffer.alloc(0); this.dropping = false;
        }
        offset = stop + 1;
      }
    });
    read.on('end', () => this.close()); read.on('error', () => this.close()); write.on('error', () => this.close());
  }
  private failRequest(id: number, error: Error) {
    const request = this.pending.get(id); if (!request) return;
    // A timed-out creation can still have a side effect. Keep its result route
    // until the browser answers or closes; caller deadlines are enforced outside.
    if (request.method === 'Target.createTarget') return;
    this.pending.delete(id); clearTimeout(request.timer);
    request.reject(error);
  }
  private receiveFrame(bytes: Buffer) {
    let message: any; try { message = JSON.parse(bytes.toString('utf8')); } catch { return; }
    const request = this.pending.get(message.id);
    if (request) { this.pending.delete(message.id); clearTimeout(request.timer); if (message.error) request.reject(browserError('protocol', '浏览器请求未完成。')); else request.resolve(message.result); }
    else if (message.method) this.emit('event', message);
  }
  request(method: string, params: any = {}, sessionId?: string): Promise<any> {
    if (method === 'Target.createTarget' && [...this.pending.values()].filter(value => value.method === method).length >= 128) return Promise.reject(browserError('unconfirmed_pages', '尚有未确认页面创建，先核对资源状态。'));
    if (this.closed) return Promise.reject(browserError('closed', '共享浏览器已关闭。'));
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      const timer = setTimeout(() => this.failRequest(id, browserError('timeout', '等待浏览器请求超时。')), 25_000);
      this.pending.set(id, { resolve, reject, timer, method });
      this.write.write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + '\0');
    });
  }
  close() { if (this.closed) return; this.closed = true; for (const item of this.pending.values()) { clearTimeout(item.timer); item.reject(browserError('closed', '共享浏览器已关闭。')); } this.pending.clear(); this.emit('closed'); }
}
export function findBrowser(): string {
  const candidates = process.platform === 'darwin' ? ['/Applications', path.join(os.homedir(), 'Applications')].flatMap(root => ['Google Chrome.app/Contents/MacOS/Google Chrome', 'Microsoft Edge.app/Contents/MacOS/Microsoft Edge', 'Chromium.app/Contents/MacOS/Chromium', 'Tabbit Browser.app/Contents/MacOS/Tabbit Browser'].map(name => path.join(root, name)))
    : process.platform === 'win32' ? [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter((x): x is string => Boolean(x)).flatMap(root => ['Google/Chrome/Application/chrome.exe', 'Microsoft/Edge/Application/msedge.exe'].map(name => path.join(root, name)))
      : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/microsoft-edge', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  for (const file of candidates) try { fs.accessSync(file, fs.constants.X_OK); if (fs.statSync(file).isFile()) return file; } catch { /* Try the next installed browser. */ }
  throw browserError('browser_missing', '未找到已安装的受支持浏览器。');
}
export function assertProfileAvailable(directory: string) {
  const file = path.join(directory, 'SingletonLock'), lock = fs.lstatSync(file, { throwIfNoEntry: false });
  if (!lock) return;
  // Chromium owns lock reclamation. Only let it examine a provably dead local
  // owner; never remove a lock ourselves or take over a live/unknown owner.
  if (lock.isSymbolicLink()) {
    const value = fs.readlinkSync(file), prefix = os.hostname() + '-';
    const pid = value.startsWith(prefix) ? value.slice(prefix.length) : '';
    if (/^[1-9][0-9]*$/.test(pid) && Number.isSafeInteger(Number(pid)) && !processAlive(Number(pid))) return;
  }
  throw browserError('externally_owned', '配置有活动或归属不明的外部占用，请由原使用方释放；不会删除锁或终止进程。');
}
export type BrowserMode = 'headless' | 'interactive';
export function browserArguments(directory: string, mode: BrowserMode = 'headless') {
  if (!['headless', 'interactive'].includes(mode)) throw browserError('mode_invalid', '浏览器模式必须为headless或interactive。');
  return [`--user-data-dir=${directory}`, '--remote-debugging-pipe', '--no-first-run', '--no-default-browser-check', '--no-startup-window', '--disable-session-crashed-bubble', ...(mode === 'headless' ? ['--headless=new'] : [])];
}
export function startBrowser(directory: string, mode: BrowserMode = 'headless') {
  assertProfileAvailable(directory);
  const child = spawn(findBrowser(), browserArguments(directory, mode), { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] });
  const pipe = new BrowserPipe(child.stdio[3]! as NodeJS.WritableStream, child.stdio[4]! as NodeJS.ReadableStream);
  child.on('error', () => pipe.close());
  const exited = new Promise<void>(resolve => child.once('exit', () => { pipe.close(); resolve(); }));
  return { pipe, async close() { await pipe.request('Browser.close').catch(() => {}); await exited; /* Retain ownership until actual exit; never escalate against an unobserved process. */ } };
}
