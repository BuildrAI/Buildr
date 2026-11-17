import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright-core';
import {createServer as createViteServer} from 'vite';

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

test('rendered Mermaid diagrams fit proportionally without scrollbars in message stream while preserving local scroll and boundary wheel chaining in reader', {timeout: 30000}, async () => {
  const serviceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const vite = await createViteServer({
    root: serviceRoot,
    server: {middlewareMode: true},
    appType: 'custom',
    logLevel: 'silent',
  });
  const server = http.createServer((req, res) => {
    if (req.url === '/__stream-fit-test__') {
      res.writeHead(200, {'content-type': 'text/html; charset=utf-8'});
      res.end(`<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/src/shared.css">
        <style>
          *{box-sizing:border-box}
          body{margin:0}
          .ac-panel{width:100%;height:720px}
          .ac-conversation-view{height:100%;display:flex;flex-direction:column}
          .ac-stream{flex:1;min-height:0;overflow-y:auto;padding:24px}
          .lead{height:180px}
          .spacer{height:1400px}
        </style></head><body>
        <section class="ac-panel is-full"><div class="ac-conversation-view"><div class="ac-stream">
          <div class="ac-message-list"><div class="lead">前置正文</div><div id="mount" class="markdown-body"></div><div class="spacer">尾部正文</div></div>
        </div></div></section>
        <script type="module">
          import {renderMarkdown} from '/src/markdown.ts';
          import {setDiagramSvg, rememberBlockDiagramSvg} from '/src/lib/markdownDiagramSvg.ts';
          const mount = document.getElementById('mount');
          const markdown = [
            '\`\`\`mermaid',
            'sequenceDiagram',
            'A->>B: 高长宽图',
            '\`\`\`',
            '',
            '\`\`\`mermaid',
            'graph LR',
            'C[超宽] --> D[图]',
            '\`\`\`',
            '',
            '\`\`\`mermaid',
            'graph LR',
            'E[紧凑] --> F[图]',
            '\`\`\`',
          ].join('\\n');
          const view = renderMarkdown(markdown);
          mount.replaceChildren(view);
          const blocks = [...mount.querySelectorAll('.markdown-diagram')];
          const svgs = [
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1100 1500" width="100%" style="max-width:1100px"><rect width="1100" height="1500" fill="#fff"/></svg>',
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 300" width="1600" height="300"><rect width="1600" height="300" fill="#fff"/></svg>',
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 110" width="320" height="110"><rect width="320" height="110" fill="#fff"/></svg>',
          ];
          svgs.forEach((svg, index) => {
            const block = blocks[index];
            const graph = block.querySelector('.markdown-diagram-view');
            graph.hidden = false;
            setDiagramSvg(graph, svg);
            block.setAttribute('data-mermaid-state', 'rendered');
            rememberBlockDiagramSvg(block, svg);
          });
          window.__streamFitReady = true;
        </script></body></html>`);
      return;
    }
    if (req.url === '/__overflow-wheel-test__') {
      res.writeHead(200, {'content-type': 'text/html; charset=utf-8'});
      res.end(`<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/src/shared.css">
        <style>
          *{box-sizing:border-box}
          body{margin:0}
          .knowledge-reader-shell{width:100%;height:720px;display:flex;flex-direction:column}
          .knowledge-reader-body{flex:1;min-height:0;overflow-y:auto;padding:24px}
          .markdown-diagram-view{max-height:220px}
          .lead{height:300px}
          .spacer{height:1400px}
        </style></head><body>
        <section class="knowledge-reader-shell"><div class="knowledge-reader-body">
          <div class="lead">前置正文</div><div id="mount" class="markdown-body"></div><div class="spacer">尾部正文</div>
        </div></section>
        <script type="module">
          import {renderMarkdown} from '/src/markdown.ts';
          import {setDiagramSvg, rememberBlockDiagramSvg} from '/src/lib/markdownDiagramSvg.ts';
          const mount = document.getElementById('mount');
          const markdown = [
            '\`\`\`mermaid',
            'graph TD',
            'A[步骤一] --> B[步骤二]',
            '\`\`\`',
            '',
            '\`\`\`mermaid',
            'graph LR',
            'C[紧凑] --> D[结束]',
            '\`\`\`',
          ].join('\\n');
          const view = renderMarkdown(markdown);
          mount.replaceChildren(view);
          const blocks = [...mount.querySelectorAll('.markdown-diagram')];
          const tallSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 920" width="420" height="920"><rect width="420" height="920" fill="#fff"/><text x="20" y="40">高流程图顶部</text><text x="20" y="880">高流程图底部</text></svg>';
          const compactSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 110" width="320" height="110"><rect width="320" height="110" fill="#fff"/><text x="20" y="55">紧凑流程图</text></svg>';
          [tallSvg, compactSvg].forEach((svg, index) => {
            const block = blocks[index];
            const graph = block.querySelector('.markdown-diagram-view');
            graph.hidden = false;
            setDiagramSvg(graph, svg);
            block.setAttribute('data-mermaid-state', 'rendered');
            rememberBlockDiagramSvg(block, svg);
          });
          window.__overflowReady = true;
        </script></body></html>`);
      return;
    }
    vite.middlewares(req, res);
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const browser = await chromium.launch({headless: true});
  try {
    const page = await browser.newPage({viewport: {width: 960, height: 720}});
    await page.goto(`http://127.0.0.1:${port}/__stream-fit-test__`);
    await page.waitForFunction(() => Boolean((window as Window & {__streamFitReady?: boolean}).__streamFitReady));
    const fitMetrics = await page.evaluate(() => {
      const views = [...document.querySelectorAll('.markdown-diagram-view')];
      return views.map(view => {
        const svg = view.querySelector('svg')!;
        const vb = svg.viewBox.baseVal;
        const rect = svg.getBoundingClientRect();
        return {
          clientW: view.clientWidth,
          scrollW: view.scrollWidth,
          clientH: view.clientHeight,
          scrollH: view.scrollHeight,
          svgW: rect.width,
          svgH: rect.height,
          vbRatio: vb.width / vb.height,
          rectRatio: rect.width / rect.height,
        };
      });
    });
    fitMetrics.forEach((metric, index) => {
      assert.ok(metric.scrollW <= metric.clientW, `stream diagram #${index} must not scroll horizontally: ${JSON.stringify(metric)}`);
      assert.ok(metric.scrollH <= metric.clientH, `stream diagram #${index} must not scroll vertically: ${JSON.stringify(metric)}`);
      assert.ok(Math.abs(metric.rectRatio - metric.vbRatio) < 0.03, `stream diagram #${index} must preserve aspect ratio: ${JSON.stringify(metric)}`);
      assert.ok(metric.svgH <= 468.5, `stream diagram #${index} height must stay within min(65vh, 520px): ${JSON.stringify(metric)}`);
    });
    assert.ok(fitMetrics[0].svgH > 460 && fitMetrics[0].svgW < 360, `tall diagram should constrain by height and preserve ratio: ${JSON.stringify(fitMetrics[0])}`);
    assert.ok(fitMetrics[2].svgW >= 319 && fitMetrics[2].svgH >= 109, `compact diagram should keep natural size: ${JSON.stringify(fitMetrics[2])}`);
    const streamRect = await page.locator('.markdown-diagram-view').nth(0).boundingBox();
    assert.ok(streamRect);
    await page.mouse.move(streamRect.x + streamRect.width / 2, streamRect.y + streamRect.height / 2);
    await page.mouse.wheel(0, 180);
    await page.waitForTimeout(80);
    const streamTopAfterWheel = await page.evaluate(() => document.querySelector('.ac-stream')!.scrollTop);
    assert.ok(streamTopAfterWheel > 0, `wheel over fitted stream diagram must scroll .ac-stream directly: ${streamTopAfterWheel}`);

    await page.goto(`http://127.0.0.1:${port}/__overflow-wheel-test__`);
    await page.waitForFunction(() => Boolean((window as Window & {__overflowReady?: boolean}).__overflowReady));

    const firstRect = await page.locator('.markdown-diagram-view').nth(0).boundingBox();
    assert.ok(firstRect);
    await page.mouse.move(firstRect.x + firstRect.width / 2, firstRect.y + firstRect.height / 2);

    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(80);
    const insideScroll = await page.evaluate(() => ({
      graphTop: document.querySelectorAll('.markdown-diagram-view')[0]!.scrollTop,
      streamTop: document.querySelector('.knowledge-reader-body')!.scrollTop,
    }));
    assert.ok(insideScroll.graphTop > 0, `expected tall diagram to scroll internally first: ${JSON.stringify(insideScroll)}`);
    assert.equal(insideScroll.streamTop, 0, JSON.stringify(insideScroll));

    for (let step = 0; step < 8; step += 1) {
      await page.mouse.wheel(0, 180);
      await page.waitForTimeout(25);
    }
    const bottomChain = await page.evaluate(() => {
      const graph = document.querySelectorAll('.markdown-diagram-view')[0]!;
      const stream = document.querySelector('.knowledge-reader-body')!;
      return {
        graphTop: graph.scrollTop,
        graphMax: graph.scrollHeight - graph.clientHeight,
        streamTop: stream.scrollTop,
      };
    });
    assert.ok(bottomChain.graphTop >= bottomChain.graphMax - 2, JSON.stringify(bottomChain));
    assert.ok(bottomChain.streamTop > 0, `expected wheel past diagram bottom to scroll outer reader: ${JSON.stringify(bottomChain)}`);

    await page.evaluate(() => {
      const stream = document.querySelector('.knowledge-reader-body')!;
      const graph = document.querySelectorAll('.markdown-diagram-view')[0]!;
      stream.scrollTop = 280;
      graph.scrollTop = 120;
    });
    const rectAtOffset = await page.locator('.markdown-diagram-view').nth(0).boundingBox();
    assert.ok(rectAtOffset && rectAtOffset.y >= 0 && rectAtOffset.y + rectAtOffset.height <= 720, JSON.stringify(rectAtOffset));
    await page.mouse.move(rectAtOffset.x + rectAtOffset.width / 2, rectAtOffset.y + rectAtOffset.height / 2);

    for (let step = 0; step < 6; step += 1) {
      await page.mouse.wheel(0, -160);
      await page.waitForTimeout(25);
    }
    const topChain = await page.evaluate(() => ({
      graphTop: document.querySelectorAll('.markdown-diagram-view')[0]!.scrollTop,
      streamTop: document.querySelector('.knowledge-reader-body')!.scrollTop,
    }));
    assert.equal(topChain.graphTop, 0, JSON.stringify(topChain));
    assert.ok(topChain.streamTop < 280, `expected wheel past diagram top to scroll outer reader up: ${JSON.stringify(topChain)}`);

    await page.evaluate(() => {
      const stream = document.querySelector('.knowledge-reader-body')!;
      stream.scrollTop = 0;
      document.querySelectorAll('.markdown-diagram-view')[1]!.scrollIntoView({block: 'center'});
    });
    const beforeCompact = await page.evaluate(() => document.querySelector('.knowledge-reader-body')!.scrollTop);
    const compactRect = await page.locator('.markdown-diagram-view').nth(1).boundingBox();
    assert.ok(compactRect);
    await page.mouse.move(compactRect.x + compactRect.width / 2, compactRect.y + compactRect.height / 2);
    await page.mouse.wheel(0, 160);
    await page.waitForTimeout(80);
    const afterCompact = await page.evaluate(() => document.querySelector('.knowledge-reader-body')!.scrollTop);
    assert.ok(afterCompact > beforeCompact, `expected compact non-overflow diagram to scroll outer reader immediately (${beforeCompact} -> ${afterCompact})`);
  } finally {
    await browser.close();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await vite.close();
  }
});
