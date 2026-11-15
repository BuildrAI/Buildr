import type {AgentProcessStatus} from '../../execution-contracts.ts';
/** Shared page projection excludes owner tokens and private runtime paths. */
export function agentRuntimeStatus(status:AgentProcessStatus){return {instanceId:status.identity.instanceId,generation:status.identity.generation,pid:status.identity.pid,currentDigest:status.identity.runtime.digest,pendingDigest:status.pendingRuntime?.digest,busy:status.activity.busy,accepting:status.accepting,reasons:status.activity.reasons,diagnostic:status.diagnostic};}
