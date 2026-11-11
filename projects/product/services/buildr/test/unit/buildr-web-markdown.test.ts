import assert from 'node:assert/strict';
import test from 'node:test';

function createTestDocument(): any  {
  const document: any = {
    createElement(tagName: any): any  {
      return createElement(String(tagName).toLowerCase());
    },
    createTextNode(value: any): any  {
      return { nodeType: 3, nodeName: '#text', textContent: String(value), childNodes: [] };
    },
    createDocumentFragment(): any  {
      return createElement('#document-fragment');
    },
  };

  function createElement(tagName: any): any  {
    const node: any = {
      nodeType: tagName === '#document-fragment' ? 11 : 1,
      nodeName: tagName === '#document-fragment' ? '#document-fragment' : tagName.toUpperCase(),
      tagName: tagName === '#document-fragment' ? undefined : tagName.toUpperCase(),
      attributes: Object.create(null),
      listeners: new Map<string, (event: any) => void>(),
      addEventListener(type: string, listener: (event: any) => void) { this.listeners.set(type,listener); },
      dispatchEvent(event: any) { this.listeners.get(event.type)?.(event); },
      replaceWith(next: any) {
        const parent=this.parentNode;if(!parent)return;
        parent.childNodes[parent.childNodes.indexOf(this)]=next;next.parentNode=parent;this.parentNode=null;
      },
      childNodes: [],
      parentNode: null,
      ownerDocument: document,
      className: '',
      get textContent() {
        return this.childNodes.map((child: any) => child.textContent ?? '').join('');
      },
      set textContent(value: any) {
        this.childNodes = [document.createTextNode(value)];
      },
      setAttribute(name: any, value: any): any  {
        this.attributes[name] = String(value);
      },
      getAttribute(name: any): any  {
        return Object.hasOwn(this.attributes, name) ? this.attributes[name] : null;
      },
      append(...nodes: any[]): any  {
        for (const item of nodes) {
          const child: any = typeof item === 'string' ? document.createTextNode(item) : item;
          child.parentNode = this;
          this.childNodes.push(child);
        }
      },
      querySelector(selector: any): any  {
        return queryAll(this, selector)[0] ?? null;
      },
      querySelectorAll(selector: any): any  {
        return queryAll(this, selector);
      },
    };
    Object.defineProperty(node, 'className', {
      get(): any  { return this.getAttribute('class') ?? ''; },
      set(value: any): any  { this.setAttribute('class', value); },
    });
    return node;
  }

  function matches(node: any, selector: any): any  {
    if (node.nodeType !== 1) return false;
    if (selector.includes(' ')) {
      const parts: any = selector.trim().split(/\s+/);
      let current: any[] = [node];
      for (const part of parts) {
        current = current.flatMap((item: any) => collect(item, (candidate: any) => matchesSimple(candidate, part), item === node));
      }
      return current.includes(node) || collect(node, (candidate: any) => true).some((candidate: any) => matches(candidate, selector));
    }
    return matchesSimple(node, selector);
  }

  function matchesSimple(node: any, selector: any): any  {
    if (node.nodeType !== 1) return false;
    const [tag, ...classes]: any = selector.replace(/\./g, ' .').trim().split(/\s+/);
    if (tag && tag !== '*' && node.tagName !== tag.toUpperCase()) return false;
    for (const className of classes) {
      if (!node.className.split(/\s+/).includes(className)) return false;
    }
    return true;
  }

  function collect(root: any, predicate: any, includeRoot: any = false): any  {
    const result: any[] = [];
    const visit: any = (node: any, allow: any) => {
      if (allow && predicate(node)) result.push(node);
      for (const child of node.childNodes) visit(child, true);
    };
    visit(root, includeRoot);
    return result;
  }

  function queryAll(root: any, selector: any): any  {
    if (selector.includes(' ')) {
      const parts: any = selector.trim().split(/\s+/);
      let current: any = collect(root, (node: any) => matchesSimple(node, parts[0]));
      for (const part of parts.slice(1)) {
        current = current.flatMap((item: any) => collect(item, (node: any) => matchesSimple(node, part)));
      }
      return current;
    }
    return collect(root, (node: any) => matchesSimple(node, selector));
  }

  return document;
}

const originalDocument: any = globalThis.document;

test.before(() => {
  globalThis.document = createTestDocument();
});

test.after(() => {
  if (originalDocument === undefined) Reflect.deleteProperty(globalThis, 'document');
  else globalThis.document = originalDocument;
});

async function loadRenderer(): Promise<any>  {
  return import(`../../../buildr-web/src/markdown.ts?test=${Date.now()}-${Math.random()}`);
}

function textOf(root: any): any  {
  return root.textContent.replace(/\s+/g, ' ').trim();
}

test('renderMarkdown 渲染标题、段落、列表与强调', async () => {
  const { renderMarkdown }: any = await loadRenderer();
  const root: any = renderMarkdown([
    '# 标题一',
    '',
    '普通段落含 **加粗** 和 *斜体*。',
    '',
    '- 项目甲',
    '- 项目乙',
    '',
    '1. 第一步',
    '2. 第二步',
  ].join('\n'));
  assert.equal(root.querySelector('h1')?.textContent, '标题一');
  assert.equal(root.querySelectorAll('p').length, 1);
  assert.equal(root.querySelector('strong')?.textContent, '加粗');
  assert.equal(root.querySelector('em')?.textContent, '斜体');
  assert.equal(root.querySelectorAll('ul li').length, 2);
  assert.equal(root.querySelectorAll('ol li').length, 2);
});

test('renderMarkdown 兼容中文标点闭合加粗，不改写正文与字面量', async () => {
  const { renderMarkdown } = await loadRenderer();
  for (const input of ['**保留事项：**较宽', '**注意！**请检查', '[**保留事项：**较宽](https://example.com)']) {
    const root = renderMarkdown(input);
    assert.ok(root.querySelector('strong'));
    assert.equal(root.textContent.includes('**'), false);
  }
  assert.equal(renderMarkdown('**保留事项：**较宽').textContent, '保留事项：较宽');
  for (const input of ['`**保留事项：**较宽`', '```\n**保留事项：**较宽\n```', '\\*\\*保留事项：\\*\\*较宽', '**保留事项：较宽', '**plain:**text']) {
    assert.equal(renderMarkdown(input).querySelector('strong'), null, input);
  }
  const normal = renderMarkdown('**保留事项**：较宽，**普通** 和 *强调*');
  assert.equal(normal.querySelectorAll('strong').length, 2);
  assert.equal(normal.querySelector('em')?.textContent, '强调');
  assert.equal(renderMarkdown('**事项<script>：**较宽').querySelector('script'), null);
});

test('renderMarkdown 兼容中文引号紧贴开符的加粗，不改写正文与字面量', async () => {
  const { renderMarkdown } = await loadRenderer();
  const sentence = '因为当前框架主要按**"改了哪个文件"选组，还不能准确判断"这个文件里具体改了什么"**。';
  const root = renderMarkdown(sentence);
  assert.equal(root.querySelector('strong')?.textContent, '"改了哪个文件"选组，还不能准确判断"这个文件里具体改了什么"');
  assert.equal(root.textContent, '因为当前框架主要按"改了哪个文件"选组，还不能准确判断"这个文件里具体改了什么"。');
  for (const input of ['按**“改了哪个文件”**选组', '按**（见上文）**处理', '按**"说明"**。', '按**"A"**方案']) {
    const view = renderMarkdown(input);
    assert.ok(view.querySelector('strong'), input);
    assert.equal(view.textContent.includes('**'), false, input);
  }
  for (const input of ['`按**"x"**选组`', '```\n按**"x"**选组\n```', '按\\*\\*"x"\\*\\*选组', '按**"x"选组']) {
    assert.equal(renderMarkdown(input).querySelector('strong'), null, input);
  }
  assert.equal(renderMarkdown('Plain **"quoted"** text').querySelector('strong')?.textContent, '"quoted"');
});

test('renderMarkdown 支持标题层级偏移，避免详情页重复 h1', async () => {
  const { renderMarkdown }: any = await loadRenderer();
  const root: any = renderMarkdown([
    '# 顶层',
    '## 次级',
    '###### 最深',
  ].join('\n'), { headingOffset: 1 });
  assert.equal(root.querySelector('h1'), null);
  assert.equal(root.querySelector('h2')?.textContent, '顶层');
  assert.equal(root.querySelector('h3')?.textContent, '次级');
  assert.equal(root.querySelector('h6')?.textContent, '最深');
});

test('renderMarkdown 渲染行内代码、围栏代码块、链接与表格', async () => {
  const { renderMarkdown }: any = await loadRenderer();
  const root: any = renderMarkdown([
    '使用 `buildr web`。',
    '',
    '```js',
    'const x = 1;',
    '```',
    '',
    '详见 [文档](https://example.com/docs)。',
    '',
    '| 列甲 | 列乙 |',
    '| --- | --- |',
    '| 甲 | 乙 |',
  ].join('\n'));
  assert.equal(root.querySelector('code')?.textContent, 'buildr web');
  assert.equal(root.querySelector('pre code')?.textContent, 'const x = 1;');
  const link: any = root.querySelector('a');
  assert.equal(link?.textContent, '文档');
  assert.equal(link?.getAttribute('href'), 'https://example.com/docs');
  assert.equal(link?.getAttribute('rel'), 'noopener noreferrer');
  assert.equal(root.querySelectorAll('table th').length, 2);
  assert.equal(root.querySelectorAll('table td').length, 2);
});

test('renderMarkdown 渲染任务勾选列表与分隔线', async () => {
  const { renderMarkdown }: any = await loadRenderer();
  const root: any = renderMarkdown([
    '- [x] 已完成',
    '- [ ] 未完成',
    '',
    '---',
    '',
    '后续说明',
  ].join('\n'));
  assert.equal(root.querySelectorAll('li').length, 2);
  assert.equal(root.querySelectorAll('input').length, 2);
  assert.equal(root.querySelectorAll('input')[0].checked, true);
  assert.equal(root.querySelectorAll('input')[1].checked, false);
  assert.equal(root.querySelectorAll('li')[0].className.includes('task-list-item'), true);
  assert.equal(root.querySelectorAll('ul')[0].className.includes('task-list'), true);
  assert.equal(root.querySelectorAll('hr').length, 1);
});

test('renderMarkdown 以文本节点转义危险内容且默认拒绝相对与危险链接', async () => {
  const { renderMarkdown }: any = await loadRenderer();
  const root: any = renderMarkdown([
    '<script>alert(1)</script>',
    '',
    '[坏链接](javascript:alert(1))',
    '',
    '[相对链接](proposal.md)',
    '',
    '[越界链接](../readme.md)',
    '',
    '[协议相对](//example.com/docs)',
    '',
    '正常 <b>标签字面量</b>',
  ].join('\n'));
  assert.equal(root.querySelectorAll('script').length, 0);
  assert.equal(root.querySelectorAll('b').length, 0);
  assert.match(textOf(root), /<script>alert\(1\)<\/script>/);
  assert.match(textOf(root), /正常 <b>标签字面量<\/b>/);
  assert.match(textOf(root), /相对链接/);
  assert.match(textOf(root), /当前视图不允许打开此链接：proposal\.md/);
  assert.match(textOf(root), /越界链接.*当前视图不允许打开此链接.*\.\.\/readme\.md/);
  assert.match(textOf(root), /协议相对.*当前视图不允许打开此链接.*\/\/example\.com\/docs/);
  assert.doesNotMatch(textOf(root), /\[相对链接\]\(/);
  assert.equal(root.querySelector('a'), null);
});

test('renderMarkdown 在启用相对链接时安全渲染 Change 内路径', async () => {
  const { renderMarkdown }: any = await loadRenderer();
  const root: any = renderMarkdown([
    '见 [提案](./proposal.md) 与 [任务](tasks.md#done)。',
    '',
    '[越界](../secret.md)',
    '',
    '[绝对](/etc/passwd)',
    '',
    '[脚本](javascript:alert(1))',
    '',
    '[外链](https://example.com/docs)',
  ].join('\n'), { allowRelativeLinks: true });
  const links: any = root.querySelectorAll('a');
  assert.equal(links.length, 3);
  assert.equal(links[0].getAttribute('href'), 'proposal.md');
  assert.equal(links[0].className.includes('markdown-relative-link'), true);
  assert.equal(links[0].getAttribute('target'), null);
  assert.equal(links[1].getAttribute('href'), 'tasks.md#done');
  assert.equal(links[2].getAttribute('href'), 'https://example.com/docs');
  assert.equal(links[2].getAttribute('target'), '_blank');
  assert.match(textOf(root), /越界.*链接路径超出允许范围.*\.\.\/secret\.md/);
  assert.match(textOf(root), /绝对.*链接路径包含非法字符.*\/etc\/passwd/);
  assert.match(textOf(root), /脚本.*不支持此链接协议.*javascript:alert\(1\)/);
  assert.doesNotMatch(textOf(root), /\[越界\]\(/);
});

test('本地 file 链接归一为文件路径并局部说明无法打开的链接', async () => {
  const { renderMarkdown }: any = await loadRenderer();
  const root: any = renderMarkdown([
    '- [查看 help 完整内容](file:///tmp/buildr-api-docs/help.md)',
    '- [查看 OpenAPI 行](file:///tmp/buildr-api-docs/openapi.json#L12)',
    '- [远程文件](file://server/share/a.md)',
    '- [脚本](javascript:alert(1))',
  ].join('\n'), { allowRelativeLinks: true, allowAbsoluteFileLinks: true });
  const links: any[] = [...root.querySelectorAll('a')];
  assert.equal(links.length, 2);
  assert.equal(links[0].getAttribute('href'), '/tmp/buildr-api-docs/help.md');
  assert.equal(links[0].getAttribute('data-markdown-href'), '/tmp/buildr-api-docs/help.md');
  assert.equal(links[0].textContent, '查看 help 完整内容');
  assert.equal(links[1].getAttribute('href'), '/tmp/buildr-api-docs/openapi.json#L12');
  assert.equal(links[1].getAttribute('data-markdown-href'), '/tmp/buildr-api-docs/openapi.json#L12');
  const text = textOf(root);
  assert.ok(text.includes('远程文件（仅支持本机 file:// 文件链接：file://server/share/a.md）'));
  assert.ok(text.includes('脚本（不支持此链接协议：javascript:alert(1)）'));
  assert.doesNotMatch(text, /\[查看 help 完整内容\]\(/);
});

test('renderMarkdown 可按需允许父级相对路径段', async () => {
  const { renderMarkdown }: any = await loadRenderer();
  const root: any = renderMarkdown('[上级](../docs/guide.md)', {
    allowRelativeLinks: true,
    allowParentRelativeLinks: true,
  });
  const links: any[] = [...root.querySelectorAll('a')];
  assert.equal(links.length, 1);
  assert.equal(links[0].getAttribute('href'), '../docs/guide.md');
  assert.equal(links[0].className.includes('markdown-relative-link'), true);
});

test('resolveProjectMarkdownHref 相对当前文档解析并只接受 .md', async () => {
  const { resolveProjectMarkdownHref }: any = await import(`../../../buildr-web/src/lib/projectDocuments.ts?test=${Date.now()}`);
  assert.equal(resolveProjectMarkdownHref('README.md', 'docs/guide.md'), 'docs/guide.md');
  assert.equal(resolveProjectMarkdownHref('docs/guide.md', '../README.md'), 'README.md');
  assert.equal(resolveProjectMarkdownHref('docs/guide.md', './note.md'), 'docs/note.md');
  assert.equal(resolveProjectMarkdownHref('README.md', 'services/buildr/'), null);
  assert.equal(resolveProjectMarkdownHref('README.md', 'docs/guide.md#section'), 'docs/guide.md');
});

test('renderMarkdown 只通过显式 resolver 渲染本地图片', async () => {
  const { renderMarkdown }: any = await loadRenderer();
  const root: any = renderMarkdown('![封面](assets/cover.png) ![危险](/tmp/secret.png)', {
    imageResolver(href: any): any  { return href === 'assets/cover.png' ? { href: '/api/v1/publications/demo/assets/assets/cover.png' } : null; },
  });
  const image: any = root.querySelector('img');
  assert.equal(root.querySelectorAll('img').length, 1);
  assert.equal(image?.getAttribute('alt'), '封面');
  assert.equal(image?.getAttribute('src'), '/api/v1/publications/demo/assets/assets/cover.png');
  assert.match(root.textContent, /危险/);
});


test('原生嵌套目录保持父子关系、可点击路径与安全转义', async () => {
  const { renderMarkdown } = await loadRenderer();
  const root = renderMarkdown('- `src/` — 根\n  - `domain/` — 规则\n    - [model.ts](../../src/domain/model.ts) — 实体\n  - [app.ts](../../src/app.ts) — 应用\n\n结束', {allowRelativeLinks:true,allowParentRelativeLinks:true});
  const top = root.childNodes[0];
  assert.equal(top.tagName, 'UL');
  const directory = top.childNodes[0];
  const children = directory.childNodes.find((n: { tagName: string; }) => n.tagName === 'UL');
  assert.equal(children.childNodes.length, 2);
  const nested = children.childNodes[0].childNodes.find((n: { tagName: string; }) => n.tagName === 'UL');
  assert.equal(nested.querySelector('a').getAttribute('href'), '../../src/domain/model.ts');
  assert.equal(children.childNodes[1].querySelector('a').textContent, 'app.ts');
  assert.equal(root.childNodes[1].textContent, '结束');
  const unsafe=renderMarkdown('- 根\n  - [危险](javascript:alert)\n  - <script>evil</script>', {allowRelativeLinks:true});
  assert.equal(unsafe.querySelectorAll('a').length,0);
  assert.equal(unsafe.querySelectorAll('script').length,0);
});

test('嵌套有序与任务列表保持各自类型且不会丢失相邻列表', async () => {
  const { renderMarkdown } = await loadRenderer();
  const root=renderMarkdown('1. 第一步\n   - [x] 已完成\n   - [ ] 待办\n2. 第二步\n- 另一组');
  assert.equal(root.childNodes[0].tagName, 'OL');
  assert.equal(root.childNodes[0].childNodes.length, 2);
  assert.equal(root.childNodes[0].querySelectorAll('input').length, 2);
  assert.equal(root.childNodes[0].querySelector('input').checked, true);
  assert.equal(root.childNodes[1].tagName, 'UL');
});

test('代码正文保留空行和缩进，完整Mermaid标记异步绘图，表格独立滚动', async () => {
  const { renderMarkdown } = await loadRenderer();
  const code = 'first\n  second\n\nlast';
  const root = renderMarkdown('```sh\n' + code + '\n```\n\n```mermaid\ngraph LR\n  A --> B\n```\n\n| a | b |\n| --- | --- |\n| c | d |', { sourcePath: 'docs/readme.md' });
  assert.equal(root.querySelector('pre code').textContent, code);
  assert.equal(root.querySelectorAll('button').length, 2);
  assert.match(root.textContent, /正在绘制图示/);
  assert.equal(root.querySelectorAll('div').find((node: any) => node.className.includes('markdown-diagram')).getAttribute('data-mermaid-source'), 'graph LR\n  A --> B');
  assert.equal(root.querySelector('details').open, true);
  assert.match(root.textContent, /docs\/readme.md/);
  assert.equal(root.querySelector('table').parentNode.className, 'markdown-table-scroll');
});

test('波浪线代码围栏保留架构树的换行、空行、缩进和安全文本', async () => {
  const { renderMarkdown } = await loadRenderer();
  const source = '浏览器：things-web\n    │ HTTP + SSE\nThings 后端：things-server\n    ├─ SQLite：对话\n    └─ Buildr Agent service\n        └─ models.generate → 当前可用模型\n\n<script>不执行</script>';
  const root = renderMarkdown('说明\n~~~text\n' + source + '\n~~~\n\n## 后续');
  assert.equal(root.querySelector('pre code').textContent, source);
  assert.equal(root.querySelector('pre code').getAttribute('data-language'), 'text');
  assert.equal(root.querySelectorAll('script').length, 0);
  assert.equal(root.querySelectorAll('button').length, 1);
  assert.equal(root.querySelector('p').textContent, '说明');
  assert.equal(root.querySelector('h2').textContent, '后续');
});

test('两类代码围栏按字符和最小长度闭合，内部标题不影响锚点计数', async () => {
  const { renderMarkdown, markdownHeadingCounts } = await loadRenderer();
  for (const marker of ['`', '~']) {
    const source = '# 隐藏\n' + marker.repeat(3) + '\n' + (marker === '`' ? '~~~' : '```') + '\n  仍在代码中';
    const text = '   ' + marker.repeat(4) + 'text extra\n' + source + '\n  ' + marker.repeat(5) + ' \t\n# 可见';
    assert.equal(renderMarkdown(text).querySelector('pre code').textContent, source);
    assert.deepEqual(markdownHeadingCounts(text), { '可见': 1 });
  }
});

test('未闭合波浪线围栏保留剩余文本，图示只在正确闭合后绘制', async () => {
  const { renderMarkdown } = await loadRenderer();
  const source = 'graph LR\n  A --> B\n```';
  const incomplete = renderMarkdown('~~~mermaid\n' + source);
  assert.equal(incomplete.querySelector('pre code').textContent, source);
  assert.equal(incomplete.querySelectorAll('div').find((node: any) => node.className.includes('markdown-diagram')).getAttribute('data-mermaid-state'), 'incomplete');
  const complete = renderMarkdown('~~~mermaid\ngraph LR\n  A --> B\n~~~');
  assert.equal(complete.querySelectorAll('div').find((node: any) => node.className.includes('markdown-diagram')).getAttribute('data-mermaid-source'), 'graph LR\n  A --> B');
});

test('未闭合Mermaid不进入绘图并保留完整源码，大小写语言标识一致', async () => {
  const { renderMarkdown } = await loadRenderer();
  const root = renderMarkdown('```Mermaid\ngraph LR\n  A -->');
  const block = root.querySelectorAll('div').find((node: any) => node.className.includes('markdown-diagram'));
  assert.equal(block.getAttribute('data-mermaid-source'), null);
  assert.equal(block.getAttribute('data-mermaid-state'), 'incomplete');
  assert.equal(block.querySelector('code').textContent, 'graph LR\n  A -->');
  assert.match(root.textContent, /尚未完整输出/);
});

test('标题章节标识与常见GitHub片段一致，重名章节不覆盖', async () => {
  const { renderMarkdown } = await loadRenderer();
  const root = renderMarkdown('## 开始使用（Getting Started）\n## 开始使用（Getting Started）\n## `buildr update`');
  assert.deepEqual(root.querySelectorAll('h2').map((item: { getAttribute(name: string): string | null }) => item.getAttribute('id')), ['开始使用getting-started', '开始使用getting-started-1', 'buildr-update']);
});

test('相对链接保留原始安全引用，分块标题计数不依赖共享可变状态', async () => {
  const { renderMarkdown, markdownHeadingCounts } = await loadRenderer();
  const first = '## 说明\n\n![图片](image.png)';
  const original = './name%20space.md#说明';
  const root = renderMarkdown(`## 说明\n[引用](${original})`, { allowRelativeLinks: true, headingCounts: markdownHeadingCounts(first) });
  assert.equal(root.querySelector('h2').getAttribute('id'), '说明-1');
  assert.equal(root.querySelector('a').getAttribute('data-markdown-href'), original);
  assert.equal(root.querySelector('a').getAttribute('href'), 'name%20space.md#说明');
});

test('外层标题替换源H1时保留其锚点与后续同名章节序号', async () => {
  const { renderMarkdown, markdownDocumentBody } = await loadRenderer();
  const body = markdownDocumentBody('# 标题 `Name`\n\n## 标题 `Name`\n正文', true);
  assert.equal(body.anchor, '标题-name');
  assert.equal(renderMarkdown(body.content, { headingCounts: body.headingCounts }).querySelector('h2').getAttribute('id'), '标题-name-1');
  assert.equal(markdownDocumentBody('# 原文\n', false).anchor, undefined);
});

test('标题计数与渲染使用相同的围栏结束条件', async () => {
  const { renderMarkdown, markdownHeadingCounts } = await loadRenderer();
  const text = '```md\n```js\n## 说明\n```\n## 说明';
  assert.deepEqual(markdownHeadingCounts(text), { '说明': 1 });
  assert.equal(renderMarkdown(text).querySelector('h2').getAttribute('id'), '说明');
});

test('conversation file references opt in to short labels without enabling executable URLs',async()=>{
  const {renderMarkdown}:any=await loadRenderer();
  const markdown='[来源](projects/product/a.ts:155) [绝对位置](/repo/a.ts#L9) [脚本](javascript:alert)';
  const view=renderMarkdown(markdown,{allowRelativeLinks:true,allowAbsoluteFileLinks:true});
  const links=view.querySelectorAll('a');assert.equal(links.length,2);assert.equal(links[0].textContent,'来源');assert.equal(links[0].getAttribute('data-markdown-href'),'projects/product/a.ts:155');assert.equal(links[1].textContent,'绝对位置');
  assert.equal(renderMarkdown(markdown).querySelectorAll('a').length,0,'other consumers remain closed by default');
});

test('a filename-only line citation is local, not a custom URL protocol',async()=>{
  const {renderMarkdown}:any=await loadRenderer();
  const view=renderMarkdown('[来源](README.md:1)',{allowRelativeLinks:true});
  const link=view.querySelector('a');assert.ok(link);assert.equal(link.textContent,'来源');assert.equal(link.getAttribute('href'),'./README.md:1');assert.equal(link.getAttribute('data-markdown-href'),'README.md:1');
});

test('angle destinations are parsed before safe link resolution and opener callbacks',async()=>{
 const {renderMarkdown}:any=await loadRenderer();
 const root=renderMarkdown('[记录](<.buildr/local/记录 文档 (新版).md>) [行号](</work/a.md:12>) [安全](<https://example.com/a>) [拒绝](<javascript:alert>) [不完整](<bad.md)',{allowRelativeLinks:true,allowAbsoluteFileLinks:true});
 const links:any[]=[...root.querySelectorAll('a')];assert.equal(links.length,3);
 assert.equal(links[0].getAttribute('href'),'.buildr/local/记录 文档 (新版).md');
 assert.equal(links[0].getAttribute('data-markdown-href'),'.buildr/local/记录 文档 (新版).md');
 assert.equal(links[1].getAttribute('data-markdown-href'),'/work/a.md:12');
 assert.equal(links[2].getAttribute('target'),'_blank');
 assert.match(textOf(root),/拒绝/);assert.match(textOf(root),/不完整/);
});

test('通用语法支持引用内嵌套列表、复合强调、删除线、转义和硬换行', async () => {
  const { renderMarkdown } = await loadRenderer();
  const root = renderMarkdown('> 引用 **加粗内有 *斜体***\n>\n> - 第一项\n>   - ~~旧内容~~\n\n转义 \\*星号\\* &amp; &#x4e2d;  \n下一行');
  assert.equal(root.querySelectorAll('blockquote').length, 1);
  assert.equal(root.querySelector('blockquote strong em').textContent, '斜体');
  assert.equal(root.querySelector('blockquote ul ul del').textContent, '旧内容');
  assert.equal(root.querySelectorAll('br').length, 1);
  assert.match(root.textContent, /转义 \*星号\* & 中/);
});

test('缩进代码与围栏等价显示，长围栏允许嵌入短围栏', async () => {
  const { renderMarkdown } = await loadRenderer();
  const root = renderMarkdown('    root\n      └─ child\n\n````text\n```js\nconst x = 1;\n```\n````');
  const code = root.querySelectorAll('pre code');
  assert.equal(code[0].textContent, 'root\n  └─ child');
  assert.equal(code[1].textContent, '```js\nconst x = 1;\n```');
  assert.equal(root.querySelectorAll('button').length, 2);
});

test('参考式链接及图片保留宿主策略，链接名称可以包含强调', async () => {
  const { renderMarkdown } = await loadRenderer();
  const root = renderMarkdown('[**指南**][guide] ![图片][image]\n\n[guide]: <./docs/记录 文档.md#章节> "指南"\n[image]: assets/view.png', {
    allowRelativeLinks: true,
    imageResolver: (href: string) => href === 'assets/view.png' ? { href: '/safe/view.png' } : null,
  });
  assert.equal(root.querySelector('a strong').textContent, '指南');
  assert.equal(root.querySelector('a').getAttribute('data-markdown-href'), './docs/记录 文档.md#章节');
  assert.equal(root.querySelector('img').getAttribute('src'), '/safe/view.png');
  assert.doesNotMatch(root.textContent, /\[guide\]:/);
});

test('表格保留转义竖线、单元格内样式和列对齐', async () => {
  const { renderMarkdown } = await loadRenderer();
  const root = renderMarkdown('| 左列 | 右列 |\n| :--- | ---: |\n| a\\|b | **重点** |');
  assert.equal(root.querySelectorAll('td').length, 2);
  assert.equal(root.querySelector('td').textContent, 'a|b');
  assert.equal(root.querySelectorAll('td')[1].getAttribute('style'), 'text-align: right');
  assert.equal(root.querySelector('td strong').textContent, '重点');
});

test('Setext 标题与引用内标题共享显示和分块计数，代码不计标题', async () => {
  const { renderMarkdown, markdownHeadingCounts } = await loadRenderer();
  const first = '标题 &amp; `Name`\n===\n\n> ## 标题 &amp; `Name`\n\n    # 不计数';
  assert.deepEqual(markdownHeadingCounts(first), { '标题--name': 2 });
  const root = renderMarkdown('## 标题 &amp; `Name`', { headingCounts: markdownHeadingCounts(first) });
  assert.equal(root.querySelector('h2').getAttribute('id'), '标题--name-2');
  assert.equal(root.querySelector('h2').textContent, '标题 & Name');
});

test('标准语法不启用实体混淆协议、HTML或未授权图片，代码不解码实体', async () => {
  const { renderMarkdown } = await loadRenderer();
  const root = renderMarkdown('[混淆](java&#x73;cript:alert) [数据](data:text/html,test) ![外部](https://evil.invalid/x)\n\n<iframe src="https://evil.invalid"></iframe>\n\n`&amp; <script>`', { allowRelativeLinks: true });
  assert.equal(root.querySelectorAll('a').length, 0);
  assert.equal(root.querySelectorAll('img').length, 0);
  assert.equal(root.querySelectorAll('iframe').length, 0);
  assert.equal(root.querySelectorAll('script').length, 0);
  assert.equal([...root.querySelectorAll('code')].at(-1).textContent, '&amp; <script>');
  assert.match(root.textContent, /<iframe/);
});

test('任务列表的复合正文位于复用布局的单一内容区，有序列表保留起点', async () => {
  const { renderMarkdown } = await loadRenderer();
  const root = renderMarkdown('3. 第三步\n4. 第四步\n\n- [x] **完成**和[指南](guide.md)\n  - 子项', { allowRelativeLinks: true });
  assert.equal(root.querySelector('ol').getAttribute('start'), '3');
  const item = root.querySelectorAll('li').find((li: any) => li.className === 'task-list-item');
  assert.equal(item.childNodes.length, 2);
  assert.equal(item.childNodes[0].disabled, true);
  assert.equal(item.childNodes[1].className, 'markdown-task-content');
  assert.equal(item.childNodes[1].querySelector('strong').textContent, '完成');
  assert.equal(item.childNodes[1].querySelector('ul li').textContent, '子项');
});

test('failed image falls back in its current view and a fresh render can recover the same URL',async()=>{
  const {renderMarkdown}=await loadRenderer();
  const options={imageResolver:()=>({href:'/safe/recoverable.png'})};
  const first=renderMarkdown('![可恢复图片](recoverable.png)',options);
  const image=first.querySelector('img');assert.ok(image);
  image.dispatchEvent({type:'error'});
  assert.equal(first.querySelector('img'),null);
  assert.match(first.textContent,/图片无法预览：可恢复图片/);
  assert.equal(first.querySelector('span')?.getAttribute('aria-label'),'图片无法预览：可恢复图片','failed images retain their accessible name');
  const refreshed=renderMarkdown('![可恢复图片](recoverable.png)',options);
  assert.equal(refreshed.querySelector('img')?.getAttribute('src'),'/safe/recoverable.png');
});
