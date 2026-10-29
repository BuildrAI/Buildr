import type { AgentServiceOptions } from '../contracts.ts';
import type { AgentHostCapabilities, ExecutionScope, ExecutionScopeRef } from '../execution-contracts.ts';
import { executionScopeRef } from '../execution-contracts.ts';
import { AgentServiceError } from '../domain/agent-state.ts';

/** The core consumes authority observations, never a product task or workspace module. */
export class HostContext {
  readonly capabilities: AgentHostCapabilities;
  private readonly sourceId: string;
  constructor(options: Pick<AgentServiceOptions, 'host' | 'legacySourceId' | 'resolveWorkspace' | 'assertTask'>) {
    this.sourceId = options.legacySourceId ?? 'local';
    this.capabilities = options.host ?? {
      resolveExecutionScope: async ({ ref }) => {
        if (ref.sourceId !== this.sourceId || !options.resolveWorkspace) throw new AgentServiceError('agent_host_unavailable', '执行环境提供方暂时不可用。', 503);
        const resolved = await options.resolveWorkspace(ref.id);
        return { ref, revision: resolved.rootPath, rootPath: resolved.rootPath };
      },
      verifyWorkObject: async ({ ref }) => {
        if (ref.sourceId !== this.sourceId || !options.assertTask) throw new AgentServiceError('agent_host_unavailable', '工作对象提供方暂时不可用。', 503);
        await options.assertTask(ref.scopeId, ref.id);
        return { ref, revision: ref.id };
      },
      listExecutionScopes: async () => { throw new AgentServiceError('agent_host_unavailable', '此宿主未提供范围发现能力。', 503); },
    };
  }
  ref(key: string): ExecutionScopeRef { return executionScopeRef(key, this.sourceId); }
  async resolve(key: string, expectedRevision?: string): Promise<ExecutionScope> {
    const ref = this.ref(key);
    const value = await this.capabilities.resolveExecutionScope({ ref, ...(expectedRevision ? {expectedRevision} : {}) });
    if (value.ref.sourceId !== ref.sourceId || value.ref.id !== ref.id || !value.revision || !value.rootPath) throw new AgentServiceError('agent_scope_binding_changed', '执行环境观察与请求身份不匹配。', 409);
    if (expectedRevision && value.revision !== expectedRevision) throw new AgentServiceError('agent_scope_binding_changed', '执行环境的已观察版本已变化，请核对原工作。', 409);
    return value;
  }
  async verify(key: string, id: string): Promise<void> {
    const scope = this.ref(key);
    const ref = { sourceId: scope.sourceId, scopeId: scope.id, kind: 'work-item', id };
    const result = await this.capabilities.verifyWorkObject({ ref });
    if (!result.revision || Object.entries(ref).some(([key, value]) => result.ref[key as keyof typeof ref] !== value)) throw new AgentServiceError('agent_work_object_changed', '工作对象观察与请求身份不匹配。', 409);
  }
}
