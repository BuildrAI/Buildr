import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

type ViteBuildOutput = {
  output?: Array<{ type: string; code?: string }>;
};

async function bundleBrowserScript(serviceRoot: string): Promise<string> {
  const viteModulePath = path.join(serviceRoot, 'node_modules/vite/dist/node/index.js');
  const vite = await import(pathToFileURL(viteModulePath).href) as {
    build(config: unknown): Promise<ViteBuildOutput | ViteBuildOutput[]>;
  };
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'markdown-copy-browser-'));
  const entryPath = path.join(tempRoot, 'entry.ts');
  fs.writeFileSync(entryPath, [
    `import { renderMarkdown } from ${JSON.stringify(path.join(serviceRoot, 'src/markdown.ts'))};`,
    `import { applyProductTypography } from ${JSON.stringify(path.join(serviceRoot, 'src/typography.ts'))};`,
    `(window as unknown as Record<string, unknown>).__markdownTest = { renderMarkdown, applyProductTypography };`,
  ].join('\n'));
  try {
    const result = await vite.build({
      root: serviceRoot,
      configFile: false,
      logLevel: 'silent',
      build: {
        write: false,
        minify: false,
        lib: { entry: entryPath, formats: ['iife'], name: 'MarkdownTestBundle', fileName: () => 'bundle.js' },
      },
    });
    const first = Array.isArray(result) ? result[0] : result;
    const chunk = first?.output?.find(item => item.type === 'chunk' && typeof item.code === 'string');
    if (!chunk?.code) throw new Error('Failed to bundle markdown browser test script');
    return chunk.code;
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

test('code block copy button renders as a borderless icon inside the top-right corner and copies exact code', { timeout: 60000 }, async () => {
  const serviceRoot = path.resolve(import.meta.dirname, '../..');
  const bundle = await bundleBrowserScript(serviceRoot);
  const css = [
    path.join(serviceRoot, 'node_modules/antd/dist/reset.css'),
    path.join(serviceRoot, 'src/shared.css'),
    path.join(serviceRoot, 'src/features/agent-conversations/agent-conversations.css'),
    path.join(serviceRoot, 'src/features/agent-conversations/conversation-flow.css'),
  ].map(file => fs.readFileSync(file, 'utf8')).join('\n');

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 920, height: 800 } });
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'http://localhost' });
    const page = await context.newPage();
    const html = `<!doctype html><html><head><style>${css}</style></head><body><section class="ac-panel is-full"><div class="ac-conversation-view"><div class="ac-stream"><div class="ac-message-list"><article class="ac-message is-assistant"><div class="ac-assistant-reply"><div id="host"></div></div></article></div></div></div></section></body></html>`;
    await page.route('http://localhost/index.html', route => route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html }));
    await page.goto('http://localhost/index.html');
    await page.addScriptTag({ content: bundle });

    const singleLine = '~/Applications/Buildr Harness Dev.app';
    const multiLine = '/Users/chenjun/.local/opt/node-v24.21.0/bin/node \\\n  projects/product/services/buildr-harness/bin/buildr-harness.mjs \\\n  web --profile development';
    const markdown = ['默认生成：', '', '```text', singleLine, '```', '', '启动命令：', '', '```sh', multiLine, '```'].join('\n');

    await page.evaluate((source) => {
      const api = (window as unknown as {
        __markdownTest: {
          renderMarkdown(md: string): HTMLElement;
          applyProductTypography(style: CSSStyleDeclaration): void;
        };
      }).__markdownTest;
      api.applyProductTypography(document.documentElement.style);
      document.getElementById('host')!.append(api.renderMarkdown(source));
    }, markdown);

    const blocks = page.locator('.markdown-code-block');
    assert.equal(await blocks.count(), 2);

    for (let index = 0; index < 2; index += 1) {
      const metrics = await blocks.nth(index).evaluate((block) => {
        const button = block.querySelector<HTMLButtonElement>('button.markdown-copy-code')!;
        const pre = block.querySelector<HTMLElement>('pre')!;
        const svg = button.querySelector<SVGElement>('svg')!;
        const label = button.querySelector<HTMLElement>('.markdown-copy-code-label')!;
        const style = getComputedStyle(button);
        const btnBox = button.getBoundingClientRect();
        const preBox = pre.getBoundingClientRect();
        const svgBox = svg.getBoundingClientRect();
        const labelBox = label.getBoundingClientRect();
        return {
          position: style.position,
          borderTopWidth: style.borderTopWidth,
          btnBox: { top: btnBox.top, right: btnBox.right, bottom: btnBox.bottom, left: btnBox.left, width: btnBox.width, height: btnBox.height },
          preBox: { top: preBox.top, right: preBox.right, bottom: preBox.bottom, left: preBox.left },
          svgBox: { width: svgBox.width, height: svgBox.height },
          labelBox: { width: labelBox.width, height: labelBox.height },
          path: button.querySelector('path')?.getAttribute('d') || '',
        };
      });
      assert.equal(metrics.position, 'absolute');
      assert.equal(metrics.borderTopWidth, '0px');
      assert.ok(metrics.btnBox.width <= 28 && metrics.btnBox.height <= 28, JSON.stringify(metrics));
      assert.ok(metrics.btnBox.top >= metrics.preBox.top && metrics.btnBox.right <= metrics.preBox.right && metrics.btnBox.bottom <= metrics.preBox.bottom, JSON.stringify(metrics));
      assert.ok(metrics.svgBox.width >= 12 && metrics.svgBox.height >= 12, JSON.stringify(metrics));
      assert.ok(metrics.labelBox.width <= 1 && metrics.labelBox.height <= 1, JSON.stringify(metrics));
    }

    const firstButton = blocks.nth(0).getByRole('button', { name: '复制代码', exact: true });
    const idlePath = await firstButton.locator('path').getAttribute('d');
    await firstButton.click();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), singleLine);
    const copiedButton = blocks.nth(0).locator('[data-copy-code]').filter({ hasText: '已复制' });
    await copiedButton.waitFor();
    assert.equal(await copiedButton.getAttribute('aria-label'), '已复制');
    assert.equal(await copiedButton.isDisabled(), true);
    assert.notEqual(await copiedButton.locator('path').getAttribute('d'), idlePath);

    await blocks.nth(1).getByRole('button', { name: '复制代码', exact: true }).click();
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), multiLine);
  } finally {
    await browser.close();
  }
});
