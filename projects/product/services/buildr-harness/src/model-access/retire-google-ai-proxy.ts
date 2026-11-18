import { lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RetiredModelSource } from './contracts.ts';

export const RETIRED_GOOGLE_AI_PROXY_PROVIDER_ID = 'google-ai-subscription';
const loopbackBaseUrl = /^http:\/\/127\.0\.0\.1:\d+\/v1$/;

/**
 * One-time retirement mapping left by the former CLIProxyAPI installer.
 * A missing or malformed file only retires the provider row; unrelated custom
 * sources are never guessed or removed by name or port.
 */
export function readRetiredGoogleAiProxySources(agentServiceRoot: string): RetiredModelSource {
  const retired: RetiredModelSource = { providerIds: [RETIRED_GOOGLE_AI_PROXY_PROVIDER_ID] };
  try {
    const filename = join(agentServiceRoot, '..', 'CLIProxyAPI', 'buildr-quota.json');
    const info = lstatSync(filename);
    if (!info.isFile() || info.isSymbolicLink() || info.size > 64 * 1024) return retired;
    const parsed = JSON.parse(readFileSync(filename, 'utf8')) as Record<string, unknown>;
    const baseUrl = typeof parsed.baseUrl === 'string' && loopbackBaseUrl.test(parsed.baseUrl) ? parsed.baseUrl : undefined;
    if (!baseUrl) return retired;
    const accounts = parsed.accounts && typeof parsed.accounts === 'object' && !Array.isArray(parsed.accounts)
      ? parsed.accounts as Record<string, unknown>
      : {};
    const accountIds: string[] = [];
    const customProtocols: Record<string, 'chat-completions' | 'anthropic-messages'> = {};
    for (const [id, group] of Object.entries(accounts)) {
      if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id) || (group !== 'gemini' && group !== 'claude')) continue;
      accountIds.push(id);
      customProtocols[id] = group === 'claude' ? 'anthropic-messages' : 'chat-completions';
    }
    return { ...retired, accountIds, customBaseUrl: baseUrl, customProtocols };
  } catch {
    return retired;
  }
}
