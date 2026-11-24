import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash, randomUUID, type Hash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import type { AgentRuntimeUnit } from '../execution-contracts.ts';
import { cloneFile } from '../storage/clone-file.ts';
import { safeStoragePath } from '../storage/files.ts';
import { materializeRuntimeObject } from '../storage/runtime-objects.ts';
import { AGENT_EXECUTION_CONTRACTS } from '../execution-contracts.ts';
import { AgentServiceError } from '../domain/agent-state.ts';
import { claimStorage, controlRoot, live, privateDirectory, readPackageRecord, readPrivate, writePrivate } from './ownership.ts';

function runtimeNodeName(platform: NodeJS.Platform = process.platform): string {
  return platform === 'win32' ? 'node.exe' : 'node';
}

function isTestNodeIsolation(env: NodeJS.ProcessEnv): boolean {
  return env.BUILDR_TEST_STATE_REQUIRED === '1' || Boolean(env.NODE_TEST_CONTEXT);
}

/** Directory retaining legacy per-digest Node binaries for safe cleanup compatibility. */
export function runtimeNodesRoot(dataRoot: string): string {
  return path.join(controlRoot(dataRoot), 'node-runtimes');
}

/** Machine-wide fixed directory housing the single shared Node binary without version or hash segments. */
export function sharedRuntimeNodeRoot(
  dataRoot?: string,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string {
  const explicit = env.BUILDR_SHARED_NODE_ROOT?.trim();
  const isAbs = explicit ? (platform === 'win32' ? path.win32.isAbsolute(explicit) : path.isAbsolute(explicit)) : false;
  if (explicit && isAbs) {
    return platform === 'win32' ? path.win32.resolve(explicit) : path.resolve(explicit);
  }
  if (isTestNodeIsolation(env)) {
    if (dataRoot) {
      return platform === 'win32'
        ? path.win32.join(path.win32.resolve(dataRoot), 'runtime')
        : path.join(path.resolve(dataRoot), 'runtime');
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

/** Machine-wide fixed Node binary path shared across Buildr and Harness background services. */
export function sharedRuntimeNodePath(
  dataRoot?: string,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string {
  const root = sharedRuntimeNodeRoot(dataRoot, env, platform);
  const name = runtimeNodeName(platform);
  return platform === 'win32' ? path.win32.join(root, name) : path.join(root, name);
}

/** Stable executable path resolving to the shared machine-wide fixed Node binary. */
export function stableRuntimeNodePath(
  dataRoot: string,
  nodeDigest?: string,
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string {
  if (nodeDigest !== undefined && !/^[a-f0-9]{64}$/.test(nodeDigest)) {
    throw new AgentServiceError('agent_runtime_identity_invalid', '执行运行单元Node摘要无效。', 409);
  }
  return sharedRuntimeNodePath(dataRoot, env, platform);
}


function files(root: string, skipNpmShims=false): string[] {
  const result: string[] = [];
  const visit = (directory: string) => {
    for (const name of fs.readdirSync(directory).sort()) {
      // npm creates executable shims during installation. Native programs are
      // explicitly managed/bound, never dispatched through this ambient PATH.
      if(skipNpmShims&&name==='.bin')continue;
      const file = path.join(directory, name), info = fs.lstatSync(file);
      if (info.isSymbolicLink()) throw new AgentServiceError('agent_runtime_symlink', '执行运行单元不能包含未物化的链接。', 409);
      if (info.isDirectory()) visit(file);
      else if (info.isFile()) result.push(path.relative(root, file));
      else throw new AgentServiceError('agent_runtime_file_invalid', '执行运行单元包含无效文件。', 409);
    }
  }; visit(root); return result;
}
function updateFileHash(digest: Hash, file: string, buffer: Buffer): void {
  const fd = fs.openSync(file, 'r');
  try {
    let count: number;
    while ((count = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) digest.update(buffer.subarray(0, count));
  } finally { fs.closeSync(fd); }
}
function digestTree(root: string, names: string[], node: string, entry: string): string {
  // One bounded buffer for the entire tree, including the retained Node binary.
  // Every byte is still read on every validation; no digest cache weakens tamper detection.
  const buffer = Buffer.allocUnsafe(1024 * 1024), nodeDigest = createHash('sha256');
  updateFileHash(nodeDigest, node, buffer);
  const digest = createHash('sha256'); digest.update(JSON.stringify({ entry, node: nodeDigest.digest('hex') }));
  for (const name of names) {
    const file = path.join(root, name); digest.update(JSON.stringify([name, fs.statSync(file).mode & 0o111]));
    updateFileHash(digest, file, buffer);
  }
  return digest.digest('hex');
}
function runtimeFileNames(packageRoot: string): string[] {
  const build = path.join(packageRoot, 'build');
  if (!fs.existsSync(build)) throw new AgentServiceError('agent_runtime_entry_missing', '执行运行单元尚未构建。', 409);
  const names = files(build).map(name => path.join('build', name));
  if (fs.existsSync(path.join(packageRoot, 'node_modules'))) names.push(...files(path.join(packageRoot, 'node_modules'),true).map(name => path.join('node_modules', name)));
  names.push('package.json');
  return names.sort();
}
/** Pure content digest of an already prepared private package; no materialization or contract validation. */
export function computeAgentRuntimeDigest(input: { packageRoot: string; entry?: string; node?: string }): string {
  const packageRoot = fs.realpathSync(input.packageRoot);
  const entry = input.entry ?? 'build/process/entry.js';
  const node = fs.realpathSync(input.node ?? process.execPath);
  if (!entry.startsWith('build/') || entry.includes('..') || !fs.statSync(path.join(packageRoot, entry), { throwIfNoEntry: false })?.isFile()) throw new AgentServiceError('agent_runtime_entry_missing', '执行运行单元尚未构建。', 409);
  return digestTree(packageRoot, runtimeFileNames(packageRoot), node, entry);
}
function computeNodeDigest(file: string): string {
  const buffer = Buffer.allocUnsafe(1024 * 1024), digest = createHash('sha256');
  updateFileHash(digest, file, buffer);
  return digest.digest('hex');
}

function assertSafeNodeStat(stat: fs.Stats | undefined): asserts stat is fs.Stats {
  if (
    !stat ||
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.nlink !== 1 ||
    (process.getuid && stat.uid !== process.getuid()) ||
    (stat.mode & 0o222) !== 0 ||
    (process.platform !== 'win32' && (stat.mode & 0o100) === 0)
  ) {
    throw new AgentServiceError('agent_runtime_changed', '固定Node运行文件已变化或来源不安全。', 409);
  }
}

function verifyNodeBinaryFile(nodePath: string, expectedDigest: string): boolean {
  const stat = fs.lstatSync(nodePath, { throwIfNoEntry: false });
  if (!stat) return false;
  assertSafeNodeStat(stat);
  if (computeNodeDigest(nodePath) !== expectedDigest) {
    throw new AgentServiceError('agent_runtime_changed', '固定Node运行文件已变化或来源不安全。', 409);
  }
  return true;
}

function readSharedNodeManifest(sharedRoot: string): { schemaVersion: 1; nodeDigest: string } | undefined {
  const manifestPath = path.join(sharedRoot, 'node.json');
  const info = fs.lstatSync(manifestPath, { throwIfNoEntry: false });
  if (!info) return undefined;
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || (process.getuid && info.uid !== process.getuid())) {
    throw new AgentServiceError('agent_runtime_changed', '固定Node清单来源不安全。', 409);
  }
  let parsed: { schemaVersion?: unknown; nodeDigest?: unknown };
  try {
    parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as { schemaVersion?: unknown; nodeDigest?: unknown };
  } catch {
    throw new AgentServiceError('agent_runtime_changed', '固定Node清单已损坏。', 409);
  }
  if (parsed?.schemaVersion !== 1 || typeof parsed.nodeDigest !== 'string' || !/^[a-f0-9]{64}$/.test(parsed.nodeDigest)) {
    throw new AgentServiceError('agent_runtime_changed', '固定Node清单无效。', 409);
  }
  return { schemaVersion: 1, nodeDigest: parsed.nodeDigest };
}

function writeSharedNodeManifest(sharedRoot: string, nodeDigest: string): void {
  const manifestPath = path.join(sharedRoot, 'node.json');
  const tmp = `${manifestPath}.${randomUUID()}.tmp`;
  try {
    fs.writeFileSync(tmp, `${JSON.stringify({ schemaVersion: 1, nodeDigest })}\n`, { mode: 0o600, flag: 'wx' });
    fs.renameSync(tmp, manifestPath);
  } finally {
    if (fs.existsSync(tmp)) fs.rmSync(tmp, { force: true });
  }
}

function claimSharedNodeLock(sharedRoot: string): { release(): void } {
  privateDirectory(sharedRoot);
  const lockDir = path.join(sharedRoot, '.lock');
  const ownerFile = path.join(lockDir, 'owner.json');
  const nonce = randomUUID();
  const stage = path.join(sharedRoot, `.lock-stage-${nonce}`);
  privateDirectory(stage);
  fs.writeFileSync(path.join(stage, 'owner.json'), `${JSON.stringify({ pid: process.pid, nonce, createdAtMs: Date.now() })}\n`, { mode: 0o600, flag: 'wx' });
  const deadline = Date.now() + 15_000;
  const sleeper = new Int32Array(new SharedArrayBuffer(4));
  const readOwner = (): { pid: number; nonce: string } | null => {
    try {
      const info = fs.lstatSync(ownerFile, { throwIfNoEntry: false });
      if (!info || !info.isFile() || info.isSymbolicLink() || info.nlink !== 1) return null;
      const parsed = JSON.parse(fs.readFileSync(ownerFile, 'utf8')) as { pid?: unknown; nonce?: unknown };
      if (!Number.isSafeInteger(parsed.pid) || (parsed.pid as number) < 1 || typeof parsed.nonce !== 'string') return null;
      return { pid: parsed.pid as number, nonce: parsed.nonce };
    } catch {
      return null;
    }
  };
  try {
    for (;;) {
      try {
        fs.renameSync(stage, lockDir);
        break;
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== 'ENOTEMPTY' && code !== 'EEXIST' && code !== 'EPERM' && code !== 'EACCES') throw error;
        if (!fs.existsSync(lockDir)) continue;
        const prior = readOwner();
        if (!prior || !live(prior.pid)) {
          const reclaim = `${lockDir}.reclaim`;
          let claimedReclaim = false;
          try {
            fs.mkdirSync(reclaim, { mode: 0o700 });
            claimedReclaim = true;
            const current = readOwner();
            if ((!current && !prior) || (current && prior && current.nonce === prior.nonce && !live(current.pid)) || (!current && prior && !live(prior.pid))) {
              const retired = `${lockDir}.retired-${randomUUID()}`;
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
          throw new AgentServiceError('agent_process_owned', '固定Node运行目录正被其他进程占用。', 409);
        }
        Atomics.wait(sleeper, 0, 0, 15);
      }
    }
  } finally {
    if (fs.existsSync(stage)) fs.rmSync(stage, { recursive: true, force: true });
  }
  return {
    release() {
      const current = readOwner();
      if (current?.nonce !== nonce) return;
      const retired = `${lockDir}.released-${nonce}`;
      try {
        fs.renameSync(lockDir, retired);
        fs.rmSync(retired, { recursive: true, force: true });
      } catch { /* Best-effort lock release. */ }
    },
  };
}

function cleanupRetiredSharedNodes(sharedRoot: string): void {
  try {
    for (const name of fs.readdirSync(sharedRoot)) {
      if (!name.startsWith('.retired-')) continue;
      try { fs.rmSync(path.join(sharedRoot, name), { force: true }); } catch { /* Still held by an active process. */ }
    }
  } catch { /* Ignore cleanup failure. */ }
}

/** Verify an existing stable Node runtime entry (shared fixed path or legacy per-digest path). */
export function verifyStableRuntimeNode(dataRoot: string, nodePath: string, expectedDigest: string): boolean {
  if (!/^[a-f0-9]{64}$/.test(expectedDigest)) {
    throw new AgentServiceError('agent_runtime_identity_invalid', '执行运行单元Node摘要无效。', 409);
  }
  const sharedPath = sharedRuntimeNodePath(dataRoot);
  if (nodePath === sharedPath) {
    const dirStat = fs.lstatSync(path.dirname(sharedPath), { throwIfNoEntry: false });
    if (!dirStat) return false;
    if (!dirStat.isDirectory() || dirStat.isSymbolicLink()) {
      throw new AgentServiceError('agent_process_storage_unsafe', '固定Node目录来源不安全。', 409);
    }
    return verifyNodeBinaryFile(sharedPath, expectedDigest);
  }
  const legacyPath = path.join(runtimeNodesRoot(dataRoot), expectedDigest, runtimeNodeName());
  if (nodePath !== legacyPath) {
    throw new AgentServiceError('agent_runtime_identity_invalid', '固定Node运行路径与摘要不匹配。', 409);
  }
  const directory = path.dirname(legacyPath);
  const dirStat = fs.lstatSync(directory, { throwIfNoEntry: false });
  if (!dirStat) return false;
  const agentRoot = path.join(path.resolve(dataRoot), 'agent-service');
  if (!dirStat.isDirectory() || dirStat.isSymbolicLink() || !safeStoragePath(agentRoot, directory)) {
    throw new AgentServiceError('agent_process_storage_unsafe', '固定Node目录来源不安全。', 409);
  }
  const nodeName = runtimeNodeName();
  const entries = fs.readdirSync(directory);
  if (entries.length !== 1 || entries[0] !== nodeName) {
    throw new AgentServiceError('agent_runtime_changed', '固定Node目录包含未登记文件。', 409);
  }
  return verifyNodeBinaryFile(legacyPath, expectedDigest);
}

function materializeSharedRuntimeNode(dataRoot: string, sourceNode: string, nodeDigest: string): string {
  const expected = sharedRuntimeNodePath(dataRoot);
  const sharedRoot = path.dirname(expected);
  const sourceStat = fs.lstatSync(sourceNode);
  if (!sourceStat.isFile() || sourceStat.isSymbolicLink()) {
    throw new AgentServiceError('agent_runtime_file_invalid', '执行运行单元Node来源无效。', 409);
  }
  const lock = claimSharedNodeLock(sharedRoot);
  try {
    cleanupRetiredSharedNodes(sharedRoot);
    const existingStat = fs.lstatSync(expected, { throwIfNoEntry: false });
    if (existingStat) {
      assertSafeNodeStat(existingStat);
      const manifest = readSharedNodeManifest(sharedRoot);
      const actualDigest = computeNodeDigest(expected);
      if (manifest && actualDigest !== manifest.nodeDigest) {
        throw new AgentServiceError('agent_runtime_changed', '固定Node运行文件已变化或来源不安全。', 409);
      }
      if (actualDigest === nodeDigest) {
        if (!manifest) writeSharedNodeManifest(sharedRoot, nodeDigest);
        const now = new Date();
        try { fs.utimesSync(sharedRoot, now, now); } catch { /* Ignore mtime refresh error. */ }
        return expected;
      }
      if (!manifest) {
        throw new AgentServiceError('agent_runtime_changed', '固定Node运行文件已变化或来源不安全。', 409);
      }
    }
    const stage = path.join(sharedRoot, '.stage-' + randomUUID());
    privateDirectory(stage);
    const stagedNode = path.join(stage, runtimeNodeName());
    try {
      if (sourceStat.size >= 1024 * 1024) {
        try {
          cloneFile(sourceNode, stagedNode);
        } catch {
          fs.copyFileSync(sourceNode, stagedNode, fs.constants.COPYFILE_FICLONE | fs.constants.COPYFILE_EXCL);
        }
      } else {
        fs.copyFileSync(sourceNode, stagedNode, fs.constants.COPYFILE_FICLONE | fs.constants.COPYFILE_EXCL);
      }
      fs.chmodSync(stagedNode, 0o500);
      if (computeNodeDigest(stagedNode) !== nodeDigest) {
        throw new AgentServiceError('agent_runtime_changed', '固定Node运行文件校验不匹配。', 409);
      }
      try {
        fs.renameSync(stagedNode, expected);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (process.platform === 'win32' && ['EPERM', 'EBUSY', 'EACCES'].includes(code ?? '') && fs.existsSync(expected)) {
          const retired = path.join(sharedRoot, `.retired-${randomUUID()}.exe`);
          try {
            fs.renameSync(expected, retired);
            fs.renameSync(stagedNode, expected);
            cleanupRetiredSharedNodes(sharedRoot);
          } catch {
            return sourceNode;
          }
        } else {
          throw error;
        }
      }
      if (!verifyNodeBinaryFile(expected, nodeDigest)) {
        throw new AgentServiceError('agent_runtime_changed', '固定Node运行文件未完成物化。', 409);
      }
      writeSharedNodeManifest(sharedRoot, nodeDigest);
      return expected;
    } finally {
      if (fs.existsSync(stage)) fs.rmSync(stage, { recursive: true, force: true });
    }
  } finally {
    lock.release();
  }
}

/** Resolve and materialize the shared fixed-path Node binary for launching processes. */
export function ensureStableRuntimeNode(dataRoot: string, runtime: AgentRuntimeUnit): string {
  const expectedDirectory = path.join(controlRoot(dataRoot), 'runtimes', runtime.digest);
  const expectedRuntimeNode = path.join(expectedDirectory, runtimeNodeName());
  if (
    runtime.schemaVersion !== 1 ||
    !/^[a-f0-9]{64}$/.test(runtime.digest) ||
    runtime.directory !== expectedDirectory ||
    runtime.node !== expectedRuntimeNode
  ) {
    throw new AgentServiceError('agent_runtime_identity_invalid', '执行运行单元身份不匹配。', 409);
  }
  const sourceStat = fs.lstatSync(runtime.node, { throwIfNoEntry: false });
  if (!sourceStat || !sourceStat.isFile() || sourceStat.isSymbolicLink()) {
    throw new AgentServiceError('agent_runtime_file_invalid', '执行运行单元Node来源无效。', 409);
  }
  const nodeDigest = computeNodeDigest(runtime.node);
  return materializeSharedRuntimeNode(dataRoot, runtime.node, nodeDigest);
}

/** Materialize the already prepared private package; no source or global installation fallback. */
export function prepareAgentRuntime(input: { dataRoot: string; packageRoot?: string; entry?: string; node?: string }, checkCancelled: () => void = () => {}): AgentRuntimeUnit {
  checkCancelled();
  const packageRoot = fs.realpathSync(input.packageRoot ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'));
  const entry = input.entry ?? 'build/process/entry.js';
  const node = fs.realpathSync(input.node ?? process.execPath);
  const names = runtimeFileNames(packageRoot);
  const digest = computeAgentRuntimeDigest({ packageRoot, entry, node });
  checkCancelled();
  // The source package may legitimately be hard-linked by copy workflows; the digest below
  // already covers this descriptor, so exclusive ownership is not required here.
  const compatibility = readPackageRecord<{ parallelCompatibility?: 1 | 2 | 3 | 4 }>(path.join(packageRoot, 'build/runtime-contracts.json'));
  const lock = claimStorage(input.dataRoot);
  try {
  const units = path.join(controlRoot(input.dataRoot), 'runtimes'); privateDirectory(units);
  const directory = path.join(units, digest);
  const descriptor: AgentRuntimeUnit = { schemaVersion: 1, digest, directory, entry: path.join(directory, entry), node: path.join(directory, runtimeNodeName()), ...([1,2,3,4].includes(compatibility?.parallelCompatibility ?? 0) ? { parallelCompatibility: compatibility!.parallelCompatibility } : {}) };
  if (fs.existsSync(directory)) { validateAgentRuntime(input.dataRoot, descriptor); checkCancelled(); const now = new Date(); fs.utimesSync(directory, now, now); materializeSharedRuntimeNode(input.dataRoot, descriptor.node, computeNodeDigest(descriptor.node)); return descriptor; }
  const stage = path.join(units, '.stage-' + randomUUID()); privateDirectory(stage);
  try {
    for (const name of names) { checkCancelled(); const target = path.join(stage, name); fs.mkdirSync(path.dirname(target), { recursive: true }); if (name === 'build/runtime-contracts.json') fs.copyFileSync(path.join(packageRoot, name), target);
      else fs.linkSync(materializeRuntimeObject(path.join(input.dataRoot, 'agent-service'), path.join(packageRoot, name)), target); }
    fs.linkSync(materializeRuntimeObject(path.join(input.dataRoot, 'agent-service'), node, 0o100), path.join(stage, path.basename(descriptor.node)));
    checkCancelled();
    writePrivate(path.join(stage, 'runtime.json'), { ...descriptor, files: names });
    try { fs.renameSync(stage, directory); } catch (error) { if (!fs.existsSync(directory)) throw error; }
    validateAgentRuntime(input.dataRoot, descriptor);
    checkCancelled();
    materializeSharedRuntimeNode(input.dataRoot, descriptor.node, computeNodeDigest(descriptor.node));
    return descriptor;
  } finally { if (fs.existsSync(stage)) fs.rmSync(stage, { recursive: true }); }
  } finally { lock.release(); }
}
export function canRunParallel(current: AgentRuntimeUnit, target: AgentRuntimeUnit): boolean {
  // v1 shares storage but retains idle native writers. Its upgrade must drain
  // before a successor can resume the same native sessions.
  if (![3,4].includes(current.parallelCompatibility ?? 0) || target.parallelCompatibility !== current.parallelCompatibility) return false;
  const left = readPrivate<{parallelCompatibility?:number;storageVersion:number}>(path.join(current.directory, 'build/runtime-contracts.json'));
  const right = readPrivate<{parallelCompatibility?:number;storageVersion:number}>(path.join(target.directory, 'build/runtime-contracts.json'));
  return !!left && !!right && left.parallelCompatibility === current.parallelCompatibility && right.parallelCompatibility === current.parallelCompatibility && left.storageVersion === right.storageVersion;
}
export function validateRuntimeContents(dataRoot: string, runtime: AgentRuntimeUnit): void {
  const expected = path.join(controlRoot(dataRoot), 'runtimes', runtime.digest);
  if (runtime.schemaVersion !== 1 || !/^[a-f0-9]{64}$/.test(runtime.digest) || runtime.directory !== expected || fs.lstatSync(expected).isSymbolicLink() || runtime.node !== path.join(expected, process.platform === 'win32' ? 'node.exe' : 'node') || !runtime.entry.startsWith(expected + path.sep + 'build' + path.sep) || path.relative(expected, runtime.entry).split(path.sep).includes('..')) throw new AgentServiceError('agent_runtime_identity_invalid', '执行运行单元身份不匹配。', 409);
  const manifest = readPrivate<AgentRuntimeUnit & { files: string[] }>(path.join(expected, 'runtime.json'));
  if (!manifest || !Array.isArray(manifest.files) || manifest.entry !== runtime.entry || manifest.digest !== runtime.digest || manifest.files.some(name => path.isAbsolute(name) || name.split(/[\\/]/).includes('..'))) throw new AgentServiceError('agent_runtime_manifest_invalid', '执行运行单元清单无效。', 409);
  if (manifest.node !== runtime.node) throw new AgentServiceError('agent_runtime_identity_invalid', '运行单元的Node来源与清单不一致。', 409);
  const expectedFiles = [...manifest.files, path.basename(runtime.node), 'runtime.json'].sort();
  if (JSON.stringify(files(expected).sort()) !== JSON.stringify(expectedFiles)) throw new AgentServiceError('agent_runtime_changed', '执行运行单元含未登记文件，已保留。', 409);
  if (digestTree(expected, manifest.files, runtime.node, path.relative(expected, runtime.entry)) !== runtime.digest) throw new AgentServiceError('agent_runtime_changed', '执行运行单元内容已变化。', 409);
}
export function validateAgentRuntime(dataRoot: string, runtime: AgentRuntimeUnit): void {
  validateRuntimeContents(dataRoot, runtime);
  const expected = runtime.directory;
  const compatibility = readPrivate<{ contracts: typeof AGENT_EXECUTION_CONTRACTS; storageVersion: number }>(path.join(expected, 'build/runtime-contracts.json'));
  if (!compatibility || Object.entries(AGENT_EXECUTION_CONTRACTS).some(([key,value]) => compatibility.contracts?.[key as keyof typeof AGENT_EXECUTION_CONTRACTS] !== value)) throw new AgentServiceError('agent_runtime_contract_incompatible', '新版执行契约不兼容，旧后台继续保留。', 409);
  const database = path.join(dataRoot, 'agent-service/conversations.sqlite');
  if (fs.existsSync(database)) {
    const db = new DatabaseSync(database, { readOnly: true });
    try { db.exec('PRAGMA busy_timeout=2000'); if ((db.prepare('PRAGMA user_version').get() as {user_version:number}).user_version > compatibility.storageVersion) throw new AgentServiceError('agent_storage_newer', '当前资料版本较新，未采用不兼容的执行后台。', 409); }
    finally { db.close(); }
  }
}

/** Page-session/static-resource compatibility is separate from storage parallelism. */
export function runtimeSupportsHarnessWeb(runtime:AgentRuntimeUnit,development=false):boolean {
  const value=readPackageRecord<{webCompatibility?:number;developmentWebCompatibility?:number}>(path.join(runtime.directory,'build/runtime-contracts.json'));
  return value?.webCompatibility===1&&(!development||value.developmentWebCompatibility===1);
}
