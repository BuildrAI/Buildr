import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';

function unavailable(): Error { return Object.assign(new Error('来源文件无法在授权根内确认。'), { code: 'readonly_root_unconfirmed' }); }
function identity(left: fs.Stats, right: fs.Stats): boolean { return Number.isSafeInteger(left.ino) && left.ino > 0 && Number.isSafeInteger(right.ino) && left.dev === right.dev && left.ino === right.ino; }
/** Kernel descriptor paths, never a second lookup of the caller's mutable file path. */
function descriptorPaths(rootFd: number, leafFd: number): Map<number, string> {
  const descriptors = [rootFd, leafFd];
  if (process.platform === 'linux') {
    return new Map(descriptors.map(fd => {
      const opened = fs.fstatSync(fd); const kernel = fs.statSync(`/proc/self/fd/${fd}`);
      if (!identity(opened, kernel)) throw unavailable();
      return [fd, fs.readlinkSync(`/proc/self/fd/${fd}`)];
    }));
  }
  if (process.platform !== 'darwin') throw unavailable();
  // Darwin's libproc-based system lsof reports the current process's held vnode paths.
  // No shell/PATH, DNS, port lookup, other descriptors, recursive scan or fallback.
  const bytes = execFileSync('/usr/sbin/lsof', ['-n', '-P', '-a', '-p', String(process.pid), '-d', descriptors.join(','), '-F0fn'], { timeout: 250, maxBuffer: 64 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  const fields = new TextDecoder('utf-8', { fatal: true }).decode(bytes).split('\0');
  const paths = new Map<number, string>(); const seen = new Set<number>(); let owner: number | null = null; let descriptor: number | null = null;
  for (const raw of fields) {
    // lsof's record separator is a single LF outside NUL fields; never trim paths.
    const field = raw.startsWith('\n') ? raw.slice(1) : raw;
    if (/^p\d+$/.test(field)) { if (owner !== null) throw unavailable(); owner = Number(field.slice(1)); descriptor = null; }
    else if (/^f\d+$/.test(field)) { descriptor = Number(field.slice(1)); if (owner !== process.pid || !descriptors.includes(descriptor) || seen.has(descriptor)) throw unavailable(); seen.add(descriptor); }
    else if (field.startsWith('n')) {
      if (owner !== process.pid || descriptor === null || paths.has(descriptor)) throw unavailable();
      const actual = field.slice(1); if (!path.isAbsolute(actual) || actual.includes('\0')) throw unavailable();
      paths.set(descriptor, actual);
    } else if (field) throw unavailable();
  }
  if (owner !== process.pid || paths.size !== 2 || seen.size !== 2) throw unavailable();
  return paths;
}
function attest(rootFd: number, leafFd: number, canonicalRoot: string, relative: string, rootIdentity: fs.Stats, leafIdentity: fs.Stats): void {
  if (!identity(fs.fstatSync(rootFd), rootIdentity) || !identity(fs.fstatSync(leafFd), leafIdentity)) throw unavailable();
  const paths = descriptorPaths(rootFd, leafFd);
  if (paths.get(rootFd) !== canonicalRoot || paths.get(leafFd) !== path.join(canonicalRoot, ...relative.split('/'))) throw unavailable();
}
/**
 * Strict source reads hold root and leaf descriptors. Kernel ownership is proven
 * before any file-byte read and again before returning bytes. The caller's path
 * is never reopened; more lstat checks are not claimed to be atomic traversal.
 * Unsupported kernel lookup is a local failure, never a legacy-policy fallback.
 */
export function readVerifiedReadonlyBytes(root: string, relative: string, maxBytes: number): Buffer {
  if (!['darwin', 'linux'].includes(process.platform) || !fs.constants.O_DIRECTORY || !Number.isSafeInteger(maxBytes) || maxBytes < 1) throw unavailable();
  if (!relative || path.isAbsolute(relative) || relative.includes('\\') || relative.includes('\0') || relative.split('/').some(part => !part || part === '.' || part === '..')) throw unavailable();
  let rootFd: number | null = null; let leafFd: number | null = null;
  try {
    // Keep the already observed canonical name, never rebase to a swapped symlink.
    const canonicalRoot = path.resolve(root); const namedRoot = fs.lstatSync(canonicalRoot);
    if (!namedRoot.isDirectory() || namedRoot.isSymbolicLink()) throw unavailable();
    rootFd = fs.openSync(canonicalRoot, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    const openedRoot = fs.fstatSync(rootFd);
    if (!openedRoot.isDirectory() || !identity(openedRoot, namedRoot)) throw unavailable();
    leafFd = fs.openSync(path.join(canonicalRoot, ...relative.split('/')), fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    const before = fs.fstatSync(leafFd);
    if (!before.isFile() || before.size > maxBytes) throw unavailable();
    attest(rootFd, leafFd, canonicalRoot, relative, openedRoot, before);
    const buffer = Buffer.alloc(maxBytes + 1); let length = 0;
    while (length < buffer.length) { const count = fs.readSync(leafFd, buffer, length, buffer.length - length, null); if (!count) break; length += count; }
    const after = fs.fstatSync(leafFd);
    if (length > maxBytes || !after.isFile() || after.size > maxBytes || !identity(before, after) || before.size !== after.size || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs) throw unavailable();
    attest(rootFd, leafFd, canonicalRoot, relative, openedRoot, before);
    return buffer.subarray(0, length);
  } catch { throw unavailable(); }
  finally { if (leafFd !== null) fs.closeSync(leafFd); if (rootFd !== null) fs.closeSync(rootFd); }
}
