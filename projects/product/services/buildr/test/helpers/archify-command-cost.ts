import childProcess from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { syncBuiltinESMExports } from 'node:module';
import { fileURLToPath } from 'node:url';

export const ARCHIFY_COST_ROLES = Object.freeze([
  'workspace-init', 'component-list', 'runtime-sync', 'component-install', 'component-install',
  'runtime-sync', 'component-check', 'project-create', 'installed-renderer', 'runtime-sync',
  'component-uninstall', 'component-uninstall', 'runtime-sync',
]);
const serviceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cliEntry = path.join(serviceRoot, 'bin/buildr.mjs');
const hookUrl = import.meta.url;
const validOrdinal = (value: any): boolean => Number.isInteger(value) && value >= 1 && value <= ARCHIFY_COST_ROLES.length;
const absolute = (value: any): value is string => typeof value === 'string' && !/[\u0000-\u001f\u007f]/u.test(value) && path.isAbsolute(value);

export function archifyCostEnvironment(env: any, ordinal: any): any {
  if (env.BUILDR_ARCHIFY_COST_DIAGNOSTICS !== '1' || !absolute(env.BUILDR_DIAGNOSTICS_OUTPUT) || !validOrdinal(ordinal)) return env;
  return { ...env, NODE_OPTIONS: `${env.NODE_OPTIONS || ''} --import=${hookUrl}`.trim(),
    BUILDR_ARCHIFY_COST_ROLE: ARCHIFY_COST_ROLES[ordinal - 1], BUILDR_ARCHIFY_COST_ORDINAL: String(ordinal),
    BUILDR_ARCHIFY_COST_OUTPUT_ROOT: path.join(env.BUILDR_DIAGNOSTICS_OUTPUT, 'archify-cost') };
}

function commandRole(args: string[]): string | null {
  if (args[0] === 'doctor') return 'final-doctor';
  if (args[0] === 'init' && args[1] === '--name' && args[2] === 'archify-component') return 'workspace-init';
  if (args[0] === 'sync' && args[1] === 'codex') return 'runtime-sync';
  if (args[0] === 'project' && args[1] === 'create' && args[2] === 'example') return 'project-create';
  if (args[0] === 'component' && args[1] === 'list') return 'component-list';
  if (args[0] === 'component' && args[2] === 'archify' && ['install', 'check', 'uninstall'].includes(args[1])) return `component-${args[1]}`;
  return null;
}
const ordinal = Number(process.env.BUILDR_ARCHIFY_COST_ORDINAL);
const entry = process.argv[1] ? path.resolve(process.argv[1]) : null;
const renderer = absolute(process.env.BUILDR_SMOKE_WORKSPACE_ROOT)
  ? path.join(process.env.BUILDR_SMOKE_WORKSPACE_ROOT, '.agents/skills/archify/assets/archify/bin/archify.mjs') : null;
const role = entry === cliEntry ? commandRole(process.argv.slice(2))
  : entry === renderer && process.argv[2] === 'deliver' && process.argv[3] === 'architecture' ? 'installed-renderer' : null;
const outputRoot: any = process.env.BUILDR_ARCHIFY_COST_OUTPUT_ROOT;
const enabled = process.env.BUILDR_ARCHIFY_COST_DIAGNOSTICS === '1' && absolute(process.env.BUILDR_DIAGNOSTICS_OUTPUT)
  && outputRoot === path.join(process.env.BUILDR_DIAGNOSTICS_OUTPUT, 'archify-cost') && validOrdinal(ordinal)
  && process.env.BUILDR_ARCHIFY_COST_ROLE === ARCHIFY_COST_ROLES[ordinal - 1]
  && (role === 'final-doctor' || role === ARCHIFY_COST_ROLES[ordinal - 1]);

if (enabled) {
  // Counters never retain paths, arguments, environment values or file contents.
  // Only exact CLI/renderer entries enable this hook; inherited helpers stay inert.
  const started = process.hrtime.bigint();
  const initialCpu = process.cpuUsage();
  const originalMkdir = fs.mkdirSync;
  const originalWrite = fs.writeFileSync;
  const git = new Map<string, any>();
  const filesystem = new Map<string, any>();
  const children = new Map<string, any>();
  const frames: Array<{ childMs: number }> = [];
  let observerFailures = 0;
  const duration = (since: bigint): number => Number(process.hrtime.bigint() - since) / 1e6;
  const finite = (value: number): number => Number.isFinite(value) && value >= 0 ? value : 0;
  const observe = (callback: () => void): void => { try { callback(); } catch { observerFailures++; } };
  const under = (root: any, value: any): boolean => Boolean(root && (value === root || value.startsWith(`${root}${path.sep}`)));
  const resolve = (value: any): string | null => {
    if (value instanceof URL) value = fileURLToPath(value);
    if (Buffer.isBuffer(value)) value = value.toString();
    return typeof value === 'string' ? path.resolve(value) : null;
  };
  function category(value: any): string {
    const actual = resolve(value);
    if (!actual) return 'other';
    if (under(serviceRoot, actual)) {
      const first = path.relative(serviceRoot, actual).split(path.sep)[0];
      return first === 'resources' ? 'package-resource' : first === 'node_modules' ? 'runtime-dependency'
        : ['src', 'bin', 'tools', 'test'].includes(first) ? 'product-source' : 'product-other';
    }
    const smoke = process.env.BUILDR_SMOKE_ROOT;
    if (!absolute(smoke) || !under(smoke, actual)) return 'other';
    const relative = path.relative(smoke, actual).split(path.sep);
    return relative[0] === 'workspace' ? relative[1] === '.agents' ? 'fixture-projection' : 'fixture-source'
      : relative[0] === 'user' ? 'fixture-home' : ['app-data', 'product-data'].includes(relative[0]) ? 'fixture-local-state' : 'fixture-other';
  }
  function counter(map: Map<string, any>, identity: any): any {
    const key = JSON.stringify(identity);
    if (!map.has(key)) map.set(key, { ...identity, count: 0, errorCount: 0, nonzeroCount: 0, wallMs: 0 });
    return map.get(key);
  }
  function measuredFs(api: string, original: any): any {
    return function (this: any, ...args: any[]): any {
      const since = process.hrtime.bigint();
      const frame = { childMs: 0 };
      frames.push(frame);
      let result: any;
      let failed = false;
      try { result = Reflect.apply(original, this, args); return result; }
      catch (error) { failed = true; throw error; }
      finally {
        const wallMs = duration(since);
        frames.pop();
        if (frames.length) frames[frames.length - 1].childMs += wallMs;
        observe(() => {
          const record = counter(filesystem, { api, category: category(args[0]) });
          record.count++; record.errorCount += Number(failed); record.wallMs += finite(wallMs);
          record.exclusiveWallMs = (record.exclusiveWallMs || 0) + finite(wallMs - frame.childMs);
          record.readBytes = (record.readBytes || 0) + (!failed && api === 'readFileSync'
            ? Buffer.isBuffer(result) ? result.length : typeof result === 'string' ? Buffer.byteLength(result) : 0 : 0);
        });
      }
    };
  }
  for (const api of ['readFileSync', 'readdirSync', 'statSync', 'lstatSync', 'realpathSync', 'copyFileSync', 'cpSync']) {
    const original: any = (fs as any)[api];
    const measured: any = measuredFs(api, original);
    if (api === 'realpathSync') measured.native = measuredFs('realpathSync.native', original.native);
    (fs as any)[api] = measured;
  }
  const operations = new Set(['init', 'config', 'add', 'commit', 'merge', 'rev-parse', 'status', 'for-each-ref', 'worktree',
    'tag', 'branch', 'checkout', 'mv', 'diff', 'diff-tree', 'diff-index', 'ls-tree', 'show', 'log', 'cat-file',
    'symbolic-ref', 'check-attr', 'ls-files', 'remote', 'show-ref', 'check-ref-format']);
  const flags = ['--show-toplevel', '--git-dir', '--git-common-dir', '--path-format=absolute', '--is-inside-work-tree',
    '--is-bare-repository', '--verify', '--abbrev-ref', '--symbolic-full-name'];
  function gitIdentity(args: any[], options: any): any {
    let cwd = options?.cwd || process.cwd();
    let index = 0;
    while (index < args.length) {
      if (args[index] === '-C') { cwd = path.resolve(String(cwd), String(args[index + 1])); index += 2; }
      else if (['-c', '--git-dir', '--work-tree', '--namespace', '--exec-path'].includes(args[index])) index += 2;
      else if (String(args[index]).startsWith('-')) index++;
      else break;
    }
    const operation = operations.has(args[index]) ? args[index] : 'other';
    const actual = resolve(cwd);
    return { operation, flags: operation === 'rev-parse' ? flags.filter(flag => args.slice(index + 1).includes(flag)) : [],
      cwdRole: actual === serviceRoot || actual === path.resolve(serviceRoot, '../../../..') ? 'product-root'
        : absolute(process.env.BUILDR_SMOKE_ROOT) && under(process.env.BUILDR_SMOKE_ROOT, actual) ? 'owned-temporary-workspace' : 'other' };
  }
  for (const api of ['spawnSync', 'execFileSync']) {
    const original: any = (childProcess as any)[api];
    (childProcess as any)[api] = function (this: any, ...call: any[]): any {
      const args = Array.isArray(call[1]) ? call[1] : [];
      const options = call[Array.isArray(call[1]) ? 2 : 1];
      let identity: any = null;
      let map: any = null;
      observe(() => {
        if (typeof call[0] === 'string' && /^(?:git|git\.exe)$/iu.test(path.basename(call[0]))) { identity = { api, ...gitIdentity(args, options) }; map = git; }
        else if ((call[0] === process.execPath || call[0] === 'node' || call[0] === 'node.exe')
          && typeof args[0] === 'string' && path.resolve(args[0]) === cliEntry && args[1] === 'doctor') {
          identity = { api, role: 'final-doctor' }; map = children;
        }
      });
      const since = process.hrtime.bigint();
      let status: number | null = null;
      let failed = false;
      try {
        const result = Reflect.apply(original, this, call);
        status = api === 'spawnSync' ? result.status : 0;
        failed = api === 'spawnSync' && Boolean(result.error);
        return result;
      }
      catch (error: any) { failed = true; status = Number.isInteger(error?.status) ? error.status : null; throw error; }
      finally { if (map) observe(() => {
        const record = counter(map, identity);
        record.count++; record.errorCount += Number(failed); record.nonzeroCount += Number(Number.isInteger(status) && status !== 0);
        record.wallMs += finite(duration(since));
      }); }
    };
  }
  syncBuiltinESMExports();
  // A killed process may have no exit record. Absence is a diagnostic gap, not zero cost.
  process.once('exit', status => {
    try {
      const cpu = process.cpuUsage(initialCpu);
      const record = { schemaVersion: 'buildr.archify-command-cost/v1', role, ordinal, pid: process.pid, ppid: process.ppid,
        status: Number.isInteger(status) ? status : null, observedWallMs: finite(duration(started)),
        cpuUserMs: finite(cpu.user / 1000), cpuSystemMs: finite(cpu.system / 1000), observerFailures,
        git: [...git.values()], fs: [...filesystem.values()], children: [...children.values()],
        directDoctorWallMs: [...children.values()].reduce((total, child) => total + child.wallMs, 0) };
      Reflect.apply(originalMkdir, fs, [outputRoot, { recursive: true, mode: 0o700 }]);
      Reflect.apply(originalWrite, fs, [path.join(outputRoot, `${process.pid}.json`), `${JSON.stringify(record)}\n`, { mode: 0o600 }]);
    } catch {
      try { process.stderr.write(`[buildr-archify-cost-gap] ${JSON.stringify({ role, ordinal, reason: 'write-failed' })}\n`); } catch {}
    }
  });
}
