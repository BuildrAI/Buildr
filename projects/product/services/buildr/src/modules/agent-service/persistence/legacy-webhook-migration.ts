import fs from 'node:fs';
import path from 'node:path';

export const GROKBOT_CREDENTIAL_ID = 'fb4ffb88-9fc6-48b1-b4d7-4fe98bb7c4a3';

function validTarget(url: string, secret: string): boolean {
  try { const parsed = new URL(url); return ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password && !!secret && !/[^\x21-\x7e]/.test(secret); } catch { return false; }
}

function fromEnvironment(environment: NodeJS.ProcessEnv): { url: string; secret: string } | undefined {
  const url = environment.BUILDR_AGENT_WEBHOOK_URL, secret = environment.BUILDR_AGENT_WEBHOOK_SECRET;
  return typeof url === 'string' && typeof secret === 'string' && url && secret && validTarget(url, secret) ? { url, secret } : undefined;
}

/** Safely read the retired global webhook config; absence, parse failure or unsafe identity all skip without throwing. */
export function readLegacyGlobalWebhook(environment: NodeJS.ProcessEnv = process.env): { url: string; secret: string } | undefined {
  const external = environment.BUILDR_AGENT_WEBHOOK_CONFIG;
  const home = environment.BUILDR_HOST_HOME || environment.HOME || environment.USERPROFILE;
  const filename = external || (home ? path.join(home, '.buildr-webhook.json') : undefined);
  if (!filename) return external ? undefined : fromEnvironment(environment);
  let descriptor: number | undefined;
  try {
    descriptor = fs.openSync(filename, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK | (fs.constants.O_NOFOLLOW ?? 0));
    const info = fs.fstatSync(descriptor);
    if (!info.isFile() || (info.mode & 0o077) || info.size > 65536 || (process.getuid && info.uid !== process.getuid())) return undefined;
    const value = JSON.parse(fs.readFileSync(descriptor, 'utf8')) as { url?: unknown; secret?: unknown } | null;
    const url = value?.url, secret = value?.secret;
    return typeof url === 'string' && typeof secret === 'string' && url && secret && validTarget(url, secret) ? { url, secret } : undefined;
  } catch (error) {
    if (!external && (error as NodeJS.ErrnoException).code === 'ENOENT') return fromEnvironment(environment);
    return undefined;
  } finally { if (descriptor !== undefined) fs.closeSync(descriptor); }
}