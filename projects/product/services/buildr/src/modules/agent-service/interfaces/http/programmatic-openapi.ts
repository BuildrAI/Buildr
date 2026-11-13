import { createHash } from 'node:crypto';
import { AGENT_SERVICE_HTTP_SCHEMAS as schemas } from './agent-service-http-contracts.ts';
import { PROGRAMMATIC_BASE as base, PROGRAMMATIC_OPERATIONS } from './programmatic-operations.ts';

const previewTokenMapping = 'send 的 previewToken 取自 prepare-send 返回的 token 字段：previewToken = prepareResponse.token；expectedRevision = prepareResponse.revision。prepare-send 不返回名为 previewToken 的字段。';
const DOCUMENTED_OPERATION_IDS = ['discover', 'events', ...PROGRAMMATIC_OPERATIONS.map(item => item.id)];

export function programmaticOpenApi(version: string) {
  const paths: Record<string, any> = {};
  const error = { type: 'object', required: ['error'], properties: { error: { type: 'object', required: ['code', 'message'], properties: { code: { type: 'string' }, message: { type: 'string' } } } } };
  const responses = (schema: unknown, accepted = false) => Object.fromEntries([
    [accepted ? '202' : '200', { description: accepted ? '已受理；使用返回标识观察，不等于工作完成' : '当前结果', content: { 'application/json': { schema } } }],
    ...['400', '401', '403', '404', '409', '413', '415', '503'].map(code => [code, { description: ({ '400': '参数非法', '401': '无有效凭据或已撤销', '403': '越权或来源不允许', '404': '对象或接口不存在', '409': '修订、身份或请求内容冲突', '413': '请求过大', '415': '需要application/json', '503': '服务未就绪或结果待核对；不盲目重发' } as Record<string, string>)[code], content: { 'application/json': { schema: error } } }]),
  ]);
  const discovery = { type: 'object', required: ['schemaVersion', 'apiVersion', 'version', 'status', 'serviceId', 'contractVersion', 'apiUrl', 'capabilities', 'workspaces', 'connections', 'models'], properties: { schemaVersion: { const: 'buildr.programmatic-discovery/v1' }, apiVersion: { const: '1' }, version: { type: 'string' }, status: { const: 'ready' }, serviceId: { type: 'string' }, contractVersion: { type: 'string', description: '实际API契约内容摘要，可用于文档缓存失效判断；不是对话修订' }, operationsUrl: { type: 'string' }, apiUrl: { type: 'string' }, discoveryUrl: { type: 'string' }, documentationUrl: { type: 'string' }, openapiUrl: { type: 'string' }, exampleUrl: { type: 'string' }, credential: { type: 'object' }, capabilities: { type: 'array', items: { type: 'object' } }, workspaces: { type: 'array', items: { type: 'object', required: ['id', 'name'], properties: { id: { type: 'string' }, name: { type: 'string' } } } }, connections: { type: 'array', items: { type: 'object' } }, models: { type: 'array', items: { type: 'object' } } } };
  paths[base] = { get: { operationId: 'discover', summary: '当前实例与凭据可访问能力；不返回账号秘密', responses: responses(discovery) } };
  for (const operation of PROGRAMMATIC_OPERATIONS) {
    const route = `${base}/workspaces/:workspaceId/conversations${operation.path}`.replace(/:([A-Za-z]+)/g, '{$1}');
    const input: any = structuredClone(schemas[operation.input]);
    const output: any = structuredClone(schemas[operation.output]);
    // Source schemas share leaf objects. Clone the annotated leaf, not its aliases.
    if (operation.id === 'prepare-send') output.properties.token = { ...output.properties.token, description: previewTokenMapping };
    if (operation.id === 'send') input.properties.previewToken = { ...input.properties.previewToken, description: previewTokenMapping };
    if (input.properties?.cwd) delete input.properties.cwd;
    if (input.properties?.clientRequestId) input.properties.clientRequestId = { type: 'string', format: 'uuid', pattern: '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' };
    if (input.properties?.permissionMode) input.properties.permissionMode = operation.id === 'messages'
      ? { enum: ['default', 'full-access'], description: '省略时沿用该对话最近一轮执行的 permissionMode；没有最近轮次时默认 default。full-access 需凭据开启“允许全部授权执行”（allowFullAccess），否则返回 403。' }
      : { enum: ['default', 'full-access'], default: 'default', description: '省略默认 default。full-access 需凭据开启“允许全部授权执行”（allowFullAccess），否则返回 403；连接须支持该模式。' };
    const parameters: any[] = [...route.matchAll(/\{([^}]+)\}/g)].map(match => ({ name: match[1], in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }));
    for (const name of operation.query ?? []) parameters.push({ name, in: 'query', schema: ['before', 'limit'].includes(name) ? { type: 'integer', minimum: name === 'limit' ? 1 : 0 } : name === 'hidden' ? { type: 'boolean' } : { type: 'string' } });
    (paths[route] ??= {})[operation.method.toLowerCase()] = { operationId: operation.id, summary: operation.summary, description: `需要${operation.scope}权限及路径工作空间授权。${operation.id === 'run-final-reply' ? '只返回指定 run 的最终 assistant 回复全文，不返回完整对话；run 不存在时返回404 agent_run_missing。' : ''}${['prepare-send', 'send'].includes(operation.id) ? previewTokenMapping : ''}${input.properties?.permissionMode ? (operation.id === 'messages' ? 'permissionMode 省略时沿用该对话最近一轮执行的模式；显式 full-access 需凭据开启允许全部授权执行，否则403。' : 'permissionMode 省略默认 default；full-access 需凭据开启允许全部授权执行，否则403。') : ''}${operation.id === 'reply' ? 'approval卡片改需approve权限；问题需answer。' : ''}超时先查询原提交或观察原执行，禁止另造标识盲目重发。`, 'x-buildr-scope': operation.scope, parameters, ...(operation.method === 'POST' ? { requestBody: { required: true, content: { 'application/json': { schema: input } } } } : {}), responses: responses(output, ['start', 'send', 'supplement', 'messages'].includes(operation.id)) };
  }
  for (const [suffix, type, description] of [['help', 'text/markdown', '中文API帮助'], ['openapi.json', 'application/json', 'OpenAPI 3.1'], ['example.py', 'text/x-python', '可运行发任务/轮询/读结果脚本']]) paths[`${base}/${suffix}`] = { get: { operationId: suffix, summary: description, responses: { '200': { description, content: { [type]: { schema: { type: 'string' } } } }, '401': { description: '需要有效Bearer凭据' } } } };
  paths[`${base}/workspaces/{workspaceId}/events`] = { get: { operationId: 'events', summary: '分页补读本凭据接管对话的回推事件，含未投递；始终返回可续读游标', description: '需要read权限及路径工作空间授权。after传上一页nextCursor（非负整数序号），非法游标返回400；limit默认50、最大200；事件按sequence升序返回，包含undelivered。事件类型包括decision.requested、run.progress、run.completed、run.failed、run.stopped、run.stalled和events_dropped。每条业务事件含当前凭据的scopes与allowFullAccess；终态事件含完整finalReply与finalReplyUrl；decision.requested含完整问题/审批卡及回答身份，description始终为字符串，无说明时为空字符串；run.progress含最新中间消息、运行时长和已完成工具数，正文为空的中间消息不产生该事件也不占用5分钟窗口；run.stalled仅覆盖starting/running/tools-active，含连续空闲时长、最后活动时间和权限快照，同一空闲期只推一次且跨重启去重。nextCursor始终为本页最后一条事件的sequence；空页返回请求中的after；未传after且没有事件时为null。hasMore表示以after=nextCursor再次读取时是否还有更多事件。轮询方应保存nextCursor并用after=nextCursor继续补查。回推总开关停用只停止对外投递，已开启事件仍写入持久流并可补查；中间进度或停滞提醒单独关闭时对应事件不生成。投递与补读共用同一持久事件流。', 'x-buildr-scope': 'read', parameters: [{ name: 'workspaceId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }, { name: 'after', in: 'query', schema: { type: 'string', pattern: '^\\d+$' } }, { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 200 } }], responses: responses(structuredClone(schemas.pushbackEvents)) } };
  paths[base + '/operations'] = { get: { operationId: 'operation-index', summary: '轻量操作目录，不含模型和完整Schema', responses: responses({ type: 'object' }) } };
  paths[base + '/operations/{operationId}'] = { get: { operationId: 'operation-document', summary: '单操作自包含OpenAPI，仅含选中操作与依赖模型', parameters: [{ name: 'operationId', in: 'path', required: true, schema: { type: 'string', enum: DOCUMENTED_OPERATION_IDS } }], responses: responses({ type: 'object' }) } };
  return shareSchemas({ openapi: '3.1.0', info: { title: 'Buildr 本机程序接入 API', version, description: '只监听本机，复用现有Agent Service；轮询基线。访问令牌不是操作系统沙箱，也不自动授予审批、提交或推送权限。' }, servers: [{ url: '/' }], security: [{ programmaticBearer: [] }], components: { securitySchemes: { programmaticBearer: { type: 'http', scheme: 'bearer', bearerFormat: 'Buildr programmatic access token' } } }, paths });
}

/** Walk schema positions only: examples/defaults/enums are data, not schemas. */
function shareSchemas(document: any) {
  const models: Record<string, any> = {}, known = new Map<string, string>();
  const maps = new Set(['properties', 'patternProperties', '$defs', 'dependentSchemas']);
  const arrays = new Set(['allOf', 'anyOf', 'oneOf', 'prefixItems']);
  const singles = new Set(['items', 'additionalProperties', 'unevaluatedProperties', 'additionalItems', 'unevaluatedItems', 'contains', 'not', 'if', 'then', 'else', 'propertyNames']);
  function schema(value: any): any {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    const result: Record<string, any> = {};
    for (const [key, child] of Object.entries(value)) {
      // Embedded resource IDs would change the base of our document-local refs.
      if (key === '$id' || key === '$schema') continue;
      result[key] = maps.has(key) && child && typeof child === 'object'
        ? Object.fromEntries(Object.entries(child).map(([name, item]) => [name, schema(item)]))
        : arrays.has(key) && Array.isArray(child) ? child.map(schema)
          : singles.has(key) ? schema(child) : child;
    }
    const identity = JSON.stringify(result);
    if (Buffer.byteLength(identity) < 160) return result;
    let name = known.get(identity);
    if (!name) {
      name = 'Schema_' + createHash('sha256').update(identity).digest('hex').slice(0, 16);
      if (models[name] && JSON.stringify(models[name]) !== identity) throw new Error('OpenAPI schema identity collision');
      known.set(identity, name); models[name] = result;
    }
    return { $ref: '#/components/schemas/' + name };
  }
  for (const item of Object.values(document.paths) as any[]) {
    for (const operation of Object.values(item) as any[]) {
      for (const parameter of operation.parameters ?? []) if (parameter.schema) parameter.schema = schema(parameter.schema);
      for (const body of [operation.requestBody, ...Object.values(operation.responses ?? {})] as any[]) {
        for (const media of Object.values(body?.content ?? {}) as any[]) if (media.schema) media.schema = schema(media.schema);
      }
    }
  }
  document.components.schemas = models;
  return document;
}

export function programmaticContractVersion(document: any): string {
  return 'sha256-' + createHash('sha256').update(JSON.stringify(document)).digest('hex');
}

function describedOperations(document: any) {
  const ids = new Set(DOCUMENTED_OPERATION_IDS);
  return Object.entries(document.paths).flatMap(([path, item]) => Object.entries(item as any)
    .filter(([, operation]: [string, any]) => ids.has(operation.operationId))
    .map(([method, operation]: [string, any]) => ({
      id: operation.operationId as string, method: method.toUpperCase(), path,
      scope: operation['x-buildr-scope'] ?? 'read', summary: operation.summary as string,
      documentationUrl: `${base}/operations/${operation.operationId}`,
    })));
}

export function programmaticOperationIndex(version: string) {
  const document = programmaticOpenApi(version);
  return {
    schemaVersion: 'buildr.programmatic-operation-index/v1', apiVersion: '1', version,
    contractVersion: programmaticContractVersion(document),
    documentationUrl: base + '/help', openapiUrl: base + '/openapi.json',
    operations: describedOperations(document),
  };
}

/** Self-contained OpenAPI fragment: all transitive local refs are included. */
export function programmaticOperationDocument(version: string, id: string) {
  const document = programmaticOpenApi(version);
  const entry = describedOperations(document).find(item => item.id === id);
  if (!entry) return undefined;
  const operation = document.paths[entry.path][entry.method.toLowerCase()];
  const schemas: Record<string, any> = {};
  function include(value: any): void {
    if (!value || typeof value !== 'object') return;
    if (typeof value.$ref === 'string') {
      const name = value.$ref.replace(/^#\/components\/schemas\//, '');
      if (!Object.hasOwn(document.components.schemas, name)) throw new Error('Unresolved OpenAPI reference');
      if (!Object.hasOwn(schemas, name)) { schemas[name] = document.components.schemas[name]; include(schemas[name]); }
    }
    for (const child of Object.values(value)) include(child);
  }
  include(operation);
  return {
    ...document, 'x-buildr-contract-version': programmaticContractVersion(document),
    'x-buildr-operation-id': id,
    paths: { [entry.path]: { [entry.method.toLowerCase()]: operation } },
    components: { ...document.components, schemas },
  };
}
