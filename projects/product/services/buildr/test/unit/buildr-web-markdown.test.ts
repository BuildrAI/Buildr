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
  if (originalDocument === undefined) delete globalThis.document;
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
  assert.match(textOf(root), /\[相对链接\]\(proposal\.md\)/);
  assert.match(textOf(root), /\[越界链接\]\(\.\.\/readme\.md\)/);
  assert.match(textOf(root), /\[协议相对\]\(\/\/example\.com\/docs\)/);
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
  assert.match(textOf(root), /\[越界\]\(\.\.\/secret\.md\)/);
  assert.match(textOf(root), /\[绝对\]\(\/etc\/passwd\)/);
  assert.match(textOf(root), /\[脚本\]\(javascript:alert\(1\)\)/);
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
  const children = directory.childNodes.find(n => n.tagName === 'UL');
  assert.equal(children.childNodes.length, 2);
  const nested = children.childNodes[0].childNodes.find(n => n.tagName === 'UL');
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

test('代码正文保留空行和缩进，Mermaid明确源码回退，表格独立滚动', async () => {
  const { renderMarkdown } = await loadRenderer();
  const code = 'first\n  second\n\nlast';
  const root = renderMarkdown('```sh\n' + code + '\n```\n\n```mermaid\ngraph LR\n  A --> B\n```\n\n| a | b |\n| --- | --- |\n| c | d |', { sourcePath: 'docs/readme.md' });
  assert.equal(root.querySelector('pre code').textContent, code);
  assert.equal(root.querySelectorAll('button').length, 2);
  assert.match(root.textContent, /当前阅读器显示 Mermaid 源码，尚未渲染图示/);
  assert.match(root.textContent, /docs\/readme.md/);
  assert.equal(root.querySelector('table').parentNode.className, 'markdown-table-scroll');
});

test('标题章节标识与常见GitHub片段一致，重名章节不覆盖', async () => {
  const { renderMarkdown } = await loadRenderer();
  const root = renderMarkdown('## 开始使用（Getting Started）\n## 开始使用（Getting Started）\n## `buildr update`');
  assert.deepEqual(root.querySelectorAll('h2').map(item => item.getAttribute('id')), ['开始使用getting-started', '开始使用getting-started-1', 'buildr-update']);
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
