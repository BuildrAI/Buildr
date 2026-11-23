import { createHash, randomUUID } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

/** The native development host reports its own load, not the renderer's readiness. */
export function recordDesktopActivation(input: { node: string; packageRoot: string; dataRoot: string; port: string; entry: string }) {
  const directory = path.join(input.dataRoot, 'agent-service');
  const file = path.join(directory, 'dsh-development-desktop.json');
  const temporary = `${file}.${randomUUID()}`;
  let contents: string;
  try {
    if (realpathSync(directory) !== directory || !lstatSync(directory).isDirectory()) return;
    const observed = lstatSync(file, { throwIfNoEntry: false });
    if (observed && (!observed.isFile() || (observed.mode & 0o077))) return;
    contents = JSON.stringify({
      schemaVersion: 'buildr.dsh-development-desktop/v1',
      desktopPid: process.ppid, hostPid: process.pid, observedAt: Date.now(),
      node: realpathSync(input.node), packageRoot: realpathSync(input.packageRoot), dataRoot: realpathSync(input.dataRoot), port: input.port,
      dshHome: realpathSync(process.env.DSH_HOME || path.join(homedir(), '.dsh')),
      entryDigest: createHash('sha256').update(readFileSync(input.entry)).digest('hex'),
      nonce: /^[a-f0-9]{32}$/.test(process.env.BUILDR_HARNESS_DSH_LAUNCH_NONCE || '') ? process.env.BUILDR_HARNESS_DSH_LAUNCH_NONCE : null,
    });
    writeFileSync(temporary, contents, { flag: 'wx', mode: 0o600 });
    renameSync(temporary, file);
  } catch {
    // An unavailable receipt disables auto-restart, not the desktop panel.
    try { unlinkSync(temporary); } catch { /* no staged receipt */ }
    return;
  }
  return () => {
    try { if (lstatSync(file).isFile() && readFileSync(file, 'utf8') === contents) unlinkSync(file); }
    catch { /* stale receipts cannot prove a live host */ }
  };
}
