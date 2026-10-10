import { AgentOperationsApplication } from './application/agent-operations-application.ts';
import { createAgentOperationsHttpContribution } from './interfaces/http/agent-operations-http.ts';
import { createAgentOperationsCliContributions } from './interfaces/cli/agent-operations-cli.ts';

export const AGENT_OPERATIONS_APPLICATION = 'agent-operations.application';
export { AgentOperationsApplication } from './application/agent-operations-application.ts';
export type { AgentExecutionConfig, AgentExecutionProvider, AgentGenerationEnvironment, AgentGenerationExecution, AgentGenerationInput, AgentRegistryView, AgentRunView } from './domain/agent-operations.ts';
export function createAgentOperationsModule(options: { readProductIdentity(): unknown; resolveWebProfile(identity: unknown): { dataRoot: string } }) {
  return Object.freeze({ id: 'agent-operations', requires: Object.freeze([]), create() {
    const profile = options.resolveWebProfile(options.readProductIdentity());
    const application = new AgentOperationsApplication({ dataRoot: profile.dataRoot });
    return Object.freeze({ provides: { [AGENT_OPERATIONS_APPLICATION]: application }, contributions: { http: [createAgentOperationsHttpContribution(application)], cli: createAgentOperationsCliContributions(application) } });
  } });
}
