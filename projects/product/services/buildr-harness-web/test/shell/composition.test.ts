import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium, type Page} from 'playwright-core';

const serviceRoot = path.resolve(import.meta.dirname, '../..');

async function bundleFixture() {
  const vite = await import(pathToFileURL(path.join(serviceRoot, 'node_modules/vite/dist/node/index.js')).href);
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-shell-fixture-'));
  const entry = path.join(tempRoot, 'fixture.ts');
  fs.writeFileSync(entry, `
import {createElement as h, useEffect, useState} from ${JSON.stringify(path.join(serviceRoot, 'node_modules/react/index.js'))};
import {createRoot} from ${JSON.stringify(path.join(serviceRoot, 'node_modules/react-dom/client.js'))};
import {HarnessShell} from ${JSON.stringify(path.join(serviceRoot, 'src/shell/HarnessShell.tsx'))};
const stats = {conversationMounts: 0, environmentMounts: 0, stops: 0};
function Conversation() {
  const [draft, setDraft] = useState('');
  useEffect(() => {stats.conversationMounts++;}, []);
  return h('main', {'data-conversation-id': 'original-conversation', 'data-cwd': '/original/work'},
    h('textarea', {'aria-label': '对话输入', value: draft, onChange: e => setDraft(e.target.value)}),
    h('button', {onClick: () => stats.stops++}, '停止原执行'),
    h('div', {id: 'reading', style: {height: 100, overflow: 'auto'}},
      h('div', {style: {height: 1000}}, '原对话阅读内容')));
}
function Workspace() {
  const [value, setValue] = useState('');
  const [broken, setBroken] = useState(false);
  useEffect(() => {stats.environmentMounts++;}, []);
  if (broken) throw new Error('private fixture error not for display');
  return h('div', null,
    h('input', {'aria-label': '环境输入', value, onChange: e => setValue(e.target.value)}),
    h('button', {onClick: () => setBroken(true)}, '模拟环境渲染失败'));
}
function Broken() {throw new Error('first render fixture error');}
const root = createRoot(document.getElementById('root'));
function render(mode, controlledOpen) {
  const environment = mode === 'none' ? undefined : {
    id: mode, title: '样例环境', Workspace: mode === 'broken' ? Broken : Workspace,
  };
  root.render(h(HarnessShell, {environment, environmentOpen: controlledOpen,
    onEnvironmentOpenChange: controlledOpen === undefined ? undefined : open => render(mode, open),
  }, h(Conversation)));
}
window.fixture = {render, stats};
render('none');
`);
  try {
    const built = await vite.build({
      root: serviceRoot, configFile: false, logLevel: 'silent',
      define: {'process.env.NODE_ENV': JSON.stringify('production')},
      resolve: {dedupe: ['react', 'react-dom', 'antd']},
      esbuild: {jsx: 'automatic'},
      build: {write: false, minify: false, lib: {entry, formats: ['iife'], name: 'ShellFixture'}},
    });
    const output = (Array.isArray(built) ? built[0] : built).output;
    const script = output.find((item: {type: string}) => item.type === 'chunk');
    assert.ok(script && 'code' in script);
    const css = output.filter((item: {type: string; fileName: string}) => item.type === 'asset' && item.fileName.endsWith('.css'))
      .map((item: {source: string | Uint8Array}) => String(item.source)).join('\n');
    return {script: script.code, css};
  } finally {
    fs.rmSync(tempRoot, {recursive: true, force: true});
  }
}

async function render(page: Page, mode: 'none' | 'working' | 'broken') {
  await page.evaluate(value => (window as any).fixture.render(value), mode);
  await page.waitForFunction(value =>
    (value === 'none') === (document.querySelector('nav[aria-label="工作环境"]') === null), mode);
}

test('Harness shell composes an optional environment without owning or remounting conversation work', {timeout: 60000}, async t => {
  const bundle = await bundleFixture();
  const browser = await chromium.launch({headless: true});
  t.after(() => browser.close());
  const context = await browser.newContext({viewport: {width: 1200, height: 800}});
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('http://localhost/shell', route => route.fulfill({
    contentType: 'text/html',
    body: `<html><head><style>html,body,#root{height:100%;margin:0}*{box-sizing:border-box}${bundle.css}</style></head><body><div id="root"></div></body></html>`,
  }));
  await page.goto('http://localhost/shell');
  await page.addScriptTag({content: bundle.script});
  await page.waitForFunction(() => !!document.querySelector('textarea'), undefined, {timeout: 5000})
    .catch(error => {throw new Error(`Fixture did not mount: ${errors.join('; ')}`, {cause: error});});
  const input = page.getByRole('textbox', {name: '对话输入', exact: true});
  await input.fill('尚未发送的原对话草稿');
  await page.locator('#reading').evaluate(node => {node.scrollTop = 233;});
  await input.evaluate(node => {(window as any).originalInput = node;});

  await t.test('no environment means no empty controls and conversation fills the shell', async () => {
    assert.equal(await page.getByRole('navigation', {name: '工作环境'}).count(), 0);
    assert.equal(await page.locator('.harness-environment-region').count(), 0);
    const box = await page.locator('.harness-conversation-region').boundingBox();
    assert.ok(box && box.width === 1200 && box.height === 800);
  });

  await t.test('first open is lazy; closing preserves both mounted regions and their local state', async () => {
    await render(page, 'working');
    assert.equal(await page.evaluate(() => (window as any).fixture.stats.environmentMounts), 0);
    const toggle = page.getByRole('button', {name: '打开样例环境', exact: true});
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
    await toggle.click();
    const envInput = page.getByRole('textbox', {name: '环境输入', exact: true});
    await envInput.fill('工作环境未保存输入');
    for (let attempt = 0; attempt < 3; attempt++) {
      await page.getByRole('button', {name: '收起样例环境', exact: true}).click();
      assert.equal(await envInput.isVisible(), false);
      await page.getByRole('button', {name: '打开样例环境', exact: true}).click();
      assert.equal(await envInput.inputValue(), '工作环境未保存输入');
    }
    assert.equal(await input.inputValue(), '尚未发送的原对话草稿');
    assert.equal(await input.evaluate(node => node === (window as any).originalInput), true);
    assert.equal(await page.locator('#reading').evaluate(node => node.scrollTop), 233);
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.stats),
      {conversationMounts: 1, environmentMounts: 1, stops: 0});
    assert.equal(await page.locator('[data-conversation-id]').getAttribute('data-cwd'), '/original/work');
  });

  await t.test('narrow screens keep conversation, environment and close control reachable', async () => {
    await page.setViewportSize({width: 390, height: 844});
    const conversation = await page.locator('.harness-conversation-region').boundingBox();
    const environment = await page.getByRole('region', {name: '样例环境', exact: true}).boundingBox();
    assert.ok(conversation && environment && conversation.height > 0 && environment.height > 0);
    assert.ok(environment.y >= conversation.y + conversation.height - 1);
    assert.ok(environment.x >= 0 && environment.x + environment.width <= 390);
    await page.getByRole('button', {name: '收起样例环境', exact: true}).click();
    await input.fill('窄屏继续输入');
    await page.getByRole('button', {name: '打开样例环境', exact: true}).click();
    await page.setViewportSize({width: 1200, height: 800});
  });

  await t.test('later render failure is local and does not disable original conversation controls', async () => {
    await page.getByRole('button', {name: '模拟环境渲染失败', exact: true}).click();
    await page.getByText('工作环境暂不可用，仍可继续使用对话。', {exact: true}).waitFor();
    assert.equal(await page.getByText('private fixture error not for display', {exact: true}).count(), 0);
    await input.fill('环境失败后继续输入');
    await page.getByRole('button', {name: '停止原执行', exact: true}).click();
    await page.getByRole('button', {name: '收起样例环境', exact: true}).click();
    assert.equal(await input.evaluate(node => node === (window as any).originalInput), true);
  });

  await t.test('initial render failure and removal also leave the original conversation intact', async () => {
    await render(page, 'broken');
    await page.getByRole('button', {name: '打开样例环境', exact: true}).click();
    await page.getByText('工作环境暂不可用，仍可继续使用对话。', {exact: true}).waitFor();
    await page.getByRole('button', {name: '收起样例环境', exact: true}).click();
    await render(page, 'none');
    assert.equal(await input.inputValue(), '环境失败后继续输入');
    assert.equal(await page.locator('#reading').evaluate(node => node.scrollTop), 233);
    assert.deepEqual(await page.evaluate(() => (window as any).fixture.stats),
      {conversationMounts: 1, environmentMounts: 1, stops: 1});
    assert.deepEqual(errors, [], 'React boundaries must contain both render failures');
  });

  await t.test('host-controlled opening mounts on external navigation and preserves state on closing', async () => {
    await page.evaluate(() => (window as any).fixture.render('working', true));
    const envInput = page.getByRole('textbox', {name: '环境输入', exact: true});
    await envInput.fill('宿主控制的工程草稿');
    await page.getByRole('button', {name: '收起样例环境', exact: true}).click();
    assert.equal(await envInput.isVisible(), false);
    await page.evaluate(() => (window as any).fixture.render('working', true));
    await envInput.waitFor();
    assert.equal(await envInput.inputValue(), '宿主控制的工程草稿');
    assert.equal(await input.evaluate(node => node === (window as any).originalInput), true);
    assert.equal(await input.inputValue(), '环境失败后继续输入');
  });
});
