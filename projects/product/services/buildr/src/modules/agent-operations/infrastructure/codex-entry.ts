import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnCommandSync } from '../../../infrastructure/process.ts';
import { agentFailure, type AgentRegistration } from '../domain/agent-operations.ts';

export function codexEntryAvailable(record: AgentRegistration): boolean {
  try { fs.accessSync(record.executable, fs.constants.X_OK); return fs.statSync(record.executable).isFile() && fs.statSync(record.codexHome).isDirectory(); } catch { return false; }
}
export function inspectCodexEntry(input: { executable: string; codexHome?: string; label?: string }): Omit<AgentRegistration, 'id' | 'kind'> {
  if (!path.isAbsolute(input.executable || '') || /[\0\r\n]/.test(input.executable)) throw agentFailure('agent_executable_invalid', '接入需要智能体（Agent）发现的真实绝对程序入口。');
  const home = input.codexHome ?? process.env.CODEX_HOME ?? path.join(os.homedir(), '.codex');
  if (!path.isAbsolute(home) || /[\0\r\n]/.test(home)) throw agentFailure('agent_home_invalid', 'Codex 配置目录必须是已发现的绝对路径。');
  let executable: string, codexHome: string;
  try {
    executable = fs.realpathSync(input.executable); codexHome = fs.realpathSync(home);
    fs.accessSync(executable, fs.constants.X_OK);
    if (!fs.statSync(executable).isFile() || !fs.statSync(codexHome).isDirectory()) throw new Error('invalid entry');
  } catch { throw agentFailure('agent_executable_unavailable', '已发现的 Codex 程序或配置目录当前不可用。'); }
  const probe = (args: string[]) => {
    const result = spawnCommandSync(executable, args, { encoding: 'utf8', timeout: 5000, maxBuffer: 128 * 1024, windowsHide: true, env: { ...process.env, CODEX_HOME: codexHome } });
    if (result.error || result.status !== 0) throw agentFailure('agent_probe_failed', 'Codex 入口检查失败，请由智能体（Agent）核对安装。');
    return String(result.stdout || '') + String(result.stderr || '');
  };
  const match = /^codex-cli\s+([^\s]+)\s*$/m.exec(probe(['--version']));
  if (!match || !/app.server/i.test(probe(['app-server', '--help']))) throw agentFailure('agent_protocol_unavailable', '该程序未确认支持 Codex 应用服务（App Server）。');
  const label = input.label?.trim() || 'Codex';
  if (label.length > 100 || /[\0\r\n]/.test(label)) throw agentFailure('agent_label_invalid', '智能体（Agent）名称无效。');
  return { executable, codexHome, label, version: match[1] };
}
