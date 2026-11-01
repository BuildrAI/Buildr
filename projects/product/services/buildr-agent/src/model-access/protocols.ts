import { createHash, randomUUID } from 'node:crypto';
import { ModelAccessError, type ModelProtocol, type ProtocolJson } from './contracts.ts';
import { modelFailure, upstreamFailure } from './errors.ts';

const record = (v: unknown): ProtocolJson => v !== null && typeof v === 'object' && !Array.isArray(v) ? v as ProtocolJson : {};
const list = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
const string = (v: unknown): string => typeof v === 'string' ? v : '';
const number = (v: unknown): number => typeof v === 'number' && Number.isFinite(v) ? v : 0;
const id = () => randomUUID().replaceAll('-', '');
export interface OpaqueReasoning { encode(value: ProtocolJson): string; decode(value: string): ProtocolJson }
type Part = { type: 'text'; text: string } | { type: 'image'; url: string } | { type: 'tool'; id: string; name: string; arguments: string; custom?: boolean } | { type: 'result'; id: string; content: unknown } | { type: 'reasoning'; value: ProtocolJson };
interface Message { role: string; parts: Part[] }
interface Parsed { messages: Message[]; tools: ProtocolJson[]; customTools: Set<string>; parameters: ProtocolJson }
interface ToolBinding { name:string; namespace?:string; custom:boolean }
function qualifiedToolName(name:string,namespace?:string):string {
  if(!namespace)return name;
  const qualified=name.startsWith(namespace+'__')?name:`${namespace}__${name}`;
  return /^[a-zA-Z0-9_-]{1,64}$/.test(qualified)?qualified:'buildr_ns_'+createHash('sha256').update(JSON.stringify([namespace,name])).digest('hex').slice(0,40);
}
function responseTools(body:ProtocolJson):Array<{tool:ProtocolJson;binding:ToolBinding;wireName:string;namespaceDescription?:string}> {
  const result:Array<{tool:ProtocolJson;binding:ToolBinding;wireName:string;namespaceDescription?:string}>=[];
  for(const raw of list(body.tools)) {
    const tool=record(raw);
    const append=(child:ProtocolJson,namespace?:string,namespaceDescription?:string)=>{
      if(child.type!=='function'&&child.type!=='custom')throw new ModelAccessError('model_tool_unsupported','该模型尚不支持此服务端工具类型。',400);
      const name=string(child.name);if(!name)throw new ModelAccessError('model_tool_invalid','工具声明缺少名称。',400);
      const wireName=qualifiedToolName(name,namespace);
      if(result.some(item=>item.wireName===wireName))throw new ModelAccessError('model_tool_ambiguous','转换后的工具名称存在冲突。',400);
      result.push({tool:child,binding:{name,namespace,custom:child.type==='custom'},wireName,namespaceDescription});
    };
    if(tool.type==='namespace') { const namespace=string(tool.name);if(!namespace)throw new ModelAccessError('model_tool_invalid','工具命名空间缺少名称。',400);for(const child of list(tool.tools))append(record(child),namespace,string(tool.description)); }
    else append(tool);
  }
  return result;
}
function toolBindings(body:ProtocolJson):Map<string,ToolBinding> {
  const result=new Map(responseTools(body).map(item=>[item.wireName,item.binding]));
  for(const raw of list(body.input)){const item=record(raw);if(item.type==='function_call'||item.type==='custom_tool_call'){const name=string(item.name),namespace=string(item.namespace)||undefined;const wireName=qualifiedToolName(name,namespace);if(!result.has(wireName))result.set(wireName,{name,namespace,custom:item.type==='custom_tool_call'});}}
  return result;
}
function toolArguments(v: unknown): string { return typeof v === 'string' ? v : JSON.stringify(v ?? {}); }
function parseArguments(v: string): unknown { try { return JSON.parse(v); } catch { throw new ModelAccessError('model_tool_arguments_invalid', '模型工具参数不是有效 JSON。', 400); } }
function imageUrl(v: ProtocolJson): string {
  if (v.type === 'base64') return `data:${string(v.media_type)};base64,${string(v.data)}`;
  return string(v.url);
}
function parseContent(content: unknown, protocol: ModelProtocol): Part[] {
  if (typeof content === 'string') return [{ type: 'text', text: content }];
  return list(content).map(item => {
    const p = record(item), type = string(p.type);
    if (['text', 'input_text', 'output_text'].includes(type)) return { type: 'text' as const, text: string(p.text) };
    if (type === 'image_url') return { type: 'image' as const, url: string(record(p.image_url).url) || string(p.image_url) };
    if (type === 'input_image') return { type: 'image' as const, url: string(p.image_url) };
    if (type === 'image') return { type: 'image' as const, url: imageUrl(record(p.source)) };
    if (type === 'tool_use') return { type: 'tool' as const, id: string(p.id), name: string(p.name), arguments: toolArguments(p.input) };
    if (type === 'tool_result') return { type: 'result' as const, id: string(p.tool_use_id), content: p.content };
    if (type === 'thinking' || type === 'redacted_thinking') return { type: 'reasoning' as const, value: p };
    throw new ModelAccessError('model_content_unsupported', `所选协议不能转换此内容类型：${type || protocol}。`, 400);
  });
}
function parseRequest(body: ProtocolJson, protocol: ModelProtocol, opaque: OpaqueReasoning): Parsed {
  const messages: Message[] = [], tools: ProtocolJson[] = [], customTools = new Set<string>();
  const add = (role: string, parts: Part[]) => {
    if (!parts.length) return;
    const previous = messages.at(-1);
    // Responses represents one assistant turn as separate text, call and reasoning items.
    // Keep them together until a user input or tool result starts the next turn.
    if (protocol === 'responses' && role === 'assistant' && previous?.role === 'assistant') previous.parts.push(...parts);
    else messages.push({ role, parts });
  };
  if (protocol === 'responses') {
    if (typeof body.instructions === 'string') add('system', [{ type: 'text', text: body.instructions }]);
    if (typeof body.input === 'string') add('user', [{ type: 'text', text: body.input }]);
    for (const raw of list(body.input)) {
      const item = record(raw), kind = string(item.type);
      if (!kind || kind === 'message') add(string(item.role) || 'user', parseContent(item.content, protocol));
      else if (kind === 'function_call' || kind === 'custom_tool_call') add('assistant', [{ type: 'tool', id: string(item.call_id) || string(item.id), name: qualifiedToolName(string(item.name),string(item.namespace)||undefined), arguments: kind === 'custom_tool_call' ? JSON.stringify({ input: string(item.input) }) : string(item.arguments), custom: kind === 'custom_tool_call' }]);
      else if (kind === 'function_call_output' || kind === 'custom_tool_call_output') add('user', [{ type: 'result', id: string(item.call_id), content: item.output }]);
      else if (kind === 'reasoning') {
        if (item.encrypted_content) add('assistant', [{ type: 'reasoning', value: opaque.decode(string(item.encrypted_content)) }]);
        else if (list(item.summary).length) add('assistant', [{ type: 'reasoning', value: { type: 'thinking', thinking: list(item.summary).map(v => string(record(v).text)).join('') } }]);
      } else throw new ModelAccessError('model_input_unsupported', `所选模型不能转换此 Responses 输入：${kind}。`, 400);
    }
    for (const declaration of responseTools(body)) {
      const tool=declaration.tool;
      const description=[declaration.namespaceDescription,string(tool.description)].filter(Boolean).join('\n');
      if (tool.type === 'function') tools.push({ name: declaration.wireName, description, parameters: tool.parameters ?? {}, strict: tool.strict });
      else if (tool.type === 'custom') {
        customTools.add(declaration.wireName);
        tools.push({ name: declaration.wireName, description:description+(tool.format?'\nInput format: '+JSON.stringify(tool.format):''), parameters: { type: 'object', properties: { input: { type: 'string' } }, required: ['input'], additionalProperties: false } });
      }
    }
  } else if (protocol === 'chat-completions') {
    for (const raw of list(body.messages)) {
      const item = record(raw), role = string(item.role), parts: Part[] = [];
      if (role === 'tool' || role === 'function') parts.push({ type: 'result', id: string(item.tool_call_id), content: item.content });
      else {
        if (item.reasoning_content || item.reasoning_signature) parts.push({ type: 'reasoning', value: string(item.reasoning_signature).startsWith('buildr-v1.') ? opaque.decode(string(item.reasoning_signature)) : { type: 'thinking', thinking: string(item.reasoning_content), signature: item.reasoning_signature } });
        if (item.content !== null && item.content !== undefined) parts.push(...parseContent(item.content, protocol));
        for (const rawCall of list(item.tool_calls)) { const call = record(rawCall), fn = record(call.function); parts.push({ type: 'tool', id: string(call.id), name: string(fn.name), arguments: toolArguments(fn.arguments) }); }
      }
      add(role === 'tool' ? 'user' : role, parts);
    }
    for (const raw of list(body.tools)) { const tool = record(raw); if (tool.type !== 'function') throw new ModelAccessError('model_tool_unsupported', '该模型尚不支持此工具类型。', 400); tools.push(record(tool.function)); }
  } else {
    if (body.system) add('system', parseContent(body.system, protocol));
    for (const raw of list(body.messages)) { const item = record(raw); add(string(item.role), parseContent(item.content, protocol)); }
    for (const raw of list(body.tools)) { const tool = record(raw); if (tool.type) throw new ModelAccessError('model_tool_unsupported', '该模型尚不支持此服务端工具类型。', 400); tools.push({ name: tool.name, description: tool.description, parameters: tool.input_schema ?? {} }); }
  }
  const parameters: ProtocolJson = { model: body.model, stream: body.stream === true };
  for (const key of ['temperature', 'top_p', 'stop', 'parallel_tool_calls']) if (body[key] !== undefined) parameters[key] = body[key];
  const effort = record(body.reasoning).effort ?? body.reasoning_effort ?? record(body.output_config).effort;
  if (effort !== undefined) parameters.reasoning_effort = effort;
  const cap = body.max_output_tokens ?? body.max_tokens ?? body.max_completion_tokens;
  if (cap !== undefined) parameters.max_tokens = cap;
  if (body.tool_choice !== undefined) {
    const choice = record(body.tool_choice);
    const choiceName=string(choice.name)||string(record(choice.function).name)||string(record(choice.custom).name),choiceNamespace=string(choice.namespace)||string(record(choice.function).namespace)||string(record(choice.custom).namespace)||undefined;
    parameters.tool_choice = choice.type === 'auto'||choice.type==='none' ? choice.type : choice.type==='any' ? 'required' : choice.type === 'tool'||choice.type==='function'||choice.type==='custom' ? { type: 'function', function: { name: qualifiedToolName(choiceName,choiceNamespace) } } : body.tool_choice;
    if(choice.disable_parallel_tool_use===true)parameters.parallel_tool_calls=false;
  }
  for(const message of messages) for(const part of message.parts) if(part.type==='reasoning'&&part.value.type==='redacted_thinking'&&string(part.value.data).startsWith('buildr-v1.')) part.value=opaque.decode(string(part.value.data));
  return { messages, tools, customTools, parameters };
}
function anthropicImage(url: string): ProtocolJson {
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(url);
  return { type: 'image', source: match ? { type: 'base64', media_type: match[1], data: match[2] } : { type: 'url', url } };
}
function resultContent(content:unknown,protocol:ModelProtocol):unknown {
  if(!Array.isArray(content)) return typeof content==='string'?content:JSON.stringify(content??'');
  return parseContent(content,protocol).map(part=>{
    if(part.type==='text') return {type:protocol==='responses'?'input_text':'text',text:part.text};
    if(part.type==='image') return protocol==='responses'?{type:'input_image',image_url:part.url}:protocol==='anthropic-messages'?anthropicImage(part.url):{type:'image_url',image_url:{url:part.url}};
    throw new ModelAccessError('model_tool_result_unsupported','工具结果包含无法转换的内容。',400);
  });
}
function serializeRequest(parsed: Parsed, protocol: ModelProtocol, opaque: OpaqueReasoning): ProtocolJson {
  const body: ProtocolJson = { ...parsed.parameters };
  if (protocol === 'chat-completions') {
    body.messages = parsed.messages.flatMap(message => {
      const content: ProtocolJson[] = [], calls: ProtocolJson[] = [], result: ProtocolJson[] = [];
      let reasoning: ProtocolJson = {};
      for (const p of message.parts) {
        if (p.type === 'text') content.push({ type: 'text', text: p.text });
        if (p.type === 'image') content.push({ type: 'image_url', image_url: { url: p.url } });
        if (p.type === 'tool') calls.push({ id: p.id, type: 'function', function: { name: p.name, arguments: p.arguments } });
        if (p.type === 'result') result.push({ role: 'tool', tool_call_id: p.id, content: resultContent(p.content,protocol) });
        if (p.type === 'reasoning') {
          if (p.value.signature && reasoning.reasoning_signature) throw new ModelAccessError('model_reasoning_unsupported', '所选协议无法在同一条助手消息中保留多个独立推理签名。', 400);
          reasoning.reasoning_content = string(reasoning.reasoning_content) + string(p.value.thinking ?? p.value.text);
          if (p.value.signature) reasoning.reasoning_signature = p.value.signature;
        }
      }
      if (content.length || calls.length || Object.keys(reasoning).length) result.unshift({ role: message.role, content: content.length === 1 && content[0].type === 'text' ? content[0].text : content.length ? content : null, ...(calls.length ? { tool_calls: calls } : {}), ...reasoning });
      return result;
    });
    if (parsed.tools.length) body.tools = parsed.tools.map(tool => ({ type: 'function', function: tool }));
  } else if (protocol === 'anthropic-messages') {
    const system: ProtocolJson[] = [], messages: ProtocolJson[] = [];
    for (const message of parsed.messages) {
      const content = message.parts.map(p => {
        if (p.type === 'text') return { type: 'text', text: p.text };
        if (p.type === 'image') return anthropicImage(p.url);
        if (p.type === 'tool') return { type: 'tool_use', id: p.id, name: p.name, input: parseArguments(p.arguments) };
        if (p.type === 'result') return { type: 'tool_result', tool_use_id: p.id, content: resultContent(p.content,protocol) };
        return p.value.type==='responses-reasoning' ? {type:'redacted_thinking',data:opaque.encode(p.value)} : p.value;
      });
      if (message.role === 'system' || message.role === 'developer') system.push(...content);
      else { const role = message.role === 'assistant' ? 'assistant' : 'user'; const previous = messages.at(-1); if (previous?.role === role) previous.content = [...list(previous.content), ...content]; else messages.push({ role, content }); }
    }
    body.messages = messages; if (system.length) body.system = system;
    if (parsed.tools.length) body.tools = parsed.tools.map(tool => ({ name: tool.name, description: tool.description, input_schema: tool.parameters }));
    const choice = record(body.tool_choice);
    if (choice.type === 'function') body.tool_choice = { type: 'tool', name: record(choice.function).name };
    if (body.tool_choice === 'required') body.tool_choice = { type: 'any' };
    if (body.tool_choice === 'auto' || body.tool_choice === 'none') body.tool_choice = { type: body.tool_choice };
    if (body.max_tokens === undefined) body.max_tokens = 8192;
    if (body.reasoning_effort) { body.output_config = { effort: body.reasoning_effort }; delete body.reasoning_effort; }
    delete body.parallel_tool_calls;
  } else {
    const input: ProtocolJson[] = [];
    for (const message of parsed.messages) {
      let content: ProtocolJson[] = [];
      const flush = () => { if (content.length) input.push({ type: 'message', role: message.role, content }); content = []; };
      for (const p of message.parts) {
        if (p.type === 'text') content.push({ type: message.role === 'assistant' ? 'output_text' : 'input_text', text: p.text });
        else if (p.type === 'image') content.push({ type: 'input_image', image_url: p.url });
        else { flush(); if (p.type === 'tool') input.push(p.custom ? { type: 'custom_tool_call', call_id: p.id, name: p.name, input: string(record(parseArguments(p.arguments)).input) } : { type: 'function_call', call_id: p.id, name: p.name, arguments: p.arguments }); if (p.type === 'result') input.push({ type: 'function_call_output', call_id: p.id, output: resultContent(p.content,protocol) }); if (p.type === 'reasoning') input.push(p.value.type==='responses-reasoning' ? record(p.value.item) : { type: 'reasoning', summary: [], encrypted_content: opaque.encode(p.value) }); }
      }
      flush();
    }
    body.input = input;
    if (parsed.tools.length) body.tools = parsed.tools.map(tool => ({ type: 'function', ...tool }));
    if (body.max_tokens !== undefined) { body.max_output_tokens = body.max_tokens; delete body.max_tokens; }
    if (body.reasoning_effort) { body.reasoning = { effort: body.reasoning_effort }; delete body.reasoning_effort; }
  }
  return body;
}
export function translateRequest(body: ProtocolJson, from: ModelProtocol, to: ModelProtocol, opaque: OpaqueReasoning): ProtocolJson {
  if (from === to) return structuredClone(body);
  if (body.previous_response_id) throw new ModelAccessError('model_state_unsupported', '跨协议调用需要完整对话输入，不能仅引用其他服务的响应。', 400);
  return serializeRequest(parseRequest(body, from, opaque), to, opaque);
}

type ToolEvent = { type: 'tool'; key: string; id?: string; name?: string; nameDelta?: string; delta?: string; arguments?: string; complete?: boolean };
type Event = { type: 'text'; delta: string } | { type: 'reasoning'; delta?: string; signature?: string; opaque?: ProtocolJson } | ToolEvent | { type: 'usage'; input: number; output: number; cache?: number } | { type: 'finish'; reason: string };
const MAX_MODEL_STREAM_BUFFER_BYTES = 8 * 1024 * 1024;
function inconsistentTool(): never { throw new ModelAccessError('model_tool_stream_inconsistent', '模型工具调用的身份或完整参数与已接收内容不一致。', 502); }

/** A tool is executable data. Validate its complete identity and snapshots before
 * publishing it, retaining the source order of text and parallel calls. */
async function* decodeEvents(response: Response, protocol: ModelProtocol): AsyncGenerator<Event> {
  const tools = new Map<string, { item: ToolEvent; completeArguments?: string; completeName?: string }>();
  const identities = new Map<string, string>();
  let held: Event[] | undefined, heldBytes = 0;
  const reserve = (bytes: number) => { heldBytes += bytes; if (heldBytes > MAX_MODEL_STREAM_BUFFER_BYTES) throw new ModelAccessError('model_stream_too_large', '模型工具响应超过缓冲限制。', 502); };
  for await (const event of decodeRawEvents(response, protocol)) {
    if (event.type !== 'tool') { if (held) { reserve(Buffer.byteLength(JSON.stringify(event))); held.push(event); } else yield event; continue; }
    held ??= [];
    let tool = tools.get(event.key);
    if (!tool) { reserve(Buffer.byteLength(event.key) + 128); tool = { item: { type: 'tool', key: event.key, id: '', name: '', delta: '' } }; tools.set(event.key, tool); held.push(tool.item); }
    const item = tool.item;
    if (event.id) {
      if (item.id && item.id !== event.id || identities.has(event.id) && identities.get(event.id) !== event.key) inconsistentTool();
      reserve(Buffer.byteLength(event.id) - Buffer.byteLength(item.id!));
      item.id = event.id; identities.set(event.id, event.key);
    }
    if (event.name) {
      if (tool.completeName && tool.completeName !== event.name || !event.name.startsWith(item.name!)) inconsistentTool();
      reserve(Buffer.byteLength(event.name) - Buffer.byteLength(item.name!));
      item.name = event.name;
    }
    if (event.nameDelta) {
      if (tool.completeName) inconsistentTool();
      reserve(Buffer.byteLength(event.nameDelta));
      item.name += event.nameDelta;
    }
    if (event.delta) {
      if (tool.completeArguments !== undefined) inconsistentTool();
      reserve(Buffer.byteLength(event.delta));
      item.delta += event.delta;
    }
    if (event.arguments !== undefined) {
      if (tool.completeArguments !== undefined && tool.completeArguments !== event.arguments || !event.arguments.startsWith(item.delta!)) inconsistentTool();
      reserve(Buffer.byteLength(event.arguments) - Buffer.byteLength(item.delta!));
      item.delta = event.arguments;
      if (event.complete) tool.completeArguments = event.arguments;
    }
    if (event.complete && event.name) tool.completeName = event.name;
  }
  for (const { item } of tools.values()) {
    if (!item.id || !item.name) throw new ModelAccessError('model_tool_identity_incomplete', '模型工具调用缺少完整身份或名称。', 502);
    parseArguments(item.delta!);
  }
  if (held) yield* held;
}
async function* sse(body: ReadableStream<Uint8Array>): AsyncGenerator<ProtocolJson> {
  const reader = body.getReader(), decoder = new TextDecoder(); let buffer = '';
  try {
    while (true) {
      const chunk = await reader.read(); buffer += decoder.decode(chunk.value, { stream: !chunk.done }).replaceAll('\r\n', '\n');
      let at: number;
      while ((at = buffer.indexOf('\n\n')) >= 0) { const frame = buffer.slice(0, at); buffer = buffer.slice(at + 2); const data = frame.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n'); if (!data || data === '[DONE]') continue; let value: unknown; try { value = JSON.parse(data); } catch { throw new ModelAccessError('model_stream_invalid', '模型流返回了无效数据。', 502); } yield record(value); }
      if (chunk.done) break;
      if (Buffer.byteLength(buffer) > MAX_MODEL_STREAM_BUFFER_BYTES) throw new ModelAccessError('model_stream_too_large', '模型单个流事件超过限制。', 502);
    }
    if (buffer.trim() && !buffer.trim().startsWith(':')) throw new ModelAccessError('model_stream_incomplete', '模型流在事件结束前断开。', 502);
  } finally { reader.releaseLock(); }
}
async function* decodeRawEvents(response: Response, protocol: ModelProtocol): AsyncGenerator<Event> {
  const streaming = response.headers.get('content-type')?.includes('text/event-stream');
  const anthropicTools = new Map<string, { explicitEmptyInput: boolean; hasJsonDelta: boolean }>();
  let finished = false;
  if (!streaming) {
    const body = record(await response.json());
    if (body.error) throw upstreamFailure(body.error, response.status >= 400 ? response.status : 502);
    if (protocol === 'chat-completions') {
      const choice = record(list(body.choices)[0]), message = record(choice.message);
      if (message.reasoning_content||message.reasoning_signature) yield { type: 'reasoning', delta: string(message.reasoning_content), signature: string(message.reasoning_signature) };
      if (message.content) yield { type: 'text', delta: string(message.content) };
      for (const [index, v] of list(message.tool_calls).entries()) { const call = record(v), fn = record(call.function); yield { type: 'tool', key: String(index), id: string(call.id), name: string(fn.name), delta: string(fn.arguments) }; }
      const usage = record(body.usage); yield { type: 'usage', input: number(usage.prompt_tokens), output: number(usage.completion_tokens) };
      yield { type: 'finish', reason: string(choice.finish_reason) || 'stop' };
    } else if (protocol === 'anthropic-messages') {
      for (const [index, raw] of list(body.content).entries()) { const part = record(raw); if (part.type === 'text') yield { type: 'text', delta: string(part.text) }; else if (part.type === 'tool_use') yield { type: 'tool', key: String(index), id: string(part.id), name: string(part.name), delta: JSON.stringify(part.input ?? {}) }; else if (part.type === 'thinking' || part.type === 'redacted_thinking') yield { type: 'reasoning', opaque: part }; }
      const usage = record(body.usage); yield { type: 'usage', input: number(usage.input_tokens), output: number(usage.output_tokens), cache: number(usage.cache_read_input_tokens) };
      yield { type: 'finish', reason: string(body.stop_reason) || 'end_turn' };
    } else {
      for (const raw of list(body.output)) { const part = record(raw); if (part.type === 'message') for (const p of list(part.content)) { const content = record(p); if (content.type === 'output_text') yield { type: 'text', delta: string(content.text) }; } else if (part.type === 'function_call') yield { type: 'tool', key: string(part.id), id: string(part.call_id), name: string(part.name), delta: string(part.arguments) }; else if (part.type === 'reasoning') yield { type: 'reasoning', opaque: { type: 'responses-reasoning', item: part } }; }
      const usage = record(body.usage); yield { type: 'usage', input: number(usage.input_tokens), output: number(usage.output_tokens) }; yield { type: 'finish', reason: body.status === 'incomplete' ? 'length' : 'stop' };
    }
    return;
  }
  if (!response.body) throw new ModelAccessError('model_stream_empty', '模型流没有响应正文。', 502);
  for await (const body of sse(response.body)) {
    if (body.error || body.type === 'error' || body.type === 'response.failed') throw upstreamFailure(body.error ?? record(body.response).error);
    if (protocol === 'chat-completions') {
      const choice = record(list(body.choices)[0]), delta = record(choice.delta);
      if (delta.content) yield { type: 'text', delta: string(delta.content) };
      if (delta.reasoning_content || delta.reasoning_signature) yield { type: 'reasoning', delta: string(delta.reasoning_content), signature: string(delta.reasoning_signature) };
      for (const raw of list(delta.tool_calls)) { const call = record(raw), fn = record(call.function); yield { type: 'tool', key: String(call.index ?? 0), id: string(call.id) || undefined, nameDelta: string(fn.name) || undefined, delta: string(fn.arguments) }; }
      if (body.usage) { const u = record(body.usage); yield { type: 'usage', input: number(u.prompt_tokens), output: number(u.completion_tokens), cache: number(record(u.prompt_tokens_details).cached_tokens) }; }
      if (choice.finish_reason) { finished = true; yield { type: 'finish', reason: string(choice.finish_reason) }; }
    } else if (protocol === 'anthropic-messages') {
      if (body.type === 'message_start') { const u = record(record(body.message).usage); yield { type: 'usage', input: number(u.input_tokens), output: number(u.output_tokens), cache: number(u.cache_read_input_tokens) }; }
      if (body.type === 'content_block_start') {
        const p = record(body.content_block);
        if (p.type === 'tool_use') {
          anthropicTools.set(String(body.index), { explicitEmptyInput: p.input !== null && typeof p.input === 'object' && !Array.isArray(p.input) && Object.keys(record(p.input)).length === 0, hasJsonDelta: false });
          yield { type: 'tool', key: String(body.index), id: string(p.id), name: string(p.name), ...(Object.keys(record(p.input)).length ? { delta: JSON.stringify(p.input) } : {}) };
        }
        if (p.type === 'thinking' || p.type === 'redacted_thinking') yield { type: 'reasoning', opaque: p };
        if (p.type === 'text' && p.text) yield { type: 'text', delta: string(p.text) };
      }
      if (body.type === 'content_block_delta') {
        const d = record(body.delta);
        if (d.type === 'text_delta') yield { type: 'text', delta: string(d.text) };
        if (d.type === 'input_json_delta') {
          const tool = anthropicTools.get(String(body.index)); if (tool && string(d.partial_json)) tool.hasJsonDelta = true;
          yield { type: 'tool', key: String(body.index), delta: string(d.partial_json) };
        }
        if (d.type === 'thinking_delta') yield { type: 'reasoning', delta: string(d.thinking) };
        if (d.type === 'signature_delta') yield { type: 'reasoning', signature: string(d.signature) };
      }
      if (body.type === 'content_block_stop') {
        const key = String(body.index), tool = anthropicTools.get(key);
        // An explicit empty input is also the streaming placeholder. Only the
        // closed block with no JSON deltas proves an actual no-argument call.
        if (tool?.explicitEmptyInput && !tool.hasJsonDelta) yield { type: 'tool', key, arguments: '{}', complete: true };
        anthropicTools.delete(key);
      }
      if (body.type === 'message_delta') { const u = record(body.usage); yield { type: 'usage', input: number(u.input_tokens), output: number(u.output_tokens) }; if (record(body.delta).stop_reason) yield { type: 'finish', reason: string(record(body.delta).stop_reason) }; }
      if (body.type === 'message_stop') finished = true;
    } else {
      if (body.type === 'response.output_text.delta') yield { type: 'text', delta: string(body.delta) };
      if (body.type === 'response.output_item.added') { const item = record(body.item); if (item.type === 'function_call') yield { type: 'tool', key: string(item.id) || String(body.output_index), id: string(item.call_id), name: string(item.name), ...(typeof item.arguments === 'string' && item.arguments ? { arguments: item.arguments } : {}) }; }
      if (body.type === 'response.function_call_arguments.delta') yield { type: 'tool', key: string(body.item_id) || String(body.output_index), delta: string(body.delta) };
      if (body.type === 'response.function_call_arguments.done') yield { type: 'tool', key: string(body.item_id) || String(body.output_index), ...(typeof body.arguments === 'string' ? { arguments: body.arguments } : {}), complete: true };
      if (body.type === 'response.output_item.done' && record(body.item).type === 'function_call') { const item = record(body.item); yield { type: 'tool', key: string(item.id) || String(body.output_index), id: string(item.call_id), name: string(item.name), ...(typeof item.arguments === 'string' ? { arguments: item.arguments } : {}), complete: true }; }
      if (body.type === 'response.output_item.done' && record(body.item).type === 'reasoning') yield { type: 'reasoning', opaque: { type: 'responses-reasoning', item: body.item } };
      if (body.type === 'response.completed' || body.type === 'response.incomplete') { const r = record(body.response), u = record(r.usage); for (const [index, raw] of list(r.output).entries()) { const item = record(raw); if (item.type === 'function_call') yield { type: 'tool', key: string(item.id) || String(index), id: string(item.call_id), name: string(item.name), ...(typeof item.arguments === 'string' ? { arguments: item.arguments } : {}), complete: true }; } yield { type: 'usage', input: number(u.input_tokens), output: number(u.output_tokens) }; finished = true; yield { type: 'finish', reason: body.type === 'response.incomplete' ? 'length' : 'stop' }; }
    }
  }
  if (!finished) throw new ModelAccessError('model_stream_incomplete', '模型流结束但没有完成标记。', 502);
}

interface CollectedTool { id: string; name: string; arguments: string; outputIndex: number }
class Output {
  readonly responseId = `resp_${id()}`;
  readonly messageId = `msg_${id()}`;
  readonly reasoningId = `rs_${id()}`;
  readonly tools = new Map<string, CollectedTool>();
  text = ''; reasoning: ProtocolJson = {}; usage = { input: 0, output: 0, cache: 0 }; reason = 'stop';
  private sequence = 0;
  private contentIndex = 0;
  private messageIndex?: number;
  private reasoningIndex?: number;
  private lastKind?: 'text' | 'tool' | 'reasoning';
  private readonly messages: Array<{index:number;id:string;text:string}> = [];
  private readonly reasoningBlocks: Array<{index:number;id:string;value:ProtocolJson}> = [];
  private openBlock?: number;
  private readonly emittedTools=new Set<string>();
  readonly protocol: ModelProtocol;
  readonly model: string;
  readonly opaque: OpaqueReasoning;
  readonly customTools: Set<string>;
  private readonly bindings:Map<string,ToolBinding>;
  constructor(protocol: ModelProtocol, model: string, opaque: OpaqueReasoning, customTools: Set<string>,bindings:Map<string,ToolBinding>) { this.protocol = protocol; this.model = model; this.opaque = opaque; this.customTools = customTools;this.bindings=bindings; }
  private event(type: string, data: ProtocolJson): string { return `event: ${type}\ndata: ${JSON.stringify({ type, ...data, ...(this.protocol === 'responses' ? { sequence_number: this.sequence++ } : {}) })}\n\n`; }
  private chat(delta: ProtocolJson, finishReason: string | null = null, usage?: ProtocolJson): string { return `data: ${JSON.stringify({ id: this.responseId, object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model: this.model, choices: [{ index: 0, delta, finish_reason: finishReason }], ...(usage ? { usage } : {}) })}\n\n`; }
  private closeBlock():string { if(this.protocol!=='anthropic-messages'||this.openBlock===undefined)return '';const index=this.openBlock;this.openBlock=undefined;return this.event('content_block_stop',{index}); }
  private flushTools():string {
    if(this.protocol!=='anthropic-messages')return '';
    let result='';
    for(const [key,tool] of this.tools) if(!this.emittedTools.has(key)) {
      parseArguments(tool.arguments||'{}');
      result+=this.event('content_block_start',{index:tool.outputIndex,content_block:{type:'tool_use',id:tool.id,name:tool.name,input:{}}});
      result+=this.event('content_block_delta',{index:tool.outputIndex,delta:{type:'input_json_delta',partial_json:tool.arguments||'{}'}});
      result+=this.event('content_block_stop',{index:tool.outputIndex});this.emittedTools.add(key);
    }
    return result;
  }
  start(): string {
    if (this.protocol === 'chat-completions') return this.chat({ role: 'assistant' });
    if (this.protocol === 'anthropic-messages') return this.event('message_start', { message: { id: this.messageId, type: 'message', role: 'assistant', model: this.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 } } });
    return this.event('response.created', { response: { id: this.responseId, object: 'response', status: 'in_progress', model: this.model, output: [] } }) + this.event('response.in_progress', { response: { id: this.responseId, object: 'response', status: 'in_progress', model: this.model, output: [] } });
  }
  accept(value: Event): string {
    if (value.type === 'usage') { this.usage.input = value.input || this.usage.input; this.usage.output = value.output || this.usage.output; this.usage.cache = value.cache || this.usage.cache; return ''; }
    if (value.type === 'finish') { this.reason = value.reason; return ''; }
    if (value.type === 'reasoning') {
      const fresh=this.lastKind!=='reasoning';
      if (fresh) { this.reasoningBlocks.push({index:this.contentIndex++,id:`rs_${id()}`,value:{}}); this.messageIndex=undefined; }
      this.lastKind='reasoning'; const block=this.reasoningBlocks.at(-1)!;
      block.value = { ...block.value, ...value.opaque, type: value.opaque?.type ?? block.value.type ?? 'thinking', thinking: string(block.value.thinking) + (value.delta ?? ''), ...(value.signature ? { signature: string(block.value.signature) + value.signature } : {}) };
      this.reasoning = block.value;
      if (this.protocol === 'chat-completions') return this.chat({ ...(value.delta ? { reasoning_content: value.delta } : {}), ...(value.signature ? { reasoning_signature: value.signature } : {}), ...(value.opaque ? {reasoning_signature:this.opaque.encode(block.value)} : {}) });
      if(this.protocol==='anthropic-messages') {
        const first=fresh;
        let result=first?this.closeBlock()+this.flushTools():'';
        if(first) {this.openBlock=block.index;result+=this.event('content_block_start',{index:block.index,content_block:block.value.type==='responses-reasoning'?{type:'redacted_thinking',data:this.opaque.encode(block.value)}:{type:'thinking',thinking:''}});}
        if(value.delta) result+=this.event('content_block_delta',{index:block.index,delta:{type:'thinking_delta',thinking:value.delta}});
        if(value.signature) result+=this.event('content_block_delta',{index:block.index,delta:{type:'signature_delta',signature:value.signature}});
        return result;
      }
      return '';
    }
    if (value.type === 'text') {
      let out = ''; this.text += value.delta;
      if (this.protocol === 'chat-completions') return this.chat({ content: value.delta });
      if (this.lastKind !== 'text' || this.messageIndex === undefined) { this.messageIndex = this.contentIndex++; this.messages.push({index:this.messageIndex,id:`msg_${id()}`,text:''}); const message=this.messages.at(-1)!; out = this.protocol === 'responses' ? this.event('response.output_item.added', { output_index: this.messageIndex, item: { id: message.id, type: 'message', role: 'assistant', status: 'in_progress', content: [] } }) + this.event('response.content_part.added', { item_id: message.id, output_index: this.messageIndex, content_index: 0, part: { type: 'output_text', text: '', annotations: [] } }) : this.closeBlock()+this.flushTools()+this.event('content_block_start', { index: this.messageIndex, content_block: { type: 'text', text: '' } }); if(this.protocol==='anthropic-messages')this.openBlock=this.messageIndex; }
      this.lastKind='text'; const message=this.messages.at(-1)!; message.text+=value.delta;
      return out + (this.protocol === 'responses' ? this.event('response.output_text.delta', { item_id: message.id, output_index: this.messageIndex, content_index: 0, delta: value.delta }) : this.event('content_block_delta', { index: this.messageIndex, delta: { type: 'text_delta', text: value.delta } }));
    }
    let tool = this.tools.get(value.key), out = this.closeBlock();
    if(this.protocol==='anthropic-messages'&&this.emittedTools.has(value.key)) throw new ModelAccessError('model_tool_stream_order_invalid','上游工具流在内容块结束后继续修改参数。',502);
    this.lastKind='tool'; this.messageIndex=undefined;
    if (!tool) {
      tool = { id: value.id || `call_${id()}`, name: value.name || '', arguments: '', outputIndex: this.contentIndex++ }; this.tools.set(value.key, tool);
      if (this.protocol === 'chat-completions') out = this.chat({ tool_calls: [{ index: this.tools.size - 1, id: tool.id, type: 'function', function: { name: tool.name, arguments: '' } }] });
      else if (this.protocol === 'anthropic-messages') { /* Parallel tool deltas are buffered until a valid complete block can be emitted. */ }
      else out = this.event('response.output_item.added', { output_index: tool.outputIndex, item: this.toolItem(tool, 'in_progress') });
    }
    if (value.name && !tool.name) tool.name = value.name;
    if (value.delta) {
      tool.arguments += value.delta;
      if (this.protocol === 'chat-completions') out += this.chat({ tool_calls: [{ index: [...this.tools.keys()].indexOf(value.key), function: { arguments: value.delta } }] });
      else if (this.protocol === 'anthropic-messages') { /* See the complete block flush above. */ }
      else if (!this.customTools.has(tool.name)) out += this.event('response.function_call_arguments.delta', { item_id: `fc_${tool.id}`, output_index: tool.outputIndex, delta: value.delta });
    }
    return out;
  }
  private toolItem(tool: CollectedTool, status = 'completed'): ProtocolJson {
    const binding=this.bindings.get(tool.name),name=binding?.name??tool.name,namespace=binding?.namespace;
    const common={id:`fc_${tool.id}`,call_id:tool.id,name,...(namespace?{namespace}:{}),status};
    return this.customTools.has(tool.name)||binding?.custom ? {...common,type:'custom_tool_call',input:status==='completed'?string(record(parseArguments(tool.arguments||'{}')).input):''} : {...common,type:'function_call',arguments:tool.arguments};
  }
  private responsesOutput(): ProtocolJson[] {
    const output: Array<{ index: number; item: ProtocolJson }> = [];
    for(const message of this.messages) output.push({index:message.index,item:{id:message.id,type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:message.text,annotations:[]}]}});
    for (const tool of this.tools.values()) output.push({ index: tool.outputIndex, item: this.toolItem(tool) });
    for(const block of this.reasoningBlocks) output.push({index:block.index,item:{id:block.id,type:'reasoning',summary:[],encrypted_content:this.opaque.encode(block.value)}});
    return output.sort((a,b) => a.index - b.index).map(value => value.item);
  }
  json(): ProtocolJson {
    if (this.protocol === 'responses') return { id: this.responseId, object: 'response', status: this.reason === 'length' ? 'incomplete' : 'completed', model: this.model, output: this.responsesOutput(), usage: { input_tokens: this.usage.input, output_tokens: this.usage.output, total_tokens: this.usage.input + this.usage.output } };
    if (this.protocol === 'chat-completions') return { id: this.responseId, object: 'chat.completion', model: this.model, choices: [{ index: 0, message: { role: 'assistant', content: this.text || null, ...(this.tools.size ? { tool_calls: [...this.tools.values()].map(tool => ({ id: tool.id, type: 'function', function: { name: tool.name, arguments: tool.arguments } })) } : {}), ...(Object.keys(this.reasoning).length ? { reasoning_content: this.reasoning.thinking ?? '', reasoning_signature: this.reasoning.type==='responses-reasoning' ? this.opaque.encode(this.reasoning) : this.reasoning.signature } : {}) }, finish_reason: this.tools.size ? 'tool_calls' : this.reason === 'length' || this.reason === 'max_tokens' ? 'length' : 'stop' }], usage: { prompt_tokens: this.usage.input, completion_tokens: this.usage.output, total_tokens: this.usage.input + this.usage.output } };
    const ordered:Array<{index:number;part:ProtocolJson}>=[];
    for(const block of this.reasoningBlocks) ordered.push({index:block.index,part:block.value.type==='responses-reasoning'?{type:'redacted_thinking',data:this.opaque.encode(block.value)}:block.value});
    for(const message of this.messages) ordered.push({index:message.index,part:{type:'text',text:message.text}});
    for(const tool of this.tools.values()) ordered.push({index:tool.outputIndex,part:{type:'tool_use',id:tool.id,name:tool.name,input:parseArguments(tool.arguments||'{}')}});
    const content=ordered.sort((a,b)=>a.index-b.index).map(value=>value.part);
    return { id: this.messageId, type: 'message', role: 'assistant', model: this.model, content, stop_reason: this.tools.size ? 'tool_use' : this.reason === 'length' || this.reason === 'max_tokens' ? 'max_tokens' : 'end_turn', stop_sequence: null, usage: { input_tokens: this.usage.input, output_tokens: this.usage.output } };
  }
  finish(): string {
    if (this.protocol === 'chat-completions') return this.chat({}, this.tools.size ? 'tool_calls' : this.reason === 'length' || this.reason === 'max_tokens' ? 'length' : 'stop', record(this.json().usage)) + 'data: [DONE]\n\n';
    if (this.protocol === 'anthropic-messages') { const out=this.closeBlock()+this.flushTools(); return out + this.event('message_delta', { delta: { stop_reason: this.tools.size ? 'tool_use' : this.reason === 'length' || this.reason === 'max_tokens' ? 'max_tokens' : 'end_turn', stop_sequence: null }, usage: { input_tokens: this.usage.input, output_tokens: this.usage.output } }) + this.event('message_stop', {}); }
    let out = ''; const body = this.json();
    for (const item of list(body.output)) {
      const value = record(item), message=this.messages.find(message=>message.id===value.id), index = value.type === 'message' ? message?.index : value.type === 'reasoning' ? this.reasoningBlocks.find(block=>block.id===value.id)?.index : [...this.tools.values()].find(tool => `fc_${tool.id}` === value.id)?.outputIndex;
      if (value.type === 'reasoning') out += this.event('response.output_item.added', { output_index: index, item: { ...value, encrypted_content: undefined } });
      if (value.type === 'function_call') out += this.event('response.function_call_arguments.done', { item_id: value.id, output_index: index, arguments: value.arguments });
      if (value.type === 'custom_tool_call') out += this.event('response.custom_tool_call_input.delta', { item_id: value.id, output_index: index, delta: value.input }) + this.event('response.custom_tool_call_input.done', { item_id: value.id, output_index: index, input: value.input });
      if (value.type === 'message') out += this.event('response.output_text.done', { item_id: value.id, output_index: index, content_index: 0, text: message?.text??'' }) + this.event('response.content_part.done', { item_id: value.id, output_index: index, content_index: 0, part: list(value.content)[0] });
      out += this.event('response.output_item.done', { output_index: index, item: value });
    }
    return out + this.event(body.status === 'incomplete' ? 'response.incomplete' : 'response.completed', { response: body });
  }
  error(cause: unknown): string { const error = modelFailure(cause); return this.protocol === 'responses' ? this.event('response.failed', { response: { id: this.responseId, object: 'response', status: 'failed', error } }) : this.protocol === 'anthropic-messages' ? this.event('error', { error: { type: 'api_error', ...error } }) : `data: ${JSON.stringify({ error })}\n\n`; }
}
export async function translateResponse(response: Response, from: ModelProtocol, to: ModelProtocol, options: { model: string; stream: boolean; request: ProtocolJson; opaque: OpaqueReasoning; signal: AbortSignal }): Promise<Response> {
  if (from === to) return response;
  const bindings=to==='responses'?toolBindings(options.request):new Map<string,ToolBinding>();
  const customTools = new Set([...bindings].filter(([,binding])=>binding.custom).map(([wireName])=>wireName));
  const output = new Output(to, options.model, options.opaque, customTools,bindings);
  if (!options.stream) { for await (const value of decodeEvents(response, from)) output.accept(value); return Response.json(output.json()); }
  const encoder = new TextEncoder(), iterator = decodeEvents(response, from)[Symbol.asyncIterator](); let started = false, ended = false;
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (options.signal.aborted) { ended = true; await iterator.return?.(undefined); controller.error(new Error('model_request_cancelled')); return; }
      if (!started) { started = true; controller.enqueue(encoder.encode(output.start())); return; }
      try { while (!ended) { const next = await iterator.next(); if (next.done) { ended = true; controller.enqueue(encoder.encode(output.finish())); controller.close(); return; } const frame = output.accept(next.value); if (frame) { controller.enqueue(encoder.encode(frame)); return; } } }
      catch (error) { ended = true; controller.enqueue(encoder.encode(output.error(error))); controller.close(); }
    },
    async cancel() { ended = true; await iterator.return?.(undefined); },
  });
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store' } });
}
