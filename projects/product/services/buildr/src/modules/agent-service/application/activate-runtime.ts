import { activateAgentRuntime, connectHarnessProcess, stopAgentProcess, AgentServiceError } from '@buildr-ai/buildr-harness';
import type { AgentRuntimeUnit } from '@buildr-ai/buildr-harness';

/** Development alone owns its legacy source probe and narrowly scoped recovery. */
export async function activateAgentServiceRuntime(input: {dataRoot: string; profileId: string; runtime?: AgentRuntimeUnit; timeoutMs?: number}) {
  const activate = () => activateAgentRuntime({...input, sourceId: 'buildr'});
  let result = await activate();
  const probe = async () => {
    const connection = await connectHarnessProcess({dataRoot: input.dataRoot, profileId: input.profileId, sourceId: 'buildr', legacySourceId: 'buildr'});
    try { await connection.operations.conversations.listAll(['@default'], {limit: 1}); }
    finally { await connection.disconnect(); }
  };
  try { await probe(); }
  catch (error) {
    if (!(error instanceof AgentServiceError) || error.code !== 'agent_host_source_mismatch') throw error;
    await stopAgentProcess({dataRoot: input.dataRoot, profileId: input.profileId, mode: 'if-idle'});
    result = await activate();
    await probe();
  }
  return result;
}
