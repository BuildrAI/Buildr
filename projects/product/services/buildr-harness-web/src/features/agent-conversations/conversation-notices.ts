import type { ConversationEntry, ConversationRun } from './types.ts';

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
  '交互政策已更新，使用新的原生会话': '交互政策已更新',
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
export function conversationFailureImpact(run: Pick<ConversationRun,'status'|'accepted'|'tools'|'diagnostic'>): string | undefined {
  if(run.status!=='failed')return;
  const preflight=/agent_context_binding_mismatch|原生上下文与当前目录或配置身份不匹配|本轮要求未发送|本次.*未发送|消息未发送：Claude Code 配套组件/.test(run.diagnostic??'');
  const delivery=run.accepted?'本轮已受理，但未完成。':preflight?'本次要求未送达。':'本次要求是否送达尚未确认。';
  const work=run.tools.some(tool=>tool.status!=='completed')?'仍有工具结果待确认，不会自动重跑。':'';
  return `${delivery}${work}`;
}

/** A released or stop-requested unknown run names its real source; the record and finished work stay. */
export function conversationUnknownExecutionSummary(run: Pick<ConversationRun,'diagnostic'|'stopRequested'|'tools'>): { reason: string; detail: string } {
  const pending = (run.tools ?? []).filter(tool => tool.status !== 'completed').length;
  const limitPaused = /自动续行次数已达上限/.test(run.diagnostic ?? '');
  const detail = limitPaused
    ? (pending ? `记录和已完成的操作都保留。另有 ${pending} 条后台命令的结束记录缺失，可能仍在运行；继续时会先核对，不会重跑。` : '后台结果已取得，记录和已完成的操作都保留；继续后会核对成果并接续原目标。')
    : '记录和已完成的操作都保留。' + (pending ? `另有 ${pending} 条后台命令的结束记录缺失，可能仍在运行；继续时会先核对，不会重跑。` : '');
  if (/服务退休中断了本轮执行/.test(run.diagnostic ?? '')) return { reason: '服务重启中断了本轮，结果未能确认。', detail };
  if (limitPaused) return { reason: '后台自动续行已达上限，本轮已暂停。', detail };
  if (run.stopRequested) return { reason: '已请求停止，但尚未确认结束。', detail };
  return { reason: '本轮执行中断，结果未能确认。', detail };
}

/** Live unknown notices surface real readable diagnostics instead of hiding them in tooltips. */
export function conversationLiveUnknownReason(diagnostic?: string, streamError?: string): string | undefined {
  for (const raw of [diagnostic, streamError]) {
    const text = raw?.trim();
    if (!text) continue;
    if (/[一-鿿]/.test(text)) return text;
    if (/^qoder_late_native_activity$/i.test(text)) return '原生执行在结束后仍有迟到活动，结果尚未确认。';
  }
  return undefined;
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
  if (/agent_claude_sdk_missing|Claude Code 配套组件/.test(text)) {
    return { summary: 'Claude Code 配套组件缺失或无法加载。', action: '请在「设置 → 智能体」中检查更新并修复 Claude Code。' };
  }
  if (/agent_context_binding_mismatch|agent_binding_changed|原生上下文与当前目录或配置身份不匹配|原连接身份不匹配|程序或原配置身份已失配/i.test(text)) {
    return { summary: '原会话与当前执行环境不匹配，无法继续。' };
  }
  if (/agent_history_changed|原生记录有新变化|原生用户输入尚不能准确映射/i.test(text)) {
    return { summary: '发送前的原生历史核对未通过，本轮要求未发送。', action: '请核对已保留的原生记录后再继续。' };
  }
  if (/agent_runtime_release_unconfirmed|上一轮资源仍待释放|原执行资源归属尚未确认/i.test(text)) {
    return { summary: '上一轮执行资源尚未完成释放，本轮要求未发送。', action: '请稍后核对执行状态后再继续。' };
  }
  if (/服务退休中断了本轮执行/.test(text)) {
    return { summary: '服务退休中断了本轮执行，已有结果保留。', action: '可以继续原目标。' };
  }
  if (/CALL_COUNT_LIMIT|isQueued|调用次数|调用频率|rate.?limit|too many requests|(?:^|\D)429(?:\D|$)/i.test(text)) {
    const retry = failureRetrySeconds(text);
    return { summary: '模型调用达到当前上限，请求被服务端排队。', action: retry ? `约 ${retry} 秒后重试，或切换到其他模型/供应商。` : '请稍后重试，或切换到其他模型/供应商。' };
  }
  if (/quota|额度|余额不足|credit/i.test(text)) return { summary: '模型供应商额度不足。', action: '请切换有额度的模型/供应商，或稍后重试。' };
  if (/login[_ -]?expired|not[_ -]?authenticated|未登录|登录已失效|登录已过期|认证失败|API Key 无效|(?:^|\D)(?:401|403)(?:\D|$)/i.test(text)) {
    return { summary: '模型供应商登录失效或没有访问权限。', action: '请检查供应商状态并重新认证。' };
  }
  if (/model[_ -]?(?:unavailable|disabled)|模型.*(?:不可用|已停用)|所选模型/i.test(text)) {
    return { summary: '所选模型当前不可用。', action: '请重新选择可用模型，或检查供应商状态。' };
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
  return { summary: '本轮执行失败，暂时无法确定原因。' };
}

export function conversationModelWarning(
  ready: boolean,
  accountId: string | undefined,
  model: {available: boolean; enabled?: boolean} | undefined,
  priorChoice?: {accountId?: string; accountIdentity?: string; cleared?: boolean},
  catalog?: ReadonlyArray<{accountId: string; accountIdentity?: string; available: boolean; enabled?: boolean}>,
): string | undefined {
  if (!ready) return;
  if (priorChoice?.cleared && priorChoice.accountId && catalog) {
    if (priorChoice.accountIdentity && catalog.some(item => item.accountId === priorChoice.accountId && item.accountIdentity && item.accountIdentity !== priorChoice.accountIdentity)) {
      return '当前登录账号已变化，原会话不会在新账号下自动继续；请重新选择模型后再发送。';
    }
    if (!catalog.some(item => item.accountId === priorChoice.accountId && item.available && item.enabled !== false)) {
      return '所选模型供应商当前不可用，请检查供应商状态或重新选择模型。';
    }
  }
  if (!accountId || model?.available) return;
  return model?.enabled === false ? '所选模型已停用，请重新选择。' : '所选模型供应商当前不可用，请检查供应商状态。';
}

/** Model availability is already rendered from current state, including recovery. */
export function conversationActionError(error: string, modelWarning: string | undefined): string | undefined {
  if (!error || error === modelWarning || legacyModelWarnings.has(error)) return;
  return error;
}

/** Keep internal entries in the transcript model for run ownership and pagination. */
function isAutomaticContinuation(entry:Pick<ConversationEntry,'kind'|'role'|'text'>):boolean {
  return entry.kind==='notice'&&entry.role==='system'&&['系统自动恢复：','系统自动重试：'].some(prefix=>entry.text.startsWith(prefix));
}

export function isQuietAutomaticContinuation(entry:ConversationEntry):boolean {
  return Boolean(entry.runId)&&isAutomaticContinuation(entry)&&entry.status!=='failed'&&entry.status!=='unknown'&&!entry.deliveryDiagnostic;
}

/** Internal instructions stay in source history; the page shows only the receipt. */
export function conversationSystemNoticeText(entry:Pick<ConversationEntry,'kind'|'role'|'text'|'status'>):string {
  if(!isAutomaticContinuation(entry))return entry.text;
  return entry.status==='accepted'?'已自动接续上次工作。':entry.status==='failed'?'自动恢复未能接续。':entry.status==='unknown'?'自动恢复是否接续仍待确认。':'正在自动核对并接续上次工作。';
}
