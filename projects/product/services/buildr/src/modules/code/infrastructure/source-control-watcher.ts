import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { codeGitEnvironment } from './code-git-environment.ts';
import { sameFilesystemPath } from '../../../infrastructure/filesystem/filesystem-path-identity.ts';

const execute = promisify(execFile);
async function watchKey(kind: string, directory: string) {
  const stat = await fs.promises.stat(directory, { bigint: true });
  if (!stat.isDirectory()) throw Error('watch target is not a directory');
  return [kind, directory, stat.dev, stat.ino, stat.birthtimeNs].join(':');
}
const OUTPUT_DIRECTORIES = new Set(['node_modules', 'dist', 'build', 'web-dist', '.worktrees', '.buildr', 'target', '.gradle', '.next', 'coverage']);
type OutputDecision = { pending: boolean; ignored: boolean; expires: number };
type Target = { path: string; metadata: boolean; recursive: boolean; prefix?: string; outputs?: Map<string, OutputDecision>; tracked?: Set<string> };
type Watched = { target: Target; owners: Set<string>; watcher: fs.FSWatcher; degraded: boolean };
type Options = { changed(repositoryIds: string[], refsChanged?: boolean): void; diagnostic(repositoryId: string, message: string): void };

/** Filesystem events invalidate observations; Git reads remain the authority. */
export class SourceControlWatchers {
  private readonly options: Options;
  private readonly watched = new Map<string, Watched>();
  private readonly repositories = new Map<string, Set<string>>();
  private readonly generations = new Map<string, number>();
  private readonly retries = new Set<string>();
  private readonly slots: Array<() => void> = [];
  private readonly controller = new AbortController();
  private running = 0;
  private outputChecks = 0;
  private closed = false;

  constructor(options: Options) { this.options = options; }

  private async withSlot<T>(action: () => Promise<T>): Promise<T> {
    if (this.running >= 4) await new Promise<void>(resolve => this.slots.push(resolve));
    else this.running++;
    try { return await action(); }
    finally { const next = this.slots.shift(); if (next) next(); else this.running--; }
  }

  private async inspect(location: string): Promise<{ directories: string[]; tracked: Set<string> }> {
    return this.withSlot(async () => {
      if (this.closed) return { directories: [], tracked: new Set() };
      const git = (args: string[], maxBuffer = 8 * 1024 * 1024) => execute('git', ['--no-optional-locks', '--no-replace-objects', '-c', 'gc.auto=0', '-c', 'maintenance.auto=false', '-C', location, ...args], { env: { ...codeGitEnvironment(), GIT_OPTIONAL_LOCKS: '0' }, timeout: 4000, maxBuffer, signal: this.controller.signal });
      const { stdout } = await git(['rev-parse', '--path-format=absolute', '--show-toplevel', '--git-dir', '--git-common-dir'], 64 * 1024);
      const values = stdout.trim().split('\n');
      if (values.length !== 3 || !sameFilesystemPath(values[0], location)) throw Error('checkout changed');
      const directories = [...new Set(await Promise.all(values.slice(1).map(value => fs.promises.realpath(value))))];
      const tracked = new Set<string>();
      for (const entry of (await git(['ls-files', '--cached', '-z'])).stdout.split('\0').filter(Boolean)) {
        let current = entry;
        while (current !== '.' && current) { tracked.add(current); current = path.posix.dirname(current); }
        if (tracked.size > 32_768) { tracked.clear(); tracked.add('*'); break; }
      }
      return { directories, tracked };
    });
  }

  needsRetry(repositoryId: string) { return this.retries.has(repositoryId); }

  private deferOutput(key: string, watched: Watched, relative: string) {
    const target = watched.target;
    if (target.tracked?.has('*')) return false;
    const segments = relative.split('/');
    let end = segments.findIndex(segment => OUTPUT_DIRECTORIES.has(segment));
    if (end < 0) return false;
    // Mixed directories such as .buildr contain both tracked assets and ignored local output.
    // Descend past every tracked ancestor before checking an untracked directory or file.
    while (end < segments.length && target.tracked?.has(segments.slice(0, end + 1).join('/'))) end++;
    if (end === segments.length) return false;
    const candidate = segments.slice(0, end + 1).join('/');
    const cache = target.outputs ??= new Map();
    const previous = cache.get(candidate);
    if (previous?.pending) return true;
    if (previous && previous.expires > Date.now()) return previous.ignored;
    if ((!previous && cache.size >= 256) || this.outputChecks >= 16) return false;
    const decision: OutputDecision = { pending: true, ignored: false, expires: 0 };
    cache.set(candidate, decision); this.outputChecks++;
    void this.withSlot(async () => {
      if (this.closed) return false;
      const stat = await fs.promises.lstat(path.join(target.path, candidate)).catch((error: NodeJS.ErrnoException) => { if (error.code !== 'ENOENT') throw error; return null; });
      await execute('git', ['--no-optional-locks', '--no-replace-objects', '-c', 'core.fsmonitor=false', '-C', target.path, 'check-ignore', '--quiet', '--no-index', '--', candidate + (stat?.isDirectory() ? '/' : '')], {
        env: { ...codeGitEnvironment(), GIT_OPTIONAL_LOCKS: '0' }, timeout: 1500, maxBuffer: 64 * 1024, signal: this.controller.signal,
      });
      return true;
    }).catch(() => false).then(ignored => {
      this.outputChecks--; decision.pending = false; decision.ignored = ignored; decision.expires = Date.now() + 30_000;
      if (!this.closed && this.watched.get(key) === watched && (!ignored || watched.target !== target)) this.options.changed([...watched.owners]);
    });
    return true;
  }

  private attach(key: string, target: Target, repositoryId: string) {
    const existing = this.watched.get(key);
    if (existing) {
      existing.owners.add(repositoryId); existing.target = target;
      if (existing.degraded) { this.retries.add(repositoryId); this.options.diagnostic(repositoryId, '部分目录无法递归监听，将通过低频核对补偿变化。'); }
      return false;
    }
    if (this.watched.size >= 384) throw Error('watch capacity');
    const owners = new Set([repositoryId]);
    const watched: Watched = { target, owners, watcher: null!, degraded: false };
    const changed = (_event: string, filename: string | Buffer | null) => {
      const target = watched.target;
      const name = filename?.toString().replaceAll('\\', '/');
      const relative = name && (target.prefix ? target.prefix + '/' + name : name);
      if (relative) {
        if (target.metadata) {
          if (!/^(?:HEAD|index|config|config\.worktree|packed-refs|shallow|commondir|gitdir|refs(?:\/|$)|worktrees(?:\/|$))/.test(relative)) return;
          if (/(?:^|\/)(?:objects|logs)(?:\/|$)/.test(relative) || relative.endsWith('.lock')) return;
          if (/^(?:index|HEAD|config|config\.worktree|refs$|worktrees(?:\/|$))/.test(relative)) for (const owner of owners) this.retries.add(owner);
        } else {
          if (relative === '.git') { for (const owner of owners) this.retries.add(owner); this.options.changed([...owners], true); return; }
          if (relative.split('/').includes('.git')) return;
          // Nested registered repositories own their files unless this Git index also tracks them.
          const absolute = path.join(target.path, relative);
          for (const other of this.watched.values()) {
            if (other.target.metadata || other.target.path === target.path) continue;
            const nested = path.relative(target.path, other.target.path).split(path.sep).join('/');
            if (!nested || nested === '..' || nested.startsWith('../') || path.isAbsolute(nested) || target.tracked?.has('*') || target.tracked?.has(nested)) continue;
            const member = path.relative(other.target.path, absolute);
            if (!member.startsWith('..' + path.sep) && member !== '..' && !path.isAbsolute(member)) return;
          }
          if (this.deferOutput(key, watched, relative)) return;
          if (relative === '.gitignore' || relative.endsWith('/.gitignore')) for (const owner of owners) this.retries.add(owner);
        }
      }
      const refsChanged = target.metadata && (!relative || /(?:^|\/)(?:HEAD|config|config\.worktree|packed-refs|refs|commondir|gitdir)(?:\/|$)/.test(relative) || /^worktrees(?:\/[^/]+)?$/.test(relative));
      this.options.changed([...owners], refsChanged);
    };
    let watcher: fs.FSWatcher;
    try { watcher = fs.watch(target.path, { recursive: target.recursive, persistent: false }, changed); }
    catch {
      watcher = fs.watch(target.path, { persistent: false }, changed);
      watched.degraded = true;
      this.retries.add(repositoryId);
      this.options.diagnostic(repositoryId, '部分目录无法递归监听，将通过低频核对补偿变化。');
    }
    watcher.on('error', () => {
      watcher.close();
      if (this.watched.get(key)?.watcher === watcher) this.watched.delete(key);
      for (const owner of owners) {
        this.retries.add(owner);
        this.options.diagnostic(owner, '文件变化监听已中断，将通过低频核对补偿并重建监听。');
      }
      this.options.changed([...owners]);
    });
    watched.watcher = watcher; this.watched.set(key, watched);
    return !watched.degraded;
  }

  async update(repositoryId: string, locations: string[]): Promise<boolean> {
    const generation = (this.generations.get(repositoryId) ?? 0) + 1;
    this.generations.set(repositoryId, generation);
    this.retries.delete(repositoryId);
    const targets = new Map<string, Target>();
    await Promise.all([...new Set(locations)].slice(0, 128).map(async location => {
      try {
        const root = await fs.promises.realpath(location);
        const observed = await this.inspect(root);
        targets.set(await watchKey('files', root), { path: root, metadata: false, recursive: true, outputs: new Map(), tracked: observed.tracked });
        for (const directory of observed.directories) {
          targets.set(await watchKey('git', directory), { path: directory, metadata: true, recursive: false });
          for (const prefix of ['refs', 'worktrees']) {
            const child = path.join(directory, prefix);
            if ((await fs.promises.stat(child).catch(() => null))?.isDirectory()) targets.set(await watchKey('git', child), { path: child, metadata: true, recursive: true, prefix });
          }
        }
      } catch {
        this.retries.add(repositoryId);
        this.options.diagnostic(repositoryId, '部分代码目录或 Git 管理目录暂不可监听，将通过低频核对补偿。');
      }
    }));
    if (this.closed || this.generations.get(repositoryId) !== generation) return false;
    const previous = this.repositories.get(repositoryId) ?? new Set<string>();
    const retained = new Set<string>();
    let rebound = false;
    for (const [key, target] of targets) {
      try { rebound = this.attach(key, target, repositoryId) || rebound; retained.add(key); }
      catch {
        this.retries.add(repositoryId);
        this.options.diagnostic(repositoryId, '文件变化监听不可用或已达资源上限，将通过低频核对补偿。');
      }
    }
    this.repositories.set(repositoryId, retained);
    for (const key of previous) if (!retained.has(key)) this.release(key, repositoryId);
    return rebound;
  }

  private release(key: string, repositoryId: string) {
    const value = this.watched.get(key);
    if (!value) return;
    value.owners.delete(repositoryId);
    if (!value.owners.size) { value.watcher.close(); this.watched.delete(key); }
  }

  remove(repositoryId: string) {
    this.generations.set(repositoryId, (this.generations.get(repositoryId) ?? 0) + 1);
    for (const key of this.repositories.get(repositoryId) ?? []) this.release(key, repositoryId);
    this.repositories.delete(repositoryId); this.retries.delete(repositoryId);
  }

  close() {
    this.closed = true; this.controller.abort();
    for (const value of this.watched.values()) value.watcher.close();
    this.watched.clear(); this.repositories.clear();
  }
}
