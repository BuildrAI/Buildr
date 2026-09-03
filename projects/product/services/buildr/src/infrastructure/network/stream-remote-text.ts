import http from 'node:http';
import https from 'node:https';
import process from 'node:process';
import { assertVerificationNetworkAllowed } from './verification-network-policy.ts';

const REDIRECT_STATUS_CODES: any = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 5;

export function streamRemoteText(url: any, inactivityTimeoutMs: any, redirects: any = 0, options: any = {}): any  {
  return new Promise((resolve: any, reject: any) => {
    let parsed;
    try {
      parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error(`Unsupported redirect protocol: ${parsed.protocol}`);
      assertVerificationNetworkAllowed(parsed, { env: options.env ?? process.env, label: redirects === 0 ? 'Remote text fetch' : 'Remote text redirect' });
    } catch (error: any) {
      reject(error);
      return;
    }

    const client = parsed.protocol === 'https:' ? https : http;
    let redirectedOrRejected = false;
    const request = client.get(parsed, (response: any) => {
      response.setTimeout(inactivityTimeoutMs, () => response.destroy(new Error(`Remote response inactivity timeout after ${inactivityTimeoutMs}ms`)));
      response.on('error', (error: any) => {
        if (!redirectedOrRejected) reject(error);
      });

      if (REDIRECT_STATUS_CODES.has(response.statusCode) && response.headers.location) {
        if (redirects >= MAX_REDIRECTS) {
          redirectedOrRejected = true;
          response.destroy();
          reject(new Error('Too many redirects'));
          return;
        }
        let nextUrl;
        try {
          nextUrl = new URL(response.headers.location, parsed).toString();
        } catch (error: any) {
          redirectedOrRejected = true;
          response.destroy();
          reject(error);
          return;
        }
        redirectedOrRejected = true;
        response.destroy();
        streamRemoteText(nextUrl, inactivityTimeoutMs, redirects + 1, options).then(resolve, reject);
        return;
      }

      if (response.statusCode < 200 || response.statusCode >= 300) {
        redirectedOrRejected = true;
        response.destroy();
        reject(new Error(`HTTP ${response.statusCode} for ${url}`));
        return;
      }

      response.setEncoding('utf8');
      response.on('data', (chunk: any) => (options.stdout ?? process.stdout).write(chunk));
      response.on('end', resolve);
    });
    request.setTimeout(inactivityTimeoutMs, () => request.destroy(new Error(`Remote request inactivity timeout after ${inactivityTimeoutMs}ms`)));
    request.on('error', (error: any) => {
      if (!redirectedOrRejected) reject(error);
    });
  });
}
