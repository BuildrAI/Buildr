import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { assertVerificationNetworkAllowed } from './verification-network-policy.ts';
import { currentProductInvocation } from '../product-invocation/index.ts';

const MAX_TIMEOUT_MS = 120000;
const DEFAULT_INACTIVITY_TIMEOUT_MS = 10000;
const DEFAULT_TOTAL_TIMEOUT_MS = 30000;

function timeoutValue(env: any, name: any, fallback: any): any  {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0 || value > MAX_TIMEOUT_MS) {
    throw new Error(`${name} must be an integer between 1 and ${MAX_TIMEOUT_MS} milliseconds.`);
  }
  return value;
}

export function remoteTextTimeouts(env: any = process.env): any  {
  return {
    inactivityTimeoutMs: timeoutValue(env, 'BUILDR_REMOTE_SKILL_INACTIVITY_TIMEOUT_MS', DEFAULT_INACTIVITY_TIMEOUT_MS),
    totalTimeoutMs: timeoutValue(env, 'BUILDR_REMOTE_SKILL_TOTAL_TIMEOUT_MS', DEFAULT_TOTAL_TIMEOUT_MS),
  };
}

export function fetchRemoteText(url: any, options: any = {}): any  {
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error(`Remote text URL must use http or https: ${url}`);
  const env = options.env ?? process.env;
  assertVerificationNetworkAllowed(parsed, { env, label: options.label ?? 'Remote text fetch' });
  const { inactivityTimeoutMs, totalTimeoutMs } = remoteTextTimeouts(env);
  const label = options.label ?? 'remote text';
  const invocation = options.invocation ?? currentProductInvocation();
  try {
    return execFileSync(invocation.command, [...invocation.argsPrefix, '__internal', 'fetch-text', url, String(inactivityTimeoutMs)], {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
      timeout: totalTimeoutMs,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...env, BUILDR_INTERNAL_PRODUCT_REENTRY: '1' },
    });
  } catch (error: any) {
    const detail = error.code === 'ETIMEDOUT'
      ? `total timeout after ${totalTimeoutMs}ms`
      : String(error.stderr || error.message || 'unknown error').trim();
    throw new Error(`Failed to fetch ${label} (${url}): ${detail}`);
  }
}
