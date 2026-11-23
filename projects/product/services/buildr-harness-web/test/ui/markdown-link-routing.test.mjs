import test from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown } from '../../src/markdown.ts';

const makeElement = tag => ({
  tag, attributes: {}, children: [],
  setAttribute(name, value) { this.attributes[name] = value; },
  append(...children) { this.children.push(...children); },
});
const document = { createElement: makeElement, createTextNode: text => text };
const anchors = node => typeof node === 'string' ? [] : [
  ...(node.tag === 'a' ? [node.attributes] : []), ...node.children.flatMap(anchors),
];

test('Harness marks external Markdown links for its desktop host and keeps document links local', () => {
  const root = renderMarkdown('[web](https://example.test) [`docs`](https://example.test/docs) [local](report.md) [blocked](javascript:alert%281%29)',
    document, { allowRelativeLinks: true });
  const links = anchors(root);
  assert.equal(links.length, 3);
  for (const [link, url] of [[links[0], 'https://example.test'], [links[1], 'https://example.test/docs']]) {
    assert.equal(link.href, url);
    assert.equal(link.target, '_blank');
    assert.equal(link.rel, 'noopener noreferrer');
    assert.ok(Object.hasOwn(link, 'data-harness-web-link'));
  }
  assert.equal(links[2]['data-markdown-href'], 'report.md');
  assert.ok(!Object.hasOwn(links[2], 'data-harness-web-link'));
});
