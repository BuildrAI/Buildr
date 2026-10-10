import readline from 'node:readline';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
const mode = process.env.BUILDR_DSH_FIXTURE_MODE || 'normal';
const write = (value: unknown) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...(value as object) }) + '\n');
const reply = (id: number, result: unknown) => write({ id, result });
const notify = (method: string, params: unknown) => write({ method, params });
const sessions = new Map<string, { effort: string; promptId?: number }>();
const config = (effort: string) => [{ id: 'model', currentValue: '["native-provider","native-model"]', options: [{ value: '["native-provider","native-model"]', name: 'native-model' }] }, { id: 'reasoning_effort', currentValue: effort, options: (mode === 'no-low' ? ['max'] : ['low', 'max']).map(value => ({ value, name: value })) }];
const configurationFiles = ['profiles/desktop/package.json', 'profiles/desktop/cordis.patch.yml', 'cordis.patch.yml', '.env'].map(file => path.join(process.env.DSH_HOME!, file)).sort();
const fingerprint = crypto.createHash('sha256');
for (const file of configurationFiles) { fingerprint.update(file); try { fingerprint.update(fs.readFileSync(file)); } catch {} }
notify('$buildr/ready', { version: '0.2.0-rc.2', model: 'native-model', modelProvider: 'native-provider', nativeReasoningEffort: 'max', ephemeral: mode !== 'persistent', toolCount: 0, automaticContext: false, conversationLogUpload: false, configurationFiles, configurationFingerprint: fingerprint.digest('hex') });
readline.createInterface({ input: process.stdin }).on('line', line => {
  const { id, method, params } = JSON.parse(line);
  if (method === 'initialize') reply(id, { protocolVersion: 1, agentCapabilities: { sessionCapabilities: { close: {} } } });
  if (method === 'session/new') { const sessionId = crypto.randomUUID(); sessions.set(sessionId, { effort: 'max' }); reply(id, { sessionId, configOptions: config('max') }); }
  if (method === 'session/set_config_option') { sessions.get(params.sessionId)!.effort = mode === 'wrong-low' ? 'max' : params.value; reply(id, { configOptions: config(sessions.get(params.sessionId)!.effort) }); }
  if (method === 'session/prompt') {
    const session = sessions.get(params.sessionId)!; session.promptId = id;
    notify('$buildr/model-request', { sessionId: params.sessionId, count: 1, toolCount: 0 });
    if (mode === 'wait') return;
    if (mode === 'tool') { notify('session/update', { sessionId: params.sessionId, update: { sessionUpdate: 'tool_call', toolCallId: 'unsafe' } }); return; }
    notify('session/update', { sessionId: params.sessionId, update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: mode === 'invalid-json' ? 'not JSON' : JSON.stringify({ commitMessage: 'feat: 接入 DSH' }) } } });
    reply(id, { stopReason: 'end_turn' });
  }
  if (method === 'session/cancel') { const session = sessions.get(params.sessionId); if (session?.promptId) reply(session.promptId, { stopReason: 'cancelled' }); }
  if (method === 'session/close') { sessions.delete(params.sessionId); if (mode !== 'no-release') notify('$buildr/session-released', { sessionId: params.sessionId, remaining: sessions.size }); reply(id, {}); }
}).on('close', () => process.exit(0));
