import { createProgrammaticHttpContribution } from './interfaces/http/programmatic-http.ts';
import { createAgentCliContributions } from './interfaces/cli/agent.ts';
import { createParticipationSourceObserver } from './application/participation-source.ts';
import { AGENT_ASSETS_SOURCE_QUERY } from '../agent-assets/source/module.ts';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { connectAgentProcess, restartAgentProcess, prepareAgentRuntime, AgentServiceError } from '@buildr-ai/buildr-agent';
import type { AgentHostCapabilities, AgentProcessConnection, AgentOperations, AgentRuntimeUnit } from '@buildr-ai/buildr-agent';
import { WORKSPACE_APPLICATION } from '../workspace/module.ts';
import { TASK_QUERY_APPLICATION } from '../task/module.ts';
import { defaultWorkspaceRoot } from './infrastructure/default-workspace.ts';
import { createAgentServiceHttpContribution } from './interfaces/http/agent-service-http.ts';
import { GROKBOT_CREDENTIAL_ID, readLegacyGlobalWebhook } from './persistence/legacy-webhook-migration.ts';

export const AGENT_SERVICE_APPLICATION = 'agent-service.application';

/** A task preview pins the candidate digest it prepared in the worktree. The host
 * must run exactly that unit; a mismatch fails closed instead of accepting stale code. */
function readPreviewCandidateDigest(env: NodeJS.ProcessEnv = process.env): string | null {
  const value = env.BUILDR_PREVIEW_AGENT_DIGEST;
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) ? value : null;
}

export function createAgentServiceModule(options: { readLocalInstance?(): unknown; readProductIdentity(): unknown; resolveWebProfile(identity: unknown): { dataRoot: string; profile?: string; overridden?: boolean }; runtime?: AgentRuntimeUnit }) {
  return {
    id: 'agent-service', requires: [WORKSPACE_APPLICATION, TASK_QUERY_APPLICATION, AGENT_ASSETS_SOURCE_QUERY],
    create(requires: Record<string, any>) {
      let connection: Promise<AgentProcessConnection> | undefined;
      let closed = false;
      const initialization = new AbortController();
      // The process connection and its default scope must share one profile binding.
      // Directory identity is still checked on every use below.
      let boundProfile: ReturnType<typeof options.resolveWebProfile> | undefined;
      const profile = () => boundProfile ??= options.resolveWebProfile(options.readProductIdentity());
      const defaultWorkspace = () => {
        const rootPath = defaultWorkspaceRoot(profile());
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
          // Identity verification needs the authoritative record and digest only.
          // Full inspection also resolves project/change/worktree diagnostics,
          // which can exceed the callback deadline and block unrelated execution.
          const result = requires[TASK_QUERY_APPLICATION].inspectTaskSummaryView(workspace.rootPath, ref.id);
          if(!result?.record || result.record.taskId !== ref.id)throw new AgentServiceError('agent_task_missing','任务身份不可用。',404);
          const revision = result.recordDigest ?? digest(result.record);
          if(expectedRevision && revision !== expectedRevision)throw new AgentServiceError('agent_work_object_changed','关联对象已变化。',409);
          return { ref, revision };
        },
        observeParticipation:createParticipationSourceObserver({
          root(ref){assertSource(ref.sourceId);return (ref.id==='@default'?defaultWorkspace():requires[WORKSPACE_APPLICATION].resolveRegisteredWorkspace(ref.id)).rootPath;},
          query:requires[AGENT_ASSETS_SOURCE_QUERY],identity:options.readProductIdentity,
        }),
        async listExecutionScopes({ sourceId }) { assertSource(sourceId); const refs=registeredWorkspaceIds().map(id=>({sourceId,id}));return {refs,revision:digest(refs)}; },
      };
      const candidateDigest = readPreviewCandidateDigest();
      let pinnedRuntime: AgentRuntimeUnit | undefined;
      const runtimeOptions = (dataRoot: string): { runtime?: AgentRuntimeUnit; requireRuntime?: boolean } => {
        if (options.runtime) return { runtime: options.runtime };
        if (!candidateDigest) return {};
        pinnedRuntime ??= prepareAgentRuntime({ dataRoot });
        if (pinnedRuntime.digest !== candidateDigest) throw new AgentServiceError('preview_candidate_digest_mismatch', '候选执行运行单元与预览期望不一致，未接管后台。', 409);
        return { runtime: pinnedRuntime, requireRuntime: true };
      };
      const connect = () => {
        if(closed)throw new AgentServiceError('agent_process_client_closed','本机主程序连接已释放。',503);
        if(!connection){
          const bound=profile();
          connection=connectAgentProcess({dataRoot:bound.dataRoot,profileId:bound.profile??(bound.overridden?'preview':'released'),sourceId:'buildr',legacySourceId:'buildr',host,autoContinueInterrupted:true,signal:initialization.signal,...runtimeOptions(bound.dataRoot)}).catch(error=>{connection=undefined;throw error;});
        }
        return connection;
      };
      const resolve = async (): Promise<AgentOperations> => (await connect()).operations;
      let legacyMigration: Promise<void> | undefined;
      const migrateLegacyWebhook = () => legacyMigration ??= (async () => {
        const legacy = readLegacyGlobalWebhook();
        if (!legacy) return;
        try { await (await resolve()).pushback.migrateGlobal(GROKBOT_CREDENTIAL_ID, legacy); }
        catch { console.warn('[agent_pushback_migration] 既有全局通知配置迁移未完成，保留原配置等待重试。'); }
      })();
      const start = async () => { await connect(); await migrateLegacyWebhook(); };
      // 运行单元不一致或存在待切换单元时，响应契约差异来自版本对齐窗口而非违约。
      const runtimeAligning = async () => {
        const connection = await connect();
        const status = await connection.lifecycle.status();
        return !!status.pendingRuntime || status.identity.runtime.digest !== connection.runtime.digest;
      };
      const runtimeStatus = async () => {
        const status = await (await connect()).lifecycle.status();
        return {instanceId:status.identity.instanceId,generation:status.identity.generation,pid:status.identity.pid,currentDigest:status.identity.runtime.digest,pendingDigest:status.pendingRuntime?.digest,busy:status.activity.busy,accepting:status.accepting,reasons:status.activity.reasons,diagnostic:status.diagnostic};
      };
      let restarting = false;
      const restartRuntime = async (input: {expectedGeneration:string}) => {
        if (closed) throw new AgentServiceError('agent_process_client_closed', '网页服务正在退出。', 503);
        if (restarting) throw new AgentServiceError('agent_process_busy', '执行服务正在重启，请等待后重新读取。', 409);
        restarting = true;
        let previous: AgentProcessConnection | undefined;
        try {
          previous = await connect();
          if (closed) throw new AgentServiceError('agent_process_client_closed', '网页服务正在退出。', 503);
          const bound = profile();
          const pending = restartAgentProcess({dataRoot:bound.dataRoot,profileId:bound.profile??(bound.overridden?'preview':'released'),sourceId:'buildr',legacySourceId:'buildr',host,autoContinueInterrupted:true,expectedGeneration:input.expectedGeneration,...runtimeOptions(bound.dataRoot)});
          // Busy/stale refusal leaves the existing host and its active work intact.
          connection = pending.catch(() => previous!);
          await pending;
          await previous.disconnect();
          return await runtimeStatus();
        } finally { restarting = false; }
      };
      const close = async () => {
        closed=true;
        initialization.abort(new AgentServiceError('agent_process_client_closed','本机主程序连接已释放。',503));
        const active=connection;connection=undefined;
        try { await active?.then(value=>value.disconnect()); }
        catch(error) { if(error!==initialization.signal.reason)throw error; }
      };
      const agentHttp = createAgentServiceHttpContribution(resolve, { defaultWorkspace, registeredWorkspaceIds, runtimeStatus, restartRuntime, runtimeAligning, prepareDefaultWorkspace: () => {fs.mkdirSync(defaultWorkspace().rootPath,{recursive:true});} });
      const programmaticHttp = createProgrammaticHttpContribution(resolve, agentHttp, {
        dataRoot: () => profile().dataRoot,
        version: () => String((options.readProductIdentity() as {version?:string})?.version ?? 'unknown'),
        workspaces: () => requires[WORKSPACE_APPLICATION].listRegisteredWorkspaces().workspaces
          .filter((entry: any) => entry.workspace?.id && entry.status !== 'identity_conflict')
          .map((entry: any) => ({ id: entry.workspace.id, name: entry.workspace.name ?? entry.workspace.id })),
      });
      return { provides: { [AGENT_SERVICE_APPLICATION]: { start, close, status:async()=>(await connect()).lifecycle.status(), runtimeStatus, generate: async (input: Parameters<AgentOperations['models']['generate']>[0]) => (await resolve()).models.generate(input) } }, contributions: { cli: createAgentCliContributions(options.readLocalInstance), http: [agentHttp, programmaticHttp] }, lifecycle: { start: async () => { void start().catch(() => { console.warn('执行后台连接未完成，已有工作记录保留。'); }); }, stop: close } };
    },
  };
}
