import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

function resolvePath(value: any, platform: any): any  {
  return platform === 'win32' ? path.win32.resolve(value) : path.resolve(value);
}

export function productDataRoot(options: any = {}): any  {
  const platform = options.platform || process.platform;
  const env = options.env || process.env;
  const home = options.home || os.homedir();
  if (options.respectOverride !== false && env.BUILDR_PRODUCT_DATA_DIR) return resolvePath(env.BUILDR_PRODUCT_DATA_DIR, platform);
  if (platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'Buildr');
  if (platform === 'win32') return path.win32.join(env.LOCALAPPDATA || path.win32.join(home, 'AppData', 'Local'), 'Buildr');
  const stateHome = env.XDG_STATE_HOME || path.posix.join(home, '.local', 'state');
  return path.posix.join(stateHome, 'buildr');
}
