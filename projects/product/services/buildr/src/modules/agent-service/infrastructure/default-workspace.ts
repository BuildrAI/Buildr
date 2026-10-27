import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

/** Work products live outside application state; explicit app isolation stays isolated. */
export function defaultWorkspaceRoot(
  profile: { dataRoot: string; overridden?: boolean },
  options: { home?: string; env?: NodeJS.ProcessEnv } = {},
): string {
  const env = options.env ?? process.env;
  if (profile.overridden || env.BUILDR_APP_DATA_DIR) return path.resolve(profile.dataRoot, 'default-workspace');
  const productRoot = env.BUILDR_PRODUCT_DATA_DIR || path.join(options.home ?? os.homedir(), '.buildr');
  return path.resolve(productRoot, 'default-workspace');
}
