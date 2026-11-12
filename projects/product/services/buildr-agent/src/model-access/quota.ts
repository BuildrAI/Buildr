import { ModelAccessError, type ModelAccountView, type ModelOffering } from './contracts.ts';

/** Stale or missing quota cannot deny work. Qoder's zero-cost models do not consume credits. */
export function modelQuotaFailure(account: Pick<ModelAccountView, 'label'|'accountLabel'|'provider'|'quota'>, model?: Pick<ModelOffering,'creditFactor'>, now = Date.now()): ModelAccessError | undefined {
  const quota = account.quota, observed = Date.parse(quota?.observedAt ?? '');
  if (!quota?.available || quota.stale || !Number.isFinite(observed) || now - observed > 60_000 || observed > now + 5_000 || quota.remainingPercent !== 0) return;
  if ((account.provider === 'native-qoder' || account.provider === 'native-qoder-cn') && model?.creditFactor === 0) return;
  return new ModelAccessError('model_quota_exhausted', `${account.accountLabel || account.label} 供应商额度已用尽，请更换可用供应商或模型后继续。`, 429);
}
