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

test('rendered Mermaid diagrams fit proportionally without scrollbars in message stream and fit container width without clipping in document reader', {timeout: 30000}, async () => {
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
    if (req.url === '/__document-width-fit-test__') {
      res.writeHead(200, {'content-type': 'text/html; charset=utf-8'});
      res.end(`<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/src/shared.css">
        <style>
          *{box-sizing:border-box}
          body{margin:0}
          .knowledge-reader-shell{width:100%;height:720px;display:flex;flex-direction:column}
          .knowledge-reader-body{flex:1;min-height:0;overflow-y:auto;padding:24px}
          .lead{height:120px}
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
            'sequenceDiagram',
            'A->>B: 大型时序图',
            '\`\`\`',
            '',
            '\`\`\`mermaid',
            'graph LR',
            'C[超宽矮图] --> D[结束]',
            '\`\`\`',
            '',
            '\`\`\`mermaid',
            'graph TD',
            'E[窄高图] --> F[结束]',
            '\`\`\`',
            '',
            '\`\`\`mermaid',
            'graph LR',
            'G[紧凑] --> H[结束]',
            '\`\`\`',
          ].join('\\n');
          const view = renderMarkdown(markdown);
          mount.replaceChildren(view);
          const blocks = [...mount.querySelectorAll('.markdown-diagram')];
          const svgs = [
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1100 1500" width="100%" style="max-width:1100px"><rect width="1100" height="1500" fill="#fff"/><text x="20" y="40">大型时序图顶部</text><text x="20" y="1460">大型时序图底部</text></svg>',
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 300" width="1600" height="300"><rect width="1600" height="300" fill="#fff"/></svg>',
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 920" width="420" height="920"><rect width="420" height="920" fill="#fff"/><text x="20" y="40">高流程图顶部</text><text x="20" y="880">高流程图底部</text></svg>',
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 110" width="320" height="110"><rect width="320" height="110" fill="#fff"/><text x="20" y="55">紧凑流程图</text></svg>',
          ];
          svgs.forEach((svg, index) => {
            const block = blocks[index];
            const graph = block.querySelector('.markdown-diagram-view');
            graph.hidden = false;
            setDiagramSvg(graph, svg);
            block.setAttribute('data-mermaid-state', 'rendered');
            rememberBlockDiagramSvg(block, svg);
          });
          window.__documentFitReady = true;
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

    await page.goto(`http://127.0.0.1:${port}/__document-width-fit-test__`);
    await page.waitForFunction(() => Boolean((window as Window & {__documentFitReady?: boolean}).__documentFitReady));

    const docMetrics = await page.evaluate(() => {
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
    docMetrics.forEach((metric, index) => {
      assert.ok(metric.scrollW <= metric.clientW, `document diagram #${index} must not scroll horizontally: ${JSON.stringify(metric)}`);
      assert.ok(metric.scrollH <= metric.clientH, `document diagram #${index} must not scroll vertically: ${JSON.stringify(metric)}`);
      assert.ok(Math.abs(metric.rectRatio - metric.vbRatio) < 0.03, `document diagram #${index} must preserve aspect ratio: ${JSON.stringify(metric)}`);
    });
    assert.ok(docMetrics[0].svgW > 800 && docMetrics[0].svgH > 1100, `large sequence diagram in reader should fill width and expand naturally without height cap: ${JSON.stringify(docMetrics[0])}`);
    assert.ok(docMetrics[1].svgW > 800 && docMetrics[1].svgH < 200, `ultra-wide short diagram in reader should scale proportionally to fit width: ${JSON.stringify(docMetrics[1])}`);
    assert.ok(docMetrics[2].svgW >= 419 && docMetrics[2].svgW <= 421 && docMetrics[2].svgH >= 919 && docMetrics[2].svgH <= 921, `narrow tall diagram in reader should keep intrinsic size without clipping or stretching: ${JSON.stringify(docMetrics[2])}`);
    assert.ok(docMetrics[3].svgW >= 319 && docMetrics[3].svgW <= 321 && docMetrics[3].svgH >= 109 && docMetrics[3].svgH <= 111, `compact diagram in reader should keep intrinsic size without stretching: ${JSON.stringify(docMetrics[3])}`);

    const firstDocRect = await page.locator('.markdown-diagram-view').nth(0).boundingBox();
    assert.ok(firstDocRect);
    const hitY = Math.max(firstDocRect.y + 40, Math.min(firstDocRect.y + firstDocRect.height / 2, 720 - 40));
    await page.mouse.move(firstDocRect.x + firstDocRect.width / 2, hitY);
    await page.mouse.wheel(0, 180);
    await page.waitForTimeout(80);
    const docDown = await page.evaluate(() => ({
      graphTop: document.querySelectorAll('.markdown-diagram-view')[0]!.scrollTop,
      readerTop: document.querySelector('.knowledge-reader-body')!.scrollTop,
    }));
    assert.equal(docDown.graphTop, 0, JSON.stringify(docDown));
    assert.ok(docDown.readerTop > 0, `wheel down over tall reader diagram must scroll outer reader directly: ${JSON.stringify(docDown)}`);

    const rectAfterDown = await page.locator('.markdown-diagram-view').nth(0).boundingBox();
    assert.ok(rectAfterDown);
    const upHitY = Math.max(40, Math.min(rectAfterDown.y + 80, 720 - 40));
    await page.mouse.move(rectAfterDown.x + rectAfterDown.width / 2, upHitY);
    await page.mouse.wheel(0, -140);
    await page.waitForTimeout(80);
    const docUp = await page.evaluate(() => ({
      graphTop: document.querySelectorAll('.markdown-diagram-view')[0]!.scrollTop,
      readerTop: document.querySelector('.knowledge-reader-body')!.scrollTop,
    }));
    assert.equal(docUp.graphTop, 0, JSON.stringify(docUp));
    assert.ok(docUp.readerTop < docDown.readerTop, `wheel up over tall reader diagram must scroll outer reader up: ${JSON.stringify(docUp)}`);

    await page.evaluate(() => {
      document.querySelectorAll('.markdown-diagram-view')[3]!.scrollIntoView({block: 'center'});
    });
    const beforeCompact = await page.evaluate(() => document.querySelector('.knowledge-reader-body')!.scrollTop);
    const compactRect = await page.locator('.markdown-diagram-view').nth(3).boundingBox();
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
