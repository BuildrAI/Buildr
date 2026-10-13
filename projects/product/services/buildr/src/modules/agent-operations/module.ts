import { AgentOperationsApplication } from './application/agent-operations-application.ts';
import { createAgentOperationsHttpContribution } from './interfaces/http/agent-operations-http.ts';
import { createAgentOperationsCliContributions } from './interfaces/cli/agent-operations-cli.ts';

export const AGENT_OPERATIONS_APPLICATION = 'agent-operations.application';
export { AgentOperationsApplication } from './application/agent-operations-application.ts';
export type { CodexDesktopConnector, DshDesktopConnector } from './application/agent-operations-application.ts';
export type { AgentExecutionConfig, AgentExecutionProvider, AgentGenerationEnvironment, AgentGenerationExecution, AgentGenerationInput, AgentRegistryView, AgentRunView, CodexAgentRegistration, CodexConnectResult, CodexDesktopConnectionView, CodexDesktopInstallation, CodexDiscoveryCandidate, CodexDiscoveryView, CodexRemoveResult, DshAgentRegistration, DshConnectResult, DshDiscoveryView, DshDesktopConnectionView } from './domain/agent-operations.ts';
export function createAgentOperationsModule(options: { readProductIdentity(): unknown; resolveWebProfile(identity: unknown): { dataRoot: string } }) {
  return Object.freeze({ id: 'agent-operations', requires: Object.freeze([]), create() {
    const profile = options.resolveWebProfile(options.readProductIdentity());
    const application = new AgentOperationsApplication({ dataRoot: profile.dataRoot, dshChannel: (profile as { profile?: string }).profile === 'released' ? 'released' : 'development' });
    return Object.freeze({ provides: { [AGENT_OPERATIONS_APPLICATION]: application }, contributions: { http: [createAgentOperationsHttpContribution(application)], cli: createAgentOperationsCliContributions(application) } });
  } });
}

export { DshDesktopTransport, readDesktopDiscovery } from './infrastructure/dsh-desktop-transport.ts';
export type { DshDesktopInspection } from './contracts/dsh-desktop-bridge.ts';
export { dshDesktopScopeIdentity } from './infrastructure/dsh-entry.ts';
