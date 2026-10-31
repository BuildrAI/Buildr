import { connectAgentProcess, prepareAgentRuntime, AgentServiceError } from '@buildr-ai/buildr-agent';
import type { AgentRuntimeUnit } from '@buildr-ai/buildr-agent';

/** Activation proves the exact prepared package, independently of old-process retirement. */
export async function activateAgentServiceRuntime(input: {dataRoot: string; profileId: string; runtime?: AgentRuntimeUnit; timeoutMs?: number}) {
  const runtime = input.runtime ?? prepareAgentRuntime({dataRoot: input.dataRoot});
  const connection = await connectAgentProcess({dataRoot: input.dataRoot, profileId: input.profileId, sourceId: 'buildr', runtime, requireRuntime: true, activationTimeoutMs: input.timeoutMs});
  try {
    const status = await connection.lifecycle.status();
    if (status.identity.runtime.digest !== runtime.digest || !status.accepting || status.retiring || status.pendingRuntime) throw new AgentServiceError('agent_process_activation_pending', '目标执行服务尚未启用，激活未完成。', 503);
    return {schemaVersion: 'buildr.agent-activation/v1' as const, status: 'ready' as const, targetDigest: runtime.digest, currentDigest: status.identity.runtime.digest, instanceId: status.identity.instanceId, generation: status.identity.generation, pid: status.identity.pid, accepting: status.accepting};
  } finally { await connection.disconnect(); }
}
