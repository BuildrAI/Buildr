import path from 'node:path';
import {conversationTaskLinks,sameTaskLink} from '../domain/conversation-task-links.ts';
import { pathToFileURL } from 'node:url';
import { AGENT_EXECUTION_CONTRACTS } from '../execution-contracts.ts';
import { AgentServiceError, safeDiagnostic } from '../domain/agent-state.ts';
import { live, readProcessRecord } from './ownership.ts';
import { request } from './transport.ts';

interface Binding { dataRoot:string; profileId:string; sourceId:string; scope:string; conversationId:string }
const quote = (value:string) => "'" + value.replaceAll("'", "'\\''") + "'";

/** No credentials or implicit shutdown/restart capability crosses into a prompt. */
export function conversationControlInstruction(binding:Binding,node:string):string {
  const command = [node,import.meta.filename,JSON.stringify(binding)].map(quote).join(' ');
  return `Buildr 本对话工作控制：\n${command} read\n` +
    `用同一命令将 read 换成 observe 可核对当前状态，observe '<JSON>' 可按同样的准确身份核对某个原执行；停止原执行时使用 stop '<JSON>'，JSON 必须从刚读取的记录取 expectedRevision、runId、participantId、generation，可选 toolId。` +
    `智能体在本对话成功创建、激活或明确接续本轮实际执行的任务后，应自动维护关联，不要求用户手动点击：将 read 换成 link-task '<JSON>'，JSON 为 {"taskId":"已核对的任务标识"}，跨空间时另传任务所属 workspaceId；核对 taskLinks 中准确空间和任务。命令内部即时读取并按观察版本追加，也可传 expectedRevision 钉住明确观察，核对返回 taskIds 已包含该任务。link-task 只追加本对话关系，保留其他关联，不修改任务状态、不发送消息；冲突时重读判断，不覆盖集合。仅提及、只读查询或浏览任务不关联；没有准确对话绑定不猜关系。` +
    `read 返回当前轮、retainedRuns、任务关联和未回答问题；这些执行仍归原上下文控制，不要向新厂商传递旧厂商的进程内标识。` +
    `用户确认切换后的旧问题关闭和旧执行停止由系统自动善后，未回答不构成同意。接续时只核对与当前目标相关的成果和未知副作用；不要重复停止已请求停止的旧执行，不因历史未知阻塞独立工作。内部善后、过期卡片和旧执行状态默认静默，不在进展或最终回复追加说明；仅实际影响当前目标且需要用户决定时说明具体影响。未知结果不重放，普通消息不是原问题回答或审批，不自动重试停止或强杀。\n\n`;
}

export async function controlConversation(binding:Binding,action:string,input?:unknown):Promise<unknown> {
  if (!binding || ['dataRoot','profileId','sourceId','scope','conversationId'].some(key=>typeof binding[key as keyof Binding]!=='string'||!binding[key as keyof Binding]) || !['read','observe','stop','link-task','participation','participation-summary'].includes(action)) throw new AgentServiceError('agent_control_invalid','仅支持本对话控制及只读参与查询。');
  let association: {expectedRevision?:string;taskId:string;workspaceId?:string} | undefined;
  if (action==='link-task') {
    const value=input as Record<string,unknown> | undefined;
    if (!value || typeof value!=='object' || Array.isArray(value) || Object.keys(value).some(key=>!['expectedRevision','taskId','workspaceId'].includes(key)) || value.expectedRevision!==undefined && (typeof value.expectedRevision!=='string' || !value.expectedRevision.trim()) || value.workspaceId!==undefined&&(typeof value.workspaceId!=='string'||!value.workspaceId.trim()) || typeof value.taskId!=='string' || !value.taskId.trim()) throw new AgentServiceError('agent_control_invalid','link-task 需要准确 taskId；可选 expectedRevision 必须为有效观察版本。');
    association={expectedRevision:value.expectedRevision as string|undefined,taskId:value.taskId.trim(),workspaceId:value.workspaceId as string|undefined};
  }
  const owner = readProcessRecord(binding.dataRoot);
  if (!owner || owner.stopped || !live(owner.identity.pid) || owner.identity.dataRoot!==path.resolve(binding.dataRoot) || owner.identity.profileId!==binding.profileId) throw new AgentServiceError('agent_control_unavailable','本对话后台不可用；未启动、接管或重放任何执行。',409);
  const identity = await request(owner.origin,owner.token,'/identity',undefined,AbortSignal.timeout(3000));
  if (identity.instanceId!==owner.identity.instanceId || identity.generation!==owner.identity.generation || identity.profileId!==binding.profileId || identity.dataRoot!==owner.identity.dataRoot) throw new AgentServiceError('agent_control_stale','后台身份已变化，请重新读取。',409);
  const invoke = (operation:string,input?:unknown) => request(owner.origin,owner.token,'/operations',{contract:AGENT_EXECUTION_CONTRACTS.operations,sourceId:binding.sourceId,operation,args:[binding.scope,binding.conversationId,...(input!==undefined?[input]:[])]},AbortSignal.timeout(15000));
  if (action==='participation' || action==='participation-summary') {
    // Establish the exact conversation binding even for a workspace-wide summary.
    await invoke('conversations.read');
    if (action==='participation') return invoke('conversations.participation',input);
    return request(owner.origin,owner.token,'/operations',{contract:AGENT_EXECUTION_CONTRACTS.operations,sourceId:binding.sourceId,operation:'conversations.participationSummary',args:[binding.scope,input??{}]},AbortSignal.timeout(15000));
  }
  let result: any;
  if (association) {
    const current=await invoke('conversations.read');
    if (association.expectedRevision!==undefined && current.revision!==association.expectedRevision) throw new AgentServiceError('agent_revision_conflict','对话已变化，请重新读取后判断关联。',409);
    const links=conversationTaskLinks(current),link={workspaceId:association.workspaceId??binding.scope,taskId:association.taskId};
    result=links.some(value=>sameTaskLink(value,link))?current:await invoke('conversations.update',{expectedRevision:current.revision,taskLinks:[...links,link]});
  } else {
    const operation=action==='stop'?'conversations.stop':action==='observe'?(input?'conversations.observeRun':'conversations.observe'):'conversations.read';
    result=await invoke(operation,action==='stop'||action==='observe'&&input?input:undefined);
  }
  // The local control surface exposes work facts, not full conversation content.
  return {revision:result.revision,taskLinks:conversationTaskLinks(result),taskId:result.taskId,taskIds:result.taskIds??(result.taskId?[result.taskId]:[]),run:result.run,retainedRuns:result.retainedRuns??[],requests:result.requests};
}

async function runControlEntry(): Promise<void> {
  try {
    if (process.argv.length<4 || process.argv.length>5) throw new AgentServiceError('agent_control_invalid','用法：conversation-control <绑定 JSON> read|observe|stop|link-task|participation|participation-summary [控制 JSON]');
    const result = await controlConversation(JSON.parse(process.argv[2]!),process.argv[3]!,process.argv[4]?JSON.parse(process.argv[4]):undefined);
    process.stdout.write(JSON.stringify(result)+'\n');
  } catch(error) { process.stderr.write(safeDiagnostic(error)+'\n'); process.exitCode=1; }
}
// Keep executable-only awaits out of the synchronously imported public package.
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url) {
  void runControlEntry().catch(error => { process.stderr.write(safeDiagnostic(error)+'\n'); process.exitCode=1; });
}
