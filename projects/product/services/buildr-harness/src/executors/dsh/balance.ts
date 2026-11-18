import type { ModelQuotaObservation } from '../../model-access/contracts.ts';

type Decimal = { units: bigint; scale: number };
function decimal(value: unknown): Decimal {
  if (typeof value !== 'string' || value.length > 256) throw new Error('invalid_wallet');
  const match = /^(-?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:e([+-]?\d+))?$/i.exec(value);
  if (!match) throw new Error('invalid_wallet');
  const fraction = match[3] ?? match[4] ?? '', exponent = Number(match[5] ?? 0);
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 100) throw new Error('invalid_wallet');
  const scale = fraction.length - exponent;
  return { units: BigInt(`${match[1]}${match[2] ?? '0'}${fraction}`) * 10n ** BigInt(Math.max(0, -scale)), scale: Math.max(0, scale) };
}
function add(left: Decimal, right: Decimal): Decimal {
  const scale = Math.max(left.scale, right.scale);
  return { units: left.units * 10n ** BigInt(scale - left.scale) + right.units * 10n ** BigInt(scale - right.scale), scale };
}
function text(value: Decimal): string {
  const digits = (value.units < 0n ? -value.units : value.units).toString().padStart(value.scale + 1, '0');
  return `${value.units < 0n ? '-' : ''}${value.scale ? `${digits.slice(0, -value.scale)}.${digits.slice(-value.scale)}` : digits}`;
}
/** Only the official account's sanitized wallet projection is consumed, never credentials. */
export function dshBalanceQuota(value: unknown, observedAt = new Date().toISOString()): ModelQuotaObservation {
  const unknown: ModelQuotaObservation = { available: false, observedAt, summary: '账户余额暂不可读取' };
  try {
    if (!value || typeof value !== 'object') return unknown;
    const row = value as Record<string, unknown>;
    if (row.status !== 'ready' || !Array.isArray(row.value) || !Array.isArray(row.bonusWallets)) return unknown;
    const groups = new Map<string, { toppedUp?: Decimal; granted?: Decimal }>();
    for (const [field, wallets] of [['toppedUp', row.value], ['granted', row.bonusWallets]] as const) {
      for (const wallet of wallets) {
        if (!wallet || typeof wallet !== 'object' || !['CNY', 'USD'].includes(wallet.currency)) throw new Error('invalid_wallet');
        const amount = decimal(wallet.balance), group = groups.get(wallet.currency) ?? {};
        group[field] = group[field] ? add(group[field], amount) : amount;
        groups.set(wallet.currency, group);
      }
    }
    const balances = [...groups].map(([currency, group]) => ({
      currency, total: text(add(group.toppedUp ?? { units: 0n, scale: 0 }, group.granted ?? { units: 0n, scale: 0 })),
      ...(group.toppedUp ? { toppedUp: text(group.toppedUp) } : {}),
      ...(group.granted ? { granted: text(group.granted) } : {}),
    }));
    return balances.length ? { available: true, observedAt, balances, summary: balances.map(balance => `账户余额 ${balance.currency} ${balance.total}`).join(' · ') } : unknown;
  } catch { return unknown; }
}
