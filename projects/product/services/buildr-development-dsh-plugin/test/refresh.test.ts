import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  resolveRefreshBinding,
  shouldRefreshCenterDevelopment,
  toolTabTitle,
  type DesktopKeyboardInput,
  type ShortcutBinding,
} from '../src/refresh.ts';

const macCmdR: ShortcutBinding = { code: 'KeyR', modifiers: ['meta'] };
const baseEvent: DesktopKeyboardInput = {
  kind: 'webview',
  revision: 'rev-1',
  frameName: 'lease-chat',
  code: 'KeyR',
  meta: true,
};

test('right-sidebar tool tab titles omit any Buildr prefix', () => {
  assert.equal(toolTabTitle('explorer'), '文件');
  assert.equal(toolTabTitle('source-control'), '代码库');
});

test('resolveRefreshBinding follows host page.refresh setting or platform default', () => {
  assert.deepEqual(resolveRefreshBinding(undefined, 'macos'), { code: 'KeyR', modifiers: ['meta'] });
  assert.deepEqual(resolveRefreshBinding(undefined, 'windows'), { code: 'KeyR', modifiers: ['control'] });
  assert.deepEqual(resolveRefreshBinding(undefined, 'linux'), { code: 'KeyR', modifiers: ['control'] });

  const custom: ShortcutBinding = { code: 'F5', modifiers: [] };
  assert.deepEqual(resolveRefreshBinding([{ id: 'page.refresh', binding: custom, issue: null, conflicts: [] }], 'macos'), custom);
  assert.equal(resolveRefreshBinding([{ id: 'page.refresh', binding: null, issue: null, conflicts: [] }], 'macos'), null);
  assert.equal(resolveRefreshBinding([{ id: 'page.refresh', binding: macCmdR, issue: 'reserved', conflicts: [] }], 'macos'), null);
  assert.equal(resolveRefreshBinding([{ id: 'page.refresh', binding: macCmdR, issue: null, conflicts: ['other'] }], 'macos'), null);
});

test('center Buildr Development refreshes only for matching active center shortcuts and leaves right sidebar alone', () => {
  const base = {
    active: true,
    hasModal: false,
    inRightSidebar: false,
    chatLease: 'lease-chat',
    expectedRevision: 'rev-1',
    binding: macCmdR,
  };

  assert.equal(shouldRefreshCenterDevelopment({ ...base, event: baseEvent }), true);
  assert.equal(shouldRefreshCenterDevelopment({ ...base, event: { kind: 'keyboard', revision: 'rev-1', code: 'KeyR', meta: true } }), true);
  assert.equal(shouldRefreshCenterDevelopment({ ...base, event: { kind: 'keyboard', code: 'KeyR', meta: true } }), true);
  assert.equal(shouldRefreshCenterDevelopment({ ...base, event: { ...baseEvent, frameName: 'lease-browser' } }), false);
  assert.equal(shouldRefreshCenterDevelopment({ ...base, chatLease: undefined, event: baseEvent }), false);
  assert.equal(shouldRefreshCenterDevelopment({ ...base, inRightSidebar: true, event: { kind: 'keyboard', revision: 'rev-1', code: 'KeyR', meta: true } }), false);
  assert.equal(shouldRefreshCenterDevelopment({ ...base, hasModal: true, event: baseEvent }), false);
  assert.equal(shouldRefreshCenterDevelopment({ ...base, active: false, event: baseEvent }), false);
  assert.equal(shouldRefreshCenterDevelopment({ ...base, event: { ...baseEvent, repeat: true } }), false);
  assert.equal(shouldRefreshCenterDevelopment({ ...base, event: { ...baseEvent, revision: 'stale' } }), false);
  assert.equal(shouldRefreshCenterDevelopment({ ...base, event: { ...baseEvent, shift: true } }), false);
  assert.equal(shouldRefreshCenterDevelopment({ ...base, event: { kind: 'menu', revision: 'rev-1', code: 'KeyR', meta: true } }), false);
});
