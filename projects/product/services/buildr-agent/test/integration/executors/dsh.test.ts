import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { DshRuntime } from '../../../build/executors/dsh/index.js';
import type { AgentRuntime, ExecutorEvent } from '../../../src/contracts.ts';

class Stream {
  private values: any[] = []; private waiting?: (value: IteratorResult<any>) => void; private closed = false;
  push(value: any) { if (this.waiting) { const wait = this.waiting; this.waiting = undefined; wait({ done: false, value }); } else this.values.push(value); }
  async next(): Promise<IteratorResult<any>> { if (this.values.length) return { done: false, value: this.values.shift() }; if (this.closed) return { done: true, value: undefined }; return await new Promise(resolve => { this.waiting = resolve; }); }
  [Symbol.asyncIterator]() { return this; }
  async dispose() { this.closed = true; this.waiting?.({ done: true, value: undefined }); this.waiting = undefined; }
}
async function eventually(condition: () => unknown) { const deadline = Date.now() + 1000; while (!condition()) { if (Date.now() > deadline) throw new Error('condition timeout'); await new Promise(resolve => setTimeout(resolve, 5)); } }
test('DSH stream shows accumulated text, answers the native question and observes cancellation', async () => {
  const root=await mkdtemp(join(tmpdir(),'buildr-dsh-image-'));const imagePath=join(root,'image.png');const imageBytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5EsAAAAASUVORK5CYII=','base64');await writeFile(imagePath,imageBytes);
  let runtime: AgentRuntime; let nativeAnswer: any;
  const streams: Stream[] = []; const events: any[] = []; const ok = (value: any) => ({ ok: true, value }); let cwd = '/synthetic/workspace';
  const publish = (event: any) => { event.seq = events.length + 1; events.push(event); for (const stream of streams) stream.push({ type: 'event', event }); };
  let selectedPermission = 'workspace-write';
  const remote = { permissionPresets: { catalog: async () => ok({ defaultPreset: 'workspace-write', options: [{ value: 'workspace-write' }, { value: 'danger-full-access' }] }) }, commands: { list: async () => ok([{ name: 'permission', definitionId: '@deepseek-ai/dsh-permission-presets' }]), execute: async (_id: string, line: string) => { selectedPermission = line.slice('/permission '.length); return ok({ result: { kind: 'success' } }); } }, session: {
    create: async (input: any) => { cwd = input.cwd; return ok({ sessionId: 'native-dsh' }); },
    follow: () => { const stream = new Stream(); streams.push(stream); stream.push({ type: 'snapshot', header: { id: 'native-dsh', cwd }, cursor: events.length, records: events.map(event => ({ event })), projections: { values: { permissions: { currentValue: selectedPermission } } } }); return stream; },
    page: async () => ok({ records: events.map(event => ({ event })), hasMore: false }),
    prompt: async (input: any) => {const image=input.content.find((part:any)=>part.type==='image');assert.equal(image.mediaType,'image/png');assert.equal(image.data,imageBytes.toString('base64')); setTimeout(() => {
      publish({ type: 'turn/start', data: { turn: 1 } }); publish({ type: 'user/message', data: { id: 'user-dsh', content: input.content, source: { rpcId: input.requestId } } });
      for (const stream of streams) { stream.push({ type: 'assistant-stream', frame: { type: 'start', attemptId: 'a1', turn: 1, step: 1 } }); stream.push({ type: 'assistant-stream', frame: { type: 'chunk', attemptId: 'a1', index: 0, chunk: { type: 'text-delta', text: '正在' } } }); stream.push({ type: 'assistant-stream', frame: { type: 'chunk', attemptId: 'a1', index: 1, chunk: { type: 'reasoning-delta', text: 'private reasoning' } } }); stream.push({ type: 'assistant-stream', frame: { type: 'chunk', attemptId: 'a1', index: 2, chunk: { type: 'text-delta', text: '处理' } } }); }
      publish({ type: 'assistant/message', data: { turn: 1, step: 1, message: { content: [{ type: 'text', text: '正在处理' }] } } });
      publish({ type: 'tool/call', data: { turn: 1, callId: 'question-dsh', name: 'ask_user_question', arguments: JSON.stringify({ questions: [{ id: 'color', question: '颜色', options: [{ label: '蓝' }] }] }) } });
      void (runtime as any).question({ agent: { id: 'native-dsh' }, questions: [{ id: 'color', question: '颜色', options: [{ label: '蓝' }] }], wait: { callId: 'question-dsh' } }).then((answer: any) => { nativeAnswer = answer; publish({ type: 'tool/result', data: { turn: 1, message: { toolCallId: 'question-dsh', content: [{ type: 'text', text: '蓝' }] } } }); publish({ type: 'tool/call', data: { turn: 1, callId: 'bash-dsh', name: 'bash', arguments: '{}' } }); });
    }, 5); return ok({ accepted: true }); },
    cancel: async () => { publish({ type: 'tool/result', data: { turn: 1, message: { toolCallId: 'bash-dsh', content: [{ type: 'text', text: '已中断' }] } } }); publish({ type: 'turn/end', data: { turn: 1, reason: { kind: 'aborted' } } }); return ok({ accepted: true }); },
  } };
  const client = { remote, close: async () => {}, ctx: {} }; const host = { close: async () => { for (const stream of streams) await stream.dispose(); } };
  // This is a controlled official-client seam; no model, account or program is launched.
  runtime = Reflect.construct(DshRuntime, ['binding-fixture', host, client]) as AgentRuntime;
  try {
    const contextRef = await runtime.createContext({ cwd }); const visible: ExecutorEvent[] = [];
    const sending = runtime.send({ contextRef, cwd, text: '处理工作', images: [{id:'image-fixture',path:imagePath,mimeType:'image/png'}], clientRequestId: 'request-exact', onEvent: event => visible.push(event) }); sending.catch(() => {});
    await eventually(() => visible.some(event => event.type === 'request'));
    const accepted = visible.find(event => event.type === 'accepted'); const request = visible.find(event => event.type === 'request'); assert.equal(accepted?.type, 'accepted'); assert.equal(request?.type, 'request');
    await runtime.reply({ contextRef, executionRef: accepted.executionRef, requestId: request.request.id, answer: { color: '蓝' } });
    await eventually(() => visible.some(event => event.type === 'item' && event.item.id === 'bash-dsh'));
    assert.deepEqual(nativeAnswer, { answers: [{ id: 'color', selected: ['蓝'] }] });
    const abort = new AbortController();
    const cancelled = (runtime as any).question({ agent: { id: 'native-dsh' }, signal: abort.signal, questions: [{ id: 'later', question: '继续？' }], wait: { callId: 'cancelled-question' } });
    const rejected = assert.rejects(cancelled, /dsh_question_cancelled/); abort.abort(); await rejected;
    assert.ok(visible.some(event => event.type === 'request-resolved' && event.requestId === 'cancelled-question'));
    await assert.rejects((runtime as any).question({ agent: { id: 'wrong-session' }, questions: [{ id: 'color', question: '颜色' }] }), /dsh_question_owner_unavailable/);
    const endingQuestion = (runtime as any).question({ agent: { id: 'native-dsh' }, questions: [{ id: 'ending', question: '结束前的问题' }], wait: { callId: 'ending-question' } });
    const expired = assert.rejects(endingQuestion, /dsh_question_expired/);
    await runtime.stop({ contextRef, executionRef: accepted.executionRef }); await sending; await expired;
    await assert.rejects(runtime.reply({ contextRef, executionRef: accepted.executionRef, requestId: 'ending-question', answer: { ending: '旧回答' } }), /agent_request_stale/);
    await assert.rejects((runtime as any).question({ agent: { id: 'native-dsh' }, questions: [{ id: 'color', question: '颜色' }] }), /dsh_question_owner_unavailable/);
    assert.equal((await runtime.observe({ contextRef, executionRef: accepted.executionRef })).status, 'stopped');
    const text = visible.filter(event => event.type === 'item' && event.item.role === 'assistant').map(event => event.type === 'item' ? event.item : null);
    assert.equal(new Set(text.map(item => item!.id)).size, 1); assert.equal(text.at(-1)?.text, '正在处理'); assert.ok(!JSON.stringify(visible).includes('private reasoning'));
    const history = await runtime.readHistory({ contextRef, cwd }); assert.equal(history.find(item => item.id === 'user-dsh')?.executionId, 'request-exact');
  } finally { await runtime.close(); await rm(root,{recursive:true,force:true}); }
});
