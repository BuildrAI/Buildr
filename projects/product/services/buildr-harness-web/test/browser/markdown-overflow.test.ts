import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright-core';

test('wide diagrams, code and tables scroll locally without widening the conversation', {timeout: 30000}, async () => {
  const browser = await chromium.launch({headless: true});
  try {
    const page = await browser.newPage();
    const root = new URL('../../src/', import.meta.url);
    const css = ['shared.css', 'features/agent-conversations/agent-conversations.css', 'features/agent-conversations/conversation-flow.css']
      .map(file => fs.readFileSync(new URL(file, root), 'utf8')).join('\n');
    for (const width of [390, 760, 1440]) {
      await page.setViewportSize({width, height: 900});
      for (const narration of [false, true]) {
        await page.setContent(`<style>*{box-sizing:border-box}body{margin:0}.ac-panel{width:100%;min-width:0;height:900px}${css}</style>
          <section class="ac-panel is-full"><div class="ac-conversation-view"><div class="ac-stream"><div class="ac-message-list">
          <div class="${narration ? 'ac-process is-flow' : 'ac-assistant-reply'}"><div class="${narration ? 'ac-process-narration' : 'ac-message'}">
          <div class="markdown-body"><p>图示前正文 ${'long_identifier_'.repeat(100)}</p>
          <div class="markdown-code-block markdown-diagram"><button>复制代码</button>
          <div class="markdown-diagram-view" tabindex="0" role="img" aria-label="Mermaid 图示">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2400 1800" style="width:2400px;max-width:none"><text x="20" y="30">宽时序图</text></svg></div>
          <details><summary>查看源码</summary><pre><code>${'sequenceDiagram '.repeat(200)}</code></pre></details></div>
          <div class="markdown-code-block"><pre><code>${'long_code_'.repeat(400)}</code></pre></div>
          <div class="markdown-table-scroll"><table><tr>${'<td>column</td>'.repeat(40)}</tr></table></div>
          <p>图示后正文</p></div></div></div></div></div><footer>输入框</footer></div></section>`);
        const result = await page.evaluate(() => {
          const stream = document.querySelector<HTMLElement>('.ac-stream')!;
          const graph = document.querySelector<HTMLElement>('.markdown-diagram-view')!;
          graph.scrollLeft = 200;
          return {
            streamWidth: stream.clientWidth, streamContentWidth: stream.scrollWidth,
            pageWidth: document.documentElement.clientWidth, pageContentWidth: document.documentElement.scrollWidth,
            graphWidth: graph.clientWidth, graphContentWidth: graph.scrollWidth,
            graphHeight: graph.clientHeight, graphContentHeight: graph.scrollHeight,
            graphScroll: graph.scrollLeft, streamScroll: stream.scrollLeft,
          };
        });
        const context = JSON.stringify({width, narration, result});
        assert.ok(result.streamContentWidth <= result.streamWidth + 1, context);
        assert.ok(result.pageContentWidth <= result.pageWidth + 1, context);
        assert.ok(result.graphContentWidth > result.graphWidth, context);
        assert.ok(result.graphContentHeight > result.graphHeight, context);
        assert.equal(result.graphScroll, 200, context);
        assert.equal(result.streamScroll, 0, context);
      }
    }
  } finally {
    await browser.close();
  }
});
