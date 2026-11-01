import fs from 'node:fs/promises';
import path from 'node:path';
import { nativeProgramPolicy } from './program-policy.ts';

/** Read only fixed vendor registry endpoints; never run an upstream update command. */
export async function readProgramRelease(provider: string, executable: string, signal: AbortSignal): Promise<{ latestVersion: string; currentReleaseVersion?: string; source: string }> {
  const packageName = nativeProgramPolicy(provider).package.replace(/@[^@]+$/, '');
  const source = `https://registry.npmjs.org/${encodeURIComponent(packageName)}/latest`;
  const response = await fetch(source, { signal: AbortSignal.any([signal, AbortSignal.timeout(10_000)]), redirect: 'error', headers: { accept: 'application/json' } });
  if (!response.ok || !response.body) throw new Error('agent_release_unavailable');
  const reader = response.body.getReader(); let bytes = 0, body = '';
  const decoder = new TextDecoder();
  try {
    while (true) {
      const value = await reader.read(); if (value.done) break;
      bytes += value.value.length; if (bytes > 128 * 1024) throw new Error('agent_release_too_large');
      body += decoder.decode(value.value, { stream: true });
    }
    body += decoder.decode();
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  const metadata = JSON.parse(body);
  if (metadata.name !== packageName || typeof metadata.version !== 'string' || metadata.version.length > 100) throw new Error('agent_release_invalid');
  let currentReleaseVersion: string | undefined;
  if (provider === 'qoder') {
    let directory = path.dirname(await fs.realpath(executable));
    for (let depth = 0; depth < 6; depth++, directory = path.dirname(directory)) {
      signal.throwIfAborted();
      try {
        const file = path.join(directory, 'package.json');
        if ((await fs.stat(file)).size > 128 * 1024) continue;
        const installed = JSON.parse(await fs.readFile(file, 'utf8'));
        if (installed.name === packageName && typeof installed.version === 'string' && installed.version.length <= 100) { currentReleaseVersion = installed.version; break; }
      } catch { /* A standalone program need not have package metadata. */ }
    }
  }
  return { latestVersion: metadata.version, currentReleaseVersion, source };
}
