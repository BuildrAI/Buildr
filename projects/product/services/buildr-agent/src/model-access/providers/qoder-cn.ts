import type { AccountObservation, AgentProgramManager } from '../../contracts.ts';
import type { ModelProvider, ModelProviderObservation, ModelProviderRuntime } from '../contracts.ts';
import { createQoderModelProvider, readQoderIdentity, requestQoderModel } from './qoder.ts';
import { qoderCnModelAccountId, qoderModelAccountId, qoderProduct, type QoderProductId } from '../../executors/qoder/product.ts';
import {
  beginQoderAccountLogin,
  cancelQoderAccountLogin,
  qoderAccountConfigRoot,
  type QoderAccountLoginSession,
} from './qoder-cn-login.ts';

/** Standalone Qoder/Qoder CN model accounts own their login and credentials without requiring an enabled agent. */
export function createStandaloneQoderModelProvider(productId: QoderProductId, programs?: AgentProgramManager): ModelProvider {
  const product = qoderProduct(productId);
  const isCn = productId === 'qoder-cn';
  return {
    id: isCn ? qoderCnModelAccountId : qoderModelAccountId,
    label: product.label,
    linked: true,
    ...(productId === 'qoder' ? { clearCatalogOnUnauthenticated: true } : {}),
    sharing: { kind: 'gateway' },
    inference: 'gateway',
    presentation: { vendorLabel: product.label, sourceLabel: product.label, quotaLabel: product.label },
    async open(input): Promise<ModelProviderRuntime> {
      const config = qoderAccountConfigRoot(productId, input.configRoot);
      const environment = input.environment;
      let login: QoderAccountLoginSession | undefined;
      let preparation: AbortController | undefined;
      const owner = {
        inspect: async (): Promise<AccountObservation> => {
          try { await readQoderIdentity(config); return { status: 'ready' }; }
          catch { return { status: 'not-authenticated' }; }
        },
        identity: async () => `${product.id}:` + (await readQoderIdentity(config)).userID,
        request: (path: string, init?: RequestInit, expectedIdentity?: string) =>
          requestQoderModel(config, path, init, fetch, expectedIdentity, product.id),
      };
      const base = await createQoderModelProvider(owner, productId).open(input);
      const baseInspect = base.inspect.bind(base);
      return {
        protocol: base.protocol,
        identity: () => owner.identity(),
        async inspect(): Promise<ModelProviderObservation> {
          // The native CLI owns the credential write; an absent directory means "not logged in".
          try { await readQoderIdentity(config); }
          catch { return { status: 'not-authenticated', models: [], diagnostic: `请先登录 ${product.label} 账号。` }; }
          return await baseInspect();
        },
        async beginLogin(update) {
          preparation?.abort();
          const active = login; login = undefined;
          await cancelQoderAccountLogin(active, () => true);
          const controller = new AbortController(); preparation = controller;
          try {
            let executable: string | undefined;
            if (programs) {
              update({ state: 'initializing', diagnostic: `正在准备 ${product.label} 官方登录程序，首次使用需要下载；无需启用智能体。` });
              const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(5 * 60 * 1000)]);
              const catalog = await programs.discover({ provider: product.id, signal });
              signal.throwIfAborted();
              const candidates = catalog.candidates.filter(candidate => candidate.compatible);
              if (candidates.length > 1) throw new Error(isCn ? 'qoder_cn_program_ambiguous' : 'qoder_program_ambiguous');
              executable = candidates[0]?.executable;
              if (!executable) {
                if (!catalog.installation.canInstall) {
                  update({ state: 'failed', diagnostic: catalog.installation.diagnostic ?? `${product.label} 官方登录程序暂不可用，请稍后重试。` });
                  return;
                }
                executable = await programs.install({ provider: product.id, version: catalog.installation.version, signal,
                  progress: () => { if (!controller.signal.aborted) update({ state: 'initializing', diagnostic: `正在下载 ${product.label} 官方登录程序，请稍候；可随时取消。` }); } });
              }
            }
            controller.signal.throwIfAborted();
            await beginQoderAccountLogin(productId, config, environment, update, session => { login = session; }, () => { login = undefined; }, { executable, signal: controller.signal });
          } catch {
            if (!controller.signal.aborted) update({ state: 'failed', diagnostic: `${product.label} 官方登录程序准备或启动失败，请检查网络后重试。` });
          } finally { if (preparation === controller) preparation = undefined; }
        },
        async cancelLogin() {
          preparation?.abort();
          const active = login; login = undefined;
          await cancelQoderAccountLogin(active, () => true);
        },
        async close() {
          preparation?.abort();
          const active = login; login = undefined;
          await cancelQoderAccountLogin(active, () => true);
          await base.close();
        },
        async infer(input) { return await base.infer(input); },
      };
    },
  };
}

/** Standalone Qoder international model account provider. */
export function createQoderAccountModelProvider(programs?: AgentProgramManager): ModelProvider {
  return createStandaloneQoderModelProvider('qoder', programs);
}

/** Standalone Qoder CN model account provider. */
export function createQoderCnModelProvider(programs?: AgentProgramManager): ModelProvider {
  return createStandaloneQoderModelProvider('qoder-cn', programs);
}
