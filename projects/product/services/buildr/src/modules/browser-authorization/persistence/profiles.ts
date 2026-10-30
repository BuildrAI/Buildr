import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { withExclusiveFileLock } from '../../../infrastructure/filesystem/exclusive-file-lock.ts';

export function browserError(code: string, message: string): Error & { code: string; status: number } {
  return Object.assign(new Error(message), { code: 'browser_authorization_' + code, status: 409 });
}
export function profileId(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(value)) throw browserError('profile_invalid', '浏览器配置编号不合法。');
  return value;
}
export function privateDirectory(root: string, directory: string, create = false): void {
  const relative = path.relative(root, directory);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw browserError('path_invalid', '浏览器配置必须位于当前工作空间私有目录。');
  let current = root;
  for (const segment of relative.split(path.sep)) {
    current = path.join(current, segment);
    let stat = fs.lstatSync(current, { throwIfNoEntry: false });
    if (!stat && create) { fs.mkdirSync(current, { mode: 0o700 }); stat = fs.lstatSync(current); }
    if (!stat || !stat.isDirectory() || stat.isSymbolicLink() || process.getuid && stat.uid !== process.getuid()) throw browserError('path_insecure', '配置路径缺失、归属不符或包含符号链接。');
  }
  const stat = fs.lstatSync(directory);
  if (process.platform !== 'win32' && (stat.mode & 0o077)) throw browserError('path_insecure', '浏览器私有目录权限必须为0700。');
}
export function processAlive(pid: unknown): boolean {
  if (!Number.isSafeInteger(pid) || Number(pid) < 1) return false;
  try { process.kill(Number(pid), 0); return true; } catch (error: any) { return error.code !== 'ESRCH'; }
}
export function readPrivate(file: string): any {
  const stat = fs.lstatSync(file, { throwIfNoEntry: false });
  if (!stat) return null;
  if (!stat.isFile() || stat.isSymbolicLink() || process.getuid && stat.uid !== process.getuid() || process.platform !== 'win32' && (stat.mode & 0o077)) throw browserError('state_insecure', '本机浏览器状态文件归属或权限不安全。');
  if (stat.size > 128 * 1024) throw browserError('state_invalid', '本机浏览器状态超过大小限制。');
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { throw browserError('state_invalid', '本机浏览器状态不可解析，保留现场。'); }
}
export type Profile = { id: string; directory: string; generation: string; directoryIdentity: { dev: number; ino: number } };
export class BrowserProfiles {
  readonly root: string;
  readonly state: string;
  constructor(root: string) {
    this.root = fs.realpathSync(root);
    this.state = path.join(this.root, '.buildr/local/browser-authorization');
  }
  private prepare(): void { privateDirectory(this.root, this.state, true); }
  private file(id: string): string { return path.join(this.state, profileId(id) + '.json'); }
  get(id: string): { profile: Profile | null; revision: string } {
    profileId(id);
    if (!fs.existsSync(this.state)) return { profile: null, revision: 'absent' };
    privateDirectory(this.root, this.state);
    const profile = readPrivate(this.file(id)) as Profile | null;
    if (profile && (profile.id !== id || typeof profile.generation !== 'string' || typeof profile.directory !== 'string' || !profile.directory.startsWith('.buildr/local/'))) throw browserError('state_invalid', '本机配置身份不一致，保留现场。');
    if (profile) {
      const directory = path.resolve(this.root, profile.directory);
      privateDirectory(this.root, directory);
      const stat = fs.lstatSync(directory);
      if (profile.directoryIdentity?.dev !== stat.dev || profile.directoryIdentity?.ino !== stat.ino) throw browserError('directory_changed', '浏览器数据目录已被替换，保留当前内容并重新核对归属。');
    }
    return { profile, revision: profile ? 'sha256-' + crypto.createHash('sha256').update(JSON.stringify(profile)).digest('hex') : 'absent' };
  }
  list() {
    if (!fs.existsSync(this.state)) return { profiles: [] };
    privateDirectory(this.root, this.state);
    return { profiles: fs.readdirSync(this.state).filter(name => /^[a-zA-Z][a-zA-Z0-9_-]{0,63}\.json$/.test(name)).map(name => {
      const id = name.slice(0, -5);
      try { return { id, ...this.get(id), diagnostic: null }; }
      catch { return { id, profile: null, revision: 'unknown', diagnostic: { code: 'browser_authorization_profile_unreadable', message: '该配置不可读，保留现场；其他配置仍可独立使用。' } }; }
    }) };
  }
  lock<T>(action: () => T, id = 'registry'): T {
    this.prepare();
    const file = path.join(this.state, '.' + profileId(id) + '.lock');
    const assertSafe = () => { privateDirectory(this.root, this.state); if (fs.existsSync(file)) readPrivate(file); };
    return withExclusiveFileLock(file, this.state, action, { assertSafe, timeoutMs: 2000 });
  }
  create(id: string, expected: string, directory?: string) {
    return this.lock(() => {
      const observed = this.get(id);
      if (observed.revision !== expected || expected !== 'absent') throw browserError('revision_conflict', '配置已存在或观察版本变化。');
      const relative = directory ?? `.buildr/local/browser-authorization/data/${id}`;
      if (!relative.startsWith('.buildr/local/') || relative.includes('\\') || relative.split('/').some(part => !part || part === '..' || part === '.')) throw browserError('path_invalid', '仅可接管当前工作空间的私有相对目录。');
      const absolute = path.resolve(this.root, relative);
      // Management metadata and a profile must never contain one another.
      if (absolute === this.state || this.state.startsWith(absolute + path.sep) || absolute.startsWith(this.state + path.sep) && !absolute.startsWith(path.join(this.state, 'data') + path.sep)) throw browserError('path_invalid', '浏览器数据不得覆盖管理状态。');
      for (const item of this.list().profiles) {
        if (item.diagnostic) throw browserError('state_invalid', '存在不可读配置，无法证明新目录归属唯一；保留现场。');
        if (item.profile && (absolute === path.resolve(this.root, item.profile.directory) || absolute.startsWith(path.resolve(this.root, item.profile.directory) + path.sep) || path.resolve(this.root, item.profile.directory).startsWith(absolute + path.sep))) throw browserError('profile_owned', '该目录已被另一配置引用。');
      }
      if (directory === undefined && fs.existsSync(absolute)) throw browserError('profile_exists', '数据目录已有内容，必须显式接管，不能当作新配置。');
      privateDirectory(this.root, absolute, directory === undefined);
      const stat = fs.lstatSync(absolute);
      const value: Profile = { id, directory: relative, generation: crypto.randomUUID(), directoryIdentity: { dev: stat.dev, ino: stat.ino } };
      fs.writeFileSync(this.file(id), JSON.stringify(value) + '\n', { mode: 0o600, flag: 'wx' });
      return this.get(id);
    });
  }
  runtimeFile(id: string) { return path.join(this.state, profileId(id) + '.runtime'); }
  reset(id: string, expected: string) {
    return this.lock(() => {
      const observed = this.get(id);
      if (!observed.profile || observed.revision !== expected) throw browserError('revision_conflict', '配置不存在或观察版本已变化。');
      const runtime = readPrivate(this.runtimeFile(id));
      if (runtime && processAlive(runtime.pid)) throw browserError('in_use', '共享浏览器仍在运行，不能重置整个配置。');
      const directory = path.resolve(this.root, observed.profile.directory);
      if (process.platform === 'win32') throw browserError('reset_unverified', '当前Windows外部浏览器占用证明尚未实现，保留配置，不执行重置。');
      for (const name of ['SingletonLock', 'SingletonCookie', 'SingletonSocket', 'lock', '.parentlock']) if (fs.lstatSync(path.join(directory, name), { throwIfNoEntry: false })) throw browserError('in_use', '配置仍有外部占用线索，不能删除锁或重置。');
      // The version was re-read under the same lock used by runtime acquisition.
      fs.rmSync(directory, { recursive: true }); fs.mkdirSync(directory, { mode: 0o700 });
      const stat = fs.lstatSync(directory);
      const value = { ...observed.profile, generation: crypto.randomUUID(), directoryIdentity: { dev: stat.dev, ino: stat.ino } };
      const temp = this.file(id) + '.' + crypto.randomUUID();
      fs.writeFileSync(temp, JSON.stringify(value) + '\n', { mode: 0o600, flag: 'wx' }); fs.renameSync(temp, this.file(id));
      return this.get(id);
    }, id);
  }
}
