import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import type { ConnectionProgram } from '../domain/definition.ts';
import { failure } from '../domain/instance.ts';
import { digest, safePath } from '../persistence/files.ts';

export type ProgramSource = { definition: { programs: Record<string, ConnectionProgram> }; skill: { sourcePath: string; directory?: string } };
export type ResolvedProgram = { executable: string; args: string[]; cwd: string; identity: string; recipient: string; declaration: ConnectionProgram };
const environment = () => Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'PATHEXT', 'TEMP', 'TMP', 'TMPDIR', 'LANG', 'LC_ALL'].filter(key => process.env[key] !== undefined).map(key => [key, process.env[key]!]));
export function locateExecutable(name: string): string | null {
  if (name === 'node') return fs.realpathSync(process.execPath);
  if (!name || /[/\\\s\0]/.test(name)) return null;
  const extensions = process.platform === 'win32' ? ['', ...(process.env.PATHEXT || '.EXE;.CMD').split(';')] : [''];
  for (const directory of (process.env.PATH || '').split(path.delimiter).filter(Boolean)) for (const extension of extensions) {
    const file = path.resolve(directory, name + extension);
    try { if (fs.statSync(file).isFile()) { fs.accessSync(file, fs.constants.X_OK); return fs.realpathSync(file); } } catch { /* Try next declared search location. */ }
  }
  return null;
}
function programFiles(directory: string): string {
  const hash = crypto.createHash('sha256'); let bytes = 0;
  const visit = (current: string) => {
    safePath(directory, current);
    for (const name of fs.readdirSync(current).sort()) {
      const file = path.join(current, name); safePath(directory, file);
      const stat = fs.lstatSync(file);
      if (stat.isDirectory()) visit(file);
      else if (stat.isFile()) {
        bytes += stat.size;
        if (bytes > 32 * 1024 * 1024) throw failure('connection_skill_program_large', '随附程序目录超过观察大小限制。');
        hash.update(path.relative(directory, file)).update('\0').update(fs.readFileSync(file)).update('\0');
      }
    }
  };
  visit(directory); return hash.digest('hex');
}
export function programRecipient(root: string, source: ProgramSource): string {
  return digest(Object.entries(source.definition.programs).sort(([a], [b]) => a.localeCompare(b)).map(([id, p]) => [id, p.kind, p.entry ?? null, p.runtime ?? null, p.executable ?? null, p.args ?? [], p.kind === 'installed' ? locateExecutable(p.executable!) : p.runtime && p.runtime !== 'node' ? locateExecutable(p.runtime) : null]));
}
export function resolveProgram(root: string, source: ProgramSource, id: string): ResolvedProgram {
  const p = source.definition.programs[id]; if (!p) throw failure('connection_skill_program_missing', '接入未声明此程序。', 404);
  const cwd = source.skill.directory || path.resolve(root, source.skill.sourcePath);
  let executable: string | null, args = [...(p.args || [])];
  let entry = '';
  if (p.kind === 'bundled') {
    entry = path.resolve(cwd, p.entry!); safePath(cwd, entry);
    if (!fs.existsSync(entry) || !fs.statSync(entry).isFile()) throw failure('connection_skill_program_missing', '随附程序不存在，请检查技能源附件。');
    executable = p.runtime ? locateExecutable(p.runtime) : entry;
    if (p.runtime) args.unshift(entry);
  } else executable = locateExecutable(p.executable!);
  if (!executable) throw failure('connection_skill_dependency_missing', '程序或运行依赖未安装。' + (p.installHint || ''));
  try { fs.accessSync(executable, fs.constants.X_OK); } catch { throw failure('connection_skill_program_unavailable', '程序不可执行。'); }
  for (const dependency of p.dependencies || []) if (!locateExecutable(dependency.executable)) throw failure('connection_skill_dependency_missing', '缺少声明的运行依赖：' + dependency.executable + '。' + (dependency.installHint || ''));
  const stat = fs.statSync(executable);
  const identity = digest([executable, stat.size, stat.mtimeMs, stat.ctimeMs, entry ? programFiles(path.join(cwd, p.entry!.split('/')[0]!)) : null, p]);
  return { executable, args, cwd, identity, recipient: programRecipient(root, source), declaration: p };
}
function satisfies(actual: string, constraint: string): boolean {
  const version = actual.match(/\b(?:v)?(\d+)\.(\d+)\.(\d+)\b/); if (!version) return false;
  const parts = version.slice(1).map(Number);
  return constraint.trim().split(/\s+/).every(term => {
    const match = term.match(/^(>=|<=|>|<|=|\^|~)?(\d+)(?:\.(\d+))?(?:\.(\d+))?$/); if (!match) return false;
    const wanted = [Number(match[2]), Number(match[3] || 0), Number(match[4] || 0)];
    const compare = parts[0]! - wanted[0]! || parts[1]! - wanted[1]! || parts[2]! - wanted[2]!;
    switch (match[1]) { case '>=': return compare >= 0; case '<=': return compare <= 0; case '>': return compare > 0; case '<': return compare < 0; case '^': return compare >= 0 && parts[0] === wanted[0]; case '~': return compare >= 0 && parts[0] === wanted[0] && parts[1] === wanted[1]; default: return compare === 0; }
  });
}
/** Explicit check only. Catalog/list never execute version probes. */
export function checkProgram(program: ResolvedProgram): { ready: boolean; diagnostics: string[] } {
  const diagnostics: string[] = [];
  const checks = [
    ...(program.declaration.version ? [{ executable: program.executable, args: [...program.args, ...program.declaration.version.args], constraint: program.declaration.version.constraint }] : []),
    ...(program.declaration.dependencies || []).filter(dep => dep.version).map(dep => ({ executable: locateExecutable(dep.executable)!, args: dep.version!.args, constraint: dep.version!.constraint })),
  ];
  for (const check of checks) {
    const result = spawnSync(check.executable, check.args, { cwd: program.cwd, env: environment(), shell: false, timeout: 5000, maxBuffer: 64 * 1024, encoding: 'utf8' });
    if (result.error || result.status !== 0 || !satisfies(result.stdout || '', check.constraint)) diagnostics.push('程序版本未满足声明约束：' + check.constraint);
  }
  return { ready: diagnostics.length === 0, diagnostics };
}
export type ProgramResult = { status: 'exited' | 'timeout' | 'output-limit' | 'spawn-failed'; exitCode: number | null; signal: string | null; stdout: string; stderr: string; diagnostics: string[] };
/** Buffer before redaction so credentials split across chunks cannot escape. Never stream raw output. */
export function runProgram(program: ResolvedProgram, args: string[], options: {
  context?: Record<string, unknown>; input?: string | Buffer; secrets?: string[]; timeoutMs?: number; maxBytes?: number; revalidate?: () => void;
} = {}): Promise<ProgramResult> {
  if (!args.every(value => typeof value === 'string' && !value.includes('\0'))) throw failure('connection_skill_arguments_invalid', '程序参数必须是文本数组。', 400);
  const secrets = [...new Set((options.secrets || []).filter(Boolean))].sort((a, b) => b.length - a.length);
  if ([...program.args, ...args].some(arg => secrets.some(secret => arg === secret || arg.endsWith('=' + secret)))) throw failure('connection_skill_secret_argument', '认证值不能作为程序参数。', 400);
  const timeoutMs = Math.min(Math.max(options.timeoutMs ?? 60_000, 10), 300_000), maxBytes = Math.min(options.maxBytes ?? 2 * 1024 * 1024, 8 * 1024 * 1024);
  return new Promise(resolve => {
    let state: ProgramResult['status'] = 'exited', total = 0, finished = false;
    const stdout: Buffer[] = [], stderr: Buffer[] = [];
    const child = spawn(program.executable, [...program.args, ...args], { cwd: program.cwd, env: environment(), shell: false, detached: process.platform !== 'win32', windowsHide: true, stdio: ['pipe', 'pipe', 'pipe', 'ipc'] });
    let killTimer: ReturnType<typeof setTimeout> | undefined;
    const terminate = (signal: NodeJS.Signals) => {
      try { if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, signal); else child.kill(signal); } catch { /* Already exited. */ }
    };
    const stop = () => {
      terminate('SIGTERM');
      killTimer ??= setTimeout(() => {
        terminate('SIGKILL'); child.stdin?.destroy(); child.stdout?.destroy(); child.stderr?.destroy();
        if (child.connected) child.disconnect();
        finish(null, 'SIGKILL');
      }, 250);
      killTimer.unref();
    };
    const timer = setTimeout(() => { state = 'timeout'; stop(); }, timeoutMs); timer.unref();
    const collect = (target: Buffer[], chunk: Buffer) => { total += chunk.length; if (total > maxBytes) { state = 'output-limit'; stop(); return; } target.push(chunk); };
    child.stdout!.on('data', chunk => collect(stdout, chunk)); child.stderr!.on('data', chunk => collect(stderr, chunk));
    child.stdin!.on('error', () => {});
    child.on('message', message => {
      if (!message || typeof message !== 'object') return;
      const value = message as Record<string, unknown>;
      if (value.type !== 'buildr.connection-revalidate' || typeof value.requestId !== 'string' || value.requestId.length > 128 || value.callId !== options.context?.callId) return;
      let response: Record<string, unknown>;
      try { if (!options.context || !options.revalidate) throw new Error(); options.revalidate(); response = { ok: true }; }
      catch { response = { ok: false, error: { code: 'connection_skill_context_changed', message: '本次连接上下文已变化或不可用，请重新核对。' } }; }
      if (child.connected) child.send({ type: 'buildr.connection-revalidated', requestId: value.requestId, ...response }, () => {});
    });
    child.on('spawn', () => { if (options.context) child.send({ type: 'buildr.connection-context', context: options.context }, () => {}); child.stdin!.end(options.input); });
    const finish = (code: number | null, signal: string | null) => {
      if (finished) return; finished = true; clearTimeout(timer); if (killTimer) clearTimeout(killTimer);
      const redact = (chunks: Buffer[]) => {
        const raw = Buffer.concat(chunks).toString('utf8');
        const cleanText = (value: string): string => { for (const secret of secrets) value = value.split(secret).join('[已隐藏]'); return value; };
        const clean = (value: unknown): unknown => {
          if (typeof value === 'string') return cleanText(value);
          if (Array.isArray(value)) return value.map(clean);
          if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [cleanText(key), clean(item)]));
          return value;
        };
        try { return JSON.stringify(clean(JSON.parse(raw))) + '\n'; } catch {
          let result = raw;
          for (const secret of secrets.flatMap(value => [value, JSON.stringify(value).slice(1, -1)]).sort((a, b) => b.length - a.length)) result = result.split(secret).join('[已隐藏]');
          return result;
        }
      };
      // Truncated output could end in a partial credential. Withhold all partial output.
      resolve({ status: state, exitCode: code, signal, stdout: state !== 'exited' ? '' : redact(stdout), stderr: state !== 'exited' ? '' : redact(stderr), diagnostics: state === 'exited' ? [] : [state === 'timeout' ? '程序超时；远端是否已生效未知，请先调查，勿盲目重试。' : state === 'output-limit' ? '输出超过限制，部分输出已隐藏；业务结果需核对。' : '程序无法启动。'] });
    };
    child.on('error', () => { state = 'spawn-failed'; finish(null, null); }); child.on('close', (code, signal) => finish(code, signal));
  });
}
