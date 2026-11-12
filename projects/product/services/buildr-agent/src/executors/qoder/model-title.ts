import { randomUUID } from 'node:crypto';
import type { ExecutorTitleInput } from '../../contracts.ts';
import { generateModelTitle } from '../model-title.ts';
import { qoderCatalogEntries, qoderChatCompletion, qoderResponseFailure, unwrapQoderStream } from '../../model-access/providers/qoder.ts';
import { qoderAccountFailure } from '../../model-access/providers/qoder-auth.ts';
import { record } from '../../model-access/providers/private-account.ts';

/**
 * One bounded, tool-free title request on the official Qoder `/chat` channel.
 * It never binds to the live work session or opens an auxiliary native session.
 */
export async function generateQoderNativeTitle(input: ExecutorTitleInput, request: (path: string, init?: RequestInit) => Promise<Response>): Promise<string | undefined> {
  input.signal.throwIfAborted();
  // A missing or expired native account is a capability gap for an auxiliary
  // title request, not a raw filesystem error the title flow should surface.
  const channel = async (path: string, init?: RequestInit) => {
    try { return await request(path, init); }
    catch (error) {
      const status = qoderAccountFailure(error).status;
      if (status === 'not-authenticated' || status === 'expired') throw new Error('agent_title_unavailable');
      throw error;
    }
  };
  const catalogSignal = AbortSignal.any([input.signal, AbortSignal.timeout(5_000)]);
  const catalogResponse = await channel('/models', { signal: catalogSignal });
  if (!catalogResponse.ok) { await catalogResponse.body?.cancel(); throw new Error('agent_title_unavailable'); }
  const entries = qoderCatalogEntries(record(await catalogResponse.json()));
  const selected = entries.find(entry => entry.id === input.model) ?? entries[0];
  if (!selected) throw new Error('agent_title_unavailable');
  return generateModelTitle(input, selected.id, 'chat-completions', async init => {
    const source = JSON.parse(String(init.body)) as { messages: Array<{ role: string; content: unknown }>; max_tokens?: number };
    const id = randomUUID();
    const body = {
      request_id: id, request_set_id: id, chat_record_id: id, session_id: 'buildr-title-' + id,
      stream: true, chat_task: 'FREE_INPUT', is_reply: true, is_retry: false, source: 1, version: '3',
      session_type: 'qodercli', agent_id: 'agent_common', task_id: 'common', code_language: '',
      chat_prompt: '', image_urls: null, aliyun_user_type: '', system: '', messages: source.messages, tools: [],
      parameters: { max_tokens: Math.min(128, source.max_tokens ?? 128) },
      chat_context: { chatPrompt: '', imageUrls: null, extra: { context: [], modelConfig: { key: selected.id, is_reasoning: selected.config.is_reasoning }, originalContent: '' }, features: [], text: '' },
      model_config: selected.config,
      business: { product: 'cli', version: '1.0.0', type: 'agent', stage: 'start', id, name: '对话标题', begin_at: Date.now() },
    };
    const response = await channel('/chat', { body: JSON.stringify(body), signal: init.signal });
    if (!response.ok) throw await qoderResponseFailure(response);
    return Response.json(await qoderChatCompletion(unwrapQoderStream(response, init.signal ?? input.signal), selected.id, id));
  }, 128);
}
