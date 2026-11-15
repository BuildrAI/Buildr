export * from './contracts.ts';
export { conversationEventEncoder, conversationEventDecoder } from './domain/conversation-transfer.ts';
export type { ConversationDelta, ConversationPatch, TransferEvent } from './domain/conversation-transfer.ts';
export { finalReplyEntry, finalReplyForRun } from './domain/conversation-activity.ts';
export * from './execution-contracts.ts';
export { AGENT_OPERATION_SCHEMAS } from './operation-schemas.ts';
export { activateAgentRuntime } from './process/activate-runtime.ts';
export { prepareAgentRuntimeAsync } from './process/runtime-preparation.ts';
export { connectHarnessProcess, connectAgentProcess, stopAgentProcess, restartAgentProcess } from './process/client.ts';
export { assertAgentUpgradeIdle, withAgentDataOffline } from './process/offline-data.ts';
export type { AgentProcessConnection, AgentProcessConnectionOptions } from './process/client.ts';
export type { AgentOperations, AgentSubscription } from './process/operations.ts';
export { prepareAgentRuntime, validateAgentRuntime, computeAgentRuntimeDigest } from './process/runtime-unit.ts';
export { startAgentExecutionServer } from './process/server.ts';
export * from './model-access/contracts.ts';
export { AgentServiceError } from './domain/agent-state.ts';
export { listConnectionExecutables, relocateConnections } from './persistence/connection-relocation.ts';
export type { ConnectionRelocationFailure, ConnectionRelocationResult } from './persistence/connection-relocation.ts';

export { createAgentService } from './application/agent-service.ts';
export type { AgentService } from './application/agent-service.ts';

export { inspectAgentStorage, collectAgentStorage } from './application/storage-maintenance.ts';
export type { AgentStoragePlan } from './application/storage-maintenance.ts';
export { DIRECTORY_SOURCE_ID } from './application/directory-host.ts';
export type { HarnessDirectory } from './application/directory-host.ts';

// One transport implementation is consumed by both product hosts.
export { createAgentServiceHttpContribution } from './interfaces/http/agent-service-http.ts';
export { AGENT_SERVICE_HTTP_SCHEMAS, AGENT_SERVICE_HTTP_VALIDATORS, AGENT_SERVICE_HTTP_OPERATIONS } from './interfaces/http/agent-service-http-contracts.ts';
export { createProgrammaticHttpContribution } from './interfaces/http/programmatic-http.ts';
export { programmaticGuide, programmaticGuideFor, programmaticExample } from './interfaces/http/programmatic-help.ts';
export { programmaticOpenApi, programmaticContractVersion, programmaticOperationIndex, programmaticOperationDocument } from './interfaces/http/programmatic-openapi.ts';
export { PROGRAMMATIC_BASE, PROGRAMMATIC_OPERATIONS, matchPublicOperation } from './interfaces/http/programmatic-operations.ts';
export type { PublicOperation } from './interfaces/http/programmatic-operations.ts';
export { ProgrammaticCredentials, PROGRAMMATIC_SCOPES, accessError } from './persistence/programmatic-credentials.ts';
export type { ProgrammaticCredential, ProgrammaticScope } from './persistence/programmatic-credentials.ts';
export {eventStreamResponse} from './interfaces/http/stream-response.ts';
export {agentRuntimeStatus} from './interfaces/http/runtime-status.ts';
export {defaultHarnessDataRoot,resolveHarnessProfile} from './profile.ts';
export type {HarnessProductId,HarnessProfileName} from './profile.ts';

export {harnessWebRoot} from './web-resource.ts';
