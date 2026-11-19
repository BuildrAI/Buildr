import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface ManagedTestTempDir {
  root: string;
  cleanup(): void;
}

/** Creates an isolated temporary directory carrying `.buildr-test-state.json`
 * so abrupt process termination can still be safely reclaimed later. */
export function createManagedTestTempDir(parent = os.tmpdir()): ManagedTestTempDir {
  const resolvedParent = fs.realpathSync(parent);
  const root = fs.realpathSync(fs.mkdtempSync(path.join(resolvedParent, 'buildr-test-state-')));
  const marker = path.join(root, '.buildr-test-state.json');
  const writeMarker = (completed: boolean) => {
    fs.writeFileSync(marker, JSON.stringify({
      schemaVersion: 1,
      root,
      producerPid: process.pid,
      completed,
    }));
  };
  writeMarker(false);
  return {
    root,
    cleanup() {
      try {
        if (fs.existsSync(root)) writeMarker(true);
      } catch { /* Best-effort completion marker before removal. */ }
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}
