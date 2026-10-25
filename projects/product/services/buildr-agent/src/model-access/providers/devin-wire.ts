import { createHash } from 'node:crypto';
import type { ProviderInferenceInput, ModelOffering } from '../contracts.ts';
import { record, string, positive } from './private-account.ts';
import type { DevinImage, DevinPrompt, DevinRequest, DevinModelRow } from './devin-codec.ts';

export interface DevinOffering extends ModelOffering { variants: Map<string, DevinModelRow>; defaultUid: string; }
export function modelOfferings(rows: DevinModelRow[]): DevinOffering[] {
  const groups = new Map<string, DevinOffering>();
  for (const row of rows) {
    const matched = row.id.match(/-(off|none|minimal|low|medium|high|xhigh|max)$/i);
    const effort = matched?.[1]?.toLowerCase(); const id = matched ? row.id.slice(0, -matched[0].length) : row.id;
    let group = groups.get(id);
    if (!group) {
      group = { id, label: row.label || id, images: row.images, tools: true, contextWindow: row.contextWindow, maxOutputTokens: row.maxOutput, variants: new Map(), defaultUid: row.id };
      groups.set(id, group);
    }
    group.variants.set(effort ?? '', row);
    if (row.isDefault) { group.defaultUid = row.id; group.defaultReasoningEffort = effort; group.label = row.label || id; }
    if (effort) { group.reasoningEfforts ??= []; if (!group.reasoningEfforts.some(e => e.id === effort)) group.reasoningEfforts.push({ id: effort, label: effort }); }
    group.images &&= row.images;
    if (row.contextWindow) group.contextWindow = Math.min(group.contextWindow ?? row.contextWindow, row.contextWindow);
    if (row.maxOutput) group.maxOutputTokens = Math.min(group.maxOutputTokens ?? row.maxOutput, row.maxOutput);
  }
  return [...groups.values()];
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
  const selected = effort ? offering.variants.get(effort) : [...offering.variants.values()].find(row => row.id === offering.defaultUid);
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
    return { name, description: string(fn.description) ?? '', parameters: JSON.stringify(record(fn.parameters)), strict: fn.strict === true };
  });
  let toolChoice: string | undefined;
  if (typeof body.tool_choice === 'string') { if (!['auto', 'none', 'required'].includes(body.tool_choice)) throw new Error('model_tool_choice_unsupported'); toolChoice = body.tool_choice; }
  else if (body.tool_choice !== undefined) { toolChoice = string(record(record(body.tool_choice).function).name); if (!toolChoice) throw new Error('model_tool_choice_unsupported'); }
  const maxTokens = positive(body.max_completion_tokens) ?? positive(body.max_tokens) ?? selected.maxOutput ?? 64000;
  if (!Number.isSafeInteger(maxTokens) || selected.maxOutput && maxTokens > selected.maxOutput) throw new Error('model_output_limit_unsupported');
  for (const field of ['audio', 'modalities', 'response_format', 'stop', 'logprobs', 'logit_bias', 'seed', 'prediction']) if (body[field] !== undefined) throw new Error('model_parameter_unsupported');
  return { token, system: system.join('\n\n'), prompts, tools, model: selected.id, cascade, execution: uuid(JSON.stringify([cascade, runId, requestId])), maxTokens, ...(typeof body.temperature === 'number' ? { temperature: body.temperature } : {}), ...(typeof body.top_p === 'number' ? { topP: body.top_p } : {}), toolChoice, parallelTools: body.parallel_tool_calls === true };
}
