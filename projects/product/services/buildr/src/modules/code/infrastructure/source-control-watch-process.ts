import fs from 'node:fs';
import { fork, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { resolveProductResource } from '../../../infrastructure/product-resources/index.ts';

export type FileWatcher = { close(): void; on(event: 'error', listener: (error: Error) => void): unknown };
export type WatchFiles = (directory: string, recursive: boolean, changed: (event: string, filename: string | null) => void) => Promise<FileWatcher>;

// FSEvents can synchronously block inside both watch() and close(). A Worker
// shares libuv's native FSEvents loop; only a child process isolates its teardown.
if (process.argv.includes('--source-control-watch-child')) {
  const watchers = new Map<number, fs.FSWatcher>();
  process.on('message', (message: any) => {
    const { id } = message;
    if (message.type === 'watch') {
      try {
        const watcher = fs.watch(message.directory, { recursive: message.recursive, persistent: false }, (event, filename) => {
          if (process.connected) process.send?.({ type: 'change', id, event, filename: filename?.toString() ?? null });
        });
        watchers.set(id, watcher);
        watcher.on('error', () => { if (process.connected) process.send?.({ type: 'error', id }); });
        process.send?.({ type: 'ready', id });
      } catch { process.send?.({ type: 'error', id }); }
    } else if (message.type === 'close') {
      watchers.get(id)?.close(); watchers.delete(id); process.send?.({ type: 'closed', id });
    }
  });
  process.on('disconnect', () => process.exit(0));
}

/** One read-only child per workspace observation; commands and shutdown are bounded. */
export class IsolatedFileWatchers {
  private child?: ChildProcess;
  private nextId = 0;
  private closed = false;
  private closing?: Promise<void>;
  private readonly handles = new Map<number, {
    emitter: EventEmitter; changed: (event: string, filename: string | null) => void;
    ready(): void; reject(error: Error): void; timer?: ReturnType<typeof setTimeout>;
  }>();
  private start(): ChildProcess {
    if (this.closed) throw Error('file watcher closed');
    if (this.child) return this.child;
    const entry = resolveProductResource('runtime/source-control-watch-process.cjs', {
      developmentFallback: 'src/modules/code/infrastructure/source-control-watch-process.ts',
    });
    const child = fork(entry, ['--source-control-watch-child'], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
    this.child = child;
    child.unref(); child.channel?.unref();
    const failed = () => {
      if (this.child !== child) return;
      this.child = undefined;
      const handles = [...this.handles.values()]; this.handles.clear();
      for (const handle of handles) {
        clearTimeout(handle.timer); handle.reject(Error('file watch process unavailable'));
        handle.emitter.emit('error', Error('file watch process unavailable'));
      }
    };
    child.on('error', failed); child.on('exit', failed);
    child.on('message', (message: any) => {
      const handle = this.handles.get(message.id);
      if (!handle) return;
      if (message.type === 'change') handle.changed(message.event, message.filename);
      else if (message.type === 'ready') { clearTimeout(handle.timer); handle.ready(); }
      else if (message.type === 'closed') { clearTimeout(handle.timer); this.handles.delete(message.id); }
      else if (message.type === 'error') {
        clearTimeout(handle.timer); this.handles.delete(message.id);
        handle.reject(Error('file watch unavailable')); handle.emitter.emit('error', Error('file watch unavailable'));
      }
    });
    return child;
  }
  private send(child: ChildProcess, message: object): void {
    if (child.connected) child.send(message, () => {});
  }
  readonly watch: WatchFiles = (directory, recursive, changed) => {
    const child = this.start(), id = ++this.nextId, emitter = new EventEmitter();
    // A startup failure rejects the promise before consumers install their handler.
    emitter.on('error', () => {});
    return new Promise<FileWatcher>((resolve, reject) => {
      let released = false;
      const handle = { emitter, changed, ready: () => resolve(Object.assign(emitter, { close: () => {
        if (released || !this.handles.has(id)) return;
        released = true;
        this.send(child, { type: 'close', id });
        handle.timer = setTimeout(() => child.kill('SIGKILL'), 2000);
        handle.timer.unref();
      } })), reject, timer: undefined as ReturnType<typeof setTimeout> | undefined };
      handle.timer = setTimeout(() => child.kill('SIGKILL'), 3000);
      this.handles.set(id, handle); this.send(child, { type: 'watch', id, directory, recursive });
    });
  };
  close(): Promise<void> {
    if (this.closing) return this.closing;
    this.closed = true;
    const child = this.child;
    if (!child) return Promise.resolve();
    this.closing = new Promise(resolve => {
      // No writes or model execution live here. Kill only this owned child if
      // native cleanup stalls; never wait for native watcher.close() in the host.
      const timer = setTimeout(() => child.kill('SIGKILL'), 1000);
      child.once('exit', () => { clearTimeout(timer); resolve(); });
      if (child.connected) child.disconnect();
    });
    return this.closing;
  }
}
