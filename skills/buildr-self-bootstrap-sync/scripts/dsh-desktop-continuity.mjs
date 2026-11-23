import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const app = '/Applications/DeepSeek Harness.app';
const executable = `${app}/Contents/MacOS/DeepSeek Harness`;
const bundle = 'com.deepseek.dsh';
const stateName = 'dsh-development-desktop.json';
const native = `ObjC.import('AppKit');
function run(args) {
  const complete = ObjC.unwrap($.NSRunningApplication.runningApplicationsWithBundleIdentifier('com.deepseek.dsh'));
  const current = complete.filter(a => !a.terminated).map(a => ({
    pid: a.processIdentifier, app: ObjC.unwrap(a.bundleURL.path), startedAt: Number(a.launchDate.timeIntervalSince1970) * 1000,
    ready: a.finishedLaunching,
  }));
  if (args[0] === 'quit') {
    if (current.length !== 1 || current[0].app !== args[3] || current[0].pid !== Number(args[1]) || current[0].startedAt !== Number(args[2])) return 'changed';
    const target = $.NSRunningApplication.runningApplicationWithProcessIdentifier(current[0].pid);
    if (!target || target.terminated || !target.terminate) return 'refused';
    return 'accepted';
  }
  return JSON.stringify(current);
}`;

function json(text) {
  try { return JSON.parse(String(text)); } catch { return null; }
}

function sameRealPath(left, right) {
  try { return path.isAbsolute(left) && fs.realpathSync(left) === fs.realpathSync(right); } catch { return false; }
}

/** Native operations are owned by the independent self-bootstrap worker. */
export function dshDesktopContinuity({ root, home, nodeExecutable, dataRoot, run, env, exited, boundMs = 15000 }) {
  const quiet = (program, args, id) => run(program, args, id, env, { timeout: 4000 }, false);
  const nativeCommand = (action, ...args) => quiet('/usr/bin/osascript', ['-l', 'JavaScript', '-e', native, action, ...args], `dsh-desktop-${action}`);
  const inspect = () => {
    const result = nativeCommand('inspect');
    const entries = result.status === 0 ? json(result.stdout) : null;
    if (!Array.isArray(entries) || entries.length !== 1 || entries[0]?.app !== app || !entries[0].ready
        || !Number.isSafeInteger(entries[0].pid) || entries[0].pid < 2 || !Number.isFinite(entries[0].startedAt) || entries[0].startedAt <= 0) return null;
    return entries[0];
  };
  const state = () => {
    try {
      const file = path.join(dataRoot, 'agent-service', stateName);
      if (fs.realpathSync(file) !== file) return null;
      const fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
      try {
        const stat = fs.fstatSync(fd);
        if (!stat.isFile() || stat.size > 8192 || stat.uid !== process.getuid?.() || (stat.mode & 0o077)) return null;
        return json(fs.readFileSync(fd, 'utf8'));
      } finally { fs.closeSync(fd); }
    } catch { return null; }
  };
  const prove = (entryDigest, nonce) => {
    const current = inspect(), binding = state();
    if (!current || binding?.schemaVersion !== 'buildr.dsh-development-desktop/v1'
        || binding.desktopPid !== current.pid || !Number.isSafeInteger(binding.hostPid) || binding.hostPid === current.pid || binding.hostPid < 2
        || !Number.isFinite(binding.observedAt) || binding.observedAt < current.startedAt - 1000
        || binding.entryDigest !== entryDigest || (nonce !== undefined && binding.nonce !== nonce)
        || binding.dataRoot !== dataRoot || !sameRealPath(binding.dshHome, path.join(home, '.dsh'))
        || !sameRealPath(binding.packageRoot, path.join(root, 'projects/product/services/buildr/node_modules/@buildr-ai/buildr-harness'))
        || !(sameRealPath(binding.node, nodeExecutable) || sameRealPath(binding.node, path.join(home, 'Library/Application Support/Buildr/runtime/node')))
        || typeof binding.port !== 'string' || !/^[0-9]{1,5}$/.test(binding.port) || Number(binding.port) < 1 || Number(binding.port) > 65535) return null;
    const probe = quiet('/bin/ps', ['-axo', 'pid=,ppid=,uid=,comm='], 'dsh-desktop-processes');
    if (probe.status !== 0) return null;
    const all = String(probe.stdout).split('\n').map(line => /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.+)$/.exec(line)).filter(Boolean);
    const mains = all.filter(item => item[4] === executable);
    const uid = process.getuid?.();
    if (mains.length !== 2 || !mains.some(item => Number(item[1]) === current.pid && Number(item[3]) === uid)
        || !mains.some(item => Number(item[1]) === binding.hostPid && Number(item[2]) === current.pid && Number(item[3]) === uid)) return null;
    const argv = quiet('/bin/ps', ['-p', String(current.pid), '-o', 'command='], 'dsh-desktop-original-launch');
    if (argv.status !== 0 || String(argv.stdout).trim() !== executable) return null;
    return { current, binding };
  };
  const waitFor = condition => {
    const deadline = performance.now() + boundMs;
    const pause = new Int32Array(new SharedArrayBuffer(4));
    do {
      const result = condition();
      if (result) return result;
      Atomics.wait(pause, 0, 0, Math.max(0, Math.min(250, deadline - performance.now())));
    } while (performance.now() < deadline);
    return null;
  };
  return {
    quit(entryDigest, beforeQuit = () => true) {
      const verified = prove(entryDigest);
      if (!verified || !beforeQuit()) return { status: 'unconfirmed' };
      const result = nativeCommand('quit', String(verified.current.pid), String(verified.current.startedAt), app);
      if (result.status !== 0 || String(result.stdout).trim() !== 'accepted') return { status: 'not-accepted' };
      return waitFor(exited) ? { status: 'exited', verified } : { status: 'not-exited' };
    },
    reopen(verified, entryDigest) {
      if (!exited()) return { status: 'not-reopened', desktopLoaded: false };
      const nonce = randomBytes(16).toString('hex');
      const { binding } = verified;
      const command = ['/usr/bin/open', ['-a', app, '--env', `DSH_HOME=${binding.dshHome}`, '--env', `BUILDR_HARNESS_DSH_NODE=${binding.node}`,
        '--env', `BUILDR_HARNESS_DSH_PACKAGE_ROOT=${binding.packageRoot}`, '--env', `BUILDR_HARNESS_DSH_DATA_ROOT=${binding.dataRoot}`,
        '--env', `BUILDR_HARNESS_DSH_PORT=${binding.port}`, '--env', `BUILDR_HARNESS_DSH_LAUNCH_NONCE=${nonce}`]];
      quiet(command[0], command[1], 'dsh-desktop-reopen');
      const loaded = waitFor(() => {
        const seen = prove(entryDigest, nonce);
        return seen && seen.current.startedAt > verified.current.startedAt ? seen : null;
      });
      return loaded ? { status: 'reopened', desktopLoaded: true }
        : { status: inspect() ? 'opened-load-unconfirmed' : 'launch-unconfirmed', desktopLoaded: false };
    },
  };
}
