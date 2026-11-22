import { execFileSync, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DEFAULT_POLL_TIMEOUT_MS = 2000;
const DEFAULT_POLL_INTERVAL_MS = 20;
const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const LAUNCHCTL_BINARY = '/bin/launchctl';
const STRIPPED_ISOLATED_ENV_KEYS = new Set(['NODE_CHANNEL_FD', 'NODE_CHANNEL_SERIALIZATION_MODE']);

function defaultSleepSync(ms) {
  if (ms <= 0) return;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function defaultIsPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

function defaultRunCommand(file, args, timeoutMs = 5000) {
  try {
    const stdout = execFileSync(file, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: timeoutMs,
    });
    return { status: 0, stdout: String(stdout ?? ''), stderr: '' };
  } catch (error) {
    return {
      status: typeof error?.status === 'number' ? error.status : 1,
      stdout: typeof error?.stdout === 'string' ? error.stdout : Buffer.isBuffer(error?.stdout) ? error.stdout.toString('utf8') : '',
      stderr: typeof error?.stderr === 'string' ? error.stderr : Buffer.isBuffer(error?.stderr) ? error.stderr.toString('utf8') : '',
      error,
    };
  }
}

function defaultHasSystemd(runCommand, env) {
  if (!env.XDG_RUNTIME_DIR) return false;
  return runCommand('systemd-run', ['--version'], 1500).status === 0;
}

function sanitizeLabelSegment(value) {
  const cleaned = String(value).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned || 'worker';
}

function buildJobLabel(prefix) {
  return `ai.buildr.${sanitizeLabelSegment(prefix)}.${process.pid}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
}

function sanitizeXmlText(value) {
  return String(value)
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function isTestIsolationDisabled(env) {
  return env.BUILDR_TEST_STATE_REQUIRED === '1' || Boolean(env.NODE_TEST_CONTEXT);
}

function runtimeNodeName(platform = process.platform) {
  return platform === 'win32' ? 'node.exe' : 'node';
}

function isPidAlive(pid) {
  return defaultIsPidAlive(pid);
}

function computeFileDigest(filePath) {
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

export function resolveSharedRuntimeNodeRoot({ fallbackDataRoot, env = process.env, platform = process.platform } = {}) {
  const explicit = env.BUILDR_SHARED_NODE_ROOT?.trim();
  const isAbs = explicit ? (platform === 'win32' ? path.win32.isAbsolute(explicit) : path.isAbsolute(explicit)) : false;
  if (explicit && isAbs) {
    return platform === 'win32' ? path.win32.resolve(explicit) : path.resolve(explicit);
  }
  if (isTestIsolationDisabled(env)) {
    if (fallbackDataRoot) {
      return platform === 'win32'
        ? path.win32.join(path.win32.resolve(fallbackDataRoot), 'runtime')
        : path.join(path.resolve(fallbackDataRoot), 'runtime');
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

function assertSafeSharedNodeStat(stat, platform) {
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

export function ensureSharedRuntimeNode(sourceNode, { fallbackDataRoot, env = process.env, platform = process.platform } = {}) {
  const resolvedSource = path.resolve(sourceNode);
  const sourceStat = fs.lstatSync(resolvedSource);
  if (!sourceStat.isFile() || sourceStat.isSymbolicLink()) {
    throw Object.assign(new Error(`Invalid source Node runtime binary: ${resolvedSource}`), {
      code: 'shared_runtime_node_source_invalid',
    });
  }
  const sharedRoot = resolveSharedRuntimeNodeRoot({ fallbackDataRoot, env, platform });
  const targetPath = platform === 'win32'
    ? path.win32.join(sharedRoot, runtimeNodeName(platform))
    : path.join(sharedRoot, runtimeNodeName(platform));
  const nodeDigest = computeFileDigest(resolvedSource);
  fs.mkdirSync(sharedRoot, { recursive: true, mode: 0o700 });
  const dirInfo = fs.lstatSync(sharedRoot);
  if (!dirInfo.isDirectory() || dirInfo.isSymbolicLink()) {
    throw Object.assign(new Error(`Shared Buildr Node directory is unsafe: ${sharedRoot}`), {
      code: 'shared_runtime_node_unsafe',
    });
  }
  try { fs.chmodSync(sharedRoot, 0o700); } catch { /* Ignore chmod on unsupported filesystems. */ }
  const lockDir = path.join(sharedRoot, '.lock');
  const ownerFile = path.join(lockDir, 'owner.json');
  const nonce = crypto.randomUUID();
  const lockStage = path.join(sharedRoot, `.lock-stage-${nonce}`);
  fs.mkdirSync(lockStage, { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(lockStage, 'owner.json'), `${JSON.stringify({ pid: process.pid, nonce, createdAtMs: Date.now() })}\n`, { mode: 0o600, flag: 'wx' });
  const readOwner = () => {
    try {
      const info = fs.lstatSync(ownerFile, { throwIfNoEntry: false });
      if (!info || !info.isFile() || info.isSymbolicLink() || info.nlink !== 1) return null;
      const parsed = JSON.parse(fs.readFileSync(ownerFile, 'utf8'));
      if (!Number.isSafeInteger(parsed.pid) || parsed.pid < 1 || typeof parsed.nonce !== 'string') return null;
      return parsed;
    } catch {
      return null;
    }
  };
  const deadline = Date.now() + 15_000;
  try {
    for (;;) {
      try {
        fs.renameSync(lockStage, lockDir);
        break;
      } catch (error) {
        if (!['ENOTEMPTY', 'EEXIST', 'EPERM', 'EACCES'].includes(error?.code)) throw error;
        if (!fs.existsSync(lockDir)) continue;
        const prior = readOwner();
        if (!prior || !isPidAlive(prior.pid)) {
          const reclaim = `${lockDir}.reclaim`;
          let claimedReclaim = false;
          try {
            fs.mkdirSync(reclaim, { mode: 0o700 });
            claimedReclaim = true;
            const current = readOwner();
            if ((!current && !prior) || (current && prior && current.nonce === prior.nonce && !isPidAlive(current.pid)) || (!current && prior && !isPidAlive(prior.pid))) {
              const retired = `${lockDir}.retired-${crypto.randomUUID()}`;
              try {
                fs.renameSync(lockDir, retired);
                fs.rmSync(retired, { recursive: true, force: true });
              } catch { /* Reclaimed concurrently. */ }
            }
          } catch { /* Reclaim in progress. */ }
          finally {
            if (claimedReclaim && fs.existsSync(reclaim)) fs.rmSync(reclaim, { recursive: true, force: true });
          }
        }
        if (Date.now() >= deadline) {
          throw Object.assign(new Error(`Timed out waiting for shared Node lock in ${sharedRoot}.`), {
            code: 'shared_runtime_node_locked',
          });
        }
        defaultSleepSync(15);
      }
    }
  } finally {
    if (fs.existsSync(lockStage)) fs.rmSync(lockStage, { recursive: true, force: true });
  }
  try {
    try {
      for (const name of fs.readdirSync(sharedRoot)) {
        if (!name.startsWith('.retired-')) continue;
        try { fs.rmSync(path.join(sharedRoot, name), { force: true }); } catch { /* Still in use. */ }
      }
    } catch { /* Ignore cleanup failure. */ }
    const manifestPath = path.join(sharedRoot, 'node.json');
    const readManifest = () => {
      const info = fs.lstatSync(manifestPath, { throwIfNoEntry: false });
      if (!info) return null;
      if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1 || (process.getuid && info.uid !== process.getuid())) {
        throw Object.assign(new Error('Shared Buildr Node manifest is unsafe.'), { code: 'shared_runtime_node_unsafe' });
      }
      const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (parsed?.schemaVersion !== 1 || typeof parsed.nodeDigest !== 'string' || !/^[a-f0-9]{64}$/.test(parsed.nodeDigest)) {
        throw Object.assign(new Error('Shared Buildr Node manifest is invalid.'), { code: 'shared_runtime_node_unsafe' });
      }
      return parsed;
    };
    const writeManifest = (digestValue) => {
      const tmp = `${manifestPath}.${crypto.randomUUID()}.tmp`;
      try {
        fs.writeFileSync(tmp, `${JSON.stringify({ schemaVersion: 1, nodeDigest: digestValue })}\n`, { mode: 0o600, flag: 'wx' });
        fs.renameSync(tmp, manifestPath);
      } finally {
        if (fs.existsSync(tmp)) fs.rmSync(tmp, { force: true });
      }
    };
    const existingStat = fs.lstatSync(targetPath, { throwIfNoEntry: false });
    if (existingStat) {
      assertSafeSharedNodeStat(existingStat, platform);
      const manifest = readManifest();
      const actualDigest = computeFileDigest(targetPath);
      if (manifest && actualDigest !== manifest.nodeDigest) {
        throw Object.assign(new Error('Shared Buildr Node runtime binary digest mismatch.'), { code: 'shared_runtime_node_unsafe' });
      }
      if (actualDigest === nodeDigest) {
        if (!manifest) writeManifest(nodeDigest);
        return targetPath;
      }
      if (!manifest) {
        throw Object.assign(new Error('Shared Buildr Node runtime binary is missing verified manifest.'), { code: 'shared_runtime_node_unsafe' });
      }
    }
    const stage = path.join(sharedRoot, `.stage-${crypto.randomUUID()}`);
    fs.mkdirSync(stage, { recursive: true, mode: 0o700 });
    const stagedNode = path.join(stage, runtimeNodeName(platform));
    try {
      fs.copyFileSync(resolvedSource, stagedNode, fs.constants.COPYFILE_FICLONE | fs.constants.COPYFILE_EXCL);
      fs.chmodSync(stagedNode, 0o500);
      if (computeFileDigest(stagedNode) !== nodeDigest) {
        throw Object.assign(new Error('Staged shared Buildr Node binary digest mismatch.'), { code: 'shared_runtime_node_unsafe' });
      }
      try {
        fs.renameSync(stagedNode, targetPath);
      } catch (error) {
        if (platform === 'win32' && ['EPERM', 'EBUSY', 'EACCES'].includes(error?.code) && fs.existsSync(targetPath)) {
          const retired = path.join(sharedRoot, `.retired-${crypto.randomUUID()}.exe`);
          try {
            fs.renameSync(targetPath, retired);
            fs.renameSync(stagedNode, targetPath);
          } catch {
            return resolvedSource;
          }
        } else {
          throw error;
        }
      }
      assertSafeSharedNodeStat(fs.lstatSync(targetPath, { throwIfNoEntry: false }), platform);
      if (computeFileDigest(targetPath) !== nodeDigest) {
        throw Object.assign(new Error('Published shared Buildr Node binary digest mismatch.'), { code: 'shared_runtime_node_unsafe' });
      }
      writeManifest(nodeDigest);
      return targetPath;
    } finally {
      if (fs.existsSync(stage)) fs.rmSync(stage, { recursive: true, force: true });
    }
  } finally {
    const current = readOwner();
    if (current?.nonce === nonce) {
      const retired = `${lockDir}.released-${nonce}`;
      try {
        fs.renameSync(lockDir, retired);
        fs.rmSync(retired, { recursive: true, force: true });
      } catch { /* Best-effort release. */ }
    }
  }
}

export function shouldUsePlatformIsolation(env = process.env, deps = {}) {
  const explicit = env.BUILDR_DETACHED_ISOLATION?.trim().toLowerCase();
  const platform = deps.platform ?? process.platform;
  if (explicit === 'off' || explicit === 'direct') return 'direct';
  if (explicit === 'launchd') return platform === 'darwin' ? 'launchd' : 'direct';
  if (explicit === 'systemd') return platform === 'linux' ? 'systemd' : 'direct';
  if (isTestIsolationDisabled(env)) return 'direct';
  if (platform === 'darwin') return 'launchd';
  if (platform === 'linux') {
    const hasSystemd = deps.hasSystemd ? deps.hasSystemd() : defaultHasSystemd(defaultRunCommand, env);
    return hasSystemd ? 'systemd' : 'direct';
  }
  return 'direct';
}

export function buildLaunchdPlistXml(spec) {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '<dict>',
    '  <key>Label</key>',
    `  <string>${sanitizeXmlText(spec.label)}</string>`,
    '  <key>ProgramArguments</key>',
    '  <array>',
    ...spec.programArguments.map(arg => `    <string>${sanitizeXmlText(arg)}</string>`),
    '  </array>',
    '  <key>RunAtLoad</key>',
    '  <true/>',
    '  <key>KeepAlive</key>',
    '  <false/>',
    '  <key>ProcessType</key>',
    `  <string>${sanitizeXmlText(spec.processType ?? 'Interactive')}</string>`,
  ];
  if (spec.abandonProcessGroup !== false) {
    lines.push('  <key>AbandonProcessGroup</key>', '  <true/>');
  }
  if (spec.workingDirectory) {
    lines.push('  <key>WorkingDirectory</key>', `  <string>${sanitizeXmlText(spec.workingDirectory)}</string>`);
  }
  if (spec.standardOutPath) {
    lines.push('  <key>StandardOutPath</key>', `  <string>${sanitizeXmlText(spec.standardOutPath)}</string>`);
  }
  if (spec.standardErrorPath) {
    lines.push('  <key>StandardErrorPath</key>', `  <string>${sanitizeXmlText(spec.standardErrorPath)}</string>`);
  }
  const entries = Object.entries(spec.environment ?? {}).filter(([, v]) => typeof v === 'string');
  if (entries.length > 0) {
    lines.push('  <key>EnvironmentVariables</key>', '  <dict>');
    for (const [key, value] of entries) {
      lines.push(`    <key>${sanitizeXmlText(key)}</key>`, `    <string>${sanitizeXmlText(value)}</string>`);
    }
    lines.push('  </dict>');
  }
  lines.push('</dict>', '</plist>', '');
  return lines.join('\n');
}

export function parseLaunchctlPrint(output) {
  const stateMatch = /^\tstate = (.+)$/m.exec(output);
  const pidMatch = /^\tpid = (\d+)$/m.exec(output);
  const exitMatch = /^\tlast exit code = (-?\d+)$/m.exec(output);
  const signalMatch = /^\tlast terminating signal = (.+)$/m.exec(output);
  const runsMatch = /^\truns = (\d+)$/m.exec(output);
  return {
    state: stateMatch?.[1]?.trim() ?? 'unknown',
    pid: pidMatch ? Number(pidMatch[1]) : undefined,
    exitCode: exitMatch ? Number(exitMatch[1]) : null,
    signal: signalMatch?.[1]?.trim() ?? null,
    runs: runsMatch ? Number(runsMatch[1]) : undefined,
  };
}

function readStateRecord(filePath) {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (typeof raw?.label !== 'string' || typeof raw?.domain !== 'string') return null;
    return {
      label: raw.label,
      domain: raw.domain,
      pid: typeof raw.pid === 'number' ? raw.pid : undefined,
      labelPrefix: typeof raw.labelPrefix === 'string' ? raw.labelPrefix : '',
      createdAtMs: typeof raw.createdAtMs === 'number' ? raw.createdAtMs : 0,
    };
  } catch {
    return null;
  }
}

function writeStateRecord(stateDir, record) {
  fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  const filePath = path.join(stateDir, `${record.label}.json`);
  const tmpPath = `${filePath}.${process.pid}.${crypto.randomUUID().slice(0, 8)}.tmp`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(record)}\n`, { mode: 0o600 });
  fs.renameSync(tmpPath, filePath);
}

export function pruneExitedLaunchdJobs(stateDir, maxAgeMs = DEFAULT_MAX_AGE_MS, deps = {}) {
  if (!stateDir || !fs.existsSync(stateDir)) return;
  const runCommand = deps.runCommand ?? defaultRunCommand;
  const now = deps.now ?? Date.now;
  const isPidAlive = deps.isPidAlive ?? defaultIsPidAlive;
  let names;
  try {
    names = fs.readdirSync(stateDir);
  } catch {
    return;
  }
  const currentTime = now();
  for (const name of names) {
    if (!name.endsWith('.json') || name.startsWith('.')) continue;
    const filePath = path.join(stateDir, name);
    const record = readStateRecord(filePath);
    if (!record) {
      fs.rmSync(filePath, { force: true });
      continue;
    }
    const target = `${record.domain}/${record.label}`;
    const printed = runCommand(LAUNCHCTL_BINARY, ['print', target], 2500);
    if (printed.status !== 0) {
      fs.rmSync(filePath, { force: true });
      continue;
    }
    const parsed = parseLaunchctlPrint(printed.stdout);
    const activeByState = parsed.state === 'running' || parsed.state === 'spawn scheduled';
    const activeByPid = typeof parsed.pid === 'number' && parsed.pid > 1 && isPidAlive(parsed.pid);
    const expired = record.createdAtMs > 0 && currentTime - record.createdAtMs > maxAgeMs;
    if ((!activeByState && !activeByPid) || (expired && !activeByPid)) {
      runCommand(LAUNCHCTL_BINARY, ['bootout', target], 2500);
      fs.rmSync(filePath, { force: true });
    }
  }
}

function effectiveIsolatedEnvironment(env) {
  const source = env ?? process.env;
  const result = {};
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === 'string' && !STRIPPED_ISOLATED_ENV_KEYS.has(key)) {
      result[key] = value;
    }
  }
  return result;
}

function buildDirectStdio(options) {
  if (options.stdio !== undefined) return { stdio: options.stdio, openedFds: [] };
  const openedFds = [];
  const openAppend = (target) => {
    if (!target) return 'ignore';
    fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
    const fd = fs.openSync(target, 'a', 0o600);
    openedFds.push(fd);
    return fd;
  };
  const out = openAppend(options.standardOutPath);
  const err = options.standardErrorPath
    ? options.standardErrorPath === options.standardOutPath
      ? out
      : openAppend(options.standardErrorPath)
    : out;
  return { stdio: ['ignore', out, err], openedFds };
}

function launchDirect(options, deps) {
  const spawnImpl = deps.spawnImpl ?? spawn;
  const isPidAlive = deps.isPidAlive ?? defaultIsPidAlive;
  const { stdio, openedFds } = buildDirectStdio(options);
  let child;
  try {
    child = spawnImpl(options.command, options.args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      detached: true,
      stdio,
      windowsHide: true,
    });
  } finally {
    for (const fd of openedFds) {
      try { fs.closeSync(fd); } catch { /* Best-effort cleanup. */ }
    }
  }
  let exited = false;
  let trackedExitCode = child.exitCode ?? null;
  let trackedSignal = child.signalCode ?? null;
  child.once('exit', (code, signal) => {
    exited = true;
    trackedExitCode = code;
    trackedSignal = signal;
  });
  child.once('error', () => {
    exited = true;
  });
  child.unref();
  const pid = child.pid ?? 0;
  return {
    pid,
    isolationMode: 'direct',
    child,
    pollStatus: () => {
      const code = child.exitCode ?? trackedExitCode;
      const signal = child.signalCode ?? trackedSignal;
      const running = !exited && code === null && signal === null && (pid > 1 ? isPidAlive(pid) : false);
      return { running, pid: pid > 0 ? pid : undefined, exitCode: code, signal };
    },
    bootout: () => {
      if (pid <= 1) return;
      try {
        process.kill(process.platform === 'win32' ? pid : -pid, 'SIGTERM');
      } catch {
        try { child.kill('SIGTERM'); } catch { /* Best-effort stop. */ }
      }
    },
  };
}

function launchViaLaunchd(options, deps) {
  const runCommand = deps.runCommand ?? defaultRunCommand;
  const sleepSync = deps.sleepSync ?? defaultSleepSync;
  const now = deps.now ?? Date.now;
  const isPidAlive = deps.isPidAlive ?? defaultIsPidAlive;
  const uid = deps.uid ? deps.uid() : typeof process.getuid === 'function' ? process.getuid() : 0;
  const domains = deps.domains ?? [`gui/${uid}`, `user/${uid}`];
  const label = buildJobLabel(options.labelPrefix);
  if (options.stateDir) {
    try { pruneExitedLaunchdJobs(options.stateDir, DEFAULT_MAX_AGE_MS, deps); } catch { /* Best-effort prune. */ }
  }
  const stagingDir = options.stateDir || os.tmpdir();
  fs.mkdirSync(stagingDir, { recursive: true, mode: 0o700 });
  const stagingPlist = path.join(stagingDir, `.staging-${label}.plist`);
  const plistXml = buildLaunchdPlistXml({
    label,
    programArguments: [options.command, ...options.args],
    workingDirectory: options.cwd ?? process.cwd(),
    environment: effectiveIsolatedEnvironment(options.env),
    standardOutPath: options.standardOutPath,
    standardErrorPath: options.standardErrorPath ?? options.standardOutPath,
    processType: options.processType ?? 'Interactive',
    abandonProcessGroup: options.abandonProcessGroup ?? true,
  });

  for (const domain of domains) {
    let boot;
    try {
      fs.writeFileSync(stagingPlist, plistXml, { mode: 0o600 });
      boot = runCommand(LAUNCHCTL_BINARY, ['bootstrap', domain, stagingPlist], 5000);
    } finally {
      fs.rmSync(stagingPlist, { force: true });
    }
    if (boot.status !== 0) continue;

    const target = `${domain}/${label}`;
    const timeoutMs = options.pollTimeoutMs ?? DEFAULT_POLL_TIMEOUT_MS;
    const intervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
    const deadline = now() + timeoutMs;
    let latest = { state: 'unknown', exitCode: null, signal: null };
    while (true) {
      const printed = runCommand(LAUNCHCTL_BINARY, ['print', target], 2500);
      if (printed.status === 0) {
        latest = parseLaunchctlPrint(printed.stdout);
        if (typeof latest.pid === 'number' && latest.pid > 1) break;
        if (latest.state === 'not running' && (latest.runs ?? 0) > 0) break;
      }
      if (now() >= deadline) break;
      sleepSync(intervalMs);
    }
    const capturedPid = typeof latest.pid === 'number' && latest.pid > 1 ? latest.pid : 0;
    const stateFile = options.stateDir ? path.join(options.stateDir, `${label}.json`) : null;
    if (options.stateDir) {
      try {
        writeStateRecord(options.stateDir, {
          label,
          domain,
          pid: capturedPid > 0 ? capturedPid : undefined,
          labelPrefix: options.labelPrefix,
          createdAtMs: now(),
        });
      } catch { /* Non-fatal state persistence error. */ }
    }
    const pollStatus = () => {
      const printed = runCommand(LAUNCHCTL_BINARY, ['print', target], 2500);
      if (printed.status !== 0) {
        if (capturedPid > 1 && isPidAlive(capturedPid)) {
          return { running: true, pid: capturedPid, exitCode: null, signal: null };
        }
        return { running: false, pid: capturedPid > 0 ? capturedPid : undefined, exitCode: latest.exitCode, signal: latest.signal };
      }
      const parsed = parseLaunchctlPrint(printed.stdout);
      latest = parsed;
      const effectivePid = typeof parsed.pid === 'number' && parsed.pid > 1 ? parsed.pid : capturedPid > 0 ? capturedPid : undefined;
      const running = parsed.state === 'running'
        || parsed.state === 'spawn scheduled'
        || (typeof parsed.pid === 'number' && parsed.pid > 1 && isPidAlive(parsed.pid));
      return { running, pid: effectivePid, exitCode: parsed.exitCode, signal: parsed.signal };
    };
    const bootout = () => {
      runCommand(LAUNCHCTL_BINARY, ['bootout', target], 4000);
      if (stateFile) fs.rmSync(stateFile, { force: true });
    };
    return {
      pid: capturedPid,
      isolationMode: 'launchd',
      jobLabel: label,
      domainTarget: domain,
      pollStatus,
      bootout,
    };
  }
  return null;
}

function launchViaSystemd(options, deps) {
  const runCommand = deps.runCommand ?? defaultRunCommand;
  const sleepSync = deps.sleepSync ?? defaultSleepSync;
  const now = deps.now ?? Date.now;
  const isPidAlive = deps.isPidAlive ?? defaultIsPidAlive;
  const unitName = `buildr-${sanitizeLabelSegment(options.labelPrefix)}-${process.pid}-${crypto.randomUUID().slice(0, 8)}.service`;
  const runArgs = [
    '--user',
    `--unit=${unitName}`,
    '--collect',
    '--property=KillMode=control-group',
    `--working-directory=${options.cwd ?? process.cwd()}`,
  ];
  if (options.standardOutPath) runArgs.push(`--property=StandardOutput=append:${options.standardOutPath}`);
  if (options.standardErrorPath ?? options.standardOutPath) {
    runArgs.push(`--property=StandardError=append:${options.standardErrorPath ?? options.standardOutPath}`);
  }
  for (const [key, value] of Object.entries(effectiveIsolatedEnvironment(options.env))) {
    runArgs.push(`--setenv=${key}=${value}`);
  }
  runArgs.push('--', options.command, ...options.args);
  if (runCommand('systemd-run', runArgs, 5000).status !== 0) return null;
  const readSystemdProps = () => {
    const show = runCommand(
      'systemctl',
      ['--user', 'show', unitName, '--property=MainPID,ActiveState,SubState,ExecMainStatus'],
      2500,
    );
    const props = new Map();
    for (const line of show.stdout.split('\n')) {
      const idx = line.indexOf('=');
      if (idx > 0) props.set(line.slice(0, idx), line.slice(idx + 1).trim());
    }
    const rawPid = Number(props.get('MainPID') || '0');
    const rawCode = props.get('ExecMainStatus');
    return {
      activeState: props.get('ActiveState') || 'unknown',
      mainPid: Number.isInteger(rawPid) && rawPid > 1 ? rawPid : 0,
      exitCode: rawCode && /^-?\d+$/.test(rawCode) ? Number(rawCode) : null,
    };
  };
  const deadline = now() + (options.pollTimeoutMs ?? DEFAULT_POLL_TIMEOUT_MS);
  const intervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  let info = readSystemdProps();
  while (info.mainPid === 0 && (info.activeState === 'activating' || info.activeState === 'active') && now() < deadline) {
    sleepSync(intervalMs);
    info = readSystemdProps();
  }
  const capturedPid = info.mainPid;
  return {
    pid: capturedPid,
    isolationMode: 'systemd',
    jobLabel: unitName,
    domainTarget: 'systemd-user',
    pollStatus: () => {
      const current = readSystemdProps();
      const pid = current.mainPid || capturedPid || undefined;
      const running = current.activeState === 'active'
        || current.activeState === 'activating'
        || (typeof pid === 'number' && pid > 1 && isPidAlive(pid));
      return { running, pid, exitCode: running ? null : current.exitCode, signal: null };
    },
    bootout: () => {
      runCommand('systemctl', ['--user', 'stop', unitName], 4000);
    },
  };
}

export function launchDetachedProcess(options, deps = {}) {
  if (deps.spawnImpl) return launchDirect(options, deps);
  const env = deps.env ?? options.env ?? process.env;
  const runCommand = deps.runCommand ?? defaultRunCommand;
  const mode = shouldUsePlatformIsolation(env, {
    platform: deps.platform,
    hasSystemd: deps.hasSystemd ?? (() => defaultHasSystemd(runCommand, env)),
  });
  if (mode === 'launchd') {
    const handle = launchViaLaunchd(options, deps);
    if (handle) return handle;
  } else if (mode === 'systemd') {
    const handle = launchViaSystemd(options, deps);
    if (handle) return handle;
  }
  return launchDirect(options, deps);
}
