import assert from 'node:assert/strict';
import test from 'node:test';

function createTestDocument() {
  const document = {
    createElement(tagName) {
      return createElement(String(tagName).toLowerCase());
    },
    createTextNode(value) {
      return { nodeType: 3, nodeName: '#text', textContent: String(value), childNodes: [] };
    },
    createDocumentFragment() {
      return createElement('#document-fragment');
    },
  };

  function createElement(tagName) {
    const node = {
      nodeType: tagName === '#document-fragment' ? 11 : 1,
      nodeName: tagName === '#document-fragment' ? '#document-fragment' : tagName.toUpperCase(),
      tagName: tagName === '#document-fragment' ? undefined : tagName.toUpperCase(),
      attributes: Object.create(null),
      childNodes: [],
      parentNode: null,
      ownerDocument: document,
      className: '',
      get textContent() {
        return this.childNodes.map((child) => child.textContent ?? '').join('');
      },
      set textContent(value) {
        this.childNodes = [document.createTextNode(value)];
      },
      setAttribute(name, value) {
        this.attributes[name] = String(value);
      },
      getAttribute(name) {
        return Object.hasOwn(this.attributes, name) ? this.attributes[name] : null;
      },
      append(...nodes) {
        for (const item of nodes) {
          const child = typeof item === 'string' ? document.createTextNode(item) : item;
          child.parentNode = this;
          this.childNodes.push(child);
        }
      },
      querySelector(selector) {
        return queryAll(this, selector)[0] ?? null;
      },
      querySelectorAll(selector) {
        return queryAll(this, selector);
      },
    };
    Object.defineProperty(node, 'className', {
      get() { return this.getAttribute('class') ?? ''; },
      set(value) { this.setAttribute('class', value); },
    });
    return node;
  }

  function matches(node, selector) {
    if (node.nodeType !== 1) return false;
    if (selector.includes(' ')) {
      const parts = selector.trim().split(/\s+/);
      let current = [node];
      for (const part of parts) {
        current = current.flatMap((item) => collect(item, (candidate) => matchesSimple(candidate, part), item === node));
      }
      return current.includes(node) || collect(node, (candidate) => true).some((candidate) => matches(candidate, selector));
    }
    return matchesSimple(node, selector);
  }

  function matchesSimple(node, selector) {
    if (node.nodeType !== 1) return false;
    const [tag, ...classes] = selector.replace(/\./g, ' .').trim().split(/\s+/);
    if (tag && tag !== '*' && node.tagName !== tag.toUpperCase()) return false;
    for (const className of classes) {
      if (!node.className.split(/\s+/).includes(className)) return false;
    }
    return true;
  }

  function collect(root, predicate, includeRoot = false) {
    const result = [];
    const visit = (node, allow) => {
      if (allow && predicate(node)) result.push(node);
      for (const child of node.childNodes) visit(child, true);
    };
    visit(root, includeRoot);
    return result;
  }

  function queryAll(root, selector) {
    if (selector.includes(' ')) {
      const parts = selector.trim().split(/\s+/);
      let current = collect(root, (node) => matchesSimple(node, parts[0]));
      for (const part of parts.slice(1)) {
        current = current.flatMap((item) => collect(item, (node) => matchesSimple(node, part)));
      }
      return current;
    }
    return collect(root, (node) => matchesSimple(node, selector));
  }

  return document;
}

const originalDocument = globalThis.document;

test.before(() => {
  globalThis.document = createTestDocument();
});

test.after(() => {
  if (originalDocument === undefined) delete globalThis.document;
  else globalThis.document = originalDocument;
});

async function loadRenderer() {
  return import(`../../../buildr-web/src/markdown.ts?test=${Date.now()}-${Math.random()}`);
}

function textOf(root) {
  return root.textContent.replace(/\s+/g, ' ').trim();
}

test('renderMarkdown 渲染标题、段落、列表与强调', async () => {
  const { renderMarkdown } = await loadRenderer();
  const root = renderMarkdown([
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
  const { renderMarkdown } = await loadRenderer();
  const root = renderMarkdown([
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
  const { renderMarkdown } = await loadRenderer();
  const root = renderMarkdown([
    '使用 `buildr app`。',
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
  assert.equal(root.querySelector('code')?.textContent, 'buildr app');
  assert.equal(root.querySelector('pre code')?.textContent, 'const x = 1;');
  const link = root.querySelector('a');
  assert.equal(link?.textContent, '文档');
  assert.equal(link?.getAttribute('href'), 'https://example.com/docs');
  assert.equal(link?.getAttribute('rel'), 'noopener noreferrer');
  assert.equal(root.querySelectorAll('table th').length, 2);
  assert.equal(root.querySelectorAll('table td').length, 2);
});

test('renderMarkdown 渲染任务勾选列表与分隔线', async () => {
  const { renderMarkdown } = await loadRenderer();
  const root = renderMarkdown([
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
  const { renderMarkdown } = await loadRenderer();
  const root = renderMarkdown([
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
  const { renderMarkdown } = await loadRenderer();
  const root = renderMarkdown([
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
  const links = root.querySelectorAll('a');
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
  const { renderMarkdown } = await loadRenderer();
  const root = renderMarkdown('[上级](../docs/guide.md)', {
    allowRelativeLinks: true,
    allowParentRelativeLinks: true,
  });
  const links = [...root.querySelectorAll('a')];
  assert.equal(links.length, 1);
  assert.equal(links[0].getAttribute('href'), '../docs/guide.md');
  assert.equal(links[0].className.includes('markdown-relative-link'), true);
});

test('resolveProjectMarkdownHref 相对当前文档解析并只接受 .md', async () => {
  const { resolveProjectMarkdownHref } = await import(`../../../buildr-web/src/lib/projectDocuments.ts?test=${Date.now()}`);
  assert.equal(resolveProjectMarkdownHref('README.md', 'docs/guide.md'), 'docs/guide.md');
  assert.equal(resolveProjectMarkdownHref('docs/guide.md', '../README.md'), 'README.md');
  assert.equal(resolveProjectMarkdownHref('docs/guide.md', './note.md'), 'docs/note.md');
  assert.equal(resolveProjectMarkdownHref('README.md', 'services/buildr/'), null);
  assert.equal(resolveProjectMarkdownHref('README.md', 'docs/guide.md#section'), 'docs/guide.md');
});

test('renderMarkdown 只通过显式 resolver 渲染本地图片', async () => {
  const { renderMarkdown } = await loadRenderer();
  const root = renderMarkdown('![封面](assets/cover.png) ![危险](/tmp/secret.png)', {
    imageResolver(href) { return href === 'assets/cover.png' ? { href: '/api/v1/publications/demo/assets/assets/cover.png' } : null; },
  });
  const image = root.querySelector('img');
  assert.equal(root.querySelectorAll('img').length, 1);
  assert.equal(image?.getAttribute('alt'), '封面');
  assert.equal(image?.getAttribute('src'), '/api/v1/publications/demo/assets/assets/cover.png');
  assert.match(root.textContent, /危险/);
});
