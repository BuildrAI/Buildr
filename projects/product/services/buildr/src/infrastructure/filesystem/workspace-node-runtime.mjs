import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';
import { spawnCommandSync } from '../process.mjs';
import { assertVerificationNetworkAllowed } from '../network/verification-network-policy.mjs';

import { localAppDataRoot } from './workspace-registry-repository.mjs';

export const WORKSPACE_NODE_IDENTITY_SCHEMA = 'buildr.workspace-node-identity/v1';
const INSTALL_TIMEOUT_MS = 180_000;
const WINDOWS_FILESYSTEM_RETRY_TIMEOUT_MS = 5_000;
const WINDOWS_FILESYSTEM_RETRY_DELAY_MS = 100;
const TRANSIENT_WINDOWS_FILESYSTEM_ERRORS = new Set(['EACCES', 'EBUSY', 'EPERM']);

function wait(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function runtimeFilesystemError(operation, target, error) {
  const wrapped = new Error(`Workspace Node runtime ${operation} failed for ${target}: ${error.message}`, { cause: error });
  for (const field of ['code', 'errno', 'syscall', 'path', 'dest']) {
    if (error?.[field] !== undefined) wrapped[field] = error[field];
  }
  wrapped.operation = operation;
  wrapped.target = target;
  return wrapped;
}

export function runRuntimeFilesystemOperation(operation, target, action, options = {}) {
  const platform = options.platform || process.platform;
  const windows = platform === 'win32' || platform === 'win';
  const now = options.filesystemRetryNow || Date.now;
  const pause = options.filesystemRetryWait || wait;
  const timeoutMs = options.filesystemRetryTimeoutMs ?? WINDOWS_FILESYSTEM_RETRY_TIMEOUT_MS;
  const delayMs = options.filesystemRetryDelayMs ?? WINDOWS_FILESYSTEM_RETRY_DELAY_MS;
  let deadline = null;
  while (true) {
    try {
      return action();
    } catch (error) {
      if (!windows || !TRANSIENT_WINDOWS_FILESYSTEM_ERRORS.has(error?.code)) {
        throw runtimeFilesystemError(operation, target, error);
      }
      const observedAt = now();
      if (deadline === null) deadline = observedAt + timeoutMs;
      else if (observedAt >= deadline) throw runtimeFilesystemError(operation, target, error);
      pause(delayMs);
    }
  }
}

export function runtimeTreeRemovalOptions(platform = process.platform) {
  return platform === 'win32' || platform === 'win'
    ? { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }
    : { recursive: true, force: true };
}

function removeRuntimeTree(target, options = {}) {
  return runRuntimeFilesystemOperation(
    options.operation || 'remove-tree',
    target,
    () => fs.rmSync(target, runtimeTreeRemovalOptions(options.platform)),
    options,
  );
}

function copyRuntimeTree(source, target, options = {}) {
  const copy = options.copyRuntimeTree || fs.cpSync;
  return runRuntimeFilesystemOperation(
    options.operation || 'copy-tree',
    target,
    () => copy(source, target, { recursive: true }),
    options,
  );
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function normalizeNodePlatform(platform = process.platform, arch = process.arch) {
  const platforms = { darwin: 'darwin', linux: 'linux', win32: 'win' };
  const architectures = { x64: 'x64', arm64: 'arm64' };
  const normalizedPlatform = platforms[platform];
  const normalizedArch = architectures[arch];
  if (!normalizedPlatform || !normalizedArch) throw new Error(`Unsupported Workspace Node runtime platform: ${platform}-${arch}`);
  return { platform: normalizedPlatform, arch: normalizedArch, key: `${normalizedPlatform}-${normalizedArch}` };
}

export function workspaceNodeIdentity(workspace, options = {}) {
  const version = workspace?.runtime?.node?.version;
  if (!version) return null;
  const target = normalizeNodePlatform(options.platform, options.arch);
  const material = {
    schemaVersion: WORKSPACE_NODE_IDENTITY_SCHEMA,
    workspaceId: workspace.id,
    version,
    platform: target.platform,
    arch: target.arch,
  };
  return { ...material, digest: `sha256-${sha256(JSON.stringify(material))}` };
}

export function workspaceNodeRuntimePaths(version, options = {}) {
  const target = normalizeNodePlatform(options.platform, options.arch);
  const dataRoot = path.resolve(options.dataRoot || process.env.BUILDR_NODE_RUNTIME_DATA_DIR || localAppDataRoot({ respectOverride: false }));
  const root = path.join(dataRoot, 'runtimes', 'node', version, target.key);
  const windows = target.platform === 'win';
  return {
    ...target,
    dataRoot,
    root,
    node: windows ? path.join(root, 'node.exe') : path.join(root, 'bin', 'node'),
    npm: windows ? path.join(root, 'npm.cmd') : path.join(root, 'bin', 'npm'),
    npmCli: windows ? path.join(root, 'node_modules', 'npm', 'bin', 'npm-cli.js') : null,
    npx: windows ? path.join(root, 'npx.cmd') : path.join(root, 'bin', 'npx'),
    bin: windows ? root : path.join(root, 'bin'),
  };
}

function probeRuntimeCommand(executable, args, { platform, ...options } = {}) {
  return spawnCommandSync(executable, args, { ...options, platform: platform === 'win' ? 'win32' : platform });
}

function probeRuntimeNpm(paths) {
  const env = { ...process.env, PATH: `${paths.bin}${path.delimiter}${process.env.PATH || ''}` };
  return paths.platform === 'win'
    ? probeRuntimeCommand(paths.node, [paths.npmCli, '--version'], { encoding: 'utf8', timeout: 10_000, env, platform: paths.platform })
    : probeRuntimeCommand(paths.npm, ['--version'], { encoding: 'utf8', timeout: 10_000, env, platform: paths.platform });
}

export function probeWorkspaceNodeRuntime(workspace, options = {}) {
  const identity = workspaceNodeIdentity(workspace, options);
  if (!identity) return { status: 'missing-declaration', identity: null, executable: null, npmExecutable: null, actualVersion: null };
  const paths = workspaceNodeRuntimePaths(identity.version, options);
  if (!fs.existsSync(paths.node) || !fs.existsSync(paths.npm) || (paths.platform === 'win' && !fs.existsSync(paths.npmCli))) {
    return { status: 'missing', identity, executable: paths.node, npmExecutable: paths.npm, actualVersion: null, paths };
  }
  const nodeProbe = probeRuntimeCommand(paths.node, ['-p', 'process.versions.node'], {
    encoding: 'utf8',
    timeout: 10_000,
    platform: paths.platform,
  });
  const actualVersion = nodeProbe.status === 0 ? nodeProbe.stdout.trim() : null;
  const npmProbe = probeRuntimeNpm(paths);
  const status = actualVersion === identity.version && npmProbe.status === 0 ? 'ready' : 'invalid';
  return {
    status,
    identity,
    executable: paths.node,
    npmExecutable: paths.npm,
    actualVersion,
    npmVersion: npmProbe.status === 0 ? npmProbe.stdout.trim() : null,
    diagnostic: status === 'ready' ? null : (nodeProbe.stderr || npmProbe.stderr || 'Workspace Node runtime probe failed.').trim(),
    paths,
  };
}

function archiveDescriptor(version, platform, arch) {
  const base = `node-v${version}-${platform}-${arch}`;
  return { base, archive: platform === 'win' ? `${base}.zip` : `${base}.tar.gz` };
}

function downloadFile(url, output) {
  const script = `
const fs = require('node:fs');
fetch(process.argv[1], { redirect: 'follow' }).then((response) => {
  if (!response.ok) throw new Error('HTTP ' + response.status + ' for ' + process.argv[1]);
  return response.arrayBuffer();
}).then((body) => fs.writeFileSync(process.argv[2], Buffer.from(body))).catch((error) => { console.error(error.message); process.exit(1); });
`;
  execFileSync(process.execPath, ['-e', script, url, output], { stdio: ['ignore', 'ignore', 'pipe'], timeout: INSTALL_TIMEOUT_MS });
}

function installFromOfficial(version, stage, options = {}) {
  const target = normalizeNodePlatform(options.platform, options.arch);
  const descriptor = archiveDescriptor(version, target.platform, target.arch);
  const temp = fs.mkdtempSync(path.join(path.dirname(stage), '.download-'));
  try {
    const archive = path.join(temp, descriptor.archive);
    const sums = path.join(temp, 'SHASUMS256.txt');
    const baseUrl = String(options.distributionBaseUrl || process.env.BUILDR_NODE_DISTRIBUTION_BASE_URL || 'https://nodejs.org/dist').replace(/\/$/, '');
    assertVerificationNetworkAllowed(baseUrl, { env: options.env, label: 'Workspace Node download' });
    downloadFile(`${baseUrl}/v${version}/SHASUMS256.txt`, sums);
    downloadFile(`${baseUrl}/v${version}/${descriptor.archive}`, archive);
    const expected = fs.readFileSync(sums, 'utf8').split(/\r?\n/).map((line) => line.trim().split(/\s+/)).find((parts) => parts[1] === descriptor.archive)?.[0];
    if (!expected) throw new Error(`Node checksum is missing for ${descriptor.archive}.`);
    const actual = sha256(fs.readFileSync(archive));
    if (actual !== expected) throw new Error(`Node archive checksum mismatch for ${descriptor.archive}.`);
    fs.mkdirSync(stage, { recursive: true });
    if (target.platform === 'win') {
      const command = `Expand-Archive -LiteralPath '${archive.replaceAll("'", "''")}' -DestinationPath '${temp.replaceAll("'", "''")}' -Force`;
      execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', command], { stdio: 'pipe', timeout: INSTALL_TIMEOUT_MS });
      copyRuntimeTree(path.join(temp, descriptor.base), stage, { ...options, platform: target.platform, operation: 'copy-official-distribution' });
    } else {
      execFileSync('tar', ['-xzf', archive, '--strip-components=1', '-C', stage], { stdio: 'pipe', timeout: INSTALL_TIMEOUT_MS });
    }
  } finally {
    removeRuntimeTree(temp);
  }
}

function installFromCurrent(stage, version) {
  if (process.versions.node !== version) throw new Error(`Current Node ${process.versions.node} cannot prepare Workspace Node ${version}.`);
  if (process.platform === 'win32') {
    throw new Error('Adopting the bootstrap Node distribution is not supported on Windows; use the verified official archive.');
  }
  const bin = path.join(stage, 'bin');
  fs.mkdirSync(bin, { recursive: true });
  const currentBin = path.dirname(process.execPath);
  const npm = path.join(currentBin, 'npm');
  const npx = path.join(currentBin, 'npx');
  if (!fs.existsSync(npm)) throw new Error(`Current Node distribution does not provide npm beside process.execPath: ${npm}`);
  fs.symlinkSync(fs.realpathSync(process.execPath), path.join(bin, 'node'));
  fs.symlinkSync(fs.realpathSync(npm), path.join(bin, 'npm'));
  if (fs.existsSync(npx)) fs.symlinkSync(fs.realpathSync(npx), path.join(bin, 'npx'));
}

function waitForLock(lock, deadline) {
  while (fs.existsSync(lock) && Date.now() < deadline) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
}

function renameRuntimeStage(stage, target, workspace, options) {
  const deadline = Date.now() + (options.renameTimeoutMs || 5_000);
  while (true) {
    try {
      fs.renameSync(stage, target);
      return null;
    } catch (error) {
      const winner = probeWorkspaceNodeRuntime(workspace, options);
      if (winner.status === 'ready') return winner;
      if (!TRANSIENT_WINDOWS_FILESYSTEM_ERRORS.has(error.code) || Date.now() >= deadline) {
        throw runtimeFilesystemError('publish-stage', target, error);
      }
      wait(50);
    }
  }
}

export function ensureWorkspaceNodeRuntime(workspace, options = {}) {
  const initial = probeWorkspaceNodeRuntime(workspace, options);
  if (initial.status === 'ready') return { ...initial, action: 'reused' };
  if (!initial.identity) throw new Error('Workspace Node declaration is missing; run canonical sync migration first.');
  const paths = initial.paths;
  fs.mkdirSync(path.dirname(paths.root), { recursive: true });
  const lock = `${paths.root}.lock`;
  const deadline = Date.now() + (options.lockTimeoutMs || 30_000);
  waitForLock(lock, deadline);
  let descriptor;
  try { descriptor = fs.openSync(lock, 'wx'); } catch (error) {
    const afterWait = probeWorkspaceNodeRuntime(workspace, options);
    if (afterWait.status === 'ready') return { ...afterWait, action: 'reused-after-wait' };
    throw new Error(`Workspace Node runtime install is locked: ${lock}`);
  }
  const stage = `${paths.root}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
  let primaryError = null;
  try {
    const ready = probeWorkspaceNodeRuntime(workspace, options);
    if (ready.status === 'ready') return { ...ready, action: 'reused-after-lock' };
    removeRuntimeTree(stage, { ...options, platform: initial.paths.platform, operation: 'remove-stale-stage' });
    const source = options.sourceRoot || process.env.BUILDR_NODE_RUNTIME_SOURCE_ROOT;
    if (source) copyRuntimeTree(path.resolve(source), stage, { ...options, platform: initial.paths.platform, operation: 'copy-source-to-stage' });
    else if (options.adoptCurrent === true && process.platform !== 'win32') installFromCurrent(stage, initial.identity.version);
    else installFromOfficial(initial.identity.version, stage, options);
    const stagedPaths = {
      ...workspaceNodeRuntimePaths(initial.identity.version, options),
      root: stage,
      node: initial.paths.platform === 'win' ? path.join(stage, 'node.exe') : path.join(stage, 'bin', 'node'),
      npm: initial.paths.platform === 'win' ? path.join(stage, 'npm.cmd') : path.join(stage, 'bin', 'npm'),
      npmCli: initial.paths.platform === 'win' ? path.join(stage, 'node_modules', 'npm', 'bin', 'npm-cli.js') : null,
      bin: initial.paths.platform === 'win' ? stage : path.join(stage, 'bin'),
    };
    const nodeProbe = probeRuntimeCommand(stagedPaths.node, ['-p', 'process.versions.node'], {
      encoding: 'utf8',
      timeout: 10_000,
      platform: initial.paths.platform,
    });
    const npmProbe = probeRuntimeNpm(stagedPaths);
    if (nodeProbe.status !== 0 || nodeProbe.stdout.trim() !== initial.identity.version || npmProbe.status !== 0) {
      throw new Error(`Prepared Workspace Node runtime failed probe for ${initial.identity.version}.`);
    }
    removeRuntimeTree(paths.root, { ...options, platform: initial.paths.platform, operation: 'remove-invalid-target' });
    const winner = renameRuntimeStage(stage, paths.root, workspace, options);
    if (winner) return { ...winner, action: 'reused-after-race' };
    const result = probeWorkspaceNodeRuntime(workspace, options);
    if (result.status !== 'ready') throw new Error(`Workspace Node runtime did not become ready for ${initial.identity.version}.`);
    return { ...result, action: initial.status === 'missing' ? 'installed' : 'repaired' };
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    const cleanupErrors = [];
    try {
      removeRuntimeTree(stage, { ...options, platform: initial.paths.platform, operation: 'cleanup-stage' });
    } catch (error) {
      cleanupErrors.push(error);
    }
    try { fs.closeSync(descriptor); } catch { /* already closed */ }
    try {
      runRuntimeFilesystemOperation('release-lock', lock, () => fs.rmSync(lock, { force: true }), { ...options, platform: initial.paths.platform });
    } catch (error) {
      cleanupErrors.push(error);
    }
    if (cleanupErrors.length > 0) {
      if (primaryError) primaryError.cleanupErrors = cleanupErrors;
      else throw cleanupErrors[0];
    }
  }
}

export function workspaceNodeExecution(targetRoot, options = {}) {
  const record = options.workspaceRecord || options.runtime?.readWorkspaceRecord?.(targetRoot);
  const workspace = record?.workspace || record?.metadata?.workspace;
  const probe = probeWorkspaceNodeRuntime(workspace, options);
  if (probe.status !== 'ready') return { ...probe, ready: false, environment: null };
  return {
    ...probe,
    ready: true,
    environment: {
      ...process.env,
      PATH: `${probe.paths.bin}${path.delimiter}${process.env.PATH || ''}`,
      BUILDR_WORKSPACE_NODE_IDENTITY: probe.identity.digest,
      BUILDR_WORKSPACE_NODE_VERSION: probe.identity.version,
    },
  };
}

export function registerWorkspaceNodeRuntime(runtime) {
  Object.assign(runtime, {
    workspaceNodeIdentity,
    workspaceNodeRuntimePaths,
    probeWorkspaceNodeRuntime,
    ensureWorkspaceNodeRuntime,
    workspaceNodeExecution: (targetRoot, options = {}) => workspaceNodeExecution(targetRoot, { ...options, runtime }),
  });
  return runtime;
}
