import { createHash } from 'node:crypto';
import type { ProviderInferenceInput, ModelOffering } from '../contracts.ts';
import { record, string, positive } from './private-account.ts';
import type { DevinImage, DevinPrompt, DevinRequest, DevinModelRow } from './devin-codec.ts';

export interface DevinOffering extends ModelOffering { variants: Map<string, DevinModelRow>; defaultUid: string; defaultTier:string; }
const combinationRow=(row:DevinModelRow)=>row.family==='fusion'||/^fusion(?:-|$)/i.test(row.id)||/^fusion\b/i.test(row.label);
const depthOrder=['off','none','minimal','low','medium','high','xhigh','max','ultra'];
const effortOf=(row:DevinModelRow)=>row.id.match(/-(off|none|minimal|low|medium|high|xhigh|max|ultra)(?=-(?:fast|priority|lightning|[0-9]+[km])(?:-|$)|$)/i)?.[1]?.toLowerCase();
const speedOf=(row:DevinModelRow)=>/(?:-|_)(fast|priority)(?:-|_|$)/i.test(row.id)?'fast':/(?:-|_)lightning(?:-|_|$)/i.test(row.id)?'lightning':'standard';
function baseLabel(row:DevinModelRow){return row.label.replace(/\s+(?:No Thinking|off|none|minimal|low|medium|high|xhigh|max|ultra)(?:\s+Thinking)?(?=\s+(?:Fast|Lightning|[0-9.]+[km])|$)/ig,'').replace(/(?:\s+(?:Fast|Lightning|[0-9.]+[km]))+$/ig,'').trim()||row.family||row.id;}
export function modelOfferings(rows: DevinModelRow[]): DevinOffering[] {
  const grouped=new Map<string,DevinModelRow[]>();
  for(const row of rows){
    if(row.disabled)continue;
    const combination=combinationRow(row);
    const effort=effortOf(row);
    const id=combination?row.id:row.family|| (effort?row.id.slice(0,row.id.lastIndexOf('-'+effort)):row.id);
    grouped.set(id,[...(grouped.get(id)||[]),row]);
  }
  return [...grouped].map(([id,variants])=>{
    const combination=variants.some(combinationRow);
    const preferred=variants.find(row=>row.isDefault)??variants[0]!;
    const contexts=new Set(variants.map(row=>row.contextWindow));
    const tiers=new Map<string,{id:string;label:string;contextWindow?:number;reasoningEfforts:Array<{id:string;label:string}>;defaultReasoningEffort?:string;defaultUid:string}>();
    const mapped=new Map<string,DevinModelRow>();let defaultTier='';
    for(const row of variants){
      const effort=combination?undefined:effortOf(row),speed=combination?'standard':speedOf(row);
      let tierId=speed+':'+(row.contextWindow??'default');
      if(mapped.has(tierId+':'+(effort??'')))tierId+=':'+createHash('sha256').update(row.id).digest('hex').slice(0,8);
      const tier=tiers.get(tierId)??{id:tierId,label:({standard:'标准',fast:'快速',lightning:'闪电'}[speed]??speed)+(contexts.size>1&&row.contextWindow?' · '+Math.round(row.contextWindow/1000)+'K':''),contextWindow:row.contextWindow,reasoningEfforts:[],defaultUid:row.id,defaultReasoningEffort:effort};
      if(effort&&!tier.reasoningEfforts.some(item=>item.id===effort))tier.reasoningEfforts.push({id:effort,label:effort});
      if(row.isDefault){tier.defaultUid=row.id;tier.defaultReasoningEffort=effort;}
      tiers.set(tierId,tier);mapped.set(tierId+':'+(effort??''),row);
      if(row===preferred)defaultTier=tierId;
    }
    for(const tier of tiers.values())tier.reasoningEfforts.sort((a,b)=>depthOrder.indexOf(a.id)-depthOrder.indexOf(b.id));
    const selected=tiers.get(defaultTier)!;
    const capacities=variants.flatMap(row=>row.contextWindow??[]),outputs=variants.flatMap(row=>row.maxOutput??[]);
    return {id,label:combination?preferred.label:baseLabel(preferred),family:preferred.family,kind:combination?'combination':'model',images:variants.every(row=>row.images),tools:true,contextWindow:selected.contextWindow,reportedContextWindow:capacities.length?Math.max(...capacities):undefined,maxOutputTokens:outputs.length?Math.min(...outputs):undefined,reasoningEfforts:selected.reasoningEfforts.length?selected.reasoningEfforts:undefined,defaultReasoningEffort:selected.defaultReasoningEffort,
      ...(tiers.size>1?{serviceTiers:[...tiers.values()].map(({defaultUid,...tier})=>tier),defaultServiceTier:defaultTier}:{}),variants:mapped,defaultUid:preferred.id,defaultTier};
  });
}
function uuid(seed: string): string {
  const bytes = createHash('sha256').update(seed).digest(); bytes[6] = (bytes[6]! & 15) | 80; bytes[8] = (bytes[8]! & 63) | 128;
  const hex = bytes.subarray(0, 16).toString('hex'); return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
function content(value: unknown): { text: string; images: DevinImage[] } {
  if (typeof value === 'string') return { text: value, images: [] };
  if (value === null || value === undefined) return { text: '', images: [] };
  if (!Array.isArray(value)) throw new Error('model_content_unsupported');
  const texts: string[] = [], images: DevinImage[] = [];
  for (const entry of value) {
    const part = record(entry);
    if (part.type === 'text' && typeof part.text === 'string') texts.push(part.text);
    else if (part.type === 'image_url') {
      const url = string(record(part.image_url).url) ?? string(part.image_url);
      const parsed = url?.match(/^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/]+={0,2})$/);
      if (!parsed || Buffer.byteLength(parsed[2]!, 'base64') > 8 * 1024 * 1024) throw new Error('model_image_unsupported');
      images.push({ base64: parsed[2]!, mime: parsed[1]! });
    } else throw new Error('model_content_unsupported');
  }
  return { text: texts.join('\n'), images };
}
export function buildDevinRequest(input: ProviderInferenceInput, offering: DevinOffering, token: string): DevinRequest {
  const body = input.body;
  if (!Array.isArray(body.messages)) throw new Error('model_messages_required');
  const effort = string(body.reasoning_effort);
  const tier=string(body.service_tier)??offering.defaultTier;
  const config=offering.serviceTiers?.find(value=>value.id===tier);
  if(tier!==offering.defaultTier&&!config)throw new Error('model_tier_unsupported');
  const selectedEffort=effort??config?.defaultReasoningEffort??(tier===offering.defaultTier?offering.defaultReasoningEffort:undefined);
  const selected=offering.variants.get(tier+':'+(selectedEffort??''));
  if (!selected) throw new Error('model_reasoning_unsupported');
  const { accountId, agentId, conversationId, runId, requestId } = input.context;
  const cascade = uuid(JSON.stringify([accountId, agentId, conversationId]));
  const prompts: DevinPrompt[] = [], system: string[] = [];
  for (const [index, entry] of body.messages.entries()) {
    const message = record(entry), value = content(message.content);
    if ((message.role === 'system' || message.role === 'developer') && !value.images.length) { system.push(value.text); continue; }
    if (!['user', 'assistant', 'tool'].includes(String(message.role))) throw new Error('model_role_unsupported');
    if (value.images.length && !selected.images) throw new Error('model_image_unsupported');
    const role = message.role === 'assistant' ? 2 : message.role === 'tool' ? 4 : 1;
    const prompt: DevinPrompt = { id: uuid(`${cascade}:${index}:${role}`), role, text: value.text, images: value.images };
    if (role === 4) { prompt.callId = string(message.tool_call_id); if (!prompt.callId) throw new Error('model_tool_call_id_required'); }
    if (role === 2) {
      prompt.thinking = string(message.reasoning_content);
      const signature = string(message.reasoning_signature); if (signature) prompt.signature = Buffer.from(signature, 'base64');
      if (message.tool_calls !== undefined && !Array.isArray(message.tool_calls)) throw new Error('model_tool_calls_invalid');
      prompt.calls = (Array.isArray(message.tool_calls) ? message.tool_calls : []).map(entry => {
        const call = record(entry), fn = record(call.function); const id = string(call.id), name = string(fn.name), args = string(fn.arguments) ?? '{}';
        if (!id || !name || call.type !== 'function') throw new Error('model_tool_call_invalid');
        return { id, name, arguments: args };
      });
    }
    prompts.push(prompt);
  }
  if (body.tools !== undefined && !Array.isArray(body.tools)) throw new Error('model_tools_invalid');
  const tools = (Array.isArray(body.tools) ? body.tools : []).map(entry => {
    const tool = record(entry), fn = record(tool.function), name = string(fn.name);
    if (tool.type !== 'function' || !name) throw new Error('model_tool_unsupported');
    return { name, description: devinToolDescription(agentId, name, string(fn.description) ?? ''), parameters: JSON.stringify(record(fn.parameters)), strict: fn.strict === true };
  });
  let toolChoice: string | undefined;
  if (typeof body.tool_choice === 'string') { if (!['auto', 'none', 'required'].includes(body.tool_choice)) throw new Error('model_tool_choice_unsupported'); toolChoice = body.tool_choice; }
  else if (body.tool_choice !== undefined) { toolChoice = string(record(record(body.tool_choice).function).name); if (!toolChoice) throw new Error('model_tool_choice_unsupported'); }
  const maxTokens = positive(body.max_completion_tokens) ?? positive(body.max_tokens) ?? selected.maxOutput ?? 64000;
  if (!Number.isSafeInteger(maxTokens) || selected.maxOutput && maxTokens > selected.maxOutput) throw new Error('model_output_limit_unsupported');
  for (const field of ['audio', 'modalities', 'response_format', 'stop', 'logprobs', 'logit_bias', 'seed', 'prediction']) if (body[field] !== undefined) throw new Error('model_parameter_unsupported');
  return { token, system: system.join('\n\n'), prompts, tools, model: selected.id, cascade, execution: uuid(JSON.stringify([cascade, runId, requestId])), maxTokens, ...(typeof body.temperature === 'number' ? { temperature: body.temperature } : {}), ...(typeof body.top_p === 'number' ? { topP: body.top_p } : {}), toolChoice, parallelTools: body.parallel_tool_calls === true };
}

/** Preserve tool meaning; Devin rejects these exact native Codex descriptions. */
function devinToolDescription(agentId: string, name: string, description: string): string {
  if (agentId !== 'codex') return description;
  if (name === 'exec_command' && description === 'Runs a command in a PTY, returning output or a session ID for ongoing interaction.') return 'Run the specified command, optionally using a PTY. Return output and the session identifier when the command remains active.';
  if (name === 'write_stdin' && description === 'Writes characters to an existing unified exec session and returns recent output.') return 'Send characters to an existing command session, or poll its available output when chars is empty.';
  return description;
}
