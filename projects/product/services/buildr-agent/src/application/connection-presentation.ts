import type { ConnectionView } from '../contracts.ts';
import type { ModelAccountView } from '../model-access/contracts.ts';

function withStatus(view: ConnectionView, status: ConnectionView['status'], models: ConnectionView['models'], diagnostic?: string): ConnectionView {
  const next: ConnectionView = { ...view, status, models };
  if (diagnostic) next.diagnostic = diagnostic;
  else delete next.diagnostic;
  return next;
}

function withAccount(view: ConnectionView, account: ModelAccountView, status: ConnectionView['status'], models: ConnectionView['models'], diagnostic?: string): ConnectionView {
  const next = withStatus(view, status, models, diagnostic);
  next.account = { label: account.accountLabel || account.label, loginMethod: `${view.label} 账号` };
  return next;
}

/**
 * When an executor's default native model account owns the execution login,
 * present connection status and available models from that live model account.
 */
export function presentConnection(view: ConnectionView, account?: ModelAccountView, accountManaged = false): ConnectionView {
  if (!view.modelPolicy?.native?.defaultSourceAccountId || !view.enabled || !view.configPath) return view;
  if (!account) {
    if (!accountManaged) return view;
    const next = withStatus(view, 'not-authenticated', []);
    delete next.account;
    return next;
  }
  if (account.sourceEnabled === false) return withAccount(view, account, 'not-authenticated', [], `${view.label} 模型来源已停用，请在“模型”中重新启用。`);
  if (!account.enabled) return withAccount(view, account, 'not-authenticated', [], `${view.label} 模型供应商已停用。`);
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
  if (!models.length) return withAccount(view, account, 'failed', [], `${view.label} 账号已登录，但没有启用任何模型。`);
  return withAccount(view, account, 'ready', models);
}
