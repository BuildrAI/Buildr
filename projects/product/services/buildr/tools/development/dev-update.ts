import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {acquireExclusiveFileLock, releaseExclusiveFileLock} from '../../src/infrastructure/filesystem/exclusive-file-lock.ts';

export function developmentUpdatePaths(serviceRoot: string) {
  const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {cwd: serviceRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();
  return {lock: path.join(common, 'buildr/development-update.lock'), activation: path.join(common, 'buildr/self-bootstrap-direct.lock')};
}

/** Never adopt a changed declaration with an old dependency installation. This
 * check does not run npm or mutate a dependency tree under an available host. */
export function assertDevelopmentDependencies(roots: string[]) {
  const same = (left: unknown, right: unknown) => JSON.stringify(Object.entries((left ?? {}) as object).sort()) === JSON.stringify(Object.entries((right ?? {}) as object).sort());
  for (const root of roots) {
    const metadata = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
    for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) {
      if (!same(metadata[field], lock.packages?.['']?.[field])) throw new Error(`development_dependencies_unprepared: ${path.basename(root)} declarations differ from its lockfile; prepare dependencies before adopting.`);
    }
    for (const [relative, value] of Object.entries(lock.packages ?? {}) as [string, any][]) {
      if (!relative.startsWith('node_modules/') || value.link || !value.version) continue;
      const filename = path.join(root, relative, 'package.json');
      if (!fs.existsSync(filename) && value.optional) continue;
      if (!fs.existsSync(filename) || JSON.parse(fs.readFileSync(filename, 'utf8')).version !== value.version) {
        throw new Error(`development_dependencies_unprepared: ${path.basename(root)}/${relative}; current host retained, run project dependency preparation.`);
      }
    }
  }
}

/** Both the live supervisor and the formal installer serialize their complete
 * prepare/adopt window, not just the package-directory rename. */
export async function withDevelopmentUpdate<T>(serviceRoot: string, operation: () => Promise<T>, {
  formal = false, timeoutMs = 180_000, stopped = () => false,
}: {formal?: boolean; timeoutMs?: number; stopped?: () => boolean} = {}): Promise<T> {
  const paths = developmentUpdatePaths(serviceRoot);
  const deadline = Date.now() + timeoutMs;
  let lock: any;
  for (;;) {
    if (stopped()) throw new Error('development_update_cancelled');
    if (!formal && fs.existsSync(paths.activation)) throw new Error('development_activation_in_progress');
    try { lock = acquireExclusiveFileLock(paths.lock, paths.lock, {timeoutMs: 0}); break; }
    catch (error: any) {
      if (error.code !== 'buildr_exclusive_file_lock_timeout' || Date.now() >= deadline) throw error;
      await delay(100);
    }
  }
  try {
    if (!formal && fs.existsSync(paths.activation)) throw new Error('development_activation_in_progress');
    return await operation();
  } finally {
    if (!releaseExclusiveFileLock(lock)) throw new Error('development_update_lock_ownership_lost');
  }
}

/** One serial writer, latest-only batches. A save during preparation supersedes
 * the candidate before adoption and schedules one more batch, not N restarts. */
export class DevelopmentUpdates {
  private sequence = 0;
  private changes = new Set<string>();
  private timer: NodeJS.Timeout | undefined;
  private work: Promise<void> | undefined;
  private closed = false;
  private readonly update: (changes: Set<string>, current: () => boolean) => Promise<void>;
  private readonly failed: (error: unknown) => void;
  private readonly debounceMs: number;
  constructor(update: (changes: Set<string>, current: () => boolean) => Promise<void>, failed: (error: unknown) => void, debounceMs = 500) {
    this.update = update; this.failed = failed; this.debounceMs = debounceMs;
  }
  request(kind: string) {
    if (this.closed) return;
    this.sequence++; this.changes.add(kind);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.timer = undefined; void this.flush(); }, this.debounceMs);
  }
  async flush(): Promise<void> {
    if (this.closed || this.work || !this.changes.size) return;
    const changes = this.changes; this.changes = new Set();
    const sequence = this.sequence;
    this.work = this.update(changes, () => !this.closed && sequence === this.sequence).catch(this.failed);
    try { await this.work; } finally {
      this.work = undefined;
      if (!this.closed && this.changes.size && !this.timer) await this.flush();
    }
  }
  async close() {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    this.changes.clear();
    await this.work;
  }
}

export async function replaceDevelopmentHost<T>(candidate: T, previous: T | undefined, {
  check, stop, start, report,
}: {check(value: T): Promise<void>; stop(): Promise<void>; start(value: T): Promise<void>; report(error: unknown, restored: boolean): void}) {
  await check(candidate); // A bad edit never stops the current host.
  await stop();
  try { await start(candidate); return candidate; }
  catch (failure) {
    let restored = false;
    try { await stop(); if (previous) { await start(previous); restored = true; } }
    catch (recovery) { report(recovery, false); }
    report(failure, restored);
    if (!restored) throw failure;
    return previous!;
  }
}
