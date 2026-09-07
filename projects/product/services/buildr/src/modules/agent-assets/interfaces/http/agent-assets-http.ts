import { AGENT_ASSETS_HTTP_OPERATIONS, AGENT_ASSETS_HTTP_SCHEMAS, validateAgentAssetsHttp } from './agent-assets-http-contracts.ts';

const operation = (id: any) => AGENT_ASSETS_HTTP_OPERATIONS.find((item: any) => item.id === id);

export function createAgentAssetsHttpContribution(application: any): any  {
  function request(operationId: any, body: any): any  {
    const item = operation(operationId);
    if (!item) throw new Error(`Agent Assets HTTP operation is missing: ${operationId}`);
    return validateAgentAssetsHttp(item.requestSchemaId, body, operationId);
  }

  function success(operationId: any, body: any): any  {
    const item = operation(operationId);
    if (!item) throw new Error(`Agent Assets HTTP operation is missing: ${operationId}`);
    return validateAgentAssetsHttp(item.successSchemaId, body, operationId, 'response');
  }

  return Object.freeze({
    id: 'agent-assets.http',
    async handle({ request: httpRequest, suffix, root, authorizeWrite, readJsonBody }: any): Promise<any>  {
      if (httpRequest.method === 'GET' && suffix === '/agent-assets') {
        request('agent-assets.inventory', {});
        return { status: 200, body: success('agent-assets.inventory', application.listAgentAssets(root)) };
      }
      if (httpRequest.method === 'POST' && suffix === '/agent-assets/rules') {
        authorizeWrite();
        const input = request('agent-assets.rules.add', await readJsonBody());
        application.rulesAdd({ id: input.id, description: input.description, path: input.path || `rules/${input.id}.md`, replace: input.replace, scope: '.', targetRoot: root });
        return { status: 200, body: success('agent-assets.rules.add', { operation: 'rules.add', inventory: application.listAgentAssets(root) }) };
      }
      const removeMatch = suffix.match(/^\/agent-assets\/rules\/([^/]+)$/);
      if (httpRequest.method === 'DELETE' && removeMatch) {
        authorizeWrite();
        const input = request('agent-assets.rules.remove', { id: decodeURIComponent(removeMatch[1]) });
        application.rulesRemove({ id: input.id, keepFile: input.keepFile, scope: '.', targetRoot: root });
        return { status: 200, body: success('agent-assets.rules.remove', { operation: 'rules.remove', inventory: application.listAgentAssets(root) }) };
      }
      return null;
    },
    operations: AGENT_ASSETS_HTTP_OPERATIONS,
    schemas: AGENT_ASSETS_HTTP_SCHEMAS,
  });
}
