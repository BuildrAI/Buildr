import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Development checks own their local state, including state written by child
 * CLIs. Nested workers stay below the caller's root so its cleanup also covers
 * workers terminated before their exit hooks can run.
 */
export function createIsolatedWorkspaceState(options: { env?: NodeJS.ProcessEnv; prefix?: string } = {}) {
  const env = options.env ?? process.env;
  const root = fs.mkdtempSync(path.join(env.BUILDR_TEST_LOCAL_STATE_ROOT || os.tmpdir(), options.prefix ?? 'buildr-test-state-'));
  const temp = path.join(root, 'tmp');
  fs.mkdirSync(temp);
  return {
    root,
    env: {
      ...env,
      BUILDR_TEST_LOCAL_STATE_ROOT: root,
      // Reusable verification evidence outlives disposable test files.
      BUILDR_TEST_SHARED_TEMP_ROOT: env.BUILDR_TEST_SHARED_TEMP_ROOT || os.tmpdir(),
      TMPDIR: temp,
      TMP: temp,
      TEMP: temp,
      BUILDR_APP_DATA_DIR: path.join(root, 'app-data'),
      BUILDR_PRODUCT_DATA_DIR: path.join(root, 'product-data'),
    },
    cleanup() {
      fs.rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    },
  };
}
