import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

if (process.argv.includes('--version')) { console.log('codex-cli 0.162.0-test'); process.exit(0); }
if (process.argv.includes('--help')) { console.log('Usage: codex app-server [OPTIONS]'); process.exit(0); }
const home = process.env.CODEX_HOME!, mode = process.env.BUILDR_FAKE_CODEX_MODE || 'normal';
const log = (value: unknown) => fs.appendFileSync(path.join(home, 'protocol.jsonl'), JSON.stringify(value) + '\n');
log({ boot: true, pid: process.pid, args: process.argv.slice(2) });
const send = (message: unknown) => process.stdout.write(JSON.stringify(message) + '\n');
const reply = (id: unknown, result: unknown) => send({ id, result });
let sequence = 0, current: { id: string; threadId: string } | null = null, timer: NodeJS.Timeout | null = null;
const threads = new Map<string, { cwd: string; permissions?: string; profile?: { filesystem?: Record<string, unknown> } }>();
function inspectWorkspace(threadId: string, turnId: string) {
  const thread = threads.get(threadId)!;
  const targets = JSON.parse(process.env.BUILDR_FAKE_CODEX_READ_TARGETS || '["AGENTS.md","src/large-input.ts"]') as string[];
  for (const [index, relative] of targets.slice(0, 16).entries()) {
    const id = turnId + '-read-' + index;
    log({ inspection: { kind: 'command', phase: 'started', id, path: relative } });
    send({ method: 'item/started', params: { threadId, turnId, item: { type: 'commandExecution', id, command: 'read authorized fixture snippet', cwd: thread.cwd, status: 'inProgress' } } });
    try {
      if (path.isAbsolute(relative) || relative.split(/[\\/]/).includes('..')) throw Error('invalid fixture target');
      const file = fs.realpathSync(path.join(thread.cwd, relative));
      const readable = Object.entries(thread.profile?.filesystem || {}).some(([root, value]) => {
        if (value !== 'read' || !path.isAbsolute(root)) return false;
        if (root === file) return true;
        try { return fs.statSync(root).isDirectory() && !path.relative(root, file).startsWith('..') && !path.isAbsolute(path.relative(root, file)); } catch { return false; }
      });
      if (!readable) throw Error('fixture scope denied');
      const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
      let bytes: number; const buffer = Buffer.alloc(4096);
      try { bytes = fs.readSync(fd, buffer, 0, buffer.length, 0); } finally { fs.closeSync(fd); }
      const body = buffer.subarray(0, bytes).toString('utf8');
      log({ inspection: { kind: 'command', phase: 'completed', id, path: relative, readBytes: bytes, fileBytes: fs.statSync(file).size, containsMarker: body.includes('ON_DEMAND_LARGE_CONTEXT') } });
      send({ method: 'item/completed', params: { threadId, turnId, item: { type: 'commandExecution', id, command: 'read authorized fixture snippet', cwd: thread.cwd, status: 'completed', exitCode: 0, aggregatedOutput: body } } });
    } catch {
      log({ inspection: { kind: 'command', phase: 'failed', id, path: relative } });
      send({ method: 'item/completed', params: { threadId, turnId, item: { type: 'commandExecution', id, command: 'read authorized fixture snippet', cwd: thread.cwd, status: 'failed', exitCode: 1 } } });
    }
  }
}
const complete = (status: string) => {
  if (!current) return;
  if (status === 'completed') send({ method: 'item/completed', params: { threadId: current.threadId, turnId: current.id, item: { type: 'agentMessage', text: mode === 'invalid-output' ? '{"unexpected":true}' : '{"commitMessage":"feat: verified generated message"}' } } });
  send({ method: 'turn/completed', params: { threadId: current.threadId, turn: { id: current.id, status } } }); current = null;
};
readline.createInterface({ input: process.stdin }).on('line', line => {
  const message = JSON.parse(line); log(message);
  if (!message.method) return;
  if (message.method === 'initialize') reply(message.id, mode === 'handshake' ? {} : { userAgent: 'codex-cli/fixture', codexHome: home, platformFamily: 'unix', platformOs: 'macos' });
  else if (message.method === 'initialized') return;
  else if (message.method === 'config/read') reply(message.id, { config: { model: 'config-default-model', model_provider: 'config-default-provider', model_reasoning_effort: 'config-default-effort', credential: 'private-config-credential', mcp_servers: mode === 'with-mcp' ? { node_repl: { command: 'not-executed', secret: 'private-credential-fixture' } } : mode === 'special-mcp' ? { 'dot.and"quote': { command: 'not-executed' } } : {} }, layers: null, origins: {} });
  else if (message.method === 'thread/start') {
    if (mode === 'thread-exit') { process.exit(2); return; }
    if (mode === 'with-mcp' && message.params.config['mcp_servers.node_repl.enabled'] !== false) { send({ id: message.id, error: { code: -32600, message: 'invalid transport: dotted overrides treat quotes literally' } }); return; }
    const cwdName = path.basename(message.params.cwd);
    const selected = mode === 'execution-config' ? { model: 'model-' + cwdName, modelProvider: 'provider-' + cwdName, reasoningEffort: cwdName === 'first' ? 'high' : 'low', credential: 'private-config-credential' } : mode === 'invalid-config' ? { model: 'm'.repeat(257), modelProvider: 42, reasoningEffort: { invalid: true } } : {};
    if (message.params.config.model_reasoning_effort === 'low') {
      if (mode === 'low-effort-missing') delete (selected as Record<string, unknown>).reasoningEffort;
      else (selected as Record<string, unknown>).reasoningEffort = mode === 'low-effort-mismatch' ? 'high' : 'low';
    }
    const threadId = 'thread-' + ++sequence, permissions = message.params.permissions;
    threads.set(threadId, { cwd: message.params.cwd, permissions, profile: permissions ? message.params.config['permissions.' + permissions] : undefined });
    reply(message.id, { ...selected, ...(permissions && mode !== 'profile-missing' ? { activePermissionProfile: { id: mode === 'profile-mismatch' ? 'unexpected-profile' : permissions, ...(mode === 'profile-unknown-parent' ? {} : { extends: mode === 'profile-inherited' ? ':workspace' : null }) } } : {}), thread: { id: threadId, ephemeral: mode !== 'persistent', model: 'persisted-model', modelProvider: 'persisted-provider', reasoningEffort: 'persisted-effort' }, approvalPolicy: mode === 'approval' ? 'on-request' : 'never', sandbox: { type: mode === 'writable' ? 'workspaceWrite' : 'readOnly', ...(mode === 'profile-unknown-network' ? {} : { networkAccess: mode === 'profile-network' }) } });
  } else if (message.method === 'mcpServerStatus/list') reply(message.id, { data: mode === 'with-mcp' ? [{ name: 'node_repl', runtimeStatus: 'disabled', tools: {} }] : mode === 'unsafe-mcp' ? [{ name: 'unsafe', runtimeStatus: 'connected', tools: { write: {} } }] : [], nextCursor: null });
  else if (message.method === 'turn/start') {
    current = { id: 'turn-' + sequence, threadId: message.params.threadId }; reply(message.id, { turn: { id: current.id, status: 'inProgress' } });
    send({ method: 'turn/started', params: { threadId: current.threadId, turn: current } });
    if (mode.startsWith('unexpected-')) send({ method: mode === 'unexpected-command-start' ? 'item/started' : 'item/completed', params: { threadId: current.threadId, turnId: current.id, item: { type: mode === 'unexpected-file-change' ? 'fileChange' : mode === 'unexpected-mcp-tool' ? 'mcpToolCall' : 'commandExecution', id: current.id + '-unexpected', status: 'completed', exitCode: 0 } } });
    if (mode === 'workspace-read-only') inspectWorkspace(current.threadId, current.id);
    else if (threads.get(current.threadId)?.permissions && mode !== 'workspace-no-inspection') send({ method: 'item/completed', params: { threadId: current.threadId, turnId: current.id, item: { type: 'commandExecution', id: current.id + '-inspect', command: 'pwd', cwd: threads.get(current.threadId)!.cwd, status: mode === 'workspace-failed-inspection' ? 'failed' : 'completed', exitCode: mode === 'workspace-failed-inspection' ? 1 : 0 } } });
    if (mode === 'process-exit') { process.exit(3); return; }
    if (mode === 'tool-request') send({ id: 'untrusted-tool', method: 'item/tool/call', params: { name: 'write_something' } });
    if (mode !== 'timeout') timer = setTimeout(() => complete(mode === 'failed' ? 'failed' : 'completed'), mode === 'slow' ? 250 : 5);
  } else if (message.method === 'turn/interrupt') { if (timer) clearTimeout(timer); reply(message.id, {}); complete('interrupted'); }
  else if (message.method === 'thread/unsubscribe') reply(message.id, { status: 'unsubscribed' });
  else send({ id: message.id, error: { code: -32601, message: 'unsupported fixture method' } });
}).on('close', () => process.exit(0));
