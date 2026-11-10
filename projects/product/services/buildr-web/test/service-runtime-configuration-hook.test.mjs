import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';

const facade = source => ({ url: 'data:text/javascript,' + encodeURIComponent(source), shortCircuit: true });
registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.endsWith('/hooks/useRuntimeConfiguration.ts')) {
      if (specifier === 'react') return facade(['useCallback', 'useEffect', 'useRef', 'useState'].map(name => `export const ${name}=(...args)=>globalThis.__configurationHarness.${name}(...args);`).join('\n'));
      if (specifier === 'antd') return facade('export const App={useApp:()=>({message:globalThis.__configurationHarness.message})};');
      if (specifier.endsWith('/AppShellContext')) return facade('export const useAppShell=()=>({workspaceId:"workspace-one",workspace:{name:"演示",rootPath:"/workspace"}});');
      if (specifier.endsWith('/AgentConversationsContext')) return facade('export const useOptionalAgentConversations=()=>({startTextConversation:globalThis.__configurationHarness.start,openConversation:(...args)=>globalThis.__configurationHarness.openConversation(...args)});');
      if (specifier.endsWith('/service-runtime-api')) return facade('export const SERVICE_RUNTIME_CHANGED="runtime-changed";');
      if (specifier === '../configurationAction') return next(new URL('../configurationAction.ts', context.parentURL).href, context);
    }
    return next(specifier, context);
  },
});
const { useRuntimeConfiguration } = await import('../src/features/service-runtime/hooks/useRuntimeConfiguration.ts');
const { clearRuntimeConfigurationHandoff, readRuntimeConfigurationHandoff } = await import('../src/features/service-runtime/runtimeConfigurationHandoff.ts');

test('共享配置钩子先展示交接，确认后才提交并保留可恢复的交接记录', async () => {
  const slots = [], messages = [], opened = [];
  let cursor = 0, calls = 0, release;
  const harness = globalThis.__configurationHarness = {
    useCallback: fn => fn,
    useEffect: () => undefined,
    useRef(value) { const index = cursor++; return slots[index] ||= { current: value }; },
    useState(value) {
      const index = cursor++;
      slots[index] ??= { value };
      return [slots[index].value, next => { slots[index].value = next; }];
    },
    message: {
      warning: text => messages.push(['warning', text]),
      info: text => messages.push(['info', text]),
      error: text => messages.push(['error', text]),
    },
    start: () => { calls++; return new Promise(resolve => { release = resolve; }); },
    openConversation: (workspaceId, conversationId) => { opened.push([workspaceId, conversationId]); return Promise.resolve(); },
  };
  const render = () => { cursor = 0; return useRuntimeConfiguration(); };
  const service = { code: 'front', name: '前端' };
  const definition = {
    source: 'agent',
    verifiedAt: '2026-11-02T00:00:00.000Z',
    path: '/workspace/services/front/runtime.yml',
    local: { command: ['node', 'server.mjs'], cwd: '.', profile: null, preferredPort: 3000, portOverride: null, readiness: { kind: 'log', pattern: 'ready' }, timeoutSeconds: 30 },
  };
  try {
    render().open(service);
    assert.equal(calls, 0, '打开交接不提交');
    assert.deepEqual(render().target, service);
    assert.equal(render().feedback, null);
    assert.equal(render().submitting, false);
    assert.equal(render().pending, null);

    const submitting = render().submit();
    assert.equal(calls, 1);
    await render().submit();
    assert.equal(calls, 1, '提交中重复确认不创建第二个请求');
    assert.equal(render().submitting, true);
    render().open({ code: 'other', name: '其他' });
    render().close();
    assert.deepEqual(render().target, service, '提交中不能切走或关闭交接');
    release({ status: 'started', conversation: { id: 'conversation-one' } });
    await submitting;
    const pending = render().pending;
    assert.equal(render().target, null);
    assert.equal(render().submitting, false);
    assert.equal(render().feedback, null);
    assert.equal(pending.workspaceId, 'workspace-one');
    assert.equal(pending.code, 'front');
    assert.equal(pending.name, '前端');
    assert.equal(pending.conversationId, 'conversation-one');
    assert.equal(pending.baseline, null, '首次配置没有旧运行定义');
    assert.ok(Date.parse(pending.startedAt), '记录交接时间');
    assert.deepEqual(readRuntimeConfigurationHandoff('workspace-one'), pending, '交接记录可被刷新后的页面读取');

    render().open({ code: 'front', name: '前端' });
    assert.deepEqual(opened.at(-1), ['workspace-one', 'conversation-one'], '进行中的服务入口回到原对话');
    assert.deepEqual(render().target, null, '不打开第二个可提交的交接');

    render().open({ code: 'other', name: '其他' });
    assert.deepEqual(messages.at(-1), ['info', '上一项运行配置仍在进行，请等待完成或查看原对话后再开始新的配置。']);
    assert.deepEqual(render().target, null, '待完成时不打开第二项配置');
    clearRuntimeConfigurationHandoff('workspace-one', 'conversation-one');
    assert.equal(render().pending, null);

    harness.start = async () => ({ status: 'started', conversation: { id: 'conversation-two' } });
    render().open({ ...service, definition });
    await render().submit();
    assert.equal(render().pending.conversationId, 'conversation-two');
    assert.match(render().pending.baseline, /2026-11-02T00:00:00\.000Z/, '已有配置记录旧定义快照');
    clearRuntimeConfigurationHandoff('workspace-one', 'conversation-two');

    harness.start = async () => ({ status: 'unavailable', message: '尚未接入内部智能体' });
    render().open(service);
    await render().submit();
    assert.deepEqual(render().feedback, { tone: 'warning', message: '尚未接入内部智能体', copyFirst: true });
    assert.deepEqual(render().target, service, '未接入时同一抽屉保留复制交接');
    assert.equal(render().pending, null, '未创建对话时不留下交接记录');
    render().close();
    assert.equal(render().target, null);
    assert.equal(render().feedback, null);

    harness.start = async () => ({ status: 'busy', message: '已有一项操作正在提交' });
    render().open(service);
    await render().submit();
    assert.deepEqual(render().feedback, { tone: 'warning', message: '已有一项操作正在提交', copyFirst: false });
    assert.deepEqual(render().target, service);
    render().close();

    harness.start = async () => ({ status: 'recovering', message: '先核对原请求，本次未重复发送。' });
    render().open(service);
    await render().submit();
    assert.deepEqual(messages.at(-1), ['warning', '先核对原请求，本次未重复发送。']);
    assert.equal(render().target, null, '已恢复原提交时关闭交接，由原对话展示状态');
    assert.equal(render().feedback, null);
    assert.equal(render().pending, null, '恢复路径不推断新的完成状态');
  } finally {
    delete globalThis.__configurationHarness;
  }
});
