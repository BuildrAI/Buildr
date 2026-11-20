import fs from 'node:fs';
import path from 'node:path';

export function findExecutableOnPath(executable: any, options: any = {}): any  {
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
