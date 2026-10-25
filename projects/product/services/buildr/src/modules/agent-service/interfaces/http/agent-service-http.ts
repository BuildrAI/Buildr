import type { AgentService } from '@buildr-ai/buildr-agent';
import { AgentServiceError } from '@buildr-ai/buildr-agent';
import { AGENT_SERVICE_HTTP_OPERATIONS, AGENT_SERVICE_HTTP_SCHEMAS as SCHEMAS, AGENT_SERVICE_HTTP_VALIDATORS } from './agent-service-http-contracts.ts';

const inputError = () => new AgentServiceError('agent_http_input_invalid', '智能体服务请求字段无效。');
function validate(name: keyof typeof SCHEMAS, input: unknown, response = false): any {
  // The wire representation excludes optional undefined fields before validation.
  const value = JSON.parse(JSON.stringify(input));
  if (!AGENT_SERVICE_HTTP_VALIDATORS.validate(SCHEMAS[name].$id, value).valid) throw response ? new AgentServiceError('agent_http_response_invalid', '智能体服务返回结果不符合契约。', 500) : inputError();
  return value;
}
const result = (name: keyof typeof SCHEMAS, body: unknown, status = 200) => ({ status, body: validate(name, body, true) });
function query(input: URLSearchParams, allowed: string[]): void {
  for (const key of input.keys()) if (!allowed.includes(key) || input.getAll(key).length !== 1) throw inputError();
}
function numberQuery(value: string | null): number | undefined { if (value === null) return; if (!/^\d+$/.test(value)) throw inputError(); const number = Number(value); if (!Number.isSafeInteger(number)) throw inputError(); return number; }

export function createAgentServiceHttpContribution(resolve: () => AgentService) {
  return {
    id: 'agent-service.http', schemas: SCHEMAS, operations: AGENT_SERVICE_HTTP_OPERATIONS,
    async handleTopLevel(context: any) {
      const { request, pathname, searchParams, authorizeRead, authorizeWrite, readJsonBody } = context;
      const prefix = '/api/v1/app/agent-service';
      if (pathname !== prefix && !pathname.startsWith(`${prefix}/`)) return null;
      if (request.method === 'GET') authorizeRead(); else authorizeWrite();
      query(searchParams, []);
      const service = resolve();
      if (pathname === `${prefix}/model-accounts`) {
        if (request.method === 'GET') return result('modelAccounts', await service.models.accounts.list());
        if (request.method === 'POST') return result('modelAccount', await service.models.accounts.add(validate('addModelAccount', await readJsonBody())), 201);
      }
      if (pathname === `${prefix}/model-catalog` && request.method === 'GET') return result('modelCatalog', await service.models.catalog.list());
      const accountRoute = pathname.slice(prefix.length).match(/^\/model-accounts\/([a-zA-Z0-9_-]{1,100})(?:\/(check|disconnect|login-attempts|preferences)(?:\/([a-f0-9-]{36})(?:\/(cancel))?)?)?$/);
      if (accountRoute) {
        const [, accountId, action, attemptId, cancel] = accountRoute;
        if (request.method === 'GET' && !action) return result('modelAccount', await service.models.accounts.read(accountId));
        if (request.method === 'GET' && action === 'login-attempts' && attemptId && !cancel) return result('modelAccount', await service.models.accounts.attempt(accountId, attemptId));
        if (request.method !== 'POST') return null;
        if(action==='preferences'&&!attemptId&&!cancel)return result('modelAccount',await service.models.accounts.preferences(accountId,validate('modelPreferences',await readJsonBody())));
        const body = validate('revision', await readJsonBody());
        if (action === 'check') return result('modelAccount', await service.models.accounts.check(accountId, body));
        if (action === 'disconnect') return result('modelAccount', await service.models.accounts.disconnect(accountId, body));
        if (action === 'login-attempts' && !attemptId) return result('modelAccount', await service.models.accounts.login(accountId, body), 202);
        if (action === 'login-attempts' && attemptId && cancel) return result('modelAccount', await service.models.accounts.cancelLogin(accountId, attemptId, body));
        return null;
      }
      if (pathname === `${prefix}/connections` && request.method === 'GET') return result('connections', service.connections.list());
      if (pathname === `${prefix}/pending-requests` && request.method === 'GET') return result('conversations', service.conversations.pending());
      const match = pathname.slice(prefix.length).match(/^\/connections\/([a-z][a-z0-9-]*)(?:\/(connect|check|disconnect|login-attempts|preparation-attempts)(?:\/([a-f0-9-]{36})(?:\/(cancel))?)?)?$/);
      if (!match) return null;
      const [, id, action, attemptId, cancel] = match;
      if (request.method === 'GET' && !action) return result('connection', service.connections.read(id));
      if (request.method === 'GET' && action === 'preparation-attempts' && !attemptId) return result('currentPreparation', service.connections.currentPreparation(id));
      if (request.method === 'GET' && action === 'preparation-attempts' && attemptId && !cancel) return result('preparation', service.connections.preparation(id, attemptId));
      if (request.method === 'GET' && action === 'login-attempts' && attemptId && !cancel) return result('connection', service.connections.loginAttempt(id, attemptId));
      if (request.method !== 'POST') return null;
      const body = await readJsonBody();
      if (action === 'preparation-attempts' && !attemptId) return result('preparation', service.connections.prepare(id, validate('prepare', body)), 202);
      if (action === 'preparation-attempts' && attemptId && cancel) { validate('empty', body); return result('preparation', await service.connections.cancelPreparation(id, attemptId)); }
      if (action === 'connect' && !attemptId) return result('connection', await service.connections.connect(id, validate('connect', body)));
      if (action === 'check' && !attemptId) return result('connection', await service.connections.check(id, validate('check', body)));
      if (action === 'disconnect' && !attemptId) return result('connection', await service.connections.disconnect(id, validate('revision', body)));
      if (action === 'login-attempts' && !attemptId) return result('connection', service.connections.login(id, validate('revision', body)), 202);
      if (action === 'login-attempts' && attemptId && cancel) return result('connection', await service.connections.cancelLogin(id, attemptId, validate('revision', body)));
      return null;
    },
    async handle(context: any) {
      const { request, suffix, workspaceId, searchParams, authorizeRead, authorizeWrite, authorizeMutation, readJsonBody, readBinaryBody, respond } = context;
      if (suffix !== '/agent-conversations' && !suffix.startsWith('/agent-conversations/')) return null;
      const isImageUpload = request.method === 'POST' && /^\/agent-conversations\/[a-f0-9-]{36}\/attachments$/.test(suffix);
      if (request.method === 'GET') authorizeRead(); else if (isImageUpload) authorizeMutation(); else authorizeWrite();
      const service = resolve();
      if (suffix === '/agent-conversations') {
        if (request.method === 'GET') {
          query(searchParams, ['taskId', 'cursor', 'limit', 'hidden', 'query']);
          if (searchParams.has('hidden') && !['true', 'false'].includes(searchParams.get('hidden'))) throw inputError();
          return result('conversations', service.conversations.list(workspaceId, { taskId: searchParams.get('taskId') ?? undefined, cursor: searchParams.get('cursor') ?? undefined, limit: numberQuery(searchParams.get('limit')), hidden: searchParams.get('hidden') === 'true', query: searchParams.get('query') ?? undefined }));
        }
        query(searchParams, []);
        if (request.method === 'POST') return result('conversation', await service.conversations.create(workspaceId, validate('create', await readJsonBody())), 201);
        return null;
      }
      const match = suffix.match(/^\/agent-conversations\/([a-f0-9-]{36})(?:\/(prepare-send|send|generate-title|observe|stop|events|entries|attachments|requests)(?:\/([a-f0-9-]{36})(?:\/(reply))?)?)?$/);
      if (!match) return null;
      const [, id, action, childId, reply] = match;
      if (request.method === 'GET') {
        if (!action || action === 'entries') {
          query(searchParams, ['before', 'limit']);
          return result('conversation', service.conversations.read(workspaceId, id, { before: numberQuery(searchParams.get('before')), limit: numberQuery(searchParams.get('limit')) }));
        }
        if (action === 'events') {
          query(searchParams, ['cursor', 'generation']);
          numberQuery(searchParams.get('cursor'));
          const subscription = service.conversations.subscribe(workspaceId, id);
          return respond.stream(subscription, (event: unknown) => validate('event', event, true));
        }
        if (action === 'attachments' && childId) {
          query(searchParams, []);
          const attachment = service.conversations.readAttachment(workspaceId, id, childId);
          respond.binary(attachment.bytes, attachment.mimeType, { disposition: 'inline', filename: childId }); return true;
        }
        return null;
      }
      query(searchParams, []);
      if (request.method === 'PATCH' && !action) return result('conversation', service.conversations.update(workspaceId, id, validate('update', await readJsonBody())));
      if (request.method !== 'POST') return null;
      if (action === 'prepare-send') return result('preview', service.conversations.prepareSend(workspaceId, id, validate('draft', await readJsonBody(128 * 1024))));
      if (action === 'send') return result('sent', service.conversations.send(workspaceId, id, validate('send', await readJsonBody(128 * 1024))), 202);
      if (action === 'observe') { validate('empty', await readJsonBody()); return result('conversation', await service.conversations.observe(workspaceId, id)); }
      if (action === 'generate-title') return result('conversation', await service.conversations.generateTitle(workspaceId, id, validate('revision', await readJsonBody())));
      if (action === 'stop') return result('conversation', await service.conversations.stop(workspaceId, id, validate('stop', await readJsonBody())));
      if (action === 'requests' && childId && reply) return result('conversation', await service.conversations.reply(workspaceId, id, childId, validate('reply', await readJsonBody())));
      if (action === 'attachments' && !childId) {
        const metadata = validate('attachment', { expectedRevision: request.headers['x-buildr-conversation-revision'], mimeType: request.headers['content-type'] });
        return result('attachmentResult', service.conversations.addAttachment(workspaceId, id, { ...metadata, bytes: await readBinaryBody(8 * 1024 * 1024) }), 201);
      }
      return null;
    },
  };
}
