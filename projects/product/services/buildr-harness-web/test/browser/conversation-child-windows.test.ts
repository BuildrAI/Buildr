import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const fixture = `
import {createElement as h,useCallback,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {App,ConfigProvider} from 'antd';
import {softProductTheme} from '/src/theme.ts';
import {ConversationHostProvider} from '/src/integration/ConversationHost.tsx';
import {ConversationWorkspace} from '/src/features/agent-conversations/ConversationWorkspace.tsx';
import {AgentConversationsViewProvider} from '/src/features/agent-conversations/AgentConversationsContext.tsx';
import 'antd/dist/reset.css';import '/src/shared.css';import '/src/styles.css';import '/src/shell/harness-shell.css';

const now = new Date().toISOString();
const workspace = {id:'w',name:'Buildr',rootPath:'/fixture'};
const parent = {
  id:'parent-1',
  title:'主对话分栏子浮窗验证',
  cwd:'/fixture',
  workspaceId:'w',
  revision:'rev-1',
  hidden:false,
  createdAt:now,
  updatedAt:now,
  participants:[{id:'p1',connectionId:'codex',provider:'codex',label:'Codex',model:'gpt-5',contextId:'ctx-1',deliveredThrough:1}],
  requests:[],
  entries:[
    {id:'e1',sequence:1,kind:'message',role:'user',text:'检查顶栏与子对话',participantId:'p1',provider:'codex',runId:'r1',status:'accepted',createdAt:now},
    {id:'e2',sequence:2,kind:'message',role:'assistant',text:'主对话回复内容',participantId:'p1',provider:'codex',runId:'r1',status:'completed',createdAt:now},
  ],
  nextEntryCursor:1,
  run:{id:'r1',participantId:'p1',provider:'codex',model:'gpt-5',generation:'g1',status:'completed',accepted:true,tools:[],startedAt:now,updatedAt:now},
};

const children = new Map();
let childCounter = 0;
const listResult = async () => ({conversations:[],total:0,activityCounts:{pending:0,unread:0,decisions:0,running:0},revision:'1',stats:{agents:[],models:[]}});
const asyncNo = async () => {};

const api = new Proxy({
  list: async () => ({conversations:[],nextCursor:undefined}),
  listAll: listResult,
  activitySummary: listResult,
  modelAccounts: async () => ({accounts:[],providers:[]}),
  modelCatalog: async () => ({models:[],hasSnapshot:true}),
  connections: async () => ({connections:[]}),
  children: async () => ({conversations:[...children.values()]}),
  createChild: async (conv, input) => {
    const id = 'child-' + (++childCounter);
    const created = {
      id,
      workspaceId: conv.workspaceId,
      cwd: conv.cwd,
      title: '新对话',
      revision: 'child-rev-' + childCounter,
      hidden: false,
      updatedAt: new Date().toISOString(),
      participants: [],
      entries: [],
      requests: [],
      childOf: {
        conversationId: conv.id,
        workspaceId: conv.workspaceId,
        title: conv.title,
        sourceRevision: input.expectedRevision,
        throughSequence: 2,
        createdAt: new Date().toISOString(),
      },
    };
    children.set(id, created);
    return created;
  },
  read: async (_w, id) => (id === parent.id ? parent : children.get(id) ?? parent),
  seen: async () => ({activity:{version:0,seenThrough:0,active:false,updatedAt:now}}),
  subscribe: (_w, _id, signal) => new Promise((resolve) => {
    if (signal.aborted) { resolve(); return; }
    signal.addEventListener('abort', () => resolve(), {once:true});
  }),
}, {
  get(target, key) { return target[key] ?? asyncNo; },
});

const layoutCalls = [];
window.__layoutCalls = layoutCalls;

function Fixture() {
  const [settings, setSettings] = useState(false);
  const [view, setView] = useState('history');
  const [open, setOpen] = useState(true);
  const [full, setFull] = useState(true);
  const selection = {workspaceId:'w',conversationId:parent.id,generation:1};
  const no = useCallback(() => {}, []);
  window.__setFocusSettings = setSettings;

  const value = {
    activityCounts:{pending:0,unread:0,decisions:0,running:0},
    activityStats:{agents:[],models:[]},
    activityRows:[],
    activityTotal:0,
    activityError:'',
    activityTick:1,
    historyWorkspaceId:null,
    openHistory:no,
    refreshActivity:asyncNo,
    loadMoreActivity:asyncNo,
    markSeen:asyncNo,
    api,
    reconnecting:false,
    recovering:false,
    open,
    side:'left',
    full,
    view,
    scope:selection,
    draftScope:null,
    conversation:parent,
    connections:[{id:'codex',provider:'codex',label:'Codex',enabled:true,status:'ready',capabilities:{images:false,permissions:['default','full-access']},models:[{id:'gpt-5',label:'GPT-5'}]}],
    connectionsReady:true,
    pending:[],
    modelCatalog:[],
    modelCatalogReady:true,
    modelCatalogError:'',
    refreshModelCatalog:asyncNo,
    loading:false,
    error:'',
    streamError:'',
    settings,
    setSettings,
    setOpen,
    setFull,
    setView,
    move:no,
    openGlobal:no,
    toggle:no,
    toggleView:no,
    openConversation:asyncNo,
    newConversation:no,
    refresh:asyncNo,
    refreshConnections:asyncNo,
    refreshPending:asyncNo,
    apply:no,
    prependEntries:no,
    updateConnection:no,
    selectionGeneration:1,
    getSelection:() => selection,
    isSelectionCurrent:() => true,
    create:asyncNo,
  };

  return h(ConversationHostProvider, {
    host: {
      standalone: true,
      requestLayout(action, nextFull) {
        layoutCalls.push({action, full: nextFull});
      },
    },
  }, h('main', {className:'harness-main', style:{height:'100%',display:'flex'}},
    h(AgentConversationsViewProvider, {value},
      h(ConversationWorkspace, {workspaces:[workspace], defaultWorkspaceId:'w'})
    )
  ));
}

createRoot(document.getElementById('root')).render(
  h(ConfigProvider, {theme:{...softProductTheme,cssVar:true,hashed:false}}, h(App, null, h(Fixture)))
);
`;

test('child conversation floating window works in split-history view, hides in focus settings, keeps header clean, and isolates child collapse', {timeout:45000}, async t => {
  let vite!: Awaited<ReturnType<typeof createServer>>;
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'buildr-child-windows-vite-'));
  const server = http.createServer((req, res) => {
    if (req.url !== '/') return vite.middlewares(req, res);
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end('<!doctype html><style>html,body,#root{height:100%;margin:0}#root>.ant-app{height:100%}</style><div id="root"></div><script type="module" src="/fixture.js"></script>');
  });
  vite = await createServer({
    root: new URL('../..', import.meta.url).pathname,
    cacheDir,
    configFile: false,
    esbuild: {jsx:'automatic'},
    optimizeDeps: {include:['react','react-dom/client','antd','@ant-design/icons']},
    server: {middlewareMode:true,hmr:{server}},
    appType: 'custom',
    logLevel: 'silent',
    plugins: [{
      name: 'child-windows-fixture',
      resolveId(id) { if (id === '/fixture.js') return id; },
      load(id) { if (id === '/fixture.js') return fixture; },
    }],
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await vite.close();
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    fs.rmSync(cacheDir, {recursive:true,force:true});
  });

  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.setDefaultTimeout(8000);

    await page.goto(`http://127.0.0.1:${address.port}`);
    await page.locator('.ac-focus-history-pane').waitFor({state:'visible'});
    const mainHeader = page.locator('#agent-conversation-panel > .ac-conversation-split > .ac-conversation-view .ac-thread-header');
    await mainHeader.waitFor({state:'visible'});

    assert.equal(await mainHeader.locator('.ac-subagent-entry').count(), 0, '无子智能体时不显示顶栏子智能体按钮');
    assert.equal(await mainHeader.getByRole('button', {name:'参与过此对话的智能体与模型',exact:true}).count(), 0, '顶栏不再展示独立参与者图标');

    await mainHeader.getByRole('button', {name:'更多对话操作',exact:true}).click();
    const popup = page.locator('.ac-more-menu-popup');
    await popup.waitFor({state:'visible'});
    await popup.locator('.ac-participant-history').getByText('参与过此对话', {exact:true}).waitFor({state:'visible'});
    const participantChip = popup.locator('.ac-participant-history .ac-participants').getByText('Codex · GPT-5', {exact:true});
    await participantChip.waitFor({state:'visible'});
    const participantStyle = await participantChip.evaluate(el => {
      const chip = getComputedStyle(el);
      const title = el.closest('.ac-participant-history')?.querySelector('.ac-participant-history-title');
      const menuItem = el.closest('.ac-more-menu-popup')?.querySelector('.ant-dropdown-menu-item');
      if (!title || !menuItem) return null;
      const titleRect = title.getBoundingClientRect();
      const itemStyle = getComputedStyle(menuItem);
      const itemTextLeft = menuItem.getBoundingClientRect().left + parseFloat(itemStyle.paddingLeft);
      return {
        borderTopStyle: chip.borderTopStyle,
        borderTopWidth: chip.borderTopWidth,
        titleLeft: titleRect.left,
        itemTextLeft,
      };
    });
    assert.ok(participantStyle, '应读取到参与者样式与菜单项定位');
    assert.equal(participantStyle.borderTopStyle, 'none', '参与过此对话条目应采用无边框样式');
    assert.equal(participantStyle.borderTopWidth, '0px', '参与过此对话条目边框宽度应为 0');
    assert.ok(Math.abs(participantStyle.titleLeft - participantStyle.itemTextLeft) <= 2, `参与者标题应与菜单项文本左对齐: ${JSON.stringify(participantStyle)}`);

    await page.getByRole('menuitem', {name:'创建子对话',exact:true}).click();
    const childWindow = page.locator('.ac-child-window:not([hidden])');
    const childInput = childWindow.getByRole('textbox', {name:'子对话输入',exact:true});
    await childInput.waitFor({state:'visible'});
    await childInput.fill('分栏模式保留的子对话草稿');

    const splitBox = await page.locator('#agent-conversation-panel > .ac-conversation-split').boundingBox();
    const historyBox = await page.locator('.ac-focus-history-pane').boundingBox();
    const childBox = await childWindow.boundingBox();
    assert.ok(splitBox && historyBox && childBox);
    assert.ok(childBox.x >= splitBox.x - 1 && childBox.x + childBox.width <= splitBox.x + splitBox.width + 1, '子对话浮窗应限定在主对话列内');
    assert.ok(childBox.x >= historyBox.x + historyBox.width - 1, '子对话浮窗不得遮挡左侧对话列表');

    const childEntry = page.locator('[data-child-entry="child-1"]');
    assert.equal(await childEntry.getAttribute('aria-expanded'), 'true');
    await childEntry.click();
    await childWindow.waitFor({state:'hidden'});
    await childEntry.click();
    await childInput.waitFor({state:'visible'});
    assert.equal(await childInput.inputValue(), '分栏模式保留的子对话草稿');

    await page.evaluate(() => ((window as unknown as {__setFocusSettings(v:boolean):void}).__setFocusSettings(true)));
    await childWindow.waitFor({state:'hidden'});
    await page.evaluate(() => ((window as unknown as {__setFocusSettings(v:boolean):void}).__setFocusSettings(false)));
    await childInput.waitFor({state:'visible'});
    assert.equal(await childInput.inputValue(), '分栏模式保留的子对话草稿');

    await childWindow.getByRole('button', {name:'更多对话操作',exact:true}).click();
    await page.getByRole('menuitem', {name:'收起对话',exact:true}).click();
    await childWindow.waitFor({state:'hidden'});
    assert.deepEqual(await page.evaluate(() => (window as unknown as {__layoutCalls:unknown[]}).__layoutCalls), [], '子对话菜单的收起对话不得联动折叠宿主面板');

    await page.setViewportSize({width:600,height:800});
    const backToConversation = page.getByRole('button', {name:'返回当前对话',exact:true});
    await backToConversation.waitFor({state:'visible'});
    await backToConversation.click();
    await childEntry.waitFor({state:'visible'});
    await childEntry.click();
    await childInput.waitFor({state:'visible'});
    const narrowChildBox = await childWindow.boundingBox();
    const narrowPanelStyle = await childWindow.locator('.ac-child-panel').evaluate(node => getComputedStyle(node).position);
    assert.equal(narrowPanelStyle, 'relative', '窄屏下子对话面板不得受 fixed 规则影响越界');
    assert.ok(narrowChildBox && narrowChildBox.x >= 0 && narrowChildBox.x + narrowChildBox.width <= 601 && narrowChildBox.y + narrowChildBox.height <= 801);

    assert.deepEqual(errors, []);
    await page.close();
  } finally {
    await browser.close();
  }
});
