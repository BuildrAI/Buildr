import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync, spawnSync } from 'node:child_process';

export { execFileSync, spawnSync };

export function findExecutableOnPath(executable, options = {}) {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const pathValue = env.PATH || '';
  const configuredExtensions = platform === 'win32'
    ? (env.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';').filter(Boolean)
    : [''];
  const extensions = platform === 'win32' && path.extname(executable) ? [''] : configuredExtensions;

  for (const directory of pathValue.split(path.delimiter).filter(Boolean)) {
    for (const extension of extensions) {
      const candidate = path.join(directory, platform === 'win32' ? `${executable}${extension}` : executable);
      try {
        fs.accessSync(candidate, fs.constants.X_OK);
        return candidate;
      } catch {
        // Try the next PATH entry.
      }
    }
  }
  return null;
}

export function buildCommandInvocation(executable, args, options = {}) {
  const platform = options.platform ?? process.platform;
  const windowsShim = platform === 'win32' && /\.(?:cmd|bat)$/i.test(executable);
  return {
    executable,
    args: windowsShim ? args.map(quoteWindowsCommandArgument) : [...args],
    shell: windowsShim,
  };
}

export function quoteWindowsCommandArgument(value) {
  const argument = String(value);
  if (argument.length === 0) return '""';
  if (!/[\s"]/u.test(argument)) return argument;
  return `"${argument.replace(/(\\*)"/gu, '$1$1\\"').replace(/(\\+)$/u, '$1$1')}"`;
}

export function spawnCommandSync(executable, args, options = {}) {
  const { platform = process.platform, ...spawnOptions } = options;
  const invocation = buildCommandInvocation(executable, args, { platform });
  return spawnSync(invocation.executable, invocation.args, {
    ...spawnOptions,
    shell: invocation.shell,
  });
}

function realExecutable(value, label) {
  if (!path.isAbsolute(value || '')) throw new Error(`${label} must be an absolute executable path.`);
  try {
    fs.accessSync(value, fs.constants.X_OK);
    return fs.realpathSync(value);
  } catch (error) {
    throw new Error(`${label} is not executable: ${value} (${error.code || error.message})`);
  }
}

export function createExactNodePathEnvironment(sourceEnv, bin, options = {}) {
  const platform = options.platform ?? process.platform;
  const pathApi = platform === 'win32' ? path.win32 : path;
  const inheritedEnv = { ...sourceEnv };
  const matchingKeys = Object.keys(inheritedEnv).filter((key) => key.toLowerCase() === 'path');
  const sourceKey = platform === 'win32'
    ? matchingKeys.find((key) => key === 'PATH') ?? matchingKeys[0]
    : 'PATH';
  const inheritedPath = String(inheritedEnv[sourceKey] ?? '');
  if (platform === 'win32') for (const key of matchingKeys) delete inheritedEnv[key];
  const normalizedBin = pathApi.resolve(bin);
  const pathEntries = [
    bin,
    ...inheritedPath.split(pathApi.delimiter).filter(Boolean).filter((entry) => {
      const normalizedEntry = pathApi.resolve(entry);
      return platform === 'win32'
        ? normalizedEntry.toLowerCase() !== normalizedBin.toLowerCase()
        : normalizedEntry !== normalizedBin;
    }),
  ];
  return { env: { ...inheritedEnv, PATH: pathEntries.join(pathApi.delimiter) }, pathEntries };
}

export function createExactNodeExecutionEnvironment(options = {}) {
  const inheritedEnv = { ...(options.env ?? process.env) };
  const nodeExecutable = realExecutable(options.nodeExecutable ?? process.execPath, 'Node executable');
  const bin = path.dirname(nodeExecutable);
  const nodeName = process.platform === 'win32' ? 'node.exe' : 'node';
  const npmName = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const pathNode = path.join(bin, nodeName);
  const npmExecutable = path.join(bin, npmName);
  if (!fs.statSync(pathNode, { throwIfNoEntry: false })?.isFile() && path.basename(nodeExecutable).toLowerCase() !== nodeName) {
    throw new Error(`Node bin does not contain ${nodeName}: ${bin}`);
  }
  if (options.requireNpm && !fs.statSync(npmExecutable, { throwIfNoEntry: false })?.isFile()) {
    throw new Error(`Exact Node bin does not contain ${npmName}: ${bin}`);
  }
  const { env, pathEntries } = createExactNodePathEnvironment(inheritedEnv, bin);
  let version = options.expectedVersion ?? (nodeExecutable === fs.realpathSync(process.execPath) ? process.versions.node : null);
  let reportedExecutable = nodeExecutable;
  if (options.verify !== false) {
    const probe = spawnSync(nodeExecutable, ['-p', 'JSON.stringify({version:process.versions.node,execPath:process.execPath})'], { encoding: 'utf8', env });
    if (probe.status !== 0) throw new Error(`Exact Node identity probe failed: ${(probe.stderr || probe.stdout || '').trim()}`);
    let identity;
    try { identity = JSON.parse(probe.stdout); } catch { throw new Error('Exact Node identity probe returned invalid JSON.'); }
    version = identity.version;
    reportedExecutable = realExecutable(identity.execPath, 'Node reported executable');
    const pathProbe = spawnSync('node', ['-p', 'JSON.stringify({version:process.versions.node,execPath:process.execPath})'], { encoding: 'utf8', env, shell: false });
    if (pathProbe.status !== 0) throw new Error(`PATH Node identity probe failed: ${(pathProbe.stderr || pathProbe.stdout || '').trim()}`);
    let pathIdentity;
    try { pathIdentity = JSON.parse(pathProbe.stdout); } catch { throw new Error('PATH Node identity probe returned invalid JSON.'); }
    const pathExecutable = realExecutable(pathIdentity.execPath, 'PATH Node reported executable');
    if (pathExecutable !== reportedExecutable || pathIdentity.version !== version) {
      throw new Error(`PATH Node identity does not match the exact executable: ${JSON.stringify({ exact: { executable: reportedExecutable, version }, path: { executable: pathExecutable, version: pathIdentity.version } })}`);
    }
  }
  if (options.expectedVersion && version !== options.expectedVersion) throw new Error(`Exact Node version ${version} does not match required ${options.expectedVersion}.`);
  const audit = {
    schemaVersion: 'buildr.exact-node-execution-environment/v1',
    executable: reportedExecutable,
    version,
    bin,
    pathHead: pathEntries[0],
    npmExecutable: fs.statSync(npmExecutable, { throwIfNoEntry: false })?.isFile() ? npmExecutable : null,
  };
  audit.identity = `sha256-${crypto.createHash('sha256').update(JSON.stringify(audit)).digest('hex')}`;
  return { nodeExecutable: reportedExecutable, npmExecutable: audit.npmExecutable, env, audit };
}
