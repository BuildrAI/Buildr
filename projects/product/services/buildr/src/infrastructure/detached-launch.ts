import { execFileSync, spawn, type ChildProcess, type StdioOptions } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { atomicWriteFile } from './filesystem/atomic-files.ts';

export type IsolationMode = 'launchd' | 'systemd' | 'direct';

export interface DetachedProcessStatus {
  running: boolean;
  pid?: number;
  exitCode: number | null;
  signal: string | null;
}

export interface DetachedProcessHandle {
  pid: number;
  isolationMode: IsolationMode;
  jobLabel?: string;
  domainTarget?: string;
  child?: ChildProcess;
  pollStatus: () => DetachedProcessStatus;
  bootout: () => void;
}

export interface DetachedLaunchOptions {
  command: string;
  args: string[];
  cwd?: string;
  env?: Record<string, string | undefined>;
  labelPrefix: string;
  stateDir?: string;
  standardOutPath?: string;
  standardErrorPath?: string;
  stdio?: StdioOptions;
  processType?: 'Interactive' | 'Standard' | 'Background';
  abandonProcessGroup?: boolean;
  pollTimeoutMs?: number;
  pollIntervalMs?: number;
}

export interface LaunchctlCommandResult {
  status: number | null;
  stdout: string;
  stderr: string;
  error?: Error;
}

export interface DetachedLaunchDeps {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  uid?: () => number;
  hasSystemd?: () => boolean;
  runCommand?: (file: string, args: string[], timeoutMs?: number) => LaunchctlCommandResult;
  spawnImpl?: typeof spawn;
  domains?: string[];
  sleepSync?: (ms: number) => void;
  now?: () => number;
  isPidAlive?: (pid: number) => boolean;
}

export interface LaunchdPlistSpec {
  label: string;
  programArguments: string[];
  workingDirectory?: string;
  environment?: Record<string, string | undefined>;
  standardOutPath?: string;
  standardErrorPath?: string;
  processType?: 'Interactive' | 'Standard' | 'Background';
  abandonProcessGroup?: boolean;
}

export interface ParsedLaunchctlPrint {
  state: string;
  pid?: number;
  exitCode: number | null;
  signal: string | null;
  runs?: number;
}

interface LaunchdStateRecord {
  label: string;
  domain: string;
  pid?: number;
  labelPrefix: string;
  createdAtMs: number;
}

const DEFAULT_POLL_TIMEOUT_MS = 2000;
const DEFAULT_POLL_INTERVAL_MS = 20;
const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const LAUNCHCTL_BINARY = '/bin/launchctl';

function defaultSleepSync(ms: number): void {
  if (ms <= 0) return;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function defaultIsPidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 1) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function defaultRunCommand(file: string, args: string[], timeoutMs = 5000): LaunchctlCommandResult {
  try {
    const stdout = execFileSync(file, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: timeoutMs,
    });
    return { status: 0, stdout: String(stdout ?? ''), stderr: '' };
  } catch (error) {
    const err = error as NodeJS.ErrnoException & { status?: number | null; stdout?: unknown; stderr?: unknown };
    return {
      status: typeof err.status === 'number' ? err.status : 1,
      stdout: typeof err.stdout === 'string' ? err.stdout : Buffer.isBuffer(err.stdout) ? err.stdout.toString('utf8') : '',
      stderr: typeof err.stderr === 'string' ? err.stderr : Buffer.isBuffer(err.stderr) ? err.stderr.toString('utf8') : '',
      error: err,
    };
  }
}

function defaultHasSystemd(runCommand: (file: string, args: string[], timeoutMs?: number) => LaunchctlCommandResult, env: NodeJS.ProcessEnv): boolean {
  if (!env.XDG_RUNTIME_DIR) return false;
  const probe = runCommand('systemd-run', ['--version'], 1500);
  return probe.status === 0;
}

function sanitizeLabelSegment(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned || 'worker';
}

function buildJobLabel(prefix: string): string {
  return `ai.buildr.${sanitizeLabelSegment(prefix)}.${process.pid}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
}

function sanitizeXmlText(value: string): string {
  return value
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function isTestIsolationDisabled(env: NodeJS.ProcessEnv): boolean {
  return env.BUILDR_TEST_STATE_REQUIRED === '1' || Boolean(env.NODE_TEST_CONTEXT);
}

/**
 * Determine how a detached child process should be isolated from the parent's desktop app lifecycle.
 */
export function shouldUsePlatformIsolation(
  env: NodeJS.ProcessEnv = process.env,
  deps: { platform?: NodeJS.Platform; hasSystemd?: () => boolean } = {},
): IsolationMode {
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

/**
 * Build a launchd plist document for an independently spawned background process.
 */
export function buildLaunchdPlistXml(spec: LaunchdPlistSpec): string {
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    '<dict>',
    `  <key>Label</key>`,
    `  <string>${sanitizeXmlText(spec.label)}</string>`,
    '  <key>ProgramArguments</key>',
    '  <array>',
    ...spec.programArguments.map(arg => `    <string>${sanitizeXmlText(arg)}</string>`),
    '  </array>',
    '  <key>RunAtLoad</key>',
    '  <true/>',
    '  <key>KeepAlive</key>',
    '  <false/>',
    `  <key>ProcessType</key>`,
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
  const entries = Object.entries(spec.environment ?? {}).filter((entry): entry is [string, string] => typeof entry[1] === 'string');
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

/**
 * Parse top-level fields from `launchctl print <domain>/<label>` output.
 * Top-level service properties use single-tab indentation; nested coalition/endpoint blocks use two or more tabs.
 */
export function parseLaunchctlPrint(output: string): ParsedLaunchctlPrint {
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

function readStateRecord(filePath: string): LaunchdStateRecord | null {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Partial<LaunchdStateRecord>;
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

function writeStateRecord(stateDir: string, record: LaunchdStateRecord): void {
  fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  const filePath = path.join(stateDir, `${record.label}.json`);
  atomicWriteFile(filePath, `${JSON.stringify(record)}\n`, 'utf8', { mode: 0o600 });
}

/**
 * Remove exited Buildr temporary launchd jobs recorded in `stateDir`.
 */
export function pruneExitedLaunchdJobs(
  stateDir: string,
  maxAgeMs = DEFAULT_MAX_AGE_MS,
  deps: Pick<DetachedLaunchDeps, 'runCommand' | 'now' | 'isPidAlive'> = {},
): void {
  if (!stateDir || !fs.existsSync(stateDir)) return;
  const runCommand = deps.runCommand ?? defaultRunCommand;
  const now = deps.now ?? Date.now;
  const isPidAlive = deps.isPidAlive ?? defaultIsPidAlive;
  let names: string[];
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
    if (!activeByState && !activeByPid) {
      runCommand(LAUNCHCTL_BINARY, ['bootout', target], 2500);
      fs.rmSync(filePath, { force: true });
      continue;
    }
    if (expired && !activeByPid) {
      runCommand(LAUNCHCTL_BINARY, ['bootout', target], 2500);
      fs.rmSync(filePath, { force: true });
    }
  }
}

function buildDirectStdio(options: DetachedLaunchOptions): { stdio: StdioOptions; openedFds: number[] } {
  if (options.stdio !== undefined) return { stdio: options.stdio, openedFds: [] };
  const openedFds: number[] = [];
  const openAppend = (target?: string): number | 'ignore' => {
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

function launchDirect(options: DetachedLaunchOptions, deps: DetachedLaunchDeps): DetachedProcessHandle {
  const spawnImpl = deps.spawnImpl ?? spawn;
  const isPidAlive = deps.isPidAlive ?? defaultIsPidAlive;
  const { stdio, openedFds } = buildDirectStdio(options);
  let child: ChildProcess;
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
      try { fs.closeSync(fd); } catch { /* Best-effort descriptor cleanup. */ }
    }
  }
  let exited = false;
  let trackedExitCode: number | null = child.exitCode ?? null;
  let trackedSignal: string | null = child.signalCode ?? null;
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
    pollStatus: (): DetachedProcessStatus => {
      const code = child.exitCode ?? trackedExitCode;
      const signal = child.signalCode ?? trackedSignal;
      const running = !exited && code === null && signal === null && (pid > 1 ? isPidAlive(pid) : false);
      return { running, pid: pid > 0 ? pid : undefined, exitCode: code, signal };
    },
    bootout: (): void => {
      if (pid <= 1) return;
      try {
        process.kill(process.platform === 'win32' ? pid : -pid, 'SIGTERM');
      } catch {
        try { child.kill('SIGTERM'); } catch { /* Best-effort stop. */ }
      }
    },
  };
}

const STRIPPED_ISOLATED_ENV_KEYS = new Set(['NODE_CHANNEL_FD', 'NODE_CHANNEL_SERIALIZATION_MODE']);

function effectiveIsolatedEnvironment(env?: Record<string, string | undefined>): Record<string, string> {
  const source = env ?? process.env;
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === 'string' && !STRIPPED_ISOLATED_ENV_KEYS.has(key)) {
      result[key] = value;
    }
  }
  return result;
}

function launchViaLaunchd(options: DetachedLaunchOptions, deps: DetachedLaunchDeps): DetachedProcessHandle | null {
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
    let boot: LaunchctlCommandResult;
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
    let latest: ParsedLaunchctlPrint = { state: 'unknown', exitCode: null, signal: null };
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
    const pollStatus = (): DetachedProcessStatus => {
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
      return {
        running,
        pid: effectivePid,
        exitCode: parsed.exitCode,
        signal: parsed.signal,
      };
    };
    const bootout = (): void => {
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

function launchViaSystemd(options: DetachedLaunchOptions, deps: DetachedLaunchDeps): DetachedProcessHandle | null {
  const runCommand = deps.runCommand ?? defaultRunCommand;
  const sleepSync = deps.sleepSync ?? defaultSleepSync;
  const now = deps.now ?? Date.now;
  const isPidAlive = deps.isPidAlive ?? defaultIsPidAlive;
  const unitName = `buildr-${sanitizeLabelSegment(options.labelPrefix)}-${process.pid}-${crypto.randomUUID().slice(0, 8)}.service`;
  const runArgs: string[] = [
    '--user',
    `--unit=${unitName}`,
    '--collect',
    '--property=KillMode=control-group',
  ];
  const workingDirectory = options.cwd ?? process.cwd();
  runArgs.push(`--working-directory=${workingDirectory}`);
  if (options.standardOutPath) runArgs.push(`--property=StandardOutput=append:${options.standardOutPath}`);
  if (options.standardErrorPath ?? options.standardOutPath) {
    runArgs.push(`--property=StandardError=append:${options.standardErrorPath ?? options.standardOutPath}`);
  }
  for (const [key, value] of Object.entries(effectiveIsolatedEnvironment(options.env))) {
    runArgs.push(`--setenv=${key}=${value}`);
  }
  runArgs.push('--', options.command, ...options.args);
  const started = runCommand('systemd-run', runArgs, 5000);
  if (started.status !== 0) return null;
  const readSystemdProps = (): { activeState: string; subState: string; mainPid: number; exitCode: number | null } => {
    const show = runCommand(
      'systemctl',
      ['--user', 'show', unitName, '--property=MainPID,ActiveState,SubState,ExecMainStatus'],
      2500,
    );
    const props = new Map<string, string>();
    for (const line of show.stdout.split('\n')) {
      const idx = line.indexOf('=');
      if (idx > 0) props.set(line.slice(0, idx), line.slice(idx + 1).trim());
    }
    const rawPid = Number(props.get('MainPID') || '0');
    const rawCode = props.get('ExecMainStatus');
    return {
      activeState: props.get('ActiveState') || 'unknown',
      subState: props.get('SubState') || 'unknown',
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
    pollStatus: (): DetachedProcessStatus => {
      const current = readSystemdProps();
      const pid = current.mainPid || capturedPid || undefined;
      const running = current.activeState === 'active'
        || current.activeState === 'activating'
        || (typeof pid === 'number' && pid > 1 && isPidAlive(pid));
      return {
        running,
        pid,
        exitCode: running ? null : current.exitCode,
        signal: null,
      };
    },
    bootout: (): void => {
      runCommand('systemctl', ['--user', 'stop', unitName], 4000);
    },
  };
}

/**
 * Launch a detached process using the safest coalition/service isolation available on the host OS.
 */
export function launchDetachedProcess(options: DetachedLaunchOptions, deps: DetachedLaunchDeps = {}): DetachedProcessHandle {
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
