import path from 'node:path';
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
    `read 返回当前轮、retainedRuns 和未回答问题；这些执行仍归原上下文控制，不要向新厂商传递旧厂商的进程内标识。` +
    `接续时和答复前核对本轮及遗留工作，按本次目标决定保留或准确停止；保留时说明用途或待核对原因。不要放任遗留工作，也不要因它阻塞新要求。未知结果不重放，普通消息不是原问题回答或审批。停止失败只报告该项未知，不自动重试停止或强杀。\n\n`;
}

export async function controlConversation(binding:Binding,action:string,input?:unknown):Promise<unknown> {
  if (!binding || ['dataRoot','profileId','sourceId','scope','conversationId'].some(key=>typeof binding[key as keyof Binding]!=='string'||!binding[key as keyof Binding]) || !['read','observe','stop'].includes(action)) throw new AgentServiceError('agent_control_invalid','仅支持本对话的 read、observe、stop。');
  const owner = readProcessRecord(binding.dataRoot);
  if (!owner || owner.stopped || !live(owner.identity.pid) || owner.identity.dataRoot!==path.resolve(binding.dataRoot) || owner.identity.profileId!==binding.profileId) throw new AgentServiceError('agent_control_unavailable','本对话后台不可用；未启动、接管或重放任何执行。',409);
  const identity = await request(owner.origin,owner.token,'/identity',undefined,AbortSignal.timeout(3000));
  if (identity.instanceId!==owner.identity.instanceId || identity.generation!==owner.identity.generation || identity.profileId!==binding.profileId || identity.dataRoot!==owner.identity.dataRoot) throw new AgentServiceError('agent_control_stale','后台身份已变化，请重新读取。',409);
  const operation = action==='stop'?'conversations.stop':action==='observe'?(input?'conversations.observeRun':'conversations.observe'):'conversations.read';
  const result = await request(owner.origin,owner.token,'/operations',{contract:AGENT_EXECUTION_CONTRACTS.operations,sourceId:binding.sourceId,operation,args:[binding.scope,binding.conversationId,...(action==='stop'||action==='observe'&&input?[input]:[])]},AbortSignal.timeout(15000));
  // The local control surface exposes work facts, not full conversation content.
  return {revision:result.revision,run:result.run,retainedRuns:result.retainedRuns??[],requests:result.requests};
}

async function runControlEntry(): Promise<void> {
  try {
    if (process.argv.length<4 || process.argv.length>5) throw new AgentServiceError('agent_control_invalid','用法：conversation-control <绑定 JSON> read|observe|stop [控制 JSON]');
    const result = await controlConversation(JSON.parse(process.argv[2]!),process.argv[3]!,process.argv[4]?JSON.parse(process.argv[4]):undefined);
    process.stdout.write(JSON.stringify(result)+'\n');
  } catch(error) { process.stderr.write(safeDiagnostic(error)+'\n'); process.exitCode=1; }
}
// Keep executable-only awaits out of the synchronously imported public package.
if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url) {
  void runControlEntry().catch(error => { process.stderr.write(safeDiagnostic(error)+'\n'); process.exitCode=1; });
}
