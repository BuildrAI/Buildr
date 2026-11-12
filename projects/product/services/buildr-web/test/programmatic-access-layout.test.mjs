import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { existsSync, readFileSync } from 'node:fs';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { App } from 'antd';

registerHooks({
  resolve(specifier, context, next) {
    if (specifier === '../../../api' && context.parentURL?.endsWith('/programmatic-access-api.ts')) return { url: 'data:text/javascript,export const api=()=>{throw Error("unexpected real API")}', shortCircuit: true };
    if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
      const url = new URL(specifier, context.parentURL);
      for (const suffix of ['.tsx', '.ts']) if (existsSync(new URL(url.href + suffix))) return next(url.href + suffix, context);
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith('.tsx')) return { format: 'module', source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), {
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText, shortCircuit: true };
    return next(url, context);
  },
});
const { ProgrammaticCredentialCard } = await import('../src/features/agent-conversations/ProgrammaticCredentialCard.tsx');
const view = {
  apiUrl: 'http://127.0.0.1:4458/api/v1/programmatic',
  documentationUrl: 'http://127.0.0.1:4458/api/v1/programmatic/help',
  openapiUrl: 'http://127.0.0.1:4458/api/v1/programmatic/openapi.json',
  workspaces: [{ id: 'workspace', name: 'Buildr' }],
};
const item = { id: 'hidden-credential-id', name: '千问办公', workspaceIds: ['workspace'], scopes: ['read', 'execute'], allowFullAccess: true, createdAt: '2026-11-11T02:00:00Z', revokedAt: null };
function render(extra = {}) {
  return renderToStaticMarkup(React.createElement(App, null, React.createElement(ProgrammaticCredentialCard, {
    item, view, busy: false, expanded: false, onToggle() {}, onRegenerate() {}, onRevoke() {}, onToggleFullAccess() {}, ...extra,
  })));
}
test('接入行默认仅显示名称、状态、工作空间和操作摘要，不重复展开长警告或元信息', () => {
  const html = render();
  assert.match(html, /千问办公/); assert.match(html, /Buildr/); assert.match(html, /读取 \/ 执行/);
  assert.match(html, /aria-expanded="false"/);
  assert.doesNotMatch(html, /无法恢复原令牌|创建时间|凭据标识|原令牌会失效|撤销接入/);
});
test('旧接入在详情中明确保留原凭据，并提示换新副作用', () => {
  const html = render({ expanded: true });
  assert.match(html, /aria-expanded="true"/);
  assert.match(html, /原凭据仍可使用/); assert.match(html, /原令牌会失效/);
  assert.match(html, /重新生成并保存/); assert.match(html, /创建时间/); assert.match(html, /凭据标识/);
  assert.doesNotMatch(html, /给程序的接入信息/);
});
test('自动保存接入的复制入口常驻，长路径与接入正文只在详情展示', () => {
  const saved = { ...item, tokenFilePath: '/private/secret-location.token' };
  const collapsed = render({ item: saved });
  assert.match(collapsed, /复制千问办公接入信息/);
  assert.doesNotMatch(collapsed, /secret-location\.token|给程序的接入信息/);
  const expanded = render({ item: saved, expanded: true });
  assert.match(expanded, /secret-location\.token/); assert.match(expanded, /给程序的接入信息/);
  assert.match(expanded, /contractVersion/);
});
test('撤销接入没有复制与管理入口，但仍可查看历史元信息', () => {
  const html = render({ item: { ...item, tokenFilePath: '/private/old.token', revokedAt: '2026-11-11T03:00:00Z' }, expanded: true });
  assert.match(html, /已撤销/); assert.match(html, /凭据标识/);
  assert.doesNotMatch(html, /复制千问办公接入信息|管理千问办公接入|给程序的接入信息|重新生成并保存/);
});
test('详情展示全部授权执行开关，关闭与撤销状态如实呈现', () => {
  const on = render({ expanded: true });
  assert.match(on, /全部授权执行/); assert.match(on, /允许程序请求 full-access/);
  assert.match(on, /aria-label="切换千问办公允许全部授权执行"/);
  const off = render({ item: { ...item, allowFullAccess: false }, expanded: true });
  assert.match(off, /已关闭，full-access 请求返回 403/);
  const revoked = render({ item: { ...item, revokedAt: '2026-11-11T03:00:00Z' }, expanded: true });
  assert.match(revoked, /全部授权执行/);
  assert.doesNotMatch(render(), /全部授权执行/);
});
