import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { agentFailure } from '../domain/agent-operations.ts';

/** Match the product Git reader's environment without changing global ignore/include semantics. */
export const CODEX_GIT_READ_ENVIRONMENT = Object.freeze({ GIT_CONFIG_NOSYSTEM: '1', GIT_OPTIONAL_LOCKS: '0', GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'core.fsmonitor', GIT_CONFIG_VALUE_0: 'false' });

/** Read only configuration origins/path settings; never retain or log configuration values. */
export function codexGitExecutionReadRoots(cwd: string, inherited: NodeJS.ProcessEnv = process.env): string[] {
  const env: NodeJS.ProcessEnv = { ...Object.fromEntries(Object.entries(inherited).filter(([key]) => !key.startsWith('GIT_'))), ...CODEX_GIT_READ_ENVIRONMENT };
  const roots = new Set<string>();
  const addFile = (location: string) => {
    if (!path.isAbsolute(location) || /[\0\r\n]/.test(location) || location.length > 32_768 || roots.size >= 128) throw new Error('invalid Git support file');
    const alias = path.normalize(location);
    if (alias === path.parse(alias).root) throw new Error('invalid Git support root');
    roots.add(alias);
    try {
      const actual = fs.realpathSync(alias);
      if (!fs.statSync(actual).isFile()) throw new Error('Git support is not a file');
      roots.add(actual);
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  };
  const read = (args: string[], optional = false): string => {
    try { return execFileSync('git', ['--no-optional-locks', '-C', cwd, 'config', ...args], { encoding: 'utf8', env, timeout: 4000, maxBuffer: 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }); }
    catch (error) { if (optional && (error as { status?: number }).status === 1) return ''; throw error; }
  };
  try {
    const home = env.HOME || env.USERPROFILE || os.homedir();
    const xdg = env.XDG_CONFIG_HOME || path.join(home, '.config');
    // Missing default files still need metadata lookup permission, restricted to
    // these exact paths; neither HOME nor the XDG directory is opened for reads.
    for (const file of [path.join(home, '.gitconfig'), path.join(xdg, 'git/config'), path.join(xdg, 'git/ignore'), path.join(xdg, 'git/attributes')]) addFile(file);
    const fields = read(['--show-origin', '--name-only', '--null', '--list']).split('\0');
    for (let index = 0; index + 1 < fields.length; index += 2) {
      const origin = fields[index];
      if (origin.startsWith('file:')) addFile(path.resolve(cwd, origin.slice(5)));
    }
    for (const key of ['core.excludesFile', 'core.attributesFile']) for (const file of read(['--path', '--null', '--get-all', key], true).split('\0').filter(Boolean)) addFile(path.resolve(cwd, file));
    return [...roots].sort();
  } catch { throw agentFailure('agent_git_environment_unconfirmed', '本次 Git 只读运行配置无法核对，未发送生成内容。', 409); }
}
