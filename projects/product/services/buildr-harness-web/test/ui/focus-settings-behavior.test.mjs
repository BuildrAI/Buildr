import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { App } from 'antd';

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.endsWith('.css')) return { url: 'data:text/javascript,export default {}', shortCircuit: true };
    if (specifier.replace(/\.ts$/, '').endsWith('/useConversationDraftPresence')) {
      return {
        url: 'data:text/javascript,export const useConversationDraftPresence=()=>[];export const useConversationDraftPresenceDetail=()=>({ids:[],byWorkspace:{},unscopedIds:[]});export const useConversationDraftSubmittedIds=()=>[];',
        shortCircuit: true,
      };
    }
    try { return next(specifier, context); }
    catch (cause) {
      if (!specifier.startsWith('.') || !context.parentURL?.includes('/src/')) throw cause;
      for (const suffix of ['.ts', '.tsx', '/index.ts', '/index.tsx']) {
        const url = new URL(specifier + suffix, context.parentURL);
        if (existsSync(fileURLToPath(url))) return next(url.href, context);
      }
      throw cause;
    }
  },
  load(url, context, next) {
    if (url.endsWith('.tsx')) {
      return {
        format: 'module',
        source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), {
          compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
        }).outputText,
        shortCircuit: true,
      };
    }
    return next(url, context);
  },
});

const { ConversationHostProvider } = await import('../../src/integration/ConversationHost.tsx');
const { AgentConversationsViewProvider } = await import('../../src/features/agent-conversations/AgentConversationsContext.tsx');
const { AgentConnectionSettings } = await import('../../src/features/agent-conversations/AgentConnectionSettings.tsx');
const { ConversationDockSurface } = await import('../../src/features/agent-conversations/ConversationDockSurface.tsx');
const { AccountQuotaButton } = await import('../../src/features/agent-conversations/AccountQuotaButton.tsx');
const { ConversationActivity } = await import('../../src/features/agent-conversations/ConversationActivity.tsx');
const { ConversationPanel } = await import('../../src/features/agent-conversations/ConversationPanel.tsx');

function withDomGlobals(fn) {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const fakeWindow = { innerWidth: 1440, addEventListener() {}, removeEventListener() {} };
  fakeWindow.parent = fakeWindow;
  globalThis.window = fakeWindow;
  globalThis.document = { querySelector: () => null, visibilityState: 'visible', addEventListener() {}, removeEventListener() {} };
  try { return fn(); }
  finally {
    if (previousWindow === undefined) delete globalThis.window; else globalThis.window = previousWindow;
    if (previousDocument === undefined) delete globalThis.document; else globalThis.document = previousDocument;
  }
}

function createContextValue(overrides = {}) {
  const no = () => {};
  const asyncNo = async () => {};
  const now = '2026-11-22T00:00:00.000Z';
  const selection = { workspaceId: 'w', conversationId: 'conv-1', generation: 1 };
  const conversation = {
    id: 'conv-1',
    title: '设置测试对话',
    cwd: '/fixture',
    workspaceId: 'w',
    revision: 'rev-1',
    hidden: false,
    createdAt: now,
    updatedAt: now,
    participants: [{ id: 'p1', connectionId: 'codex', provider: 'codex', label: 'Codex', model: 'gpt-5', contextId: 'ctx-1', deliveredThrough: 1 }],
    requests: [],
    entries: [{ id: 'e1', sequence: 1, kind: 'message', role: 'user', text: '检查设置面板', participantId: 'p1', provider: 'codex', runId: 'r1', status: 'accepted', createdAt: now }],
    run: { id: 'r1', participantId: 'p1', provider: 'codex', model: 'gpt-5', generation: 'g1', status: 'completed', accepted: true, tools: [], startedAt: now, updatedAt: now },
  };
  return {
    activityCounts: { pendingSend: 0, sendFailed: 0, active: 0, running: 0, waiting: 0, unseen: 0, unknown: 0, attention: 0 },
    activityStats: { agents: [], models: [], executions: [], modelExecutions: [] },
    activityRows: [],
    activityTotal: 0,
    activityError: '',
    activityTick: 1,
    historyWorkspaceId: null,
    openHistory: no,
    refreshActivity: asyncNo,
    loadMoreActivity: asyncNo,
    markSeen: asyncNo,
    api: new Proxy({}, { get: () => asyncNo }),
    reconnecting: false,
    recovering: false,
    open: true,
    side: 'right',
    full: true,
    view: 'conversation',
    scope: { workspaceId: 'w', conversationId: 'conv-1' },
    draftScope: null,
    conversation,
    connections: [{ id: 'codex', provider: 'codex', label: 'Codex', enabled: true, status: 'ready', capabilities: { images: false, permissions: ['default', 'full-access'] }, models: [{ id: 'gpt-5', label: 'GPT-5' }] }],
    connectionsReady: true,
    connectionsLoading: false,
    connectionsError: '',
    pending: [],
    modelCatalog: [],
    modelCatalogReady: true,
    modelCatalogError: '',
    refreshModelCatalog: asyncNo,
    loading: false,
    error: '',
    streamError: '',
    settings: false,
    setSettings: no,
    setOpen: no,
    setFull: no,
    setView: no,
    move: no,
    openGlobal: no,
    toggle: no,
    toggleView: no,
    openConversation: asyncNo,
    newConversation: no,
    refresh: asyncNo,
    refreshConnections: asyncNo,
    refreshPending: asyncNo,
    apply: no,
    prependEntries: no,
    updateConnection: no,
    selectionGeneration: 1,
    getSelection: () => selection,
    isSelectionCurrent: () => true,
    seenActivities: {},
    create: asyncNo,
    ...overrides,
  };
}

function renderWithHost(contextValue, element, host = { standalone: true }) {
  return withDomGlobals(() => renderToStaticMarkup(React.createElement(App, null,
    React.createElement(ConversationHostProvider, { host },
      React.createElement(AgentConversationsViewProvider, { value: contextValue }, element)))));
}

test('专注主区打开设置时渲染完整设置视图与 Esc 关闭提示，关闭时不渲染主区设置容器', () => {
  const openHtml = renderWithHost(
    createContextValue({ settings: true, full: true }),
    React.createElement(AgentConnectionSettings, { inMain: true }),
  );
  assert.match(openHtml, /<section[^>]*id="agent-focus-settings"/);
  assert.match(openHtml, /<h1[^>]*id="agent-focus-settings-heading"[^>]*>设置<\/h1>/);
  for (const label of ['模型', '智能体', '程序接入', '系统提示词']) {
    assert.ok(openHtml.includes(label), `focus settings should render nav item "${label}"`);
  }
  assert.match(openHtml, /aria-label="关闭设置"/);
  assert.ok(openHtml.includes('按 Esc 关闭'));

  const closedHtml = renderWithHost(
    createContextValue({ settings: false, full: true }),
    React.createElement(AgentConnectionSettings, { inMain: true }),
  );
  assert.equal(closedHtml.includes('id="agent-focus-settings"'), false);
});

test('ConversationDockSurface 正确透传设置激活状态、侧栏切换与扩展入口', () => {
  const no = () => {};
  const html = withDomGlobals(() => renderToStaticMarkup(React.createElement(App, null,
    React.createElement(ConversationDockSurface, {
      panel: React.createElement('div', { 'data-slot': 'panel' }),
      activity: React.createElement('div', { 'data-slot': 'activity' }),
      focusSettings: true,
      quotaEntry: React.createElement('button', { type: 'button', 'aria-label': '额度入口' }),
      settingsActive: true,
      open: true,
      full: true,
      side: 'right',
      width: 420,
      onToggle: no,
      onNew: no,
      onSettings: no,
      onQuota: no,
    }))));
  assert.ok(html.includes('data-slot="panel"'));
  assert.ok(html.includes('data-slot="activity"'));
  assert.match(html, /id="agent-focus-settings-entry"/);
  assert.match(html, /aria-controls="agent-focus-settings"/);
  assert.match(html, /aria-pressed="true"/);
  assert.ok(html.includes('aria-label="额度入口"'));
  assert.match(html, /ac-account-settings is-active/);
});

test('AccountQuotaButton 根据 dedicated 参数区分供应商额度与设置标签', () => {
  const dedicatedHtml = renderWithHost(
    createContextValue(),
    React.createElement(AccountQuotaButton, { dedicated: true, onClick: () => {} }),
  );
  assert.match(dedicatedHtml, /aria-label="供应商额度"/);

  const settingsHtml = renderWithHost(
    createContextValue(),
    React.createElement(AccountQuotaButton, { dedicated: false, onClick: () => {} }),
  );
  assert.match(settingsHtml, /aria-label="设置"/);
});

test('ConversationActivity 在专注设置打开时取消历史入口激活态', () => {
  const workspaces = [{ id: 'w', name: 'Buildr', rootPath: '/fixture' }];
  const historyActiveHtml = renderWithHost(
    createContextValue({ open: true, full: true, view: 'history', settings: false }),
    React.createElement(ConversationActivity, { workspaces }),
  );
  assert.match(historyActiveHtml, /ac-all-conversations is-active/);
  assert.doesNotMatch(historyActiveHtml, /NaN|undefined/);

  const settingsOpenHtml = renderWithHost(
    createContextValue({ open: true, full: true, view: 'history', settings: true }),
    React.createElement(ConversationActivity, { workspaces }),
  );
  assert.doesNotMatch(settingsOpenHtml, /ac-all-conversations is-active/);
  assert.match(settingsOpenHtml, /aria-pressed="false"/);
});

test('ConversationPanel 在专注模式下打开设置时隐藏历史分栏与分隔条，关闭设置时恢复展示', () => {
  const workspaces = [{ id: 'w', name: 'Buildr', rootPath: '/fixture' }];
  const historyOpenHtml = renderWithHost(
    createContextValue({ open: true, full: true, view: 'history', settings: false }),
    React.createElement(ConversationPanel, { development: true, workspaces, defaultWorkspaceId: 'w' }),
    { standalone: false },
  );
  assert.match(historyOpenHtml, /<aside[^>]*class="ac-focus-history-pane"/);
  assert.doesNotMatch(historyOpenHtml, /<aside[^>]*class="ac-focus-history-pane"[^>]*hidden(?:=|>|\s)/);
  assert.match(historyOpenHtml, /class="[^"]*ac-focus-history-divider/);
  assert.equal(historyOpenHtml.includes('id="agent-focus-settings"'), false);

  const settingsOpenHtml = renderWithHost(
    createContextValue({ open: true, full: true, view: 'history', settings: true }),
    React.createElement(ConversationPanel, { development: true, workspaces, defaultWorkspaceId: 'w' }),
    { standalone: false },
  );
  assert.match(settingsOpenHtml, /id="agent-focus-settings"/);
  assert.match(settingsOpenHtml, /<aside[^>]*class="ac-focus-history-pane"[^>]*\shidden(?:=""|\s|>)/);
  assert.doesNotMatch(settingsOpenHtml, /class="[^"]*ac-focus-history-divider/);
});
