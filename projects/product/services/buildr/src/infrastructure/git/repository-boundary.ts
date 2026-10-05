import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { spawnSync } from '../process.ts';

/** Return the observed Git root, or null only for a confirmed non-Git path. */
export function observeGitRepositoryRoot(location: string): string | null {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('GIT_')));
  const observed = spawnSync('git', ['--no-optional-locks', '--no-replace-objects', '-c', 'gc.auto=0', '-c', 'maintenance.auto=false', '-C', location, 'rev-parse', '--show-toplevel'], {
    encoding: 'utf8', timeout: 4000, maxBuffer: 64 * 1024,
    env: { ...env, LC_ALL: 'C', GIT_OPTIONAL_LOCKS: '0', GIT_NO_LAZY_FETCH: '1', GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_NOSYSTEM: '1' },
  });
  if (observed.status === 0 && observed.stdout.trim()) return fs.realpathSync(observed.stdout.trim());
  if (observed.status !== 128 || !/not a git repository/i.test(observed.stderr)) {
    throw new Error(`无法核对 Git 来源：${location}。${observed.error?.message || observed.stderr.trim()}`);
  }
  let current = fs.realpathSync(location);
  while (true) {
    if (fs.lstatSync(path.join(current, '.git'), { throwIfNoEntry: false })) throw new Error(`Git 来源元数据不可读取：${location}。`);
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}
