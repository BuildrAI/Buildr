import type { ModelAccount } from './types.ts';

export const GOOGLE_ACCOUNT = 'native-antigravity';
export const GOOGLE_REFRESH_FRESH_MS = 120_000;
export const GOOGLE_VISIBLE_REFRESH_MS = 300_000;
const loginPending = new Set(['initializing', 'waiting-browser', 'checking']);
type Check = (account: ModelAccount, action: 'check') => Promise<ModelAccount>;

export function googleRefreshIsDue(account: ModelAccount, now: number): boolean {
  if (account.id !== GOOGLE_ACCOUNT || !account.enabled || account.sourceEnabled === false || account.status !== 'ready'
    || loginPending.has(account.loginAttempt?.state ?? '')) return false;
  const fresh = (datetime?: string) => {
    const age = now - Date.parse(datetime ?? '');
    return age >= -5000 && age < GOOGLE_REFRESH_FRESH_MS;
  };
  return !fresh(account.observedAt) || !account.quota?.available || !!account.quota.stale || !fresh(account.quota.observedAt);
}

/** Shared by both visible surfaces for the lifetime of the host API client. */
export function createGoogleAccountRefresh(check: Check, now = Date.now) {
  let pending: Promise<ModelAccount> | undefined;
  let previous: { identity: string | undefined; startedAt: number } | undefined;
  return (account: ModelAccount): Promise<ModelAccount> | undefined => {
    if (!googleRefreshIsDue(account, now())) return;
    if (pending) return pending;
    if (previous && previous.identity === account.identity && now() - previous.startedAt < GOOGLE_REFRESH_FRESH_MS) return;
    previous = { identity: account.identity, startedAt: now() };
    pending = Promise.resolve().then(() => check(account, 'check')).finally(() => { pending = undefined; });
    return pending;
  };
}
