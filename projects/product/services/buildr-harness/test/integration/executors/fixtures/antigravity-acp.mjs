#!/usr/bin/env node
// Sanitized Antigravity CLI (agy 1.5.8) ACP fixture: newline-delimited JSON-RPC over stdio, no network, no real credentials.
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const args = process.argv.slice(2);
const home = process.env.HOME || process.env.USERPROFILE || process.cwd();
const cliRoot = join(home, '.gemini', 'antigravity-cli');
const brainRoot = join(home, '.gemini', 'antigravity');
const sessionsDir = join(brainRoot, 'sessions');
const transcriptsDir = join(brainRoot, 'transcripts');
const keyringFile = process.env.BUILDR_TEST_AGY_KEYRING_FILE || join(cliRoot, 'fixture-keyring.json');
const controlFile = process.env.BUILDR_TEST_AGY_CONTROL_FILE || join(cliRoot, 'fixture-control.json');

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return undefined;
  }
}

function writeJson(file, value) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(value, null, 2) + '\n');
}

function appendLog(name, payload) {
  try {
    mkdirSync(cliRoot, { recursive: true });
    writeFileSync(join(cliRoot, name), JSON.stringify({ at: new Date().toISOString(), pid: process.pid, ...payload }) + '\n', { flag: 'a' });
  } catch {
    // Fixture logging is optional.
  }
}

const control = () => readJson(controlFile) ?? {};
const scenario = () => String(process.env.BUILDR_TEST_AGY_SCENARIO || control().scenario || '');

if (args.includes('--version')) {
  const version = String(process.env.BUILDR_TEST_AGY_VERSION || control().version || '1.5.8');
  process.stdout.write(`antigravity ${version}\n`);
  process.exit(0);
}

const defaultCatalog = [
  { modelId: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', description: 'Reasoning and coding model' },
  { modelId: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', description: 'Fast multimodal model' },
  { modelId: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5', description: 'Agentic coding model' },
];

function currentAuth() {
  const stored = readJson(keyringFile);
  if (stored) return stored;
  if (process.env.BUILDR_TEST_AGY_UNAUTHENTICATED === '1') {
    return { authenticated: false };
  }
  return {
    authenticated: true,
    methodId: 'oauth-personal',
    tier: { id: 'g1-ultra-tier', name: 'Google AI Ultra', upgradeUri: 'https://one.google.com/about/ai-plans' },
  };
}

function catalogModels(auth) {
  if (Array.isArray(auth?.models)) return auth.models;
  const ctrl = control();
  if (Array.isArray(ctrl.models)) return ctrl.models;
  return defaultCatalog;
}

function antigravityMeta(auth) {
  const meta = {};
  if (auth && 'tier' in auth) {
    if (auth.tier !== null && auth.tier !== undefined) meta.tier = auth.tier;
  } else {
    meta.tier = { id: 'g1-ultra-tier', name: 'Google AI Ultra', upgradeUri: 'https://one.google.com/about/ai-plans' };
  }
  if (auth && 'account' in auth) meta.account = auth.account;
  if (auth && 'email' in auth) meta.email = auth.email;
  if (auth && 'userId' in auth) meta.userId = auth.userId;
  if (auth && 'quota' in auth) meta.quota = auth.quota;
  return meta;
}

if (args[0] === 'models') {
  const auth = currentAuth();
  appendLog('fixture-launches.jsonl', { subcommand: 'models', ssh: process.env.SSH_CONNECTION ?? null });
  process.stdout.write('Fetching available models...\n');
  if (!auth.authenticated) {
    process.stdout.write('Error: Please sign in to view available models. Launch the CLI without arguments to sign in.\n');
    process.exit(0);
  }
  if (auth.expired) {
    process.stderr.write('Error: OAuth token expired (invalid_grant).\n');
    process.exit(1);
  }
  const models = catalogModels(auth);
  for (const model of models) {
    process.stdout.write(`${model.modelId}\t${model.name ?? model.modelId}\n`);
  }
  process.exit(0);
}

if (args[0] !== 'acp') {
  process.stderr.write(`Unsupported fixture command: ${args.join(' ')}\n`);
  process.exit(2);
}

const skipPermissions = args.includes('--dangerously-skip-permissions');
const observedSettings = readJson(join(cliRoot, 'settings.json'));
appendLog('fixture-launches.jsonl', {
  subcommand: 'acp',
  args,
  skipPermissions,
  autoUpdate: observedSettings?.autoUpdate ?? null,
  ssh: process.env.SSH_CONNECTION ?? null,
  dbus: process.env.DBUS_SESSION_BUS_ADDRESS ?? null,
  xdgRuntime: process.env.XDG_RUNTIME_DIR ?? null,
});

const send = payload => process.stdout.write(JSON.stringify(payload) + '\n');
const result = (id, value) => send({ jsonrpc: '2.0', id, result: value });
const fail = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } });
const notify = (method, params) => send({ jsonrpc: '2.0', method, params });

function sessionFile(sessionId) {
  return join(sessionsDir, `${sessionId}.json`);
}

function transcriptFile(sessionId) {
  return join(transcriptsDir, `${sessionId}.jsonl`);
}

function readSession(sessionId) {
  return readJson(sessionFile(sessionId));
}

function writeSession(session) {
  writeJson(sessionFile(session.id), session);
}

function appendTranscript(sessionId, row) {
  mkdirSync(transcriptsDir, { recursive: true });
  writeFileSync(transcriptFile(sessionId), JSON.stringify({ sessionId, timestamp: new Date().toISOString(), ...row }) + '\n', { flag: 'a' });
}

function buildSessionPayload(session, auth) {
  const availableModels = catalogModels(auth);
  const currentModelId = session.model ?? availableModels[0]?.modelId ?? 'gemini-2.5-pro';
  const series = scenario() === 'series-catalog';
  const seriesId = id => id.replace(/-(low|medium|high|xhigh)$/, '');
  const currentThought = session.thoughtLevel ?? 'high';
  const currentMode = session.mode ?? 'default';
  const efforts = Array.isArray(control().thoughtLevels)
    ? control().thoughtLevels
    : [
        { value: 'low', name: 'Low', description: 'Fast responses' },
        { value: 'medium', name: 'Medium', description: 'Balanced' },
        { value: 'high', name: 'High', description: 'Deep reasoning' },
      ];
  return {
    sessionId: session.id,
    models: {
      availableModels,
      currentModelId,
    },
    modes: {
      currentModeId: currentMode,
      availableModes: [
        { id: 'default', name: 'Default', description: 'Ask before running tools' },
        { id: 'accept-edits', name: 'Accept Edits', description: 'Auto-accept file edits' },
        { id: 'plan', name: 'Plan', description: 'Plan only' },
      ],
    },
    configOptions: [
      {
        id: 'model',
        name: 'Model',
        category: 'model',
        type: 'select',
        currentValue: series ? seriesId(currentModelId) : currentModelId,
        options: availableModels.map(item => ({ value: series ? seriesId(item.modelId) : item.modelId, name: item.name ?? item.modelId, description: item.description ?? '' })),
      },
      {
        id: 'thought_level',
        name: 'Thinking Level',
        category: 'thought_level',
        type: 'select',
        currentValue: currentThought,
        options: efforts,
      },
      {
        id: 'mode',
        name: 'Mode',
        category: 'mode',
        type: 'select',
        currentValue: currentMode,
        options: [
          { value: 'default', name: 'Default', description: 'Ask before running tools' },
          { value: 'accept-edits', name: 'Accept Edits', description: 'Auto-accept file edits' },
          { value: 'plan', name: 'Plan', description: 'Plan only' },
        ],
      },
    ],
    _meta: {
      antigravity: antigravityMeta(auth),
    },
  };
}

let nextServerRequestId = 900;
const pendingServerRequests = new Map();
let activeAuthAttempt = undefined;
let activePrompt = undefined;
let toolCounter = 0;

function launchBrowserUrl(url) {
  const opener = process.platform === 'darwin'
    ? { cmd: 'open', args: [url] }
    : process.platform === 'win32'
      ? { cmd: 'rundll32', args: ['url.dll,FileProtocolHandler', url] }
      : { cmd: 'xdg-open', args: [url] };
  try {
    const child = spawn(opener.cmd, opener.args, { env: process.env, stdio: 'ignore', windowsHide: true });
    child.on('error', () => {});
    child.unref();
  } catch {
    // Opener absence is reported by login timeout or SSH check.
  }
}

function askServer(method, params) {
  const id = ++nextServerRequestId;
  return new Promise((resolve, reject) => {
    pendingServerRequests.set(id, { resolve, reject, method });
    send({ jsonrpc: '2.0', id, method, params });
  });
}

function settleAllServerRequests() {
  for (const [, pending] of pendingServerRequests) {
    pending.resolve({ cancelled: true });
  }
  pendingServerRequests.clear();
}

async function runPrompt(id, params) {
  const sessionId = String(params.sessionId ?? '');
  const session = readSession(sessionId);
  if (!session) {
    fail(id, -32602, `Session not found: ${sessionId}`);
    return;
  }
  const auth = currentAuth();
  if (!auth.authenticated) {
    fail(id, -32000, 'Authentication required: oauth-personal is not signed in');
    return;
  }
  if (auth.expired) {
    fail(id, -32000, 'OAuth token expired: invalid_grant');
    return;
  }
  const parts = Array.isArray(params.prompt) ? params.prompt : [];
  const text = parts.filter(part => part?.type === 'text').map(part => String(part.text ?? '')).join('');
  const imageCount = parts.filter(part => part?.type === 'image').length;
  const activeScenario = scenario();
  const userMessageId = `user-msg-${randomUUID()}`;
  const turnState = { id, sessionId, cancelled: false, children: [] };
  activePrompt = turnState;

  session.messages.push({ id: userMessageId, role: 'user', text, imageCount });
  writeSession(session);
  appendTranscript(sessionId, {
    type: 'user',
    id: userMessageId,
    cwd: session.cwd,
    text,
    imageCount,
  });

  if (text.includes('[[buildr:background-continuation]]')) {
    if (activeScenario === 'continuation-fails') {
      activePrompt = undefined;
      fail(id, -32603, 'continuation failed');
      return;
    }
    const finalText = '后台结果已读取，继续处理完成。';
    const finalMsgId = `msg-${randomUUID()}`;
    notify('session/update', {
      sessionId,
      update: { sessionUpdate: 'agent_message_chunk', messageId: finalMsgId, content: { type: 'text', text: finalText } },
    });
    session.messages.push({ id: finalMsgId, role: 'assistant', text: finalText });
    writeSession(session);
    appendTranscript(sessionId, {
      type: 'turn_complete',
      promptId: userMessageId,
      cwd: session.cwd,
      stopReason: 'end_turn',
      finalText,
      backgroundActive: false,
    });
    activePrompt = undefined;
    result(id, {
      userMessageId,
      stopReason: 'end_turn',
      usage: { inputTokens: 950_000, outputTokens: 1_200, totalTokens: 951_200 },
    });
    return;
  }

  if (activeScenario === 'disconnect') {
    notify('session/update', {
      sessionId,
      update: { sessionUpdate: 'agent_message_chunk', messageId: `msg-${randomUUID()}`, content: { type: 'text', text: '正在执行，即将断连' } },
    });
    setTimeout(() => process.exit(1), 20);
    return;
  }

  // Emit context window usage update & optional generated title
  notify('session/update', {
    sessionId,
    update: { sessionUpdate: 'usage_update', used: 4096, size: 1048576 },
  });
  if (!session.title) {
    session.title = text.slice(0, 24) || 'Antigravity 会话';
    writeSession(session);
    notify('session/update', {
      sessionId,
      update: { sessionUpdate: 'session_info_update', title: session.title },
    });
  }

  if (activeScenario === 'long-command' || activeScenario === 'cancel-ignored' || text.includes('[LONG_COMMAND]')) {
    const toolId = `call-${++toolCounter}`;
    const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
    turnState.children.push(child);
    appendLog('fixture-owned-children.jsonl', { sessionId, pid: child.pid, pgid: process.pid });
    notify('session/update', {
      sessionId,
      update: { sessionUpdate: 'agent_message_chunk', messageId: `msg-${randomUUID()}`, content: { type: 'text', text: '准备运行长耗时命令。' } },
    });
    notify('session/update', {
      sessionId,
      update: {
        sessionUpdate: 'tool_call',
        toolCallId: toolId,
        title: 'Run long task',
        kind: 'execute',
        rawInput: { command: 'sleep 3600' },
        status: 'in_progress',
      },
    });
    appendTranscript(sessionId, {
      type: 'tool_call',
      toolCallId: toolId,
      cwd: session.cwd,
      kind: 'execute',
      title: 'Run long task',
      input: { command: 'sleep 3600' },
      status: 'running',
    });
    await new Promise(resolve => {
      turnState.onCancel = () => {
        if (activeScenario === 'cancel-ignored' || text.includes('[CANCEL_IGNORED]')) return;
        try { child.kill('SIGTERM'); } catch {}
        resolve(undefined);
      };
    });
    activePrompt = undefined;
    result(id, { stopReason: 'cancelled', usage: { inputTokens: 120, outputTokens: 30, totalTokens: 150 } });
    return;
  }

  // Thinking + Plan + First narration before tool 1
  notify('session/update', {
    sessionId,
    update: { sessionUpdate: 'agent_thought_chunk', messageId: `thought-${randomUUID()}`, content: { type: 'text', text: '先检查目标文件再整理改动。' } },
  });
  notify('session/update', {
    sessionId,
    update: {
      sessionUpdate: 'plan',
      entries: [
        { content: '1. 读取配置与源码', status: 'in_progress' },
        { content: '2. 汇总结论', status: 'pending' },
      ],
    },
  });
  const narration1Id = `msg-${randomUUID()}`;
  notify('session/update', {
    sessionId,
    update: { sessionUpdate: 'agent_message_chunk', messageId: narration1Id, content: { type: 'text', text: '我先读取项目文件确认现状。' } },
  });

  // Optional elicitation question (even in skipPermissions mode!)
  if (activeScenario === 'question' || text.includes('[ASK_QUESTION]')) {
    const elicitation = await askServer('elicitation/create', {
      sessionId,
      mode: 'form',
      message: '请选择目标环境与验证策略',
      requestedSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          env: {
            type: 'string',
            title: '环境',
            oneOf: [
              { const: 'staging', title: '预发环境' },
              { const: 'prod', title: '生产环境' },
            ],
          },
          checks: {
            type: 'array',
            title: '检查项',
            items: {
              type: 'string',
              anyOf: [
                { const: 'unit', title: '单元测试' },
                { const: 'e2e', title: '集成测试' },
              ],
            },
            minItems: 1,
          },
          note: { type: 'string', title: '备注' },
        },
        required: ['env', 'checks'],
      },
    });
    appendLog('fixture-elicitations.jsonl', { sessionId, elicitation });
    if (turnState.cancelled) {
      activePrompt = undefined;
      result(id, { stopReason: 'cancelled' });
      return;
    }
  }

  if (activeScenario === 'question-invalid' || text.includes('[ASK_INVALID_QUESTION]')) {
    const elicitation = await askServer('elicitation/create', {
      sessionId,
      mode: 'form',
      message: '不可表达的嵌套对象表单',
      requestedSchema: {
        type: 'object',
        properties: {
          nested: { type: 'object', properties: { deep: { type: 'string' } } },
        },
      },
    });
    appendLog('fixture-elicitations.jsonl', { sessionId, elicitation });
  }

  // Tool 1: read (with permission request when !skipPermissions && !control().autoAllow)
  const tool1Id = `call-${++toolCounter}`;
  notify('session/update', {
    sessionId,
    update: {
      sessionUpdate: 'tool_call',
      toolCallId: tool1Id,
      title: 'Read README.md',
      kind: 'read',
      rawInput: { file_path: 'README.md' },
      locations: [{ path: 'README.md' }],
      status: 'pending',
    },
  });

  let tool1Rejected = false;
  if (!skipPermissions && !control().autoAllow && !text.includes('[AUTO_ALLOW]')) {
    const options = [
      ...(activeScenario === 'include-persistent-option'
        ? [{ optionId: 'allow_always', name: '始终允许', kind: 'allow_always' }]
        : []),
      { optionId: 'allow_once', name: '允许本次', kind: 'allow_once' },
      { optionId: 'reject_once', name: '拒绝本次', kind: 'reject_once' },
    ];
    const decision = await askServer('session/request_permission', {
      sessionId,
      toolCall: { toolCallId: tool1Id, title: 'Read README.md', kind: 'read' },
      options,
    });
    appendLog('fixture-permissions.jsonl', { sessionId, toolCallId: tool1Id, decision });
    if (turnState.cancelled || decision?.cancelled || decision?.outcome?.outcome === 'cancelled') {
      activePrompt = undefined;
      result(id, { stopReason: 'cancelled' });
      return;
    }
    if (decision?.outcome?.optionId === 'reject_once') {
      tool1Rejected = true;
    }
  }

  const fullTool1Output = 'README full content line\n'.repeat(800);
  const tool1Status = tool1Rejected || activeScenario === 'failed-tool' ? 'failed' : 'completed';
  // Status-only update without repeating title or rawInput to verify preservation
  notify('session/update', {
    sessionId,
    update: {
      sessionUpdate: 'tool_call_update',
      toolCallId: tool1Id,
      status: tool1Status,
      content: [{ type: 'content', content: { type: 'text', text: tool1Rejected ? '用户拒绝执行该工具' : fullTool1Output } }],
    },
  });
  appendTranscript(sessionId, {
    type: 'tool_result',
    toolCallId: tool1Id,
    cwd: session.cwd,
    kind: 'read',
    name: 'read',
    input: { file_path: 'README.md', path: 'README.md' },
    status: tool1Status,
    output: tool1Rejected ? '用户拒绝执行该工具' : fullTool1Output,
  });

  // Second narration between tool 1 and tool 2
  const narration2Id = `msg-${randomUUID()}`;
  notify('session/update', {
    sessionId,
    update: { sessionUpdate: 'agent_message_chunk', messageId: narration2Id, content: { type: 'text', text: '文件读取完成，接下来执行构建检查并更新补丁。' } },
  });

  // Tool 2: edit with diff OR execute command
  const tool2Id = `call-${++toolCounter}`;
  const isDiff = activeScenario === 'diff-tool' || text.includes('[DIFF_TOOL]');
  notify('session/update', {
    sessionId,
    update: {
      sessionUpdate: 'tool_call',
      toolCallId: tool2Id,
      title: isDiff ? 'Edit src/index.ts' : 'Run unit check',
      kind: isDiff ? 'edit' : 'execute',
      rawInput: isDiff ? { path: 'src/index.ts' } : { CommandLine: 'npm test' },
      locations: [{ path: isDiff ? 'src/index.ts' : 'package.json' }],
      status: 'in_progress',
    },
  });
  const tool2Text = isDiff ? '--- a/src/index.ts\n+++ b/src/index.ts\n@@ -1 +1 @@\n-old\n+new' : 'PASS all checks (12 tests)';
  if (!['unsettled-tool', 'late-command-result', 'continuation-fails', 'native-background-continuation', 'background-transcript-exit'].includes(activeScenario) && !text.includes('[UNSETTLED_TOOL]')) {
    notify('session/update', {
      sessionId,
      update: {
        sessionUpdate: 'tool_call_update',
        toolCallId: tool2Id,
        status: 'completed',
        content: isDiff
          ? [{ type: 'diff', path: 'src/index.ts', oldText: 'old', newText: 'new' }]
          : [{ type: 'content', content: { type: 'text', text: tool2Text } }],
      },
    });
    appendTranscript(sessionId, {
      type: 'tool_result',
      toolCallId: tool2Id,
      cwd: session.cwd,
      kind: isDiff ? 'edit' : 'execute',
      name: isDiff ? 'file-change' : 'command',
      input: isDiff ? { path: 'src/index.ts' } : { command: 'npm test', path: 'package.json' },
      status: 'completed',
      output: tool2Text,
    });
  } else {
    appendTranscript(sessionId, {
      type: 'tool_call',
      toolCallId: tool2Id,
      cwd: session.cwd,
      kind: isDiff ? 'edit' : 'execute',
      name: isDiff ? 'file-change' : 'command',
      input: isDiff ? { path: 'src/index.ts' } : { command: 'npm test', path: 'package.json' },
      status: 'running',
    });
  }

  const authoritativeFinal = activeScenario === 'truncated-final-stream'
    ? '部分回复，已由原生记录完整补齐。'
    : `已完成处理：${text}${imageCount ? `（含 ${imageCount} 张图片）` : ''}`;
  const streamedFinal = activeScenario === 'truncated-final-stream'
    ? '部分回复'
    : activeScenario === 'wholly-lost-final-stream'
      ? ''
      : authoritativeFinal;

  if (streamedFinal) {
    const finalMsgId = `msg-${randomUUID()}`;
    const midpoint = Math.max(1, Math.floor(streamedFinal.length / 2));
    notify('session/update', {
      sessionId,
      update: { sessionUpdate: 'agent_message_chunk', messageId: finalMsgId, content: { type: 'text', text: streamedFinal.slice(0, midpoint) } },
    });
    notify('session/update', {
      sessionId,
      update: { sessionUpdate: 'agent_message_chunk', messageId: finalMsgId, content: { type: 'text', text: streamedFinal.slice(midpoint) } },
    });
  }

  const stopReason = activeScenario === 'max-tokens'
    ? 'max_tokens'
    : activeScenario === 'refusal'
      ? 'refusal'
      : activeScenario === 'max-turn-requests'
        ? 'max_turn_requests'
        : 'end_turn';
  const backgroundActive = activeScenario === 'background-active';

  session.messages.push(
    { id: narration1Id, role: 'assistant', text: '我先读取项目文件确认现状。' },
    { id: tool1Id, role: 'tool', kind: 'read', title: 'Read README.md', input: { file_path: 'README.md', path: 'README.md' }, text: tool1Rejected ? '用户拒绝执行该工具' : 'README summary', status: tool1Status },
    { id: narration2Id, role: 'assistant', text: '文件读取完成，接下来执行构建检查并更新补丁。' },
    { id: tool2Id, role: 'tool', kind: isDiff ? 'edit' : 'execute', title: isDiff ? 'Edit src/index.ts' : 'Run unit check', input: isDiff ? { path: 'src/index.ts' } : { command: 'npm test' }, text: tool2Text, status: 'completed' },
    { id: `final-${randomUUID()}`, role: 'assistant', text: authoritativeFinal },
  );
  writeSession(session);
  if (activeScenario !== 'native-background-continuation') {
    appendTranscript(sessionId, {
      type: 'turn_complete',
      promptId: userMessageId,
      cwd: session.cwd,
      stopReason,
      finalText: authoritativeFinal,
      backgroundActive,
    });
  }

  if (activeScenario === 'background-transcript-exit') {
    const file = join(cliRoot, 'brain', sessionId, '.system_generated', 'logs', 'transcript_full.jsonl');
    mkdirSync(dirname(file), { recursive: true });
    const task = sessionId + '/task-42';
    const writeRow = row => writeFileSync(file, JSON.stringify({ created_at: new Date().toISOString(), ...row }) + '\n', { flag: 'a' });
    writeRow({ source: 'MODEL', type: 'GENERIC', content: `Created At: test\nTool is running as a background task with task id: ${task}\nTask Description: npm test\nTask logs are available at: file:///fixture/task-42.log` });
    writeRow({ source: 'MODEL', type: 'PLANNER_RESPONSE', content: `[Message] timestamp=test sender=${task} priority=HIGH content=Task id "${task}" finished with result:\nCommand exited with code 0.` });
    setTimeout(() => writeRow({ source: 'SYSTEM', type: 'SYSTEM_MESSAGE',
      content: `[Message] timestamp=test sender=${task} priority=HIGH content=Task id "${task}" finished with result:\nCommand exited with code 7.\nCommand output: fixture failure` }), 250);
  }
  if (activeScenario === 'late-command-result' || activeScenario === 'continuation-fails') {
    setTimeout(() => {
      notify('session/update', {
        sessionId,
        update: { sessionUpdate: 'tool_call_update', toolCallId: tool2Id, status: 'completed',
          content: [{ type: 'content', content: { type: 'text', text: 'original command exited with code 0' } }] },
      });
      appendTranscript(sessionId, {
        type: 'tool_result',
        toolCallId: tool2Id,
        cwd: session.cwd,
        kind: 'execute',
        name: 'command',
        status: 'completed',
        output: 'original command exited with code 0',
      });
    }, 250);
  }
  if (activeScenario === 'native-background-continuation') {
    setTimeout(() => {
      notify('session/update', {
        sessionId,
        update: { sessionUpdate: 'tool_call_update', toolCallId: tool2Id, status: 'completed',
          content: [{ type: 'content', content: { type: 'text', text: 'native command exited with code 0' } }] },
      });
      appendTranscript(sessionId, {
        type: 'tool_result',
        toolCallId: tool2Id,
        cwd: session.cwd,
        kind: 'execute',
        name: 'command',
        status: 'completed',
        output: 'native command exited with code 0',
      });
    }, 250);
    setTimeout(() => {
      appendTranscript(sessionId, {
        type: 'turn_complete',
        promptId: userMessageId,
        cwd: session.cwd,
        stopReason: 'end_turn',
        finalText: authoritativeFinal,
        backgroundActive: false,
      });
      activePrompt = undefined;
      result(id, {
        userMessageId,
        stopReason: 'end_turn',
        usage: { inputTokens: 950_000, outputTokens: 1_200, totalTokens: 951_200 },
      });
    }, 350);
    return;
  }
  activePrompt = undefined;
  if (activeScenario === 'missing-terminal-response') {
    return;
  }
  result(id, {
    userMessageId,
    stopReason,
    // High billing counters intentionally differ from context window usage_update (4096 / 1048576).
    usage: { inputTokens: 950_000, outputTokens: 1_200, totalTokens: 951_200 },
  });
}

function handleMessage(message) {
  const { id, method, params = {} } = message;
  if (!method) {
    const pending = pendingServerRequests.get(id);
    if (pending) {
      pendingServerRequests.delete(id);
      if (message.error) pending.reject(new Error(message.error.message || 'server_request_failed'));
      else pending.resolve(message.result);
    }
    return;
  }

  if (method === '$/cancelRequest') {
    const targetId = params.id;
    if (activeAuthAttempt && activeAuthAttempt.id === targetId) {
      clearTimeout(activeAuthAttempt.timer);
      const authId = activeAuthAttempt.id;
      activeAuthAttempt = undefined;
      fail(authId, -32800, 'Authentication cancelled');
    }
    return;
  }

  if (method === 'initialize') {
    const activeScenario = scenario();
    const sessionCapabilities = activeScenario === 'missing-resume-capability'
      ? { close: {}, load: {}, list: {} }
      : { resume: {}, close: {}, load: {}, list: {}, additionalDirectories: {} };
    const appendSupported = activeScenario !== 'no-prompt-append';
    result(id, {
      protocolVersion: 1,
      agentCapabilities: {
        loadSession: true,
        promptCapabilities: activeScenario === 'missing-prompt-capability'
          ? undefined
          : { image: true, audio: false, embeddedContext: true },
        sessionCapabilities,
        auth: { logout: {} },
        _meta: {
          antigravity: {
            tier: true,
            ...(appendSupported ? { systemPrompt: { append: true } } : {}),
          },
        },
      },
      agentInfo: { name: 'Antigravity ACP Server', version: '1.5.8' },
      authMethods: [
        { id: 'oauth-personal', name: 'Log in with Google', description: 'Sign in with a Google Personal Account' },
        { id: 'oauth-business', name: 'Log in with Google Cloud', description: 'Enterprise' },
        { id: 'gemini-api-key', name: 'Use Gemini API Key', description: 'API Key' },
        { id: 'agent-platform', name: 'Agent Platform', description: 'Agent Platform' },
      ],
    });
    return;
  }

  if (method === 'authenticate') {
    if (params.methodId !== 'oauth-personal') {
      fail(id, -32602, `Unsupported auth method: ${String(params.methodId)}`);
      return;
    }
    const auth = currentAuth();
    const ctrl = control();
    if (auth.authenticated && !ctrl.forceInteractiveLogin) {
      if (auth.expired) {
        fail(id, -32000, 'OAuth token expired: invalid_grant');
        return;
      }
      result(id, { _meta: { antigravity: antigravityMeta(auth) } });
      return;
    }
    if (process.env.SSH_CONNECTION) {
      fail(id, -32603, "No browser is available here (this is a remote (SSH) session, so the browser's sign-in redirect can't reach this machine). Run `agy acp --login` in a terminal on this machine, then retry; or use a Gemini API key.");
      return;
    }
    const stateParam = String(ctrl.loginStateParam || 'fixture-state');
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=fixture-agy-client&redirect_uri=${encodeURIComponent('http://127.0.0.1:43123/oauth-callback')}&response_type=code&scope=openid+email&state=${encodeURIComponent(stateParam)}`;
    launchBrowserUrl(authUrl);
    const delayMs = typeof ctrl.loginCompleteDelayMs === 'number' ? ctrl.loginCompleteDelayMs : 120;
    if (ctrl.loginHang) {
      activeAuthAttempt = { id };
      return;
    }
    const timer = setTimeout(() => {
      if (!activeAuthAttempt || activeAuthAttempt.id !== id) return;
      activeAuthAttempt = undefined;
      if (ctrl.loginOutcome === 'failed') {
        fail(id, -32000, 'OAuth callback failed');
        return;
      }
      if (ctrl.loginOutcome === 'expired') {
        fail(id, -32000, 'OAuth login timed out');
        return;
      }
      const nextAuth = ctrl.nextLoginAuth ?? {
        authenticated: true,
        methodId: 'oauth-personal',
        tier: { id: 'g1-pro-tier', name: 'Google AI Pro', upgradeUri: 'https://one.google.com/about/ai-plans' },
      };
      writeJson(keyringFile, nextAuth);
      if (ctrl.forceInteractiveLogin) {
        writeJson(controlFile, { ...ctrl, forceInteractiveLogin: false });
      }
      result(id, { _meta: { antigravity: antigravityMeta(nextAuth) } });
    }, delayMs);
    activeAuthAttempt = { id, timer };
    return;
  }

  if (method === 'logout') {
    const activeScenario = scenario();
    appendLog('fixture-logouts.jsonl', { scenario: activeScenario });
    if (activeScenario === 'logout-timeout') {
      return;
    }
    if (activeScenario === 'logout-error-still-logged-in') {
      fail(id, -32603, 'Keyring busy');
      return;
    }
    writeJson(keyringFile, { authenticated: false });
    if (activeScenario === 'logout-error-cleared') {
      fail(id, -32603, 'Connection closed after logout');
      return;
    }
    result(id, {});
    return;
  }

  if (method === 'session/new') {
    const auth = currentAuth();
    if (!auth.authenticated) {
      fail(id, -32000, 'Authentication required: please sign in with oauth-personal');
      return;
    }
    if (auth.expired) {
      fail(id, -32000, 'OAuth token expired: invalid_grant');
      return;
    }
    const sessionId = randomUUID();
    const appendPrompt = params?._meta?.antigravity?.systemPrompt?.append ?? null;
    const availableModels = catalogModels(auth);
    const session = {
      id: sessionId,
      cwd: params.cwd,
      model: availableModels[0]?.modelId ?? 'gemini-2.5-pro',
      thoughtLevel: 'high',
      mode: skipPermissions ? 'auto' : 'default',
      appendPrompt,
      messages: [],
    };
    writeSession(session);
    if (control().createCliSessionArtifacts) {
      mkdirSync(join(cliRoot, 'conversations'), { recursive: true });
      writeFileSync(join(cliRoot, 'conversations', `${sessionId}.db`), 'sqlite-probe-fixture');
      writeFileSync(join(cliRoot, 'conversations', `${sessionId}.db-wal`), '');
      mkdirSync(join(cliRoot, 'brain', sessionId, '.system_generated', 'logs'), { recursive: true });
    }
    appendLog('fixture-sessions.jsonl', { method: 'session/new', sessionId, cwd: params.cwd, appendPrompt, skipPermissions });
    result(id, buildSessionPayload(session, auth));
    return;
  }

  if (method === 'session/resume' || method === 'session/load') {
    const auth = currentAuth();
    if (!auth.authenticated) {
      fail(id, -32000, 'Authentication required: please sign in with oauth-personal');
      return;
    }
    if (auth.expired) {
      fail(id, -32000, 'OAuth token expired: invalid_grant');
      return;
    }
    const sessionId = String(params.sessionId ?? '');
    const session = readSession(sessionId);
    if (!session) {
      fail(id, -32602, `Invalid session identifier "${sessionId}"`);
      return;
    }
    const appendPrompt = params?._meta?.antigravity?.systemPrompt?.append;
    if (typeof appendPrompt === 'string') {
      session.appendPrompt = appendPrompt;
    }
    // Real agy 1.5.8 keeps --dangerously-skip-permissions in ServerConfig memory only;
    // resuming without the flag restores default permission checks.
    session.mode = skipPermissions ? 'auto' : 'default';
    writeSession(session);
    appendLog('fixture-sessions.jsonl', { method, sessionId, cwd: params.cwd, appendPrompt: appendPrompt ?? null, skipPermissions });
    if (method === 'session/load') {
      for (const entry of session.messages ?? []) {
        if (entry.role === 'user') {
          notify('session/update', {
            sessionId,
            update: { sessionUpdate: 'user_message_chunk', messageId: entry.id, content: { type: 'text', text: entry.text } },
          });
        } else if (entry.role === 'assistant') {
          notify('session/update', {
            sessionId,
            update: { sessionUpdate: 'agent_message_chunk', messageId: entry.id, content: { type: 'text', text: entry.text } },
          });
        } else if (entry.role === 'tool') {
          notify('session/update', {
            sessionId,
            update: {
              sessionUpdate: 'tool_call',
              toolCallId: entry.id,
              title: entry.title,
              kind: entry.kind,
              rawInput: entry.input,
              status: entry.status ?? 'completed',
              content: [{ type: 'content', content: { type: 'text', text: entry.text ?? '' } }],
            },
          });
        }
      }
    }
    result(id, buildSessionPayload(session, auth));
    return;
  }

  if (method === 'session/set_model') {
    const session = readSession(String(params.sessionId ?? ''));
    if (!session) {
      fail(id, -32602, 'Session not found');
      return;
    }
    const auth = currentAuth();
    if (scenario() === 'series-catalog') { result(id, {}); return; }
    const available = catalogModels(auth).map(item => item.modelId);
    if (!available.includes(params.modelId)) {
      fail(id, -32602, `Unknown model: ${String(params.modelId)}`);
      return;
    }
    if (scenario() !== 'model-readback-mismatch') {
      session.model = params.modelId;
      writeSession(session);
    }
    appendLog('fixture-configs.jsonl', { method, sessionId: session.id, modelId: params.modelId });
    result(id, buildSessionPayload(session, auth));
    return;
  }

  if (method === 'session/set_config_option') {
    const session = readSession(String(params.sessionId ?? ''));
    if (!session) {
      fail(id, -32602, 'Session not found');
      return;
    }
    const auth = currentAuth();
    const { configId, value } = params;
    if (configId === 'model' && scenario() !== 'model-readback-mismatch') {
      session.model = value;
    } else if (configId === 'thought_level' && scenario() !== 'effort-readback-mismatch') {
      session.thoughtLevel = value;
    } else if (configId === 'mode' && scenario() !== 'mode-readback-mismatch') {
      session.mode = value;
    }
    writeSession(session);
    appendLog('fixture-configs.jsonl', { method, sessionId: session.id, configId, value });
    const payload = buildSessionPayload(session, auth);
    result(id, scenario() === 'series-catalog' ? { configOptions: payload.configOptions } : payload);
    return;
  }

  if (method === 'session/set_mode') {
    const session = readSession(String(params.sessionId ?? ''));
    if (!session) {
      fail(id, -32602, 'Session not found');
      return;
    }
    if (scenario() !== 'mode-readback-mismatch') {
      session.mode = params.modeId;
      writeSession(session);
    }
    result(id, buildSessionPayload(session, currentAuth()));
    return;
  }

  if (method === 'session/prompt') {
    void runPrompt(id, params);
    return;
  }

  if (method === 'session/cancel') {
    appendLog('fixture-cancels.jsonl', params);
    if (activePrompt && activePrompt.sessionId === params.sessionId) {
      activePrompt.cancelled = true;
      if (activePrompt.onCancel) {
        activePrompt.onCancel();
      } else if (scenario() !== 'cancel-ignored') {
        settleAllServerRequests();
      }
    }
    return;
  }

  if (method === 'session/close') {
    result(id, {});
    return;
  }

  if (method === 'session/list') {
    const sessionId = typeof params.sessionId === 'string' ? params.sessionId : undefined;
    if (sessionId) {
      const s = readSession(sessionId);
      result(id, { sessions: s ? [{ sessionId: s.id, cwd: s.cwd, title: s.title ?? '' }] : [] });
      return;
    }
    result(id, { sessions: [] });
    return;
  }

  fail(id, -32601, `Method not found: ${method}`);
}

let buffer = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  buffer += chunk;
  let newline;
  while ((newline = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, newline);
    buffer = buffer.slice(newline + 1);
    if (!line.trim()) continue;
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    handleMessage(parsed);
  }
});
