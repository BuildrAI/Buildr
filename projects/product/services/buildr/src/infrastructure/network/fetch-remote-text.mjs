import { execFileSync } from 'node:child_process';
import process from 'node:process';
import { assertVerificationNetworkAllowed } from './verification-network-policy.mjs';

const MAX_TIMEOUT_MS = 120000;
const DEFAULT_INACTIVITY_TIMEOUT_MS = 10000;
const DEFAULT_TOTAL_TIMEOUT_MS = 30000;

function timeoutValue(env, name, fallback) {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0 || value > MAX_TIMEOUT_MS) {
    throw new Error(`${name} must be an integer between 1 and ${MAX_TIMEOUT_MS} milliseconds.`);
  }
  return value;
}

export function remoteTextTimeouts(env = process.env) {
  return {
    inactivityTimeoutMs: timeoutValue(env, 'BUILDR_REMOTE_SKILL_INACTIVITY_TIMEOUT_MS', DEFAULT_INACTIVITY_TIMEOUT_MS),
    totalTimeoutMs: timeoutValue(env, 'BUILDR_REMOTE_SKILL_TOTAL_TIMEOUT_MS', DEFAULT_TOTAL_TIMEOUT_MS),
  };
}

export function fetchRemoteText(url, options = {}) {
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error(`Remote text URL must use http or https: ${url}`);
  const env = options.env ?? process.env;
  assertVerificationNetworkAllowed(parsed, { env, label: options.label ?? 'Remote text fetch' });
  const { inactivityTimeoutMs, totalTimeoutMs } = remoteTextTimeouts(env);
  const label = options.label ?? 'remote text';
  const script = `
const http = require('node:http');
const https = require('node:https');
const initialUrl = process.argv[1];
const inactivityTimeoutMs = Number(process.argv[2]);
function fail(message) {
  console.error(message);
  process.exit(1);
}
function request(nextUrl, redirects = 0) {
  const parsed = new URL(nextUrl);
  if (!['http:', 'https:'].includes(parsed.protocol)) fail('Unsupported redirect protocol: ' + parsed.protocol);
  const client = parsed.protocol === 'https:' ? https : http;
  const req = client.get(parsed, (res) => {
    res.setTimeout(inactivityTimeoutMs, () => res.destroy(new Error('Remote response inactivity timeout after ' + inactivityTimeoutMs + 'ms')));
    if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
      res.resume();
      if (redirects >= 5) fail('Too many redirects');
      request(new URL(res.headers.location, parsed).toString(), redirects + 1);
      return;
    }
    if (res.statusCode < 200 || res.statusCode >= 300) {
      res.resume();
      fail('HTTP ' + res.statusCode + ' for ' + nextUrl);
      return;
    }
    res.setEncoding('utf8');
    res.on('data', (chunk) => process.stdout.write(chunk));
    res.on('error', (error) => fail(error.message));
  });
  req.setTimeout(inactivityTimeoutMs, () => req.destroy(new Error('Remote request inactivity timeout after ' + inactivityTimeoutMs + 'ms')));
  req.on('error', (error) => fail(error.message));
}
request(initialUrl);
`;
  try {
    return execFileSync(process.execPath, ['-e', script, url, String(inactivityTimeoutMs)], {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
      timeout: totalTimeoutMs,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const detail = error.killed || error.signal
      ? `total timeout after ${totalTimeoutMs}ms`
      : String(error.stderr || error.message || 'unknown error').trim();
    throw new Error(`Failed to fetch ${label} (${url}): ${detail}`);
  }
}
