import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createTestStateWriteBoundary } from '../../src/infrastructure/filesystem/test-state-boundary.ts';

/** Share a verified scenario scope; own a fresh scope when called standalone. */
export function activateIsolatedWorkspaceState({ reuseInherited = false } = {}) {
  if (reuseInherited && process.env.BUILDR_TEST_LOCAL_STATE_ROOT) {
    createTestStateWriteBoundary()(process.env.BUILDR_APP_DATA_DIR!, process.env.BUILDR_PRODUCT_DATA_DIR!);
    return;
  }
  const state = createIsolatedWorkspaceState();
  Object.assign(process.env, state.env);
  process.once('exit', () => {
    try { state.cleanup(); }
    catch (error) {
      process.stderr.write(`Development test state cleanup failed: ${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    }
  });
}

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
      BUILDR_TEST_STATE_REQUIRED: '1',
      BUILDR_TEST_LOCAL_STATE_ROOT: root,
      // Synthetic service fixtures must not adopt or verify the real user's
      // package cache; dependency preparation still uses the native manager.
      BUILDR_TOOLCHAIN_HOST_HOME: path.join(root,'tool-host'),
      npm_config_cache: path.join(root, 'tool-host', 'npm-cache'),
      NPM_CONFIG_CACHE: path.join(root, 'tool-host', 'npm-cache'),
      NODE_COMPILE_CACHE: path.join(root, 'tool-host', 'node-compile'),
      TMPDIR: temp,
      TMP: temp,
      TEMP: temp,
      BUILDR_APP_DATA_DIR: path.join(root, 'app-data'),
      BUILDR_PRODUCT_DATA_DIR: path.join(root, 'product-data'),
    },
    cleanup() {
      // A cancelled child can outlive its test runner. Keep its control records
      // until the owner can stop it; deleting the root would orphan recovery.
      let observationCount = 0;
      const settledOwnerPids = new Set<string>();
      if (process.platform === 'darwin' && fs.existsSync(root)) {
        const observationStarted = Date.now();
        // Process exit can precede final file-handle release. Re-observe a
        // bounded number of times; never delete on an occupied/unknown result.
        for (let attempt = 0; attempt < 3; attempt++) {
          observationCount++;
          const actualRoot = fs.realpathSync(root);
          const use = spawnSync('/usr/sbin/lsof', ['-nP', '-a', '-u', String(process.getuid!()), '-Fpcn'], {encoding:'utf8',timeout:5000,maxBuffer:32*1024*1024});
          const owners = new Set<string>();
          let pid = '', command = '';
          const ownerCommands: string[] = [];
          for (const line of (use.stdout ?? '').split('\n')) {
            if (line.startsWith('p')) pid = line.slice(1);
            if (line.startsWith('c')) command = line.slice(1);
            if (line.startsWith('n'+actualRoot+path.sep) || line === 'n'+actualRoot) { owners.add(pid); ownerCommands.push(command + ':' + line.slice(1)); }
          }
          for (const owner of owners) settledOwnerPids.add(owner);
          const warning = (use.stderr ?? '').trim();
          if (!use.error && use.status === 0 && !warning && !owners.size) break;
          if (attempt < 2 && Date.now() - observationStarted < 1000) continue;
          throw new Error('test_state_still_in_use: retained ' + root + ' ' + JSON.stringify({
            observation: use.error || use.status !== 0 || warning ? 'inconclusive' : 'occupied',
            status: use.status, signal: use.signal, errorCode: (use.error as NodeJS.ErrnoException | undefined)?.code ?? null,
            warning: warning.slice(0, 1000), ownerPids: [...owners], owners: ownerCommands.slice(0, 10),
          }));
        }
      }
      if (fs.existsSync(root)) fs.writeFileSync(marker, JSON.stringify({ ...identity, completed: true }), { mode: 0o600 });
      fs.rmSync(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
      return { status: 'cleaned', observationCount, settledOwnerPids: [...settledOwnerPids] };
    },
  };
}
