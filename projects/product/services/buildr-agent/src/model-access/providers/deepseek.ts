import type { AccountObservation, LoginObservation } from '../../contracts.ts';
import type { ModelProvider, ModelProviderRuntime, ModelProviderObservation, ModelOffering, ProviderInferenceInput } from '../contracts.ts';
import { record, string, positive } from './private-account.ts';

export interface DeepSeekSourceOwner {
  inspect(): Promise<AccountObservation>;
  beginLogin(update: (value: LoginObservation) => void): Promise<void>;
  cancelLogin(): Promise<void>;
  request(url: string, init?: RequestInit): Promise<Response>;
  close(): Promise<void>;
}
export interface DeepSeekProviderOptions { ownerFactory(input: { accountId: string; configRoot: string; environment: Readonly<Record<string, string>> }): DeepSeekSourceOwner | Promise<DeepSeekSourceOwner>; }
/** Native DSH owns authentication; this source never reads or stores its account token. */
export function createDeepSeekModelProvider(options: DeepSeekProviderOptions): ModelProvider {
  return { id: 'deepseek', label: 'DeepSeek / DSH', async open(input) { return new DeepSeekRuntime(await options.ownerFactory(input)); } };
}
class DeepSeekRuntime implements ModelProviderRuntime {
  readonly protocol = 'anthropic-messages' as const;
  private owner: DeepSeekSourceOwner; private lifetime = new AbortController(); private catalog = new Map<string, ModelOffering>();
  constructor(owner: DeepSeekSourceOwner) { this.owner = owner; }
  async inspect(): Promise<ModelProviderObservation> {
    try {
      const account = await this.owner.inspect();
      if (account.status !== 'ready') return { status: account.status, incomplete: account.status === 'failed', label: account.label, models: [], diagnostic: account.diagnostic };
      const response = await this.owner.request('https://api.deepseek.com/models', { method: 'GET', signal: AbortSignal.any([this.lifetime.signal, AbortSignal.timeout(15000)]) });
      if (response.status === 401) { await response.body?.cancel(); return { status: 'expired', label: account.label, models: [], diagnostic: 'model_deepseek_login_expired' }; }
      if (!response.ok) { await response.body?.cancel(); throw new Error('model_deepseek_catalog_failed'); }
      const data = record(await response.json());
      if (!Array.isArray(data.data)) throw new Error('model_deepseek_catalog_invalid');
      const models: ModelOffering[] = data.data.flatMap(value => {
        const row = record(value), id = string(row.id); if (!id || row.enabled === false || row.disabled === true) return [];
        const capabilities = record(row.api_capabilities);
        if (capabilities.anthropic_messages === undefined) return [];
        const effortConfig = record(row.effort);
        const levels = Array.isArray(effortConfig.supported_levels) ? effortConfig.supported_levels : row.reasoning_efforts;
        const efforts = (Array.isArray(levels) ? levels : []).flatMap(value => { const effort = string(value); return effort ? [{ id: effort, label: effort }] : []; });
        return [{ id, label: string(row.name) ?? string(row.display_name) ?? id, images: Array.isArray(row.input_modalities) && row.input_modalities.includes('image'), tools: true, ...(positive(row.context_window) ? { contextWindow: positive(row.context_window) } : {}), ...(positive(row.max_output_tokens) ? { maxOutputTokens: positive(row.max_output_tokens) } : {}), ...(efforts.length ? { reasoningEfforts: efforts, ...(efforts.some(effort=>effort.id===effortConfig.default_level)?{defaultReasoningEffort:string(effortConfig.default_level)}:{}) } : {}) }];
      });
      this.catalog = new Map(models.map(model => [model.id, model]));
      return { status: models.length ? 'ready' : 'failed', label: account.label ?? 'DeepSeek', models, quota: { available: false, observedAt: new Date().toISOString(), summary: 'DeepSeek 账号未返回可读取套餐额度' }, ...(!models.length ? { diagnostic: 'model_deepseek_catalog_empty' } : {}) };
    } catch { return { status: 'failed', incomplete: true, models: [], diagnostic: 'model_deepseek_observation_failed' }; }
  }
  async beginLogin(update: (value: LoginObservation) => void): Promise<void> {
    let completed = false;
    await this.owner.beginLogin(value => { if (value.state === 'completed') { completed = true; update({ state: 'checking' }); } else update(value); });
    if (!completed) return;
    const observation = await this.inspect(); update(observation.status === 'ready' ? { state: 'completed' } : observation.status === 'not-authenticated' ? { state: 'cancelled' } : { state: 'failed', diagnostic: observation.diagnostic ?? 'model_deepseek_login_failed' });
  }
  async cancelLogin(): Promise<void> { await this.owner.cancelLogin(); }
  async infer(input: ProviderInferenceInput): Promise<Response> {
    if (!this.catalog.has(input.modelId)) await this.inspect();
    if (!this.catalog.has(input.modelId)) return Response.json({ error: { code: 'model_not_available' } }, { status: 404 });
    return this.owner.request('https://api.deepseek.com/anthropic/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ ...input.body, model: input.modelId }), signal: AbortSignal.any([this.lifetime.signal, input.signal]) });
  }
  async close(): Promise<void> { this.lifetime.abort(); await this.owner.close(); }
}
