// @ts-nocheck
import { Lexer, Marked } from 'marked';
import { decodeHTML } from 'entities';
import { markdownDestination } from './lib/markdownDestination.ts';
import { copyText } from './lib/copyText.ts';
import { cachedDiagramSvg, setDiagramSvg } from './lib/markdownDiagramSvg.ts';
/** Failed destinations stay textual across re-renders; a new document load starts with a clean view. */

export type MarkdownRenderOptions = {
  document?: Document;
  headingOffset?: number;
  sourcePath?: string;
  headingCounts?: Record<string, number>;
  allowRelativeLinks?: boolean;
  /** Only callers with a source-checked opener may enable absolute file references. */
  allowAbsoluteFileLinks?: boolean;
  /** Explicit task source for retained conversations; null means there is no task workspace. */
  taskLinkPathname?: string | null;
  /** When true with allowRelativeLinks, relative href may include `..` segments (still sanitized by consumer / API). */
  allowParentRelativeLinks?: boolean;
  imageResolver?: (href: string) => { href: string } | null | undefined;
  /** Hosts that can present the resolved image may offer an enlarged preview. */
  onImageClick?: (image: { src: string; alt: string; reference: string }) => void;
  onRelativeLinkClick?: (href: string, event: MouseEvent) => void;
};

function resolveSafeHref(href, { allowRelativeLinks = false, allowParentRelativeLinks = false, allowAbsoluteFileLinks = false } = {}) {
  const value = markdownDestination(String(href ?? ''));
  if (!value) return null;

  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        return { href: value, external: true };
      }
    } catch {
      return null;
    }
    return null;
  }

  if (!allowRelativeLinks) return null;
  if (allowAbsoluteFileLinks && (/^\/(?!\/)/.test(value) || /^[a-z]:[\\/]/i.test(value)) && !/[\0\r\n]/.test(value)) return {href:value,external:false};
  const citation = /^[^:?#]+:[1-9]\d*(?::[1-9]\d*)?$/.test(value);
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value) && !citation) return null;
  if (value.startsWith('//') || value.startsWith('/') || value.includes('\\')) return null;

  const hashIndex = value.indexOf('#');
  const queryIndex = value.indexOf('?');
  let pathEnd = value.length;
  if (hashIndex >= 0) pathEnd = Math.min(pathEnd, hashIndex);
  if (queryIndex >= 0) pathEnd = Math.min(pathEnd, queryIndex);
  const pathPart = value.slice(0, pathEnd);
  const suffix = value.slice(pathEnd);
  const segments = pathPart.split('/');
  if (!allowParentRelativeLinks && segments.some((segment) => segment === '..')) return null;

  const normalizedPath = segments.filter((segment) => segment && segment !== '.').join('/');
  if (!normalizedPath && !suffix.startsWith('#')) return null;
  // A root filename with a line suffix must not become a browser URL scheme.
  return { href: `${citation ? './' : ''}${normalizedPath}${suffix}`, external: false };
}

function imageFallback(doc, alt) {
  const fallback = doc.createElement('span');
  fallback.className = 'markdown-image-fallback';
  fallback.setAttribute('role', 'img');
  fallback.textContent = alt ? `图片无法预览：${alt}` : '图片无法预览';
  fallback.setAttribute('aria-label', fallback.textContent);
  return fallback;
}

// Parse syntax once; author content is only ever written as text or safe DOM nodes.
function inlineText(tokens) {
  return tokens.map(token => token.tokens ? inlineText(token.tokens) : ['codespan', 'html'].includes(token.type) ? token.text : decodeHTML(token.text || '')).join('');
}

function appendInline(parent, tokens, doc, linkOptions) {
  for (const token of tokens) {
    if (['strong', 'em', 'del'].includes(token.type)) {
      const element = doc.createElement(token.type);
      appendInline(element, token.tokens, doc, linkOptions);
      parent.append(element);
    } else if (token.type === 'link') {
      const destination = decodeHTML(token.href);
      const resolved = resolveSafeHref(destination, linkOptions);
      if (!resolved) { parent.append(doc.createTextNode(token.raw)); continue; }
      const link = doc.createElement('a');
      link.setAttribute('href', resolved.href);
      if (resolved.external) {
        link.setAttribute('rel', 'noopener noreferrer');
        link.setAttribute('target', '_blank');
      } else {
        link.className = 'markdown-relative-link';
        link.setAttribute('data-markdown-href', destination);
        link.setAttribute('title', `相对路径：${resolved.href}`);
      }
      appendInline(link, token.tokens, doc, linkOptions);
      parent.append(link);
    } else if (token.type === 'image') {
      const destination = decodeHTML(token.href);
      const resolved = linkOptions.imageResolver?.(markdownDestination(destination) ?? '');
      const alt = token.tokens ? inlineText(token.tokens) : decodeHTML(token.text);
      if (!resolved?.href) {
        parent.append(imageFallback(doc, alt)); continue;
      }
      const image = doc.createElement('img');
      image.setAttribute('alt', alt);
      image.setAttribute('loading', 'lazy');
      image.setAttribute('referrerpolicy', 'no-referrer');
      // Keep the authored reference so an enlarged preview can show its real source.
      image.setAttribute('data-markdown-href', destination);
      image.addEventListener?.('error', () => {
        if (image.parentNode) image.replaceWith(imageFallback(doc, alt));
      });
      parent.append(image);
      image.setAttribute('src', resolved.href);
    } else if (token.type === 'codespan') {
      const code = doc.createElement('code');
      code.textContent = token.text;
      const resolved = /^https?:\/\/[^\s]+$/i.test(token.text.trim()) ? resolveSafeHref(token.text.trim(), linkOptions) : null;
      if (resolved) {
        const link = doc.createElement('a');
        link.setAttribute('href', resolved.href);
        link.setAttribute('rel', 'noopener noreferrer');
        link.setAttribute('target', '_blank');
        link.append(code);
        parent.append(link);
      } else parent.append(code);
    } else if (token.type === 'br') {
      parent.append(doc.createElement('br'));
    } else if (token.tokens) {
      appendInline(parent, token.tokens, doc, linkOptions);
    } else {
      // Raw HTML is intentionally literal, not a trusted markup surface.
      parent.append(doc.createTextNode(token.type === 'html' ? token.text : decodeHTML(token.text || token.raw || '')));
    }
  }
}

export function markdownHeadingSlug(text: string) {
  return text.toLowerCase().replace(/[^\p{L}\p{N}_ -]/gu, '').replace(/ /g, '-');
}

// Use the same fence rules for rendering and split-document heading counters.
function openingFence(line: string) {
  const match = line.match(/^ {0,3}(`{3,}|~{3,})([^\r\n]*)$/);
  if (!match || (match[1][0] === '`' && match[2].includes('`'))) return null;
  return { marker: match[1][0], length: match[1].length, language: match[2].trim().split(/\s+/)[0] || '' };
}

function closesFence(line: string, fence: { marker: string; length: number }) {
  const match = line.match(/^ {0,3}(`{3,}|~{3,})[ \t]*$/);
  return Boolean(match && match[1][0] === fence.marker && match[1].length >= fence.length);
}

// CommonMark's flanking rules reject a delimiter glued to punctuation, so a
// Chinese sentence like 按**"改了哪个文件"**选组 renders its asterisks instead
// of emphasis. Adapt only those narrow spellings; code, escapes and all other
// emphasis remain under the normal Markdown lexer.
const cjkStrongSpellings = [
  // Closing punctuation glued to Han text: **保留事项：**较宽
  /^\*\*(?!\*)([^\s*\\`\n][^*\\`\n]*[，。；：！？、）】》」』])\*\*(?=\p{Script=Han})/u,
  // A quote or bracket glued to the opener: 按**"改了哪个文件"**选组 / 按**（见上）**处理
  /^\*\*(?!\*)(\p{P}(?:[^*\\`\n]*[^\s*\\`\n])?)\*\*(?!\*)/u,
];
const hanText = /\p{Script=Han}/u;

function cjkStrongMatch(source: string) {
  const closing = cjkStrongSpellings[0].exec(source);
  if (closing && hanText.test(closing[1])) return closing;
  const opening = cjkStrongSpellings[1].exec(source);
  // Plain English prose keeps CommonMark's rule; only Chinese context opts in.
  if (opening && (hanText.test(opening[1]) || hanText.test(source.charAt(opening[0].length)))) return opening;
  return null;
}

// Marked 16's closing-fence pattern accepts spaces but not trailing tabs.
// Adapt only that valid spelling; leave all other syntax to its normal lexer.
const markdownParser = new Marked({
  gfm: true,
  extensions: [{
    name: 'cjkStrong',
    level: 'inline',
    start(source) { return source.indexOf('**'); },
    tokenizer(source) {
      const match = cjkStrongMatch(source);
      if (!match) return;
      return { type: 'strong', raw: match[0], text: match[1], tokens: this.lexer.inlineTokens(match[1]) };
    },
  }],
  tokenizer: {
    fences(source: string) {
      const newline = source.indexOf('\n');
      const fence = openingFence(newline < 0 ? source : source.slice(0, newline));
      if (!fence || newline < 0) return false;
      // Scan only this block, rather than splitting the remaining document for
      // every code block in a long file.
      for (let start = newline + 1; start < source.length;) {
        const end = source.indexOf('\n', start);
        const line = source.slice(start, end < 0 ? source.length : end);
        const next = end < 0 ? source.length : end + 1;
        if (closesFence(line, fence)) {
          if (!line.includes('\t')) return false;
          const raw = source.slice(0, next);
          const normalized = source.slice(0, start) + line.replace(/\t/g, ' ') + '\n';
          const token = Lexer.lex(normalized, { gfm: true })[0];
          return { ...token, raw };
        }
        start = next;
      }
      return false;
    },
  },
});

/** Counts and displayed anchors use exactly the same parsed headings. */
export function markdownHeadingCounts(markdown: string, initial: Record<string, number> = {}) {
  const counts = { ...initial };
  function visit(tokens) {
    for (const token of tokens) {
      if (token.type === 'heading') {
        const slug = markdownHeadingSlug(inlineText(token.tokens));
        counts[slug] = (counts[slug] || 0) + 1;
      } else if (token.type === 'blockquote') visit(token.tokens);
      else if (token.type === 'list') for (const item of token.items) visit(item.tokens);
    }
  }
  visit(markdownParser.lexer(markdown));
  return counts;
}

/** An outer reader title replaces presentation only, never its source anchor. */
export function markdownDocumentBody(markdown: string, omitTitle = false) {
  const title = omitTitle ? markdown.match(/^# [^\n]*\n/)?.[0] : undefined;
  const headingCounts = markdownHeadingCounts(title || '');
  return { content: title ? markdown.slice(title.length) : markdown, headingCounts, anchor: Object.keys(headingCounts)[0] };
}

function createCodeBlock(language, code, doc, sourcePath, complete = true) {
  const block = doc.createElement('div');
  block.className = 'markdown-code-block';
  const copy = doc.createElement('button');
  copy.setAttribute('type', 'button');
  copy.setAttribute('data-copy-code', '');
  copy.textContent = '复制代码';
  let restore: ReturnType<typeof setTimeout> | undefined;
  copy.addEventListener?.('click', async () => {
    if (copy.dataset.copied === 'true') return;
    if (!await copyText(code)) { copy.textContent = '复制失败，请选择代码复制'; return; }
    copy.dataset.copied = 'true';
    copy.textContent = '已复制';
    clearTimeout(restore);
    restore = setTimeout(() => { copy.dataset.copied = ''; copy.textContent = '复制代码'; }, 3000);
  });
  block.append(copy);
  const diagram = language.toLowerCase() === 'mermaid';
  const cached = diagram && complete ? cachedDiagramSvg(code) : undefined;
  if (diagram) {
    block.className += ' markdown-diagram';
    if (complete && !cached) block.setAttribute('data-mermaid-source', code);
    block.setAttribute('data-mermaid-state', cached ? 'rendered' : complete ? 'pending' : 'incomplete');
    const graph = doc.createElement('div');
    graph.className = 'markdown-diagram-view';
    graph.setAttribute('role', 'img');
    graph.setAttribute('aria-label', 'Mermaid 图示');
    graph.setAttribute('tabindex', '0');
    graph.hidden = !cached;
    if (cached) setDiagramSvg(graph, cached);
    block.append(graph);
    const note = doc.createElement('p');
    note.className = 'markdown-render-note';
    note.setAttribute('role', 'status');
    note.hidden = Boolean(cached);
    note.textContent = `${complete ? '正在绘制图示，当前可查看 Mermaid 源码' : '图示尚未完整输出，当前显示 Mermaid 源码'}${sourcePath ? `；原文件：${sourcePath}` : ''}。`;
    block.append(note);
  }
  const pre = doc.createElement('pre');
  const codeNode = doc.createElement('code');
  if (language) codeNode.setAttribute('data-language', language);
  codeNode.textContent = code;
  pre.append(codeNode);
  if (diagram) {
    const details = doc.createElement('details');
    details.open = !cached;
    const summary = doc.createElement('summary');
    summary.textContent = '查看源码';
    details.append(summary, pre);
    block.append(details);
  } else block.append(pre);
  return block;
}

function createTable(token, doc, linkOptions) {
  const table = doc.createElement('table');
  function row(cells, tag) {
    const tr = doc.createElement('tr');
    cells.forEach((cell, index) => {
      const element = doc.createElement(tag);
      if (token.align[index]) element.setAttribute('style', `text-align: ${token.align[index]}`);
      appendInline(element, cell.tokens, doc, linkOptions);
      tr.append(element);
    });
    return tr;
  }
  const thead = doc.createElement('thead');
  thead.append(row(token.header, 'th'));
  table.append(thead);
  const tbody = doc.createElement('tbody');
  for (const cells of token.rows) tbody.append(row(cells, 'td'));
  table.append(tbody);
  const scroll = doc.createElement('div');
  scroll.className = 'markdown-table-scroll';
  scroll.setAttribute('role', 'region');
  scroll.setAttribute('aria-label', '表格，可横向滚动');
  scroll.setAttribute('tabindex', '0');
  scroll.append(table);
  return scroll;
}

function completeCodeFence(token) {
  const lines = token.raw.replace(/\r\n/g, '\n').trimEnd().split('\n');
  const fence = openingFence(lines[0]);
  return !fence || (lines.length > 1 && closesFence(lines.at(-1), fence));
}

function appendBlocks(parent, tokens, doc, options, linkOptions, tight = false) {
  for (const token of tokens) {
    if (token.type === 'space' || token.type === 'def') continue;
    if (token.type === 'code') {
      parent.append(createCodeBlock(token.lang?.split(/\s+/)[0] || '', token.text, doc, options.sourcePath, completeCodeFence(token)));
    } else if (token.type === 'heading') {
      const level = Math.min(Math.max(token.depth + (options.headingOffset || 0), 1), 6);
      const heading = doc.createElement(`h${level}`);
      appendInline(heading, token.tokens, doc, linkOptions);
      const slug = markdownHeadingSlug(String(heading.textContent));
      const count = linkOptions.headings.get(slug) || 0;
      linkOptions.headings.set(slug, count + 1);
      heading.setAttribute('id', count ? `${slug}-${count}` : slug);
      parent.append(heading);
    } else if (token.type === 'blockquote') {
      const quote = doc.createElement('blockquote');
      appendBlocks(quote, token.tokens, doc, options, linkOptions);
      parent.append(quote);
    } else if (token.type === 'list') {
      const list = doc.createElement(token.ordered ? 'ol' : 'ul');
      if (token.ordered && token.start !== 1) list.setAttribute('start', String(token.start));
      if (token.items.some(item => item.task)) list.className = 'task-list';
      for (const item of token.items) {
        const li = doc.createElement('li');
        let content = li;
        if (item.task) {
          li.className = 'task-list-item';
          const checkbox = doc.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.disabled = true;
          checkbox.checked = item.checked;
          li.append(checkbox);
          content = doc.createElement('div');
          content.className = 'markdown-task-content';
          li.append(content);
        }
        appendBlocks(content, item.tokens, doc, options, linkOptions, !token.loose);
        list.append(li);
      }
      parent.append(list);
    } else if (token.type === 'table') {
      parent.append(createTable(token, doc, linkOptions));
    } else if (token.type === 'hr') {
      parent.append(doc.createElement('hr'));
    } else if (token.type === 'paragraph' || token.type === 'text') {
      const paragraph = tight ? parent : doc.createElement('p');
      appendInline(paragraph, token.tokens || Lexer.lexInline(token.text, { gfm: true }), doc, linkOptions);
      if (!tight) parent.append(paragraph);
    } else {
      // Includes block HTML: never use innerHTML for document authors' input.
      parent.append(doc.createTextNode(token.raw || token.text || ''));
    }
  }
}

function normalizeRenderArgs(docOrOptions, maybeOptions) {
  if (docOrOptions && typeof docOrOptions.createElement === 'function') {
    return {
      doc: docOrOptions,
      options: maybeOptions && typeof maybeOptions === 'object' ? maybeOptions : {},
    };
  }
  if (docOrOptions && typeof docOrOptions === 'object') {
    return {
      doc: docOrOptions.document || globalThis.document,
      options: docOrOptions,
    };
  }
  return {
    doc: globalThis.document,
    options: maybeOptions && typeof maybeOptions === 'object' ? maybeOptions : {},
  };
}

export function renderMarkdown(markdown: string, docOrOptions: Document | MarkdownRenderOptions = globalThis.document, maybeOptions: MarkdownRenderOptions = {}): HTMLElement {
  const { doc, options } = normalizeRenderArgs(docOrOptions, maybeOptions);
  const headingOffset = Math.max(0, Number.isFinite(options.headingOffset) ? options.headingOffset : 0);
  const linkOptions = {
    allowRelativeLinks: Boolean(options.allowRelativeLinks),
    allowAbsoluteFileLinks: Boolean(options.allowAbsoluteFileLinks),
    allowParentRelativeLinks: Boolean(options.allowParentRelativeLinks),
    imageResolver: options.imageResolver,
    headings: new Map(Object.entries(options.headingCounts || {})),
  };
  const root = doc.createElement('div');
  root.className = 'markdown-body';
  const tokens = markdownParser.lexer(String(markdown ?? ''));
  appendBlocks(root, tokens, doc, { ...options, headingOffset }, linkOptions);
  return root;
}
