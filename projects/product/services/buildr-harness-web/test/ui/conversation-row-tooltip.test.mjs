import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  isElementFocusVisible,
  isKeyboardNavigationKey,
  shouldOpenConversationTooltipOnFocus,
} from '../../src/features/agent-conversations/conversation-row-tooltip.ts';

test('isKeyboardNavigationKey 仅识别无修饰键的键盘导航按键', () => {
  for (const key of ['Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown']) {
    assert.equal(isKeyboardNavigationKey({ key }), true, `${key} 应识别为键盘导航`);
  }
  assert.equal(isKeyboardNavigationKey({ key: 'Tab', metaKey: true }), false, 'Cmd+Tab 切窗口不应误判');
  assert.equal(isKeyboardNavigationKey({ key: 'Tab', ctrlKey: true }), false, 'Ctrl+Tab 切标签页不应误判');
  assert.equal(isKeyboardNavigationKey({ key: 'Tab', altKey: true }), false, 'Alt+Tab 切窗口不应误判');
  assert.equal(isKeyboardNavigationKey({ key: 'Enter' }), false);
  assert.equal(isKeyboardNavigationKey({ key: 'Escape' }), false);
  assert.equal(isKeyboardNavigationKey({ key: 'a' }), false);
});

test('shouldOpenConversationTooltipOnFocus 阻断点击聚焦与切回窗口后的恢复聚焦误弹', () => {
  assert.equal(
    shouldOpenConversationTooltipOnFocus({ hasMeta: true, hidden: false, keyboardNavActive: true, focusVisible: true }),
    true,
    '仅在可见、有模型信息且真实键盘导航聚焦时显示',
  );
  assert.equal(
    shouldOpenConversationTooltipOnFocus({ hasMeta: true, hidden: false, keyboardNavActive: false, focusVisible: true }),
    false,
    '切走再切回恢复焦点时（keyboardNavActive 已复位）不应弹出提示',
  );
  assert.equal(
    shouldOpenConversationTooltipOnFocus({ hasMeta: true, hidden: false, keyboardNavActive: false, focusVisible: false }),
    false,
    '鼠标点击聚焦不应弹出提示',
  );
  assert.equal(
    shouldOpenConversationTooltipOnFocus({ hasMeta: true, hidden: true, keyboardNavActive: true, focusVisible: true }),
    false,
    '列表被设置页隐藏时不应弹出提示',
  );
  assert.equal(
    shouldOpenConversationTooltipOnFocus({ hasMeta: false, hidden: false, keyboardNavActive: true, focusVisible: true }),
    false,
  );
});

test('isElementFocusVisible 安全判断元素是否处于 :focus-visible 状态', () => {
  const previousElement = globalThis.Element;
  class FakeElement {
    #visible;
    constructor(visible, throws = false) {
      this.#visible = visible;
      this.throws = throws;
    }
    matches(selector) {
      if (this.throws) throw new Error('unsupported');
      return selector === ':focus-visible' && this.#visible;
    }
  }
  globalThis.Element = FakeElement;
  try {
    assert.equal(isElementFocusVisible(null), false);
    assert.equal(isElementFocusVisible({ matches: () => true }), false);
    assert.equal(isElementFocusVisible(new FakeElement(true)), true);
    assert.equal(isElementFocusVisible(new FakeElement(false)), false);
    assert.equal(isElementFocusVisible(new FakeElement(true, true)), false);
  } finally {
    if (previousElement === undefined) delete globalThis.Element;
    else globalThis.Element = previousElement;
  }
});

test('ConversationHistory 使用 hover 触发并在失焦/隐藏/点击时主动收起模型提示', () => {
  const source = readFileSync(
    new URL('../../src/features/agent-conversations/ConversationHistory.tsx', import.meta.url),
    'utf8',
  );
  assert.match(source, /trigger=\{\['hover'\]\}/);
  assert.doesNotMatch(source, /trigger=\{\['hover',\s*'focus'\]\}/);
  assert.match(source, /destroyOnHidden/);
  assert.match(source, /window\.addEventListener\('blur',\s*onBlur\)/);
  assert.match(source, /document\.addEventListener\('visibilitychange',\s*onVisibilityChange\)/);
  assert.match(source, /window\.addEventListener\('pointerdown',\s*onPointerDown,\s*true\)/);
  assert.match(source, /dismissRowTooltips\(\)/);
});
