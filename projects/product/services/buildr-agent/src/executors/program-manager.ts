import { realpathSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { AgentProgramManager, ProgramCandidate, ProgramCatalog } from '../contracts.ts';
import { AgentServiceError, fail } from '../domain/agent-state.ts';
import { executableIdentity, findExecutable, inspectVersion, isolatedEnvironment, nativeCommand, privateDirectories } from './native-process.ts';
import { nativeProgramPolicy, isCompatibleProgram, isProgramReleaseVersion } from './program-policy.ts';
import { ProgramInstallDiagnostics } from './program-install-diagnostics.ts';

const run = promisify(execFile);
const sourceLabels = { configured: '原接入程序', selected: '指定程序', path: '本机命令行', managed: 'Buildr 独立安装', application: '桌面应用内程序', sdk: 'Qoder 配套程序' };

/** Native programs only. Browser/tool installation stays with the Agent and its skills. */
export class NativeProgramManager implements AgentProgramManager {
  private readonly root: string;
  private readonly environment: Record<string, string>;
  constructor(root: string, environment: Record<string, string>) { this.root = root; this.environment = environment; }
  private destination(provider: string, version?: string): string { return path.join(this.root, 'programs', provider, `${version ? 'package-' + version : nativeProgramPolicy(provider).version}-${process.platform}-${process.arch}`); }
  isManaged(provider: string, executable: string): boolean {
    let root = path.resolve(this.root), actual = path.resolve(executable);
    try { root = realpathSync(root); } catch { /* A new private root has not been created yet. */ }
    try { actual = realpathSync(actual); } catch { const relative = path.relative(path.resolve(this.root),actual); if (!relative.startsWith('..') && !path.isAbsolute(relative)) actual = path.join(root,relative); }
    const relative = path.relative(path.join(root,'programs',provider),actual);
    return Boolean(relative) && !relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative);
  }
  private async probeEnvironment(): Promise<NodeJS.ProcessEnv> {
    const home = path.join(this.root, 'program-probes', 'home'), temporary = path.join(this.root, 'program-probes', 'tmp');
    await privateDirectories(home, temporary);
    return isolatedEnvironment(this.environment, home, temporary);
  }
  async discover(input: Parameters<AgentProgramManager['discover']>[0]): Promise<ProgramCatalog> {
    const policy = nativeProgramPolicy(input.provider), env = await this.probeEnvironment();
    const candidates: ProgramCandidate[] = [], seen = new Set<string>();
    const paths: Array<{ executable: string; source: ProgramCandidate['source']; bundle?: string }> = [];
    const explicit = input.executable ?? input.boundExecutable;
    if (explicit) {
      if (!path.isAbsolute(explicit)) fail('agent_executable_invalid', '请指定程序的准确绝对路径。');
      paths.push({ executable: explicit, source: input.boundExecutable ? 'configured' : 'selected' });
      if (!input.boundExecutable && !this.isManaged(input.provider, explicit)) fail('agent_program_not_managed', '新接入仅使用 Buildr 独立程序，请选择准备独立程序。');
    } else {
      paths.push({ executable: path.join(this.destination(input.provider), policy.entry), source: 'managed' });
    }
    for (const candidate of paths) {
      input.signal.throwIfAborted();
      const exists = await fs.stat(candidate.executable).then(item => item.isFile(), () => false);
      if (!exists && !explicit) continue;
      const actual = exists ? await fs.realpath(candidate.executable) : candidate.executable;
      if (!input.boundExecutable && !this.isManaged(input.provider,actual)) continue;
      if (seen.has(actual)) continue;
      seen.add(actual);
      const item: ProgramCandidate = { executable: actual, source: candidate.source, label: sourceLabels[candidate.source], compatible: false };
      try {
        await executableIdentity(actual);
        item.version = await inspectVersion(actual, env, input.signal);
        item.compatible = isCompatibleProgram(input.provider, item.version);
        if (!item.compatible) item.diagnostic = `版本 ${item.version} 不在兼容范围 ${policy.compatibility} 内（包含该系列预发布版本）。`;
      } catch {
        input.signal.throwIfAborted();
        item.diagnostic = exists ? '程序无法运行，或应用身份、签名检查未通过。' : '原指定程序已不存在；不会自动改用其他来源。';
      }
      candidates.push(item);
    }
    const supported = ['darwin', 'linux', 'win32'].includes(process.platform) && ['arm64', 'x64'].includes(process.arch) && !(input.provider === 'qoder' && process.platform === 'win32' && process.arch === 'arm64');
    return { candidates, installation: { label: policy.label, version: policy.version, url: policy.url, canInstall: supported && !input.boundExecutable, ...(!supported ? { diagnostic: '此系统或架构尚无可用的自动准备方式，请查看官方安装说明。' } : input.boundExecutable ? { diagnostic: '已有接入已绑定原程序；请恢复该程序，不会自动安装并改绑。' } : {}) } };
  }
  async install(input: Parameters<AgentProgramManager['install']>[0]): Promise<string> {
    const policy = nativeProgramPolicy(input.provider), releaseVersion = input.version ?? policy.package.slice(policy.package.lastIndexOf('@') + 1);
    if (!isProgramReleaseVersion(releaseVersion)) fail('agent_install_version_invalid', '更新版本无效。');
    const packageName = policy.package.replace(/@[^@]+$/, ''), packageSpec = `${packageName}@${releaseVersion}`;
    const destination = this.destination(input.provider, input.version);
    const executable = path.join(destination, policy.entry), env = await this.probeEnvironment();
    if (await fs.lstat(destination).then(() => true, () => false)) {
      if ((await fs.lstat(destination)).isSymbolicLink() || !this.isManaged(input.provider,await fs.realpath(executable))) fail('agent_install_existing_invalid','独立安装目录不能引用外部程序。');
      const installed = JSON.parse(await fs.readFile(path.join(destination, 'node_modules', packageName, 'package.json'), 'utf8'));
      const version = await inspectVersion(executable, env, input.signal);
      if (installed.name === packageName && installed.version === releaseVersion && isCompatibleProgram(input.provider, version) && (input.provider === 'qoder' || version === releaseVersion)) return executable;
      fail('agent_install_existing_invalid', '已有受管程序需要检查；不会覆盖该目录。');
    }
    input.signal.throwIfAborted();
    const parent = path.dirname(destination); await privateDirectories(parent);
    const staging = await fs.mkdtemp(path.join(parent, '.prepare-'));
    try {
      const home = path.join(staging, '.home'), temporary = path.join(staging, '.tmp');
      await privateDirectories(home, temporary);
      const installEnv = isolatedEnvironment(this.environment, home, temporary, { npm_config_cache: path.join(staging, '.cache'), npm_config_update_notifier: 'false', npm_config_registry: 'https://registry.npmjs.org/', QODER_INSTALL_BUNDLED_CLI: '1' });
      let npm: string | undefined;
      try { npm = await findExecutable(undefined, ['npm-cli.js', 'npm'], this.environment); } catch { /* Try the npm shipped with the current Node runtime. */ }
      if (!npm || process.platform === 'win32' && !/\.[cm]?js$/i.test(npm)) {
        for (const relative of ['node_modules/npm/bin/npm-cli.js', '../lib/node_modules/npm/bin/npm-cli.js']) {
          const candidate = path.resolve(path.dirname(process.execPath), relative);
          if (await fs.stat(candidate).then(item => item.isFile(), () => false)) { npm = await fs.realpath(candidate); break; }
        }
      }
      if (!npm) fail('agent_install_npm_missing', '独立安装需要 npm。可先安装官方 Node.js 后重新检查。');
      input.progress(`正在下载并准备 ${packageSpec}，首次准备可能需要几分钟。`);
      await installPackage(npm, ['install', '--prefix', staging, '--no-audit', '--no-fund', '--save-exact', '--registry=https://registry.npmjs.org/', packageSpec], installEnv, input.signal);
      input.progress('下载完成，正在检查程序与兼容版本。');
      const stagedExecutable = path.join(staging, policy.entry);
      const stagedRelative = path.relative(await fs.realpath(staging), await fs.realpath(stagedExecutable));
      if (!stagedRelative || stagedRelative === '..' || stagedRelative.startsWith('..' + path.sep) || path.isAbsolute(stagedRelative)) fail('agent_install_existing_invalid', '独立程序不能引用安装目录外的文件。');
      const installed = JSON.parse(await fs.readFile(path.join(staging, 'node_modules', packageName, 'package.json'), 'utf8'));
      const version = await inspectVersion(stagedExecutable, env, input.signal);
      if (installed.name !== packageName || installed.version !== releaseVersion || !isCompatibleProgram(input.provider, version) || (input.provider !== 'qoder' && version !== releaseVersion)) fail('agent_install_version_mismatch', '下载软件包或程序版本不匹配或不兼容，未启用该程序。');
      input.signal.throwIfAborted();
      for (const directory of ['.home', '.tmp', '.cache']) await fs.rm(path.join(staging, directory), { recursive: true, force: true });
      await fs.rename(staging, destination);
      return executable;
    } finally { await fs.rm(staging, { recursive: true, force: true }); }
  }
}

async function installPackage(executable: string, args: string[], env: NodeJS.ProcessEnv, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  const command = nativeCommand(executable);
  const diagnostics = new ProgramInstallDiagnostics(env);
  const child = spawn(command.command, [...command.prefix, ...args], { env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, detached: process.platform !== 'win32' });
  child.stdout.on('data', chunk => diagnostics.append('stdout', chunk));
  child.stderr.on('data', chunk => diagnostics.append('stderr', chunk));
  let forceTimer: ReturnType<typeof setTimeout> | undefined;
  const force = () => { if (process.platform !== 'win32' && child.pid) { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* Own process group is gone. */ } } };
  const terminate = () => {
    if (!child.pid) return;
    if (process.platform === 'win32') {
      const killer = spawn(path.join(env.SystemRoot ?? 'C:\\Windows', 'System32', 'taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true }); killer.on('error', () => child.kill());
    } else { try { process.kill(-child.pid, 'SIGTERM'); } catch { /* Own group already exited. */ } }
    forceTimer ??= setTimeout(force, 2000);
  };
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; terminate(); }, 10 * 60_000); timer.unref();
  signal.addEventListener('abort', terminate, { once: true }); if (signal.aborted) terminate();
  try {
    const result = await new Promise<{ status: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
      // close follows stdio draining, so a final error fragment is not lost after exit.
      child.once('close', (status, signal) => resolve({ status, signal }));
      child.once('error', (error: NodeJS.ErrnoException) => reject(new AgentServiceError('agent_install_start_failed', diagnostics.startFailure(error))));
    });
    signal.throwIfAborted();
    if (timedOut) fail('agent_install_timeout', diagnostics.failure(result.status, result.signal, true));
    if (result.status !== 0) fail('agent_install_failed', diagnostics.failure(result.status, result.signal));
  } finally { if (signal.aborted || timedOut) force(); clearTimeout(forceTimer); clearTimeout(timer); signal.removeEventListener('abort', terminate); }
}
