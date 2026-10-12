import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { spawnCommandSync } from '../../../infrastructure/process.ts';
import type { CodexAgentRegistration, CodexDesktopInstallation } from '../../agent-operations/domain/agent-operations.ts';

export const CODEX_DESKTOP_PLUGIN_VERSION = '1.0.0';
export type CodexPluginInvocation = { command: string; argsPrefix: string[]; kind?: string };
export type CodexPluginInstallationResult = {
  pluginId: string;
  pluginVersion: string;
  entryIdentity: string;
  installedPath: string;
  status: 'awaiting-desktop';
  safeReason: string;
};
export function codexDesktopPluginId(dataRoot: string, connectionId: string): string {
  return 'buildr-desktop@buildr-local-' + crypto.createHash('sha256').update(path.resolve(dataRoot) + '\0' + connectionId).digest('hex').slice(0, 12);
}
function desktopServerInvocation(invocation: CodexPluginInvocation, dataRoot: string, connectionId: string) {
  const command = absoluteFile(invocation.command, 'Buildr 运行程序');
  if (!Array.isArray(invocation.argsPrefix) || invocation.argsPrefix.length !== 1) throw failure('codex_plugin_entry_invalid', '桌面连接需要稳定的 Buildr 产品入口。');
  const entry = absoluteFile(invocation.argsPrefix[0], 'Buildr 产品入口');
  if (!path.isAbsolute(dataRoot) || !/^[a-zA-Z0-9._-]{1,160}$/u.test(connectionId)) throw failure('codex_plugin_connection_invalid', '桌面接入或数据目录无效。');
  return { command, args: [entry, 'codex', 'serve', '--connection-id', connectionId], env: { BUILDR_APP_DATA_DIR: path.resolve(dataRoot) } };
}
export function codexDesktopEntryIdentity(invocation: CodexPluginInvocation, dataRoot: string, connectionId: string): string {
  return 'sha256-' + crypto.createHash('sha256').update(JSON.stringify(desktopServerInvocation(invocation, dataRoot, connectionId))).digest('hex');
}

function failure(code: string, message: string) { return Object.assign(new Error(message), { code, status: 409 }); }
function absoluteFile(value: string, label: string): string {
  if (!path.isAbsolute(value || '') || /[\0\r\n]/u.test(value)) throw failure('codex_plugin_entry_invalid', label + '必须是已确认的绝对入口。');
  try { const real = fs.realpathSync(value); if (!fs.statSync(real).isFile()) throw new Error(); return real; }
  catch { throw failure('codex_plugin_entry_unavailable', label + '当前不可用。'); }
}
function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = file + '.' + crypto.randomUUID() + '.tmp';
  try { fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 }); fs.renameSync(temporary, file); }
  finally { fs.rmSync(temporary, { force: true }); }
}

/** Uses only the public plugin CLI. Never restarts or replaces the desktop backend. */
export async function installCodexDesktopPlugin(input: {
  dataRoot: string;
  registration: CodexAgentRegistration;
  installation: CodexDesktopInstallation;
  invocation: CodexPluginInvocation;
  connectionId: string;
}): Promise<CodexPluginInstallationResult> {
  const { registration, invocation } = input;
  const server = desktopServerInvocation(invocation, input.dataRoot, input.connectionId);
  const entry = server.args[0];
  if (/(?:^|[\\/])(?:\.worktrees|test|tests)(?:[\\/]|$)|(?:^|[\\/])\.codex[\\/]worktrees(?:[\\/]|$)/u.test(entry)) {
    throw failure('codex_plugin_candidate_entry', '当前是候选或测试入口，未安装到桌面配置。交付到保留安装后可继续准备桌面连接。');
  }
  const executable = absoluteFile(registration.executable, 'Codex 程序');
  const codexHome = fs.realpathSync(registration.codexHome);
  if (!fs.statSync(codexHome).isDirectory() || !path.isAbsolute(input.dataRoot)) throw failure('codex_plugin_home_invalid', '已确认的 Codex 配置或 Buildr 数据目录不可用。');
  if (!fs.statSync(input.installation.appPath).isDirectory()) throw failure('codex_plugin_desktop_unavailable', '已确认的桌面安装当前不可用。');
  if (!/^[a-zA-Z0-9._-]{1,160}$/u.test(input.connectionId)) throw failure('codex_plugin_connection_invalid', '桌面接入编号无效。');
  const pluginId = codexDesktopPluginId(input.dataRoot, input.connectionId);
  const marketplaceName = pluginId.split('@')[1];
  const root = path.join(input.dataRoot, 'codex-desktop', 'marketplace', input.connectionId);
  const pluginRoot = path.join(root, 'plugins', 'buildr-desktop');
  const source = fileURLToPath(new URL('../../../../resources/codex-desktop/', import.meta.url));
  fs.mkdirSync(pluginRoot, { recursive: true });
  fs.cpSync(path.join(source, 'skills'), path.join(pluginRoot, 'skills'), { recursive: true });
  fs.copyFileSync(path.join(source, 'panel.html'), path.join(pluginRoot, 'panel.html'));
  const manifest = JSON.parse(fs.readFileSync(path.join(source, 'plugin.json'), 'utf8'));
  writeJson(path.join(pluginRoot, 'plugin.json'), manifest);
  writeJson(path.join(pluginRoot, 'mcp.json'), {
    $schema: 'https://agent-plugins.org/schemas/1.0.0/mcp.schema.json',
    mcpServers: { buildr: { type: 'stdio', ...server } },
  });
  // The installed desktop version already supports this compatibility layout.
  writeJson(path.join(pluginRoot, '.codex-plugin', 'plugin.json'), {
    name: manifest.name, version: manifest.version, description: manifest.description,
    mcpServers: './.mcp.json', skills: './skills/', interface: manifest.extensions['com.openai'].interface,
  });
  writeJson(path.join(pluginRoot, '.mcp.json'), { mcpServers: { buildr: server } });
  writeJson(path.join(root, '.agents', 'plugins', 'marketplace.json'), {
    name: marketplaceName, interface: { displayName: 'Buildr 本机连接' },
    plugins: [{ name: 'buildr-desktop', source: { source: 'local', path: './plugins/buildr-desktop' },
      policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' }, category: 'Productivity' }],
  });
  const invoke = (args: string[]): Record<string, unknown> => {
    const result = spawnCommandSync(executable, args, {
      encoding: 'utf8', timeout: 30_000, maxBuffer: 256 * 1024, windowsHide: true,
      env: { ...process.env, CODEX_HOME: codexHome },
    });
    if (result.error || result.status !== 0) throw failure('codex_plugin_install_failed', 'Codex 官方插件准备未完成；生成登记已保留，可重试桌面连接。');
    try { const value: unknown = JSON.parse(String(result.stdout)); if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(); return value as Record<string, unknown>; }
    catch { throw failure('codex_plugin_install_response_invalid', 'Codex 插件准备返回了无法确认的结果；请重试核对，不将其视为已启用。'); }
  };
  invoke(['plugin', 'marketplace', 'add', root, '--json']);
  const installed = invoke(['plugin', 'add', pluginId, '--json']);
  const listed = invoke(['plugin', 'list', '--json']);
  const entries = Array.isArray(listed.installed) ? listed.installed : [];
  const observed = entries.find(value => value && typeof value === 'object' && (value as Record<string, unknown>).pluginId === pluginId) as Record<string, unknown> | undefined;
  if (!observed || observed.enabled !== true || observed.installed === false) throw failure('codex_plugin_not_enabled', 'Buildr 插件尚未确认启用；生成登记已保留，桌面连接仍待准备。');
  if (installed.pluginId !== pluginId || typeof installed.installedPath !== 'string' || !path.isAbsolute(installed.installedPath)) throw failure('codex_plugin_install_response_invalid', 'Codex 返回的安装身份未确认；不会将源文件当作桌面运行副本。');
  const installedPath = installed.installedPath;
  let installedVersion: unknown;
  try {
    const portableManifest = path.join(installedPath, 'plugin.json');
    const installedManifest = fs.existsSync(portableManifest) ? portableManifest : path.join(installedPath, '.codex-plugin', 'plugin.json');
    installedVersion = JSON.parse(fs.readFileSync(installedManifest, 'utf8')).version;
  } catch { throw failure('codex_plugin_cache_unconfirmed', '桌面插件安装副本当前无法核对，仍需准备；生成登记已保留。'); }
  if (installedVersion !== CODEX_DESKTOP_PLUGIN_VERSION || (typeof observed.version === 'string' && !['local', CODEX_DESKTOP_PLUGIN_VERSION].includes(observed.version))) throw failure('codex_plugin_version_unconfirmed', '桌面插件安装副本版本尚未更新，仍需准备；不会把源文件版本当成运行版本。');
  try {
    const portable = fs.existsSync(path.join(installedPath, 'mcp.json'));
    const cachedServer = JSON.parse(fs.readFileSync(path.join(installedPath, portable ? 'mcp.json' : '.mcp.json'), 'utf8')).mcpServers?.buildr;
    if (!isDeepStrictEqual(cachedServer, portable ? { type: 'stdio', ...server } : server)) throw new Error('cached entry differs');
    const skill = path.join('skills', 'buildr-desktop', 'SKILL.md');
    if (!fs.readFileSync(path.join(installedPath, skill)).equals(fs.readFileSync(path.join(pluginRoot, skill)))) throw new Error('cached instructions differ');
  } catch { throw failure('codex_plugin_cache_unconfirmed', '桌面插件安装副本尚未对齐本次确认的入口及指引，仍需准备；生成登记已保留。'); }
  return { pluginId, pluginVersion: CODEX_DESKTOP_PLUGIN_VERSION, entryIdentity: codexDesktopEntryIdentity(invocation, input.dataRoot, input.connectionId), installedPath, status: 'awaiting-desktop',
    safeReason: '连接组件已安装，等待桌面加载并完成握手；需要刷新时由用户决定，不会自动中断聊天。' };
}
