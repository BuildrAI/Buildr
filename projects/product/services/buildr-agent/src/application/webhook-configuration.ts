import fs from 'node:fs';
import path from 'node:path';

/** Host-private configuration only; never expose paths, contents or parse errors. */
export function webhookConfiguration(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const explicit = environment.BUILDR_AGENT_WEBHOOK_CONFIG;
  const home = environment.BUILDR_HOST_HOME || environment.HOME || environment.USERPROFILE;
  if (!explicit && !home) return environment;
  const filename = explicit || path.join(home!, '.buildr-webhook.json');
  let descriptor: number | undefined;
  try {
    // NOFOLLOW and descriptor-based validation keep a replaced path from changing what is read.
    descriptor = fs.openSync(filename, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK | (fs.constants.O_NOFOLLOW ?? 0));
    const info = fs.fstatSync(descriptor);
    if (!info.isFile() || (info.mode & 0o077) !== 0 || info.size > 65536 ||
      (process.getuid && info.uid !== process.getuid())) return {};
    const value: unknown = JSON.parse(fs.readFileSync(descriptor, 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const config = value as Record<string, unknown>;
    if (typeof config.url !== 'string' || typeof config.secret !== 'string') return {};
    return { BUILDR_AGENT_WEBHOOK_URL: config.url, BUILDR_AGENT_WEBHOOK_SECRET: config.secret };
  } catch (error) {
    return !explicit && (error as NodeJS.ErrnoException).code === 'ENOENT' ? environment : {};
  } finally { if (descriptor !== undefined) fs.closeSync(descriptor); }
}
