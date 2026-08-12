import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync, spawnSync } from 'node:child_process';

export { execFileSync, spawnSync };

export function findExecutableOnPath(executable, options = {}) {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const pathValue = env.PATH || '';
  const configuredExtensions = platform === 'win32'
    ? (env.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';').filter(Boolean)
    : [''];
  const extensions = platform === 'win32' && path.extname(executable) ? [''] : configuredExtensions;

  for (const directory of pathValue.split(path.delimiter).filter(Boolean)) {
    for (const extension of extensions) {
      const candidate = path.join(directory, platform === 'win32' ? `${executable}${extension}` : executable);
      try {
        fs.accessSync(candidate, fs.constants.X_OK);
        return candidate;
      } catch {
        // Try the next PATH entry.
      }
    }
  }
  return null;
}

export function buildCommandInvocation(executable, args, options = {}) {
  const platform = options.platform ?? process.platform;
  const windowsShim = platform === 'win32' && /\.(?:cmd|bat)$/i.test(executable);
  return {
    executable,
    args: windowsShim ? args.map(quoteWindowsCommandArgument) : [...args],
    shell: windowsShim,
  };
}

export function quoteWindowsCommandArgument(value) {
  const argument = String(value);
  if (argument.length === 0) return '""';
  if (!/[\s"]/u.test(argument)) return argument;
  return `"${argument.replace(/(\\*)"/gu, '$1$1\\"').replace(/(\\+)$/u, '$1$1')}"`;
}

export function spawnCommandSync(executable, args, options = {}) {
  const { platform = process.platform, ...spawnOptions } = options;
  const invocation = buildCommandInvocation(executable, args, { platform });
  return spawnSync(invocation.executable, invocation.args, {
    ...spawnOptions,
    shell: invocation.shell,
  });
}
