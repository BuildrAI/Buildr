import { posix, win32 } from 'node:path';

/** Paths are discovery hints, never a replacement for the private provider HOME. */
export function toolEnvironment(source: NodeJS.ProcessEnv, platform: NodeJS.Platform = process.platform): NodeJS.ProcessEnv {
  const { isAbsolute, join } = platform === 'win32' ? win32 : posix;
  const home = platform === 'win32' ? source.USERPROFILE || source.HOME : source.HOME || source.USERPROFILE;
  const result: NodeJS.ProcessEnv = {};
  if (home && isAbsolute(home)) result.BUILDR_HOST_HOME = home;
  // Keep the official override, including "0" (Playwright's hermetic install).
  if (source.PLAYWRIGHT_BROWSERS_PATH !== undefined) result.PLAYWRIGHT_BROWSERS_PATH = source.PLAYWRIGHT_BROWSERS_PATH;
  else if (home && isAbsolute(home)) {
    const custom = platform === 'win32' ? source.LOCALAPPDATA : source.XDG_CACHE_HOME;
    const cache = platform === 'darwin' ? join(home, 'Library', 'Caches')
      : custom && isAbsolute(custom) ? custom
      : platform === 'win32' ? join(home, 'AppData', 'Local') : join(home, '.cache');
    if (isAbsolute(cache)) result.PLAYWRIGHT_BROWSERS_PATH = join(cache, 'ms-playwright');
  }
  return result;
}
