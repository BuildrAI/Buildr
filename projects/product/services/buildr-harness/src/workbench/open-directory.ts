import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

/** Callers resolve a permitted object; this adapter never accepts browser input directly. */
export async function openDirectory(directory: string, { platform = process.platform, spawnProcess = spawn }: { platform?: string; spawnProcess?: typeof spawn } = {}) {
  if (!path.isAbsolute(directory) || !fs.statSync(directory).isDirectory()) throw new Error('目录已不存在，请刷新后重试。');
  const command = platform === 'darwin' ? '/usr/bin/open' : platform === 'win32' ? 'explorer.exe' : 'xdg-open';
  const child = spawnProcess(command, [directory], { detached: true, stdio: 'ignore', windowsHide: true, shell: false });
  await new Promise<void>((resolve, reject) => {
    child.once('error', reject);
    child.once('spawn', () => { child.unref(); resolve(); });
  });
  return { requested: true };
}
