import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ModelQuotaObservation } from '../contracts.ts';
import { record } from './private-account.ts';

const quotaGroups = { gemini: 'Gemini', '3p': 'Claude / GPT' } as const;
const groups = { gemini: 'gemini', claude: '3p' } as const;

export function cliProxyQuotaReader(directory: string) {
  let snapshot: { project: string; expires: number; observedAt: string; value: Promise<ModelQuotaObservation['windows']> } | undefined;
  async function readWindows(baseUrl: string, key: string, project: string) {
    const management = baseUrl.replace(/\/v1$/, '/v8/management');
    const headers = { authorization: 'Bearer ' + key, 'content-type': 'application/json' };
    const signal = AbortSignal.timeout(10_000);
    const credentials = await fetch(management + '/credentials', { headers, redirect: 'error', signal });
    if (!credentials.ok) throw new Error('quota_credentials_unavailable');
    const files = (await credentials.json()).files;
    const candidates = Array.isArray(files) ? files.filter(file => file.provider === 'antigravity' && !file.disabled) : [];
    if (candidates.length !== 1 || typeof candidates[0].auth_index !== 'string') throw new Error('quota_account_ambiguous');
    const response = await fetch(management + '/requests/api-call', {
      method: 'POST', headers, redirect: 'error', signal,
      body: JSON.stringify({
        auth_index: candidates[0].auth_index,
        method: 'POST',
        url: 'https://daily-cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary',
        header: { Authorization: 'Bearer $TOKEN$', 'Content-Type': 'application/json', 'User-Agent': 'antigravity/hub/2.23.0 darwin/arm64' },
        data: JSON.stringify({ project }),
      }),
    });
    if (!response.ok) throw new Error('quota_proxy_unavailable');
    const result = await response.json();
    if (result.status_code !== 200 || typeof result.body !== 'string') throw new Error('quota_upstream_unavailable');
    const payload = JSON.parse(result.body);
    if (!Array.isArray(payload.groups)) throw new Error('quota_response_invalid');
    const windows: NonNullable<ModelQuotaObservation['windows']> = [];
    for (const group of payload.groups) {
      for (const raw of Array.isArray(group?.buckets) ? group.buckets : []) {
        const bucket = record(raw), id = bucket.bucketId, fraction = bucket.remainingFraction, resetsAt = bucket.resetTime;
        if (typeof id !== 'string' || !/^(gemini|3p)-(weekly|5h)$/.test(id)) continue;
        if (typeof fraction !== 'number' || !Number.isFinite(fraction) || fraction < 0 || fraction > 1 ||
            typeof resetsAt !== 'string' || !Number.isFinite(Date.parse(resetsAt))) continue;
        windows.push({ id, groupLabel: quotaGroups[id.split('-')[0] as keyof typeof quotaGroups], label: id.endsWith('-weekly') ? '每周' : '5 小时', remainingPercent: Number((fraction * 100).toFixed(2)), resetsAt });
      }
    }
    if (new Set(windows.map(window => window.id)).size !== 4 || windows.length !== 4) throw new Error('quota_windows_incomplete');
    return windows;
  }
  return async (accountId: string, baseUrl: string, accountProject?: string): Promise<ModelQuotaObservation | undefined> => {
    let settings;
    try { settings = JSON.parse(await readFile(join(directory, 'buildr-quota.json'), 'utf8')); }
    catch { if (!accountProject) return undefined; }
    const group = settings?.accounts?.[accountId];
    const project = accountProject || settings?.project;
    if ((!accountProject && ((group !== 'gemini' && group !== 'claude') || settings?.baseUrl !== baseUrl)) || !/^http:\/\/127\.0\.0\.1:\d+\/v1$/.test(baseUrl)) return undefined;
    const observedAt = new Date().toISOString();
    try {
      if (!snapshot || snapshot.project !== project || snapshot.expires <= Date.now()) {
        const key = (await readFile(join(directory, 'quota-management.key'), 'utf8')).trim();
        if (!key || typeof project !== 'string' || !project) throw new Error('quota_config_invalid');
        if (!snapshot || snapshot.project !== project || snapshot.expires <= Date.now()) snapshot = { project, expires: Date.now() + 30_000, observedAt, value: readWindows(baseUrl, key, project) };
      }
      const windows = (await snapshot.value)?.filter(window => accountProject || window.id.startsWith(groups[group as keyof typeof groups] + '-'));
      return { available: Boolean(windows?.length), observedAt: snapshot.observedAt, windows };
    } catch {
      return { available: false, observedAt, diagnostic: 'Antigravity 额度暂不可读取。' };
    }
  };
}
