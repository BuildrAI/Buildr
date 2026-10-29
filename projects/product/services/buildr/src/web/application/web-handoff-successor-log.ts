import fs from 'node:fs';
import path from 'node:path';
import type { ChildProcess } from 'node:child_process';

/**
 * Detached update/restart successors have no terminal: their standard streams
 * must reach a durable file inside the instance data root or every startup
 * failure becomes an opaque exit code. The log sits beside the continuity log
 * maintained by the self-bootstrap runner.
 */
export const WEB_HANDOFF_SUCCESSOR_LOG = 'web-handoff-successor.log';

export function webHandoffSuccessorLogPath(dataRoot: string): string {
  return path.join(dataRoot, 'logs', WEB_HANDOFF_SUCCESSOR_LOG);
}

/**
 * Opens the successor log in append mode and writes a labelled header line.
 * Returns null (caller falls back to 'ignore') when the profile carries no
 * data root or the file cannot be opened; logging never blocks the handoff.
 */
export function openWebHandoffSuccessorLog(
  webProfile: { dataRoot?: unknown } | null | undefined,
  label: string,
  openLog?: (file: string) => number,
): number | null {
  const dataRoot = webProfile?.dataRoot;
  if (typeof dataRoot !== 'string' || !dataRoot) return null;
  try {
    const file = webHandoffSuccessorLogPath(dataRoot);
    const fd = (openLog || ((target: string) => {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      return fs.openSync(target, 'a');
    }))(file);
    try { fs.writeSync(fd, `[${new Date().toISOString()}] ${label}\n`); } catch { /* A header is diagnostic only; never fail the handoff over it. */ }
    return fd;
  } catch (error) {
    console.error(`Buildr Web successor log unavailable: ${error instanceof Error ? error.message : error}`);
    return null;
  }
}

/**
 * The parent keeps the descriptor only until the child inherits it. Closing on
 * 'spawn'/'error' (or via the returned closer when spawn throws synchronously)
 * releases the parent's copy without affecting the child's inherited one.
 */
export function releaseWebHandoffSuccessorLog(child: ChildProcess, fd: number | null): () => void {
  if (fd === null) return () => {};
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    try { fs.closeSync(fd); } catch { /* Already closed or never valid. */ }
  };
  child.once('spawn', close);
  child.once('error', close);
  return close;
}
