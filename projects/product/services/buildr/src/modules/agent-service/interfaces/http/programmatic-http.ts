import { AGENT_SERVICE_HTTP_SCHEMAS as schemas, AGENT_SERVICE_HTTP_VALIDATORS as validators } from './agent-service-http-contracts.ts';
import { createHash } from 'node:crypto';
import type { AgentOperations, AgentService } from '@buildr-ai/buildr-agent';
import { AgentServiceError } from '@buildr-ai/buildr-agent';
import { ProgrammaticCredentials, accessError, PROGRAMMATIC_SCOPES, type ProgrammaticCredential, type ProgrammaticScope } from '../../persistence/programmatic-credentials.ts';
import { PROGRAMMATIC_BASE as base, PROGRAMMATIC_OPERATIONS, matchPublicOperation } from './programmatic-operations.ts';
import { programmaticOpenApi, programmaticGuide, programmaticExample } from './programmatic-help.ts';
import { programmaticContractVersion, programmaticOperationIndex, programmaticOperationDocument } from './programmatic-openapi.ts';

type Workspaces = () => Array<{ id: string; name: string }>;
type Options = { dataRoot(): string; workspaces: Workspaces; version(): string };
/** Authentication adapter only: conversation effects remain owned by the existing application. */
export function createProgrammaticHttpContribution(resolve: () => AgentService | AgentOperations | Promise<AgentService | AgentOperations>, agentHttp: { handle(context: any): Promise<any> }, options: Options) {
  const store = () => new ProgrammaticCredentials(options.dataRoot());
  const permitted = (credential: ProgrammaticCredential, scope: ProgrammaticScope, workspaceId?: string) => {
    if (!credential.scopes.includes(scope) || workspaceId && !credential.workspaceIds.includes(workspaceId)) accessError('programmatic_forbidden', '此凭据未获该工作空间或操作的授权。');
  };
  const locations = (context: any) => {
    const origin = `http://${context.request.headers.host}`;
    return { apiUrl: origin + base, discoveryUrl: origin + base, documentationUrl: origin + base + '/help', operationsUrl: origin + base + '/operations', openapiUrl: origin + base + '/openapi.json', exampleUrl: origin + base + '/example.py' };
  };
  const contribution = {
    id: 'programmatic-access.http', schemas: {}, operations: [],
    async handleTopLevel(context: any) {
      const { request, pathname, searchParams } = context;
      const manager = '/api/v1/app/programmatic-access';
      if (pathname === manager || pathname.startsWith(manager + '/')) {
        if (request.method === 'GET' && pathname === manager) {
          context.authorizeRead();
          return { status: 200, body: { ...locations(context), workspaces: options.workspaces(), scopes: PROGRAMMATIC_SCOPES, credentials: store().list() } };
        }
        if (request.method === 'GET' && pathname.startsWith(manager + '/documents/')) {
          context.authorizeRead();
          const document = pathname.slice((manager + '/documents/').length);
          const detail = document.startsWith('operations/') ? programmaticOperationDocument(options.version(), document.slice('operations/'.length)) : undefined;
          if (!['help', 'openapi.json', 'operations'].includes(document) && !detail) return { status: 404, body: { error: { code: 'programmatic_route_missing', message: '没有此程序文档。' } } };
          return { status: 200, body: {
            fileName: document === 'help' ? 'buildr-api-help.md' : document === 'openapi.json' ? 'buildr-openapi.json' : document === 'operations' ? 'buildr-operations.json' : `buildr-operation-${detail!['x-buildr-operation-id']}.json`,
            mediaType: document === 'help' ? 'text/markdown' : 'application/json',
            content: document === 'help' ? programmaticGuide : JSON.stringify(document === 'operations' ? programmaticOperationIndex(options.version()) : detail ?? programmaticOpenApi(options.version()), null, 2),
          } };
        }
        context.authorizeWrite();
        const input = await context.readJsonBody();
        if (request.method === 'POST' && pathname === manager) return { status: 201, body: store().create(input, options.workspaces().map(item => item.id)) };
        const match = pathname.match(/^\/api\/v1\/app\/programmatic-access\/([a-f0-9-]{36})\/(revoke|regenerate)$/);
        if (request.method === 'POST' && match) {
          if (!input || typeof input !== 'object' || Object.keys(input).some(key => key !== 'expectedRevision') || typeof input.expectedRevision !== 'string') accessError('programmatic_input_invalid', '需要凭据的已观察修订。', 400);
          return { status: 200, body: match[2] === 'regenerate' ? store().regenerate(match[1], input.expectedRevision) : { credential: store().revoke(match[1], input.expectedRevision) } };
        }
        const fullAccess = pathname.match(/^\/api\/v1\/app\/programmatic-access\/([a-f0-9-]{36})\/full-access$/);
        if (request.method === 'POST' && fullAccess) {
          if (!input || typeof input !== 'object' || Object.keys(input).some(key => !['expectedRevision', 'allowFullAccess'].includes(key)) || typeof input.expectedRevision !== 'string' || typeof input.allowFullAccess !== 'boolean') accessError('programmatic_input_invalid', '需要凭据的已观察修订与布尔 allowFullAccess。', 400);
          return { status: 200, body: { credential: store().updateFullAccess(fullAccess[1], input.expectedRevision, input.allowFullAccess) } };
        }
        return { status: 404, body: { error: { code: 'programmatic_route_missing', message: '没有此凭据管理操作。' } } };
      }
      if (pathname !== base && !pathname.startsWith(base + '/')) return null;
      // Retain the host fence; a Bearer is not permission to relax browser-origin protection.
      if (request.headers['sec-fetch-site'] === 'cross-site' || request.headers.origin && request.headers.origin !== `http://${request.headers.host}`) accessError('origin_forbidden', '程序调用不接受跨站浏览器来源。');
      const authenticate = () => store().authenticate(request.headers.authorization);
      const credential = authenticate();
      if (pathname === base && request.method === 'GET') {
        if (searchParams.size) accessError('programmatic_input_invalid', '发现入口不接受查询参数。', 400);
        const service = await resolve();
        const connections = (await service.connections.list()).connections.map(({ id, label, provider, enabled, status, models, capabilities }) => ({ id, label, provider, enabled, status, models, capabilities }));
        const catalog = await service.models.catalog.list({ refresh: false });
        const current = authenticate();
        return { status: 200, body: { schemaVersion: 'buildr.programmatic-discovery/v1', apiVersion: '1', version: options.version(), contractVersion: programmaticContractVersion(programmaticOpenApi(options.version())), status: 'ready', serviceId: createHash('sha256').update(options.dataRoot()).digest('hex'), ...locations(context), credential: current, capabilities: PROGRAMMATIC_OPERATIONS.filter(item => current.scopes.includes(item.scope) || item.id === 'reply' && current.scopes.includes('approve')).map(({ id, method, path, scope, summary }) => ({ id, method, path: `${base}/workspaces/:workspaceId/conversations${path}`, scope, summary, documentationUrl: `${base}/operations/${id}` })), workspaces: options.workspaces().filter(item => current.workspaceIds.includes(item.id)), connections, models: catalog.models } };
      }
      if (request.method === 'GET' && (pathname === base + '/operations' || pathname.startsWith(base + '/operations/'))) {
        if (searchParams.size) accessError('programmatic_input_invalid', '操作文档入口不接受查询参数。', 400);
        const document = pathname === base + '/operations'
          ? programmaticOperationIndex(options.version())
          : programmaticOperationDocument(options.version(), pathname.slice((base + '/operations/').length));
        if (!document) accessError('programmatic_route_missing', '没有此程序操作文档。', 404);
        return { status: 200, body: document };
      }
      if (request.method === 'GET' && [base + '/help', base + '/openapi.json', base + '/example.py'].includes(pathname)) {
        if (pathname.endsWith('/openapi.json')) return { status: 200, body: programmaticOpenApi(options.version()) };
        context.respond.binary(Buffer.from(pathname.endsWith('/example.py') ? programmaticExample : programmaticGuide), pathname.endsWith('/example.py') ? 'text/x-python; charset=utf-8' : 'text/markdown; charset=utf-8');
        return true;
      }
      const route = pathname.match(/^\/api\/v1\/programmatic\/workspaces\/([a-f0-9-]{36})\/conversations(.*)$/);
      if (!route) accessError('programmatic_route_missing', '未公开此程序接口。', 404);
      const [, workspaceId, suffix] = route;
      const match = matchPublicOperation(request.method, suffix);
      if (!match) accessError('programmatic_route_missing', '未公开此程序操作。', 404);
      const { operation, params } = match;
      // No application resolution or object reads before the workspace admission check.
      if (!credential.workspaceIds.includes(workspaceId) || !options.workspaces().some(item => item.id === workspaceId)) accessError('programmatic_forbidden', '未获该已登记工作空间的授权。');
      if (operation.id !== 'reply') permitted(credential, operation.scope, workspaceId);
      else if (!credential.scopes.includes('answer') && !credential.scopes.includes('approve')) accessError('programmatic_forbidden', '没有回答问题或审批权限。');
      const authorize = () => {
        const current = authenticate();
        permitted(current, operation.id === 'reply' ? 'read' : operation.scope, workspaceId);
        if (request.method !== 'GET' && !String(request.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) accessError('content_type_unsupported', '需要application/json。', 415);
      };
      const readJsonBody = async (maxBytes?: number) => {
        const input = await context.readJsonBody(maxBytes);
        authorize();
        if (!validators.validate(schemas[operation.input].$id, input).valid) accessError('agent_http_input_invalid', '智能体服务请求字段无效。', 400);
        if (input && typeof input === 'object') {
          if (input.clientRequestId !== undefined && !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(input.clientRequestId)) accessError('programmatic_input_invalid', '程序提交clientRequestId必须为UUID。', 400);
          if (input.cwd !== undefined || input.taskLinks?.some((link: any) => !credential.workspaceIds.includes(link.workspaceId))) accessError('programmatic_forbidden', '程序接口不接受任意执行目录或越权任务关联。');
          if (input.permissionMode === 'full-access' && !credential.allowFullAccess) accessError('programmatic_forbidden', '此凭据未开启允许全部授权执行，无法请求 full-access。');
          if ((schemas[operation.input] as { properties?: Record<string, unknown> }).properties?.permissionMode) {
            // Omitted mode stays default; explicit full-access is gated by the credential toggle above.
            input.permissionMode ??= 'default';
          }
        }
        if (operation.id === 'reply') {
          const view = await (await resolve()).conversations.read(workspaceId, params.conversationId);
          const pending = view.requests.find(item => item.id === params.requestId);
          if (!pending) accessError('programmatic_request_missing', '问题或审批已失效，请重新观察。', 409);
          permitted(authenticate(), pending.kind === 'approval' ? 'approve' : 'answer', workspaceId);
        }
        return input;
      };
      if (operation.id === 'lookup-send') {
        authorize();
        if (searchParams.size) accessError('programmatic_input_invalid', '提交查询不接受查询参数。', 400);
        const found = await (await resolve()).conversations.lookupRequest(workspaceId, params.conversationId, params.clientRequestId);
        authorize();
        return { status: 200, body: found.found ? { found: true, conversation: found.conversation } : { found: false } };
      }
      // Only the allowlisted context receives program authentication. Web routes remain session-only.
      return await agentHttp.handle({ ...context, workspaceId, suffix: '/agent-conversations' + suffix, registeredWorkspaceIds: () => credential.workspaceIds, authorizeRead: authorize, authorizeWrite: authorize, readJsonBody });
    },
  };
  return { ...contribution, async handleTopLevel(context: any) {
    try { return await contribution.handleTopLevel(context); }
    catch (error) { if (error instanceof AgentServiceError) return { status: error.status, body: { error: { code: error.code, message: error.message } } }; throw error; }
  } };
}
