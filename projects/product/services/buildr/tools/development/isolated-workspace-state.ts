import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

/**
 * Development checks own their local state, including state written by child
 * CLIs. Nested workers stay below the caller's root so its cleanup also covers
 * workers terminated before their exit hooks can run.
 */
export function createIsolatedWorkspaceState(options: { env?: NodeJS.ProcessEnv; prefix?: string } = {}) {
  const env = options.env ?? process.env;
  const root = fs.mkdtempSync(path.join(env.BUILDR_TEST_LOCAL_STATE_ROOT || os.tmpdir(), options.prefix ?? 'buildr-test-state-'));
  const marker = path.join(root, '.buildr-test-state.json');
  const identity = { schemaVersion: 1, root: fs.realpathSync(root), producerPid: process.pid, completed: false };
  fs.writeFileSync(marker, JSON.stringify(identity), { mode: 0o600 });
  const temp = path.join(root, 'tmp');
  fs.mkdirSync(temp);
  return {
    root,
    env: {
      ...env,
      BUILDR_TEST_LOCAL_STATE_ROOT: root,
      // Synthetic service fixtures must not adopt or verify the real user's
      // package cache; dependency preparation still uses the native manager.
      BUILDR_TOOLCHAIN_HOST_HOME: path.join(root,'tool-host'),
      TMPDIR: temp,
      TMP: temp,
      TEMP: temp,
      BUILDR_APP_DATA_DIR: path.join(root, 'app-data'),
      BUILDR_PRODUCT_DATA_DIR: path.join(root, 'product-data'),
    },
    cleanup() {
      // A cancelled child can outlive its test runner. Keep its control records
      // until the owner can stop it; deleting the root would orphan recovery.
      if (process.platform === 'darwin' && fs.existsSync(root)) {
        const actualRoot = fs.realpathSync(root);
        const use = spawnSync('/usr/sbin/lsof', ['-nP', '-a', '-u', String(process.getuid!()), '-Fpn'], {encoding:'utf8',timeout:5000,maxBuffer:32*1024*1024});
        if (use.error || use.status !== 0 || use.stderr.trim() || use.stdout.split('\n').some(line => line.startsWith('n'+actualRoot+path.sep) || line === 'n'+actualRoot)) {
          throw new Error('test_state_still_in_use: retained ' + root);
        }
      }
      if (fs.existsSync(root)) fs.writeFileSync(marker, JSON.stringify({ ...identity, completed: true }), { mode: 0o600 });
      fs.rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    },
  };
}
