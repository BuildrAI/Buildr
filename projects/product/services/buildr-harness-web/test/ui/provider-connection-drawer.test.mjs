import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const drawerStubUrl = new URL('../../src/components/DrawerShell.tsx?stub=1', import.meta.url).href;

registerHooks({
  resolve(specifier, context, next) {
    const sourceSpecifier=specifier.replace(/\.(?:tsx?|jsx?)$/,'').replace(/\/index$/,'');
    if (specifier.endsWith('.css')) {
      return { url: 'data:text/javascript,export default {};', shortCircuit: true };
    }
    if (specifier.endsWith('/DrawerShell') || specifier.endsWith('/DrawerShell.tsx')) {
      return { url: drawerStubUrl, shortCircuit: true };
    }
    if (
      context.parentURL?.includes('/buildr-harness-web/src/') &&
      specifier.startsWith('.') &&
      !/\.[a-z]+$/i.test(specifier)
    ) {
      for (const ext of ['.tsx', '.ts']) {
        try {
          const candidate = new URL(specifier + ext, context.parentURL);
          readFileSync(candidate);
          return { url: candidate.href, shortCircuit: true };
        } catch {
          // try next extension
        }
      }
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url === drawerStubUrl) {
      return {
        format: 'module',
        source: `import React from 'react'; export function DrawerShell({ open, title, footer, children }) { return open ? React.createElement('div', { 'data-drawer-title': title }, React.createElement('h2', null, title), children, footer) : null; }`,
        shortCircuit: true,
      };
    }
    if (url.endsWith('.tsx')) {
      return {
        format: 'module',
        source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), {
          compilerOptions: {
            jsx: ts.JsxEmit.ReactJSX,
            module: ts.ModuleKind.ESNext,
            target: ts.ScriptTarget.ES2022,
          },
        }).outputText,
        shortCircuit: true,
      };
    }
    return next(url, context);
  },
});

const { ProviderConnectionDrawer } = await import('../../src/features/agent-conversations/ProviderConnectionDrawer.tsx');

test('ProviderConnectionDrawer shows an OAuth subscription provider with save-and-login action', () => {
  const providers = [
    {
      id: 'oauth-subscription',
      label: 'OAuth 订阅',
      singleton: true,
      authentication: {
        type: 'oauth',
        label: 'OAuth 订阅',
        description: '登录后即可使用订阅模型。',
      },
    },
    { id: 'custom', label: '自定义供应商', custom: true },
  ];
  const html = renderToStaticMarkup(
    React.createElement(ProviderConnectionDrawer, {
      open: true,
      initial: { kind: 'oauth-subscription', label: 'OAuth 订阅' },
      providers,
      configuredProviders: [],
      onClose() {},
      async onSave() {},
    }),
  );
  assert.ok(html.includes('添加供应商'));
  assert.ok(html.includes('保存并登录'));
  assert.ok(html.includes('登录后即可使用订阅模型'));
});

test('AgentConnectionSettings saveProvider preserves underlying failure message for the drawer alert', () => {
  const source = readFileSync(
    new URL('../../src/features/agent-conversations/AgentConnectionSettings.tsx', import.meta.url),
    'utf8',
  );
  assert.match(source, /let failureMessage='';/);
  assert.match(source, /if\(!saved\)throw new Error\(failureMessage\|\|'供应商配置未完成。'\);/);
});

test('Magpie offers connection and explicit local setup without subscription or API Key fields',()=>{
 const html=renderToStaticMarkup(React.createElement(ProviderConnectionDrawer,{open:true,initial:{kind:'magpie',label:'Magpie',baseUrl:''},providers:[{id:'magpie',label:'Magpie',custom:true}],onClose(){},async onSave(){}}));
 assert.match(html,/连接 Magpie/);
 assert.match(html,/下载并启动/);
 assert.doesNotMatch(html,/保存并登录|API Key|API 协议/);
});


test('Magpie quota shows distinct accounts, original units, observed times and unknown windows',async()=>{
 const {MagpieQuotaRows,MagpieQuotaPanel}=await import('../../src/features/agent-conversations/MagpieQuotaPanel.tsx');
 const html=renderToStaticMarkup(React.createElement(MagpieQuotaRows,{snapshot:{readAt:'2026-11-23T00:00:00Z',accounts:[
  {provider:'codex',providerLabel:'Codex',accountLabel:'a•••@example.test',balance:'12.35 credits',observedAt:'2026-11-23T00:00:00Z',windows:[{label:'7d',remainingPercent:0}]},
  {provider:'codex',providerLabel:'Codex',accountLabel:'a•••@example.test',balance:'$4.10',windows:[{label:'5h'}],unavailable:true},
  {provider:'qoder',providerLabel:'Qoder',windows:[{label:'Credits',remainingPercent:50.91575091575091}]},
  {provider:'claude',providerLabel:'Claude',windows:[]},
 ]}}));
 for(const value of ['amm-magpie-provider-card','账号 1','账号 2','12.35 credits','$4.10','剩余 0%','剩余 50.92%','剩余未知','Magpie 观察于','上游读取未完成','Buildr 读取于','Claude'])assert.ok(html.includes(value),value);
 assert.equal(html.includes('50.91575091575091'),false);
 const panelHtml=renderToStaticMarkup(React.createElement(MagpieQuotaPanel,{accountId:'m1',revision:'r1',enabled:true,async read(){return {readAt:'2026-11-23T00:00:00Z',accounts:[]};}}));
 assert.equal(panelHtml.includes('重新读取额度'),false);
});

test('AccountModelManager renders clean bulk toggle labels and Magpie upstream provider filter',async()=>{
 const {AccountModelManager}=await import('../../src/features/agent-conversations/AccountModelManager.tsx');
 const html=renderToStaticMarkup(React.createElement(AccountModelManager,{
  sources:[{
   id:'magpie-1',provider:'magpie',providerLabel:'Magpie',accountLabel:'Magpie',planLabel:'本机网关',status:'ready',
   models:[
    {id:'codex/gpt-6.2-sol',label:'GPT-6.2-Sol',family:'GPT',upstreamProvider:'codex',upstreamProviderLabel:'Codex',enabled:true,available:true},
    {id:'qoder/ultimate',label:'Ultimate',family:'其他',upstreamProvider:'qoder',upstreamProviderLabel:'Qoder',enabled:false,available:true},
   ],
   windows:[],observedLabel:'刚刚',
  }],
  selection:{sourceId:'magpie-1',tab:'models'},
  busy:false,
  onSelect(){},onRefresh(){},onLogin(){},onDisconnect(){},onPrepare(){},onContext(){},onEnable(){},
 }));
 assert.ok(html.includes('aria-label="Magpie 供应商"'));
 assert.ok(html.includes('Codex · Magpie'));
 assert.ok(html.includes('Qoder · Magpie'));
 assert.ok(html.includes('全部开启'));
 assert.ok(html.includes('全部关闭'));
 assert.equal(html.includes('（当前筛选）'),false);
});
