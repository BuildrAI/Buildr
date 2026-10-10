import type { AgentOperationsApplication } from '../../application/agent-operations-application.ts';
import { agentFailure } from '../../domain/agent-operations.ts';
import { AGENT_OPERATIONS_HTTP_SCHEMAS, AGENT_OPERATIONS_HTTP_REQUESTS, AGENT_OPERATIONS_HTTP_OPERATIONS, AGENT_OPERATIONS_HTTP_VALIDATORS } from './agent-operations-http-contracts.ts';

export function createAgentOperationsHttpContribution(application: AgentOperationsApplication) {
  const validate = (schemaId: string, value: unknown, response = false) => {
    if (!AGENT_OPERATIONS_HTTP_VALIDATORS.validate(schemaId, value).valid) throw agentFailure(response ? 'agent_response_invalid' : 'agent_request_invalid', response ? '智能体（Agent）返回结果不符合契约。' : '智能体（Agent）请求字段无效。', response ? 500 : 400);
    return value;
  };
  const result = (schemaId: string, body: unknown) => ({ status: 200, body: validate(schemaId, body, true) });
  return Object.freeze({
    id: 'agent-operations.http', schemas: { ...AGENT_OPERATIONS_HTTP_SCHEMAS, ...AGENT_OPERATIONS_HTTP_REQUESTS }, operations: AGENT_OPERATIONS_HTTP_OPERATIONS,
    async handleTopLevel({ request, pathname, searchParams, authorizeWrite, readJsonBody }: { request: { method?: string }; pathname: string; searchParams: URLSearchParams; authorizeWrite(): void; readJsonBody(): Promise<unknown> }) {
      if (!pathname.startsWith('/api/v1/app/agents')) return null;
      if (request.method === 'GET' && pathname === '/api/v1/app/agents') {
        if (searchParams.size) throw agentFailure('agent_request_invalid', '智能体（Agent）列表不接受查询参数。');
        return result(AGENT_OPERATIONS_HTTP_SCHEMAS.registry.$id, application.listRegistry());
      }
      if (request.method === 'GET' && pathname === '/api/v1/app/agents/runs') {
        const input = Object.fromEntries(searchParams);
        if (searchParams.getAll('runId').length !== 1) throw agentFailure('agent_request_invalid', '必须指定唯一生成身份。');
        validate(AGENT_OPERATIONS_HTTP_REQUESTS.run.$id, input);
        return result(AGENT_OPERATIONS_HTTP_SCHEMAS.run.$id, application.getRun(input.runId));
      }
      if (request.method === 'POST' && ['/api/v1/app/agents/select', '/api/v1/app/agents/cancel'].includes(pathname)) {
        authorizeWrite();
        if (searchParams.size) throw agentFailure('agent_request_invalid', '智能体（Agent）写入不接受查询参数。');
        if (pathname.endsWith('/select')) {
          const input = validate(AGENT_OPERATIONS_HTTP_REQUESTS.select.$id, await readJsonBody()) as { agentId: string; expectedRevision: string };
          return result(AGENT_OPERATIONS_HTTP_SCHEMAS.registry.$id, application.selectAgent(input));
        }
        const input = validate(AGENT_OPERATIONS_HTTP_REQUESTS.cancel.$id, await readJsonBody()) as { runId: string };
        return result(AGENT_OPERATIONS_HTTP_SCHEMAS.run.$id, application.cancelRun(input.runId));
      }
      return null;
    },
  });
}
