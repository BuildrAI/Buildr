import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { App } from 'antd';
import { childConversationStatus,childCreationStorageKey,mergeChildConversations,readChildCreation } from '../../src/features/agent-conversations/conversation-children.ts';

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
const { ConversationPanel } = await import('../../src/features/agent-conversations/ConversationPanel.tsx');
const { ConversationHistory } = await import('../../src/features/agent-conversations/ConversationHistory.tsx');
const { createConversationHistoryCache } = await import('../../src/features/agent-conversations/conversation-history-page.ts');
const { HISTORY_GROUP_LIMIT } = await import('../../src/features/agent-conversations/conversation-history-groups.ts');
const { useChildConversation } = await import('../../src/features/agent-conversations/useChildConversation.ts');

const row=(id,createdAt,fields={})=>({id,workspaceId:'workspace',updatedAt:'2026-10-29',childOf:{createdAt},...fields});

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

function createPanelContextValue(overrides = {}) {
  const no = () => {};
  const asyncNo = async () => {};
  const now = '2026-11-22T00:00:00.000Z';
  const selection = { workspaceId: 'w', conversationId: 'parent-1', generation: 1 };
  const conversation = {
    id: 'parent-1',
    title: '主对话',
    cwd: '/fixture',
    workspaceId: 'w',
    revision: 'rev-1',
    hidden: false,
    createdAt: now,
    updatedAt: now,
    participants: [{ id: 'p1', connectionId: 'codex', provider: 'codex', label: 'Codex', model: 'gpt-5', contextId: 'ctx-1', deliveredThrough: 1 }],
    requests: [],
    entries: [{ id: 'e1', sequence: 1, kind: 'message', role: 'user', text: '检查顶栏', participantId: 'p1', provider: 'codex', runId: 'r1', status: 'accepted', createdAt: now }],
    run: { id: 'r1', participantId: 'p1', provider: 'codex', model: 'gpt-5', generation: 'g1', status: 'completed', accepted: true, tools: [], startedAt: now, updatedAt: now },
  };
  return {
    activityCounts: { pending: 0, unread: 0, decisions: 0, running: 0 },
    activityStats: { agents: [], models: [] },
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
    scope: selection.scope ?? selection,
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

function renderConversationPanel(contextValue, panelProps = {}) {
  const workspaces = [{ id: 'w', name: 'Buildr', rootPath: '/fixture' }];
  return withDomGlobals(() => renderToStaticMarkup(React.createElement(App, null,
    React.createElement(ConversationHostProvider, { host: { standalone: true } },
      React.createElement(AgentConversationsViewProvider, { value: contextValue },
        React.createElement(ConversationPanel, { workspaces, defaultWorkspaceId: 'w', ...panelProps }))))));
}
test('子对话以创建次序保留全部入口，刷新和分页不重复且不按输出跳动',()=>{
  const a=row('a','2026-01-01'),b=row('b','2026-01-02');
  const rows=mergeChildConversations([b,a],[{...b,title:'new'},row('c','2026-01-03')]);
  assert.deepEqual(rows.map(r=>r.id),['a','b','c']);assert.equal(rows[1].title,'new');
  assert.deepEqual(mergeChildConversations(rows,[b]).map(r=>r.id),['a','b','c']);
});
test('浮动入口复用主列表统一状态与文案而不把收起当作停止',()=>{
  for(const [status,expected] of [['running','执行中'],['waiting-approval','待决策'],['waiting-question','待决策'],['unknown','状态待确认'],['tools-active','后台作业运行中'],['failed','执行失败'],['stopped','已停止']])assert.equal(childConversationStatus(row('a','',{run:{status}})),expected);
  assert.equal(childConversationStatus(row('a','',{run:{status:'running'},activity:{version:2,seenThrough:2,pendingDecisionCount:1}})),'待决策');
  assert.equal(childConversationStatus(row('a','',{run:{status:'completed'},activity:{version:2,seenThrough:1}})),'待查看');
  assert.equal(childConversationStatus(row('a','',{activity:{version:1,seenThrough:1,pendingSend:{state:'waiting',reason:'等待投递',updatedAt:''}}})),'等待发送');
  assert.equal(childConversationStatus(row('a','',{activity:{version:1,seenThrough:1,pendingSend:{state:'failed',reason:'投递失败',updatedAt:''}}})),'发送失败');
  assert.equal(childConversationStatus(row('a','')),'尚未开始');
});
test('未知创建按父对话及配置隔离保存原请求，损坏存储不伪造请求',()=>{
  const parent={id:'parent',workspaceId:'workspace'},key=childCreationStorageKey(parent,'profile');
  assert.notEqual(key,childCreationStorageKey({...parent,id:'another'},'profile'));
  assert.notEqual(key,childCreationStorageKey(parent,'other-profile'));
  const input={expectedRevision:'observed-version',clientRequestId:'original-request'};
  assert.deepEqual(readChildCreation({getItem:()=>JSON.stringify(input)},key),input);
  for(const value of ['invalid','{}','{"expectedRevision":"r"}','null'])assert.equal(readChildCreation({getItem:()=>value},key),undefined);
  assert.equal(readChildCreation({getItem(){throw Error('unavailable');}},key),undefined);
});

test('顶栏仅在已有子智能体时显示子智能体入口且不展示独立参与者按钮', () => {
  const withoutSubagents = renderConversationPanel(createPanelContextValue());
  assert.doesNotMatch(withoutSubagents, /ac-subagent-entry/);
  assert.doesNotMatch(withoutSubagents, /aria-label="参与过此对话的智能体与模型"/);

  const base = createPanelContextValue();
  const withSubagent = renderConversationPanel(createPanelContextValue({
    conversation: {
      ...base.conversation,
      entries: [
        ...base.conversation.entries,
        {
          id: 'dispatch-1',
          sequence: 2,
          kind: 'notice',
          role: 'system',
          text: '子任务执行中',
          runId: 'r1',
          participantId: 'p1',
          createdAt: '2026-11-22T00:00:01.000Z',
          subagent: { key: 'review', label: '代码审查', status: 'running' },
        },
      ],
    },
  }));
  assert.match(withSubagent, /ac-subagent-entry/);
  assert.match(withSubagent, /aria-label="子智能体（1）"/);
});

test('分栏历史保留子对话可见性并在打开专注设置时隐藏子浮窗', () => {
  const observed = [];
  const base = createPanelContextValue({ full: true, view: 'history', open: true });
  renderConversationPanel(
    { ...base, settings: false },
    { accessory: (visible) => { observed.push(['history', visible]); return null; } },
  );
  renderConversationPanel(
    { ...base, settings: true },
    { accessory: (visible) => { observed.push(['settings', visible]); return null; } },
  );
  assert.deepEqual(observed, [['history', true], ['settings', false]]);
});

test('嵌入式子对话面板独立标识并隔离收起操作不折叠宿主对话', () => {
  const embeddedHtml = renderConversationPanel(createPanelContextValue(), { embedded: true });
  assert.match(embeddedHtml, /\bac-child-panel\b/);
  assert.match(embeddedHtml, /aria-label="收起子对话"/);

  let hostCollapsed = 0;
  let hostToggled = 0;
  let childClosed = 0;
  let childContext;
  const host = createPanelContextValue({
    setOpen: () => { hostCollapsed += 1; },
    toggle: () => { hostToggled += 1; },
  });
  const summary = row('child-1', '2026-11-22T00:00:00.000Z', { workspaceId: 'w', title: '子对话' });
  function ChildProbe() {
    childContext = useChildConversation(host, summary, true, () => { childClosed += 1; }, () => {});
    return null;
  }
  withDomGlobals(() => renderToStaticMarkup(React.createElement(ChildProbe)));
  childContext.setOpen(false);
  childContext.toggle();
  assert.equal(childClosed, 2);
  assert.equal(hostCollapsed, 0);
  assert.equal(hostToggled, 0);
});

test('对话列表将子对话展开按钮置于标题后方且不产生嵌套按钮', () => {
  const historyCache = createConversationHistoryCache();
  const key = JSON.stringify(['w', '', false, undefined, undefined, HISTORY_GROUP_LIMIT, JSON.stringify([])]);
  const parent = {
    id: 'parent-row',
    workspaceId: 'w',
    title: '父对话标题',
    updatedAt: '2026-11-22T00:00:00.000Z',
    run: { status: 'running', provider: 'codex', model: 'gpt-5' },
    activity: { version: 2, seenThrough: 2, active: true, updatedAt: '2026-11-22T00:00:00.000Z' },
  };
  const child = {
    id: 'child-row',
    workspaceId: 'w',
    title: '子对话标题',
    updatedAt: '2026-11-22T00:00:01.000Z',
    childOf: { workspaceId: 'w', conversationId: 'parent-row', createdAt: '2026-11-22T00:00:01.000Z' },
  };
  historyCache.pages.set(key, {
    page: { conversations: [parent, child], total: 2, hasMore: false },
    error: '',
    version: 'global:1',
  });
  const html = withDomGlobals(() => renderToStaticMarkup(React.createElement(App, null,
    React.createElement(ConversationHostProvider, { host: { standalone: true } },
      React.createElement(AgentConversationsViewProvider, { value: createPanelContextValue({ historyCache, view: 'history' }) },
        React.createElement(ConversationHistory, { workspaces: [{ id: 'w', name: 'Buildr', rootPath: '/fixture' }], defaultWorkspaceId: 'w' }))))));

  assert.match(html, /<div class="ac-history-row-main" data-conversation-id="parent-row">/);
  const openStart = html.indexOf('<button type="button" class="ac-history-row-open">');
  const toggleStart = html.indexOf('<button type="button" class="ac-history-child-toggle"');
  const statusStart = html.indexOf('class="ac-activity-status', openStart);
  assert.ok(openStart > 0 && toggleStart > openStart && statusStart > toggleStart, 'DOM 顺序应为标题按钮 → 子对话按钮 → 右侧状态');

  const headingMatch = html.match(/<span class="ac-history-row-heading">([\s\S]*?)<\/span><span class="ac-activity-status/);
  assert.ok(headingMatch, '标题与子对话按钮应同在 .ac-history-row-heading 内且位于状态之前');
  assert.match(headingMatch[1], /<button type="button" class="ac-history-row-open"><strong title="父对话标题">父对话标题<\/strong><\/button><button type="button" class="ac-history-child-toggle"/);
  assert.doesNotMatch(html, /<button\b[^>]*>(?:(?!<\/button>)[\s\S])*<button\b/, '不应出现 button 嵌套 button');
});

test('对话列表标题与子对话展开按钮样式确保紧邻标题且右侧状态与普通行对齐', () => {
  const activityCss = readFileSync(new URL('../../src/features/agent-conversations/conversation-activity.css', import.meta.url), 'utf8');
  const conversationCss = readFileSync(new URL('../../src/features/agent-conversations/agent-conversations.css', import.meta.url), 'utf8');

  assert.match(activityCss, /\.ac-history-row-title\{[^}]*display:flex;align-items:center;gap:10px;min-width:0\}/);
  assert.match(activityCss, /\.ac-history-row-heading\{[^}]*display:flex;align-items:center;gap:6px;flex:1;min-width:0\}/);
  assert.match(activityCss, /\.ac-history-row-open\{[^}]*flex:0 1 auto;min-width:0;max-width:100%;overflow:hidden/);
  assert.match(activityCss, /\.ac-history-row-open>strong\{[^}]*font-size:var\(--font-size-body\)[^}]*line-height:20px\}/);

  assert.match(conversationCss, /\.ac-history-row:has\(\.ac-history-row-open:focus-visible\)\{outline:1px solid var\(--soft-primary\);outline-offset:-1px\}/);
  assert.match(conversationCss, /\.ac-history-child-toggle\{[^}]*flex:none;[^}]*height:20px;[^}]*font-size:var\(--font-size-meta\)/);
  assert.match(conversationCss, /\.ac-history-child-toggle>\.anticon\{font-size:var\(--icon-size-tiny\)\}/);
  assert.doesNotMatch(conversationCss, /\.ac-history-row:not\(:has\(>\.ac-history-row-main>small\)\)\s*\.ac-history-child-toggle/);
});
