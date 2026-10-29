import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';

const facade = source => ({ url: 'data:text/javascript,' + encodeURIComponent(source), shortCircuit: true });
registerHooks({
  resolve(specifier, context, next) {
    if (context.parentURL?.endsWith('/hooks/useRuntimeConfiguration.ts')) {
      if (specifier === 'react') return facade(['useCallback', 'useRef', 'useState'].map(name => `export const ${name}=(...args)=>globalThis.__configurationHarness.${name}(...args);`).join('\n'));
      if (specifier === 'antd') return facade('export const App={useApp:()=>({message:globalThis.__configurationHarness.message})};');
      if (specifier.endsWith('/AppShellContext')) return facade('export const useAppShell=()=>({workspaceId:"workspace-one",workspace:{name:"演示",rootPath:"/workspace"}});');
      if (specifier.endsWith('/AgentConversationsContext')) return facade('export const useOptionalAgentConversations=()=>({startTextConversation:globalThis.__configurationHarness.start});');
      if (specifier.endsWith('/service-runtime-api')) return facade('export const SERVICE_RUNTIME_CHANGED="runtime-changed";');
      if (specifier === '../configurationAction') return next(new URL('../configurationAction.ts', context.parentURL).href, context);
    }
    return next(specifier, context);
  },
});
const { useRuntimeConfiguration } = await import('../src/features/service-runtime/hooks/useRuntimeConfiguration.ts');

test('共享配置钩子防重复提交，恢复时明确提示且不打开复制抽屉', async () => {
  const slots = [], warnings = [];
  let cursor = 0, calls = 0, release;
  const harness = globalThis.__configurationHarness = {
    useCallback: fn => fn,
    useRef(value) { const index = cursor++; return slots[index] ||= { current: value }; },
    useState(value) {
      const index = cursor++;
      slots[index] ??= { value };
      return [slots[index].value, next => { slots[index].value = next; }];
    },
    message: { warning: text => warnings.push(text), info() {}, error() {} },
    start: () => { calls++; return new Promise(resolve => { release = resolve; }); },
  };
  const render = () => { cursor = 0; return useRuntimeConfiguration(); };
  const service = { code: 'front', name: '前端' };
  try {
    const action = render();
    const pending = action.configure(service);
    await action.configure(service);
    assert.equal(calls, 1);
    assert.equal(render().pendingCode, 'front');
    release({ status: 'recovering', reason: 'existing-submission', message: '先核对原请求，本次未重复发送。' });
    await pending;
    assert.deepEqual(warnings, ['先核对原请求，本次未重复发送。']);
    assert.equal(render().discovery, null);
    assert.equal(render().pendingCode, '');
    harness.start = async () => ({ status: 'unavailable', message: '尚未接入' });
    await render().configure(service);
    assert.deepEqual(render().discovery, { ...service, tone: 'warning', message: '尚未接入' });
    render().closeDiscovery();
    assert.equal(render().discovery, null);
  } finally {
    delete globalThis.__configurationHarness;
  }
});
