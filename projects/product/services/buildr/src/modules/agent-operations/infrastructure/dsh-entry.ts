import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { agentFailure, type DshAgentRegistration } from '../domain/agent-operations.ts';

export function inspectDshEntry(input: { executable: string; dshHome?: string; label?: string }): Omit<DshAgentRegistration, 'id' | 'kind'> {
  if (!path.isAbsolute(input.executable || '') || /[\0\r\n]/.test(input.executable)) throw agentFailure('agent_executable_invalid', '接入需要已发现的 DSH 桌面绝对入口。');
  const home = input.dshHome ?? process.env.DSH_HOME ?? path.join(os.homedir(), '.dsh');
  if (!path.isAbsolute(home) || /[\0\r\n]/.test(home)) throw agentFailure('agent_home_invalid', 'DSH 配置目录无效。');
  let executable: string, dshHome: string;
  try { executable = fs.realpathSync(input.executable); dshHome = fs.realpathSync(home); if (!fs.statSync(executable).isFile() || !fs.statSync(dshHome).isDirectory()) throw new Error(); }
  catch { throw agentFailure('agent_entry_unavailable', 'DSH 桌面安装或配置目录当前不可用。', 503); }
  const appPath = dshDesktopAppPath(executable);
  if (!appPath) throw agentFailure('agent_entry_unsupported', '当前入口不是已确认的 DSH 桌面安装，请在接入中选择桌面。', 422);
  const version = dshDesktopVersion(appPath);
  if (!version) throw agentFailure('agent_entry_unsupported', 'DSH 桌面版本无法确认。', 422);
  const label = input.label?.trim() || 'DSH';
  if (label.length > 100 || /[\0\r\n]/.test(label)) throw agentFailure('agent_label_invalid', '智能体（Agent）名称无效。');
  return { label, executable, dshHome, version };
}
export function dshDesktopAppPath(executable: string): string | null {
  const match = /^(.*?\.app)[/\\]Contents[/\\]Resources[/\\]runtime[/\\]cli[/\\]bin[/\\]dsh$/.exec(executable);
  if (!match) return null;
  try { return fs.realpathSync(match[1]); } catch { return null; }
}
export function dshDesktopVersion(appPath: string): string | null {
  try {
    const file = path.join(appPath, 'Contents', 'Info.plist');
    if (fs.statSync(file).size > 256 * 1024) return null;
    const value = /<key>CFBundleShortVersionString<\/key>\s*<string>([^<]{1,100})<\/string>/.exec(fs.readFileSync(file, 'utf8'))?.[1];
    return value && /^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(value) ? value : null;
  } catch { return null; }
}
export function dshEntryAvailable(registration: DshAgentRegistration): boolean {
  try { return !!registration.desktop && dshDesktopScopeIdentity(registration.executable, registration.dshHome, registration.desktop.appPath) === registration.desktop.scopeIdentity && dshDesktopAppPath(fs.realpathSync(registration.executable)) === registration.desktop.appPath && fs.realpathSync(registration.dshHome) === registration.dshHome; } catch { return false; }
}

export function dshDesktopScopeIdentity(executable: string, dshHome: string, appPath: string): string {
  const home = fs.realpathSync(dshHome), stat = fs.statSync(home);
  if (!stat.isDirectory()) throw agentFailure('agent_dsh_connection_scope_changed', 'DSH 配置目录身份不可用。', 409);
  return 'sha256-' + crypto.createHash('sha256').update(JSON.stringify([fs.realpathSync(executable), fs.realpathSync(appPath), home, stat.dev, stat.ino])).digest('hex');
}
