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
  return {
    executable,
    args: [...args],
    shell: platform === 'win32' && /\.(?:cmd|bat)$/i.test(executable),
  };
}

export function spawnCommandSync(executable, args, options = {}) {
  const { platform = process.platform, ...spawnOptions } = options;
  const invocation = buildCommandInvocation(executable, args, { platform });
  return spawnSync(invocation.executable, invocation.args, {
    ...spawnOptions,
    shell: invocation.shell,
  });
}
