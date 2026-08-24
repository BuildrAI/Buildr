import { AGENT_ASSETS_HTTP_OPERATIONS, AGENT_ASSETS_HTTP_SCHEMAS, validateAgentAssetsHttp } from './agent-assets-http-contracts.mjs';

const operation = (id) => AGENT_ASSETS_HTTP_OPERATIONS.find((item) => item.id === id);

export function createAgentAssetsHttpContribution(application) {
  function request(operationId, body) {
    const item = operation(operationId);
    return validateAgentAssetsHttp(item.requestSchemaId, body, operationId);
  }

  function success(operationId, body) {
    const item = operation(operationId);
    return validateAgentAssetsHttp(item.successSchemaId, body, operationId, 'response');
  }

  return Object.freeze({
    id: 'agent-assets.http',
    async handle({ request: httpRequest, suffix, root, authorizeWrite, readJsonBody }) {
      if (httpRequest.method === 'GET' && suffix === '/agent-assets') {
        request('agent-assets.inventory', {});
        return { status: 200, body: success('agent-assets.inventory', application.listAgentAssets(root)) };
      }
      if (httpRequest.method === 'POST' && suffix === '/agent-assets/rules') {
        authorizeWrite();
        const input = request('agent-assets.rules.add', await readJsonBody());
        const args = [input.id, '--description', input.description, '--path', input.path || `rules/${input.id}.md`, ...(input.replace ? ['--replace'] : []), '--target', root];
        application.rulesAdd(args);
        return { status: 200, body: success('agent-assets.rules.add', { operation: 'rules.add', inventory: application.listAgentAssets(root) }) };
      }
      const removeMatch = suffix.match(/^\/agent-assets\/rules\/([^/]+)$/);
      if (httpRequest.method === 'DELETE' && removeMatch) {
        authorizeWrite();
        const input = request('agent-assets.rules.remove', { id: decodeURIComponent(removeMatch[1]) });
        application.rulesRemove([input.id, ...(input.keepFile ? ['--keep-file'] : []), '--target', root]);
        return { status: 200, body: success('agent-assets.rules.remove', { operation: 'rules.remove', inventory: application.listAgentAssets(root) }) };
      }
      return null;
    },
    operations: AGENT_ASSETS_HTTP_OPERATIONS,
    schemas: AGENT_ASSETS_HTTP_SCHEMAS,
  });
}
