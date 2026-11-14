import { cliProxyQuotaReader } from './cliproxy-quota.ts';
import { createGoogleAiProxyProvider } from './google-ai-proxy.ts';
import { createHash } from 'node:crypto';
import path from 'node:path';
import type { AgentProgramManager, AgentRuntime, ConnectionView } from '../../contracts.ts';
import { createDeepSeekAccountOwner } from '../../executors/dsh/model-source-owner.ts';
import { qoderProduct } from '../../executors/qoder/product.ts';
import { ModelAccessError, type ModelProvider } from '../contracts.ts';
import { createAnthropicApiModelProvider } from './anthropic-api.ts';
import { createAntigravityModelProvider } from './antigravity.ts';
import { createCodexModelProvider } from './codex.ts';
import { createCustomModelProvider } from './custom.ts';
import { createDeepSeekModelProvider } from './deepseek.ts';
import { createDevinModelProvider } from './devin.ts';
import { createOpenAIApiModelProvider } from './openai-api.ts';
import { createQoderCnModelProvider } from './qoder-cn.ts';
import { createQoderModelProvider, readQoderIdentity, requestQoderModel } from './qoder.ts';

export interface DefaultModelProvidersDependencies {
  root: string;
  connections: {
    descriptor?(id: string): unknown;
    get(id: string): ConnectionView;
    useProgram<T>(id: string, work: () => Promise<T>): Promise<T>;
    runtime(id: string, gateway?: undefined, accountProbe?: boolean): Promise<AgentRuntime>;
  };
  programManager: AgentProgramManager;
  readAccountIdentity(accountId: string): string | undefined;
  now(): string;
}

export function createDefaultModelProviders(deps: DefaultModelProvidersDependencies): ModelProvider[] {
  const { root, connections, programManager, readAccountIdentity, now } = deps;
  const owner = (id: string) => ({
    async inspect() {
      return connections.useProgram(id, async () => {
        if (!connections.get(id).enabled) return { status: 'not-authenticated' as const };
        return (await connections.runtime(id, undefined, true)).inspectAccount();
      });
    },
    async identity() {
      return connections.useProgram(id, async () => {
        const runtime = await connections.runtime(id, undefined, true);
        if (!runtime.modelIdentity) throw new Error('native_model_identity_unavailable');
        return runtime.modelIdentity();
      });
    },
    async request(reqPath: string, init?: RequestInit) {
      return connections.useProgram(id, async () => {
        if (!connections.get(id).enabled) return new Response(null, { status: 401 });
        const inference = ['/codex/responses', '/anthropic/v1/messages'].includes(reqPath);
        const runtime = await connections.runtime(id, undefined, !inference);
        if (!runtime.requestModel) throw new Error('native_model_bridge_unavailable');
        return runtime.requestModel(reqPath, init, inference ? readAccountIdentity('native-' + id) : undefined);
      });
    },
  });
  const dsh = owner('dsh');
  const dshProvider = createDeepSeekModelProvider({
    ownerFactory: () => ({
      ...dsh,
      quota: async () => connections.useProgram('dsh', async () => {
        const runtime = await connections.runtime('dsh', undefined, true);
        return await runtime.modelQuota?.() ?? { available: false, observedAt: now() };
      }),
      beginLogin: async () => { throw new Error('请在DSH账号中登录。'); },
      cancelLogin: async () => {},
      close: async () => {},
      request: (url, init) => dsh.request(new URL(url).pathname, init),
    }),
  });
  const nativeDsh: ModelProvider = {
    ...dshProvider,
    id: 'native-dsh',
    label: 'DeepSeek',
    connectionId: 'dsh',
    presentation: { vendorLabel: 'DeepSeek', sourceLabel: 'DeepSeek Harness', quotaLabel: 'DeepSeek' },
    async open(input) {
      const runtime = await dshProvider.open(input);
      return {
        protocol: runtime.protocol,
        inspect: async () => {
          const value = await runtime.inspect();
          return { ...value, ...(value.status === 'ready' ? { identity: await dsh.identity() } : {}) };
        },
        beginLogin: u => runtime.beginLogin(u),
        cancelLogin: () => runtime.cancelLogin(),
        infer: i => runtime.infer(i),
        close: () => runtime.close(),
      };
    },
  };
  const qoderConfig = path.join(root, 'connections', 'qoder', qoderProduct('qoder').configDirectory);
  const qoder = createQoderModelProvider({
    async identity() {
      if (!connections.get('qoder').enabled) throw new Error('qoder_login_required');
      return 'qoder:' + (await readQoderIdentity(qoderConfig)).userID;
    },
    async inspect() {
      if (!connections.get('qoder').enabled) return { status: 'not-authenticated' };
      await readQoderIdentity(qoderConfig);
      return { status: 'ready' };
    },
    request(url, init, expectedIdentity) {
      if (!connections.get('qoder').enabled) return Promise.resolve(new Response(null, { status: 401 }));
      return requestQoderModel(qoderConfig, url, init, fetch, url === '/chat' ? readAccountIdentity('native-qoder') : expectedIdentity);
    },
  });
  const hasConnection = (id: string) => !connections.descriptor || connections.descriptor(id) !== undefined;
  const linkedProviders = [createCodexModelProvider({ owner: owner('codex') }), nativeDsh, qoder, createQoderCnModelProvider(programManager)]
    .filter(provider => !provider.connectionId || hasConnection(provider.connectionId))
    .map(provider => ({
    ...provider,
    async open(input: Parameters<ModelProvider['open']>[0]) {
      const runtime = await provider.open(input);
      return {
        protocol: runtime.protocol,
        inspect: () => provider.connectionId === 'codex' || provider.connectionId === 'dsh'
          ? connections.useProgram(provider.connectionId, () => runtime.inspect())
          : runtime.inspect(),
        ...(runtime.identity ? { identity: () => runtime.identity!() } : {}),
        beginLogin: (u: Parameters<typeof runtime.beginLogin>[0]) => runtime.beginLogin(u),
        cancelLogin: () => runtime.cancelLogin(),
        close: () => runtime.close(),
        infer: async (i: Parameters<typeof runtime.infer>[0]) => {
          const current = await runtime.identity?.();
          const identity = createHash('sha256').update(current ?? (provider.connectionId ? await owner(provider.connectionId).identity() : '')).digest('hex');
          if (!current && !provider.connectionId) throw new ModelAccessError('model_identity_unavailable', '该模型来源尚未提供账号身份。');
          if (readAccountIdentity(provider.id) !== identity) throw new ModelAccessError('model_identity_conflict', '账号身份已变化，请刷新模型。');
          return runtime.infer(i);
        },
      };
    },
  }));
  return [
    ...linkedProviders,
    ...(hasConnection('antigravity') ? [createAntigravityModelProvider({ connections, now })] : []),
    createCodexModelProvider(),
    createGoogleAiProxyProvider(path.join(root, '..', 'CLIProxyAPI')),
    createOpenAIApiModelProvider(),
    createAnthropicApiModelProvider(),
    createCustomModelProvider({ quota: cliProxyQuotaReader(path.join(root, '..', 'CLIProxyAPI')) }),
    createDevinModelProvider(),
    createDeepSeekModelProvider({
      ownerFactory: async input => {
        const bound = connections.get('dsh').executable;
        const catalog = await programManager.discover({
          provider: 'dsh',
          ...(bound ? { executable: bound, boundExecutable: bound } : {}),
          signal: new AbortController().signal,
        });
        const candidates = catalog.candidates.filter(candidate => candidate.compatible);
        if (candidates.length !== 1) {
          throw new ModelAccessError('model_dsh_program_unavailable', '请先在智能体程序中准备并选择准确的 DSH 程序。');
        }
        return createDeepSeekAccountOwner({ ...input, executable: candidates[0]!.executable });
      },
    }),
  ];
}
