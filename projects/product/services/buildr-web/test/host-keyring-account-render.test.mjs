import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

registerHooks({
  resolve(specifier, context, next) {
    if (specifier.endsWith('.css')) {
      return { url: 'data:text/javascript,export default {};', shortCircuit: true };
    }
    if (
      context.parentURL?.includes('/buildr-web/src/') &&
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

const { AccountModelManager } = await import('../src/features/agent-conversations/AccountModelManager.tsx');
const { ConversationHandoffContent } = await import('../src/features/agent-conversations/ConversationHandoffDrawer.tsx');
const { catalogConversationOption, executorCompatibilityNotice } = await import('../src/features/agent-conversations/conversation-options.ts');

const baseSource = {
  id: 'native-antigravity',
  sourceEnabled: true,
  provider: 'antigravity',
  providerLabel: 'Google 个人账号',
  agentLabel: 'Antigravity',
  vendorLabel: 'Google',
  billingLabel: '查看 Google AI 订阅',
  billingUrl: 'https://one.google.com/about/ai-plans',
  exclusiveReason: '受 Google 官方授权限制，Google 个人账号仅可在 Antigravity 中使用。',
  accountLabel: 'Google 个人账号（本机已登录）',
  planLabel: 'Google AI Ultra',
  modeLabel: '个人账号',
  authType: 'oauth',
  managed: true,
  hostKeyringAuth: true,
  status: 'ready',
  models: [{ id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', family: 'Gemini', enabled: true, available: true, images: true, tools: true }],
  windows: [],
  quotaNote: 'Antigravity CLI 当前未公开订阅剩余额度与登录邮箱。',
  observedLabel: '2026-11-14 00:00:00',
};

function renderManager(sourceOverrides = {}, extraProps = {}) {
  const source = { ...baseSource, ...sourceOverrides };
  return renderToStaticMarkup(
    React.createElement(AccountModelManager, {
      sources: [source],
      selection: { sourceId: source.id, tab: 'quota' },
      busy: false,
      onSelect() {},
      onRefresh() {},
      onLogin() {},
      onDisconnect() {},
      onPrepare() {},
      onContext() {},
      onEnable() {},
      onSourceEnabled() {},
      async onLogoutManaged() {},
      async onSwitchManagedAccount() {},
      async onManagedAccountImpact() {
        return { activeConversations: [], references: 0 };
      },
      ...extraProps,
    }),
  );
}

test('6.1: AccountModelManager renders Google personal account plans, unconfirmed identity, and sendGate paused states', () => {
  for (const planLabel of ['免费账号', 'Google AI Pro', 'Google AI Ultra', '档位不可读']) {
    const html = renderManager({ planLabel });
    assert.ok(html.includes('Google 个人账号'));
    assert.ok(html.includes(planLabel), `expected plan badge ${planLabel}`);
    assert.ok(html.includes('查看 Google AI 订阅'));
    assert.ok(html.includes('专属智能体账号'));
  }

  const unconfirmedHtml = renderManager({
    status: 'failed',
    accountLabel: '身份不可确认',
    planLabel: '身份不可确认',
    models: [],
    diagnostic: '无法确认当前 Google 个人账号身份，发送前已拒绝执行。',
  });
  assert.ok(unconfirmedHtml.includes('身份不可确认'));
  assert.ok(unconfirmedHtml.includes('切换账号'));
  assert.ok(unconfirmedHtml.includes('重新读取'));

  const switchingHtml = renderManager({
    sendGate: {
      state: 'paused',
      reason: 'account-change',
      diagnostic: '正在停止运行中的对话并切换账号，新发送已暂停；草稿已保留。',
    },
  });
  assert.ok(switchingHtml.includes('正在执行账号操作，新发送已暂停'));
  assert.ok(switchingHtml.includes('账号操作中'));

  const gateUnconfirmedHtml = renderManager({
    status: 'failed',
    accountLabel: '身份不可确认',
    sendGate: {
      state: 'paused',
      reason: 'account-unconfirmed',
      diagnostic: '退出操作超时且未能确认本机登录状态，请重新核对或重试退出。',
    },
  });
  assert.ok(gateUnconfirmedHtml.includes('账号状态待核对，新发送已暂停'));
  assert.ok(gateUnconfirmedHtml.includes('重新核对'));
  assert.ok(gateUnconfirmedHtml.includes('切换账号'));
  assert.ok(gateUnconfirmedHtml.includes('重试退出'));
});

test('6.2: ConversationHandoffDrawer surfaces policy-change new session notice and model picker enforces executor exclusivity', () => {
  const drawerHtml = renderToStaticMarkup(
    React.createElement(ConversationHandoffContent, {
      open: true,
      received: false,
      notice: '本轮将开启新的 Antigravity 会话',
      material: {
        agent: 'Antigravity',
        model: 'Gemini 2.5 Pro',
        changes: [],
        rounds: [
          {
            id: 'r1',
            title: '第 1 轮',
            from: 1,
            through: 2,
            userInputs: ['之前的需求'],
            assistantNotes: [],
            execution: [],
            artifacts: [],
            finalReply: '之前的结论',
          },
        ],
        roundCount: 1,
        body: '交接正文',
        sourceThrough: 2,
        mode: 'records',
      },
    }),
  );
  assert.ok(drawerHtml.includes('本轮将开启新的 Antigravity 会话'));
  assert.ok(drawerHtml.includes('第 1 轮'));

  const googleModel = {
    accountId: 'native-antigravity',
    provider: 'native-antigravity',
    modelId: 'gemini-2.5-pro',
    label: 'Gemini 2.5 Pro',
    available: true,
    sharing: {
      kind: 'executor-exclusive',
      executors: ['antigravity'],
      reason: '受 Google 官方授权限制，Google 个人账号仅可在 Antigravity 中使用。',
    },
    inference: 'none',
    executorCompatibility: [
      { connectionId: 'antigravity', compatible: true },
      {
        connectionId: 'codex',
        compatible: false,
        reasonCode: 'agent_model_source_unsupported',
        reason: '受 Google 官方授权限制，Google 个人账号仅可在 Antigravity 中使用。',
      },
    ],
  };
  const agyOption = catalogConversationOption({ id: 'antigravity', label: 'Antigravity' }, googleModel);
  assert.equal(agyOption.disabled, false);
  const codexOption = catalogConversationOption({ id: 'codex', label: 'Codex' }, googleModel);
  assert.equal(codexOption.disabled, true);
  assert.equal(codexOption.title, '受 Google 官方授权限制，Google 个人账号仅可在 Antigravity 中使用。');
  assert.equal(
    executorCompatibilityNotice({ id: 'codex', label: 'Codex' }, [googleModel]),
    '受 Google 官方授权限制，Google 个人账号仅可在 Antigravity 中使用。',
  );
});
