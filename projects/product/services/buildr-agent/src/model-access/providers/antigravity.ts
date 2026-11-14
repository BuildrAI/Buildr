import { antigravityModelVariant } from '../../domain/antigravity-model.ts';
import { randomUUID } from 'node:crypto';
import type { AgentRuntime, ConnectionView } from '../../contracts.ts';
import {
  ModelAccessError,
  type ModelProvider,
  type ModelProviderObservation,
  type ModelProviderRuntime,
} from '../contracts.ts';

export const ANTIGRAVITY_CONNECTION_ID = 'antigravity';
export const ANTIGRAVITY_MODEL_ACCOUNT_ID = 'native-antigravity';

export interface AntigravityModelProviderDependencies {
  connections: {
    get(id: string): ConnectionView;
    useProgram<T>(id: string, work: () => Promise<T>): Promise<T>;
    runtime(id: string, gateway?: undefined, accountProbe?: boolean): Promise<AgentRuntime>;
  };
  now(): string;
}

export function createAntigravityModelProvider(deps: AntigravityModelProviderDependencies): ModelProvider {
  const { connections, now } = deps;
  return {
    id: ANTIGRAVITY_MODEL_ACCOUNT_ID,
    label: 'Google',
    connectionId: ANTIGRAVITY_CONNECTION_ID,
    singleton: true,
    observesConnection: true,
    enableDiscoveredModelsByDefault: true,
    legacyModelVariant: antigravityModelVariant,
    authentication: {
      type: 'oauth',
      label: 'Google 官方登录',
    },
    modeLabel: '个人账号',
    sharing: {
      kind: 'executor-exclusive',
      executors: [ANTIGRAVITY_CONNECTION_ID],
      reason: '受 Google 官方授权限制，Google 个人账号仅可在 Antigravity 中使用。',
    },
    inference: 'none',
    presentation: {
      vendorLabel: 'Google',
      sourceLabel: 'Google 个人账号',
      quotaLabel: 'Antigravity 原生账号',
      quotaUnavailableNote:
        'Buildr 当前无法读取剩余额度，可在 Antigravity CLI 中运行 /usage；登录邮箱由官方客户端管理，模型仍可正常使用；若在终端原位覆盖登录其他账号，请在此执行“切换账号”以隔离旧对话。',
      billing: {
        url: 'https://antigravity.google/docs/cli/commands/usage',
        label: '查看额度方法',
      },
    },
    async open(): Promise<ModelProviderRuntime> {
      return {
        protocol: 'gemini',
        async identity(): Promise<string> {
          return connections.useProgram(ANTIGRAVITY_CONNECTION_ID, async () => {
            const runtime = await connections.runtime(ANTIGRAVITY_CONNECTION_ID, undefined, true);
            if (!runtime.modelIdentity) {
              throw new ModelAccessError('model_identity_unavailable', '当前 Antigravity 运行时未能提供账号绑定身份。', 409);
            }
            return runtime.modelIdentity();
          });
        },
        async inspect(): Promise<ModelProviderObservation> {
          return connections.useProgram(ANTIGRAVITY_CONNECTION_ID, async () => {
            const conn = connections.get(ANTIGRAVITY_CONNECTION_ID);
            if (!conn.enabled) {
              return {
                status: 'not-authenticated',
                identity: 'agy-unauthenticated',
                models: [],
                diagnostic: conn.executable
                  ? 'Google 个人账号已退出或尚未启用，请发起官方登录。'
                  : '请先准备本机 Antigravity 程序后再登录 Google 个人账号。',
              };
            }
            const runtime = await connections.runtime(ANTIGRAVITY_CONNECTION_ID, undefined, true);
            if (!runtime.inspectModelSource) {
              throw new ModelAccessError('model_source_unavailable', '当前 Antigravity 运行时不支持模型目录检查。', 503);
            }
            const probe = await runtime.inspectModelSource();
            if (probe.status === 'not-authenticated') {
              return {
                status: 'not-authenticated',
                identity: 'agy-unauthenticated',
                models: [],
                diagnostic: probe.diagnostic ?? '请先使用 Google 个人账号完成官方登录。',
              };
            }
            if (probe.status === 'expired') {
              return {
                status: 'expired',
                models: [],
                diagnostic: probe.diagnostic ?? 'Google 个人账号登录已过期，请重新登录。',
              };
            }
            if (probe.status === 'failed') {
              if (probe.identityUnconfirmed) {
                return {
                  status: 'failed',
                  identity: `agy-unconfirmed:${randomUUID()}`,
                  label: '身份不可确认',
                  models: [],
                  ...(probe.quota ? { quota: probe.quota } : {}),
                  diagnostic:
                    probe.diagnostic ??
                    '身份不可确认：Antigravity 返回的 Google 账号标识损坏或认证归属无法核实，已拒绝用于发送。',
                };
              }
              return {
                status: 'failed',
                ...(probe.accountIdentity ? { identity: probe.accountIdentity } : {}),
                ...(probe.accountLabel ? { label: probe.accountLabel } : {}),
                models: [],
                ...(probe.quota ? { quota: probe.quota } : {}),
                diagnostic: probe.diagnostic ?? '无可用模型：Google 账号已登录，但 Antigravity 未返回任何可用模型。',
              };
            }
            return {
              status: 'ready',
              identity: probe.accountIdentity,
              label: probe.accountLabel ?? 'Google 个人账号',
              models: probe.models,
              quota: probe.quota ?? { available: false, observedAt: now() },
            };
          });
        },
        async beginLogin() {
          throw new ModelAccessError('model_managed_account', '请通过 Antigravity 账号入口发起官方登录。', 409);
        },
        async cancelLogin() {},
        async infer() {
          throw new ModelAccessError(
            'model_inference_unsupported',
            '受 Google 官方授权限制，Google 个人账号来源不提供网关推理。',
            409,
          );
        },
        async close() {},
      };
    },
  };
}
