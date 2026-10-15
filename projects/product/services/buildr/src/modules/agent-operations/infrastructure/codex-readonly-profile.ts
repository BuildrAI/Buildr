import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import type { AgentGenerationEnvironment } from '../domain/agent-operations.ts';
import { CODEX_GIT_READ_ENVIRONMENT, codexGitExecutionReadRoots } from './codex-git-read-support.ts';

export const CODEX_SHELL_ENVIRONMENT = Object.freeze({
  inherit: 'core', ignore_default_excludes: false,
  include_only: ['PATH', 'HOME', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'XDG_CONFIG_HOME', 'TMPDIR', 'TEMP', 'TMP', 'LANG', 'LC_*', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'PATHEXT'],
  set: CODEX_GIT_READ_ENVIRONMENT,
});

/** Apple's /usr/bin/git delegates into the OS-selected developer tool directory. */
export function codexPlatformExecutionReadRoots(): string[] {
  if (process.platform !== 'darwin') return [];
  try {
    const selected = execFileSync('/usr/bin/xcode-select', ['-p'], { encoding: 'utf8', timeout: 2000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    if (!path.isAbsolute(selected) || /[\0\r\n]/.test(selected)) return [];
    const actual = fs.realpathSync(selected), git = fs.realpathSync(path.join(actual, 'usr/bin/git'));
    if (actual === path.parse(actual).root || !fs.statSync(actual).isDirectory() || !fs.statSync(git).isFile() || path.relative(actual, git).startsWith('..') || path.isAbsolute(path.relative(actual, git))) return [];
    return [actual];
  } catch { return []; }
}

/** A fresh id prevents a user/project profile from supplying inherited permissions. */
export function createCodexReadOnlyProfile(environment: AgentGenerationEnvironment, cwd: string) {
  const id = 'buildr-readonly-' + crypto.randomUUID();
  const profile = { filesystem: { ':root': 'deny', ':minimal': 'read', ...Object.fromEntries([...codexPlatformExecutionReadRoots(), ...codexGitExecutionReadRoots(cwd), ...environment.readableRoots].map(root => [root, 'read'])) }, network: { enabled: false } };
  return { id, profile, config: { ['permissions.' + id]: profile, default_permissions: id } };
}
