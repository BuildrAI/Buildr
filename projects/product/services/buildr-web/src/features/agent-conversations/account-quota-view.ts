import {
  DEFAULT_OPENAI_BILLING_URL,
  fallbackApiKeySourceName,
  fallbackBillingLink,
  fallbackKnownSourceName,
} from '../../lib/model-picker.ts';
import type { ModelAccount } from './types';

type Quota = NonNullable<ModelAccount['quota']>;
type QuotaWindow = NonNullable<Quota['windows']>[number];
export const OPENAI_BILLING_URL = DEFAULT_OPENAI_BILLING_URL;
export type AccountQuotaLine = {
  kind: 'balance' | 'window' | 'summary';
  text: string;
  label?: string;
  percent?: number;
  credits?: string;
  resetsAt?: string;
};
const sourceNameOrder = new Intl.Collator('zh-Hans-CN', { sensitivity: 'base', numeric: true });
function formatBalance(value: string): string {
  const amount = Number(value);
  return value.trim() && Number.isFinite(amount)
    ? amount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : value;
}
function formatCredits(value: number): string {
  return Number.isInteger(value)
    ? value.toLocaleString('zh-CN')
    : value.toLocaleString('zh-CN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
/** Display name shared with the model settings provider list; never derive it from the account plan. */
export function accountSourceName(account: ModelAccount): string {
  // Custom providers are named by the user; their protocol label is not a display name.
  if (account.provider === 'custom') return account.group?.label || account.label || '自定义供应商';
  if (account.presentation?.quotaLabel || account.presentation?.sourceLabel) {
    return (account.presentation.quotaLabel || account.presentation.sourceLabel)!;
  }
  if (account.authType === 'api-key') {
    const apiKeyName = fallbackApiKeySourceName(account.provider);
    if (apiKeyName) return apiKeyName;
  }
  const provider = account.connectionId || (account.provider.startsWith('native-') ? account.provider.slice('native-'.length) : account.provider);
  return account.group?.label || fallbackKnownSourceName(provider) || account.label;
}
/** Official billing or plan page declared by the model source. */
export function accountBillingLink(account: Pick<ModelAccount, 'provider' | 'presentation'>): { url: string; label: string } | undefined {
  return account.presentation?.billing ?? fallbackBillingLink(account.provider);
}
export function accountBillingUrl(account: Pick<ModelAccount, 'provider' | 'presentation'>): string | undefined {
  return accountBillingLink(account)?.url;
}
export function compareSourceNames(left: string, right: string): number {
  return sourceNameOrder.compare(left, right);
}
/** Platform amounts stay optional so percentage-only windows never show inferred credits. */
export function quotaWindowCredits(window: Pick<QuotaWindow, 'remainingCredits' | 'totalCredits'>, compact = false): string | undefined {
  if (window.remainingCredits === undefined || window.totalCredits === undefined) return undefined;
  return `${formatCredits(window.remainingCredits)} / ${formatCredits(window.totalCredits)}${compact ? '' : ' credits'}`;
}
export function balanceLines(balances: Quota['balances'], compact = false): string[] {
  return (balances ?? []).map(balance => {
    if (compact) return `${balance.currency} ${formatBalance(balance.total)}`;
    const details = [
      balance.toppedUp !== undefined ? `充值 ${formatBalance(balance.toppedUp)}` : '',
      balance.granted !== undefined ? `赠送 ${formatBalance(balance.granted)}` : '',
    ].filter(Boolean);
    return `账户余额 ${balance.currency} ${formatBalance(balance.total)}${details.length ? `（${details.join(' · ')}）` : ''}`;
  });
}
export function accountQuotaView(account: ModelAccount, now = Date.now(), compact = false) {
  const quota = account.quota, lines: AccountQuotaLine[] = [];
  if (quota?.available) {
    lines.push(...balanceLines(quota.balances, compact).map(text => ({ kind: 'balance' as const, label: '账户余额', text })));
    lines.push(...(quota.windows ?? []).map(window => {
      const credits = quotaWindowCredits(window, compact);
      return { kind: 'window' as const, label: window.label, percent: window.remainingPercent, ...(credits ? { credits } : {}), text: `${window.label} · 剩余 ${window.remainingPercent}%`, resetsAt: window.resetsAt };
    }));
    if (!lines.length && typeof quota.remainingPercent === 'number') lines.push({ kind: 'window', label: '供应商额度', percent: quota.remainingPercent, text: `供应商额度 · 剩余 ${quota.remainingPercent}%`, resetsAt: quota.resetsAt });
    if (!lines.length && quota.summary) lines.push({ kind: 'summary', text: quota.summary });
  }
  if (!lines.length) lines.push({ kind: 'summary', text: quota?.summary || '额度暂不可读取' });
  const observed = Date.parse(quota?.observedAt ?? '');
  return {
    lines,
    stale: !!quota?.stale || !!quota?.available && (!Number.isFinite(observed) || now - observed > 60_000 || observed > now + 5_000),
    observedLabel: Number.isFinite(observed) ? new Date(observed).toLocaleString() : '尚未读取',
  };
}
/** 缓存额度照常展示；只有账号本身待确认才额外说明，额度过期或诊断不另提示。 */
export function accountQuotaWarning(account: ModelAccount): string|undefined {
  return account.status === 'failed' ? '供应商待确认' : undefined;
}
/** Failed observations with a previous authenticated snapshot remain explicitly unconfirmed. */
export function quotaOverviewAccounts(accounts: ModelAccount[]): ModelAccount[] {
  return accounts
    .filter(account => account.status === 'ready' || account.status === 'failed' && !!account.observedAt && (!!account.quota || account.models.length > 0))
    .sort((left, right) => compareSourceNames(accountSourceName(left), accountSourceName(right))
      || compareSourceNames(left.accountLabel || left.label, right.accountLabel || right.label)
      || left.id.localeCompare(right.id));
}
