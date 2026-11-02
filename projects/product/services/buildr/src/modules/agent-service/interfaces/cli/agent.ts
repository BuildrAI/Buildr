import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { parseWorkspaceManifest } from '../../../workspace/persistence/workspace-manifest-repository.ts';

const usage = 'buildr agent <send|read|stop|list|reply|continue> [参数] [--target <workspace> | --workspace-id <id>] [--connection <id>] [--model <id>] [--before <sequence>] [--limit <count>] [--json]';
function fail(message: string, code = 'agent_cli_input_invalid'): never { throw Object.assign(new Error(message), { code, usage }); }
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export function parseAgentArgs(action: string, args: string[]) {
  if (!['send', 'read', 'stop', 'list', 'reply', 'continue'].includes(action)) fail('未知的 agent 子命令。');
  const count = action === 'list' ? 0 : action === 'reply' ? 3 : action === 'continue' ? 2 : 1;
  const values = args.slice(0, count);
  const tail = args.slice(count);
  const value = values[0] ?? '';
  if (values.length !== count || values.some(item => !item.trim() || item.startsWith('--'))) fail('缺少消息、对话标识或请求标识。');
  if (!['send', 'list'].includes(action) && !uuid.test(value)) fail('对话标识必须是 UUID。');
  if (action === 'reply' && !uuid.test(values[1])) fail('请求标识必须是 UUID。');
  const message = action === 'send' ? value : action === 'reply' ? values[2] : action === 'continue' ? values[1] : undefined;
  if (message && message.length > 65536) fail('消息超过 65536 字符。');
  const options: Record<string, string> = {};
  const allowed = ['--target', '--workspace-id', '--json', ...(action === 'send' ? ['--connection', '--model'] : action === 'read' ? ['--before', '--limit'] : action === 'list' ? ['--query', '--limit'] : [])];
  for (let i = 0; i < tail.length; i++) {
    const key = tail[i];
    if (!allowed.includes(key) || Object.hasOwn(options, key)) fail(`未知或重复参数：${key}`);
    if (key === '--json') { options[key] = 'true'; continue; }
    const option = tail[++i];
    if (!option || option.startsWith('--')) fail(`缺少参数值：${key}`);
    options[key] = option;
  }
  if (options['--target'] && options['--workspace-id']) fail('--target 与 --workspace-id 不能同时使用。');
  if (options['--workspace-id'] && !uuid.test(options['--workspace-id'])) fail('工作空间标识必须是 UUID。');
  for (const key of ['--before', '--limit']) if (options[key] !== undefined && (!/^\d+$/.test(options[key]) || !Number.isSafeInteger(Number(options[key])) || (key === '--limit' && Number(options[key]) < 1))) fail(`无效分页值：${key}`);
  return { action, value, options, message, requestId: action === 'reply' ? values[1] : undefined };
}

export async function connectLocalAgentHttp(instance: any = undefined, fetcher: typeof fetch = fetch) {
  if (!instance) fail('本机 Buildr Web 未运行，请先启动对应配置的 buildr web。', 'agent_cli_instance_unavailable');
  let address: URL;
  try { address = new URL(instance.url); } catch { fail('本机实例地址无效。'); }
  if (address.protocol !== 'http:' || address.hostname !== '127.0.0.1' || !address.port || address.username || address.password || address.pathname !== '/' || address.search || address.hash || !Number.isInteger(instance.pid) || instance.pid <= 0 || typeof instance.secret !== 'string' || !instance.secret) fail('仅接受具有准确身份的本机回环实例。');
  const origin = address.origin;
  const request = (route: string, init: RequestInit = {}) => fetcher(origin + route, { ...init, redirect: 'error', signal: AbortSignal.timeout(30000) });
  const health = await request('/api/v1/health', { headers: { 'x-buildr-instance': instance.secret } });
  const status = health.ok ? await health.json() : null;
  if (status?.schemaVersion !== 'buildr.local-app-health/v1' || status.status !== 'ready' || status.pid !== instance.pid) fail('本机实例身份或健康状态不匹配。', 'agent_cli_instance_unavailable');
  const page = await request('/');
  if (!page.ok) fail('无法读取本机会话。', 'agent_cli_session_unavailable');
  const token = (await page.text()).match(/<meta\s+name="buildr-session"\s+content="([^"]+)"\s*\/?>/)?.[1];
  if (!token || token === '__BUILDR_SESSION_TOKEN__') fail('本机会话不可用。', 'agent_cli_session_unavailable');
  return async (route: string, body?: unknown) => {
    const response = await request(route, { method: body === undefined ? 'GET' : 'POST', headers: { 'x-buildr-session': token, origin, 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const result = await response.json();
    if (!response.ok) throw Object.assign(new Error(result.error?.message || `HTTP ${response.status}`), { code: result.error?.code || 'agent_cli_http_failed', status: response.status, usage });
    return result;
  };
}

type Request = (route: string, body?: unknown) => Promise<any>;
export async function executeAgentCommand(input: ReturnType<typeof parseAgentArgs>, workspaceId: string, request: Request) {
  if (!workspaceId || !uuid.test(workspaceId)) fail('工作空间缺少有效身份，请指定已初始化的 --target 或 --workspace-id。');
  const { action, value, options } = input;
  const base = `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/agent-conversations`;
  if (action === 'list') {
    const conversations: any[] = [];
    const cursors = new Set<string>();
    let cursor: string | undefined;
    do {
      const query = new URLSearchParams({ hidden: 'true', limit: options['--limit'] || '100' });
      if (options['--query']) query.set('query', options['--query']);
      if (cursor) query.set('cursor', cursor);
      const page = await request(base + '?' + query);
      conversations.push(...page.conversations);
      cursor = page.nextCursor;
      if (cursor && cursors.has(cursor)) fail('对话分页游标重复，请重新读取。');
      if (cursor) cursors.add(cursor);
    } while (cursor);
    return { conversations };
  }
  if (action === 'send') {
    const connections = (await request('/api/v1/app/agent-service/connections')).connections;
    const ready = connections.filter((item: any) => item.enabled && item.status === 'ready' && (!options['--connection'] || item.id === options['--connection']));
    if (ready.length !== 1) fail('请使用 --connection 指定一个已就绪连接；可在 Buildr 设置中查看连接。');
    const conversation = await request(base, {});
    try {
      const route = `${base}/${encodeURIComponent(conversation.id)}`;
      const draft = { expectedRevision: conversation.revision, connectionId: ready[0].id, text: value, ...(options['--model'] ? { model: options['--model'] } : {}) };
      const preview = await request(route + '/prepare-send', draft);
      if (!preview.fits) fail(preview.diagnostic || '消息超出连接输入限制。');
      return await request(route + '/send', { ...draft, expectedRevision: preview.revision, previewToken: preview.token, clientRequestId: randomUUID() });
    } catch (cause) {
      const error = cause instanceof Error ? cause : new Error(String(cause));
      error.message = `${error.message}（已创建对话：${conversation.id}；请先使用 agent read 核对，不要盲目重发。）`;
      throw Object.assign(error, { conversationId: conversation.id, usage });
    }
  }
  const route = `${base}/${encodeURIComponent(value)}`;
  if (action === 'reply' || action === 'continue') {
    const conversation = await request(route + '/observe', {});
    if (action === 'reply') {
      const pending = conversation.requests?.find((item: any) => item.id === input.requestId);
      if (!pending) fail('请求不存在、已处理或已失效；不会发送回复。');
      if (!conversation.revision || !pending.runId || !pending.participantId || !pending.generation) fail('请求缺少有效执行身份，请重新读取对话。');
      return request(`${route}/requests/${encodeURIComponent(input.requestId!)}/reply`, { expectedRevision: conversation.revision, runId: pending.runId, participantId: pending.participantId, generation: pending.generation, answer: input.message });
    }
    const runs = [conversation.run, ...(conversation.retainedRuns || [])].filter(Boolean);
    if (runs.some((item: any) => !['completed', 'failed', 'stopped'].includes(item.status)) || conversation.requests?.length || conversation.pendingSend) fail('对话仍在运行、等待回答或已有排队消息；continue 仅支持空闲对话，不会自动补充或排队。');
    const priorRun = conversation.run;
    const participant = priorRun ? conversation.participants?.find((item: any) => item.id === priorRun.participantId) : conversation.participants?.at(-1);
    if (!participant?.connectionId || !conversation.revision) fail('对话缺少可复用的连接或版本，请先读取并核对对话。');
    const draft = { expectedRevision: conversation.revision, connectionId: participant.connectionId, text: input.message, ...(participant.model ? { model: participant.model } : {}), ...(participant.modelAccountId ? { modelAccountId: participant.modelAccountId, ...(priorRun?.modelAccountIdentity ? { modelAccountIdentity: priorRun.modelAccountIdentity } : {}) } : {}), ...(priorRun?.reasoningEffort ? { reasoningEffort: priorRun.reasoningEffort } : {}), ...(priorRun?.serviceTier ? { serviceTier: priorRun.serviceTier } : {}), ...(priorRun?.permissionMode ? { permissionMode: priorRun.permissionMode } : {}) };
    const preview = await request(route + '/prepare-send', draft);
    if (!preview.fits) fail(preview.diagnostic || '消息超出连接输入限制。');
    return request(route + '/send', { ...draft, expectedRevision: preview.revision, previewToken: preview.token, clientRequestId: randomUUID() });
  }
  if (action === 'read') {
    await request(route + '/observe', {});
    const query = new URLSearchParams();
    for (const key of ['before', 'limit']) if (options[`--${key}`]) query.set(key, options[`--${key}`]);
    return request(route + '/entries' + (query.size ? '?' + query : ''));
  }
  const conversation = await request(route + '/observe', {});
  const run = conversation.run;
  if (!run || run.stopRequested || ['completed', 'failed', 'stopped'].includes(run.status)) return conversation;
  return request(route + '/stop', { expectedRevision: conversation.revision, runId: run.id, participantId: run.participantId, generation: run.generation });
}

export function createAgentCliContributions(readLocalInstance: () => any = () => undefined) {
  return ['send', 'read', 'stop', 'list', 'reply', 'continue'].map(action => ({
    key: `agent ${action}`, surface: 'primary', summary: { send: '新建本机智能体对话并发送消息。', read: '读取对话状态与进展。', stop: '停止已观察到的对话执行。', list: '列出工作空间全部对话。', reply: '正式提交用户明确给出的回答。', continue: '在空闲的已有对话中继续发送消息。' }[action],
    help: [`用法：${usage}`, `命令格式：buildr agent ${action} ${{ send: '<message>', read: '<conversation-id>', stop: '<conversation-id>', list: '[--query <文字>] [--limit <每页数量>]', reply: '<conversation-id> <request-id> <message>', continue: '<conversation-id> <message>' }[action]}`, '', '只调用本机已有 HTTP 接口，不修改任务数据；list 默认显示中文列表，--json 输出原始数据。其余命令输出 JSON。', 'send 仅自动选择唯一就绪连接；reply 原样提交明确回复；continue 仅支持空闲对话，不自动补充或排队。'],
    match: (context: any) => context.domain === 'agent' && context.action === action,
    run: async (_runtime: unknown, context: any) => {
      const input = parseAgentArgs(action, context.rawArgs.slice(2));
      const workspaceId = input.options['--workspace-id'] || parseWorkspaceManifest(fs.readFileSync(path.join(path.resolve(input.options['--target'] || process.cwd()), '.buildr/workspace.yml'), 'utf8')).workspace.id;
      if (!workspaceId || !uuid.test(workspaceId)) fail('工作空间缺少有效身份，请指定已初始化的 --target 或 --workspace-id。');
      const result = await executeAgentCommand(input, workspaceId, await connectLocalAgentHttp(readLocalInstance()));
      console.log(action === 'list' && !input.options['--json'] ? formatAgentList(result.conversations) : JSON.stringify(result, null, 2));
      return result;
    },
  }));
}

export function formatAgentList(conversations: any[]): string {
  const states: Record<string, string> = { starting: '启动中', running: '运行中', 'waiting-approval': '等待审批', 'waiting-question': '等待回答', stopping: '停止中', stopped: '已停止', 'tools-active': '工具执行中', unknown: '未知', completed: '已完成', failed: '失败' };
  const clean = (value: string) => value.replace(/[\t\r\n\x1b]/g, ' ');
  return ['对话标识\t标题\t状态\t最后更新时间', ...conversations.map(item => [item.id, clean(item.title || '未命名对话'), item.run ? states[item.run.status] || '未知' : '空闲', item.updatedAt].join('\t'))].join('\n');
}
