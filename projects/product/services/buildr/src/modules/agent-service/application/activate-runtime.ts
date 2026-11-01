import { connectAgentProcess, prepareAgentRuntime, stopAgentProcess, AgentServiceError } from '@buildr-ai/buildr-agent';
import type { AgentRuntimeUnit } from '@buildr-ai/buildr-agent';

/** Activation proves the exact prepared package, independently of old-process retirement. */
export async function activateAgentServiceRuntime(input: {dataRoot: string; profileId: string; runtime?: AgentRuntimeUnit; timeoutMs?: number}) {
  let stage='prepare';
  let connection:Awaited<ReturnType<typeof connectAgentProcess>>|undefined;
  try {
    const runtime = input.runtime ?? prepareAgentRuntime({dataRoot: input.dataRoot});
    const connect = () => connectAgentProcess({dataRoot: input.dataRoot, profileId: input.profileId, sourceId: 'buildr', legacySourceId: 'buildr', runtime, requireRuntime: true, activationTimeoutMs: input.timeoutMs});
    stage='connect';connection=await connect();
    stage='probe';
    try { await connection.operations.conversations.listAll(['@default'], {limit:1}); }
    catch (error) {
      if (!(error instanceof AgentServiceError) || error.code !== 'agent_host_source_mismatch') throw error;
      await connection.disconnect();
      stage='release-idle';
      await stopAgentProcess({dataRoot:input.dataRoot,profileId:input.profileId,mode:'if-idle'});
      stage='connect';connection = await connect();
      stage='probe';await connection.operations.conversations.listAll(['@default'], {limit:1});
    }
    stage='verify';
    const status = await connection.lifecycle.status();
    if (status.identity.runtime.digest !== runtime.digest || !status.accepting || status.retiring || status.pendingRuntime) throw new AgentServiceError('agent_process_activation_pending', '目标执行服务尚未启用，激活未完成。', 503);
    return {schemaVersion: 'buildr.agent-activation/v1' as const, status: 'ready' as const, targetDigest: runtime.digest, currentDigest: status.identity.runtime.digest, instanceId: status.identity.instanceId, generation: status.identity.generation, pid: status.identity.pid, accepting: status.accepting};
  } catch(error) {
    const candidate=(error as {code?:unknown})?.code;
    const code=typeof candidate==='string'&&/^[a-zA-Z][a-zA-Z0-9_]{0,99}$/.test(candidate)?candidate:'agent_process_activation_failed';
    // Preserve an actionable internal identity without printing raw paths, headers or vendor messages.
    throw Object.assign(new AgentServiceError(code,`智能体服务启用未完成（${stage} / ${code}），原执行与记录已保留。`,503),{stage,...(typeof (error as {internalCode?:unknown})?.internalCode==='string'?{internalCode:(error as {internalCode:string}).internalCode}:{})});
  } finally { await connection?.disconnect(); }
}
