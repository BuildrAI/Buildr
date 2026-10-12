import fs from 'node:fs';
import readline from 'node:readline';
import type { Readable, Writable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import type { CodexDesktopApplication } from '../../application/codex-desktop-application.ts';
import { CODEX_DESKTOP_PLUGIN_VERSION } from '../../infrastructure/codex-plugin-installation.ts';

const RESOURCE = 'ui://buildr/codex-desktop.html';
const MIME = 'text/html;profile=mcp-app';
const MAX_REQUEST_BYTES = 64 * 1024;
type JsonObject = Record<string, unknown>;
type ToolDefinition = { name: string; title: string; description: string; required: string[]; optional?: string[]; write?: boolean; surface?: 'thread' | 'global'; appOnly?: boolean };
const definitions: ToolDefinition[] = [
  { name: 'buildr_codex_panel', title: '打开原聊天的 Buildr 面板', description: '在承载聊天旁打开 Buildr 面板。打开不绑定、不发送消息、不启动任务。用户可选择待绑定请求后明确确认当前聊天身份。', required: [], surface: 'thread' },
  { name: 'buildr_codex_connections', title: '查看 Buildr 本机连接', description: '全局入口只查看连接、待绑定请求和任务导航，不发送聊天消息、不创建聊天。关联时请在目标原聊天打开 Buildr 面板。', required: [], surface: 'global' },
  { name: 'buildr_codex_connection_status', title: '核对本次 Codex 接入状态', description: '只读核对接入是否已移除。已移除时组件保留安装，但不得继续绑定、交接或发送聊天消息。', required: [], appOnly: true },
  { name: 'buildr_codex_current_origin', title: '读取当前 Buildr 页面入口', description: '只读取得当前实际运行页面服务的基址，不沿用插件安装时的端口。', required: [], appOnly: true },
  { name: 'buildr_codex_pending_bindings', title: '查询待绑定请求', description: '读取指定工作空间属于本桌面接入的待绑定请求，不建立关系。', required: ['workspaceId'], appOnly: true },
  { name: 'buildr_codex_create_binding', title: '申请确认承载聊天', description: '创建短期身份请求；不发送消息、不启动任务。面板先保存bindingRequestId，创建结果不明时用原编号查询回执；不自动重发。只有显式taskId才会在确认后建立任务关系。', required: ['workspaceId'], optional: ['taskId', 'bindingRequestId'], write: true, appOnly: true },
  { name: 'buildr_codex_binding_receipt', title: '核对绑定回执', description: '查询原身份请求及具体聊天绑定结果。结果不明先查询，不自动重发消息。', required: ['workspaceId', 'bindingRequestId'] },
  { name: 'buildr_codex_complete_binding', title: '提交承载聊天真实身份', description: '仅在当前原聊天收到用户点击的身份请求后，由该聊天直接执行命令读取 CODEX_THREAD_ID 并提交。不得用 CODEX_SESSION_ID、工具服务环境或子智能体身份代替。', required: ['workspaceId', 'bindingRequestId', 'connectionId', 'nativeSessionId'], write: true },
  { name: 'buildr_codex_relations', title: '查询聊天关联任务', description: '查询已核对原聊天的任务关系及固定任务链接，不修改任务状态。', required: ['workspaceId', 'bindingRequestId'], appOnly: true },
  { name: 'buildr_codex_create_handoff', title: '准备准确原聊天交接', description: '为已核对聊天创建一次交接请求，不发送消息、不启动执行；面板先保存handoffRequestId，结果不明用原编号查询，不自动重发。由面板明确点击后发送。', required: ['workspaceId', 'bindingRequestId', 'taskId'], optional: ['goal', 'handoffRequestId'], write: true, appOnly: true },
  { name: 'buildr_codex_acknowledge_handoff', title: '确认原聊天接收交接', description: '当前聊天收到交接后直接读取 CODEX_THREAD_ID 并核对准确目标，再提交接收回执。回执只表示接收；alreadyReceived:true时先核对当前现场及已有结果，不重复执行同一交接。随后重新读取任务事实并按用户授权继续。', required: ['workspaceId', 'handoffRequestId', 'connectionId', 'nativeSessionId'], write: true },
  { name: 'buildr_codex_handoff_receipt', title: '查询交接接收回执', description: '查询同一交接请求是否被准确原聊天接收，不重复发送，不把接收当作任务完成。', required: ['workspaceId', 'handoffRequestId'] },
];

function object(value: unknown): value is JsonObject { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function protocolError(code: number, message: string) { return Object.assign(new Error(message), { rpcCode: code }); }
function argumentsFor(definition: ToolDefinition, value: unknown): Record<string, string> {
  if (!object(value)) throw protocolError(-32602, 'Tool arguments must be an object.');
  const allowed = new Set([...definition.required, ...definition.optional ?? []]);
  if (Object.keys(value).some(key => !allowed.has(key))) throw protocolError(-32602, 'Unknown tool argument.');
  for (const key of definition.required) if (typeof value[key] !== 'string' || !(value[key] as string).trim()) throw protocolError(-32602, 'Missing tool argument: ' + key);
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== 'string' || entry.length > (key === 'goal' ? 2000 : 512) || /[\0\r]/u.test(entry) || (key !== 'goal' && /\n/u.test(entry))) throw protocolError(-32602, 'Invalid tool argument: ' + key);
  }
  return value as Record<string, string>;
}
function descriptor(definition: ToolDefinition) {
  return {
    name: definition.name, title: definition.title, description: definition.description,
    inputSchema: { type: 'object', properties: Object.fromEntries([...definition.required, ...definition.optional ?? []].map(key => [key, { type: 'string', maxLength: key === 'goal' ? 2000 : 512 }])), required: definition.required, additionalProperties: false },
    outputSchema: { type: 'object', additionalProperties: true },
    annotations: { readOnlyHint: !definition.write, destructiveHint: false, openWorldHint: false, idempotentHint: !definition.write || definition.name.includes('complete') || definition.name.includes('acknowledge') },
    _meta: {
      ui: { ...(definition.surface ? { resourceUri: RESOURCE } : {}), visibility: definition.appOnly ? ['app'] : ['model', 'app'] },
      ...(definition.surface ? { 'openai/outputTemplate': RESOURCE, 'openai/ui': { entrypoints: [{ type: definition.surface }] } } : {}),
    },
  };
}

/** A desktop-owned MCP tool process; this never launches a model execution service. */
export async function runCodexMcpServer(application: CodexDesktopApplication, options: {
  connectionId: string; input?: Readable; output?: Writable;
}): Promise<void> {
  const input = options.input ?? process.stdin, output = options.output ?? process.stdout;
  const html = fs.readFileSync(fileURLToPath(new URL('../../../../../resources/codex-desktop/panel.html', import.meta.url)), 'utf8');
  let initialized = false, activeHandshake = false;
  const write = (value: unknown) => output.write(JSON.stringify(value) + '\n');
  const toolResult = (value: unknown) => ({ content: [{ type: 'text', text: 'Buildr 当前事实已返回。打开、绑定、消息送达与任务完成分别核对。' }], structuredContent: value });
  async function call(name: string, raw: unknown): Promise<unknown> {
    const definition = definitions.find(item => item.name === name);
    if (!definition) throw protocolError(-32602, 'Unknown tool.');
    const args = argumentsFor(definition, raw), connectionId = options.connectionId;
    if (args.connectionId && args.connectionId !== connectionId) throw protocolError(-32602, 'The request belongs to another desktop connection.');
    if (definition.surface) {
      const connection = application.listConnections().connections.find(item => item.id === connectionId) ?? null;
      const workspaces = connection?.status === 'disconnected' ? [] : application.listWorkspaces().workspaces;
      return toolResult({ surface: definition.surface, connectionId, connection, pluginVersion: CODEX_DESKTOP_PLUGIN_VERSION, origin: connection?.status === 'disconnected' ? null : application.currentOrigin(), workspaces });
    }
    if (name === 'buildr_codex_connection_status') return toolResult({ connection: application.listConnections().connections.find(item => item.id === connectionId) ?? null });
    application.assertConnectionActive(connectionId);
    let result: unknown;
    switch (name) {
      case 'buildr_codex_current_origin': result = { origin: application.currentOrigin() }; break;
      case 'buildr_codex_pending_bindings': result = { ...application.pendingBindings(args.workspaceId, connectionId), origin: application.currentOrigin() }; break;
      case 'buildr_codex_create_binding': result = application.createBinding(args.workspaceId, { connectionId, ...(args.taskId ? { taskId: args.taskId } : {}), ...(args.bindingRequestId ? { bindingRequestId: args.bindingRequestId } : {}) }); break;
      case 'buildr_codex_binding_receipt': result = application.bindingReceipt(args.workspaceId, args.bindingRequestId, connectionId); break;
      case 'buildr_codex_complete_binding': result = application.completeBinding(args.workspaceId, { bindingRequestId: args.bindingRequestId, connectionId, nativeSessionId: args.nativeSessionId }); break;
      case 'buildr_codex_relations': result = application.sessionRelations(args.workspaceId, { connectionId, bindingRequestId: args.bindingRequestId }); break;
      case 'buildr_codex_create_handoff':
        application.bindingReceipt(args.workspaceId, args.bindingRequestId, connectionId);
        result = application.createHandoff(args.workspaceId, { bindingRequestId: args.bindingRequestId, taskId: args.taskId, ...(args.goal ? { goal: args.goal } : {}), ...(args.handoffRequestId ? { handoffRequestId: args.handoffRequestId } : {}) }); break;
      case 'buildr_codex_acknowledge_handoff': result = application.acknowledgeHandoff(args.workspaceId, { handoffRequestId: args.handoffRequestId, connectionId, nativeSessionId: args.nativeSessionId }); break;
      case 'buildr_codex_handoff_receipt': result = application.handoffReceipt(args.workspaceId, args.handoffRequestId, connectionId); break;
      default: throw protocolError(-32601, 'Method not found.');
    }
    return toolResult(await result);
  }
  async function dispatch(method: string, params: JsonObject): Promise<unknown> {
    if (method === 'initialize') {
      if (!initialized) {
        try { application.connectorStarted(options.connectionId, CODEX_DESKTOP_PLUGIN_VERSION); activeHandshake = true; }
        catch (error) { if ((error as { code?: string }).code !== 'codex_connection_disconnected') throw error; }
        initialized = true;
      }
      return { protocolVersion: typeof params.protocolVersion === 'string' ? params.protocolVersion : '2025-06-18', capabilities: { tools: {}, resources: {} }, serverInfo: { name: 'buildr-desktop', version: CODEX_DESKTOP_PLUGIN_VERSION },
        instructions: 'Only a direct command in the receiving conversation can provide CODEX_THREAD_ID. Never substitute CODEX_SESSION_ID or this MCP process environment. Global entrypoint never sends chat messages. Receipt means received, not task completed.' };
    }
    if (method === 'ping') return {};
    if (!initialized) throw protocolError(-32002, 'Initialize this desktop connection first.');
    if (method === 'tools/list') return { tools: definitions.map(descriptor) };
    if (method === 'resources/list') return { resources: [{ uri: RESOURCE, name: 'Buildr 原聊天协作', mimeType: MIME }] };
    if (method === 'resources/templates/list') return { resourceTemplates: [] };
    if (method === 'resources/read') {
      if (params.uri !== RESOURCE) throw protocolError(-32602, 'Unknown resource.');
      return { contents: [{ uri: RESOURCE, mimeType: MIME, text: html, _meta: { ui: { csp: { connectDomains: [], resourceDomains: [] } }, 'openai/widgetCSP': { connect_domains: [], resource_domains: [] }, 'openai/widgetDescription': '任务关联与准确原聊天交接。全局入口只查看与导航，消息只由聊天面板的明确点击发出。' } }] };
    }
    if (method === 'tools/call') {
      if (typeof params.name !== 'string') throw protocolError(-32602, 'A tool name is required.');
      try { return await call(params.name, params.arguments ?? {}); }
      catch (error) {
        if (error && typeof error === 'object' && 'rpcCode' in error) throw error;
        let connection: unknown;
        try { connection = application.listConnections().connections.find(item => item.id === options.connectionId); } catch { /* Preserve the original failure without manufacturing status. */ }
        return { isError: true, content: [{ type: 'text', text: error instanceof Error ? error.message : 'Buildr 当前请求未完成。' }], ...(connection ? { structuredContent: { connection } } : {}) };
      }
    }
    throw protocolError(-32601, 'Method not found.');
  }
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  try {
    for await (const line of lines) {
      if (!line.trim()) continue;
      let id: string | number | null = null;
      try {
        if (Buffer.byteLength(line) > MAX_REQUEST_BYTES) throw protocolError(-32600, 'Request is too large.');
        let request: unknown; try { request = JSON.parse(line); } catch { throw protocolError(-32700, 'Invalid JSON.'); }
        if (!object(request) || request.jsonrpc !== '2.0' || typeof request.method !== 'string') throw protocolError(-32600, 'Invalid request.');
        if (!('id' in request)) continue;
        if (typeof request.id !== 'string' && typeof request.id !== 'number' && request.id !== null) throw protocolError(-32600, 'Invalid request id.');
        id = request.id;
        const params = request.params ?? {}; if (!object(params)) throw protocolError(-32602, 'Parameters must be an object.');
        write({ jsonrpc: '2.0', id, result: await dispatch(request.method, params) });
      } catch (error) {
        const code = error && typeof error === 'object' && 'rpcCode' in error ? Number(error.rpcCode) : -32603;
        write({ jsonrpc: '2.0', id, error: { code, message: error instanceof Error ? error.message : 'Internal error.' } });
      }
    }
  } finally { lines.close(); if (activeHandshake) application.connectorStopped(options.connectionId, process.pid); }
}
