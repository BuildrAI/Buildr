import fs from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { BrowserProfiles, readPrivate } from '../persistence/profiles.ts';
import { serveBrowser } from './runtime.ts';
async function main() {
const root = process.argv[2]!, id = process.argv[3]!;
const profiles = new BrowserProfiles(root);
try {
  for (let attempt = 0; attempt < 100; attempt++) {
    const state = readPrivate(profiles.runtimeFile(id));
    if (state?.pid === process.pid) { await serveBrowser(root, id); break; }
    await delay(25);
  }
} catch {
  // Do not print protocol payloads, cookies, credentials or browser output.
  const file = profiles.runtimeFile(id), state = readPrivate(file);
  if (state?.pid === process.pid) fs.unlinkSync(file);
  process.exitCode = 1;
}
}
void main().catch(() => { process.exitCode = 1; });
