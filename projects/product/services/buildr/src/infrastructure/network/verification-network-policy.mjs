import process from 'node:process';

export const VERIFICATION_NETWORK_MODE_ENV = 'BUILDR_VERIFICATION_NETWORK_MODE';
export const OFFLINE_VERIFICATION_NETWORK_MODE = 'offline';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

export function enforceOfflineVerification(env = process.env) {
  env[VERIFICATION_NETWORK_MODE_ENV] = OFFLINE_VERIFICATION_NETWORK_MODE;
  env.npm_config_offline = 'true';
  env.npm_config_audit = 'false';
  env.npm_config_fund = 'false';
  return env;
}

export function assertVerificationNetworkAllowed(url, options = {}) {
  const env = options.env ?? process.env;
  if (env[VERIFICATION_NETWORK_MODE_ENV] !== OFFLINE_VERIFICATION_NETWORK_MODE) return;
  const parsed = url instanceof URL ? url : new URL(url);
  if (LOOPBACK_HOSTS.has(parsed.hostname)) return;
  const label = options.label ?? 'External network access';
  throw new Error(`${label} is disabled during offline verification: ${parsed.origin}`);
}
