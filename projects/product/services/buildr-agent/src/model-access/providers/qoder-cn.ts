import type { AccountObservation } from '../../contracts.ts';
import type { ModelProvider, ModelProviderObservation, ModelProviderRuntime } from '../contracts.ts';
import { createQoderModelProvider, readQoderIdentity, requestQoderModel } from './qoder.ts';
import { qoderProduct } from '../../executors/qoder/product.ts';
import { beginQoderCnLogin, cancelQoderCnLogin, qoderCnConfigRoot, type QoderCnLoginSession } from './qoder-cn-login.ts';

const product = qoderProduct('qoder-cn');

/** The CN model account owns its login and credentials, so it never waits for an agent program. */
export function createQoderCnModelProvider(): ModelProvider {
  return {
    id: 'native-qoder-cn',
    label: product.label,
    linked: true,
    async open(input): Promise<ModelProviderRuntime> {
      const config = qoderCnConfigRoot(input.configRoot);
      const environment = input.environment;
      let login: QoderCnLoginSession | undefined;
      const owner = {
        inspect: async (): Promise<AccountObservation> => {
          try { await readQoderIdentity(config); return { status: 'ready' }; }
          catch { return { status: 'not-authenticated' }; }
        },
        identity: async () => `${product.id}:` + (await readQoderIdentity(config)).userID,
        request: (path: string, init?: RequestInit) => requestQoderModel(config, path, init, fetch, undefined, product.id),
      };
      const base = await createQoderModelProvider(owner, 'qoder-cn').open(input);
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
          const active = login; login = undefined;
          await cancelQoderCnLogin(active, () => true);
          await beginQoderCnLogin(config, environment, update, session => { login = session; }, () => { login = undefined; });
        },
        async cancelLogin() {
          const active = login; login = undefined;
          await cancelQoderCnLogin(active, () => true);
        },
        async close() {
          const active = login; login = undefined;
          await cancelQoderCnLogin(active, () => true);
          await base.close();
        },
        async infer(input) { return await base.infer(input); },
      };
    },
  };
}
