import {executionScopeKey,executionScopeRef} from '../../execution-contracts.ts';
import { AGENT_SERVICE_HTTP_SCHEMAS as schemas, AGENT_SERVICE_HTTP_VALIDATORS as validators } from './agent-service-http-contracts.ts';
import { createHash } from 'node:crypto';
import type { AgentOperations } from '../../process/operations.ts';
import type { AgentService } from '../../application/agent-service.ts';
import { AgentServiceError } from '../../domain/agent-state.ts';
import { accessError, PROGRAMMATIC_SCOPES, type ProgrammaticCredential, type ProgrammaticScope } from '../../persistence/programmatic-credentials.ts';
import { PROGRAMMATIC_BASE as base, PROGRAMMATIC_OPERATIONS, matchPublicOperation } from './programmatic-operations.ts';
import { programmaticOpenApi, programmaticGuideFor, programmaticExample } from './programmatic-help.ts';
import { programmaticContractVersion, programmaticOperationIndex, programmaticOperationDocument } from './programmatic-openapi.ts';

type Workspaces = () => Array<{ id: string; name: string }>;
type Options = { dataRoot(): string; workspaces: Workspaces; version(): string; buildId(): string | null; scopeKeys?():Promise<string[]> };
/** Authentication adapter only: conversation effects remain owned by the existing application. */
export function createProgrammaticHttpContribution(resolve: () => AgentService | AgentOperations | Promise<AgentService | AgentOperations>, agentHttp: { handle(context: any): Promise<any> }, options: Options) {
  const store = async () => (await resolve()).programmatic;
  const rememberCredentialAccess = async (credential: ProgrammaticCredential) => {
    try {
      await (await resolve()).pushback.setCredentialAccess(credential.id, { scopes: credential.scopes, allowFullAccess: credential.allowFullAccess });
    } catch { console.warn('[programmatic_pushback_wiring] 凭据权限快照更新未完成，主操作结果保留。'); }
  };
  const scopeKeys=options.scopeKeys??(async()=>options.workspaces().map(item=>item.id));
  const allowedScope=(credential:ProgrammaticCredential,key:string)=>{const ref=executionScopeRef(key,'buildr');return (credential.executionScopes??credential.workspaceIds.map(id=>({sourceId:'buildr',id}))).some(item=>item.sourceId===ref.sourceId&&item.id===ref.id);};
  const registeredScope=async(key:string)=>{const ref=executionScopeRef(key,'buildr');return (await scopeKeys()).some(value=>{const candidate=executionScopeRef(value,'buildr');return ref.sourceId===candidate.sourceId&&ref.id===candidate.id;});};
  const sourceRoute=(pathname:string,tail:string)=>{const match=pathname.match(new RegExp('^/api/v1/programmatic/sources/([^/]+)/scopes/([^/]+)/'+tail+'$'));return match?{key:decodeURIComponent(match[1]!)==='buildr'?decodeURIComponent(match[2]!):executionScopeKey({sourceId:decodeURIComponent(match[1]!),id:decodeURIComponent(match[2]!)}),suffix:match[3]??''}:undefined;};
  const permitted = (credential: ProgrammaticCredential, scope: ProgrammaticScope, workspaceId?: string) => {
    if (!credential.scopes.includes(scope) || workspaceId && !allowedScope(credential,workspaceId)) accessError('programmatic_forbidden', '此凭据未获该工作空间或操作的授权。');
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
          return { status: 200, body: { ...locations(context), workspaces: options.workspaces(), executionScopes:(await scopeKeys()).map(key=>{const ref=executionScopeRef(key,'buildr');return {key,ref,label:ref.sourceId==='buildr'?(options.workspaces().find(item=>item.id===ref.id)?.name??ref.id):ref.sourceId+' / '+ref.id};}), scopes: PROGRAMMATIC_SCOPES, credentials: (await (await store()).list()) } };
        }
        if (request.method === 'GET' && pathname.startsWith(manager + '/documents/')) {
          context.authorizeRead();
          const document = pathname.slice((manager + '/documents/').length);
          const buildId = options.buildId();
          const detail = document.startsWith('operations/') ? programmaticOperationDocument(options.version(), document.slice('operations/'.length), buildId) : undefined;
          if (!['help', 'openapi.json', 'operations'].includes(document) && !detail) return { status: 404, body: { error: { code: 'programmatic_route_missing', message: '没有此程序文档。' } } };
          return { status: 200, body: {
            fileName: document === 'help' ? 'buildr-api-help.md' : document === 'openapi.json' ? 'buildr-openapi.json' : document === 'operations' ? 'buildr-operations.json' : `buildr-operation-${detail!['x-buildr-operation-id']}.json`,
            mediaType: document === 'help' ? 'text/markdown' : 'application/json',
            content: document === 'help' ? programmaticGuideFor(buildId) : JSON.stringify(document === 'operations' ? programmaticOperationIndex(options.version(), buildId) : detail ?? programmaticOpenApi(options.version()), null, 2),
          } };
        }
        const pushbackRoute = pathname.match(/^\/api\/v1\/app\/programmatic-access\/([a-f0-9-]{36})\/pushback(\/reveal|\/test)?$/);
        if (pushbackRoute) {
          const [, credentialId, action] = pushbackRoute;
          if (request.method === 'GET' && !action) context.authorizeRead();
          else if (request.method === 'POST') context.authorizeWrite();
          else return { status: 404, body: { error: { code: 'programmatic_route_missing', message: '没有此回推配置操作。' } } };
          if (!(await (await store()).list()).some(item => item.id === credentialId)) accessError('programmatic_credential_missing', '凭据不存在。', 404);
          const pushback = (await resolve()).pushback;
          if (request.method === 'GET') return { status: 200, body: await pushback.read(credentialId) };
          const input = await context.readJsonBody();
          if (!action) {
            if (!validators.validate(schemas.pushbackSettingsInput.$id, input).valid) accessError('programmatic_input_invalid', '回推配置字段无效。', 400);
            return { status: 200, body: await pushback.save(credentialId, input) };
          }
          if (!validators.validate(schemas.revision.$id, input).valid) accessError('programmatic_input_invalid', '需要回推配置的已观察修订。', 400);
          await rememberCredentialAccess((await (await store()).list()).find(item => item.id === credentialId)!);
          return { status: 200, body: await (action === '/reveal' ? pushback.reveal(credentialId, input) : pushback.test(credentialId, input)) };
        }
        context.authorizeWrite();
        const input = await context.readJsonBody();
        if (request.method === 'POST' && pathname === manager) {
          if(Array.isArray(input?.workspaceIds)&&input.workspaceIds.some((id:unknown)=>!options.workspaces().some(item=>item.id===id)))accessError('programmatic_input_invalid','请选择已登记工作空间。',400);
          const created = await (await store()).create(input);
          await rememberCredentialAccess(created.credential);
          return { status: 201, body: created };
        }
        const match = pathname.match(/^\/api\/v1\/app\/programmatic-access\/([a-f0-9-]{36})\/(revoke|regenerate)$/);
        if (request.method === 'POST' && match) {
          if (!input || typeof input !== 'object' || Object.keys(input).some(key => key !== 'expectedRevision') || typeof input.expectedRevision !== 'string') accessError('programmatic_input_invalid', '需要凭据的已观察修订。', 400);
          const result = match[2] === 'regenerate' ? await (await store()).regenerate(match[1], input.expectedRevision) : { credential: await (await store()).revoke(match[1], input.expectedRevision) };
          await rememberCredentialAccess(result.credential);
          return { status: 200, body: result };
        }
        const fullAccess = pathname.match(/^\/api\/v1\/app\/programmatic-access\/([a-f0-9-]{36})\/full-access$/);
        if (request.method === 'POST' && fullAccess) {
          if (!input || typeof input !== 'object' || Object.keys(input).some(key => !['expectedRevision', 'allowFullAccess'].includes(key)) || typeof input.expectedRevision !== 'string' || typeof input.allowFullAccess !== 'boolean') accessError('programmatic_input_invalid', '需要凭据的已观察修订与布尔 allowFullAccess。', 400);
          const result = { credential: await (await store()).updateFullAccess(fullAccess[1], input.expectedRevision, input.allowFullAccess) };
          await rememberCredentialAccess(result.credential);
          return { status: 200, body: result };
        }
        const update = pathname.match(/^\/api\/v1\/app\/programmatic-access\/([a-f0-9-]{36})\/update$/);
        if (request.method === 'POST' && update) {
          if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['expectedRevision', 'name', 'workspaceIds', 'executionScopes', 'scopes', 'allowFullAccess'].includes(key)) || typeof input.expectedRevision !== 'string') accessError('programmatic_input_invalid', '需要凭据的已观察修订与合法参数。', 400);
          const { expectedRevision, ...params } = input;
          if(Array.isArray(params.workspaceIds)&&params.workspaceIds.some((id:unknown)=>!options.workspaces().some(item=>item.id===id)))accessError('programmatic_input_invalid','请选择已登记工作空间。',400);
          const result = { credential: await (await store()).update(update[1], expectedRevision, params) };
          await rememberCredentialAccess(result.credential);
          return { status: 200, body: result };
        }
        return { status: 404, body: { error: { code: 'programmatic_route_missing', message: '没有此凭据管理操作。' } } };
      }
      if (pathname !== base && !pathname.startsWith(base + '/')) return null;
      // Retain the host fence; a Bearer is not permission to relax browser-origin protection.
      if (request.headers['sec-fetch-site'] === 'cross-site' || request.headers.origin && request.headers.origin !== `http://${request.headers.host}`) accessError('origin_forbidden', '程序调用不接受跨站浏览器来源。');
      const authenticate = async () => (await store()).authenticate(request.headers.authorization);
      let currentCredential = await authenticate();
      const credential = currentCredential;
      if (pathname === base && request.method === 'GET') {
        if (searchParams.size) accessError('programmatic_input_invalid', '发现入口不接受查询参数。', 400);
        const service = await resolve();
        const buildId = options.buildId();
        const connections = (await service.connections.list()).connections.map(({ id, label, provider, enabled, status, models, capabilities }) => ({ id, label, provider, enabled, status, models, capabilities }));
        const catalog = await service.models.catalog.list({ refresh: false });
        const current = await authenticate();
        return { status: 200, body: { schemaVersion: 'buildr.programmatic-discovery/v1', apiVersion: '1', version: options.version(), buildId, contractVersion: programmaticContractVersion(programmaticOpenApi(options.version())), status: 'ready', serviceId: createHash('sha256').update(options.dataRoot()).digest('hex'), ...locations(context), credential: current, executionScopes:(await scopeKeys()).filter(key=>allowedScope(current,key)).map(key=>({key,ref:executionScopeRef(key,'buildr')})), capabilities: [
          ...PROGRAMMATIC_OPERATIONS.filter(item => current.scopes.includes(item.scope) || item.id === 'reply' && current.scopes.includes('approve')).map(({ id, method, path, scope, summary }) => ({ id, method, path: `${base}/workspaces/:workspaceId/conversations${path}`, scope, summary, documentationUrl: `${base}/operations/${id}` })),
          ...(current.scopes.includes('read') ? [{ id: 'events', method: 'GET', path: `${base}/workspaces/:workspaceId/events`, scope: 'read', summary: '按序号补查本凭据可见事件（含未送达）', documentationUrl: `${base}/operations/events` }] : []),
        ], workspaces: options.workspaces().filter(item => current.workspaceIds.includes(item.id)), connections, models: catalog.models } };
      }
      if (request.method === 'GET' && (pathname === base + '/operations' || pathname.startsWith(base + '/operations/'))) {
        if (searchParams.size) accessError('programmatic_input_invalid', '操作文档入口不接受查询参数。', 400);
        const buildId = options.buildId();
        const document = pathname === base + '/operations'
          ? programmaticOperationIndex(options.version(), buildId)
          : programmaticOperationDocument(options.version(), pathname.slice((base + '/operations/').length), buildId);
        if (!document) accessError('programmatic_route_missing', '没有此程序操作文档。', 404);
        return { status: 200, body: document };
      }
      if (request.method === 'GET' && [base + '/help', base + '/openapi.json', base + '/example.py'].includes(pathname)) {
        if (pathname.endsWith('/openapi.json')) return { status: 200, body: programmaticOpenApi(options.version()) };
        context.respond.binary(Buffer.from(pathname.endsWith('/example.py') ? programmaticExample : programmaticGuideFor(options.buildId())), pathname.endsWith('/example.py') ? 'text/x-python; charset=utf-8' : 'text/markdown; charset=utf-8');
        return true;
      }
      const sourceEvents=sourceRoute(pathname,'events');
      const eventsRoute = pathname.match(/^\/api\/v1\/programmatic\/workspaces\/([a-f0-9-]{36})\/events$/);
      if ((eventsRoute||sourceEvents) && request.method === 'GET') {
        const workspaceId = sourceEvents?.key??eventsRoute![1];
        if (!allowedScope(credential,workspaceId) || !await registeredScope(workspaceId)) accessError('programmatic_forbidden', '未获该已登记工作空间的授权。');
        permitted(credential, 'read', workspaceId);
        for (const key of searchParams.keys()) if (!['after', 'limit'].includes(key) || searchParams.getAll(key).length !== 1) accessError('programmatic_input_invalid', '事件补查只接受 after 与 limit。', 400);
        const eventsQuery: { after?: string; limit?: number } = {};
        if (searchParams.has('after')) {
          const raw = searchParams.get('after')!;
          if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw))) accessError('programmatic_input_invalid', 'after 必须为上一页返回的 nextCursor。', 400);
          eventsQuery.after = raw;
        }
        if (searchParams.has('limit')) {
          const raw = searchParams.get('limit')!;
          if (!/^\d+$/.test(raw)) accessError('programmatic_input_invalid', 'limit 必须为正整数。', 400);
          eventsQuery.limit = Number(raw);
        }
        if (!validators.validate(schemas.pushbackEventsQuery.$id, eventsQuery).valid) accessError('programmatic_input_invalid', '事件补查参数无效。', 400);
        return { status: 200, body: await (await resolve()).pushback.listEvents(credential.id, workspaceId, eventsQuery) };
      }
      const route = pathname.match(/^\/api\/v1\/programmatic\/workspaces\/([a-f0-9-]{36})\/conversations(.*)$/);
      const sourceConversations=sourceRoute(pathname,'conversations(.*)');
      if (!route&&!sourceConversations) accessError('programmatic_route_missing', '未公开此程序接口。', 404);
      const workspaceId=sourceConversations?.key??route![1],suffix=sourceConversations?.suffix??route![2];
      const match = matchPublicOperation(request.method, suffix);
      if (!match) accessError('programmatic_route_missing', '未公开此程序操作。', 404);
      const { operation, params } = match;
      // No application resolution or object reads before the workspace admission check.
      if (!allowedScope(credential,workspaceId) || !await registeredScope(workspaceId)) accessError('programmatic_forbidden', '未获该已登记工作空间的授权。');
      if (operation.id !== 'reply') permitted(credential, operation.scope, workspaceId);
      else if (!credential.scopes.includes('answer') && !credential.scopes.includes('approve')) accessError('programmatic_forbidden', '没有回答问题或审批权限。');
      const authorize = () => {
        const current = currentCredential;
        permitted(current, operation.id === 'reply' ? 'read' : operation.scope, workspaceId);
        if (request.method !== 'GET' && !String(request.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) accessError('content_type_unsupported', '需要application/json。', 415);
      };
      const refreshPushbackAccess = () => ['start', 'send', 'supplement', 'messages', 'stop', 'stop-all', 'reply', 'observe'].includes(operation.id)
        ? rememberCredentialAccess(currentCredential)
        : Promise.resolve();
      const readJsonBody = async (maxBytes?: number) => {
        const input = await context.readJsonBody(maxBytes);
        currentCredential = await authenticate();
        authorize();
        if (!validators.validate(schemas[operation.input].$id, input).valid) accessError('agent_http_input_invalid', '智能体服务请求字段无效。', 400);
        if (input && typeof input === 'object') {
          if (input.clientRequestId !== undefined && !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(input.clientRequestId)) accessError('programmatic_input_invalid', '程序提交clientRequestId必须为UUID。', 400);
          if (input.cwd !== undefined || input.taskLinks?.some((link: any) => !allowedScope(credential,link.workspaceId)) || input.workObjectLinks?.some((link:any)=>!allowedScope(credential,executionScopeKey({sourceId:link.sourceId,id:link.scopeId})))) accessError('programmatic_forbidden', '程序接口不接受任意执行目录或越权任务关联。');
          if (input.permissionMode === 'full-access' && !credential.allowFullAccess) accessError('programmatic_forbidden', '此凭据未开启允许全部授权执行，无法请求 full-access。');
          if (operation.id !== 'messages' && (schemas[operation.input] as { properties?: Record<string, unknown> }).properties?.permissionMode) {
            // Omitted mode stays default for explicit sends. /messages instead
            // inherits the latest run's mode; defaulting it here would erase that.
            input.permissionMode ??= 'default';
          }
        }
        if (operation.id === 'reply') {
          const view = await (await resolve()).conversations.read(workspaceId, params.conversationId);
          const pending = view.requests.find(item => item.id === params.requestId);
          if (!pending) accessError('programmatic_request_missing', '问题或审批已失效，请重新观察。', 409);
          permitted(await authenticate(), pending.kind === 'approval' ? 'approve' : 'answer', workspaceId);
        }
        // Stop attribution must precede the stop effect: the stopped view is published
        // synchronously inside stop, so a post-response record would miss suppression.
        if (operation.id === 'stop' && input && typeof input === 'object' && typeof input.runId === 'string') {
          try { await (await resolve()).pushback.recordStop(workspaceId, params.conversationId, input.runId, credential.id); }
          catch { console.warn('[programmatic_pushback_wiring] 停止归属标记未完成，主操作结果保留。'); }
        }
        return input;
      };
      if (operation.id === 'lookup-send') {
        authorize();
        if (searchParams.size) accessError('programmatic_input_invalid', '提交查询不接受查询参数。', 400);
        const found = await (await resolve()).conversations.lookupRequest(workspaceId, params.conversationId, params.clientRequestId);
        currentCredential=await authenticate();authorize();
        return { status: 200, body: found.found ? { found: true, conversation: found.conversation } : { found: false } };
      }
      if (operation.id === 'run-final-reply') {
        authorize();
        if (searchParams.size) accessError('programmatic_input_invalid', '最终回复读取不接受查询参数。', 400);
        const result = await (await resolve()).conversations.readRunFinalReply(workspaceId, params.conversationId, params.runId);
        currentCredential=await authenticate();authorize();
        return { status: 200, body: result };
      }
      currentCredential=await authenticate();
      authorize();
      await refreshPushbackAccess();
      // Only the allowlisted context receives program authentication. Web routes remain session-only.
      const response = await agentHttp.handle({ ...context, workspaceId, suffix: '/agent-conversations' + suffix, registeredWorkspaceIds: () => (credential.executionScopes??credential.workspaceIds.map(id=>({sourceId:'buildr',id}))).map(ref=>ref.sourceId==='buildr'?ref.id:executionScopeKey(ref)), authorizeRead: authorize, authorizeWrite: authorize, readJsonBody });
      if (response && typeof response === 'object' && 'status' in response) {
        // Attribution is best-effort: a successful main operation must never be masked by a pushback wiring failure.
        try {
          const pushback = (await resolve()).pushback;
          if (['start', 'send', 'supplement', 'messages'].includes(operation.id) && response.status === 202) {
            const conversationId = operation.id === 'start' ? response.body?.conversation?.id : params.conversationId;
            if (conversationId) await pushback.markTakeover(workspaceId, conversationId, credential.id);
          }
        } catch { console.warn('[programmatic_pushback_wiring] 回推归属标记未完成，主操作结果保留。'); }
      }
      return response;
    },
  };
  return { ...contribution, async handleTopLevel(context: any) {
    try { return await contribution.handleTopLevel(context); }
    catch (error) { if (error instanceof AgentServiceError) return { status: error.status, body: { error: { code: error.code, message: error.message } } }; throw error; }
  } };
}
