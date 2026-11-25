import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

interface ActivationInput {
  node: string;
  packageRoot: string;
  dataRoot: string;
  port: string;
  entry: string;
}

export function recordDesktopActivation(input: ActivationInput): (() => void) | undefined {
  const nonce = process.env.BUILDR_DEVELOPMENT_DSH_LAUNCH_NONCE;
  const hostPid = process.pid;
  const desktopPid = process.ppid;
  if (!nonce || !/^[A-Za-z0-9_-]{16,128}$/.test(nonce) || !desktopPid || desktopPid <= 1) return undefined;
  const entry = fs.realpathSync(input.entry);
  const entryDigest = createHash('sha256').update(fs.readFileSync(entry)).digest('hex');
  const receiptDir = path.join(input.dataRoot, 'dsh-desktop');
  fs.mkdirSync(receiptDir, { recursive: true, mode: 0o700 });
  const receipt = path.join(receiptDir, 'dsh-development-web-desktop.json');
  const temp = `${receipt}.${hostPid}.${nonce.slice(0, 8)}.tmp`;
  const payload = JSON.stringify({
    schemaVersion: 'buildr.dsh-development-web-desktop/v1',
    nonce,
    desktopPid,
    hostPid,
    observedAt: Date.now(),
    dshHome: process.env.DSH_HOME || path.join(os.homedir(), '.dsh'),
    node: input.node,
    packageRoot: input.packageRoot,
    dataRoot: input.dataRoot,
    port: input.port,
    entry,
    entryDigest,
  });
  fs.writeFileSync(temp, payload, { mode: 0o600, flag: 'wx' });
  fs.renameSync(temp, receipt);
  fs.chmodSync(receipt, 0o600);
  return () => {
    try {
      const current = JSON.parse(fs.readFileSync(receipt, 'utf8'));
      if (current?.nonce === nonce && current?.hostPid === hostPid) fs.rmSync(receipt, { force: true });
    } catch { /* Another host or cleanup already removed this load receipt. */ }
  };
}
