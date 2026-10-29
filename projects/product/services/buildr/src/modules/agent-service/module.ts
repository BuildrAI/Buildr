import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { connectAgentProcess, AgentServiceError } from '@buildr-ai/buildr-agent';
import type { AgentHostCapabilities, AgentProcessConnection, AgentOperations } from '@buildr-ai/buildr-agent';
import { WORKSPACE_APPLICATION } from '../workspace/module.ts';
import { TASK_QUERY_APPLICATION } from '../task/module.ts';
import { defaultWorkspaceRoot } from './infrastructure/default-workspace.ts';
import { createAgentServiceHttpContribution } from './interfaces/http/agent-service-http.ts';

export const AGENT_SERVICE_APPLICATION = 'agent-service.application';

export function createAgentServiceModule(options: { readProductIdentity(): unknown; resolveWebProfile(identity: unknown): { dataRoot: string; profile?: string; overridden?: boolean } }) {
  return {
    id: 'agent-service', requires: [WORKSPACE_APPLICATION, TASK_QUERY_APPLICATION],
    create(requires: Record<string, any>) {
      let connection: Promise<AgentProcessConnection> | undefined;
      let closed = false;
      const defaultWorkspace = () => {
        const rootPath = defaultWorkspaceRoot(options.resolveWebProfile(options.readProductIdentity()));
        return { rootPath: fs.existsSync(rootPath) ? fs.realpathSync(rootPath) : rootPath };
      };
      // 默认工作空间的对话同样落在私有交互库中，纳入全空间查询范围。
      const registeredWorkspaceIds = () => ['@default', ...requires[WORKSPACE_APPLICATION].listRegisteredWorkspaces().workspaces.filter((entry: any) => entry.workspace?.id && entry.status !== 'identity_conflict').map((entry: any) => entry.workspace.id)];
      const assertSource = (sourceId: string) => { if(sourceId !== 'buildr')throw new AgentServiceError('agent_host_source_mismatch','工作对象不属于此接入来源。',409); };
      const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
      const host: AgentHostCapabilities = {
        async resolveExecutionScope({ ref, expectedRevision }) {
          assertSource(ref.sourceId);
          const workspace = ref.id === '@default' ? defaultWorkspace() : requires[WORKSPACE_APPLICATION].resolveRegisteredWorkspace(ref.id);
          const rootPath = fs.realpathSync(workspace.rootPath), info = fs.statSync(rootPath);
          const revision = digest([ref,rootPath,info.dev,info.ino]);
          if(expectedRevision && revision !== expectedRevision)throw new AgentServiceError('agent_scope_binding_changed','执行环境已变化。',409);
          return { ref, rootPath, revision };
        },
        async verifyWorkObject({ ref, expectedRevision }) {
          assertSource(ref.sourceId);
          if(ref.kind !== 'work-item' || ref.scopeId === '@default')throw new AgentServiceError('agent_work_object_invalid','此范围不支持该关联对象。',409);
          const workspace = requires[WORKSPACE_APPLICATION].resolveRegisteredWorkspace(ref.scopeId);
          const result = requires[TASK_QUERY_APPLICATION].inspectTask(workspace.rootPath, ref.id);
          if(!result?.record || result.taskId !== ref.id)throw new AgentServiceError('agent_task_missing','任务身份不可用。',404);
          const revision = result.recordDigest ?? digest(result.record);
          if(expectedRevision && revision !== expectedRevision)throw new AgentServiceError('agent_work_object_changed','关联对象已变化。',409);
          return { ref, revision };
        },
        async listExecutionScopes({ sourceId }) { assertSource(sourceId); const refs=registeredWorkspaceIds().map(id=>({sourceId,id}));return {refs,revision:digest(refs)}; },
      };
      const connect = () => {
        if(closed)throw new AgentServiceError('agent_process_client_closed','本机主程序连接已释放。',503);
        if(!connection){
          const profile=options.resolveWebProfile(options.readProductIdentity());
          connection=connectAgentProcess({dataRoot:profile.dataRoot,profileId:profile.profile??(profile.overridden?'preview':'released'),sourceId:'buildr',legacySourceId:'buildr',host,autoContinueInterrupted:profile.profile==='development'}).catch(error=>{connection=undefined;throw error;});
        }
        return connection;
      };
      const resolve = async (): Promise<AgentOperations> => (await connect()).operations;
      const start = async () => { await connect(); };
      const runtimeStatus = async () => {
        const status = await (await connect()).lifecycle.status();
        return {instanceId:status.identity.instanceId,generation:status.identity.generation,pid:status.identity.pid,currentDigest:status.identity.runtime.digest,pendingDigest:status.pendingRuntime?.digest,busy:status.activity.busy,accepting:status.accepting,reasons:status.activity.reasons,diagnostic:status.diagnostic};
      };
      const close = async () => { closed=true;const active=connection;connection=undefined;await active?.then(value=>value.disconnect()); };
      return { provides: { [AGENT_SERVICE_APPLICATION]: { start, close, status:async()=>(await connect()).lifecycle.status(), generate: async (input: Parameters<AgentOperations['models']['generate']>[0]) => (await resolve()).models.generate(input) } }, contributions: { http: [createAgentServiceHttpContribution(resolve, { defaultWorkspace, registeredWorkspaceIds, runtimeStatus, prepareDefaultWorkspace: () => {fs.mkdirSync(defaultWorkspace().rootPath,{recursive:true});} })] }, lifecycle: { start: async () => { void start().catch(() => { console.warn('执行后台连接未完成，已有工作记录保留。'); }); }, stop: close } };
    },
  };
}
