import type { ModelAccount } from './types';

type Quota = NonNullable<ModelAccount['quota']>;
function formatBalance(value: string): string {
  const amount = Number(value);
  return value.trim() && Number.isFinite(amount)
    ? amount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : value;
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
  const quota = account.quota, lines: Array<{ text: string; resetsAt?: string }> = [];
  if (quota?.available) {
    lines.push(...balanceLines(quota.balances, compact).map(text => ({ text })));
    lines.push(...(quota.windows ?? []).map(window => ({ text: `${window.label} · 剩余 ${window.remainingPercent}%`, resetsAt: window.resetsAt })));
    if (!lines.length && typeof quota.remainingPercent === 'number') lines.push({ text: `账号额度 · 剩余 ${quota.remainingPercent}%`, resetsAt: quota.resetsAt });
    if (!lines.length && quota.summary) lines.push({ text: quota.summary });
  }
  if (!lines.length) lines.push({ text: quota?.summary || '额度暂不可读取' });
  const observed = Date.parse(quota?.observedAt ?? '');
  return {
    lines,
    stale: !!quota?.stale || !!quota?.available && (!Number.isFinite(observed) || now - observed > 60_000 || observed > now + 5_000),
    observedLabel: Number.isFinite(observed) ? new Date(observed).toLocaleString() : '尚未读取',
  };
}
/** 缓存额度照常展示；只有账号本身待确认才额外说明，额度过期或诊断不另提示。 */
export function accountQuotaWarning(account: ModelAccount): string|undefined {
  return account.status === 'failed' ? '账号待确认' : undefined;
}
/** Failed observations with a previous authenticated snapshot remain explicitly unconfirmed. */
export function quotaOverviewAccounts(accounts: ModelAccount[]): ModelAccount[] {
  return accounts.filter(account => account.status === 'ready' || account.status === 'failed' && !!account.observedAt && (!!account.quota || account.models.length > 0));
}
