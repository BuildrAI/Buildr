import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync, spawnSync } from 'node:child_process';

import { localAppDataRoot } from './workspace-registry-repository.mjs';

export const WORKSPACE_NODE_IDENTITY_SCHEMA = 'buildr.workspace-node-identity/v1';
const INSTALL_TIMEOUT_MS = 60_000;

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
  const dataRoot = path.resolve(options.dataRoot || localAppDataRoot());
  const root = path.join(dataRoot, 'runtimes', 'node', version, target.key);
  const windows = target.platform === 'win';
  return {
    ...target,
    dataRoot,
    root,
    node: windows ? path.join(root, 'node.exe') : path.join(root, 'bin', 'node'),
    npm: windows ? path.join(root, 'npm.cmd') : path.join(root, 'bin', 'npm'),
    npx: windows ? path.join(root, 'npx.cmd') : path.join(root, 'bin', 'npx'),
    bin: windows ? root : path.join(root, 'bin'),
  };
}

function probeRuntimeCommand(executable, args, { platform, ...options } = {}) {
  return spawnSync(executable, args, {
    ...options,
    shell: platform === 'win' && path.extname(executable).toLowerCase() === '.cmd',
  });
}

export function probeWorkspaceNodeRuntime(workspace, options = {}) {
  const identity = workspaceNodeIdentity(workspace, options);
  if (!identity) return { status: 'missing-declaration', identity: null, executable: null, npmExecutable: null, actualVersion: null };
  const paths = workspaceNodeRuntimePaths(identity.version, options);
  if (!fs.existsSync(paths.node) || !fs.existsSync(paths.npm)) {
    return { status: 'missing', identity, executable: paths.node, npmExecutable: paths.npm, actualVersion: null, paths };
  }
  const nodeProbe = probeRuntimeCommand(paths.node, ['-p', 'process.versions.node'], {
    encoding: 'utf8',
    timeout: 10_000,
    platform: paths.platform,
  });
  const actualVersion = nodeProbe.status === 0 ? nodeProbe.stdout.trim() : null;
  const env = { ...process.env, PATH: `${paths.bin}${path.delimiter}${process.env.PATH || ''}` };
  const npmProbe = probeRuntimeCommand(paths.npm, ['--version'], {
    encoding: 'utf8',
    timeout: 10_000,
    env,
    platform: paths.platform,
  });
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
      fs.cpSync(path.join(temp, descriptor.base), stage, { recursive: true });
    } else {
      execFileSync('tar', ['-xzf', archive, '--strip-components=1', '-C', stage], { stdio: 'pipe', timeout: INSTALL_TIMEOUT_MS });
    }
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
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
  try {
    const ready = probeWorkspaceNodeRuntime(workspace, options);
    if (ready.status === 'ready') return { ...ready, action: 'reused-after-lock' };
    fs.rmSync(stage, { recursive: true, force: true });
    const source = options.sourceRoot || process.env.BUILDR_NODE_RUNTIME_SOURCE_ROOT;
    if (source) fs.cpSync(path.resolve(source), stage, { recursive: true });
    else if (options.adoptCurrent === true && process.platform !== 'win32') installFromCurrent(stage, initial.identity.version);
    else installFromOfficial(initial.identity.version, stage, options);
    const stagedPaths = {
      ...workspaceNodeRuntimePaths(initial.identity.version, options),
      root: stage,
      node: initial.paths.platform === 'win' ? path.join(stage, 'node.exe') : path.join(stage, 'bin', 'node'),
      npm: initial.paths.platform === 'win' ? path.join(stage, 'npm.cmd') : path.join(stage, 'bin', 'npm'),
      bin: initial.paths.platform === 'win' ? stage : path.join(stage, 'bin'),
    };
    const nodeProbe = probeRuntimeCommand(stagedPaths.node, ['-p', 'process.versions.node'], {
      encoding: 'utf8',
      timeout: 10_000,
      platform: initial.paths.platform,
    });
    const npmProbe = probeRuntimeCommand(stagedPaths.npm, ['--version'], {
      encoding: 'utf8',
      timeout: 10_000,
      env: { ...process.env, PATH: `${stagedPaths.bin}${path.delimiter}${process.env.PATH || ''}` },
      platform: initial.paths.platform,
    });
    if (nodeProbe.status !== 0 || nodeProbe.stdout.trim() !== initial.identity.version || npmProbe.status !== 0) {
      throw new Error(`Prepared Workspace Node runtime failed probe for ${initial.identity.version}.`);
    }
    fs.rmSync(paths.root, { recursive: true, force: true });
    fs.renameSync(stage, paths.root);
    const result = probeWorkspaceNodeRuntime(workspace, options);
    if (result.status !== 'ready') throw new Error(`Workspace Node runtime did not become ready for ${initial.identity.version}.`);
    return { ...result, action: initial.status === 'missing' ? 'installed' : 'repaired' };
  } finally {
    fs.rmSync(stage, { recursive: true, force: true });
    try { fs.closeSync(descriptor); } catch { /* already closed */ }
    fs.rmSync(lock, { force: true });
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
