import type { ConversationEntry, ConversationRun } from './types';

const recoveryReceipts = new Set(['已请求重试上次未送达的要求。', '已请求继续上次执行。']);
const legacyModelWarnings = new Set(['所选模型暂不可用，请重新选择。', '所选模型已停用或来源不可用，请重新选择。']);

/** Collapse adjacent recovery receipts in the view without rewriting history. */
export function visibleConversationEntries(entries: ConversationEntry[]): ConversationEntry[] {
  return entries.filter((entry, index) => {
    if(entry.kind==='message'&&entry.parentToolId)return false;
    if(entry.kind==='notice'&&entry.role==='system'&&['retired-question-','waiting-question-','waiting-handoff-'].some(prefix=>entry.id.startsWith(prefix)))return false;
    const next = entries[index + 1];
    return !(entry.kind === 'notice' && entry.role === 'system' && recoveryReceipts.has(entry.text)
      && next?.kind === entry.kind && next.role === entry.role && next.text === entry.text && next.participantId === entry.participantId);
  });
}

/** Seen state follows the same primary messages the person can actually read. */
export function latestVisibleConversationMessage(entries:ConversationEntry[]):ConversationEntry|undefined {
  return visibleConversationEntries(entries).filter(entry=>!entry.parentToolId&&!entry.thinking&&(entry.kind==='message'&&(entry.role==='user'||entry.role==='assistant')||entry.role==='user'&&entry.kind==='notice'&&entry.id.startsWith('reply-'))&&entry.status!=='failed').at(-1);
}

/** 服务端记录的原因文本收敛为一句人话；未登记的原因回落到通用说明，不猜具体原因。 */
const nativeSessionCauses: Record<string, string> = {
  '用户执行选择变化': '执行选择已变化',
  '原轮仍有在途工作，新要求使用独立会话': '原轮仍在执行',
  '原会话控制资源尚未释放，新要求使用独立会话': '原后台尚未释放原会话',
  '原上下文不可复用，使用新的原生会话': '原会话无法继续',
  '原轮控制已释放，新后台复用原生会话': '原后台已释放，新后台接回原会话',
};

/** 主对话只说明发生了什么、本轮在哪里继续；会话编号、后台代次与变化依据留在接续诊断。 */
export function conversationNativeSessionSummary(entry:Pick<ConversationEntry,'nativeSession'>):string {
  const session=entry.nativeSession;
  if(!session)return '';
  const adoption=session.reason==='backend-adoption';
  const cause=session.backendChange?'后台程序内容已更新':adoption?'后台已接管':nativeSessionCauses[session.description]??'原会话无法继续';
  return `${cause}，${adoption?'本轮仍在原原生会话中继续':'本轮改在新的原生会话中继续'}。原执行与历史记录保留。`;
}

/** 折叠诊断按字段呈现，便于逐项核对，而不是一整段编号。 */
export type NativeSessionDiagnosticField = { label: string; value: string };

/** 折叠后的技术明细，供核对前后身份与变化依据；不作为主对话正文。 */
export function conversationNativeSessionDiagnostic(entry:Pick<ConversationEntry,'nativeSession'|'status'>):NativeSessionDiagnosticField[] {
  const session=entry.nativeSession;
  if(!session)return [];
  const {reason,description,from,to,backendChange}=session;
  const adoption=reason==='backend-adoption';
  const fields:NativeSessionDiagnosticField[]=[{label:'类型',value:adoption?'后台接管，原生会话保留':'原生会话替换'}];
  fields.push({label:'原生会话',value:`${from.contextId??'无原生会话'} → ${to.contextId}`});
  fields.push({label:'后台代次',value:`${from.generation??'历史未记录'} → ${to.generation}`});
  if(backendChange)fields.push({label:'变化依据',value:`${backendChange.reason==='runtime-content-changed'?'检测到后台运行内容变化':'同一运行内容的后台进程重启'}（${backendChange.detectedAt}；运行内容 ${backendChange.fromDigest} → ${backendChange.toDigest}）`});
  else if(from.generation!==to.generation)fields.push({label:'变化依据',value:'后台变化来源：历史未记录'});
  fields.push({label:'原因',value:description});
  fields.push({label:'本轮状态',value:entry.status==='accepted'?'已受理':entry.status==='failed'?'未送达':entry.status==='unknown'?'送达待确认':'等待受理'});
  return fields;
}

/** 未送达与送达待确认必须留在可见摘要里，不因折叠而隐藏。 */
export function conversationNativeSessionIssue(entry:Pick<ConversationEntry,'status'>):string|undefined {
  return entry.status==='failed'?'本轮未送达':entry.status==='unknown'?'本轮送达待确认':undefined;
}

/** A new native context with unchanged choices is continuation, not a model takeover. */
export function conversationHandoffReceipt(entry:Pick<ConversationEntry,'handoff'|'status'|'text'>):string {
  if(!entry.handoff)return entry.text;
  if(!entry.handoff.changes.length)return entry.status==='accepted'?'':entry.status==='failed'?'新要求未接收':'新要求接收待确认';
  const target=entry.handoff.changes.map(change=>change.after).join(' · ');
  return `${target} ${entry.status==='accepted'?'已接手':entry.status==='failed'?'未接收':'接收待确认'}`;
}

/** Receipt and tool outcomes are independent. Failure alone never permits replay. */
export function conversationFailureImpact(run: Pick<ConversationRun,'status'|'accepted'|'tools'>): string | undefined {
  if(run.status!=='failed')return;
  const delivery=run.accepted?'本轮已受理，但未完成。':'尚未确认原输入是否受理，请先核对执行记录。';
  const work=run.tools.some(tool=>tool.status!=='completed')?'仍有工具未结束或结果待确认，请先核对，不要重复执行原操作。':run.accepted?'可以发送新的要求继续；不会自动重发原输入。':'不要直接重复发送可能已经执行的操作。';
  return `${delivery}对话记录已保留。${work}`;
}

export type ConversationFailureReason = { summary: string; action?: string };

function failureRetrySeconds(diagnostic: string): number | undefined {
  const match = diagnostic.match(/(?:retryAfterSeconds|waitTime)[^0-9]{0,8}(\d+)/i);
  const seconds = match ? Number(match[1]) : NaN;
  return Number.isSafeInteger(seconds) && seconds > 0 ? Math.min(seconds, 3600) : undefined;
}

/** 只提炼可公开的原因；原始厂商内容仍留在技术详情中。 */
export function conversationFailureReason(diagnostic?: string, fault?: Pick<ConversationRun,'fault'>['fault']): ConversationFailureReason {
  const text = diagnostic ?? '';
  if (/CALL_COUNT_LIMIT|isQueued|调用次数|调用频率|rate.?limit|too many requests|(?:^|\D)429(?:\D|$)/i.test(text)) {
    const retry = failureRetrySeconds(text);
    return { summary: '模型调用达到当前上限，请求被服务端排队。', action: retry ? `约 ${retry} 秒后重试，或切换到其他模型/账号。` : '请稍后重试，或切换到其他模型/账号。' };
  }
  if (/quota|额度|余额不足|credit/i.test(text)) return { summary: '模型账号额度不足。', action: '请切换有额度的模型/账号，或稍后重试。' };
  if (/login[_ -]?expired|not[_ -]?authenticated|未登录|登录已失效|登录已过期|认证失败|API Key 无效|(?:^|\D)(?:401|403)(?:\D|$)/i.test(text)) {
    return { summary: '模型账号登录失效或没有访问权限。', action: '请检查账号状态并重新登录。' };
  }
  if (/model[_ -]?(?:unavailable|disabled)|模型.*(?:不可用|已停用)|所选模型/i.test(text)) {
    return { summary: '所选模型当前不可用。', action: '请重新选择可用模型，或检查账号状态。' };
  }
  if (/ETIMEDOUT|timeout|timed out|超时/i.test(text)) return { summary: '模型服务响应超时。', action: '请稍后重试，或切换到其他模型。' };
  if (/ECONN(?:REFUSED|RESET|ABORTED)|ENOTFOUND|fetch failed|network|网络|socket hang up|连接.*(?:中断|失败)/i.test(text)) {
    return { summary: '与模型服务的连接中断。', action: '请检查网络连接后重试。' };
  }
  if (fault?.kind === 'process' || /agent_native_process_(?:closed|failed)|process (?:exited|closed|failed)|进程.*(?:结束|退出|失败)/i.test(text)) {
    return { summary: '执行进程意外结束。', action: '请先核对本轮已有成果，再决定是否继续；不会自动重放原操作。' };
  }
  if (fault?.kind === 'protocol' || /malformed tool call|orphan_tool_call|tool_call_stream|工具调用.*(?:格式|异常|中断)/i.test(text)) {
    return { summary: '模型返回的工具调用格式异常，本轮已中止。', action: '继续前请核对已有成果；不会自动重放原操作。' };
  }
  if (fault?.kind === 'transport' || /observation_lost|event_observation|状态观察.*(?:丢失|中断)/i.test(text)) {
    return { summary: '执行状态观察中断，未能确认本轮结束。', action: '请先核对执行记录和已有成果。' };
  }
  return { summary: '本轮执行因未识别的原因中断。', action: '请展开技术详情核对准确诊断；如持续出现，请保留该信息。' };
}

export function conversationModelWarning(ready: boolean, accountId: string | undefined, model: {available: boolean; enabled?: boolean} | undefined): string | undefined {
  if (!ready || !accountId || model?.available) return;
  return model?.enabled === false ? '所选模型已停用，请重新选择。' : '所选模型账号当前不可用，请检查账号登录状态。';
}

/** Model availability is already rendered from current state, including recovery. */
export function conversationActionError(error: string, modelWarning: string | undefined): string | undefined {
  if (!error || error === modelWarning || legacyModelWarnings.has(error)) return;
  return error;
}

/** Internal recovery instructions stay in source history; the page shows the actual receipt. */
export function conversationSystemNoticeText(entry:Pick<ConversationEntry,'kind'|'role'|'text'|'status'>):string {
  if(entry.kind!=='notice'||entry.role!=='system'||!entry.text.startsWith('系统自动恢复：'))return entry.text;
  return entry.status==='accepted'?'已自动接续上次工作。':entry.status==='failed'?'自动恢复未能接续。':entry.status==='unknown'?'自动恢复是否接续仍待确认。':'正在自动核对并接续上次工作。';
}
