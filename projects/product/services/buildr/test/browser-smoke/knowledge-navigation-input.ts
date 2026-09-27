import assert from 'node:assert/strict';
import type { Locator, Page } from 'playwright-core';

/** Drive Chromium's composition pipeline; fill() alone cannot detect IME regressions. */
export async function composeKnowledgeSearch(page: Page, input: Locator, candidate: string, committed: string, whileComposing?: () => Promise<void>) {
  await input.fill('');
  await input.focus();
  const element = await input.elementHandle();
  assert.ok(element, '检索框必须存在');
  await element.evaluate(node => {
    const target = node as HTMLInputElement & { imeEvents?: { type: string; data: string | null; composing: boolean }[] };
    target.imeEvents = [];
    for (const type of ['compositionstart', 'compositionupdate', 'compositionend', 'input']) {
      target.addEventListener(type, event => target.imeEvents!.push({ type, data: (event as InputEvent).data ?? null, composing: Boolean((event as InputEvent).isComposing) }));
    }
  });
  const cdp = await page.context().newCDPSession(page);
  const settle = () => page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  try {
    for (const draft of [candidate.slice(0, 1), candidate]) {
      await cdp.send('Input.imeSetComposition', { text: draft, selectionStart: draft.length, selectionEnd: draft.length });
      await settle();
      assert.deepEqual(await element.evaluate(node => ({ connected: node.isConnected, focused: document.activeElement === node, value: (node as HTMLInputElement).value })),
        { connected: true, focused: true, value: draft }, '输入法组合中保持同一输入节点、焦点和中间文字');
      await whileComposing?.();
    }
    await cdp.send('Input.insertText', { text: committed });
    await settle();
    assert.deepEqual(await element.evaluate(node => ({ connected: node.isConnected, focused: document.activeElement === node, value: (node as HTMLInputElement).value })),
      { connected: true, focused: true, value: committed }, '确认中文后同一输入节点仍保留焦点和最终文字');
    const events = await element.evaluate(node => (node as HTMLInputElement & { imeEvents: { type: string; data: string | null; composing: boolean }[] }).imeEvents);
    assert.ok(events.some(event => event.type === 'compositionstart'), '浏览器实际开启组合输入');
    assert.ok(events.filter(event => event.type === 'compositionupdate').length >= 2, '浏览器实际更新候选文字');
    assert.ok(events.some(event => event.type === 'input' && event.composing), '中间输入必须经过原生 isComposing 管线');
    assert.ok(events.some(event => event.type === 'compositionend' && event.data === committed), '浏览器实际确认中文组合');
  } finally { await cdp.detach(); await element.dispose(); }
}

/** A filtered hierarchy remains operable and never changes the selected article. */
export async function toggleFilteredKnowledgeBranch(root: Locator, key: string, leaf: Locator, body: Locator) {
  const toggle = root.locator(`[data-knowledge-branch="${key}"]:visible`);
  assert.equal(await toggle.isEnabled(), true, '检索和类型过滤不能禁用目录展开');
  assert.equal(await toggle.getAttribute('aria-expanded'), 'true', '过滤默认展开命中分支');
  await leaf.waitFor({ state: 'visible' });
  await toggle.click();
  assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
  await leaf.waitFor({ state: 'hidden' });
  assert.equal(await body.isVisible(), true, '收起过滤目录不改变正文');
  await toggle.click();
  await leaf.waitFor({ state: 'visible' });
  assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
  assert.equal(await body.isVisible(), true, '展开过滤目录不改变正文');
  await toggle.click();
  assert.equal(await toggle.getAttribute('aria-expanded'), 'false', '留下临时收起状态以核验清空后的原展开');
}

/** Cancel a subsequent composition, then continue ordinary typing without losing the query. */
export async function continueKnowledgeSearch(page: Page, input: Locator) {
  const value = await input.inputValue();
  await input.focus();
  await page.keyboard.press('End');
  const element = await input.elementHandle();
  assert.ok(element);
  const cdp = await page.context().newCDPSession(page);
  const settle = () => page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  try {
    await cdp.send('Input.imeSetComposition', { text: 'qu', selectionStart: 2, selectionEnd: 2 });
    await settle();
    await cdp.send('Input.imeSetComposition', { text: '', selectionStart: 0, selectionEnd: 0 });
    await settle();
    assert.deepEqual(await element.evaluate(node => ({ connected: node.isConnected, focused: document.activeElement === node, value: (node as HTMLInputElement).value })),
      { connected: true, focused: true, value }, '取消下一段组合不能丢失已确认的中文');
    await page.keyboard.type(' z');
    await settle();
    assert.equal(await input.inputValue(), `${value} z`, '确认或取消组合后仍可继续普通输入');
  } finally { await cdp.detach(); await element.dispose(); }
}

export async function waitKnowledgeBranchExpanded(root: Locator, key: string, expanded: boolean) {
  await root.locator(`[data-knowledge-branch="${key}"][aria-expanded="${expanded}"]:visible`).waitFor({ state: 'visible' });
}
