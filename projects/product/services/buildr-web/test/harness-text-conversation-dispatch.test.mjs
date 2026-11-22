import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import ts from 'typescript';

const facade = source => ({ url: 'data:text/javascript,' + encodeURIComponent(source), shortCircuit: true });

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.endsWith('.css')) return facade('export default {};');
    if (context.parentURL?.endsWith('/AgentConversationsContext.tsx')) {
      if (specifier === 'react/jsx-runtime') {
        return facade('export const jsx = (type, props) => typeof type === "function" ? type(props) : { type, props }; export const jsxs = jsx; export const Fragment = Symbol.for("react.fragment");');
      }
      if (specifier === 'react') {
        return facade([
          'export const createContext = initial => ({ Provider: ({ value }) => value, _currentValue: initial });',
          'export const useContext = () => globalThis.__agentConvHarness.context;',
          'export const useCallback = fn => fn;',
          'export const useMemo = fn => fn();',
          'export const useEffect = () => undefined;',
          'export const useRef = initial => globalThis.__agentConvHarness.useRef(initial);',
          'export const useState = initial => globalThis.__agentConvHarness.useState(initial);',
        ].join('\n'));
      }
      if (specifier.includes('/api/')) {
        return facade('export const agentConversationsApi = new Proxy({}, { get: () => async () => ({ models: [], hasSnapshot: false, connections: [], workspaceId: "ws-1" }) }); export const setAgentConversationsWorkspace = () => undefined;');
      }
      if (specifier.includes('AppShellContext')) {
        return facade('export const useAppShell = () => ({ workspaceId: "ws-1", workspace: { name: "演示", rootPath: "/workspace" } }); export const useOptionalAppShell = () => useAppShell();');
      }
    }
    if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL?.includes('/services/buildr-web/src/')) {
      const candidate = new URL(`${specifier}.ts`, context.parentURL);
      if (existsSync(candidate)) return next(candidate.href, context);
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith('/AgentConversationsContext.tsx')) {
      const source = readFileSync(new URL(url), 'utf8');
      return {
        format: 'module',
        source: ts.transpileModule(source, {
          compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
        }).outputText,
        shortCircuit: true,
      };
    }
    return next(url, context);
  },
});

const storageMap = new Map();
const mockStorage = {
  getItem: key => (storageMap.has(key) ? storageMap.get(key) : null),
  setItem: (key, value) => storageMap.set(key, String(value)),
  removeItem: key => storageMap.delete(key),
  clear: () => storageMap.clear(),
};
const noopStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
  clear: () => undefined,
};
const mockLocation = { pathname: '/workspace-overview', search: '', hash: '', href: 'http://127.0.0.1/workspace-overview' };
const mockWindow = {
  innerWidth: 1280,
  location: mockLocation,
  sessionStorage: mockStorage,
  localStorage: noopStorage,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
};

function withBrowserGlobals(run) {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousLocation = Object.getOwnPropertyDescriptor(globalThis, 'location');
  const previousSession = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  const previousLocal = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'window', { value: mockWindow, configurable: true, writable: true });
  Object.defineProperty(globalThis, 'location', { value: mockLocation, configurable: true, writable: true });
  Object.defineProperty(globalThis, 'sessionStorage', { value: mockStorage, configurable: true, writable: true });
  Object.defineProperty(globalThis, 'localStorage', { value: noopStorage, configurable: true, writable: true });
  return Promise.resolve().then(run).finally(() => {
    for (const [key, prev] of [['window', previousWindow], ['location', previousLocation], ['sessionStorage', previousSession], ['localStorage', previousLocal]]) {
      if (prev) Object.defineProperty(globalThis, key, prev);
      else delete globalThis[key];
    }
  });
}

let activeHarness;
globalThis.__agentConvHarness = {
  context: null,
  useRef(initial) { return activeHarness.useRef(initial); },
  useState(initial) { return activeHarness.useState(initial); },
};

const { AgentConversationsProvider } = await import('../src/features/harness-ui/AgentConversationsContext.tsx');

function mountContext() {
  storageMap.clear();
  const stateSlots = [];
  const refSlots = [];
  let stateCursor = 0;
  let refCursor = 0;
  activeHarness = {
    useRef(initial) {
      const index = refCursor++;
      return (refSlots[index] ??= { current: initial });
    },
    useState(initial) {
      const index = stateCursor++;
      if (!(index in stateSlots)) stateSlots[index] = typeof initial === 'function' ? initial() : initial;
      const setter = next => {
        stateSlots[index] = typeof next === 'function' ? next(stateSlots[index]) : next;
      };
      return [stateSlots[index], setter];
    },
  };
  const render = () => {
    stateCursor = 0;
    refCursor = 0;
    return AgentConversationsProvider({ children: null });
  };
  return { render };
}

test('startTextConversation 仅在启动成功或需核对恢复时才展开对话侧栏，不可用时不误展开', () => withBrowserGlobals(async () => {
  const { render } = mountContext();
  let ctx = render();
  assert.equal(ctx.open, false);

  const unavailablePromise = ctx.startTextConversation({ prompt: '运行配置' });
  ctx = render();
  assert.equal(ctx.open, false, '提交文本对话期间不应提前展开侧栏');
  assert.equal(ctx.command?.action, 'start-text');
  const firstRequestId = ctx.command?.requestId;
  assert.ok(firstRequestId);

  ctx.reply(firstRequestId, { status: 'unavailable', message: '未连接内部智能体' });
  const unavailableResult = await unavailablePromise;
  ctx = render();
  assert.equal(unavailableResult.status, 'unavailable');
  assert.equal(ctx.open, false, '智能体不可用返回后侧栏仍应保持收起');

  const startedPromise = ctx.startTextConversation({ prompt: '运行配置' });
  ctx = render();
  const secondRequestId = ctx.command?.requestId;
  assert.ok(secondRequestId);
  assert.equal(ctx.open, false);

  ctx.reply(secondRequestId, { status: 'started', conversationId: 'conv-1' });
  const startedResult = await startedPromise;
  ctx = render();
  assert.equal(startedResult.status, 'started');
  assert.equal(ctx.open, true, '会话启动成功后应自动展开对话侧栏');

  ctx.setOpen(false);
  ctx = render();
  assert.equal(ctx.open, false);

  const recoveringPromise = ctx.startTextConversation({ prompt: '运行配置' });
  ctx = render();
  const thirdRequestId = ctx.command?.requestId;
  ctx.reply(thirdRequestId, { status: 'recovering', reason: 'submission-unknown', message: '请核对' });
  const recoveringResult = await recoveringPromise;
  ctx = render();
  assert.equal(recoveringResult.status, 'recovering');
  assert.equal(ctx.open, true, '进入未知恢复态时应展开对话侧栏供用户核对');

  ctx.setOpen(false);
  ctx = render();
  await ctx.openConversation('ws-1', 'conv-1');
  ctx = render();
  assert.equal(ctx.open, true, '显式打开已有对话仍应立即展开侧栏');
}));
