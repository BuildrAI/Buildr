import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

export type SharedRuntimeNodeOptions = {
  fallbackDataRoot?: string;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  hostNode?: string;
};

type SharedLockHandle = {
  release: () => void;
};

function runtimeNodeName(platform: NodeJS.Platform = process.platform): string {
  return platform === 'win32' ? 'node.exe' : 'node';
}

function isTestNodeIsolation(env: NodeJS.ProcessEnv): boolean {
  return env.BUILDR_TEST_STATE_REQUIRED === '1' || Boolean(env.NODE_TEST_CONTEXT);
}

function isPidAlive(pid: number): boolean {
  if (!Number.isSafeInteger(pid) || pid < 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function computeFileDigest(filePath: string): string {
  const hash = crypto.createHash('sha256');
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  const fd = fs.openSync(filePath, 'r');
  try {
    let read = 0;
    while ((read = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) {
      hash.update(buffer.subarray(0, read));
    }
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}

function assertSafeNodeStat(stat: fs.Stats | undefined, platform: NodeJS.Platform): asserts stat is fs.Stats {
  if (
    !stat
    || !stat.isFile()
    || stat.isSymbolicLink()
    || stat.nlink !== 1
    || (process.getuid && stat.uid !== process.getuid())
    || (stat.mode & 0o222) !== 0
    || (platform !== 'win32' && (stat.mode & 0o100) === 0)
  ) {
    throw Object.assign(new Error('Shared Buildr Node runtime binary is unsafe or tampered.'), {
      code: 'shared_runtime_node_unsafe',
    });
  }
}

function readSharedNodeManifest(sharedRoot: string): { schemaVersion: 1; nodeDigest: string } | null {
  const manifestPath = path.join(sharedRoot, 'node.json');
  const info = fs.lstatSync(manifestPath, { throwIfNoEntry: false });
  if (!info) return null;
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || (process.getuid && info.uid !== process.getuid())) {
    throw Object.assign(new Error('Shared Buildr Node manifest is unsafe.'), {
      code: 'shared_runtime_node_unsafe',
    });
  }
  let parsed: { schemaVersion?: unknown; nodeDigest?: unknown };
  try {
    parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as { schemaVersion?: unknown; nodeDigest?: unknown };
  } catch {
    throw Object.assign(new Error('Shared Buildr Node manifest is corrupted.'), {
      code: 'shared_runtime_node_unsafe',
    });
  }
  if (parsed?.schemaVersion !== 1 || typeof parsed.nodeDigest !== 'string' || !/^[a-f0-9]{64}$/.test(parsed.nodeDigest)) {
    throw Object.assign(new Error('Shared Buildr Node manifest is invalid.'), {
      code: 'shared_runtime_node_unsafe',
    });
  }
  return { schemaVersion: 1, nodeDigest: parsed.nodeDigest };
}

function writeSharedNodeManifest(sharedRoot: string, nodeDigest: string): void {
  const manifestPath = path.join(sharedRoot, 'node.json');
  const temporary = `${manifestPath}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify({ schemaVersion: 1, nodeDigest })}\n`, { mode: 0o600, flag: 'wx' });
    fs.renameSync(temporary, manifestPath);
  } finally {
    if (fs.existsSync(temporary)) fs.rmSync(temporary, { force: true });
  }
}

function readSharedLockOwner(ownerFile: string): { pid: number; nonce: string } | null {
  try {
    const info = fs.lstatSync(ownerFile, { throwIfNoEntry: false });
    if (!info || !info.isFile() || info.isSymbolicLink() || info.nlink !== 1) return null;
    const parsed = JSON.parse(fs.readFileSync(ownerFile, 'utf8')) as { pid?: unknown; nonce?: unknown };
    if (!Number.isSafeInteger(parsed.pid) || (parsed.pid as number) < 1 || typeof parsed.nonce !== 'string') return null;
    return { pid: parsed.pid as number, nonce: parsed.nonce };
  } catch {
    return null;
  }
}

function releaseSharedNodeLock(lockDir: string, ownerFile: string, nonce: string): void {
  const current = readSharedLockOwner(ownerFile);
  if (current?.nonce !== nonce) return;
  const retired = `${lockDir}.released-${nonce}`;
  try {
    fs.renameSync(lockDir, retired);
    fs.rmSync(retired, { recursive: true, force: true });
  } catch { /* Best-effort lock release. */ }
}

function acquireSharedNodeLock(sharedRoot: string): SharedLockHandle {
  fs.mkdirSync(sharedRoot, { recursive: true, mode: 0o700 });
  const dirInfo = fs.lstatSync(sharedRoot);
  if (!dirInfo.isDirectory() || dirInfo.isSymbolicLink()) {
    throw Object.assign(new Error(`Shared Buildr Node directory is unsafe: ${sharedRoot}`), {
      code: 'shared_runtime_node_unsafe',
    });
  }
  try { fs.chmodSync(sharedRoot, 0o700); } catch { /* Ignore chmod issues on unsupported filesystems. */ }
  const lockDir = path.join(sharedRoot, '.lock');
  const ownerFile = path.join(lockDir, 'owner.json');
  const nonce = crypto.randomUUID();
  const stage = path.join(sharedRoot, `.lock-stage-${nonce}`);
  fs.mkdirSync(stage, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(stage, 'owner.json'), `${JSON.stringify({ pid: process.pid, nonce, createdAtMs: Date.now() })}\n`, { mode: 0o600, flag: 'wx' });
  const deadline = Date.now() + 15_000;
  const sleeper = new Int32Array(new SharedArrayBuffer(4));
  try {
    for (;;) {
      try {
        fs.renameSync(stage, lockDir);
        break;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== 'ENOTEMPTY' && code !== 'EEXIST' && code !== 'EPERM' && code !== 'EACCES') throw error;
        if (!fs.existsSync(lockDir)) continue;
        const prior = readSharedLockOwner(ownerFile);
        if (!prior || !isPidAlive(prior.pid)) {
          const reclaim = `${lockDir}.reclaim`;
          let claimedReclaim = false;
          try {
            fs.mkdirSync(reclaim, { mode: 0o700 });
            claimedReclaim = true;
            const current = readSharedLockOwner(ownerFile);
            if ((!current && !prior) || (current && prior && current.nonce === prior.nonce && !isPidAlive(current.pid)) || (!current && prior && !isPidAlive(prior.pid))) {
              const retired = `${lockDir}.retired-${crypto.randomUUID()}`;
              try {
                fs.renameSync(lockDir, retired);
                fs.rmSync(retired, { recursive: true, force: true });
              } catch { /* Another process reclaimed it concurrently. */ }
            }
          } catch { /* Reclaim in progress by another process. */ }
          finally {
            if (claimedReclaim && fs.existsSync(reclaim)) fs.rmSync(reclaim, { recursive: true, force: true });
          }
        }
        if (Date.now() >= deadline) {
          throw Object.assign(new Error(`Timed out waiting for shared Node lock in ${sharedRoot}.`), {
            code: 'shared_runtime_node_locked',
          });
        }
        Atomics.wait(sleeper, 0, 0, 15);
      }
    }
  } finally {
    if (fs.existsSync(stage)) fs.rmSync(stage, { recursive: true, force: true });
  }
  return { release: () => releaseSharedNodeLock(lockDir, ownerFile, nonce) };
}

function cleanupRetiredSharedNodes(sharedRoot: string): void {
  try {
    for (const name of fs.readdirSync(sharedRoot)) {
      if (!name.startsWith('.retired-')) continue;
      try { fs.rmSync(path.join(sharedRoot, name), { force: true }); } catch { /* Still held by an active process. */ }
    }
  } catch { /* Ignore cleanup failure. */ }
}

/** Resolve the logical host Node executable when running under the shared runtime path. */
export function resolveHostNodeExecutable(env: NodeJS.ProcessEnv = process.env): string {
  const candidate = env.BUILDR_HOST_NODE?.trim();
  const expectedVersion = env.BUILDR_HOST_NODE_VERSION?.trim();
  if (candidate && path.isAbsolute(candidate) && (!expectedVersion || expectedVersion === process.versions.node)) {
    try {
      const stat = fs.statSync(candidate, { throwIfNoEntry: false });
      if (stat?.isFile()) return path.resolve(candidate);
    } catch { /* Fall back to process.execPath when host Node cannot be read. */ }
  }
  return process.execPath;
}

/** Resolve the machine-wide fixed runtime directory shared by all Buildr and Harness background processes. */
export function sharedRuntimeNodeRoot(options: Pick<SharedRuntimeNodeOptions, 'fallbackDataRoot' | 'env' | 'platform'> = {}): string {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const explicit = env.BUILDR_SHARED_NODE_ROOT?.trim();
  const isAbs = explicit ? (platform === 'win32' ? path.win32.isAbsolute(explicit) : path.isAbsolute(explicit)) : false;
  if (explicit && isAbs) {
    return platform === 'win32' ? path.win32.resolve(explicit) : path.resolve(explicit);
  }
  if (isTestNodeIsolation(env)) {
    if (options.fallbackDataRoot) {
      return platform === 'win32'
        ? path.win32.join(path.win32.resolve(options.fallbackDataRoot), 'runtime')
        : path.join(path.resolve(options.fallbackDataRoot), 'runtime');
    }
    const testHome = env.HOME?.trim() || os.homedir();
    if (platform === 'darwin') return path.join(testHome, 'Library', 'Application Support', 'Buildr', 'runtime');
    if (platform === 'win32') return path.win32.join(env.LOCALAPPDATA || path.win32.join(testHome, 'AppData', 'Local'), 'Buildr', 'runtime');
    return path.posix.join(env.XDG_STATE_HOME || path.posix.join(testHome, '.local', 'state'), 'buildr', 'runtime');
  }
  const hostHome = env.BUILDR_HOST_HOME?.trim() || os.homedir();
  if (platform === 'darwin') return path.join(hostHome, 'Library', 'Application Support', 'Buildr', 'runtime');
  if (platform === 'win32') return path.win32.join(env.LOCALAPPDATA || path.win32.join(hostHome, 'AppData', 'Local'), 'Buildr', 'runtime');
  return path.posix.join(env.XDG_STATE_HOME || path.posix.join(hostHome, '.local', 'state'), 'buildr', 'runtime');
}

/** Resolve the machine-wide fixed Node binary path without version or digest segments. */
export function sharedRuntimeNodePath(options: Pick<SharedRuntimeNodeOptions, 'fallbackDataRoot' | 'env' | 'platform'> = {}): string {
  const platform = options.platform ?? process.platform;
  const root = sharedRuntimeNodeRoot(options);
  const name = runtimeNodeName(platform);
  return platform === 'win32' ? path.win32.join(root, name) : path.join(root, name);
}

/** Materialize or atomically upgrade the machine-wide fixed Node binary and fail closed on tampering. */
export function ensureSharedRuntimeNode(
  sourceNode: string,
  options: SharedRuntimeNodeOptions = {},
): { executable: string; hostNode: string } {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const hostNode = path.resolve(options.hostNode ?? resolveHostNodeExecutable(env));
  const resolvedSource = path.resolve(sourceNode);
  const sourceStat = fs.lstatSync(resolvedSource);
  if (!sourceStat.isFile() || sourceStat.isSymbolicLink()) {
    throw Object.assign(new Error(`Invalid source Node runtime binary: ${resolvedSource}`), {
      code: 'shared_runtime_node_source_invalid',
    });
  }
  const targetPath = sharedRuntimeNodePath({ fallbackDataRoot: options.fallbackDataRoot, env, platform });
  const sharedRoot = path.dirname(targetPath);
  const nodeDigest = computeFileDigest(resolvedSource);
  const lock = acquireSharedNodeLock(sharedRoot);
  try {
    cleanupRetiredSharedNodes(sharedRoot);
    const existingStat = fs.lstatSync(targetPath, { throwIfNoEntry: false });
    if (existingStat) {
      assertSafeNodeStat(existingStat, platform);
      const manifest = readSharedNodeManifest(sharedRoot);
      const actualDigest = computeFileDigest(targetPath);
      if (manifest && actualDigest !== manifest.nodeDigest) {
        throw Object.assign(new Error('Shared Buildr Node runtime binary digest mismatch.'), {
          code: 'shared_runtime_node_unsafe',
        });
      }
      if (actualDigest === nodeDigest) {
        if (!manifest) writeSharedNodeManifest(sharedRoot, nodeDigest);
        const now = new Date();
        try { fs.utimesSync(sharedRoot, now, now); } catch { /* Ignore mtime refresh error. */ }
        return { executable: targetPath, hostNode };
      }
      if (!manifest) {
        throw Object.assign(new Error('Shared Buildr Node runtime binary is missing verified manifest.'), {
          code: 'shared_runtime_node_unsafe',
        });
      }
    }
    const stage = path.join(sharedRoot, `.stage-${crypto.randomUUID()}`);
    fs.mkdirSync(stage, { recursive: true, mode: 0o700 });
    const stagedNode = path.join(stage, runtimeNodeName(platform));
    try {
      fs.copyFileSync(resolvedSource, stagedNode, fs.constants.COPYFILE_FICLONE | fs.constants.COPYFILE_EXCL);
      fs.chmodSync(stagedNode, 0o500);
      if (computeFileDigest(stagedNode) !== nodeDigest) {
        throw Object.assign(new Error('Staged shared Buildr Node binary digest mismatch.'), {
          code: 'shared_runtime_node_unsafe',
        });
      }
      try {
        fs.renameSync(stagedNode, targetPath);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (platform === 'win32' && ['EPERM', 'EBUSY', 'EACCES'].includes(code ?? '') && fs.existsSync(targetPath)) {
          const retired = path.join(sharedRoot, `.retired-${crypto.randomUUID()}.exe`);
          try {
            fs.renameSync(targetPath, retired);
            fs.renameSync(stagedNode, targetPath);
            cleanupRetiredSharedNodes(sharedRoot);
          } catch {
            return { executable: resolvedSource, hostNode };
          }
        } else {
          throw error;
        }
      }
      assertSafeNodeStat(fs.lstatSync(targetPath, { throwIfNoEntry: false }), platform);
      if (computeFileDigest(targetPath) !== nodeDigest) {
        throw Object.assign(new Error('Published shared Buildr Node binary digest mismatch.'), {
          code: 'shared_runtime_node_unsafe',
        });
      }
      writeSharedNodeManifest(sharedRoot, nodeDigest);
      return { executable: targetPath, hostNode };
    } finally {
      if (fs.existsSync(stage)) fs.rmSync(stage, { recursive: true, force: true });
    }
  } finally {
    lock.release();
  }
}

/** Build child launch environment preserving the logical host Node identity and adjacent PATH entry. */
export function sharedRuntimeNodeLaunchEnv(
  baseEnv: NodeJS.ProcessEnv,
  hostNode: string,
  hostVersion: string = process.versions.node,
): NodeJS.ProcessEnv {
  const resolvedHostNode = path.resolve(hostNode);
  const hostBin = path.dirname(resolvedHostNode);
  const currentEntries = (baseEnv.PATH || '').split(path.delimiter).filter(Boolean);
  const nextPath = currentEntries.includes(hostBin)
    ? baseEnv.PATH
    : [hostBin, ...currentEntries].join(path.delimiter);
  return {
    ...baseEnv,
    BUILDR_HOST_NODE: resolvedHostNode,
    BUILDR_HOST_NODE_VERSION: hostVersion,
    ...(nextPath ? { PATH: nextPath } : {}),
  };
}
