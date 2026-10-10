import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildCommandInvocation } from '../../../infrastructure/process.ts';
import { resolveProductResource } from '../../../infrastructure/product-resources/index.ts';
import { agentFailure, type DshAgentRegistration } from '../domain/agent-operations.ts';

/** Resolve the installed carrier; never start the desktop UI or rewrite its profile. */
export function dshRuntimeInvocation(executable: string): { executable: string; args: string[]; anchor: string; electron: boolean } {
  const actual = fs.realpathSync(executable);
  const desktopSuffix = path.join('Contents', 'Resources', 'runtime', 'cli', 'bin', 'dsh');
  const runtimeScript = resolveProductResource('runtime/dsh-agent.mts', { developmentFallback: 'src/modules/agent-operations/infrastructure/dsh-runtime.ts' });
  if (actual.endsWith(desktopSuffix)) {
    const contents = actual.slice(0, -path.join('Resources', 'runtime', 'cli', 'bin', 'dsh').length);
    const carrier = path.join(contents, 'MacOS', 'DeepSeek Harness');
    if (!fs.existsSync(carrier)) throw agentFailure('agent_entry_unsupported', 'DSH 桌面安装的原生运行入口不可用。', 422);
    return { executable: carrier, args: ['--expose-internals', runtimeScript], anchor: path.join(contents, 'Resources', 'app.asar', 'dsh', 'node_modules', '@deepseek-ai', 'dsh', 'package.json'), electron: true };
  }
  const anchor = path.resolve(path.dirname(actual), '..', 'package.json');
  try {
    if (JSON.parse(fs.readFileSync(anchor, 'utf8')).name !== '@deepseek-ai/dsh') throw new Error('not dsh');
  } catch { throw agentFailure('agent_entry_unsupported', '请登记 DSH 安装中的原生命令入口；当前包装入口无法确认安装身份。', 422); }
  return { executable: process.execPath, args: ['--expose-internals', runtimeScript], anchor, electron: false };
}

export function inspectDshEntry(input: { executable: string; dshHome?: string; label?: string }): Omit<DshAgentRegistration, 'id' | 'kind'> {
  if (!path.isAbsolute(input.executable || '') || /[\0\r\n]/.test(input.executable)) throw agentFailure('agent_executable_invalid', '接入需要智能体（Agent）发现的真实绝对程序入口。');
  const home = input.dshHome ?? process.env.DSH_HOME ?? path.join(os.homedir(), '.dsh');
  if (!path.isAbsolute(home) || /[\0\r\n]/.test(home)) throw agentFailure('agent_home_invalid', 'DSH 配置目录必须是已发现的绝对路径。');
  let executable: string, dshHome: string;
  try { executable = fs.realpathSync(input.executable); dshHome = fs.realpathSync(home); if (!fs.statSync(executable).isFile() || !fs.statSync(dshHome).isDirectory()) throw new Error(); }
  catch { throw agentFailure('agent_executable_unavailable', '已发现的 DSH 程序或配置目录当前不可用。'); }
  try { fs.accessSync(executable, fs.constants.X_OK); dshRuntimeInvocation(executable); }
  catch (error) { if ((error as { code?: string }).code?.startsWith('agent_')) throw error; throw agentFailure('agent_entry_unavailable', 'DSH 可执行入口不存在或不可执行。', 422); }
  const invocation = buildCommandInvocation(executable, ['--version']);
  let version: string;
  try { version = execFileSync(invocation.executable, invocation.args, { encoding: 'utf8', timeout: 10_000, maxBuffer: 64 * 1024, windowsHide: true, shell: invocation.shell }).trim(); }
  catch { throw agentFailure('agent_entry_unavailable', '无法确认已安装 DSH 的版本。', 422); }
  if (!/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(version)) throw agentFailure('agent_entry_unsupported', 'DSH 版本返回无效。', 422);
  if (!fs.existsSync(path.join(dshHome, 'profiles', 'desktop', 'package.json'))) throw agentFailure('agent_native_config_unavailable', '尚未找到 DSH 桌面原生默认配置，请先完成 DSH 本机设置。', 422);
  const label = input.label?.trim() || 'DSH';
  if (label.length > 100 || /[\0\r\n]/.test(label)) throw agentFailure('agent_label_invalid', '智能体（Agent）名称无效。');
  const runtime = dshRuntimeInvocation(executable);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-dsh-probe-'));
  try {
    const output = execFileSync(runtime.executable, [...runtime.args, '--probe'], { encoding: 'utf8', timeout: 10_000, maxBuffer: 128 * 1024, windowsHide: true, env: { ...process.env, ...(runtime.electron ? { ELECTRON_RUN_AS_NODE: '1' } : {}), DSH_HOME: dshHome, DSH_TELEMETRY_DISABLED: '1', BUILDR_DSH_INSTALL_ANCHOR: runtime.anchor, BUILDR_DSH_TEMP_DIR: directory }, stdio: ['ignore', 'pipe', 'ignore'] });
    const observed = output.trim().split('\n').map(line => JSON.parse(line)).find(message => message.method === '$buildr/inspected')?.params;
    if (observed?.version !== version || observed?.protocolVersion !== 1) throw new Error();
  } catch { throw agentFailure('agent_protocol_unavailable', 'DSH 尚未确认支持所需 ACP 临时无工具组合，请核对安装与原生配置。', 422); }
  finally { fs.rmSync(directory, { recursive: true, force: true }); }
  return { label, executable, dshHome, version };
}

export function dshEntryAvailable(registration: DshAgentRegistration): boolean {
  try { fs.accessSync(registration.executable, fs.constants.X_OK); dshRuntimeInvocation(registration.executable); return fs.existsSync(path.join(registration.dshHome, 'profiles', 'desktop', 'package.json')); } catch { return false; }
}
