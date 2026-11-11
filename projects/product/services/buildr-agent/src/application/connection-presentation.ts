import type { ConnectionView } from '../contracts.ts';
import type { ModelAccountView } from '../model-access/contracts.ts';

const QODER_CN = 'qoder-cn';

function withStatus(view: ConnectionView, status: ConnectionView['status'], models: ConnectionView['models'], diagnostic?: string): ConnectionView {
  const next: ConnectionView = { ...view, status, models };
  if (diagnostic) next.diagnostic = diagnostic;
  else delete next.diagnostic;
  return next;
}

function withAccount(view: ConnectionView, account: ModelAccountView, status: ConnectionView['status'], models: ConnectionView['models'], diagnostic?: string): ConnectionView {
  const next = withStatus(view, status, models, diagnostic);
  next.account = { label: account.accountLabel || account.label, loginMethod: 'Qoder CN 账号' };
  return next;
}

/**
 * Qoder CN's independent model account owns the native login used by model-bound
 * execution. The program connection keeps its own config and observation, so that
 * observation alone cannot decide whether the connection is usable.
 */
export function presentConnection(view: ConnectionView, account?: ModelAccountView): ConnectionView {
  if (view.id !== QODER_CN || !view.enabled || !view.configPath || !account) return view;
  if (account.sourceEnabled === false) return withAccount(view, account, 'not-authenticated', [], 'Qoder CN 模型来源已停用，请在“模型”中重新启用。');
  if (!account.enabled) return withAccount(view, account, 'not-authenticated', [], 'Qoder CN 模型账号已停用。');
  if (account.status !== 'ready') {
    return withAccount(view, account, account.status === 'disconnected' ? 'not-authenticated' : account.status, [], account.diagnostic);
  }
  const models = account.models
    .filter(model => model.kind !== 'combination' && model.enabled !== false)
    .map((model, index) => ({
      id: model.id,
      label: model.label,
      ...(index === 0 ? { isDefault: true } : {}),
      ...(model.reasoningEfforts ? { reasoningEfforts: model.reasoningEfforts } : {}),
      ...(model.defaultReasoningEffort ? { defaultReasoningEffort: model.defaultReasoningEffort } : {}),
    }));
  if (!models.length) return withAccount(view, account, 'failed', [], 'Qoder CN 账号已登录，但没有启用任何模型。');
  return withAccount(view, account, 'ready', models);
}
