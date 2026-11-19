import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ChildProcess } from 'node:child_process';

/**
 * Detached update/restart successors have no terminal: their standard streams
 * must reach a durable file inside the instance data root or every startup
 * failure becomes an opaque exit code. The log sits beside the continuity log
 * maintained by the self-bootstrap runner.
 */
export const WEB_HANDOFF_SUCCESSOR_LOG = 'web-handoff-successor.log';
export const WEB_HANDOFF_FAILURE_FILE_ENV = 'BUILDR_WEB_HANDOFF_FAILURE_FILE';

export function webHandoffSuccessorLogPath(dataRoot: string): string {
  return path.join(dataRoot, 'logs', WEB_HANDOFF_SUCCESSOR_LOG);
}

/**
 * Append a labelled header line to the successor log without holding an open descriptor.
 * Returns the log file path when dataRoot is available, or null otherwise.
 */
export function appendWebHandoffSuccessorLogHeader(
  webProfile: { dataRoot?: unknown } | null | undefined,
  label: string,
): string | null {
  const dataRoot = webProfile?.dataRoot;
  if (typeof dataRoot !== 'string' || !dataRoot) return null;
  const fd = openWebHandoffSuccessorLog(webProfile, label);
  if (fd !== null) {
    try { fs.closeSync(fd); } catch { /* Best-effort close. */ }
  }
  return webHandoffSuccessorLogPath(dataRoot);
}

export function createWebHandoffFailureFilePath(webProfile: { dataRoot?: unknown } | null | undefined): string {
  const dataRoot = typeof webProfile?.dataRoot === 'string' && webProfile.dataRoot ? webProfile.dataRoot : os.tmpdir();
  return path.join(dataRoot, 'runtime', `handoff-failure-${crypto.randomUUID()}.json`);
}

export function clearWebHandoffFailureFile(filePath: string): void {
  const base = path.basename(filePath);
  if (!base.startsWith('handoff-failure-') || !base.endsWith('.json')) return;
  fs.rmSync(filePath, { force: true });
}

export function readWebHandoffFailureFile(filePath: string): { code: string; message: string } | null {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as { type?: unknown; code?: unknown; message?: unknown };
    if (raw?.type === 'buildr.web-update-handoff-failed' && typeof raw.code === 'string' && typeof raw.message === 'string') {
      return { code: raw.code.slice(0, 200), message: raw.message.slice(0, 4096) };
    }
    return null;
  } catch {
    return null;
  }
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
