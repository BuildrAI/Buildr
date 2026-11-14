export function reasoningEffortLabel(effort:{id:string;label:string}) {
  const labels:Record<string,string>={minimal:'最小',low:'低',medium:'中',high:'高',xhigh:'极高',max:'最高',ultra:'极致',none:'无',off:'关闭',disabled:'关闭',auto:'自动',adaptive:'自适应'};
  return effort.id==='xhigh'&&effort.label==='Extra' ? '额外' : labels[effort.id]||effort.label;
}

/** Rank only explicit depth values. Auto/adaptive/unknown choices are not depth steps. */
export function reasoningEffortRank(id:string):number|undefined {
  const ranks:Record<string,number>={off:0,none:0,disabled:0,minimal:1,low:2,medium:3,high:4,xhigh:5,max:6,ultra:7};
  return ranks[id.toLowerCase()];
}
export function sortReasoningEfforts<T extends {id:string}>(options:readonly T[]):T[]{
  return options.map((value,index)=>({value,index,rank:reasoningEffortRank(value.id)})).sort((a,b)=>(a.rank??Infinity)-(b.rank??Infinity)||a.index-b.index).map(item=>item.value);
}

export type ModelPickerGroup={id:string;label:string;options:{value:string;label:string;disabled?:boolean;title?:string}[]};

const modelNameOrder=new Intl.Collator('zh-Hans-CN',{sensitivity:'base',numeric:true});

/** 来源分组与组内模型按显示名称稳定排序，再只按模型或来源名称过滤可见选项；分组标签匹配时保留该来源的完整选项。 */
export function filterModelGroups(groups:readonly ModelPickerGroup[],query:string):ModelPickerGroup[] {
  const needle=query.trim().toLocaleLowerCase();
  const visible=needle?groups.map(group=>{
    const source=group.label.toLocaleLowerCase().includes(needle);
    return {...group,options:group.options.filter(option=>source||option.label.toLocaleLowerCase().includes(needle))};
  }).filter(group=>group.options.length>0):groups;
  return visible.map(group=>({...group,options:[...group.options].sort((a,b)=>modelNameOrder.compare(a.label,b.label))})).sort((a,b)=>modelNameOrder.compare(a.label,b.label));
}

/**
 * Historical/offline fallback label tables only. Live views MUST prefer server
 * `label` and `presentation` fields; these fallbacks cover persisted records or
 * minimal fixtures created before server-side presentation metadata existed.
 */
const FALLBACK_SOURCE_NAMES:Record<string,string>={codex:'ChatGPT',openai:'ChatGPT API',anthropic:'Claude API',dsh:'DeepSeek',deepseek:'DeepSeek',qoder:'Qoder','qoder-cn':'Qoder CN',devin:'Devin',antigravity:'Google 个人账号',custom:'自定义供应商'};
const FALLBACK_CARD_NAMES:Record<string,string>={dsh:'DeepSeek Harness'};
const FALLBACK_VENDOR_NAMES:Record<string,string>={codex:'OpenAI',openai:'OpenAI',anthropic:'Anthropic',dsh:'DeepSeek',deepseek:'DeepSeek',qoder:'Qoder','qoder-cn':'Qoder CN',devin:'Devin',antigravity:'Google'};
const FALLBACK_AGENT_NAMES:Record<string,string>={codex:'Codex','claude-code':'Claude Code',dsh:'DSH',qoder:'Qoder','qoder-cn':'Qoder CN',devin:'Devin',deepseek:'DeepSeek',antigravity:'Antigravity'};
const FALLBACK_API_KEY_SOURCE_NAMES:Record<string,string>={anthropic:'Claude API',openai:'ChatGPT API'};
const FALLBACK_QUOTA_NOTES:Record<string,string>={
  anthropic:'Anthropic API 未提供剩余额度观察；请在 Anthropic 平台查看用量与账单。',
  openai:'OpenAI API 不提供剩余余额读取；请在 OpenAI 平台查看用量与账单。',
};
export const DEFAULT_OPENAI_BILLING_URL='https://platform.openai.com/settings/organization/billing/overview';

export function modelSourceName(provider:string):string {
  const id=provider.replace(/^native-/, '');
  return FALLBACK_SOURCE_NAMES[id]??provider;
}

export function fallbackKnownSourceName(provider:string):string|undefined {
  return FALLBACK_SOURCE_NAMES[provider.replace(/^native-/, '')];
}

export function fallbackApiKeySourceName(provider:string):string|undefined {
  return FALLBACK_API_KEY_SOURCE_NAMES[provider];
}

export function fallbackSourceCardLabel(connectionId:string|undefined,fallback:string):string {
  return (connectionId&&FALLBACK_CARD_NAMES[connectionId])||fallback;
}

export function fallbackVendorName(provider:string,fallback:string):string {
  return FALLBACK_VENDOR_NAMES[provider.replace(/^native-/, '')]??fallback;
}

export function fallbackApiKeyQuotaNote(provider:string):string {
  return FALLBACK_QUOTA_NOTES[provider]??FALLBACK_QUOTA_NOTES.openai!;
}

export function fallbackBillingLink(provider:string):{url:string;label:string}|undefined {
  return provider==='openai'?{url:DEFAULT_OPENAI_BILLING_URL,label:'打开 OpenAI 账单'}:undefined;
}

/** Legacy placeholder IDs retained so historical tests and saved links resolve cleanly. */
export function fallbackNewModelSourceProvider(id:string):string|undefined {
  return ({'new-devin':'devin','new-openai':'openai'} as Record<string,string>)[id];
}

export function isLegacyDuplicateEmptySource(
  account:{provider:string;status:string;accountLabel?:string;credentialConfigured?:boolean;models:readonly unknown[];loginAttempt?:{state:string}},
  accounts:ReadonlyArray<{provider:string;status:string;sourceEnabled?:boolean}>,
  waiting:(attempt:{state:string}|undefined)=>boolean,
):boolean {
  const hasConnected=accounts.some(item=>item.provider==='devin'&&item.status==='ready'&&item.sourceEnabled!==false);
  return hasConnected&&account.provider==='devin'&&account.status==='not-authenticated'&&!account.accountLabel&&!account.credentialConfigured&&!account.models.length&&!waiting(account.loginAttempt);
}

export function isAlwaysVisibleLegacyProvider(provider:string):boolean {
  return provider==='devin'||provider==='openai';
}

export function missingLegacyPlaceholderSource(accounts:ReadonlyArray<{provider:string}>):{id:string;provider:string;providerLabel:string}|undefined {
  return accounts.some(account=>account.provider==='devin')?undefined:{id:'new-devin',provider:'devin',providerLabel:'Devin'};
}

/** Execution agent names stay separate from model-source names. */
export function executionAgentName(provider:string):string {
  const id=provider.replace(/^native-/, '');
  return FALLBACK_AGENT_NAMES[id]??provider;
}


/** Cycle only among tiers the selected model actually offers. */
export function nextServiceTier(tiers:ReadonlyArray<{id:string}>|undefined,current:string|undefined,fallback:string|undefined):string|undefined {
  if(!tiers?.length)return current;
  const selected=current??fallback??tiers[0]!.id;
  const index=tiers.findIndex(tier=>tier.id===selected);
  return tiers[(index+1+tiers.length)%tiers.length]!.id;
}

/** 切换档位保留已选推理强度；目标档位不提供该强度时回落继承，不发送无效值。 */
export function tierReasoningEffort(tier:{reasoningEfforts?:ReadonlyArray<{id:string}>}|undefined,fallback:ReadonlyArray<{id:string}>|undefined,effort:string|undefined):string|undefined {
  if(!effort)return effort;
  const options=tier?.reasoningEfforts??fallback;
  return options?.some(option=>option.id===effort)?effort:undefined;
}

/** Only agents prepared on this machine can start a conversation; installed-but-unprepared ones stay in settings. */
export function preparedAgentConnections<T extends {enabled:boolean;configPath?:string}>(connections:readonly T[]):T[] {
  return connections.filter(connection => connection.enabled && !!connection.configPath);
}
