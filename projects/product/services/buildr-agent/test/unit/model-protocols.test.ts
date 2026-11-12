import test from 'node:test';

import assert from 'node:assert/strict';

import { translateRequest, translateResponse, type OpaqueReasoning } from '../../src/model-access/protocols.ts';
import { guardToolArgumentStream } from '../../src/model-access/tool-stream-guard.ts';

import type { ModelProtocol, ProtocolJson } from '../../src/model-access/contracts.ts';

const opaque: OpaqueReasoning = { encode: value => 'buildr-v1.' + JSON.stringify(value), decode: value => JSON.parse(value.slice('buildr-v1.'.length)) };
const sse = (events: unknown[]) => new Response(events.map(event => 'data: ' + JSON.stringify(event) + '\n\n').join(''), { headers: { 'content-type': 'text/event-stream' } });
const response = (body: ProtocolJson) => Response.json(body);
const translate = (upstream: Response, from: ModelProtocol, to: ModelProtocol, stream = false) => translateResponse(upstream, from, to, { model: 'route-model', stream, request: {}, opaque, signal: new AbortController().signal });

test('Gemini request conversion builds contents, system instruction, tools and generation config', () => {
  const request: ProtocolJson = {
    model: 'gemini-2.5-pro', stream: true, temperature: 0.2, top_p: 0.9, max_output_tokens: 128, stop: ['END'],
    reasoning: { effort: 'high' }, tool_choice: { type: 'function', function: { name: 'read_file' } },
    messages: [
      { role: 'system', content: 'Be brief' },
      { role: 'user', content: [{ type: 'text', text: 'look' }, { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } }] },
      { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'read_file', arguments: '{"path":"a.txt"}' } }] },
      { role: 'tool', tool_call_id: 'call_1', content: 'contents' },
      { role: 'user', content: 'next' },
    ],
    tools: [{ type: 'function', function: { name: 'read_file', description: 'Read a file', parameters: { type: 'object', properties: { path: { type: 'string' }, tags: { type: 'array', items: { type: 'string' } } }, required: ['path'], additionalProperties: false } } }],
  };
  const original = structuredClone(request);
  assert.deepEqual(translateRequest(request, 'chat-completions', 'gemini', opaque), {
    stream: true,
    contents: [
      { role: 'user', parts: [{ text: 'look' }, { inlineData: { mimeType: 'image/png', data: 'AAAA' } }] },
      { role: 'model', parts: [{ functionCall: { name: 'read_file', args: { path: 'a.txt' } } }] },
      { role: 'user', parts: [{ functionResponse: { name: 'read_file', response: { result: 'contents' }, id: 'call_1' } }, { text: 'next' }] },
    ],
    systemInstruction: { parts: [{ text: 'Be brief' }] },
    tools: [{ functionDeclarations: [{ name: 'read_file', description: 'Read a file', parameters: { type: 'OBJECT', properties: { path: { type: 'STRING' }, tags: { type: 'ARRAY', items: { type: 'STRING' } } }, required: ['path'], additionalProperties: false } }] }],
    generationConfig: { temperature: 0.2, topP: 0.9, maxOutputTokens: 128, stopSequences: ['END'] },
    toolConfig: { functionCallingConfig: { mode: 'ANY', allowedFunctionNames: ['read_file'] } },
  });
  assert.deepEqual(request, original);
  for (const choice of ['auto', 'none', 'required'] as const) {
    const mode = translateRequest({ ...request, tool_choice: choice }, 'chat-completions', 'gemini', opaque).toolConfig;
    assert.deepEqual(mode, { functionCallingConfig: { mode: choice === 'auto' ? 'AUTO' : choice === 'none' ? 'NONE' : 'ANY' } });
  }
  assert.equal('toolConfig' in translateRequest({ ...request, tool_choice: undefined }, 'chat-completions', 'gemini', opaque), false);
});

test('Gemini request conversion rejects remote images and unresolved tool results instead of guessing', () => {
  const base: ProtocolJson = { model: 'gemini-2.5-pro', messages: [{ role: 'user', content: [{ type: 'image_url', image_url: { url: 'https://example.com/a.png' } }] }] };
  assert.throws(() => translateRequest(base, 'chat-completions', 'gemini', opaque), (error: any) => error.code === 'model_content_unsupported');
  assert.throws(() => translateRequest({ model: 'm', messages: [{ role: 'tool', tool_call_id: 'missing', content: 'value' }] }, 'chat-completions', 'gemini', opaque), (error: any) => error.code === 'model_tool_result_unsupported');
  assert.throws(() => translateRequest({ model: 'm', messages: [{ role: 'tool', tool_call_id: 'missing', content: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } }] }] }, 'chat-completions', 'gemini', opaque), (error: any) => error.code === 'model_tool_result_unsupported');
});

test('Gemini responses decode text, thoughts, tool calls, usage and finish reasons', async () => {
  const decoded = await (await translate(response({
    candidates: [{ content: { parts: [{ text: 'I think', thought: true }, { text: 'Hello ' }, { text: 'world' }, { functionCall: { name: 'read_file', args: { path: 'a' } } }], role: 'model' }, finishReason: 'STOP' }],
    usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, cachedContentTokenCount: 2 },
  }), 'gemini', 'chat-completions')).json() as any;
  const choice = decoded.choices[0];
  assert.equal(choice.message.reasoning_content, 'I think');
  assert.equal(choice.message.content, 'Hello world');
  assert.equal(choice.message.tool_calls[0].function.name, 'read_file');
  assert.equal(choice.message.tool_calls[0].function.arguments, '{"path":"a"}');
  assert.match(choice.message.tool_calls[0].id, /^call_[a-f0-9]{32}$/);
  assert.equal(choice.finish_reason, 'tool_calls');
  assert.deepEqual(decoded.usage, { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 });
  const truncated = await (await translate(response({ candidates: [{ content: { parts: [{ text: 'partial' }] }, finishReason: 'MAX_TOKENS' }] }), 'gemini', 'chat-completions')).json() as any;
  assert.equal(truncated.choices[0].finish_reason, 'length');
});

test('Gemini streams translate text, thoughts, parallel tool calls, usage and completion', async () => {
  const translated = await translate(sse([
    { candidates: [{ content: { parts: [{ text: 'think', thought: true }] } }] },
    { candidates: [{ content: { parts: [{ text: 'hi' }] } }] },
    { candidates: [{ content: { parts: [{ functionCall: { name: 'read_file', args: { path: 'a' } } }, { functionCall: { name: 'list_dir', args: { path: '.' } } }] } }] },
    { candidates: [{ content: { parts: [] }, finishReason: 'SAFETY' }], usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 2 } },
  ]), 'gemini', 'chat-completions', true);
  assert.ok(translated.headers.get('content-type')?.includes('text/event-stream'));
  const frames = (await translated.text()).split('\n\n').map(frame => frame.replace(/^data: /, '')).filter(frame => frame && frame !== '[DONE]').map(frame => JSON.parse(frame));
  const deltas = frames.flatMap(frame => frame.choices?.map((choice: ProtocolJson) => choice.delta) ?? []);
  assert.ok(deltas.some(delta => delta.reasoning_content === 'think'));
  assert.ok(deltas.some(delta => delta.content === 'hi'));
  assert.deepEqual(deltas.flatMap(delta => delta.tool_calls ?? []).map((call: ProtocolJson) => call.function?.name).filter(Boolean), ['read_file', 'list_dir']);
  assert.ok(frames.some(frame => frame.usage?.prompt_tokens === 3));
  assert.ok(frames.some(frame => frame.choices?.[0]?.finish_reason === 'tool_calls'));
});

test('Gemini failures surface as protocol errors instead of silent completions', async () => {
  await assert.rejects(translate(response({ candidates: [{ content: { parts: [{ executableCode: { language: 'PYTHON', code: 'x' } }] } }] }), 'gemini', 'chat-completions'), (error: any) => error.code === 'model_content_unsupported');
  await assert.rejects(translate(response({ candidates: [{ content: { parts: [{ functionCall: { args: {} } }] } }] }), 'gemini', 'chat-completions'), (error: any) => error.code === 'model_tool_invalid');
  const incomplete = await translate(sse([{ candidates: [{ content: { parts: [{ text: 'partial' }] } }] }]), 'gemini', 'chat-completions', true);
  assert.match(await incomplete.text(), /model_stream_incomplete/);
  await assert.rejects(translate(response({ candidates: [] }), 'chat-completions', 'gemini'), (error: any) => error.code === 'model_protocol_unsupported');
});

test('Gemini tool argument guards bound stalled whitespace and leave valid streams intact', async () => {
  const valid = sse([{ candidates: [{ content: { parts: [{ functionCall: { name: 'read_file', args: { path: 'a' } } }] }, finishReason: 'STOP' }] }]);
  const validBytes = Buffer.from(await valid.arrayBuffer());
  const passed = guardToolArgumentStream(new Response(validBytes, { headers: { 'content-type': 'text/event-stream' } }), 'gemini', () => assert.fail('valid Gemini stream was rejected'));
  assert.deepEqual(Buffer.from(await passed.arrayBuffer()), validBytes);
  let failure: any;
  const stalled = guardToolArgumentStream(sse([{ candidates: [{ content: { parts: [{ functionCall: { name: 'read_file', args: { input: ' '.repeat(33 * 1024) } } }] } }] }]), 'gemini', error => { failure = error; });
  const text = await stalled.text();
  assert.equal(failure?.code, 'model_tool_arguments_stalled');
  assert.match(text, /model_tool_arguments_stalled/);
});
